import Phaser from 'phaser';
import type { Enemy } from '../objects/Enemy';
import type { EnemyKind } from '../data/enemies';
import { PATTERN } from '../data/enemies';
import { baseSpawn, difficulty, pace, rankHpMult, TIMELINE, type StageData } from '../data/stages';

export type EliteSlotState = 'pending' | 'warning' | 'alive' | 'killed' | 'absorbed';
export type StagePhase = 'WAVE_1' | 'ELITE_1' | 'WAVE_2' | 'ELITE_2' | 'WAVE_3' | 'BOSS_WARNING' | 'BOSS' | 'CLEAR' | 'FAIL';

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
 * 스테이지 진행(2026-11-20 전투 속도 개선 — 웨이브 진행 + 시간 조건 병행):
 * WAVE_1 → ELITE_1 → WAVE_2 → ELITE_2 → WAVE_3 → BOSS_WARNING → BOSS → CLEAR, 제한시간이 지나면 FAIL.
 * - 웨이브는 처치 목표(stage.waveKills)를 채우면 바로 끝난다 → 강할수록 빨리 진행.
 * - 목표를 못 채워도 늦은 시각(eliteSpawns.timeMs · bossSpawnMs)이 되면 진행한다 → 약한 이용자도 끝까지 간다.
 * - 엘리트를 잡으면 다음 웨이브가 즉시 시작, 못 잡아도 40초 뒤에는 다음 웨이브(엘리트는 남아 보스에게 흡수).
 * - 시간은 카드 선택·일시정지 동안 멈춘다(장면이 elapsed를 멈춤).
 */
export class StageDirector {
  phase: StagePhase = 'WAVE_1';
  eliteSlots: EliteSlotState[];
  elites: (Enemy | null)[];
  boss: Enemy | null = null;
  bossBuffs: string[] = [];
  enraged = false;
  /** 전투 기록: 엘리트·보스가 나온 시각과 처치에 걸린 시간(ms), 웨이브가 끝난 시각 */
  record = { eliteSpawnAt: [] as number[], eliteKillMs: [] as (number | null)[], bossSpawnAt: 0, bossKillMs: null as number | null, waveEndAt: [] as number[] };
  /** 지금 웨이브(0·1·2)와 그 웨이브에서 잡은 일반 몬스터 수. 웨이브가 아니면 wave = -1 */
  wave = 0;
  waveKills = 0;
  private spawnCd = 0;
  private eliteSpawnPoint: (Phaser.Math.Vector2 | null)[];
  private eliteWarnAt: (number | null)[];
  private bossSpawnPoint: Phaser.Math.Vector2 | null = null;
  private bossWarnAt: number | null = null;
  private diff;

  /** 이 판의 일반 적 체력 배율(스테이지 × 난이도). 소환수가 같은 배율을 쓴다 */
  get hpMult(): number {
    return this.diff.hp;
  }

  /** 격노 시각(제한시간 30초 전) */
  get enrageAtMs(): number {
    return this.stage.durationMs - TIMELINE.enrageBeforeEndMs;
  }

  /** HUD용: 웨이브 진행(웨이브가 아니면 null) */
  get waveInfo(): { index: number; kills: number; goal: number } | null {
    if (this.wave < 0) return null;
    return { index: this.wave, kills: this.waveKills, goal: this.stage.waveKills[this.wave] };
  }

  /** mult: 난이도(쉬움·어려움·매우 어려움) 체력·피해 배율(v1.2). 쉬움은 1 → 기존과 같다. */
  constructor(private h: DirectorHost, readonly stage: StageData, mult: { hp: number; damage: number } = { hp: 1, damage: 1 }) {
    this.eliteSlots = stage.eliteSpawns.map(() => 'pending');
    this.elites = stage.eliteSpawns.map(() => null);
    this.eliteSpawnPoint = stage.eliteSpawns.map(() => null);
    this.eliteWarnAt = stage.eliteSpawns.map(() => null);
    this.record.eliteKillMs = stage.eliteSpawns.map(() => null);
    const base = difficulty(stage.id);
    this.diff = { ...base, hp: base.hp * mult.hp, damage: base.damage * mult.damage };
    h.emit('stage:start', { stage: stage.id });
  }

  /** 일반 몬스터(보상 있는 것)를 잡을 때마다 장면이 부른다 */
  onNormalKill(): void {
    if (this.wave >= 0) this.waveKills++;
  }

