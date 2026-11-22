import { M } from './stats';
import type { BasicLevel, DragonId } from './dragons';

// 개발 6단계 v1.2 — 드래곤 영구 레벨 5레벨 단위 고유 성장 (기획 수정안 v1.2 2장 "5레벨 단위 고유 성장표")
// 효과 이름은 원문 그대로, 수치(확률·계수·반경)는 원문에 없어 모두 **임시 밸런스 수치(AI 1차안)**다.
// 영구 Lv.1~4에는 아무 효과가 없으므로 레드 1성 Lv.1의 기존 DPS·시드 재현은 그대로다.

/** 영구 성장이 기본 공격에 더하는 값(여러 단계가 쌓인 누적값) */
export interface PermState {
  dmg: number; // 기본 공격 피해 +x
  shots: number; // 한 공격 주기 탄환 +n (상한 PERM_RULES.maxShots, 초과분은 피해로 전환)
  status: number; // 상태이상 세기 +x(화상·중독 초당 피해, 둔화율, 감전 배율, 넉백)
  duration: number; // 상태이상 지속시간 +x(둔화·빙결·기절·중독)
  area: number; // 범위 +x(폭발·충격파·독구름·파도·연쇄 거리)
  pierce: number;
  chain: number;
  bounce: number; // 적중 후 근처 다른 적으로 튕김(레드)
  haste: number; // 공격 주기 −x
  move: number; // 이동속도 +x(윈드)
  guard: number; // 받는 피해 −x(스톤)
  homing: number; // 추적 회전 +x(아케인)
  chainRelief: number; // 연쇄 감소율 완화 +x(옐로)
  freezeAdd: number; // 빙결 확률 +x(없는 레벨에도 1초 빙결 부여)
  stunAdd: number; // 기절 확률 +x
  shockAdd: boolean; // 감전 부여(없는 레벨에도)
  stacks: number; // 중독 최대 중첩 +n
  healAdd: number; // 처치 회복 확률 +x(화이트)
  healAmt: number; // 회복량 +x
  executeAdd: number; // 처형 피해 +x(블랙)
  /** 기본 공격에 없으면 새로 붙고, 있으면 더 센 쪽을 쓰는 효과 */
  feature: Partial<Pick<BasicLevel, 'splash' | 'cloud' | 'split' | 'shardsOnKill' | 'wave' | 'spin' | 'poisonBurst' | 'freezeShards'>>;
  /** 최종 고유 공격: N번째 공격 주기마다 첫 적중 지점 폭발(전투 중 Lv.7 폭발과 별개) */
  blast?: NonNullable<BasicLevel['blast']>;
}

export const ZERO_PERM: PermState = {
  dmg: 0, shots: 0, status: 0, duration: 0, area: 0, pierce: 0, chain: 0, bounce: 0, haste: 0, move: 0, guard: 0, homing: 0,
  chainRelief: 0, freezeAdd: 0, stunAdd: 0, shockAdd: false, stacks: 0, healAdd: 0, healAmt: 0, executeAdd: 0, feature: {},
};

/** 임시 밸런스 수치: 탄환 상한·초과분 전환 비율·튕김 거리 */
export const PERM_RULES = {
  maxShots: 5, // 원문: "레드의 한 공격 주기 최대 탄환 수는 우선 5발" → 10종 공통 적용(AI 1차안)
  overflowRatio: 0.5, // 상한을 넘은 탄 1발 = 한 발 피해의 50%를 나머지 탄에 나눠 더함
  bounceRange: 3.5 * M,
  maxSlow: 0.8,
};

type Tier = { name: string; text: string; mod: Partial<PermState> };
const t = (name: string, text: string, mod: Partial<PermState>): Tier => ({ name, text, mod });
const blast = (every: number, radius: number, coef: number, color: number) => ({ every, radius: radius * M, coef, color, status: true });

