import Phaser from 'phaser';
import { COLOR } from './theme';
import { text } from './kit';

// 선물함 알림 효과(8단계 v2.0 0.2): 미수령 숫자 배지 + 약한 숨쉬는 빛 + 새 선물이 왔을 때만 금빛 별 1회 확산.
// "본 선물" 목록은 게임 전체 기록(registry)에 둬서 화면을 다시 열어도 같은 선물로 별이 또 터지지 않는다.
const SEEN = 'gift-seen-ids';

const seen = (scene: Phaser.Scene): Set<string> => {
  let s = scene.registry.get(SEEN) as Set<string> | undefined;
  if (!s) {
    s = new Set();
    scene.registry.set(SEEN, s);
  }
  return s;
};

/** 선물함 화면을 열면 지금 있는 선물은 모두 '본 것'으로 */
export function markGiftsSeen(scene: Phaser.Scene, ids: string[]): void {
  const s = seen(scene);
  ids.forEach((id) => s.add(id));
}

/**
 * 아이콘(가운데 x,y · 크기 size) 위에 붙이는 알림. ids = 받지 않은 선물 id(오래된 순).
 * 0개면 아무것도 그리지 않는다(빛·별·숫자 모두 없음). 반복 효과는 tween 하나만 쓰고 매 프레임 새로 만들지 않는다.
 */
export function giftAlert(scene: Phaser.Scene, x: number, y: number, size: number, ids: string[]): Phaser.GameObjects.Container | null {
  if (!ids.length) return null;
  const root = scene.add.container(x, y).setDepth(20);
  // 외곽 빛: 2.7초 주기로 약하게 밝아짐(아이콘 뒤가 아니라 테두리 쪽만)
  const halo = scene.add.circle(0, 0, size * 0.62, COLOR.gold, 0.0).setStrokeStyle(6, COLOR.gold, 0.55);
  scene.tweens.add({ targets: halo, alpha: { from: 0.25, to: 0.9 }, duration: 1350, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  // 위쪽 작은 빛(별 하나)
  const spark = star(scene, -size * 0.18, -size * 0.52, 9, 0xfff3b0);
  scene.tweens.add({ targets: spark, scale: { from: 0.7, to: 1.15 }, alpha: { from: 0.55, to: 1 }, duration: 1350, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  // 숫자 배지
  const n = ids.length;
  const badge = scene.add.circle(size * 0.4, -size * 0.4, 18, COLOR.alert).setStrokeStyle(3, COLOR.outline);
  const num = text(scene, size * 0.4, -size * 0.4, n > 99 ? '99+' : String(n), n > 9 ? 15 : 20, COLOR.text, true, true).setOrigin(0.5);
  root.add([halo, spark, badge, num]);

  // 새로 온 선물(처음 보는 id)이 있으면 금빛 별 4개가 600ms 동안 한 번 퍼짐
  const s = seen(scene);
  const fresh = ids.filter((id) => !s.has(id));
  if (fresh.length) {
    fresh.forEach((id) => s.add(id));
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + (i - 1.5) * 0.55;
      const st = star(scene, 0, -size * 0.3, 7, COLOR.gold);
      root.add(st);
      scene.tweens.add({
        targets: st, x: Math.cos(a) * size * 0.7, y: -size * 0.3 + Math.sin(a) * size * 0.6, alpha: 0, scale: 1.4,
        duration: 600, ease: 'Cubic.Out', onComplete: () => st.destroy(),
      });
    }
  }
  return root;
}

function star(scene: Phaser.Scene, x: number, y: number, r: number, color: number) {
  return scene.add.star(x, y, 4, r * 0.4, r, color).setStrokeStyle(2, COLOR.outline, 0.6);
}
