import Phaser from 'phaser';
import type { Enemy } from '../objects/Enemy';
import { RED_BASIC } from '../data/basicAttack';
import { NO_TRAITS, type BasicLevel, type BasicSpec, type BasicTraits } from '../data/dragons';
export { NO_TRAITS, type BasicTraits };
import type { CombatHost } from './CombatHost';

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
  pierceLeft: number;
  hitSet: Set<number>; // 이 탄이 이미 꿰뚫은 적
  coef: number;
  child: boolean; // 분열·파편으로 생긴 탄(다시 분열하지 않음)
  tag: string;
  first: boolean; // 묶음의 첫 발(독구름 위치)
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

  constructor(
    private h: CombatHost,
    readonly spec: BasicSpec,
    private traits: BasicTraits = NO_TRAITS,
  ) {}

  private get lv(): number {
    return Math.max(1, Math.min(this.spec.levels.length, this.h.level('basic')));
  }

  private get L(): BasicLevel {
    return this.spec.levels[this.lv - 1];
  }

  update(delta: number): void {
    this.now += delta;
    const L = this.L;

    this.timer -= delta;
    if (this.timer <= 0) {
      const targets = this.selectDistinctFirst(this.spec.range, L.shots);
      if (targets.length === 0) {
        this.timer = 0; // 준비된 상태로 기다리다가 적이 사거리에 들어오면 바로 쏜다
      } else {
        this.volleyCount++;
        const volley: Volley = { hitUids: new Set(), index: this.volleyCount };
        const explode = !!L.explodeEvery && this.volleyCount % L.explodeEvery === 0;
        targets.forEach((t, i) => this.spawnBullet(t, volley, explode && i === 0, i, targets));
        this.timer += L.interval * this.traits.intervalMult; // 넘친 시간을 버리지 않고 이어 간다
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

  private spawnBullet(target: Enemy, volley: Volley, explode: boolean, index: number, all: Enemy[]): void {
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
    const angle = Phaser.Math.Angle.Between(x, y, target.x, target.y) + spread;
    const img = this.h.scene.add.image(x, y, this.spec.texture).setDepth(9).setRotation(angle).setScale((explode ? 1.6 : 1) * L.scale);
    this.bullets.push({
      img, target, angle, speed: L.speed, homing: L.homing, life: this.spec.life, volley, explode,
      pierceLeft: L.pierce, hitSet: new Set(), coef: L.coef, child: false, tag: 'basic', first: index === 0,
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
      b.img.x += Math.cos(b.angle) * b.speed * dt;
      b.img.y += Math.sin(b.angle) * b.speed * dt;

      const r = 9 * (b.child ? 0.8 : this.L.scale);
      const hit = enemies.find((e) => e.active && !b.hitSet.has(e.uid) && Phaser.Math.Distance.Between(b.img.x, b.img.y, e.x, e.y) < e.def.radius + r);
      if (hit) {
        b.hitSet.add(hit.uid);
        this.onHit(b, hit, enemies);
        if (b.pierceLeft-- > 0) return true; // 관통: 계속 날아간다
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
      if (L.burn && !repeat) e.burn(RED_BASIC.burn.perSec, RED_BASIC.burn.ms, RED_BASIC.burn.maxStacks);
      this.applyStatus(e, L, repeat, b.angle);
    }
    const ex = e.x;
    const ey = e.y;
    this.h.hit(e, { source: 'basic', coef: b.coef, levelMod: L.levelMod, sameVolley: same, tag: b.tag });
    if (b.explode && L.explosion) this.explode(ex, ey, L.explosion.radius, L.explosion.coef, L.explosion.color, enemies);
    if (b.child) return;
    if (L.splash) this.splash(ex, ey, e, L, enemies);
    if (L.chain > 0) this.chain(e, L, enemies);
    if (L.split) this.split(b, ex, ey, e, L, enemies);
    if (L.cloud && b.first && b.volley.index % L.cloud.every === 0 && !repeat) this.addCloud(ex, ey, L.cloud.radius, L.cloud.ms);
  }

  private applyStatus(e: Enemy, L: BasicLevel, repeat: boolean, angle: number): void {
    if (L.slow) e.slow(L.slow.ratio, L.slow.ms * this.traits.slowDurMult);
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
    }
  }

  private explode(x: number, y: number, radius: number, coef: number, color: number, enemies: Enemy[], tag = 'basic-explosion', slow?: { ratio: number; ms: number }): void {
    const r = radius * this.h.stats.areaMult; // 범위형 기본공격이라 마력 확장 적용
    for (const e of enemies) {
      if (e.active && Phaser.Math.Distance.Between(x, y, e.x, e.y) < r + e.def.radius) {
        if (slow) e.slow(slow.ratio, slow.ms * this.traits.slowDurMult);
        this.h.hit(e, { source: 'basic', coef, tag });
      }
    }
    const boom = this.h.scene.add.circle(x, y, r, color, 0.55).setDepth(8);
    this.h.scene.tweens.add({ targets: boom, alpha: 0, scale: 1.2, duration: 300, onComplete: () => boom.destroy() });
  }

  /** 적중 지점 주변의 다른 적에게 피해(물보라·바위 파편·충격파) */
  private splash(x: number, y: number, main: Enemy, L: BasicLevel, enemies: Enemy[]): void {
    const s = L.splash!;
    const r = s.radius * this.h.stats.areaMult;
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
    const falloff = this.spec.chainFalloff * (1 - this.traits.chainRelief);
    let cur = { x: from.x, y: from.y };
    const g = this.h.scene.add.graphics().setDepth(9);
    g.lineStyle(3, 0xfff59d, 0.9);
    for (let k = 1; k <= L.chain; k++) {
      const next = this.nearestTo(cur.x, cur.y, this.spec.chainRange, enemies.filter((e) => e.active), hit);
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
        img, target, angle, speed: L.speed * 0.9, homing: s.homing, life: 900, volley: b.volley, explode: false,
        pierceLeft: 0, hitSet: new Set([main.uid]), coef: s.coef, child: true, tag: 'basic-split', first: false,
      });
    }
  }

  /** 게임 장면이 알려 주는 적의 죽음(처치 회복·파편·독 폭발) */
  onKill(e: Enemy, byBasic: boolean): void {
    const L = this.L;
    if (byBasic && this.traits.killHealChance > 0) {
      // 기본 2%(Lv.5부터 4%) × 별 등급 특성 강화 배율
      const chance = (L.healChance ?? BASE_HEAL) * (this.traits.killHealChance / BASE_HEAL);
      if (Math.random() < chance) this.h.heal?.(this.traits.killHealPct);
    }
    if (byBasic && L.shardsOnKill) {
      for (let i = 0; i < L.shardsOnKill.count; i++) {
        const angle = (i / L.shardsOnKill.count) * Math.PI * 2 + Math.random() * 0.6;
        const img = this.h.scene.add.image(e.x, e.y, this.spec.texture).setDepth(9).setScale(0.6).setRotation(angle);
        this.queued.push({
          img, target: null, angle, speed: 520, homing: 0, life: 600, volley: { hitUids: new Set(), index: 0 }, explode: false,
          pierceLeft: 0, hitSet: new Set([e.uid]), coef: L.shardsOnKill.coef, child: true, tag: 'basic-shard', first: false,
        });
      }
    }
    if (L.poisonBurst && e.poisonCount > 0 && L.poison) {
      const r = L.poisonBurst.radius * this.h.stats.areaMult;
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

  // ───────── 독구름 ─────────
  private addCloud(x: number, y: number, radius: number, ms: number): void {
    const r = radius * this.h.stats.areaMult;
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
    const r = s.radius * this.h.stats.areaMult;
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
    const r = w.radius * this.h.stats.areaMult;
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
    b.img.destroy();
    return false;
  }

  /** 판이 끝날 때 남은 그림 정리 */
  destroy(): void {
    [...this.bullets, ...this.queued].forEach((b) => b.img.destroy());
    this.clouds.forEach((c) => c.g.destroy());
    this.spinImgs.forEach((i) => i.destroy());
    this.bullets = [];
    this.queued = [];
    this.clouds = [];
    this.spinImgs = [];
  }
}

const BASE_HEAL = 0.02;
