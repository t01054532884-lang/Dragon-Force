import Phaser from 'phaser';
import { DRAGONS, ELEMENT_LABEL, RARITY_COLOR, type DragonId } from '../data/dragons';
import { SIGNATURES } from '../data/signature';
import { playSfx } from '../systems/Sfx';
import { button, text } from './kit';
import { plate } from './kit2';
import { COLOR, TYPE } from './theme';
import { fullH } from './layout';
import type { RewardBundle } from '../data/economy';

// 보상 획득 팝업 · 드래곤 해금 축하(2026-11-21 종합 개선 기획서 12·13장).
// 그림이 오면(그림·소리 요청서 5) frame-<등급>·sigil-<속성>·fx-unlock-rays를 쓰고, 없으면 도형으로 그린다.

export type Grade = 'common' | 'rare' | 'epic' | 'legendary';
export const GRADE_COLOR: Record<Grade, number> = { common: 0x9aa4b8, rare: RARITY_COLOR.rare, epic: RARITY_COLOR.epic, legendary: RARITY_COLOR.legendary };

export interface RewardItem {
  /** 그림 키(ui-gold 등). 없으면 emoji */
  image?: string;
  emoji?: string;
  portrait?: DragonId;
  label: string;
  amount?: string;
  grade?: Grade;
}

const DEPTH = 300;

/**
 * 보상 획득 팝업: 배경을 어둡게 → 리본 제목 → 가운데 보상 카드(등급 테두리·수량) → 터치 또는 확인으로 닫기.
 * 여러 개(일괄 수령)는 한 화면에 모아서 보여 준다. 희귀 이상이 있으면 빛과 다른 소리.
 */
export function rewardPopup(scene: Phaser.Scene, title: string, items: RewardItem[], onClose?: () => void): void {
  const layer: Phaser.GameObjects.GameObject[] = [];
  const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
    layer.push(o);
    (o as unknown as { setDepth: (n: number) => void }).setDepth(DEPTH);
    return o;
  };
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    scene.tweens.add({ targets: layer, alpha: 0, duration: 140, onComplete: () => layer.forEach((o) => o.destroy()) });
    onClose?.();
  };
  const bg = add(scene.add.rectangle(360, 640, 720, fullH(scene), 0x05040a, 0.85).setInteractive());
  bg.on('pointerdown', () => scene.time.delayedCall(250, close));
  const rare = items.some((i) => i.grade && i.grade !== 'common');
  playSfx(scene, 'sfx-claim');
  scene.time.delayedCall(120, () => playSfx(scene, rare ? 'sfx-reward-rare' : 'sfx-reward'));
  // 뒤에서 도는 빛줄기
  ensureRays(scene);
  const rays = add(scene.add.image(360, 600, 'fx-unlock-rays').setAlpha(rare ? 0.55 : 0.3).setDisplaySize(900, 900));
  scene.tweens.add({ targets: rays, angle: 360, duration: 14000, repeat: -1 });
  const cols = Math.min(4, items.length);
  const rows = Math.ceil(items.length / 4);
  const panelH = Math.max(420, 200 + rows * 220);
  add(plate(scene, 360, 640, 660, panelH, { r: 28, gold: rare }));
  const rb = add(scene.add.container(360, 640 - panelH / 2, []));
  rb.add(plate(scene, 0, 0, 380, 70, { r: 35, gold: true, fill: 0x3a2a6b }));
  rb.add(text(scene, 0, 0, title, TYPE.heading, COLOR.gold, true, true).setOrigin(0.5));
  items.forEach((it, i) => {
    const row = Math.floor(i / 4);
    const inRow = row === rows - 1 ? items.length - row * 4 : cols;
    const x = 360 + (i % 4 - (inRow - 1) / 2) * 150;
    const y = 640 - panelH / 2 + 160 + row * 220;
    const card = add(scene.add.container(x, y));
    const color = GRADE_COLOR[it.grade ?? 'common'];
    const frameKey = `frame-${it.grade ?? 'common'}`;
    // 테두리 그림(요청서 6 ④, 3:4): 테두리가 두꺼워 아래 수량 글자가 걸리지 않게 도형보다 조금 크게
    if (scene.textures.exists(frameKey)) card.add(scene.add.image(0, 2, frameKey).setDisplaySize(142, 190));
    else {
      const g = scene.add.graphics();
      g.fillStyle(0x221a33, 1).fillRoundedRect(-64, -86, 128, 172, 16);
      g.lineStyle(5, color, 1).strokeRoundedRect(-64, -86, 128, 172, 16);
      card.add(g);
    }
    if (it.grade && it.grade !== 'common') {
      const glow = scene.add.circle(0, -20, 54, color, 0.25);
      card.addAt(glow, 0);
      scene.tweens.add({ targets: glow, scale: 1.25, alpha: 0.05, duration: 700, yoyo: true, repeat: -1 });
    }
    if (it.portrait) card.add(scene.add.image(0, -22, `portrait-${it.portrait}`).setDisplaySize(88, 88));
    else if (it.image && scene.textures.exists(it.image)) card.add(scene.add.image(0, -22, it.image).setDisplaySize(76, 76));
    else card.add(text(scene, 0, -22, it.emoji ?? '🎁', 46).setOrigin(0.5));
    card.add(text(scene, 0, 36, it.label, 16, COLOR.text, true, true).setOrigin(0.5).setWordWrapWidth(120).setAlign('center'));
    if (it.amount) card.add(text(scene, 0, 66, it.amount, 20, color === GRADE_COLOR.common ? COLOR.gold : color, true, true).setOrigin(0.5));
    // 처음부터 보이게(커지는 연출만) — 연출이 멈춘 화면·백그라운드 탭에서 내용이 비어 보이던 문제(2026-11-23 제보)
    card.setScale(0.7);
    scene.tweens.add({ targets: card, scale: 1, duration: 220, delay: 80 + i * 70, ease: 'Back.Out' });
  });
  const ok = button(scene, 360, 640 + panelH / 2 - 62, 300, 76, '확인', close, { kind: 'cta', size: TYPE.body });
  add(ok.root);
  add(text(scene, 360, 640 + panelH / 2 + 34, '화면을 눌러도 닫혀요', TYPE.tiny, COLOR.textSub, true).setOrigin(0.5));
}

