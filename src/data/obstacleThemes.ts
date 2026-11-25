import { M } from './stats';

/**
 * 단계별 장애물 테마·기믹(제작자 요청 2026-11-25).
 * - "로비 맵 컨셉에 맞게, 얼음 맵엔 얼음 동상이 있고 5초마다 고드름이 나간다던가"
 * - "장애물은 1~20단계 모두, 맵마다 구성이 다르게. 1~10단계는 장애물만, 11단계부터는 가까이 가면 피해(이펙트) +
 *    맵 특성에 맞는 방해 요소(고드름·랜덤 위치 거미줄 등)"
 * 배치는 src/data/arenas.ts STAGE_ARENAS(같은 단계 번호).
 * - pillar / rock: 둥근 장애물·길쭉한 장애물의 이름(그림 `obstacle-<pillar|rock>-s<단계>` 프롬프트에도 씀)
 * - aura(11~20단계): 장애물에 닿을 만큼 가까이 있으면 1초마다 피해, 장애물 둘레에 테마 색 빛
 *   (기본 5~7 × 단계 피해 배율 — 처음 7~10은 13단계 Lv.1 드래곤이 8초 붙어 있으면 쓰러져 30% 낮춤)
 * - hazard(11~20단계): 맵마다 다른 방해 요소. 드래곤이 range 안일 때만, 0.8~1초 예고 뒤 발동. 피해는 단계 피해 배율을 곱한다.
 *   shot = 동상이 탄을 쏨 · pulse = 둘레로 파동 · line = 직선 찌르기/광선 · zones = 드래곤 근처 랜덤 위치에 장판(둔화·폭발)
 * 수치는 AI 1차안(임시) — 사람 플레이로 조정. 자동 측정(2026-11-25, 봇 공 ×4·HP ×8)에서 기믹 켜면 10단계 중 4개만 클리어
 *   → 방해 요소 피해 ×0.75, 차례마다 가장 가까운 장애물 하나만, 근접 피해는 둥근 장애물만. 전투 시작 안내는 넣지 않음(제작자: 말 안 해야 더 재밌음).
 */
export type ObstacleHazard =
  | { kind: 'shot'; every: number; count: number; spread: number; radial?: boolean; homing?: boolean; speed: number; damage: number; slow?: number; color: number; size: number }
  | { kind: 'pulse'; every: number; r: number; damage: number; slow?: number; color: number }
  | { kind: 'line'; every: number; length: number; width: number; damage: number; color: number }
  | {
      kind: 'zones';
      every: number;
      /** 장판 수 · 반지름 · 드래곤 둘레 어디까지 흩뿌리나 */
      count: number;
      r: number;
      scatter: number;
      /** slow = 남는 둔화 장판(거미줄·눈더미), burst = 예고 뒤 폭발 */
      effect: 'slow' | 'burst';
      slow?: number;
      lastMs?: number;
      damage?: number;
      color: number;
    };

export interface ObstacleTheme {
  pillar?: string;
  rock?: string;
  aura?: { damage: number; color: number };
  hazard?: ObstacleHazard;
  /** 전투 시작 안내 한 줄 */
  note?: string;
}

/** 드래곤이 이 거리 안에 있을 때만 장애물이 공격한다(멀리서 화면 밖 공격 없음) */
export const HAZARD_RANGE = 11 * M;
/** 공격 전 예고(장애물이 빛나는 시간) */
export const HAZARD_WARN_MS = 800;
/** 가까이 가면 피해: 장애물 가장자리에서 이 거리 안(드래곤 몸 반지름 포함) · 간격 */
export const AURA_PAD = 0.8 * M;
export const AURA_EVERY_MS = 1000;
/** 기믹이 켜지는 단계(제작자: 1~10단계는 장애물만) */
export const HAZARD_FROM_STAGE = 11;

