import Phaser from 'phaser';
import { COLOR, tint, TYPE } from './theme';
import { alertDot, badge, button, text } from './kit';

// 시안 형식 부품(2026-11-18 기획자 UI 시안 6장 반영): 짙은 보라 판, 아이콘 타일, 날개 금테 배너,
// 프로필·재화 머리줄, 드래곤 캐러셀, 원형 바로가기, 돌 제단, 횃불.

/** 짙은 보라 판: 검은 외곽선 + 보랏빛 테두리(금테 선택) + 짙은 바탕 */
export function plate(scene: Phaser.Scene, x: number, y: number, w: number, h: number, opts: { r?: number; fill?: number; gold?: boolean } = {}) {
  const r = opts.r ?? 22;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2, -h / 2 + 6, w, h, r);
  g.fillStyle(COLOR.outline, 1).fillRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, r + 3);
  g.fillStyle(opts.gold ? 0xe0a032 : 0x4b4170, 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
  g.fillStyle(opts.fill ?? 0x2b2442, 1).fillRoundedRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10, Math.max(4, r - 4));
  g.fillStyle(0xffffff, 0.05).fillRoundedRect(-w / 2 + 8, -h / 2 + 8, w - 16, (h - 16) * 0.4, Math.max(4, r - 6));
  return scene.add.container(x, y, [g]).setSize(w, h);
}

/** 아이콘 타일(양옆 기둥·바로가기): 짙은 타일 + 아이콘 + 아래 이름 + "!" */
export function iconTile(scene: Phaser.Scene, x: number, y: number, icon: string, opts: { size?: number; label?: string; alert?: boolean; onClick?: () => void } = {}) {
  const s = opts.size ?? 96;
  const root = plate(scene, x, y, s, s, { r: 20 });
  if (scene.textures.exists(icon)) root.add(scene.add.image(0, -2, icon).setDisplaySize(s * 0.8, s * 0.8));
  if (opts.label) root.add(text(scene, 0, s / 2 + 4, opts.label, TYPE.tiny, COLOR.text, true, true).setOrigin(0.5, 0.3));
  if (opts.alert) root.add(alertDot(scene, s / 2 - 8, -s / 2 + 8, 30));
  if (opts.onClick) {
    root.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      scene.tweens.add({ targets: root, scale: 0.92, yoyo: true, duration: 70 });
      opts.onClick?.();
    });
  }
  return root;
}

/** 날개 달린 금테 배너(단계 이름·화면 제목): 가운데 보라 판 + 양옆 금 깃털 날개 + 위 엠블럼 */
export function wingBanner(scene: Phaser.Scene, x: number, y: number, w: number, title: string, opts: { sub?: string; emblem?: string } = {}) {
  const h = 84;
  const g = scene.add.graphics();
  const gold = 0xf2b632;
  const goldDeep = 0xb8741a;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const bx = s * (w / 2 - 10);
      const tipX = bx + s * (64 - i * 12);
      const tipY = -h / 2 - 30 + i * 26;
      const pts = [new Phaser.Math.Vector2(bx, -14 + i * 14), new Phaser.Math.Vector2(tipX, tipY), new Phaser.Math.Vector2(bx, 14 + i * 14)];
      g.fillStyle(COLOR.outline, 1).fillPoints(pts.map((p) => new Phaser.Math.Vector2(p.x + s * 4, p.y + 2)), true);
      g.fillStyle(tint(gold, -14 * i), 1).fillPoints(pts, true);
    }
  }
  g.fillStyle(COLOR.outline, 1).fillRoundedRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, h / 2 + 4);
  g.fillStyle(gold, 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  g.fillStyle(goldDeep, 1).fillRoundedRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12, h / 2 - 6);
  g.fillStyle(0x3a2a6b, 1).fillRoundedRect(-w / 2 + 10, -h / 2 + 10, w - 20, h - 20, h / 2 - 10);
  g.fillStyle(0xffffff, 0.12).fillRoundedRect(-w / 2 + 16, -h / 2 + 12, w - 32, (h - 24) * 0.4, 12);
  const items: Phaser.GameObjects.GameObject[] = [g, text(scene, 0, opts.sub ? -8 : 0, title, 34, COLOR.gold, true, true).setOrigin(0.5)];
  if (opts.sub) items.push(text(scene, 0, 22, opts.sub, TYPE.tiny, COLOR.textSub, true).setOrigin(0.5));
  if (opts.emblem && scene.textures.exists(opts.emblem)) {
    const e = scene.add.graphics();
    e.fillStyle(COLOR.outline, 1).fillCircle(0, -h / 2 - 10, 38);
    e.fillStyle(gold, 1).fillCircle(0, -h / 2 - 10, 34);
    e.fillStyle(0x3a2a6b, 1).fillCircle(0, -h / 2 - 10, 27);
    items.push(e, scene.add.image(0, -h / 2 - 10, opts.emblem).setDisplaySize(50, 50));
  }
  return scene.add.container(x, y, items);
}

