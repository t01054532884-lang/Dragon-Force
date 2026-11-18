import Phaser from 'phaser';
import type { Enemy } from '../objects/Enemy';
import { SKILL } from '../data/upgrades';
import { RED_BASIC } from '../data/basicAttack';
import type { CombatHost } from './CombatHost';

interface Shard {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  life: number;
  lv: number;
}

interface Pending {
  left: number; // 발동까지 남은 ms
  run: () => void;
}

type TimedSkill = 'breath' | 'ice' | 'lightning' | 'meteor' | 'wind';

/**
 * 액티브 스킬 6종의 효과. 각 스킬은 "쿨다운이 0이 되면 발동" 구조이고,
 * 모든 시간은 update()의 delta로만 흐르므로 카드 고르는 동안(update 멈춤) 같이 멈춘다.
 * 재사용 대기시간에는 고대의 시계(cooldownMult), 범위에는 마력 확장(areaMult)을 곱한다.
 */
export class Skills {
  private cd: Record<TimedSkill, number> = { breath: 0, ice: 0, lightning: 0, meteor: 0, wind: 0 };
  private shards: Shard[] = [];
  private pending: Pending[] = []; // 메테오 낙하, 브레스 추가 공격처럼 "잠시 뒤" 일어날 일
  private orbs: Phaser.GameObjects.Image[] = [];
  private orbAngle = 0;
  private now = 0;
  /** 영혼의 공명: 액티브 추가 발동 확률 */
  echo = 0;

  constructor(private h: CombatHost) {}

  update(delta: number): void {
    this.now += delta;
    const live = () => this.h.enemies().filter((e) => e.active);

    for (const id of ['breath', 'ice', 'lightning', 'meteor', 'wind'] as const) {
      const lv = this.h.level(id);
      if (lv === 0) continue;
      this.cd[id] -= delta;
      if (this.cd[id] > 0) continue;
      // 발동할 대상이 없으면 쿨다운을 다시 채우지 않고 기다린다(헛방 방지).
      if (this[id](lv, live())) {
        this.cd[id] = Math.max(this.cd[id], -100) + SKILL[id].interval(lv) * this.h.stats.cooldownMult;
        // 영혼의 공명(장착형 특수 스킬): 일정 확률로 0.3초 뒤 한 번 더
        if (this.echo > 0 && Math.random() < this.echo) this.pending.push({ left: 300, run: () => this[id](lv, live()) });
      }
    }

    this.pending = this.pending.filter((p) => {
      p.left -= delta;
      if (p.left > 0) return true;
      p.run();
      return false;
    });
    this.updateShards(delta, live());
    this.updateOrbs(delta, live());
  }

  private area(px: number): number {
    return px * this.h.stats.areaMult;
  }

  // ───────── 🔥 화염 브레스: 앞쪽 부채꼴 (기획서 v0.1 4장 예시표) ─────────
  private breath(lv: number, enemies: Enemy[]): boolean {
    const fired = this.breathOnce(lv, enemies);
    if (fired && SKILL.breath.extraBurst(lv)) {
      this.pending.push({ left: 300, run: () => this.breathOnce(lv, this.h.enemies().filter((e) => e.active)) });
    }
    return fired;
  }

