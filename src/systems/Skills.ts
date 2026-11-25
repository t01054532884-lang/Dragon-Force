import Phaser from 'phaser';
import type { Enemy } from '../objects/Enemy';
import { SKILL } from '../data/upgrades';
import { RED_BASIC } from '../data/basicAttack';
import type { CombatHost } from './CombatHost';
import { playSfx, SKILL_SFX } from './Sfx';

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
        const sk = SKILL_SFX[id];
        if (sk) playSfx(this.h.scene, sk, { vol: 0.8, maxMs: 450 });
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
    this.breathFx(x, y, dir, half, range);
    return true;
  }

  /**
   * 화염 브레스 연출(2026-11-22 제작자: "원뿔 도형만 보여 초기 개발 같다"): 부채꼴 안으로 불덩이가 쏟아져
   * 커지며 사라진다(가산 혼합으로 빛나게). 아래에 아주 옅은 부채꼴만 깔아 범위를 알려 준다. 판정은 위와 같음.
   */
  private breathFx(x: number, y: number, dir: number, half: number, range: number): void {
    const sc = this.h.scene;
    const base = sc.add.graphics({ x, y }).setDepth(7.5);
    base.fillStyle(0xff6d00, 0.14).slice(0, 0, range, dir - half, dir + half).fillPath();
    sc.tweens.add({ targets: base, alpha: 0, duration: 420, onComplete: () => base.destroy() });
    const colors = [0xffe066, 0xffb347, 0xff7a1a, 0xff4500];
    for (let i = 0; i < 26; i++) {
      const a = dir + (Math.random() * 2 - 1) * half * 0.95;
      const dist = range * (0.35 + Math.random() * 0.65);
      const delay = Math.random() * 220;
      // 15차분 불덩이 그림이 있으면 그림(날아가는 방향으로 회전), 없으면 동그라미
      const puff = (sc.textures.exists('fx-fireball')
        ? sc.add.image(x + Math.cos(dir) * 14, y + Math.sin(dir) * 14, 'fx-fireball').setDisplaySize(30, 30).setRotation(a + Math.PI)
        : sc.add.circle(x + Math.cos(dir) * 14, y + Math.sin(dir) * 14, 7 + Math.random() * 6, colors[i % colors.length], 0.9))
        .setDepth(8).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      const k = puff.scale;
      sc.tweens.add({
        targets: puff, delay, duration: 300 + Math.random() * 140, ease: 'Quad.Out',
        x: x + Math.cos(a) * dist, y: y + Math.sin(a) * dist, scale: k * (2.4 + Math.random() * 1.6),
        alpha: { from: 0.95, to: 0 },
        onComplete: () => puff.destroy(),
      });
    }
  }

  /** 드래곤 메테오 연출: 하늘에서 비스듬히 떨어지는 불타는 바위(경고 시간 동안) */
  private meteorFall(mx: number, my: number, ms: number): () => void {
    const sc = this.h.scene;
    const sx = mx - 220;
    const sy = my - 520;
    const rock = sc.add.container(sx, sy).setDepth(9);
    const glow = sc.add.circle(0, 0, 26, 0xff6d00, 0.55).setBlendMode(Phaser.BlendModes.ADD);
    if (sc.textures.exists('fx-meteor-rock')) {
      // 15차분 운석 그림: 불꼬리가 왼쪽 위 → 오른쪽 아래로 떨어지는 방향과 맞춤
      const img = sc.add.image(0, 0, 'fx-meteor-rock').setDisplaySize(92, 92).setRotation(Math.atan2(my - sy, mx - sx) - Math.atan2(0.45, 1));
      rock.add([glow, img]);
    } else {
      const body = sc.add.circle(0, 0, 16, 0x5d4037, 1).setStrokeStyle(4, 0xffb347, 1);
      const core = sc.add.circle(-4, -4, 6, 0xffe066, 0.9);
      rock.add([glow, body, core]);
    }
    const fall = ms * 0.85;
    sc.tweens.add({ targets: rock, x: mx, y: my, duration: fall, ease: 'Quad.In' });
    sc.tweens.add({ targets: rock, scale: { from: 0.6, to: 1.5 }, duration: fall, ease: 'Quad.In' });
    // 꼬리 불똥
    const trail = sc.time.addEvent({ delay: 40, loop: true, callback: () => {
      const t = sc.add.circle(rock.x, rock.y, 10 * rock.scale, 0xff8a1f, 0.7).setDepth(8.8).setBlendMode(Phaser.BlendModes.ADD);
      sc.tweens.add({ targets: t, scale: 0.2, alpha: 0, duration: 260, onComplete: () => t.destroy() });
    } });
    return () => {
      trail.remove();
      rock.destroy();
    };
  }

  /** 메테오 착탄: 섬광 + 용암 바닥 그림이 퍼짐 + 파편 */
  private meteorImpact(mx: number, my: number, radius: number): void {
    const sc = this.h.scene;
    const flash = sc.add.circle(mx, my, radius * 0.6, 0xfff3c4, 0.95).setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
    sc.tweens.add({ targets: flash, scale: 2, alpha: 0, duration: 200, onComplete: () => flash.destroy() });
    if (sc.textures.exists('fx-fire-ground')) {
      const ground = sc.add.image(mx, my, 'fx-fire-ground').setDepth(4.5).setDisplaySize(radius * 2.3, radius * 2.3).setAlpha(0.95);
      const s0 = ground.scale;
      ground.setScale(s0 * 0.4);
      sc.tweens.add({ targets: ground, scale: s0, duration: 180, ease: 'Back.Out' });
      sc.tweens.add({ targets: ground, alpha: 0, delay: 350, duration: 450, onComplete: () => ground.destroy() });
    } else {
      const boom = sc.add.circle(mx, my, radius, 0xffb300, 0.75).setDepth(8);
      sc.tweens.add({ targets: boom, alpha: 0, scale: 1.25, duration: 350, onComplete: () => boom.destroy() });
    }
    const ring = sc.add.circle(mx, my, radius * 0.3).setStrokeStyle(8, 0xffb347, 0.9).setDepth(8.5);
    sc.tweens.add({ targets: ring, radius: radius * 1.15, alpha: 0, duration: 320, onComplete: () => ring.destroy() });
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = radius * (0.6 + Math.random() * 0.7);
      const deb = sc.add.circle(mx, my, 4 + Math.random() * 4, i % 2 ? 0x6d4c41 : 0xff7a1a, 1).setDepth(8.6);
      sc.tweens.add({ targets: deb, x: mx + Math.cos(a) * d, y: my + Math.sin(a) * d - 20, alpha: 0, duration: 420 + Math.random() * 200, ease: 'Quad.Out', onComplete: () => deb.destroy() });
    }
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
      // 얼음 파편도 벽·장애물에 닿으면 사라진다(2026-11-26)
      if (this.h.blocked?.(s.img.x, s.img.y)) {
        this.h.fx?.burst(s.img.x, s.img.y, [0xe1f5fe, 0x81d4fa, 0xffffff], 4, 22, 10);
        s.img.destroy();
        return false;
      }
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
      this.h.scene.tweens.add({ targets: warn, alpha: { from: 0.5, to: 1 }, duration: 160, yoyo: true, repeat: -1 });
      const stopFall = this.meteorFall(mx, my, SKILL.meteor.warnMs()); // 실제로 하늘에서 떨어지는 바위
      this.pending.push({
        left: SKILL.meteor.warnMs(),
        run: () => {
          warn.destroy();
          stopFall();
          for (const e of this.h.enemies()) {
            if (e.active && Phaser.Math.Distance.Between(mx, my, e.x, e.y) < radius + e.def.radius) {
              this.h.hit(e, { source: 'active', coef: SKILL.meteor.coef(lv), tag: 'meteor' });
            }
          }
          this.meteorImpact(mx, my, radius);
          this.h.scene.cameras.main.shake(140, 0.006);
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
    // 회오리 그림(2026-11-22 개선): 바람 칼날 그림 6개가 돌며 바깥으로 퍼짐 + 옅은 고리 두 개
    const sc = this.h.scene;
    if (sc.textures.exists('fx-wind-blade')) {
      for (let i = 0; i < 6; i++) {
        const a0 = (i / 6) * Math.PI * 2;
        const blade = sc.add.image(x, y, 'fx-wind-blade').setDepth(8.2).setDisplaySize(r * 0.7, r * 0.7).setAlpha(0.95).setBlendMode(Phaser.BlendModes.ADD);
        const s0 = blade.scale;
        const st = { t: 0 };
        sc.tweens.add({
          targets: st, t: 1, duration: 420, ease: 'Quad.Out',
          onUpdate: () => {
            const a = a0 + st.t * Math.PI * 1.4;
            const d = r * (0.25 + 0.7 * st.t);
            blade.setPosition(x + Math.cos(a) * d, y + Math.sin(a) * d).setRotation(a + Math.PI / 2).setScale(s0 * (0.7 + 0.5 * st.t)).setAlpha(0.95 * (1 - st.t));
          },
          onComplete: () => blade.destroy(),
        });
      }
    }
    for (const [delay, color] of [[0, 0xbfe9ff], [90, 0x7fd6ff]] as const) {
      const ring = this.h.scene.add.circle(x, y, r * 0.4).setStrokeStyle(6, color, 0.5).setDepth(8);
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
