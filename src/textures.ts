import Phaser from 'phaser';

// 그림 파일 없이 도형으로 텍스처를 만든다(6단계 아트에서 교체).
// 콘셉트 아트(기획서 이미지)는 방향 참고용이라 게임에 넣지 않는다.
export function makeTextures(scene: Phaser.Scene): void {
  const g = scene.add.graphics();

  // 플레이어 레드 드래곤(위에서 내려다본 모습): 양 날개 + 몸통 + 머리 + 꼬리
  g.clear();
  g.fillStyle(0x8a1f1f);
  g.fillTriangle(32, 30, 2, 14, 10, 42);
  g.fillTriangle(32, 30, 62, 14, 54, 42);
  g.fillStyle(0xd23b2a).fillEllipse(32, 36, 22, 30);
  g.fillTriangle(26, 48, 38, 48, 32, 63);
  g.fillStyle(0xe8553f).fillCircle(32, 18, 9);
  g.fillStyle(0xffd34d).fillCircle(28, 16, 2).fillCircle(36, 16, 2);
  g.generateTexture('dragon', 64, 64);

  // 그림자 늑대: 보랏빛 회색 몸 + 빛나는 룬 무늬
  wolf(g, 40, 0x5b5470, 0xb9b0ff, 0xd9d4e6);
  g.generateTexture('wolf', 40, 40);

  // 철갑 멧돼지: 갈색 몸 + 회색 갑판 + 엄니
  g.clear();
  g.fillStyle(0x6b4423).fillEllipse(22, 22, 40, 30);
  g.fillStyle(0x8d8d8d).fillRoundedRect(8, 10, 28, 12, 4);
  g.fillStyle(0xf2ead3).fillTriangle(36, 26, 44, 22, 38, 30).fillTriangle(36, 18, 44, 14, 38, 22);
  g.fillStyle(0x2a1a10).fillCircle(34, 20, 2);
  g.generateTexture('boar', 46, 44);

  // 엘리트 월광송곳니: 일반 늑대보다 약 2.5배, 은백색 + 금빛 뿔
  g.clear();
  wolf(g, 96, 0xd9dbe6, 0x8fd3ff, 0xffffff);
  g.fillStyle(0xffc94d).fillTriangle(56, 24, 62, 4, 66, 26).fillTriangle(70, 28, 80, 10, 78, 32);
  g.generateTexture('moonfang', 96, 96);

  // 엘리트 철갑어미: 큰 멧돼지 + 두꺼운 돌 갑옷
  g.clear();
  g.fillStyle(0x5a3a20).fillEllipse(54, 52, 100, 74);
  g.fillStyle(0x777777).fillRoundedRect(16, 22, 70, 30, 10);
  g.fillStyle(0x5f5f5f).fillRoundedRect(24, 52, 54, 18, 8);
  g.fillStyle(0xf2ead3).fillTriangle(88, 60, 108, 48, 94, 70).fillTriangle(88, 42, 108, 30, 94, 52);
  g.fillStyle(0xff3d00).fillCircle(84, 46, 4);
  g.generateTexture('matriarch', 112, 104);

  // 보스 회색갈기 우두머리: 큰 회색 늑대 + 붉은 눈 + 등에 박힌 검은 왕관 파편
  g.clear();
  wolf(g, 132, 0x6f6f78, 0xff5252, 0xb0b0b8);
  g.fillStyle(0x111111).fillTriangle(52, 50, 60, 30, 66, 52).fillTriangle(68, 52, 78, 34, 82, 56);
  g.fillStyle(0xffd34d, 0.8).fillCircle(60, 38, 3);
  g.generateTexture('graymane', 132, 132);

  // 드래곤 화염탄
  g.clear();
  g.fillStyle(0xff7a1a).fillCircle(9, 9, 9);
  g.fillStyle(0xffe066).fillCircle(9, 9, 5);
  g.generateTexture('fireball', 18, 18);

  // 얼음 파편
  g.clear();
  g.fillStyle(0x8fd3ff).fillTriangle(0, 3, 0, 11, 26, 7);
  g.fillStyle(0xe6f7ff).fillTriangle(4, 6, 4, 8, 20, 7);
  g.generateTexture('ice', 26, 14);

  // 드래곤 오브
  g.clear();
  g.fillStyle(0x2ee6a6, 0.35).fillCircle(16, 16, 16);
  g.fillStyle(0x2ee6a6).fillCircle(16, 16, 10);
  g.fillStyle(0xd9fff1).fillCircle(13, 12, 4);
  g.generateTexture('orb', 32, 32);

  // 경험치 결정
  g.clear();
  g.fillStyle(0x4fc3f7).fillTriangle(8, 0, 16, 9, 0, 9).fillTriangle(0, 9, 16, 9, 8, 20);
  g.fillStyle(0xb3e5fc).fillTriangle(8, 3, 12, 9, 4, 9);
  g.generateTexture('gem', 16, 20);

  // 잿빛 숲 바닥: 재가 내려앉은 돌바닥
  g.clear();
  g.fillStyle(0x3a3a3f).fillRect(0, 0, 128, 128);
  g.lineStyle(2, 0x2e2e33).strokeRect(0, 0, 64, 64).strokeRect(64, 64, 64, 64).strokeRect(64, 0, 64, 64).strokeRect(0, 64, 64, 64);
  g.fillStyle(0x4a4a50).fillCircle(30, 40, 3).fillCircle(96, 92, 2).fillCircle(100, 26, 2);
  g.fillStyle(0x6b2a2a, 0.5).fillCircle(80, 50, 2);
  g.generateTexture('ground', 128, 128);

  g.destroy();
}

/** 위에서 본 늑대: 몸통 + 머리 + 귀 + 꼬리 + 무늬. 크기(size)만 바꿔 일반·엘리트·보스에 재사용 */
function wolf(g: Phaser.GameObjects.Graphics, size: number, body: number, mark: number, light: number): void {
  const k = size / 40;
  g.clear();
  g.fillStyle(body).fillEllipse(18 * k, 20 * k, 26 * k, 18 * k);
  g.fillTriangle(4 * k, 20 * k, 10 * k, 16 * k, 10 * k, 24 * k); // 꼬리
  g.fillCircle(31 * k, 20 * k, 7 * k); // 머리
  g.fillTriangle(28 * k, 13 * k, 31 * k, 8 * k, 33 * k, 14 * k).fillTriangle(28 * k, 27 * k, 31 * k, 32 * k, 33 * k, 26 * k); // 귀
  g.fillStyle(light).fillTriangle(36 * k, 18 * k, 40 * k, 20 * k, 36 * k, 22 * k); // 주둥이
  g.fillStyle(mark).fillCircle(14 * k, 18 * k, 1.6 * k).fillCircle(20 * k, 22 * k, 1.6 * k).fillCircle(33 * k, 18 * k, 1.2 * k).fillCircle(33 * k, 22 * k, 1.2 * k);
}
