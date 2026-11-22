import Phaser from 'phaser';
import { CONTENT } from './screen';
import { offY } from './layout';

/**
 * 세로 스크롤 판(상점·패스가 같이 씀, 2026-11-23): before 이후에 만든 내용물을 한 판에 모아 끌기·휠로 위아래.
 * 위는 리본 아래, 아래는 하단 탭 위에서 잘린다(Phaser 4 필터 마스크). 끌었으면 그 손가락 떼기로는 버튼이 눌리지 않게
 * 버튼의 pointerup 앞에 검사를 끼운다. blocked()가 참이면(팝업·연출 중) 스크롤하지 않는다.
 */
export interface Scroller {
  box: Phaser.GameObjects.Container;
  readonly dragged: boolean;
  /** 판 안 y(원래 좌표)가 화면 yScreen에 오게 이동(범위 안으로) */
  scrollTo(contentY: number, yScreen?: number): void;
}

export function makeScroll(scene: Phaser.Scene, before: Set<Phaser.GameObjects.GameObject>, bottom: number, blocked: () => boolean = () => false): Scroller {
  const items = scene.children.list.filter((o) => !before.has(o));
  const box = scene.add.container(0, 0);
  box.add(items);
  const top = CONTENT.top - 14;
  const viewBottom = CONTENT.bottom + offY(scene);
  const mask = scene.make.graphics({}, false).fillStyle(0xffffff).fillRect(0, top, 720, viewBottom - top);
  box.enableFilters();
  box.filters?.external.addMask(mask, false, scene.cameras.main);
  const minY = Math.min(0, viewBottom - bottom);
  const clamp = (v: number) => Phaser.Math.Clamp(v, minY, 0);
  let dragged = false;
  const guard = (o: Phaser.GameObjects.GameObject) => {
    if (o.input) {
      const fns = o.listeners('pointerup') as ((...a: unknown[]) => void)[];
      o.removeAllListeners('pointerup');
      for (const fn of fns) o.on('pointerup', (...a: unknown[]) => (dragged ? undefined : fn(...a)));
    }
    if (o instanceof Phaser.GameObjects.Container) o.list.forEach(guard);
  };
  box.list.forEach(guard);
  let startY = 0;
  let startBox = 0;
  let down = false;
  scene.input.on('pointerdown', (pt: Phaser.Input.Pointer) => {
    if (blocked()) return;
    down = true;
    dragged = false;
    startY = pt.y;
    startBox = box.y;
  });
  scene.input.on('pointermove', (pt: Phaser.Input.Pointer) => {
    if (!down || !pt.isDown) return;
    if (Math.abs(pt.y - startY) > 12) dragged = true;
    if (dragged) box.y = clamp(startBox + (pt.y - startY));
  });
  scene.input.on('pointerup', () => {
    down = false;
    scene.time.delayedCall(0, () => (dragged = false));
  });
  scene.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => {
    if (!blocked()) box.y = clamp(box.y - dy);
  });
  return {
    box,
    get dragged() {
      return dragged;
    },
    scrollTo(contentY: number, yScreen = 640) {
      box.y = clamp(yScreen - contentY);
    },
  };
}
