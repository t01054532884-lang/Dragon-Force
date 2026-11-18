import type { DragonId, DragonRarity } from './dragons';

// 개발 6단계 v1.2 — 경제 설정(카드·정수·조각·루비 상자·진행도·주기 보상).
// 원문(기획 수정안 v1.2)에 있는 값은 "원문", 제작자가 11/18에 정한 임시 값은 "제작자 임시",
// 둘 다 없어 AI가 채운 값은 "AI 1차안"으로 표시한다. **모두 임시 밸런스 수치**이며 숫자만 바꾸면 된다.

export type Rarity = Exclude<DragonRarity, 'starter'>;
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];
/** 레드(기본 지급)는 조각·범용 교환에서 일반 등급으로 취급(AI 1차안) */
export const econRarity = (r: DragonRarity): Rarity => (r === 'starter' ? 'common' : r);

// ───────── 정수·조각 (원문 5장) ─────────
export const ESSENCE = {
  fragmentsToEssence: { common: 40, rare: 60, epic: 100, legendary: 160 } as Record<Rarity, number>, // 미보유 드래곤 해금
  essenceToFragments: { common: 20, rare: 30, epic: 50, legendary: 80 } as Record<Rarity, number>, // 중복 정수
};

// ───────── 5성 이후 범용 조각 (원문 7장) ─────────
export const UNIVERSAL = {
  rate: { common: 5, rare: 4, epic: 2, legendary: 1 } as Record<Rarity, number>, // 초과 조각 N개 → 범용 1개
  legendaryMaxShare: 0.25, // 전설 승급 필요량의 최대 25%까지 범용 조각 사용
};

// ───────── 스테이지 클리어 드래곤 카드 (제작자 임시 2026-11-18) ─────────
// 출격한 드래곤 카드: 최초 클리어 2장 · 반복 클리어 1장 · 실패/시간 초과/포기 0장 · 그 드래곤이 Lv.40이면 카드 대신 100G.
// 골드 정산과 별개로 지급. 미션 시스템과 함께 수급량을 다시 본다.
export const CLEAR_CARDS = { first: 2, repeat: 1, maxLevelGold: 100 };

// ───────── 난이도·진행도 (원문 4장, 난이도 배율은 AI 1차안 — 제작자 승인 2026-11-18) ─────────
export type Difficulty = 'easy' | 'hard' | 'extreme';
export const DIFFICULTIES: Difficulty[] = ['easy', 'hard', 'extreme'];
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: '쉬움', hard: '어려움', extreme: '매우 어려움' };
export const DIFFICULTY_MULT: Record<Difficulty, { hp: number; damage: number }> = {
  easy: { hp: 1, damage: 1 },
  hard: { hp: 1.5, damage: 1.25 }, // AI 1차안
  extreme: { hp: 2.2, damage: 1.5 }, // AI 1차안(한 방 35% 상한은 그대로)
};
export const STAGE_COUNT = 20; // 진행도 분모는 20 고정(미구현 단계도 분모에 포함)

export type RewardBundle = { gold?: number; rubies?: number; fragments?: { dragonId: DragonId; count: number } };
export const PROGRESS_REWARDS: Record<Difficulty, Record<25 | 50 | 100, RewardBundle>> = {
  easy: { 25: { gold: 500 }, 50: { fragments: { dragonId: 'red', count: 20 } }, 100: { rubies: 300 } },
  hard: { 25: { gold: 1000 }, 50: { fragments: { dragonId: 'red', count: 40 } }, 100: { rubies: 600 } },
  extreme: { 25: { gold: 2000 }, 50: { fragments: { dragonId: 'red', count: 80 } }, 100: { rubies: 1200 } },
};
export const PROGRESS_STEPS = [25, 50, 100] as const;

// ───────── 루비 상자 (원문 6장 + 제작자 임시) ─────────
export type BoxId = 'dragon' | 'equipment' | 'gold';
export interface BoxDef {
  name: string;
  desc: string;
  price1: number;
  price10: number; // 단건 대비 10% 할인(원문)
  color: number;
}
export const BOXES: Record<BoxId, BoxDef> = {
  dragon: { name: '드래곤·스킬 상자', desc: '정수·조각·카드·특수 스킬 조각', price1: 150, price10: 1350, color: 0x6a3fb5 },
  equipment: { name: '장비 상자', desc: '무기·갑옷·목걸이·반지', price1: 100, price10: 900, color: 0x2e7d6a },
  gold: { name: '골드 상자', desc: '골드', price1: 50, price10: 450, color: 0x9a7a12 },
};

