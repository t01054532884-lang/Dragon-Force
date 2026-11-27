import Phaser from 'phaser';
import { BattleFx } from '../fx/BattleFx';

/**
 * 필살기 전장 연출 14종(2026-11-28 제작자 승인, docs/ULT_FX_PLAN.md) — 예전엔 모두 "위→아래 띠 쓸기" 한 틀이었다.
 * 규칙: 드래곤마다 움직임의 형태가 다르다(색·무기만 바꾼 같은 틀 금지). 모두 화면 전체(광역).
 * 새 그림 없이 그 드래곤의 전장 효과 그림(key)을 잘라 쓰거나 도형·입자·카메라로.
 * 화면 고정(fix가 scrollFactor 0 + 깊이), 1~1.6초 안에 모두 정리된다.
 */
export type Fix = <G extends Phaser.GameObjects.GameObject>(g: G) => G;
export type Motion14 = 'freeze' | 'net' | 'rain' | 'cross' | 'meteor' | 'tornado' | 'swords' | 'bloom' | 'pulse' | 'xslash' | 'mirror' | 'timestop' | 'collapse' | 'curtain';
interface Ctx { scene: Phaser.Scene; key: string; color: number; add: boolean; W: number; H: number; fix: Fix; cx: number; cy: number }

const R = Phaser.Math.Between;
/** 저사양(전투 중 프레임이 계속 낮아 BattleFx.quality가 내려가면) 입자 수를 60%로 */
const N = (n: number): number => Math.max(1, Math.round(n * (BattleFx.quality < 1 ? 0.6 : 1)));
const ADD = Phaser.BlendModes.ADD;
function tint(c: Ctx, color: number, alpha: number, delay = 0, hold = 300): void {
  const r = c.fix(c.scene.add.rectangle(c.W / 2, c.H / 2, c.W, c.H, color, 1).setAlpha(0));
  c.scene.tweens.add({ targets: r, alpha, delay, duration: 200, yoyo: true, hold, onComplete: () => r.destroy() });
}
function later(c: Ctx, ms: number, fn: () => void): void {
  c.scene.tweens.addCounter({ from: 0, to: 1, duration: Math.max(1, ms), onComplete: fn });
}
function dot(c: Ctx, x: number, y: number, r: number, color: number, a = 0.95): Phaser.GameObjects.Arc {
  return c.fix(c.scene.add.circle(x, y, r, color, a).setBlendMode(ADD));
}
/** 들쭉날쭉한 선(번개·금) */
function jag(g: Phaser.GameObjects.Graphics, x1: number, y1: number, x2: number, y2: number, seg: number, amp: number): void {
  g.beginPath();
  g.moveTo(x1, y1);
  for (let i = 1; i < seg; i++) {
    const t = i / seg;
    g.lineTo(x1 + (x2 - x1) * t + R(-amp, amp), y1 + (y2 - y1) * t + R(-amp, amp));
  }
  g.lineTo(x2, y2);
  g.strokePath();
}
function burst(c: Ctx, x: number, y: number, n: number, dist: number, colors: number[], ms = 600, size = 6): void {
  n = N(n);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5, d = dist * (0.5 + Math.random() * 0.7);
    const p = dot(c, x, y, R(Math.max(2, size - 3), size + 2), colors[i % colors.length]);
    c.scene.tweens.add({ targets: p, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, scale: 0.4, duration: ms * (0.7 + Math.random() * 0.5), ease: 'Quad.Out', onComplete: () => p.destroy() });
  }
}
/** 전장 효과 그림을 조각처럼 하나 */
function piece(c: Ctx, x: number, y: number, w: number): Phaser.GameObjects.Image {
  const im = c.fix(c.scene.add.image(x, y, c.key));
  if (c.add) im.setBlendMode(ADD);
  im.setScale(w / im.width);
  return im;
}
/** 화면 안 적 위치(화면 좌표) */
function enemiesOnScreen(c: Ctx, max: number): { x: number; y: number }[] {
  const s = c.scene as unknown as { enemies?: Phaser.GameObjects.Group };
  const cam = c.scene.cameras.main;
  const out: { x: number; y: number }[] = [];
  for (const o of (s.enemies?.getChildren() ?? []) as Phaser.GameObjects.Image[]) {
    if (!o.active) continue;
    const x = (o.x - cam.worldView.x) * cam.zoom, y = (o.y - cam.worldView.y) * cam.zoom;
    if (x > 0 && x < c.W && y > 80 && y < c.H) out.push({ x, y });
    if (out.length >= max) break;
  }
  return out;
}