/** 영구 Lv.5·10·15·20·25·30·35·40 효과(원문 이름 + 임시 수치) */
export const PERM_TIERS: Record<DragonId, Tier[]> = {
  red: [
    t('화염 피해↑', '기본 공격 피해 +10%', { dmg: 0.1 }),
    t('화염탄 +1', '한 번에 화염탄 +1발', { shots: 1 }),
    t('화상 강화', '화상 피해 +50%', { status: 0.5 }),
    t('1회 튕김', '맞힌 뒤 3.5m 안 다른 적에게 1회 튕김', { bounce: 1 }),
    t('범위↑', '폭발 범위 +20%', { area: 0.2 }),
    t('화염탄 +1', '화염탄 +1발(최대 5발)', { shots: 1 }),
    t('튕김 +1', '튕김 2회', { bounce: 1 }),
    t('화염 폭발', '4번째 공격마다 첫 적중 지점 2m 폭발(120%) + 화상', { blast: blast(4, 2, 1.2, 0xff6a00) }),
  ],
  blue: [
    t('둔화↑', '둔화 세기 +20%', { status: 0.2 }),
    t('얼음탄 +1', '얼음탄 +1발', { shots: 1 }),
    t('빙결 확률↑', '빙결 확률 +5%p(전 레벨에 1초 빙결)', { freezeAdd: 0.05 }),
    t('빙결 파편', '얼어붙는 순간 얼음 파편 3개(각 40%)', { feature: { freezeShards: { count: 3, coef: 0.4 } } }),
    t('범위↑', '폭발 범위 +20%', { area: 0.2 }),
    t('얼음탄 +1', '얼음탄 +1발', { shots: 1 }),
    t('빙결 시간↑', '둔화·빙결 시간 +30%', { duration: 0.3 }),
    t('빙결 폭발', '4번째 공격마다 2.2m 얼음 폭발(120%) + 둔화', { blast: blast(4, 2.2, 1.2, 0x9be7ff) }),
  ],
  yellow: [
    t('연쇄 피해↑', '연쇄 감소율 15% 더 완화', { chainRelief: 0.15 }),
    t('연쇄 +1', '연쇄 +1회', { chain: 1 }),
    t('감전 강화', '감전 배율 +50%', { status: 0.5 }),
    t('번개탄 +1', '번개탄 +1발', { shots: 1 }),
    t('연쇄 범위↑', '연쇄 거리 +25%', { area: 0.25 }),
    t('연쇄 +1', '연쇄 +1회', { chain: 1 }),
    t('감전 폭발', '모든 레벨에 감전 부여(받는 피해 +10%, 2초)', { shockAdd: true }),
    t('천둥 폭발', '4번째 공격마다 2.2m 번개 폭발(130%) + 감전', { blast: blast(4, 2.2, 1.3, 0xfff176) }),
  ],
  green: [
    t('독 피해↑', '중독 피해 +25%', { status: 0.25 }),
    t('독액탄 +1', '독액탄 +1발', { shots: 1 }),
    t('지속시간↑', '중독 시간 +30%', { duration: 0.3 }),
    t('독구름', '3번째 공격마다 1.5m 독구름(2.5초)', { feature: { cloud: { every: 3, radius: 1.5 * M, ms: 2500 } } }),
    t('중첩 한도↑', '중독 최대 중첩 +2', { stacks: 2 }),
    t('독액탄 +1', '독액탄 +1발', { shots: 1 }),
    t('독 확산', '중독된 적이 죽으면 1.8m 폭발(60%) + 전염', { feature: { poisonBurst: { radius: 1.8 * M, coef: 0.6 } } }),
    t('역병 폭발', '4번째 공격마다 2.2m 독 폭발(100%) + 중독', { blast: blast(4, 2.2, 1.0, 0x9c27b0) }),
  ],
  white: [
    t('회복 확률↑', '처치 회복 확률 +2%p', { healAdd: 0.02 }),
    t('빛탄 +1', '빛탄 +1발', { shots: 1 }),
    t('관통↑', '관통 +1', { pierce: 1 }),
    t('빛 파동', '맞힌 자리 1.2m 빛 파동(35%)', { feature: { splash: { radius: 1.2 * M, coef: 0.35 } } }),
    t('회복량↑', '처치 회복량 +50%', { healAmt: 0.5 }),
    t('빛탄 +1', '빛탄 +1발', { shots: 1 }),
    t('관통 강화', '관통 +2', { pierce: 2 }),
    t('신성 폭발', '4번째 공격마다 2.2m 빛 폭발(130%)', { blast: blast(4, 2.2, 1.3, 0xfff3c4) }),
  ],
  black: [
    t('관통 피해↑', '기본 공격 피해 +10%', { dmg: 0.1 }),
    t('암흑탄 +1', '암흑탄 +1발', { shots: 1 }),
    t('처형 피해↑', 'HP 30% 이하 적 추가 피해 +10%p', { executeAdd: 0.1 }),
    t('암흑 파편', '처치 시 암흑 파편 3개(각 40%)', { feature: { shardsOnKill: { count: 3, coef: 0.4 } } }),
    t('관통↑', '관통 +1', { pierce: 1 }),
    t('암흑탄 +1', '암흑탄 +1발', { shots: 1 }),
    t('파편 강화', '파편 4개(각 55%)', { feature: { shardsOnKill: { count: 4, coef: 0.55 } } }),
    t('암흑 폭발', '4번째 공격마다 2.4m 암흑 폭발(150%)', { blast: blast(4, 2.4, 1.5, 0x7e57c2) }),
  ],
  stone: [
    t('넉백↑', '넉백 +30%', { status: 0.3 }),
    t('바위탄 +1', '바위탄 +1발', { shots: 1 }),
    t('방어↑', '받는 피해 −5%', { guard: 0.05 }),
    t('충격파', '맞힌 자리 1.2m 충격파(40%)', { feature: { splash: { radius: 1.2 * M, coef: 0.4 } } }),
    t('기절 확률↑', '기절 확률 +6%p(전 레벨에 0.8초 기절)', { stunAdd: 0.06 }),
    t('바위탄 +1', '바위탄 +1발', { shots: 1 }),
    t('충격파 강화', '충격파 1.6m(60%) + 밀쳐냄', { feature: { splash: { radius: 1.6 * M, coef: 0.6, knock: 380 } } }),
    t('대지 폭발', '4번째 공격마다 2.4m 대지 폭발(120%) + 밀쳐냄', { blast: blast(4, 2.4, 1.2, 0xb08d57) }),
  ],
  wind: [
    t('연사↑', '공격 주기 −8%', { haste: 0.08 }),
    t('칼날 +1', '칼날 +1개', { shots: 1 }),
    t('이동속도↑', '이동속도 +5%', { move: 0.05 }),
    t('칼날 관통', '관통 +1', { pierce: 1 }),
    t('연사↑', '공격 주기 −8%', { haste: 0.08 }),
    t('칼날 +1', '칼날 +1개(최대 5개)', { shots: 1 }),
    t('회전 칼날', '드래곤 주위 회전 칼날 2개(40%)', { feature: { spin: { count: 2, radius: 1.5 * M, coef: 0.4, speed: 4.5 } } }),
    t('폭풍 칼날', '4번째 공격마다 2.2m 폭풍(110%)', { blast: blast(4, 2.2, 1.1, 0xb2fff0) }),
  ],
  water: [
    t('둔화↑', '둔화 세기 +20%', { status: 0.2 }),
    t('물탄 +1', '물탄 +1발', { shots: 1 }),
    t('충격파↑', '물보라·파도 범위 +20%', { area: 0.2 }),
    t('파도 생성', '5초마다 드래곤 주위 3m 파도(80%)', { feature: { wave: { every: 5000, radius: 3 * M, coef: 0.8 } } }),
    t('범위↑', '범위 +20%', { area: 0.2 }),
    t('물탄 +1', '물탄 +1발', { shots: 1 }),
    t('파도 강화', '4초마다 3.4m 파도(100%)', { feature: { wave: { every: 4000, radius: 3.4 * M, coef: 1.0 } } }),
    t('거대 해일', '4번째 공격마다 2.6m 해일(120%) + 둔화', { blast: blast(4, 2.6, 1.2, 0x4fc3f7) }),
  ],
  arcane: [
    t('추적력↑', '추적 회전 +50%', { homing: 0.5 }),
    t('마력탄 +1', '마력탄 +1발', { shots: 1 }),
    t('분열 확률↑', '적중 시 작은 마력탄 1개(30%)로 분열', { feature: { split: { count: 1, coef: 0.3, homing: 0 } } }),
    t('분열 탄환', '분열 2개(각 30%)', { feature: { split: { count: 2, coef: 0.3, homing: 0 } } }),
    t('마력 피해↑', '기본 공격 피해 +10%', { dmg: 0.1 }),
    t('마력탄 +1', '마력탄 +1발', { shots: 1 }),
    t('분열 강화', '분열 3개(각 35%)가 다른 적 추적', { feature: { split: { count: 3, coef: 0.35, homing: Math.PI * 3 } } }),
    t('마력 폭주', '4번째 공격마다 2.2m 마력 폭발(140%)', { blast: blast(4, 2.2, 1.4, 0xb693ff) }),
  ],
  // 신규 1묶음(2026-11-22, AI 1차안 — 기존 10종과 같은 크기의 단계)
  sand: [
    t('모래 피해↑', '기본 공격 피해 +10%', { dmg: 0.1 }),
    t('모래 +1발', '한 번에 모래 +1발', { shots: 1 }),
    t('약화 강화', '약화 세기 +50%', { status: 0.5 }),
    t('사막 피부', '받는 피해 −5%', { guard: 0.05 }),
    t('약화 지속↑', '약화 지속 +40%', { duration: 0.4 }),
    t('모래 파편', '맞힌 자리 1.2m 모래 파편(40%)', { feature: { splash: { radius: 1.2 * M, coef: 0.4 } } }),
    t('모래 피해↑', '기본 공격 피해 +15%', { dmg: 0.15 }),
    t('사막의 분노', '5번째 공격마다 2.4m 모래 폭발(160%) + 약화', { blast: blast(5, 2.4, 1.6, 0xd8b27a) }),
  ],
  steel: [
    t('원반 피해↑', '기본 공격 피해 +10%', { dmg: 0.1 }),
    t('원반 크기↑', '범위 +15%', { area: 0.15 }),
    t('강철 갑주', '받는 피해 −5%', { guard: 0.05 }),
    t('원반 +1', '원반 +1개', { shots: 1 }),
    t('빠른 손', '던지는 간격 −8%', { haste: 0.08 }),
    t('원반 피해↑', '기본 공격 피해 +15%', { dmg: 0.15 }),
    t('톱날 파편', '맞힌 자리 1.2m 파편(35%)', { feature: { splash: { radius: 1.2 * M, coef: 0.35 } } }),
    t('강철 폭풍', '4번째 공격마다 2.2m 강철 폭발(150%)', { blast: blast(4, 2.2, 1.5, 0xc9d0d6) }),
  ],
  bloom: [
    t('덩굴 피해↑', '기본 공격 피해 +10%', { dmg: 0.1 }),
    t('속박 지속↑', '속박 지속 +30%', { duration: 0.3 }),
    t('씨앗 +1', '씨앗 +1개', { shots: 1 }),
    t('넓은 덩굴', '폭발 범위 +20%', { area: 0.2 }),
    t('꽃의 생기', '받는 피해 −5%', { guard: 0.05 }),
    t('덩굴 피해↑', '기본 공격 피해 +15%', { dmg: 0.15 }),
    t('빠른 성장', '씨앗 간격 −8%', { haste: 0.08 }),
    t('만개', '4번째 공격마다 2.4m 꽃 폭발(150%) + 속박', { blast: blast(4, 2.4, 1.5, 0xf48fb1) }),
  ],
  // 신규 2묶음(2026-11-22, AI 1차안)
  howl: [
    t('음파 피해↑', '기본 공격 피해 +10%', { dmg: 0.1 }),
    t('넓은 고리', '고리 범위 +15%', { area: 0.15 }),
    t('빠른 울림', '고리 간격 −8%', { haste: 0.08 }),
    t('산바람 몸', '받는 피해 −5%', { guard: 0.05 }),
    t('음파 피해↑', '기본 공격 피해 +15%', { dmg: 0.15 }),
    t('기절 확률', '고리에 맞은 적 6% 확률 0.8초 기절', { stunAdd: 0.06 }),
    t('넓은 고리', '고리 범위 +15%', { area: 0.15 }),
    t('포효 폭발', '4번째 공격마다 2.6m 음파 폭발(140%)', { blast: blast(4, 2.6, 1.4, 0x8fa8ff) }),
  ],
  crimson: [
    t('베기 피해↑', '기본 공격 피해 +10%', { dmg: 0.1 }),
    t('넓은 베기', '베기 범위 +12%', { area: 0.12 }),
    t('흡수 강화', '받는 피해 −5%', { guard: 0.05 }),
    t('빠른 낫', '베기 간격 −8%', { haste: 0.08 }),
    t('베기 피해↑', '기본 공격 피해 +15%', { dmg: 0.15 }),
    t('넓은 베기', '베기 범위 +12%', { area: 0.12 }),
    t('붉은 달', '받는 피해 −5%', { guard: 0.05 }),
    t('진홍 폭발', '4번째 공격마다 2.4m 진홍 폭발(160%)', { blast: blast(4, 2.4, 1.6, 0xc2185b) }),
  ],
  mirror: [
    t('광탄 피해↑', '기본 공격 피해 +10%', { dmg: 0.1 }),
    t('튕김 +1', '튕김 +1번', { bounce: 1 }),
    t('빠른 반사', '공격 간격 −8%', { haste: 0.08 }),
    t('광탄 +1', '광탄 +1발', { shots: 1 }),
    t('광탄 피해↑', '기본 공격 피해 +15%', { dmg: 0.15 }),
    t('튕김 +1', '튕김 +1번', { bounce: 1 }),
    t('관통', '관통 1회', { pierce: 1 }),
    t('만화경 폭발', '4번째 공격마다 2.2m 빛 폭발(150%)', { blast: blast(4, 2.2, 1.5, 0x9be7ff) }),
  ],
  // 신규 3묶음(전설, 2026-11-22 AI 1차안)
  chrono: [
    t('화살 피해↑', '기본 공격 피해 +10%', { dmg: 0.1 }),
    t('화살 +1', '화살 +1발', { shots: 1 }),
    t('빠른 시침', '쏘는 간격 −8%', { haste: 0.08 }),
    t('관통 +1', '관통 +1회', { pierce: 1 }),
    t('화살 피해↑', '기본 공격 피해 +15%', { dmg: 0.15 }),
    t('톱니 갑주', '받는 피해 −5%', { guard: 0.05 }),
    t('빠른 시침', '쏘는 간격 −8%', { haste: 0.08 }),
    t('시간 폭발', '4번째 공격마다 2.2m 시간 폭발(140%)', { blast: blast(4, 2.2, 1.4, 0xe0a14a) }),
  ],
  void: [
    t('구슬 피해↑', '기본 공격 피해 +10%', { dmg: 0.1 }),
    t('관통 +1', '관통 +1회', { pierce: 1 }),
    t('넓은 파편', '범위 +15%', { area: 0.15 }),
    t('공허 갑주', '받는 피해 −5%', { guard: 0.05 }),
    t('구슬 피해↑', '기본 공격 피해 +15%', { dmg: 0.15 }),
    t('구슬 +1', '구슬 +1개', { shots: 1 }),
    t('넓은 파편', '범위 +15%', { area: 0.15 }),
    t('사건의 지평선', '4번째 공격마다 2.6m 중력 폭발(160%)', { blast: blast(4, 2.6, 1.6, 0x7c4dff) }),
  ],
  aurora: [
    t('빛살 피해↑', '기본 공격 피해 +10%', { dmg: 0.1 }),
    t('빛살 +1', '빛살 +1발', { shots: 1 }),
    t('추적 강화', '추적 회전 +30%', { homing: 0.3 }),
    t('극광 몸', '받는 피해 −5%', { guard: 0.05 }),
    t('빛살 피해↑', '기본 공격 피해 +15%', { dmg: 0.15 }),
    t('관통 +1', '관통 +1회', { pierce: 1 }),
    t('빠른 빛', '쏘는 간격 −8%', { haste: 0.08 }),
    t('극광 폭발', '4번째 공격마다 2.4m 극광 폭발(150%)', { blast: blast(4, 2.4, 1.5, 0x7cf2c4) }),
  ],
};

