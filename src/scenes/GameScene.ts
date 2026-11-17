import Phaser from 'phaser';
import { makeTextures } from '../textures';
import { HIT_CAP, type EnemyKind } from '../data/enemies';
import { BASE_STATS, M, xpToNext, type RunStats } from '../data/stats';
import { REWARD, STAGES, type StageData } from '../data/stages';
import { rollOffer, UPGRADES, type Upgrade } from '../data/upgrades';
import { Enemy, type EnemyAction } from '../objects/Enemy';
import { Skills } from '../systems/Skills';
import { BasicAttack, NO_TRAITS } from '../systems/BasicAttack';
import { resolveDamage, type HitSpec } from '../systems/Damage';
import type { CombatHost } from '../systems/CombatHost';
import { StageDirector } from '../systems/StageDirector';
import { buildRunStats, computeRunGold, type GoldBreakdown, type RunOutcome } from '../data/progression';
import { DRAGONS, type DragonDef, type DragonId } from '../data/dragons';
import { setBasicCard } from '../data/upgrades';
import { Progress } from '../systems/Progress';
import { ITEM_RULES, ITEMS, rollNormalDrop, type ItemId } from '../data/items';

const WORLD_SIZE = 2800; // 투기장을 담는 정사각형 세계
const ARENA_R = 22 * M; // 원형 투기장 반지름 22m = 1100px (사용자 결정 2026-11-17)
const UI_DEPTH = 200;
type Mode = 'play' | 'choose' | 'paused' | 'clearing' | 'result';

