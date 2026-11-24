import Phaser from 'phaser';
import { BUTTON, COLOR, css, FONT_FAMILY, RADIUS, STROKE, tint, TYPE, type ButtonKind } from './theme';
import { fullH, offY, safeBottom } from './layout';

// UI 부품(디자인 시스템). 기존 src/ui/widgets.ts는 그대로 두고, 화면을 새 디자인으로 바꿀 때 이 부품으로 옮긴다.
// 모든 부품은 Container 하나로 돌려줘서 위치 이동·표시 끄기·지우기가 한 번에 된다.
// 형식: 통통한 카툰 UI — 굵은 어두운 외곽선, 흰 글자 + 어두운 테두리, 누르는 버튼은 아래 두께.

/** 글자. outline=true면 흰 글자에 어두운 테두리(카툰 제목·버튼용) */
export function text(scene: Phaser.Scene, x: number, y: number, s: string, size: number = TYPE.body, color: number = COLOR.text, bold = false, outline = false) {
  const t = scene.add.text(x, y, s, {
    fontFamily: FONT_FAMILY,
    fontSize: `${size}px`,
    fontStyle: bold || outline ? 'bold' : 'normal',
    color: css(color),
    align: 'center',
  });
  if (outline) t.setStroke(css(COLOR.outline), Math.max(4, Math.round(size / 6)));
  return t;
}

/** 둥근 패널: 외곽선 + 바탕 + 위쪽 하이라이트(+ 강조 테두리) */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, opts: { fill?: number; radius?: number; glow?: number; outline?: boolean } = {}) {
  const g = scene.add.graphics();
  const r = opts.radius ?? RADIUS.m;
  const fill = opts.fill ?? COLOR.panel;
  g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2 + 2, -h / 2 + 7, w, h, r); // 그림자
  if (opts.outline !== false) g.fillStyle(COLOR.outline, 1).fillRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, r + 3);
  g.fillStyle(fill, 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
  g.fillStyle(0xffffff, 0.06).fillRoundedRect(-w / 2 + 5, -h / 2 + 5, w - 10, Math.min(h * 0.4, 56), { tl: r - 5, tr: r - 5, bl: 6, br: 6 });
  if (opts.glow) g.lineStyle(4, opts.glow, 1).strokeRoundedRect(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12, r + 6);
  return scene.add.container(x, y, [g]).setSize(w, h);
}

export interface KitButton {
  root: Phaser.GameObjects.Container;
  setEnabled(on: boolean): void;
  setLabel(s: string): void;
}

/**
 * 누르는 버튼: 외곽선 + 아래 두께 + 위 하이라이트. 누르면 두께만큼 내려가고, 비활성은 회색.
 * icon = 텍스처 키(글자 왼쪽에 붙음), sub = 아래 작은 글씨(가격 등), alert = 오른쪽 위 "!" 표시
 */
