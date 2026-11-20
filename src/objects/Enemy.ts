import Phaser from 'phaser';
import { CC, ENEMIES, HARD_CC_BOSS, PATTERN, type EnemyDef, type EnemyKind, type PatternSpec } from '../data/enemies';
import { M } from '../data/stats';

/** 7단계 공통 패턴 예고시간(ms) — 모든 난이도에서 같다(원문 6장) */
export const TELEGRAPH = { projectile: 800, charge: 1000, area: 1200, shockwave: 1300, breath: 1500, claw: 900, line: 1000 };

/** 적이 이번 프레임에 하겠다는 행동. 그리기·피해 판정은 장면이 한다(적은 화면·플레이어를 모른다). */
export type EnemyAction =
  | { kind: 'lineWarn'; x: number; y: number; angle: number; length: number; ms: number; width: number; curve?: number }
  | { kind: 'circleHit'; x: number; y: number; r: number; ms: number; damage: number; slowPlayer?: boolean } // 원형 예고 → 판정
  | { kind: 'coneHit'; x: number; y: number; angle: number; half: number; r: number; ms: number; damage: number; slowPlayer?: boolean; breath?: boolean } // 부채꼴 예고 → 판정
  | { kind: 'summon'; enemy: EnemyKind; count: number; x: number; y: number }
  // ── 7단계 공통 패턴 ──
  | { kind: 'shot'; x: number; y: number; angle: number; speed: number; damage: number; size: number } // 직선 투사체(예고선 뒤 발사)
  | { kind: 'orb'; x: number; y: number; angle: number; speed: number; damage: number; lifeMs: number } // 느린 추적 구체
  | { kind: 'lineHit'; x: number; y: number; angle: number; length: number; width: number; ms: number; damage: number } // 직선 범위 예고 → 판정
  | { kind: 'ringHit'; x: number; y: number; inner: number; outer: number; ms: number; damage: number } // 고리(안쪽 안전) 예고 → 판정
  | { kind: 'slowZone'; x: number; y: number; r: number; ms: number; slow: number }
  | { kind: 'shield'; ms: number; front: boolean };

/**
 * 패턴의 한 동작. 적은 동작 대기열(queue)을 앞에서부터 하나씩 실행한다.
 * hold: 멈춤(예고 중) / dash: 정해진 속도로 돌진(curve면 휘어짐, untilWall이면 투기장 벽에서 멈춤) / stun: 기절(약점)
 */
interface Move {
  kind: 'hold' | 'dash' | 'stun';
  ms: number;
  angle?: number;
  speed?: number;
  curve?: number; // 초당 회전(라디안) — 초승달 돌진
  untilWall?: boolean;
  onEnd?: () => EnemyAction | EnemyAction[] | null; // 동작이 끝날 때 일어날 일(벽 충돌 충격파 등)
}

/** 적이 알아야 하는 바깥 정보: 투기장 중심·반지름 */
export interface Arena {
  x: number;
  y: number;
  r: number;
}

/** 그림 크기 = 반지름 × 3.6 (늑대 반지름 15 → 54px, 보스 52 → 187px — 기획 요청 5: 일반·엘리트·보스가 크기로 구별) */
const ART_SCALE = 3.6;

