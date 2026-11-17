import Phaser from 'phaser';
import { ENEMIES, type EnemyDef, type EnemyKind } from '../data/enemies';

// 적 한 마리. 물리 몸체가 있는 이미지에 체력·종류·상태이상을 붙인 것.
export class Enemy extends Phaser.Physics.Arcade.Image {
  private static nextUid = 0;
  declare body: Phaser.Physics.Arcade.Body;
  readonly def: EnemyDef;
  /** 생성 순번. 거리가 같을 때 먼저 나온 적을 우선 노린다(기획서 v0.2 대상 선정 규칙). */
  readonly uid = Enemy.nextUid++;
  hp: number;
  private shootTimer = 0;
  private hitFlash = 0;
  private slowLeft = 0; // 둔화가 남은 시간(ms)
  private slowRatio = 0; // 0.4면 40% 느려짐
  private knockLeft = 0; // 밀려나는 중인 시간(ms)
  private knockVel = new Phaser.Math.Vector2();
  private burnStacks: number[] = []; // 화상 중첩마다 남은 시간(ms)
  private burnPerStack = 0; // 중첩 하나가 초당 주는 피해(공격력 기준 계수)
  private burnTick = 0;
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
    if (this.hitFlash > 0) {
      this.hitFlash -= delta;
      if (this.hitFlash <= 0) this.refreshTint();
    }
    if (this.knockLeft > 0) {
      // 밀려나는 동안에는 걷지도 쏘지도 않는다
      this.knockLeft -= delta;
      this.body.setVelocity(this.knockVel.x, this.knockVel.y);
      return false;
    }

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

  /** 날개 폭풍: 잠깐 바깥으로 밀려난다. 골렘처럼 무거운 적은 덜 밀린다. */
  knock(dirX: number, dirY: number, speed: number, ms: number): void {
    const weight = this.def.radius >= 28 ? 0.4 : 1;
    this.knockVel.set(dirX, dirY).normalize().scale(speed * weight);
    this.knockLeft = ms;
  }

  /** 화상 중첩 추가. 최대 중첩이면 가장 오래된 것을 새로 고친다. */
  burn(perSecCoef: number, ms: number, maxStacks: number): void {
    this.burnPerStack = perSecCoef;
    if (this.burnStacks.length < maxStacks) this.burnStacks.push(ms);
    else {
      const oldest = this.burnStacks.indexOf(Math.min(...this.burnStacks));
      this.burnStacks[oldest] = ms;
    }
    if (this.hitFlash <= 0) this.refreshTint();
  }

  get burnCount(): number {
    return this.burnStacks.length;
  }

  /** 0.5초마다 화상 피해 계수(공격력 배수)를 돌려준다. 피해 적용은 장면이 한다. */
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

  /** 맞은 반짝임이 끝나면 상태 색으로 돌린다: 얼음(푸른색) > 화상(주황색) > 원래 색 */
  private refreshTint(): void {
    if (this.slowLeft > 0) this.setTint(0x8fd3ff);
    else if (this.burnStacks.length > 0) this.setTint(0xffa64d);
    else this.clearTint();
  }
}
