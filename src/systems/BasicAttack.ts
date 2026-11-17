import Phaser from 'phaser';
import type { Enemy } from '../objects/Enemy';
import { RED_BASIC } from '../data/basicAttack';
import type { CombatHost } from './CombatHost';

interface Volley {
  hitUids: Set<number>; // 이 묶음이 이미 맞힌 적(두 번째부터 50%, 화상도 1중첩만)
}

interface Bullet {
  img: Phaser.GameObjects.Image;
  target: Enemy | null;
  angle: number; // 날아가는 방향(라디안)
  life: number;
  volley: Volley;
  explode: boolean; // Lv.7: 이 탄이 맞으면 폭발
}

/**
 * 레드 드래곤 고유 기본공격 "추적 화염탄" (기획서 v0.2).
 * 의사 코드(24쪽)를 그대로 옮김: 쿨다운이 남았으면 대기 → 서로 다른 적 우선으로 대상 선정 →
 * 대상이 없으면 타이머를 '준비됨'으로 둔 채 대기 → 발사 묶음 생성 → 타이머 재설정.
 */
export class BasicAttack {
  private timer = 0;
  private volleyCount = 0;
  private bullets: Bullet[] = [];

  constructor(private h: CombatHost) {}

  update(delta: number): void {
    const lv = Math.max(1, this.h.level('basic'));
    const L = RED_BASIC.levels[lv - 1];

    this.timer -= delta;
    if (this.timer <= 0) {
      const targets = this.selectDistinctFirst(RED_BASIC.range, L.shots);
      if (targets.length === 0) {
        this.timer = 0; // 준비된 상태로 기다리다가 적이 사거리에 들어오면 바로 쏜다
      } else {
        this.volleyCount++;
        const volley: Volley = { hitUids: new Set() };
        const explode = L.explodeEvery > 0 && this.volleyCount % L.explodeEvery === 0;
        targets.forEach((t, i) => this.spawnBullet(t, volley, explode && i === 0, i, targets.length));
        this.timer += L.interval; // 넘친 시간을 버리지 않고 이어 간다(1.02초가 프레임 단위로 1.033초가 되는 오차 방지)
      }
    }
    this.updateBullets(delta, lv);
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

  private spawnBullet(target: Enemy, volley: Volley, explode: boolean, index: number, total: number): void {
    const { x, y } = this.h.player;
    // 여러 발이면 살짝 벌려서 쏘고, 추적하며 각자 대상에게 휘어 들어간다
    const spread = total > 1 ? (index - (total - 1) / 2) * 0.35 : 0;
    const angle = Phaser.Math.Angle.Between(x, y, target.x, target.y) + spread;
    const img = this.h.scene.add.image(x, y, 'fireball').setDepth(9).setScale(explode ? 1.6 : 1);
    this.bullets.push({ img, target, angle, life: RED_BASIC.life, volley, explode });
  }

  private updateBullets(delta: number, lv: number): void {
    const L = RED_BASIC.levels[lv - 1];
    const dt = delta / 1000;
    const enemies = this.h.enemies().filter((e) => e.active);

    this.bullets = this.bullets.filter((b) => {
      b.life -= delta;
      // 대상이 죽었으면 반경 3m 안에서 새 대상을 찾고, 없으면 사라진다
      if (!b.target || !b.target.active) {
        b.target = this.nearestTo(b.img.x, b.img.y, RED_BASIC.retarget, enemies);
        if (!b.target) return this.kill(b);
      }
      // 추적: 현재 방향을 대상 방향으로 초당 360°까지 돌린다
      const want = Phaser.Math.Angle.Between(b.img.x, b.img.y, b.target.x, b.target.y);
      b.angle = Phaser.Math.Angle.RotateTo(b.angle, want, RED_BASIC.turnRate * dt);
      b.img.x += Math.cos(b.angle) * RED_BASIC.speed * dt;
      b.img.y += Math.sin(b.angle) * RED_BASIC.speed * dt;

      const hit = enemies.find((e) => e.active && Phaser.Math.Distance.Between(b.img.x, b.img.y, e.x, e.y) < e.def.radius + 9);
      if (hit) {
        const repeat = b.volley.hitUids.has(hit.uid);
        const same = repeat ? RED_BASIC.sameVolley : 1;
        b.volley.hitUids.add(hit.uid);
        if (L.burn && !repeat) hit.burn(RED_BASIC.burn.perSec, RED_BASIC.burn.ms, RED_BASIC.burn.maxStacks);
        this.h.hit(hit, { source: 'basic', coef: L.coef, levelMod: L.levelMod, sameVolley: same, tag: 'basic' });
        if (b.explode) this.explode(b.img.x, b.img.y, enemies);
        return this.kill(b);
      }
      if (b.life <= 0) return this.kill(b);
      return true;
    });
  }

  private explode(x: number, y: number, enemies: Enemy[]): void {
    const r = RED_BASIC.explosion.radius * this.h.stats.areaMult; // 범위형 기본공격이라 마력 확장 적용
    for (const e of enemies) {
      if (e.active && Phaser.Math.Distance.Between(x, y, e.x, e.y) < r + e.def.radius) {
        this.h.hit(e, { source: 'basic', coef: RED_BASIC.explosion.coef, tag: 'basic-explosion' });
      }
    }
    const boom = this.h.scene.add.circle(x, y, r, 0xff4500, 0.6).setDepth(8);
    this.h.scene.tweens.add({ targets: boom, alpha: 0, scale: 1.2, duration: 300, onComplete: () => boom.destroy() });
  }

  private nearestTo(x: number, y: number, maxD: number, enemies: Enemy[]): Enemy | null {
    let best: Enemy | null = null;
    let bestD = maxD;
    for (const e of enemies) {
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
}
