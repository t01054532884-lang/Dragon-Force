import Phaser from 'phaser';
import { Enemy, type EnemyAction } from '../objects/Enemy';
import type { EnemyKind } from '../data/enemies';
import { PATTERN } from '../data/enemies';
import { M } from '../data/stats';
import { baseSpawn, difficulty, earlyEase, pace, rankHpMult, TIMELINE, type StageData } from '../data/stages';
import { edgePointAt, type ArenaGeom } from '../data/arenas';
import { HARD_ATTACK_GAP_MS, HARD_PACE, type HardStageDef } from '../data/hardStages';

export type EliteSlotState = 'pending' | 'warning' | 'alive' | 'killed' | 'absorbed';
export type StagePhase = 'WAVE_1' | 'ELITE_1' | 'WAVE_2' | 'ELITE_2' | 'WAVE_3' | 'BOSS_WARNING' | 'BOSS' | 'CLEAR' | 'FAIL';

/** 스테이지 진행이 게임 장면에서 빌려 쓰는 것들 */
export interface DirectorHost {
  rng: Phaser.Math.RandomDataGenerator; // 같은 시드면 같은 생성 결과(재현 가능)
  playerPos(): Phaser.Math.Vector2;
  arena: ArenaGeom;
  spawn(kind: EnemyKind, x: number, y: number, hpMult: number): Enemy;
  enemyCount(): number;
  warnSpawn(x: number, y: number, ms: number, color: number): void; // 바닥 표시 + 화면 가장자리 방향 강조
  banner(text: string, color: string): void;
  darken(ms: number): void;
  emit(event: string, data?: unknown): void; // stage:start, elite:spawn … (기획서 17장 이벤트)
  fail(reason: 'timeout'): void;
  /** 어려움 기믹: 적이 직접 쓰는 것과 같은 공격(예고 → 판정)을 장면에 맡긴다 */
  enemyAction?(e: Enemy, act: EnemyAction): void;
  /** 어려움 기믹: 강화·광폭화 오라(적을 따라다니는 표시) */
  aura?(e: Enemy, color: number): void;
  /** 효과음(어려움 기믹 순간) */
  sfx?(key: string): void;
}

/**
 * 스테이지 진행(2026-11-20 전투 속도 개선 — 웨이브 진행 + 시간 조건 병행):
 * WAVE_1 → ELITE_1 → WAVE_2 → ELITE_2 → WAVE_3 → BOSS_WARNING → BOSS → CLEAR, 제한시간이 지나면 FAIL.
 * - 웨이브는 처치 목표(stage.waveKills)를 채우면 바로 끝난다 → 강할수록 빨리 진행.
 * - 목표를 못 채워도 늦은 시각(eliteSpawns.timeMs · bossSpawnMs)이 되면 진행한다 → 약한 이용자도 끝까지 간다.
 * - 엘리트를 잡으면 다음 웨이브가 즉시 시작, 못 잡아도 40초 뒤에는 다음 웨이브(엘리트는 남아 보스에게 흡수).
 * - 흡수는 엘리트가 나온 지 90초(TIMELINE.eliteAbsorbAfterMs)가 지나야 — 그 전엔 마지막 웨이브를 채워도 보스 경고를 미룸(늦은 보스 시각은 지킴).
 * - 시간은 카드 선택·일시정지 동안 멈춘다(장면이 elapsed를 멈춤).
 * 어려움(2026-11-21, hard 설정): 같은 진행에 엘리트 여러 마리·보스 2마리·단계별 기믹. 모든 엘리트·보스를 잡아야 진행/클리어.
 */
