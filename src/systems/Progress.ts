import { stageRule } from '../data/veryHardStages';
import { newStamina, type StaminaState } from './Stamina';
import {
  newMailbox, sanitizeMailbox, sanitizeStamina, grantClearGift, grantRuneMilestoneGift, claimOne, claimAll, spendStamina, syncCampaigns, pruneMailbox,
  type MailboxState,
} from './Mailbox';
import { activeCampaigns } from '../data/campaigns';
import { STAMINA } from './Stamina';
import {
  getUpgradeCost,
  PERMANENT_UPGRADES,
  UPGRADE_TYPES,
  type PermanentUpgrades,
  type UpgradeType,
} from '../data/progression';
import { DRAGON_ORDER, releasedDragons, DRAGONS, GROWTH, type DragonId } from '../data/dragons';
import {
  ACHIEVEMENTS,
  BOXES,
  CLEAR_CARDS,
  DIFFICULTY_REWARD,
  DAILY_IDS,
  DIFFICULTIES,
  DIFFICULTY_RELEASED,
  DIFFICULTY_UNLOCK_AT,
  DRAGON_BOX,
  econRarity,
  EQUIPMENT_BOX,
  ESSENCE,
  GOLD_OFFERS,
  RANDOM_FRAGMENT_RARITY,
  KST_OFFSET_MS,
  MISSIONS,
  stageBoxReward,
  RARITIES,
  STAGE_COUNT,
  DIFFICULTY_LABEL,
  UNIVERSAL,
  type BoxId,
  type Difficulty,
  type MissionDef,
  type Rarity,
  type RewardBundle,
} from '../data/economy';
import { EQUIP_RULES, EQUIPS, equipDef, NEXT_RARITY, SLOTS, type Slot } from '../data/equipment';
import { SPECIAL_IDS, SPECIAL_RULES, type SpecialId } from '../data/specials';
import { RUNE_BOX, RUNE_RULES, runeUpgradeCost } from '../data/runes';
import { WINTER_2026, WINTER_DRAGON, type RouletteReward } from '../data/events';
import { skinDef } from '../data/skins';
import { store as platformStore } from '../platform';
import { claimActivity, claimDailyAttendance, randomCardDragon } from './Activity';

// 계정 진행 저장. JSON 한 덩어리로 저장한다.
// 실제 저장 위치는 플랫폼마다 다르다(src/platform): 웹 localStorage · iOS Preferences · 토스 SDK Storage.
// 모든 변경은 "현재 상태 → 새 상태"를 만드는 순수 함수이고, 성공했을 때만 한 번에 저장한다(중간 실패 시 아무것도 안 바뀜).
// 지금은 무료 기기 저장(원문: 무료 웹 데모만 로컬 저장 허용). 유료 루비를 붙일 때는 서버 검증·거래 기록이 필요하다.

export const SAVE_KEY = 'dragon-force:progress';
export const BACKUP_KEY = 'dragon-force:progress:backup';
export const LEGACY_UNLOCK_KEY = 'dragon-squad:unlockedStage'; // 4단계 해금 저장(그대로 두고 읽기만 함)
export const SAVE_VERSION = 4; // v1: 5단계 연구소 · v2: 6단계 드래곤 컬렉션 · v3: 6단계 v1.2(카드·정수·조각·루비·장비·특수 스킬·난이도·미션) · v4: 8단계 행동력·선물함
const MAX_RUN_IDS = 30; // 중복 정산 방지용 최근 전투 기록 개수
const MAX_TX_IDS = 50; // 중복 요청 방지용 최근 거래 ID

/** 드래곤 한 종의 진행(원문 DragonProgress) */
export interface DragonProgress {
  dragonId: DragonId;
  unlocked: boolean;
  level: number; // 영구 레벨 1~40
  stars: number; // 승급 1~5성
  cards: number; // 영구 레벨업 재료(그 드래곤 전용)
  fragments: number; // 승급 재료 / 미보유면 정수 교환
}

/** 원문 SummonState */
export interface SummonState {
  /** 룬 상자 보장 진행(9면 다음은 10개 이상 묶음) — v1.2 */
  runePity?: number;
  tenPity: number; // 희귀 이상 정수 없이 연 드래곤·스킬 상자 수(9면 다음은 희귀 이상 정수)
  legendaryPity: number; // 전설 정수 없이 연 수(89면 다음은 전설 정수)
  legacyTickets: number; // 기존 소환권 → 드래곤·스킬 상자 무료 개봉권(삭제하지 않음)
  /** 장비·룬 상자 무료 개봉권(상시 출석·활동 보상, 2026-11-21) */
  equipTickets?: number;
  runeTickets?: number;
  totalOpens: number;
}

/** 상시 28일 출석(연속 아님): 받은 날 수와 마지막으로 받은 날(KST) — src/data/activity.ts */
export interface DailyAttendance {
  count: number;
  last: string;
}

/** 원문 DifficultyProgress */
export interface DifficultyProgress {
  unlocked: number[]; // 이 난이도에서 해금된 단계
  cleared: number[]; // 클리어한 서로 다른 단계 ID(진행도)
  claimed: number[]; // (예전) 받은 단계 상자 1~20 — 2026-11-23 밤부터 chests로 옮김, 읽을 때 비움
  /** 단계 상자 25·50·100%(제작자 요청 2026-11-23 밤): 받은 상자 코드 = 단계×10 + 칸(1=25%·2=50%·3=100%) */
  chests?: number[];
  /** 단계별 가장 멀리 간 칸(0~3): 1 = 첫 엘리트 처치, 2 = 두 번째 엘리트 처치, 3 = 클리어. 클리어한 단계는 저장 없이 3으로 본다 */
  reach?: Record<string, number>;
  /** 단계별 최고 기록(클리어 시간 ms, 짧을수록 좋음) — 어려움 기획서 9장, 2026-11-21. 예전 저장에는 없음 → 빈 값 */
  best?: Record<string, number>;
}

/** 원문 EquipmentItem */
export interface EquipmentItem {
  uid: string;
  itemId: string;
  rarity: Rarity;
  level: number;
  locked: boolean;
}

/** 룬(v1.2, 옛 장착형 특수 스킬): 조각 · 해금 여부 · 레벨(0 = 미해금, 해금하면 1부터) */
export interface SpecialState {
  fragments: number;
  unlocked: boolean;
  level: number;
}

export interface MissionState {
  progress: Record<string, number>; // `${missionId}@${기간키}` → 진행 수
  claimed: string[]; // `${missionId}@${기간키}`
  dailyDone: string[]; // 일일 미션을 모두 받은 날(KST 'YYYY-MM-DD')
}

/** 기간 이벤트 진행(이벤트 id별). 이벤트가 끝나도 받은 재화는 그대로, 기록도 남긴다 */
export interface EventState {
  seed: number; // 룰렛 난수 시드(처음 참여할 때 정함) — 회차마다 결과가 정해져 있어 다시 시도해도 바뀌지 않는다
  battles: number; // 룰렛 진행에 인정된 전투 수
  spinsUsed: number;
  milestones: number[]; // 받은 누적 보상(돌린 횟수 5·10·20·30)
  attendance: string[]; // 출석한 날(KST 'YYYY-MM-DD')
}

export interface PlayerProgress {
  saveVersion: number;
  gold: number;
  rubies: number;
  universalFragments: number;
  upgrades: PermanentUpgrades;
  /** 쉬움 난이도 해금 단계(4·5단계 호환용, difficulty.easy.unlocked와 같음) */
  unlockedStages: number[];
  selectedDragonId: DragonId;
  selectedDifficulty: Difficulty;
  rewardedRunIds: string[];
  txIds: string[];
  dragons: Record<DragonId, DragonProgress>;
  summon: SummonState;
  difficulty: Record<Difficulty, DifficultyProgress>;
  equipment: { items: EquipmentItem[]; equipped: Record<Slot, string | null>; nextUid: number };
  specials: Record<SpecialId, SpecialState>;
  equippedSpecial: SpecialId | null;
  missions: MissionState;
  events: Record<string, EventState>;
  attendance: DailyAttendance;
  claimed: string[]; // 일회성 보상: 'tutorial', 'first-clear-1'(v2 기록), 업적 id
  lifetime: { runs: number; normalKills: number; eliteKills: number; clears: number };
  // ── 8단계(v4) ──
  /** 계정을 처음 만든 시각(ms). v3 이전 저장은 0 = '캠페인 이전부터 있던 계정' */
  createdAt: number;
  stamina: StaminaState;
  mailbox: MailboxState;
  /** 상점 기록(2026-11-23): 무료 일일 선물·일일/주간/월간 특혜·한정 패키지 구매 횟수 — 'free@기간키' · 'pkg_xxx@기간키#거래' */
  shopLog: string[];
  /** 드래곤 패스(2026-11-23): 시즌 번호 · 시즌 시작 때 계정 경험치 · 받은 칸('free-3' 등) · 유료 줄 구매 여부 */
  pass: PassState;
  /** 루비 패스(2026-11-26): 유료 줄 구매 여부 · 받은 칸('free-3'·'paid-12'). 시즌 없음(계정 레벨 1~30) */
  rubyPass: RubyPassState;
  /** 스킨(2026-11-23 밤): 가진 스킨 · 장착(계정 공통) · 열쇠 · 이번 주 룰렛 판에서 뽑은 칸 */
  skins: SkinState;
}

export interface SkinState {
  owned: string[];
  cape: string | null;
  trail: string | null;
  keys: number;
  /** 룰렛 판: 주 키('w2026-11-23') · 그 주에 뽑은 칸 아이디 · 지금까지 돌린 횟수(난수 회차) */
  board: { week: string; picked: string[]; spins: number };
}

export interface RubyPassState {
  owned: boolean;
  claimed: string[];
}

export interface PassState {
  season: number;
  baseXp: number;
  claimed: string[];
  premium: boolean;
  royal: boolean;
}

/** 저장소 흉내(테스트에서는 메모리, 게임에서는 플랫폼 저장소) */
export interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const dragonState = (id: DragonId, unlocked = false): DragonProgress => ({ dragonId: id, unlocked, level: 1, stars: 1, cards: 0, fragments: 0 });
const emptyDiff = (): DifficultyProgress => ({ unlocked: [1], cleared: [], claimed: [], chests: [], reach: {}, best: {} });