export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  onClick: () => void,
  opts: { kind?: ButtonKind; icon?: string; sub?: string; size?: number; alert?: boolean } = {},
): KitButton {
  const c = BUTTON[opts.kind ?? 'primary'];
  const r = Math.min(RADIUS.l, h / 2);
  const depth = 8;
  const base = scene.add.graphics();
  const face = scene.add.graphics();
  const content = scene.add.container(0, 0);
  const size = opts.size ?? TYPE.heading;
  const lbl = text(scene, 0, opts.sub ? -size * 0.35 : 0, label, size, COLOR.text, true, true).setOrigin(0.5);
  content.add(lbl);
  // 글자가 버튼보다 길면 버튼 폭에 맞게 줄인다(가격·재료 수가 커져도 넘치지 않게)
  const fit = (t: Phaser.GameObjects.Text, max: number) => {
    if (t.width > max) t.setScale(max / t.width);
  };
  let st: Phaser.GameObjects.Text | null = null;
  if (opts.sub) {
    st = text(scene, 0, size * 0.55, opts.sub, TYPE.caption, COLOR.text, true, true).setOrigin(0.5);
    fit(st, w - 20);
    content.add(st);
  }
  if (opts.icon && scene.textures.exists(opts.icon)) {
    const is = Math.min(h * 0.62, 64);
    const ic = scene.add.image(0, 0, opts.icon).setDisplaySize(is, is);
    content.add(ic);
    fit(lbl, w - 28 - is);
    const total = is + 8 + lbl.displayWidth;
    ic.setX(-total / 2 + is / 2);
    lbl.setX(ic.x + is / 2 + 8 + lbl.displayWidth / 2);
    st?.setX(lbl.x); // 가격 등 아래 글씨는 이름 밑에 맞춘다
  } else {
    fit(lbl, w - 20);
  }
  const items: Phaser.GameObjects.GameObject[] = [base, face, content];
  if (opts.alert) items.push(alertDot(scene, w / 2 - 6, -h / 2 + 2));
  const root = scene.add.container(x, y, items).setSize(w, h + depth);
  let enabled = true;
  let pressed = false;
  const draw = () => {
    const fill = enabled ? c.fill : 0x5a6072;
    const deep = enabled ? c.deep : 0x353a47;
    const dy = pressed ? depth - 2 : 0;
    base.clear();
    base.fillStyle(COLOR.outline, 1).fillRoundedRect(-w / 2 - 3, -h / 2 - 3 + dy, w + 6, h + depth + 6 - dy, r + 3);
    base.fillStyle(deep, 1).fillRoundedRect(-w / 2, -h / 2 + depth, w, h, r);
    face.clear().fillStyle(fill, 1).fillRoundedRect(-w / 2, -h / 2 + dy, w, h, r);
    face.fillStyle(0xffffff, enabled ? 0.28 : 0.08).fillRoundedRect(-w / 2 + 7, -h / 2 + dy + 5, w - 14, h * 0.34, { tl: r - 6, tr: r - 6, bl: 10, br: 10 });
    content.setY(dy).setAlpha(enabled ? 1 : 0.6);
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

/** 새 소식 표시: 빨간 둥근 사각형 안의 "!" */
export function alertDot(scene: Phaser.Scene, x: number, y: number, size = 34) {
  const g = scene.add.graphics();
  g.fillStyle(COLOR.outline, 1).fillRoundedRect(-size / 2 - 3, -size / 2 - 3, size + 6, size + 6, 10);
  g.fillStyle(COLOR.alert, 1).fillRoundedRect(-size / 2, -size / 2, size, size, 8);
  g.fillStyle(0xffffff, 0.3).fillRoundedRect(-size / 2 + 4, -size / 2 + 3, size - 8, size * 0.35, 6);
  return scene.add.container(x, y, [g, text(scene, 0, 0, '!', size * 0.8, COLOR.text, true, true).setOrigin(0.5)]);
}

/** 리본 제목(구역 머리): 가운데 띠 + 양 끝 접힌 꼬리 */
export function ribbon(scene: Phaser.Scene, x: number, y: number, w: number, title: string, color: number = COLOR.violet, h = 64) {
  const g = scene.add.graphics();
  const tail = 34;
  const dark = tint(color, -30);
  // 꼬리(뒤)
  for (const s of [-1, 1]) {
    const bx = s * (w / 2 - 6);
    const pts = [bx, -h / 2 + 12, bx + s * tail, -h / 2 + 12, bx + s * (tail - 14), 6, bx + s * tail, h / 2 + 4, bx, h / 2 + 4];
    g.fillStyle(COLOR.outline, 1).fillPoints(toPts(pts, s * 3), true);
    g.fillStyle(dark, 1).fillPoints(toPts(pts, 0), true);
  }
  g.fillStyle(COLOR.outline, 1).fillRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 14);
  g.fillStyle(color, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 12);
  g.fillStyle(0xffffff, 0.25).fillRoundedRect(-w / 2 + 6, -h / 2 + 5, w - 12, h * 0.32, 8);
  const t = text(scene, 0, 0, title, h * 0.55, COLOR.text, true, true).setOrigin(0.5);
  return scene.add.container(x, y, [g, t]);
}

function toPts(flat: number[], dx: number): Phaser.Math.Vector2[] {
  const out: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < flat.length; i += 2) out.push(new Phaser.Math.Vector2(flat[i] + dx, flat[i + 1]));
  return out;
}

/** 재화 알약 하나: [아이콘] 1,234 [+] */
export function currencyPill(scene: Phaser.Scene, x: number, y: number, icon: string, value: number | string, opts: { w?: number; onPlus?: () => void } = {}) {
  const w = opts.w ?? 200;
  const h = 50;
  const g = scene.add.graphics();
  g.fillStyle(COLOR.outline, 1).fillRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, (h + 6) / 2);
  g.fillStyle(0x1a1f30, 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  const items: Phaser.GameObjects.GameObject[] = [g];
  const ic = scene.add.image(-w / 2 + 4, 0, icon).setDisplaySize(h * 1.1, h * 1.1);
  const t = text(scene, opts.onPlus ? 6 : 14, 0, fmt(value), TYPE.body, COLOR.text, true, true).setOrigin(0.5);
  items.push(t, ic);
  if (opts.onPlus) {
    const plus = button(scene, w / 2 - 20, -3, 38, 38, '+', opts.onPlus, { kind: 'cta', size: 30 });
    items.push(plus.root);
  }
  const root = scene.add.container(x, y, items).setSize(w, h);
  return { root, setValue: (v: number | string) => t.setText(fmt(v)) };
}