export class StageDirector {
  phase: StagePhase = 'WAVE_1';
  eliteSlots: EliteSlotState[];
  /** 슬롯별 엘리트 무리(쉬움은 1마리) */
  eliteGroups: Enemy[][];
  /** 보스(쉬움 1마리, 어려움 1~2마리) */
  bosses: Enemy[] = [];
  bossBuffs: string[] = [];
  enraged = false;
  /** 전투 기록: 엘리트·보스가 나온 시각과 처치에 걸린 시간(ms), 웨이브가 끝난 시각 */
  record = { eliteSpawnAt: [] as number[], eliteKillMs: [] as (number | null)[], bossSpawnAt: 0, bossKillMs: null as number | null, waveEndAt: [] as number[] };
  /** 지금 웨이브(0·1·2)와 그 웨이브에서 잡은 일반 몬스터 수. 웨이브가 아니면 wave = -1 */
  wave = 0;
  waveKills = 0;
  private spawnCd = 0;
  private eliteSpawnPoints: Phaser.Math.Vector2[][];
  private eliteWarnAt: (number | null)[];
  private bossSpawnPoints: Phaser.Math.Vector2[] = [];
  private bossWarnAt: number | null = null;
  private diff;
  private now = 0;
  // ── 어려움 기믹 상태 ──
  private gate = { elite: { last: null as Enemy | null, until: 0 }, boss: { last: null as Enemy | null, until: 0 } };
  private fired = new Map<Enemy, Set<string>>();
  private eliteAoeAcc = 0;
  private eliteAoeTurn = 0;

  /** 이 판의 일반 적 체력 배율(스테이지 × 난이도). 소환수가 같은 배율을 쓴다 */
  get hpMult(): number {
    return this.diff.hp;
  }

  /** 지금 살아 있는 첫 보스(없으면 처음 나온 보스, 아직 없으면 null) — 쉬움 1마리 코드와 호환 */
  get boss(): Enemy | null {
    return this.bosses.find((b) => b.active) ?? this.bosses[0] ?? null;
  }

  /** 모든 엘리트(슬롯 무리를 펼친 목록, 화면·봇이 active로 거른다) */
  get elites(): Enemy[] {
    return this.eliteGroups.flat();
  }

  isBoss(e: Enemy): boolean {
    return this.bosses.includes(e);
  }

  /** 격노 시각(제한시간 30초 전) */
  get enrageAtMs(): number {
    return this.stage.durationMs - TIMELINE.enrageBeforeEndMs;
  }

  /** HUD용: 웨이브 진행(웨이브가 아니면 null) */
  get waveInfo(): { index: number; kills: number; goal: number } | null {
    if (this.wave < 0) return null;
    return { index: this.wave, kills: this.waveKills, goal: this.waveGoal(this.wave) };
  }

  /**
   * mult: 난이도 체력·피해 배율. 쉬움은 1 → 기존과 같다.
   * hard: 어려움 단계 설정(엘리트·보스 수, 기믹). 없으면 쉬움 진행 그대로.
   */
  constructor(private h: DirectorHost, readonly stage: StageData, mult: { hp: number; damage: number } = { hp: 1, damage: 1 }, readonly hard: HardStageDef | null = null) {
    this.eliteSlots = stage.eliteSpawns.map(() => 'pending');
    this.eliteGroups = stage.eliteSpawns.map(() => []);
    this.eliteSpawnPoints = stage.eliteSpawns.map(() => []);
    this.eliteWarnAt = stage.eliteSpawns.map(() => null);
    this.record.eliteKillMs = stage.eliteSpawns.map(() => null);
    const base = difficulty(stage.id);
    // 1~5단계 완화(쉬움만, 2026-11-24 테스터 피드백) — 어려움은 그대로
    const ease = hard ? 1 : earlyEase(stage.id);
    this.diff = { ...base, hp: base.hp * mult.hp * ease, damage: base.damage * mult.damage * ease };
    // 같은 그룹 두 마리가 연달아 큰 공격을 시작하지 않게(어려움만, 쉬움은 기존 그대로)
    Enemy.attackGate = hard ? (e) => this.allowAttack(e) : null;
    h.emit('stage:start', { stage: stage.id, hard: !!hard });
  }

  /** 웨이브 처치 목표(어려움은 HARD_PACE 배율) */
  waveGoal(i: number): number {
    return Math.round(this.stage.waveKills[i] * (this.hard ? HARD_PACE.waveKills : 1));
  }

  /** 일반 몬스터(보상 있는 것)를 잡을 때마다 장면이 부른다 */
  onNormalKill(): void {
    if (this.wave >= 0) this.waveKills++;
  }