/** 드래곤·스킬 상자 1차 추첨(원문): 카드 40 · 조각 25 · 정수 15 · 특수 스킬 조각 20 */
export const DRAGON_BOX = {
  kind: { card: 40, fragment: 25, essence: 15, special: 20 },
  essenceRarity: { common: 70, rare: 22, epic: 7, legendary: 1 } as Record<Rarity, number>, // 원문
  rareGuarantee: 10, // 매 10회째 희귀 이상 정수(원문)
  legendaryGuarantee: 90, // 90회째 전설 정수(원문, 10회 보장보다 우선)
  guaranteeWeights: { rare: 22, epic: 7, legendary: 1 }, // 10회 보장의 희귀:영웅:전설(원문)
  // 카드·조각을 줄 드래곤: 희귀도를 정수와 같은 70/22/7/1로 뽑고 그 안에서 균등(AI 1차안).
  // 카드는 레드(일반 취급) 포함, 조각·정수는 레드 제외(원문: 레드는 소환 제외, 조각은 진행도·이벤트·미션).
  cardCount: { common: 3, rare: 2, epic: 2, legendary: 1 } as Record<Rarity, number>, // AI 1차안
  fragmentCount: { common: 10, rare: 6, epic: 4, legendary: 2 } as Record<Rarity, number>, // AI 1차안
  specialFragments: 5, // 특수 스킬 조각 5개(15종 균등) — AI 1차안
};

export const EQUIPMENT_BOX = { rarity: { common: 70, rare: 22, epic: 7, legendary: 1 } as Record<Rarity, number> }; // 제작자 임시
export const GOLD_BOX = { table: [[500, 60], [1000, 30], [2000, 9], [5000, 1]] as [number, number][] }; // 제작자 임시

// ───────── 업적(일회성) — 기존 소환권 보상을 루비로 (AI 1차안: 소환권 1장 = 150루비) ─────────
// 이미 받은 업적·소환권은 그대로 둔다(기존권은 무료 개봉권으로 보존).
export const ACHIEVEMENTS = [
  { id: 'first-run', text: '첫 출격: 30초 이상 전투', rubies: 150 },
  { id: 'first-elite', text: '엘리트 첫 처치', rubies: 300 },
  { id: 'kills-1000', text: '마수 누적 1,000마리 처치', rubies: 300 },
  { id: 'kills-10000', text: '마수 누적 10,000마리 처치', rubies: 750 },
  { id: 'collector-3', text: '드래곤 3종 보유', rubies: 300 },
];

// ───────── 주기 보상 (원문 5장 예시 + AI 1차안 수량, 초기화는 제작자 임시: KST 자정·월요일·매월 1일) ─────────
export type Period = 'daily' | 'weekly' | 'monthly' | 'event';
export type MissionMetric = 'clears' | 'normalKills' | 'eliteKills' | 'dailyDays';
export type MissionReward = { gold?: number; rubies?: number; pickCards?: number; pickFragments?: number };
export interface MissionDef {
  id: string;
  period: Period;
  text: string;
  metric: MissionMetric;
  goal: number;
  reward: MissionReward;
  /** 이벤트 미션 기간(KST 날짜 'YYYY-MM-DD', 끝 날짜 포함) */
  from?: string;
  to?: string;
}
export const MISSIONS: MissionDef[] = [
  { id: 'd-clear', period: 'daily', text: '스테이지 1회 클리어', metric: 'clears', goal: 1, reward: { pickCards: 1 } },
  { id: 'd-kills', period: 'daily', text: '몬스터 1,000마리 처치', metric: 'normalKills', goal: 1000, reward: { gold: 300 } },
  { id: 'w-clear', period: 'weekly', text: '스테이지 10회 클리어', metric: 'clears', goal: 10, reward: { pickCards: 5 } },
  { id: 'w-elite', period: 'weekly', text: '엘리트 15마리 처치', metric: 'eliteKills', goal: 15, reward: { pickFragments: 10 } },
  { id: 'm-daily', period: 'monthly', text: '일일 미션 20일 완료', metric: 'dailyDays', goal: 20, reward: { rubies: 300, pickCards: 5 } },
  // 이벤트: 기간 목표 → 정수·조각·루비. 지금 진행 중인 이벤트 없음(기간을 넣으면 화면에 나온다).
];
/** 일일 미션 "완료한 날" = 그날 일일 미션 보상을 모두 받은 날 */
export const DAILY_IDS = MISSIONS.filter((m) => m.period === 'daily').map((m) => m.id);
export const KST_OFFSET_MS = 9 * 3600_000;

// ───────── 인앱결제 자리(첫 출시 제외, 제작자 결정 2026-11-18) ─────────
// 루비는 게임 안 보상·이벤트로만 얻는다. 결제를 붙일 때 이 목록과 src/systems/Purchases.ts만 채운다.
export const RUBY_PRODUCTS: { productId: string; rubies: number }[] = [];