export class Enemy extends Phaser.Physics.Arcade.Image {
  private static nextUid = 0;
  declare body: Phaser.Physics.Arcade.Body;
  readonly def: EnemyDef;
  /** 생성 순번. 거리가 같을 때 먼저 나온 적을 우선 노린다(기획서 v0.2 대상 선정 규칙). */
  readonly uid = Enemy.nextUid++;
  hp: number;
  maxHp: number;
  damageMult = 1; // 스테이지 피해 배율 × 엘리트 흡수 강화 × 격노
  speedMult = 1; // 격노
  phase = 1; // 보스 페이즈(60%에서 2)
  /** 엘리트 1·2 구분(UI 슬롯·흡수 효과) */
  eliteSlot = 0;
  spawnedAtMs = 0;
  private hitFlash = 0;
  private slowLeft = 0;
  private slowRatio = 0;
  private knockLeft = 0;
  private knockVel = new Phaser.Math.Vector2();
  private burnStacks: number[] = [];
  private burnPerStack = 0;
  private burnTick = 0;
  // 6단계 상태이상: 중독(중첩 지속 피해) · 행동 불가(빙결·기절) · 감전(받는 피해 증가)
  private poisonStacks: number[] = [];
  private poisonPerStack = 0;
  private poisonTick = 0;
  private ccLeft = 0;
  private ccKind: 'freeze' | 'stun' | null = null;
  private vulnLeft = 0;
  vulnMult = 1;
  orbHitAt = -Infinity;
  private queue: Move[] = [];
  private moveLeft = -1;
  private patternCd = 1800;
  private bossTurn = 0;
  // ── 7단계 공통 AI·패턴 상태 ──
  /** 패턴 위치를 고르는 난수(게임 장면이 시드로 만든 것으로 바꿔 끼운다 — 시드 재현) */
  static rng: () => number = Math.random;
  private patternIdx = 0;
  private lastTarget = new Phaser.Math.Vector2();
  private shieldLeft = 0;
  private shieldFront = false;
  private shieldReduce = 0;
  private lifeLeft = Infinity;
  /** 소환형이 부른 졸개(최대 수 확인용) */
  minions: Enemy[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number, readonly kind: EnemyKind, hpMult = 1) {
    const def = ENEMIES[kind];
    super(scene, x, y, def.texture);
    this.def = def;
    this.maxHp = Math.round(def.hp * hpMult);
    this.hp = this.maxHp;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const r = def.radius;
    this.body.setCircle(r, this.width / 2 - r, this.height / 2 - r);
    if (def.rank !== 'normal') this.setDepth(6);
    // 기획자 그림(옆모습, 머리 오른쪽)이 있으면 그 그림을 위에 보이고 원래 도형은 숨긴다(충돌 범위는 그대로).
    // 옆모습이라 몸체를 돌리지 않고 이동 방향에 따라 좌우만 뒤집는다. 색(피격·상태)·투명도는 매 프레임 따라 함.
    const artKey = `art-${def.texture}`;
    if (scene.textures.exists(artKey)) {
      this.skin = scene.add.image(x, y, artKey).setDepth(this.depth);
      this.skin.setDisplaySize(def.radius * ART_SCALE, def.radius * ART_SCALE);
      this.setVisible(false);
    }
    if (def.lifeMs) this.lifeLeft = def.lifeMs;
    // 원거리·소환형은 처음 공격 시각을 조금씩 어긋나게(한꺼번에 쏘지 않게, uid 기반이라 재현됨)
    if (def.shot || def.summon) this.patternCd = 1200 + (this.uid % 10) * 150;
  }

  /** 기획자 그림 층(없으면 원래 도형) */
  skin?: Phaser.GameObjects.Image;
  private faceLeft = false;

  /** 그림 층을 몸체에 맞춤: 위치·좌우(가로 속도 기준, 돌진 방향 포함)·색·투명도 */
  syncSkin(): void {
    const s = this.skin;
    if (!s) return;
    const vx = this.body ? (this.body as Phaser.Physics.Arcade.Body).velocity.x : 0;
    if (vx < -8) this.faceLeft = true;
    else if (vx > 8) this.faceLeft = false;
    else if (Math.abs(vx) <= 8 && this.rotation !== 0) this.faceLeft = Math.cos(this.rotation) < 0;
    s.setPosition(this.x, this.y).setFlipX(this.faceLeft).setAlpha(this.alpha);
    s.setTint(this.tintTopLeft);
  }

  destroy(fromScene?: boolean): void {
    this.skin?.destroy();
    this.skin = undefined;
    super.destroy(fromScene);
  }

  /** 분신·기병처럼 시간이 다 되면 보상 없이 사라지는 적 */
  get expired(): boolean {
    return this.lifeLeft <= 0;
  }

  get shielded(): boolean {
    return this.shieldLeft > 0;
  }

