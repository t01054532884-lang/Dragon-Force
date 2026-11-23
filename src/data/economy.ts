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
/** 첫 출시: 쉬움만 입장(제작자 결정 2026-11-18). 어려움·매우 어려움은 데이터·진행도 저장은 유지하고 "출시 예정"으로만 표시 */
// 어려움 1~20단계 출시(제작자 기획서 2026-11-21). 매우 어려움은 아직 "출시 예정"
export const DIFFICULTY_RELEASED: Record<Difficulty, boolean> = { easy: true, hard: true, extreme: false };
export const DIFFICULTY_MULT: Record<Difficulty, { hp: number; damage: number }> = {
  easy: { hp: 1, damage: 1 },
  hard: { hp: 1.5, damage: 1.25 }, // (쓰지 않음) 어려움은 단계별 표 src/data/hardStages.ts가 대신한다(2026-11-21)
  extreme: { hp: 2.2, damage: 1.5 }, // AI 1차안(한 방 35% 상한은 그대로)
};
export const STAGE_COUNT = 20; // 진행도 분모는 20 고정(미구현 단계도 분모에 포함)

export type RewardBundle = { gold?: number; rubies?: number; fragments?: { dragonId: DragonId; count: number } };
/**
 * 단계 상자(제작자 요청 2026-11-23): 난이도별 1~20단계를 각각 처음 깰 때마다 상자 1개(예전 25·50·100% 상자 3개를 대신함).
 * 상자 하나는 작게 — 20개 합계가 예전 3개 상자 합계와 같도록(골드만 조금 더): 쉬움 루비 300·레드 조각 20·골드 1,000.
 * 5단계마다(5·10·15·20) 레드 조각이 더 들어 있다. 수치는 임시(제작자 확인 전).
 */
export const STAGE_BOX: Record<Difficulty, { gold: number; rubies: number; fragments: number }> = {
  easy: { gold: 50, rubies: 15, fragments: 5 },
  hard: { gold: 100, rubies: 30, fragments: 10 },
  extreme: { gold: 200, rubies: 60, fragments: 20 },
};
export const STAGE_BOX_FRAGMENT_EVERY = 5;
/** 한 단계 상자 몫을 25·50·100% 세 칸으로 나눔(2026-11-23 밤): 골드 30%·30%·40%, 루비 ⅓씩, 조각은 100% 칸에. 단계 합계는 그대로 */
export const STAGE_CHEST_SPLIT = { gold: [0.3, 0.3, 0.4], rubies: [1 / 3, 1 / 3, 1 / 3] };
export function stageBoxReward(d: Difficulty, stage: number, tier: 1 | 2 | 3 = 3): RewardBundle {
  const b = STAGE_BOX[d];
  // 마지막 칸이 나머지를 가져가 세 칸 합 = 단계 몫(반올림 오차 없음)
  const part = (total: number, ratios: number[]) => (tier === 3 ? total - Math.round(total * ratios[0]) - Math.round(total * ratios[1]) : Math.round(total * ratios[tier - 1]));
  return {
    gold: part(b.gold, STAGE_CHEST_SPLIT.gold),
    rubies: part(b.rubies, STAGE_CHEST_SPLIT.rubies),
    ...(tier === 3 && stage % STAGE_BOX_FRAGMENT_EVERY === 0 ? { fragments: { dragonId: 'red' as DragonId, count: b.fragments } } : {}),
  };
}

// ───────── 루비 상자 (원문 6장 + 제작자 임시) ─────────
// v1.2 시스템 개편(2026-11-21): 골드 상자 → 룬 상자(골드는 루비로 직접 구매 — GOLD_OFFERS)
export type BoxId = 'dragon' | 'equipment' | 'rune';
export interface BoxDef {
  name: string;
  desc: string;
  price1: number;
  price10: number; // 10회 묶음 가격(할인율은 화면이 계산해 표시)
  color: number;
}
export const BOXES: Record<BoxId, BoxDef> = {
  // 종합 개선 기획서 v1.1(2026-11-21): 150/1,350 → 250/2,200(10회 12% 할인). 제작자 확정 — 이벤트 루비가 많아 초반 영향은 괜찮음
  dragon: { name: '드래곤·스킬 상자', desc: '정수·조각·카드', price1: 250, price10: 2200, color: 0x6a3fb5 },
  equipment: { name: '장비 상자', desc: '발톱 장식·비늘 갑주·목걸이·반지', price1: 100, price10: 900, color: 0x2e7d6a },
  rune: { name: '룬 상자', desc: '룬 조각(15종)', price1: 100, price10: 900, color: 0x3b5bd6 }, // v1.2 제안가
};