// ── 빙하 절대영도: 가장자리 → 안쪽 결빙, 가운데부터 금 → 산산조각 ──
function freeze(c: Ctx): void {
  const { scene, W, H, fix, color } = c;
  const edges = [
    fix(scene.add.rectangle(W / 2, 0, W, 1, 0xdff6ff, 0.55).setOrigin(0.5, 0)),
    fix(scene.add.rectangle(W / 2, H, W, 1, 0xdff6ff, 0.55).setOrigin(0.5, 1)),
    fix(scene.add.rectangle(0, H / 2, 1, H, 0xdff6ff, 0.55).setOrigin(0, 0.5)),
    fix(scene.add.rectangle(W, H / 2, 1, H, 0xdff6ff, 0.55).setOrigin(1, 0.5)),
  ];
  scene.tweens.add({ targets: [edges[0], edges[1]], displayHeight: H * 0.55, duration: 520, ease: 'Cubic.Out' });
  scene.tweens.add({ targets: [edges[2], edges[3]], displayWidth: W * 0.55, duration: 520, ease: 'Cubic.Out' });
  const frost = piece(c, W / 2, H / 2, W * 1.3).setAlpha(0);
  scene.tweens.add({ targets: frost, alpha: 0.6, duration: 520 });
  later(c, 560, () => {
    const g = fix(scene.add.graphics().setBlendMode(ADD));
    g.lineStyle(4, 0xffffff, 1);
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 + Math.random() * 0.3; jag(g, c.cx, c.cy, c.cx + Math.cos(a) * W, c.cy + Math.sin(a) * W, 7, 18); }
    scene.cameras.main.shake(260, 0.01);
    later(c, 220, () => {
      g.destroy();
      [...edges, frost].forEach((o) => scene.tweens.add({ targets: o, alpha: 0, duration: 300, onComplete: () => o.destroy() }));
      for (let i = 0; i < N(34); i++) {
        const sh = fix(scene.add.triangle(R(0, W), R(0, H), 0, 0, R(14, 30), R(4, 12), R(4, 14), R(18, 34), i % 3 ? 0xe8f8ff : color, 0.9).setBlendMode(ADD));
        const a = Math.atan2(sh.y - c.cy, sh.x - c.cx);
        scene.tweens.add({ targets: sh, x: sh.x + Math.cos(a) * R(80, 200), y: sh.y + Math.sin(a) * R(80, 200) + 60, angle: R(-200, 200), alpha: 0, duration: R(500, 800), ease: 'Quad.Out', onComplete: () => sh.destroy() });
      }
    });
  });
}

// ── 옐로 천둥 그물: 점마다 낙뢰 → 점끼리 번개 줄 → 그물 전체가 번쩍 ──
function net(c: Ctx): void {
  const { scene, W, H, fix, color } = c;
  const pts = Array.from({ length: 9 }, (_, i) => ({ x: (W * ((i % 3) + 0.5)) / 3 + R(-60, 60), y: H * (0.2 + Math.floor(i / 3) * 0.27) + R(-50, 50) }));
  pts.sort(() => Math.random() - 0.5);
  pts.forEach((p, i) => later(c, i * 60, () => {
    const g = fix(scene.add.graphics().setBlendMode(ADD));
    g.lineStyle(6, color, 1); jag(g, p.x + R(-40, 40), -20, p.x, p.y, 8, 22);
    g.lineStyle(2, 0xffffff, 1); jag(g, p.x + R(-20, 20), -20, p.x, p.y, 8, 10);
    const f = dot(c, p.x, p.y, 34, 0xffffff, 0.9);
    scene.tweens.add({ targets: [g, f], alpha: 0, duration: 260, onComplete: () => { g.destroy(); f.destroy(); } });
  }));
  later(c, 9 * 60 + 60, () => {
    const g = fix(scene.add.graphics().setBlendMode(ADD));
    g.lineStyle(5, color, 1);
    pts.forEach((p) => {
      const near = pts.filter((q) => q !== p).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, 2);
      near.forEach((q) => jag(g, p.x, p.y, q.x, q.y, 6, 14));
    });
    g.lineStyle(2, 0xffffff, 1);
    pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; jag(g, p.x, p.y, q.x, q.y, 6, 8); });
    tint(c, color, 0.25, 0, 120);
    scene.cameras.main.shake(200, 0.008);
    scene.tweens.add({ targets: g, alpha: { from: 1, to: 0 }, duration: 500, delay: 160, onComplete: () => g.destroy() });
    pts.forEach((p) => burst(c, p.x, p.y, 6, 60, [0xffffff, color], 400, 5));
  });
}

