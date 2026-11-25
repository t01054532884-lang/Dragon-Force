import Phaser from 'phaser';
import type { DragonId } from '../data/dragons';
import { ULT_RULES } from '../data/signature';
import { soundOn, voiceLang } from '../systems/Settings';
import { text } from './kit';
import { COLOR } from './theme';

/**
 * 필살기 컷신(2026-11-25, docs/ULTIMATE.md): 영상 없으면 3초, 영상이 있으면 영상 구간만큼(레드 약 4.25초). 화면을 누르면 바로 섬광(넘기기).
 *   0~0.5초  드래곤이 위로 날아올라 화면 밖으로, 화면이 어두워짐(코드)
 *   0.5~2.5초 공통 하늘 배경에서 필살기 장면 — Higgsfield 영상이 있으면 영상, 없으면 대체 연출(배경 + 드래곤 그림 + 색 효과)
 *   마지막 0.5초 하얀 섬광 → onHit(피해·효과) → 걷히며 onDone
 * 시간은 장면 tween으로만 흐른다(게임 시계·물리는 게임 장면이 멈춰 둠). 화면 고정(scrollFactor 0), 가장 위 깊이.
 */

/**
 * Higgsfield 영상이 들어온 드래곤(public/art/ult/ult-<id>.mp4, scripts/process_art_ult.py)과 쓸 구간(초).
 * 영상 소리(날갯짓·포효·불·폭발 — 언어 상관없음)가 효과음이다. 영상 구간 길이에 따라 컷신이 길어진다(레드 약 4초).
 * 레드(2026-11-25): Seedance 2.5 4초 — 0.6초(화면에 다 들어온 뒤)부터 3.9초(불의 파도가 화면을 덮음)까지.
 * 나머지 18종(2026-11-25 밤): 같은 배경·같은 흐름(왼쪽 위에서 날아듦 → 필살기가 화면을 덮음), 영상마다 장면을 보고 구간을 맞춤.
 */
export const ULT_VIDEO: Partial<Record<DragonId, { from: number; to: number }>> = {
  red: { from: 0.6, to: 3.9 },
  blue: { from: 0.6, to: 3.9 },
  yellow: { from: 0.6, to: 3.9 },
  green: { from: 0.6, to: 3.9 },
  sand: { from: 0.6, to: 3.9 },
  steel: { from: 0.6, to: 3.9 },
  white: { from: 0.6, to: 3.9 },
  black: { from: 0.6, to: 3.9 },
  stone: { from: 0.6, to: 3.9 },
  bloom: { from: 0.6, to: 3.9 },
  howl: { from: 0.6, to: 3.9 },
  wind: { from: 0.6, to: 3.9 },
  water: { from: 0.6, to: 3.9 },
  crimson: { from: 0.6, to: 3.9 },
  mirror: { from: 0.9, to: 3.9 }, // 0.6초엔 드래곤이 아직 반쯤 화면 밖
  chrono: { from: 0.6, to: 3.9 },
  void: { from: 0.6, to: 3.9 },
  aurora: { from: 0.6, to: 3.9 },
  arcane: { from: 0.6, to: 3.9 },
};
export const ULT_VIDEO_READY = Object.keys(ULT_VIDEO) as DragonId[];
/** 필살기 외침 목소리(public/sfx/ult/ult-<id>-ko.mp3 · -en.mp3)가 들어온 드래곤. 효과음은 영상 소리, 이 파일은 언어별 외침 */
export const ULT_AUDIO_READY: DragonId[] = [];
const ultAudioKey = (id: DragonId, lang: 'ko' | 'en') => `ult-${id}-${lang}`;
/** 공통 하늘 배경(public/art/ult/ult-bg.webp, 2026-11-25 Higgsfield) — 대체 연출의 바탕 */
export const ULT_BG_READY = true;

export const ultVideoKey = (id: DragonId) => `ult-${id}`;
/** 영상 소리: 같은 mp4를 소리로 한 번 더 읽는다(Web Audio — 첫 터치로 풀린 소리 장치라 아이폰에서도 확실히 남). 영상 자체는 무음 재생 */
const ultSfxKey = (id: DragonId) => `ult-${id}-sfx`;

