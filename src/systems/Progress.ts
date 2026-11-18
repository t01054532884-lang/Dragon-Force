import {
  getUpgradeCost,
  PERMANENT_UPGRADES,
  UPGRADE_TYPES,
  type PermanentUpgrades,
  type UpgradeType,
} from '../data/progression';
import { DRAGON_ORDER, DRAGONS, GROWTH, type DragonId } from '../data/dragons';
import {
  ACHIEVEMENTS,
  BOXES,
  CLEAR_CARDS,
  DAILY_IDS,
  DIFFICULTIES,
  DIFFICULTY_RELEASED,
  DRAGON_BOX,
  econRarity,
  EQUIPMENT_BOX,
  ESSENCE,
  GOLD_BOX,
  KST_OFFSET_MS,
  MISSIONS,
  PROGRESS_REWARDS,
  PROGRESS_STEPS,
  RARITIES,
  STAGE_COUNT,
  UNIVERSAL,
  type BoxId,
  type Difficulty,
  type MissionDef,
  type Rarity,
  type RewardBundle,
} from '../data/economy';
import { EQUIP_RULES, EQUIPS, equipDef, NEXT_RARITY, SLOTS, type Slot } from '../data/equipment';
import { SPECIAL_IDS, SPECIAL_RULES, type SpecialId } from '../data/specials';
import { WINTER_2026, type RouletteReward } from '../data/events';
import { store as platformStore } from '../platform';

// 계정 진행 저장. JSON 한 덩어리로 저장한다.
// 실제 저장 위치는 플랫폼마다 다르다(src/platform): 웹 localStorage · iOS Preferences · 토스 SDK Storage.
// 모든 변경은 "현재 상태 → 새 상태"를 만드는 순수 함수이고, 성공했을 때만 한 번에 저장한다(중간 실패 시 아무것도 안 바뀜).
// 지금은 무료 기기 저장(원문: 무료 웹 데모만 로컬 저장 허용). 유료 루비를 붙일 때는 서버 검증·거래 기록이 필요하다.

export const SAVE_KEY = 'dragon-force:progress';
export const BACKUP_KEY = 'dragon-force:progress:backup';
export const LEGACY_UNLOCK_KEY = 'dragon-squad:unlockedStage'; // 4단계 해금 저장(그대로 두고 읽기만 함)
export const SAVE_VERSION = 3; // v1: 5단계 연구소 · v2: 6단계 드래곤 컬렉션 · v3: 6단계 v1.2(카드·정수·조각·루비·장비·특수 스킬·난이도·미션)
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
  tenPity: number; // 희귀 이상 정수 없이 연 드래곤·스킬 상자 수(9면 다음은 희귀 이상 정수)
  legendaryPity: number; // 전설 정수 없이 연 수(89면 다음은 전설 정수)
  legacyTickets: number; // 기존 소환권 → 드래곤·스킬 상자 무료 개봉권(삭제하지 않음)
  totalOpens: number;
}

/** 원문 DifficultyProgress */
export interface DifficultyProgress {
  unlocked: number[]; // 이 난이도에서 해금된 단계
  cleared: number[]; // 클리어한 서로 다른 단계 ID(진행도)
  claimed: number[]; // 받은 진행도 상자(25·50·100)
}

/** 원문 EquipmentItem */
export interface EquipmentItem {
  uid: string;
  itemId: string;
  rarity: Rarity;
  level: number;
  locked: boolean;
}

export interface SpecialState {
  fragments: number;
  unlocked: boolean;
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
  claimed: string[]; // 일회성 보상: 'tutorial', 'first-clear-1'(v2 기록), 업적 id
  lifetime: { runs: number; normalKills: number; eliteKills: number; clears: number };
}

/** 저장소 흉내(테스트에서는 메모리, 게임에서는 플랫폼 저장소) */
export interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const dragonState = (id: DragonId, unlocked = false): DragonProgress => ({ dragonId: id, unlocked, level: 1, stars: 1, cards: 0, fragments: 0 });
const emptyDiff = (): DifficultyProgress => ({ unlocked: [1], cleared: [], claimed: [] });