// ── 그린 독의 폭우: 비스듬한 독비 → 떨어진 자리마다 웅덩이가 퍼졌다 거품으로 터짐 ──
function rain(c: Ctx): void {
  const { scene, W, H, fix, color } = c;
  tint(c, 0x1d3b0a, 0.3, 0, 800);
  for (let i = 0; i < N(70); i++) {
    const x = R(-100, W), y = R(-200, H - 100);
    const d = fix(scene.add.rectangle(x, y, 4, 34, i % 3 ? color : 0xd4ff8a, 0.85).setAngle(-20).setBlendMode(ADD));
    d.setAlpha(0);
    scene.tweens.add({ targets: d, x: x + 90, y: y + 260, alpha: { from: 0.9, to: 0.2 }, delay: R(0, 600), duration: 320, onComplete: () => d.destroy() });
  }
  for (let i = 0; i < 14; i++) {
    const x = R(40, W - 40), y = R(Math.round(H * 0.25), H - 60);
    const pd = fix(scene.add.ellipse(x, y, 120, 50, color, 0.55));
    pd.setScale(0);
    scene.tweens.add({ targets: pd, scale: R(8, 14) / 10, delay: 200 + i * 40, duration: 380, ease: 'Back.Out' });
    later(c, 700 + i * 30, () => {
      for (let b = 0; b < 4; b++) {
        const bb = fix(scene.add.circle(x + R(-40, 40), y + R(-12, 12), R(6, 12), 0xd4ff8a, 0.9).setStrokeStyle(2, color));
        scene.tweens.add({ targets: bb, y: bb.y - R(30, 70), scale: 1.6, alpha: 0, duration: R(350, 550), onComplete: () => bb.destroy() });
      }
      scene.tweens.add({ targets: pd, alpha: 0, scaleX: pd.scaleX * 1.3, duration: 350, onComplete: () => pd.destroy() });
    });
  }
}

// ── 화이트 성광의 기둥: 드래곤 자리 빛의 십자가가 펼쳐져 천천히 돌며 화면을 훑음 ──
function cross(c: Ctx): void {
  const { scene, W, H, fix, color } = c;
  const L = Math.hypot(W, H) * 1.2;
  const box = fix(scene.add.container(c.cx, c.cy));
  const beams = [
    scene.add.rectangle(0, 0, 10, L, color, 0.85).setBlendMode(ADD), scene.add.rectangle(0, 0, L, 10, color, 0.85).setBlendMode(ADD),
    scene.add.rectangle(0, 0, 4, L, 0xffffff, 1).setBlendMode(ADD), scene.add.rectangle(0, 0, L, 4, 0xffffff, 1).setBlendMode(ADD),
  ];
  for (let k = 0; k < 8; k++) beams.push(scene.add.rectangle(0, 0, 3, L, 0xfff8d0, 0.5).setAngle(22.5 + k * 45).setBlendMode(ADD));
  box.add(beams);
  box.setScale(0.1, 1);
  scene.tweens.add({ targets: box, scaleX: 1, duration: 260, ease: 'Expo.Out' });
  scene.tweens.add({ targets: [beams[0], beams[1]], scaleX: { from: 1, to: 9 }, duration: 500, ease: 'Cubic.Out' });
  scene.tweens.add({ targets: box, angle: 45, duration: 1100, ease: 'Sine.InOut' });
  scene.tweens.add({ targets: box, alpha: 0, delay: 900, duration: 450, onComplete: () => box.destroy() });
  const core = dot(c, c.cx, c.cy, 60, 0xffffff, 1);
  scene.tweens.add({ targets: core, scale: 3, alpha: 0, duration: 600, onComplete: () => core.destroy() });
  tint(c, 0xfff6d8, 0.25, 0, 500);
}