/** 드래곤·스킬 상자 1차 추첨(원문): 카드 40 · 조각 25 · 정수 15 · 특수 스킬 조각 20 */
export const DRAGON_BOX = {
  // v1.2: 룬(옛 특수 스킬) 조각은 룬 상자로 분리 → 그 20%를 카드 +10 · 조각 +10으로(정수 15%·보장 규칙은 그대로)
  kind: { card: 50, fragment: 35, essence: 15 },
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
/**
 * 골드 직접 구매(v1.2: 골드 상자 대신). 예전 골드 상자 기대값(50루비 → 평균 830G, 1루비 ≈ 16.6G)에 맞춘 AI 1차안,
 * 큰 묶음일수록 조금 더(10%·20%).
 */
export const GOLD_OFFERS: { id: string; rubies: number; gold: number }[] = [
  { id: 'gold-s', rubies: 50, gold: 800 },
  { id: 'gold-m', rubies: 450, gold: 8_000 },
  { id: 'gold-l', rubies: 1_000, gold: 20_000 },
];

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
export type MissionMetric = 'clears' | 'normalKills' | 'eliteKills' | 'dailyDays' | 'sorties' | 'growth';
export type MissionReward = { gold?: number; rubies?: number; pickCards?: number; randomFragments?: number };

/**
 * 랜덤 조각 보상의 등급 확률(제작자 요청 2026-11-22: 아무 드래곤이나 고르게 하면 전설만 고르게 되므로 랜덤 지급).
 * 등급을 먼저 뽑고 그 등급 안에서 출시된 드래곤 중 균등(레드는 일반에 포함). 수치는 AI 1차안.
 */
export const RANDOM_FRAGMENT_RARITY: Record<Rarity, number> = { common: 60, rare: 28, epic: 10, legendary: 2 };
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
  // 2026-11-21 상시 활동 점수(src/data/activity.ts): 일일 미션 5개, 하나 받을 때마다 활동 점수 20(하루 100)
  { id: 'd-sortie', period: 'daily', text: '전투 1회 출격(30초 이상)', metric: 'sorties', goal: 1, reward: {} },
  { id: 'd-clear', period: 'daily', text: '스테이지 1회 클리어', metric: 'clears', goal: 1, reward: { pickCards: 1 } },
  // 2026-11-20: 몬스터 수 −30%·판 길이 단축(1단계 클리어 판 처치 약 340~530마리) → 일일 처치 목표 1,000 → 300(약 한 판)
  { id: 'd-kills', period: 'daily', text: '몬스터 300마리 처치', metric: 'normalKills', goal: 300, reward: { gold: 300 } },
  { id: 'd-elite', period: 'daily', text: '엘리트 3마리 처치', metric: 'eliteKills', goal: 3, reward: {} },
  { id: 'd-growth', period: 'daily', text: '강화 1회(연구소·드래곤·룬·장비)', metric: 'growth', goal: 1, reward: {} },
  { id: 'w-clear', period: 'weekly', text: '스테이지 10회 클리어', metric: 'clears', goal: 10, reward: { pickCards: 5 } },
  { id: 'w-elite', period: 'weekly', text: '엘리트 15마리 처치', metric: 'eliteKills', goal: 15, reward: { randomFragments: 10 } },
  { id: 'm-daily', period: 'monthly', text: '일일 미션 20일 완료', metric: 'dailyDays', goal: 20, reward: { rubies: 300, pickCards: 5 } },
  // 이벤트: 기간 목표 → 정수·조각·루비. 지금 진행 중인 이벤트 없음(기간을 넣으면 화면에 나온다).
];
/** 일일 미션 "완료한 날" = 그날 일일 미션 보상을 모두 받은 날 */
export const DAILY_IDS = MISSIONS.filter((m) => m.period === 'daily').map((m) => m.id);
export const KST_OFFSET_MS = 9 * 3600_000;