  /** 받는 피해 배율: 방어형 정면(±60°) 감소 · 보스 방어 패턴(정면만 또는 전체) */
  guardFactor(px: number, py: number): number {
    const toP = Math.atan2(py - this.y, px - this.x);
    const front = Math.abs(Phaser.Math.Angle.Wrap(toP - this.rotation)) < Math.PI / 3;
    let m = 1;
    if (this.def.guard && front) m *= 1 - this.def.guard;
    if (this.shieldLeft > 0 && (!this.shieldFront || front)) m *= 1 - this.shieldReduce;
    return m;
  }

  get rank() {
    return this.def.rank;
  }

  /** 돌진 중이면 몸통 피해가 더 크다 */
  get dashing(): boolean {
    return this.queue[0]?.kind === 'dash';
  }

  get stunned(): boolean {
    return this.queue[0]?.kind === 'stun';
  }

  /** 매 프레임 이동·패턴. 행동이 있으면 돌려준다. */
  step(target: Phaser.Math.Vector2, delta: number, arena: Arena): EnemyAction[] {
    const out: EnemyAction[] = [];
    this.lastTarget.set(target.x, target.y);
    if (this.lifeLeft !== Infinity) this.lifeLeft -= delta;
    if (this.shieldLeft > 0) this.shieldLeft -= delta;
    if (this.hitFlash > 0) {
      this.hitFlash -= delta;
      if (this.hitFlash <= 0) this.refreshTint();
    }
    if (this.slowLeft > 0) {
      this.slowLeft -= delta;
      if (this.slowLeft <= 0) this.refreshTint();
    }
    if (this.vulnLeft > 0) {
      this.vulnLeft -= delta;
      if (this.vulnLeft <= 0) this.vulnMult = 1;
    }
    if (this.knockLeft > 0) {
      this.knockLeft -= delta;
      this.body.setVelocity(this.knockVel.x, this.knockVel.y);
      return out;
    }
    if (this.ccLeft > 0) {
      // 빙결·기절: 제자리에 멈춘다(패턴 시간도 흐르지 않음)
      this.ccLeft -= delta;
      this.body.setVelocity(0, 0);
      if (this.ccLeft <= 0) {
        this.ccKind = null;
        this.refreshTint();
      }
      return out;
    }

    // 1) 패턴 동작 실행 중
    if (this.queue.length > 0) {
      const m = this.queue[0];
      if (this.moveLeft < 0) {
        this.moveLeft = m.ms;
        if (m.kind === 'stun') this.refreshTint();
        // 연속 돌진: 예고(hold)가 시작될 때 그 순간의 플레이어를 노리고 예고선을 그린다
        const dash = this.queue[1];
        if (m.kind === 'hold' && dash?.kind === 'dash' && dash.angle === undefined) {
          const toT = Math.atan2(target.y - this.y, target.x - this.x);
          const curve = dash.curve ?? 0;
          dash.angle = toT - (curve * (dash.ms / 1000)) / 2; // 휘어서 플레이어 쪽에 닿도록 시작 각을 반만큼 비튼다
          out.push(this.warnLine(dash.angle, ((dash.speed ?? 0) * dash.ms) / 1000, m.ms, this.def.radius * 1.4, curve || undefined));
        }
      }
      this.moveLeft -= delta * this.speedMult;
      if (m.kind === 'dash') {
        if (m.curve) m.angle = (m.angle ?? 0) + m.curve * (delta / 1000);
        const v = (m.speed ?? 0) * this.speedMult;
        this.body.setVelocity(Math.cos(m.angle!) * v, Math.sin(m.angle!) * v);
        this.setRotation(m.angle!);
        const fromCenter = Phaser.Math.Distance.Between(this.x, this.y, arena.x, arena.y);
        if (m.untilWall && fromCenter > arena.r - this.def.radius - 4) this.moveLeft = 0; // 벽에 부딪힘
      } else {
        this.body.setVelocity(0, 0);
      }
      if (this.moveLeft <= 0) {
        this.queue.shift();
        this.moveLeft = -1;
        const end = m.onEnd?.();
        if (end) out.push(...(Array.isArray(end) ? end : [end]));
        this.refreshTint();
      }
      return out;
    }

    // 2) 평소: 추적(늑대는 옆으로 돌아 포위)
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    let aim = Math.atan2(dy, dx);
    if (this.def.behavior === 'flank' && dist > PATTERN.wolf.flankDist) {
      // uid가 짝수면 왼쪽, 홀수면 오른쪽으로 돌아 들어간다 → 무리가 양옆을 감싼다
      const side = this.uid % 2 === 0 ? 1 : -1;
      const ox = target.x + Math.cos(aim + (Math.PI / 2) * side) * PATTERN.wolf.flankOffset;
      const oy = target.y + Math.sin(aim + (Math.PI / 2) * side) * PATTERN.wolf.flankOffset;
      aim = Math.atan2(oy - this.y, ox - this.x);
    }
    let speed = this.def.speed * this.speedMult;
    if (this.slowLeft > 0) speed *= 1 - this.slowRatio;
    let vx = Math.cos(aim) * speed;
    let vy = Math.sin(aim) * speed;
    const keep = this.def.keep;
    if (keep && dist < keep + 80) {
      // 원거리·소환형: 너무 가까우면 물러나고, 알맞은 거리면 옆으로 돈다
      const side = this.uid % 2 === 0 ? 1 : -1;
      const back = dist < keep - 40;
      const a = back ? aim + Math.PI : aim + (side * Math.PI) / 2;
      const s = back ? speed : speed * 0.6;
      vx = Math.cos(a) * s;
      vy = Math.sin(a) * s;
    }
    this.body.setVelocity(vx, vy);
    this.setRotation(aim);

    // 3) 패턴 고르기
    this.patternCd -= delta * this.speedMult;
    if (this.patternCd <= 0) out.push(...this.choosePattern(target, dist, arena));
    return out;
  }