  update(elapsed: number, delta: number): void {
    this.now = elapsed;
    if (this.phase === 'CLEAR' || this.phase === 'FAIL') return;
    this.updateWaves(elapsed);
    this.updateElites(elapsed);
    this.updateBoss(elapsed);
    if (this.hard) this.updateMechanics(delta);
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
      // 엘리트 경고 시작: 위치를 정하고 바닥·화면 가장자리에 경고(여러 마리면 서로 다른 위치)
      this.eliteSlots[i] = 'warning';
      this.eliteWarnAt[i] = elapsed;
      this.eliteSpawnPoints[i] = this.spreadPoints(this.eliteCount(i));
      for (const p of this.eliteSpawnPoints[i]) this.h.warnSpawn(p.x, p.y, TIMELINE.eliteWarnMs, 0xffb74d);
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
    const last = i >= this.stage.eliteSpawns.length;
    // 마지막 웨이브: 나온 지 얼마 안 된 엘리트가 살아 있으면 목표를 채워도 보스를 부르지 않는다(흡수 늦춤)
    if (this.waveKills >= this.waveGoal(i) && !(last && this.youngEliteAlive(elapsed))) this.endWave(elapsed, 'goal');
    else if (elapsed >= late) this.endWave(elapsed, 'time');
  }

  /** 나온 지 TIMELINE.eliteAbsorbAfterMs가 안 된 엘리트가 살아 있나 */
  private youngEliteAlive(elapsed: number): boolean {
    return this.eliteSlots.some((st, i) => st === 'alive' && this.eliteGroups[i].some((e) => e.active) && elapsed - this.record.eliteSpawnAt[i] < TIMELINE.eliteAbsorbAfterMs);
  }

  // ───────── 엘리트 ─────────
  private eliteCount(i: number): number {
    return this.hard ? this.hard.eliteSpawnCount[i] ?? 1 : 1;
  }

  private updateElites(elapsed: number): void {
    this.stage.eliteSpawns.forEach((e, i) => {
      if (this.eliteSlots[i] === 'warning' && elapsed >= this.eliteWarnAt[i]! + TIMELINE.eliteWarnMs) {
        const alive = this.elites.filter((x) => x.active).length;
        if (alive >= TIMELINE.maxElites + (this.hard ? 2 : 0)) return;
        const pts = this.eliteSpawnPoints[i];
        const n = pts.length;
        const mech = this.hard?.specialMechanic ?? {};
        const each = (n > 1 ? this.hard!.eliteHpEachMultiplier : 1) * (this.hard ? HARD_PACE.eliteHp : 1);
        const hpMult = this.diff.hp * rankHpMult(this.stage, i === 0 ? 'elite1' : 'elite2') * pace(this.stage.id).eliteHp * each;
        const group = pts.map((p, k) => {
          const en = this.h.spawn(e.eliteId, p.x, p.y, hpMult);
          en.eliteSlot = i + 1;
          en.damageMult = this.diff.damage;
          en.spawnedAtMs = elapsed;
          if (mech.eliteChase) en.speedMult *= 1 + mech.eliteChase;
          if (mech.eliteEcho) en.echo = true;
          // 여러 마리면 첫 공격 시각을 어긋나게(서로 다른 위치·시간차)
          if (k > 0 && mech.eliteStaggerMs) en.resetPattern(1800 + k * mech.eliteStaggerMs);
          return en;
        });
        this.eliteGroups[i] = group;
        this.eliteSlots[i] = 'alive';
        this.record.eliteSpawnAt[i] = elapsed;
        this.phase = i === 0 ? 'ELITE_1' : 'ELITE_2';
        this.h.banner(`엘리트 등장 — ${group[0].def.name}${n > 1 ? ` ×${n}` : ''}`, '#ffb74d');
        this.h.emit('elite:spawn', { slot: i + 1, at: elapsed, count: n });
      }
      // 엘리트를 오래 못 잡으면 다음 웨이브는 그냥 시작(약한 이용자도 진행, 엘리트는 남아 있다가 보스에게 흡수)
      if (this.eliteSlots[i] === 'alive' && elapsed - this.record.eliteSpawnAt[i] >= TIMELINE.eliteMaxMs) this.startWave(i + 1, elapsed);
    });
  }