/**
 * 섬광 뒤 전장 효과 그림(public/art/ult/ult-fx-<id>.webp, Higgsfield) — 화면 전체를 위→아래로 쓸고 지나감. 레드: 불의 파도.
 * add: 밝은 빛 계열은 더하기(빛나 보임), 어두운 색이 중요한 것(그림자·블랙홀·바위·덩굴·모래)은 보통 섞기 — 더하기면 어두운 부분이 사라진다.
 */
/**
 * motion(2026-11-25 제작자 결정 — 비슷한 4쌍을 움직임부터 다르게): 없으면 위→아래 쓸기(sweep).
 * vortex 가운데 소용돌이(워터) · rift 가운데서 바깥으로 갈라짐(샌드) · circle 마법진 + 빛기둥(아케인) · enclose 양옆에서 조여 옴(블랙)
 */
type FxMotion = 'sweep' | 'vortex' | 'rift' | 'circle' | 'enclose' | 'flame';
const ULT_FX: Partial<Record<DragonId, { add: boolean; motion?: FxMotion }>> = {
  red: { add: true, motion: 'flame' }, blue: { add: true }, yellow: { add: true }, green: { add: false }, sand: { add: true, motion: 'rift' }, steel: { add: false },
  white: { add: true }, black: { add: false, motion: 'enclose' }, stone: { add: false }, bloom: { add: false }, howl: { add: true }, wind: { add: true },
  water: { add: false, motion: 'vortex' }, crimson: { add: true }, mirror: { add: true }, chrono: { add: true }, void: { add: false }, aurora: { add: true }, arcane: { add: true, motion: 'circle' },
};
export const ULT_FX_READY = Object.keys(ULT_FX) as DragonId[];
const ultFxKey = (id: DragonId) => `ult-fx-${id}`;

/**
 * 필살기 전장 효과(섬광이 걷히는 순간 게임 장면이 부른다): 필살기 피해가 화면 전체라 효과도 화면 전체.
 * 그림이 있으면 거대한 파도가 위에서 아래로 화면을 덮으며 지나가고, 지나간 자리에 색 빛이 남았다 사라지며 불씨가 흩날린다.
 * 그림이 없으면 같은 흐름을 색 띠로. 화면 고정(카메라 기준), 깊이는 전투 화면 위·UI 아래.
 */
export function playUltSweep(scene: Phaser.Scene, id: DragonId, color: number, depth: number): void {
  const W = scene.scale.width;
  const H = scene.scale.height;
  const fix = <G extends Phaser.GameObjects.GameObject>(g: G): G => {
    (g as unknown as { setScrollFactor: (n: number) => void }).setScrollFactor(0);
    (g as unknown as { setDepth: (n: number) => void }).setDepth(depth);
    return g;
  };
  const motion = ULT_FX[id]?.motion ?? 'sweep';
  const key = ultFxKey(id);
  if (motion !== 'sweep' && scene.textures.exists(key)) {
    const add = !!ULT_FX[id]?.add;
    if (motion === 'vortex') fxVortex(scene, key, color, add, W, H, fix);
    else if (motion === 'rift') fxRift(scene, key, color, add, W, H, fix);
    else if (motion === 'circle') fxCircle(scene, key, color, add, W, H, fix);
    else if (motion === 'flame') fxFlameWave(scene, key, color, add, W, H, fix);
    else fxEnclose(scene, key, color, add, W, H, fix);
    return;
  }
  const DUR = 750;
  // 지나간 자리의 빛: 위에서부터 차오르는 막(파도 바로 뒤를 따라감)
  const glow = fix(scene.add.rectangle(W / 2, 0, W, 1, color, 0.38).setOrigin(0.5, 0));
  scene.tweens.add({ targets: glow, displayHeight: H, duration: DUR, ease: 'Sine.In' });
  scene.tweens.add({ targets: glow, alpha: 0, delay: DUR, duration: 650, onComplete: () => glow.destroy() });
  // 파도
  let wave: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  if (scene.textures.exists(key)) {
    const im = scene.add.image(W / 2, 0, key);
    im.setScale((W * 1.25) / im.width);
    if (ULT_FX[id]?.add) im.setBlendMode(Phaser.BlendModes.ADD);
    wave = im;
  } else {
    wave = scene.add.rectangle(W / 2, 0, W * 1.2, 260, color, 0.8);
  }
  fix(wave);
  const h = wave.displayHeight;
  wave.setY(-h / 2);
  scene.tweens.add({ targets: wave, y: H + h * 0.15, duration: DUR, ease: 'Sine.In' });
  scene.tweens.add({ targets: wave, alpha: 0, delay: DUR - 200, duration: 380, onComplete: () => wave.destroy() });
  // 불씨: 화면 곳곳에서 파도가 지나갈 때 튀어 올라 사라짐
  for (let i = 0; i < 36; i++) {
    const y = Phaser.Math.Between(80, H - 40);
    const ember = fix(scene.add.circle(Phaser.Math.Between(10, W - 10), y, Phaser.Math.Between(3, 7), i % 3 === 0 ? 0xfff1a8 : color, 0.95));
    ember.setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: ember,
      alpha: { from: 1, to: 0 },
      y: y - Phaser.Math.Between(60, 160),
      delay: (y / H) * DUR,
      duration: Phaser.Math.Between(500, 900),
      ease: 'Quad.Out',
      onComplete: () => ember.destroy(),
    });
  }
}