export function defaultProgress(now = Date.now()): PlayerProgress {
  return {
    createdAt: now,
    stamina: newStamina(now),
    mailbox: newMailbox(),
    shopLog: [],
    pass: { season: 0, baseXp: 0, claimed: [], premium: false, royal: false },
    rubyPass: { owned: false, claimed: [] },
    skins: { owned: [], cape: null, trail: null, keys: 0, board: { week: '', picked: [], spins: 0 } },
    saveVersion: SAVE_VERSION,
    gold: 0,
    rubies: 0,
    universalFragments: 0,
    upgrades: { attack: 0, hp: 0, speed: 0, pickup: 0 },
    unlockedStages: [1],
    selectedDragonId: 'red',
    selectedDifficulty: 'easy',
    rewardedRunIds: [],
    txIds: [],
    dragons: Object.fromEntries(DRAGON_ORDER.map((id) => [id, dragonState(id, id === 'red')])) as Record<DragonId, DragonProgress>,
    summon: { tenPity: 0, legendaryPity: 0, legacyTickets: 1, totalOpens: 0, runePity: 0, equipTickets: 0, runeTickets: 0 }, // 튜토리얼 무료 개봉권 1장(기존 튜토리얼 소환권)
    difficulty: { easy: emptyDiff(), hard: { unlocked: [], cleared: [], claimed: [], chests: [], reach: {}, best: {} }, extreme: { unlocked: [], cleared: [], claimed: [], chests: [], reach: {}, best: {} } },
    equipment: { items: [], equipped: { weapon: null, armor: null, necklace: null, ring: null }, nextUid: 1 },
    specials: Object.fromEntries(SPECIAL_IDS.map((id) => [id, { fragments: 0, unlocked: false, level: 0 }])) as Record<SpecialId, SpecialState>,
    equippedSpecial: null,
    missions: { progress: {}, claimed: [], dailyDone: [] },
    events: {},
    attendance: { count: 0, last: '' },
    claimed: ['tutorial'],
    lifetime: { runs: 0, normalKills: 0, eliteKills: 0, clears: 0 },
  };
}

const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const ints = (v: unknown, min: number, max: number) => (Array.isArray(v) ? [...new Set(v.map((x) => int(x, min, max, min)))].sort((a, b) => a - b) : []);
const strs = (v: unknown, keep = Infinity) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))].slice(-keep) : []);

/** 손상·음수·범위 밖 값을 안전한 값으로 보정(모든 재화는 0 이상의 정수) */
export function sanitize(raw: Record<string, unknown>): PlayerProgress {
  const d = defaultProgress();
  const up = (raw.upgrades ?? {}) as Partial<PermanentUpgrades>;
  const upgrades = { ...d.upgrades };
  for (const t of UPGRADE_TYPES) upgrades[t] = int(up[t], 0, PERMANENT_UPGRADES[t].maxLevel, 0);

  const rd = (raw.dragons ?? {}) as Record<string, Partial<DragonProgress>>;
  const dragons = { ...d.dragons };
  for (const id of DRAGON_ORDER) {
    const o = rd[id];
    if (!o || typeof o !== 'object') continue;
    dragons[id] = {
      dragonId: id,
      unlocked: id === 'red' || o.unlocked === true,
      level: int(o.level, 1, GROWTH.maxLevel, 1),
      stars: int(o.stars, 1, GROWTH.maxStars, 1),
      cards: int(o.cards, 0, 1e9, 0),
      fragments: int(o.fragments, 0, 1e9, 0),
    };
  }
  dragons.red = { ...dragons.red, unlocked: true };

  const rawDiff = (raw.difficulty ?? {}) as Record<string, Partial<DifficultyProgress>>;
  const difficulty = { ...d.difficulty };
  for (const k of DIFFICULTIES) {
    const o = rawDiff[k] ?? {};
    difficulty[k] = {
      unlocked: ints(o.unlocked, 1, STAGE_COUNT),
      cleared: ints(o.cleared, 1, STAGE_COUNT),
      claimed: [],
      // 단계 상자 25·50·100%(2026-11-23 밤). 그전 "단계마다 상자 1개"로 받은 단계(claimed 1~20)는 세 칸 모두 받은 것으로 옮긴다.
      // 예전 진행도 상자 값(25·50·100)은 1~20 범위 밖이라 버린다.
      chests: [...new Set([
        ...(Array.isArray(o.chests) ? o.chests : []).filter((n) => Number.isInteger(n) && n % 10 >= 1 && n % 10 <= 3 && Math.floor(n / 10) >= 1 && Math.floor(n / 10) <= STAGE_COUNT),
        ...(Array.isArray(o.claimed) ? o.claimed : []).filter((n) => Number.isInteger(n) && n >= 1 && n <= STAGE_COUNT).flatMap((n) => [n * 10 + 1, n * 10 + 2, n * 10 + 3]),
      ])].sort((a, b) => a - b),
      reach: Object.fromEntries(
        Object.entries((o.reach ?? {}) as Record<string, unknown>)
          .filter(([st, v]) => Number(st) >= 1 && Number(st) <= STAGE_COUNT && Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 3)
          .map(([st, v]) => [String(Number(st)), v as number]),
      ),
      best: Object.fromEntries(
        Object.entries((o.best ?? {}) as Record<string, unknown>)
          .filter(([s, v]) => Number(s) >= 1 && Number(s) <= STAGE_COUNT && typeof v === 'number' && v > 0 && v < 3_600_000)
          .map(([s, v]) => [String(Number(s)), Math.round(v as number)]),
      ),
    };
  }
  // 쉬움은 항상 1단계부터. 4·5단계 저장의 해금 목록도 합친다.
  const legacyUnlocked = ints(raw.unlockedStages, 1, STAGE_COUNT);
  difficulty.easy.unlocked = [...new Set([1, ...difficulty.easy.unlocked, ...legacyUnlocked])].sort((a, b) => a - b);
  // 다음 난이도는 앞 난이도 20개를 모두 깼을 때 1단계가 열린다
  // (2026-11-24) 어려움은 쉬움 10개(DIFFICULTY_UNLOCK_AT)
  if (difficulty.easy.cleared.length >= DIFFICULTY_UNLOCK_AT.hard && !difficulty.hard.unlocked.includes(1)) difficulty.hard.unlocked = [1, ...difficulty.hard.unlocked];
  if (difficulty.hard.cleared.length >= DIFFICULTY_UNLOCK_AT.extreme && !difficulty.extreme.unlocked.includes(1)) difficulty.extreme.unlocked = [1, ...difficulty.extreme.unlocked];

  const rs = (raw.summon ?? {}) as Partial<SummonState>;
  const re = (raw.equipment ?? {}) as Partial<PlayerProgress['equipment']>;
  const items: EquipmentItem[] = [];
  const seen = new Set<string>();
  for (const it of Array.isArray(re.items) ? re.items : []) {
    if (!it || typeof it !== 'object' || !equipDef(it.itemId) || !RARITIES.includes(it.rarity) || typeof it.uid !== 'string' || seen.has(it.uid)) continue;
    seen.add(it.uid);
    items.push({ uid: it.uid, itemId: it.itemId, rarity: it.rarity, level: int(it.level, 1, EQUIP_RULES.maxLevel, 1), locked: it.locked === true });
  }
  const equipped = { ...d.equipment.equipped };
  const rEq = (re.equipped ?? {}) as Record<string, unknown>;
  for (const s of SLOTS) {
    const uid = rEq[s];
    const it = items.find((i) => i.uid === uid);
    equipped[s] = it && equipDef(it.itemId)!.slot === s ? it.uid : null;
  }
  const rsp = (raw.specials ?? {}) as Record<string, Partial<SpecialState>>;
  const specials = { ...d.specials };
  // v1.2 룬 이전: 예전 특수 스킬 해금 = 룬 Lv.1(조각은 그대로). 장착 칸은 없어져 모든 해금 룬이 적용된다
  for (const id of SPECIAL_IDS) {
    const unlocked = rsp[id]?.unlocked === true || int(rsp[id]?.level, 0, RUNE_RULES.maxLevel, 0) > 0;
    const level = unlocked ? int(rsp[id]?.level, 1, RUNE_RULES.maxLevel, 1) : 0;
    specials[id] = { fragments: int(rsp[id]?.fragments, 0, 1e9, 0), unlocked, level };
  }
  const eqSp = raw.equippedSpecial as SpecialId;
  const rm = (raw.missions ?? {}) as Partial<MissionState>;
  const progress: Record<string, number> = {};
  for (const [k, v] of Object.entries(rm.progress ?? {})) progress[k] = int(v, 0, 1e12, 0);
  const events: Record<string, EventState> = {};
  for (const [k, v] of Object.entries((raw.events ?? {}) as Record<string, Partial<EventState>>)) {
    if (!v || typeof v !== 'object') continue;
    events[k] = {
      seed: int(v.seed, 0, 0xffffffff, 0),
      battles: int(v.battles, 0, 1e9, 0),
      spinsUsed: int(v.spinsUsed, 0, 1e9, 0),
      milestones: ints(v.milestones, 0, 1e6),
      attendance: strs(v.attendance, 400),
    };
  }
  const lt = (raw.lifetime ?? {}) as Partial<PlayerProgress['lifetime']>;
  const sel = raw.selectedDragonId as DragonId;
  const selD = raw.selectedDifficulty as Difficulty;

  const nowMs = Date.now();
  return {
    createdAt: Math.min(nowMs, Math.max(0, Number(raw.createdAt) || 0)),
    stamina: sanitizeStamina(raw.stamina, nowMs),
    mailbox: sanitizeMailbox(raw.mailbox),
    shopLog: strs(raw.shopLog, 300),
    skins: (() => {
      const rk = (raw.skins ?? {}) as Partial<SkinState>;
      const owned = strs(rk.owned, 200).filter((id) => !!skinDef(id));
      const pick = (id: unknown, kind: 'cape' | 'trail') => (typeof id === 'string' && owned.includes(id) && skinDef(id)?.kind === kind ? id : null);
      const b = (rk.board ?? {}) as Partial<SkinState['board']>;
      return {
        owned,
        cape: pick(rk.cape, 'cape'),
        trail: pick(rk.trail, 'trail'),
        keys: int(rk.keys, 0, 99_999, 0),
        board: { week: typeof b.week === 'string' ? b.week.slice(0, 16) : '', picked: strs(b.picked, 20), spins: int(b.spins, 0, 1e9, 0) },
      };
    })(),
    pass: (() => {
      const rp = (raw.pass ?? {}) as Partial<PassState>;
      const royal = rp.royal === true;
      return { season: int(rp.season, 0, 1e6, 0), baseXp: int(rp.baseXp, 0, 1e12, 0), claimed: strs(rp.claimed, 200), premium: rp.premium === true || royal, royal };
    })(),
    rubyPass: (() => {
      const rr = (raw.rubyPass ?? {}) as Partial<RubyPassState>;
      return { owned: rr.owned === true, claimed: strs(rr.claimed, 100) };
    })(),
    saveVersion: SAVE_VERSION,
    gold: int(raw.gold, 0, 999_999_999, 0),
    rubies: int(raw.rubies, 0, 999_999_999, 0),
    universalFragments: int(raw.universalFragments, 0, 1e9, 0),
    upgrades,
    unlockedStages: difficulty.easy.unlocked,
    selectedDragonId: dragons[sel]?.unlocked ? sel : 'red',
    selectedDifficulty: DIFFICULTIES.includes(selD) && DIFFICULTY_RELEASED[selD] && difficulty[selD].unlocked.length ? selD : 'easy',
    rewardedRunIds: strs(raw.rewardedRunIds, MAX_RUN_IDS),
    txIds: strs(raw.txIds, MAX_TX_IDS),
    dragons,
    summon: {
      tenPity: int(rs.tenPity, 0, DRAGON_BOX.rareGuarantee - 1, 0),
      legendaryPity: int(rs.legendaryPity, 0, DRAGON_BOX.legendaryGuarantee - 1, 0),
      legacyTickets: int(rs.legacyTickets, 0, 99_999, 0),
      totalOpens: int(rs.totalOpens, 0, 1e9, 0),
      runePity: int(rs.runePity, 0, RUNE_BOX.guaranteeEvery - 1, 0),
      equipTickets: int(rs.equipTickets, 0, 99_999, 0),
      runeTickets: int(rs.runeTickets, 0, 99_999, 0),
    },
    difficulty,
    equipment: { items, equipped, nextUid: Math.max(int(re.nextUid, 1, 1e12, 1), items.length + 1) },
    specials,
    equippedSpecial: SPECIAL_IDS.includes(eqSp) && specials[eqSp].unlocked ? eqSp : null,
    missions: { progress, claimed: strs(rm.claimed, 400), dailyDone: strs(rm.dailyDone, 62) },
    events,
    attendance: {
      count: int((raw.attendance as Partial<DailyAttendance> | undefined)?.count, 0, 1e6, 0),
      last: typeof (raw.attendance as Partial<DailyAttendance> | undefined)?.last === 'string' ? String((raw.attendance as DailyAttendance).last).slice(0, 10) : '',
    },
    claimed: strs(raw.claimed),
    lifetime: {
      runs: int(lt.runs, 0, 1e9, 0),
      normalKills: int(lt.normalKills, 0, 1e12, 0),
      eliteKills: int(lt.eliteKills, 0, 1e9, 0),
      clears: int(lt.clears, 0, 1e9, 0),
    },
  };
}