  /**
   * 엘리트가 죽었을 때 장면이 부른다. 'slot' = 그 슬롯 무리를 모두 잡음(슬롯 보상 한 번 + 다음 웨이브),
   * 'member' = 무리 중 한 마리(경험치만), false = 이미 처리됨.
   */
  onEliteKilled(en: Enemy, elapsed: number): 'slot' | 'member' | false {
    const i = en.eliteSlot - 1;
    if (i < 0 || this.eliteSlots[i] !== 'alive') return false;
    const rest = this.eliteGroups[i].filter((x) => x !== en && x.active);
    if (rest.length) {
      // 어려움 4단계: 한 마리를 잡으면 남은 엘리트가 빨라진다
      const haste = this.hard?.specialMechanic.eliteDeathHaste;
      if (haste) rest.forEach((x) => (x.speedMult *= 1 + haste));
      if (this.hard) this.h.sfx?.('sfx-elite-split');
      this.h.emit('elite:member-defeated', { slot: i + 1, left: rest.length });
      return 'member';
    }
    this.eliteSlots[i] = 'killed';
    this.record.eliteKillMs[i] = elapsed - this.record.eliteSpawnAt[i];
    this.h.emit('elite:defeated', { slot: i + 1, ms: this.record.eliteKillMs[i] });
    this.startWave(i + 1, elapsed);
    return 'slot';
  }

  // ───────── 보스 ─────────
  private startBossWarning(elapsed: number): void {
    if (this.bossWarnAt != null) return;
    this.bossWarnAt = elapsed;
    this.phase = 'BOSS_WARNING';
    const a = this.h.arena;
    const n = this.hard?.bossSpawnCount ?? 1;
    // 보스 2마리는 전장 양쪽에서
    this.bossSpawnPoints = n === 1
      ? [new Phaser.Math.Vector2(a.x, a.y - a.r * 0.55)]
      : [new Phaser.Math.Vector2(a.x - a.r * 0.45, a.y - a.r * 0.35), new Phaser.Math.Vector2(a.x + a.r * 0.45, a.y - a.r * 0.35)];
    for (const p of this.bossSpawnPoints) this.h.warnSpawn(p.x, p.y, TIMELINE.bossWarnMs, 0xff1744);
    this.h.darken(TIMELINE.bossWarnMs);
    this.h.banner(n > 1 ? '경고 — 우두머리 둘이 다가온다' : '경고 — 우두머리가 다가온다', '#ff5252');
    if (n > 1) this.h.sfx?.('sfx-boss-double');
    this.h.emit('boss:warning', { at: elapsed, count: n });
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
    if (!this.bosses.length && this.bossWarnAt != null && elapsed >= this.bossWarnAt + TIMELINE.bossWarnMs) this.spawnBosses(elapsed);
    for (const boss of this.bosses) {
      if (!boss.active) continue;
      // 강화: 1단계 회색갈기는 60%(기존), 2~20단계 보스는 50%(7단계 기획서)
      if (boss.phase === 1 && boss.hp <= boss.maxHp * (boss.def.phaseAt ?? PATTERN.graymane.phaseAt)) {
        boss.phase = 2;
        boss.resetPattern(1000);
        this.h.banner(`${boss.def.name} — ${boss.def.behavior === 'graymane' ? '분노한 울부짖음' : '강화 패턴!'}`, '#ff8a65');
        this.h.emit('boss:phase-change', { phase: 2, at: elapsed });
      }
      // 제한시간 30초 전 격노
      if (!this.enraged && elapsed >= this.enrageAtMs) {
        this.bosses.filter((b) => b.active).forEach((b) => {
          b.damageMult *= TIMELINE.enrage.damage;
          b.speedMult = TIMELINE.enrage.speed;
        });
        this.enraged = true;
        this.h.banner('격노! 30초 안에 쓰러뜨려라', '#ff1744');
        this.h.sfx?.('sfx-boss-enrage');
      }
    }
    if (elapsed >= s.durationMs && this.phase !== 'CLEAR') {
      this.phase = 'FAIL';
      this.h.fail('timeout');
    }
  }