  update(elapsed: number, delta: number): void {
    if (this.phase === 'CLEAR' || this.phase === 'FAIL') return;
    this.updateWaves(elapsed);
    this.updateElites(elapsed);
    this.updateBoss(elapsed);
    this.updateSpawns(elapsed, delta);
  }

  // ───────── 웨이브 ─────────
  private endWave(elapsed: number, why: 'goal' | 'time'): void {
    const i = this.wave;
    this.record.waveEndAt[i] = elapsed;
    this.wave = -1;
    this.h.emit('wave:end', { wave: i + 1, at: elapsed, why });
    if (why === 'goal') this.h.banner(`웨이브 ${i + 1} 돌파!`, '#ffd34d');
    if (i < this.stage.eliteSpawns.length) {
      // 엘리트 경고 시작: 위치를 정하고 바닥·화면 가장자리에 경고
      this.eliteSlots[i] = 'warning';
      this.eliteWarnAt[i] = elapsed;
      this.eliteSpawnPoint[i] = this.edgePoint();
      const p = this.eliteSpawnPoint[i]!;
      this.h.warnSpawn(p.x, p.y, TIMELINE.eliteWarnMs, 0xffb74d);
      this.h.emit('elite:warning', { slot: i + 1 });
    } else {
      this.startBossWarning(elapsed);
    }
  }

  private startWave(i: number, elapsed: number): void {
    if (this.wave >= 0 || this.bossWarnAt != null || this.record.waveEndAt[i] !== undefined) return;
    this.wave = i;
    this.waveKills = 0;
    this.phase = i === 1 ? 'WAVE_2' : 'WAVE_3';
    this.h.emit('wave:start', { wave: i + 1, at: elapsed });
  }

  private updateWaves(elapsed: number): void {
    if (this.wave < 0) return;
    const i = this.wave;
    const late = i < this.stage.eliteSpawns.length ? this.stage.eliteSpawns[i].timeMs - TIMELINE.eliteWarnMs : this.stage.bossSpawnMs - TIMELINE.bossWarnMs;
    if (this.waveKills >= this.stage.waveKills[i]) this.endWave(elapsed, 'goal');
    else if (elapsed >= late) this.endWave(elapsed, 'time');
  }