type Fix = <G extends Phaser.GameObjects.GameObject>(g: G) => G;

/** 화면 전체를 한 번 물들였다 사라지는 색 막 */
function fxTint(scene: Phaser.Scene, color: number, alpha: number, W: number, H: number, fix: Fix, delay = 0, hold = 300): void {
  const r = fix(scene.add.rectangle(W / 2, H / 2, W, H, color, 1).setAlpha(0));
  scene.tweens.add({ targets: r, alpha, delay, duration: 220, yoyo: true, hold, onComplete: () => r.destroy() });
}

/**
 * 레드 불의 파도(제작자 2026-11-25: "너무 단면적, 모션이 있었으면"): 불의 파도 두 겹이 출렁이며(좌우 흔들림·높이 맥동) 내려오고,
 * 파도가 지나간 자리마다 불기둥이 솟았다 꺼지며, 화면이 붉게 달아오르고 흔들린다.
 */
function fxFlameWave(scene: Phaser.Scene, key: string, color: number, add: boolean, W: number, H: number, fix: Fix): void {
  const DUR = 900;
  fxTint(scene, 0xff5a1a, 0.3, W, H, fix, 0, DUR);
  scene.cameras.main.shake(DUR, 0.006);
  // 두 겹 파도: 뒤 겹은 작고 어둡게 조금 늦게, 앞 겹은 크게 — 각각 좌우로 흔들리고 높이가 맥동
  [{ s: 1.0, delay: 140, alpha: 0.55, sway: 26 }, { s: 1.3, delay: 0, alpha: 1, sway: 40 }].forEach((L, i) => {
    const im = fix(scene.add.image(W / 2, 0, key));
    if (add) im.setBlendMode(Phaser.BlendModes.ADD);
    const sc = (W * L.s) / im.width;
    im.setScale(sc).setAlpha(L.alpha);
    const h = im.displayHeight;
    im.setY(-h / 2);
    scene.tweens.add({ targets: im, y: H + h * 0.2, delay: L.delay, duration: DUR, ease: 'Sine.In' });
    scene.tweens.add({ targets: im, x: { from: W / 2 - L.sway, to: W / 2 + L.sway }, duration: 220 + i * 40, yoyo: true, repeat: 3, ease: 'Sine.InOut' });
    scene.tweens.add({ targets: im, scaleY: sc * 1.18, duration: 160 + i * 30, yoyo: true, repeat: 4, ease: 'Sine.InOut' });
    scene.tweens.add({ targets: im, alpha: 0, delay: L.delay + DUR - 220, duration: 380, onComplete: () => im.destroy() });
  });
  // 지나간 자리의 불길 막
  const glow = fix(scene.add.rectangle(W / 2, 0, W, 1, color, 0.32).setOrigin(0.5, 0).setBlendMode(Phaser.BlendModes.ADD));
  scene.tweens.add({ targets: glow, displayHeight: H, duration: DUR, ease: 'Sine.In' });
  scene.tweens.add({ targets: glow, alpha: 0, delay: DUR, duration: 700, onComplete: () => glow.destroy() });
  // 불기둥: 파도가 지나가는 순간 그 높이에서 솟구쳤다 꺼짐(바깥 주황 + 안쪽 노랑)
  for (let i = 0; i < 16; i++) {
    const x = Phaser.Math.Between(20, W - 20), y = Phaser.Math.Between(Math.round(H * 0.15), H - 30);
    // 파도(Sine.In)가 그 높이를 지나는 순간: 1 − cos(p·π/2) = y/H 를 p로 푼 값
    const delay = (Math.acos(1 - Math.min(1, y / H)) / (Math.PI / 2)) * DUR;
    const hgt = Phaser.Math.Between(110, 220);
    const outer = fix(scene.add.ellipse(x, y, 46, hgt, color, 0.85).setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD));
    const inner = fix(scene.add.ellipse(x, y, 18, hgt * 0.7, 0xfff1a8, 0.95).setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD));
    for (const o of [outer, inner]) {
      o.setScale(0.6, 0).setAlpha(0);
      scene.tweens.add({ targets: o, scaleY: 1, scaleX: 1, alpha: 1, delay, duration: 160, ease: 'Back.Out' });
      scene.tweens.add({ targets: o, scaleY: 0.2, scaleX: 0.3, alpha: 0, y: y - hgt * 0.4, delay: delay + 260, duration: 380, ease: 'Quad.In', onComplete: () => o.destroy() });
    }
  }
  // 불씨
  for (let i = 0; i < 40; i++) {
    const y = Phaser.Math.Between(80, H - 40);
    const e = fix(scene.add.circle(Phaser.Math.Between(10, W - 10), y, Phaser.Math.Between(3, 7), i % 3 === 0 ? 0xfff1a8 : color, 0.95));
    e.setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: e, alpha: { from: 1, to: 0 }, y: y - Phaser.Math.Between(80, 200), x: e.x + Phaser.Math.Between(-30, 30), delay: (y / H) * DUR, duration: Phaser.Math.Between(600, 1000), ease: 'Quad.Out', onComplete: () => e.destroy() });
  }
}