export function defaultProgress(): PlayerProgress {
  return {
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
    summon: { tenPity: 0, legendaryPity: 0, legacyTickets: 1, totalOpens: 0 }, // 튜토리얼 무료 개봉권 1장(기존 튜토리얼 소환권)
    difficulty: { easy: emptyDiff(), hard: { unlocked: [], cleared: [], claimed: [] }, extreme: { unlocked: [], cleared: [], claimed: [] } },
    equipment: { items: [], equipped: { weapon: null, armor: null, necklace: null, ring: null }, nextUid: 1 },
    specials: Object.fromEntries(SPECIAL_IDS.map((id) => [id, { fragments: 0, unlocked: false }])) as Record<SpecialId, SpecialState>,
    equippedSpecial: null,
    missions: { progress: {}, claimed: [], dailyDone: [] },
    events: {},
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
      claimed: ints(o.claimed, 0, 100).filter((n) => (PROGRESS_STEPS as readonly number[]).includes(n)),
    };
  }
  // 쉬움은 항상 1단계부터. 4·5단계 저장의 해금 목록도 합친다.
  const legacyUnlocked = ints(raw.unlockedStages, 1, STAGE_COUNT);
  difficulty.easy.unlocked = [...new Set([1, ...difficulty.easy.unlocked, ...legacyUnlocked])].sort((a, b) => a - b);
  // 다음 난이도는 앞 난이도 20개를 모두 깼을 때 1단계가 열린다
  if (difficulty.easy.cleared.length >= STAGE_COUNT && !difficulty.hard.unlocked.includes(1)) difficulty.hard.unlocked = [1, ...difficulty.hard.unlocked];
  if (difficulty.hard.cleared.length >= STAGE_COUNT && !difficulty.extreme.unlocked.includes(1)) difficulty.extreme.unlocked = [1, ...difficulty.extreme.unlocked];

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
  for (const id of SPECIAL_IDS) specials[id] = { fragments: int(rsp[id]?.fragments, 0, 1e9, 0), unlocked: rsp[id]?.unlocked === true };
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

  return {
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
    },
    difficulty,
    equipment: { items, equipped, nextUid: Math.max(int(re.nextUid, 1, 1e12, 1), items.length + 1) },
    specials,
    equippedSpecial: SPECIAL_IDS.includes(eqSp) && specials[eqSp].unlocked ? eqSp : null,
    missions: { progress, claimed: strs(rm.claimed, 400), dailyDone: strs(rm.dailyDone, 62) },
    events,
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
      difficulty: { easy: { unlocked, cleared, claimed: [] } },
    };
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
  if (r.difficulty.easy.cleared.length >= STAGE_COUNT && !r.difficulty.hard.unlocked.includes(1)) r = setDiff(r, 'hard', { ...r.difficulty.hard, unlocked: [1, ...r.difficulty.hard.unlocked] });
  if (r.difficulty.hard.cleared.length >= STAGE_COUNT && !r.difficulty.extreme.unlocked.includes(1)) r = setDiff(r, 'extreme', { ...r.difficulty.extreme, unlocked: [1, ...r.difficulty.extreme.unlocked] });
  return r;
}

const addCards = (p: PlayerProgress, id: DragonId, n: number): PlayerProgress => ({ ...p, dragons: { ...p.dragons, [id]: { ...p.dragons[id], cards: p.dragons[id].cards + n } } });
const addFragments = (p: PlayerProgress, id: DragonId, n: number): PlayerProgress => ({ ...p, dragons: { ...p.dragons, [id]: { ...p.dragons[id], fragments: p.dragons[id].fragments + n } } });

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
    if (run.cleared) {
      const cur = next.difficulty[diff];
      const first = !cur.cleared.includes(run.stageId);
      if (first) next = setDiff(next, diff, { ...cur, cleared: [...cur.cleared, run.stageId].sort((a, b) => a - b) });
      // 출격 드래곤 카드(제작자 임시 규칙 2026-11-18): 골드 정산과 별개
      const did = run.dragonId ?? next.selectedDragonId;
      if (next.dragons[did].level >= GROWTH.maxLevel) {
        next = { ...next, gold: next.gold + CLEAR_CARDS.maxLevelGold };
        rewards.push({ id: `card-${runId}`, text: `${DRAGONS[did].short} Lv.40 — 카드 대신`, gold: CLEAR_CARDS.maxLevelGold });
      } else {
        const n = first ? CLEAR_CARDS.first : CLEAR_CARDS.repeat;
        next = addCards(next, did, n);
        rewards.push({ id: `card-${runId}`, text: `${DRAGONS[did].short} 카드(${first ? '최초 클리어' : '반복 클리어'})`, cards: { dragonId: did, count: n } });
      }
      next = openNextDifficulty(next); // 앞 난이도 20개를 모두 깨면 다음 난이도 1단계 해금
    }
    next = addMissionProgress(next, { clears: run.cleared ? 1 : 0, normalKills: run.normalKills, eliteKills: run.eliteKills }, now);
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

