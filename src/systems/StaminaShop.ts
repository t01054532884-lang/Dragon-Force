import { regen, STAMINA } from './Stamina';
import { dealPeriodKey, type PlayerProgress, type Result } from './Progress';

/**
 * 행동력 구매(제작자 요청 2026-11-26): 머리줄 행동력 "+" → 구매 창.
 * - 루비로 20개(60루비) · 무료 5개(하루 3번, KST 0시 초기화) — 수치는 임시(예시 화면 기준), 판매 기록 보고 조정
 * - 받은 뒤 보유 최대(STAMINA.hold = 100)를 넘으면 받지 않음(선물함과 같은 규칙). 40을 넘는 건 됨(그동안 시간 회복은 멈춤)
 * - 무료 횟수는 shopLog에 `stamina-free@<날짜>`로 남긴다(무료 일일 선물과 같은 방식 — 클라우드 저장과 함께 감)
 */
export const STAMINA_SHOP = {
  ruby: { amount: 20, rubies: 60 },
  free: { amount: 5, perDay: 3 },
} as const;

const freeKey = (now: number) => `stamina-free@${dealPeriodKey('daily', now)}`;

/** 오늘 남은 무료 횟수 */
export function freeStaminaLeft(p: PlayerProgress, now: number): number {
  const k = freeKey(now);
  return Math.max(0, STAMINA_SHOP.free.perDay - p.shopLog.filter((s) => s === k).length);
}

/** 행동력 n개 더하기(보유 최대를 넘으면 실패, 아무것도 바뀌지 않음) */
function addStamina(p: PlayerProgress, n: number, now: number): PlayerProgress | null {
  const r = regen(p.stamina, now);
  const value = r.value + n;
  if (value > STAMINA.hold) return null;
  return { ...p, stamina: { value, regenFrom: value >= STAMINA.max ? now : r.regenFrom } };
}

export type StaminaBuyFail = 'rubies' | 'full' | 'noFree';
export const STAMINA_BUY_FAIL_TEXT: Record<StaminaBuyFail, string> = {
  rubies: '루비가 부족해요',
  full: `행동력은 ${STAMINA.hold}을 초과할 수 없어요`,
  noFree: '오늘 무료 횟수를 모두 썼어요',
};

/** 루비로 행동력 20 */
export function buyStaminaWithRubies(p: PlayerProgress, now: number): Result {
  const o = STAMINA_SHOP.ruby;
  if (p.rubies < o.rubies) return { ok: false, reason: 'rubies', cost: o.rubies };
  const q = addStamina(p, o.amount, now);
  if (!q) return { ok: false, reason: 'full' };
  return { ok: true, cost: o.rubies, progress: { ...q, rubies: q.rubies - o.rubies } };
}

/** 무료 행동력 5(하루 3번) */
export function claimFreeStamina(p: PlayerProgress, now: number): Result {
  if (freeStaminaLeft(p, now) <= 0) return { ok: false, reason: 'noFree' };
  const q = addStamina(p, STAMINA_SHOP.free.amount, now);
  if (!q) return { ok: false, reason: 'full' };
  return { ok: true, progress: { ...q, shopLog: [...q.shopLog, freeKey(now)].slice(-300) } };
}
