import Phaser from 'phaser';
import type { Enemy } from '../objects/Enemy';
import type { EnemyKind } from '../data/enemies';
import { PATTERN } from '../data/enemies';
import { baseSpawn, difficulty, rankHpMult, TIMELINE, type StageData } from '../data/stages';

export type EliteSlotState = 'pending' | 'warning' | 'alive' | 'killed' | 'absorbed';
export type StagePhase = 'WAVE_1' | 'ELITE_1' | 'WAVE_2' | 'ELITE_2' | 'BOSS_WARNING' | 'BOSS' | 'CLEAR' | 'FAIL';

/** 스테이지 진행이 게임 장면에서 빌려 쓰는 것들 */
export interface DirectorHost {
  rng: Phaser.Math.RandomDataGenerator; // 같은 시드면 같은 생성 결과(재현 가능)
  playerPos(): Phaser.Math.Vector2;
  arena: { x: number; y: number; r: number };
  spawn(kind: EnemyKind, x: number, y: number, hpMult: number): Enemy;
  enemyCount(): number;
  warnSpawn(x: number, y: number, ms: number, color: number): void; // 바닥 표시 + 화면 가장자리 방향 강조
  banner(text: string, color: string): void;
  darken(ms: number): void;
  emit(event: string, data?: unknown): void; // stage:start, elite:spawn … (기획서 17장 이벤트)
  fail(reason: 'timeout'): void;
}

/**
 * 스테이지 시간표 진행 (4단계 기획서 3·17장):
 * WAVE_1 → ELITE_1(1:40) → WAVE_2 → ELITE_2(3:40) → BOSS_WARNING(5:40) → BOSS(5:50) → CLEAR 또는 FAIL(8:00)
 * 타이머는 엘리트가 나와도 멈추지 않는다. 상태 이름은 연출·UI용이다.
 */
export class StageDirector {
  phase: StagePhase = 'WAVE_1';
  eliteSlots: EliteSlotState[];
  elites: (Enemy | null)[];
  boss: Enemy | null = null;
  bossBuffs: string[] = [];
  enraged = false;
  /** 전투 기록: 엘리트·보스가 나온 시각과 처치에 걸린 시간(ms) */
  record = { eliteSpawnAt: [] as number[], eliteKillMs: [] as (number | null)[], bossSpawnAt: 0, bossKillMs: null as number | null };
  private spawnCd = 0;
  private eliteSpawnPoint: (Phaser.Math.Vector2 | null)[];
  private bossSpawnPoint: Phaser.Math.Vector2 | null = null;
  private diff;

  /** mult: 난이도(쉬움·어려움·매우 어려움) 체력·피해 배율(v1.2). 쉬움은 1 → 기존과 같다. */
  constructor(private h: DirectorHost, readonly stage: StageData, mult: { hp: number; damage: number } = { hp: 1, damage: 1 }) {
    this.eliteSlots = stage.eliteSpawns.map(() => 'pending');
    this.elites = stage.eliteSpawns.map(() => null);
    this.eliteSpawnPoint = stage.eliteSpawns.map(() => null);
    this.record.eliteKillMs = stage.eliteSpawns.map(() => null);
    const base = difficulty(stage.id);
    this.diff = { ...base, hp: base.hp * mult.hp, damage: base.damage * mult.damage };
    h.emit('stage:start', { stage: stage.id });
  }

  update(elapsed: number, delta: number): void {
    if (this.phase === 'CLEAR' || this.phase === 'FAIL') return;
    this.updateElites(elapsed);
    this.updateBoss(elapsed);
    this.updateSpawns(elapsed, delta);
  }