/**
 * 이전 버전 데이터를 현재 버전으로 바꾼다.
 * v0(4단계 해금 키만) → v1(5단계 연구소) → v2(6단계: 레드 보유 + 튜토리얼 소환권) → v3(6단계 v1.2).
 * v2 → v3: 보유 드래곤·레벨·별 유지, 조각(shards) → 조각(fragments), 소환권 → 무료 개봉권(삭제 안 함),
 * 소환 보장 카운터 이어 감, 1단계 클리어 기록 → 쉬움 진행도 1/20.
 */
function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  let r = { ...raw };
  if (Number(r.saveVersion ?? 0) < 1) r = { ...r, saveVersion: 1 };
  if (Number(r.saveVersion) < 2) {
    const cleared = Array.isArray(r.unlockedStages) && (r.unlockedStages as number[]).includes(2);
    r = {
      ...r,
      saveVersion: 2,
      ownedDragons: { red: { dragonId: 'red', level: 1, stars: 1, shards: 0 } },
      summonTickets: 1 + (cleared ? 10 : 0), // v2 규칙 그대로(튜토리얼 1 + 첫 클리어 10)
      claimed: ['tutorial', ...(cleared ? ['first-clear-1'] : [])],
    };
  }
  if (Number(r.saveVersion) < 3) {
    const owned = (r.ownedDragons ?? {}) as Record<string, { level?: number; stars?: number; shards?: number }>;
    const dragons: Record<string, Partial<DragonProgress>> = {};
    for (const [id, o] of Object.entries(owned)) {
      if (!(id in DRAGONS) || !o) continue;
      dragons[id] = { unlocked: true, level: o.level, stars: o.stars, fragments: o.shards, cards: 0 };
    }
    const claimed = Array.isArray(r.claimed) ? (r.claimed as string[]) : [];
    const unlocked = Array.isArray(r.unlockedStages) ? (r.unlockedStages as number[]) : [1];
    // 실제로 깬 단계만 진행도에 넣는다: 첫 클리어 기록이 있거나 다음 단계가 해금된 단계(미구현 단계를 임의로 넣지 않음)
    const cleared = unlocked.filter((s) => claimed.includes(`first-clear-${s}`) || unlocked.includes(s + 1));
    r = {
      ...r,
      saveVersion: 3,
      dragons,
      summon: {
        tenPity: r.pullsSinceRareOrHigher,
        legendaryPity: r.pullsSinceLegendary,
        legacyTickets: r.summonTickets,
        totalOpens: r.totalPulls,
      },
      difficulty: { easy: { unlocked, cleared, claimed: [], chests: [], reach: {} } },
    };
  }
  if (Number(r.saveVersion) < 4) {
    // v3 → v4: 행동력 가득(40), 빈 선물함, 계정 생성 시각 0(=기존 유저).
    // 이미 깬 단계의 최초 클리어 행동력 20은 소급 지급(제작자 확정 2026-11-19 v2.0 0.2) — 접속 때 backfillClearGifts가 넣는다
    r = { ...r, saveVersion: 4, createdAt: 0, stamina: undefined, mailbox: { gifts: [], granted: [], history: [], backfilled: false } };
  }
  return r;
}

/** 4단계 해금 키('dragon-squad:unlockedStage' = "2" 같은 숫자)를 단계 목록으로 */
function legacyStages(store: Store): number[] {
  const n = int(store.getItem(LEGACY_UNLOCK_KEY), 1, 20, 1);
  return Array.from({ length: n }, (_, i) => i + 1);
}

export function loadProgress(store: Store): PlayerProgress {
  let text: string | null = null;
  try {
    text = store.getItem(SAVE_KEY);
  } catch {
    return defaultProgress();
  }
  if (text == null) return sanitize({ ...defaultProgress(), unlockedStages: legacyStages(store) }); // 첫 실행(4단계 해금 키가 있으면 유지)
  try {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object') throw new Error('bad');
    const m = migrate(raw);
    // 4단계 해금 기록은 지우지 않고 합친다(덮어쓰기 금지)
    return sanitize({ ...m, unlockedStages: [...ints(m.unlockedStages, 1, 20), ...legacyStages(store)] });
  } catch {
    // 손상된 데이터: 원본을 백업해 두고 기본값으로 복구
    try {
      store.setItem(BACKUP_KEY, text);
    } catch {
      /* 무시 */
    }
    return defaultProgress();
  }
}

export function saveProgress(store: Store, p: PlayerProgress): void {
  try {
    store.setItem(SAVE_KEY, JSON.stringify(p));
    // 4단계 코드와 호환: 쉬움 난이도에서 가장 높은 해금 단계도 예전 키에 같이 적어 둔다
    store.setItem(LEGACY_UNLOCK_KEY, String(Math.max(...p.difficulty.easy.unlocked)));
  } catch {
    /* 저장소를 못 쓰는 환경이면 건너뜀(시크릿 모드 등) */
  }
}

// ───────────────────────── 공통 결과 형식 ─────────────────────────
export type Fail = { ok: false; reason: string; cost?: number };
export type Ok<T = object> = { ok: true; progress: PlayerProgress; cost?: number } & T;
export type Result<T = object> = Ok<T> | Fail;
const fail = (reason: string, cost?: number): Fail => ({ ok: false, reason, cost });

/** 거래 ID로 중복 요청을 막는다(같은 ID는 한 번만 반영). 성공한 결과에만 ID를 남긴다. */
export function withTx<T>(p: PlayerProgress, txId: string | undefined, run: () => Result<T>): Result<T> {
  if (txId && p.txIds.includes(txId)) return fail('duplicate');
  const r = run();
  if (r.ok && txId) r.progress = { ...r.progress, txIds: [...r.progress.txIds, txId].slice(-MAX_TX_IDS) };
  return r;
}

// ───────────────────────── 연구소(5단계) ─────────────────────────
export type PurchaseResult = { ok: true; progress: PlayerProgress; cost: number } | { ok: false; reason: 'max' | 'gold'; cost: number };

/** 구매 가능 여부 검사 → 골드 차감과 레벨 증가를 한 번에(새 객체로) 반영 */
export function purchase(p: PlayerProgress, type: UpgradeType): PurchaseResult {
  const lv = p.upgrades[type];
  const cost = getUpgradeCost(lv);
  if (lv >= PERMANENT_UPGRADES[type].maxLevel) return { ok: false, reason: 'max', cost };
  if (p.gold < cost) return { ok: false, reason: 'gold', cost };
  return { ok: true, cost, progress: { ...p, gold: p.gold - cost, upgrades: { ...p.upgrades, [type]: lv + 1 } } };
}

// ───────────────────────── 전투 정산 ─────────────────────────
export interface RunRecord {
  stageId: number;
  cleared: boolean;
  elapsedMs: number;
  normalKills: number;
  eliteKills: number;
  difficulty?: Difficulty;
  dragonId?: DragonId;
  /** 끝난 방식(이벤트 룰렛: 클리어·사망·시간 초과만 정상 종료, 포기는 제외). 없으면 cleared로 추정 */
  outcome?: 'clear' | 'dead' | 'timeout' | 'quit';
}

export interface Reward {
  id: string;
  text: string;
  rubies?: number;
  gold?: number;
  cards?: { dragonId: DragonId; count: number };
}

const setDiff = (p: PlayerProgress, d: Difficulty, v: DifficultyProgress): PlayerProgress => {
  const difficulty = { ...p.difficulty, [d]: v };
  return { ...p, difficulty, unlockedStages: difficulty.easy.unlocked };
};

function openNextDifficulty(p: PlayerProgress): PlayerProgress {
  let r = p;
  if (r.difficulty.easy.cleared.length >= DIFFICULTY_UNLOCK_AT.hard && !r.difficulty.hard.unlocked.includes(1)) r = setDiff(r, 'hard', { ...r.difficulty.hard, unlocked: [1, ...r.difficulty.hard.unlocked] });
  if (r.difficulty.hard.cleared.length >= DIFFICULTY_UNLOCK_AT.extreme && !r.difficulty.extreme.unlocked.includes(1)) r = setDiff(r, 'extreme', { ...r.difficulty.extreme, unlocked: [1, ...r.difficulty.extreme.unlocked] });
  return r;
}

/** 로비 "난이도 해금" 연출을 이미 보여 줬다는 일회성 기록(claimed에 남겨 클라우드 저장과 함께 간다) */
export const unlockSeenKey = (d: Difficulty) => `unlock-seen-${d}`;

/**
 * 로비에서 해금 연출을 띄울 난이도(2026-11-24). 출시됐고 1단계가 열렸고 아직 연출을 안 봤으며 그 난이도를 한 판도 깨지 않았을 때만.
 * (이미 어려움을 깨고 있던 예전 저장에는 띄우지 않는다)
 */
export function pendingDifficultyUnlock(p: PlayerProgress): Difficulty | null {
  for (const d of ['hard', 'extreme'] as const) {
    const dp = p.difficulty[d];
    if (DIFFICULTY_RELEASED[d] && dp.unlocked.includes(1) && dp.cleared.length === 0 && !p.claimed.includes(unlockSeenKey(d))) return d;
  }
  return null;
}

export function markUnlockSeen(p: PlayerProgress, d: Difficulty): PlayerProgress {
  return p.claimed.includes(unlockSeenKey(d)) ? p : { ...p, claimed: [...p.claimed, unlockSeenKey(d)] };
}

