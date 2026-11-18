import Phaser from 'phaser';
import { SEASON1_ENEMIES, CHAPTERS } from './data/season1';
import type { ArtShape } from './data/enemies';

// 7단계 2~20단계 적 그림(그림 파일 없이 도형). 위에서 본 모습, 오른쪽(+x)이 앞.
// 종류(shape)별 그리기 함수 하나 + 몸 색·강조 색만 바꿔 100여 종을 만든다(9단계 아트에서 교체 예정).

type G = Phaser.GameObjects.Graphics;

const DRAW: Record<ArtShape, (g: G, s: number, body: number, acc: number) => void> = {
  beast(g, s, body, acc) {
    const k = s / 40;
    g.fillStyle(body).fillEllipse(18 * k, 20 * k, 26 * k, 18 * k);
    g.fillTriangle(4 * k, 20 * k, 10 * k, 16 * k, 10 * k, 24 * k);
    g.fillCircle(31 * k, 20 * k, 7 * k);
    g.fillTriangle(28 * k, 13 * k, 31 * k, 8 * k, 33 * k, 14 * k).fillTriangle(28 * k, 27 * k, 31 * k, 32 * k, 33 * k, 26 * k);
    g.fillStyle(acc).fillTriangle(36 * k, 18 * k, 40 * k, 20 * k, 36 * k, 22 * k);
    g.fillCircle(14 * k, 18 * k, 1.8 * k).fillCircle(20 * k, 22 * k, 1.8 * k).fillCircle(33 * k, 18 * k, 1.3 * k).fillCircle(33 * k, 22 * k, 1.3 * k);
  },
  boar(g, s, body, acc) {
    const k = s / 44;
    g.fillStyle(body).fillEllipse(22 * k, 22 * k, 40 * k, 30 * k);
    g.fillStyle(acc).fillRoundedRect(8 * k, 10 * k, 28 * k, 12 * k, 4 * k);
    g.fillStyle(0xf2ead3).fillTriangle(36 * k, 26 * k, 44 * k, 22 * k, 38 * k, 30 * k).fillTriangle(36 * k, 18 * k, 44 * k, 14 * k, 38 * k, 22 * k);
    g.fillStyle(0x1a1a1a).fillCircle(34 * k, 20 * k, 2 * k);
  },
  humanoid(g, s, body, acc) {
    const k = s / 40;
    g.fillStyle(body).fillEllipse(18 * k, 20 * k, 16 * k, 28 * k); // 어깨
    g.fillCircle(22 * k, 8 * k, 4 * k).fillCircle(22 * k, 32 * k, 4 * k); // 팔
    g.fillStyle(acc).fillCircle(21 * k, 20 * k, 6.5 * k); // 머리
    g.lineStyle(3 * k, 0xd7ccc8).lineBetween(22 * k, 32 * k, 39 * k, 30 * k); // 무기
  },
  knight(g, s, body, acc) {
    const k = s / 40;
    g.fillStyle(body).fillEllipse(17 * k, 20 * k, 18 * k, 30 * k);
    g.fillStyle(acc).fillRoundedRect(25 * k, 7 * k, 7 * k, 22 * k, 2 * k); // 방패(정면)
    g.fillStyle(body).fillCircle(18 * k, 20 * k, 7 * k);
    g.fillStyle(acc).fillRect(20 * k, 18 * k, 5 * k, 4 * k); // 투구 틈
    g.lineStyle(3 * k, 0xeceff1).lineBetween(20 * k, 32 * k, 38 * k, 33 * k);
  },
  mage(g, s, body, acc) {
    const k = s / 40;
    g.fillStyle(body).fillCircle(18 * k, 20 * k, 13 * k); // 로브
    g.fillStyle(Phaser.Display.Color.IntegerToColor(body).darken(25).color).fillCircle(20 * k, 20 * k, 7 * k); // 두건
    g.lineStyle(2.5 * k, 0x8d6e63).lineBetween(20 * k, 30 * k, 34 * k, 34 * k); // 지팡이
    g.fillStyle(acc).fillCircle(35 * k, 34 * k, 3.5 * k);
    g.fillStyle(acc, 0.35).fillCircle(35 * k, 34 * k, 6 * k);
  },
  archer(g, s, body, acc) {
    const k = s / 40;
    g.fillStyle(body).fillEllipse(17 * k, 20 * k, 15 * k, 26 * k);
    g.fillStyle(acc).fillCircle(20 * k, 20 * k, 6 * k);
    g.lineStyle(2.5 * k, 0x8d6e63).beginPath().arc(26 * k, 20 * k, 11 * k, -1.2, 1.2).strokePath(); // 활
    g.lineStyle(1.2 * k, 0xeeeeee).lineBetween(26 * k + Math.cos(-1.2) * 11 * k, 20 * k + Math.sin(-1.2) * 11 * k, 26 * k + Math.cos(1.2) * 11 * k, 20 * k + Math.sin(1.2) * 11 * k);
  },
  slime(g, s, body, acc) {
    const k = s / 40;
    g.fillStyle(body, 0.9).fillEllipse(20 * k, 21 * k, 32 * k, 28 * k);
    g.fillStyle(acc, 0.8).fillEllipse(15 * k, 15 * k, 10 * k, 6 * k);
    g.fillStyle(0x1a1a1a).fillCircle(27 * k, 17 * k, 2.2 * k).fillCircle(27 * k, 25 * k, 2.2 * k);
  },
  spirit(g, s, body, acc) {
    const k = s / 40;
    g.fillStyle(body, 0.5).fillTriangle(2 * k, 20 * k, 22 * k, 9 * k, 22 * k, 31 * k); // 꼬리
    g.fillStyle(body, 0.85).fillCircle(25 * k, 20 * k, 11 * k);
    g.fillStyle(acc).fillCircle(29 * k, 16 * k, 2.2 * k).fillCircle(29 * k, 24 * k, 2.2 * k);
  },
  flyer(g, s, body, acc) {
    const k = s / 40;
    g.fillStyle(body).fillTriangle(18 * k, 18 * k, 8 * k, 2 * k, 26 * k, 14 * k).fillTriangle(18 * k, 22 * k, 8 * k, 38 * k, 26 * k, 26 * k); // 날개
    g.fillEllipse(20 * k, 20 * k, 18 * k, 10 * k);
    g.fillStyle(acc).fillCircle(29 * k, 20 * k, 4 * k);
    g.fillStyle(0x1a1a1a).fillCircle(31 * k, 18.5 * k, 1 * k).fillCircle(31 * k, 21.5 * k, 1 * k);
  },
  insect(g, s, body, acc) {
    const k = s / 40;
    g.lineStyle(2 * k, Phaser.Display.Color.IntegerToColor(body).darken(30).color);
    for (const x of [13, 19, 25]) g.lineBetween(x * k, 20 * k, (x - 3) * k, 6 * k).lineBetween(x * k, 20 * k, (x - 3) * k, 34 * k);
    g.fillStyle(body).fillEllipse(17 * k, 20 * k, 20 * k, 16 * k);
    g.fillStyle(acc).fillEllipse(28 * k, 20 * k, 10 * k, 10 * k);
    g.fillStyle(acc, 0.6).fillRect(9 * k, 19 * k, 14 * k, 2 * k);
  },
  golem(g, s, body, acc) {
    const k = s / 40;
    g.fillStyle(body).fillRoundedRect(8 * k, 8 * k, 24 * k, 24 * k, 4 * k);
    g.fillRoundedRect(14 * k, 1 * k, 12 * k, 9 * k, 2 * k).fillRoundedRect(14 * k, 30 * k, 12 * k, 9 * k, 2 * k); // 어깨
    g.fillStyle(Phaser.Display.Color.IntegerToColor(body).darken(20).color).fillRect(12 * k, 12 * k, 4 * k, 16 * k);
    g.fillStyle(acc).fillCircle(22 * k, 20 * k, 4 * k);
    g.fillStyle(acc, 0.35).fillCircle(22 * k, 20 * k, 7 * k);
  },
  plant(g, s, body, acc) {
    const k = s / 40;
    g.fillStyle(acc);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      g.fillCircle(20 * k + Math.cos(a) * 12 * k, 20 * k + Math.sin(a) * 12 * k, 6 * k); // 잎
    }
    g.fillStyle(body).fillCircle(20 * k, 20 * k, 11 * k); // 줄기
    g.fillStyle(0xffeb3b).fillCircle(26 * k, 17 * k, 1.8 * k).fillCircle(26 * k, 23 * k, 1.8 * k);
  },
  imp(g, s, body, acc) {
    const k = s / 40;
    g.fillStyle(Phaser.Display.Color.IntegerToColor(body).darken(25).color).fillTriangle(16 * k, 18 * k, 4 * k, 6 * k, 20 * k, 12 * k).fillTriangle(16 * k, 22 * k, 4 * k, 34 * k, 20 * k, 28 * k);
    g.fillStyle(body).fillCircle(20 * k, 20 * k, 9 * k);
    g.fillStyle(acc).fillTriangle(24 * k, 13 * k, 31 * k, 9 * k, 27 * k, 16 * k).fillTriangle(24 * k, 27 * k, 31 * k, 31 * k, 27 * k, 24 * k);
    g.fillStyle(0xffeb3b).fillCircle(26 * k, 18 * k, 1.6 * k).fillCircle(26 * k, 22 * k, 1.6 * k);
  },
  dragon(g, s, body, acc) {
    const k = s / 64;
    const dark = Phaser.Display.Color.IntegerToColor(body).darken(30).color;
    g.fillStyle(dark).fillTriangle(30 * k, 32 * k, 14 * k, 2 * k, 42 * k, 24 * k).fillTriangle(30 * k, 32 * k, 14 * k, 62 * k, 42 * k, 40 * k); // 날개
    g.fillStyle(body).fillEllipse(30 * k, 32 * k, 34 * k, 22 * k);
    g.fillTriangle(16 * k, 26 * k, 16 * k, 38 * k, 1 * k, 32 * k); // 꼬리
    g.fillCircle(49 * k, 32 * k, 9 * k);
    g.fillStyle(acc).fillCircle(52 * k, 28 * k, 2 * k).fillCircle(52 * k, 36 * k, 2 * k);
    g.fillStyle(acc).fillTriangle(44 * k, 24 * k, 48 * k, 16 * k, 50 * k, 25 * k).fillTriangle(44 * k, 40 * k, 48 * k, 48 * k, 50 * k, 39 * k);
  },
};

