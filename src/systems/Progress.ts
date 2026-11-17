import {
  getUpgradeCost,
  PERMANENT_UPGRADES,
  UPGRADE_TYPES,
  type PermanentUpgrades,
  type UpgradeType,
} from '../data/progression';

// 계정 진행 저장(5단계). 브라우저 localStorage에 JSON 한 덩어리로 저장한다.
// 같은 브라우저·같은 사이트에서만 이어지고, 브라우저 데이터를 지우면 사라진다.

export const SAVE_KEY = 'dragon-force:progress';
export const BACKUP_KEY = 'dragon-force:progress:backup';
export const LEGACY_UNLOCK_KEY = 'dragon-squad:unlockedStage'; // 4단계 해금 저장(그대로 두고 읽기만 함)
export const SAVE_VERSION = 1;
const MAX_RUN_IDS = 30; // 중복 정산 방지용 최근 전투 기록 개수

export interface PlayerProgress {
  saveVersion: number;
  gold: number;
  upgrades: PermanentUpgrades;
  unlockedStages: number[];
  selectedDragonId: string;
  rewardedRunIds: string[];
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
  };
}

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
  return {
    saveVersion: SAVE_VERSION,
    gold: int(raw.gold, 0, 999_999_999, 0),
    upgrades,
    unlockedStages: [...new Set([1, ...stages])].sort((a, b) => a - b),
    selectedDragonId: typeof raw.selectedDragonId === 'string' ? raw.selectedDragonId : 'red',
    rewardedRunIds: Array.isArray(raw.rewardedRunIds) ? raw.rewardedRunIds.filter((s) => typeof s === 'string').slice(-MAX_RUN_IDS) : [],
  };
}

/** 이전 버전 데이터를 현재 버전으로 바꾼다. 지금은 v0(4단계 해금 키만 있던 상태) → v1. */
function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  const v = Number(raw.saveVersion ?? 0);
  if (v < 1) return { ...raw, saveVersion: 1 };
  return raw;
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

/** 전투 보상 정산. 같은 runId는 한 번만 지급한다. */
export function settleRun(p: PlayerProgress, runId: string, gold: number, unlockStage?: number): { progress: PlayerProgress; paid: boolean } {
  if (p.rewardedRunIds.includes(runId)) return { progress: p, paid: false };
  const unlocked = unlockStage ? [...new Set([...p.unlockedStages, unlockStage])].sort((a, b) => a - b) : p.unlockedStages;
  return {
    paid: true,
    progress: {
      ...p,
      gold: p.gold + Math.max(0, Math.floor(gold)),
      unlockedStages: unlocked,
      rewardedRunIds: [...p.rewardedRunIds, runId].slice(-MAX_RUN_IDS),
    },
  };
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
  settle(runId: string, gold: number, unlockStage?: number) {
    const r = settleRun(this.load(), runId, gold, unlockStage);
    if (r.paid) this.save(r.progress);
    return r;
  },
  reset() {
    const s = browserStore();
    const cur = s.getItem(SAVE_KEY);
    if (cur) s.setItem(BACKUP_KEY, cur);
    saveProgress(s, defaultProgress());
    s.setItem(LEGACY_UNLOCK_KEY, '1');
  },
};
