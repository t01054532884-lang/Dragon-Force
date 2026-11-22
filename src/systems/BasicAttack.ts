import Phaser from 'phaser';
import type { Enemy } from '../objects/Enemy';
import { RED_BASIC } from '../data/basicAttack';
import { NO_TRAITS, type BasicLevel, type BasicSpec, type BasicTraits } from '../data/dragons';
export { NO_TRAITS, type BasicTraits };
import type { CombatHost } from './CombatHost';
import { applyPerm, PERM_RULES, ZERO_PERM, type PermState } from '../data/permGrowth';
import { playSfx } from './Sfx';

interface Volley {
  hitUids: Set<number>; // 이 묶음이 이미 맞힌 적(두 번째부터 50%, 화상·중독도 1중첩만)
  index: number; // 몇 번째 공격 주기인지(독구름 등)
}

interface Bullet {
  img: Phaser.GameObjects.Image;
  target: Enemy | null;
  angle: number;
  speed: number;
  homing: number;
  life: number;
  volley: Volley;
  explode: boolean; // 이 탄이 맞으면 폭발
  blast: boolean; // 영구 Lv.40 최종 고유 공격 폭발
  bounceLeft: number;
  pierceLeft: number;
  hitSet: Set<number>; // 이 탄이 이미 꿰뚫은 적
  coef: number;
  child: boolean; // 분열·파편으로 생긴 탄(다시 분열하지 않음)
  tag: string;
  first: boolean; // 묶음의 첫 발(독구름 위치)
  stopTrail?: () => void; // 화염탄 꼬리(연출) 끄기
  /** 스틸 강철 원반: 날아간 거리·되돌아오는 중인지 */
  ret?: { dist: number; traveled: number; back: boolean; mult: number };
}

/** 블룸 씨앗: 심은 자리에서 delay 뒤 터짐 */
interface Seed {
  x: number;
  y: number;
  left: number;
  volley: Volley;
  g: Phaser.GameObjects.Image;
  warn?: Phaser.GameObjects.Arc;
}

/** 하울 음파 고리: 드래곤 둘레로 퍼지며 닿는 적마다 한 번 */
interface Ring {
  r: number;
  max: number;
  delay: number;
  hit: Set<number>;
  n: number; // 이 고리가 맞힌 적 수(하울 특성)
  stun: boolean;
  g: Phaser.GameObjects.Arc | null;
}

/** 블룸 Lv.7 꽃: 드래곤이 닿으면 회복 */
interface Flower {
  x: number;
  y: number;
  left: number;
  g: Phaser.GameObjects.Image;
}

interface Cloud {
  x: number;
  y: number;
  r: number;
  left: number;
  tick: number;
  g: Phaser.GameObjects.Arc;
}

/**
 * 드래곤 10종이 함께 쓰는 기본 공격 엔진(6단계). 드래곤마다 다른 것은 `BasicSpec` 데이터뿐이다.
 * 레드 드래곤은 기존 "추적 화염탄" 구현(기획서 v0.2 의사 코드)과 계산·순서가 똑같다:
 * 쿨다운 → 서로 다른 적 우선 대상 선정 → 대상이 없으면 '준비됨'으로 대기 → 발사 묶음 → 타이머 재설정.
 */
export class BasicAttack {
  private timer = 0;
  private volleyCount = 0;
  private bullets: Bullet[] = [];
  private queued: Bullet[] = []; // 적중 처리 중에 생긴 탄(분열·파편)은 다음 프레임에 합친다
  private clouds: Cloud[] = [];
  private spinImgs: Phaser.GameObjects.Image[] = [];
  private spinAngle = 0;
  private spinHitAt = new Map<number, number>();
  private waveTimer = 0;
  private now = 0;
  private seeds: Seed[] = [];
  private flowers: Flower[] = [];
  private flowerHeals = 0; // 판당 회복 횟수(상한 FLOWER.maxHeals)
  private rings: Ring[] = [];
  private drainUsed = 0; // 크림슨 흡수: 이번 1초 동안 회복한 양(최대 HP 비율)
  private drainClock = 0;

  private cache = new Map<number, BasicLevel>();
  /** 전용 액티브(아케인 마력 폭주)가 잠시 바꾸는 공격 주기 배율 */
  hasteMult = 1;

  constructor(
    private h: CombatHost,
    readonly spec: BasicSpec,
    private traits: BasicTraits = NO_TRAITS,
    /** 영구 레벨 5레벨 단위 고유 성장(v1.2). 영구 Lv.1~4면 ZERO_PERM → 기존과 똑같이 동작 */
    private perm: PermState = ZERO_PERM,
  ) {}

  private get lv(): number {
    return Math.max(1, Math.min(this.spec.levels.length, this.h.level('basic')));
  }

  /** 전투 중 레벨(Lv.1~7) 데이터 + 영구 성장 */
  private get L(): BasicLevel {
    const lv = this.lv;
    let L = this.cache.get(lv);
    if (!L) {
      L = applyPerm(this.spec.levels[lv - 1], this.perm);
      this.cache.set(lv, L);
    }
    return L;
  }

