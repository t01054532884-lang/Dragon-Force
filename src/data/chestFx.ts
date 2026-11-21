import { RARITIES, type Rarity } from './economy';
import type { BoxResult } from '../systems/Progress';

// 상자 개봉 연출(8단계 준비). 등급마다 다른 것은 아래 수치뿐이고, 연출 코드(src/ui/ChestOpening.ts)는 하나를 같이 쓴다.
// 보상은 연출 전에 Progress.openBox가 이미 확정·저장한다 → 연출을 건너뛰거나 화면을 나가도 보상이 사라지거나 두 번 들어가지 않는다.

export interface ChestTierFx {
  label: string;
  color: number; // 빛·파티클·테두리 색
  shakes: number; // 흔들림 횟수(많을수록 기대감)
  shakeMs: number; // 흔들림 한 번 시간
  particles: number; // 폭발 파티클 수
  rays: number; // 뒤에서 도는 빛줄기 수(0이면 없음)
  flash: boolean; // 화면 번쩍임
  camShake: number; // 화면 진동 세기(0이면 없음)
  ring: boolean; // 충격파 고리
  holdMs: number; // 빛 폭발 뒤 카드가 나오기까지
}

export const CHEST_FX: Record<Rarity, ChestTierFx> = {
  common: { label: '일반', color: 0xdfe6f5, shakes: 2, shakeMs: 160, particles: 18, rays: 0, flash: false, camShake: 0, ring: false, holdMs: 250 },
  rare: { label: '희귀', color: 0x4fc3f7, shakes: 3, shakeMs: 150, particles: 32, rays: 6, flash: false, camShake: 0.004, ring: false, holdMs: 350 },
  epic: { label: '영웅', color: 0xba68c8, shakes: 4, shakeMs: 140, particles: 48, rays: 10, flash: true, camShake: 0.008, ring: true, holdMs: 450 },
  legendary: { label: '전설', color: 0xffc83d, shakes: 6, shakeMs: 120, particles: 80, rays: 16, flash: true, camShake: 0.014, ring: true, holdMs: 700 },
};

/** 결과 한 개의 등급. 등급이 없는 것: 특수 스킬 조각은 희귀, 골드는 금액 순위(500/1000/2000/5000 → 일반~전설) */
export function resultTier(r: BoxResult): Rarity {
  switch (r.kind) {
    case 'essence':
    case 'card':
    case 'fragment':
      return r.rarity;
    case 'equipment':
      return r.item.rarity as Rarity;
    case 'special':
      // 룬 조각 묶음: 5개 일반 · 10개 희귀 · 20개 영웅 · 50개 전설
      return r.count >= 50 ? 'legendary' : r.count >= 20 ? 'epic' : r.count >= 10 ? 'rare' : 'common';
    case 'gold':
      return 'common';
  }
}

/** 연출 등급 = 결과 중 가장 높은 등급(10회 개봉도 최고 등급 하나로 연출) */
export function openingTier(results: BoxResult[]): Rarity {
  let best = 0;
  for (const r of results) best = Math.max(best, RARITIES.indexOf(resultTier(r)));
  return RARITIES[best];
}

/** 사운드 파일 키(public/sfx/에 넣으면 자동으로 씀, 없으면 짧은 합성음으로 대신) */
export const CHEST_SFX = {
  shake: 'sfx-chest-shake',
  open: 'sfx-chest-open',
  burst: (t: Rarity) => `sfx-chest-burst-${t}`,
  card: 'sfx-card-flip',
  cardRare: 'sfx-card-rare',
} as const;

/**
 * 상자 안쪽 빛(8단계 v2.0 그림): 등급 → 그림 키. 일반은 빛 그림 없이 코드 빛만.
 * 희귀 = 파랑, 영웅 = 보라, 전설 = 금.
 */
export const CHEST_INNER: Record<Rarity, string | null> = { common: null, rare: 'chest-inner-blue', epic: 'chest-inner-purple', legendary: 'chest-inner-gold' };

/**
 * 상자별 입구 높이(본체 그림 600×600 캔버스 기준 y). 빛 그림의 밑동(y≈485)을 이 높이에 맞춘다.
 * 기획자 상자 그림에서 잰 값(2026-11-19, 본체 윗면 가운데).
 */
export const CHEST_MOUTH_Y: Record<'dragon' | 'equipment' | 'rune', number> = { dragon: 268, equipment: 205, rune: 360 }; // rune: 4차 묶음 그림(본체 윗면 347)
export const INNER_BASE_Y = 485;
