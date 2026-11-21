// 화면 비율 맞추기(2026-11-22, App Store 제출 전 — 빈 띠·잘림 없이 기기 화면을 꽉 채운다).
// 설계 기준은 가로 720 × 세로 1280(9:16). 요즘 아이폰처럼 세로가 더 긴 화면이면 게임 높이를 늘리고(가로 720 고정),
// 기준 화면(720×1280)은 가운데에 둔다. 위·아래로 늘어난 자리는 배경이 채우고, 머리줄은 맨 위·하단 메뉴는 맨 아래에 붙인다.
// 가로가 더 넓은 화면(PC 브라우저)은 예전처럼 양옆에 띠(앱 출시 대상 아님).
import Phaser from 'phaser';

export const BASE_W = 720;
export const BASE_H = 1280;
/** 너무 긴 화면에서 그림이 지나치게 늘어나지 않게 상한(약 9:21) */
const MAX_H = 1700;

/** 게임 높이: 화면 비율에 맞춘 값(최소 1280) */
export function gameHeightFor(w: number, h: number): number {
  if (w <= 0 || h <= 0) return BASE_H;
  return Math.min(MAX_H, Math.max(BASE_H, Math.round((BASE_W * h) / w)));
}

/** 기준 화면 위·아래로 늘어난 높이(한쪽). 0이면 9:16 그대로 */
export function offY(scene: Phaser.Scene): number {
  return Math.max(0, (scene.scale.height - BASE_H) / 2);
}

/** 화면 전체 높이(덮개·배경용) */
export function fullH(scene: Phaser.Scene): number {
  return Math.max(BASE_H, scene.scale.height);
}

/** 메뉴 화면: 카메라를 올려 기준 화면(0~1280)이 가운데 오게 한다(전투 화면은 카메라가 드래곤을 따라가므로 제외) */
export function centerBase(scene: Phaser.Scene): void {
  scene.cameras.main.setScroll(0, -offY(scene));
}