/** 맨 위 머리줄: 프로필(출격 드래곤 얼굴 + 레벨) + 재화 게이지(아이콘 · 짙은 칸 안 숫자 · 금색 +) + 전투력 */
export function topBar(scene: Phaser.Scene, opts: { portrait: string; level: number; cp: string; currencies: { icon: string; value: number | string; sub?: string; onPlus?: () => void }[] }) {
  const root = scene.add.container(0, 0);
  const bg = scene.add.graphics();
  bg.fillStyle(COLOR.outline, 1).fillRoundedRect(-20, -30, 760, 162, 28);
  bg.fillStyle(0x221d36, 1).fillRoundedRect(-20, -30, 760, 156, 26);
  root.add(bg);
  const pf = plate(scene, 70, 62, 108, 108, { gold: true, r: 22, fill: 0x3a2a6b });
  if (scene.textures.exists(opts.portrait)) pf.add(scene.add.image(0, 2, opts.portrait).setDisplaySize(124, 124));
  pf.add(badge(scene, 0, 52, `Lv.${opts.level}`, 0x3a2a6b));
  root.add(pf);
  const values: Phaser.GameObjects.Text[] = [];
  const subs: Phaser.GameObjects.Text[] = [];
  const n = opts.currencies.length;
  const left = 140;
  const each = (720 - left - 10) / n;
  opts.currencies.forEach((c, i) => {
    const cx = left + each * i + each / 2;
    const w = each - 14;
    const g = scene.add.graphics();
    g.fillStyle(COLOR.outline, 1).fillRoundedRect(cx - w / 2 + 14, 24, w - 14, 42, 21);
    g.fillStyle(0x110e1c, 1).fillRoundedRect(cx - w / 2 + 17, 27, w - 20, 36, 18);
    root.add(g);
    root.add(scene.add.image(cx - w / 2 + 14, 45, c.icon).setDisplaySize(60, 60));
    const v = text(scene, cx + 2, 45, typeof c.value === 'number' ? c.value.toLocaleString() : c.value, TYPE.caption, COLOR.text, true, true).setOrigin(0.5);
    root.add(v);
    // 아래 작은 글씨(행동력 회복 타이머 등)
    const sub = text(scene, cx + 2, 82, c.sub ?? '', TYPE.tiny, COLOR.ok, true, true).setOrigin(0.5);
    root.add(sub);
    values.push(v);
    subs.push(sub);
    if (c.onPlus) root.add(button(scene, cx + w / 2 - 12, 42, 36, 36, '+', c.onPlus, { kind: 'cta', size: 28 }).root);
  });
  if (scene.textures.exists('ic-swords')) root.add(scene.add.image(168, 108, 'ic-swords').setDisplaySize(36, 36));
  root.add(text(scene, 190, 108, `전투력 ${opts.cp}`, TYPE.tiny, COLOR.gold, true, true).setOrigin(0, 0.5));
  return {
    root,
    /** i번째 게이지 값·아래 글씨 바꾸기(행동력 타이머를 1초마다 갱신) */
    set(i: number, value: number | string, subText?: string) {
      values[i]?.setText(typeof value === 'number' ? value.toLocaleString() : value);
      if (subText !== undefined) subs[i]?.setText(subText);
    },
  };
}

