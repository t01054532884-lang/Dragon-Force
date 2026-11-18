import type { Rarity } from './economy';

// 2026 크리스마스 이벤트 "드래곤의 겨울 축제" (기획 v1.3 3~6장 + 출석 보상 수정, 제작자 2026-11-18).
// 서버 도입 전 데모용 설정값. 숫자만 바꾸면 화면·추첨·테스트가 함께 바뀐다(확률 안내 화면도 이 표를 그대로 읽는다).

export type RouletteReward = { id: string; label: string; weight: number; rubies?: number; essence?: Exclude<Rarity, 'common' | 'legendary'> };

export const WINTER_2026 = {
  id: 'winter-2026',
  name: '드래곤의 겨울 축제',
  /** KST 2026-12-01 00:00 ~ 2027-01-01 00:00(끝 시각 제외) */
  startKst: '2026-12-01T00:00:00+09:00',
  endKst: '2027-01-01T00:00:00+09:00',
  // ── 행운 룰렛 ──
  battlesPerSpin: 5, // 정상 종료 5판마다 1회
  minBattleMs: 60_000, // 60초 이상 전투
  // 정상 종료 = 클리어·사망·시간 초과. 자발적 포기는 제외
  roulette: [
    { id: 'r10', label: '루비 10', weight: 25, rubies: 10 },
    { id: 'r20', label: '루비 20', weight: 25, rubies: 20 },
    { id: 'r30', label: '루비 30', weight: 20, rubies: 30 },
    { id: 'r40', label: '루비 40', weight: 12, rubies: 40 },
    { id: 'r50', label: '루비 50', weight: 8, rubies: 50 },
    { id: 'rare', label: '희귀 드래곤 정수 확정 상자', weight: 8, essence: 'rare' },
    { id: 'epic', label: '영웅 드래곤 정수 확정 상자', weight: 2, essence: 'epic' },
  ] as RouletteReward[],
  /** 룰렛 누적(돌린 횟수) 보상 — 구간마다 1회 */
  milestones: [
    { spins: 5, rubies: 100 },
    { spins: 10, rubies: 200 },
    { spins: 20, rubies: 400 },
    { spins: 30, rubies: 700, essence: 'epic' as const },
  ],
  // ── 크리스마스 출석(7일 반복, 수정본) ── 하루 1회, KST 자정 갱신, 빠진 날이 있어도 누적 출석일은 초기화하지 않음
  attendance: [100, 200, 300, 400, 500, 600, 700], // 7일 합계 2,800 · 31일 개근 11,800
};

/** 정수 확정 상자: 그 희귀도 드래곤 중 하나(균등, 레드 제외). 보유 중이면 중복 정수 → 조각. 소환 천장 카운터에는 영향 없음 */
export type WinterEvent = typeof WINTER_2026;
