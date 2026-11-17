import Phaser from 'phaser';
import { makeTextures } from '../textures';

const WORLD_SIZE = 4000; // 맵 한 변 길이(px). 화면보다 훨씬 넓고 카메라가 따라다닌다.
const PLAYER_SPEED = 260; // 초당 이동 거리(px)

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;

  // 터치 조이스틱: 화면을 누른 곳이 중심, 끌고 간 방향으로 이동
  private stickBase!: Phaser.GameObjects.Arc;
  private stickKnob!: Phaser.GameObjects.Arc;
  private stickPointerId: number | null = null;
  private stickVec = new Phaser.Math.Vector2();

  constructor() {
    super('game');
  }

  create(): void {
    makeTextures(this);

    // 넓은 바닥을 타일로 깔고, 물리 세계와 카메라 범위를 맵 크기에 맞춘다.
    this.add.tileSprite(0, 0, WORLD_SIZE, WORLD_SIZE, 'ground').setOrigin(0);
    this.physics.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);

    this.player = this.physics.add.image(WORLD_SIZE / 2, WORLD_SIZE / 2, 'dragon');
    this.player.setCircle(18, 14, 18).setCollideWorldBounds(true);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('up,down,left,right,w,a,s,d') as typeof this.keys;

    this.createJoystick();
  }

  private createJoystick(): void {
    // setScrollFactor(0): 카메라가 움직여도 화면 같은 자리에 붙어 있는 UI
    this.stickBase = this.add.circle(0, 0, 90, 0xffffff, 0.12).setScrollFactor(0).setDepth(100).setVisible(false);
    this.stickKnob = this.add.circle(0, 0, 40, 0xffffff, 0.35).setScrollFactor(0).setDepth(101).setVisible(false);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.stickPointerId !== null) return;
      this.stickPointerId = p.id;
      this.stickBase.setPosition(p.x, p.y).setVisible(true);
      this.stickKnob.setPosition(p.x, p.y).setVisible(true);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.stickPointerId) return;
      const dx = p.x - this.stickBase.x;
      const dy = p.y - this.stickBase.y;
      this.stickVec.set(dx, dy);
      const len = Math.min(this.stickVec.length(), 90);
      this.stickVec.normalize();
      this.stickKnob.setPosition(this.stickBase.x + this.stickVec.x * len, this.stickBase.y + this.stickVec.y * len);
      this.stickVec.scale(len / 90); // 0~1: 조금 밀면 천천히, 끝까지 밀면 최고 속도
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (p.id !== this.stickPointerId) return;
      this.stickPointerId = null;
      this.stickVec.set(0, 0);
      this.stickBase.setVisible(false);
      this.stickKnob.setVisible(false);
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  update(): void {
    // 키보드 입력을 방향 벡터로 바꾼다. 대각선이 더 빠르지 않게 길이를 1로 맞춘다.
    const k = this.keys;
    const dir = new Phaser.Math.Vector2(
      (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0),
      (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0),
    );
    if (dir.lengthSq() > 0) dir.normalize();
    else dir.copy(this.stickVec); // 키보드를 안 누르면 터치 조이스틱 값을 쓴다

    this.player.setVelocity(dir.x * PLAYER_SPEED, dir.y * PLAYER_SPEED);
    // 드래곤 머리가 이동 방향을 보게 돌린다(그림은 위쪽을 보고 있어서 +90도 보정).
    if (dir.lengthSq() > 0.01) this.player.setRotation(dir.angle() + Math.PI / 2);
  }
}
