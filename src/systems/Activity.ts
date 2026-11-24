import {
  ACTIVITY_DAILY, ACTIVITY_DAILY_MAX, ACTIVITY_POINTS_PER_DAILY, ACTIVITY_WEEKLY, ACTIVITY_WEEKLY_MAX, ATTENDANCE_28, type ActivityReward,
} from '../data/activity';
import { DRAGONS, releasedDragons, type DragonId } from '../data/dragons';
import { KST_OFFSET_MS, MISSIONS, RANDOM_CARD_RARITY, RARITIES, econRarity } from '../data/economy';
import { SPECIAL_IDS } from '../data/specials';
import type { Fail, PlayerProgress, Result } from './Progress';

// 상시 활동 점수 상자 · 28일 출석 규칙(제작자 확정 2026-11-21, docs/ACTIVITY_ATTENDANCE.md). 순수 함수.
// - 활동 점수는 따로 저장하지 않고 "받은 일일 미션"에서 계산한다(일일 미션 1개 = 20점) → 이중 지급·불일치 없음.
// - 상자를 받은 기록은 미션 받은 기록(missions.claimed)에 `act-d-<점수>@<날짜>` / `act-w-<점수>@w<월요일>`로 남긴다.

const fail = (reason: string): Fail => ({ ok: false, reason });
const kst = (now: number) => new Date(now + KST_OFFSET_MS);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const todayKey = (now: number) => ymd(kst(now));
/** 이번 주 월요일(KST) 'YYYY-MM-DD' */
export function weekStart(now: number): string {
  const d = kst(now);
  const dow = (d.getUTCDay() + 6) % 7;
  return ymd(new Date(d.getTime() - dow * 86_400_000));
}

const DAILY_POINT_IDS = new Set(MISSIONS.filter((m) => m.period === 'daily').map((m) => m.id));

/** 오늘·이번 주 활동 점수(받은 일일 미션 × 20) */
export function activityPoints(p: PlayerProgress, now: number): { daily: number; weekly: number } {
  const today = todayKey(now);
  const mon = weekStart(now);
  const monDate = new Date(`${mon}T00:00:00Z`).getTime();
  let daily = 0;
  let weekly = 0;
  for (const k of p.missions.claimed) {
    const at = k.lastIndexOf('@');
    if (at < 0 || !DAILY_POINT_IDS.has(k.slice(0, at))) continue;
    const date = k.slice(at + 1);
    if (date === today) daily += ACTIVITY_POINTS_PER_DAILY;
    const t = new Date(`${date}T00:00:00Z`).getTime();
    if (t >= monDate && t < monDate + 7 * 86_400_000) weekly += ACTIVITY_POINTS_PER_DAILY;
  }
  return { daily: Math.min(daily, ACTIVITY_DAILY_MAX), weekly: Math.min(weekly, ACTIVITY_WEEKLY_MAX) };
}

const tierKey = (kind: 'daily' | 'weekly', at: number, now: number) => (kind === 'daily' ? `act-d-${at}@${todayKey(now)}` : `act-w-${at}@w${weekStart(now)}`);
export const activityClaimed = (p: PlayerProgress, kind: 'daily' | 'weekly', at: number, now: number) => p.missions.claimed.includes(tierKey(kind, at, now));

/** 받을 수 있는 활동 상자 수(로비·탭 알림) */
export function claimableActivity(p: PlayerProgress, now: number): number {
  const pts = activityPoints(p, now);
  const n = (kind: 'daily' | 'weekly', list: typeof ACTIVITY_DAILY) => list.filter((t) => pts[kind] >= t.at && !activityClaimed(p, kind, t.at, now)).length;
  return n('daily', ACTIVITY_DAILY) + n('weekly', ACTIVITY_WEEKLY);
}

/**
 * 카드 보상 받을 드래곤(2026-11-25: 고르지 않고 무작위): 보유 드래곤 중 등급 비중(RANDOM_CARD_RARITY, 가진 등급만으로 다시 나눔) → 그 등급 안에서 균등.
 * 레드만 있으면 레드.
 */
