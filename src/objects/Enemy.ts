import Phaser from 'phaser';
import { ENEMIES, type EnemyDef, type EnemyKind } from '../data/enemies';

// 적 한 마리. 물리 몸체가 있는 이미지에 체력·종류 같은 정보를 붙인 것.
export class Enemy extends Phaser.Physics.Arcade.Image {
  declare body: Phaser.Physics.Arcade.Body;
  readonly def: EnemyDef;
  hp: number;
  private shootTimer = 0;
  private hitFlash = 0;
  private slowLeft = 0; // 둔화가 남은 시간(ms)
  private slowRatio = 0; // 0.4면 40% 느려짐
  /** 오브처럼 계속 닿는 공격이 같은 적을 매 프레임 때리지 않게 기억해 두는 시각 */
  orbHitAt = -Infinity;

  constructor(scene: Phaser.Scene, x: number, y: number, readonly kind: EnemyKind) {
    const def = ENEMIES[kind];
    super(scene, x, y, def.texture);
    this.def = def;
    this.hp = def.hp;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const r = def.radius;
    this.body.setCircle(r, this.width / 2 - r, this.height / 2 - r);
    this.shootTimer = def.ranged ? Phaser.Math.Between(0, def.ranged.interval) : 0;
  }

  /** 매 프레임: 드래곤 쪽으로 걷는다. 원거리 적은 거리를 두고 멈춰서 쏜다. 쏠 때 true. */
  step(target: Phaser.Math.Vector2, delta: number): boolean {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    let speed = this.def.speed;
    const ranged = this.def.ranged;
    if (ranged && dist < ranged.keepDistance) speed = 0;
    if (this.slowLeft > 0) {
      this.slowLeft -= delta;
      speed *= 1 - this.slowRatio;
      if (this.slowLeft <= 0) this.refreshTint();
    }
    this.body.setVelocity((dx / dist) * speed, (dy / dist) * speed);
    this.setFlipX(dx < 0);

    if (this.hitFlash > 0) {
      this.hitFlash -= delta;
      if (this.hitFlash <= 0) this.refreshTint();
    }

    if (!ranged || dist > ranged.keepDistance + 80) return false;
    this.shootTimer -= delta;
    if (this.shootTimer > 0) return false;
    this.shootTimer = ranged.interval;
    return true;
  }

  /** 피해를 받는다. 죽으면 true. */
  hurt(amount: number): boolean {
    this.hp -= amount;
    this.setTint(0xff6b6b);
    this.hitFlash = 80;
    return this.hp <= 0;
  }

  /** 얼음 파편: 일정 시간 느려진다. 더 센 둔화가 오면 덮어쓴다. */
  slow(ratio: number, ms: number): void {
    this.slowRatio = Math.max(this.slowLeft > 0 ? this.slowRatio : 0, ratio);
    this.slowLeft = Math.max(this.slowLeft, ms);
    if (this.hitFlash <= 0) this.refreshTint();
  }

  /** 맞은 반짝임이 끝나면 원래 색(얼어 있으면 푸른색)으로 돌린다. */
  private refreshTint(): void {
    if (this.slowLeft > 0) this.setTint(0x8fd3ff);
    else this.clearTint();
  }
}
