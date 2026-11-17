import {
  getUpgradeCost,
  PERMANENT_UPGRADES,
  UPGRADE_TYPES,
  type PermanentUpgrades,
  type UpgradeType,
} from '../data/progression';
import { DRAGONS, GROWTH, SUMMON, TICKET_REWARDS, type DragonId, type DragonRarity } from '../data/dragons';

// 계정 진행 저장(5단계). 브라우저 localStorage에 JSON 한 덩어리로 저장한다.
// 같은 브라우저·같은 사이트에서만 이어지고, 브라우저 데이터를 지우면 사라진다.

export const SAVE_KEY = 'dragon-force:progress';
export const BACKUP_KEY = 'dragon-force:progress:backup';
export const LEGACY_UNLOCK_KEY = 'dragon-squad:unlockedStage'; // 4단계 해금 저장(그대로 두고 읽기만 함)
export const SAVE_VERSION = 2; // v1: 5단계 연구소 · v2: 6단계 드래곤 컬렉션
const MAX_RUN_IDS = 30; // 중복 정산 방지용 최근 전투 기록 개수

export interface OwnedDragon {
  dragonId: DragonId;
  level: number; // 영구 레벨 1~30
  stars: number; // 승급 1~5성
  shards: number; // 승급 재료(중복 획득)
}

export interface PlayerProgress {
  saveVersion: number;
  gold: number;
  upgrades: PermanentUpgrades;
  unlockedStages: number[];
  selectedDragonId: DragonId;
  rewardedRunIds: string[];
  // ── 6단계 드래곤 컬렉션(기획서 DragonCollection) ──
  ownedDragons: Partial<Record<DragonId, OwnedDragon>>;
  summonTickets: number;
  pullsSinceLegendary: number; // 전설이 아닌 소환이 몇 번 이어졌나(89면 다음은 전설)
  pullsSinceRareOrHigher: number; // 일반만 몇 번 이어졌나(9면 다음은 희귀 이상)
  totalPulls: number;
  claimed: string[]; // 받은 일회성 보상: 'tutorial', 'first-clear-1', 업적 id
  lifetime: { runs: number; normalKills: number; eliteKills: number; clears: number };
}

/** 저장소 흉내(테스트에서는 메모리, 게임에서는 localStorage) */
export interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export function defaultProgress(): PlayerProgress {
  return {
    saveVersion: SAVE_VERSION,
    gold: 0,
    upgrades: { attack: 0, hp: 0, speed: 0, pickup: 0 },
    unlockedStages: [1],
    selectedDragonId: 'red',
    rewardedRunIds: [],
    ownedDragons: { red: newDragon('red') },
    summonTickets: TICKET_REWARDS.tutorial, // 튜토리얼 소환권 1장(최초 체험)
    pullsSinceLegendary: 0,
    pullsSinceRareOrHigher: 0,
    totalPulls: 0,
    claimed: ['tutorial'],
    lifetime: { runs: 0, normalKills: 0, eliteKills: 0, clears: 0 },
  };
}

export const newDragon = (id: DragonId): OwnedDragon => ({ dragonId: id, level: 1, stars: 1, shards: 0 });