const fmt = (v: number | string) => (typeof v === 'number' ? v.toLocaleString() : v);

/** 화면 맨 위 재화 줄(골드·루비·개봉권 등) */
export function currencyBar(scene: Phaser.Scene, y: number, items: { icon: string; value: number; onPlus?: () => void; w?: number }[]) {
  const bar = scene.add.graphics().fillStyle(0x000000, 0.45).fillRect(0, y - 40, 720, 80);
  const root = scene.add.container(0, 0, [bar]);
  let x = 24;
  for (const it of items) {
    const w = it.w ?? 200;
    root.add(currencyPill(scene, x + w / 2 + 22, y, it.icon, it.value, { w, onPlus: it.onPlus }).root);
    x += w + 40;
  }
  return root;
}

/** 진행 막대: 0~1, 라벨은 막대 위 가운데. icon이 있으면 왼쪽 끝에 붙는다(조각 수 표시 등) */
export function progressBar(scene: Phaser.Scene, x: number, y: number, w: number, h: number, ratio: number, color: number = COLOR.ember, label?: string, icon?: string) {
  const g = scene.add.graphics();
  const draw = (r: number) => {
    const v = Phaser.Math.Clamp(r, 0, 1);
    g.clear().fillStyle(COLOR.outline, 1).fillRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, (h + 6) / 2);
    g.fillStyle(0x151a28, 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    if (v > 0) g.fillStyle(color, 1).fillRoundedRect(-w / 2 + 2, -h / 2 + 2, Math.max(h - 4, (w - 4) * v), h - 4, (h - 4) / 2);
    if (v > 0) g.fillStyle(0xffffff, 0.25).fillRoundedRect(-w / 2 + 4, -h / 2 + 3, Math.max(0, (w - 8) * v), (h - 6) * 0.4, (h - 6) / 4);
  };
  draw(ratio);
  const items: Phaser.GameObjects.GameObject[] = [g];
  const t = label ? text(scene, icon ? 12 : 0, 0, label, Math.min(TYPE.caption, h * 0.8), COLOR.text, true, true).setOrigin(0.5) : null;
  if (t) items.push(t);
  if (icon && scene.textures.exists(icon)) items.push(scene.add.image(-w / 2 + 4, 0, icon).setDisplaySize(h * 1.7, h * 1.7));
  const root = scene.add.container(x, y, items);
  return { root, set: (r: number, l?: string) => (draw(r), l !== undefined && t?.setText(l)) };
}

/** 진행도 보상 막대: 25·50·100% 같은 지점에 상자. 받을 수 있으면 반짝, 받았으면 흐리게 */
export function milestoneBar(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  ratio: number,
  marks: { at: number; label: string; claimed?: boolean; icon?: string }[],
  onClaim?: (i: number) => void,
) {
  const root = scene.add.container(x, y, [progressBar(scene, 0, 10, w, 20, ratio, COLOR.ok).root]);
  marks.forEach((m, i) => {
    const mx = -w / 2 + w * m.at;
    const ready = ratio >= m.at && !m.claimed;
    const ic = scene.add.image(mx, -26, m.icon ?? 'chest-gold').setDisplaySize(84, 84).setAlpha(m.claimed ? 0.45 : 1);
    if (ready) {
      ic.setInteractive({ useHandCursor: true }).on('pointerdown', () => onClaim?.(i));
      scene.tweens.add({ targets: ic, y: -34, yoyo: true, repeat: -1, duration: 500, ease: 'Sine.InOut' });
      root.add(alertDot(scene, mx + 30, -56, 26));
    }
    root.addAt(ic, 0);
    root.add(text(scene, mx, 46, m.claimed ? '받음' : m.label, TYPE.tiny, m.claimed ? COLOR.textDim : COLOR.text, true, true).setOrigin(0.5));
  });
  return root;
}

/**
 * 아이템 카드(장비·드래곤·특수 스킬): 등급 색 머리띠에 이름, 가운데 아이콘, 레벨, 아래 조각 진행(현재/필요).
 * 선택하면 selected=true로 밝은 테두리.
 */
