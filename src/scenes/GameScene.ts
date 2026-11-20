import Phaser from 'phaser';
import { makeTextures } from '../textures';
import { HIT_CAP, type EnemyKind } from '../data/enemies';
import { BASE_STATS, M, xpToNext, type RunStats } from '../data/stats';
import { REWARD, STAGES, type StageData } from '../data/stages';
import { rollOffer, UPGRADES, type Upgrade } from '../data/upgrades';
import { Enemy, type EnemyAction } from '../objects/Enemy';
import { Skills } from '../systems/Skills';
import { BasicAttack, NO_TRAITS } from '../systems/BasicAttack';
import { BattleFx, FX, PALETTE } from '../fx/BattleFx';
import { BATTLE_SFX_FILES, playSfx, preloadSfx } from '../systems/Sfx';
import { preloadArt } from '../ui/art';
import { badge, button as kitButton, ribbon, text as ktext } from '../ui/kit';
import { plate } from '../ui/kit2';
import { COLOR, TYPE } from '../ui/theme';
import { resolveDamage, type HitSpec } from '../systems/Damage';
import type { CombatHost } from '../systems/CombatHost';
import { StageDirector } from '../systems/StageDirector';
import { computeRunGold, type GoldBreakdown, type RunOutcome } from '../data/progression';
import { DRAGONS, type DragonDef, type DragonId } from '../data/dragons';
import { setBasicCard } from '../data/upgrades';
import { eventActive, eventState, Progress, spinsAvailable, type Reward } from '../systems/Progress';
import { WINTER_2026 } from '../data/events';
import { gameNow } from '../ui/widgets';
import { loadout } from '../systems/Loadout';
import { Signature } from '../systems/Signature';
import { SPECIAL_VALUES, type SpecialId } from '../data/specials';
import { DIFFICULTY_LABEL, DIFFICULTY_MULT, type Difficulty } from '../data/economy';
import { ITEM_RULES, ITEMS, rollNormalDrop, type ItemId } from '../data/items';
import { chapterOf, SEASON1_FINALE } from '../data/season1';
import { enterBattle } from '../ui/entry';

/** 적 투사체(직선탄·추적 구체) */
interface EnemyShot {
  img: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  speed: number;
  life: number;
  damage: number;
  r: number;
  src: Enemy;
  homing: boolean;
}

const WORLD_SIZE = 2800; // 투기장을 담는 정사각형 세계
const ARENA_R = 22 * M; // 원형 투기장 반지름 22m = 1100px (사용자 결정 2026-11-17)
const UI_DEPTH = 200;

/** 레벨업 카드·머리줄의 스킬 그림 키(기획자 그림 15장). 없는 것은 기존 이모지로 */
function upgradeIcon(u: Upgrade, dragonId: string): string | null {
  if (u.kind === 'basic') return dragonId === 'red' ? 'skill-basic' : null; // 기본공격 그림은 레드만 받음
  if (u.kind === 'active') return `skill-${u.id}`;
  if (u.kind === 'passive') return `passive-${u.id}`;
  if (u.id === 'gold') return 'ui-gold';
  return null;
}
/** 카드 종류 색(그림 요청서 3: 기본공격 주황 · 액티브 남보라 · 패시브 청록) */
const KIND_COLOR = { basic: 0xff8a3d, active: 0x6d5bd0, passive: 0x22b8a8, filler: 0x8a8f9e } as const;
const KIND_LABEL = { basic: '기본 공격', active: '액티브', passive: '패시브', filler: '보급' } as const;
type Mode = 'play' | 'choose' | 'paused' | 'clearing' | 'result';

interface Hazard {
  left: number;
  run: () => void;
  objs: Phaser.GameObjects.GameObject[]; // 예고 그림(클리어 때 함께 지운다)
}