/** 진행도 상자 받기: 달성했고 아직 안 받은 것만, 계정당 1회 */
export function claimProgressBox(p: PlayerProgress, d: Difficulty, step: 25 | 50 | 100): Result<{ reward: RewardBundle }> {
  const dp = p.difficulty[d];
  if (dp.claimed.includes(step)) return fail('claimed');
  if (progressPct(p, d) < step) return fail('locked');
  const reward = PROGRESS_REWARDS[d][step];
  let next = setDiff(p, d, { ...dp, claimed: [...dp.claimed, step].sort((a, b) => a - b) });
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
export const BOX_POOL = DRAGON_ORDER.filter((id) => id !== 'red');
export const poolOf = (r: Rarity, withRed: boolean) => DRAGON_ORDER.filter((id) => (withRed || id !== 'red') && econRarity(DRAGONS[id].rarity) === r);

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
    const sid = pickIn(SPECIAL_IDS, rnd());
    next = { ...next, specials: { ...next.specials, [sid]: { ...next.specials[sid], fragments: next.specials[sid].fragments + B.specialFragments } } };
    result = { kind: 'special', specialId: sid, count: B.specialFragments };
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

function openGoldOnce(p: PlayerProgress, rnd: () => number): { progress: PlayerProgress; result: BoxResult } {
  const gold = pickWeighted<number>(GOLD_BOX.table, rnd());
  return { result: { kind: 'gold', gold }, progress: { ...p, gold: p.gold + gold } };
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
    if (box !== 'dragon') return fail('ticket-box');
    if (p.summon.legacyTickets < count) return fail('tickets', count);
    cur = { ...p, summon: { ...p.summon, legacyTickets: p.summon.legacyTickets - count } };
  } else {
    if (p.rubies < price) return fail('rubies', price);
    cur = { ...p, rubies: p.rubies - price };
  }
  const results: BoxResult[] = [];
  for (let i = 0; i < count; i++) {
    const r = box === 'dragon' ? openDragonBoxOnce(cur, rnd) : box === 'equipment' ? openEquipmentOnce(cur, rnd) : openGoldOnce(cur, rnd);
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
export function unlockSpecial(p: PlayerProgress, id: SpecialId): Result {
  const s = p.specials[id];
  if (s.unlocked) return fail('owned');
  if (s.fragments < SPECIAL_RULES.unlockFragments) return fail('fragments', SPECIAL_RULES.unlockFragments);
  return { ok: true, progress: { ...p, specials: { ...p.specials, [id]: { fragments: s.fragments - SPECIAL_RULES.unlockFragments, unlocked: true } } } };
}

export function equipSpecial(p: PlayerProgress, id: SpecialId | null): Result {
  if (id && !p.specials[id].unlocked) return fail('locked');
  return { ok: true, progress: { ...p, equippedSpecial: id } };
}

// ───────────────────────── 주기 보상(일일·주간·월간·이벤트, KST) ─────────────────────────
const kstDate = (now: number) => new Date(now + KST_OFFSET_MS);
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
export function addMissionProgress(p: PlayerProgress, add: { clears: number; normalKills: number; eliteKills: number }, now: number): PlayerProgress {
  const keep = new Set(activeMissions(now).map((m) => mKey(m, now)));
  const progress: Record<string, number> = {};
  for (const [k, v] of Object.entries(p.missions.progress)) if (keep.has(k)) progress[k] = v;
  for (const m of activeMissions(now)) {
    if (m.metric === 'dailyDays') continue;
    const k = mKey(m, now);
    progress[k] = (progress[k] ?? 0) + add[m.metric];
  }
  return { ...p, missions: { ...p.missions, progress } };
}

/**
 * 미션 보상 받기. 선택 카드·조각은 받을 드래곤(choice)을 함께 넘긴다(카드는 보유 드래곤, 조각은 어느 드래곤이든).
 * 같은 기간에 한 번만. 일일 미션을 모두 받으면 그날이 "일일 미션 완료한 날"로 기록된다(월간 미션).
 */
export function claimMission(p: PlayerProgress, missionId: string, now: number, choice?: DragonId): Result<{ reward: MissionDef['reward'] }> {
  const m = activeMissions(now).find((x) => x.id === missionId);
  if (!m) return fail('missing');
  const key = mKey(m, now);
  if (p.missions.claimed.includes(key)) return fail('claimed');
  if (missionProgress(p, m, now) < m.goal) return fail('progress');
  const rw = m.reward;
  if ((rw.pickCards || rw.pickFragments) && !choice) return fail('choice');
  if (rw.pickCards && choice && !p.dragons[choice].unlocked) return fail('choice');
  let next: PlayerProgress = { ...p, gold: p.gold + (rw.gold ?? 0), rubies: p.rubies + (rw.rubies ?? 0) };
  if (rw.pickCards && choice) next = addCards(next, choice, rw.pickCards);
  if (rw.pickFragments && choice) next = addFragments(next, choice, rw.pickFragments);
  const claimed = [...next.missions.claimed, key].slice(-400);
  let dailyDone = next.missions.dailyDone;
  const today = ymd(kstDate(now));
  if (m.period === 'daily' && DAILY_IDS.every((id) => claimed.includes(`${id}@${today}`)) && !dailyDone.includes(today)) dailyDone = [...dailyDone, today].slice(-62);
  next = { ...next, missions: { ...next.missions, claimed, dailyDone } };
  return { ok: true, progress: next, reward: rw };
}

// ───────────────────────── 기간 이벤트: 드래곤의 겨울 축제(v1.3) ─────────────────────────
const EV = WINTER_2026;
const evStart = Date.parse(EV.startKst);
const evEnd = Date.parse(EV.endKst);
/** 이벤트 기간인가(KST 12/1 00:00 이상, 1/1 00:00 미만) */
export const eventActive = (now: number) => now >= evStart && now < evEnd;

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
function grantEssence(p: PlayerProgress, rarity: Rarity, r: number): { progress: PlayerProgress; dragonId: DragonId; isNew: boolean; fragments: number } {
  const id = pickIn(poolOf(rarity, false), r);
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
  if (!eventActive(now)) return fail('ended');
  const st = eventState(p);
  const today = ymd(kstDate(now));
  if (st.attendance.includes(today)) return fail('claimed');
  const n = st.attendance.length;
  const rubies = EV.attendance[n % EV.attendance.length];
  return { ok: true, day: n + 1, rubies, progress: setEvent({ ...p, rubies: p.rubies + rubies }, { ...st, attendance: [...st.attendance, today] }) };
}

export const attendedToday = (p: PlayerProgress, now: number) => eventState(p).attendance.includes(ymd(kstDate(now)));

// ───────────────────────── 게임에서 쓰는 창구(플랫폼 저장소) ─────────────────────────
const browserStore = (): Store => platformStore;

/** 시작할 때 미리 읽어 둘 저장 키 */
export const STORAGE_KEYS = [SAVE_KEY, BACKUP_KEY, LEGACY_UNLOCK_KEY];

/** 항상 저장소의 최신 상태를 읽어 처리하고, 성공했을 때만 바로 저장한다(연속 클릭에도 재화가 음수가 되지 않음) */
function act<T extends { ok: boolean }>(f: (p: PlayerProgress) => T): T {
  const r = f(Progress.load());
  const pr = (r as { progress?: PlayerProgress }).progress;
  if (r.ok && pr) Progress.save(pr);
  return r;
}

export const Progress = {
  load: () => loadProgress(browserStore()),
  save: (p: PlayerProgress) => saveProgress(browserStore(), p),
  buy: (type: UpgradeType) => act((p) => purchase(p, type)),
  settle(runId: string, gold: number, unlockStage?: number, run?: RunRecord, now = Date.now()) {
    const r = settleRun(this.load(), runId, gold, unlockStage, run, now);
    if (r.paid) this.save(r.progress);
    return r;
  },
  openBox: (box: BoxId, count: 1 | 10, pay: 'ruby' | 'ticket', txId?: string) => act((p) => withTx(p, txId, () => openBox(p, box, count, pay))),
  levelUp: (id: DragonId) => act((p) => levelUpDragon(p, id)),
  starUp: (id: DragonId, useUniversal = false) => act((p) => starUpDragon(p, id, useUniversal)),
  exchangeEssence: (id: DragonId) => act((p) => exchangeEssence(p, id)),
  toUniversal: (id: DragonId) => act((p) => convertToUniversal(p, id)),
  select(id: DragonId): void {
    this.save(selectDragon(this.load(), id));
  },
  selectDifficulty(d: Difficulty): void {
    this.save(selectDifficulty(this.load(), d));
  },
  claimProgress: (d: Difficulty, step: 25 | 50 | 100) => act((p) => claimProgressBox(p, d, step)),
  claimMission: (id: string, choice?: DragonId, now = Date.now()) => act((p) => claimMission(p, id, now, choice)),
  equip: (uid: string) => act((p) => equipItem(p, uid)),
  unequip: (slot: Slot) => act((p) => unequipSlot(p, slot)),
  lock: (uid: string) => act((p) => toggleLock(p, uid)),
  upgradeItem: (uid: string) => act((p) => upgradeItem(p, uid)),
  fuse: (uid: string) => act((p) => fuseItem(p, uid)),
  unlockSpecial: (id: SpecialId) => act((p) => unlockSpecial(p, id)),
  equipSpecial: (id: SpecialId | null) => act((p) => equipSpecial(p, id)),
  spin: (now: number) => act((p) => spinRoulette(p, now)),
  attend: (now: number) => act((p) => claimAttendance(p, now)),
  /** 개발용(?dev=1): 루비·골드·카드 추가 */
  devGrant(): void {
    let n = this.load();
    n = { ...n, rubies: n.rubies + 3000, gold: n.gold + 20000 };
    for (const id of DRAGON_ORDER) n = addCards(n, id, 20);
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