  /**
   * 현재 기본 공격 DPS(단일 대상, 전용 액티브 피해 기준 — v1.3):
   * 공격력 × 한 발 계수 × 레벨 배율 × (1 + 추가 탄 × 같은 묶음 배율) ÷ 공격 주기. 화상·폭발·연쇄 등 부가 효과는 넣지 않는다.
   */
  singleTargetDps(): number {
    const L = this.L;
    const perVolley = L.coef * L.levelMod * (1 + (L.shots - 1) * this.spec.sameVolley) * (L.returning ? 1 + L.returning.mult : 1) * (L.pulse ? L.pulse.layers : 1);
    const sec = (L.interval * this.traits.intervalMult * this.hasteMult) / 1000;
    return (this.h.stats.attack * perVolley) / sec;
  }

  /** 범위형 효과 반경: 마력 확장(전투 중) × 영구 범위 보너스 */
  private area(r: number): number {
    return r * this.h.stats.areaMult * (1 + (this.L.areaBonus ?? 0));
  }

  update(delta: number): void {
    this.now += delta;
    const L = this.L;

    this.timer -= delta;
    if (this.timer <= 0 && (L.pulse || L.melee)) {
      // 하울 음파 고리 · 크림슨 근접 베기: 투사체 없이 드래곤 자리에서. 범위 안에 적이 없으면 준비된 채로 기다린다
      const fired = L.pulse ? this.firePulse(L) : this.fireMelee(L);
      if (!fired) this.timer = 0;
      else this.timer += L.interval * this.traits.intervalMult * this.hasteMult;
    } else if (this.timer <= 0) {
      // 부채꼴 산탄(샌드)은 가장 가까운 적 하나 쪽으로 모든 발을 고르게 벌린다
      const targets = L.spread ? this.selectDistinctFirst(this.spec.range, 1).flatMap((t) => Array.from({ length: L.shots }, () => t)) : this.selectDistinctFirst(this.spec.range, L.shots);
      if (targets.length === 0) {
        this.timer = 0; // 준비된 상태로 기다리다가 적이 사거리에 들어오면 바로 쏜다
      } else {
        this.volleyCount++;
        const volley: Volley = { hitUids: new Set(), index: this.volleyCount };
        const explode = !!L.explodeEvery && this.volleyCount % L.explodeEvery === 0;
        const blast = !!L.blast && this.volleyCount % L.blast.every === 0;
        if (L.seed) targets.forEach((t) => this.plantSeed(t, volley)); // 블룸: 투사체 대신 적 발밑에 씨앗
        else targets.forEach((t, i) => this.spawnBullet(t, volley, explode && i === 0, i, targets, blast && i === 0));
        // 연출: 묶음당 한 번(탄마다 소리를 내지 않음 — 기획 10.1)
        const { x: px, y: py } = this.h.player;
        this.h.onFire?.(Phaser.Math.Angle.Between(px, py, targets[0].x, targets[0].y));
        this.timer += L.interval * this.traits.intervalMult * this.hasteMult; // 넘친 시간을 버리지 않고 이어 간다
      }
    }
    this.updateBullets(delta);
    if (this.queued.length) {
      this.bullets.push(...this.queued);
      this.queued = [];
    }
    this.updateClouds(delta);
    this.updateSpin(delta);
    this.updateWave(delta);
    this.updateSeeds(delta);
    this.updateFlowers(delta);
    this.updateRings(delta);
    this.drainClock += delta;
    if (this.drainClock >= 1000) {
      this.drainClock -= 1000;
      this.drainUsed = 0;
    }
  }

  /** 거리 우선, 같은 거리면 먼저 나온 적. 서로 다른 적을 먼저 배정하고 모자라면 같은 적에 다시 배정. */
  private selectDistinctFirst(range: number, count: number): Enemy[] {
    const { x, y } = this.h.player;
    const inRange = this.h
      .enemies()
      .filter((e) => e.active)
      .map((e) => ({ e, d: Phaser.Math.Distance.Between(x, y, e.x, e.y) }))
      .filter((o) => o.d <= range)
      .sort((a, b) => a.d - b.d || a.e.uid - b.e.uid)
      .map((o) => o.e);
    if (inRange.length === 0) return [];
    return Array.from({ length: count }, (_, i) => inRange[i % inRange.length]);
  }