/** 전투 드래곤 그림 크기(화면 80~100px — 그림 요청서 3). 충돌 범위(반지름 18)는 그대로 */
const SKIN_SIZE = 96;

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
  private runRewards: Reward[] = [];
  private difficulty: Difficulty = 'easy';
  /** 드래곤 전용 액티브(v1.2 3장) */
  private signature!: Signature;
  private sigBtn!: Phaser.GameObjects.Arc;
  private sigIcon!: Phaser.GameObjects.Text;
  private sigText!: Phaser.GameObjects.Text;
  /** 장착형 특수 스킬(v1.2 9장) — 시간형 효과 상태 */
  private special: SpecialId | null = null;
  private specialTimer = 0;
  private specialActive = 0;
  private specialText!: Phaser.GameObjects.Text;
  private pauseLayer: Phaser.GameObjects.GameObject[] = [];
  private mode: Mode = 'play';
  private facing = new Phaser.Math.Vector2(0, -1);
  private skills!: Skills;
  private basic!: BasicAttack;
  private hudIcons: Phaser.GameObjects.GameObject[] = [];
  private hudIconSig = '';
  /** 연출(보이기만): 드래곤 그림 층·발사·적중·처치·레벨업 */
  private fx!: BattleFx;
  /** 드래곤 그림 층: 물리 몸체(this.player)를 따라다니는 탑다운 그림. 반동·피격 색은 여기에만 → 판정·좌표는 그대로 */
  private skin!: Phaser.GameObjects.Image;
  private skinScale = 1;
  private emberAt = 0;
  private basicTraits = NO_TRAITS;
  private hazards: Hazard[] = [];
  // ── 7단계 공통 패턴 ──
  private enemyShots: EnemyShot[] = [];
  private slowZones: { x: number; y: number; r: number; left: number; slow: number; g: Phaser.GameObjects.Arc }[] = [];
  private followFx: { obj: Phaser.GameObjects.Arc; target: Enemy; left: number }[] = [];
  private playerSlow = { until: 0, ratio: 0 };
  /** 패턴 위치 전용 난수(적 생성 난수와 분리 — 1단계 시드 재현 보존) */
  private patternRng!: Phaser.Math.RandomDataGenerator;
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

  preload(): void {
    preloadArt(this); // 탑다운 드래곤 그림(로비에서 이미 읽었으면 건너뜀)
    preloadSfx(this, BATTLE_SFX_FILES); // 전투 효과음(실제 실행 경로에서만 읽음 — 기획 13.2)
  }

  init(data: { stageId?: number; seed?: number; dragonId?: DragonId; difficulty?: Difficulty }): void {
    this.forcedDragon = data?.dragonId;
    this.difficulty = data?.difficulty ?? Progress.load().selectedDifficulty;
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
    const did = this.forcedDragon && prog.dragons[this.forcedDragon]?.unlocked ? this.forcedDragon : prog.selectedDragonId;
    this.dragon = DRAGONS[did] ?? DRAGONS.red;
    // 드래곤(종·영구 레벨·승급) + 연구소 + 장비 + 장착형 특수 스킬. 장비·특수 스킬이 없으면 5·6단계와 같은 값.
    const built = loadout(prog, this.dragon.id);
    this.stats = built.stats;
    this.permHpBonus = built.permHpBonus;
    this.traitMult = built.traitMult;
    this.basicTraits = built.traits;
    this.special = built.special;
    this.specialTimer = 0;
    this.specialActive = 0;
    Enemy.slowBoost = this.special === 'iceHeart' ? 1 + SPECIAL_VALUES.iceHeart.slow : 1;
    this.runRewards = [];
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
    this.enemyShots = [];
    this.slowZones = [];
    this.followFx = [];
    this.playerSlow = { until: 0, ratio: 0 };
    this.patternRng = new Phaser.Math.RandomDataGenerator([`${this.seed}:pattern`]);
    Enemy.rng = () => this.patternRng.frac();
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
    // 8단계 D: 기획자 탑다운 그림(top-<id>)이 있으면 그 그림을 보이고 물리 몸체(충돌 범위 그대로)는 숨긴다
    this.fx = new BattleFx(this);
    const topKey = `top-${this.dragon.id}`;
    if (this.textures.exists(topKey)) {
      this.player.setVisible(false);
      this.skin = this.add.image(this.player.x, this.player.y, topKey).setDepth(10).setDisplaySize(SKIN_SIZE, SKIN_SIZE);
    } else {
      this.skin = this.player; // 그림이 없으면 예전 도형 그림 그대로
    }
    this.skinScale = this.skin.scaleX;
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
      fx: this.fx,
      onFire: (angle) => this.onFire(angle),
      heal: (pct) => {
        const amount = Math.min(this.stats.maxHp - this.hp, this.stats.maxHp * pct);
        if (amount <= 0) return;
        this.hp += amount;
        this.popText(this.player.x, this.player.y - 50, `+${amount.toFixed(1)}`, '#fff3c4');
      },
    };
    this.basic = new BasicAttack(host, this.dragon.basic, this.basicTraits, built.perm);
    this.skills = new Skills(host);
    if (this.special === 'resonance') this.skills.echo = SPECIAL_VALUES.resonance.chance;
    this.signature = new Signature(host, this.dragon.id, built.signatureCdMult, () => this.basic.singleTargetDps(), (pct) => host.heal?.(pct));

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
      DIFFICULTY_MULT[this.difficulty],
    );
    this.banner(`${this.stage.id}단계 — ${this.stage.name}${this.difficulty === 'easy' ? '' : ` (${DIFFICULTY_LABEL[this.difficulty]})`}`, '#e0e0e0');
  }

  /** 원형 투기장: 안쪽은 잿빛 돌바닥, 가장자리는 돌벽, 바깥은 어둠 */
  /** 원형 투기장. 챕터마다 바닥·벽 색(7단계 5개 챕터 테마). 1단계 잿빛 숲은 기존 그대로 */
  private drawArena(): void {
    const { x, y, r } = this.arena;
    const ch = chapterOf(this.stage.id);
    this.add.rectangle(0, 0, WORLD_SIZE, WORLD_SIZE, 0x0d0f14).setOrigin(0);
    const floor = this.add.tileSprite(0, 0, WORLD_SIZE, WORLD_SIZE, ch.id === 1 ? 'ground' : `ground-${ch.id}`).setOrigin(0);
    const mask = this.make.graphics({}, false).fillStyle(0xffffff).fillCircle(x, y, r);
    floor.setMask(mask.createGeometryMask());
    const g = this.add.graphics();
    g.lineStyle(4, ch.line, 0.35).strokeCircle(x, y, r * 0.35).strokeCircle(x, y, r * 0.7); // 바닥 문양
    g.lineStyle(40, ch.wall).strokeCircle(x, y, r + 20); // 벽
    g.lineStyle(6, 0x6d6e78).strokeCircle(x, y, r);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.fillStyle(ch.stone).fillRect(x + Math.cos(a) * (r + 22) - 14, y + Math.sin(a) * (r + 22) - 14, 28, 28); // 벽 돌기둥
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
    // 8단계 UI: 로비와 같은 글꼴·외곽선. 시간은 가운데 알약, HP는 하트 아이콘 + 굵은 테두리 막대
    this.hudIcons = [];
    this.hudIconSig = '';
    this.timeText = ktext(this, 360, 104, '00:00', 30, COLOR.text, true, true).setOrigin(0.5).setScrollFactor(0).setDepth(UI_DEPTH + 1);
    this.killText = ktext(this, 690, 40, '처치 0', TYPE.caption, COLOR.text, true, true).setOrigin(1, 0.5).setScrollFactor(0).setDepth(UI_DEPTH);
    this.levelText = ktext(this, 34, 105, 'Lv.1', TYPE.caption, COLOR.gold, true, true).setOrigin(0, 0.5).setScrollFactor(0).setDepth(UI_DEPTH);
    this.hpText = ktext(this, 222, 41, '', 18, COLOR.text, true, true).setOrigin(0.5).setScrollFactor(0).setDepth(UI_DEPTH + 1);
    if (this.textures.exists('ic-heart')) this.add.image(40, 41, 'ic-heart').setDisplaySize(46, 46).setScrollFactor(0).setDepth(UI_DEPTH + 1);
    this.skillText = this.add.text(110, 62, '', { ...style, fontSize: '22px', lineSpacing: 6 }).setScrollFactor(0).setDepth(UI_DEPTH).setVisible(false);
    this.bossText = this.add.text(360, 234, '', { ...style, fontSize: '24px', align: 'center' }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(UI_DEPTH + 1);
    this.eliteText = this.add.text(360, 280, '', { ...style, fontSize: '20px', align: 'center' }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(UI_DEPTH + 1);
    this.shieldText = this.add.text(360, 140, '', { ...style, fontSize: '22px', color: '#9be7ff' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(UI_DEPTH);
    // 일시정지 버튼(휴대폰용). PC는 ESC·P 키.
    const pause = this.add.circle(670, 140, 32, 0x2b2442, 0.92).setStrokeStyle(5, COLOR.outline, 1).setScrollFactor(0).setDepth(UI_DEPTH + 2);
    this.add.circle(670, 140, 27).setStrokeStyle(3, 0x4b4170, 1).setScrollFactor(0).setDepth(UI_DEPTH + 2);
    ktext(this, 670, 140, 'II', 26, COLOR.text, true, true).setOrigin(0.5).setScrollFactor(0).setDepth(UI_DEPTH + 3);
    pause.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.openPause());
    // 드래곤 전용 액티브 버튼(화면 위쪽, 일반 액티브 6슬롯과 별개). PC는 스페이스·Q.
    const sx = 560;
    const sy = 140;
    this.sigBtn = this.add.circle(sx, sy, 40, 0x000000, 0.6).setStrokeStyle(4, this.signature.def.color, 1).setScrollFactor(0).setDepth(UI_DEPTH + 2);
    this.sigIcon = this.add.text(sx, sy - 4, this.signature.def.icon, { fontFamily: 'sans-serif', fontSize: '34px' }).setOrigin(0.5).setScrollFactor(0).setDepth(UI_DEPTH + 3);
    this.sigText = this.add.text(sx, sy + 52, '', { ...style, fontSize: '18px', strokeThickness: 4 }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(UI_DEPTH + 3);
    this.sigBtn.setInteractive({ useHandCursor: true }).on('pointerdown', (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => {
      ev.stopPropagation();
      this.castSignature();
    });
    this.input.keyboard?.on('keydown-SPACE', () => this.castSignature());
    this.input.keyboard?.on('keydown-Q', () => this.castSignature());
    this.specialText = this.add.text(30, 222, '', { ...style, fontSize: '20px', color: '#e1bee7', strokeThickness: 4 }).setScrollFactor(0).setDepth(UI_DEPTH);
  }

  private castSignature(): void {
    if (this.mode !== 'play') return;
    if (this.signature.cast()) {
      this.stageLog.push({ name: 'signature:cast', at: Math.round(this.elapsed) });
      this.popText(this.player.x, this.player.y - 70, this.signature.def.name, '#ffffff');
    }
  }

  /** 장착형 특수 스킬 중 시간형(용의 분노·고대의 보호막·마력 폭발) */
  private updateSpecial(delta: number): void {
    const sp = this.special;
    if (sp !== 'rage' && sp !== 'aegis' && sp !== 'burst') return;
    const V = SPECIAL_VALUES[sp];
    this.specialTimer += delta;
    if (this.specialActive > 0) this.specialActive -= delta;
    if (this.specialTimer < V.every) return;
    this.specialTimer -= V.every;
    if (sp === 'burst') {
      const r = SPECIAL_VALUES.burst.radius * M * this.stats.areaMult;
      for (const e of this.enemies.getChildren() as Enemy[]) {
        if (e.active && Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y) < r + e.def.radius) this.hitEnemy(e, { source: 'active', coef: SPECIAL_VALUES.burst.coef, tag: 'special' });
      }
      const c = this.add.circle(this.player.x, this.player.y, r, 0xb693ff, 0.35).setDepth(8);
      this.tweens.add({ targets: c, alpha: 0, scale: 1.15, duration: 300, onComplete: () => c.destroy() });
    } else {
      this.specialActive = (V as { ms: number }).ms;
    }
  }

  /** 전투 중 공격력 배율: 용의 분노(시간형) · 암흑의 계약(HP 50% 이하) */
  private attackMult(): number {
    let m = 1;
    if (this.special === 'rage' && this.specialActive > 0) m += SPECIAL_VALUES.rage.attack;
    if (this.special === 'darkPact' && this.hp <= this.stats.maxHp * SPECIAL_VALUES.darkPact.hpBelow) m += SPECIAL_VALUES.darkPact.attack;
    return m;
  }

  private drawHud(): void {
    const d = this.director;
    const hpRatio = Phaser.Math.Clamp(this.hp / this.stats.maxHp, 0, 1);
    const xpRatio = Phaser.Math.Clamp(this.xp / xpToNext(this.level), 0, 1);
    const g = this.hud.clear();
    // HP 막대(굵은 외곽선 + 윗면 광택) · 경험치 막대(맨 위) · 시간 알약
    g.fillStyle(COLOR.outline, 1).fillRoundedRect(54, 25, 340, 32, 16);
    g.fillStyle(0x221d36, 1).fillRoundedRect(57, 28, 334, 26, 13);
    if (hpRatio > 0) {
      g.fillStyle(hpRatio > 0.3 ? 0x3ddc84 : 0xff5252, 1).fillRoundedRect(57, 28, Math.max(26, 334 * hpRatio), 26, 13);
      g.fillStyle(0xffffff, 0.28).fillRoundedRect(63, 31, Math.max(14, 322 * hpRatio), 8, 4);
    }
    g.fillStyle(COLOR.outline, 0.85).fillRect(0, 0, 720, 14);
    g.fillStyle(0x4fc3f7).fillRect(0, 2, 720 * xpRatio, 10);
    g.fillStyle(COLOR.outline, 1).fillRoundedRect(262, 84, 196, 42, 21);
    g.fillStyle(d.enraged ? 0x5a1020 : 0x221d36, 0.95).fillRoundedRect(265, 87, 190, 36, 18);

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
      g.fillStyle(COLOR.outline, 0.9).fillRoundedRect(20, 240, 680, 26, 8);
      g.fillStyle(d.enraged ? 0xff1744 : 0xc62828).fillRoundedRect(23, 243, Math.max(8, 674 * r), 20, 6);
      g.fillStyle(0xffffff).fillRect(23 + 674 * 0.6 - 2, 238, 4, 30);
      this.bossText.setText(`${boss.def.name}${d.enraged ? ' — 격노!' : boss.phase === 2 ? ' — 분노' : ''}`);
      this.eliteText.setText(d.bossBuffs.length ? `잔존 엘리트: ${d.bossBuffs.join(' · ')}` : '');
      this.eliteText.setY(292);
    } else {
      this.bossText.setText('');
      // 엘리트: 보스바보다 작은 전용 체력바(살아 있는 엘리트마다)
      const alive = d.elites.filter((e): e is Enemy => !!e?.active);
      alive.forEach((e, i) => {
        const y = 244 + i * 40;
        const r = Phaser.Math.Clamp(e.hp / e.maxHp, 0, 1);
        g.fillStyle(0x000000, 0.7).fillRect(160, y, 400, 14);
        g.fillStyle(0xff9800).fillRect(162, y + 2, 396 * r, 10);
      });
      this.eliteText.setY(240).setText(alive.map((e) => `엘리트 ${e.eliteSlot} · ${e.def.name}`).join('\n'));
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
    this.timeText.setColor(d.enraged ? '#ff8a8a' : '#ffffff');
    this.killText.setText(`처치 ${this.kills}`);
    this.levelText.setText(`Lv.${this.level}`);
    const sh = this.shieldUntil - this.elapsed;
    this.shieldText.setText(sh > 0 ? `🛡 수호막 ${Math.ceil(sh / 1000)}초` : '');
    this.hpText.setText(`${Math.max(0, Math.ceil(this.hp))} / ${Math.ceil(this.stats.maxHp)}`);
    const icons = (kinds: string[]) =>
      UPGRADES.filter((u) => kinds.includes(u.kind) && (this.upgradeLevels.get(u.id) ?? 0) > 0)
        .map((u) => `${u.icon}${this.upgradeLevels.get(u.id)}`)
        .join(' ');
    this.skillText.setText(`${icons(['basic', 'active'])}\n${icons(['passive'])}`);
    this.drawSkillIcons();
    // 전용 액티브 버튼: 준비되면 밝게, 쿨타임 중엔 남은 초와 테두리 진행
    const sg = this.signature;
    const ready = sg.ready;
    this.sigBtn.setFillStyle(ready ? sg.def.color : 0x000000, ready ? 0.85 : 0.6);
    this.sigIcon.setAlpha(ready ? 1 : 0.45);
    this.sigText.setText(ready ? sg.def.name : `${Math.ceil(sg.cooldownLeft / 1000)}초`);
    if (!ready) g.lineStyle(6, sg.def.color, 1).beginPath().arc(560, 140, 44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sg.charge).strokePath();
    const sp = this.special;
    this.specialText.setText(
      sp === 'rage' && this.specialActive > 0 ? '⚔ 용의 분노' : sp === 'aegis' && this.specialActive > 0 ? '⬟ 보호막' : sg.reduce > 0 ? `🛡 ${sg.def.name}` : '',
    );
  }

  /** 머리줄 아래 보유 스킬 그림 줄: 기본·액티브 한 줄, 패시브 한 줄. 레벨이 바뀔 때만 다시 그린다 */
  private drawSkillIcons(): void {
    const owned = UPGRADES.filter((u) => u.kind !== 'filler' && (this.upgradeLevels.get(u.id) ?? 0) > 0);
    const sig = owned.map((u) => `${u.id}${this.upgradeLevels.get(u.id)}`).join(',');
    if (sig === this.hudIconSig) return;
    this.hudIconSig = sig;
    this.hudIcons.forEach((o) => o.destroy());
    this.hudIcons = [];
    const rows = [owned.filter((u) => u.kind !== 'passive'), owned.filter((u) => u.kind === 'passive')];
    rows.forEach((row, r) => {
      row.forEach((u, i) => {
        const x = 50 + i * 42;
        const y = 156 + r * 42;
        const key = upgradeIcon(u, this.dragon.id);
        const o: Phaser.GameObjects.GameObject[] = [];
        if (key && this.textures.exists(key)) o.push(this.add.image(x, y, key).setDisplaySize(36, 36));
        else o.push(this.add.text(x, y, u.icon, { fontFamily: 'sans-serif', fontSize: '26px' }).setOrigin(0.5));
        o.push(ktext(this, x + 15, y + 13, `${this.upgradeLevels.get(u.id)}`, 14, COLOR.text, true, true).setOrigin(0.5));
        for (const g of o) (g as Phaser.GameObjects.Image).setScrollFactor(0).setDepth(UI_DEPTH + 1);
        this.hudIcons.push(...o);
      });
    });
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
    if (this.skin && this.skin !== this.player) this.skin.setPosition(this.player.x, this.player.y).setRotation(this.player.rotation);
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
    this.signature.update(delta);
    this.basic.update(delta);
    this.skills.update(delta);
    this.updateSpecial(delta);
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
    const slow = this.playerSlow.until > this.elapsed ? this.playerSlow.ratio : 0;
    const speed = this.stats.speed * (1 + (this.signature?.moveBoost ?? 0)) * (1 - slow);
    this.player.setVelocity(dir.x * speed, dir.y * speed);
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
      if (e.expired) {
        // 분신·기병: 시간이 다 되면 보상 없이 사라짐
        const puff = this.add.circle(e.x, e.y, e.def.radius, 0xffffff, 0.4).setDepth(8);
        this.tweens.add({ targets: puff, alpha: 0, scale: 1.4, duration: 250, onComplete: () => puff.destroy() });
        e.destroy();
        continue;
      }
      for (const act of e.step(target, delta, this.arena)) this.doEnemyAction(e, act);
      this.keepInArena(e, e.def.radius);
      if (e.burnCount > 0 && this.elapsed >= this.emberAt) this.fx.ember(e.x, e.y, e.def.radius);
      const burnCoef = e.tickBurn(delta);
      if (burnCoef > 0) this.hitEnemy(e, { source: 'dot', coef: burnCoef, tag: 'burn' });
      if (!e.active) continue;
      const poisonCoef = e.tickPoison(delta);
      if (poisonCoef > 0) this.hitEnemy(e, { source: 'dot', coef: poisonCoef, tag: 'poison' });
    }
    if (this.elapsed >= this.emberAt) this.emberAt = this.elapsed + FX.emberEveryMs;
    this.updateEnemyShots(delta);
  }

  /** 적 투사체·둔화 지대·보호막 표시 */
  private updateEnemyShots(delta: number): void {
    const dt = delta / 1000;
    const px = this.player.x;
    const py = this.player.y;
    this.enemyShots = this.enemyShots.filter((s) => {
      s.life -= delta;
      if (s.homing && s.life > 600) {
        // 느린 추적 구체: 초당 90°까지만 꺾인다(피할 수 있게)
        const want = Math.atan2(py - s.img.y, px - s.img.x);
        const cur = Math.atan2(s.vy, s.vx);
        const a = Phaser.Math.Angle.RotateTo(cur, want, (Math.PI / 2) * dt);
        s.vx = Math.cos(a) * s.speed;
        s.vy = Math.sin(a) * s.speed;
      }
      s.img.x += s.vx * dt;
      s.img.y += s.vy * dt;
      s.img.setRotation(Math.atan2(s.vy, s.vx));
      if (Phaser.Math.Distance.Between(s.img.x, s.img.y, px, py) < s.r + 16) {
        this.damagePlayer(s.damage * s.src.damageMult, s.src);
        s.img.destroy();
        return false;
      }
      const out = Phaser.Math.Distance.Between(s.img.x, s.img.y, this.arena.x, this.arena.y) > this.arena.r + 10;
      if (s.life <= 0 || out) {
        s.img.destroy();
        return false;
      }
      return true;
    });
    this.slowZones = this.slowZones.filter((z) => {
      z.left -= delta;
      if (Phaser.Math.Distance.Between(z.x, z.y, px, py) < z.r) this.slowPlayerFor(300, z.slow);
      if (z.left <= 0) {
        z.g.destroy();
        return false;
      }
      z.g.setAlpha(Math.min(1, z.left / 500));
      return true;
    });
    this.followFx = this.followFx.filter((f) => {
      f.left -= delta;
      if (f.left <= 0 || !f.target.active) {
        f.obj.destroy();
        return false;
      }
      f.obj.setPosition(f.target.x, f.target.y);
      return true;
    });
  }

  /** 드래곤 둔화(서리 발톱·눈보라): 가장 센 값 하나, 시간은 갱신 */
  private slowPlayerFor(ms: number, ratio: number): void {
    const until = this.elapsed + ms;
    this.playerSlow = { until: Math.max(this.playerSlow.until, until), ratio: this.playerSlow.until > this.elapsed ? Math.max(this.playerSlow.ratio, ratio) : ratio };
  }

  private clearEnemyShots(): void {
    this.enemyShots.forEach((s) => s.img.destroy());
    this.slowZones.forEach((z) => z.g.destroy());
    this.followFx.forEach((f) => f.obj.destroy());
    this.enemyShots = [];
    this.slowZones = [];
    this.followFx = [];
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
            if (Phaser.Math.Distance.Between(act.x, act.y, this.player.x, this.player.y) < act.r + 18) {
              this.damagePlayer(dmg, e, true);
              if (act.slowPlayer) this.slowPlayerFor(1500, 0.35);
            }
          },
        });
        break;
      }
      case 'coneHit': {
        const g = this.add.graphics({ x: act.x, y: act.y }).setDepth(4);
        if (act.breath) g.fillStyle(0xff6d00, 0.22).slice(0, 0, act.r, act.angle - act.half, act.angle + act.half).fillPath();
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
            if (d < act.r + 18 && Math.abs(Phaser.Math.Angle.Wrap(a - act.angle)) <= act.half) {
              this.damagePlayer(dmg, e, true);
              if (act.slowPlayer) this.slowPlayerFor(1500, 0.35);
            }
          },
        });
        break;
      }
      case 'summon': {
        // 1단계 회색갈기는 기존처럼 체력 배율 1, 2~20단계 소환수는 스테이지 체력 배율을 따른다
        const hpMult = e.def.behavior === 'graymane' ? 1 : this.director.hpMult;
        // 2~20단계: 전장 적이 200 이상이면 소환하지 않음(성능·폭증 방지). 1단계는 기존 그대로
        if (e.def.behavior !== 'graymane' && this.enemies.countActive() >= 200) break;
        // 보스전에는 일반 적 생성이 멈추므로(기존 규칙) 일반 소환형의 졸개 소환도 멈춘다. 보스·엘리트 소환은 그대로
        if (e.rank === 'normal' && this.director.boss) break;
        for (let i = 0; i < act.count; i++) {
          const a = (i / act.count) * Math.PI * 2;
          const w = this.spawnEnemy(act.enemy, act.x + Math.cos(a) * 90, act.y + Math.sin(a) * 90, hpMult);
          w.damageMult = e.damageMult;
          e.minions.push(w);
        }
        this.cameras.main.shake(200, 0.004);
        break;
      }
      case 'shot':
      case 'orb': {
        const homing = act.kind === 'orb';
        const img = this.add.image(act.x, act.y, homing ? 'e-orb' : 'e-shot').setDepth(9).setScale(homing ? 1 : act.kind === 'shot' ? act.size : 1);
        this.enemyShots.push({
          img, homing, speed: act.speed, vx: Math.cos(act.angle) * act.speed, vy: Math.sin(act.angle) * act.speed,
          life: act.kind === 'orb' ? act.lifeMs : 4000, damage: act.damage, r: homing ? 14 : 8 * (act.kind === 'shot' ? act.size : 1), src: e,
        });
        break;
      }
      case 'lineHit': {
        // 직선 범위(검기·뿌리·가시): 예고 직사각형 → 시간이 지나면 판정. 예고와 판정 위치가 같다.
        const cx = act.x + (Math.cos(act.angle) * act.length) / 2;
        const cy = act.y + (Math.sin(act.angle) * act.length) / 2;
        const warn = this.add.rectangle(cx, cy, act.length, act.width, 0xff1744, 0.16).setStrokeStyle(4, 0xff1744, 0.85).setRotation(act.angle).setDepth(4);
        const dmg = act.damage * e.damageMult;
        this.hazards.push({
          left: act.ms,
          objs: [warn],
          run: () => {
            warn.destroy();
            const fx = this.add.rectangle(cx, cy, act.length, act.width, 0xffe0b2, 0.6).setRotation(act.angle).setDepth(8);
            this.tweens.add({ targets: fx, alpha: 0, duration: 250, onComplete: () => fx.destroy() });
            const dx = this.player.x - act.x;
            const dy = this.player.y - act.y;
            const along = dx * Math.cos(act.angle) + dy * Math.sin(act.angle);
            const side = Math.abs(-dx * Math.sin(act.angle) + dy * Math.cos(act.angle));
            if (along > -18 && along < act.length + 18 && side < act.width / 2 + 18) this.damagePlayer(dmg, e, true);
          },
        });
        break;
      }
      case 'ringHit': {
        // 바깥으로 퍼지는 충격파: 안쪽 원은 안전(보스 가까이로 피함)
        const g = this.add.graphics({ x: act.x, y: act.y }).setDepth(4);
        g.fillStyle(0xff1744, 0.14).fillCircle(0, 0, act.outer);
        g.fillStyle(0x0d0f14, 0.0).lineStyle(4, 0xff1744, 0.9).strokeCircle(0, 0, act.outer).strokeCircle(0, 0, act.inner);
        const safe = this.add.circle(act.x, act.y, act.inner, 0x69f0ae, 0.15).setDepth(4);
        const dmg = act.damage * e.damageMult;
        this.hazards.push({
          left: act.ms,
          objs: [g, safe],
          run: () => {
            g.destroy();
            safe.destroy();
            const wave = this.add.circle(act.x, act.y, act.inner).setStrokeStyle(14, 0xffcc80, 0.8).setDepth(8);
            this.tweens.add({ targets: wave, radius: act.outer, alpha: 0.1, duration: 300, onComplete: () => wave.destroy() });
            const d = Phaser.Math.Distance.Between(act.x, act.y, this.player.x, this.player.y);
            if (d > act.inner - 18 && d < act.outer + 18) this.damagePlayer(dmg, e, true);
          },
        });
        break;
      }
      case 'slowZone': {
        const g = this.add.circle(act.x, act.y, act.r, 0xb3e5fc, 0.22).setStrokeStyle(3, 0xe1f5fe, 0.8).setDepth(3);
        this.slowZones.push({ x: act.x, y: act.y, r: act.r, left: act.ms, slow: act.slow, g });
        break;
      }
      case 'shield': {
        const ring = this.add.circle(e.x, e.y, e.def.radius + 12).setStrokeStyle(act.front ? 6 : 8, act.front ? 0xffd54f : 0x80d8ff, 0.9).setDepth(7);
        this.followFx.push({ obj: ring, target: e, left: act.ms });
        break;
      }
    }
  }

  /** 모든 공격(기본공격·스킬·화상)이 적에게 피해를 줄 때 거치는 한 곳 */
  private hitEnemy(enemy: Enemy, spec: HitSpec): boolean {
    if (!enemy.active || this.mode !== 'play') return false;
    // 전용 액티브 고정 피해(flat)는 DPS에 이미 공격력·보너스가 들어 있어 특성·감전·분노를 다시 곱하지 않는다(v1.3)
    const res = resolveDamage(this.stats, { ...spec, bonus: spec.flat != null ? 1 : this.damageBonus(enemy, spec) });
    // 7단계 방어형·보호막: 정면(또는 전체) 피해 감소. 1단계 적은 해당 없음(배율 1)
    const guard = enemy.guardFactor(this.player.x, this.player.y);
    const amount = guard === 1 ? res.amount : Math.round(res.amount * guard * 10) / 10;
    const crit = res.crit;
    const tag = spec.tag ?? spec.source;
    this.dmgLog[tag] = (this.dmgLog[tag] ?? 0) + amount;
    if (spec.source !== 'dot') {
      this.fx.hit(enemy.x, enemy.y, crit, PALETTE[this.dragon.id]);
      playSfx(this, crit ? 'sfx-crit' : 'sfx-hit', { pitch: 0.9 + Math.random() * 0.2 });
    }
    if (crit) this.popText(enemy.x + (Math.random() - 0.5) * 16, enemy.y - 20, `★${Math.round(amount)}`, '#ffd34d', 31);
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
      if (t.id === 'burnBonus' && e.burnCount > 0) add += v; // 레드: 5성부터 화상 상태 적 +20%(1~4성은 traitMult 0)
      if (t.id === 'slowBonus' && e.slowed) add += v; // 블루: 둔화된 적 +20%
      if (spec.source === 'basic' && e.hp <= e.maxHp * 0.3) add += this.basicTraits.executeBonus; // 블랙: HP 30% 이하(특성 + 영구 성장)
    }
    let m = (1 + add) * e.vulnMult * this.attackMult();
    if (spec.tag === 'burn' && this.special === 'flameSeal') m *= 1 + SPECIAL_VALUES.flameSeal.burn; // 화염의 인장
    return m;
  }

  private popText(x: number, y: number, text: string, color: string, size = 26): void {
    const t = this.add.text(x, y, text, { fontFamily: 'sans-serif', fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(50);
    // 떠오름 18~28px · 450~650ms(기획 7.3)
    this.tweens.add({ targets: t, y: y - 26, alpha: 0, duration: 560, ease: 'Quad.Out', onComplete: () => t.destroy() });
  }

  /** 기본 공격 한 묶음 발사: 발사점 섬광 + 그림 층 반동(좌표·충돌체는 그대로) + 발사음 1번 */
  private onFire(angle: number): void {
    this.fx.muzzle(this.player.x, this.player.y, angle);
    const s = this.skin;
    this.tweens.killTweensOf(s);
    s.setScale(this.skinScale);
    this.tweens.add({ targets: s, scaleX: this.skinScale * 0.92, scaleY: this.skinScale * 1.06, duration: FX.recoilMs / 2, yoyo: true, ease: 'Quad.Out' });
    if (this.dragon.basic.texture === 'fireball') playSfx(this, 'sfx-red-fire', { pitch: 0.95 + Math.random() * 0.1 });
  }

  private killEnemy(enemy: Enemy, tag = ''): void {
    this.kills++;
    this.basic.onKill(enemy, tag.startsWith('basic'));
    if (this.special === 'holyLight' && Math.random() < SPECIAL_VALUES.holyLight.chance) {
      const amount = Math.min(this.stats.maxHp - this.hp, this.stats.maxHp * SPECIAL_VALUES.holyLight.heal);
      if (amount > 0) this.hp += amount;
    }
    if (enemy.rank === 'normal' && !enemy.def.noReward) this.normalKills++; // 소환수·분신은 처치 골드에 넣지 않음
    const d = this.director;
    if (enemy === d.boss) {
      this.fx.bossDie(enemy.x, enemy.y, enemy.def.radius);
      playSfx(this, 'sfx-boss-die');
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
    } else if (enemy.rank === 'normal' && !enemy.def.noReward) {
      this.dropGem(enemy.x, enemy.y, enemy.def.xp);
      const drop = rollNormalDrop(this.itemRng.frac()); // 처치마다 한 번, 최대 1종
      if (drop) this.spawnItem(drop, enemy.x, enemy.y, false);
    }
    this.fx.die(enemy);
    playSfx(this, 'sfx-enemy-die', { pitch: 0.9 + Math.random() * 0.25 });
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
    this.fx.pickup(this.player.x, this.player.y);
    playSfx(this, 'sfx-gem');
    if (this.mode === 'clearing') return; // 클리어 중 회수한 경험치는 레벨업 카드를 띄우지 않는다
    const before = this.level;
    while (this.xp >= xpToNext(this.level)) {
      this.xp -= xpToNext(this.level);
      this.level++;
      this.pendingLevelUps++;
      this.choiceQueue.push('level');
    }
    if (this.level > before) {
      this.fx.levelUp(this.player.x, this.player.y);
      playSfx(this, 'sfx-levelup');
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
      (o as unknown as { setScrollFactor: (n: number) => void }).setScrollFactor(0);
      return o;
    };
    add(this.add.rectangle(360, 640, 720, 1280, 0x000000, 0.7).setDepth(UI_DEPTH + 10));
    // 제목 리본(150~220ms 등장 — 기획 7.4)
    const rb = add(ribbon(this, 360, 300, 420, title, isBox ? 0xe0a032 : COLOR.ember, 78).setDepth(UI_DEPTH + 11));
    rb.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: rb, scale: 1, alpha: 1, duration: 190, ease: 'Back.Out' });
    if (subtitle) add(ktext(this, 360, 372, subtitle, TYPE.caption, COLOR.text, true, true).setOrigin(0.5).setDepth(UI_DEPTH + 11));
    choices.forEach((u, i) => {
      const y = 500 + i * 196;
      const next = (this.upgradeLevels.get(u.id) ?? 0) + 1;
      const tag =
        isBox ? `Lv.${next - 1} → Lv.${next}${next === u.maxLevel ? (u.kind === 'basic' ? ' 진화!' : ' (최대)') : ''}` :
        u.kind === 'filler' ? '' :
        u.kind === 'basic' ? `Lv.${next}${next === u.maxLevel ? ' 진화!' : ''}` :
        next === 1 ? (u.kind === 'active' ? '새 스킬!' : '새 패시브!') :
        `Lv.${next}${next === u.maxLevel ? ' (최대)' : ''}`;
      const kc = KIND_COLOR[u.kind];
      const card = add(plate(this, 360, y, 640, 176, { r: 24, gold: isBox, fill: 0x2b2442 }).setDepth(UI_DEPTH + 11));
      const side = this.add.graphics();
      side.fillStyle(kc, 0.35).fillRoundedRect(-315, -83, 150, 166, { tl: 20, bl: 20, tr: 0, br: 0 });
      card.add(side);
      const key = upgradeIcon(u, this.dragon.id);
      if (key && this.textures.exists(key)) card.add(this.add.image(-240, 0, key).setDisplaySize(124, 124));
      else card.add(this.add.text(-240, 0, u.icon, { fontFamily: 'sans-serif', fontSize: '64px' }).setOrigin(0.5));
      card.add(badge(this, -100, -52, KIND_LABEL[u.kind], kc));
      if (tag) card.add(ktext(this, -20, -52, tag, TYPE.tiny, next === 1 || tag.includes('진화') ? COLOR.gold : COLOR.textSub, true, true).setOrigin(0, 0.5));
      card.add(ktext(this, -140, -8, `${i + 1}. ${u.name}`, TYPE.heading, COLOR.text, true, true).setOrigin(0, 0.5));
      card.add(ktext(this, -140, 42, u.describe(next), 20, COLOR.textSub, true).setOrigin(0, 0.5).setWordWrapWidth(440).setAlign('left'));
      card.setInteractive({ useHandCursor: true });
      card.on('pointerover', () => card.setScale(1.02));
      card.on('pointerout', () => card.setScale(1));
      card.on('pointerdown', () => this.pickChoice(i));
      // 카드가 차례로 들어오기(짧게)
      card.setAlpha(0).setX(360 + 40);
      this.tweens.add({ targets: card, alpha: 1, x: 360, duration: 160, delay: 60 + i * 60, ease: 'Quad.Out' });
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
    // 받는 피해 감소: 드래곤 특성·장비(damageTaken) × 전용 액티브(신성한 가호·대지의 수호) × 고대의 보호막
    const aegis = this.special === 'aegis' && this.specialActive > 0 ? 1 - SPECIAL_VALUES.aegis.reduce : 1;
    const dmg = Math.min(amount * this.stats.damageTaken * (1 - this.signature.reduce) * aegis, cap);
    this.hp -= dmg;
    this.invincibleUntil = this.time.now + 500;
    // 연출(기획 7.4): 그림 층만 붉게 80~120ms, 화면 흔들림은 큰 피해(최대 HP 15% 이상)만·300ms 간격
    this.fx.playerHit(this.skin, dmg >= this.stats.maxHp * 0.15);
    playSfx(this, 'sfx-player-hit');
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
    this.clearEnemyShots();
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

  /** 뒤로가기: 전투 중엔 일시정지 창, 일시정지 중엔 닫기. 다른 창(카드·결과)에서는 무시(실수로 나가지 않게) */
  onPlatformBack(): boolean {
    if (this.mode === 'play') this.openPause();
    else if (this.mode === 'paused') this.closePause();
    return true;
  }

  /** 앱이 백그라운드로 가면 전투를 멈춘다(돌아왔을 때 이미 죽어 있지 않게) */
  onPlatformPause(): void {
    if (this.mode === 'play') this.openPause();
  }


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
    // 시안 형식: 판 + 리본 제목 + 두께 있는 버튼
    const button = (y: number, label: string, kind: 'cta' | 'danger' | 'secondary', onClick: () => void) => add(kitButton(this, 360, y, 440, 92, label, onClick, { kind, size: TYPE.heading }).root);
    if (!confirm) {
      add(plate(this, 360, 680, 560, 420, { r: 28 }));
      add(ribbon(this, 360, 470, 360, '일시정지', COLOR.violet, 74));
      add(ktext(this, 360, 556, `${this.stage.id}단계 · Lv.${this.level} · 처치 ${this.kills}`, TYPE.caption, COLOR.textSub, true, true).setOrigin(0.5));
      button(660, '계속하기', 'cta', () => this.closePause());
      button(790, '포기하기', 'danger', () => this.drawPause(true));
      return;
    }
    const g = computeRunGold(this.runSummary('quit'));
    const note = this.elapsed < 30_000 ? '30초가 지나기 전에 포기하면 보상이 없어요' : '지금까지 모은 골드의 50%만 받아요';
    add(plate(this, 360, 680, 600, 480, { r: 28 }));
    add(ribbon(this, 360, 440, 400, '정말 포기할까요?', COLOR.danger, 74));
    add(ktext(this, 360, 560, `${note}\n받는 골드 ${g.total}G`, TYPE.body, COLOR.gold, true, true).setOrigin(0.5).setAlign('center').setLineSpacing(10));
    button(700, '포기 확정', 'danger', () => {
      this.pauseLayer.forEach((o) => o.destroy());
      this.pauseLayer = [];
      this.fail('quit');
    });
    button(830, '취소', 'secondary', () => this.drawPause(false));
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
    const gold = computeRunGold(this.runSummary(outcome), this.special === 'treasure' ? SPECIAL_VALUES.treasure.gold : 0);
    // 정산은 판마다 한 번만(같은 runId는 저장소에서도 다시 지급하지 않음)
    let paid = false;
    if (!this.settled) {
      this.settled = true;
      const next = clear ? this.stage.id + 1 : undefined;
      const r = Progress.settle(this.runId, gold.total, next, {
        stageId: this.stage.id, cleared: clear, elapsedMs: this.elapsed, normalKills: this.normalKills, eliteKills: this.eliteKills,
        difficulty: this.difficulty, dragonId: this.dragon.id, outcome,
      }, gameNow());
      paid = r.paid;
      this.runRewards = r.rewards;
      // 겨울 축제 기간이면 룰렛 진행(정상 종료 + 60초 이상만 1판)
      if (eventActive(gameNow())) {
        const st = eventState(r.progress);
        const counted = outcome !== 'quit' && this.elapsed >= WINTER_2026.minBattleMs;
        const left = WINTER_2026.battlesPerSpin - (st.battles % WINTER_2026.battlesPerSpin);
        this.runRewards.push({
          id: 'event', text: counted ? `겨울 축제 룰렛 — 남은 기회 ${spinsAvailable(st)}회, 다음까지 ${left}판` : '겨울 축제: 포기·60초 미만 전투는 룰렛에 들어가지 않음',
          gold: 0,
        });
      }
    }
    if (clear) this.stageLog.push({ name: 'stage:clear', at: Math.round(this.elapsed), data: { gold: gold.total } });
    this.stageLog.push({ name: 'run:settled', at: Math.round(this.elapsed), data: { ...gold, paid } });
    const bank = Progress.load().gold;

    const rewardText = (r: Reward) =>
      r.id === 'event' ? `❄ ${r.text}` : r.cards ? `🃏 ${r.text} +${r.cards.count}장` : r.rubies ? `💎 ${r.text} — 루비 +${r.rubies}` : `🪙 ${r.text} +${r.gold}G`;
    if (this.runRewards.length) {
      // 카드·업적 보상 내역은 결과 화면 위에 잠깐 띄운다
      const t = this.add
        .text(360, 560, this.runRewards.map(rewardText).join('\n'), {
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
      ...(clear && this.stage.id === 20 ? ['', `“${SEASON1_FINALE}”`] : []),
      `시드 ${this.seed}`,
    ];
    const cards = this.runRewards.reduce((a, r) => a + (r.cards?.count ?? 0), 0);
    const rubies = this.runRewards.reduce((a, r) => a + (r.rubies ?? 0), 0);
    const extra = `${cards ? `  ·  🃏 +${cards}장` : ''}${rubies ? `  ·  💎 +${rubies}` : ''}`;

    const add = (o: Phaser.GameObjects.GameObject & { setScrollFactor: (n: number) => unknown; setDepth: (n: number) => unknown }) => {
      o.setScrollFactor(0);
      o.setDepth(UI_DEPTH + 101);
      return o;
    };
    add(this.add.rectangle(360, 640, 720, 1280, 0x000000, 0.8));
    const titleTxt = clear ? '성지 탈환!' : reason === 'timeout' ? '시간 초과' : reason === 'quit' ? '전투 포기' : '드래곤이 쓰러졌다';
    add(plate(this, 360, 420, 680, 470, { r: 28, gold: clear }));
    const rb = ribbon(this, 360, 160, 440, titleTxt, clear ? 0xe0a032 : COLOR.danger, 84);
    add(rb);
    rb.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: rb, scale: 1, alpha: 1, duration: 220, ease: 'Back.Out' });
    add(
      this.add
        .text(360, 222, lines.join('\n'), { fontFamily: 'sans-serif', fontSize: '23px', color: '#ffffff', align: 'center', lineSpacing: 5, wordWrap: { width: 640 }, stroke: '#0b0d17', strokeThickness: 4 })
        .setOrigin(0.5, 0),
    );
    // 골드 정산표
    add(plate(this, 360, 812, 660, 330, { r: 24, gold: true, fill: 0x221d36 }));
    if (this.textures.exists('ui-gold')) add(this.add.image(268, 674, 'ui-gold').setDisplaySize(44, 44));
    add(ktext(this, 376, 674, '골드 정산', TYPE.heading, COLOR.gold, true, true).setOrigin(0.5));
    add(this.add.text(70, 708, goldLines(gold).join('\n'), { fontFamily: 'sans-serif', fontSize: '21px', color: '#dfe6f5', lineSpacing: 4 }));
    add(this.add.text(650, 708, goldValues(gold).join('\n'), { fontFamily: 'sans-serif', fontSize: '21px', color: '#dfe6f5', lineSpacing: 4, align: 'right' }).setOrigin(1, 0));
    add(
      this.add
        .text(360, 1000, `${paid ? '+' : ''}${gold.total}G 획득${extra}  ·  보유 ${bank.toLocaleString()}G`, { fontFamily: 'sans-serif', fontSize: '25px', fontStyle: 'bold', color: '#ffd34d', stroke: '#0b0d17', strokeThickness: 5 })
        .setOrigin(0.5),
    );

    const next = STAGES.find((s) => s.id === this.stage.id + 1);
    type K = 'cta' | 'primary' | 'secondary' | 'growth' | 'magic';
    const button = (x: number, y: number, w: number, label: string, enabled: boolean, onClick: () => void, kind: K = 'cta') => {
      const b = kitButton(this, x, y, w, 84, label, onClick, { kind, size: w > 300 ? TYPE.heading : TYPE.caption });
      b.setEnabled(enabled);
      add(b.root);
    };
    const toLab = () => this.scene.start('lab', { from: 'result' });
    const toLobby = () => this.scene.start('lobby');
    if (clear) {
      button(360, 1065, 600, next ? `다음 단계 — ${next.name}` : `${this.stage.id + 1}단계 해금 (준비 중)`, !!next, () => enterBattle(this, { stageId: next!.id, difficulty: this.difficulty }, { restart: true }));
      button(160, 1180, 196, '재도전', true, () => this.retry(), 'primary');
      button(360, 1180, 196, '성장 연구소', true, toLab, 'growth');
      button(560, 1180, 196, '로비', true, toLobby, 'secondary');
    } else {
      button(360, 1065, 600, '재도전', true, () => this.retry(), 'primary');
      button(205, 1180, 290, '성장 연구소', true, toLab, 'growth');
      button(515, 1180, 290, '로비', true, toLobby, 'secondary');
    }
  }

  private retry(): void {
    enterBattle(this, { stageId: this.stage.id, difficulty: this.difficulty }, { restart: true });
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
