import Phaser from 'phaser';

// 그림 파일 없이 도형으로 텍스처를 만든다.
// 다른 게임의 그림을 쓰지 않고, 나중에 직접 만든 그림으로 바꾸기도 쉽다.
export function makeTextures(scene: Phaser.Scene): void {
  const g = scene.add.graphics();

  // 플레이어 드래곤(위에서 내려다본 모습): 양 날개 + 몸통 + 머리 + 꼬리
  g.clear();
  g.fillStyle(0x8a1f1f);
  g.fillTriangle(32, 30, 2, 14, 10, 42); // 왼쪽 날개
  g.fillTriangle(32, 30, 62, 14, 54, 42); // 오른쪽 날개
  g.fillStyle(0xd23b2a).fillEllipse(32, 36, 22, 30); // 몸통
  g.fillTriangle(26, 48, 38, 48, 32, 63); // 꼬리
  g.fillStyle(0xe8553f).fillCircle(32, 18, 9); // 머리
  g.fillStyle(0xffd34d).fillCircle(28, 16, 2).fillCircle(36, 16, 2); // 눈
  g.generateTexture('dragon', 64, 64);

  // 왕국 기사: 은색 갑옷 + 파란 방패
  g.clear();
  g.fillStyle(0xb8bfcc).fillCircle(20, 20, 15);
  g.fillStyle(0x3a4a8c).fillRoundedRect(4, 14, 12, 18, 3);
  g.fillStyle(0x2a2e36).fillRect(16, 14, 10, 3);
  g.generateTexture('knight', 40, 40);

  // 궁정 마법사: 보라색 로브 + 뾰족 모자
  g.clear();
  g.fillStyle(0x6b3fa0).fillCircle(20, 24, 14);
  g.fillStyle(0x4a2a75).fillTriangle(10, 18, 30, 18, 20, 0);
  g.fillStyle(0x9ee7ff).fillCircle(32, 26, 4); // 지팡이 끝 보석
  g.generateTexture('mage', 40, 40);

  // 성벽 골렘: 크고 각진 회색 돌
  g.clear();
  g.fillStyle(0x6e6a63).fillRoundedRect(4, 4, 56, 56, 12);
  g.fillStyle(0x58544e).fillRect(14, 16, 14, 10).fillRect(36, 34, 14, 12);
  g.fillStyle(0x7fd1ff).fillCircle(24, 26, 3).fillCircle(40, 26, 3);
  g.generateTexture('golem', 64, 64);

  // 드래곤 화염탄
  g.clear();
  g.fillStyle(0xff7a1a).fillCircle(9, 9, 9);
  g.fillStyle(0xffe066).fillCircle(9, 9, 5);
  g.generateTexture('fireball', 18, 18);

  // 마법사 마력탄
  g.clear();
  g.fillStyle(0xc77dff).fillCircle(7, 7, 7);
  g.fillStyle(0xffffff).fillCircle(7, 7, 3);
  g.generateTexture('bolt', 14, 14);

  // 바닥 타일: 풀밭 위에 옅은 격자
  g.clear();
  g.fillStyle(0x1b2a1f).fillRect(0, 0, 128, 128);
  g.lineStyle(2, 0x23382a).strokeRect(0, 0, 128, 128);
  g.fillStyle(0x24392b).fillCircle(32, 40, 3).fillCircle(90, 96, 2).fillCircle(100, 30, 2);
  g.generateTexture('ground', 128, 128);

  g.destroy();
}