export const PERM_TIER_LEVELS = [5, 10, 15, 20, 25, 30, 35, 40];

/** 영구 레벨까지 열린 단계를 차례로 쌓는다. 숫자는 더하고, 효과(feature)는 뒤 단계가 앞 단계를 덮는다. */
export function permState(id: DragonId, level: number): PermState {
  const s: PermState = { ...ZERO_PERM, feature: {} };
  PERM_TIERS[id].forEach((tier, i) => {
    if (level < PERM_TIER_LEVELS[i]) return;
    for (const [k, v] of Object.entries(tier.mod) as [keyof PermState, unknown][]) {
      if (k === 'feature') s.feature = { ...s.feature, ...(v as PermState['feature']) };
      else if (k === 'blast') s.blast = v as PermState['blast'];
      else if (k === 'shockAdd') s.shockAdd = s.shockAdd || (v as boolean);
      else (s as unknown as Record<string, number>)[k] += v as number;
    }
  });
  return s;
}

/** 열린 고유 성장 단계 수(0~8). 화면 표시용 */
export const permTiersReached = (level: number) => PERM_TIER_LEVELS.filter((l) => level >= l).length;

const stronger = <T extends { coef: number; count?: number }>(a: T | undefined, b: T | undefined): T | undefined => {
  if (!a) return b;
  if (!b) return a;
  return b.coef * (b.count ?? 1) > a.coef * (a.count ?? 1) ? b : a;
};

