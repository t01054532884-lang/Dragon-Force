// 화면 비율 맞추기(2026-11-22, App Store 제출 전 — 빈 띠·잘림 없이 기기 화면을 꽉 채운다).
// 설계 기준은 가로 720 × 세로 1280(9:16). 요즘 아이폰처럼 세로가 더 긴 화면이면 게임 높이를 늘리고(가로 720 고정),
// 기준 화면(720×1280)은 가운데에 둔다. 위·아래로 늘어난 자리는 배경이 채우고, 머리줄은 맨 위·하단 메뉴는 맨 아래에 붙인다.
// 가로가 더 넓은 화면(PC 브라우저)은 예전처럼 양옆에 띠(앱 출시 대상 아님).
// (2026-11-24) 게임 화면은 홈 바 밑까지 늘어난다(src/platform applyInsets). 그 여분(safeBottom)은 '기준 화면 바깥 아래'로 따로 두고,
// offY는 홈 바 위까지(안전 영역)만으로 계산한다 → 버튼·창 위치는 예전과 같고, 배경·하단 메뉴 바탕만 화면 끝까지 칠해진다.
import Phaser from 'phaser';
import { extendedBottomPx } from '../platform';

export const BASE_W = 720;
export const BASE_H = 1280;
/** 너무 긴 화면에서 그림이 지나치게 늘어나지 않게 상한(약 9:21) */
const MAX_H = 1700;

/** 게임 높이: 화면 비율에 맞춘 값(최소 1280) */
export function gameHeightFor(w: number, h: number): number {
  if (w <= 0 || h <= 0) return BASE_H;
  return Math.min(MAX_H, Math.max(BASE_H, Math.round((BASE_W * h) / w)));
}

/** 홈 바 밑으로 늘어난 높이(게임 좌표). 버튼은 이 위에 두고, 바탕만 이 자리까지 칠한다. 웹 PC·토스는 0 */
export function safeBottom(scene: Phaser.Scene): number {
  const px = extendedBottomPx();
  if (px <= 0) return 0;
  const w = (typeof document !== 'undefined' && document.getElementById('game')?.clientWidth) || scene.scale.displaySize.width || BASE_W;
  return Math.round((px * scene.scale.width) / w);
}

/** 기준 화면 위·아래로 늘어난 높이(한쪽, 홈 바 밑 여분 제외). 0이면 9:16 그대로 */
export function offY(scene: Phaser.Scene): number {
  return Math.max(0, (scene.scale.height - safeBottom(scene) - BASE_H) / 2);
}

/** 화면 전체 높이(덮개·배경용). y=640 가운데로 그려도 홈 바 밑까지 덮이게 여분만큼 더 크게 */
export function fullH(scene: Phaser.Scene): number {
  return Math.max(BASE_H, scene.scale.height) + safeBottom(scene);
}

/** 메뉴 화면: 카메라를 올려 기준 화면(0~1280)이 가운데 오게 한다(전투 화면은 카메라가 드래곤을 따라가므로 제외) */
export function centerBase(scene: Phaser.Scene): void {
  scene.cameras.main.setScroll(0, -offY(scene));
}