/** 워터 심해의 격류: 가운데에 소용돌이가 돌며 커졌다가 안쪽으로 빨려 들어가 사라짐 + 물방울이 가운데로 끌려감 */
function fxVortex(scene: Phaser.Scene, key: string, color: number, add: boolean, W: number, H: number, fix: Fix): void {
  const cx = W / 2, cy = H / 2;
  const im = fix(scene.add.image(cx, cy, key));
  if (add) im.setBlendMode(Phaser.BlendModes.ADD);
  const full = (Math.hypot(W, H) * 1.05) / im.width;
  im.setScale(full * 0.25).setAlpha(0);
  fxTint(scene, color, 0.28, W, H, fix, 0, 600);
  scene.tweens.add({ targets: im, scale: full, alpha: 0.95, angle: 220, duration: 650, ease: 'Sine.Out' });
  scene.tweens.add({ targets: im, scale: full * 0.08, alpha: 0, angle: 560, delay: 700, duration: 650, ease: 'Sine.In', onComplete: () => im.destroy() });
  for (let i = 0; i < 32; i++) {
    const a = Math.random() * Math.PI * 2, d = Phaser.Math.Between(Math.min(W, H) * 0.3, Math.hypot(W, H) * 0.5);
    const p = fix(scene.add.circle(cx + Math.cos(a) * d, cy + Math.sin(a) * d, Phaser.Math.Between(3, 7), i % 3 === 0 ? 0xffffff : color, 0.95));
    p.setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: p, alpha: { from: 1, to: 0 }, x: cx, y: cy, delay: 300 + Math.random() * 500, duration: 700, ease: 'Quad.In', onComplete: () => p.destroy() });
  }
}

/** 샌드 사막의 균열: 가운데서 금빛 균열이 화면 끝까지 퍼지고(흔들림) 땅이 꺼지듯 어두워졌다 걷힘 + 모래 먼지가 솟음 */
function fxRift(scene: Phaser.Scene, key: string, color: number, add: boolean, W: number, H: number, fix: Fix): void {
  const cx = W / 2, cy = H / 2;
  const im = fix(scene.add.image(cx, cy, key));
  if (add) im.setBlendMode(Phaser.BlendModes.ADD);
  const full = (Math.hypot(W, H) * 1.1) / im.width;
  im.setScale(full * 0.05).setAlpha(1).setAngle(Phaser.Math.Between(0, 359));
  scene.tweens.add({ targets: im, scale: full, duration: 420, ease: 'Expo.Out' });
  scene.tweens.add({ targets: im, alpha: 0, delay: 900, duration: 600, onComplete: () => im.destroy() });
  scene.cameras.main.shake(320, 0.01);
  fxTint(scene, 0x3a2408, 0.32, W, H, fix, 250, 400);
  for (let i = 0; i < 30; i++) {
    const x = Phaser.Math.Between(10, W - 10), y = Phaser.Math.Between(60, H - 30);
    const d = Math.hypot(x - cx, y - cy) / Math.hypot(W, H);
    const p = fix(scene.add.circle(x, y, Phaser.Math.Between(4, 9), i % 2 ? color : 0xffe08a, 0.85));
    p.setAlpha(0);
    scene.tweens.add({ targets: p, alpha: { from: 0.9, to: 0 }, y: y - Phaser.Math.Between(50, 130), scale: { from: 0.6, to: 1.6 }, delay: d * 800, duration: Phaser.Math.Between(600, 900), ease: 'Quad.Out', onComplete: () => p.destroy() });
  }
}

