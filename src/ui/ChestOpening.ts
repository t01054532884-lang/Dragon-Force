import Phaser from 'phaser';
import { playSfx } from '../systems/Sfx';
import type { BoxId, Rarity } from '../data/economy';
import { CHEST_FX, CHEST_INNER, CHEST_MOUTH_Y, CHEST_SFX, INNER_BASE_Y, openingTier, type ChestTierFx } from '../data/chestFx';
import type { BoxResult } from '../systems/Progress';
import { FONT } from './widgets';

/**
 * 상자 개봉 연출(공통): 흔들림 → 뚜껑 열림 → 빛·파티클 폭발 → (onReveal로) 보상 카드 등장 → 결과 확인.
 *
 * - 그림은 층으로 나눈다: 상자 본체 `chest-<상자>-body`, 뚜껑 `chest-<상자>-lid`.
 *   그림 파일이 없으면 같은 키로 도형 임시 그림을 만든다(파일이 들어오면 코드 수정 없이 바뀜).
 * - 빛·파티클·화면 진동·소리는 코드로 만든다. 등급별 차이는 `CHEST_FX` 수치뿐.
 * - 보상은 이미 확정·저장된 결과를 받기만 한다. skip()이나 장면 이탈은 화면만 정리한다.
 */
export class ChestOpening {
  private objs: Phaser.GameObjects.GameObject[] = [];
  private timers: Phaser.Time.TimerEvent[] = [];
  private done = false;
  private fx: ChestTierFx;
  readonly tier: Rarity;

  constructor(
    private scene: Phaser.Scene,
    private box: BoxId,
    results: BoxResult[],
    private onReveal: () => void, // 카드 등장(결과 화면) — 정확히 한 번 불린다
    private depth = 500,
  ) {
    this.tier = openingTier(results);
    this.fx = CHEST_FX[this.tier];
    ensureChestTextures(scene, box);
  }

  private add<T extends Phaser.GameObjects.GameObject & { setDepth: (n: number) => T }>(o: T, dz = 0): T {
    this.objs.push(o);
    return o.setDepth(this.depth + dz);
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(this.scene.time.delayedCall(ms, () => !this.done && fn()));
  }

  play(): void {
    const s = this.scene;
    const fx = this.fx;
    const cx = 360;
    const cy = 620;
    // 어두운 배경 + 건너뛰기(아무 곳이나 눌러도 건너뜀)
    const dim = this.add(s.add.rectangle(360, 640, 720, 1280, 0x05030a, 0.82));
    dim.setInteractive().on('pointerdown', () => this.skip());
    const skip = this.add(s.add.text(690, 1240, '건너뛰기 ▶▶', { fontFamily: FONT, fontSize: '24px', color: '#c9bfe0' }).setOrigin(1, 1), 10);
    skip.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.skip());

    const glow = this.add(s.add.circle(cx, cy, 150, fx.color, 0), 1);
    // 본체와 뚜껑은 같은 크기 캔버스(정사각)에 제자리로 그려 두고 같은 좌표에 겹친다(그림 파일도 같은 규칙)
    const body = this.add(s.add.image(cx, cy, `chest-${this.box}-body`).setScale(0.2), 3);
    const lid = this.add(s.add.image(cx, cy, `chest-${this.box}-lid`).setScale(0.2), 4);
    const size = 300; // 화면에서 상자 폭(논리 px). 그림은 2배(600)로 받는 것을 권장
    const k = size / body.width;
    const parts = [body, lid];