  private spawnBullet(target: Enemy, volley: Volley, explode: boolean, index: number, all: Enemy[], blast = false): void {
    const L = this.L;
    const { x, y } = this.h.player;
    const total = all.length;
    let spread: number;
    if (L.homing > 0) {
      // 추적탄: 여러 발이면 살짝 벌려서 쏘고 각자 대상에게 휘어 들어간다(레드 기존 방식)
      spread = total > 1 ? (index - (total - 1) / 2) * 0.35 : 0;
    } else {
      // 직선탄: 서로 다른 적이면 정조준, 같은 적에 여러 발이면 그 적의 몸 폭 안에서 살짝 벌린다(모두 맞을 수 있게)
      const same = all.filter((e) => e === target).length;
      const k = all.slice(0, index).filter((e) => e === target).length;
      const dist = Math.max(40, Phaser.Math.Distance.Between(x, y, target.x, target.y));
      const step = Math.min(0.22, Math.atan((target.def.radius * 0.6) / dist));
      spread = same > 1 ? (k - (same - 1) / 2) * step : 0;
    }
    if (L.spread && total > 1) spread = (index - (total - 1) / 2) * (L.spread / (total - 1)); // 샌드: 부채꼴로 고르게
    const angle = Phaser.Math.Angle.Between(x, y, target.x, target.y) + spread;
    const img = this.h.scene.add.image(x, y, this.spec.texture).setDepth(9).setRotation(angle).setScale((explode ? 1.6 : 1) * L.scale);
    this.bullets.push({
      img, target, angle, speed: L.speed, homing: L.homing, life: this.spec.life, volley, explode, blast, bounceLeft: L.bounce ?? 0,
      pierceLeft: L.pierce, hitSet: new Set(), coef: L.coef, child: false, tag: 'basic', first: index === 0,
      // 레드 화염탄: 밝은 중심 + 짧은 꼬리(기획 7.2). 다른 드래곤은 확장 단계에서 속성 색으로
      stopTrail: this.spec.texture === 'fireball' ? this.h.fx?.trail(img) : undefined,
      ret: L.returning ? { dist: L.returning.dist, traveled: 0, back: false, mult: L.returning.mult } : undefined,
    });
  }

  private updateBullets(delta: number): void {
    const dt = delta / 1000;
    const enemies = this.h.enemies().filter((e) => e.active);

    this.bullets = this.bullets.filter((b) => {
      b.life -= delta;
      if (b.homing > 0) {
        // 대상이 죽었으면 반경 3m 안에서 새 대상을 찾고, 없으면 사라진다(추적탄)
        if (!b.target || !b.target.active || b.hitSet.has(b.target.uid)) {
          b.target = this.nearestTo(b.img.x, b.img.y, this.spec.retarget, enemies, b.hitSet);
          if (!b.target) return this.kill(b);
        }
        const want = Phaser.Math.Angle.Between(b.img.x, b.img.y, b.target.x, b.target.y);
        b.angle = Phaser.Math.Angle.RotateTo(b.angle, want, b.homing * dt);
        b.img.setRotation(b.angle);
      }
      if (b.ret) {
        // 강철 원반: dist만큼 날아가면 돌아서서 드래곤을 쫓아온다. 돌아올 때는 같은 적을 다시 맞힐 수 있다(새 묶음, ×mult)
        b.ret.traveled += b.speed * dt;
        if (!b.ret.back && b.ret.traveled >= b.ret.dist) {
          b.ret.back = true;
          b.hitSet.clear();
          b.volley = { hitUids: new Set(), index: b.volley.index };
          b.coef *= b.ret.mult;
          b.tag = 'basic-return';
        }
        if (b.ret.back) {
          const { x: px, y: py } = this.h.player;
          b.angle = Phaser.Math.Angle.Between(b.img.x, b.img.y, px, py);
          if (Phaser.Math.Distance.Between(b.img.x, b.img.y, px, py) < 26) return this.kill(b);
        }
        b.img.rotation += 14 * dt; // 회전하는 원반
      }
      b.img.x += Math.cos(b.angle) * b.speed * dt;
      b.img.y += Math.sin(b.angle) * b.speed * dt;

      const r = 9 * (b.child ? 0.8 : this.L.scale);
      const hit = enemies.find((e) => e.active && !b.hitSet.has(e.uid) && Phaser.Math.Distance.Between(b.img.x, b.img.y, e.x, e.y) < e.def.radius + r);
      if (hit) {
        b.hitSet.add(hit.uid);
        this.onHit(b, hit, enemies);
        if (b.pierceLeft-- > 0) return true; // 관통: 계속 날아간다
        if (b.bounceLeft > 0) {
          // 튕김(영구 성장): 맞힌 자리에서 3.5m 안의 맞히지 않은 적에게 방향을 바꾼다. 관통 다음, 연쇄(적중 처리 안)보다 뒤.
          const next = this.nearestTo(b.img.x, b.img.y, PERM_RULES.bounceRange, enemies, b.hitSet);
          if (next) {
            b.bounceLeft--;
            if (this.L.bounceFalloff !== undefined) {
              b.coef *= 1 - this.L.bounceFalloff; // 미러: 튕길 때마다 −15%(Lv.7 0)
              b.tag = 'basic-bounce';
            }
            b.target = next;
            b.angle = Phaser.Math.Angle.Between(b.img.x, b.img.y, next.x, next.y);
            b.img.setRotation(b.angle);
            b.life = Math.max(b.life, 600);
            return true;
          }
        }
        return this.kill(b);
      }
      if (b.life <= 0) return this.kill(b);
      return true;
    });
  }

