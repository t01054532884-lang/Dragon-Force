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
 */
export const ULT_VIDEO: Partial<Record<DragonId, { from: number; to: number }>> = { red: { from: 0.6, to: 3.9 } };
export const ULT_VIDEO_READY = Object.keys(ULT_VIDEO) as DragonId[];
/** 필살기 외침 목소리(public/sfx/ult/ult-<id>-ko.mp3 · -en.mp3)가 들어온 드래곤. 효과음은 영상 소리, 이 파일은 언어별 외침 */
export const ULT_AUDIO_READY: DragonId[] = [];
const ultAudioKey = (id: DragonId, lang: 'ko' | 'en') => `ult-${id}-${lang}`;
/** 공통 하늘 배경(public/art/ult/ult-bg.webp, 2026-11-25 Higgsfield) — 대체 연출의 바탕 */
export const ULT_BG_READY = true;

export const ultVideoKey = (id: DragonId) => `ult-${id}`;
/** 영상 소리: 같은 mp4를 소리로 한 번 더 읽는다(Web Audio — 첫 터치로 풀린 소리 장치라 아이폰에서도 확실히 남). 영상 자체는 무음 재생 */
const ultSfxKey = (id: DragonId) => `ult-${id}-sfx`;

/** 섬광 뒤 전장 효과 그림(public/art/ult/ult-fx-<id>.webp, Higgsfield) — 화면 전체를 위→아래로 쓸고 지나감. 레드: 불의 파도 */
export const ULT_FX_READY: DragonId[] = ['red'];
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
  const DUR = 750;
  // 지나간 자리의 빛: 위에서부터 차오르는 막(파도 바로 뒤를 따라감)
  const glow = fix(scene.add.rectangle(W / 2, 0, W, 1, color, 0.38).setOrigin(0.5, 0));
  scene.tweens.add({ targets: glow, displayHeight: H, duration: DUR, ease: 'Sine.In' });
  scene.tweens.add({ targets: glow, alpha: 0, delay: DUR, duration: 650, onComplete: () => glow.destroy() });
  // 파도
  const key = ultFxKey(id);
  let wave: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  if (scene.textures.exists(key)) {
    const im = scene.add.image(W / 2, 0, key);
    im.setScale((W * 1.25) / im.width).setBlendMode(Phaser.BlendModes.ADD);
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
    scene.tweens.add({
      targets: flash,
      fillAlpha: 1,
      duration: 160,
      onComplete: () => {
        scene2.setVisible(false);
        dim.setVisible(false);
        fly.setVisible(false);
        if (video) video.stop();
        o.onHit();
        scene.tweens.add({
          targets: flash,
          fillAlpha: 0,
          duration: 340,
          onComplete: () => {
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