  private choosePattern(t: Phaser.Math.Vector2, dist: number, arena: Arena): EnemyAction[] {
    const toT = Math.atan2(t.y - this.y, t.x - this.x);
    switch (this.def.behavior) {
      case 'ranged': {
        const s = this.def.shot!;
        if (dist > 10 * M) {
          this.patternCd = 400;
          return [];
        }
        this.patternCd = s.every;
        return this.fire(toT, s.count, s.spread, s.speed, s.damage, 1, false, 1);
      }
      case 'summoner': {
        const s = this.def.summon!;
        this.patternCd = s.every;
        this.minions = this.minions.filter((m) => m.active);
        if (this.minions.length >= s.max) return [];
        this.queue.push({ kind: 'hold', ms: 600 });
        return [{ kind: 'summon', enemy: s.kind, count: s.count, x: this.x, y: this.y }];
      }
      case 'module':
        return this.runModule(toT, dist, arena);
      case 'charger':
      case 'charge': {
        const p = PATTERN.boar;
        if (dist > p.trigger) return [];
        this.patternCd = p.cooldown;
        // 예고 → 직선 돌진 → 짧은 기절
        this.queue.push({ kind: 'hold', ms: p.windup }, { kind: 'dash', ms: p.dashMs, angle: toT, speed: p.dashSpeed }, { kind: 'stun', ms: p.stunMs });
        return [this.warnLine(toT, (p.dashSpeed * p.dashMs) / 1000, p.windup, 22)];
      }
      case 'moonfang': {
        const p = PATTERN.moonfang;
        if (dist > p.trigger) return [];
        this.patternCd = p.every;
        // 초승달 3연속 돌진: 매번 좌우를 바꿔 휘어진다. 각 돌진 방향·예고선은 그 예고가 시작될 때 정한다(step 참고).
        for (let i = 0; i < p.dashes; i++) {
          const curve = (i % 2 === 0 ? 1 : -1) * p.curve;
          this.queue.push({ kind: 'hold', ms: i === 0 ? p.windup : p.gap }, { kind: 'dash', ms: p.dashMs, speed: p.dashSpeed, curve });
        }
        this.queue.push({ kind: 'stun', ms: 700 });
        return [];
      }
      case 'matriarch': {
        const p = PATTERN.matriarch;
        this.patternCd = p.every;
        // 벽에 부딪힐 때까지 돌진 → 부딪힌 자리에서 충격파(0.8초 예고) → 기절(약점)
        const length = this.rayToWall(toT, arena);
        this.queue.push(
          { kind: 'hold', ms: p.windup },
          {
            kind: 'dash', ms: p.maxMs, angle: toT, speed: p.dashSpeed, untilWall: true,
            onEnd: () => ({ kind: 'circleHit', x: this.x, y: this.y, r: p.shockR, ms: p.shockWarn, damage: p.shockDamage }),
          },
          { kind: 'stun', ms: p.stunMs },
        );
        return [this.warnLine(toT, length, p.windup, 56)];
      }
      case 'graymane': {
        const p = PATTERN.graymane;
        this.patternCd = p.every * (this.phase === 2 ? 0.75 : 1);
        const turn = this.bossTurn++ % 3;
        if (turn === 0) {
          // 돌진: 2페이즈는 3연속
          const n = this.phase === 2 ? p.phase2Dashes : 1;
          for (let i = 0; i < n; i++) {
            this.queue.push({ kind: 'hold', ms: i === 0 ? p.dash.windup : p.dash.gap }, { kind: 'dash', ms: p.dash.ms, speed: p.dash.speed });
          }
          this.queue.push({ kind: 'stun', ms: 500 });
          return [];
        }
        if (turn === 1) {
          this.queue.push({ kind: 'hold', ms: 600 });
          return [{ kind: 'summon', enemy: 'shadow_wolf', count: p.howl.wolves, x: this.x, y: this.y }];
        }
        this.queue.push({ kind: 'hold', ms: p.claw.windup });
        return [{ kind: 'coneHit', x: this.x, y: this.y, angle: toT, half: p.claw.halfAngle, r: p.claw.r, ms: p.claw.windup, damage: p.claw.damage }];
      }
      default:
        this.patternCd = 99999;
        return [];
    }
  }