/** 아케인 마력 강림: 화면 전체에 마법진이 돌며 펼쳐지고, 여러 곳에 빛기둥이 차례로 내리꽂힘 */
function fxCircle(scene: Phaser.Scene, key: string, color: number, add: boolean, W: number, H: number, fix: Fix): void {
  const cx = W / 2, cy = H / 2;
  const im = fix(scene.add.image(cx, cy, key));
  if (add) im.setBlendMode(Phaser.BlendModes.ADD);
  const full = (Math.max(W, H) * 1.05) / im.width;
  im.setScale(0).setAngle(-120).setAlpha(0.95);
  scene.tweens.add({ targets: im, scale: full, angle: 0, duration: 520, ease: 'Back.Out' });
  scene.tweens.add({ targets: im, angle: 60, duration: 1500, delay: 520 });
  scene.tweens.add({ targets: im, alpha: 0, delay: 1300, duration: 700, onComplete: () => im.destroy() });
  fxTint(scene, color, 0.22, W, H, fix, 200, 700);
  for (let i = 0; i < 14; i++) {
    const x = Phaser.Math.Between(30, W - 30), y = Phaser.Math.Between(Math.round(H * 0.2), H - 40);
    const delay = 380 + i * 60;
    const beam = fix(scene.add.rectangle(x, y, 34, y + 20, color, 0.85).setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD));
    const core = fix(scene.add.rectangle(x, y, 10, y + 20, 0xffffff, 0.95).setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD));
    beam.setScale(0, 1); core.setScale(0, 1);
    scene.tweens.add({ targets: [beam, core], scaleX: 1, delay, duration: 90, yoyo: true, hold: 160, onComplete: () => { beam.destroy(); core.destroy(); } });
    const ring = fix(scene.add.circle(x, y, 18, 0xffffff, 0).setStrokeStyle(4, color, 1).setBlendMode(Phaser.BlendModes.ADD));
    ring.setAlpha(0);
    scene.tweens.add({ targets: ring, alpha: { from: 1, to: 0 }, scale: 3.2, delay: delay + 80, duration: 420, ease: 'Quad.Out', onComplete: () => ring.destroy() });
  }
}

/** 블랙 그림자 포식: 양옆에서 그림자 날개·손아귀가 턱처럼 조여 와 가운데서 맞물리고, 보랏빛이 터지며 흩어짐 */
function fxEnclose(scene: Phaser.Scene, key: string, color: number, add: boolean, W: number, H: number, fix: Fix): void {
  const cx = W / 2, cy = H / 2;
  const mk = (flip: boolean) => {
    const im = fix(scene.add.image(flip ? W : 0, cy, key)).setFlipX(flip).setOrigin(flip ? 0 : 1, 0.5);
    if (add) im.setBlendMode(Phaser.BlendModes.ADD);
    im.setScale((H * 1.1) / im.height);
    return im;
  };
  const L = mk(false), R = mk(true);
  const reach = Math.min(L.displayWidth * 0.12, 60);
  fxTint(scene, 0x12051f, 0.4, W, H, fix, 0, 500);
  scene.tweens.add({ targets: L, x: cx + reach, duration: 480, ease: 'Cubic.In' });
  scene.tweens.add({ targets: R, x: cx - reach, duration: 480, ease: 'Cubic.In' });
  scene.tweens.add({ targets: [L, R], alpha: 0, delay: 650, duration: 550, onComplete: () => { L.destroy(); R.destroy(); } });
  const burst = fix(scene.add.circle(cx, cy, 40, color, 0.9).setBlendMode(Phaser.BlendModes.ADD));
  burst.setAlpha(0);
  scene.tweens.add({ targets: burst, alpha: { from: 1, to: 0 }, scale: 9, delay: 470, duration: 600, ease: 'Quad.Out', onComplete: () => burst.destroy() });
  scene.time.delayedCall(470, () => scene.cameras.main.shake(220, 0.008));
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * Math.PI * 2, d = Phaser.Math.Between(120, Math.round(Math.hypot(W, H) * 0.5));
    const p = fix(scene.add.circle(cx, cy, Phaser.Math.Between(3, 7), i % 3 === 0 ? 0xe6d4ff : color, 0.95));
    p.setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({ targets: p, alpha: { from: 1, to: 0 }, x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, delay: 480, duration: Phaser.Math.Between(500, 800), ease: 'Quad.Out', onComplete: () => p.destroy() });
  }
}

