import Phaser from 'phaser';
import { makeTextures } from '../textures';
import { ENEMIES, type EnemyKind } from '../data/enemies';
import { BASE_STATS, xpToNext, type RunStats } from '../data/stats';
import { rollChoices, type Upgrade } from '../data/upgrades';
import { Enemy } from '../objects/Enemy';

const WORLD_SIZE = 4000; // 맵 한 변 길이(px). 화면보다 훨씬 넓고 카메라가 따라다닌다.
const SPAWN_RADIUS = 820; // 화면 밖(드래곤에서 이만큼 떨어진 곳)에서 적이 나온다.
const MAX_ENEMIES = 220; // 한 번에 살아 있는 적 최대 수(휴대폰 성능 보호)
const UI_DEPTH = 200;

type Mode = 'play' | 'choose' | 'over';

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private enemies!: Phaser.Physics.Arcade.Group;
  private fireballs!: Phaser.Physics.Arcade.Group;
  private bolts!: Phaser.Physics.Arcade.Group;
  private gems!: Phaser.Physics.Arcade.Group;

  private stats: RunStats = { ...BASE_STATS };
  private hp = BASE_STATS.maxHp;
  private level = 1;
  private xp = 0;
  private pendingLevelUps = 0; // 한 번에 여러 레벨이 오르면 카드 선택을 차례로 보여 준다
  private upgradeLevels = new Map<string, number>(); // 카드별로 몇 번 골랐는지
  private invincibleUntil = 0; // 맞은 직후 잠깐 무적(연속으로 피가 녹지 않게)
  private elapsed = 0; // 판 시작 후 지난 시간(ms). 카드 고르는 동안은 멈춘다.
  private fireCooldown = 0;
  private spawnCooldown = 0;
  private kills = 0;
  private mode: Mode = 'play';

  // 화면 고정 UI
  private hpBar!: Phaser.GameObjects.Graphics;
  private timeText!: Phaser.GameObjects.Text;
  private killText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private choiceLayer: Phaser.GameObjects.GameObject[] = [];

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
    this.stats = { ...BASE_STATS };
    this.hp = this.stats.maxHp;
    this.level = 1;
    this.xp = 0;
    this.pendingLevelUps = 0;
    this.upgradeLevels = new Map();
    this.invincibleUntil = 0;
    this.elapsed = 0;
    this.fireCooldown = 0;
    this.spawnCooldown = 0;
    this.kills = 0;
    this.mode = 'play';
    this.choiceLayer = [];
    this.stickPointerId = null;
    this.stickVec.set(0, 0);

    this.physics.resume(); // 게임오버 때 멈춘 물리를 새 판에서 다시 켠다
    this.time.paused = false;
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
    this.gems = this.physics.add.group();

    // 충돌 규칙: 적끼리는 서로 밀어내고(겹쳐 뭉치지 않게), 나머지는 겹침(overlap)으로 판정만 한다.
    this.physics.add.collider(this.enemies, this.enemies);
    this.physics.add.overlap(this.fireballs, this.enemies, (fb, en) => this.onFireballHit(fb as Phaser.Physics.Arcade.Image, en as Enemy));
    this.physics.add.overlap(this.player, this.enemies, (_p, en) => this.damagePlayer((en as Enemy).def.contactDamage));
    this.physics.add.overlap(this.player, this.bolts, (_p, b) => {
      const bolt = b as Phaser.Physics.Arcade.Image;
      this.damagePlayer(bolt.getData('damage') as number);
      bolt.destroy();
    });
    this.physics.add.overlap(this.player, this.gems, (_p, g) => this.collectGem(g as Phaser.Physics.Arcade.Image));

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('up,down,left,right,w,a,s,d') as typeof this.keys;
    // PC에서는 1·2·3 키로도 카드를 고를 수 있다.
    kb.on('keydown', (ev: KeyboardEvent) => {
      const n = Number(ev.key);
      if (this.mode === 'choose' && n >= 1 && n <= 3) this.pickChoice(n - 1);
    });

    this.createHud();
    this.createJoystick();
  }

  // ───────────────────────── UI ─────────────────────────

  private createHud(): void {
    this.hpBar = this.add.graphics().setScrollFactor(0).setDepth(UI_DEPTH);
    const style = { fontFamily: 'sans-serif', fontSize: '34px', color: '#ffffff', stroke: '#000000', strokeThickness: 5 };
    this.timeText = this.add.text(360, 96, '00:00', style).setOrigin(0.5, 0).setScrollFactor(0).setDepth(UI_DEPTH);
    this.killText = this.add.text(690, 24, '처치 0', { ...style, fontSize: '26px' }).setOrigin(1, 0).setScrollFactor(0).setDepth(UI_DEPTH);
    this.levelText = this.add.text(30, 62, 'Lv.1', { ...style, fontSize: '24px' }).setScrollFactor(0).setDepth(UI_DEPTH);
  }

  private drawHud(): void {
    const hpRatio = Phaser.Math.Clamp(this.hp / this.stats.maxHp, 0, 1);
    const xpRatio = Phaser.Math.Clamp(this.xp / xpToNext(this.level), 0, 1);
    const g = this.hpBar.clear();
    g.fillStyle(0x000000, 0.6).fillRoundedRect(30, 26, 360, 28, 8);
    g.fillStyle(hpRatio > 0.3 ? 0x3ddc84 : 0xff5252).fillRoundedRect(34, 30, 352 * hpRatio, 20, 6);
    // 경험치 막대: 화면 맨 위 가로 전체
    g.fillStyle(0x000000, 0.6).fillRect(0, 0, 720, 12);
    g.fillStyle(0x4fc3f7).fillRect(0, 0, 720 * xpRatio, 12);

    const sec = Math.floor(this.elapsed / 1000);
    this.timeText.setText(`${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`);
    this.killText.setText(`처치 ${this.kills}`);
    this.levelText.setText(`Lv.${this.level}`);
  }

  private createJoystick(): void {
    // setScrollFactor(0): 카메라가 움직여도 화면 같은 자리에 붙어 있는 UI
    this.stickBase = this.add.circle(0, 0, 90, 0xffffff, 0.12).setScrollFactor(0).setDepth(100).setVisible(false);
    this.stickKnob = this.add.circle(0, 0, 40, 0xffffff, 0.35).setScrollFactor(0).setDepth(101).setVisible(false);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.mode === 'over') {
        this.scene.restart();
        return;
      }
      if (this.mode !== 'play' || this.stickPointerId !== null) return;
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
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.releaseStick(p.id));
    this.input.on('pointerupoutside', (p: Phaser.Input.Pointer) => this.releaseStick(p.id));
  }

  private releaseStick(id?: number): void {
    if (id !== undefined && id !== this.stickPointerId) return;
    this.stickPointerId = null;
    this.stickVec.set(0, 0);
    this.stickBase.setVisible(false);
    this.stickKnob.setVisible(false);
  }

  // ───────────────────────── 매 프레임 ─────────────────────────

  update(_time: number, delta: number): void {
    if (this.mode !== 'play') return;
    this.elapsed += delta;

    this.movePlayer();
    this.spawnEnemies(delta);
    this.updateEnemies(delta);
    this.autoFire(delta);
    this.pullGems();
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

    this.player.setVelocity(dir.x * this.stats.speed, dir.y * this.stats.speed);
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
    if (!nearest || Phaser.Math.Distance.Between(this.player.x, this.player.y, nearest.x, nearest.y) > this.stats.fireRange) return;

    this.fireCooldown = this.stats.fireInterval;
    const fb = this.physics.add.image(this.player.x, this.player.y, 'fireball').setDepth(9);
    this.fireballs.add(fb);
    fb.setCircle(9);
    this.physics.velocityFromRotation(Phaser.Math.Angle.Between(this.player.x, this.player.y, nearest.x, nearest.y), this.stats.fireSpeed, fb.body.velocity);
    this.time.delayedCall(1400, () => fb.destroy());
  }

  private onFireballHit(fb: Phaser.Physics.Arcade.Image, enemy: Enemy): void {
    if (!fb.active || !enemy.active) return;
    fb.destroy();
    if (enemy.hurt(this.stats.fireDamage)) this.killEnemy(enemy);
  }

  private killEnemy(enemy: Enemy): void {
    this.kills++;
    this.dropGem(enemy.x, enemy.y, enemy.def.xp);
    enemy.destroy();
  }

  // ───────────────────────── 경험치·레벨업 ─────────────────────────

  private dropGem(x: number, y: number, value: number): void {
    const gem = this.physics.add.image(x, y, 'gem').setDepth(5);
    this.gems.add(gem);
    gem.setData('value', value).setScale(value >= 5 ? 1.5 : 1);
  }

  /** 끌어당기는 거리 안의 보석은 드래곤 쪽으로 빨려 온다. */
  private pullGems(): void {
    for (const obj of this.gems.getChildren()) {
      const gem = obj as Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
      const d = Phaser.Math.Distance.Between(gem.x, gem.y, this.player.x, this.player.y);
      if (gem.getData('pulled') || d < this.stats.magnet) {
        gem.setData('pulled', true); // 한번 끌리기 시작하면 끝까지 따라온다
        this.physics.moveToObject(gem, this.player, 600);
      }
    }
  }

  private collectGem(gem: Phaser.Physics.Arcade.Image): void {
    if (!gem.active) return;
    this.xp += gem.getData('value') as number;
    gem.destroy();
    while (this.xp >= xpToNext(this.level)) {
      this.xp -= xpToNext(this.level);
      this.level++;
      this.pendingLevelUps++;
    }
    if (this.pendingLevelUps > 0 && this.mode === 'play') this.openChoice();
  }

  /** 게임을 멈추고 카드 3장을 보여 준다. */
  private openChoice(): void {
    const choices = rollChoices(this.upgradeLevels);
    if (choices.length === 0) {
      // 모든 카드가 최대 레벨이면 체력 회복으로 대신한다.
      this.pendingLevelUps = 0;
      this.hp = this.stats.maxHp;
      return;
    }
    this.mode = 'choose';
    this.physics.pause();
    this.time.paused = true;
    this.releaseStick();
    this.player.setVelocity(0, 0);
    this.drawHud(); // 카드 뒤 HUD에도 오른 레벨이 바로 보이게

    const add =<T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.choiceLayer.push(o);
      return o;
    };
    add(this.add.rectangle(360, 640, 720, 1280, 0x000000, 0.65).setScrollFactor(0).setDepth(UI_DEPTH + 10));
    add(
      this.add
        .text(360, 300, `레벨 업! Lv.${this.level - this.pendingLevelUps + 1}`, {
          fontFamily: 'sans-serif', fontSize: '56px', color: '#ffd34d', stroke: '#000', strokeThickness: 8,
        })
        .setOrigin(0.5).setScrollFactor(0).setDepth(UI_DEPTH + 11),
    );

    choices.forEach((u, i) => {
      const y = 470 + i * 200;
      const next = (this.upgradeLevels.get(u.id) ?? 0) + 1;
      const card = add(
        this.add.rectangle(360, y, 600, 170, 0x22283a).setStrokeStyle(4, 0x8fa3d9).setScrollFactor(0).setDepth(UI_DEPTH + 11),
      );
      card.setInteractive({ useHandCursor: true });
      card.on('pointerover', () => card.setFillStyle(0x2f3a57));
      card.on('pointerout', () => card.setFillStyle(0x22283a));
      card.on('pointerdown', () => this.pickChoice(i));
      const txt = { fontFamily: 'sans-serif', color: '#ffffff' };
      add(this.add.text(100, y, u.icon, { ...txt, fontSize: '64px' }).setOrigin(0.5).setScrollFactor(0).setDepth(UI_DEPTH + 12));
      add(
        this.add.text(160, y - 40, `${i + 1}. ${u.name}  Lv.${next}${next === u.maxLevel ? ' (최대)' : ''}`, { ...txt, fontSize: '34px', fontStyle: 'bold' })
          .setScrollFactor(0).setDepth(UI_DEPTH + 12),
      );
      add(this.add.text(160, y + 10, u.describe(next), { ...txt, fontSize: '26px', color: '#c9d3ee' }).setScrollFactor(0).setDepth(UI_DEPTH + 12));
    });
    this.currentChoices = choices;
  }

  private currentChoices: Upgrade[] = [];

  private pickChoice(index: number): void {
    const u = this.currentChoices[index];
    if (this.mode !== 'choose' || !u) return;
    const next = (this.upgradeLevels.get(u.id) ?? 0) + 1;
    const beforeMax = this.stats.maxHp;
    u.apply(this.stats, next);
    this.hp += this.stats.maxHp - beforeMax; // 최대 체력이 늘면 그만큼 채워 준다
    this.upgradeLevels.set(u.id, next);

    this.choiceLayer.forEach((o) => o.destroy());
    this.choiceLayer = [];
    this.currentChoices = [];
    this.pendingLevelUps--;
    this.mode = 'play';
    this.physics.resume();
    this.time.paused = false;
    if (this.pendingLevelUps > 0) this.openChoice();
  }

  // ───────────────────────── 피해·게임오버 ─────────────────────────

  private damagePlayer(amount: number): void {
    if (this.mode !== 'play' || this.time.now < this.invincibleUntil) return;
    this.hp -= amount * (1 - this.stats.armor);
    this.invincibleUntil = this.time.now + 500;
    this.cameras.main.shake(120, 0.006);
    this.player.setTint(0xff9999);
    this.time.delayedCall(150, () => this.player.clearTint());
    if (this.hp <= 0) this.gameOver();
  }

  private gameOver(): void {
    this.mode = 'over';
    this.hp = 0;
    this.drawHud();
    this.physics.pause();
    this.add.rectangle(360, 640, 720, 1280, 0x000000, 0.6).setScrollFactor(0).setDepth(UI_DEPTH + 100);
    const style = { fontFamily: 'sans-serif', fontSize: '64px', color: '#ff6b6b', stroke: '#000', strokeThickness: 8 };
    this.add.text(360, 560, '드래곤이 쓰러졌다', style).setOrigin(0.5).setScrollFactor(0).setDepth(UI_DEPTH + 101);
    this.add
      .text(360, 660, `버틴 시간 ${this.timeText.text} · Lv.${this.level} · 처치 ${this.kills}\n\n화면을 눌러 다시 시작`, {
        ...style, fontSize: '32px', color: '#ffffff', align: 'center',
      })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(UI_DEPTH + 101);
  }
}