// ───────── 인앱결제: 루비 묶음(첫 출시에 넣기 — 제작자 결정 2026-11-20) ─────────
// ⚠ 기획자 수정안(2026-11-20, 미확정 — 경제 밸런스 시뮬레이션·Apple 실제 판매가 확인 후 확정, docs/MONETIZATION_PLAN.md 4절).
// 실제 가격은 App Store Connect 상품 가격(스토어가 알려 줌), 여기는 상품 ID와 지급 루비만.
// productId는 App Store Connect·RevenueCat에 같은 이름으로 등록 — 한 번 만들면 바꿀 수 없으니 등록 전에 확정.
// krw = 화면에 먼저 보여 줄 예정 가격(스토어가 실제 가격을 알려 주면 그 문자열로 바뀜)
export const RUBY_PRODUCTS: { productId: string; rubies: number; bonus: number; krw: number }[] = [
  { productId: 'ruby_100', rubies: 100, bonus: 0, krw: 1_200 },
  { productId: 'ruby_550', rubies: 500, bonus: 50, krw: 5_900 },
  { productId: 'ruby_1350', rubies: 1000, bonus: 350, krw: 11_000 }, // = 10회 소환 1,350루비
  { productId: 'ruby_2800', rubies: 2000, bonus: 800, krw: 22_000 },
  { productId: 'ruby_7500', rubies: 5000, bonus: 2500, krw: 55_000 },
];

/**
 * 기간 한정 패키지(제작자 요청 2026-11-22: 상점에 패키지 칸 — 보석 대신 루비, 열쇠 대신 장비·룬 개봉권).
 * 구성·가격 확정(아래 PACKAGES 주석). 결제가 연결되면 검증된 거래만 grantVerifiedPackage로 지급, 계정당 limit회.
 * 가치 기준: 장비·룬 상자 1회 = 루비 100, 드래곤 상자 1회 = 루비 250, 골드 20,000 = 루비 1,000.
 */
export interface PackageDef {
  productId: string;
  name: string;
  krw: number;
  limit: number; // 기간(period)마다 구매 횟수 — 한정 패키지는 계정당
  period?: 'daily' | 'weekly' | 'monthly' | 'once'; // 없으면 'once'(계정당)
  rubies?: number;
  gold?: number;
  dragonTickets?: number; // 드래곤·스킬 상자 무료 개봉권
  equipTickets?: number; // 장비 상자 무료 개봉권
  runeTickets?: number; // 룬 상자 무료 개봉권
}
// 구성 확정(제작자 2026-11-23: "패키지 구성 확정 좋아")
export const PACKAGES: PackageDef[] = [
  { productId: 'pkg_growth_1', name: '성장 지원 패키지', krw: 5_900, limit: 1, rubies: 500, gold: 20_000, dragonTickets: 3 },
  { productId: 'pkg_gear_1', name: '장비 강화 패키지', krw: 11_000, limit: 1, rubies: 300, equipTickets: 15 },
  { productId: 'pkg_rune_1', name: '룬 성장 패키지', krw: 11_000, limit: 1, rubies: 300, runeTickets: 15 },
];

/**
 * 일일·주간·월간 특혜(제작자 요청 2026-11-23: 참고 시안처럼 상점에 일일/주간/월간 특혜 탭).
 * 기간마다 limit회(KST 자정·월요일·1일 초기화). 가치 기준은 PACKAGES와 같음. 무료 일일 선물은 결제 없이 하루 1번.
 * 구성·가격 확정(제작자 2026-11-23: "이대로 확정").
 */
export const DEALS: PackageDef[] = [
  { productId: 'deal_daily_ruby', name: '일일 루비 꾸러미', krw: 1_200, limit: 1, period: 'daily', rubies: 150, gold: 10_000 },
  { productId: 'deal_daily_summon', name: '일일 소환 꾸러미', krw: 3_300, limit: 1, period: 'daily', rubies: 100, dragonTickets: 2 },
  { productId: 'deal_weekly_growth', name: '주간 성장 꾸러미', krw: 5_900, limit: 1, period: 'weekly', rubies: 600, gold: 30_000, equipTickets: 5 },
  { productId: 'deal_weekly_summon', name: '주간 소환 꾸러미', krw: 11_000, limit: 1, period: 'weekly', rubies: 500, dragonTickets: 5, runeTickets: 5 },
  { productId: 'deal_monthly_res', name: '월간 자원 상자', krw: 22_000, limit: 1, period: 'monthly', rubies: 2_500, gold: 100_000, equipTickets: 10, runeTickets: 10 },
  { productId: 'deal_monthly_summon', name: '월간 소환 상자', krw: 33_000, limit: 1, period: 'monthly', rubies: 1_500, dragonTickets: 15 },
];
/** 무료 일일 선물(결제 없음, 하루 1번) — 확정(2026-11-23) */
export const FREE_DAILY_GIFT = { gold: 1_000, rubies: 10 };
