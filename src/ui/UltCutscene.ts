import Phaser from 'phaser';
import type { DragonId } from '../data/dragons';
import { ULT_RULES } from '../data/signature';
import { text } from './kit';
import { COLOR } from './theme';

/**
 * 필살기 3초 컷신(2026-11-25, docs/ULTIMATE.md).
 *   0~0.5초  드래곤이 위로 날아올라 화면 밖으로, 화면이 어두워짐(코드)
 *   0.5~2.5초 공통 하늘 배경에서 필살기 장면 — Higgsfield 영상이 있으면 영상, 없으면 대체 연출(배경 + 드래곤 그림 + 색 효과)
 *   2.5~3초  하얀 섬광 → onHit(피해·효과) → 걷히며 onDone
 * 시간은 장면 tween으로만 흐른다(게임 시계·물리는 게임 장면이 멈춰 둠). 화면 고정(scrollFactor 0), 가장 위 깊이.
 */

/** Higgsfield 영상이 들어온 드래곤(public/art/ult/ult-<id>.mp4). 받는 대로 번호를 적는다 */
export const ULT_VIDEO_READY: DragonId[] = [];
/** 공통 하늘 배경(public/art/ult/ult-bg.webp)이 들어왔는지 — 대체 연출의 바탕 */
export const ULT_BG_READY = false;

export const ultVideoKey = (id: DragonId) => `ult-${id}`;

/** 전투 장면 preload에서: 출격한 드래곤 영상·배경만 읽는다(아이폰 메모리) */
export function preloadUlt(scene: Phaser.Scene, id: DragonId): void {
  if (ULT_BG_READY && !scene.textures.exists('ult-bg')) scene.load.image('ult-bg', 'art/ult/ult-bg.webp');
  if (ULT_VIDEO_READY.includes(id) && !scene.cache.video.exists(ultVideoKey(id))) scene.load.video(ultVideoKey(id), `art/ult/ult-${id}.mp4`, true);
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
  const T = ULT_RULES.cutsceneMs; // 3000
  const objs: Phaser.GameObjects.GameObject[] = [];
  const add = <G extends Phaser.GameObjects.GameObject>(g: G): G => {
    (g as unknown as { setScrollFactor: (n: number) => void }).setScrollFactor(0);
    (g as unknown as { setDepth: (n: number) => void }).setDepth(DEPTH + objs.length * 0.01);
    objs.push(g);
    return g;
  };
  // 입력 막기(컷신 중 버튼이 눌리지 않게)
  add(scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.001).setInteractive());

  // ── 0~0.5초: 어두워지며 드래곤이 위로 날아오름 ──
  const dim = add(scene.add.rectangle(W / 2, H / 2, W, H, 0x05060c, 0));
  scene.tweens.add({ targets: dim, fillAlpha: 0.75, duration: 450 });
  const fly = add(scene.add.image(o.from.x, o.from.y, o.dragonKey).setDisplaySize(110, 110));
  scene.tweens.add({ targets: fly, y: -160, scale: fly.scale * 1.8, duration: 500, ease: 'Quad.In' });

  // ── 0.5~2.5초: 장면 ──
  const scene2 = scene.add.container(0, 0);
  add(scene2);
  scene2.setAlpha(0);
  const videoKey = ultVideoKey(o.dragonId);
  let video: Phaser.GameObjects.Video | null = null;
  scene.tweens.add({
    targets: scene2,
    alpha: 1,
    delay: 450,
    duration: 150,
    onStart: () => {
      if (scene.cache.video.exists(videoKey)) {
        try {
          video = scene.add.video(W / 2, H / 2, videoKey);
          scene2.add(video);
          video.setMute(true);
          video.play(false);
          // 화면을 덮게(세로 9:16 영상, 긴 화면이면 위아래 기준으로 키움)
          const fit = () => {
            const vw = video!.width || 720;
            const vh = video!.height || 1280;
            const s = Math.max(W / vw, H / vh);
            video!.setScale(s);
          };
          fit();
          video.once('created', fit);
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
  scene.tweens.add({ targets: banner, alpha: 0, delay: T - 650, duration: 200 });

  // ── 2.5~3초: 섬광 → 피해 → 걷힘 ──
  const flash = add(scene.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0));
  scene.tweens.add({
    targets: flash,
    fillAlpha: 1,
    delay: T - 500,
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
          o.onDone();
        },
      });
    },
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
