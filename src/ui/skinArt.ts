import type Phaser from 'phaser';
import { SKINS, skinDef, type SkinDef, type TrailShape } from '../data/skins';

/**
 * 스킨 임시 그림(그림 파일이 오기 전, 2026-11-23 밤). 그림이 오면 같은 키로 public/art/skin/ 에 넣고 art.ts에 등록하면
 * 이 도형 그림 대신 그 그림을 쓴다(키가 이미 있으면 만들지 않음).
 * - `skin-icon-<id>`: 룰렛·장비 화면 아이콘(160×160)
 * - `skin-cape-<id>`: 전투 중 드래곤 아래층에 붙는 망토(위에서 본 모양, 머리 쪽이 위, 160×160)
 * - `skin-trail-<모양>`: 발자국 효과 한 개(48×48)
 */
/** icons=false: 전투 장면용 — 아이콘은 전투에서 안 씀. 전투 중 내린 진짜 아이콘 키를 도형 그림이 차지하면
 * 로비·룰렛으로 돌아가도 진짜 그림이 다시 안 읽혀 도형으로 보이던 문제(2026-11-25) 방지 */
export function makeSkinTextures(scene: Phaser.Scene, icons = true): void {
  const g = scene.add.graphics();
  const make = (key: string, w: number, h: number, draw: () => void) => {
    if (scene.textures.exists(key) || (!icons && key.startsWith('skin-icon-'))) return;
    g.clear();
    draw();
    g.generateTexture(key, w, h);
  };
  for (const s of SKINS) {
    if (s.kind === 'cape') {
      make(`skin-cape-${s.id}`, 160, 160, () => cape(g, s, 80, 84, 1));
      make(`skin-icon-${s.id}`, 160, 160, () => {
        g.fillStyle(0x1d1733, 1).fillRoundedRect(4, 4, 152, 152, 26);
        cape(g, s, 80, 70, 0.9);
      });
    } else {
      make(`skin-trail-${s.trail}`, 48, 48, () => trail(g, s.trail!, s.colors, 24, 24, 1));
      make(`skin-icon-${s.id}`, 160, 160, () => {
        g.fillStyle(0x1d1733, 1).fillRoundedRect(4, 4, 152, 152, 26);
        // 발자국 세 개가 비스듬히 이어짐
        trail(g, s.trail!, s.colors, 46, 116, 1.3);
        trail(g, s.trail!, s.colors, 82, 82, 1.6);
        trail(g, s.trail!, s.colors, 116, 46, 1.9);
      });
    }
  }
  g.destroy();
}

/** 망토: 어깨(위쪽 좁게) → 아래로 넓게 퍼지는 천, 안감이 가장자리에 보임, 가운데 무늬 */
function cape(g: Phaser.GameObjects.Graphics, s: SkinDef, cx: number, cy: number, k: number): void {
  const [outer, inner] = s.colors;
  const top = cy - 58 * k;
  const bot = cy + 62 * k;
  g.fillStyle(inner, 1);
  g.fillTriangle(cx - 24 * k, top, cx + 24 * k, top, cx + 66 * k, bot);
  g.fillTriangle(cx - 24 * k, top, cx - 66 * k, bot, cx + 66 * k, bot);
  g.fillStyle(outer, 1);
  g.fillTriangle(cx - 20 * k, top + 4 * k, cx + 20 * k, top + 4 * k, cx + 58 * k, bot - 6 * k);
  g.fillTriangle(cx - 20 * k, top + 4 * k, cx - 58 * k, bot - 6 * k, cx + 58 * k, bot - 6 * k);
  // 아래 물결 끝단
  for (let i = -2; i <= 2; i++) g.fillCircle(cx + i * 23 * k, bot - 6 * k, 11 * k);
  // 어깨 고정 장식(보석)
  g.fillStyle(inner, 1).fillCircle(cx - 22 * k, top + 6 * k, 8 * k).fillCircle(cx + 22 * k, top + 6 * k, 8 * k);
  // 가운데 무늬
  g.fillStyle(inner, 0.85);
  g.fillTriangle(cx, cy - 18 * k, cx - 14 * k, cy + 10 * k, cx + 14 * k, cy + 10 * k);
  g.fillTriangle(cx, cy + 30 * k, cx - 14 * k, cy + 4 * k, cx + 14 * k, cy + 4 * k);
}

