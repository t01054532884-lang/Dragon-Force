import { STAMINA, regen, spend, newStamina, type StaminaState } from './Stamina';

// 선물함(8단계 v1.0 4장 · 기획 v1.4) — 순수 함수. 시각 now를 인자로 받아 테스트·서버 이전이 쉽다.
// 서버가 생기면 같은 규칙을 Cloud Functions로 옮기고, 앱은 "요청 → 결과 표시"만 하면 된다(docs/STAGE8.md).

export type GiftKind = 'stamina' | 'gold' | 'rubies' | 'tickets' | 'universalFragments';
export const GIFT_KINDS: GiftKind[] = ['stamina', 'gold', 'rubies', 'tickets', 'universalFragments'];
export const GIFT_LABEL: Record<GiftKind, { name: string; icon: string; unit: string }> = {
  stamina: { name: '행동력', icon: '⚡', unit: '' },
  gold: { name: '골드', icon: '🪙', unit: 'G' },
  rubies: { name: '루비', icon: '', unit: '' }, // 루비는 이모지 대신 빨간 루비 그림(ui-ruby)으로 — GiftScene
  tickets: { name: '무료 개봉권', icon: '🎟', unit: '장' },
  universalFragments: { name: '범용 조각', icon: '🧩', unit: '개' },
};

export interface Gift {
  id: string; // 중복 지급 방지 키: 'clear:<난이도>:<단계>' · 'campaign:<캠페인 id>'
  kind: GiftKind;
  amount: number;
  title: string;
  body?: string;
  source: string; // 표시용 출처('쉬움 1단계 최초 클리어', '운영자')
  sender: 'system' | 'operator';
  createdAt: number;
  expiresAt: number | null; // null = 만료 없음(최초 클리어 보상)
  claimedAt?: number;
}

export interface ClaimRecord {
  id: string;
  title: string;
  kind: GiftKind;
  amount: number;
  claimedAt: number;
}

export interface MailboxState {
  gifts: Gift[];
  /** 지금까지 만든 선물 id(만료·삭제돼도 남김) — 같은 보상을 두 번 만들지 않는다 */
  granted: string[];
  /** 최근 수령 내역(최신이 앞) */
  history: ClaimRecord[];
  /** 지난 최초 클리어 소급 지급을 한 번 계산했는지(Progress.backfillClearGifts) */
  backfilled?: boolean;
}

export const MAILBOX = {
  operatorExpireDays: 30, // 운영자 선물 기본 30일(8단계 v1.0)
  historyMax: 50,
  keepClaimedDays: 7, // 받은 선물은 7일 동안 '수령 완료'로 보이다가 목록에서 정리(내역에는 남음)
};
const DAY = 86_400_000;

export const newMailbox = (): MailboxState => ({ gifts: [], granted: [], history: [], backfilled: true });

/** 선물함이 다루는 계정 일부(실제 저장 PlayerProgress가 이 모양을 가진다) */
export interface WalletLike {
  gold: number;
  rubies: number;
  universalFragments: number;
  summon: { legacyTickets: number };
  stamina: StaminaState;
  mailbox: MailboxState;
}

/** 선물 추가(id가 이미 만들어진 적 있으면 무시) */
export function addGift<P extends WalletLike>(p: P, g: Gift): { added: boolean; progress: P } {
  if (p.mailbox.granted.includes(g.id)) return { added: false, progress: p };
  return { added: true, progress: { ...p, mailbox: { ...p.mailbox, gifts: [...p.mailbox.gifts, g], granted: [...p.mailbox.granted, g.id] } } };
}

/** 스테이지·난이도별 최초 클리어 → 행동력 20 선물(만료 없음) */
export function grantClearGift<P extends WalletLike>(p: P, difficulty: string, stageId: number, label: string, now: number): { added: boolean; progress: P } {
  return addGift(p, {
    id: `clear:${difficulty}:${stageId}`, kind: 'stamina', amount: STAMINA.clearGift, title: '행동력 충전 선물',
    source: `${label} 최초 클리어`, sender: 'system', createdAt: now, expiresAt: null,
  });
}

export const isExpired = (g: Gift, now: number) => g.expiresAt !== null && now >= g.expiresAt;