  // ───────── 7단계 보스·엘리트 패턴 모듈 ─────────

  /** 패턴을 차례로 사용(시드 재현). HP 50% 이하면 강화 목록, 25% 이하면 대기시간 15% 단축. 근접 패턴은 가까워질 때까지 기다린다. */
  private runModule(toT: number, dist: number, arena: Arena): EnemyAction[] {
    const list = this.phase === 2 && this.def.patterns2 ? this.def.patterns2 : this.def.patterns ?? [];
    if (list.length === 0) {
      this.patternCd = 99999;
      return [];
    }
    const spec = list[this.patternIdx % list.length];
    if (spec.t === 'cone' && dist > spec.r + M) return this.wait();
    if (spec.t === 'charge' && dist > 11 * M) return this.wait();
    this.patternIdx++;
    this.patternCd = (this.def.patternGap ?? 3000) * (this.hp <= this.maxHp * 0.25 ? 0.85 : 1);
    return this.runSpec(spec, toT, arena);
  }

  private wait(): EnemyAction[] {
    this.patternCd = 300;
    return [];
  }

  private runSpec(spec: PatternSpec, toT: number, arena: Arena): EnemyAction[] {
    const T = TELEGRAPH;
    switch (spec.t) {
      case 'projectile':
        return this.fire(toT, spec.count, spec.spread, spec.speed, spec.damage, spec.size ?? 1, !!spec.radial, spec.repeat ?? 1);
      case 'charge': {
        for (let i = 0; i < spec.count; i++) {
          this.queue.push({ kind: 'hold', ms: i === 0 ? T.charge : 700 }, { kind: 'dash', ms: spec.ms, speed: spec.speed });
        }
        const then = spec.then;
        if (then) this.queue.push({ kind: 'hold', ms: 1, onEnd: () => this.runSpec(then, Math.atan2(this.lastTarget.y - this.y, this.lastTarget.x - this.x), arena) });
        else this.queue.push({ kind: 'stun', ms: 500 });
        return [];
      }
      case 'area': {
        const ms = spec.delayMs ?? T.area;
        const pts: [number, number][] = [];
        for (let i = 0; i < spec.count; i++) {
          if (spec.at === 'self') pts.push([this.x, this.y]);
          else if (spec.at === 'player' && i === 0) pts.push([this.lastTarget.x, this.lastTarget.y]);
          else {
            const a = Enemy.rng() * Math.PI * 2;
            const d = (spec.at === 'player' ? 1.5 : 1) * M + Enemy.rng() * 3 * M;
            pts.push([this.lastTarget.x + Math.cos(a) * d, this.lastTarget.y + Math.sin(a) * d]);
          }
        }
        this.queue.push({ kind: 'hold', ms: 600 });
        return pts.map(([x, y]) => ({ kind: 'circleHit' as const, x, y, r: spec.r, ms, damage: spec.damage, slowPlayer: spec.slowPlayer }));
      }
      case 'shockwave':
        this.queue.push({ kind: 'hold', ms: T.shockwave });
        return [{ kind: 'circleHit', x: this.x, y: this.y, r: spec.r, ms: T.shockwave, damage: spec.damage }];
      case 'ring':
        this.queue.push({ kind: 'hold', ms: T.shockwave });
        return [{ kind: 'ringHit', x: this.x, y: this.y, inner: spec.inner, outer: spec.outer, ms: T.shockwave, damage: spec.damage }];
      case 'cone': {
        const ms = spec.breath ? T.breath : T.claw;
        this.queue.push({ kind: 'hold', ms });
        return [{ kind: 'coneHit', x: this.x, y: this.y, angle: toT, half: spec.half, r: spec.r, ms, damage: spec.damage, slowPlayer: spec.slowPlayer, breath: spec.breath }];
      }
      case 'line': {
        const hit = (angle: number): EnemyAction => ({ kind: 'lineHit', x: this.x, y: this.y, angle, length: spec.length, width: spec.width, ms: T.line, damage: spec.damage });
        if (spec.cross) {
          this.queue.push({ kind: 'hold', ms: T.line });
          return [0, 1, 2, 3].map((k) => hit(toT + (k * Math.PI) / 2));
        }
        if (spec.sequential && spec.count > 1) {
          // 서로 다른 순간에 다시 조준하는 연속 검기(0.55초 간격, 각자 1초 예고)
          for (let i = 1; i < spec.count; i++) {
            this.queue.push({ kind: 'hold', ms: 550, onEnd: () => hit(Math.atan2(this.lastTarget.y - this.y, this.lastTarget.x - this.x)) });
          }
          this.queue.push({ kind: 'hold', ms: T.line });
          return [hit(toT)];
        }
        this.queue.push({ kind: 'hold', ms: T.line });
        const n = spec.count;
        return Array.from({ length: n }, (_, i) => hit(n > 1 ? toT - 0.2 * (n - 1) + 0.4 * i : toT));
      }
      case 'summon':
        this.queue.push({ kind: 'hold', ms: 600 });
        return [{ kind: 'summon', enemy: spec.kind, count: spec.count, x: this.x, y: this.y }];
      case 'shield':
        this.shieldLeft = spec.ms;
        this.shieldFront = !!spec.front;
        this.shieldReduce = spec.reduce;
        this.queue.push({ kind: 'hold', ms: 400 });
        return [{ kind: 'shield', ms: spec.ms, front: !!spec.front }];
      case 'teleport':
        this.setAlpha(0.3);
        this.queue.push({
          kind: 'hold',
          ms: 500,
          onEnd: () => {
            const a = Enemy.rng() * Math.PI * 2;
            let x = this.lastTarget.x + Math.cos(a) * 4.5 * M;
            let y = this.lastTarget.y + Math.sin(a) * 4.5 * M;
            const d = Math.hypot(x - arena.x, y - arena.y);
            const max = arena.r - this.def.radius - 10;
            if (d > max) {
              x = arena.x + ((x - arena.x) / d) * max;
              y = arena.y + ((y - arena.y) / d) * max;
            }
            this.setPosition(x, y).setAlpha(1);
            return null;
          },
        }, { kind: 'hold', ms: 300 });
        return [];
      case 'orbs':
        this.queue.push({
          kind: 'hold',
          ms: 600,
          onEnd: () => Array.from({ length: spec.count }, (_, i) => ({
            kind: 'orb' as const, x: this.x, y: this.y, angle: toT + (i - (spec.count - 1) / 2) * 0.9, speed: spec.speed, damage: spec.damage, lifeMs: spec.lifeMs,
          })),
        });
        return [];
      case 'slowZone':
        this.queue.push({ kind: 'hold', ms: 500 });
        return [{ kind: 'slowZone', x: this.lastTarget.x, y: this.lastTarget.y, r: spec.r, ms: spec.ms, slow: spec.slow }];
    }
  }