const addCards = (p: PlayerProgress, id: DragonId, n: number): PlayerProgress => ({ ...p, dragons: { ...p.dragons, [id]: { ...p.dragons[id], cards: p.dragons[id].cards + n } } });
export const addFragments = (p: PlayerProgress, id: DragonId, n: number): PlayerProgress => ({ ...p, dragons: { ...p.dragons, [id]: { ...p.dragons[id], fragments: p.dragons[id].fragments + n } } });

/**
 * 전투 보상 정산. 같은 runId는 한 번만 지급한다.
 * 골드(5단계 공식) + 단계 해금 + 진행도(고유 단계) + 출격 드래곤 카드(최초 2·반복 1·실패 0, Lv.40이면 100G) + 업적 루비 + 미션 진행.
 */
export function settleRun(
  p: PlayerProgress,
  runId: string,
  gold: number,
  unlockStage?: number,
  run?: RunRecord,
  now = Date.now(),
): { progress: PlayerProgress; paid: boolean; rewards: Reward[] } {
  if (p.rewardedRunIds.includes(runId)) return { progress: p, paid: false, rewards: [] };
  const diff = run?.difficulty ?? 'easy';
  let next: PlayerProgress = {
    ...p,
    gold: p.gold + Math.max(0, Math.floor(gold)),
    rewardedRunIds: [...p.rewardedRunIds, runId].slice(-MAX_RUN_IDS),
  };
  const rewards: Reward[] = [];
  if (unlockStage && unlockStage <= STAGE_COUNT) {
    const dp = next.difficulty[diff];
    next = setDiff(next, diff, { ...dp, unlocked: [...new Set([...dp.unlocked, unlockStage])].sort((a, b) => a - b) });
  }
  if (run) {
    next = {
      ...next,
      lifetime: {
        runs: next.lifetime.runs + (run.elapsedMs >= 30_000 ? 1 : 0),
        normalKills: next.lifetime.normalKills + run.normalKills,
        eliteKills: next.lifetime.eliteKills + run.eliteKills,
        clears: next.lifetime.clears + (run.cleared ? 1 : 0),
      },
    };
    // 단계 상자 칸 진행(25% = 첫 엘리트, 50% = 두 번째 엘리트, 100% = 클리어) — 가장 멀리 간 기록만 남긴다
    {
      const cur = next.difficulty[diff];
      const got = run.cleared ? 3 : Math.min(2, Math.max(0, Math.floor(run.eliteKills)));
      const key = String(run.stageId);
      if (run.stageId >= 1 && run.stageId <= STAGE_COUNT && got > (cur.reach?.[key] ?? 0)) next = setDiff(next, diff, { ...cur, reach: { ...(cur.reach ?? {}), [key]: got } });
    }
    if (run.cleared) {
      const cur = next.difficulty[diff];
      const first = !cur.cleared.includes(run.stageId);
      if (first) next = setDiff(next, diff, { ...cur, cleared: [...cur.cleared, run.stageId].sort((a, b) => a - b) });
      // 단계별 최고 기록(난이도마다 따로)
      const bestNow = next.difficulty[diff].best ?? {};
      const prevBest = bestNow[String(run.stageId)];
      if (!prevBest || run.elapsedMs < prevBest) next = setDiff(next, diff, { ...next.difficulty[diff], best: { ...bestNow, [String(run.stageId)]: Math.round(run.elapsedMs) } });
      // 어려움 최초 클리어 루비(기본 클리어 보상과 따로, 1회만 — 5·10·15·20단계는 특별 보상 포함)
      const rule = first ? stageRule(diff, run.stageId) : null; // 어려움·매우 어려움(2026-11-26)
      if (rule) {
        const cr = rule.clearReward;
        next = { ...next, rubies: next.rubies + cr.rubies };
        const sp = cr.milestone ? ' 특별 보상' : '';
        rewards.push(diff === 'extreme'
          ? { id: `extreme-first:${run.stageId}`, text: `매우 어려움 ${run.stageId}단계 최초 클리어${sp}`, rubies: cr.rubies }
          : { id: `hard-first:${run.stageId}`, text: `어려움 ${run.stageId}단계 최초 클리어${sp}`, rubies: cr.rubies });
      }
      // 8단계: 스테이지·난이도별 최초 클리어 → 행동력 20을 선물함으로(바로 더하지 않음, 1회만)
      const gift = grantClearGift(next, diff, run.stageId, `${DIFFICULTY_LABEL[diff]} ${run.stageId}단계`, now);
      if (gift.added) {
        next = gift.progress;
        rewards.push({ id: `clear:${diff}:${run.stageId}`, text: `행동력 ${DIFFICULTY_REWARD[diff].stamina} → 선물함` });
      }
      // 10·20단계 클리어 → 룬 상자 10회권을 선물함으로(2026-11-26 제작자, 로비에서 축하 팝업)
      const rune = grantRuneMilestoneGift(next, diff, run.stageId, `${DIFFICULTY_LABEL[diff]} ${run.stageId}단계`, now);
      if (rune.added) {
        next = rune.progress;
        rewards.push({ id: `rune10:${diff}:${run.stageId}`, text: '룬 상자 10회권 → 선물함' });
      }
      // 출격 드래곤 카드(제작자 임시 규칙 2026-11-18): 골드 정산과 별개
      const did = run.dragonId ?? next.selectedDragonId;
      if (next.dragons[did].level >= GROWTH.maxLevel) {
        next = { ...next, gold: next.gold + CLEAR_CARDS.maxLevelGold };
        rewards.push({ id: `card-${runId}`, text: `${DRAGONS[did].short} Lv.40 — 카드 대신`, gold: CLEAR_CARDS.maxLevelGold });
      } else {
        const n = first ? DIFFICULTY_REWARD[diff].cards.first : DIFFICULTY_REWARD[diff].cards.repeat; // 어려울수록 더(11/25)
        next = addCards(next, did, n);
        rewards.push({ id: `card-${runId}`, text: `${DRAGONS[did].short} 카드(${first ? '최초 클리어' : '반복 클리어'})`, cards: { dragonId: did, count: n } });
      }
      next = openNextDifficulty(next); // 앞 난이도 20개를 모두 깨면 다음 난이도 1단계 해금
    }
    next = addMissionProgress(next, { clears: run.cleared ? 1 : 0, normalKills: run.normalKills, eliteKills: run.eliteKills, sorties: run.elapsedMs >= 30_000 ? 1 : 0 }, now);
    next = addEventBattle(next, run, now);
  }
  const a = claimAchievements(next);
  return { progress: a.progress, paid: true, rewards: [...rewards, ...a.rewards] };
}

/** 업적 조건 확인 → 아직 안 받은 업적 지급(루비). 이미 받은 업적(예전 소환권 지급분)은 다시 주지 않는다. */
export function claimAchievements(p: PlayerProgress): { progress: PlayerProgress; rewards: Reward[] } {
  const owned = DRAGON_ORDER.filter((id) => p.dragons[id].unlocked).length;
  const done: Record<string, boolean> = {
    'first-run': p.lifetime.runs >= 1,
    'first-elite': p.lifetime.eliteKills >= 1,
    'kills-1000': p.lifetime.normalKills >= 1000,
    'kills-10000': p.lifetime.normalKills >= 10000,
    'collector-3': owned >= 3,
  };
  const got = ACHIEVEMENTS.filter((a) => done[a.id] && !p.claimed.includes(a.id)).map((a) => ({ id: a.id, text: a.text, rubies: a.rubies }));
  if (got.length === 0) return { progress: p, rewards: [] };
  return {
    rewards: got,
    progress: { ...p, rubies: p.rubies + got.reduce((s, r) => s + r.rubies, 0), claimed: [...p.claimed, ...got.map((r) => r.id)] },
  };
}

// ───────────────────────── 난이도 진행도 상자(25·50·100%) ─────────────────────────
export const progressPct = (p: PlayerProgress, d: Difficulty) => Math.floor((p.difficulty[d].cleared.length / STAGE_COUNT) * 100);

export type ChestTier = 1 | 2 | 3;
export const CHEST_TIERS: ChestTier[] = [1, 2, 3];
export type StageChest = { stage: number; tier: ChestTier };
/** 그 단계에서 가장 멀리 간 칸(0~3). 클리어한 단계는 3 */
export const stageReach = (p: PlayerProgress, d: Difficulty, stage: number): number =>
  p.difficulty[d].cleared.includes(stage) ? 3 : Math.min(3, p.difficulty[d].reach?.[String(stage)] ?? 0);
/** 상자 한 칸의 상태: 닫힘(아직 못 감) · 받기(도달, 안 받음 — 반짝임) · 열림(받음). 한 번 받은 상자는 단계를 오가도 계속 열림 */
export function stageChestState(p: PlayerProgress, d: Difficulty, stage: number, tier: ChestTier): 'locked' | 'ready' | 'opened' {
  if ((p.difficulty[d].chests ?? []).includes(stage * 10 + tier)) return 'opened';
  return DIFFICULTY_RELEASED[d] && stageReach(p, d, stage) >= tier ? 'ready' : 'locked';
}

/** 받을 수 있는 단계 상자(도달했지만 아직 안 받은 칸, 낮은 단계·낮은 칸부터) */
export const claimableStageBoxes = (p: PlayerProgress, d: Difficulty): StageChest[] => {
  const out: StageChest[] = [];
  for (let s = 1; s <= STAGE_COUNT; s++) for (const t of CHEST_TIERS) if (stageChestState(p, d, s, t) === 'ready') out.push({ stage: s, tier: t });
  return out;
};

/** 단계 상자 모두 받기: 받은 상자 수와 합친 보상 */
export function claimAllStageBoxes(p: PlayerProgress, d: Difficulty): Result<{ reward: RewardBundle; count: number }> {
  const list = claimableStageBoxes(p, d);
  if (!list.length) return fail('locked');
  let cur = p;
  const sum: RewardBundle = {};
  for (const c of list) {
    const r = claimStageBox(cur, d, c.stage, c.tier);
    if (!r.ok) continue;
    cur = r.progress;
    sum.gold = (sum.gold ?? 0) + (r.reward.gold ?? 0);
    sum.rubies = (sum.rubies ?? 0) + (r.reward.rubies ?? 0);
    if (r.reward.fragments) sum.fragments = { dragonId: r.reward.fragments.dragonId, count: (sum.fragments?.count ?? 0) + r.reward.fragments.count };
  }
  return { ok: true, progress: cur, reward: sum, count: list.length };
}

/** 단계 상자 한 칸 받기: 그 칸까지 갔고 아직 안 받았으면, 계정당 칸마다 1회(최초 보상) */
export function claimStageBox(p: PlayerProgress, d: Difficulty, stage: number, tier: ChestTier): Result<{ reward: RewardBundle }> {
  const st = stageChestState(p, d, stage, tier);
  if (st === 'opened') return fail('claimed');
  if (st !== 'ready') return fail('locked');
  const dp = p.difficulty[d];
  const reward = stageBoxReward(d, stage, tier);
  let next = setDiff(p, d, { ...dp, chests: [...(dp.chests ?? []), stage * 10 + tier].sort((a, b) => a - b) });
  next = { ...next, gold: next.gold + (reward.gold ?? 0), rubies: next.rubies + (reward.rubies ?? 0) };
  if (reward.fragments) next = addFragments(next, reward.fragments.dragonId, reward.fragments.count);
  return { ok: true, progress: next, reward };
}