/** 받을 수 있는 목록(미수령·미만료), 오래된 순 */
export function pendingGifts(box: MailboxState, now: number): Gift[] {
  return box.gifts.filter((g) => !g.claimedAt && !isExpired(g, now)).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

/** 로비 빨간 숫자 */
export const pendingCount = (box: MailboxState, now: number) => pendingGifts(box, now).length;

/** 받은 지 오래된 선물·만료된 선물은 목록에서 정리(granted는 남겨 재지급 방지) */
export function pruneMailbox(box: MailboxState, now: number): MailboxState {
  const gifts = box.gifts.filter((g) => (g.claimedAt ? now - g.claimedAt < MAILBOX.keepClaimedDays * DAY : !isExpired(g, now)));
  return gifts.length === box.gifts.length ? box : { ...box, gifts };
}

export type ClaimFail = 'notFound' | 'claimed' | 'expired' | 'wouldExceed';
export const CLAIM_FAIL_TEXT: Record<ClaimFail, string> = {
  notFound: '선물을 찾을 수 없어요',
  claimed: '이미 받은 선물이에요',
  expired: '기간이 지난 선물이에요',
  wouldExceed: `행동력이 ${STAMINA.max - STAMINA.clearGift} 이하일 때 받을 수 있어요`,
};

/** 한 개 받을 수 있는지(행동력은 받은 뒤 최대 40을 넘으면 보류 — 일부만 받기 없음) */
function check(p: WalletLike, g: Gift, now: number): ClaimFail | null {
  if (g.claimedAt) return 'claimed';
  if (isExpired(g, now)) return 'expired';
  if (g.kind === 'stamina' && regen(p.stamina, now).value + g.amount > STAMINA.max) return 'wouldExceed';
  return null;
}

/** 지급 + 수령 기록을 한 번에(새 객체) — 원자적 처리 */
function apply<P extends WalletLike>(p: P, g: Gift, now: number): P {
  let q: P = { ...p };
  switch (g.kind) {
    case 'stamina': {
      const r = regen(p.stamina, now);
      const value = r.value + g.amount;
      q = { ...q, stamina: { value, regenFrom: value >= STAMINA.max ? now : r.regenFrom } };
      break;
    }
    case 'gold':
      q = { ...q, gold: q.gold + g.amount };
      break;
    case 'rubies':
      q = { ...q, rubies: q.rubies + g.amount };
      break;
    case 'tickets':
      q = { ...q, summon: { ...q.summon, legacyTickets: q.summon.legacyTickets + g.amount } };
      break;
    case 'universalFragments':
      q = { ...q, universalFragments: q.universalFragments + g.amount };
      break;
  }
  const rec: ClaimRecord = { id: g.id, title: g.title, kind: g.kind, amount: g.amount, claimedAt: now };
  return {
    ...q,
    mailbox: {
      ...q.mailbox,
      gifts: q.mailbox.gifts.map((x) => (x.id === g.id ? { ...x, claimedAt: now } : x)),
      history: [rec, ...q.mailbox.history].slice(0, MAILBOX.historyMax),
    },
  };
}

export type ClaimResult<P> = { ok: true; progress: P; gift: Gift } | { ok: false; reason: ClaimFail; progress: P };

/** 개별 수령 */
export function claimOne<P extends WalletLike>(p: P, id: string, now: number): ClaimResult<P> {
  const g = p.mailbox.gifts.find((x) => x.id === id);
  if (!g) return { ok: false, reason: 'notFound', progress: p };
  const fail = check(p, g, now);
  if (fail) return { ok: false, reason: fail, progress: p };
  return { ok: true, progress: apply(p, g, now), gift: g };
}

/**
 * 모두 받기: 받을 수 있는 것만 오래된 순으로 차례로 받고, 못 받는 것(행동력 초과)은 남긴다.
 * 행동력 선물은 앞에서 받은 양까지 계산해 하나씩 판단(25/40이면 20짜리 둘 다 보류, 루비·골드는 받음).
 * 결과에 받은 것·남긴 것을 정확히 돌려준다(8단계 v1.0 "어떤 항목을 수령했는지 정확히 응답").
 */
export function claimAll<P extends WalletLike>(p: P, now: number): { ok: boolean; progress: P; claimed: Gift[]; kept: { gift: Gift; reason: ClaimFail }[] } {
  let cur = p;
  const claimed: Gift[] = [];
  const kept: { gift: Gift; reason: ClaimFail }[] = [];
  for (const g of pendingGifts(p.mailbox, now)) {
    const fail = check(cur, g, now);
    if (fail) kept.push({ gift: g, reason: fail });
    else {
      cur = apply(cur, g, now);
      claimed.push(g);
    }
  }
  return { ok: claimed.length > 0, progress: cur, claimed, kept };
}

// ───────── 행동력 ─────────

export function staminaNow(p: WalletLike, now: number): StaminaState {
  return regen(p.stamina, now);
}

/** 입장 비용 차감(부족하면 그대로). 실패·포기 때 돌려주지 않음(확정) */
export function spendStamina<P extends WalletLike>(p: P, n: number, now: number): { ok: boolean; progress: P } {
  const r = spend(p.stamina, n, now);
  return r.ok ? { ok: true, progress: { ...p, stamina: r.state } } : { ok: false, progress: p };
}

// ───────── 운영자 보상 캠페인(서버 없는 첫 출시용) ─────────

/**
 * 캠페인 1건 = 전체(또는 조건) 유저에게 보내는 선물 1종. 유저 수만큼 선물을 미리 만들지 않고,
 * 접속할 때 대상 캠페인을 확인해 선물함에 넣는다. 같은 캠페인은 'campaign:<id>'로 한 번만(기기 여러 대·재시도에도 1회).
 * 지금은 앱에 들어 있는 목록(src/data/campaigns.ts)을 읽는다 → 서버가 생기면 목록만 서버에서 받아 오면 된다.
 */
export interface Campaign {
  id: string;
  title: string;
  body?: string;
  kind: GiftKind;
  amount: number;
  startAt: number; // 이 시각부터 선물함에 나타남
  endAt: number; // 이 시각 이후로는 새로 나타나지 않음(이미 받은 선물함 선물은 자체 만료까지 유지)
  expireDays?: number; // 선물함에 들어온 뒤 만료(기본 30일)
  /** 'all' = 기간 안에 접속한 모든 유저 · 'existing' = 캠페인 시작 전에 계정을 만든 유저만 */
  audience: 'all' | 'existing';
}

export function syncCampaigns<P extends WalletLike & { createdAt: number }>(p: P, campaigns: Campaign[], now: number): { progress: P; added: Gift[] } {
  let cur = p;
  const added: Gift[] = [];
  for (const c of campaigns) {
    if (now < c.startAt || now >= c.endAt) continue;
    if (c.audience === 'existing' && p.createdAt >= c.startAt) continue;
    const g: Gift = {
      id: `campaign:${c.id}`, kind: c.kind, amount: c.amount, title: c.title, body: c.body, source: '운영자', sender: 'operator',
      createdAt: now, expiresAt: now + (c.expireDays ?? MAILBOX.operatorExpireDays) * DAY,
    };
    const r = addGift(cur, g);
    if (r.added) added.push(g);
    cur = r.progress;
  }
  return { progress: cur, added };
}

// ───────── 저장 보정 ─────────

const int = (v: unknown, min: number, max: number, fb: number) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fb;
};