  /** 투사체: 예고선(0.8초)을 먼저 그리고 그 방향 그대로 발사. 예고와 판정 방향이 같다. */
  private fire(toT: number, count: number, spread: number, speed: number, damage: number, size: number, radial: boolean, repeat: number): EnemyAction[] {
    const angles = radial
      ? Array.from({ length: count }, (_, i) => toT + (i * Math.PI * 2) / count)
      : Array.from({ length: count }, (_, i) => (count > 1 ? toT - spread / 2 + (spread * i) / (count - 1) : toT));
    const shots = (): EnemyAction[] => angles.map((angle) => ({ kind: 'shot', x: this.x, y: this.y, angle, speed, damage, size }));
    this.queue.push({ kind: 'hold', ms: TELEGRAPH.projectile, onEnd: shots });
    for (let r = 1; r < repeat; r++) this.queue.push({ kind: 'hold', ms: 450, onEnd: shots });
    return angles.map((a) => this.warnLine(a, 4 * M, TELEGRAPH.projectile, 10 * size));
  }

  private warnLine(angle: number, length: number, ms: number, width: number, curve?: number): EnemyAction {
    return { kind: 'lineWarn', x: this.x, y: this.y, angle, length, ms, width, curve };
  }

  /** 지금 자리에서 angle 방향으로 투기장 벽까지 거리 */
  private rayToWall(angle: number, a: Arena): number {
    const ox = this.x - a.x;
    const oy = this.y - a.y;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const b = ox * dx + oy * dy;
    const c = ox * ox + oy * oy - (a.r - this.def.radius) ** 2;
    return Math.max(0, -b + Math.sqrt(Math.max(0, b * b - c)));
  }