/** 영상이 있으면 컷신 길이 = 날아오름 0.45초 + 영상 구간 + 섬광 0.5초, 없으면 3초 */
export function ultCutsceneMs(id: DragonId, hasVideo: boolean): number {
  const v = ULT_VIDEO[id];
  return hasVideo && v ? Math.round(450 + (v.to - v.from) * 1000 + 500) : ULT_RULES.cutsceneMs;
}

/** 전투 장면 preload에서: 출격한 드래곤 영상·배경만 읽는다(아이폰 메모리) */
export function preloadUlt(scene: Phaser.Scene, id: DragonId): void {
  if (ULT_BG_READY && !scene.textures.exists('ult-bg')) scene.load.image('ult-bg', 'art/ult/ult-bg.webp');
  if (ULT_VIDEO_READY.includes(id) && !scene.cache.video.exists(ultVideoKey(id))) scene.load.video(ultVideoKey(id), `art/ult/ult-${id}.mp4`, true);
  if (ULT_VIDEO_READY.includes(id) && !scene.cache.audio.exists(ultSfxKey(id))) scene.load.audio(ultSfxKey(id), [{ type: 'm4a', url: `art/ult/ult-${id}.mp4` }]);
  if (ULT_FX_READY.includes(id) && !scene.textures.exists(ultFxKey(id))) scene.load.image(ultFxKey(id), `art/ult/ult-fx-${id}.webp`);
  // 설정 언어 것만 읽는다(한국어/English)
  const lang = voiceLang();
  if (ULT_AUDIO_READY.includes(id) && !scene.cache.audio.exists(ultAudioKey(id, lang))) scene.load.audio(ultAudioKey(id, lang), `sfx/ult/ult-${id}-${lang}.mp3`);
}

export interface UltCutsceneOpts {
  dragonId: DragonId;
  name: string;
  color: number;
  /** 드래곤 그림 키(탑다운 또는 도형) */
  dragonKey: string;
  /** 화면에서 드래곤 위치(화면 좌표) */
  from: { x: number; y: number };
  /** 섬광 순간: 피해·효과 */
  onHit: () => void;
  /** 끝: 게임 재개 */
  onDone: () => void;
}

const DEPTH = 5000;

