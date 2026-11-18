import Phaser from 'phaser';
import { BUTTON, COLOR, css, FONT_FAMILY, RADIUS, TYPE, type ButtonKind } from './theme';

// UI 부품(디자인 시스템). 기존 src/ui/widgets.ts는 그대로 두고, 화면을 새 디자인으로 바꿀 때 이 부품으로 옮긴다.
// 모든 부품은 Container 하나로 돌려줘서 위치 이동·표시 끄기·지우기가 한 번에 된다.

export function text(scene: Phaser.Scene, x: number, y: number, s: string, size: number = TYPE.body, color: number = COLOR.text, bold = false) {
  return scene.add.text(x, y, s, {
    fontFamily: FONT_FAMILY,
    fontSize: `${size}px`,
    fontStyle: bold ? 'bold' : 'normal',
    color: css(color),
    align: 'center',
  });
}

/** 둥근 패널: 바탕 + 위쪽 하이라이트 + 테두리(+ 선택 시 강조색 테두리) */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, opts: { fill?: number; border?: number; radius?: number; glow?: number } = {}) {
  const g = scene.add.graphics();
  const r = opts.radius ?? RADIUS.m;
  g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2 + 2, -h / 2 + 6, w, h, r); // 그림자
  g.fillStyle(opts.fill ?? COLOR.panel, 0.96).fillRoundedRect(-w / 2, -h / 2, w, h, r);
  g.fillStyle(0xffffff, 0.05).fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, Math.min(h * 0.4, 60), { tl: r - 4, tr: r - 4, bl: 6, br: 6 });
  g.lineStyle(2, opts.border ?? COLOR.line, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, r);
  if (opts.glow) g.lineStyle(4, opts.glow, 0.9).strokeRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, r + 3);
  return scene.add.container(x, y, [g]).setSize(w, h);
}

export interface KitButton {
  root: Phaser.GameObjects.Container;
  setEnabled(on: boolean): void;
  setLabel(s: string): void;
}

/**
 * 버튼: 아래로 두께가 있는 "누르는" 모양. 누르면 4px 내려가고, 비활성은 회색.
 * icon은 텍스처 키(예: 'ui-ruby') — 그림이 왼쪽에 붙는다. sub는 아래 작은 글씨(가격 등).
 */
export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  onClick: () => void,
  opts: { kind?: ButtonKind; icon?: string; sub?: string; size?: number } = {},
): KitButton {
  const c = BUTTON[opts.kind ?? 'primary'];
  const r = Math.min(RADIUS.l, h / 2);
  const depth = 8;
  const base = scene.add.graphics();
  const face = scene.add.graphics();
  const content = scene.add.container(0, 0);
  const lbl = text(scene, 0, opts.sub ? -10 : 0, label, opts.size ?? TYPE.heading, c.text, true).setOrigin(0.5);
  content.add(lbl);
  if (opts.sub) content.add(text(scene, 0, 22, opts.sub, TYPE.caption, COLOR.text).setOrigin(0.5).setAlpha(0.85));
  if (opts.icon && scene.textures.exists(opts.icon)) {
    const ic = scene.add.image(0, 0, opts.icon).setDisplaySize(h * 0.5, h * 0.5);
    content.add(ic);
    const half = (h * 0.5 + 10 + lbl.width) / 2;
    ic.setX(-half + h * 0.25);
    lbl.setX(ic.x + h * 0.25 + 10 + lbl.width / 2);
  }
  const root = scene.add.container(x, y, [base, face, content]).setSize(w, h + depth);
  let enabled = true;
  let pressed = false;
  const draw = () => {
    const fill = enabled ? c.fill : 0x3a3f4b;
    const deep = enabled ? c.deep : 0x262a33;
    const dy = pressed ? depth - 2 : 0;
    base.clear().fillStyle(deep, 1).fillRoundedRect(-w / 2, -h / 2 + depth, w, h, r);
    face.clear().fillStyle(fill, 1).fillRoundedRect(-w / 2, -h / 2 + dy, w, h, r);
    face.fillStyle(0xffffff, enabled ? 0.18 : 0.05).fillRoundedRect(-w / 2 + 6, -h / 2 + dy + 5, w - 12, h * 0.38, { tl: r - 6, tr: r - 6, bl: 8, br: 8 });
    content.setY(dy).setAlpha(enabled ? 1 : 0.55);
  };
  draw();
  root.setInteractive({ useHandCursor: true, hitArea: new Phaser.Geom.Rectangle(0, 0, w, h + depth), hitAreaCallback: Phaser.Geom.Rectangle.Contains });
  root.on('pointerdown', () => {
    if (!enabled) return;
    pressed = true;
    draw();
  });
  const release = (fire: boolean) => {
    if (!pressed) return;
    pressed = false;
    draw();
    if (fire && enabled) onClick();
  };
  root.on('pointerup', () => release(true));
  root.on('pointerout', () => release(false));
  return {
    root,
    setEnabled(on) {
      enabled = on;
      draw();
    },
    setLabel(s) {
      lbl.setText(s);
    },
  };
}

/** 재화 표시(알약 모양): [아이콘] 1,234   — 오른쪽에 + 버튼을 붙일 수 있다 */
export function currencyPill(scene: Phaser.Scene, x: number, y: number, icon: string, value: number | string, color: number = COLOR.text, w = 190) {
  const h = 52;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.45).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  g.lineStyle(2, COLOR.line, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  const ic = scene.add.image(-w / 2 + h / 2, 0, icon).setDisplaySize(h * 0.95, h * 0.95);
  const t = text(scene, -w / 2 + h + 8, 0, typeof value === 'number' ? value.toLocaleString() : value, TYPE.body, color, true).setOrigin(0, 0.5);
  const root = scene.add.container(x, y, [g, ic, t]).setSize(w, h);
  return { root, setValue: (v: number | string) => t.setText(typeof v === 'number' ? v.toLocaleString() : v) };
}