  /** 페이즈 전환 등에서 진행 중인 패턴을 끊는다 */
  resetPattern(cd = 1200): void {
    this.queue = [];
    this.moveLeft = -1;
    this.patternCd = cd;
    this.patternIdx = 0;
    this.setAlpha(1);
    this.refreshTint();
  }

  /** 피해를 받는다. 죽으면 true. */
  hurt(amount: number): boolean {
    this.hp -= amount;
    this.setTint(0xff6b6b);
    this.hitFlash = 80;
    return this.hp <= 0;
  }

  /** 얼음의 심장(장착형 특수 스킬): 드래곤이 거는 모든 둔화 세기 배율. 판 시작 때 게임 장면이 정한다. */
  static slowBoost = 1;

  /** 둔화. 엘리트·보스는 효과 60% 감소(군중제어 저항). */
  slow(ratio: number, ms: number): void {
    const r = Math.min(0.8, ratio * Enemy.slowBoost) * CC[this.def.rank].slowKeep;
    this.slowRatio = Math.max(this.slowLeft > 0 ? this.slowRatio : 0, r);
    this.slowLeft = Math.max(this.slowLeft, ms);
    if (this.hitFlash <= 0) this.refreshTint();
  }

  /** 밀치기. 엘리트는 거리 30%만, 보스는 밀리지 않음. 패턴 중에도 밀리지 않음. */
  knock(dirX: number, dirY: number, speed: number, ms: number): void {
    const keep = CC[this.def.rank].knockKeep;
    if (keep <= 0 || this.queue.length > 0) return;
    this.knockVel.set(dirX, dirY).normalize().scale(speed * keep);
    this.knockLeft = ms;
  }

  burn(perSecCoef: number, ms: number, maxStacks: number): void {
    this.burnPerStack = perSecCoef;
    if (this.burnStacks.length < maxStacks) this.burnStacks.push(ms);
    else {
      const oldest = this.burnStacks.indexOf(Math.min(...this.burnStacks));
      this.burnStacks[oldest] = ms;
    }
    if (this.hitFlash <= 0) this.refreshTint();
  }