export function itemCard(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts: { w?: number; h?: number; name: string; icon: string; color: number; level?: string; have?: number; need?: number; selected?: boolean; alert?: boolean; onClick?: () => void },
) {
  const w = opts.w ?? 156;
  const h = opts.h ?? 200;
  const r = RADIUS.m;
  const g = scene.add.graphics();
  if (opts.selected) g.fillStyle(COLOR.ok, 1).fillRoundedRect(-w / 2 - 8, -h / 2 - 8, w + 16, h + 16, r + 8);
  g.fillStyle(COLOR.outline, 1).fillRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, r + 3);
  g.fillStyle(tint(opts.color, -35), 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
  g.fillStyle(opts.color, 1).fillRoundedRect(-w / 2, -h / 2, w, h - 46, { tl: r, tr: r, bl: 0, br: 0 });
  g.fillStyle(tint(opts.color, 18), 1).fillRoundedRect(-w / 2, -h / 2, w, 40, { tl: r, tr: r, bl: 0, br: 0 });
  g.fillStyle(0x000000, 0.12).fillRect(-w / 2, -h / 2 + 40, w, 4);
  const items: Phaser.GameObjects.GameObject[] = [g];
  items.push(text(scene, 0, -h / 2 + 21, opts.name, Math.min(TYPE.caption, (w - 16) / Math.max(4, opts.name.length) * 1.6), COLOR.text, true, true).setOrigin(0.5));
  if (scene.textures.exists(opts.icon)) items.push(scene.add.image(0, -8, opts.icon).setDisplaySize(w * 0.58, w * 0.58));
  if (opts.level) items.push(text(scene, 0, h / 2 - 72, opts.level, TYPE.body, COLOR.gold, true, true).setOrigin(0.5));
  if (opts.need !== undefined) {
    const have = opts.have ?? 0;
    items.push(progressBar(scene, 10, h / 2 - 24, w - 44, 20, have / opts.need, have >= opts.need ? COLOR.ok : COLOR.ember, `${have}/${opts.need}`, 'ui-fragment').root);
  }
  if (opts.alert) items.push(alertDot(scene, w / 2 - 4, -h / 2 + 4, 28));
  const root = scene.add.container(x, y, items).setSize(w, h);
  if (opts.onClick) root.setInteractive({ useHandCursor: true }).on('pointerdown', opts.onClick);
  return root;
}

/** 등급 배지: [희귀] 같은 작은 알약 */
export function badge(scene: Phaser.Scene, x: number, y: number, label: string, color: number) {
  const t = text(scene, 0, 0, label, TYPE.tiny, COLOR.text, true, true).setOrigin(0.5);
  const w = t.width + 26;
  const g = scene.add.graphics();
  g.fillStyle(COLOR.outline, 1).fillRoundedRect(-w / 2 - 3, -19, w + 6, 38, 19);
  g.fillStyle(color, 1).fillRoundedRect(-w / 2, -16, w, 32, 16);
  return scene.add.container(x, y, [g, t]);
}

/**
 * 팝업: 화면을 어둡게 덮고 가운데 패널 + 리본 제목. 바깥을 누르면 닫힘(closeOnBackdrop).
 * close()는 지우기 — 장면의 onPlatformBack에서 "팝업이 열려 있으면 닫기"에 쓴다.
 */
export function modal(scene: Phaser.Scene, w: number, h: number, title: string, opts: { closeOnBackdrop?: boolean; depth?: number; fill?: number; ribbonColor?: number } = {}) {
  const depth = opts.depth ?? 900;
  // 화면에 고정(전투 카메라가 움직여도 그대로) — 세로가 긴 화면이면 실제 화면 가운데(640 + 늘어난 높이 절반)
  const cy = 640 + offY(scene);
  const dim = scene.add.rectangle(360, cy, 720, fullH(scene), 0x000000, 0.72).setInteractive().setDepth(depth).setScrollFactor(0);
  const box = panel(scene, 360, cy, w, h, { radius: RADIUS.l, fill: opts.fill }).setDepth(depth + 1).setScrollFactor(0);
  box.add(ribbon(scene, 0, -h / 2, Math.min(w - 80, 440), title, opts.ribbonColor ?? COLOR.ember, 70));
  box.setScale(0.9).setAlpha(0);
  scene.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 160, ease: 'Back.Out' });
  const close = () => {
    dim.destroy();
    box.destroy();
  };
  if (opts.closeOnBackdrop) dim.on('pointerdown', close);
  return { box, close, body: (o: Phaser.GameObjects.GameObject) => box.add(o) };
}