/** 드래곤 선택 캐러셀: ◀ [초상 3칸, 가운데 금테 강조] ▶ + 점 */
export function dragonCarousel(scene: Phaser.Scene, y: number, portraits: string[], selected: number, onPick: (i: number) => void) {
  const root = scene.add.container(0, y);
  const n = portraits.length;
  [-1, 0, 1].forEach((d, k) => {
    const idx = (selected + d + n) % n;
    const on = d === 0;
    const s = on ? 132 : 108;
    const card = plate(scene, 360 + d * 150, 0, s, s, { gold: on, r: 20, fill: on ? 0x3a2a6b : 0x2b2442 });
    if (scene.textures.exists(portraits[idx])) card.add(scene.add.image(0, 2, portraits[idx]).setDisplaySize(s * 1.05, s * 1.05));
    card.setInteractive({ useHandCursor: true }).on('pointerdown', () => onPick(idx));
    root.add(card);
    void k;
  });
  for (const s of [-1, 1]) {
    const tri = scene.add.triangle(360 + s * 236, 0, 0, -24, 0, 24, s * 30, 0, 0xffe39a).setStrokeStyle(4, COLOR.outline);
    tri.setInteractive({ useHandCursor: true }).on('pointerdown', () => onPick((selected + s + n) % n));
    root.add(tri);
  }
  const dots = Math.min(n, 10);
  for (let i = 0; i < dots; i++) root.add(scene.add.circle(360 + (i - (dots - 1) / 2) * 24, 88, 7, i === selected ? COLOR.gold : 0x6b6488).setStrokeStyle(3, COLOR.outline));
  return root;
}

/** 원형 큰 바로가기 버튼(전투 버튼 양옆) */
export function roundButton(scene: Phaser.Scene, x: number, y: number, icon: string, opts: { label?: string; alert?: boolean; onClick?: () => void } = {}) {
  const r = 74;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.35).fillCircle(0, 8, r);
  g.fillStyle(COLOR.outline, 1).fillCircle(0, 0, r + 4);
  g.fillStyle(0x4b4170, 1).fillCircle(0, 0, r);
  g.fillStyle(0x2b2442, 1).fillCircle(0, 0, r - 7);
  const items: Phaser.GameObjects.GameObject[] = [g];
  if (scene.textures.exists(icon)) items.push(scene.add.image(0, -8, icon).setDisplaySize(r * 1.25, r * 1.25));
  if (opts.label) items.push(text(scene, 0, r - 16, opts.label, TYPE.caption, COLOR.text, true, true).setOrigin(0.5));
  if (opts.alert) items.push(alertDot(scene, r * 0.62, -r * 0.62, 34));
  const root = scene.add.container(x, y, items).setSize(r * 2, r * 2);
  if (opts.onClick) root.setInteractive({ useHandCursor: true }).on('pointerdown', opts.onClick);
  return root;
}

/** 드래곤이 서는 원형 돌 제단 + 숨 쉬는 용암 빛 고리 */
export function altar(scene: Phaser.Scene, x: number, y: number, w = 420) {
  const g = scene.add.graphics();
  const h = w * 0.26;
  g.fillStyle(0x000000, 0.45).fillEllipse(x, y + 22, w + 40, h + 34);
  g.fillStyle(0x342d46, 1).fillEllipse(x, y + 14, w, h);
  g.fillStyle(0x5a5070, 1).fillEllipse(x, y, w, h);
  g.fillStyle(0x6b6184, 1).fillEllipse(x, y - 4, w * 0.92, h * 0.8);
  g.lineStyle(4, 0x2a2338, 1);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.lineBetween(x + Math.cos(a) * w * 0.34, y - 4 + Math.sin(a) * h * 0.3, x + Math.cos(a) * w * 0.46, y - 4 + Math.sin(a) * h * 0.4);
  }
  g.lineStyle(6, COLOR.ember, 0.9).strokeEllipse(x, y - 4, w * 0.62, h * 0.52);
  const glow = scene.add.ellipse(x, y - 4, w * 0.62, h * 0.52, COLOR.ember, 0.22);
  scene.tweens.add({ targets: glow, alpha: 0.06, yoyo: true, repeat: -1, duration: 1200 });
  return [g, glow];
}

