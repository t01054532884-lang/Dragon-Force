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

  // 불꽃 슬라임: 주황 젤리
  g.clear();
  g.fillStyle(0xff8c42).fillEllipse(16, 20, 30, 22);
  g.fillStyle(0xffc078).fillEllipse(11, 15, 9, 6);
  g.fillStyle(0x2a1a10).fillCircle(11, 21, 2).fillCircle(21, 21, 2);
  g.generateTexture('slime', 32, 32);

  // 왕국 궁수: 초록 두건 + 갈색 활
  g.clear();
  g.fillStyle(0x3f7d3a).fillCircle(20, 22, 14);
  g.fillStyle(0x2e5c2a).fillTriangle(8, 18, 32, 18, 20, 4);
  g.lineStyle(3, 0x8b5a2b).beginPath().arc(30, 22, 10, -1.2, 1.2).strokePath();
  g.generateTexture('archer', 40, 40);

  // 화살
  g.clear();
  g.fillStyle(0xd9c7a3).fillRect(0, 3, 18, 2);
  g.fillStyle(0xe0e0e0).fillTriangle(16, 0, 16, 8, 24, 4);
  g.generateTexture('arrow', 24, 8);

  // 돌격 창기병: 붉은 투구 + 앞으로 내민 창
  g.clear();
  g.fillStyle(0x9c2b2b).fillCircle(20, 22, 15);
  g.fillStyle(0xcfd4dc).fillRect(18, 0, 4, 18);
  g.fillStyle(0xffffff).fillTriangle(16, 4, 24, 4, 20, -4);
  g.fillStyle(0x2a2e36).fillRect(13, 20, 14, 3);
  g.generateTexture('charger', 40, 40);

  // 철갑기사단장(보스): 큰 검은 갑옷 + 금색 왕관 + 붉은 망토
  g.clear();
  g.fillStyle(0x7a1010).fillTriangle(10, 40, 86, 40, 48, 94);
  g.fillStyle(0x3b4250).fillCircle(48, 48, 36);
  g.fillStyle(0x5a6475).fillCircle(48, 42, 22);
  g.fillStyle(0x1b1f27).fillRect(36, 40, 24, 5);
  g.fillStyle(0xffd34d).fillTriangle(32, 22, 40, 22, 36, 10).fillTriangle(44, 22, 52, 22, 48, 6).fillTriangle(56, 22, 64, 22, 60, 10);
  g.fillStyle(0xffd34d).fillRect(32, 20, 32, 5);
  g.generateTexture('boss', 96, 96);

  // 보스 검기: 하얀 초승달
  g.clear();
  g.fillStyle(0xe8f0ff, 0.9).fillEllipse(14, 20, 16, 40);
  g.fillStyle(0x000000, 0).fillEllipse(8, 20, 12, 34);
  g.generateTexture('slash', 28, 40);

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

  // 얼음 파편: 오른쪽을 향한 뾰족한 결정
  g.clear();
  g.fillStyle(0x8fd3ff).fillTriangle(0, 3, 0, 11, 26, 7);
  g.fillStyle(0xe6f7ff).fillTriangle(4, 6, 4, 8, 20, 7);
  g.generateTexture('ice', 26, 14);

  // 드래곤 오브: 빛나는 초록 구슬
  g.clear();
  g.fillStyle(0x2ee6a6, 0.35).fillCircle(16, 16, 16);
  g.fillStyle(0x2ee6a6).fillCircle(16, 16, 10);
  g.fillStyle(0xd9fff1).fillCircle(13, 12, 4);
  g.generateTexture('orb', 32, 32);

  // 경험치 보석: 파란 마름모
  g.clear();
  g.fillStyle(0x4fc3f7).fillTriangle(8, 0, 16, 9, 0, 9).fillTriangle(0, 9, 16, 9, 8, 20);
  g.fillStyle(0xb3e5fc).fillTriangle(8, 3, 12, 9, 4, 9);
  g.generateTexture('gem', 16, 20);

  // 바닥 타일: 풀밭 위에 옅은 격자
  g.clear();
  g.fillStyle(0x1b2a1f).fillRect(0, 0, 128, 128);
  g.lineStyle(2, 0x23382a).strokeRect(0, 0, 128, 128);
  g.fillStyle(0x24392b).fillCircle(32, 40, 3).fillCircle(90, 96, 2).fillCircle(100, 30, 2);
  g.generateTexture('ground', 128, 128);

  g.destroy();
}