    // 0) 등장: 툭 튀어나옴
    s.tweens.add({ targets: parts, scale: k, duration: 260, ease: 'Back.Out' });
    // 1) 흔들림(등급이 높을수록 많이·빠르게) + 틈새 빛이 점점 강해짐
    let t = 320;
    for (let i = 0; i < fx.shakes; i++) {
      const strength = 0.05 + (i / Math.max(1, fx.shakes - 1)) * 0.07;
      this.later(t, () => {
        s.tweens.add({ targets: parts, angle: { from: -strength * 57, to: strength * 57 }, duration: fx.shakeMs / 2, yoyo: true, ease: 'Sine.InOut' });
        s.tweens.add({ targets: glow, fillAlpha: 0.08 + (i / fx.shakes) * 0.25, duration: fx.shakeMs });
        this.sfx(CHEST_SFX.shake, 220 + i * 40);
      });
      t += fx.shakeMs + 90;
    }
    // 2) 뚜껑 열림
    this.later(t, () => {
      parts.forEach((p) => p.setAngle(0));
      s.tweens.add({ targets: lid, y: cy - 140, angle: -24, alpha: 0, duration: 380, ease: 'Cubic.Out' });
      // 상자 안쪽 빛(희귀 이상, 그림이 있을 때): 밑동을 상자 입구에 맞추고 아래에서 위로 솟아오름
      const innerKey = CHEST_INNER[this.tier];
      if (innerKey && s.textures.exists(innerKey) && s.textures.exists(`chest-${this.box}-body`) && body.width === 600) {
        const mouth = cy + (CHEST_MOUTH_Y[this.box] - 300) * k;
        const inner = this.add(s.add.image(cx, mouth, innerKey).setOrigin(0.5, INNER_BASE_Y / 600).setScale(k, 0).setBlendMode(Phaser.BlendModes.ADD), 3.5);
        s.tweens.add({ targets: inner, scaleY: k, duration: 420, ease: 'Back.Out' });
        s.tweens.add({ targets: inner, alpha: { from: 1, to: 0.7 }, duration: 700, yoyo: true, repeat: -1, delay: 420, ease: 'Sine.InOut' });
      }
      this.sfx(CHEST_SFX.open, 520);
    });
    t += 200;
    // 3) 빛·파티클 폭발
    this.later(t, () => this.burst(cx, cy - 10, glow));
    t += 260 + fx.holdMs;
    // 4) 보상 카드 등장
    this.later(t, () => this.reveal());
  }

  private burst(x: number, y: number, glow: Phaser.GameObjects.Arc): void {
    const s = this.scene;
    const fx = this.fx;
    this.sfx(CHEST_SFX.burst(this.tier), this.tier === 'legendary' ? 880 : 660);
    s.tweens.add({ targets: glow, fillAlpha: 0.55, scale: 1.6, duration: 220, yoyo: true, hold: 120 });
    if (fx.flash) s.cameras.main.flash(260, ...rgb(fx.color));
    if (fx.camShake) s.cameras.main.shake(320, fx.camShake);
    // 빛줄기: 상자 뒤에서 천천히 도는 막대들
    if (fx.rays) {
      const rays = this.add(s.add.container(x, y), 0);
      for (let i = 0; i < fx.rays; i++) {
        const r = s.add.rectangle(0, 0, 900, 26, fx.color, 0.18).setOrigin(0, 0.5).setAngle((360 / fx.rays) * i);
        rays.add(r);
      }
      rays.setScale(0.2);
      s.tweens.add({ targets: rays, scale: 1, duration: 400, ease: 'Cubic.Out' });
      s.tweens.add({ targets: rays, angle: 360, duration: 9000, repeat: -1 });
    }
    // 충격파 고리
    if (fx.ring) {
      const ring = this.add(s.add.circle(x, y, 30).setStrokeStyle(10, fx.color, 0.9), 5);
      s.tweens.add({ targets: ring, scale: 9, alpha: 0, duration: 600, ease: 'Cubic.Out' });
    }
    // 파티클: 작은 빛 조각이 사방으로 튀었다가 떨어진다(엔진 파티클 대신 원·별을 직접 움직여 Phaser 버전에 덜 민감)
    for (let i = 0; i < fx.particles; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 160 + Math.random() * 360;
      const p = this.add(s.add.circle(x, y, 3 + Math.random() * 6, i % 3 === 0 ? 0xffffff : fx.color, 1), 6);
      s.tweens.add({
        targets: p, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.8 + 120, alpha: 0, scale: 0.3,
        duration: 600 + Math.random() * 600, ease: 'Cubic.Out',
      });
    }
    // 등급 글자(희귀 이상)
    if (this.tier !== 'common') {
      const txt = this.add(
        s.add.text(x, y - 230, `${fx.label}!`, { fontFamily: FONT, fontSize: '64px', fontStyle: 'bold', color: hex(fx.color), stroke: '#000', strokeThickness: 8 }).setOrigin(0.5).setScale(0.3),
        7,
      );
      s.tweens.add({ targets: txt, scale: 1, duration: 300, ease: 'Back.Out' });
    }
  }

  /** 카드 등장: 연출 층을 정리하고 결과 화면을 연다(한 번만) */
  private reveal(): void {
    if (this.done) return;
    this.done = true;
    this.cleanup();
    this.onReveal();
    this.sfx(this.tier === 'legendary' || this.tier === 'epic' ? CHEST_SFX.cardRare : CHEST_SFX.card, 990);
  }

  /** 건너뛰기: 남은 연출을 버리고 바로 결과로. 보상은 이미 저장돼 있어 아무것도 다시 지급하지 않는다. */
  skip(): void {
    this.reveal();
  }

  /** 장면을 떠날 때: 결과 화면 없이 연출만 지운다(보상은 그대로 남아 있음) */
  destroy(): void {
    this.done = true;
    this.cleanup();
  }

  get finished(): boolean {
    return this.done;
  }

  private cleanup(): void {
    this.timers.forEach((t) => t.remove(false));
    this.timers = [];
    for (const o of this.objs) {
      this.scene.tweens.killTweensOf(o);
      o.destroy();
    }
    this.objs = [];
  }

  /** 소리: public/sfx/<키>.mp3를 미리 읽어 두었으면 그것을, 없으면 짧은 합성음 */
  private sfx(key: string, freq: number): void {
    const s = this.scene;
    try {
      if (s.cache.audio.exists(key)) {
        playSfx(s, key, { channel: 'reward' }); // 보상 채널 음량 0.6(기획 10.2)
        return;
      }
      const ctx = (s.sound as Phaser.Sound.WebAudioSoundManager).context;
      if (!ctx) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(freq, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(freq * 1.6, ctx.currentTime + 0.12);
      g.gain.setValueAtTime(0.05, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.2);
    } catch {
      /* 소리를 못 내는 환경이면 건너뜀 */
    }
  }
}

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];