  /** 투사체 적중: 상태이상 → 피해 → 폭발·충격파 → 연쇄 → 분열 */
  private onHit(b: Bullet, e: Enemy, enemies: Enemy[]): void {
    const L = this.L;
    const repeat = b.volley.hitUids.has(e.uid);
    const same = repeat ? this.spec.sameVolley : 1;
    b.volley.hitUids.add(e.uid);
    if (!b.child) {
      if (L.burn && !repeat) e.burn(RED_BASIC.burn.perSec * (L.burnMult ?? 1), RED_BASIC.burn.ms, RED_BASIC.burn.maxStacks);
      this.applyStatus(e, L, repeat, b.angle);
    }
    const ex = e.x;
    const ey = e.y;
    this.h.hit(e, { source: 'basic', coef: b.coef, levelMod: L.levelMod, sameVolley: same, tag: b.tag });
    if (b.explode && L.explosion) this.explode(ex, ey, L.explosion.radius, L.explosion.coef, L.explosion.color, enemies);
    if (b.blast && L.blast) {
      b.blast = false;
      this.explode(ex, ey, L.blast.radius, L.blast.coef, L.blast.color, enemies, 'basic-blast', undefined, L.blast.status ? L : undefined);
    }
    if (b.child) return;
    if (L.splash) this.splash(ex, ey, e, L, enemies);
    if (L.chain > 0) this.chain(e, L, enemies);
    if (L.split) this.split(b, ex, ey, e, L, enemies);
    if (L.cloud && b.first && b.volley.index % L.cloud.every === 0 && !repeat) this.addCloud(ex, ey, L.cloud.radius, L.cloud.ms);
  }

  private applyStatus(e: Enemy, L: BasicLevel, repeat: boolean, angle: number): void {
    if (L.slow) e.slow(L.slow.ratio, L.slow.ms * this.traits.slowDurMult);
    if (L.weaken) e.weaken(L.weaken.ratio, L.weaken.ms);
    if (L.root) e.root(L.root);
    if (L.poison && !repeat) e.poison(L.poison.perSec, L.poison.ms * this.traits.poisonDurMult, L.poison.maxStacks);
    if (L.shock) e.shock(L.shock.mult, L.shock.ms);
    if (L.knock) e.knock(Math.cos(angle), Math.sin(angle), L.knock.speed, L.knock.ms);
    if (L.stun && Math.random() < L.stun.chance) e.hardCc('stun', L.stun.ms);
    if (L.freeze && Math.random() < L.freeze.chance) {
      const froze = e.hardCc('freeze', L.freeze.ms);
      if (L.freeze.burst && (froze || e.rank !== 'normal')) {
        const all = this.h.enemies().filter((o) => o.active);
        this.explode(e.x, e.y, L.freeze.burst.radius, L.freeze.burst.coef, 0x9be7ff, all, 'basic-freeze', L.slow);
      }
      if (L.freezeShards && (froze || e.rank !== 'normal')) this.shards(e, L.freezeShards.count, L.freezeShards.coef, 'basic-freeze-shard');
    }
  }

  private explode(
    x: number, y: number, radius: number, coef: number, color: number, enemies: Enemy[],
    tag = 'basic-explosion', slow?: { ratio: number; ms: number }, status?: BasicLevel,
  ): void {
    const r = this.area(radius); // 범위형 기본공격이라 마력 확장 적용
    for (const e of enemies) {
      if (e.active && Phaser.Math.Distance.Between(x, y, e.x, e.y) < r + e.def.radius) {
        if (slow) e.slow(slow.ratio, slow.ms * this.traits.slowDurMult);
        if (status) {
          // 최종 고유 공격: 드래곤 속성 상태이상을 함께(확률형 빙결·기절은 제외)
          if (status.burn) e.burn(RED_BASIC.burn.perSec * (status.burnMult ?? 1), RED_BASIC.burn.ms, RED_BASIC.burn.maxStacks);
          if (status.slow) e.slow(status.slow.ratio, status.slow.ms * this.traits.slowDurMult);
          if (status.poison) e.poison(status.poison.perSec, status.poison.ms * this.traits.poisonDurMult, status.poison.maxStacks);
          if (status.shock) e.shock(status.shock.mult, status.shock.ms);
          if (status.knock) e.knock(e.x - x || 1, e.y - y, status.knock.speed, status.knock.ms);
          if (status.weaken) e.weaken(status.weaken.ratio, status.weaken.ms);
          if (status.root) e.root(status.root);
        }
        this.h.hit(e, { source: 'basic', coef, tag });
      }
    }
    this.h.fx?.explode(x, y, r, color); // 연출: 실제 반지름 r까지만
    playSfx(this.h.scene, 'sfx-explode');
    const boom = this.h.scene.add.circle(x, y, r, color, 0.55).setDepth(8);
    this.h.scene.tweens.add({ targets: boom, alpha: 0, scale: 1.2, duration: 300, onComplete: () => boom.destroy() });
  }