/**
 * 새 드래곤 해금 축하(13장): 빛 → 속성 문양 → 드래곤 등장 → 이름·희귀도 → 전용 스킬 소개 → 확인/드래곤 보기.
 * 약 2.5초, 화면을 누르면 바로 끝 상태로 건너뛴다. 여러 마리면 차례로.
 */
export function dragonUnlock(scene: Phaser.Scene, ids: DragonId[], onDone?: () => void): void {
  if (!ids.length) {
    onDone?.();
    return;
  }
  const [id, ...rest] = ids;
  const d = DRAGONS[id];
  const sig = SIGNATURES[id];
  const layer: Phaser.GameObjects.GameObject[] = [];
  const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
    layer.push(o);
    (o as unknown as { setDepth: (n: number) => void }).setDepth(DEPTH + 10);
    return o;
  };
  const tweens: Phaser.Tweens.Tween[] = [];
  const tw = (cfg: Phaser.Types.Tweens.TweenBuilderConfig) => tweens.push(scene.tweens.add(cfg));
  playSfx(scene, 'sfx-dragon-unlock');
  const bg = add(scene.add.rectangle(360, 640, 720, fullH(scene), 0x05040a, 0.92).setInteractive());
  ensureRays(scene);
  const rays = add(scene.add.image(360, 520, 'fx-unlock-rays').setDisplaySize(1000, 1000).setAlpha(0).setTint(d.color));
  tw({ targets: rays, alpha: 0.4, duration: 400 });
  scene.tweens.add({ targets: rays, angle: 360, duration: 12000, repeat: -1 });
  const sigilKey = `sigil-${d.element}`;
  ensureSigil(scene, sigilKey, d.color, d.accent);
  const sigil = add(scene.add.image(360, 520, sigilKey).setDisplaySize(440, 440).setAlpha(0).setScale(0.2));
  tw({ targets: sigil, alpha: 0.9, scale: (440 / sigil.width) || 1, duration: 500, delay: 200, ease: 'Back.Out' });
  scene.tweens.add({ targets: sigil, angle: -360, duration: 20000, repeat: -1 });
  const por = add(scene.add.image(360, 520, `portrait-${id}`).setDisplaySize(300, 300).setAlpha(0));
  const s0 = por.scale;
  por.setScale(s0 * 0.3);
  tw({ targets: por, alpha: 1, scale: s0, duration: 450, delay: 700, ease: 'Back.Out' });
  const newTag = add(text(scene, 360, 250, '새 드래곤!', TYPE.title, COLOR.gold, true, true).setOrigin(0.5).setAlpha(0));
  const name = add(text(scene, 360, 760, d.name, TYPE.title, COLOR.text, true, true).setOrigin(0.5).setAlpha(0));
  const rarityLabel = { starter: '기본', common: '일반', rare: '희귀', epic: '영웅', legendary: '전설' }[d.rarity];
  const meta = add(text(scene, 360, 815, `${rarityLabel} · ${ELEMENT_LABEL[d.element]} · ${d.role}`, TYPE.caption, RARITY_COLOR[d.rarity], true, true).setOrigin(0.5).setAlpha(0));
  const box = add(plate(scene, 360, 935, 600, 150, { r: 22 }).setAlpha(0));
  const sigKey = `sig-${id}`;
  const hasSigArt = scene.textures.exists(sigKey);
  const sigTitle = text(scene, hasSigArt ? 24 : 0, -40, `${hasSigArt ? '' : `${sig.icon} `}전용 스킬 · ${sig.name}`, TYPE.body, COLOR.gold, true, true).setOrigin(0.5);
  box.add(sigTitle);
  if (hasSigArt) box.add(scene.add.image(24 - sigTitle.width / 2 - 30, -40, sigKey).setDisplaySize(48, 48));
  box.add(text(scene, 0, 16, sig.detail, 17, COLOR.textSub, true).setOrigin(0.5).setWordWrapWidth(560).setAlign('center'));
  [newTag, name, meta, box].forEach((o, i) => tw({ targets: o, alpha: 1, duration: 260, delay: 1100 + i * 180 }));
  let closed = false;
  const finish = (go: boolean) => {
    if (closed) return;
    closed = true;
    scene.tweens.add({ targets: layer, alpha: 0, duration: 160, onComplete: () => layer.forEach((o) => o.destroy()) });
    if (go) scene.scene.start('dragons', { view: id });
    else dragonUnlock(scene, rest, onDone);
  };
  const ok = button(scene, 230, 1090, 250, 80, '확인', () => finish(false), { kind: 'secondary', size: TYPE.body });
  const look = button(scene, 490, 1090, 250, 80, '드래곤 보기', () => finish(true), { kind: 'cta', size: TYPE.body });
  add(ok.root).setAlpha(0);
  add(look.root).setAlpha(0);
  tw({ targets: [ok.root, look.root], alpha: 1, duration: 200, delay: 1800 });
  // 건너뛰기: 화면을 누르면 모든 등장 효과를 끝 상태로
  bg.on('pointerdown', () => tweens.forEach((t) => t.isPlaying() && t.complete()));
}

