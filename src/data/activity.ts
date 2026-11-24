// 상시 활동 점수 상자 · 28일 출석(제작자 확정 2026-11-21, docs/ACTIVITY_ATTENDANCE.md).
// 겨울 축제 출석(events.ts, 12월 한정)과는 따로 돈다. 수치는 여기만 고치면 된다.

/** 활동·출석 보상 한 묶음(여러 개 동시 가능) */
export interface ActivityReward {
  gold?: number;
  rubies?: number;
  /** 드래곤 카드 — 받을 때 보유 드래곤 중 고름 */
  pickCards?: number;
  /** 무작위 룬 1종의 조각 */
  runeFragments?: number;
  /** 상자 무료 개봉권 */
  tickets?: { dragon?: number; equipment?: number; rune?: number };
}

export interface ActivityTier {
  at: number; // 필요 점수
  reward: ActivityReward;
}

/** 일일 미션 하나 = 활동 점수 20, 하루 최대 100(일일 미션 5개) */
export const ACTIVITY_POINTS_PER_DAILY = 20;
export const ACTIVITY_DAILY_MAX = 100;
export const ACTIVITY_WEEKLY_MAX = 700;

export const ACTIVITY_DAILY: ActivityTier[] = [
  { at: 20, reward: { gold: 500 } },
  { at: 40, reward: { rubies: 20 } },
  { at: 60, reward: { pickCards: 2 } },
  { at: 80, reward: { runeFragments: 5 } },
  { at: 100, reward: { rubies: 50 } },
];

export const ACTIVITY_WEEKLY: ActivityTier[] = [
  { at: 150, reward: { gold: 2000 } },
  { at: 300, reward: { rubies: 100 } },
  { at: 450, reward: { runeFragments: 20 } },
  { at: 600, reward: { tickets: { dragon: 1 } } },
  { at: 700, reward: { rubies: 200 } },
];

/**
 * 28일 출석(연속 아님 — 접속해 받은 날 수로 진행, 28일차 다음은 1일차).
 * 제작자 요청(2026-11-21): 룬 상자 개봉권 3회·장비 상자 3회·골드 등 날마다 다양하게.
 * 합계: 루비 750 · 골드 10,500 · 드래곤 개봉권 2 · 장비 개봉권 5 · 룬 개봉권 6 · 룬 조각 20 · 카드 선택 10
 */
export const ATTENDANCE_28: ActivityReward[] = [
  { gold: 1000 }, // 1
  { rubies: 30 }, // 2
  { tickets: { rune: 1 } }, // 3
  { pickCards: 2 }, // 4
  { tickets: { equipment: 1 } }, // 5
  { gold: 1500 }, // 6
  { rubies: 150 }, // 7
  { runeFragments: 10 }, // 8
  { rubies: 30 }, // 9
  { tickets: { equipment: 1 } }, // 10
  { gold: 2000 }, // 11
  { pickCards: 3 }, // 12
  { tickets: { rune: 1 } }, // 13
  { tickets: { dragon: 1 } }, // 14
  { gold: 1000 }, // 15
  { rubies: 30 }, // 16
  { tickets: { rune: 3 } }, // 17
  { pickCards: 2 }, // 18
  { rubies: 30 }, // 19
  { gold: 2000 }, // 20
  { rubies: 150 }, // 21
  { tickets: { equipment: 3 } }, // 22
  { runeFragments: 10 }, // 23
  { rubies: 30 }, // 24
  { gold: 3000 }, // 25
  { pickCards: 3 }, // 26
  { tickets: { rune: 1 } }, // 27
  { rubies: 300, tickets: { dragon: 1 } }, // 28
];

const TICKET_NAME = { dragon: '드래곤 상자', equipment: '장비 상자', rune: '룬 상자' } as const;

/** "골드 1,000" · "룬 상자 개봉권 3" · "루비 300 + 드래곤 상자 개봉권 1" */
export function activityRewardText(r: ActivityReward): string {
  const parts: string[] = [];
  if (r.rubies) parts.push(`루비 ${r.rubies.toLocaleString()}`);
  if (r.gold) parts.push(`골드 ${r.gold.toLocaleString()}`);
  if (r.pickCards) parts.push(`드래곤 카드 ${r.pickCards}장(보유 드래곤 중 랜덤)`);
  if (r.runeFragments) parts.push(`룬 조각 ${r.runeFragments}`);
  for (const k of ['dragon', 'equipment', 'rune'] as const) if (r.tickets?.[k]) parts.push(`${TICKET_NAME[k]} 개봉권 ${r.tickets[k]}`);
  return parts.join(' + ');
}

/** 보상 칸 대표 그림·짧은 수량 */
export function activityRewardIcon(r: ActivityReward): { image: string; emoji: string; amount: string } {
  if (r.rubies) return { image: 'ui-ruby', emoji: '💎', amount: `${r.rubies}${r.tickets ? '+' : ''}` };
  if (r.gold) return { image: 'ui-gold', emoji: '🪙', amount: r.gold.toLocaleString() };
  if (r.pickCards) return { image: 'ui-card', emoji: '🃏', amount: `${r.pickCards}장` };
  if (r.runeFragments) return { image: 'ui-rune-fragment', emoji: '🔷', amount: `${r.runeFragments}개` }; // 룬 조각 전용 아이콘(드래곤 조각 ui-fragment와 구분)
  const t = r.tickets ?? {};
  if (t.rune) return { image: 'chest-rune', emoji: '🎟', amount: `룬 ${t.rune}` }; // 룬 상자 그림(예전 임시: 금 상자)
  if (t.equipment) return { image: 'chest-equipment', emoji: '🎟', amount: `장비 ${t.equipment}` };
  return { image: 'chest-dragon', emoji: '🎟', amount: `드래곤 ${t.dragon ?? 0}` };
}