export function makeEnemyTextures(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  for (const [id, d] of Object.entries(SEASON1_ENEMIES)) {
    const a = d.art!;
    g.clear();
    // 엘리트·보스는 발밑에 등급 고리(멀리서도 구분)
    if (d.rank !== 'normal') g.fillStyle(d.rank === 'boss' ? 0xff1744 : 0xffb74d, 0.18).fillCircle(a.size / 2, a.size / 2, a.size / 2);
    DRAW[a.shape](g, a.size, a.body, a.accent);
    g.generateTexture(`e-${id}`, a.size, a.size);
  }
  // 적 투사체: 붉은 화살촉형 탄 / 보랏빛 추적 구체
  g.clear();
  g.fillStyle(0xff3d00, 0.35).fillCircle(10, 10, 10);
  g.fillStyle(0xff6e40).fillTriangle(2, 5, 2, 15, 20, 10);
  g.fillStyle(0xffe0b2).fillCircle(9, 10, 3);
  g.generateTexture('e-shot', 20, 20);
  g.clear();
  g.fillStyle(0xb388ff, 0.35).fillCircle(16, 16, 16);
  g.fillStyle(0x7c4dff).fillCircle(16, 16, 10);
  g.fillStyle(0xede7f6).fillCircle(13, 13, 4);
  g.generateTexture('e-orb', 32, 32);
  // 챕터 2~5 바닥(1장은 기존 'ground')
  for (const ch of CHAPTERS.slice(1)) {
    g.clear();
    g.fillStyle(ch.floor).fillRect(0, 0, 128, 128);
    const line = Phaser.Display.Color.IntegerToColor(ch.floor).darken(15).color;
    g.lineStyle(2, line).strokeRect(0, 0, 64, 64).strokeRect(64, 64, 64, 64).strokeRect(64, 0, 64, 64).strokeRect(0, 64, 64, 64);
    g.fillStyle(ch.line, 0.35).fillCircle(30, 40, 3).fillCircle(96, 92, 2).fillCircle(100, 26, 2).fillCircle(70, 70, 2);
    g.generateTexture(`ground-${ch.id}`, 128, 128);
  }
  g.destroy();
}