/** 금빛 빛줄기(그림이 없을 때 도형) */
function ensureRays(scene: Phaser.Scene): void {
  if (scene.textures.exists('fx-unlock-rays')) return;
  const g = scene.make.graphics({}, false);
  const c = 256;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.fillStyle(0xffe08a, i % 2 ? 0.35 : 0.6).slice(c, c, 256, a - 0.07, a + 0.07, false).fillPath();
  }
  g.fillStyle(0xfff3c4, 0.5).fillCircle(c, c, 60);
  g.generateTexture('fx-unlock-rays', 512, 512);
  g.destroy();
}

/** 속성 문양(그림이 없을 때 도형: 이중 원 + 별 꼭짓점) */
function ensureSigil(scene: Phaser.Scene, key: string, color: number, accent: number): void {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({}, false);
  const c = 256;
  g.lineStyle(10, 0xffd34d, 0.9).strokeCircle(c, c, 240);
  g.lineStyle(6, color, 0.9).strokeCircle(c, c, 205);
  g.lineStyle(4, accent, 0.8).strokeCircle(c, c, 150);
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    pts.push(new Phaser.Math.Vector2(c + Math.cos(a) * 205, c + Math.sin(a) * 205));
  }
  g.lineStyle(4, color, 0.8);
  for (let i = 0; i < 6; i++) g.lineBetween(pts[i].x, pts[i].y, pts[(i + 2) % 6].x, pts[(i + 2) % 6].y);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.fillStyle(0xffd34d, 1).fillCircle(c + Math.cos(a) * 240, c + Math.sin(a) * 240, 8);
  }
  g.generateTexture(key, 512, 512);
  g.destroy();
}