  private spawnBosses(elapsed: number): void {
    const s = this.stage;
    // 아직 안 나온 엘리트는 나오지 않고, 살아 있는 엘리트는 사라지고 보스에게 흡수된다(보상 없음)
    let hpBuff = 1;
    let dmgBuff = 1;
    this.eliteGroups.forEach((group, i) => {
      if (this.eliteSlots[i] === 'warning' || this.eliteSlots[i] === 'pending') this.eliteSlots[i] = 'absorbed';
      const alive = group.filter((en) => en.active);
      if (alive.length) {
        alive.forEach((en) => en.destroy());
        this.eliteSlots[i] = 'absorbed';
        if (i === 0) { hpBuff = 1.1; this.bossBuffs.push('HP +10%'); }
        if (i === 1) { dmgBuff = 1.1; this.bossBuffs.push('피해 +10%'); }
      }
    });
    if (this.bossBuffs.length) this.h.emit('boss:absorb-elites', { buffs: this.bossBuffs });
    const n = this.bossSpawnPoints.length;
    const each = (n > 1 ? this.hard!.bossHpMultiplier : 1) * (this.hard ? HARD_PACE.bossHp : 1);
    const mech = this.hard?.specialMechanic ?? {};
    this.bosses = this.bossSpawnPoints.map((p, k) => {
      const boss = this.h.spawn(s.bossId, p.x, p.y, this.diff.hp * rankHpMult(s, 'boss') * pace(s.id).bossHp * hpBuff * each);
      boss.damageMult = this.diff.damage * dmgBuff;
      boss.spawnedAtMs = elapsed;
      if (mech.bossAreaMult) boss.areaMult = mech.bossAreaMult;
      if (mech.fanShots) boss.projBonus = mech.fanShots;
      if (mech.lingeringZones) boss.lingers = true;
      if (mech.bossEcho) boss.echo = true;
      if (mech.bossRoleSplit && n > 1) boss.patternFilter = k === 0 ? 'melee' : 'ranged';
      // 두 번째 보스는 공격 시점을 늦춘다(번갈아)
      if (k > 0) boss.resetPattern(1800 + HARD_ATTACK_GAP_MS);
      return boss;
    });
    this.record.bossSpawnAt = elapsed;
    this.phase = 'BOSS';
    this.h.banner(`보스 — ${this.bosses[0].def.name}${n > 1 ? ' ×2' : ''}`, '#ff1744');
    this.h.emit('boss:spawn', { at: elapsed, count: n });
  }

  /** 보스가 죽었을 때 장면이 부른다. 모든 보스를 잡았으면 true(클리어) */
  onBossKilled(e: Enemy, elapsed: number): boolean {
    const rest = this.bosses.filter((b) => b !== e && b.active);
    if (rest.length) {
      const mech = this.hard?.specialMechanic ?? {};
      const haste = (mech.bossKillHaste ?? 0) + (mech.finalEnrage ?? 0);
      if (haste) {
        rest.forEach((b) => {
          b.patternSpeed *= 1 + haste;
          this.h.aura?.(b, 0xff1744);
        });
        this.h.banner(mech.finalEnrage ? `${rest[0].def.name} — 최종 광폭화!` : `${rest[0].def.name} — 분노! 공격이 빨라진다`, '#ff5252');
        this.h.sfx?.('sfx-boss-enrage');
      }
      this.h.emit('boss:member-defeated', { left: rest.length, at: elapsed });
      return false;
    }
    this.record.bossKillMs = elapsed - this.record.bossSpawnAt;
    this.phase = 'CLEAR';
    this.h.emit('boss:defeated', { ms: this.record.bossKillMs });
    return true;
  }

  // ───────── 어려움 기믹 ─────────
  /**
   * 엘리트끼리·보스끼리 번갈아 공격(공격 예고가 겹쳐 안전지대가 사라지지 않게 — 어려움 확정 요청 2026-11-21):
   * 다른 개체가 ① 1.6초 안에 공격을 시작했거나 ② 아직 예고 중이거나(+0.3초 여유) ③ 연속 동작 중이면 기다린다.
   */
  private allowAttack(e: Enemy): boolean {
    const key = e.def.rank === 'boss' ? 'boss' : 'elite';
    const group = key === 'boss' ? this.bosses : this.elites;
    const others = group.filter((x) => x.active && x !== e);
    if (!others.length) return true;
    if (others.some((o) => o.busy || this.now < o.telegraphUntil + 300)) return false;
    const g = this.gate[key];
    if (g.last && g.last !== e && g.last.active && this.now < g.until) return false;
    g.last = e;
    g.until = this.now + HARD_ATTACK_GAP_MS;
    return true;
  }

  private once(e: Enemy, tag: string): boolean {
    let s = this.fired.get(e);
    if (!s) this.fired.set(e, (s = new Set()));
    if (s.has(tag)) return false;
    s.add(tag);
    return true;
  }