/** 횃불: 돌기둥 + 흔들리는 불꽃 + 은은한 빛 */
export function torch(scene: Phaser.Scene, x: number, y: number) {
  const light = scene.add.circle(x, y - 34, 80, COLOR.ember, 0.12);
  scene.tweens.add({ targets: light, alpha: 0.05, yoyo: true, repeat: -1, duration: 500 });
  const g = scene.add.graphics();
  g.fillStyle(COLOR.outline, 1).fillRoundedRect(x - 26, y - 6, 52, 74, 8);
  g.fillStyle(0x4a4260, 1).fillRoundedRect(x - 22, y - 2, 44, 66, 6);
  g.fillStyle(COLOR.outline, 1).fillRect(x - 34, y - 16, 68, 18);
  g.fillStyle(0x2d273d, 1).fillRect(x - 31, y - 13, 62, 12);
  const flames = [0xff4d00, 0xff9a1f, 0xffe066].map((c, i) => scene.add.ellipse(x, y - 34 + i * 7, 42 - i * 13, 60 - i * 17, c, 0.95));
  flames.forEach((f, i) => scene.tweens.add({ targets: f, scaleY: 1.18, scaleX: 0.86, yoyo: true, repeat: -1, duration: 240 + i * 80, ease: 'Sine.InOut' }));
  return [light, g, ...flames];
}

/** 진행도 상자 패널(시안 형식): 짙은 판 안에 상자 + 초록 막대 + 지점 점 */
export function milestonePanel(scene: Phaser.Scene, y: number, ratio: number, chests: { at: number; icon: string; claimed?: boolean }[], label: string) {
  const root = scene.add.container(0, 0);
  root.add(plate(scene, 360, y, 660, 120, { r: 24 }));
  const x0 = 150;
  const x1 = 640;
  const bar = scene.add.graphics();
  bar.fillStyle(COLOR.outline, 1).fillRoundedRect(x0 - 3, y + 26, x1 - x0 + 6, 20, 10);
  bar.fillStyle(0x151225, 1).fillRoundedRect(x0, y + 29, x1 - x0, 14, 7);
  bar.fillStyle(0x56c93a, 1).fillRoundedRect(x0, y + 29, Math.max(14, (x1 - x0) * Math.min(1, ratio)), 14, 7);
  root.add(bar);
  root.add(text(scene, 82, y + 4, label, TYPE.caption, COLOR.text, true, true).setOrigin(0.5));
  chests.forEach((c) => {
    const cx = x0 + (x1 - x0) * c.at;
    const ready = ratio >= c.at && !c.claimed;
    root.add(scene.add.circle(cx, y + 36, 11, ready ? COLOR.gold : 0xd9d2b0).setStrokeStyle(4, COLOR.outline));
    const img = scene.add.image(cx, y - 16, c.icon).setDisplaySize(78, 78).setAlpha(c.claimed ? 0.45 : 1);
    root.add(img);
    if (ready) {
      scene.tweens.add({ targets: img, y: y - 24, yoyo: true, repeat: -1, duration: 500, ease: 'Sine.InOut' });
      root.add(alertDot(scene, cx + 30, y - 46, 26));
    }
  });
  return root;
}

/** 탭 줄(시안 형식): 선택한 탭은 노란 알약, 나머지는 짙은 판 */
export function tabs(scene: Phaser.Scene, y: number, labels: string[], selected: number, onPick?: (i: number) => void) {
  const root = scene.add.container(0, 0);
  const w = (660 - (labels.length - 1) * 12) / labels.length;
  labels.forEach((l, i) => {
    const x = 30 + w / 2 + i * (w + 12);
    const on = i === selected;
    const g = scene.add.graphics();
    g.fillStyle(COLOR.outline, 1).fillRoundedRect(x - w / 2 - 3, y - 31, w + 6, 62, 22);
    g.fillStyle(on ? COLOR.cta : 0x3a3352, 1).fillRoundedRect(x - w / 2, y - 28, w, 56, 20);
    g.fillStyle(0xffffff, on ? 0.3 : 0.06).fillRoundedRect(x - w / 2 + 6, y - 24, w - 12, 18, 9);
    root.add(g);
    root.add(text(scene, x, y, l, TYPE.caption, on ? COLOR.text : COLOR.textSub, true, on).setOrigin(0.5));
    if (onPick) root.add(scene.add.rectangle(x, y, w, 56, 0xffffff, 0.001).setInteractive({ useHandCursor: true }).on('pointerdown', () => onPick(i)));
  });
  return root;
}