/** 상자 본체·뚜껑 임시 그림(그림 파일이 없을 때만). 실제 그림과 같은 규칙: 같은 정사각 캔버스에 제자리 */
export function ensureChestTextures(scene: Phaser.Scene, box: BoxId): void {
  const bodyKey = `chest-${box}-body`;
  const lidKey = `chest-${box}-lid`;
  if (scene.textures.exists(bodyKey) && scene.textures.exists(lidKey)) return;
  const main = { dragon: 0x6a3fb5, equipment: 0x2e7d6a, gold: 0x9a7a12 }[box];
  const trim = 0xffd34d;
  const g = scene.add.graphics();
  // 260×260 같은 캔버스: 본체는 아래(y 110~240), 뚜껑은 위(y 50~140)
  if (!scene.textures.exists(bodyKey)) {
    g.clear();
    g.fillStyle(0x000000, 0.25).fillEllipse(130, 244, 230, 26);
    g.fillStyle(main).fillRoundedRect(20, 110, 220, 128, 16);
    g.fillStyle(0x000000, 0.18).fillRoundedRect(20, 190, 220, 48, { tl: 0, tr: 0, bl: 16, br: 16 });
    g.fillStyle(trim).fillRect(20, 110, 220, 14).fillRect(118, 110, 24, 128);
    g.fillStyle(0xfff3c4).fillRoundedRect(112, 130, 36, 40, 6);
    g.fillStyle(0x3b2a05).fillCircle(130, 146, 6).fillRect(127, 148, 6, 14);
    g.lineStyle(5, 0x1b1022).strokeRoundedRect(20, 110, 220, 128, 16);
    g.generateTexture(bodyKey, 260, 260);
  }
  if (!scene.textures.exists(lidKey)) {
    g.clear();
    g.fillStyle(main).fillRoundedRect(14, 50, 232, 80, { tl: 60, tr: 60, bl: 8, br: 8 });
    g.fillStyle(0xffffff, 0.18).fillRoundedRect(40, 60, 120, 18, 9);
    g.fillStyle(trim).fillRect(14, 116, 232, 14).fillRect(118, 50, 24, 80);
    g.lineStyle(5, 0x1b1022).strokeRoundedRect(14, 50, 232, 80, { tl: 60, tr: 60, bl: 8, br: 8 });
    g.generateTexture(lidKey, 260, 260);
  }
  g.destroy();
}