export function randomCardDragon(p: PlayerProgress, rnd: () => number): DragonId {
  const owned = releasedDragons().filter((id) => p.dragons[id]?.unlocked);
  if (!owned.length) return 'red';
  const groups = RARITIES.map((r) => ({ r, ids: owned.filter((id) => econRarity(DRAGONS[id].rarity) === r) })).filter((g) => g.ids.length);
  const total = groups.reduce((a, g) => a + RANDOM_CARD_RARITY[g.r], 0);
  let x = rnd() * total;
  const g = groups.find((gr) => (x -= RANDOM_CARD_RARITY[gr.r]) < 0) ?? groups[groups.length - 1];
  return g.ids[Math.min(g.ids.length - 1, Math.floor(rnd() * g.ids.length))];
}

/** 보상 지급(카드는 보유 드래곤 중 무작위, 룬 조각은 무작위 1종) */
export function grantActivityReward(p: PlayerProgress, r: ActivityReward, rnd: () => number): Result<{ runeId?: string; cardDragon?: DragonId }> {
  let next: PlayerProgress = { ...p, gold: p.gold + (r.gold ?? 0), rubies: p.rubies + (r.rubies ?? 0) };
  const cardDragon = r.pickCards ? randomCardDragon(p, rnd) : undefined;
  if (r.pickCards && cardDragon) next = { ...next, dragons: { ...next.dragons, [cardDragon]: { ...next.dragons[cardDragon], cards: next.dragons[cardDragon].cards + r.pickCards } } };
  let runeId: string | undefined;
  if (r.runeFragments) {
    const id = SPECIAL_IDS[Math.min(SPECIAL_IDS.length - 1, Math.floor(rnd() * SPECIAL_IDS.length))];
    runeId = id;
    next = { ...next, specials: { ...next.specials, [id]: { ...next.specials[id], fragments: next.specials[id].fragments + r.runeFragments } } };
  }
  if (r.tickets) {
    const s = next.summon;
    next = {
      ...next,
      summon: {
        ...s,
        legacyTickets: s.legacyTickets + (r.tickets.dragon ?? 0),
        equipTickets: (s.equipTickets ?? 0) + (r.tickets.equipment ?? 0),
        runeTickets: (s.runeTickets ?? 0) + (r.tickets.rune ?? 0),
      },
    };
  }
  return { ok: true, progress: next, runeId, cardDragon };
}

/** 활동 상자 받기: 점수가 됐고 이번 기간에 안 받았을 때 한 번 */
export function claimActivity(
  p: PlayerProgress, kind: 'daily' | 'weekly', at: number, now: number, rnd: () => number,
): Result<{ reward: ActivityReward; runeId?: string; cardDragon?: DragonId }> {
  const tier = (kind === 'daily' ? ACTIVITY_DAILY : ACTIVITY_WEEKLY).find((t) => t.at === at);
  if (!tier) return fail('missing');
  if (activityClaimed(p, kind, at, now)) return fail('claimed');
  if (activityPoints(p, now)[kind] < at) return fail('progress');
  const g = grantActivityReward(p, tier.reward, rnd);
  if (!g.ok) return g;
  const claimed = [...g.progress.missions.claimed, tierKey(kind, at, now)].slice(-400);
  return { ok: true, progress: { ...g.progress, missions: { ...g.progress.missions, claimed } }, reward: tier.reward, runeId: g.runeId, cardDragon: g.cardDragon };
}

/** 오늘 출석 상태: 받을 칸(0~27), 오늘 이미 받았는지 */
export function attendanceState(p: PlayerProgress, now: number): { index: number; claimedToday: boolean } {
  const claimedToday = p.attendance.last === todayKey(now);
  const index = (claimedToday ? p.attendance.count - 1 : p.attendance.count) % ATTENDANCE_28.length;
  return { index: Math.max(0, index), claimedToday };
}

/** 출석 받기: 하루 한 번(KST), 연속이 아니라 받은 날 수로 진행, 28일차 다음은 1일차 */
export function claimDailyAttendance(p: PlayerProgress, now: number, rnd: () => number): Result<{ day: number; reward: ActivityReward; runeId?: string; cardDragon?: DragonId }> {
  const today = todayKey(now);
  if (p.attendance.last === today) return fail('claimed');
  const idx = p.attendance.count % ATTENDANCE_28.length;
  const reward = ATTENDANCE_28[idx];
  const g = grantActivityReward(p, reward, rnd);
  if (!g.ok) return g;
  return { ok: true, progress: { ...g.progress, attendance: { count: p.attendance.count + 1, last: today } }, day: idx + 1, reward, runeId: g.runeId, cardDragon: g.cardDragon };
}
