import Phaser from 'phaser';
import type { Enemy } from '../objects/Enemy';
import type { RunStats } from '../data/stats';
import { SKILL } from '../data/upgrades';

/** 스킬 시스템이 게임 장면에서 빌려 쓰는 것들 */
export interface SkillHost {
  scene: Phaser.Scene;
  player: Phaser.GameObjects.Image;
  facing: Phaser.Math.Vector2; // 드래곤이 마지막으로 움직인 방향(길이 1)
  stats: RunStats;
  enemies(): Enemy[];
  level(id: string): number; // 스킬 레벨(0이면 없음)
  damage(enemy: Enemy, amount: number): void;
}

interface Shard {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  lv: number;
}

interface PendingMeteor {
  x: number;
  y: number;
  left: number; // 떨어지기까지 남은 ms
  lv: number;
  warn: Phaser.GameObjects.Arc;
}

/**
 * 스킬 6종의 효과. 각 스킬은 "쿨다운이 0이 되면 발동" 구조이고,
 * 모든 시간은 update()의 delta로만 흐르므로 카드 고르는 동안(update 멈춤) 같이 멈춘다.
 */
export class Skills {
  private cd: Record<string, number> = { breath: 0, ice: 0, lightning: 0, meteor: 0 };
  private shards: Shard[] = [];
  private meteors: PendingMeteor[] = [];
  private orbs: Phaser.GameObjects.Image[] = [];
  private orbAngle = 0;
  private now = 0;

  constructor(private h: SkillHost) {}

  update(delta: number): void {
    this.now += delta;
    const live = () => this.h.enemies().filter((e) => e.active);

    for (const id of ['breath', 'ice', 'lightning', 'meteor'] as const) {
      const lv = this.h.level(id);
      if (lv === 0) continue;
      this.cd[id] -= delta;
      if (this.cd[id] > 0) continue;
      // 발동할 대상이 없으면 쿨다운을 다시 채우지 않고 기다린다(헛방 방지).
      const fired = this[id](lv, live());
      if (fired) this.cd[id] = SKILL[id].interval(lv);
    }

    this.updateShards(delta, live());
    this.updateMeteors(delta, live());
    this.updateOrbs(delta, live());
  }

  // ───────── 🔥 화염 브레스: 앞쪽 부채꼴 범위 ─────────
  private breath(lv: number, enemies: Enemy[]): boolean {
    const { x, y } = this.h.player;
    const range = SKILL.breath.range(lv);
    const half = Phaser.Math.DegToRad(SKILL.breath.angle(lv) / 2);
    const inRange = enemies.filter((e) => Phaser.Math.Distance.Between(x, y, e.x, e.y) <= range + e.def.radius);
    if (inRange.length === 0) return false;

    // 기본은 드래곤이 보는 방향(전방). 그 부채꼴에 적이 하나도 없으면 가장 가까운 적 쪽으로 뿜는다.
    const inCone = (dir: number) =>
      inRange.filter((e) => Math.abs(Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(x, y, e.x, e.y) - dir)) <= half);
    let dir = this.h.facing.angle();
    let targets = inCone(dir);
    if (targets.length === 0) {
      const nearest = inRange.reduce((a, b) =>
        Phaser.Math.Distance.Between(x, y, a.x, a.y) <= Phaser.Math.Distance.Between(x, y, b.x, b.y) ? a : b,
      );
      dir = Phaser.Math.Angle.Between(x, y, nearest.x, nearest.y);
      targets = inCone(dir);
    }