interface Hazard {
  left: number;
  run: () => void;
  objs: Phaser.GameObjects.GameObject[]; // 예고 그림(클리어 때 함께 지운다)
}

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private enemies!: Phaser.Physics.Arcade.Group;
  private gems!: Phaser.Physics.Arcade.Group;
  private arena = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, r: ARENA_R };

  private stage!: StageData;
  private seed = 0;
  private rng!: Phaser.Math.RandomDataGenerator;
  private director!: StageDirector;
  private stats: RunStats = { ...BASE_STATS };
  private hp = BASE_STATS.maxHp;
  private level = 1;
  private xp = 0;
  private pendingLevelUps = 0;
  /** 선택창 대기열: 레벨업 카드와 스킬 강화 상자가 겹치지 않게 들어온 순서대로 연다(v1.2) */
  private choiceQueue: ('level' | 'box')[] = [];
  private items!: Phaser.Physics.Arcade.Group;
  /** 아이템 전용 난수: 적 생성 난수와 분리해 기존 시드의 적 등장이 그대로 재현되게 함 */
  private itemRng!: Phaser.Math.RandomDataGenerator;
  private shieldUntil = 0; // 용의 수호막 끝나는 시각(elapsed 기준). 0 = 없음
  private shieldFx!: Phaser.GameObjects.Arc;
  /** 아이템 기록(밸런스 확인용): 드롭·획득 개수 */
  itemLog = { drop: {} as Record<string, number>, pick: {} as Record<string, number>, shieldBlocks: 0 };
  private upgradeLevels = new Map<string, number>();
  private basicEverOffered = false;
  private invincibleUntil = 0;
  private invulnerable = false; // 클리어 연출 중 무적
  private elapsed = 0; // 판 시작 후 지난 시간(ms). 카드 고르는 동안은 멈춘다.
  private timeScale = 1; // 보스 처치 순간 0.35배 슬로모션
  private kills = 0;
  private normalKills = 0;
  private eliteKills = 0;
  /** 보물 더미 카드 골드: 전투 중 임시 기록, 끝날 때 정산(v1.1) */
  private treasureGold = 0;
  /** 이번 판 고유 번호: 같은 판 보상을 두 번 주지 않기 위함 */
  private runId = '';
  private settled = false;
  /** 연구소 생명력 강화로 늘어난 최대 HP. 35% 피해 상한 계산에서는 뺀다(v1.1 3번) */
  private permHpBonus = 0;
  /** 이번 판에 출격한 드래곤(전투 중에는 바뀌지 않음) */
  dragon: DragonDef = DRAGONS.red;
  private traitMult = 1;
  private ticketRewards: { text: string; tickets: number }[] = [];
  private pauseLayer: Phaser.GameObjects.GameObject[] = [];
  private mode: Mode = 'play';
  private facing = new Phaser.Math.Vector2(0, -1);
  private skills!: Skills;
  private basic!: BasicAttack;
  private basicTraits = NO_TRAITS;
  private hazards: Hazard[] = [];
  private currentChoices: Upgrade[] = [];
  /** 전투 로그: 공격 원천별 누적 피해(밸런스 검증용) */
  dmgLog: Record<string, number> = {};
  /** 스테이지 이벤트 기록(기획서 17장): 테스트·밸런스 확인용 */
  stageLog: { name: string; at: number; data?: unknown }[] = [];

  // 화면 고정 UI
  private hud!: Phaser.GameObjects.Graphics;
  private timeText!: Phaser.GameObjects.Text;
  private killText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private skillText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private bossText!: Phaser.GameObjects.Text;
  private shieldText!: Phaser.GameObjects.Text;
  private eliteText!: Phaser.GameObjects.Text;
  private choiceLayer: Phaser.GameObjects.GameObject[] = [];
  private edgeArrows: { x: number; y: number; until: number; color: number }[] = [];

  // 터치 조이스틱
  private stickBase!: Phaser.GameObjects.Arc;
  private stickKnob!: Phaser.GameObjects.Arc;
  private stickPointerId: number | null = null;
  private stickVec = new Phaser.Math.Vector2();

  private forcedDragon?: DragonId;

  constructor() {
    super('game');
  }

  init(data: { stageId?: number; seed?: number; dragonId?: DragonId }): void {
    this.forcedDragon = data?.dragonId;
    this.stage = STAGES.find((s) => s.id === (data?.stageId ?? 1)) ?? STAGES[0];
    // 시드: 주소에 ?seed=123 이 있으면 그 값, 아니면 무작위. 같은 시드면 적 생성·위치가 똑같이 재현된다.
    const urlSeed = Number(new URLSearchParams(location.search).get('seed'));
    this.seed = data?.seed ?? (Number.isFinite(urlSeed) && urlSeed > 0 ? urlSeed : Math.floor(Math.random() * 1e9));
  }

  create(): void {
    // scene.restart() 때 필드가 이전 판 값을 들고 있으므로 전부 다시 초기화한다(완료 기준: 재도전 시 정상 초기화).
    this.rng = new Phaser.Math.RandomDataGenerator([String(this.seed)]);
    // 출격 드래곤 확인 → 연구소·드래곤 레벨·승급을 판 시작 때 한 번만 적용해 고정(전투 중에는 바뀌지 않음)
    const prog = Progress.load();
    const did = this.forcedDragon && prog.ownedDragons[this.forcedDragon] ? this.forcedDragon : prog.selectedDragonId;
    this.dragon = DRAGONS[did] ?? DRAGONS.red;
    const owned = prog.ownedDragons[this.dragon.id] ?? { level: 1, stars: 1 };
    const built = buildRunStats(this.dragon, prog.upgrades, owned);
    this.stats = built.stats;
    this.permHpBonus = built.permHpBonus;
    this.traitMult = built.traitMult;
    this.basicTraits = built.traits;
    this.ticketRewards = [];
    setBasicCard(this.dragon.basic);
    this.hp = this.stats.maxHp;
    this.level = 1;
    this.xp = 0;
    this.pendingLevelUps = 0;
    this.choiceQueue = [];
    this.itemRng = new Phaser.Math.RandomDataGenerator([`${this.seed}:items`]);
    this.shieldUntil = 0;
    this.itemLog = { drop: {}, pick: {}, shieldBlocks: 0 };
    this.upgradeLevels = new Map([['basic', 1]]);
    this.basicEverOffered = false;
    this.invincibleUntil = 0;
    this.invulnerable = false;
    this.elapsed = 0;
    this.timeScale = 1;
    this.kills = 0;
    this.normalKills = 0;
    this.eliteKills = 0;
    this.treasureGold = 0;
    this.runId = `${this.stage.id}-${this.seed}-${Date.now()}`;
    this.settled = false;
    this.pauseLayer = [];
    this.mode = 'play';
    this.facing.set(0, -1);
    this.hazards = [];
    this.currentChoices = [];
    this.choiceLayer = [];
    this.edgeArrows = [];
    this.dmgLog = {};
    this.stageLog = [];
    this.stickPointerId = null;
    this.stickVec.set(0, 0);
    this.physics.resume();
    this.physics.world.timeScale = 1;
    this.tweens.timeScale = 1;
    this.time.paused = false;
    if (!this.textures.exists('dragon-red')) makeTextures(this);

    this.drawArena();
    this.physics.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    this.cameras.main.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);

    this.player = this.physics.add.image(this.arena.x, this.arena.y + ARENA_R * 0.4, `dragon-${this.dragon.id}`).setDepth(10);
    this.player.setCircle(18, 14, 18);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);

    this.enemies = this.physics.add.group();
    this.gems = this.physics.add.group();
    this.physics.add.collider(this.enemies, this.enemies);
    this.physics.add.overlap(this.player, this.enemies, (_p, en) => {
      const e = en as Enemy;
      this.damagePlayer(e.def.contactDamage * (e.dashing ? 1.5 : 1) * e.damageMult, e);
    });
    this.physics.add.overlap(this.player, this.gems, (_p, g) => this.collectGem(g as Phaser.Physics.Arcade.Image));
    this.items = this.physics.add.group();
    this.physics.add.overlap(this.player, this.items, (_p, it) => this.pickItem(it as Phaser.Physics.Arcade.Image));
    this.shieldFx = this.add.circle(0, 0, 44, 0x9be7ff, 0.15).setStrokeStyle(4, 0x9be7ff, 0.9).setDepth(11).setVisible(false);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('up,down,left,right,w,a,s,d') as typeof this.keys;
    kb.on('keydown', (ev: KeyboardEvent) => {
      const n = Number(ev.key);
      if (this.mode === 'choose' && n >= 1 && n <= 3) this.pickChoice(n - 1);
      if (this.mode === 'result' && (ev.key === 'r' || ev.key === 'R')) this.retry();
      if (ev.key === 'Escape' || ev.key === 'p' || ev.key === 'P') {
        if (this.mode === 'play') this.openPause();
        else if (this.mode === 'paused') this.closePause();
      }
    });

    const host: CombatHost = {
      scene: this,
      player: this.player,
      facing: this.facing,
      stats: this.stats,
      enemies: () => this.enemies.getChildren() as Enemy[],
      level: (id) => this.upgradeLevels.get(id) ?? 0,
      hit: (e, spec) => this.hitEnemy(e, spec),
      heal: (pct) => {
        const amount = Math.min(this.stats.maxHp - this.hp, this.stats.maxHp * pct);
        if (amount <= 0) return;
        this.hp += amount;
        this.popText(this.player.x, this.player.y - 50, `+${amount.toFixed(1)}`, '#fff3c4');
      },
    };
    this.basic = new BasicAttack(host, this.dragon.basic, this.basicTraits);
    this.skills = new Skills(host);

    this.createHud();
    this.createJoystick();

    this.director = new StageDirector(
      {
        rng: this.rng,
        playerPos: () => new Phaser.Math.Vector2(this.player.x, this.player.y),
        arena: this.arena,
        spawn: (kind, x, y, hpMult) => this.spawnEnemy(kind, x, y, hpMult),
        enemyCount: () => this.enemies.countActive(),
        warnSpawn: (x, y, ms, color) => this.warnSpawn(x, y, ms, color),
        banner: (t, c) => this.banner(t, c),
        darken: (ms) => this.darken(ms),
        emit: (name, data) => this.stageLog.push({ name, at: Math.round(this.elapsed), data }),
        fail: (reason) => this.fail(reason),
      },
      this.stage,
    );
    this.banner(`${this.stage.id}단계 — ${this.stage.name}`, '#e0e0e0');
  }

  /** 원형 투기장: 안쪽은 잿빛 돌바닥, 가장자리는 돌벽, 바깥은 어둠 */
  private drawArena(): void {
    const { x, y, r } = this.arena;
    this.add.rectangle(0, 0, WORLD_SIZE, WORLD_SIZE, 0x0d0f14).setOrigin(0);
    const floor = this.add.tileSprite(0, 0, WORLD_SIZE, WORLD_SIZE, 'ground').setOrigin(0);
    const mask = this.make.graphics({}, false).fillStyle(0xffffff).fillCircle(x, y, r);
    floor.setMask(mask.createGeometryMask());
    const g = this.add.graphics();
    g.lineStyle(4, 0x6b2a2a, 0.35).strokeCircle(x, y, r * 0.35).strokeCircle(x, y, r * 0.7); // 바닥 문양
    g.lineStyle(40, 0x24252b).strokeCircle(x, y, r + 20); // 벽
    g.lineStyle(6, 0x6d6e78).strokeCircle(x, y, r);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.fillStyle(0x3b3d46).fillRect(x + Math.cos(a) * (r + 22) - 14, y + Math.sin(a) * (r + 22) - 14, 28, 28); // 벽 돌기둥
    }
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number, hpMult: number): Enemy {
    const e = new Enemy(this, x, y, kind, hpMult);
    this.enemies.add(e);
    return e;
  }

  // ───────────────────────── UI ─────────────────────────

  private createHud(): void {
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(UI_DEPTH);
    const style = { fontFamily: 'sans-serif', fontSize: '34px', color: '#ffffff', stroke: '#000000', strokeThickness: 5 };
    this.timeText = this.add.text(360, 96, '00:00', style).setOrigin(0.5, 0).setScrollFactor(0).setDepth(UI_DEPTH);
    this.killText = this.add.text(690, 24, '처치 0', { ...style, fontSize: '26px' }).setOrigin(1, 0).setScrollFactor(0).setDepth(UI_DEPTH);
    this.levelText = this.add.text(30, 62, 'Lv.1', { ...style, fontSize: '24px' }).setScrollFactor(0).setDepth(UI_DEPTH);
    this.hpText = this.add.text(210, 40, '', { ...style, fontSize: '20px', strokeThickness: 4 }).setOrigin(0.5).setScrollFactor(0).setDepth(UI_DEPTH + 1);
    this.skillText = this.add.text(110, 62, '', { ...style, fontSize: '22px', lineSpacing: 6 }).setScrollFactor(0).setDepth(UI_DEPTH);
    this.bossText = this.add.text(360, 186, '', { ...style, fontSize: '24px', align: 'center' }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(UI_DEPTH + 1);
    this.eliteText = this.add.text(360, 232, '', { ...style, fontSize: '20px', align: 'center' }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(UI_DEPTH + 1);
    this.shieldText = this.add.text(360, 140, '', { ...style, fontSize: '22px', color: '#9be7ff' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(UI_DEPTH);
    // 일시정지 버튼(휴대폰용). PC는 ESC·P 키.
    const pause = this.add.circle(670, 140, 32, 0x000000, 0.55).setStrokeStyle(3, 0xffffff, 0.7).setScrollFactor(0).setDepth(UI_DEPTH + 2);
    this.add.text(670, 140, 'II', { ...style, fontSize: '28px', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(UI_DEPTH + 3);
    pause.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.openPause());
  }

  private drawHud(): void {
    const d = this.director;
    const hpRatio = Phaser.Math.Clamp(this.hp / this.stats.maxHp, 0, 1);
    const xpRatio = Phaser.Math.Clamp(this.xp / xpToNext(this.level), 0, 1);
    const g = this.hud.clear();
    g.fillStyle(0x000000, 0.6).fillRoundedRect(30, 26, 360, 28, 8);
    g.fillStyle(hpRatio > 0.3 ? 0x3ddc84 : 0xff5252).fillRoundedRect(34, 30, 352 * hpRatio, 20, 6);
    g.fillStyle(0x000000, 0.6).fillRect(0, 0, 720, 12);
    g.fillStyle(0x4fc3f7).fillRect(0, 0, 720 * xpRatio, 12);

    // 엘리트 슬롯(마름모 2개): 회색 대기 · 주황 등장 · 녹색 처치 · 붉은색 흡수
    const slotColor = { pending: 0x555555, warning: 0xffb74d, alive: 0xffb74d, killed: 0x3ddc84, absorbed: 0xff1744 };
    d.eliteSlots.forEach((st, i) => {
      const cx = 600 + i * 40;
      const cy = 80;
      g.fillStyle(slotColor[st]).fillTriangle(cx, cy - 14, cx + 12, cy, cx - 12, cy).fillTriangle(cx, cy + 14, cx + 12, cy, cx - 12, cy);
    });

    const boss = d.boss?.active ? d.boss : null;
    if (boss) {
      // 보스: 화면 전체 너비 체력바 + 60% 패턴 변화 지점 표시
      const r = Phaser.Math.Clamp(boss.hp / boss.maxHp, 0, 1);
      g.fillStyle(0x000000, 0.75).fillRect(20, 192, 680, 24);
      g.fillStyle(d.enraged ? 0xff1744 : 0xc62828).fillRect(23, 195, 674 * r, 18);
      g.fillStyle(0xffffff).fillRect(23 + 674 * 0.6 - 2, 190, 4, 28);
      this.bossText.setText(`${boss.def.name}${d.enraged ? ' — 격노!' : boss.phase === 2 ? ' — 분노' : ''}`);
      this.eliteText.setText(d.bossBuffs.length ? `잔존 엘리트: ${d.bossBuffs.join(' · ')}` : '');
      this.eliteText.setY(244);
    } else {
      this.bossText.setText('');
      // 엘리트: 보스바보다 작은 전용 체력바(살아 있는 엘리트마다)
      const alive = d.elites.filter((e): e is Enemy => !!e?.active);
      alive.forEach((e, i) => {
        const y = 196 + i * 40;
        const r = Phaser.Math.Clamp(e.hp / e.maxHp, 0, 1);
        g.fillStyle(0x000000, 0.7).fillRect(160, y, 400, 14);
        g.fillStyle(0xff9800).fillRect(162, y + 2, 396 * r, 10);
      });
      this.eliteText.setY(192).setText(alive.map((e) => `엘리트 ${e.eliteSlot} · ${e.def.name}`).join('\n'));
      this.eliteText.setLineSpacing(18);
    }

    // 화면 밖 등장 위치를 가리키는 가장자리 화살표
    const cam = this.cameras.main;
    this.edgeArrows = this.edgeArrows.filter((a) => a.until > this.elapsed);
    for (const a of this.edgeArrows) {
      const sx = a.x - cam.worldView.x;
      const sy = a.y - cam.worldView.y;
      if (sx > 0 && sx < 720 && sy > 0 && sy < 1280) continue;
      const ang = Math.atan2(sy - 640, sx - 360);
      const ex = Phaser.Math.Clamp(360 + Math.cos(ang) * 1000, 40, 680);
      const ey = Phaser.Math.Clamp(640 + Math.sin(ang) * 1000, 260, 1240);
      const blink = Math.floor(this.elapsed / 250) % 2 === 0 ? 1 : 0.5;
      g.fillStyle(a.color, blink).fillTriangle(
        ex + Math.cos(ang) * 26, ey + Math.sin(ang) * 26,
        ex + Math.cos(ang + 2.4) * 22, ey + Math.sin(ang + 2.4) * 22,
        ex + Math.cos(ang - 2.4) * 22, ey + Math.sin(ang - 2.4) * 22,
      );
    }

    const sec = Math.floor(this.elapsed / 1000);
    const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    this.timeText.setText(`${fmt(sec)} / ${fmt(this.stage.durationMs / 1000)}`);
    this.timeText.setColor(d.enraged ? '#ff5252' : '#ffffff');
    this.killText.setText(`처치 ${this.kills}`);
    this.levelText.setText(`Lv.${this.level}`);
    const sh = this.shieldUntil - this.elapsed;
    this.shieldText.setText(sh > 0 ? `🛡 수호막 ${Math.ceil(sh / 1000)}초` : '');
    this.hpText.setText(`${Math.max(0, Math.ceil(this.hp))} / ${Math.round(this.stats.maxHp)}`);
    const icons = (kinds: string[]) =>
      UPGRADES.filter((u) => kinds.includes(u.kind) && (this.upgradeLevels.get(u.id) ?? 0) > 0)
        .map((u) => `${u.icon}${this.upgradeLevels.get(u.id)}`)
        .join(' ');
    this.skillText.setText(`${icons(['basic', 'active'])}\n${icons(['passive'])}`);
  }

  private banner(text: string, color: string): void {
    const t = this.add
      .text(360, 420, text, { fontFamily: 'sans-serif', fontSize: '44px', fontStyle: 'bold', color, stroke: '#000', strokeThickness: 8, align: 'center' })
      .setOrigin(0.5).setScrollFactor(0).setDepth(UI_DEPTH + 5);
    this.tweens.add({ targets: t, alpha: 0, delay: 1800, duration: 600, onComplete: () => t.destroy() });
  }

  /** 등장 위치 경고: 바닥에 깜박이는 원 + 화면 밖이면 가장자리 화살표 */
  private warnSpawn(x: number, y: number, ms: number, color: number): void {
    const c = this.add.circle(x, y, 70, color, 0.2).setStrokeStyle(6, color, 0.9).setDepth(3);
    this.tweens.add({ targets: c, scale: 1.3, alpha: 0.5, yoyo: true, repeat: -1, duration: 400 });
    this.hazards.push({ left: ms, run: () => c.destroy(), objs: [c] });
    this.edgeArrows.push({ x, y, until: this.elapsed + ms, color });
  }

  /** 보스 경고: 화면이 어두워졌다가 돌아온다 */
  private darken(ms: number): void {
    const o = this.add.rectangle(360, 640, 720, 1280, 0x000000, 0).setScrollFactor(0).setDepth(UI_DEPTH - 1);
    this.tweens.add({ targets: o, fillAlpha: 0.45, duration: 800, hold: ms - 1600, yoyo: true, onComplete: () => o.destroy() });
    this.cameras.main.shake(400, 0.004);
  }

  private createJoystick(): void {
    this.stickBase = this.add.circle(0, 0, 90, 0xffffff, 0.12).setScrollFactor(0).setDepth(100).setVisible(false);
    this.stickKnob = this.add.circle(0, 0, 40, 0xffffff, 0.35).setScrollFactor(0).setDepth(101).setVisible(false);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.mode !== 'play' || this.stickPointerId !== null || over.length > 0) return; // 버튼 위면 조이스틱 X
      this.stickPointerId = p.id;
      this.stickBase.setPosition(p.x, p.y).setVisible(true);
      this.stickKnob.setPosition(p.x, p.y).setVisible(true);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.id !== this.stickPointerId) return;
      this.stickVec.set(p.x - this.stickBase.x, p.y - this.stickBase.y);
      const len = Math.min(this.stickVec.length(), 90);
      this.stickVec.normalize();
      this.stickKnob.setPosition(this.stickBase.x + this.stickVec.x * len, this.stickBase.y + this.stickVec.y * len);
      this.stickVec.scale(len / 90);
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

  update(_time: number, rawDelta: number): void {
    if (this.mode !== 'play' && this.mode !== 'clearing') return;
    const delta = rawDelta * this.timeScale;
    if (this.mode === 'clearing') {
      this.movePlayer();
      this.pullGems(true);
      return;
    }
    this.elapsed += delta;

    this.movePlayer();
    this.director.update(this.elapsed, delta);
    if (this.mode !== 'play') return; // 시간 초과 실패 등
    this.hazards = this.hazards.filter((t) => {
      t.left -= delta;
      if (t.left > 0) return true;
      t.run();
      return false;
    });
    this.updateEnemies(delta);
    this.basic.update(delta);
    this.skills.update(delta);
    this.pullGems(false);
    this.updateItems();
    this.drawHud();
  }

  private movePlayer(): void {
    const k = this.keys;
    const dir = new Phaser.Math.Vector2(
      (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0),
      (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0),
    );
    if (dir.lengthSq() > 0) dir.normalize();
    else dir.copy(this.stickVec);
    this.player.setVelocity(dir.x * this.stats.speed, dir.y * this.stats.speed);
    if (dir.lengthSq() > 0.01) {
      this.player.setRotation(dir.angle() + Math.PI / 2);
      this.facing.copy(dir).normalize();
    }
    this.keepInArena(this.player, 20);
  }

  /** 원형 벽 밖으로 나가지 못하게 안쪽으로 되돌린다 */
  private keepInArena(o: Phaser.GameObjects.Image, radius: number): void {
    const dx = o.x - this.arena.x;
    const dy = o.y - this.arena.y;
    const d = Math.hypot(dx, dy);
    const max = this.arena.r - radius;
    if (d > max) o.setPosition(this.arena.x + (dx / d) * max, this.arena.y + (dy / d) * max);
  }

  private updateEnemies(delta: number): void {
    const target = new Phaser.Math.Vector2(this.player.x, this.player.y);
    for (const obj of [...this.enemies.getChildren()]) {
      const e = obj as Enemy;
      if (!e.active) continue;
      for (const act of e.step(target, delta, this.arena)) this.doEnemyAction(e, act);
      this.keepInArena(e, e.def.radius);
      const burnCoef = e.tickBurn(delta);
      if (burnCoef > 0) this.hitEnemy(e, { source: 'dot', coef: burnCoef, tag: 'burn' });
      if (!e.active) continue;
      const poisonCoef = e.tickPoison(delta);
      if (poisonCoef > 0) this.hitEnemy(e, { source: 'dot', coef: poisonCoef, tag: 'poison' });
    }
  }

  /** 적의 행동을 그림과 판정으로 바꾼다. 위험 공격은 붉은 바닥 예고 → 시간이 지나면 판정. */
  private doEnemyAction(e: Enemy, act: EnemyAction): void {
    switch (act.kind) {
      case 'lineWarn': {
        const g = this.add.graphics().setDepth(4);
        g.lineStyle(act.width, 0xff1744, 0.3);
        if (act.curve) {
          // 초승달 돌진: 휘는 경로를 점으로 이어 그린다
          const steps = 16;
          const sp = act.length / (act.length / 720 || 1);
          let ang = act.angle;
          let x = act.x;
          let y = act.y;
          g.beginPath().moveTo(x, y);
          const dt = act.length / sp / steps;
          for (let i = 0; i < steps; i++) {
            ang += act.curve * dt;
            x += Math.cos(ang) * sp * dt;
            y += Math.sin(ang) * sp * dt;
            g.lineTo(x, y);
          }
          g.strokePath();
        } else {
          g.lineBetween(act.x, act.y, act.x + Math.cos(act.angle) * act.length, act.y + Math.sin(act.angle) * act.length);
        }
        this.hazards.push({ left: act.ms, run: () => g.destroy(), objs: [g] });
        break;
      }
      case 'circleHit': {
        const warn = this.add.circle(act.x, act.y, act.r, 0xff1744, 0.12).setStrokeStyle(5, 0xff1744, 0.9).setDepth(4);
        const fill = this.add.circle(act.x, act.y, 1, 0xff1744, 0.25).setDepth(4);
        this.tweens.add({ targets: fill, radius: act.r, duration: act.ms });
        const dmg = act.damage * e.damageMult;
        this.hazards.push({
          left: act.ms,
          objs: [warn, fill],
          run: () => {
            warn.destroy();
            fill.destroy();
            const boom = this.add.circle(act.x, act.y, act.r, 0xffcc80, 0.55).setDepth(8);
            this.tweens.add({ targets: boom, alpha: 0, duration: 300, onComplete: () => boom.destroy() });
            this.cameras.main.shake(150, 0.008);
            if (Phaser.Math.Distance.Between(act.x, act.y, this.player.x, this.player.y) < act.r + 18) this.damagePlayer(dmg, e, true);
          },
        });
        break;
      }
      case 'coneHit': {
        const g = this.add.graphics({ x: act.x, y: act.y }).setDepth(4);
        g.fillStyle(0xff1744, 0.18).slice(0, 0, act.r, act.angle - act.half, act.angle + act.half).fillPath();
        g.lineStyle(4, 0xff1744, 0.9).slice(0, 0, act.r, act.angle - act.half, act.angle + act.half).strokePath();
        const dmg = act.damage * e.damageMult;
        this.hazards.push({
          left: act.ms,
          objs: [g],
          run: () => {
            g.destroy();
            const slash = this.add.graphics({ x: act.x, y: act.y }).setDepth(8);
            slash.fillStyle(0xffffff, 0.5).slice(0, 0, act.r, act.angle - act.half, act.angle + act.half).fillPath();
            this.tweens.add({ targets: slash, alpha: 0, duration: 250, onComplete: () => slash.destroy() });
            const d = Phaser.Math.Distance.Between(act.x, act.y, this.player.x, this.player.y);
            const a = Phaser.Math.Angle.Between(act.x, act.y, this.player.x, this.player.y);
            if (d < act.r + 18 && Math.abs(Phaser.Math.Angle.Wrap(a - act.angle)) <= act.half) this.damagePlayer(dmg, e, true);
          },
        });
        break;
      }
      case 'summon': {
        for (let i = 0; i < act.count; i++) {
          const a = (i / act.count) * Math.PI * 2;
          const w = this.spawnEnemy(act.enemy, act.x + Math.cos(a) * 90, act.y + Math.sin(a) * 90, 1);
          w.damageMult = e.damageMult;
        }
        this.cameras.main.shake(200, 0.004);
        break;
      }
    }
  }

  /** 모든 공격(기본공격·스킬·화상)이 적에게 피해를 줄 때 거치는 한 곳 */
  private hitEnemy(enemy: Enemy, spec: HitSpec): boolean {
    if (!enemy.active || this.mode !== 'play') return false;
    const { amount, crit } = resolveDamage(this.stats, { ...spec, bonus: this.damageBonus(enemy, spec) });
    const tag = spec.tag ?? spec.source;
    this.dmgLog[tag] = (this.dmgLog[tag] ?? 0) + amount;
    if (crit) this.popText(enemy.x, enemy.y - 20, `${Math.round(amount)}!`, '#ffd34d');
    if (enemy.hurt(amount)) {
      this.killEnemy(enemy, tag);
      return true;
    }
    return false;
  }

  /**
   * 대상에 따라 붙는 추가 배율: 드래곤 고유 특성(별 등급 강화 반영) × 감전.
   * 특성은 지속 피해(화상·중독 틱)에는 붙지 않는다.
   */
  private damageBonus(e: Enemy, spec: HitSpec): number {
    const t = this.dragon.trait;
    const v = t.value * this.traitMult;
    let add = 0;
    if (spec.source !== 'dot') {
      if (t.id === 'burnBonus' && e.burnCount > 0) add += v; // 레드: 화상 상태 적 +10%
      if (t.id === 'slowBonus' && e.slowed) add += v; // 블루: 둔화된 적 +20%
      if (t.id === 'execute' && spec.source === 'basic' && e.hp <= e.maxHp * 0.3) add += v; // 블랙: HP 30% 이하 +20%(기본 공격)
    }
    return (1 + add) * e.vulnMult;
  }

  private popText(x: number, y: number, text: string, color: string): void {
    const t = this.add.text(x, y, text, { fontFamily: 'sans-serif', fontSize: '26px', fontStyle: 'bold', color, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 600, onComplete: () => t.destroy() });
  }

  private killEnemy(enemy: Enemy, tag = ''): void {
    this.kills++;
    this.basic.onKill(enemy, tag.startsWith('basic'));
    if (enemy.rank === 'normal') this.normalKills++;
    const d = this.director;
    if (enemy === d.boss) {
      d.onBossKilled(this.elapsed);
      enemy.destroy();
      this.clearSequence();
      return;
    }
    if (enemy.rank === 'elite' && d.onEliteKilled(enemy, this.elapsed)) {
      this.eliteKills++; // onEliteKilled가 슬롯마다 한 번만 true → 엘리트 보상도 한 번만
      this.spawnItem('box', enemy.x, enemy.y, true); // 엘리트: 스킬 강화 상자 확정(획득 전까지 유지)
      // 엘리트 처치 보상(한 번만): 대형 경험치 결정 + 최대 HP 12% 회복
      this.dropGem(enemy.x, enemy.y, enemy.def.xp);
      this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * REWARD.eliteHeal);
      this.popText(this.player.x, this.player.y - 50, `+${Math.round(this.stats.maxHp * REWARD.eliteHeal)} HP`, '#3ddc84');
    } else if (enemy.rank === 'normal') {
      this.dropGem(enemy.x, enemy.y, enemy.def.xp);
      const drop = rollNormalDrop(this.itemRng.frac()); // 처치마다 한 번, 최대 1종
      if (drop) this.spawnItem(drop, enemy.x, enemy.y, false);
    }
    enemy.destroy();
  }

  // ───────────────────────── 경험치·레벨업 ─────────────────────────

  private dropGem(x: number, y: number, value: number): void {
    const gem = this.physics.add.image(x, y, 'gem').setDepth(5);
    this.gems.add(gem);
    gem.setData('value', value).setScale(value >= 20 ? 2.4 : value >= 2 ? 1.3 : 1);
  }

  private pullGems(all: boolean): void {
    for (const obj of this.gems.getChildren()) {
      const gem = obj as Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
      const d = Phaser.Math.Distance.Between(gem.x, gem.y, this.player.x, this.player.y);
      if (all || gem.getData('pulled') || d < this.stats.magnet) {
        gem.setData('pulled', true);
        this.physics.moveToObject(gem, this.player, all || gem.getData('magnet') ? 1400 : 600);
      }
    }
  }

  private collectGem(gem: Phaser.Physics.Arcade.Image): void {
    if (!gem.active) return;
    this.xp += (gem.getData('value') as number) * this.stats.xpMult;
    gem.destroy();
    if (this.mode === 'clearing') return; // 클리어 중 회수한 경험치는 레벨업 카드를 띄우지 않는다
    while (this.xp >= xpToNext(this.level)) {
      this.xp -= xpToNext(this.level);
      this.level++;
      this.pendingLevelUps++;
      this.choiceQueue.push('level');
    }
    this.openNext();
  }

  /** 대기열 맨 앞의 선택창을 연다(전투 중일 때만). 레벨업이 여러 번이면 하나씩 차례로. */
  private openNext(): void {
    if (this.mode !== 'play' || this.choiceQueue.length === 0) return;
    if (this.choiceQueue[0] === 'level') this.openChoice();
    else this.openBox();
  }

  private openChoice(): void {
    const reached = this.level - this.pendingLevelUps + 1;
    const choices = rollOffer({ levels: this.upgradeLevels, playerLevel: reached, basicEverOffered: this.basicEverOffered }, () => this.rng.frac());
    if (choices.some((u) => u.kind === 'basic')) this.basicEverOffered = true;
    this.showCards(`레벨 업! Lv.${reached}`, '', choices, false);
  }

  /** 스킬 강화 상자: 이미 가진 기본공격·액티브 중 더 올릴 수 있는 것 최대 3개 (새 스킬 없음) */
  private boxCandidates(): Upgrade[] {
    return UPGRADES.filter((u) => (u.kind === 'basic' || u.kind === 'active') && (this.upgradeLevels.get(u.id) ?? 0) > 0 && (this.upgradeLevels.get(u.id) ?? 0) < u.maxLevel);
  }

  private openBox(): void {
    const pool = this.boxCandidates();
    if (pool.length === 0) {
      // 그사이 모두 최대 레벨이 됐으면 회복 물약으로 대체
      this.choiceQueue.shift();
      this.applyItem('potion');
      this.openNext();
      return;
    }
    const choices = this.itemRng.shuffle([...pool]).slice(0, ITEM_RULES.boxChoices);
    this.showCards('스킬 강화 상자', '보유 스킬 중 하나를 골라 레벨을 올리세요', choices, true);
  }

  private showCards(title: string, subtitle: string, choices: Upgrade[], isBox: boolean): void {
    this.mode = 'choose';
    this.physics.pause();
    this.time.paused = true;
    this.releaseStick();
    this.player.setVelocity(0, 0);
    this.drawHud();

    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.choiceLayer.push(o);
      return o;
    };
    add(this.add.rectangle(360, 640, 720, 1280, 0x000000, 0.65).setScrollFactor(0).setDepth(UI_DEPTH + 10));
    add(
      this.add
        .text(360, 300, title, { fontFamily: 'sans-serif', fontSize: '56px', color: isBox ? '#ffe082' : '#ffd34d', stroke: '#000', strokeThickness: 8 })
        .setOrigin(0.5).setScrollFactor(0).setDepth(UI_DEPTH + 11),
    );
    if (subtitle)
      add(this.add.text(360, 365, subtitle, { fontFamily: 'sans-serif', fontSize: '26px', color: '#ffffff' }).setOrigin(0.5).setScrollFactor(0).setDepth(UI_DEPTH + 11));
    choices.forEach((u, i) => {
      const y = 470 + i * 200;
      const next = (this.upgradeLevels.get(u.id) ?? 0) + 1;
      const tag =
        isBox ? `Lv.${next - 1} → Lv.${next}${next === u.maxLevel ? (u.kind === 'basic' ? ' 진화!' : ' (최대)') : ''}` :
        u.kind === 'filler' ? '' :
        u.kind === 'basic' ? `기본공격 Lv.${next}${next === u.maxLevel ? ' 진화!' : ''}` :
        next === 1 ? (u.kind === 'active' ? '새 스킬!' : '새 패시브!') :
        `Lv.${next}${next === u.maxLevel ? ' (최대)' : ''}`;
      const border = { basic: 0xff7043, active: 0x8fa3d9, passive: 0x7bd88f, filler: 0xb0b0b0 }[u.kind];
      const card = add(this.add.rectangle(360, y, 600, 170, 0x22283a).setStrokeStyle(4, isBox ? 0xffd34d : border).setScrollFactor(0).setDepth(UI_DEPTH + 11));
      card.setInteractive({ useHandCursor: true });
      card.on('pointerover', () => card.setFillStyle(0x2f3a57));
      card.on('pointerout', () => card.setFillStyle(0x22283a));
      card.on('pointerdown', () => this.pickChoice(i));
      const txt = { fontFamily: 'sans-serif', color: '#ffffff' };
      add(this.add.text(100, y, u.icon, { ...txt, fontSize: '64px' }).setOrigin(0.5).setScrollFactor(0).setDepth(UI_DEPTH + 12));
      add(this.add.text(160, y - 40, `${i + 1}. ${u.name}  ${tag}`, { ...txt, fontSize: '34px', fontStyle: 'bold' }).setScrollFactor(0).setDepth(UI_DEPTH + 12));
      add(this.add.text(160, y + 10, u.describe(next), { ...txt, fontSize: '24px', color: '#c9d3ee', wordWrap: { width: 500 } }).setScrollFactor(0).setDepth(UI_DEPTH + 12));
    });
    this.currentChoices = choices;
  }

  private pickChoice(index: number): void {
    const u = this.currentChoices[index];
    if (this.mode !== 'choose' || !u) return;
    if (u.id === 'heal') this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * 0.3);
    else if (u.id === 'gold') this.treasureGold += 20;
    else {
      const next = (this.upgradeLevels.get(u.id) ?? 0) + 1;
      const beforeMax = this.stats.maxHp;
      u.apply?.(this.stats, next);
      this.hp += this.stats.maxHp - beforeMax;
      this.upgradeLevels.set(u.id, next);
    }
    this.choiceLayer.forEach((o) => o.destroy());
    this.choiceLayer = [];
    this.currentChoices = [];
    if (this.choiceQueue.shift() === 'level') this.pendingLevelUps--;
    this.mode = 'play';
    this.physics.resume();
    this.time.paused = false;
    this.openNext();
  }

  // ───────────────────────── 전투 아이템 (v1.2) ─────────────────────────

  /** 몬스터가 죽은 자리에 아이템 생성. 투기장 밖이면 안쪽으로 당긴다. persistent = 엘리트 확정 상자 */
  private spawnItem(id: ItemId, x: number, y: number, persistent: boolean): void {
    if (id === 'box' && this.boxCandidates().length === 0) id = 'potion'; // 모든 스킬 만렙이면 물약으로
    const v = new Phaser.Math.Vector2(x - this.arena.x, y - this.arena.y);
    const maxR = this.arena.r - 50;
    if (v.length() > maxR) v.setLength(maxR);
    const it = this.physics.add.image(this.arena.x + v.x, this.arena.y + v.y, `item-${id}`).setDepth(6);
    this.items.add(it);
    it.setData({ id, expireAt: persistent ? Infinity : this.elapsed + ITEM_RULES.lifetimeMs });
    this.tweens.add({ targets: it, scale: 1.15, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.itemLog.drop[id] = (this.itemLog.drop[id] ?? 0) + 1;
    this.stageLog.push({ name: 'item:drop', at: Math.round(this.elapsed), data: { id, persistent } });
  }

  private updateItems(): void {
    for (const obj of [...this.items.getChildren()]) {
      const it = obj as Phaser.Physics.Arcade.Image;
      const left = (it.getData('expireAt') as number) - this.elapsed;
      if (left <= 0) it.destroy();
      else if (left < ITEM_RULES.blinkMs) it.setAlpha(Math.floor(left / 200) % 2 ? 0.35 : 1);
    }
    const shield = this.shieldUntil > this.elapsed;
    this.shieldFx.setVisible(shield).setPosition(this.player.x, this.player.y);
    if (shield && this.shieldUntil - this.elapsed < 5000) this.shieldFx.setAlpha(Math.floor(this.elapsed / 200) % 2 ? 0.4 : 1);
    else this.shieldFx.setAlpha(1);
  }

  private pickItem(it: Phaser.Physics.Arcade.Image): void {
    if (!it.active || this.mode !== 'play') return;
    const id = it.getData('id') as ItemId;
    it.destroy();
    this.itemLog.pick[id] = (this.itemLog.pick[id] ?? 0) + 1;
    this.stageLog.push({ name: 'item:pickup', at: Math.round(this.elapsed), data: { id } });
    if (id === 'box') {
      if (this.boxCandidates().length === 0) return this.applyItem('potion');
      this.popText(this.player.x, this.player.y - 60, ITEMS.box.name, ITEMS.box.color);
      this.choiceQueue.push('box');
      this.openNext();
      return;
    }
    this.applyItem(id);
  }

  /** 즉시 발동 아이템(물약·자석·수호막) */
  private applyItem(id: ItemId): void {
    const at = (t: string) => this.popText(this.player.x, this.player.y - 60, t, ITEMS[id].color);
    if (id === 'potion') {
      // 연구소·용의 심장이 반영된 실제 최대 HP의 25%, 최대 HP는 넘지 않음
      const heal = Math.min(this.stats.maxHp - this.hp, this.stats.maxHp * ITEM_RULES.potionHeal);
      this.hp += heal;
      at(`회복 +${Math.round(heal)}`);
    } else if (id === 'magnet') {
      for (const g of this.gems.getChildren()) g.setData({ pulled: true, magnet: true });
      at('경험치 자석!');
    } else if (id === 'shield') {
      this.shieldUntil = this.elapsed + ITEM_RULES.shieldMs; // 최대 1개, 다시 얻으면 60초로 갱신
      at('용의 수호막!');
    }
  }

  // ───────────────────────── 피해 ─────────────────────────

  /**
   * 드래곤이 받는 피해. 엘리트·보스의 한 방은 최대 HP의 35%를 넘지 않는다(기획서 5장).
   * pattern=true면 무적 시간과 상관없이 들어간다(예고된 큰 공격).
   */
  private damagePlayer(amount: number, src?: Enemy, pattern = false): void {
    if (this.mode !== 'play' || this.invulnerable) return;
    if (!pattern && this.time.now < this.invincibleUntil) return;
    // 용의 수호막: 피해 계산보다 먼저. 한 번 막고 사라지며, 막은 뒤에도 평소처럼 0.5초 무적
    if (this.shieldUntil > this.elapsed) {
      this.shieldUntil = 0;
      this.itemLog.shieldBlocks++;
      this.invincibleUntil = this.time.now + 500;
      this.stageLog.push({ name: 'shield:block', at: Math.round(this.elapsed), data: { amount } });
      const burst = this.add.circle(this.player.x, this.player.y, 44).setStrokeStyle(6, 0x9be7ff).setDepth(12);
      this.tweens.add({ targets: burst, scale: 2, alpha: 0, duration: 350, onComplete: () => burst.destroy() });
      this.popText(this.player.x, this.player.y - 60, '방어!', '#9be7ff');
      return;
    }
    // 상한 기준 = 연구소 강화 전 최대 HP(기본 + 전투 중 패시브). 연구소 Lv.0이면 4단계와 똑같다.
    const cap = src ? HIT_CAP[src.rank] * (this.stats.maxHp - this.permHpBonus) : Infinity;
    const dmg = Math.min(amount * this.stats.damageTaken, cap);
    this.hp -= dmg;
    this.invincibleUntil = this.time.now + 500;
    this.cameras.main.shake(120, 0.006);
    this.player.setTint(0xff9999);
    this.time.delayedCall(150, () => this.player.clearTint());
    if (this.hp <= 0) this.fail('dead');
  }

  // ───────────────────────── 클리어·실패 ─────────────────────────

  /** 보스 처치 연출 (기획서 6장 순서) */
  private clearSequence(): void {
    this.mode = 'clearing';
    // 2) 0.35배 슬로모션 0.4초
    this.timeScale = 0.35;
    this.physics.world.timeScale = 1 / 0.35;
    this.tweens.timeScale = 0.35;
    this.time.delayedCall(400, () => {
      this.timeScale = 1;
      this.physics.world.timeScale = 1;
      this.tweens.timeScale = 1;
    });
    // 3) 적 위험 지역 제거
    this.hazards.forEach((h) => h.objs.forEach((o) => o.destroy()));
    this.hazards = [];
    this.edgeArrows = [];
    this.items.clear(true, true); // 남은 아이템은 사라짐(보스 보상은 결과 화면에서)
    this.shieldUntil = 0;
    this.shieldFx.setVisible(false);
    // 4) 남은 적은 빛으로 소멸(보상 없음)
    for (const obj of [...this.enemies.getChildren()]) {
      const e = obj as Enemy;
      e.body.setVelocity(0, 0);
      e.body.enable = false;
      e.setTint(0xfff3c4);
      this.tweens.add({ targets: e, alpha: 0, scale: 1.4, duration: 600, onComplete: () => e.destroy() });
    }
    // 6) 무적
    this.invulnerable = true;
    // 5) 남은 경험치 자동 회수는 update의 pullGems(true)
    // 7) 2.5초 클리어 연출 + 8) 황금 탈출 포털
    this.banner(`${this.director.boss?.def.name ?? '보스'} 처치!`, '#ffd34d');
    this.cameras.main.flash(500, 255, 220, 120);
    const px = this.player.x;
    const py = this.player.y - 200;
    const portal = this.add.circle(px, py, 10, 0xffd34d, 0.85).setDepth(7);
    const ring = this.add.circle(px, py, 10).setStrokeStyle(8, 0xfff3c4, 1).setDepth(7);
    this.tweens.add({ targets: portal, radius: 70, duration: 1200, ease: 'Back.Out' });
    this.tweens.add({ targets: ring, radius: 95, alpha: 0.4, duration: 900, yoyo: true, repeat: -1 });
    this.time.delayedCall(2500, () => this.showResult(true));
  }

  private fail(reason: 'dead' | 'timeout' | 'quit'): void {
    if (this.mode === 'result' || this.mode === 'clearing') return;
    this.hp = Math.max(0, this.hp);
    this.stageLog.push({ name: 'stage:fail', at: Math.round(this.elapsed), data: { reason } });
    this.director.phase = 'FAIL';
    this.showResult(false, reason);
  }

  // ───────────────────────── 일시정지·포기 (v1.1 5번) ─────────────────────────

  private openPause(): void {
    if (this.mode !== 'play') return;
    this.mode = 'paused';
    this.physics.pause();
    this.time.paused = true;
    this.releaseStick();
    this.player.setVelocity(0, 0);
    this.drawPause(false);
  }

  private closePause(): void {
    this.pauseLayer.forEach((o) => o.destroy());
    this.pauseLayer = [];
    this.mode = 'play';
    this.physics.resume();
    this.time.paused = false;
  }

  /** confirm=false: 계속하기/포기하기 · confirm=true: 포기 확인 팝업 */
  private drawPause(confirm: boolean): void {
    this.pauseLayer.forEach((o) => o.destroy());
    this.pauseLayer = [];
    const add = <T extends Phaser.GameObjects.GameObject & { setScrollFactor: (n: number) => T; setDepth: (n: number) => T }>(o: T): T => {
      this.pauseLayer.push(o);
      return o.setScrollFactor(0).setDepth(UI_DEPTH + 50);
    };
    add(this.add.rectangle(360, 640, 720, 1280, 0x000000, 0.7));
    const title = { fontFamily: 'sans-serif', fontSize: '56px', fontStyle: 'bold', color: '#ffffff', stroke: '#000', strokeThickness: 8 };
    const button = (y: number, label: string, color: number, onClick: () => void) => {
      const b = add(this.add.rectangle(360, y, 460, 96, color).setStrokeStyle(4, 0xffffff, 0.8));
      b.setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
      add(this.add.text(360, y, label, { fontFamily: 'sans-serif', fontSize: '32px', color: '#ffffff' }).setOrigin(0.5));
    };
    if (!confirm) {
      add(this.add.text(360, 440, '일시정지', title).setOrigin(0.5));
      button(640, '계속하기 (ESC)', 0x2f6fd6, () => this.closePause());
      button(770, '포기하기', 0x8a2b2b, () => this.drawPause(true));
      return;
    }
    const g = computeRunGold(this.runSummary('quit'));
    const note = this.elapsed < 30_000 ? '30초가 지나기 전에 포기하면 보상이 없습니다.' : '지금까지 모은 골드의 50%만 받습니다.';
    add(this.add.text(360, 420, '정말 포기할까요?', { ...title, fontSize: '48px' }).setOrigin(0.5));
    add(
      this.add
        .text(360, 520, `${note}\n받는 골드: ${g.total}G`, { fontFamily: 'sans-serif', fontSize: '28px', color: '#ffd34d', align: 'center', lineSpacing: 10 })
        .setOrigin(0.5, 0),
    );
    button(720, '포기 확정', 0x8a2b2b, () => {
      this.pauseLayer.forEach((o) => o.destroy());
      this.pauseLayer = [];
      this.fail('quit');
    });
    button(850, '취소', 0x3a3f4b, () => this.drawPause(false));
  }

  private runSummary(outcome: RunOutcome) {
    return {
      stageId: this.stage.id,
      durationMs: this.stage.durationMs,
      outcome,
      elapsedMs: this.elapsed,
      normalKills: this.normalKills,
      eliteKills: this.eliteKills,
      bossKilled: this.director.record.bossKillMs != null,
      treasureGold: this.treasureGold,
    };
  }

  /** 결과 화면: 골드 정산 + 전투 기록 + 다음 단계/재도전/연구소/로비 */
  private showResult(clear: boolean, reason?: 'dead' | 'timeout' | 'quit'): void {
    if (this.mode === 'result') return;
    this.mode = 'result';
    this.drawHud();
    this.physics.pause();
    const d = this.director;
    const outcome: RunOutcome = clear ? 'clear' : (reason ?? 'dead');
    const gold = computeRunGold(this.runSummary(outcome));
    // 정산은 판마다 한 번만(같은 runId는 저장소에서도 다시 지급하지 않음)
    let paid = false;
    if (!this.settled) {
      this.settled = true;
      const next = clear ? this.stage.id + 1 : undefined;
      const r = Progress.settle(this.runId, gold.total, next, {
        stageId: this.stage.id, cleared: clear, elapsedMs: this.elapsed, normalKills: this.normalKills, eliteKills: this.eliteKills,
      });
      paid = r.paid;
      this.ticketRewards = r.rewards;
    }
    if (clear) this.stageLog.push({ name: 'stage:clear', at: Math.round(this.elapsed), data: { gold: gold.total } });
    this.stageLog.push({ name: 'run:settled', at: Math.round(this.elapsed), data: { ...gold, paid } });
    const bank = Progress.load().gold;

    if (this.ticketRewards.length) {
      // 소환권 보상 내역은 결과 화면 위에 잠깐 띄운다(첫 클리어·업적)
      const t = this.add
        .text(360, 560, this.ticketRewards.map((r) => `🎟 ${r.text} — 소환권 +${r.tickets}`).join('\n'), {
          fontFamily: 'sans-serif', fontSize: '28px', fontStyle: 'bold', color: '#e1bee7', align: 'center', stroke: '#000', strokeThickness: 6, lineSpacing: 8,
        })
        .setOrigin(0.5).setScrollFactor(0).setDepth(UI_DEPTH + 120);
      this.tweens.add({ targets: t, alpha: 0, delay: 2600, duration: 600, onComplete: () => t.destroy() });
    }
    const sec = (ms: number | null | undefined) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)}초`);
    const eliteLines = d.eliteSlots.map((st, i) => {
      const label = { pending: '미등장', warning: '미등장', alive: '생존', killed: `처치 ${sec(d.record.eliteKillMs[i])}`, absorbed: '보스에 흡수' }[st];
      return `엘리트 ${i + 1}: ${label}`;
    });
    const total = Object.values(this.dmgLog).reduce((a, b) => a + b, 0) || 1;
    const top = Object.entries(this.dmgLog)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => `${k === 'basic' ? this.dragon.basic.name : sourceName(k)} ${Math.round((v / total) * 100)}%`)
      .join(' · ');
    const timeTxt = this.timeText.text.split(' /')[0];
    const headline =
      clear ? `클리어 시간 ${timeTxt}` :
      reason === 'timeout' ? '시간 초과 — 8분 안에 보스를 쓰러뜨리지 못했다' :
      reason === 'quit' ? `포기 — ${timeTxt}` : `버틴 시간 ${timeTxt}`;
    const lines = [
      `${this.stage.id}단계 ${this.stage.name} · ${this.dragon.name}`,
      headline,
      `Lv.${this.level} · 처치 ${this.kills}`,
      '',
      '전투 기록',
      ...eliteLines,
      `보스: ${d.record.bossKillMs != null ? `처치 ${sec(d.record.bossKillMs)}` : d.boss ? '생존' : '미등장'}${d.bossBuffs.length ? ` (흡수 강화: ${d.bossBuffs.join(', ')})` : ''}`,
      `피해 비중: ${top || '—'}`,
      `시드 ${this.seed}`,
    ];
    const tickets = this.ticketRewards.reduce((a, r) => a + r.tickets, 0);

    const add = (o: Phaser.GameObjects.GameObject & { setScrollFactor: (n: number) => unknown; setDepth: (n: number) => unknown }) => {
      o.setScrollFactor(0);
      o.setDepth(UI_DEPTH + 101);
      return o;
    };
    add(this.add.rectangle(360, 640, 720, 1280, 0x000000, 0.8));
    const titleTxt = clear ? '성지 탈환!' : reason === 'timeout' ? '시간 초과' : reason === 'quit' ? '전투 포기' : '드래곤이 쓰러졌다';
    add(
      this.add
        .text(360, 150, titleTxt, {
          fontFamily: 'sans-serif', fontSize: '60px', fontStyle: 'bold', color: clear ? '#ffd34d' : '#ff6b6b', stroke: '#000', strokeThickness: 8,
        })
        .setOrigin(0.5),
    );
    add(
      this.add
        .text(360, 220, lines.join('\n'), { fontFamily: 'sans-serif', fontSize: '24px', color: '#ffffff', align: 'center', lineSpacing: 6, wordWrap: { width: 660 } })
        .setOrigin(0.5, 0),
    );
    // 골드 정산표
    add(this.add.rectangle(360, 795, 640, 330, 0x1a1f2b, 0.95).setStrokeStyle(3, 0xffd34d, 0.6));
    add(this.add.text(360, 650, '골드 정산', { fontFamily: 'sans-serif', fontSize: '28px', fontStyle: 'bold', color: '#ffd34d' }).setOrigin(0.5, 0));
    add(this.add.text(70, 695, goldLines(gold).join('\n'), { fontFamily: 'sans-serif', fontSize: '22px', color: '#dfe6f5', lineSpacing: 4 }));
    add(this.add.text(650, 695, goldValues(gold).join('\n'), { fontFamily: 'sans-serif', fontSize: '22px', color: '#dfe6f5', lineSpacing: 4, align: 'right' }).setOrigin(1, 0));
    add(
      this.add
        .text(360, 993, `${paid ? '+' : ''}${gold.total}G 획득${tickets ? `  ·  🎟 +${tickets}장` : ''}  ·  보유 ${bank.toLocaleString()}G`, { fontFamily: 'sans-serif', fontSize: '28px', fontStyle: 'bold', color: '#ffd34d' })
        .setOrigin(0.5),
    );

    const next = STAGES.find((s) => s.id === this.stage.id + 1);
    const button = (x: number, y: number, w: number, label: string, enabled: boolean, onClick: () => void, color = 0x2f6fd6) => {
      const b = this.add.rectangle(x, y, w, 90, enabled ? color : 0x3a3f4b).setStrokeStyle(4, 0xffffff, enabled ? 0.8 : 0.2);
      add(b);
      add(this.add.text(x, y, label, { fontFamily: 'sans-serif', fontSize: w > 300 ? '30px' : '26px', color: enabled ? '#ffffff' : '#9aa0aa' }).setOrigin(0.5));
      if (enabled) b.setInteractive({ useHandCursor: true }).on('pointerdown', onClick);
    };
    const toLab = () => this.scene.start('lab', { from: 'result' });
    const toLobby = () => this.scene.start('lobby');
    if (clear) {
      button(360, 1065, 600, next ? `다음 단계 — ${next.name}` : `${this.stage.id + 1}단계 해금 (준비 중)`, !!next, () => this.scene.restart({ stageId: next!.id }));
      button(160, 1180, 190, '재도전 (R)', true, () => this.retry());
      button(360, 1180, 190, '성장 연구소', true, toLab, 0x7a5a12);
      button(560, 1180, 190, '로비', true, toLobby, 0x3a4458);
    } else {
      button(360, 1065, 600, '재도전 (R)', true, () => this.retry());
      button(205, 1180, 290, '성장 연구소', true, toLab, 0x7a5a12);
      button(515, 1180, 290, '로비', true, toLobby, 0x3a4458);
    }
  }

  private retry(): void {
    this.scene.restart({ stageId: this.stage.id });
  }
}

function goldLines(g: GoldBreakdown): string[] {
  const rows = g.lines.filter((l) => l.gold > 0).map((l) => l.label);
  rows.push(`합계 × 단계 배율 ×${g.stageMult}`);
  rows.push(g.resultMult === 1 ? '× 클리어 100%' : g.resultMult === 0 ? '× 30초 전 포기 0%' : '× 실패 50%');
  return rows;
}

function goldValues(g: GoldBreakdown): string[] {
  const rows = g.lines.filter((l) => l.gold > 0).map((l) => `${l.gold}G`);
  rows.push(`${Math.floor(g.subtotal * g.stageMult)}G`);
  rows.push(`= ${g.total}G`);
  return rows;
}

function sourceName(tag: string): string {
  const map: Record<string, string> = {
    basic: '화염탄', 'basic-explosion': '폭발', burn: '화상', breath: '브레스', ice: '얼음', lightning: '번개',
    meteor: '메테오', orb: '오브', wind: '날개 폭풍', poison: '중독', 'basic-chain': '연쇄', 'basic-splash': '충격파',
    'basic-split': '분열', 'basic-shard': '파편', 'basic-spin': '회전 칼날', 'basic-wave': '파도', 'basic-freeze': '빙결 폭발',
    'basic-poison-burst': '독 폭발',
  };
  return map[tag] ?? tag;
}
