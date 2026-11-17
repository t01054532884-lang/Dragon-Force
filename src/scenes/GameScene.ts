import Phaser from 'phaser';
import { makeTextures } from '../textures';
import { ENEMIES, type EnemyKind } from '../data/enemies';
import { Enemy } from '../objects/Enemy';

const WORLD_SIZE = 4000; // 맵 한 변 길이(px). 화면보다 훨씬 넓고 카메라가 따라다닌다.
const SPAWN_RADIUS = 820; // 화면 밖(드래곤에서 이만큼 떨어진 곳)에서 적이 나온다.
const MAX_ENEMIES = 220; // 한 번에 살아 있는 적 최대 수(휴대폰 성능 보호)

// 드래곤 능력치. 3단계에서 스킬·강화가 이 값을 바꾼다.
const stats = {
  maxHp: 100,
  speed: 260,
  fireDamage: 10,
  fireInterval: 600, // ms마다 화염탄 1발
  fireRange: 620,
  fireSpeed: 540,
};

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private enemies!: Phaser.Physics.Arcade.Group;
  private fireballs!: Phaser.Physics.Arcade.Group;
  private bolts!: Phaser.Physics.Arcade.Group;

  private hp = stats.maxHp;
  private invincibleUntil = 0; // 맞은 직후 잠깐 무적(연속으로 피가 녹지 않게)
  private elapsed = 0; // 판 시작 후 지난 시간(ms)
  private fireCooldown = 0;
  private spawnCooldown = 0;
  private kills = 0;
  private over = false;

  // 화면 고정 UI
  private hpBar!: Phaser.GameObjects.Graphics;
  private timeText!: Phaser.GameObjects.Text;
  private killText!: Phaser.GameObjects.Text;

  // 터치 조이스틱: 화면을 누른 곳이 중심, 끌고 간 방향으로 이동
  private stickBase!: Phaser.GameObjects.Arc;
  private stickKnob!: Phaser.GameObjects.Arc;
  private stickPointerId: number | null = null;
  private stickVec = new Phaser.Math.Vector2();

  constructor() {
    super('game');
  }

  create(): void {
    // scene.restart() 때 필드가 이전 판 값을 들고 있으므로 다시 초기화한다.
    this.hp = stats.maxHp;
    this.invincibleUntil = 0;
    this.elapsed = 0;
    this.fireCooldown = 0;
    this.spawnCooldown = 0;
    this.kills = 0;
    this.over = false;
    this.stickPointerId = null;
    this.stickVec.set(0, 0);

    this.physics.resume(); // 게임오버 때 멈춘 물리를 새 판에서 다시 켠다
    if (!this.textures.exists('dragon')) makeTextures(this);

    // 넓은 바닥을 타일로 깔고, 물리 세계와 카메라 범위를 맵 크기에 맞춘다.
    this.add.tileSprite(0, 0, WORLD_SIZE, WORLD_SIZE, 'ground').setOrigin(0);
    this.physics.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);

    this.player = this.physics.add.image(WORLD_SIZE / 2, WORLD_SIZE / 2, 'dragon').setDepth(10);
    this.player.setCircle(18, 14, 18).setCollideWorldBounds(true);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);

    this.enemies = this.physics.add.group();
    this.fireballs = this.physics.add.group();
    this.bolts = this.physics.add.group();

    // 충돌 규칙: 적끼리는 서로 밀어내고(겹쳐 뭉치지 않게), 나머지는 겹침(overlap)으로 판정만 한다.
    this.physics.add.collider(this.enemies, this.enemies);
    this.physics.add.overlap(this.fireballs, this.enemies, (fb, en) => this.onFireballHit(fb as Phaser.Physics.Arcade.Image, en as Enemy));
    this.physics.add.overlap(this.player, this.enemies, (_p, en) => this.damagePlayer((en as Enemy).def.contactDamage));
    this.physics.add.overlap(this.player, this.bolts, (_p, b) => {
      const bolt = b as Phaser.Physics.Arcade.Image;
      this.damagePlayer(bolt.getData('damage') as number);
      bolt.destroy();
    });

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('up,down,left,right,w,a,s,d') as typeof this.keys;

    this.createHud();
    this.createJoystick();
  }

  private createHud(): void {
    this.hpBar = this.add.graphics().setScrollFactor(0).setDepth(200);
    const style = { fontFamily: 'sans-serif', fontSize: '34px', color: '#ffffff', stroke: '#000000', strokeThickness: 5 };
    this.timeText = this.add.text(360, 70, '00:00', style).setOrigin(0.5, 0).setScrollFactor(0).setDepth(200);
    this.killText = this.add.text(690, 24, '처치 0', { ...style, fontSize: '26px' }).setOrigin(1, 0).setScrollFactor(0).setDepth(200);
  }

  private drawHud(): void {
    const ratio = Phaser.Math.Clamp(this.hp / stats.maxHp, 0, 1);
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.6).fillRoundedRect(30, 26, 360, 28, 8);
    this.hpBar.fillStyle(ratio > 0.3 ? 0x3ddc84 : 0xff5252).fillRoundedRect(34, 30, 352 * ratio, 20, 6);
    const sec = Math.floor(this.elapsed / 1000);
    this.timeText.setText(`${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`);
    this.killText.setText(`처치 ${this.kills}`);
  }

  private createJoystick(): void {
    // setScrollFactor(0): 카메라가 움직여도 화면 같은 자리에 붙어 있는 UI
    this.stickBase = this.add.circle(0, 0, 90, 0xffffff, 0.12).setScrollFactor(0).setDepth(100).setVisible(false);
    this.stickKnob = this.add.circle(0, 0, 40, 0xffffff, 0.35).setScrollFactor(0).setDepth(101).setVisible(false);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.over) {
        this.scene.restart();
        return;
      }
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

  update(_time: number, delta: number): void {
    if (this.over) return;
    this.elapsed += delta;

    this.movePlayer();
    this.spawnEnemies(delta);
    this.updateEnemies(delta);
    this.autoFire(delta);
    this.drawHud();
  }

  private movePlayer(): void {
    // 키보드 입력을 방향 벡터로 바꾼다. 대각선이 더 빠르지 않게 길이를 1로 맞춘다.
    const k = this.keys;
    const dir = new Phaser.Math.Vector2(
      (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0),
      (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0),
    );
    if (dir.lengthSq() > 0) dir.normalize();
    else dir.copy(this.stickVec); // 키보드를 안 누르면 터치 조이스틱 값을 쓴다

    this.player.setVelocity(dir.x * stats.speed, dir.y * stats.speed);
    // 드래곤 머리가 이동 방향을 보게 돌린다(그림은 위쪽을 보고 있어서 +90도 보정).
    if (dir.lengthSq() > 0.01) this.player.setRotation(dir.angle() + Math.PI / 2);
  }

  private spawnEnemies(delta: number): void {
    this.spawnCooldown -= delta;
    if (this.spawnCooldown > 0 || this.enemies.countActive() >= MAX_ENEMIES) return;

    // 시간이 지날수록 더 자주, 더 많이 나온다.
    const minutes = this.elapsed / 60000;
    this.spawnCooldown = Math.max(350, 1400 - minutes * 160);
    const count = 1 + Math.floor(minutes * 1.2);

    const available = (Object.keys(ENEMIES) as EnemyKind[]).filter((k) => this.elapsed / 1000 >= ENEMIES[k].appearsAt);
    for (let i = 0; i < count; i++) {
      // 기사가 가장 흔하고, 마법사·골렘은 가끔
      const roll = Math.random();
      let kind: EnemyKind = 'knight';
      if (available.includes('golem') && roll < 0.12) kind = 'golem';
      else if (available.includes('mage') && roll < 0.35) kind = 'mage';

      const angle = Math.random() * Math.PI * 2;
      const x = Phaser.Math.Clamp(this.player.x + Math.cos(angle) * SPAWN_RADIUS, 20, WORLD_SIZE - 20);
      const y = Phaser.Math.Clamp(this.player.y + Math.sin(angle) * SPAWN_RADIUS, 20, WORLD_SIZE - 20);
      this.enemies.add(new Enemy(this, x, y, kind));
    }
  }

  private updateEnemies(delta: number): void {
    const target = new Phaser.Math.Vector2(this.player.x, this.player.y);
    for (const obj of this.enemies.getChildren()) {
      const e = obj as Enemy;
      if (e.step(target, delta) && e.def.ranged) this.shootBolt(e);
    }
  }

  private shootBolt(from: Enemy): void {
    const r = from.def.ranged!;
    const bolt = this.physics.add.image(from.x, from.y, 'bolt').setDepth(9);
    this.bolts.add(bolt);
    bolt.setCircle(6, 1, 1).setData('damage', r.damage);
    this.physics.velocityFromRotation(Phaser.Math.Angle.Between(from.x, from.y, this.player.x, this.player.y), r.boltSpeed, bolt.body.velocity);
    this.time.delayedCall(4000, () => bolt.destroy());
  }

  private autoFire(delta: number): void {
    this.fireCooldown -= delta;
    if (this.fireCooldown > 0) return;

    // 사거리 안에서 가장 가까운 적을 찾아 쏜다. 없으면 쏘지 않는다.
    const nearest = this.physics.closest(this.player, this.enemies.getChildren() as Enemy[]) as Enemy | null;
    if (!nearest || Phaser.Math.Distance.Between(this.player.x, this.player.y, nearest.x, nearest.y) > stats.fireRange) return;

    this.fireCooldown = stats.fireInterval;
    const fb = this.physics.add.image(this.player.x, this.player.y, 'fireball').setDepth(9);
    this.fireballs.add(fb);
    fb.setCircle(9);
    this.physics.velocityFromRotation(Phaser.Math.Angle.Between(this.player.x, this.player.y, nearest.x, nearest.y), stats.fireSpeed, fb.body.velocity);
    this.time.delayedCall(1400, () => fb.destroy());
  }

  private onFireballHit(fb: Phaser.Physics.Arcade.Image, enemy: Enemy): void {
    if (!fb.active || !enemy.active) return;
    fb.destroy();
    if (enemy.hurt(stats.fireDamage)) {
      enemy.destroy();
      this.kills++;
    }
  }

  private damagePlayer(amount: number): void {
    if (this.over || this.time.now < this.invincibleUntil) return;
    this.hp -= amount;
    this.invincibleUntil = this.time.now + 500;
    this.cameras.main.shake(120, 0.006);
    this.player.setTint(0xff9999);
    this.time.delayedCall(150, () => this.player.clearTint());
    if (this.hp <= 0) this.gameOver();
  }

  private gameOver(): void {
    this.over = true;
    this.hp = 0;
    this.drawHud();
    this.physics.pause();
    this.add.rectangle(360, 640, 720, 1280, 0x000000, 0.6).setScrollFactor(0).setDepth(300);
    const style = { fontFamily: 'sans-serif', fontSize: '64px', color: '#ff6b6b', stroke: '#000', strokeThickness: 8 };
    this.add.text(360, 560, '드래곤이 쓰러졌다', style).setOrigin(0.5).setScrollFactor(0).setDepth(301);
    this.add
      .text(360, 660, `버틴 시간 ${this.timeText.text} · 처치 ${this.kills}\n\n화면을 눌러 다시 시작`, { ...style, fontSize: '32px', color: '#ffffff', align: 'center' })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(301);
  }
}