export function sanitizeStamina(raw: unknown, now: number): StaminaState {
  const s = (raw ?? {}) as Partial<StaminaState>;
  if (typeof s.value !== 'number') return newStamina(now);
  const regenFrom = Number(s.regenFrom);
  return { value: int(s.value, 0, 999, STAMINA.max), regenFrom: Number.isFinite(regenFrom) ? Math.min(regenFrom, now) : now };
}

export function sanitizeMailbox(raw: unknown): MailboxState {
  const m = (raw ?? {}) as Partial<MailboxState>;
  const gifts: Gift[] = [];
  for (const g of Array.isArray(m.gifts) ? m.gifts : []) {
    if (!g || typeof g.id !== 'string' || !GIFT_KINDS.includes(g.kind)) continue;
    gifts.push({
      id: g.id, kind: g.kind, amount: int(g.amount, 0, 1e9, 0), title: String(g.title ?? '선물'), body: g.body ? String(g.body) : undefined,
      source: String(g.source ?? ''), sender: g.sender === 'operator' ? 'operator' : 'system', createdAt: Number(g.createdAt) || 0,
      expiresAt: g.expiresAt == null ? null : Number(g.expiresAt) || 0, claimedAt: g.claimedAt ? Number(g.claimedAt) : undefined,
    });
  }
  const granted = Array.isArray(m.granted) ? [...new Set(m.granted.filter((x) => typeof x === 'string'))] : [];
  for (const g of gifts) if (!granted.includes(g.id)) granted.push(g.id);
  const history = (Array.isArray(m.history) ? m.history : [])
    .filter((h) => h && typeof h.id === 'string' && GIFT_KINDS.includes(h.kind))
    .slice(0, MAILBOX.historyMax)
    .map((h) => ({ id: h.id, title: String(h.title), kind: h.kind, amount: int(h.amount, 0, 1e9, 0), claimedAt: Number(h.claimedAt) || 0 }));
  return { gifts, granted, history, backfilled: m.backfilled === true };
}