/**
 * 전투 중 기본 공격 레벨(Lv.1~7)에 영구 성장을 덧입힌 실제 값.
 * 적용 순서(결정적): 탄환 추가 → 상한(5발) → 초과분 피해 전환 → 관통 → 튕김 → 연쇄.
 * 영구 효과가 없으면 입력과 같은 값을 돌려준다(레드 기존 DPS 보존).
 */
export function applyPerm(L: BasicLevel, P: PermState): BasicLevel {
  if (P === ZERO_PERM) return L;
  const want = L.shots + P.shots;
  const shots = Math.min(PERM_RULES.maxShots, want);
  const excess = want - shots;
  const overflow = excess > 0 ? (shots + PERM_RULES.overflowRatio * excess) / shots : 1;
  const st = 1 + P.status;
  const du = 1 + P.duration;
  const out: BasicLevel = {
    ...L,
    shots,
    levelMod: L.levelMod * (1 + P.dmg) * overflow,
    interval: L.interval * (1 - P.haste),
    homing: L.homing > 0 ? L.homing * (1 + P.homing) : L.homing,
    pierce: L.pierce + P.pierce,
    chain: L.chain + P.chain,
    bounce: (L.bounce ?? 0) + P.bounce,
    burnMult: (L.burnMult ?? 1) * (L.burn ? st : 1),
  };
  if (L.slow) out.slow = { ratio: Math.min(PERM_RULES.maxSlow, L.slow.ratio * st), ms: L.slow.ms * du };
  if (L.weaken) out.weaken = { ratio: Math.min(0.5, L.weaken.ratio * st), ms: L.weaken.ms * du };
  if (L.root) out.root = L.root * du;
  if (L.poison) out.poison = { perSec: L.poison.perSec * st, ms: L.poison.ms * du, maxStacks: L.poison.maxStacks + P.stacks };
  if (L.shock || P.shockAdd) {
    const base = L.shock ?? { mult: 1.1, ms: 2000 };
    out.shock = { mult: 1 + (base.mult - 1) * st, ms: base.ms };
  }
  if (L.knock) out.knock = { speed: L.knock.speed * st, ms: L.knock.ms };
  if (L.freeze || P.freezeAdd > 0) {
    const base = L.freeze ?? { chance: 0, ms: 1000 };
    out.freeze = { ...base, chance: base.chance + P.freezeAdd, ms: base.ms * du };
  }
  if (L.stun || P.stunAdd > 0) {
    const base = L.stun ?? { chance: 0, ms: 800 };
    out.stun = { chance: base.chance + P.stunAdd, ms: base.ms * du };
  }
  const f = P.feature;
  out.splash = stronger(L.splash, f.splash);
  out.split = stronger(L.split, f.split);
  out.shardsOnKill = stronger(L.shardsOnKill, f.shardsOnKill);
  out.poisonBurst = stronger(L.poisonBurst, f.poisonBurst);
  out.wave = stronger(L.wave, f.wave);
  out.spin = stronger(L.spin, f.spin);
  out.freezeShards = stronger(L.freezeShards, f.freezeShards);
  out.cloud = L.cloud ?? f.cloud;
  if (P.blast) out.blast = P.blast;
  out.areaBonus = P.area;
  return out;
}