    const dmg = SKILL.breath.damage(lv) * this.h.stats.fireMult;
    for (const e of targets) this.h.damage(e, dmg);
    // 부채꼴 불길 그림: 잠깐 보였다가 사라진다
    const g = this.h.scene.add.graphics({ x, y }).setDepth(8);
    g.fillStyle(0xff8a1f, 0.45).slice(0, 0, range, dir - half, dir + half).fillPath();
    g.fillStyle(0xffe066, 0.5).slice(0, 0, range * 0.55, dir - half * 0.7, dir + half * 0.7).fillPath();
    this.h.scene.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
    return true;
  }

  // ───────── ❄️ 얼음 파편: 가까운 적에게 날아가 피해 + 둔화 ─────────
  private ice(lv: number, enemies: Enemy[]): boolean {
    const { x, y } = this.h.player;
    const targets = enemies
      .map((e) => ({ e, d: Phaser.Math.Distance.Between(x, y, e.x, e.y) }))
      .filter((o) => o.d < 600)
      .sort((a, b) => a.d - b.d)
      .slice(0, SKILL.ice.count(lv));
    if (targets.length === 0) return false;
    for (const { e } of targets) {
      const a = Phaser.Math.Angle.Between(x, y, e.x, e.y);
      const img = this.h.scene.add.image(x, y, 'ice').setDepth(9).setRotation(a);
      this.shards.push({ img, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620, life: 1100, dmg: SKILL.ice.damage(lv), lv });
    }
    return true;
  }

  private updateShards(delta: number, enemies: Enemy[]): void {
    const dt = delta / 1000;
    this.shards = this.shards.filter((s) => {
      s.life -= delta;
      s.img.x += s.vx * dt;
      s.img.y += s.vy * dt;
      const hit = s.life > 0 && enemies.find((e) => e.active && Phaser.Math.Distance.Between(s.img.x, s.img.y, e.x, e.y) < e.def.radius + 8);
      if (hit) {
        hit.slow(SKILL.ice.slow(s.lv), SKILL.ice.slowMs());
        this.h.damage(hit, s.dmg);
      }
      if (hit || s.life <= 0) {
        s.img.destroy();
        return false;
      }
      return true;
    });
  }

  // ───────── ⚡ 번개 숨결: 적 사이를 튀는 연쇄 ─────────
  private lightning(lv: number, enemies: Enemy[]): boolean {
    const { x, y } = this.h.player;
    let from = { x, y };
    let range = 520; // 첫 대상까지 거리
    const hitSet = new Set<Enemy>();
    const points = [{ x, y }];
    for (let i = 0; i < SKILL.lightning.chains(lv); i++) {
      let best: Enemy | null = null;
      let bestD = range;
      for (const e of enemies) {
        if (hitSet.has(e) || !e.active) continue;
        const d = Phaser.Math.Distance.Between(from.x, from.y, e.x, e.y);
        if (d < bestD) {
          best = e;
          bestD = d;
        }
      }
      if (!best) break;
      hitSet.add(best);
      points.push({ x: best.x, y: best.y });
      from = { x: best.x, y: best.y };
      range = SKILL.lightning.jump();
    }
    if (hitSet.size === 0) return false;
    for (const e of hitSet) this.h.damage(e, SKILL.lightning.damage(lv));

    // 지그재그 번개 줄
    const g = this.h.scene.add.graphics().setDepth(9);
    for (const [w, c] of [[7, 0x7aa7ff], [3, 0xffffff]] as const) {
      g.lineStyle(w, c, 1).beginPath().moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const p = points[i - 1];
        const q = points[i];
        const mx = (p.x + q.x) / 2 + Phaser.Math.Between(-18, 18);
        const my = (p.y + q.y) / 2 + Phaser.Math.Between(-18, 18);
        g.lineTo(mx, my).lineTo(q.x, q.y);
      }
      g.strokePath();
    }
    this.h.scene.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
    return true;
  }

  // ───────── ☄️ 드래곤 메테오: 적이 많은 곳에 경고 → 광역 폭발 ─────────
  private meteor(lv: number, enemies: Enemy[]): boolean {
    const { x, y } = this.h.player;
    const near = enemies.filter((e) => Phaser.Math.Distance.Between(x, y, e.x, e.y) < 600);
    if (near.length === 0) return false;
    const radius = SKILL.meteor.radius(lv);
    for (let i = 0; i < SKILL.meteor.count(lv); i++) {
      // 무작위 후보 몇 개 중 주변에 적이 가장 많은 곳을 고른다(계산을 가볍게)
      let best = near[0];
      let bestN = -1;
      for (let k = 0; k < 6; k++) {
        const c = near[Math.floor(Math.random() * near.length)];
        const n = near.filter((e) => Phaser.Math.Distance.Between(c.x, c.y, e.x, e.y) < radius).length;
        if (n > bestN) {
          best = c;
          bestN = n;
        }
      }
      const warn = this.h.scene.add.circle(best.x, best.y, radius, 0xff3d00, 0.18).setStrokeStyle(4, 0xff6d00, 0.9).setDepth(4);
      this.meteors.push({ x: best.x, y: best.y, left: SKILL.meteor.warnMs(), lv, warn });
    }
    return true;
  }

  private updateMeteors(delta: number, enemies: Enemy[]): void {
    this.meteors = this.meteors.filter((m) => {
      m.left -= delta;
      if (m.left > 0) return true;
      m.warn.destroy();
      const r = SKILL.meteor.radius(m.lv);
      const dmg = SKILL.meteor.damage(m.lv) * this.h.stats.fireMult;
      for (const e of enemies) {
        if (e.active && Phaser.Math.Distance.Between(m.x, m.y, e.x, e.y) < r + e.def.radius) this.h.damage(e, dmg);
      }
      const boom = this.h.scene.add.circle(m.x, m.y, r, 0xffb300, 0.75).setDepth(8);
      this.h.scene.tweens.add({ targets: boom, alpha: 0, scale: 1.25, duration: 350, onComplete: () => boom.destroy() });
      this.h.scene.cameras.main.shake(100, 0.004);
      return false;
    });
  }

  // ───────── 🐲 드래곤 오브: 주위를 돌며 닿은 적에게 피해 ─────────
  private updateOrbs(delta: number, enemies: Enemy[]): void {
    const lv = this.h.level('orb');
    const want = lv > 0 ? SKILL.orb.count(lv) : 0;
    while (this.orbs.length < want) this.orbs.push(this.h.scene.add.image(0, 0, 'orb').setDepth(9));
    if (want === 0) return;

    this.orbAngle += SKILL.orb.spin(lv) * (delta / 1000);
    const R = SKILL.orb.radius();
    const { x, y } = this.h.player;
    this.orbs.forEach((o, i) => {
      const a = this.orbAngle + (i / this.orbs.length) * Math.PI * 2;
      o.setPosition(x + Math.cos(a) * R, y + Math.sin(a) * R);
      for (const e of enemies) {
        if (!e.active || this.now - e.orbHitAt < SKILL.orb.hitCooldown()) continue;
        if (Phaser.Math.Distance.Between(o.x, o.y, e.x, e.y) < e.def.radius + 14) {
          e.orbHitAt = this.now;
          this.h.damage(e, SKILL.orb.damage(lv));
        }
      }
    });
  }
}