  // ───────── 엘리트 ─────────
  private updateElites(elapsed: number): void {
    this.stage.eliteSpawns.forEach((e, i) => {
      const slot = this.eliteSlots[i];
      if (slot === 'pending' && elapsed >= e.timeMs - TIMELINE.eliteWarnMs) {
        // 등장 5초 전: 위치를 정하고 바닥·화면 가장자리에 경고
        this.eliteSlots[i] = 'warning';
        this.eliteSpawnPoint[i] = this.edgePoint();
        const p = this.eliteSpawnPoint[i]!;
        this.h.warnSpawn(p.x, p.y, TIMELINE.eliteWarnMs, 0xffb74d);
        this.h.emit('elite:warning', { slot: i + 1 });
      }
      if (this.eliteSlots[i] === 'warning' && elapsed >= e.timeMs) {
        const alive = this.elites.filter((x) => x?.active).length;
        if (alive >= TIMELINE.maxElites) return; // 최대 2마리(1단계는 2마리뿐이라 걸릴 일 없음)
        const p = this.eliteSpawnPoint[i]!;
        const hpMult = this.diff.hp * rankHpMult(this.stage, i === 0 ? 'elite1' : 'elite2');
        const en = this.h.spawn(e.eliteId, p.x, p.y, hpMult);
        en.eliteSlot = i + 1;
        en.damageMult = this.diff.damage;
        en.spawnedAtMs = elapsed;
        this.elites[i] = en;
        this.eliteSlots[i] = 'alive';
        this.record.eliteSpawnAt[i] = elapsed;
        this.phase = i === 0 ? 'ELITE_1' : 'ELITE_2';
        this.h.banner(`엘리트 등장 — ${en.def.name}`, '#ffb74d');
        this.h.emit('elite:spawn', { slot: i + 1, at: elapsed });
      }
    });
  }

  /** 엘리트가 죽었을 때 장면이 부른다. 보상은 한 번만(true를 돌려준 경우에만 지급). */
  onEliteKilled(en: Enemy, elapsed: number): boolean {
    const i = en.eliteSlot - 1;
    if (i < 0 || this.eliteSlots[i] !== 'alive') return false;
    this.eliteSlots[i] = 'killed';
    this.record.eliteKillMs[i] = elapsed - en.spawnedAtMs;
    if (this.phase === 'ELITE_1' || this.phase === 'ELITE_2') this.phase = 'WAVE_2';
    this.h.emit('elite:defeated', { slot: i + 1, ms: this.record.eliteKillMs[i] });
    return true;
  }

  // ───────── 보스 ─────────
  private updateBoss(elapsed: number): void {
    const s = this.stage;
    if (!this.bossSpawnPoint && elapsed >= s.bossSpawnMs - TIMELINE.bossWarnMs) {
      this.phase = 'BOSS_WARNING';
      this.bossSpawnPoint = new Phaser.Math.Vector2(this.h.arena.x, this.h.arena.y - this.h.arena.r * 0.55);
      this.h.warnSpawn(this.bossSpawnPoint.x, this.bossSpawnPoint.y, TIMELINE.bossWarnMs, 0xff1744);
      this.h.darken(TIMELINE.bossWarnMs);
      this.h.banner('경고 — 우두머리가 다가온다', '#ff5252');
      this.h.emit('boss:warning');
    }
    if (!this.boss && elapsed >= s.bossSpawnMs) {
      // 살아 있는 엘리트는 사라지고 보스에게 흡수된다(보상 없음)
      let hpBuff = 1;
      let dmgBuff = 1;
      this.elites.forEach((en, i) => {
        if (en?.active) {
          en.destroy();
          this.eliteSlots[i] = 'absorbed';
          if (i === 0) { hpBuff = 1.1; this.bossBuffs.push('HP +10%'); }
          if (i === 1) { dmgBuff = 1.1; this.bossBuffs.push('피해 +10%'); }
        }
      });
      if (this.bossBuffs.length) this.h.emit('boss:absorb-elites', { buffs: this.bossBuffs });
      const p = this.bossSpawnPoint!;
      const boss = this.h.spawn(s.bossId, p.x, p.y, this.diff.hp * rankHpMult(s, 'boss') * hpBuff);
      boss.damageMult = this.diff.damage * dmgBuff;
      boss.spawnedAtMs = elapsed;
      this.boss = boss;
      this.record.bossSpawnAt = elapsed;
      this.phase = 'BOSS';
      this.h.banner(`보스 — ${boss.def.name}`, '#ff1744');
      this.h.emit('boss:spawn', { at: elapsed });
    }
    const boss = this.boss;
    if (boss?.active) {
      // 60% 체력에서 패턴 변화(한 번만)
      if (boss.phase === 1 && boss.hp <= boss.maxHp * PATTERN.graymane.phaseAt) {
        boss.phase = 2;
        boss.resetPattern(1000);
        this.h.banner(`${boss.def.name} — 분노한 울부짖음`, '#ff8a65');
        this.h.emit('boss:phase-change', { phase: 2, at: elapsed });
      }
      // 7:30 격노, 8:00 시간 초과 실패
      if (!this.enraged && elapsed >= TIMELINE.enrageAtMs) {
        this.enraged = true;
        boss.damageMult *= TIMELINE.enrage.damage;
        boss.speedMult = TIMELINE.enrage.speed;
        this.h.banner('격노! 30초 안에 쓰러뜨려라', '#ff1744');
      }
    }
    if (elapsed >= s.durationMs && this.phase !== 'CLEAR') {
      this.phase = 'FAIL';
      this.h.fail('timeout');
    }
  }

