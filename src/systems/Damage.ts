import type { RunStats } from '../data/stats';

// 기획서 v0.2 피해 계산 순서:
// 최종 피해 = 공격력 × 계수 × 레벨 배율 × 같은 묶음 배율 × 치명타 × 속성(지금은 1.0) × 방어(지금은 1.0)
// 반올림은 모든 배율을 곱한 뒤 소수 첫째 자리에서.
export type DamageSource = 'basic' | 'active' | 'dot';

export interface HitSpec {
  source: DamageSource;
  coef: number;
  levelMod?: number;
  sameVolley?: number;
  /** 전투 로그용 공격 원천 이름(예: 'basic', 'breath', 'burn') */
  tag?: string;
}

export interface HitResult {
  amount: number;
  crit: boolean;
}

export function resolveDamage(stats: RunStats, hit: HitSpec): HitResult {
  let d = stats.attack * hit.coef * (hit.levelMod ?? 1) * (hit.sameVolley ?? 1);
  // 마력 증폭은 액티브에만(기본공격 DPS 폭주 방지 — 기획서 13쪽)
  if (hit.source === 'active') d *= stats.skillDamageMult;
  // 상태이상 지속 피해(화상 등)는 치명타 불가
  const crit = hit.source !== 'dot' && Math.random() < stats.critChance;
  if (crit) d *= stats.critMult;
  return { amount: Math.round(d * 10) / 10, crit };
}