/** 슬롯 칸(장비·특수 스킬): 빈 칸은 +, 채워지면 등급 색 */
export function slot(scene: Phaser.Scene, x: number, y: number, size: number, opts: { icon?: string; rarity?: number; label?: string } = {}) {
  const g = scene.add.graphics();
  const r = RADIUS.m;
  g.fillStyle(COLOR.outline, 1).fillRoundedRect(-size / 2 - 3, -size / 2 - 3, size + 6, size + 6, r + 3);
  if (opts.rarity !== undefined) {
    g.fillStyle(tint(opts.rarity, -30), 1).fillRoundedRect(-size / 2, -size / 2, size, size, r);
    g.fillStyle(opts.rarity, 1).fillRoundedRect(-size / 2 + 4, -size / 2 + 4, size - 8, size - 12, r - 3);
  } else {
    g.fillStyle(0x151a28, 1).fillRoundedRect(-size / 2, -size / 2, size, size, r);
  }
  const items: Phaser.GameObjects.GameObject[] = [g];
  if (opts.icon && scene.textures.exists(opts.icon)) items.push(scene.add.image(0, -2, opts.icon).setDisplaySize(size * 0.72, size * 0.72));
  else items.push(text(scene, 0, 0, '+', TYPE.title, COLOR.textDim, true).setOrigin(0.5));
  if (opts.label) items.push(text(scene, 0, size / 2 + 20, opts.label, TYPE.tiny, COLOR.text, true, true).setOrigin(0.5));
  return scene.add.container(x, y, items).setSize(size, size);
}

/**
 * 하단 탭 바: 탭마다 아이콘. 선택한 탭은 노란 바탕에 크게 + 이름, 나머지는 아이콘만. 새 소식은 "!".
 * 휴대폰 홈 표시줄과 겹치지 않게 안전 영역 안쪽(화면 맨 아래)에 둔다.
 */
export function navBar(scene: Phaser.Scene, tabs: { key: string; label: string; icon: string; alert?: boolean }[], selected: string, onSelect: (key: string) => void) {
  const h = 128;
  const y = 1280 - h / 2;
  const tw = 720 / tabs.length;
  const sb = safeBottom(scene); // 홈 바 밑 여분: 바탕·선택 칸만 화면 끝까지(2026-11-24)
  const g = scene.add.graphics();
  g.fillStyle(COLOR.outline, 1).fillRect(0, y - h / 2 - 4, 720, h + 4 + sb);
  g.fillStyle(0x1f2538, 1).fillRect(0, y - h / 2, 720, h + sb);
  const root = scene.add.container(0, 0, [g]);
  tabs.forEach((t, i) => {
    const cx = tw * i + tw / 2;
    const on = t.key === selected;
    if (i > 0) root.add(scene.add.rectangle(tw * i, y, 3, h - 30, COLOR.outline));
    if (on) {
      const s = scene.add.graphics();
      s.fillStyle(COLOR.outline, 1).fillRoundedRect(cx - tw / 2 + 4, y - h / 2 - 22, tw - 8, h + 18 + sb, 18);
      s.fillStyle(COLOR.cta, 1).fillRoundedRect(cx - tw / 2 + 8, y - h / 2 - 18, tw - 16, h + 10 + sb, 16);
      s.fillStyle(0xffffff, 0.3).fillRoundedRect(cx - tw / 2 + 14, y - h / 2 - 12, tw - 28, 26, 10);
      root.add(s);
    }
    const icon = scene.add.image(cx, on ? y - 22 : y - 4, t.icon).setDisplaySize(on ? 80 : 70, on ? 80 : 70);
    root.add(icon);
    if (on) root.add(text(scene, cx, y + 36, t.label, TYPE.caption, COLOR.text, true, true).setOrigin(0.5));
    if (t.alert) root.add(alertDot(scene, cx + tw / 2 - 26, y - h / 2 + 18, 28));
    const hit = scene.add.rectangle(cx, y, tw, h, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => onSelect(t.key));
    root.add(hit);
  });
  return root;
}

/** 화면 머리: 왼쪽 뒤로 버튼(선택) + 가운데 리본 제목. 오른쪽 위는 비워 둔다(토스 닫기 버튼 자리) */
export function header(scene: Phaser.Scene, title: string, onBack?: () => void, y = 150) {
  const items: Phaser.GameObjects.GameObject[] = [ribbon(scene, 360, y, 380, title, COLOR.ember, 72)];
  if (onBack) items.push(button(scene, 58, y, 72, 64, '‹', onBack, { kind: 'secondary', size: 44 }).root);
  return scene.add.container(0, 0, items);
}