  private updateMechanics(delta: number): void {
    const m = this.hard!.specialMechanic;
    for (const b of this.bosses) {
      if (!b.active) continue;
      const r = b.hp / b.maxHp;
      if (m.bossPhaseHaste && r <= 0.5 && this.once(b, 'phaseHaste')) b.patternSpeed *= 1 / (1 - m.bossPhaseHaste);
      if (m.bossEnrage && r <= m.bossEnrage.at && this.once(b, 'enrage')) {
        b.patternSpeed *= 1 + m.bossEnrage.haste;
        this.h.aura?.(b, 0xff1744);
        this.h.banner(`${b.def.name} — 광폭화!`, '#ff1744');
        this.h.sfx?.('sfx-boss-enrage');
      }
      // 13단계: HP 70%·35%에서 바깥으로 퍼지는 충격파(보스 가까이가 안전지대), 단계마다 넓어짐
      m.bossThresholdAoe?.forEach((at, k) => {
        if (r <= at && this.once(b, `aoe${k}`)) {
          this.h.enemyAction?.(b, { kind: 'ringHit', x: b.x, y: b.y, inner: 2.6 * M, outer: (8 + 2 * k) * M, ms: 1400, damage: 22 });
          this.h.banner(`${b.def.name} — 대지 진동! 가까이 붙어 피하세요`, '#ffb74d');
        }
      });
    }
    for (const e of this.elites) {
      if (!e.active || !m.eliteEnrage) continue;
      if (e.hp / e.maxHp <= m.eliteEnrage.at && this.once(e, 'enrage')) {
        e.patternSpeed *= 1 / (1 - m.eliteEnrage.haste);
        this.h.aura?.(e, 0xff3d3d);
      }
    }
    // 12단계: 엘리트가 번갈아(동시에 아님) 자기 주변 범위 공격
    if (m.eliteAoeEveryMs) {
      const alive = this.elites.filter((e) => e.active);
      if (alive.length) {
        this.eliteAoeAcc += delta;
        if (this.eliteAoeAcc >= m.eliteAoeEveryMs) {
          this.eliteAoeAcc = 0;
          const e = alive[this.eliteAoeTurn++ % alive.length];
          this.h.enemyAction?.(e, { kind: 'circleHit', x: e.x, y: e.y, r: 3.2 * M, ms: 1200, damage: 20 });
        }
      } else this.eliteAoeAcc = 0;
    }
  }

  /** n개 등장 위치: 첫 점은 가장자리 무작위, 나머지는 원 둘레에 고르게(서로 다른 방향) */
  private spreadPoints(n: number): Phaser.Math.Vector2[] {
    const first = this.edgePoint();
    if (n <= 1) return [first];
    const a = this.h.arena;
    const base = Math.atan2(first.y - a.y, first.x - a.x);
    return Array.from({ length: n }, (_, k) => {
      const p = edgePointAt(a, base + (k * Math.PI * 2) / n, 60);
      return new Phaser.Math.Vector2(p.x, p.y);
    });
  }

  // ───────── 일반 적 생성 ─────────
  /** 지금 일반 적 생성량 배율: 엘리트 생존 70%, 보스 경고 50%, 보스전 0(자연 생성 중단) */
  spawnRate(): number {
    if (this.phase === 'BOSS' || this.bosses.length) return 0;
    if (this.phase === 'BOSS_WARNING') return TIMELINE.bossWarnSpawnRate;
    if (this.eliteSlots.includes('warning')) return TIMELINE.eliteSpawnRate;
    if (this.elites.some((e) => e.active)) return TIMELINE.eliteSpawnRate;
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
    // 좁은 전장(어려움)에서는 플레이어와의 최소 거리를 반지름에 맞춰 줄인다(쉬움 22m 전장은 그대로 7m)
    const minD = Math.min(7 * 50, a.r * 0.32);
    for (let tries = 0; tries < 6; tries++) {
      const e = edgePointAt(a, this.h.rng.frac() * Math.PI * 2, 60); // 정사각형 전장은 네 변 위
      const p = new Phaser.Math.Vector2(e.x, e.y);
      if (Phaser.Math.Distance.Between(p.x, p.y, pl.x, pl.y) > minD) return p;
    }
    const away = edgePointAt(a, Math.atan2(a.y - pl.y, a.x - pl.x), 60);
    return new Phaser.Math.Vector2(away.x, away.y);
  }
}
