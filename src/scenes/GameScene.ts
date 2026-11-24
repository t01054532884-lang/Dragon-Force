import Phaser from 'phaser';
import { makeTextures } from '../textures';
import { ENEMIES, HIT_CAP, type EnemyKind } from '../data/enemies';
import { BASE_STATS, M, xpToNext, type RunStats } from '../data/stats';
import { REWARD, STAGES, type StageData } from '../data/stages';
import { BASIC_TAGS, compareText, rollOffer, synergyWith, UPGRADES, type Upgrade } from '../data/upgrades';
import { Enemy, type EnemyAction } from '../objects/Enemy';
import { Skills } from '../systems/Skills';
import { BasicAttack, NO_TRAITS } from '../systems/BasicAttack';
import { BASIC_VS_NORMAL_MULT } from '../data/basicAttack';
import { BattleFx, FX, PALETTE } from '../fx/BattleFx';
import { BASIC_FIRE_SFX, BATTLE_SFX_FILES, playSfx, preloadSfx, SIGNATURE_SFX } from '../systems/Sfx';
import { playMusic, preloadMusic, refreshMusic, stopMusic } from '../systems/Music';
import { preloadArt, preloadStageArt } from '../ui/art';
import { badge, button as kitButton, ribbon, text as ktext } from '../ui/kit';
import { plate } from '../ui/kit2';
import { COLOR, TYPE } from '../ui/theme';
import { resolveDamage, type HitSpec } from '../systems/Damage';
import type { CombatHost } from '../systems/CombatHost';
import { StageDirector } from '../systems/StageDirector';
import { computeRunGold, getUpgradeCost, PERMANENT_UPGRADES, UPGRADE_TYPES, type GoldBreakdown, type RunOutcome } from '../data/progression';
import { cpVerdict, recommendedCp } from '../data/power';
import { GROWTH } from '../data/dragons';
import { applySound, loadSettings, markTip, saveSettings, tipSeen } from '../systems/Settings';
import { DRAGONS, type DragonDef, type DragonId } from '../data/dragons';
import { setBasicCard } from '../data/upgrades';
import { eventActive, eventState, Progress, spinsAvailable, type Reward } from '../systems/Progress';
import { WINTER_2026 } from '../data/events';
import { gameNow } from '../ui/widgets';
import { loadout } from '../systems/Loadout';
import { Signature } from '../systems/Signature';
import { sigTier } from '../data/signature';
import type { RuneEffects } from '../data/runes';
import { DIFFICULTY_LABEL, DIFFICULTY_MULT, DIFFICULTY_REWARD, type Difficulty } from '../data/economy';
import { decideDrop, ITEM_RULES, ITEMS, newDropState, type DropState, type ItemId } from '../data/items';
import { GEM_MERGE, gemTier, mergeGroups } from '../systems/GemMerge';
import { chapterOf, SEASON1_FINALE } from '../data/season1';
import { arenaLayout, clampToArena, makeArena, outsideArena, type ArenaGeom } from '../data/arenas';
import { enterBattle } from '../ui/entry';
import { hardStage, type HardStageDef } from '../data/hardStages';
import { fullH, offY } from '../ui/layout';
import { capeKey, makeSkinTextures, trailKey } from '../ui/skinArt';

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
  if (u.kind === 'basic') return dragonId === 'red' ? 'skill-basic' : `basic-${dragonId}`; // 15차분: 14종 기본 공격 아이콘(미러·전설 3종은 아직 없음 → 그림이 없으면 이모지)
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
  private arena: ArenaGeom = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, r: ARENA_R };

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
  private choiceQueue: ('level' | 'box' | 'start')[] = [];
  /** 어려움 단계 설정(쉬움이면 null) */
  private hard: HardStageDef | null = null;
  /** 어려움 8단계: 보스 공격 뒤 남는 위험 지대 */
  private dangerZones: { x: number; y: number; r: number; left: number; dmg: number; src: Enemy; g: Phaser.GameObjects.Arc | Phaser.GameObjects.Image }[] = [];
  private bossTexts: Phaser.GameObjects.Text[] = [];
  /** 보스 2마리 체력 막대 틀 그림(ui-boss-bar, 어려움 요청서 6 ⑤) — 그림이 있을 때만 */
  private bossFrames: Phaser.GameObjects.Image[] = [];
  private items!: Phaser.Physics.Arcade.Group;
  /** 아이템 전용 난수: 적 생성 난수와 분리해 기존 시드의 적 등장이 그대로 재현되게 함 */
  private itemRng!: Phaser.Math.RandomDataGenerator;
  private shieldUntil = 0; // 용의 수호막 끝나는 시각(elapsed 기준). 0 = 없음
  /** 드롭 천장(물약·자석이 오래 안 나오는 상황 방지) */
  private dropState: DropState = newDropState();
  /** 전투 중 주운 골드(단계 배율 전) */
  private coinGold = 0;
  /** 첫 판 자석 확정(기능 배우기)을 아직 줘야 하는지 */
  private firstMagnetPending = false;
  private gemMergeAt = 0;
  private sigWasReady = true;
  private sigGlow!: Phaser.GameObjects.Arc;
  private waveText!: Phaser.GameObjects.Text;
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
  /** 영웅·전설 장비 추가 능력: 흡혈(기본 공격 피해 비율)·가시(받은 피해 되돌림) */
  private gear = { lifesteal: 0, thorns: 0 };
  private gearHealUsed = 0; // 흡혈: 이번 1초 동안 회복한 양(최대 HP 비율, 상한 1%)
  private gearHealAt = 0;
  private runRewards: Reward[] = [];
  private difficulty: Difficulty = 'easy';
  /** 드래곤 전용 액티브(v1.2 3장) */
  private signature!: Signature;
  private sigBtn!: Phaser.GameObjects.Arc;
  private sigIcon!: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
  private sigText!: Phaser.GameObjects.Text;
  /** 장착형 특수 스킬(v1.2 9장) — 시간형 효과 상태 */
  /** 룬 효과(v1.2: 옛 장착형 특수 스킬 → 항상 적용되는 능력치형). 전투 중 조건형만 여기서 씀 */
  private runes!: RuneEffects;
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
  /** 스킨(2026-11-23 밤): 망토(드래곤 아래층, 함께 회전) · 발자국(움직인 거리마다 흔적) — 꾸미기 전용, 판정·능력치 없음 */
  private cape: Phaser.GameObjects.Image | null = null;
  private trailTex: string | null = null;
  private trailLast = { x: 0, y: 0 };
  private emberAt = 0;
  /** 첫 전투 안내(이동·자동 공격). 움직이거나 7초가 지나면 사라지고 다시 안 나옴 */
  private moveTip: Phaser.GameObjects.GameObject[] = [];
  private basicTraits = NO_TRAITS;
  private hazards: Hazard[] = [];
  // ── 7단계 공통 패턴 ──
  private enemyShots: EnemyShot[] = [];
  private slowZones: { x: number; y: number; r: number; left: number; slow: number; g: Phaser.GameObjects.Arc }[] = [];
  private followFx: { obj: Phaser.GameObjects.Arc | Phaser.GameObjects.Image; target: Enemy; left: number }[] = [];
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
  /** 이동 방향 표시(2026-11-23 제보: 드래그해도 어디로 가는지 잘 모르겠음) — 드래곤 앞 화살표 + 지나간 자리 발자국 */
  private moveArrow: Phaser.GameObjects.Triangle | null = null;
  private trailAt = 0;
  private stickPointerId: number | null = null;
  private stickVec = new Phaser.Math.Vector2();

  private forcedDragon?: DragonId;

  constructor() {
    super('game');
  }

  preload(): void {
    preloadArt(this); // 탑다운 드래곤 그림(로비에서 이미 읽었으면 건너뜀)
    preloadStageArt(this, this.stage.id); // 이 단계 바닥·적 그림(받은 것만, 그림 요청서 10)
    preloadSfx(this, BATTLE_SFX_FILES); // 전투 효과음(실제 실행 경로에서만 읽음 — 기획 13.2)
    preloadMusic(this, ['bgm-battle', 'bgm-boss']);
  }

  /** 개발 전용(측정 봇): 보유하지 않은 드래곤도 그대로 출격(저장은 건드리지 않음). 배포본에서는 무시 */
  private anyDragon = false;

  init(data: { stageId?: number; seed?: number; dragonId?: DragonId; difficulty?: Difficulty; anyDragon?: boolean }): void {
    this.forcedDragon = data?.dragonId;
    this.anyDragon = import.meta.env.DEV && !!data?.anyDragon;
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
    const did = this.forcedDragon && (prog.dragons[this.forcedDragon]?.unlocked || this.anyDragon) ? this.forcedDragon : prog.selectedDragonId;
    this.dragon = DRAGONS[did] ?? DRAGONS.red;
    // 드래곤(종·영구 레벨·승급) + 연구소 + 장비 + 장착형 특수 스킬. 장비·특수 스킬이 없으면 5·6단계와 같은 값.
    const built = loadout(prog, this.dragon.id);
    this.stats = built.stats;
    this.permHpBonus = built.permHpBonus;
    this.traitMult = built.traitMult;
    this.basicTraits = built.traits;
    this.runes = built.runes;
    this.gear = built.gear;
    this.gearHealUsed = 0;
    this.gearHealAt = 0;
    Enemy.slowBoost = 1 + this.runes.slow;
    this.runRewards = [];
    setBasicCard(this.dragon.basic, BASIC_TAGS[this.dragon.id]);
    this.hp = this.stats.maxHp;
    this.level = 1;
    this.xp = 0;
    this.pendingLevelUps = 0;
    this.choiceQueue = [];
    // 어려움: 단계별 설정(전장 크기·적 배율·엘리트/보스 수·기믹). 쉬움은 기존 그대로
    this.hard = this.difficulty === 'hard' ? hardStage(this.stage.id) : null;
    // 전장 모양(2026-11-24): 단계마다 원형/정사각형 + 장애물(src/data/arenas.ts)
    this.arena = makeArena(WORLD_SIZE / 2, WORLD_SIZE / 2, ARENA_R * (this.hard?.arenaSizeMultiplier ?? 1), arenaLayout(this.stage.id));
    this.dangerZones = [];
    this.bossTexts = [];
    this.bossFrames = [];
    this.itemRng = new Phaser.Math.RandomDataGenerator([`${this.seed}:items`]);
    this.shieldUntil = 0;
    this.itemLog = { drop: {}, pick: {}, shieldBlocks: 0 };
    this.dropState = newDropState();
    this.coinGold = 0;
    this.firstMagnetPending = !tipSeen('first-magnet');
    this.gemMergeAt = 0;
    this.sigWasReady = true;
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
    if (!this.textures.exists('gem-large')) makeGemTextures(this);

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
    {
      const sk = Progress.load().skins;
      makeSkinTextures(this);
      this.cape = sk.cape ? this.add.image(this.player.x, this.player.y, capeKey(sk.cape)).setDepth(9.9).setDisplaySize(SKIN_SIZE * 0.92, SKIN_SIZE * 0.92) : null;
      this.trailTex = sk.trail ? trailKey(sk.trail) : null;
      this.trailLast = { x: this.player.x, y: this.player.y };
    }
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
    if (this.runes.echo > 0) this.skills.echo = this.runes.echo;
    // 전용 스킬 성장 단계: 드래곤 영구 레벨 10·20·30(2026-11-21)
    this.signature = new Signature(host, this.dragon.id, built.signatureCdMult, () => this.basic.singleTargetDps(), (pct) => host.heal?.(pct), sigTier(built.own.level));

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
        emit: (name, data) => {
          this.stageLog.push({ name, at: Math.round(this.elapsed), data });
          if (name === 'boss:warning') playMusic(this, 'bgm-boss'); // 보스 경고부터 보스전 곡
        },
        fail: (reason) => this.fail(reason),
        enemyAction: (e, act) => this.doEnemyAction(e, act),
        sfx: (key) => playSfx(this, key),
        aura: (e, color) => {
          // 강화·광폭화 오라: 적을 따라다니며 숨 쉬는 붉은 고리(공격 예고와 다른 모양 — 채움 없이 테두리만)
          // 그림(요청서 6 ⑤): 보스 광폭화 = aura-enrage(불꽃 고리), 엘리트 강화 = aura-elite(얇은 붉은 고리). 없으면 도형
          const key = color === 0xff1744 ? 'aura-enrage' : 'aura-elite';
          const ring = this.textures.exists(key)
            ? this.add.image(e.x, e.y, key).setDisplaySize((e.def.radius + 18) * 2.5, (e.def.radius + 18) * 2.5).setDepth(7)
            : this.add.circle(e.x, e.y, e.def.radius + 18).setStrokeStyle(6, color, 0.85).setDepth(7);
          this.tweens.add({ targets: ring, scale: ring.scale * 1.15, alpha: 0.4, duration: 450, yoyo: true, repeat: -1 });
          this.followFx.push({ obj: ring, target: e, left: Infinity });
        },
      },
      this.stage,
      this.hard ? { hp: this.hard.enemyHpMultiplier, damage: this.hard.enemyDamageMultiplier } : DIFFICULTY_MULT[this.difficulty],
      this.hard,
    );
    playMusic(this, 'bgm-battle');
    this.moveTip = [];
    if (!tipSeen('battle-move')) this.showMoveTip();
    this.banner(this.hard ? `어려움 ${this.stage.id}단계 — ${this.hard.title}\n${this.hard.mechanicText}` : `${this.stage.id}단계 — ${this.stage.name}${this.difficulty === 'easy' ? '' : ` (${DIFFICULTY_LABEL[this.difficulty]})`}`, this.hard ? '#ff8a80' : '#e0e0e0');
    // 어려움: 전투 시작 직후 스킬 카드 3번 고르기(시간 정지, 경험치 추가 없음)
    if (this.hard) {
      for (let k = 0; k < this.hard.startingSkillChoices; k++) this.choiceQueue.push('start');
      this.openNext();
    }
  }

  /** 투기장: 단계마다 원형/정사각형 + 장애물(src/data/arenas.ts). 챕터마다 바닥·벽 색(7단계 5개 챕터 테마). 1단계 잿빛 숲은 기존 그대로 */
  private drawArena(): void {
    const { x, y, r } = this.arena;
    const ch = chapterOf(this.stage.id);
    const square = this.arena.shape === 'square';
    this.add.rectangle(0, 0, WORLD_SIZE, WORLD_SIZE, 0x0d0f14).setOrigin(0);
    // 1단계 챕터(잿빛 숲)는 기획자 바닥 그림(이음새 없는 512 무늬)이 있으면 그것으로
    // 단계별 바닥(그림 요청서 10 ②)이 있으면 그것, 없으면 챕터 바닥
    const stageFloor = `floor-s${this.stage.id}`;
    const floorKey = this.textures.exists(stageFloor) ? stageFloor : ch.id === 1 ? (this.textures.exists('floor-ash') ? 'floor-ash' : 'ground') : `ground-${ch.id}`;
    const floor = this.add.tileSprite(0, 0, WORLD_SIZE, WORLD_SIZE, floorKey).setOrigin(0);
    if (floorKey === 'floor-ash' || floorKey === stageFloor) floor.setTileScale(0.5).setTint(0x9a9aa8); // 캐릭터가 잘 보이게 조금 어둡게
    const mg = this.make.graphics({}, false).fillStyle(0xffffff);
    const mask = square ? mg.fillRect(x - r, y - r, r * 2, r * 2) : mg.fillCircle(x, y, r);
    floor.setMask(mask.createGeometryMask());
    // 벽 바깥은 어둠으로 덮는다(위 마스크가 Phaser 4에서 바닥을 자르지 못해 바깥에도 바닥이 보였음 — 2026-11-24, 전장 모양이 또렷하게)
    const dark = this.add.graphics().fillStyle(0x0d0f14, 1);
    if (square) {
      const W = WORLD_SIZE;
      dark.fillRect(0, 0, W, y - r).fillRect(0, y + r, W, W - y - r).fillRect(0, y - r, x - r, r * 2).fillRect(x + r, y - r, W - x - r, r * 2);
    } else dark.lineStyle(WORLD_SIZE * 1.5, 0x0d0f14, 1).strokeCircle(x, y, r + WORLD_SIZE * 0.75);
    const g = this.add.graphics();
    if (square) {
      this.drawSquareWalls(g, ch);
      this.drawObstacles(ch);
      return;
    }
    g.lineStyle(4, ch.line, 0.35).strokeCircle(x, y, r * 0.35).strokeCircle(x, y, r * 0.7); // 바닥 문양
    g.lineStyle(40, ch.wall).strokeCircle(x, y, r + 20); // 벽
    g.lineStyle(6, 0x6d6e78).strokeCircle(x, y, r);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      g.fillStyle(ch.stone).fillRect(x + Math.cos(a) * (r + 22) - 14, y + Math.sin(a) * (r + 22) - 14, 28, 28); // 벽 돌기둥
    }
    this.drawObstacles(ch);
  }

  /** 정사각형 전장: 바닥 문양(사각 두 겹 + 대각선) · 두꺼운 돌벽 · 변마다 돌기둥 */
  private drawSquareWalls(g: Phaser.GameObjects.Graphics, ch: ReturnType<typeof chapterOf>): void {
    const { x, y, r } = this.arena;
    g.lineStyle(4, ch.line, 0.35).strokeRect(x - r * 0.35, y - r * 0.35, r * 0.7, r * 0.7).strokeRect(x - r * 0.7, y - r * 0.7, r * 1.4, r * 1.4);
    g.lineStyle(3, ch.line, 0.18).lineBetween(x - r * 0.7, y - r * 0.7, x + r * 0.7, y + r * 0.7).lineBetween(x + r * 0.7, y - r * 0.7, x - r * 0.7, y + r * 0.7);
    g.lineStyle(40, ch.wall).strokeRect(x - r - 20, y - r - 20, r * 2 + 40, r * 2 + 40); // 벽
    g.lineStyle(6, 0x6d6e78).strokeRect(x - r, y - r, r * 2, r * 2);
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const t = -r - 22 + ((r + 22) * 2 * i) / n;
      for (const [px, py] of [[x + t, y - r - 22], [x + t, y + r + 22], [x - r - 22, y + t], [x + r + 22, y + t]]) g.fillStyle(ch.stone).fillRect(px - 14, py - 14, 28, 28); // 벽 돌기둥
    }
  }

  /**
   * 장애물: 기획자 그림(obstacle-pillar-챕터·obstacle-rock-챕터, docs/ART_REQUEST_9.md)이 있으면 그 그림, 없으면 챕터 색 돌 도형.
   * 그림은 장애물 판정 크기에 맞춰 늘린다(판정은 도형 그대로).
   */
  private drawObstacles(ch: ReturnType<typeof chapterOf>): void {
    for (const o of this.arena.obstacles ?? []) {
      const key = `obstacle-${o.kind}-${ch.id}`;
      if (o.kind === 'pillar') {
        if (this.textures.exists(key)) {
          this.add.image(o.x, o.y - o.r * 0.25, key).setDisplaySize(o.r * 2.3, o.r * 2.3);
          continue;
        }
        const g = this.add.graphics();
        g.fillStyle(0x000000, 0.35).fillEllipse(o.x + 10, o.y + 14, o.r * 2.2, o.r * 1.6); // 그림자
        g.fillStyle(COLOR.outline, 1).fillCircle(o.x, o.y, o.r + 4);
        g.fillStyle(ch.wall, 1).fillCircle(o.x, o.y, o.r);
        g.fillStyle(ch.stone, 1).fillCircle(o.x, o.y - o.r * 0.18, o.r * 0.82); // 윗면
        g.fillStyle(0xffffff, 0.12).fillCircle(o.x - o.r * 0.25, o.y - o.r * 0.4, o.r * 0.35);
        g.lineStyle(4, ch.line, 0.55).strokeCircle(o.x, o.y - o.r * 0.18, o.r * 0.55); // 문양
      } else {
        if (this.textures.exists(key)) {
          // 그림은 가로로 긴 바위 한 장 — 세로 바위는 90° 돌려 쓴다
          const tall = o.h > o.w;
          this.add.image(o.x, o.y, key).setRotation(tall ? Math.PI / 2 : 0).setDisplaySize((tall ? o.h : o.w) + 24, (tall ? o.w : o.h) + 24);
          continue;
        }
        const g = this.add.graphics();
        const [l, t, w, h] = [o.x - o.w / 2, o.y - o.h / 2, o.w, o.h];
        g.fillStyle(0x000000, 0.35).fillRoundedRect(l + 10, t + 14, w, h, 18); // 그림자
        g.fillStyle(COLOR.outline, 1).fillRoundedRect(l - 4, t - 4, w + 8, h + 8, 20);
        g.fillStyle(ch.wall, 1).fillRoundedRect(l, t, w, h, 16);
        g.fillStyle(ch.stone, 1).fillRoundedRect(l + 6, t + 4, w - 12, h - 16, 12); // 윗면
        g.fillStyle(0xffffff, 0.1).fillRoundedRect(l + 12, t + 10, (w - 24) * 0.5, Math.min(18, h * 0.2), 8);
        g.lineStyle(3, ch.line, 0.45);
        if (w > h) g.lineBetween(l + w * 0.3, t + h * 0.25, l + w * 0.45, t + h * 0.7).lineBetween(l + w * 0.65, t + h * 0.2, l + w * 0.75, t + h * 0.6); // 금
        else g.lineBetween(l + w * 0.25, t + h * 0.3, l + w * 0.7, t + h * 0.45).lineBetween(l + w * 0.2, t + h * 0.65, l + w * 0.6, t + h * 0.75);
      }
    }
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number, hpMult: number): Enemy {
    ({ x, y } = clampToArena(this.arena, x, y, ENEMIES[kind]?.radius ?? 20)); // 장애물·벽 안에서 나오지 않게
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
    this.shieldText = this.add.text(360, 176, '', { ...style, fontSize: '22px', color: '#9be7ff' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(UI_DEPTH);
    // 웨이브 진행(2026-11-20): 목표를 채우면 다음 단계가 앞당겨진다
    this.waveText = ktext(this, 360, 150, '', TYPE.tiny, COLOR.gold, true, true).setOrigin(0.5).setScrollFactor(0).setDepth(UI_DEPTH + 1);
    // 일시정지 버튼(휴대폰용). PC는 ESC·P 키.
    const pause = this.add.circle(670, 140, 32, 0x2b2442, 0.92).setStrokeStyle(5, COLOR.outline, 1).setScrollFactor(0).setDepth(UI_DEPTH + 2);
    this.add.circle(670, 140, 27).setStrokeStyle(3, 0x4b4170, 1).setScrollFactor(0).setDepth(UI_DEPTH + 2);
    ktext(this, 670, 140, 'II', 26, COLOR.text, true, true).setOrigin(0.5).setScrollFactor(0).setDepth(UI_DEPTH + 3);
    pause.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.openPause());
    // 드래곤 전용 액티브 버튼(화면 위쪽, 일반 액티브 6슬롯과 별개). PC는 스페이스·Q.
    const sx = 560;
    const sy = 140;
    // 준비 완료 빛(2026-11-20): 쓸 수 있을 때 버튼 둘레가 숨 쉬듯 빛난다
    this.sigGlow = this.add.circle(sx, sy, 46).setStrokeStyle(8, this.signature.def.color, 0.85).setScrollFactor(0).setDepth(UI_DEPTH + 1);
    this.tweens.add({ targets: this.sigGlow, scale: 1.22, alpha: 0.25, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.sigBtn = this.add.circle(sx, sy, 40, 0x000000, 0.6).setStrokeStyle(4, this.signature.def.color, 1).setScrollFactor(0).setDepth(UI_DEPTH + 2);
    // 전용 스킬 아이콘 그림(요청서 6 ①)이 있으면 그림, 없으면 이모지
    const sigKey = `sig-${this.dragon.id}`;
    this.sigIcon = (this.textures.exists(sigKey)
      ? this.add.image(sx, sy, sigKey).setDisplaySize(66, 66)
      : this.add.text(sx, sy - 4, this.signature.def.icon, { fontFamily: 'sans-serif', fontSize: '34px' }).setOrigin(0.5)
    ).setScrollFactor(0).setDepth(UI_DEPTH + 3);
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
    if (this.signature.counter) {
      this.popText(this.player.x, this.player.y - 70, `기본 공격 ${this.signature.def.every}회마다 자동`, '#c9bfe0');
      return;
    }
    if (this.signature.cast()) {
      const ss = SIGNATURE_SFX[this.dragon.id];
      if (ss) playSfx(this, ss);
      this.stageLog.push({ name: 'signature:cast', at: Math.round(this.elapsed) });
      this.popText(this.player.x, this.player.y - 70, this.signature.def.name, '#ffffff');
    }
  }

  /** 전투 중 공격력 배율: 암흑의 계약 룬(HP 50% 이하) */
  private attackMult(): number {
    let m = 1;
    if (this.runes.lowHpDamage > 0 && this.hp <= this.stats.maxHp * 0.5) m += this.runes.lowHpDamage; // 암흑의 계약 룬
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

    const bossList = d.bosses.filter((b) => b.active);
    const boss = bossList[0] ?? null;
    this.bossTexts.forEach((t) => t.setText(''));
    this.bossFrames.forEach((f) => f.setVisible(false));
    if (boss) {
      // 보스: 화면 전체 너비 체력바 + 패턴 변화 지점 표시. 어려움 2마리면 반폭 막대 두 개(보스별 구분)
      const two = d.bosses.length > 1;
      // 틀 그림(768×167, 빈 자리 x 118~674 · y 77~129 — scripts/process_art_batch13.py 출력)을 폭 340으로 두 개, 막대는 빈 자리 안에
      const framed = two && this.textures.exists('ui-boss-bar');
      const fk = 340 / 768;
      d.bosses.forEach((b, k) => {
        const fcx = 182 + k * 356;
        const w = framed ? 556 * fk : two ? 330 : 680;
        const x0 = framed ? fcx - 384 * fk + (k === 1 ? 768 - 674 : 118) * fk : two ? 20 + k * 350 : 20; // 오른쪽 틀은 좌우 반전 → 빈 자리도 반전
        const by = framed ? 253 - 83.5 * fk + 77 * fk : 240; // 막대 윗변
        const bh = framed ? 52 * fk : 26;
        const r = b.active ? Phaser.Math.Clamp(b.hp / b.maxHp, 0, 1) : 0;
        g.fillStyle(COLOR.outline, 0.9).fillRoundedRect(x0, by, w, bh, framed ? 4 : 8);
        if (r > 0) g.fillStyle(d.enraged || b.patternSpeed > 1.05 ? 0xff1744 : 0xc62828).fillRoundedRect(x0 + 3, by + 3, Math.max(8, (w - 6) * r), bh - 6, framed ? 3 : 6);
        g.fillStyle(0xffffff).fillRect(x0 + 3 + (w - 6) * (b.def.phaseAt ?? 0.6) - 2, by - 2, 4, bh + 4);
        if (framed) {
          if (!this.bossFrames[k]) this.bossFrames[k] = this.add.image(fcx, 253, 'ui-boss-bar').setScale(fk).setScrollFactor(0).setDepth(UI_DEPTH + 0.5);
          this.bossFrames[k].setVisible(true).setFlipX(k === 1); // 오른쪽 틀은 뿔 장식이 바깥(오른쪽)으로
        }
        if (two) {
          if (!this.bossTexts[k]) this.bossTexts[k] = this.add.text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '20px', color: '#ffffff', stroke: '#000000', strokeThickness: 5 }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(UI_DEPTH + 1);
          this.bossTexts[k].setPosition(x0 + w / 2, framed ? 253 - 83.5 * fk - 2 : 236).setText(b.active ? `${k === 0 ? '◀' : ''}${b.def.name}${b.phase === 2 ? ' 분노' : ''}${k === 1 ? '▶' : ''}` : '처치!');
        }
      });
      this.bossText.setText(two ? '' : `${boss.def.name}${d.enraged ? ' — 격노!' : boss.phase === 2 ? ' — 분노' : ''}`);
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
      // 엘리트 여러 마리: 막대는 마리마다, 이름 줄은 너무 길어지지 않게 3줄까지
      this.eliteText.setY(240).setText(alive.slice(0, 3).map((e) => `엘리트 ${e.eliteSlot} · ${e.def.name}`).join('\n'));
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
    // 보유 스킬은 일시정지 화면에서 크게 보여 준다(제작자 요청 2026-11-20: 전투 화면 왼쪽 위 작은 아이콘은 없앰)
    const w = d.waveInfo;
    this.waveText.setText(
      w ? `웨이브 ${w.index + 1}/3 · 처치 ${Math.min(w.kills, w.goal)}/${w.goal}` :
      d.phase === 'BOSS_WARNING' ? '보스 접근 중' :
      d.phase === 'BOSS' ? '' :
      d.eliteSlots.some((s) => s === 'warning' || s === 'alive') ? '엘리트를 쓰러뜨리면 다음 웨이브' : '',
    );
    // 전용 액티브 버튼: 준비되면 밝게, 쿨타임 중엔 남은 초와 테두리 진행
    const sg = this.signature;
    if (sg.counter) {
      // 크로노·보이드·오로라: 버튼 자리에 기본 공격 횟수(예 3/5)와 테두리 진행 — 다 차면 자동으로 나가고 1부터 다시
      this.sigBtn.setFillStyle(0x000000, 0.6);
      this.sigGlow.setVisible(sg.count === sg.def.every! - 1);
      this.sigIcon.setAlpha(0.6 + 0.4 * sg.charge);
      this.sigText.setText(`${sg.count}/${sg.def.every}`);
      g.lineStyle(6, sg.def.color, 1).beginPath().arc(560, 140, 44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sg.charge).strokePath();
      this.specialText.setText('');
      return;
    }
    const ready = sg.ready;
    this.sigBtn.setFillStyle(ready ? sg.def.color : 0x000000, ready ? 0.85 : 0.6);
    this.sigGlow.setVisible(ready);
    if (ready && !this.sigWasReady) {
      playSfx(this, 'sfx-sig-ready');
      this.tweens.add({ targets: this.sigBtn, scale: 1.25, duration: 140, yoyo: true, ease: 'Quad.Out' });
      this.tweens.add({ targets: this.sigIcon, scale: this.sigIcon.scale * 1.25, duration: 140, yoyo: true, ease: 'Quad.Out' });
    }
    this.sigWasReady = ready;
    this.sigIcon.setAlpha(ready ? 1 : 0.45);
    this.sigText.setText(ready ? sg.def.name : `${Math.ceil(sg.cooldownLeft / 1000)}초`);
    if (!ready) g.lineStyle(6, sg.def.color, 1).beginPath().arc(560, 140, 44, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sg.charge).strokePath();
    this.specialText.setText(sg.reduce > 0 ? `🛡 ${sg.def.name}` : '');
  }

  /** 첫 전투 안내: 화면 아래 손가락 + "드래그해서 이동 · 공격은 자동" (기획자 요청 6) */
  private showMoveTip(): void {
    const ui = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      (o as unknown as { setScrollFactor: (n: number) => void; setDepth: (n: number) => void }).setScrollFactor(0);
      (o as unknown as { setDepth: (n: number) => void }).setDepth(UI_DEPTH + 6);
      this.moveTip.push(o);
      return o;
    };
    ui(plate(this, 360, 980, 560, 150, { r: 26 }));
    ui(ktext(this, 360, 950, '화면을 드래그해서 이동해요', TYPE.heading, COLOR.text, true, true).setOrigin(0.5));
    ui(ktext(this, 360, 1002, '공격은 가까운 적에게 자동으로 나가요', TYPE.caption, COLOR.gold, true, true).setOrigin(0.5));
    const hand = ui(this.add.text(300, 1100, '👆', { fontSize: '64px' }).setOrigin(0.5));
    this.tweens.add({ targets: hand, x: 420, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.time.delayedCall(7000, () => this.hideMoveTip());
  }

  private hideMoveTip(): void {
    if (!this.moveTip.length) return;
    markTip('battle-move');
    const objs = this.moveTip;
    this.moveTip = [];
    this.tweens.add({ targets: objs, alpha: 0, duration: 250, onComplete: () => objs.forEach((o) => o.destroy()) });
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
    const o = this.add.rectangle(360, fullH(this) / 2, 720, fullH(this), 0x000000, 0).setScrollFactor(0).setDepth(UI_DEPTH - 1);
    this.tweens.add({ targets: o, fillAlpha: 0.45, duration: 800, hold: ms - 1600, yoyo: true, onComplete: () => o.destroy() });
    this.cameras.main.shake(400, 0.004);
  }

  private createJoystick(): void {
    // 조이스틱을 또렷하게: 어두운 바탕 + 흰 테두리, 손잡이는 밝게(예전 흰색 12%·35%는 밝은 바닥에서 거의 안 보였음)
    this.stickBase = this.add.circle(0, 0, 90, 0x000000, 0.28).setStrokeStyle(5, 0xffffff, 0.6).setScrollFactor(0).setDepth(100).setVisible(false);
    this.stickKnob = this.add.circle(0, 0, 40, 0xffffff, 0.75).setStrokeStyle(4, 0xffd34d, 0.9).setScrollFactor(0).setDepth(101).setVisible(false);
    // 드래곤 앞 방향 화살표(움직일 때만)
    this.moveArrow = this.add.triangle(0, 0, 0, -24, 19, 15, -19, 15, 0xffd34d, 0.95).setStrokeStyle(3, 0x2a1a00, 0.9).setDepth(11).setVisible(false);
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

  /** 망토는 등 쪽(진행 방향 반대)으로 살짝 밀어 붙이고 펄럭임, 발자국은 26px 움직일 때마다 하나씩 남기고 0.7초에 사라짐 */
  private updateSkinFx(time: number): void {
    const r = this.player.rotation;
    if (this.cape) {
      const back = SKIN_SIZE * 0.23;
      this.cape.setPosition(this.player.x - Math.sin(r) * back, this.player.y + Math.cos(r) * back).setRotation(r + Math.sin(time / 110) * 0.05);
      this.cape.setVisible(this.skin.visible);
    }
    if (!this.trailTex || this.mode !== 'play') return;
    const dx = this.player.x - this.trailLast.x;
    const dy = this.player.y - this.trailLast.y;
    if (dx * dx + dy * dy < 26 * 26) return;
    this.trailLast = { x: this.player.x, y: this.player.y };
    const back = SKIN_SIZE * 0.4;
    const fx = this.add.image(this.player.x - Math.sin(r) * back, this.player.y + Math.cos(r) * back, this.trailTex).setDepth(2).setDisplaySize(30, 30).setRotation(r);
    this.tweens.add({ targets: fx, alpha: 0, scale: fx.scale * 0.5, duration: 700, onComplete: () => fx.destroy() });
  }

  update(_time: number, rawDelta: number): void {
    if (this.skin && this.skin !== this.player) this.skin.setPosition(this.player.x, this.player.y).setRotation(this.player.rotation);
    this.updateSkinFx(_time);
    if (this.moveTip.length && this.mode === 'play' && this.player.body && (this.player.body as Phaser.Physics.Arcade.Body).speed > 10) this.hideMoveTip();
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
    this.pullGems(false);
    this.mergeGems();
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
    this.showMoveDir(dir);
  }

  /** 움직이는 동안: 드래곤 앞 70px에 방향 화살표, 0.12초마다 뒤에 옅은 발자국(바닥이 따라 움직여 이동이 잘 안 느껴지던 문제) */
  private showMoveDir(dir: Phaser.Math.Vector2): void {
    if (!this.moveArrow) return;
    const moving = dir.lengthSq() > 0.01 && this.mode === 'play';
    this.moveArrow.setVisible(moving);
    if (!moving) return;
    const a = dir.angle();
    this.moveArrow.setPosition(this.player.x + Math.cos(a) * 78, this.player.y + Math.sin(a) * 78).setRotation(a + Math.PI / 2);
    if (this.elapsed - this.trailAt >= 120) {
      this.trailAt = this.elapsed;
      const t = this.add.circle(this.player.x - Math.cos(a) * 26, this.player.y - Math.sin(a) * 26, 10, 0xffffff, 0.35).setDepth(9);
      this.tweens.add({ targets: t, scale: 0.3, alpha: 0, duration: 420, onComplete: () => t.destroy() });
    }
  }

  /** 벽 밖·장애물 안으로 들어가지 못하게 되돌린다(장애물은 옆으로 미끄러지게 밀어냄) */
  private keepInArena(o: Phaser.GameObjects.Image, radius: number): void {
    const p = clampToArena(this.arena, o.x, o.y, radius);
    if (p.x !== o.x || p.y !== o.y) o.setPosition(p.x, p.y);
  }

  private updateEnemies(delta: number): void {
    const target = new Phaser.Math.Vector2(this.player.x, this.player.y);
    // 떠돌이 판단용: 지금 전장의 일반 몬스터 수(src/objects/Enemy.ts ROAM)
    Enemy.crowd = this.enemies.getChildren().reduce((n, o) => n + ((o as Enemy).active && (o as Enemy).rank === 'normal' ? 1 : 0), 0);
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
      e.syncSkin();
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
      // 벽 밖으로 나가면 사라진다. 장애물은 드래곤 공격처럼 그대로 지나간다(11/24 엄폐 → 테스터 피드백으로 11/25 통일)
      const out = outsideArena(this.arena, s.img.x, s.img.y, 10);
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
    // 어려움 8단계 위험 지대: 안에 있으면 피해(일반 무적 시간 적용), 시간이 지나면 사라짐
    this.dangerZones = this.dangerZones.filter((z) => {
      z.left -= delta;
      if (Phaser.Math.Distance.Between(z.x, z.y, px, py) < z.r + 12) this.damagePlayer(z.dmg, z.src);
      if (z.left <= 0) {
        z.g.destroy();
        return false;
      }
      z.g.setAlpha(Math.min(1, z.left / 400));
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
    this.dangerZones.forEach((z) => z.g.destroy());
    this.dangerZones = [];
    this.enemyShots.forEach((s) => s.img.destroy());
    this.slowZones.forEach((z) => z.g.destroy());
    this.followFx.forEach((f) => f.obj.destroy());
    this.enemyShots = [];
    this.slowZones = [];
    this.followFx = [];
  }

  /** 적의 행동을 그림과 판정으로 바꾼다. 위험 공격은 붉은 바닥 예고 → 시간이 지나면 판정. */
  private doEnemyAction(e: Enemy, act0: EnemyAction): void {
    // 어려움 3단계: 보스 공격 범위 배율(예고와 판정이 같은 값을 쓴다, 예고 시간은 그대로)
    const act = e.areaMult !== 1 ? scaleAction(act0, e.areaMult) : act0;
    // 어려움 공격 순서 조정: 엘리트·보스가 예고 중인 시각을 기록(다른 개체는 그동안 큰 공격을 시작하지 않음)
    if (e.def.rank !== 'normal' && 'ms' in act && typeof act.ms === 'number') e.telegraphUntil = Math.max(e.telegraphUntil, this.elapsed + act.ms);
    // 어려움 16·18단계: 원형·직선·부채꼴 공격 뒤 짧은 지연 2차 공격(새 예고와 함께 — 피할 수 있게)
    const echoed = (act0 as { echoed?: boolean }).echoed;
    if (e.echo && !echoed && (act.kind === 'circleHit' || act.kind === 'lineHit' || act.kind === 'coneHit')) {
      this.hazards.push({ left: act.ms + 450, objs: [], run: () => e.active && this.doEnemyAction(e, { ...act0, echoed: true } as unknown as EnemyAction) });
    }
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
            // 어려움 8단계: 보스 원형 공격 자리에 위험 지대가 잠시 남음(최대 3개 — 맵 전체를 덮지 않게)
            if (e.lingers && e.active) {
              if (this.dangerZones.length >= 3) this.dangerZones.shift()!.g.destroy();
              const zr = act.r * 0.7;
              // 그림(zone-danger, 용암 균열)이 있으면 그림 — 가장자리가 부드러워 판정 반지름보다 조금 크게
              const g = this.textures.exists('zone-danger')
                ? this.add.image(act.x, act.y, 'zone-danger').setDisplaySize(zr * 2.3, zr * 2.3).setDepth(3)
                : this.add.circle(act.x, act.y, zr, 0xff6d00, 0.22).setStrokeStyle(3, 0xff9100, 0.8).setDepth(3);
              this.dangerZones.push({ x: act.x, y: act.y, r: zr, left: 2500, dmg: dmg * 0.25, src: e, g });
              playSfx(this, 'sfx-danger-zone');
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
    if (spec.source === 'basic' && this.gear.lifesteal > 0) this.gearLifesteal(amount);
    if (enemy.hurt(amount)) {
      this.killEnemy(enemy, tag);
      return true;
    }
    return false;
  }

  /** 장비 흡혈: 기본 공격 피해의 x%를 회복, 1초에 최대 HP 1%까지 */
  private gearLifesteal(amount: number): void {
    if (this.elapsed - this.gearHealAt >= 1000) {
      this.gearHealAt = this.elapsed;
      this.gearHealUsed = 0;
    }
    const cap = this.stats.maxHp * 0.01;
    const heal = Math.min(amount * this.gear.lifesteal, cap - this.gearHealUsed);
    if (heal <= 0) return;
    this.gearHealUsed += heal;
    this.hp = Math.min(this.stats.maxHp, this.hp + heal);
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
      if (t.id === 'rootBonus' && e.rooted) add += v; // 블룸: 속박된 적 +20%
      if (t.id === 'returnBonus' && spec.tag === 'basic-return') add += v; // 스틸: 되돌아오는 원반 +20%
      if (t.id === 'bounceBonus' && spec.tag === 'basic-bounce') add += v; // 미러: 튕긴 탄 +15%
      if (t.id === 'eliteHunter' && e.rank !== 'normal') add += v; // 크로노: 엘리트·보스 +15%
      if (t.id === 'fullHp' && e.hp >= e.maxHp * 0.7) add += v; // 보이드: HP 70% 이상 +20%
      if (t.id === 'allBonus') add += v; // 오로라: 모든 피해 +10%
      if (spec.source === 'basic' && e.hp <= e.maxHp * 0.3) add += this.basicTraits.executeBonus; // 블랙: HP 30% 이하(특성 + 영구 성장)
    }
    let m = (1 + add) * e.vulnMult * this.attackMult();
    if (spec.source === 'basic' && e.rank === 'normal') m *= BASIC_VS_NORMAL_MULT; // 평타 체감(2026-11-24)
    if (spec.tag === 'burn' && this.runes.burn > 0) m *= 1 + this.runes.burn; // 화염의 인장 룬
    return m;
  }

  private popText(x: number, y: number, text: string, color: string, size = 26): void {
    const t = this.add.text(x, y, text, { fontFamily: 'sans-serif', fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setDepth(50);
    // 떠오름 18~28px · 450~650ms(기획 7.3)
    this.tweens.add({ targets: t, y: y - 26, alpha: 0, duration: 560, ease: 'Quad.Out', onComplete: () => t.destroy() });
  }

  /** 기본 공격 한 묶음 발사: 발사점 섬광 + 그림 층 반동(좌표·충돌체는 그대로) + 발사음 1번 */
  private onFire(angle: number): void {
    this.signature.onVolley(); // 크로노·보이드·오로라: 기본 공격 N회마다 자동 고유 공격
    this.fx.muzzle(this.player.x, this.player.y, angle);
    const s = this.skin;
    this.tweens.killTweensOf(s);
    s.setScale(this.skinScale);
    this.tweens.add({ targets: s, scaleX: this.skinScale * 0.92, scaleY: this.skinScale * 1.06, duration: FX.recoilMs / 2, yoyo: true, ease: 'Quad.Out' });
    // 드래곤별 발사음 — 가장 잦은 소리라 앞 0.3초만·음량 60%(화염탄과 같은 기준)
    const fs = BASIC_FIRE_SFX[this.dragon.id];
    if (fs) playSfx(this, fs, { pitch: 0.95 + Math.random() * 0.1, vol: 0.6, maxMs: 300 });
  }

  private killEnemy(enemy: Enemy, tag = ''): void {
    this.kills++;
    this.basic.onKill(enemy, tag.startsWith('basic'));
    if (this.runes.killHealChance > 0 && Math.random() < this.runes.killHealChance) {
      const amount = Math.min(this.stats.maxHp - this.hp, this.stats.maxHp * 0.02); // 신성한 빛 룬
      if (amount > 0) this.hp += amount;
    }
    if (enemy.rank === 'normal' && !enemy.def.noReward) {
      this.normalKills++; // 소환수·분신은 처치 수·웨이브 목표에 넣지 않음
      this.director.onNormalKill();
    }
    const d = this.director;
    if (d.isBoss(enemy)) {
      this.fx.bossDie(enemy.x, enemy.y, enemy.def.radius);
      playSfx(this, 'sfx-boss-die');
      const all = d.onBossKilled(enemy, this.elapsed); // 어려움 보스 2마리: 모두 잡아야 클리어
      enemy.destroy();
      if (all) this.clearSequence();
      return;
    }
    const eliteRes = enemy.rank === 'elite' ? d.onEliteKilled(enemy, this.elapsed) : false;
    if (eliteRes === 'member') {
      this.dropGem(enemy.x, enemy.y, enemy.def.xp); // 무리 중 한 마리: 경험치만(상자·회복은 무리를 다 잡았을 때 한 번)
    } else if (eliteRes === 'slot') {
      this.eliteKills++; // onEliteKilled가 슬롯마다 한 번만 true → 엘리트 보상도 한 번만
      this.spawnItem('box', enemy.x, enemy.y, true); // 엘리트: 스킬 강화 상자 확정(획득 전까지 유지)
      // 엘리트 처치 보상(한 번만): 대형 경험치 결정 + 최대 HP 12% 회복
      this.dropGem(enemy.x, enemy.y, enemy.def.xp);
      this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * REWARD.eliteHeal);
      this.popText(this.player.x, this.player.y - 50, `+${Math.round(this.stats.maxHp * REWARD.eliteHeal)} HP`, '#3ddc84');
      playSfx(this, 'sfx-heal');
    } else if (enemy.rank === 'normal' && !enemy.def.noReward) {
      this.dropGem(enemy.x, enemy.y, enemy.def.xp);
      // 처치마다 한 번, 최대 1종. 오래 안 나오면 천장, 체력이 낮으면 물약 확률 ×2, 물약은 판당 상한
      let drop = decideDrop(this.dropState, this.itemRng.frac(), this.hp / this.stats.maxHp);
      if (this.firstMagnetPending && this.elapsed >= ITEM_RULES.firstMagnetAtMs && drop !== 'magnet') {
        drop = 'magnet'; // 첫 판: 자석 확정 1번(주우면 다시 안 나옴)
        this.firstMagnetPending = false;
        this.dropState.sinceMagnet = 0;
        this.popText(enemy.x, enemy.y - 40, '경험치 자석! 주우면 보석이 모두 날아와요', '#4fc3f7', 22);
      }
      if (drop === 'coin') this.dropCoin(enemy.x, enemy.y);
      else if (drop) this.spawnItem(drop, enemy.x, enemy.y, false);
    }
    this.fx.die(enemy.skin ?? enemy);
    playSfx(this, 'sfx-enemy-die', { pitch: 0.9 + Math.random() * 0.25 });
    enemy.destroy();
  }

  // ───────────────────────── 경험치·레벨업 ─────────────────────────

  /**
   * 경험치 보석: 양에 따라 색·크기·빛이 다르다(소량 파랑 · 중량 보라 · 대량 금빛 + 빛).
   * 공격 예고(깊이 3~4)보다 아래(깊이 2)에 그려 예고를 가리지 않는다.
   */
  private dropGem(x: number, y: number, value: number): Phaser.Physics.Arcade.Image {
    const tier = gemTier(value);
    const gem = this.physics.add.image(x, y, `gem-${tier}`).setDepth(2);
    this.gems.add(gem);
    gem.setData({ value, kind: 'xp', tier });
    if (tier === 'large') this.tweens.add({ targets: gem, scale: 1.15, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    return gem;
  }

  /** 골드: 보석처럼 끌려와 줍는다(자석·클리어 회수 포함). 결과 정산의 "주운 골드" */
  private dropCoin(x: number, y: number): void {
    const c = this.physics.add.image(x, y, 'coin').setDepth(2);
    this.gems.add(c);
    c.setData({ value: ITEM_RULES.coinGold, kind: 'coin' });
    this.itemLog.drop.coin = (this.itemLog.drop.coin ?? 0) + 1;
  }

  /** 화면에 보석이 많이 쌓이면 가까운 경험치 보석끼리 합친다(총량은 그대로, 골드는 합치지 않음) */
  private mergeGems(): void {
    if (this.elapsed < this.gemMergeAt) return;
    this.gemMergeAt = this.elapsed + GEM_MERGE.everyMs;
    const list = (this.gems.getChildren() as Phaser.Physics.Arcade.Image[]).filter((g) => g.active && g.getData('kind') === 'xp' && !g.getData('pulled'));
    if (list.length <= GEM_MERGE.above) return;
    const groups = mergeGroups(list.map((g) => ({ x: g.x, y: g.y, value: g.getData('value') as number })), GEM_MERGE.radius);
    for (const grp of groups) {
      const head = list[grp[0]];
      let total = 0;
      for (const i of grp) total += list[i].getData('value') as number;
      const x = head.x;
      const y = head.y;
      for (const i of grp) list[i].destroy();
      this.dropGem(x, y, total);
    }
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
    if (gem.getData('kind') === 'coin') {
      this.coinGold += gem.getData('value') as number;
      this.itemLog.pick.coin = (this.itemLog.pick.coin ?? 0) + 1;
      gem.destroy();
      playSfx(this, 'sfx-coin-pickup', { pitch: 0.95 + Math.random() * 0.1 });
      return;
    }
    const big = gem.getData('tier') === 'large';
    this.xp += (gem.getData('value') as number) * this.stats.xpMult;
    gem.destroy();
    this.fx.pickup(this.player.x, this.player.y);
    playSfx(this, big ? 'sfx-gem-big' : 'sfx-gem');
    if (big) this.popText(this.player.x, this.player.y - 46, '큰 경험치!', '#ffd54f', 22);
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
    if (this.choiceQueue[0] === 'start') this.openStartChoice();
    else if (this.choiceQueue[0] === 'level') this.openChoice();
    else this.openBox();
  }

  private openChoice(): void {
    const reached = this.level - this.pendingLevelUps + 1;
    const choices = rollOffer({ levels: this.upgradeLevels, playerLevel: reached, basicEverOffered: this.basicEverOffered }, () => this.rng.frac());
    if (choices.some((u) => u.kind === 'basic')) this.basicEverOffered = true;
    this.showCards(`레벨 업! Lv.${reached}`, '', choices, false);
  }

  /**
   * 어려움 시작 스킬 3장(기획서 3장): 첫 장은 공격 스킬을 반드시 포함, 둘째 장은 공격·범위 강화 포함(초반 새 액티브 보장 규칙과 같음),
   * 셋째 장은 자유. 레벨·경험치는 그대로(무료 제공), 카드에는 전후 수치·조합 태그가 그대로 보인다.
   */
  private openStartChoice(): void {
    const total = this.hard?.startingSkillChoices ?? 3;
    const k = total - this.choiceQueue.filter((c) => c === 'start').length + 1;
    const choices = rollOffer({ levels: this.upgradeLevels, playerLevel: k + 1, basicEverOffered: this.basicEverOffered }, () => this.rng.frac());
    if (k === 2 && !choices.some((u) => u.kind === 'active' || u.id === 'reach' || u.id === 'amp')) {
      // 둘째 장 보장: 공격 또는 범위 강화가 없으면 마지막 장을 액티브 강화(또는 마력 확장)로
      const alt = UPGRADES.find((u) => u.kind === 'active' && (this.upgradeLevels.get(u.id) ?? 0) > 0 && (this.upgradeLevels.get(u.id) ?? 0) < u.maxLevel)
        ?? UPGRADES.find((u) => u.id === 'reach' && (this.upgradeLevels.get(u.id) ?? 0) < u.maxLevel);
      if (alt && !choices.includes(alt)) choices[choices.length - 1] = alt;
    }
    if (choices.some((u) => u.kind === 'basic')) this.basicEverOffered = true;
    if (k === 1) playSfx(this, 'sfx-hard-start');
    this.showCards(`시작 스킬 ${k}/${total}`, '어려움: 전투 전에 스킬을 하나씩 골라요', choices, false);
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

    const oy = offY(this); // 세로가 긴 화면: 창을 실제 화면 가운데로
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.choiceLayer.push(o);
      (o as unknown as { setScrollFactor: (n: number) => void }).setScrollFactor(0);
      (o as unknown as { y: number }).y += oy;
      return o;
    };
    add(this.add.rectangle(360, 640, 720, fullH(this), 0x000000, 0.7).setDepth(UI_DEPTH + 10));
    // 제목 리본(150~220ms 등장 — 기획 7.4)
    const rb = add(ribbon(this, 360, 300, 420, title, isBox ? 0xe0a032 : COLOR.ember, 78).setDepth(UI_DEPTH + 11));
    rb.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: rb, scale: 1, alpha: 1, duration: 190, ease: 'Back.Out' });
    if (subtitle) add(ktext(this, 360, 372, subtitle, TYPE.caption, COLOR.text, true, true).setOrigin(0.5).setDepth(UI_DEPTH + 11));
    // 첫 레벨업 안내(기획자 요청 6): 카드 종류 설명 — 고르면 다시 안 나옴
    if (!isBox && !tipSeen('first-card')) {
      add(plate(this, 360, 1150, 640, 150, { r: 22, fill: 0x1d3a52 }).setDepth(UI_DEPTH + 11));
      add(ktext(this, 360, 1112, '카드 하나를 골라 이번 판의 스킬을 키워요', TYPE.caption, COLOR.text, true, true).setOrigin(0.5).setDepth(UI_DEPTH + 12));
      add(ktext(this, 360, 1150, '액티브: 자동으로 나가는 공격 기술 · 패시브: 능력치 상승', 18, COLOR.textSub, true, true).setOrigin(0.5).setDepth(UI_DEPTH + 12));
      add(ktext(this, 360, 1184, '기본 공격: 드래곤의 기본 공격이 강해져요', 18, COLOR.textSub, true, true).setOrigin(0.5).setDepth(UI_DEPTH + 12));
    }
    choices.forEach((u, i) => {
      const y = 500 + i * 204;
      const next = (this.upgradeLevels.get(u.id) ?? 0) + 1;
      const tag =
        isBox ? `Lv.${next - 1} → Lv.${next}${next === u.maxLevel ? (u.kind === 'basic' ? ' 진화!' : ' (최대)') : ''}` :
        u.kind === 'filler' ? '' :
        u.kind === 'basic' ? `Lv.${next}${next === u.maxLevel ? ' 진화!' : ''}` :
        next === 1 ? (u.kind === 'active' ? '새 스킬!' : '새 패시브!') :
        `Lv.${next}${next === u.maxLevel ? ' (최대)' : ''}`;
      const kc = KIND_COLOR[u.kind];
      const card = add(plate(this, 360, y, 640, 182, { r: 24, gold: isBox, fill: 0x2b2442 }).setDepth(UI_DEPTH + 11));
      const side = this.add.graphics();
      side.fillStyle(kc, 0.35).fillRoundedRect(-315, -83, 150, 166, { tl: 20, bl: 20, tr: 0, br: 0 });
      card.add(side);
      const key = upgradeIcon(u, this.dragon.id);
      if (key && this.textures.exists(key)) card.add(this.add.image(-240, 0, key).setDisplaySize(124, 124));
      else card.add(this.add.text(-240, 0, u.icon, { fontFamily: 'sans-serif', fontSize: '64px' }).setOrigin(0.5));
      card.add(badge(this, -100, -52, KIND_LABEL[u.kind], kc));
      if (tag) card.add(ktext(this, -20, -52, tag, TYPE.tiny, next === 1 || tag.includes('진화') ? COLOR.gold : COLOR.textSub, true, true).setOrigin(0, 0.5));
      // 조합 태그(화염·빙결·연쇄·범위 …) — 카드 오른쪽 위
      if (u.tags?.length) card.add(ktext(this, 300, -56, u.tags.map((t) => `#${t}`).join(' '), 17, 0xffd9a8, true, true).setOrigin(1, 0.5));
      card.add(ktext(this, -140, -16, `${i + 1}. ${u.name}`, TYPE.heading, COLOR.text, true, true).setOrigin(0, 0.5));
      card.add(ktext(this, -140, 22, u.describe(next), 19, COLOR.textSub, true).setOrigin(0, 0.5).setWordWrapWidth(450).setAlign('left'));
      // 강화 전후 차이를 숫자로(예: 투사체 1개 → 2개 · 피해 90% → 120%)
      const cmp = compareText(u, next);
      if (cmp) card.add(ktext(this, -140, 64, `${next > 1 ? '▲ ' : '✦ '}${cmp}`, 16, COLOR.gold, true, true).setOrigin(0, 0.5).setWordWrapWidth(450).setAlign('left'));
      // 지금 보유한 스킬과 어울리는 카드
      const syn = synergyWith(u, this.upgradeLevels);
      if (syn) {
        const sb = badge(this, 196, -94, `🔗 보유 스킬과 연계 · ${syn}`, 0x2e9d6a);
        card.add(sb);
      }
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
    markTip('first-card');
    if (u.id === 'heal') {
      this.hp = Math.min(this.stats.maxHp, this.hp + this.stats.maxHp * 0.3);
      playSfx(this, 'sfx-heal');
    } else if (u.id === 'gold') {
      this.treasureGold += 20;
      playSfx(this, 'sfx-coin-pickup');
    }
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
    ({ x, y } = clampToArena(this.arena, x, y, 50)); // 벽·장애물 안이면 밖으로
    const it = this.physics.add.image(x, y, `item-${id}`).setDepth(2.5); // 공격 예고보다 아래
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
      playSfx(this, 'sfx-heal');
    } else if (id === 'magnet') {
      for (const g of this.gems.getChildren()) g.setData({ pulled: true, magnet: true });
      at('경험치 자석!');
      playSfx(this, 'sfx-gem-big');
      if (this.firstMagnetPending || !tipSeen('first-magnet')) {
        markTip('first-magnet');
        this.firstMagnetPending = false;
      }
    } else if (id === 'shield') {
      this.shieldUntil = this.elapsed + ITEM_RULES.shieldMs; // 최대 1개, 다시 얻으면 60초로 갱신
      at('용의 수호막!');
      playSfx(this, 'sfx-shield');
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
      playSfx(this, 'sfx-shield');
      return;
    }
    // 상한 기준 = 연구소 강화 전 최대 HP(기본 + 전투 중 패시브). 연구소 Lv.0이면 4단계와 똑같다.
    const cap = src ? HIT_CAP[src.rank] * (this.stats.maxHp - this.permHpBonus) : Infinity;
    // 받는 피해 감소: 드래곤 특성·장비(damageTaken) × 전용 액티브(신성한 가호·대지의 수호) × 고대의 보호막
    const aegis = 1; // 고대의 보호막은 룬(받는 피해 감소)으로 바뀌어 능력치에 이미 들어감
    // 약화된 적(샌드 모래 산탄)은 주는 피해가 줄고, 샌드 특성은 약화된 적에게 받는 피해를 한 번 더 줄인다
    let weak = src ? src.weakMult : 1;
    if (src?.weakened && this.dragon.trait.id === 'weakGuard') weak *= 1 - this.dragon.trait.value * this.traitMult;
    // 첫 전투 보호(2026-11-23 제보: 쉬움 1단계 13초 만에 사망 — 조작이 익숙하지 않아 무리 속으로 들어감):
    // 쉬움 1단계 처음 60초만 몸 부딪힘 피해 ×0.75. 보스·패턴 공격은 그대로
    const rookie = src && !pattern && this.difficulty === 'easy' && this.stage.id === 1 && this.elapsed < 60_000 ? 0.75 : 1;
    const dmg = Math.min(amount * rookie * weak * this.stats.damageTaken * (1 - this.signature.reduce) * aegis, cap);
    this.hp -= dmg;
    this.invincibleUntil = this.time.now + 500;
    // 장비 가시: 나를 때린 적에게 받은 피해의 x% 되돌림(엘리트·보스에게도, 고정 피해)
    if (src?.active && this.gear.thorns > 0) this.hitEnemy(src, { source: 'active', coef: 0, flat: dmg * this.gear.thorns, tag: 'thorns' });
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
      e.skin?.setTint(0xfff3c4);
      this.tweens.add({ targets: e.skin ? [e, e.skin] : e, alpha: 0, scaleX: '*=1.4', scaleY: '*=1.4', duration: 600, onComplete: () => e.destroy() });
    }
    // 6) 무적
    this.invulnerable = true;
    // 5) 남은 경험치 자동 회수는 update의 pullGems(true)
    // 7) 2.5초 클리어 연출 + 8) 황금 탈출 포털
    this.banner(`${this.director.boss?.def.name ?? '보스'}${this.director.bosses.length > 1 ? ' 둘 다' : ''} 처치!`, '#ffd34d');
    if (this.hard?.specialMechanic.finale) this.finaleFx(); // 어려움 20단계 전용 클리어 연출
    this.cameras.main.flash(500, 255, 220, 120);
    const px = this.player.x;
    const py = this.player.y - 200;
    const portal = this.add.circle(px, py, 10, 0xffd34d, 0.85).setDepth(7);
    const ring = this.add.circle(px, py, 10).setStrokeStyle(8, 0xfff3c4, 1).setDepth(7);
    this.tweens.add({ targets: portal, radius: 70, duration: 1200, ease: 'Back.Out' });
    this.tweens.add({ targets: ring, radius: 95, alpha: 0.4, duration: 900, yoyo: true, repeat: -1 });
    this.time.delayedCall(2500, () => this.showResult(true));
  }

  /** 어려움 20단계 전용 클리어 연출: 금빛 폭죽 고리 여러 번 + 큰 문구 */
  private finaleFx(): void {
    const colors = [0xffd34d, 0xff8a65, 0x9be7ff, 0xb693ff];
    for (let i = 0; i < 6; i++) {
      this.time.delayedCall(250 + i * 260, () => {
        const x = this.player.x + (Math.random() - 0.5) * 420;
        const y = this.player.y - 120 + (Math.random() - 0.5) * 300;
        const c = this.add.circle(x, y, 10).setStrokeStyle(8, colors[i % colors.length], 1).setDepth(UI_DEPTH - 2);
        this.tweens.add({ targets: c, radius: 120, alpha: 0, duration: 700, onComplete: () => c.destroy() });
      });
    }
    // 그림(요청서 6 ⑤): 화면 가운데 날개 왕관이 튀어나오고, 폭죽 조각이 위에서 흩날린다(없으면 고리만)
    if (this.textures.exists('hard-clear-crown')) {
      const crown = this.add.image(360, 470 + offY(this), 'hard-clear-crown').setScrollFactor(0).setDepth(UI_DEPTH - 1).setDisplaySize(300, 300).setAlpha(0);
      const s0 = crown.scale;
      crown.setScale(s0 * 0.3);
      this.tweens.add({ targets: crown, alpha: 1, scale: s0, duration: 520, delay: 300, ease: 'Back.Out' });
      this.tweens.add({ targets: crown, alpha: 0, duration: 500, delay: 2600, onComplete: () => crown.destroy() });
    }
    if (this.textures.exists('fx-confetti')) {
      for (let i = 0; i < 4; i++) {
        const piece = this.add.image(150 + i * 140, 120 + offY(this), 'fx-confetti').setScrollFactor(0).setDepth(UI_DEPTH - 2).setDisplaySize(260, 260).setAlpha(0).setAngle(i * 70);
        this.tweens.add({ targets: piece, alpha: 1, duration: 200, delay: 400 + i * 120 });
        this.tweens.add({ targets: piece, y: 760 + i * 30 + offY(this), angle: piece.angle + 120, duration: 2600, delay: 400 + i * 120, ease: 'Sine.In' });
        this.tweens.add({ targets: piece, alpha: 0, duration: 500, delay: 2500 + i * 120, onComplete: () => piece.destroy() });
      }
    }
    this.time.delayedCall(600, () => this.banner('드래곤의 최종 시련 정복!', '#ffd34d'));
    playSfx(this, 'sfx-hard-clear');
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
    const oy = offY(this); // 세로가 긴 화면: 창을 실제 화면 가운데로
    const add = <T extends Phaser.GameObjects.GameObject & { setScrollFactor: (n: number) => T; setDepth: (n: number) => T }>(o: T): T => {
      this.pauseLayer.push(o);
      (o as unknown as { y: number }).y += oy;
      return o.setScrollFactor(0).setDepth(UI_DEPTH + 50);
    };
    add(this.add.rectangle(360, 640, 720, fullH(this), 0x000000, 0.7));
    // 시안 형식: 판 + 리본 제목 + 두께 있는 버튼
    const button = (y: number, label: string, kind: 'cta' | 'danger' | 'secondary', onClick: () => void) => add(kitButton(this, 360, y, 440, 92, label, onClick, { kind, size: TYPE.heading }).root);
    if (!confirm) {
      this.drawPauseMain(add);
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

  /**
   * 일시정지 화면(제작자 요청 2026-11-20): 위 = 계속하기 / 포기하기, 가운데 = 이번 판에 얻은 스킬(크게),
   * 맨 아래 = 효과음 켜기/끄기 · 배경 음악 켜기/끄기.
   */
  private drawPauseMain(add: <T extends Phaser.GameObjects.GameObject & { setScrollFactor: (n: number) => T; setDepth: (n: number) => T }>(o: T) => T): void {
    add(plate(this, 360, 660, 668, 1060, { r: 28 }));
    add(ribbon(this, 360, 150, 360, '일시정지', COLOR.violet, 74));
    const sec = Math.floor(this.elapsed / 1000);
    const clock = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    add(ktext(this, 360, 222, `${this.stage.id}단계 · ${clock} · Lv.${this.level} · 처치 ${this.kills}`, TYPE.caption, COLOR.textSub, true, true).setOrigin(0.5));
    add(kitButton(this, 210, 302, 290, 88, '계속하기', () => this.closePause(), { kind: 'cta', size: TYPE.heading }).root);
    add(kitButton(this, 510, 302, 290, 88, '포기하기', () => this.drawPause(true), { kind: 'danger', size: TYPE.heading }).root);

    // 얻은 스킬: 기본 공격·액티브 먼저, 그다음 패시브. 두 줄 배치, 그림 + 이름 + 레벨
    add(ktext(this, 360, 392, '이번 판에 얻은 스킬', TYPE.body, COLOR.gold, true, true).setOrigin(0.5));
    const owned = UPGRADES.filter((u) => u.kind !== 'filler' && (this.upgradeLevels.get(u.id) ?? 0) > 0)
      .sort((a, b) => (a.kind === 'passive' ? 1 : 0) - (b.kind === 'passive' ? 1 : 0));
    if (owned.length === 0) add(ktext(this, 360, 470, '아직 얻은 스킬이 없어요', TYPE.caption, COLOR.textSub, true).setOrigin(0.5));
    owned.forEach((u, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx = col === 0 ? 205 : 515;
      const cy = 464 + row * 80;
      const lv = this.upgradeLevels.get(u.id) ?? 0;
      const kc = KIND_COLOR[u.kind];
      const g = add(this.add.graphics());
      g.fillStyle(0x221d36, 1).fillRoundedRect(cx - 148, cy - 36, 296, 72, 16);
      g.lineStyle(3, kc, 0.9).strokeRoundedRect(cx - 148, cy - 36, 296, 72, 16);
      const key = upgradeIcon(u, this.dragon.id);
      if (key && this.textures.exists(key)) add(this.add.image(cx - 110, cy, key).setDisplaySize(58, 58));
      else add(this.add.text(cx - 110, cy, u.icon, { fontFamily: 'sans-serif', fontSize: '40px' }).setOrigin(0.5));
      add(ktext(this, cx - 70, cy - 13, u.name, 21, COLOR.text, true, true).setOrigin(0, 0.5));
      add(ktext(this, cx - 70, cy + 17, `${KIND_LABEL[u.kind]} · Lv.${lv}${lv >= u.maxLevel ? ' (최대)' : `/${u.maxLevel}`}`, 16, COLOR.textSub, true).setOrigin(0, 0.5));
    });

    // 맨 아래: 효과음·배경 음악 따로 켜기/끄기(설정 저장은 진행 저장과 따로)
    const st = loadSettings();
    const toggleRow = (y: number, label: string, on: boolean, flip: () => void) => {
      add(ktext(this, 90, y, label, TYPE.body, COLOR.text, true, true).setOrigin(0, 0.5));
      add(kitButton(this, 540, y, 200, 72, on ? '켜짐' : '꺼짐', flip, { kind: on ? 'growth' : 'secondary', size: TYPE.body }).root);
    };
    const line = add(this.add.graphics());
    line.fillStyle(COLOR.line, 1).fillRect(80, 950, 560, 3);
    toggleRow(1010, '🔊 효과음', st.sound, () => {
      saveSettings({ ...loadSettings(), sound: !st.sound });
      applySound(this.game);
      if (!st.sound) playSfx(this, 'sfx-ui-tap');
      this.drawPause(false);
    });
    toggleRow(1100, '🎵 배경 음악', st.music, () => {
      saveSettings({ ...loadSettings(), music: !st.music });
      applySound(this.game);
      refreshMusic(this);
      this.drawPause(false);
    });
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
      goldMult: DIFFICULTY_REWARD[this.difficulty].gold, // 어려울수록 더(쉬움 1 · 어려움 1.5 · 매우 어려움 2)
      coinGold: this.coinGold,
    };
  }

  /** 결과 화면: 골드 정산 + 전투 기록 + 다음 단계/재도전/연구소/로비 */
  private showResult(clear: boolean, reason?: 'dead' | 'timeout' | 'quit'): void {
    if (this.mode === 'result') return;
    this.mode = 'result';
    stopMusic(this);
    this.drawHud();
    this.physics.pause();
    const d = this.director;
    const outcome: RunOutcome = clear ? 'clear' : (reason ?? 'dead');
    const gold = computeRunGold(this.runSummary(outcome), this.runes.gold); // 용의 보물 룬
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

    // (2026-11-24 제작자 요청) 결과 화면 위에 잠깐 뜨던 보라색 보상 내역 글자는 뺌 — 보상은 그대로 지급, 카드·루비 합계는 결과 화면에 표시
    // ── 결과 화면(종합 개선 기획서 v1.1 3장): 정보 한 판 → 성장 목표 한 줄 → 피해 상위 3 → 작은 골드 정산 ──
    const mmss = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
    const secTxt = (ms: number | null | undefined) => (ms == null ? '—' : `${Math.round(ms / 1000)}초`);
    const stageLabel = this.hard ? `어려움 ${this.stage.id}단계 ${this.hard.title}` : `${this.stage.id}단계 ${this.stage.name}`;
    const head = clear ? `클리어 ${mmss(this.elapsed)}` : reason === 'timeout' ? '시간 초과' : reason === 'quit' ? `포기 ${mmss(this.elapsed)}` : `생존 ${mmss(this.elapsed)}`;
    const cards = this.runRewards.reduce((a, r) => a + (r.cards?.count ?? 0), 0);
    const rubies = this.runRewards.reduce((a, r) => a + (r.rubies ?? 0), 0);

    const oy = offY(this); // 세로가 긴 화면: 결과 화면을 실제 화면 가운데로
    const add = <T extends Phaser.GameObjects.GameObject & { setScrollFactor: (n: number) => unknown; setDepth: (n: number) => unknown }>(o: T): T => {
      o.setScrollFactor(0);
      o.setDepth(UI_DEPTH + 101);
      (o as unknown as { y: number }).y += oy;
      return o;
    };
    const T = (x: number, y: number, str: string, size: number, color: number = COLOR.text, ox = 0.5) => add(ktext(this, x, y, str, size, color, true, true).setOrigin(ox, 0.5));
    add(this.add.rectangle(360, 640, 720, fullH(this), 0x000000, 0.82));
    const titleTxt = clear ? '성지 탈환!' : reason === 'timeout' ? '시간 초과' : reason === 'quit' ? '전투 포기' : '드래곤이 쓰러졌다';
    const rb = ribbon(this, 360, 160, 440, titleTxt, clear ? 0xe0a032 : COLOR.danger, 84);
    add(rb);
    rb.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: rb, scale: 1, alpha: 1, duration: 220, ease: 'Back.Out' });

    // 1) 정보
    add(plate(this, 360, 268, 660, 104, { r: 22, gold: clear }));
    T(360, 246, `${stageLabel} · ${this.dragon.name}`, 22);
    T(360, 284, `${head} · Lv.${this.level} · 처치 ${this.kills}`, 20, COLOR.textSub);

    // 어려움 최초 클리어 루비: 오른쪽 위에 어려움 전용 테두리 카드(frame-hard, 요청서 6 ⑤ — 그림이 있을 때만)
    const hardFirst = this.runRewards.find((r) => r.id.startsWith('hard-first:') && r.rubies);
    if (hardFirst && this.textures.exists('frame-hard')) {
      const card = add(this.add.container(640, 214).setScrollFactor(0).setDepth(UI_DEPTH + 112));
      card.add(this.add.image(0, 0, 'frame-hard').setDisplaySize(102, 136));
      if (this.textures.exists('ui-ruby')) card.add(this.add.image(0, -14, 'ui-ruby').setDisplaySize(52, 52));
      card.add(ktext(this, 0, 32, `+${hardFirst.rubies}`, 20, COLOR.gold, true, true).setOrigin(0.5));
      card.setScale(0.3).setAlpha(0);
      this.tweens.add({ targets: card, scale: 1, alpha: 1, duration: 320, delay: 250, ease: 'Back.Out' });
    }

    // 2) 다음 성장 목표(실패) — 한 줄 / 전투 기록(클리어) — 한 줄
    add(plate(this, 360, 384, 660, 104, { r: 22 }));
    if (!clear) {
      const lo = loadout(Progress.load(), this.dragon.id);
      const rec = recommendedCp(this.stage.id, this.difficulty);
      const short = lo.cp < rec;
      T(360, 360, short ? '전투력 부족 → 강화 필요' : '도전 가능', 22, short ? COLOR.gold : COLOR.ok);
      T(360, 398, `권장 ${rec.toLocaleString()} · 현재 ${lo.cp.toLocaleString()}`, 18, COLOR.textSub);
    } else {
      const el = d.eliteSlots.map((st, i) => (st === 'killed' ? secTxt(d.record.eliteKillMs[i]) : st === 'absorbed' ? '흡수' : '—')).join(' · ');
      T(360, 360, '전투 기록', 20, COLOR.gold);
      T(360, 398, `엘리트 ${el} · 보스 ${secTxt(d.record.bossKillMs)}${this.stage.id === 20 && !this.hard ? '  ·  시즌 1 완료!' : ''}`, 18, COLOR.textSub);
    }

    // 3) 피해 비중 상위 3(이름 + 비율)
    const total = Object.values(this.dmgLog).reduce((a, b) => a + b, 0) || 1;
    const top = Object.entries(this.dmgLog).sort((a, b) => b[1] - a[1]).slice(0, 3);
    add(plate(this, 360, 540, 660, 176, { r: 22 }));
    T(54, 474, '피해 비중 · 상위 3', 19, COLOR.gold, 0);
    const gbar = add(this.add.graphics());
    top.forEach(([k, v], i) => {
      const y = 514 + i * 40;
      const pct = v / total;
      const name = k === 'basic' ? this.dragon.basic.name : k === 'signature' ? this.signature.def.name : sourceName(k);
      gbar.fillStyle(0x0b0d17, 0.8).fillRoundedRect(250, y - 9, 330, 18, 9);
      gbar.fillStyle(i === 0 ? COLOR.ember : 0x8a63ff, 1).fillRoundedRect(250, y - 9, Math.max(10, 330 * pct), 18, 9);
      T(60, y, name, 19, COLOR.text, 0);
      T(664, y, `${Math.round(pct * 100)}%`, 20, COLOR.text, 1);
    });
    if (!top.length) T(360, 540, '—', 20, COLOR.textSub);

    // 4) 골드 정산(작게): 기본+생존 한 줄, 처치 골드 따로, 나머지 보너스 한 줄, 합계 강조
    const L = gold.lines.map((l) => l.gold);
    const rows: [string, number][] = [
      ['기본 + 생존 보상', L[0] + L[1]],
      ['처치 골드', L[2]],
      ['엘리트·보스·클리어', L[3] + L[4] + L[5]],
      ['보물 더미·용의 보물', (L[6] ?? 0) + (L[7] ?? 0)],
    ];
    const shown = rows.filter(([label, g], i) => i < 2 || g > 0 || label === '');
    const notes = [
      gold.stageMult !== 1 ? `단계 ×${gold.stageMult}` : '',
      DIFFICULTY_REWARD[this.difficulty].gold !== 1 ? `${DIFFICULTY_LABEL[this.difficulty]} ×${DIFFICULTY_REWARD[this.difficulty].gold}` : '',
      gold.resultMult === 1 ? '' : gold.resultMult === 0 ? '30초 전 포기 0%' : '실패 50%',
    ].filter(Boolean);
    const gh = 96 + shown.length * 32;
    const gy = 640 + gh / 2;
    add(plate(this, 360, gy, 660, gh, { r: 22, gold: true, fill: 0x221d36 }));
    if (this.textures.exists('ui-gold')) add(this.add.image(66, 664, 'ui-gold').setDisplaySize(34, 34));
    T(92, 664, '골드 정산', 20, COLOR.gold, 0);
    shown.forEach(([label, g], i) => {
      T(60, 700 + i * 32, label, 18, COLOR.textSub, 0);
      T(664, 700 + i * 32, `${g}G`, 18, COLOR.text, 1);
    });
    const ty = 700 + shown.length * 32 + 6;
    add(this.add.rectangle(360, ty - 16, 610, 2, COLOR.line));
    T(60, ty + 4, `총 획득${notes.length ? `(${notes.join(' · ')})` : ''}`, 20, COLOR.gold, 0);
    T(664, ty + 4, `${paid ? '+' : ''}${gold.total}G`, 26, COLOR.gold, 1);
    const extra = [cards ? `🃏 카드 +${cards}장` : '', rubies ? `루비 +${rubies}` : '', `보유 ${bank.toLocaleString()}G`].filter(Boolean).join('  ·  ');
    T(360, gy + gh / 2 + 30, extra, 19, COLOR.text);
    T(360, gy + gh / 2 + 60, `시드 ${this.seed}`, 14, COLOR.textDim);

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
      // 마지막 단계(20)를 깨면 "21단계 해금(준비 중)" 대신 로비로(예전엔 없는 단계를 비활성 버튼으로 보여 줌)
      const last = this.stage.id === STAGES[STAGES.length - 1].id;
      if (!next && last) button(360, 1065, 600, '모든 단계 클리어! 로비로', true, toLobby);
      else button(360, 1065, 600, next ? `다음 단계 — ${next.name}` : `${this.stage.id + 1}단계 해금 (준비 중)`, !!next, () => enterBattle(this, { stageId: next!.id, difficulty: this.difficulty }, { restart: true }));
      button(160, 1180, 196, '재도전', true, () => this.retry(), 'primary');
      button(360, 1180, 196, '성장 연구소', true, toLab, 'growth');
      button(560, 1180, 196, '로비', true, toLobby, 'secondary');
      this.labTip(360, 1180 + oy);
    } else {
      button(360, 1065, 600, '재도전', true, () => this.retry(), 'primary');
      button(205, 1180, 290, '성장 연구소', true, toLab, 'growth');
      button(515, 1180, 290, '로비', true, toLobby, 'secondary');
      this.labTip(205, 1180 + oy);
    }
  }

  /**
   * 실패 후 다음 성장 목표(기획자 요청 7): 지금 가진 골드·카드로 할 수 있는 것 또는 얼마나 남았는지.
   * 표시만 한다(수치·규칙 변경 없음).
   */
  private growthHints(): string[] {
    const p = Progress.load();
    const out: string[] = ['▶ 다음 성장 목표'];
    // 연구소: 가장 싼 강화
    const lab = UPGRADE_TYPES.map((t) => ({ t, lv: p.upgrades[t], def: PERMANENT_UPGRADES[t] }))
      .filter((o) => o.lv < o.def.maxLevel)
      .map((o) => ({ ...o, cost: getUpgradeCost(o.lv) }))
      .sort((a, b) => a.cost - b.cost)[0];
    if (lab) {
      out.push(p.gold >= lab.cost
        ? `연구소 ${lab.def.name} Lv.${lab.lv + 1} 바로 가능 (${lab.cost}G)`
        : `연구소 ${lab.def.name}까지 ${(lab.cost - p.gold).toLocaleString()}G 더 모으기`);
    }
    // 출격 드래곤 레벨업
    const d = p.dragons[this.dragon.id];
    if (d.unlocked && d.level < GROWTH.maxLevel) {
      const cards = GROWTH.cardCost(d.level);
      const gold = GROWTH.levelCost(d.level);
      if (d.cards >= cards && p.gold >= gold) out.push(`${this.dragon.short} 레벨업 가능 (카드 ${cards} · ${gold}G)`);
    }
    // 이 단계 권장 전투력
    const cp = loadout(p, this.dragon.id).cp;
    const rec = recommendedCp(this.stage.id, this.difficulty);
    out.push(`권장 전투력 ${rec.toLocaleString()} · 현재 ${cp.toLocaleString()} — ${cpVerdict(cp, rec).text}`);
    return out;
  }

  /** 첫 판이 끝나면 한 번: 연구소 버튼 위 말풍선 "골드로 영구 강화"(기획자 요청 6) */
  private labTip(x: number, y: number): void {
    if (tipSeen('lab')) return;
    markTip('lab');
    // 연구소 버튼 오른쪽 위에 "골드로 강화!" 배지가 통통 튐(다른 버튼을 가리지 않게)
    const tip = badge(this, x + 70, y - 46, '골드로 강화!', COLOR.ruby).setScrollFactor(0).setDepth(UI_DEPTH + 130);
    this.tweens.add({ targets: tip, y: y - 54, scale: 1.08, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }

  private retry(): void {
    enterBattle(this, { stageId: this.stage.id, difficulty: this.difficulty }, { restart: true });
  }
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

/** 경험치 보석 3등급 + 골드 그림(도형). 소량 파랑 · 중량 보라 · 대량 금빛(약한 빛 테두리를 그림에 넣어 개체를 늘리지 않음) */
function makeGemTextures(scene: Phaser.Scene): void {
  const g = scene.make.graphics({}, false);
  const diamond = (cx: number, cy: number, w: number, h: number, body: number, hi: number) => {
    g.fillStyle(0x0b0d17, 0.9).fillTriangle(cx, cy - h / 2 - 2, cx + w / 2 + 2, cy - h / 2 + h * 0.45, cx - w / 2 - 2, cy - h / 2 + h * 0.45)
      .fillTriangle(cx - w / 2 - 2, cy - h / 2 + h * 0.45, cx + w / 2 + 2, cy - h / 2 + h * 0.45, cx, cy + h / 2 + 2);
    g.fillStyle(body).fillTriangle(cx, cy - h / 2, cx + w / 2, cy - h / 2 + h * 0.45, cx - w / 2, cy - h / 2 + h * 0.45)
      .fillTriangle(cx - w / 2, cy - h / 2 + h * 0.45, cx + w / 2, cy - h / 2 + h * 0.45, cx, cy + h / 2);
    g.fillStyle(hi).fillTriangle(cx, cy - h / 2 + 3, cx + w / 4, cy - h / 2 + h * 0.45, cx - w / 4, cy - h / 2 + h * 0.45);
  };
  diamond(10, 12, 16, 20, 0x4fc3f7, 0xb3e5fc);
  g.generateTexture('gem-small', 20, 24);
  g.clear();
  diamond(14, 17, 22, 28, 0xa855f7, 0xe9d5ff);
  g.generateTexture('gem-medium', 28, 34);
  g.clear();
  g.fillStyle(0xffd54f, 0.16).fillCircle(26, 26, 26);
  g.fillStyle(0xffd54f, 0.28).fillCircle(26, 26, 19);
  diamond(26, 26, 26, 34, 0xffc107, 0xfff3c4);
  g.generateTexture('gem-large', 52, 52);
  g.clear();
  g.fillStyle(0x0b0d17, 1).fillCircle(11, 11, 11);
  g.fillStyle(0xf9a825, 1).fillCircle(11, 11, 9);
  g.fillStyle(0xffe082, 1).fillCircle(11, 11, 6);
  g.fillStyle(0xfff8e1, 1).fillRect(9, 6, 2, 10);
  g.generateTexture('coin', 22, 22);
  g.destroy();
}

/** 어려움 공격 범위 배율: 원형 반지름·부채꼴 길이·충격파 안팎·직선 폭에 같은 배율(예고·판정 모두 이 값을 씀) */
function scaleAction(a: EnemyAction, m: number): EnemyAction {
  switch (a.kind) {
    case 'circleHit': return { ...a, r: a.r * m };
    case 'coneHit': return { ...a, r: a.r * m };
    case 'ringHit': return { ...a, inner: a.inner, outer: a.outer * m };
    case 'lineHit': return { ...a, width: a.width * m };
    default: return a;
  }
}