// ───────────────────────── 드래곤 육성: 레벨(카드+골드)·승급·정수·범용 조각 ─────────────────────────

/** 영구 레벨업: 그 드래곤 카드 + 골드 */
export function levelUpDragon(p: PlayerProgress, id: DragonId): Result {
  const d = p.dragons[id];
  if (!d.unlocked) return fail('locked');
  if (d.level >= GROWTH.maxLevel) return fail('max');
  const cost = GROWTH.levelCost(d.level);
  const cards = GROWTH.cardCost(d.level);
  if (d.cards < cards) return fail('cards', cost);
  if (p.gold < cost) return fail('gold', cost);
  return { ok: true, cost, progress: { ...p, gold: p.gold - cost, dragons: { ...p.dragons, [id]: { ...d, level: d.level + 1, cards: d.cards - cards } } } };
}

/** 범용 조각을 이 드래곤 승급에 최대 몇 개 쓸 수 있나(전설은 필요량의 25%까지) */
export function universalLimit(id: DragonId, cost: number): number {
  return DRAGONS[id].rarity === 'legendary' ? Math.floor(cost * UNIVERSAL.legendaryMaxShare) : cost;
}

/** 승급: 그 드래곤 조각 20/40/80/160. 모자라면 범용 조각으로 채울 수 있다(useUniversal) */
export function starUpDragon(p: PlayerProgress, id: DragonId, useUniversal = false): Result<{ usedUniversal: number }> {
  const d = p.dragons[id];
  if (!d.unlocked) return fail('locked');
  if (d.stars >= GROWTH.maxStars) return fail('max');
  const cost = GROWTH.starCost[d.stars - 1];
  const short = Math.max(0, cost - d.fragments);
  const uni = useUniversal ? Math.min(short, p.universalFragments, universalLimit(id, cost)) : 0;
  if (d.fragments + uni < cost) return fail('fragments', cost);
  return {
    ok: true,
    cost,
    usedUniversal: uni,
    progress: {
      ...p,
      universalFragments: p.universalFragments - uni,
      dragons: { ...p.dragons, [id]: { ...d, stars: d.stars + 1, fragments: d.fragments - (cost - uni) } },
    },
  };
}

/** 미보유 드래곤: 조각 40/60/100/160 → 정수 1개로 해금(보유한 드래곤은 교환 불가 — 순환 교환 방지) */
export function exchangeEssence(p: PlayerProgress, id: DragonId): Result {
  const d = p.dragons[id];
  if (d.unlocked) return fail('owned');
  const cost = ESSENCE.fragmentsToEssence[econRarity(DRAGONS[id].rarity)];
  if (d.fragments < cost) return fail('fragments', cost);
  const next = { ...p, dragons: { ...p.dragons, [id]: { ...d, unlocked: true, fragments: d.fragments - cost } } };
  return { ok: true, cost, progress: claimAchievements(next).progress };
}

/** 5성 이후 초과 조각 → 범용 조각(일반 5:1 · 희귀 4:1 · 영웅 2:1 · 전설 1:1). 사용자가 직접 교환, 나머지는 보관. */
export function convertToUniversal(p: PlayerProgress, id: DragonId): Result<{ gained: number }> {
  const d = p.dragons[id];
  if (!d.unlocked || d.stars < GROWTH.maxStars) return fail('not5');
  const rate = UNIVERSAL.rate[econRarity(DRAGONS[id].rarity)];
  const gained = Math.floor(d.fragments / rate);
  if (gained <= 0) return fail('fragments', rate);
  return {
    ok: true,
    gained,
    progress: { ...p, universalFragments: p.universalFragments + gained, dragons: { ...p.dragons, [id]: { ...d, fragments: d.fragments - gained * rate } } },
  };
}

export function selectDragon(p: PlayerProgress, id: DragonId): PlayerProgress {
  return p.dragons[id].unlocked ? { ...p, selectedDragonId: id } : p;
}

export function selectDifficulty(p: PlayerProgress, d: Difficulty): PlayerProgress {
  return DIFFICULTY_RELEASED[d] && p.difficulty[d].unlocked.length ? { ...p, selectedDifficulty: d } : p;
}

// ───────────────────────── 루비 상자(드래곤·스킬 / 장비 / 골드) ─────────────────────────
export type BoxResult =
  | { kind: 'essence'; dragonId: DragonId; rarity: Rarity; isNew: boolean; fragments: number; guaranteed: 'legendary' | 'rare' | null }
  | { kind: 'card'; dragonId: DragonId; rarity: Rarity; count: number }
  | { kind: 'fragment'; dragonId: DragonId; rarity: Rarity; count: number }
  | { kind: 'special'; specialId: SpecialId; count: number }
  | { kind: 'equipment'; item: EquipmentItem }
  | { kind: 'gold'; gold: number };

function pickWeighted<T extends string | number>(weights: [T, number][], r: number): T {
  const total = weights.reduce((a, [, w]) => a + w, 0);
  let x = r * total;
  for (const [k, w] of weights) if ((x -= w) < 0) return k;
  return weights[weights.length - 1][0];
}
const rarityRoll = (w: Record<Rarity, number>, r: number) => pickWeighted<Rarity>(RARITIES.map((k) => [k, w[k]]), r);
const pickIn = <T>(arr: T[], r: number) => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];
/** 정수·조각을 줄 수 있는 드래곤(레드 제외) */
export const BOX_POOL = releasedDragons().filter((id) => id !== 'red'); // 출시된 드래곤만 뽑힘
export const poolOf = (r: Rarity, withRed: boolean) => releasedDragons().filter((id) => (withRed || id !== 'red') && econRarity(DRAGONS[id].rarity) === r);

/**
 * 드래곤·스킬 상자 1회. 보장(원문 6장):
 * - 전설 보장 먼저: 전설 정수 없이 89회 → 90회째 전설 정수
 * - 희귀 보장: 희귀 이상 정수 없이 9회 → 10회째 희귀 이상 정수(22:7:1)
 * - 보장 결과는 그 회차 결과를 대신한다(추가 지급 아님). 희귀 이상 정수 → 10회 카운터 0, 전설 정수 → 90회 카운터 0.
 */
export function openDragonBoxOnce(p: PlayerProgress, rnd: () => number): { progress: PlayerProgress; result: BoxResult } {
  const B = DRAGON_BOX;
  const s = p.summon;
  let guaranteed: 'legendary' | 'rare' | null = null;
  let kind: keyof typeof B.kind;
  let essRarity: Rarity | null = null;
  if (s.legendaryPity >= B.legendaryGuarantee - 1) {
    kind = 'essence';
    essRarity = 'legendary';
    guaranteed = 'legendary';
  } else if (s.tenPity >= B.rareGuarantee - 1) {
    kind = 'essence';
    essRarity = pickWeighted<Rarity>([['rare', B.guaranteeWeights.rare], ['epic', B.guaranteeWeights.epic], ['legendary', B.guaranteeWeights.legendary]], rnd());
    guaranteed = 'rare';
  } else {
    kind = pickWeighted(Object.entries(B.kind) as [keyof typeof B.kind, number][], rnd());
    if (kind === 'essence') essRarity = rarityRoll(B.essenceRarity, rnd());
  }
  let next = p;
  let result: BoxResult;
  if (kind === 'essence') {
    const r = essRarity!;
    const id = pickIn(poolOf(r, false), rnd());
    const d = next.dragons[id];
    const frag = d.unlocked ? ESSENCE.essenceToFragments[r] : 0;
    next = { ...next, dragons: { ...next.dragons, [id]: d.unlocked ? { ...d, fragments: d.fragments + frag } : { ...d, unlocked: true } } };
    result = { kind: 'essence', dragonId: id, rarity: r, isNew: !d.unlocked, fragments: frag, guaranteed };
  } else if (kind === 'card') {
    const r = rarityRoll(B.essenceRarity, rnd());
    const id = pickIn(poolOf(r, true), rnd());
    next = addCards(next, id, B.cardCount[r]);
    result = { kind: 'card', dragonId: id, rarity: r, count: B.cardCount[r] };
  } else if (kind === 'fragment') {
    const r = rarityRoll(B.essenceRarity, rnd());
    const id = pickIn(poolOf(r, false), rnd());
    next = addFragments(next, id, B.fragmentCount[r]);
    result = { kind: 'fragment', dragonId: id, rarity: r, count: B.fragmentCount[r] };
  } else {
    // (v1.2부터 드래곤 상자에서 룬 조각은 나오지 않음 — 1차 추첨표에 없음)
    result = { kind: 'card', dragonId: 'red', rarity: 'common', count: 1 };
  }
  const gotRare = kind === 'essence' && essRarity !== 'common';
  const gotLeg = kind === 'essence' && essRarity === 'legendary';
  next = {
    ...next,
    summon: { ...next.summon, tenPity: gotRare ? 0 : s.tenPity + 1, legendaryPity: gotLeg ? 0 : s.legendaryPity + 1, totalOpens: s.totalOpens + 1 },
  };
  return { progress: next, result };
}

function openEquipmentOnce(p: PlayerProgress, rnd: () => number): { progress: PlayerProgress; result: BoxResult } {
  const rarity = rarityRoll(EQUIPMENT_BOX.rarity, rnd());
  const def = pickIn(EQUIPS, rnd());
  const item: EquipmentItem = { uid: `e${p.equipment.nextUid}`, itemId: def.id, rarity, level: 1, locked: false };
  return {
    result: { kind: 'equipment', item },
    progress: { ...p, equipment: { ...p.equipment, items: [...p.equipment.items, item], nextUid: p.equipment.nextUid + 1 } },
  };
}

/** 룬 상자 1회(v1.2): 룬 조각 묶음 하나(15종 균등). 매 10회째는 10개 이상 */
function openRuneOnce(p: PlayerProgress, rnd: () => number): { progress: PlayerProgress; result: BoxResult } {
  const pity = p.summon.runePity ?? 0;
  const guaranteed = pity >= RUNE_BOX.guaranteeEvery - 1;
  const count = pickWeighted<number>(guaranteed ? RUNE_BOX.guaranteeBundles : RUNE_BOX.bundles, rnd());
  const sid = pickIn(SPECIAL_IDS, rnd());
  const s = p.specials[sid];
  return {
    result: { kind: 'special', specialId: sid, count },
    progress: {
      ...p,
      specials: { ...p.specials, [sid]: { ...s, fragments: s.fragments + count } },
      summon: { ...p.summon, runePity: count >= 10 ? 0 : pity + 1 },
    },
  };
}