const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** 손상·음수·범위 밖 값을 안전한 값으로 보정 */
export function sanitize(raw: Partial<PlayerProgress> & Record<string, unknown>): PlayerProgress {
  const d = defaultProgress();
  const up = (raw.upgrades ?? {}) as Partial<PermanentUpgrades>;
  const upgrades = { ...d.upgrades };
  for (const t of UPGRADE_TYPES) upgrades[t] = int(up[t], 0, PERMANENT_UPGRADES[t].maxLevel, 0);
  const stages = Array.isArray(raw.unlockedStages) ? raw.unlockedStages.map((s) => int(s, 1, 20, 1)) : [1];
  // 드래곤: 정의에 있는 id만, 레벨·별·조각은 범위 안으로. 레드는 항상 보유.
  const owned: Partial<Record<DragonId, OwnedDragon>> = {};
  const rawOwned = (raw.ownedDragons ?? {}) as Record<string, Partial<OwnedDragon>>;
  for (const [id, o] of Object.entries(rawOwned)) {
    if (!(id in DRAGONS) || !o || typeof o !== 'object') continue;
    owned[id as DragonId] = {
      dragonId: id as DragonId,
      level: int(o.level, 1, GROWTH.maxLevel, 1),
      stars: int(o.stars, 1, GROWTH.maxStars, 1),
      shards: int(o.shards, 0, 999_999, 0),
    };
  }
  owned.red ??= newDragon('red');
  const sel = raw.selectedDragonId as DragonId;
  const lt = (raw.lifetime ?? {}) as Partial<PlayerProgress['lifetime']>;
  return {
    saveVersion: SAVE_VERSION,
    gold: int(raw.gold, 0, 999_999_999, 0),
    upgrades,
    unlockedStages: [...new Set([1, ...stages])].sort((a, b) => a - b),
    selectedDragonId: owned[sel] ? sel : 'red',
    rewardedRunIds: Array.isArray(raw.rewardedRunIds) ? raw.rewardedRunIds.filter((s) => typeof s === 'string').slice(-MAX_RUN_IDS) : [],
    ownedDragons: owned,
    summonTickets: int(raw.summonTickets, 0, 99_999, 0),
    pullsSinceLegendary: int(raw.pullsSinceLegendary, 0, SUMMON.legendaryGuarantee - 1, 0),
    pullsSinceRareOrHigher: int(raw.pullsSinceRareOrHigher, 0, SUMMON.rareGuarantee - 1, 0),
    totalPulls: int(raw.totalPulls, 0, 1e9, 0),
    claimed: Array.isArray(raw.claimed) ? [...new Set(raw.claimed.filter((c) => typeof c === 'string'))] : [],
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
 * v0(4단계 해금 키만) → v1(5단계 연구소) → v2(6단계: 레드 보유 + 튜토리얼 소환권 1장. 이미 1단계를 깼으면 첫 클리어 소환권도).
 */
function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  let r = { ...raw };
  if (Number(r.saveVersion ?? 0) < 1) r = { ...r, saveVersion: 1 };
  if (Number(r.saveVersion) < 2) {
    const cleared = Array.isArray(r.unlockedStages) && (r.unlockedStages as number[]).includes(2);
    const claimed = ['tutorial', ...(cleared ? ['first-clear-1'] : [])];
    r = {
      ...r,
      saveVersion: 2,
      ownedDragons: { red: newDragon('red') },
      summonTickets: TICKET_REWARDS.tutorial + (cleared ? TICKET_REWARDS.firstClear : 0),
      claimed,
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
  let p: PlayerProgress;
  if (text == null) {
    p = defaultProgress(); // 첫 실행
  } else {
    try {
      const raw = JSON.parse(text);
      if (!raw || typeof raw !== 'object') throw new Error('bad');
      p = sanitize(migrate(raw));
    } catch {
      // 손상된 데이터: 원본을 백업해 두고 기본값으로 복구
      try {
        store.setItem(BACKUP_KEY, text);
      } catch {
        /* 무시 */
      }
      p = defaultProgress();
    }
  }
  // 4단계 해금 기록은 지우지 않고 합친다(덮어쓰기 금지)
  p.unlockedStages = [...new Set([...p.unlockedStages, ...legacyStages(store)])].sort((a, b) => a - b);
  return p;
}

export function saveProgress(store: Store, p: PlayerProgress): void {
  try {
    store.setItem(SAVE_KEY, JSON.stringify(p));
    // 4단계 코드와 호환: 가장 높은 해금 단계도 예전 키에 같이 적어 둔다
    store.setItem(LEGACY_UNLOCK_KEY, String(Math.max(...p.unlockedStages)));
  } catch {
    /* 저장소를 못 쓰는 환경이면 건너뜀(시크릿 모드 등) */
  }
}

export type PurchaseResult =
  | { ok: true; progress: PlayerProgress; cost: number }
  | { ok: false; reason: 'max' | 'gold'; cost: number };

/** 구매 가능 여부 검사 → 골드 차감과 레벨 증가를 한 번에(새 객체로) 반영 */
export function purchase(p: PlayerProgress, type: UpgradeType): PurchaseResult {
  const lv = p.upgrades[type];
  const cost = getUpgradeCost(lv);
  if (lv >= PERMANENT_UPGRADES[type].maxLevel) return { ok: false, reason: 'max', cost };
  if (p.gold < cost) return { ok: false, reason: 'gold', cost };
  return { ok: true, cost, progress: { ...p, gold: p.gold - cost, upgrades: { ...p.upgrades, [type]: lv + 1 } } };
}

export interface RunRecord {
  stageId: number;
  cleared: boolean;
  elapsedMs: number;
  normalKills: number;
  eliteKills: number;
}

export interface Reward {
  id: string;
  text: string;
  tickets: number;
}

/** 전투 보상 정산. 같은 runId는 한 번만 지급한다. 6단계: 누적 기록·첫 클리어·업적 소환권도 함께. */
export function settleRun(
  p: PlayerProgress,
  runId: string,
  gold: number,
  unlockStage?: number,
  run?: RunRecord,
): { progress: PlayerProgress; paid: boolean; rewards: Reward[] } {
  if (p.rewardedRunIds.includes(runId)) return { progress: p, paid: false, rewards: [] };
  const unlocked = unlockStage ? [...new Set([...p.unlockedStages, unlockStage])].sort((a, b) => a - b) : p.unlockedStages;
  let next: PlayerProgress = {
    ...p,
    gold: p.gold + Math.max(0, Math.floor(gold)),
    unlockedStages: unlocked,
    rewardedRunIds: [...p.rewardedRunIds, runId].slice(-MAX_RUN_IDS),
  };
  const rewards: Reward[] = [];
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
    if (run.cleared && !next.claimed.includes(`first-clear-${run.stageId}`)) {
      rewards.push({ id: `first-clear-${run.stageId}`, text: `${run.stageId}단계 첫 클리어`, tickets: TICKET_REWARDS.firstClear });
    }
  }
  const r = claimRewards(next, rewards);
  return { progress: r.progress, paid: true, rewards: r.rewards };
}

/** 업적 조건 확인 → 아직 안 받은 보상 지급(소환권). extra는 이번에 같이 줄 보상(첫 클리어 등) */
export function claimRewards(p: PlayerProgress, extra: Reward[] = []): { progress: PlayerProgress; rewards: Reward[] } {
  const owned = Object.keys(p.ownedDragons).length;
  const done: Record<string, boolean> = {
    'first-run': p.lifetime.runs >= 1,
    'first-elite': p.lifetime.eliteKills >= 1,
    'kills-1000': p.lifetime.normalKills >= 1000,
    'kills-10000': p.lifetime.normalKills >= 10000,
    'collector-3': owned >= 3,
  };
  const got = [...extra, ...TICKET_REWARDS.achievements.filter((a) => done[a.id] && !p.claimed.includes(a.id))].filter((r) => !p.claimed.includes(r.id));
  if (got.length === 0) return { progress: p, rewards: [] };
  return {
    rewards: got,
    progress: { ...p, summonTickets: p.summonTickets + got.reduce((a, r) => a + r.tickets, 0), claimed: [...p.claimed, ...got.map((r) => r.id)] },
  };
}

// ───────── 6단계: 소환 · 육성 (모두 "새 상태를 만들어 한 번에 저장"하는 순수 함수) ─────────

export interface PullResult {
  dragonId: DragonId;
  rarity: Exclude<DragonRarity, 'starter'>;
  isNew: boolean;
  shards: number; // 중복이면 받은 조각
  guaranteed: 'legendary' | 'rare' | null;
}

type Rarity = Exclude<DragonRarity, 'starter'>;
const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

function pickWeighted<T extends string>(weights: [T, number][], r: number): T {
  const total = weights.reduce((a, [, w]) => a + w, 0);
  let x = r * total;
  for (const [k, w] of weights) {
    if ((x -= w) < 0) return k;
  }
  return weights[weights.length - 1][0];
}

/**
 * 1회 소환. 보장 규칙(원문 미정 부분은 AI 1차안):
 * - 전설 보장이 먼저: 89회 연속 전설이 아니면 90번째는 전설
 * - 희귀 이상 보장: 9회 연속 일반이면 10번째는 희귀 이상(희귀 22 : 영웅 7 : 전설 1 비율로 추첨)
 * - 희귀 이상이 나오면 희귀 카운터 0, 전설이 나오면 두 카운터 모두 0
 * - 같은 등급 안에서는 균등
 */
export function pullOnce(p: PlayerProgress, rnd: () => number): { progress: PlayerProgress; result: PullResult } {
  const W = SUMMON.rarityWeights;
  let guaranteed: PullResult['guaranteed'] = null;
  let rarity: Rarity;
  if (p.pullsSinceLegendary >= SUMMON.legendaryGuarantee - 1) {
    rarity = 'legendary';
    guaranteed = 'legendary';
  } else if (p.pullsSinceRareOrHigher >= SUMMON.rareGuarantee - 1) {
    rarity = pickWeighted<Rarity>([['rare', W.rare], ['epic', W.epic], ['legendary', W.legendary]], rnd());
    guaranteed = 'rare';
  } else {
    rarity = pickWeighted<Rarity>(RARITIES.map((k) => [k, W[k]]), rnd());
  }
  const pool = SUMMON.pool.filter((id) => DRAGONS[id].rarity === rarity);
  const dragonId = pool[Math.min(pool.length - 1, Math.floor(rnd() * pool.length))];
  const have = p.ownedDragons[dragonId];
  const shards = have ? GROWTH.duplicateShards[rarity] : 0;
  const owned = { ...p.ownedDragons, [dragonId]: have ? { ...have, shards: have.shards + shards } : newDragon(dragonId) };
  return {
    result: { dragonId, rarity, isNew: !have, shards, guaranteed },
    progress: {
      ...p,
      ownedDragons: owned,
      pullsSinceLegendary: rarity === 'legendary' ? 0 : p.pullsSinceLegendary + 1,
      pullsSinceRareOrHigher: rarity === 'common' ? p.pullsSinceRareOrHigher + 1 : 0,
      totalPulls: p.totalPulls + 1,
    },
  };
}

export type SummonOutcome =
  | { ok: true; progress: PlayerProgress; results: PullResult[]; rewards: Reward[] }
  | { ok: false; reason: 'tickets' };

/** 소환권 차감 → 추첨 → 신규 지급/중복 조각 → 보장 갱신을 한 덩어리로(중간 실패 시 아무것도 바뀌지 않음) */
export function summon(p: PlayerProgress, count: 1 | 10, rnd: () => number = Math.random): SummonOutcome {
  if (p.summonTickets < count) return { ok: false, reason: 'tickets' };
  let cur: PlayerProgress = { ...p, summonTickets: p.summonTickets - count };
  const results: PullResult[] = [];
  for (let i = 0; i < count; i++) {
    const r = pullOnce(cur, rnd);
    cur = r.progress;
    results.push(r.result);
  }
  const c = claimRewards(cur); // 드래곤 3종 보유 업적
  return { ok: true, progress: c.progress, results, rewards: c.rewards };
}

export type GrowResult = { ok: true; progress: PlayerProgress; cost: number } | { ok: false; reason: 'max' | 'gold' | 'shards' | 'locked'; cost: number };

/** 드래곤 영구 레벨업: 골드 소모(성장 재료는 원문에 수급처가 없어 MVP에서는 골드만) */
export function levelUpDragon(p: PlayerProgress, id: DragonId): GrowResult {
  const d = p.ownedDragons[id];
  if (!d) return { ok: false, reason: 'locked', cost: 0 };
  const cost = GROWTH.levelCost(d.level);
  if (d.level >= GROWTH.maxLevel) return { ok: false, reason: 'max', cost };
  if (p.gold < cost) return { ok: false, reason: 'gold', cost };
  return { ok: true, cost, progress: { ...p, gold: p.gold - cost, ownedDragons: { ...p.ownedDragons, [id]: { ...d, level: d.level + 1 } } } };
}

/** 승급: 조각 20 / 40 / 80 / 160 */
export function starUpDragon(p: PlayerProgress, id: DragonId): GrowResult {
  const d = p.ownedDragons[id];
  if (!d) return { ok: false, reason: 'locked', cost: 0 };
  if (d.stars >= GROWTH.maxStars) return { ok: false, reason: 'max', cost: 0 };
  const cost = GROWTH.starCost[d.stars - 1];
  if (d.shards < cost) return { ok: false, reason: 'shards', cost };
  return { ok: true, cost, progress: { ...p, ownedDragons: { ...p.ownedDragons, [id]: { ...d, stars: d.stars + 1, shards: d.shards - cost } } } };
}

export function selectDragon(p: PlayerProgress, id: DragonId): PlayerProgress {
  return p.ownedDragons[id] ? { ...p, selectedDragonId: id } : p;
}

// ───────── 게임에서 쓰는 간단한 창구(localStorage) ─────────
const browserStore = (): Store => {
  try {
    return window.localStorage;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
  }
};

export const Progress = {
  load: () => loadProgress(browserStore()),
  save: (p: PlayerProgress) => saveProgress(browserStore(), p),
  /** 항상 저장소의 최신 상태를 읽어 구매하고 바로 저장(연속 클릭에도 골드가 음수가 되지 않음) */
  buy(type: UpgradeType): PurchaseResult {
    const r = purchase(this.load(), type);
    if (r.ok) this.save(r.progress);
    return r;
  },
  settle(runId: string, gold: number, unlockStage?: number, run?: RunRecord) {
    const r = settleRun(this.load(), runId, gold, unlockStage, run);
    if (r.paid) this.save(r.progress);
    return r;
  },
  summon(count: 1 | 10): SummonOutcome {
    const r = summon(this.load(), count);
    if (r.ok) this.save(r.progress);
    return r;
  },
  levelUp(id: DragonId): GrowResult {
    const r = levelUpDragon(this.load(), id);
    if (r.ok) this.save(r.progress);
    return r;
  },
  starUp(id: DragonId): GrowResult {
    const r = starUpDragon(this.load(), id);
    if (r.ok) this.save(r.progress);
    return r;
  },
  select(id: DragonId): void {
    this.save(selectDragon(this.load(), id));
  },
  /** 개발용: 소환권 추가 */
  addTickets(n: number): void {
    const p = this.load();
    this.save({ ...p, summonTickets: p.summonTickets + n });
  },
  reset() {
    const s = browserStore();
    const cur = s.getItem(SAVE_KEY);
    if (cur) s.setItem(BACKUP_KEY, cur);
    saveProgress(s, defaultProgress());
    s.setItem(LEGACY_UNLOCK_KEY, '1');
  },
};