export function playUltCutscene(scene: Phaser.Scene, o: UltCutsceneOpts): void {
  const W = scene.scale.width;
  const H = scene.scale.height;
  const videoKey = ultVideoKey(o.dragonId);
  const clip = ULT_VIDEO[o.dragonId];
  const hasVideo = !!clip && scene.cache.video.exists(videoKey);
  const T = ultCutsceneMs(o.dragonId, hasVideo); // 영상 없으면 3000, 레드 영상 약 4250
  const objs: Phaser.GameObjects.GameObject[] = [];
  const add = <G extends Phaser.GameObjects.GameObject>(g: G): G => {
    (g as unknown as { setScrollFactor: (n: number) => void }).setScrollFactor(0);
    (g as unknown as { setDepth: (n: number) => void }).setDepth(DEPTH + objs.length * 0.01);
    objs.push(g);
    return g;
  };
  // 필살기 소리(효과음 + 외침): 3초 길이, 컷신 시작과 동시에. 파일이 없으면 조용히(전투 효과음은 섬광 때 따로)
  const aKey = ultAudioKey(o.dragonId, voiceLang());
  if (soundOn() && !scene.sound.locked && scene.cache.audio.exists(aKey)) {
    try {
      scene.sound.play(aKey, { volume: 0.9 });
    } catch {
      /* 소리 실패는 무시 */
    }
  }
  // 입력 막기(컷신 중 버튼이 눌리지 않게) + 누르면 넘기기(0.3초 뒤부터, 바로 섬광 → 피해는 똑같이)
  const blocker = add(scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.001).setInteractive());
  const t0 = Date.now(); // 게임 시계는 멈춰 있으므로 실제 시계
  let sfx: Phaser.Sound.BaseSound | null = null;

  // ── 0~0.45초: 어두워지며 드래곤이 위로 날아오름 ──
  const dim = add(scene.add.rectangle(W / 2, H / 2, W, H, 0x05060c, 0));
  scene.tweens.add({ targets: dim, fillAlpha: 0.75, duration: 450 });
  const fly = add(scene.add.image(o.from.x, o.from.y, o.dragonKey).setDisplaySize(110, 110));
  scene.tweens.add({ targets: fly, y: -160, scale: fly.scale * 1.8, duration: 500, ease: 'Quad.In' });

  // ── 0.45초~섬광: 장면(영상이 있으면 영상 구간, 없으면 대체 연출 2초) ──
  const scene2 = scene.add.container(0, 0);
  add(scene2);
  scene2.setAlpha(0);
  let video: Phaser.GameObjects.Video | null = null;
  scene.tweens.add({
    targets: scene2,
    alpha: 1,
    delay: 450,
    duration: 150,
    onStart: () => {
      if (hasVideo && clip) {
        try {
          // 영상 뒤에 같은 하늘 배경: 영상이 시작 구간으로 넘어가기 전 첫 장면(드래곤이 반쯤 잘린)이 비치지 않게 영상은 숨겨 두고 배경부터
          if (scene.textures.exists('ult-bg')) {
            const bg = scene.add.image(W / 2, H / 2, 'ult-bg');
            bg.setScale(Math.max(W / bg.width, H / bg.height));
            scene2.add(bg);
          }
          video = scene.add.video(W / 2, H / 2, videoKey);
          scene2.add(video);
          video.setMute(true).setVisible(false);
          video.play(false, clip.from, clip.to);
          const showWhenReady = () => {
            if (!video || !video.active) return scene.events.off('update', showWhenReady);
            if (video.getCurrentTime() >= clip.from - 0.05) {
              video.setVisible(true);
              scene.events.off('update', showWhenReady);
            }
          };
          scene.events.on('update', showWhenReady);
          // 화면을 덮게(세로 9:16 영상, 긴 화면이면 위아래 기준으로 키움)
          const fit = () => {
            const vw = video!.width || 720;
            const vh = video!.height || 1280;
            const s = Math.max(W / vw, H / vh);
            video!.setScale(s);
          };
          fit();
          video.once('created', fit);
          // 영상 소리(효과음): 같은 구간부터
          const sk = ultSfxKey(o.dragonId);
          if (soundOn() && !scene.sound.locked && scene.cache.audio.exists(sk)) {
            try {
              sfx = scene.sound.add(sk, { volume: 0.9 });
              sfx.play({ seek: clip.from });
            } catch {
              sfx = null;
            }
          }
          return;
        } catch {
          video = null;
        }
      }
      drawFallback(scene, scene2, o, W, H);
    },
  });

  // 필살기 이름 띠
  const banner = add(text(scene, W / 2, H * 0.78, o.name, 64, COLOR.text, true, true).setOrigin(0.5).setAlpha(0));
  scene.tweens.add({ targets: banner, alpha: 1, scale: { from: 1.4, to: 1 }, delay: 650, duration: 260, ease: 'Back.Out' });
  const bannerOut = scene.tweens.add({ targets: banner, alpha: 0, delay: T - 650, duration: 200 });

  // ── 마지막 0.5초: 섬광 → 피해 → 걷힘 ──
  const flash = add(scene.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0));
  let flashed = false;
  const doFlash = (skipped: boolean) => {
    if (flashed) return;
    flashed = true;
    if (skipped) {
      bannerOut.stop();
      banner.setAlpha(0);
      sfx?.stop(); // 넘기면 영상 소리도 끊고 섬광 때 전투 효과음만
    }
    // 자연스러운 복귀(제작자 11/25 "3D 컷신 유지, 자연스럽게"): 하얗게 다 덮지 않고 밝게 번쩍인 뒤,
    // 영상 마지막 장면이 멈춘 채 전장 위로 녹아 사라진다 — 그 아래에서 이미 전장 효과(같은 색 파도)가 쓸고 지나가는 중.
    scene.tweens.add({
      targets: flash,
      fillAlpha: 0.7,
      duration: 160,
      onComplete: () => {
        fly.setVisible(false);
        if (video) video.pause();
        o.onHit();
        scene.tweens.add({ targets: [scene2, banner], alpha: 0, duration: 480, ease: 'Sine.In' });
        scene.tweens.add({ targets: dim, fillAlpha: 0, duration: 380 });
        scene.tweens.add({
          targets: flash,
          fillAlpha: 0,
          duration: 480,
          onComplete: () => {
            if (video) video.stop();
            objs.forEach((g) => g.destroy());
            // 영상 소리는 끝까지(폭발 꼬리) 울리고 스스로 정리
            if (sfx?.isPlaying) sfx.once('complete', () => sfx?.destroy());
            else sfx?.destroy();
            o.onDone();
          },
        });
      },
    });
  };
  scene.tweens.addCounter({ from: 0, to: 1, duration: 1, delay: T - 500, onComplete: () => doFlash(false) });
  blocker.on('pointerdown', () => {
    if (Date.now() - t0 > 300) doFlash(true);
  });
}