/** 골드 직접 구매(v1.2 상점 개편) */
export function buyGold(p: PlayerProgress, offerId: string): Result<{ gold: number }> {
  const o = GOLD_OFFERS.find((x) => x.id === offerId);
  if (!o) return fail('missing');
  if (p.rubies < o.rubies) return fail('rubies', o.rubies);
  return { ok: true, cost: o.rubies, progress: { ...p, rubies: p.rubies - o.rubies, gold: p.gold + o.gold }, gold: o.gold };
}

/**
 * 상자 열기: 결제(루비 또는 무료 개봉권) → 추첨 N회 → 지급 → 보장 갱신을 한 덩어리로.
 * 무료 개봉권은 드래곤·스킬 상자만(기존 소환권 보존분). 10회는 1회 × 10을 순서대로(보장도 순서대로 적용).
 */
export function openBox(
  p: PlayerProgress,
  box: BoxId,
  count: 1 | 10,
  pay: 'ruby' | 'ticket' = 'ruby',
  rnd: () => number = Math.random,
): Result<{ results: BoxResult[]; rewards: Reward[] }> {
  const price = count === 10 ? BOXES[box].price10 : BOXES[box].price1;
  let cur: PlayerProgress;
  if (pay === 'ticket') {
    // 상자마다 따로인 무료 개봉권(드래곤 = 기존 legacyTickets, 장비·룬 = 출석·활동 보상)
    const field = box === 'dragon' ? 'legacyTickets' : box === 'equipment' ? 'equipTickets' : 'runeTickets';
    const have = p.summon[field] ?? 0;
    if (have < count) return fail('tickets', count);
    cur = { ...p, summon: { ...p.summon, [field]: have - count } };
  } else {
    if (p.rubies < price) return fail('rubies', price);
    cur = { ...p, rubies: p.rubies - price };
  }
  const results: BoxResult[] = [];
  for (let i = 0; i < count; i++) {
    const r = box === 'dragon' ? openDragonBoxOnce(cur, rnd) : box === 'equipment' ? openEquipmentOnce(cur, rnd) : openRuneOnce(cur, rnd);
    cur = r.progress;
    results.push(r.result);
  }
  const a = claimAchievements(cur); // 드래곤 3종 보유 업적
  return { ok: true, cost: pay === 'ruby' ? price : 0, progress: a.progress, results, rewards: a.rewards };
}

// ───────────────────────── 장비 ─────────────────────────
const findItem = (p: PlayerProgress, uid: string) => p.equipment.items.find((i) => i.uid === uid);
export const isEquipped = (p: PlayerProgress, uid: string) => SLOTS.some((s) => p.equipment.equipped[s] === uid);

export function equipItem(p: PlayerProgress, uid: string): Result {
  const it = findItem(p, uid);
  if (!it) return fail('missing');
  const slot = equipDef(it.itemId)!.slot;
  return { ok: true, progress: { ...p, equipment: { ...p.equipment, equipped: { ...p.equipment.equipped, [slot]: uid } } } };
}

export function unequipSlot(p: PlayerProgress, slot: Slot): Result {
  return { ok: true, progress: { ...p, equipment: { ...p.equipment, equipped: { ...p.equipment.equipped, [slot]: null } } } };
}

export function toggleLock(p: PlayerProgress, uid: string): Result {
  if (!findItem(p, uid)) return fail('missing');
  return { ok: true, progress: { ...p, equipment: { ...p.equipment, items: p.equipment.items.map((i) => (i.uid === uid ? { ...i, locked: !i.locked } : i)) } } };
}

/** 장비 강화: 골드, Lv.10 상한 */
export function upgradeItem(p: PlayerProgress, uid: string): Result {
  const it = findItem(p, uid);
  if (!it) return fail('missing');
  if (it.level >= EQUIP_RULES.maxLevel) return fail('max');
  const cost = EQUIP_RULES.upgradeCost(it.level);
  if (p.gold < cost) return fail('gold', cost);
  return {
    ok: true,
    cost,
    progress: { ...p, gold: p.gold - cost, equipment: { ...p.equipment, items: p.equipment.items.map((i) => (i.uid === uid ? { ...i, level: i.level + 1 } : i)) } },
  };
}

/** 합성 재료 후보: 같은 장비 ID·같은 등급, 잠금·장착 중인 장비는 제외 */
export function fuseCandidates(p: PlayerProgress, uid: string): EquipmentItem[] {
  const it = findItem(p, uid);
  if (!it) return [];
  return p.equipment.items.filter((i) => i.itemId === it.itemId && i.rarity === it.rarity && !i.locked && !isEquipped(p, i.uid));
}

/**
 * 합성: 같은 장비·같은 등급 3개(고른 장비 + 레벨 낮은 순 2개) → 한 등급 위 Lv.1 1개. 재료는 모두 삭제.
 * 전설은 합성 불가, 잠금·장착 장비는 재료에서 제외. 한 번의 상태 갱신으로 처리(원자성).
 */
export function fuseItem(p: PlayerProgress, uid: string): Result<{ item: EquipmentItem; used: string[] }> {
  const it = findItem(p, uid);
  if (!it) return fail('missing');
  const up = NEXT_RARITY[it.rarity];
  if (!up) return fail('max');
  if (it.locked || isEquipped(p, uid)) return fail('locked');
  const others = fuseCandidates(p, uid)
    .filter((i) => i.uid !== uid)
    .sort((a, b) => a.level - b.level || a.uid.localeCompare(b.uid));
  if (others.length < EQUIP_RULES.fuseCount - 1) return fail('count');
  const used = [uid, ...others.slice(0, EQUIP_RULES.fuseCount - 1).map((i) => i.uid)];
  const item: EquipmentItem = { uid: `e${p.equipment.nextUid}`, itemId: it.itemId, rarity: up, level: 1, locked: false };
  return {
    ok: true,
    item,
    used,
    progress: { ...p, equipment: { ...p.equipment, items: [...p.equipment.items.filter((i) => !used.includes(i.uid)), item], nextUid: p.equipment.nextUid + 1 } },
  };
}

// ───────────────────────── 장착형 특수 스킬 ─────────────────────────
/** 룬 강화(v1.2): Lv.n → n+1, 룬 조각만(골드 안 씀 — 제작자 확정 2026-11-21). 최대 RUNE_RULES.maxLevel */
export function upgradeRune(p: PlayerProgress, id: SpecialId): Result {
  const s = p.specials[id];
  if (!s.unlocked || s.level < 1) return fail('locked');
  if (s.level >= RUNE_RULES.maxLevel) return fail('max');
  const c = runeUpgradeCost(s.level);
  if (s.fragments < c.fragments) return fail('fragments', c.fragments);
  return {
    ok: true,
    cost: 0,
    progress: { ...p, specials: { ...p.specials, [id]: { ...s, fragments: s.fragments - c.fragments, level: s.level + 1 } } },
  };
}

/** 룬 해금(옛 특수 스킬 해금): 조각 50개 → 룬 Lv.1 */
export function unlockSpecial(p: PlayerProgress, id: SpecialId): Result {
  const s = p.specials[id];
  if (s.unlocked) return fail('owned');
  if (s.fragments < SPECIAL_RULES.unlockFragments) return fail('fragments', SPECIAL_RULES.unlockFragments);
  return { ok: true, progress: { ...p, specials: { ...p.specials, [id]: { fragments: s.fragments - SPECIAL_RULES.unlockFragments, unlocked: true, level: Math.max(1, s.level) } } } };
}

/** (v1.2부터 쓰지 않음) 옛 특수 스킬 장착 — 룬은 장착 없이 모두 적용. 저장 필드 equippedSpecial은 예전 저장 호환용으로만 남김 */

// ───────────────────────── 주기 보상(일일·주간·월간·이벤트, KST) ─────────────────────────
const kstDate = (now: number) => new Date(now + KST_OFFSET_MS);
/** 상점 특혜 기간 키(일일·주간·월간, KST) — 미션과 같은 규칙 */
export const dealPeriodKey = (period: 'daily' | 'weekly' | 'monthly' | 'once', now: number) =>
  period === 'once' ? 'once' : periodKey({ period, id: '' }, now);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
/** 기간 키: 일일 'YYYY-MM-DD' · 주간 그 주 월요일 날짜 · 월간 'YYYY-MM' · 이벤트 이벤트 id (모두 KST 자정 기준) */
export function periodKey(m: Pick<MissionDef, 'period' | 'id'>, now: number): string {
  const d = kstDate(now);
  if (m.period === 'daily') return ymd(d);
  if (m.period === 'monthly') return ymd(d).slice(0, 7);
  if (m.period === 'weekly') {
    const dow = (d.getUTCDay() + 6) % 7; // 월요일 0
    return `w${ymd(new Date(d.getTime() - dow * 86_400_000))}`;
  }
  return `e-${m.id}`;
}

/** 지금 보이는 미션(이벤트는 기간 안에 있을 때만) */
export function activeMissions(now: number, list: MissionDef[] = MISSIONS): MissionDef[] {
  const today = ymd(kstDate(now));
  return list.filter((m) => m.period !== 'event' || ((!m.from || today >= m.from) && (!m.to || today <= m.to)));
}

const mKey = (m: MissionDef, now: number) => `${m.id}@${periodKey(m, now)}`;

export function missionProgress(p: PlayerProgress, m: MissionDef, now: number): number {
  if (m.metric === 'dailyDays') {
    const month = ymd(kstDate(now)).slice(0, 7);
    return p.missions.dailyDone.filter((d) => d.startsWith(month)).length;
  }
  return p.missions.progress[mKey(m, now)] ?? 0;
}

export const missionClaimed = (p: PlayerProgress, m: MissionDef, now: number) => p.missions.claimed.includes(mKey(m, now));

/** 전투 결과를 이번 기간 미션에 더한다. 지난 기간 진행 기록은 지운다(받은 기록은 남겨 중복 지급을 막는다). */
export function addMissionProgress(p: PlayerProgress, add: Partial<Record<Exclude<MissionDef['metric'], 'dailyDays'>, number>>, now: number): PlayerProgress {
  const keep = new Set(activeMissions(now).map((m) => mKey(m, now)));
  const progress: Record<string, number> = {};
  for (const [k, v] of Object.entries(p.missions.progress)) if (keep.has(k)) progress[k] = v;
  for (const m of activeMissions(now)) {
    if (m.metric === 'dailyDays') continue;
    const k = mKey(m, now);
    progress[k] = (progress[k] ?? 0) + (add[m.metric] ?? 0);
  }
  return { ...p, missions: { ...p.missions, progress } };
}

/** 랜덤 조각: 등급 확률(RANDOM_FRAGMENT_RARITY)로 등급 → 그 등급의 출시 드래곤 중 균등(레드는 일반) */
export function randomFragmentDragon(rng: () => number = Math.random): DragonId {
  const r = rarityRoll(RANDOM_FRAGMENT_RARITY, rng());
  const pool = poolOf(r, true);
  const list = pool.length ? pool : poolOf('common', true);
  return pickIn(list, rng());
}