  /** 적중 지점 주변의 다른 적에게 피해(물보라·바위 파편·충격파) */
  private splash(x: number, y: number, main: Enemy, L: BasicLevel, enemies: Enemy[]): void {
    const s = L.splash!;
    const r = this.area(s.radius);
    for (const e of enemies) {
      if (e === main || !e.active) continue;
      const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
      if (d >= r + e.def.radius) continue;
      if (L.slow) e.slow(L.slow.ratio, L.slow.ms * this.traits.slowDurMult);
      if (s.knock) e.knock(e.x - x || 1, e.y - y, s.knock, 150);
      this.h.hit(e, { source: 'basic', coef: s.coef, tag: 'basic-splash' });
    }
    const c = this.h.scene.add.circle(x, y, r, this.tint(), 0.25).setStrokeStyle(3, this.tint(), 0.7).setDepth(8);
    this.h.scene.tweens.add({ targets: c, alpha: 0, scale: 1.15, duration: 250, onComplete: () => c.destroy() });
  }

  /** 번개 연쇄: 가까운 다른 적으로 튄다. 튈 때마다 피해 감소(옐로 특성이 감소율을 줄임) */
  private chain(from: Enemy, L: BasicLevel, enemies: Enemy[]): void {
    const hit = new Set<number>([from.uid]);
    const falloff = this.spec.chainFalloff * Math.max(0, 1 - this.traits.chainRelief);
    const range = this.spec.chainRange * (1 + (L.areaBonus ?? 0));
    let cur = { x: from.x, y: from.y };
    const g = this.h.scene.add.graphics().setDepth(9);
    g.lineStyle(3, 0xfff59d, 0.9);
    const times = L.chain + this.traits.extraChain;
    for (let k = 1; k <= times; k++) {
      const next = this.nearestTo(cur.x, cur.y, range, enemies.filter((e) => e.active), hit);
      if (!next) break;
      hit.add(next.uid);
      g.lineBetween(cur.x, cur.y, next.x, next.y);
      cur = { x: next.x, y: next.y };
      if (L.shock) next.shock(L.shock.mult, L.shock.ms);
      this.h.hit(next, { source: 'basic', coef: L.coef * Math.pow(1 - falloff, k), levelMod: L.levelMod, tag: 'basic-chain' });
    }
    this.h.scene.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
  }

  /** 분열: 적중 지점에서 작은 탄이 갈라져 나간다(같은 묶음이라 같은 적을 다시 맞히면 50%) */
  private split(b: Bullet, x: number, y: number, main: Enemy, L: BasicLevel, enemies: Enemy[]): void {
    const s = L.split!;
    for (let i = 0; i < s.count; i++) {
      const angle = b.angle + (i - (s.count - 1) / 2) * 1.0;
      const others = enemies.filter((e) => e.active && e !== main);
      const target = s.homing > 0 ? this.nearestTo(x, y, this.spec.range, others, new Set([main.uid])) : null;
      const img = this.h.scene.add.image(x, y, this.spec.texture).setDepth(9).setScale(0.6).setRotation(angle);
      this.queued.push({
        img, target, angle, speed: L.speed * 0.9, homing: s.homing, life: 900, volley: b.volley, explode: false, blast: false, bounceLeft: 0,
        pierceLeft: 0, hitSet: new Set([main.uid]), coef: s.coef, child: true, tag: 'basic-split', first: false,
      });
    }
  }

  /** 게임 장면이 알려 주는 적의 죽음(처치 회복·파편·독 폭발) */
  onKill(e: Enemy, byBasic: boolean): void {
    const L = this.L;
    if (byBasic && this.traits.killHealChance > 0) {
      // 기본 2%(Lv.5부터 4%) × 별 등급 특성 강화 배율
      const chance = (L.healChance ?? BASE_HEAL) * (this.traits.killHealChance / BASE_HEAL) + this.traits.healAdd;
      if (Math.random() < chance) this.h.heal?.(this.traits.killHealPct);
    }
    if (byBasic && L.shardsOnKill) this.shards(e, L.shardsOnKill.count, L.shardsOnKill.coef, 'basic-shard');
    if (L.poisonBurst && e.poisonCount > 0 && L.poison) {
      const r = this.area(L.poisonBurst.radius);
      const p = L.poison;
      // 독 폭발: 죽는 적 주변에 피해 + 중독 전염(연쇄 폭발이 무한히 이어지지 않도록 다음 프레임에 처리)
      this.h.scene.time.delayedCall(0, () => {
        for (const o of this.h.enemies()) {
          if (!o.active || Phaser.Math.Distance.Between(e.x, e.y, o.x, o.y) >= r + o.def.radius) continue;
          o.poison(p.perSec, p.ms * this.traits.poisonDurMult, p.maxStacks);
          this.h.hit(o, { source: 'basic', coef: L.poisonBurst!.coef, tag: 'basic-poison-burst' });
        }
      });
      const c = this.h.scene.add.circle(e.x, e.y, r, 0x9c27b0, 0.45).setDepth(8);
      this.h.scene.tweens.add({ targets: c, alpha: 0, scale: 1.2, duration: 300, onComplete: () => c.destroy() });
    }
  }

