import { M } from './stats';

/**
 * 기본 공격이 일반 몹에게 주는 피해 배율(테스터 피드백 2026-11-24: 스킬에 비해 평타가 약해 일반 몹이 2~3대·무거운 몹은 3~5대).
 * 모든 드래곤 공통, 일반 몹에게만(엘리트·보스·화상 같은 지속 피해는 그대로 → 보스 처치 시간 유지).
 * ×1.5면 권장 전투력 기준 가벼운 몹 1~2대, 무거운 몹 2~3대.
 */
export const BASIC_VS_NORMAL_MULT = 1.5;

// 레드 드래곤 고유 기본공격 "추적 화염탄" (기획서 v0.2 6쪽).
// 전투마다 Lv.1에서 시작해 기본공격 카드로 Lv.7까지 오른다. 액티브 6·패시브 4 슬롯을 차지하지 않는다.
export interface BasicLevel {
  shots: number; // 한 번에 쏘는 발 수
  coef: number; // 한 발 피해 계수(1.0 = 공격력 100%)
  levelMod: number; // 레벨 강화 배율(Lv.2의 +20%가 이후 레벨에도 곱해짐 — 기획서 21쪽 표의 해석)
  interval: number; // 발사 간격(ms)
  burn: boolean; // Lv.6 화상 부여
  explodeEvery: number; // Lv.7: N번째 발사마다 폭발(0이면 없음)
  text: string; // 카드 설명
}

export const RED_BASIC = {
  name: '추적 화염탄',
  icon: '🔴',
  range: 12 * M, // 사거리 12m
  speed: 540, // 탄속(px/초)
  turnRate: Math.PI * 2, // 추적 회전 속도: 초당 360° (기획서에 값이 없어 정함)
  retarget: 3 * M, // 대상이 죽으면 반경 3m 안에서 새 대상을 찾는다
  life: 2000, // 탄 최대 비행 시간(ms)
  sameVolley: 0.5, // 같은 발사 묶음이 같은 적을 다시 맞히면 50%
  // 화상: 초당 공격력 20%, 3초, 최대 3중첩. 발사 묶음 하나는 같은 적에게 1중첩만(묶음 3발이 한 번에 3중첩을 만들지 않게).
  // 화염 브레스 Lv.5 화상과 같은 상태를 써서 최대 3중첩을 공유한다.
  burn: { perSec: 0.2, ms: 3000, maxStacks: 3 },
  explosion: { radius: 2.2 * M, coef: 1.6 }, // Lv.7 지옥 화염탄 폭발: 5번째 발사 묶음마다 1회, Lv.2 배율(1.2) 미적용
  levels: [
    { shots: 1, coef: 1.0, levelMod: 1.0, interval: 1200, burn: false, explodeEvery: 0, text: '가장 가까운 적에게 추적 화염탄 1발' },
    { shots: 1, coef: 1.0, levelMod: 1.2, interval: 1200, burn: false, explodeEvery: 0, text: '기본공격 피해 +20%' },
    { shots: 2, coef: 0.75, levelMod: 1.2, interval: 1200, burn: false, explodeEvery: 0, text: '2발 동시 발사(각 75%), 서로 다른 적 우선' },
    { shots: 2, coef: 0.75, levelMod: 1.2, interval: 1020, burn: false, explodeEvery: 0, text: '발사 간격 −15% (1.02초)' },
    { shots: 3, coef: 0.65, levelMod: 1.2, interval: 1020, burn: false, explodeEvery: 0, text: '3발 동시 발사(각 65%)' },
    { shots: 3, coef: 0.65, levelMod: 1.2, interval: 1020, burn: true, explodeEvery: 0, text: '화상 부여: 초당 공격력 20%, 3초, 최대 3중첩' },
    { shots: 3, coef: 0.65, levelMod: 1.2, interval: 1020, burn: true, explodeEvery: 5, text: '진화 — 지옥 화염탄: 5번째 발사마다 반경 2.2m 폭발(160%)' },
  ] as BasicLevel[],
};