/**
 * 미션 보상 받기. 카드는 보유 드래곤 중 무작위(randomCardDragon, 2026-11-25), 랜덤 조각은 등급 확률로 자동 지급 — 고르는 것 없음.
 * 같은 기간에 한 번만. 일일 미션을 모두 받으면 그날이 "일일 미션 완료한 날"로 기록된다(월간 미션).
 */
export function claimMission(p: PlayerProgress, missionId: string, now: number, rng: () => number = Math.random): Result<{ reward: MissionDef['reward']; fragmentDragon?: DragonId; cardDragon?: DragonId }> {
  const m = activeMissions(now).find((x) => x.id === missionId);
  if (!m) return fail('missing');
  const key = mKey(m, now);
  if (p.missions.claimed.includes(key)) return fail('claimed');
  if (missionProgress(p, m, now) < m.goal) return fail('progress');
  const rw = m.reward;
  let next: PlayerProgress = { ...p, gold: p.gold + (rw.gold ?? 0), rubies: p.rubies + (rw.rubies ?? 0) };
  const cardDragon = rw.pickCards ? randomCardDragon(p, rng) : undefined;
  if (rw.pickCards && cardDragon) next = addCards(next, cardDragon, rw.pickCards);
  const fragmentDragon = rw.randomFragments ? randomFragmentDragon(rng) : undefined;
  if (rw.randomFragments && fragmentDragon) next = addFragments(next, fragmentDragon, rw.randomFragments);
  const claimed = [...next.missions.claimed, key].slice(-400);
  let dailyDone = next.missions.dailyDone;
  const today = ymd(kstDate(now));
  if (m.period === 'daily' && DAILY_IDS.every((id) => claimed.includes(`${id}@${today}`)) && !dailyDone.includes(today)) dailyDone = [...dailyDone, today].slice(-62);
  next = { ...next, missions: { ...next.missions, claimed, dailyDone } };
  return { ok: true, progress: next, reward: rw, fragmentDragon, cardDragon };
}

/** 받을 수 있는 미션(선택 보상 포함) */
export function claimableMissions(p: PlayerProgress, now: number): MissionDef[] {
  return activeMissions(now).filter((m) => !missionClaimed(p, m, now) && missionProgress(p, m, now) >= m.goal);
}

/**
 * 미션 모두 받기(2026-11-21 기획서 9.3): 완료한 미션을 한 번에(카드도 2026-11-25부터 무작위라 같이 받음). left는 늘 0(호환용).
 * 한 미션씩 claimMission을 그대로 거치므로 중복 지급 규칙(기간당 1회)도 같다.
 */
export function claimAllMissions(p: PlayerProgress, now: number, rng: () => number = Math.random): Result<{ got: MissionDef[]; left: number; fragments: { dragonId: DragonId; count: number }[]; cards: { dragonId: DragonId; count: number }[] }> {
  let cur = p;
  const got: MissionDef[] = [];
  const fragments: { dragonId: DragonId; count: number }[] = [];
  const cards: { dragonId: DragonId; count: number }[] = [];
  const left = 0;
  for (const m of claimableMissions(p, now)) {
    const r = claimMission(cur, m.id, now, rng);
    if (r.ok) {
      cur = r.progress;
      got.push(m);
      if (r.fragmentDragon) fragments.push({ dragonId: r.fragmentDragon, count: m.reward.randomFragments ?? 0 });
      if (r.cardDragon) cards.push({ dragonId: r.cardDragon, count: m.reward.pickCards ?? 0 });
    }
  }
  if (!got.length) return fail('none');
  return { ok: true, progress: cur, got, left, fragments, cards };
}

/** 업적 진행(화면 표시용): 현재 값·목표·완료 여부 */
export function achievementProgress(p: PlayerProgress): { id: string; cur: number; goal: number; done: boolean }[] {
  const owned = DRAGON_ORDER.filter((id) => p.dragons[id].unlocked).length;
  const val: Record<string, [number, number]> = {
    'first-run': [p.lifetime.runs, 1],
    'first-elite': [p.lifetime.eliteKills, 1],
    'kills-1000': [p.lifetime.normalKills, 1000],
    'kills-10000': [p.lifetime.normalKills, 10000],
    'collector-3': [owned, 3],
  };
  return ACHIEVEMENTS.map((a) => {
    const [cur, goal] = val[a.id] ?? [0, 1];
    const done = p.claimed.includes(a.id) || cur >= goal;
    return { id: a.id, cur: done ? goal : Math.min(cur, goal), goal, done };
  });
}

// ───────────────────────── 기간 이벤트: 드래곤의 겨울 축제(v1.3) ─────────────────────────
const EV = WINTER_2026;
const evStart = Date.parse(EV.startKst);
const evEnd = Date.parse(EV.endKst);
/** 이벤트 기간인가(KST 12/1 00:00 이상, 1/1 00:00 미만) */
export const eventActive = (now: number) => now >= evStart && now < evEnd;
/** 크리스마스 출석 기간인가(KST 12/18 00:00 이상, 1/1 00:00 미만 — 룰렛보다 짧음) */
export const attendanceActive = (now: number) => now >= Date.parse(EV.attendanceStartKst) && now < Date.parse(EV.attendanceEndKst);

/** 이벤트 상태(없으면 새로 — 시드는 처음 참여할 때 한 번 정한다) */
export function eventState(p: PlayerProgress, rnd: () => number = Math.random): EventState {
  return p.events[EV.id] ?? { seed: (Math.floor(rnd() * 0xfffffffe) + 1) >>> 0, battles: 0, spinsUsed: 0, milestones: [], attendance: [] };
}
const setEvent = (p: PlayerProgress, st: EventState): PlayerProgress => ({ ...p, events: { ...p.events, [EV.id]: st } });

export const spinsAvailable = (st: EventState) => Math.floor(st.battles / EV.battlesPerSpin) - st.spinsUsed;

/** 정상 종료(클리어·사망·시간 초과) + 60초 이상 전투만 1판으로 센다. 같은 전투는 settleRun의 runId 확인으로 한 번만. */
export function addEventBattle(p: PlayerProgress, run: RunRecord, now: number): PlayerProgress {
  if (!eventActive(now)) return p;
  const outcome = run.outcome ?? (run.cleared ? 'clear' : 'dead');
  if (outcome === 'quit' || run.elapsedMs < EV.minBattleMs) return p;
  const st = eventState(p);
  return setEvent(p, { ...st, battles: st.battles + 1 });
}

