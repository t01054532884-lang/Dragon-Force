// 드래곤 한 판 능력치. 판을 시작할 때 BASE_STATS를 복사해 쓰고,
// 레벨업 카드(스킬·강화)가 이 값을 바꾼다.
export interface RunStats {
  maxHp: number;
  speed: number; // 이동 속도(초당 px)
  fireDamage: number; // 화염탄 한 발 피해
  fireInterval: number; // 화염탄 발사 간격(ms)
  fireRange: number; // 자동 조준 사거리(px)
  fireSpeed: number; // 화염탄 속도
  magnet: number; // 경험치 보석을 끌어당기는 거리(px)
  armor: number; // 받는 피해 감소 비율(0~0.6)
  fireMult: number; // 화염 계열(화염탄·브레스·메테오) 피해 배율
}

export const BASE_STATS: RunStats = {
  maxHp: 100,
  speed: 260,
  fireDamage: 10,
  fireInterval: 600,
  fireRange: 620,
  fireSpeed: 540,
  magnet: 110,
  armor: 0,
  fireMult: 1,
};

/** 다음 레벨까지 필요한 경험치. 초반엔 빨리, 갈수록 천천히 오른다. */
export function xpToNext(level: number): number {
  return 5 + level * 4 + Math.floor(level * level * 0.4);
}