function trail(g: Phaser.GameObjects.Graphics, shape: TrailShape, [a, b]: [number, number], x: number, y: number, k: number): void {
  switch (shape) {
    case 'flame':
      g.fillStyle(a, 0.95).fillCircle(x, y + 4 * k, 9 * k).fillTriangle(x - 9 * k, y + 2 * k, x + 9 * k, y + 2 * k, x, y - 16 * k);
      g.fillStyle(b, 1).fillCircle(x, y + 5 * k, 5 * k).fillTriangle(x - 5 * k, y + 4 * k, x + 5 * k, y + 4 * k, x, y - 7 * k);
      break;
    case 'frost':
      g.lineStyle(3 * k, a, 1);
      for (let i = 0; i < 3; i++) {
        const t = (i / 3) * Math.PI;
        g.lineBetween(x - Math.cos(t) * 13 * k, y - Math.sin(t) * 13 * k, x + Math.cos(t) * 13 * k, y + Math.sin(t) * 13 * k);
      }
      g.fillStyle(b, 1).fillCircle(x, y, 4 * k);
      break;
    case 'star':
      star(g, x, y, 13 * k, 5 * k, a);
      g.fillStyle(b, 1).fillCircle(x, y, 3 * k);
      break;
    case 'petal':
      g.fillStyle(a, 0.95).fillEllipse(x - 5 * k, y, 12 * k, 20 * k).fillEllipse(x + 6 * k, y + 2 * k, 12 * k, 18 * k);
      g.fillStyle(b, 0.9).fillCircle(x, y, 3 * k);
      break;
    case 'spark':
      g.lineStyle(4 * k, a, 1).beginPath();
      g.moveTo(x - 4 * k, y - 15 * k).lineTo(x + 5 * k, y - 3 * k).lineTo(x - 5 * k, y + 2 * k).lineTo(x + 4 * k, y + 15 * k).strokePath();
      g.fillStyle(b, 0.9).fillCircle(x, y, 3 * k);
      break;
    case 'shadow':
      g.fillStyle(b, 0.55).fillCircle(x, y, 14 * k);
      g.fillStyle(a, 0.75).fillCircle(x - 4 * k, y - 3 * k, 9 * k).fillCircle(x + 6 * k, y + 4 * k, 7 * k);
      break;
    case 'aurora':
      g.fillStyle(a, 0.7).fillEllipse(x - 3 * k, y, 10 * k, 26 * k);
      g.fillStyle(b, 0.7).fillEllipse(x + 5 * k, y + 2 * k, 8 * k, 22 * k);
      break;
    case 'bell':
      g.fillStyle(a, 1).fillCircle(x, y - 2 * k, 10 * k).fillRect(x - 12 * k, y + 2 * k, 24 * k, 6 * k);
      g.fillStyle(b, 1).fillCircle(x, y + 9 * k, 3 * k);
      break;
  }
}

function star(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, r2: number, color: number): void {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const t = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r2 : r;
    pts.push({ x: x + Math.cos(t) * rr, y: y + Math.sin(t) * rr });
  }
  g.fillStyle(color, 1).fillPoints(pts as Phaser.Math.Vector2[], true);
}

/** 룰렛·장비 칸 아이콘 키 */
export const skinIconKey = (id: string) => `skin-icon-${id}`;
export const capeKey = (id: string) => `skin-cape-${id}`;
export const trailKey = (id: string) => `skin-trail-${skinDef(id)?.trail ?? 'flame'}`;