/** 시드 + 회차로 정해지는 난수(mulberry32). 같은 저장·같은 회차면 늘 같은 결과 */
export function eventRng(seed: number, index: number): () => number {
  let a = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickRoulette(r: number): RouletteReward {
  const total = EV.roulette.reduce((a, x) => a + x.weight, 0);
  let x = r * total;
  for (const it of EV.roulette) if ((x -= it.weight) < 0) return it;
  return EV.roulette[EV.roulette.length - 1];
}

/** 정수 확정 상자: 그 희귀도 드래곤 하나(레드 제외, 균등). 보유 중이면 조각. 소환 천장 카운터는 건드리지 않는다. */
export function grantEssence(p: PlayerProgress, rarity: Rarity, r: number): { progress: PlayerProgress; dragonId: DragonId; isNew: boolean; fragments: number } {
  return grantDragonEssence(p, pickIn(poolOf(rarity, false), r), rarity);
}

/** 정해진 드래곤의 정수 1개: 없으면 해금, 있으면 그 등급의 중복 조각(영웅 50). 겨울 축제 드래곤 칸이 쓴다. */
function grantDragonEssence(p: PlayerProgress, id: DragonId, rarity: Rarity): { progress: PlayerProgress; dragonId: DragonId; isNew: boolean; fragments: number } {
  const d = p.dragons[id];
  const frag = d.unlocked ? ESSENCE.essenceToFragments[rarity] : 0;
  return {
    dragonId: id,
    isNew: !d.unlocked,
    fragments: frag,
    progress: { ...p, dragons: { ...p.dragons, [id]: d.unlocked ? { ...d, fragments: d.fragments + frag } : { ...d, unlocked: true } } },
  };
}

export interface SpinResult {
  reward: RouletteReward;
  essence?: { dragonId: DragonId; isNew: boolean; fragments: number };
  /** 축제 드래곤 조각 칸 */
  fragments?: { dragonId: DragonId; count: number };
  milestone?: { spins: number; rubies: number; essence?: { dragonId: DragonId; isNew: boolean; fragments: number } };
}

/** 룰렛 1회: 기회 차감 → 추첨(시드 난수) → 지급 → 누적 보상(도달한 구간은 그 자리에서 1회 지급)을 한 번에 */
export function spinRoulette(p: PlayerProgress, now: number): Result<SpinResult> {
  if (!eventActive(now)) return fail('ended');
  const st = eventState(p);
  if (spinsAvailable(st) <= 0) return fail('spins');
  const rnd = eventRng(st.seed, st.spinsUsed);
  const reward = pickRoulette(rnd());
  let next = p;
  const res: SpinResult = { reward };
  if (reward.rubies) next = { ...next, rubies: next.rubies + reward.rubies };
  if (reward.essence) {
    const g = grantEssence(next, reward.essence, rnd());
    next = g.progress;
    res.essence = { dragonId: g.dragonId, isNew: g.isNew, fragments: g.fragments };
  }
  if (reward.fragments) {
    next = addFragments(next, WINTER_DRAGON, reward.fragments);
    res.fragments = { dragonId: WINTER_DRAGON, count: reward.fragments };
  }
  if (reward.dragonEssence) {
    const g = grantDragonEssence(next, WINTER_DRAGON, econRarity(DRAGONS[WINTER_DRAGON].rarity));
    next = g.progress;
    res.essence = { dragonId: g.dragonId, isNew: g.isNew, fragments: g.fragments };
  }
  const used = st.spinsUsed + 1;
  const ms = EV.milestones.find((m) => m.spins === used && !st.milestones.includes(m.spins));
  if (ms) {
    next = { ...next, rubies: next.rubies + ms.rubies };
    res.milestone = { spins: ms.spins, rubies: ms.rubies };
    if (ms.essence) {
      const g = grantEssence(next, ms.essence, rnd());
      next = g.progress;
      res.milestone.essence = { dragonId: g.dragonId, isNew: g.isNew, fragments: g.fragments };
    }
  }
  next = setEvent(next, { ...st, spinsUsed: used, milestones: ms ? [...st.milestones, ms.spins] : st.milestones });
  return { ok: true, progress: claimAchievements(next).progress, ...res };
}

/** 크리스마스 출석: 하루 1회(KST), n번째 출석은 표의 (n mod 7)번째 보상. 빠진 날이 있어도 누적은 이어진다. */
export function claimAttendance(p: PlayerProgress, now: number): Result<{ day: number; rubies: number }> {
  if (!attendanceActive(now)) return fail(now < Date.parse(EV.attendanceStartKst) ? 'notYet' : 'ended');
  const st = eventState(p);
  const today = ymd(kstDate(now));
  if (st.attendance.includes(today)) return fail('claimed');
  const day = attendanceDay(now); // 달력 기준 n일차(12/18 = 1일차). 빠진 날의 보상은 사라진다
  const rubies = attendanceReward(day);
  return { ok: true, day, rubies, progress: setEvent({ ...p, rubies: p.rubies + rubies }, { ...st, attendance: [...st.attendance, today] }) };
}

/** 출석 기간 일수(12/18~12/31 = 14) */
export const attendanceDays = () => Math.round((Date.parse(EV.attendanceEndKst) - Date.parse(EV.attendanceStartKst)) / 86_400_000);
/**
 * 오늘이 출석 몇 일차인가(제작자 2026-11-25: 달력 기준 — 1일차 받고 2일차에 안 들어오면 3일차엔 3일차 보상만, 2일차 보상은 사라짐).
 * 기간 전이면 0, 지나면 attendanceDays()+1.
 */
export function attendanceDay(now: number): number {
  const d = Math.floor((now - Date.parse(EV.attendanceStartKst)) / 86_400_000) + 1;
  return Math.max(0, Math.min(attendanceDays() + 1, d));
}
/** n일차 보상: 7일 표 반복(1·8일차 100 … 7·14일차 700) */
export const attendanceReward = (day: number) => EV.attendance[(day - 1) % EV.attendance.length];
/** n일차 날짜(KST 'YYYY-MM-DD') */
export const attendanceDate = (day: number) => ymd(kstDate(Date.parse(EV.attendanceStartKst) + (day - 1) * 86_400_000));

export const attendedToday = (p: PlayerProgress, now: number) => eventState(p).attendance.includes(ymd(kstDate(now)));

// ───────────────────────── 게임에서 쓰는 창구(플랫폼 저장소) ─────────────────────────
const browserStore = (): Store => platformStore;

/** 시작할 때 미리 읽어 둘 저장 키 */
export const STORAGE_KEYS = [SAVE_KEY, BACKUP_KEY, LEGACY_UNLOCK_KEY];

/** 항상 저장소의 최신 상태를 읽어 처리하고, 성공했을 때만 바로 저장한다(연속 클릭에도 재화가 음수가 되지 않음) */
/** 성장 행동(연구소·드래곤·장비·룬 강화)이 성공하면 일일 미션 "성장 1회"에 더한다 */
function grow<T extends { ok: boolean }>(f: (p: PlayerProgress) => T): (p: PlayerProgress) => T {
  return (p) => {
    const r = f(p);
    const pr = (r as { progress?: PlayerProgress }).progress;
    return r.ok && pr ? { ...r, progress: addMissionProgress(pr, { growth: 1 }, Date.now()) } : r;
  };
}

function act<T extends { ok: boolean }>(f: (p: PlayerProgress) => T): T {
  const r = f(Progress.load());
  const pr = (r as { progress?: PlayerProgress }).progress;
  if (r.ok && pr) Progress.save(pr);
  return r;
}


/**
 * 지난 최초 클리어의 행동력 20 소급 지급(8단계 v2.0 0.2 확정): 클리어 기록과 지급 기록을 비교해 없는 것만 1회씩.
 * 같은 id(`clear:<난이도>:<단계>`)를 쓰므로 이미 받은 것·앞으로 깨는 것과 겹치지 않는다.
 * v4 첫판(소급 안 함으로 '지급함' 표시만 했던 저장)은 선물·수령 내역에 실제로 없는 id를 지급 기록에서 한 번 지운 뒤 다시 계산한다.
 */
export function backfillClearGifts(p: PlayerProgress, now: number): { progress: PlayerProgress; added: number } {
  let cur = p;
  if (!cur.mailbox.backfilled) {
    const real = new Set([...cur.mailbox.gifts.map((g) => g.id), ...cur.mailbox.history.map((h) => h.id)]);
    cur = { ...cur, mailbox: { ...cur.mailbox, granted: cur.mailbox.granted.filter((id) => !id.startsWith('clear:') || real.has(id)), backfilled: true } };
  }
  let added = 0;
  for (const d of DIFFICULTIES) {
    for (const st of [...(cur.difficulty[d]?.cleared ?? [])].sort((a, b) => a - b)) {
      const r = grantClearGift(cur, d, st, `${DIFFICULTY_LABEL[d]} ${st}단계`, now);
      if (r.added) added++;
      cur = r.progress;
      // 이미 10·20단계를 깬 계정도 룬 상자 10회권을 받는다(2026-11-26)
      const rr = grantRuneMilestoneGift(cur, d, st, `${DIFFICULTY_LABEL[d]} ${st}단계`, now);
      if (rr.added) added++;
      cur = rr.progress;
    }
  }
  return { progress: cur, added };
}

/** 테스터 링크(?dev=1): 루비·골드 최소 20,000 + 출시된 난이도의 만들어진 단계 전부 해금. 클리어 기록·진행도는 그대로 */
export const DEV_BOOST = { rubies: 20_000, gold: 20_000 } as const;
export function devBoost(p: PlayerProgress, builtStages: number[]): PlayerProgress {
  const difficulty = { ...p.difficulty };
  for (const d of DIFFICULTIES) {
    if (!DIFFICULTY_RELEASED[d]) continue;
    difficulty[d] = { ...difficulty[d], unlocked: [...new Set([...difficulty[d].unlocked, ...builtStages])].sort((a, b) => a - b) };
  }
  return { ...p, rubies: Math.max(p.rubies, DEV_BOOST.rubies), gold: Math.max(p.gold, DEV_BOOST.gold), difficulty, unlockedStages: difficulty.easy.unlocked };
}

export const Progress = {
  load: () => loadProgress(browserStore()),
  // ── 8단계: 행동력·선물함 ──
  /** 접속·화면 진입 때: 운영자 캠페인 확인 → 선물함에 넣기, 오래된 선물 정리 */
  syncMail(now: number, dev = false) {
    const p = this.load();
    const b = backfillClearGifts(p, now);
    const r = syncCampaigns(b.progress, activeCampaigns(dev), now);
    const box = pruneMailbox(r.progress.mailbox, now);
    if (b.progress !== p || r.added.length || box !== r.progress.mailbox) this.save({ ...r.progress, mailbox: box });
    return r.added;
  },
  claimGift: (id: string, now: number) => act((p) => claimOne(p, id, now)),
  claimAllGifts: (now: number) => act((p) => claimAll(p, now)),
  /** 스테이지 입장: 행동력 차감(부족하면 ok:false, 아무것도 바뀌지 않음) */
  spendEntry: (now: number, cost: number = STAMINA.entryCost) => act((p) => spendStamina(p, cost, now)),
  save: (p: PlayerProgress) => saveProgress(browserStore(), p),
  buy: (type: UpgradeType) => act(grow((p) => purchase(p, type))),
  settle(runId: string, gold: number, unlockStage?: number, run?: RunRecord, now = Date.now()) {
    const r = settleRun(this.load(), runId, gold, unlockStage, run, now);
    if (r.paid) this.save(r.progress);
    return r;
  },
  openBox: (box: BoxId, count: 1 | 10, pay: 'ruby' | 'ticket', txId?: string) => act((p) => withTx(p, txId, () => openBox(p, box, count, pay))),
  levelUp: (id: DragonId) => act(grow((p) => levelUpDragon(p, id))),
  starUp: (id: DragonId, useUniversal = false) => act(grow((p) => starUpDragon(p, id, useUniversal))),
  exchangeEssence: (id: DragonId) => act((p) => exchangeEssence(p, id)),
  toUniversal: (id: DragonId) => act((p) => convertToUniversal(p, id)),
  select(id: DragonId): void {
    this.save(selectDragon(this.load(), id));
  },
  selectDifficulty(d: Difficulty): void {
    this.save(selectDifficulty(this.load(), d));
  },
  markUnlockSeen(d: Difficulty): void {
    this.save(markUnlockSeen(this.load(), d));
  },
  claimStageBox: (d: Difficulty, stage: number, tier: ChestTier) => act((p) => claimStageBox(p, d, stage, tier)),
  claimAllStageBoxes: (d: Difficulty) => act((p) => claimAllStageBoxes(p, d)),
  claimMission: (id: string, now = Date.now()) => act((p) => claimMission(p, id, now)),
  claimAllMissions: (now = Date.now()) => act((p) => claimAllMissions(p, now)),
  equip: (uid: string) => act((p) => equipItem(p, uid)),
  unequip: (slot: Slot) => act((p) => unequipSlot(p, slot)),
  lock: (uid: string) => act((p) => toggleLock(p, uid)),
  upgradeItem: (uid: string) => act(grow((p) => upgradeItem(p, uid))),
  fuse: (uid: string) => act((p) => fuseItem(p, uid)),
  unlockSpecial: (id: SpecialId) => act(grow((p) => unlockSpecial(p, id))),
  upgradeRune: (id: SpecialId) => act(grow((p) => upgradeRune(p, id))),
  buyGold: (offerId: string, txId?: string) => act((p) => withTx(p, txId, () => buyGold(p, offerId))),
  spin: (now: number) => act((p) => spinRoulette(p, now)),
  attend: (now: number) => act((p) => claimAttendance(p, now)),
  // ── 상시 활동 점수·28일 출석(2026-11-21, src/systems/Activity.ts) ──
  claimActivity: (kind: 'daily' | 'weekly', at: number, now: number) => act((p) => claimActivity(p, kind, at, now, Math.random)),
  claimDailyAttendance: (now: number) => act((p) => claimDailyAttendance(p, now, Math.random)),
  devBoost(builtStages: number[]): void {
    this.save(devBoost(this.load(), builtStages));
  },
  /**
   * 데모 저장 처음 만들기(?demo=1, 웹 전용 · 진짜 저장과 따로): 루비 30,000 · 골드 300,000 · 개봉권 30,
   * 드래곤 10종 보유(카드 50장씩), 쉬움 1~20단계 열림. 이미 데모 저장이 있으면 그대로(이어서 시험).
   */
  seedDemo(): void {
    if (browserStore().getItem(SAVE_KEY)) return;
    let n = defaultProgress();
    n = { ...n, rubies: 30000, gold: 300000, summon: { ...n.summon, legacyTickets: 30 } };
    for (const id of releasedDragons()) n = { ...n, dragons: { ...n.dragons, [id]: { ...n.dragons[id], unlocked: true } } };
    for (const id of releasedDragons()) n = addCards(n, id, 50);
    const all = Array.from({ length: 20 }, (_, i) => i + 1);
    n = { ...n, unlockedStages: all, difficulty: { ...n.difficulty, easy: { ...n.difficulty.easy, unlocked: all } } };
    this.save(n);
  },
  devGrant(): void {
    let n = this.load();
    n = { ...n, rubies: n.rubies + 3000, gold: n.gold + 20000 };
    for (const id of releasedDragons()) n = addCards(n, id, 20);
    this.save(n);
  },
  reset() {
    const s = browserStore();
    const cur = s.getItem(SAVE_KEY);
    if (cur) s.setItem(BACKUP_KEY, cur);
    saveProgress(s, defaultProgress());
    s.setItem(LEGACY_UNLOCK_KEY, '1');
  },
};
