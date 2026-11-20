// 기획서 단위(m)를 화면 픽셀로 바꾸는 값. 기획서 v0.2 "좌표 단위 확정" 항목에 대한 결정: 1m = 50px.
export const M = 50;

// 드래곤 한 판 능력치. 판을 시작할 때 BASE_STATS를 복사해 쓰고, 레벨업 카드가 이 값을 바꾼다.
// 5단계 영구 성장은 이 기본값을 올리는 방식이 된다.
export interface RunStats {
  attack: number; // 공격력. 모든 피해 = 공격력 × 계수 × … (기획서 v0.2 피해 계산 순서)
  maxHp: number;
  speed: number; // 이동 속도(초당 px)
  magnet: number; // 경험치 보석을 끌어당기는 거리(px)
  damageTaken: number; // 받는 피해 배율(용의 비늘이 낮춤, 최소 0.8)
  skillDamageMult: number; // 마력 증폭: 액티브 스킬 피해 배율(기본공격 제외)
  cooldownMult: number; // 고대의 시계: 액티브 재사용 대기시간 배율(기본공격 제외)
  areaMult: number; // 마력 확장: 범위 배율(액티브 + 범위형 기본공격)
  critChance: number; // 용의 눈: 치명타 확률(기본공격·액티브의 직접 피해)
  critMult: number; // 치명타 배율(기획서 v0.2: 1.5)
  xpMult: number; // 탐욕의 보석: 경험치 획득 배율
}

export const BASE_STATS: RunStats = {
  attack: 10, // 기획서 계산 예시(공격력 100)의 1/10 스케일. 적 체력도 같은 스케일.
  maxHp: 100,
  speed: 260,
  magnet: 110,
  damageTaken: 1,
  skillDamageMult: 1,
  cooldownMult: 1,
  areaMult: 1,
  critChance: 0,
  critMult: 1.5,
  xpMult: 1,
};

/**
 * 다음 레벨까지 필요한 경험치. 초반엔 빨리, 갈수록 천천히 오른다.
 * 2026-11-20: 첫 1분 성장 체감 — Lv.1→2 9 → 8, Lv.2→3 14 → 11, Lv.3→4 20 → 17(첫 성장 20~30초, 다음 성장 1분 안). 그 뒤는 같은 공식.
 */
export const EARLY_XP = [8, 11, 17];
export function xpToNext(level: number): number {
  if (level >= 1 && level <= EARLY_XP.length) return EARLY_XP[level - 1];
  return 5 + level * 4 + Math.floor(level * level * 0.4);
}
