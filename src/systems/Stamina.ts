// 행동력 · 선물함 (기획 v1.4, 2026-11-18)
// 순수 함수만 둔다(시간 now를 인자로 받음) → 저장 위치와 상관없이 테스트·재사용 가능.
// 게임 저장(Progress)에 붙이는 건 v1.2가 main에 합쳐진 뒤. 지금은 디자인 시안에서만 사용.

export const STAMINA = {
  max: 40, // 최대 행동력(자연 회복 상한)
  regenMs: 30 * 60_000, // 30분마다 1개 → 0→40 전부 20시간
  entryCost: 5, // 스테이지 1회 입장 비용 — 임시값(기획 v1.4 "임시 5 추천", 최종은 밸런스로 확정)
  clearGift: 20, // 스테이지·난이도별 최초 클리어 보상(선물함으로)
  refundOnFail: false, // 실패·포기 시 돌려주지 않음 — AI 1차안(기획에 없음, 확정 필요)
} as const;

export interface StaminaState {
  value: number; // 현재 행동력(0 이상 정수)
  /** 회복 기준 시각(ms). 값이 최대면 의미 없음(타이머 정지). 최대 아래로 내려간 순간부터 센다 */
  regenFrom: number;
}

export interface Gift {
  id: string; // 중복 방지 키와 같음: 'clear:<난이도>:<단계>'
  kind: 'stamina';
  amount: number;
  title: string; // '행동력 충전 선물'
  source: string; // '쉬움 1단계 최초 클리어'
  createdAt: number;
  claimedAt?: number; // 받았으면 시각(목록에서 '수령 완료'로 표시)
}

export interface GiftBox {
  gifts: Gift[];
  /** 지금까지 선물을 만든 클리어 키 — 같은 클리어로 두 번 지급하지 않기 위해 영구 저장 */
  granted: string[];
}

export const newStamina = (now: number): StaminaState => ({ value: STAMINA.max, regenFrom: now });
export const newGiftBox = (): GiftBox => ({ gifts: [], granted: [] });

/**
 * 경과 시간만큼 회복. 앱을 꺼 둔 시간도 포함(프레임·실행 여부와 상관없이 시각 차이로 계산).
 * - 최대 이상이면 회복하지 않고 기준 시각을 지금으로(타이머 정지)
 * - 남은 시간(30분 미만 자투리)은 기준 시각에 남겨 다음 회복에 이어 감
 * - 기기 시계가 뒤로 갔으면(now < 기준) 기준을 지금으로 다시 잡는다(음수 회복·버그 방지)
 */
export function regen(s: StaminaState, now: number): StaminaState {
  if (s.value >= STAMINA.max) return { value: s.value, regenFrom: now };
  if (now < s.regenFrom) return { value: s.value, regenFrom: now };
  const ticks = Math.floor((now - s.regenFrom) / STAMINA.regenMs);
  if (ticks <= 0) return s;
  const value = Math.min(STAMINA.max, s.value + ticks);
  const regenFrom = value >= STAMINA.max ? now : s.regenFrom + ticks * STAMINA.regenMs;
  return { value, regenFrom };
}

/** 다음 1개 회복까지 남은 ms(최대면 null = 타이머 정지) */
export function nextRegenIn(s: StaminaState, now: number): number | null {
  const r = regen(s, now);
  if (r.value >= STAMINA.max) return null;
  return Math.max(0, r.regenFrom + STAMINA.regenMs - now);
}

/** 0→최대까지 남은 ms(표시용) */
export function fullIn(s: StaminaState, now: number): number {
  const r = regen(s, now);
  const left = nextRegenIn(r, now);
  if (left === null) return 0;
  return left + (STAMINA.max - r.value - 1) * STAMINA.regenMs;
}

/** 입장할 때 사용. 부족하면 ok:false. 최대에서 내려가는 순간 회복 타이머 시작 */
export function spend(s: StaminaState, n: number, now: number): { ok: boolean; state: StaminaState } {
  const r = regen(s, now);
  if (n <= 0 || r.value < n) return { ok: false, state: r };
  const wasFull = r.value >= STAMINA.max;
  return { ok: true, state: { value: r.value - n, regenFrom: wasFull ? now : r.regenFrom } };
}

/** 클리어 키: 스테이지·난이도별 최초 클리어 1회 */
export const clearKey = (difficulty: string, stageId: number) => `clear:${difficulty}:${stageId}`;

/** 최초 클리어 선물 만들기. 이미 만든 키면 그대로(중복 지급 없음). */
export function grantClearGift(box: GiftBox, difficulty: string, stageId: number, sourceLabel: string, now: number): { granted: boolean; box: GiftBox } {
  const id = clearKey(difficulty, stageId);
  if (box.granted.includes(id)) return { granted: false, box };
  const gift: Gift = { id, kind: 'stamina', amount: STAMINA.clearGift, title: '행동력 충전 선물', source: sourceLabel, createdAt: now };
  return { granted: true, box: { gifts: [...box.gifts, gift], granted: [...box.granted, id] } };
}

export type ClaimFail = 'notFound' | 'claimed' | 'wouldExceed';

/**
 * 선물 수령. 받은 뒤 최대(40)를 넘으면 받지 않고 선물함에 그대로 둔다(일부만 받기 없음).
 * 받으면 claimedAt을 기록(목록에서 '수령 완료'). 선물함의 행동력은 최대 계산에 들어가지 않는다.
 */
export function claimGift(
  box: GiftBox,
  s: StaminaState,
  giftId: string,
  now: number,
): { ok: true; box: GiftBox; state: StaminaState } | { ok: false; reason: ClaimFail; box: GiftBox; state: StaminaState } {
  const r = regen(s, now);
  const g = box.gifts.find((x) => x.id === giftId);
  if (!g) return { ok: false, reason: 'notFound', box, state: r };
  if (g.claimedAt) return { ok: false, reason: 'claimed', box, state: r };
  if (r.value + g.amount > STAMINA.max) return { ok: false, reason: 'wouldExceed', box, state: r };
  const value = r.value + g.amount;
  const state = { value, regenFrom: value >= STAMINA.max ? now : r.regenFrom };
  return { ok: true, state, box: { ...box, gifts: box.gifts.map((x) => (x.id === giftId ? { ...x, claimedAt: now } : x)) } };
}

/** 받지 않은 선물 수(선물함 버튼의 숫자 표시) */
export const unclaimedCount = (box: GiftBox) => box.gifts.filter((g) => !g.claimedAt).length;

/** 남은 시간 '29:41' 또는 '1:05:00' */
export function formatLeft(ms: number): string {
  const t = Math.ceil(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