// ── 스톤 운석 낙하: 그림자 예고 → 큰 운석 3개가 비스듬히 차례로 충돌 ──
function meteor(c: Ctx): void {
  const { scene, W, H, fix, color } = c;
  const tg = [{ x: W * 0.28, y: H * 0.38 }, { x: W * 0.72, y: H * 0.55 }, { x: W * 0.4, y: H * 0.78 }];
  tg.forEach((t, i) => {
    const sh = fix(scene.add.ellipse(t.x, t.y, 200, 80, 0x000000, 0.35));
    sh.setScale(0.3);
    scene.tweens.add({ targets: sh, scale: 1, duration: 300 + i * 220 });
    const rock = fix(scene.add.circle(t.x + 420, t.y - 700, 78, 0x4e342e, 1).setStrokeStyle(16, 0xff8a3d, 1));
    const glow = fix(scene.add.circle(rock.x, rock.y, 110, 0xff7a1a, 0.45).setBlendMode(ADD));
    const trail = fix(scene.add.rectangle(rock.x, rock.y, 90, 420, 0xff7a1a, 0.75).setOrigin(0.5, 0).setAngle(-31 + 180).setBlendMode(ADD));
    scene.tweens.add({ targets: [rock, glow, trail], x: t.x, y: t.y, delay: i * 260, duration: 420, ease: 'Quad.In', onComplete: () => {
      rock.destroy(); glow.destroy(); trail.destroy(); sh.destroy();
      const fl = dot(c, t.x, t.y, 120, 0xfff1c4, 1);
      scene.tweens.add({ targets: fl, scale: 2.4, alpha: 0, duration: 300, onComplete: () => fl.destroy() });
      scene.cameras.main.shake(220, 0.016);
      const cr = piece(c, t.x, t.y, 520);
      cr.setScale(cr.scale * 0.3);
      scene.tweens.add({ targets: cr, scale: cr.scale * 3.3, alpha: 0, duration: 800, ease: 'Quad.Out', onComplete: () => cr.destroy() });
      const ring = fix(scene.add.circle(t.x, t.y, 30, 0, 0).setStrokeStyle(16, 0xff8a3d, 1).setBlendMode(ADD));
      scene.tweens.add({ targets: ring, scale: 10, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
      burst(c, t.x, t.y, 22, 300, [0x8d6e63, 0xff8a3d, 0xffcc80], 750, 12);
    } });
  });
}

// ── 윈드 대폭풍: 회오리 2개가 화면을 S자로 가로지르며 잎·먼지를 휘감아 올림 ──
function tornado(c: Ctx): void {
  const { scene, W, H, fix, color } = c;
  [{ y0: H * 0.3, dir: 1, delay: 0 }, { y0: H * 0.68, dir: -1, delay: 160 }].forEach((t) => {
    const tw = fix(scene.add.container(t.dir > 0 ? -120 : W + 120, t.y0));
    for (let k = 0; k < 9; k++) tw.add(scene.add.ellipse(0, -k * 46, 110 + k * 40, 34, k % 2 ? color : 0xe8fff8, 0.8).setBlendMode(ADD));
    tw.add(scene.add.ellipse(0, -180, 220, 420, color, 0.18).setBlendMode(ADD));
    scene.tweens.add({ targets: tw, x: t.dir > 0 ? W + 140 : -140, delay: t.delay, duration: 1150, ease: 'Sine.InOut' });
    scene.tweens.add({ targets: tw, y: t.y0 + 140, delay: t.delay, duration: 290, yoyo: true, repeat: 1, ease: 'Sine.InOut' });
    scene.tweens.add({ targets: tw.list, scaleX: 1.35, duration: 90, yoyo: true, repeat: 7 });
    later(c, t.delay + 1300, () => tw.destroy());
    for (let i = 0; i < N(18); i++) later(c, t.delay + i * 60, () => {
      const p = dot(c, tw.x + R(-60, 60), tw.y + R(-10, 20), R(3, 6), i % 2 ? color : 0xffffff);
      scene.tweens.add({ targets: p, y: p.y - R(160, 280), x: p.x + R(-80, 80), alpha: 0, duration: 600, onComplete: () => p.destroy() });
    });
  });
  tint(c, color, 0.15, 0, 700);
}

// ── 스틸 천 개의 검: 검이 격자로 차례차례 꽂힘 → 모두 동시에 터짐 ──
function swords(c: Ctx): void {
  const { scene, W, H, fix, color } = c;
  const blades: Phaser.GameObjects.Container[] = [];
  const cols = 5, rows = 7;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const x = (W * (k + 0.5)) / cols + R(-20, 20), y = H * 0.14 + r * (H * 0.82 / rows) + R(-15, 15);
    const sw = fix(scene.add.container(x, y - 260));
    sw.add([scene.add.rectangle(0, -30, 10, 70, 0xe0e6ec), scene.add.rectangle(0, -30, 3, 70, 0xffffff), scene.add.rectangle(0, 6, 28, 6, color), scene.add.rectangle(0, 16, 6, 16, 0x5d4037)]);
    sw.setAlpha(0).setAngle(180);
    blades.push(sw);
    scene.tweens.add({ targets: sw, y, alpha: 1, delay: r * 70 + k * 18, duration: 120, ease: 'Quad.In', onComplete: () => {
      const s = dot(c, x, y + 4, 10, 0xffffff);
      scene.tweens.add({ targets: s, scale: 2, alpha: 0, duration: 180, onComplete: () => s.destroy() });
    } });
  }
  later(c, rows * 70 + 260, () => {
    scene.cameras.main.shake(260, 0.012);
    tint(c, 0xffffff, 0.35, 0, 80);
    blades.forEach((sw) => { burst(c, sw.x, sw.y, 4, 70, [0xe0e6ec, color], 420, 5); sw.destroy(); });
  });
}

// ── 블룸 천화의 만개: 드래곤 자리에서 나선을 그리며 꽃이 차례로 피어남 ──
function bloomSpiral(c: Ctx): void {
  const { scene, W, H, fix, color } = c;
  const far = Math.hypot(W, H) * 0.6;
  for (let i = 0; i < 36; i++) {
    const t = i / 36, a = t * Math.PI * 6, d = 30 + t * far;
    const x = c.cx + Math.cos(a) * d, y = c.cy + Math.sin(a) * d;
    const fl = fix(scene.add.container(x, y));
    for (let p = 0; p < 6; p++) fl.add(scene.add.ellipse(Math.cos((p / 6) * Math.PI * 2) * 30, Math.sin((p / 6) * Math.PI * 2) * 30, 50, 30, p % 2 ? color : 0xffc1e3, 0.95).setAngle((p / 6) * 360));
    fl.add(scene.add.circle(0, 0, 15, 0xfff59d));
    fl.setScale(0).setAngle(R(0, 360));
    const s = 1 + t * 1.4;
    scene.tweens.add({ targets: fl, scale: s, angle: fl.angle + 90, delay: i * 22, duration: 260, ease: 'Back.Out' });
    scene.tweens.add({ targets: fl, alpha: 0, scale: s * 1.3, delay: 900 + i * 8, duration: 380, onComplete: () => fl.destroy() });
  }
  for (let i = 0; i < N(26); i++) later(c, 300 + i * 20, () => {
    const p = fix(scene.add.ellipse(R(0, W), R(0, H), 14, 8, 0xffc1e3, 0.9).setAngle(R(0, 360)));
    scene.tweens.add({ targets: p, y: p.y + R(60, 160), x: p.x + R(-60, 60), angle: p.angle + 200, alpha: 0, duration: 800, onComplete: () => p.destroy() });
  });
}

// ── 하울 천지의 포효: 쿵·쿵·쿵 3박자 음파 + 박자마다 화면 출렁 ──
function pulse(c: Ctx): void {
  const { scene, W, H, fix, color } = c;
  const far = Math.hypot(W, H);
  const cam = scene.cameras.main;
  [0, 280, 560].forEach((d, i) => later(c, d, () => {
    for (let k = 0; k < 3; k++) {
      const ring = fix(scene.add.circle(c.cx, c.cy, 40, 0, 0).setStrokeStyle(18 - k * 5, k ? 0xffffff : color, 0.9 - k * 0.2).setBlendMode(ADD));
      scene.tweens.add({ targets: ring, scale: far / 40, alpha: 0, delay: k * 60, duration: 620, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
    }
    const wave = piece(c, c.cx, c.cy, 260);
    scene.tweens.add({ targets: wave, scale: wave.scale * 4, alpha: 0, duration: 520, onComplete: () => wave.destroy() });
    cam.shake(160, 0.009 + i * 0.003);
    scene.tweens.add({ targets: cam, zoom: 1.06 + i * 0.02, duration: 90, yoyo: true, ease: 'Quad.Out' });
  }));
  tint(c, color, 0.18, 0, 600);
}

// ── 크림슨 핏빛 초승달: X자 베기 → 벤 선을 따라 화면이 잠깐 어긋났다 붙음 ──
function xslash(c: Ctx): void {
  const { scene, W, H, fix, color } = c;
  const diag = Math.hypot(W, H) * 1.1;
  [{ a: Math.atan2(H, W), x: 0, y: 0, d: 0 }, { a: Math.atan2(H, -W), x: W, y: 0, d: 200 }].forEach((s) => {
    const sl = fix(scene.add.rectangle(s.x, s.y, diag, 26, color, 1).setOrigin(0, 0.5).setRotation(s.a).setBlendMode(ADD));
    const core = fix(scene.add.rectangle(s.x, s.y, diag, 8, 0xffffff, 1).setOrigin(0, 0.5).setRotation(s.a).setBlendMode(ADD));
    sl.setScale(0, 1); core.setScale(0, 1);
    scene.tweens.add({ targets: [sl, core], scaleX: 1, delay: s.d, duration: 180, ease: 'Expo.Out' });
    scene.tweens.add({ targets: [sl, core], scaleY: 0, alpha: 0, delay: s.d + 420, duration: 300, onComplete: () => { sl.destroy(); core.destroy(); } });
    later(c, s.d + 150, () => scene.cameras.main.shake(160, 0.012));
  });
  // 화면이 갈라진 듯: 두 겹 붉은 막이 벤 선 방향으로 어긋났다 돌아옴
  later(c, 420, () => {
    const a = fix(scene.add.rectangle(W / 2, H / 2, W * 1.5, H * 1.5, 0x5a0010, 0.35).setRotation(Math.atan2(H, W)));
    const b = fix(scene.add.rectangle(W / 2, H / 2, W * 1.5, H * 1.5, 0xff2d55, 0.18).setRotation(Math.atan2(H, -W)).setBlendMode(ADD));
    scene.tweens.add({ targets: a, x: W / 2 + 26, y: H / 2 - 18, duration: 120, yoyo: true, hold: 120, onComplete: () => a.destroy() });
    scene.tweens.add({ targets: b, x: W / 2 - 26, y: H / 2 + 18, duration: 120, yoyo: true, hold: 120, onComplete: () => b.destroy() });
    const im = piece(c, W / 2, H / 2, W * 1.4).setAlpha(0.9).setRotation(Math.atan2(H, W));
    scene.tweens.add({ targets: im, alpha: 0, scale: im.scale * 1.2, duration: 600, onComplete: () => im.destroy() });
  });
}

// ── 미러 거울 세계: 화면이 거울 조각으로 갈라지고 빛줄기가 조각 사이를 튕겨 다니며 무지개 반사 → 조각이 깨짐 ──
function mirror(c: Ctx): void {
  const { scene, W, H, fix } = c;
  const g = fix(scene.add.graphics());
  const cx = c.cx, cy = c.cy;
  const corners = [[0, 0], [W / 2, 0], [W, 0], [W, H / 2], [W, H], [W / 2, H], [0, H], [0, H / 2]];
  const shards: Phaser.GameObjects.Polygon[] = [];
  corners.forEach((p, i) => {
    const q = corners[(i + 1) % corners.length];
    const poly = fix(scene.add.polygon(0, 0, [cx, cy, p[0], p[1], q[0], q[1]], 0xffffff, i % 2 ? 0.1 : 0.04).setOrigin(0, 0).setStrokeStyle(3, 0xffffff, 0.8));
    shards.push(poly);
  });
  const rainbow = [0xff6b6b, 0xffd93d, 0x6bff95, 0x6bc5ff, 0xc56bff];
  let x = R(0, W), y = 0;
  for (let k = 0; k < 9; k++) later(c, k * 70, () => {
    const nx = R(0, W), ny = k % 2 ? R(0, Math.round(H * 0.3)) : R(Math.round(H * 0.6), H);
    g.lineStyle(10, rainbow[k % rainbow.length], 0.85).lineBetween(x, y, nx, ny);
    g.lineStyle(3, 0xffffff, 1).lineBetween(x, y, nx, ny);
    burst(c, nx, ny, 5, 50, [rainbow[k % rainbow.length], 0xffffff], 350, 5);
    x = nx; y = ny;
  });
  later(c, 760, () => {
    tint(c, 0xffffff, 0.4, 0, 60);
    g.destroy();
    shards.forEach((sh, i) => scene.tweens.add({ targets: sh, y: R(80, 200), x: (i % 2 ? 1 : -1) * R(20, 60), angle: R(-12, 12), alpha: 0, duration: 520, ease: 'Quad.In', onComplete: () => sh.destroy() }));
  });
}

// ── 크로노 시간 정지: 회색으로 멈춤 → 시계 바늘 한 바퀴 → 색이 돌아오며 적 자리에서 차례로 폭발 ──
function timestop(c: Ctx): void {
  const { scene, W, H, fix, color } = c;
  const grey = fix(scene.add.rectangle(W / 2, H / 2, W, H, 0x8a8f99, 0).setBlendMode(Phaser.BlendModes.MULTIPLY));
  scene.tweens.add({ targets: grey, fillAlpha: 0.85, duration: 120 });
  const clock = fix(scene.add.container(c.cx, c.cy));
  const r = Math.min(W, H) * 0.42;
  const face = scene.add.circle(0, 0, r, 0, 0).setStrokeStyle(8, color, 0.9);
  const ticks = scene.add.graphics();
  ticks.lineStyle(5, color, 0.9);
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; ticks.lineBetween(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85, Math.cos(a) * r, Math.sin(a) * r); }
  const hand = scene.add.rectangle(0, 0, 10, r * 0.9, 0xffffff).setOrigin(0.5, 1);
  const hand2 = scene.add.rectangle(0, 0, 14, r * 0.6, color).setOrigin(0.5, 1);
  clock.add([face, ticks, hand2, hand]);
  clock.setScale(0.6).setAlpha(0);
  scene.tweens.add({ targets: clock, scale: 1, alpha: 1, duration: 200, ease: 'Back.Out' });
  scene.tweens.add({ targets: hand, angle: -360, duration: 650, delay: 150, ease: 'Cubic.InOut' });
  scene.tweens.add({ targets: hand2, angle: -120, duration: 650, delay: 150, ease: 'Cubic.InOut' });
  const spots = enemiesOnScreen(c, 18);
  while (spots.length < 10) spots.push({ x: R(40, W - 40), y: R(160, H - 60) });
  later(c, 820, () => {
    scene.tweens.add({ targets: grey, fillAlpha: 0, duration: 200, onComplete: () => grey.destroy() });
    scene.tweens.add({ targets: clock, scale: 1.4, alpha: 0, duration: 260, onComplete: () => clock.destroy() });
    spots.forEach((p, i) => later(c, i * 35, () => {
      const ring = fix(scene.add.circle(p.x, p.y, 10, 0, 0).setStrokeStyle(6, color, 1).setBlendMode(ADD));
      scene.tweens.add({ targets: ring, scale: 5, alpha: 0, duration: 380, onComplete: () => ring.destroy() });
      burst(c, p.x, p.y, 6, 50, [color, 0xfff3c4], 380, 5);
    }));
    scene.cameras.main.shake(300, 0.008);
  });
}

// ── 보이드 사건의 지평선: 빛·파편이 한 점으로 빨려 듦 → 검은 구가 커졌다 한 점으로 → 바깥으로 대폭발 ──
function collapse(c: Ctx): void {
  const { scene, W, H, fix, color } = c;
  const far = Math.hypot(W, H);
  tint(c, 0x05000f, 0.45, 0, 700);
  for (let i = 0; i < N(46); i++) {
    const a = Math.random() * Math.PI * 2, d = R(Math.round(far * 0.25), Math.round(far * 0.6));
    const p = dot(c, c.cx + Math.cos(a) * d, c.cy + Math.sin(a) * d, R(3, 6), i % 3 ? color : 0xe0d4ff);
    const st = fix(scene.add.rectangle(p.x, p.y, 3, R(20, 50), color, 0.6).setRotation(a + Math.PI / 2).setBlendMode(ADD));
    scene.tweens.add({ targets: [p, st], x: c.cx, y: c.cy, alpha: 0.2, delay: R(0, 200), duration: 520, ease: 'Quad.In', onComplete: () => { p.destroy(); st.destroy(); } });
  }
  const hole = fix(scene.add.circle(c.cx, c.cy, 60, 0x000000, 1).setStrokeStyle(6, color, 1));
  hole.setScale(0);
  scene.tweens.add({ targets: hole, scale: 2.2, duration: 450, ease: 'Sine.Out' });
  scene.tweens.add({ targets: hole, scale: 0.05, delay: 520, duration: 160, ease: 'Expo.In', onComplete: () => {
    hole.destroy();
    scene.cameras.main.shake(320, 0.016);
    const fl = dot(c, c.cx, c.cy, 80, 0xffffff, 1);
    scene.tweens.add({ targets: fl, scale: 6, alpha: 0, duration: 420, onComplete: () => fl.destroy() });
    for (let k = 0; k < 2; k++) {
      const ring = fix(scene.add.circle(c.cx, c.cy, 40, 0, 0).setStrokeStyle(20 - k * 8, k ? 0xffffff : color, 1).setBlendMode(ADD));
      scene.tweens.add({ targets: ring, scale: far / 40, alpha: 0, delay: k * 80, duration: 620, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
    }
    const im = piece(c, c.cx, c.cy, 200);
    scene.tweens.add({ targets: im, scale: im.scale * 8, alpha: 0, duration: 650, onComplete: () => im.destroy() });
    burst(c, c.cx, c.cy, 30, far * 0.5, [color, 0xe0d4ff, 0xffffff], 650, 6);
  } });
}

// ── 오로라 극광의 심판: 극광 커튼 여러 겹이 가로로 물결치며 색이 바뀌고, 끝에서 빛 방울이 떨어져 꽂힘 ──
function curtain(c: Ctx): void {
  const { scene, W, H, fix } = c;
  const cols = [0x7cf2c4, 0x7ab8ff, 0xff8de8];
  const layers: Phaser.GameObjects.Image[] = [];
  [H * 0.16, H * 0.3, H * 0.44].forEach((y, i) => {
    const im = piece(c, W / 2, y, W * 1.5).setAlpha(0).setTint(cols[i]);
    layers.push(im);
    scene.tweens.add({ targets: im, alpha: 0.85, delay: i * 90, duration: 260 });
    scene.tweens.add({ targets: im, x: { from: W / 2 - 50, to: W / 2 + 50 }, delay: i * 90, duration: 360, yoyo: true, repeat: 1, ease: 'Sine.InOut' });
    scene.tweens.add({ targets: im, scaleY: im.scaleY * 1.5, delay: i * 90, duration: 300, yoyo: true, repeat: 1, ease: 'Sine.InOut' });
    scene.tweens.add({ targets: im, alpha: 0, delay: 1050 + i * 60, duration: 380, onComplete: () => im.destroy() });
  });
  let k = 0;
  const shift = scene.tweens.addCounter({ from: 0, to: 1, duration: 140, repeat: 6, onRepeat: () => { k++; layers.forEach((l, i) => l.active && l.setTint(cols[(i + k) % 3])); } });
  later(c, 1100, () => shift.stop());
  for (let i = 0; i < N(18); i++) later(c, 300 + i * 40, () => {
    const x = R(30, W - 30), y0 = H * 0.46, y1 = R(Math.round(H * 0.55), H - 40);
    const drop = dot(c, x, y0, 9, cols[i % 3]);
    scene.tweens.add({ targets: drop, y: y1, duration: 260, ease: 'Quad.In', onComplete: () => {
      drop.destroy();
      const ring = fix(scene.add.circle(x, y1, 8, 0, 0).setStrokeStyle(5, cols[i % 3], 1).setBlendMode(ADD));
      scene.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 360, onComplete: () => ring.destroy() });
    } });
  });
}

const TABLE: Record<Motion14, (c: Ctx) => void> = {
  freeze, net, rain, cross, meteor, tornado, swords, bloom: bloomSpiral, pulse, xslash, mirror, timestop, collapse, curtain,
};
export const MOTION14 = Object.keys(TABLE) as Motion14[];
export function playMotion14(m: Motion14, scene: Phaser.Scene, key: string, color: number, add: boolean, W: number, H: number, fix: Fix, center?: { x: number; y: number }): void {
  TABLE[m]({ scene, key, color, add, W, H, fix, cx: center?.x ?? W / 2, cy: center?.y ?? H / 2 });
}