  /** 보스가 죽었을 때 장면이 부른다 */
  onBossKilled(elapsed: number): void {
    this.record.bossKillMs = elapsed - this.record.bossSpawnAt;
    this.phase = 'CLEAR';
    this.h.emit('boss:defeated', { ms: this.record.bossKillMs });
  }

  // ───────── 일반 적 생성 ─────────
  /** 지금 일반 적 생성량 배율: 엘리트 생존 70%, 보스 경고 50%, 보스전 0(자연 생성 중단) */
  spawnRate(): number {
    if (this.phase === 'BOSS' || this.boss) return 0;
    if (this.phase === 'BOSS_WARNING') return TIMELINE.bossWarnSpawnRate;
    if (this.elites.some((e) => e?.active)) return TIMELINE.eliteSpawnRate;
    return 1;
  }

  private updateSpawns(elapsed: number, delta: number): void {
    const rate = this.spawnRate() * this.diff.spawnRate;
    if (rate <= 0) return;
    this.spawnCd -= delta;
    if (this.spawnCd > 0 || this.h.enemyCount() >= 220) return;
    const b = baseSpawn(elapsed);
    this.spawnCd = b.interval / rate;
    for (let i = 0; i < b.count; i++) {
      const kind: EnemyKind = this.h.rng.frac() < b.boarRatio ? 'iron_boar' : 'shadow_wolf';
      // 늑대는 무리로: 같은 방향 가장자리에서 2~3마리씩
      const p = this.edgePoint();
      const pack = kind === 'shadow_wolf' ? this.h.rng.between(2, 3) : 1;
      for (let k = 0; k < pack; k++) {
        const e = this.h.spawn(kind, p.x + this.h.rng.between(-40, 40), p.y + this.h.rng.between(-40, 40), this.diff.hp);
        e.damageMult = this.diff.damage;
      }
    }
  }

  /** 투기장 가장자리(벽 바로 안쪽)의 한 점. 플레이어와 너무 가까우면 반대편으로. */
  private edgePoint(): Phaser.Math.Vector2 {
    const a = this.h.arena;
    const pl = this.h.playerPos();
    for (let tries = 0; tries < 6; tries++) {
      const ang = this.h.rng.frac() * Math.PI * 2;
      const p = new Phaser.Math.Vector2(a.x + Math.cos(ang) * (a.r - 60), a.y + Math.sin(ang) * (a.r - 60));
      if (Phaser.Math.Distance.Between(p.x, p.y, pl.x, pl.y) > 7 * 50) return p;
    }
    const away = Math.atan2(a.y - pl.y, a.x - pl.x);
    return new Phaser.Math.Vector2(a.x + Math.cos(away) * (a.r - 60), a.y + Math.sin(away) * (a.r - 60));
  }
}