/** 보상 묶음(골드·루비·조각) → 보상 팝업 한 칸 */
export function bundleItem(b: RewardBundle): RewardItem {
  if (b.gold) return { image: 'ui-gold', emoji: '🪙', label: '골드', amount: `+${b.gold.toLocaleString()}` };
  if (b.rubies) return { image: 'ui-ruby', emoji: '💎', label: '루비', amount: `+${b.rubies.toLocaleString()}`, grade: 'epic' };
  if (b.fragments) return { portrait: b.fragments.dragonId, label: `${DRAGONS[b.fragments.dragonId].short} 조각`, amount: `+${b.fragments.count}`, grade: 'rare' };
  return { emoji: '🎁', label: '보상' };
}

/**
 * 작은 상자 개봉 연출(로비 진행도 상자, 2026-11-22): 상자가 가운데로 날아와 커짐 → 세 번 흔들림 → 빛 터짐 → onDone(보상 팝업).
 * 화면 아무 곳이나 누르면 건너뜀. 보상은 연출 전에 이미 지급(연출 도중 앱을 꺼도 잃지 않음).
 */
export function openSmallChest(scene: Phaser.Scene, fromX: number, fromY: number, tex: string, onDone: () => void): void {
  const D = DEPTH - 10;
  const objs: Phaser.GameObjects.GameObject[] = [];
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    objs.forEach((o) => o.destroy());
    onDone();
  };
  const dim = scene.add.rectangle(360, 640, 720, fullH(scene) + 400, 0x05030a, 0).setDepth(D).setInteractive();
  dim.on('pointerdown', finish);
  objs.push(dim);
  scene.tweens.add({ targets: dim, fillAlpha: 0.8, duration: 250 });
  const glow = scene.add.circle(360, 600, 160, 0xffd34d, 0).setDepth(D + 1).setBlendMode(Phaser.BlendModes.ADD);
  objs.push(glow);
  const chest = scene.textures.exists(tex)
    ? scene.add.image(fromX, fromY, tex).setDisplaySize(62, 62)
    : scene.add.rectangle(fromX, fromY, 50, 44, 0x8d6e63);
  chest.setDepth(D + 2);
  objs.push(chest);
  const big = (chest.scaleX * 300) / 62;
  playSfx(scene, 'sfx-ui-confirm');
  scene.tweens.add({
    targets: chest, x: 360, y: 600, scaleX: big, scaleY: big, duration: 420, ease: 'Back.Out',
    onComplete: () => {
      playSfx(scene, 'sfx-chest-shake');
      scene.tweens.add({ targets: chest, angle: { from: -8, to: 8 }, duration: 90, yoyo: true, repeat: 3, onComplete: () => {
        if (finished) return;
        chest.setAngle(0);
        playSfx(scene, 'sfx-chest-open');
        scene.cameras.main.flash(180, 255, 240, 200);
        scene.tweens.add({ targets: glow, fillAlpha: 0.7, scale: 2.4, duration: 300, yoyo: true });
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const sp = scene.add.circle(360, 600, 7, i % 2 ? 0xffd34d : 0xfff3c4).setDepth(D + 3);
          objs.push(sp);
          scene.tweens.add({ targets: sp, x: 360 + Math.cos(a) * 260, y: 600 + Math.sin(a) * 260, alpha: 0, duration: 520, ease: 'Quad.Out' });
        }
        scene.tweens.add({ targets: chest, scaleX: big * 1.15, scaleY: big * 1.15, alpha: 0, duration: 380, delay: 120, onComplete: () => scene.time.delayedCall(120, finish) });
      } });
    },
  });
}