export const OBSTACLE_THEMES: Record<number, ObstacleTheme> = {
  // ── 1~10단계: 장애물만(막기만 함) ──
  1: { pillar: '불에 그을린 마른 고목 그루터기' },
  2: { pillar: '독가시 덤불', rock: '가시덩굴이 엉킨 낮은 덤불 울타리' },
  3: { pillar: '사냥꾼의 녹슨 덫이 걸린 나무 토템' },
  4: { pillar: '빛나는 거대 버섯', rock: '쓰러진 고목 둥치' },
  5: { pillar: '불타는 쇠 화로 기둥' },
  6: { pillar: '병영의 깃발 무기 거치대' },
  7: { rock: '쇳물이 흐르는 용광로 벽' },
  8: { pillar: '그을린 성벽 망루' },
  9: { pillar: '얼어붙은 바위', rock: '눈 덮인 얼음 능선' },
  10: { pillar: '빛나는 수정 군락' },
  // ── 11~20단계: 가까이 가면 피해 + 맵마다 다른 방해 요소 ──
  11: {
    pillar: '눈보라를 뿜는 얼어붙은 토템',
    aura: { damage: 5, color: 0xb3e5fc },
    hazard: { kind: 'zones', every: 6000, count: 2, r: 1.6 * M, scatter: 3 * M, effect: 'slow', slow: 0.4, lastMs: 3500, color: 0xe1f5fe },
    note: '토템 근처는 동상 피해 · 6초마다 발밑에 눈더미(둔화)',
  },
  12: {
    pillar: '얼음 동상',
    rock: '얼음 결정 벽',
    aura: { damage: 5, color: 0x80deea },
    hazard: { kind: 'shot', every: 5000, count: 1, spread: 0, speed: 380, damage: 8, slow: 0.35, color: 0x80deea, size: 1.6 },
    note: '얼음 동상이 5초마다 고드름(둔화)',
  },
  13: {
    pillar: '유령 가로등',
    aura: { damage: 6, color: 0x80d8ff },
    hazard: { kind: 'pulse', every: 6000, r: 2.2 * M, damage: 9, color: 0x80d8ff },
    note: '가로등이 6초마다 영혼 파동',
  },
  14: {
    pillar: '거미줄에 덮인 가고일 석상',
    aura: { damage: 6, color: 0xb388ff },
    hazard: { kind: 'zones', every: 6000, count: 3, r: 1.3 * M, scatter: 3.5 * M, effect: 'slow', slow: 0.5, lastMs: 4000, color: 0xeeeeee },
    note: '가고일이 6초마다 랜덤 위치에 거미줄(둔화)',
  },
  15: {
    pillar: '창을 든 흑기사 석상',
    aura: { damage: 6, color: 0xff5252 },
    hazard: { kind: 'line', every: 7000, length: 10 * M, width: 1.1 * M, damage: 8, color: 0xff1744 }, // 자동 측정: 11·6초면 봇이 109초에 쓰러짐
    note: '흑기사 석상이 6초마다 창 찌르기(직선)',
  },
  16: {
    pillar: '저주받은 왕의 석상',
    rock: '무너진 왕궁 벽',
    aura: { damage: 6, color: 0xea80fc },
    hazard: { kind: 'zones', every: 6000, count: 3, r: 1.5 * M, scatter: 3 * M, effect: 'burst', damage: 11, color: 0xd500f9 },
    note: '석상이 6초마다 발밑에 저주 폭발 3곳',
  },
  17: {
    pillar: '태양 거울 기둥',
    rock: '황금 부조 석벽',
    aura: { damage: 6, color: 0xffd54f },
    hazard: { kind: 'line', every: 5000, length: 13 * M, width: 0.8 * M, damage: 10, color: 0xffd54f },
    note: '태양 거울이 5초마다 빛줄기(직선)',
  },
  18: {
    pillar: '별의 오벨리스크',
    aura: { damage: 6, color: 0xfff59d },
    hazard: { kind: 'shot', every: 6000, count: 6, spread: 0, radial: true, speed: 300, damage: 8, color: 0xfff59d, size: 1.3 },
    note: '오벨리스크가 6초마다 별빛 6방향',
  },
  19: {
    pillar: '불을 머금은 용 석상',
    aura: { damage: 7, color: 0xff7043 },
    hazard: { kind: 'shot', every: 6000, count: 1, spread: 0, speed: 420, damage: 8, color: 0xff7043, size: 1.8 }, // 자동 측정: 11·5초면 봇 피해 849
    note: '용 석상이 5초마다 화염구',
  },
  20: {
    pillar: '빛나는 봉인 기둥',
    aura: { damage: 7, color: 0xffe082 },
    hazard: { kind: 'shot', every: 7000, count: 1, spread: 0, homing: true, speed: 190, damage: 8, color: 0xffe082, size: 1 },
    note: '봉인 기둥이 7초마다 따라오는 봉인 구슬',
  },
};

export const obstacleTheme = (stageId: number): ObstacleTheme => OBSTACLE_THEMES[((stageId - 1) % 20) + 1] ?? {};