  /** 적 자리에서 사방으로 흩어지는 작은 탄(처치 파편·빙결 파편) */
  private shards(e: Enemy, count: number, coef: number, tag: string): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const img = this.h.scene.add.image(e.x, e.y, this.spec.texture).setDepth(9).setScale(0.6).setRotation(angle);
      this.queued.push({
        img, target: null, angle, speed: 520, homing: 0, life: 600, volley: { hitUids: new Set(), index: 0 }, explode: false, blast: false, bounceLeft: 0,
        pierceLeft: 0, hitSet: new Set([e.uid]), coef, child: true, tag, first: false,
      });
    }
  }

  // ───────── 독구름 ─────────
  private addCloud(x: number, y: number, radius: number, ms: number): void {
    const r = this.area(radius);
    const g = this.h.scene.add.circle(x, y, r, 0x7cb342, 0.28).setStrokeStyle(3, 0xa35cff, 0.5).setDepth(3);
    this.clouds.push({ x, y, r, left: ms, tick: 0, g });
  }

  private updateClouds(delta: number): void {
    const L = this.L;
    this.clouds = this.clouds.filter((c) => {
      c.left -= delta;
      c.tick += delta;
      if (c.tick >= 500 && L.poison) {
        c.tick -= 500;
        for (const e of this.h.enemies()) {
          if (e.active && Phaser.Math.Distance.Between(c.x, c.y, e.x, e.y) < c.r + e.def.radius) {
            e.poison(L.poison.perSec, L.poison.ms * this.traits.poisonDurMult, L.poison.maxStacks);
          }
        }
      }
      if (c.left <= 0) {
        c.g.destroy();
        return false;
      }
      c.g.setAlpha(Math.min(1, c.left / 400));
      return true;
    });
  }

  // ───────── 회전 칼날(윈드 Lv.7) ─────────
  private updateSpin(delta: number): void {
    const s = this.L.spin;
    if (!s) return;
    while (this.spinImgs.length < s.count) this.spinImgs.push(this.h.scene.add.image(0, 0, this.spec.texture).setDepth(9).setScale(1.3));
    this.spinAngle += s.speed * (delta / 1000);
    const r = this.area(s.radius);
    const { x, y } = this.h.player;
    this.spinImgs.forEach((img, i) => {
      const a = this.spinAngle + (i / s.count) * Math.PI * 2;
      img.setPosition(x + Math.cos(a) * r, y + Math.sin(a) * r).setRotation(a + Math.PI / 2);
      for (const e of this.h.enemies()) {
        if (!e.active || Phaser.Math.Distance.Between(img.x, img.y, e.x, e.y) >= e.def.radius + 14) continue;
        const last = this.spinHitAt.get(e.uid) ?? -Infinity;
        if (this.now - last < 500) continue; // 같은 적은 0.5초에 한 번
        this.spinHitAt.set(e.uid, this.now);
        this.h.hit(e, { source: 'basic', coef: s.coef, levelMod: this.L.levelMod, tag: 'basic-spin' });
      }
    });
  }

  // ───────── 파도(워터 Lv.7) ─────────
  private updateWave(delta: number): void {
    const L = this.L;
    const w = L.wave;
    if (!w) return;
    this.waveTimer -= delta;
    if (this.waveTimer > 0) return;
    const { x, y } = this.h.player;
    const r = this.area(w.radius);
    const near = this.h.enemies().filter((e) => e.active && Phaser.Math.Distance.Between(x, y, e.x, e.y) < r + e.def.radius);
    if (near.length === 0) {
      this.waveTimer = 0;
      return;
    }
    this.waveTimer += w.every * this.traits.intervalMult;
    for (const e of near) {
      if (L.slow) e.slow(L.slow.ratio, L.slow.ms * this.traits.slowDurMult);
      e.knock(e.x - x || 1, e.y - y, 420, 180);
      this.h.hit(e, { source: 'basic', coef: w.coef, levelMod: L.levelMod, tag: 'basic-wave' });
    }
    const ring = this.h.scene.add.circle(x, y, 20).setStrokeStyle(10, 0x4fc3f7, 0.8).setDepth(8);
    this.h.scene.tweens.add({ targets: ring, radius: r, alpha: 0.1, duration: 350, onComplete: () => ring.destroy() });
  }

  // ───────── 음파 고리(하울) ─────────
  private firePulse(L: BasicLevel): boolean {
    const p = L.pulse!;
    const max = this.area(p.radius);
    const { x, y } = this.h.player;
    if (!this.h.enemies().some((e) => e.active && Phaser.Math.Distance.Between(x, y, e.x, e.y) < max + e.def.radius)) return false;
    this.volleyCount++;
    const stun = !!p.stunEvery && this.volleyCount % p.stunEvery === 0;
    for (let k = 0; k < p.layers; k++) this.rings.push({ r: 0, max, delay: k * 160, hit: new Set(), n: 0, stun, g: null });
    this.h.onFire?.(0);
    return true;
  }

  private updateRings(delta: number): void {
    if (!this.rings.length) return;
    const L = this.L;
    const { x, y } = this.h.player;
    const speed = 1 / 0.4; // 0.4초에 끝까지
    this.rings = this.rings.filter((rg) => {
      if (rg.delay > 0) {
        rg.delay -= delta;
        return true;
      }
      if (!rg.g) rg.g = this.h.scene.add.circle(x, y, 10).setStrokeStyle(6, 0x8fa8ff, 0.85).setDepth(8);
      rg.r = Math.min(rg.max, rg.r + rg.max * speed * (delta / 1000));
      rg.g.setPosition(x, y).setRadius(rg.r).setAlpha(1 - (rg.r / rg.max) * 0.6);
      for (const e of this.h.enemies()) {
        if (!e.active || rg.hit.has(e.uid) || Phaser.Math.Distance.Between(x, y, e.x, e.y) > rg.r + e.def.radius) continue;
        rg.hit.add(e.uid);
        // 하울 특성(공명): 이 고리가 이미 맞힌 적 1마리당 +x(최대 10마리분)
        const bonus = 1 + Math.min(10, rg.n) * (this.traits.ringBonus ?? 0);
        rg.n++;
        if (rg.stun) e.hardCc('stun', L.pulse?.stunMs ?? 500);
        // 고리는 보스·엘리트를 한 번만 지나가므로 ×1.6(봇 측정 10단계: 보스를 못 잡고 시간 초과)
        this.h.hit(e, { source: 'basic', coef: L.coef * bonus * (e.rank === 'normal' ? 1 : 1.6), levelMod: L.levelMod, tag: 'basic-ring' });
      }
      if (rg.r >= rg.max) {
        rg.g.destroy();
        return false;
      }
      return true;
    });
  }

  // ───────── 근접 베기(크림슨) ─────────
  private fireMelee(L: BasicLevel): boolean {
    const m = L.melee!;
    const range = this.area(m.range);
    const target = this.selectDistinctFirst(range, 1)[0];
    if (!target) return false;
    this.volleyCount++;
    const { x, y } = this.h.player;
    const spin = !!m.spinEvery && this.volleyCount % m.spinEvery === 0;
    const ang = Phaser.Math.Angle.Between(x, y, target.x, target.y);
    const dirs = spin ? [] : m.back ? [ang, ang + Math.PI] : [ang];
    const g = this.h.scene.add.graphics().setDepth(8);
    g.fillStyle(0xc2185b, 0.35).lineStyle(5, 0xff5c7a, 0.9);
    if (spin) g.strokeCircle(x, y, range).fillCircle(x, y, range);
    for (const a of dirs) g.slice(x, y, range, a - m.arc / 2, a + m.arc / 2).fillPath().strokePath();
    this.h.scene.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
    for (const e of this.h.enemies()) {
      if (!e.active) continue;
      const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
      if (d > range + e.def.radius) continue;
      const ea = Phaser.Math.Angle.Between(x, y, e.x, e.y);
      if (!spin && !dirs.some((a) => Math.abs(Phaser.Math.Angle.Wrap(ea - a)) <= m.arc / 2 + Math.atan2(e.def.radius, Math.max(1, d)))) continue;
      const coef = L.coef * (spin ? 1.5 : 1);
      this.h.hit(e, { source: 'basic', coef, levelMod: L.levelMod, tag: 'basic-melee' });
      this.drain(coef * L.levelMod);
    }
    this.h.onFire?.(ang);
    return true;
  }

  /** 크림슨 흡수: 기본 공격 피해(공격력 × 계수, 치명타 제외 어림값)의 x만큼 회복, 1초에 최대 HP 1%까지 */
  private drain(coef: number): void {
    const k = this.traits.drain ?? 0;
    if (k <= 0 || this.drainUsed >= 0.01) return;
    const pct = Math.min(0.01 - this.drainUsed, (this.h.stats.attack * coef * k) / Math.max(1, this.h.stats.maxHp));
    this.drainUsed += pct;
    this.h.heal?.(pct);
  }

  // ───────── 씨앗 폭탄(블룸) ─────────
  private plantSeed(target: Enemy, volley: Volley): void {
    const delay = this.L.seed!.delay;
    const g = this.h.scene.add.image(target.x, target.y, this.spec.texture).setDepth(4).setScale(0.6);
    this.h.scene.tweens.add({ targets: g, scale: 1.4, angle: 180, duration: delay, ease: 'Quad.In' });
    // 터질 범위를 미리 보여 주는 분홍 테두리(자라면서 점점 진해짐)
    const r = this.area(this.L.seed!.radius);
    const warn = this.h.scene.add.circle(target.x, target.y, r).setStrokeStyle(3, 0xf48fb1, 0.25).setDepth(3.5);
    this.h.scene.tweens.add({ targets: warn, alpha: { from: 0.3, to: 1 }, duration: delay });
    this.seeds.push({ x: target.x, y: target.y, left: delay, volley, g, warn });
  }

  /** 블룸 꽃 폭발 연출: 섬광 + 두 겹 고리 + 사방으로 흩날리는 꽃잎 */
  private bloomBurst(x: number, y: number, r: number): void {
    const sc = this.h.scene;
    const flash = sc.add.circle(x, y, r * 0.5, 0xfff0f6, 0.85).setDepth(8.5);
    sc.tweens.add({ targets: flash, scale: 2, alpha: 0, duration: 220, onComplete: () => flash.destroy() });
    const fill = sc.add.circle(x, y, r, 0x9ccc65, 0.3).setStrokeStyle(6, 0xf48fb1, 0.95).setDepth(8);
    sc.tweens.add({ targets: fill, alpha: 0, scale: 1.12, duration: 360, onComplete: () => fill.destroy() });
    const ring = sc.add.circle(x, y, r * 0.4).setStrokeStyle(5, 0xffffff, 0.8).setDepth(8.2);
    sc.tweens.add({ targets: ring, radius: r * 1.05, alpha: 0, duration: 320, onComplete: () => ring.destroy() });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
      const pet = sc.add.ellipse(x, y, 16, 9, i % 3 === 0 ? 0x9ccc65 : 0xf48fb1, 0.95).setRotation(a).setDepth(8.3);
      sc.tweens.add({ targets: pet, x: x + Math.cos(a) * r * 1.1, y: y + Math.sin(a) * r * 1.1, angle: pet.angle + 200, alpha: 0, scale: 0.6, duration: 420 + Math.random() * 120, ease: 'Quad.Out', onComplete: () => pet.destroy() });
    }
  }

  private updateSeeds(delta: number): void {
    if (!this.seeds.length) return;
    const L = this.L;
    this.seeds = this.seeds.filter((sd) => {
      sd.left -= delta;
      if (sd.left > 0) return true;
      sd.g.destroy();
      sd.warn?.destroy();
      const r = this.area(L.seed?.radius ?? 1.3 * 50);
      for (const e of this.h.enemies()) {
        if (!e.active || Phaser.Math.Distance.Between(sd.x, sd.y, e.x, e.y) >= r + e.def.radius) continue;
        // 같은 묶음의 씨앗이 같은 적을 또 맞히면 50%(다른 드래곤의 여러 발과 같은 규칙)
        const repeat = sd.volley.hitUids.has(e.uid);
        sd.volley.hitUids.add(e.uid);
        this.applyStatus(e, L, repeat, 0);
        this.h.hit(e, { source: 'basic', coef: L.coef, levelMod: L.levelMod, sameVolley: repeat ? this.spec.sameVolley : 1, tag: 'basic-seed' });
      }
      this.bloomBurst(sd.x, sd.y, r);
      if (L.seed?.flower && this.flowerHeals < FLOWER.maxHeals) {
        const f = this.h.scene.add.image(sd.x, sd.y, 'bolt-seed').setDepth(4).setScale(1.4).setTint(0xf8bbd0);
        this.flowers.push({ x: sd.x, y: sd.y, left: FLOWER.ms, g: f });
      }
      return false;
    });
  }

  private updateFlowers(delta: number): void {
    if (!this.flowers.length) return;
    const { x, y } = this.h.player;
    this.flowers = this.flowers.filter((f) => {
      f.left -= delta;
      if (f.left > 0 && this.flowerHeals < FLOWER.maxHeals && Phaser.Math.Distance.Between(x, y, f.x, f.y) < FLOWER.touch) {
        this.flowerHeals++;
        this.h.heal?.(FLOWER.healPct);
        f.left = 0;
      }
      if (f.left <= 0) {
        f.g.destroy();
        return false;
      }
      return true;
    });
  }

  private tint(): number {
    return { 'bolt-water': 0x4fc3f7, 'bolt-rock': 0xb08d57 }[this.spec.texture] ?? 0xffffff;
  }

  private nearestTo(x: number, y: number, maxD: number, enemies: Enemy[], skip?: Set<number>): Enemy | null {
    let best: Enemy | null = null;
    let bestD = maxD;
    for (const e of enemies) {
      if (skip?.has(e.uid)) continue;
      const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
      if (d < bestD || (d === bestD && best && e.uid < best.uid)) {
        best = e;
        bestD = d;
      }
    }
    return best;
  }

  private kill(b: Bullet): false {
    b.stopTrail?.();
    b.img.destroy();
    return false;
  }

  /** 판이 끝날 때 남은 그림 정리 */
  destroy(): void {
    [...this.bullets, ...this.queued].forEach((b) => (b.stopTrail?.(), b.img.destroy()));
    this.clouds.forEach((c) => c.g.destroy());
    this.spinImgs.forEach((i) => i.destroy());
    this.seeds.forEach((sd) => (sd.g.destroy(), sd.warn?.destroy()));
    this.rings.forEach((rg) => rg.g?.destroy());
    this.rings = [];
    this.flowers.forEach((f) => f.g.destroy());
    this.seeds = [];
    this.flowers = [];
    this.bullets = [];
    this.queued = [];
    this.clouds = [];
    this.spinImgs = [];
  }
}

const BASE_HEAL = 0.02;
/** 블룸 Lv.7 꽃(AI 1차안): 3초, 닿으면 최대 HP 1%, 판당 20회 */
const FLOWER = { ms: 3000, healPct: 0.01, maxHeals: 20, touch: 40 };