/** 영상이 아직 없는 드래곤: 공통 배경(없으면 노을 하늘 그라데이션) + 드래곤이 위에서 내려다보며 색 효과를 쏟아붓는 장면 */
function drawFallback(scene: Phaser.Scene, c: Phaser.GameObjects.Container, o: UltCutsceneOpts, W: number, H: number): void {
  if (scene.textures.exists('ult-bg')) {
    const bg = scene.add.image(W / 2, H / 2, 'ult-bg');
    bg.setScale(Math.max(W / bg.width, H / bg.height));
    c.add(bg);
  } else {
    // 해 질 녘 구름 위 하늘(위 남색 → 아래 보라·주황) + 구름 띠
    const g = scene.add.graphics();
    const steps = 24;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const col = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(t < 0.6 ? 0x141a3d : 0x4a2a6b),
        Phaser.Display.Color.ValueToColor(t < 0.6 ? 0x4a2a6b : 0xd9784a),
        100,
        Math.round(((t < 0.6 ? t / 0.6 : (t - 0.6) / 0.4)) * 100),
      );
      g.fillStyle(Phaser.Display.Color.GetColor(col.r, col.g, col.b), 1).fillRect(0, (H * i) / steps, W, H / steps + 1);
    }
    for (let k = 0; k < 9; k++) {
      g.fillStyle(0xf3d9e6, 0.12 + (k % 3) * 0.04).fillEllipse((W * (k % 5)) / 4, H * (0.62 + 0.05 * Math.floor(k / 3)), 420, 90);
    }
    c.add(g);
  }
  // 드래곤: 위에서 크게 내려오며 숨을 내쉼
  const d = scene.add.image(W / 2, -120, o.dragonKey).setDisplaySize(300, 300);
  c.add(d);
  scene.tweens.add({ targets: d, y: H * 0.24, duration: 420, ease: 'Back.Out' });
  scene.tweens.add({ targets: d, scale: d.scale * 1.08, delay: 420, duration: 600, yoyo: true, repeat: 1, ease: 'Sine.InOut' });
  // 색 효과: 드래곤 입에서 아래로 넓어지며 쏟아지는 줄기(화면 아래 전장 쪽으로)
  for (let i = 0; i < 26; i++) {
    const x = W / 2 + (Math.random() - 0.5) * 60;
    const streak = scene.add.rectangle(x, H * 0.3, 18 + Math.random() * 26, 80 + Math.random() * 120, o.color, 0.85);
    streak.setAlpha(0);
    c.add(streak);
    const tx = W / 2 + (Math.random() - 0.5) * W * 1.2;
    scene.tweens.add({
      targets: streak,
      x: tx,
      y: H * (0.85 + Math.random() * 0.25),
      angle: Phaser.Math.RadToDeg(Math.atan2(H * 0.6, tx - x)) - 90,
      alpha: { from: 0.95, to: 0.2 },
      scaleY: 2.2,
      delay: 450 + i * 45,
      duration: 520,
      ease: 'Quad.In',
    });
  }
  // 바닥 쪽에 번지는 빛
  const glow = scene.add.ellipse(W / 2, H * 0.92, W * 1.4, H * 0.35, o.color, 0);
  c.add(glow);
  scene.tweens.add({ targets: glow, fillAlpha: 0.55, delay: 900, duration: 700, ease: 'Sine.Out' });
}
