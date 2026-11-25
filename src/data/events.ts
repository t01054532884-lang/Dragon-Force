import type { Rarity } from './economy';
import type { DragonId } from './dragons';

// 2026 크리스마스 이벤트 "드래곤의 겨울 축제" (기획 v1.3 3~6장 + 출석 보상 수정, 제작자 2026-11-18).
// 서버 도입 전 데모용 설정값. 숫자만 바꾸면 화면·추첨·테스트가 함께 바뀐다(확률 안내 화면도 이 표를 그대로 읽는다).

/**
 * 룰렛 칸 하나. rubies = 루비, fragments = 축제 드래곤 조각 n개, dragonEssence = 축제 드래곤 정수(없으면 해금, 있으면 조각),
 * essence = 그 희귀도 드래곤 중 하나(누적 보상용).
 */
export type RouletteReward = {
  id: string;
  label: string;
  weight: number;
  rubies?: number;
  fragments?: number;
  dragonEssence?: boolean;
  essence?: Exclude<Rarity, 'common' | 'legendary'>;
};

/**
 * 겨울 축제 드래곤(제작자 결정 2026-11-23: 겨울 테마 영웅 1종) — 빙하 드래곤(아이디 blue, 영웅·얼음, 2026-11-25 워터에서 바꿈).
 * 룰렛에서 정수 2% + 조각 5개 칸 4개(각 5%)로 나온다.
 */
export const WINTER_DRAGON: DragonId = 'blue';

export const WINTER_2026 = {
  id: 'winter-2026',
  name: '드래곤의 겨울 축제',
  /** KST 2026-11-26 00:00 ~ 2027-01-01 00:00(끝 시각 제외). 행운 룰렛은 출시(11/26)부터 열림(제작자 2026-11-26), 크리스마스 출석은 아래 12/18부터 그대로 */
  startKst: '2026-11-26T00:00:00+09:00',
  endKst: '2027-01-01T00:00:00+09:00',
  // ── 행운 룰렛 ──
  battlesPerSpin: 5, // 정상 종료 5판마다 1회
  minBattleMs: 60_000, // 60초 이상 전투
  // 정상 종료 = 클리어·사망·시간 초과. 자발적 포기는 제외
  // (2026-11-23 제작자 결정) 축제 드래곤 정수 2% · 조각 5개 칸 4개(각 5%, 합 20%) · 나머지 78%는 루비.
  // 루비 칸 비율(AI 1차안): 예전 25/25/20/12/8을 78%에 맞게 22/22/17/10/7 → 1회 기대 루비 19.2(예전 22.3).
  // 판 위 순서대로 그린다 — 조각 칸을 루비 칸 사이사이에 나눠 둠.
  roulette: [
    { id: 'r10', label: '루비 10', weight: 22, rubies: 10 },
    { id: 'frag1', label: '빙하 조각 5개', weight: 5, fragments: 5 },
    { id: 'r20', label: '루비 20', weight: 22, rubies: 20 },
    { id: 'frag2', label: '빙하 조각 5개', weight: 5, fragments: 5 },
    { id: 'r30', label: '루비 30', weight: 17, rubies: 30 },
    { id: 'frag3', label: '빙하 조각 5개', weight: 5, fragments: 5 },
    { id: 'r40', label: '루비 40', weight: 10, rubies: 40 },
    { id: 'frag4', label: '빙하 조각 5개', weight: 5, fragments: 5 },
    { id: 'r50', label: '루비 50', weight: 7, rubies: 50 },
    { id: 'essence', label: '빙하 드래곤 정수', weight: 2, dragonEssence: true },
  ] as RouletteReward[],
  /** 룰렛 누적(돌린 횟수) 보상 — 구간마다 1회 */
  milestones: [
    { spins: 5, rubies: 100 },
    { spins: 10, rubies: 200 },
    { spins: 20, rubies: 400 },
    { spins: 30, rubies: 700, essence: 'epic' as const },
  ],
  // ── 크리스마스 출석(7일 반복, 수정본) ── 하루 1회, KST 자정 갱신, 빠진 날이 있어도 누적 출석일은 초기화하지 않음
  // 기간(제작자 2026-11-25): 행운 룰렛은 12월 한 달, 출석은 크리스마스 기준 2주만 — 12/18(금) ~ 12/31(목) KST
  attendanceStartKst: '2026-12-18T00:00:00+09:00',
  attendanceEndKst: '2027-01-01T00:00:00+09:00',
  attendance: [100, 200, 300, 400, 500, 600, 700], // 7일 합계 2,800 · 14일 개근 5,600(예전 31일 11,800)
};

/** 정수 확정 상자: 그 희귀도 드래곤 중 하나(균등, 레드 제외). 보유 중이면 중복 정수 → 조각. 소환 천장 카운터에는 영향 없음 */
export type WinterEvent = typeof WINTER_2026;