  // ───────── 엘리트 ─────────
  private updateElites(elapsed: number): void {
    this.stage.eliteSpawns.forEach((e, i) => {
      if (this.eliteSlots[i] === 'warning' && elapsed >= this.eliteWarnAt[i]! + TIMELINE.eliteWarnMs) {
        const alive = this.elites.filter((x) => x?.active).length;
        if (alive >= TIMELINE.maxElites) return;
        const p = this.eliteSpawnPoint[i]!;
        const hpMult = this.diff.hp * rankHpMult(this.stage, i === 0 ? 'elite1' : 'elite2') * pace(this.stage.id).eliteHp;
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
      // 엘리트를 오래 못 잡으면 다음 웨이브는 그냥 시작(약한 이용자도 진행, 엘리트는 남아 있다가 보스에게 흡수)
      if (this.eliteSlots[i] === 'alive' && elapsed - this.record.eliteSpawnAt[i] >= TIMELINE.eliteMaxMs) this.startWave(i + 1, elapsed);
    });
  }

  /** 엘리트가 죽었을 때 장면이 부른다. 보상은 한 번만(true를 돌려준 경우에만 지급). 다음 웨이브를 바로 시작한다. */
  onEliteKilled(en: Enemy, elapsed: number): boolean {
    const i = en.eliteSlot - 1;
    if (i < 0 || this.eliteSlots[i] !== 'alive') return false;
    this.eliteSlots[i] = 'killed';
    this.record.eliteKillMs[i] = elapsed - en.spawnedAtMs;
    this.h.emit('elite:defeated', { slot: i + 1, ms: this.record.eliteKillMs[i] });
    this.startWave(i + 1, elapsed);
    return true;
  }

  // ───────── 보스 ─────────
  private startBossWarning(elapsed: number): void {
    if (this.bossWarnAt != null) return;
    this.bossWarnAt = elapsed;
    this.phase = 'BOSS_WARNING';
    this.bossSpawnPoint = new Phaser.Math.Vector2(this.h.arena.x, this.h.arena.y - this.h.arena.r * 0.55);
    this.h.warnSpawn(this.bossSpawnPoint.x, this.bossSpawnPoint.y, TIMELINE.bossWarnMs, 0xff1744);
    this.h.darken(TIMELINE.bossWarnMs);
    this.h.banner('경고 — 우두머리가 다가온다', '#ff5252');
    this.h.emit('boss:warning', { at: elapsed });
  }

  private updateBoss(elapsed: number): void {
    const s = this.stage;
    // 늦어도 이 시각에는 보스 경고(웨이브가 남아 있어도 — 약한 이용자 보장)
    if (this.bossWarnAt == null && elapsed >= s.bossSpawnMs - TIMELINE.bossWarnMs) {
      if (this.wave >= 0) {
        this.record.waveEndAt[this.wave] = elapsed;
        this.wave = -1;
      }
      this.startBossWarning(elapsed);
    }
    if (!this.boss && this.bossWarnAt != null && elapsed >= this.bossWarnAt + TIMELINE.bossWarnMs) {
      // 아직 안 나온 엘리트는 나오지 않고, 살아 있는 엘리트는 사라지고 보스에게 흡수된다(보상 없음)
      let hpBuff = 1;
      let dmgBuff = 1;
      this.elites.forEach((en, i) => {
        if (this.eliteSlots[i] === 'warning' || this.eliteSlots[i] === 'pending') this.eliteSlots[i] = 'absorbed';
        if (en?.active) {
          en.destroy();
          this.eliteSlots[i] = 'absorbed';
          if (i === 0) { hpBuff = 1.1; this.bossBuffs.push('HP +10%'); }
          if (i === 1) { dmgBuff = 1.1; this.bossBuffs.push('피해 +10%'); }
        }
      });
      if (this.bossBuffs.length) this.h.emit('boss:absorb-elites', { buffs: this.bossBuffs });
      const p = this.bossSpawnPoint!;
      const boss = this.h.spawn(s.bossId, p.x, p.y, this.diff.hp * rankHpMult(s, 'boss') * pace(s.id).bossHp * hpBuff);
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
      // 강화: 1단계 회색갈기는 60%(기존), 2~20단계 보스는 50%(7단계 기획서)
      if (boss.phase === 1 && boss.hp <= boss.maxHp * (boss.def.phaseAt ?? PATTERN.graymane.phaseAt)) {
        boss.phase = 2;
        boss.resetPattern(1000);
        this.h.banner(`${boss.def.name} — ${boss.def.behavior === 'graymane' ? '분노한 울부짖음' : '강화 패턴!'}`, '#ff8a65');
        this.h.emit('boss:phase-change', { phase: 2, at: elapsed });
      }
      // 제한시간 30초 전 격노, 제한시간이 되면 시간 초과 실패
      if (!this.enraged && elapsed >= this.enrageAtMs) {
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
    if (this.eliteSlots.includes('warning')) return TIMELINE.eliteSpawnRate;
    if (this.elites.some((e) => e?.active)) return TIMELINE.eliteSpawnRate;
    return 1;
  }

  private updateSpawns(elapsed: number, delta: number): void {
    let rate = this.spawnRate() * this.diff.spawnRate;
    if (rate <= 0) return;
    // 적을 빨리 비우면 다음 무리를 바로(강한 이용자가 웨이브 목표를 빨리 채움). 전체 수는 여전히 기존보다 적다
    if (this.wave >= 0 && this.h.enemyCount() < TIMELINE.refillBelow) rate *= TIMELINE.refillRate;
    this.spawnCd -= delta;
    if (this.spawnCd > 0 || this.h.enemyCount() >= 220) return;
    const b = baseSpawn(elapsed);
    this.spawnCd = b.interval / rate;
    const table = this.stage.spawnTable;
    if (table) {
      // 2~20단계: 일반 몬스터 3종을 비중대로(셋째는 1분부터). 날벌레·새는 2~3마리 무리. 같은 시드면 같은 결과.
      const open = table.filter((t) => elapsed >= t.fromMs);
      const total = open.reduce((a, t) => a + t.weight, 0);
      for (let i = 0; i < b.count; i++) {
        let x = this.h.rng.frac() * total;
        const pick = open.find((t) => (x -= t.weight) < 0) ?? open[open.length - 1];
        const p = this.edgePoint();
        const n = this.h.rng.between(pick.pack[0], pick.pack[1]);
        for (let k = 0; k < n; k++) {
          const e = this.h.spawn(pick.kind, p.x + this.h.rng.between(-40, 40), p.y + this.h.rng.between(-40, 40), this.diff.hp);
          e.damageMult = this.diff.damage;
        }
      }
      return;
    }
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
