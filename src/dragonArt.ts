import Phaser from 'phaser';
import { DRAGON_ORDER, DRAGONS, type DragonDef } from './data/dragons';

// 6단계 드래곤 10종 임시 그림(도형). 위에서 내려다본 모습, 머리가 위쪽.
// 색과 특징(얼음 결정·번개·독 반점·후광·암흑 불꽃·바위와 이끼·바람 소용돌이·지느러미·마법 결정)은
// 6단계 기획서의 콘셉트 아틀라스를 참고했다. 콘셉트 그림 자체는 게임 에셋으로 쓰지 않는다(제작자 확정 규칙).

const shade = (c: number, f: number) => {
  const col = Phaser.Display.Color.IntegerToColor(c);
  return Phaser.Display.Color.GetColor(Math.min(255, col.red * f), Math.min(255, col.green * f), Math.min(255, col.blue * f));
};

/** 크기 64×k 정사각형에 드래곤 한 마리 */
export function drawDragon(g: Phaser.GameObjects.Graphics, d: DragonDef, k: number): void {
  const p = (v: number) => v * k;
  const body = d.color;
  const wing = shade(d.color, 0.68);
  const id = d.id;
  g.clear();

  // 날개: 종류마다 모양을 조금씩
  if (id === 'white') {
    // 깃털 날개: 겹친 타원
    g.fillStyle(0xfffaf0);
    for (let i = 0; i < 3; i++) {
      g.fillEllipse(p(16 - i * 4), p(28 + i * 4), p(22), p(9));
      g.fillEllipse(p(48 + i * 4), p(28 + i * 4), p(22), p(9));
    }
    g.fillStyle(d.accent, 0.8).fillEllipse(p(8), p(36), p(10), p(5)).fillEllipse(p(56), p(36), p(10), p(5));
  } else if (id === 'wind') {
    // 길고 가는 날개
    g.fillStyle(wing).fillTriangle(p(32), p(30), p(0), p(8), p(14), p(40)).fillTriangle(p(32), p(30), p(64), p(8), p(50), p(40));
    g.fillStyle(d.accent, 0.7).fillTriangle(p(26), p(30), p(4), p(12), p(14), p(34)).fillTriangle(p(38), p(30), p(60), p(12), p(50), p(34));
  } else if (id === 'stone') {
    // 바위 날개(각진 판)
    g.fillStyle(wing).fillRect(p(4), p(18), p(18), p(20)).fillRect(p(42), p(18), p(18), p(20));
    g.fillStyle(shade(wing, 0.8)).fillRect(p(8), p(22), p(8), p(8)).fillRect(p(48), p(26), p(8), p(8));
  } else {
    g.fillStyle(wing).fillTriangle(p(32), p(30), p(2), p(14), p(10), p(42)).fillTriangle(p(32), p(30), p(62), p(14), p(54), p(42));
    if (id === 'water') g.fillStyle(d.accent, 0.8).fillTriangle(p(26), p(30), p(6), p(18), p(12), p(36)).fillTriangle(p(38), p(30), p(58), p(18), p(52), p(36));
    if (id === 'black') g.lineStyle(p(2), d.accent, 0.9).strokeTriangle(p(32), p(30), p(2), p(14), p(10), p(42)).strokeTriangle(p(32), p(30), p(62), p(14), p(54), p(42));
  }

  // 꼬리
  g.fillStyle(body).fillTriangle(p(26), p(48), p(38), p(48), p(32), p(63));
  if (id === 'red') g.fillStyle(0xffb347).fillCircle(p(32), p(61), p(3)); // 불꽃 꼬리 끝
  if (id === 'blue') g.fillStyle(d.accent).fillTriangle(p(29), p(56), p(35), p(56), p(32), p(64));

  // 몸통 + 배
  if (id === 'stone') {
    g.fillStyle(body).fillRoundedRect(p(20), p(22), p(24), p(30), p(6));
    g.fillStyle(shade(body, 1.2)).fillRect(p(23), p(28), p(8), p(8)).fillRect(p(33), p(38), p(8), p(8));
  } else {
    g.fillStyle(body).fillEllipse(p(32), p(36), p(22), p(30));
  }
  g.fillStyle(d.belly, 0.85).fillEllipse(p(32), p(38), p(9), p(20));

  // 머리
  g.fillStyle(shade(body, 1.12)).fillCircle(p(32), p(18), p(9));
  // 뿔
  const horn = id === 'blue' ? 0xe3f4ff : id === 'white' || id === 'yellow' ? 0xd9b44a : id === 'stone' ? 0x6e5a44 : 0x8a6a4a;
  g.fillStyle(horn).fillTriangle(p(25), p(14), p(28), p(12), p(23), p(4)).fillTriangle(p(39), p(14), p(36), p(12), p(41), p(4));
  // 눈
  const eye = { red: 0xffd34d, blue: 0x4fc3f7, yellow: 0xff8f00, green: 0xb388ff, white: 0xffc107, black: 0xd1a3ff, stone: 0xffb300, wind: 0x26a69a, water: 0x0277bd, arcane: 0xff80ab }[id];
  g.fillStyle(eye).fillCircle(p(28), p(17), p(2)).fillCircle(p(36), p(17), p(2));

  // 속성 장식
  switch (id) {
    case 'blue': // 등의 얼음 결정
      g.fillStyle(0xffffff, 0.9);
      for (let i = 0; i < 3; i++) g.fillTriangle(p(29), p(28 + i * 7), p(35), p(28 + i * 7), p(32), p(22 + i * 7));
      break;
    case 'yellow': // 날개의 번개 무늬
      g.lineStyle(p(2), 0xfffde7, 1);
      g.lineBetween(p(8), p(22), p(14), p(28)).lineBetween(p(14), p(28), p(10), p(32)).lineBetween(p(10), p(32), p(18), p(38));
      g.lineBetween(p(56), p(22), p(50), p(28)).lineBetween(p(50), p(28), p(54), p(32)).lineBetween(p(54), p(32), p(46), p(38));
      break;
    case 'green': // 보라 독 반점
      g.fillStyle(d.accent).fillCircle(p(27), p(32), p(2.5)).fillCircle(p(37), p(40), p(2.5)).fillCircle(p(30), p(46), p(2)).fillCircle(p(12), p(26), p(2.5)).fillCircle(p(52), p(26), p(2.5));
      break;
    case 'white': // 금빛 후광
      g.lineStyle(p(2), d.accent, 1).strokeCircle(p(32), p(18), p(12));
      break;
    case 'black': // 보랏빛 눈 주변 불꽃
      g.fillStyle(d.accent, 0.5).fillCircle(p(32), p(36), p(4));
      break;
    case 'stone': // 이끼
      g.fillStyle(d.accent).fillCircle(p(24), p(24), p(3)).fillCircle(p(42), p(30), p(2.5)).fillCircle(p(12), p(20), p(2.5)).fillCircle(p(52), p(36), p(2.5));
      g.fillStyle(0xffffff).fillCircle(p(25), p(23), p(1));
      break;
    case 'wind': // 소용돌이
      g.lineStyle(p(1.5), d.accent, 0.9);
      g.beginPath().arc(p(32), p(36), p(18), 0.4, 2.2).strokePath();
      g.beginPath().arc(p(32), p(36), p(18), 3.5, 5.3).strokePath();
      break;
    case 'water': // 물방울
      g.fillStyle(0xe1f5fe, 0.9).fillCircle(p(10), p(46), p(2.5)).fillCircle(p(54), p(48), p(2)).fillCircle(p(48), p(54), p(1.5));
      break;
    case 'arcane': // 마법 결정과 고리
      g.lineStyle(p(1.5), d.accent, 0.9).strokeEllipse(p(32), p(36), p(44), p(14));
      g.fillStyle(0xe1bee7).fillTriangle(p(8), p(30), p(12), p(24), p(16), p(30)).fillTriangle(p(48), p(30), p(52), p(24), p(56), p(30));
      g.fillStyle(0xffffff).fillCircle(p(10), p(44), p(1.2)).fillCircle(p(54), p(44), p(1.2));
      break;
  }
}