/** 진행 막대: 0~1, 라벨은 막대 위 가운데 */
export function progressBar(scene: Phaser.Scene, x: number, y: number, w: number, h: number, ratio: number, color: number = COLOR.ember, label?: string) {
  const g = scene.add.graphics();
  const draw = (r: number) => {
    const v = Phaser.Math.Clamp(r, 0, 1);
    g.clear().fillStyle(0x000000, 0.5).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    if (v > 0) g.fillStyle(color, 1).fillRoundedRect(-w / 2 + 3, -h / 2 + 3, Math.max(h - 6, (w - 6) * v), h - 6, (h - 6) / 2);
    g.fillStyle(0xffffff, 0.15).fillRoundedRect(-w / 2 + 3, -h / 2 + 3, (w - 6) * v, (h - 6) / 2, (h - 6) / 4);
  };
  draw(ratio);
  const items: Phaser.GameObjects.GameObject[] = [g];
  const t = label ? text(scene, 0, 0, label, TYPE.caption, COLOR.text, true).setOrigin(0.5) : null;
  if (t) items.push(t);
  const root = scene.add.container(x, y, items);
  return { root, set: (r: number, l?: string) => (draw(r), l !== undefined && t?.setText(l)) };
}

/** 등급 배지: [희귀] 같은 작은 알약 */
export function badge(scene: Phaser.Scene, x: number, y: number, label: string, color: number) {
  const t = text(scene, 0, 0, label, TYPE.tiny, 0x111111, true).setOrigin(0.5);
  const w = t.width + 24;
  const g = scene.add.graphics().fillStyle(color, 1).fillRoundedRect(-w / 2, -16, w, 32, 16);
  return scene.add.container(x, y, [g, t]);
}

/**
 * 팝업: 화면을 어둡게 덮고 가운데 패널. 바깥을 누르면 닫힘(closeOnBackdrop).
 * close()는 지우기 — 장면의 onPlatformBack에서 "팝업이 열려 있으면 닫기"에 쓴다.
 */
export function modal(scene: Phaser.Scene, w: number, h: number, title: string, opts: { closeOnBackdrop?: boolean; depth?: number } = {}) {
  const depth = opts.depth ?? 900;
  const dim = scene.add.rectangle(360, 640, 720, 1280, 0x000000, 0.72).setInteractive().setDepth(depth).setScrollFactor(0);
  const box = panel(scene, 360, 640, w, h, { radius: RADIUS.l, border: COLOR.line }).setDepth(depth + 1).setScrollFactor(0);
  const head = text(scene, 0, -h / 2 + 46, title, TYPE.title, COLOR.text, true).setOrigin(0.5);
  box.add(head);
  box.setScale(0.9).setAlpha(0);
  scene.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 160, ease: 'Back.Out' });
  const close = () => {
    dim.destroy();
    box.destroy();
  };
  if (opts.closeOnBackdrop) dim.on('pointerdown', close);
  return { box, close, body: (o: Phaser.GameObjects.GameObject) => box.add(o) };
}

/** 슬롯 칸(장비·특수 스킬): 빈 칸은 점선 느낌, 채워지면 등급 색 테두리 */
export function slot(scene: Phaser.Scene, x: number, y: number, size: number, opts: { icon?: string; rarity?: number; label?: string } = {}) {
  const g = scene.add.graphics();
  const r = RADIUS.m;
  g.fillStyle(0x000000, 0.4).fillRoundedRect(-size / 2, -size / 2, size, size, r);
  if (opts.rarity !== undefined) {
    g.fillStyle(opts.rarity, 0.18).fillRoundedRect(-size / 2, -size / 2, size, size, r);
    g.lineStyle(4, opts.rarity, 1).strokeRoundedRect(-size / 2, -size / 2, size, size, r);
  } else {
    g.lineStyle(2, COLOR.line, 1).strokeRoundedRect(-size / 2, -size / 2, size, size, r);
  }
  const items: Phaser.GameObjects.GameObject[] = [g];
  if (opts.icon && scene.textures.exists(opts.icon)) items.push(scene.add.image(0, 0, opts.icon).setDisplaySize(size * 0.72, size * 0.72));
  else items.push(text(scene, 0, 0, '+', TYPE.title, COLOR.textDim).setOrigin(0.5));
  if (opts.label) items.push(text(scene, 0, size / 2 + 20, opts.label, TYPE.tiny, COLOR.textSub).setOrigin(0.5));
  return scene.add.container(x, y, items).setSize(size, size);
}

/** 화면 상단 머리줄: 왼쪽 뒤로 버튼(선택) + 제목. 오른쪽 위는 토스 닫기 버튼 자리라 비운다(안전 영역 아래로 내려가 있지만 여유) */
export function header(scene: Phaser.Scene, title: string, onBack?: () => void) {
  const items: Phaser.GameObjects.GameObject[] = [];
  const bar = scene.add.graphics().fillStyle(0x000000, 0.35).fillRect(0, 0, 720, 110);
  items.push(bar, text(scene, 360, 55, title, TYPE.title, COLOR.text, true).setOrigin(0.5));
  if (onBack) {
    const b = button(scene, 70, 50, 84, 64, '‹', onBack, { kind: 'secondary', size: 44 });
    items.push(b.root);
  }
  return scene.add.container(0, 0, items);
}