  /** 중독: 중첩마다 남은 시간을 따로 들고, 최대치면 가장 오래된 것을 새로 고친다(화상과 같은 방식) */
  poison(perSecCoef: number, ms: number, maxStacks: number): void {
    this.poisonPerStack = perSecCoef;
    if (this.poisonStacks.length < maxStacks) this.poisonStacks.push(ms);
    else {
      const oldest = this.poisonStacks.indexOf(Math.min(...this.poisonStacks));
      this.poisonStacks[oldest] = ms;
    }
    if (this.hitFlash <= 0) this.refreshTint();
  }

  get poisonCount(): number {
    return this.poisonStacks.length;
  }

  tickPoison(delta: number): number {
    if (this.poisonStacks.length === 0) return 0;
    this.poisonTick += delta;
    let coef = 0;
    while (this.poisonTick >= 500) {
      this.poisonTick -= 500;
      coef += this.poisonStacks.length * this.poisonPerStack * 0.5;
    }
    this.poisonStacks = this.poisonStacks.map((t) => t - delta).filter((t) => t > 0);
    if (this.poisonStacks.length === 0) {
      this.poisonTick = 0;
      this.refreshTint();
    }
    return coef;
  }

  /**
   * 빙결·기절. 일반 적만 멈춘다. 엘리트·보스는 무한 정지하지 않도록 멈추지 않고
   * 이동속도 −15%·1초 둔화로 바꾼다(v1.2 QA: 저항을 다시 곱하지 않은 최종값 15%).
   * 둔화는 가장 센 값 하나만 남고, 다시 걸리면 시간만 갱신된다.
   */
  hardCc(kind: 'freeze' | 'stun', ms: number): boolean {
    if (this.def.rank !== 'normal') {
      this.slowRatio = Math.max(this.slowLeft > 0 ? this.slowRatio : 0, HARD_CC_BOSS.slow);
      this.slowLeft = Math.max(this.slowLeft, HARD_CC_BOSS.ms);
      if (this.hitFlash <= 0) this.refreshTint();
      return false;
    }
    this.ccLeft = Math.max(this.ccLeft, ms);
    this.ccKind = kind;
    this.refreshTint();
    return true;
  }

  get frozen(): boolean {
    return this.ccLeft > 0 && this.ccKind === 'freeze';
  }

  get slowed(): boolean {
    return this.slowLeft > 0 || this.ccLeft > 0;
  }

  /** 감전: ms 동안 모든 피해를 mult배 받는다(다시 걸리면 시간 갱신, 배율은 큰 쪽) */
  shock(mult: number, ms: number): void {
    this.vulnMult = Math.max(this.vulnLeft > 0 ? this.vulnMult : 1, mult);
    this.vulnLeft = Math.max(this.vulnLeft, ms);
  }

  get burnCount(): number {
    return this.burnStacks.length;
  }

  tickBurn(delta: number): number {
    if (this.burnStacks.length === 0) return 0;
    this.burnTick += delta;
    let coef = 0;
    while (this.burnTick >= 500) {
      this.burnTick -= 500;
      coef += this.burnStacks.length * this.burnPerStack * 0.5;
    }
    this.burnStacks = this.burnStacks.map((t) => t - delta).filter((t) => t > 0);
    if (this.burnStacks.length === 0) {
      this.burnTick = 0;
      this.refreshTint();
    }
    return coef;
  }

  /** 상태 색: 빙결(하늘색) > 기절(회색) > 얼음(푸른색) > 화상(주황색) > 중독(보라) > 원래 색 */
  private refreshTint(): void {
    if (this.ccLeft > 0 && this.ccKind === 'freeze') this.setTint(0xc9f0ff);
    else if (this.stunned || this.ccLeft > 0) this.setTint(0x9e9e9e);
    else if (this.slowLeft > 0) this.setTint(0x8fd3ff);
    else if (this.burnStacks.length > 0) this.setTint(0xffa64d);
    else if (this.poisonStacks.length > 0) this.setTint(0xb388ff);
    else this.clearTint();
  }
}