  private breathOnce(lv: number, enemies: Enemy[]): boolean {
    const { x, y } = this.h.player;
    const range = this.area(SKILL.breath.range(lv));
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

    for (const e of targets) {
      if (SKILL.breath.burn(lv)) e.burn(RED_BASIC.burn.perSec, RED_BASIC.burn.ms, RED_BASIC.burn.maxStacks);
      this.h.hit(e, { source: 'active', coef: SKILL.breath.coef(lv), tag: 'breath' });
    }
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
      .filter((o) => o.d < 12 * 50)
      .sort((a, b) => a.d - b.d)
      .slice(0, SKILL.ice.count(lv));
    if (targets.length === 0) return false;
    for (const { e } of targets) {
      const a = Phaser.Math.Angle.Between(x, y, e.x, e.y);
      const img = this.h.scene.add.image(x, y, 'ice').setDepth(9).setRotation(a);
      this.shards.push({ img, vx: Math.cos(a) * 620, vy: Math.sin(a) * 620, life: 1100, lv });
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
        this.h.hit(hit, { source: 'active', coef: SKILL.ice.coef(s.lv), tag: 'ice' });
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
    let range = 10.4 * 50; // 첫 대상까지 거리
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
    for (const e of hitSet) this.h.hit(e, { source: 'active', coef: SKILL.lightning.coef(lv), tag: 'lightning' });

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
    const near = enemies.filter((e) => Phaser.Math.Distance.Between(x, y, e.x, e.y) < 12 * 50);
    if (near.length === 0) return false;
    const radius = this.area(SKILL.meteor.radius(lv));
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
      const mx = best.x;
      const my = best.y;
      const warn = this.h.scene.add.circle(mx, my, radius, 0xff3d00, 0.18).setStrokeStyle(4, 0xff6d00, 0.9).setDepth(4);
      this.pending.push({
        left: SKILL.meteor.warnMs(),
        run: () => {
          warn.destroy();
          for (const e of this.h.enemies()) {
            if (e.active && Phaser.Math.Distance.Between(mx, my, e.x, e.y) < radius + e.def.radius) {
              this.h.hit(e, { source: 'active', coef: SKILL.meteor.coef(lv), tag: 'meteor' });
            }
          }
          const boom = this.h.scene.add.circle(mx, my, radius, 0xffb300, 0.75).setDepth(8);
          this.h.scene.tweens.add({ targets: boom, alpha: 0, scale: 1.25, duration: 350, onComplete: () => boom.destroy() });
          this.h.scene.cameras.main.shake(100, 0.004);
        },
      });
    }
    return true;
  }

  // ───────── 🌪️ 날개 폭풍: 주변 회오리 + 밀쳐냄 ─────────
  private wind(lv: number, enemies: Enemy[]): boolean {
    const { x, y } = this.h.player;
    const r = this.area(SKILL.wind.radius(lv));
    const inside = enemies.filter((e) => Phaser.Math.Distance.Between(x, y, e.x, e.y) < r + e.def.radius);
    if (inside.length === 0) return false;
    for (const e of inside) {
      this.h.hit(e, { source: 'active', coef: SKILL.wind.coef(lv), tag: 'wind' });
      if (e.active) e.knock(e.x - x, e.y - y, SKILL.wind.push(lv), SKILL.wind.pushMs());
    }
    // 회오리 그림: 바깥으로 퍼지며 도는 고리 두 개
    for (const [delay, color] of [[0, 0xbfe9ff], [90, 0x7fd6ff]] as const) {
      const ring = this.h.scene.add.circle(x, y, r * 0.4).setStrokeStyle(10, color, 0.8).setDepth(8);
      this.h.scene.tweens.add({
        targets: ring, radius: r, alpha: 0, angle: 180, delay, duration: 320,
        onComplete: () => ring.destroy(),
      });
    }
    return true;
  }

  // ───────── 🐲 드래곤 오브: 주위를 돌며 닿은 적에게 피해 ─────────
  private updateOrbs(delta: number, enemies: Enemy[]): void {
    const lv = this.h.level('orb');
    const want = lv > 0 ? SKILL.orb.count(lv) : 0;
    while (this.orbs.length < want) this.orbs.push(this.h.scene.add.image(0, 0, 'orb').setDepth(9));
    if (want === 0) return;

    this.orbAngle += SKILL.orb.spin(lv) * (delta / 1000);
    const R = this.area(SKILL.orb.radius());
    const { x, y } = this.h.player;
    this.orbs.forEach((o, i) => {
      const a = this.orbAngle + (i / this.orbs.length) * Math.PI * 2;
      o.setPosition(x + Math.cos(a) * R, y + Math.sin(a) * R);
      for (const e of enemies) {
        if (!e.active || this.now - e.orbHitAt < SKILL.orb.hitCooldown()) continue;
        if (Phaser.Math.Distance.Between(o.x, o.y, e.x, e.y) < e.def.radius + 14) {
          e.orbHitAt = this.now;
          this.h.hit(e, { source: 'active', coef: SKILL.orb.coef(lv), tag: 'orb' });
        }
      }
    });
  }
}