/** 투사체 그림: 오른쪽(+x)을 향하게 그린다(발사 방향으로 회전) */
function drawBolts(g: Phaser.GameObjects.Graphics): void {
  g.clear(); // 얼음탄: 결정
  g.fillStyle(0x8fd3ff).fillTriangle(0, 4, 0, 14, 24, 9);
  g.fillStyle(0xe6f7ff).fillTriangle(3, 7, 3, 11, 18, 9);
  g.generateTexture('bolt-ice', 24, 18);
  g.clear(); // 번개탄: 지그재그
  g.lineStyle(4, 0xfff176, 1).beginPath().moveTo(0, 9).lineTo(8, 3).lineTo(14, 13).lineTo(24, 7).strokePath();
  g.lineStyle(2, 0xffffff, 1).beginPath().moveTo(0, 9).lineTo(8, 3).lineTo(14, 13).lineTo(24, 7).strokePath();
  g.generateTexture('bolt-lightning', 24, 16);
  g.clear(); // 독액탄
  g.fillStyle(0x7cb342).fillCircle(10, 9, 8);
  g.fillStyle(0xb388ff).fillCircle(11, 8, 3.5);
  g.generateTexture('bolt-poison', 20, 18);
  g.clear(); // 빛탄
  g.fillStyle(0xfff3c4, 0.5).fillCircle(11, 11, 11);
  g.fillStyle(0xffffff).fillCircle(11, 11, 6);
  g.fillStyle(0xffd54f).fillRect(14, 10, 8, 2);
  g.generateTexture('bolt-light', 22, 22);
  g.clear(); // 암흑탄
  g.fillStyle(0x7e57c2, 0.6).fillCircle(10, 10, 10);
  g.fillStyle(0x1a1026).fillCircle(10, 10, 6);
  g.fillStyle(0xd1a3ff).fillCircle(12, 8, 2);
  g.generateTexture('bolt-dark', 20, 20);
  g.clear(); // 바위탄
  g.fillStyle(0x8d6e63).fillPoints([new Phaser.Math.Vector2(2, 8), new Phaser.Math.Vector2(8, 1), new Phaser.Math.Vector2(18, 3), new Phaser.Math.Vector2(21, 12), new Phaser.Math.Vector2(12, 19), new Phaser.Math.Vector2(3, 16)], true);
  g.fillStyle(0xbcaaa4).fillCircle(9, 7, 3);
  g.generateTexture('bolt-rock', 22, 20);
  g.clear(); // 바람 칼날: 초승달
  g.lineStyle(5, 0x5ed6b4, 1).beginPath().arc(4, 10, 13, -1.0, 1.0).strokePath();
  g.lineStyle(2, 0xe0fff6, 1).beginPath().arc(4, 10, 13, -0.9, 0.9).strokePath();
  g.generateTexture('bolt-wind', 20, 20);
  g.clear(); // 물탄: 물방울
  g.fillStyle(0x29b6f6).fillCircle(9, 9, 8).fillTriangle(9, 1, 9, 17, 24, 9);
  g.fillStyle(0xe1f5fe).fillCircle(7, 7, 3);
  g.generateTexture('bolt-water', 24, 18);
  g.clear(); // 마력탄: 별빛 구슬
  g.fillStyle(0xea80fc, 0.5).fillCircle(10, 10, 10);
  g.fillStyle(0xb388ff).fillCircle(10, 10, 6);
  g.fillStyle(0xffffff).fillTriangle(10, 4, 12, 10, 8, 10).fillTriangle(10, 16, 12, 10, 8, 10);
  g.generateTexture('bolt-arcane', 20, 20);
}

/** 드래곤 64px(전투) · 192px(UI 초상) + 투사체 */
export function makeDragonTextures(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  for (const id of DRAGON_ORDER) {
    drawDragon(g, DRAGONS[id], 1);
    g.generateTexture(`dragon-${id}`, 64, 64);
    // 초상은 기획자 그림(public/art/portrait-*.webp)을 먼저 읽었으면 그대로 쓰고, 없을 때만 도형으로
    if (!scene.textures.exists(`portrait-${id}`)) {
      drawDragon(g, DRAGONS[id], 3);
      g.generateTexture(`portrait-${id}`, 192, 192);
    }
  }
  drawBolts(g);
  g.destroy();
}
