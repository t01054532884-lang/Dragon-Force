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

  // 바닥 타일: 풀밭 위에 옅은 격자
  g.clear();
  g.fillStyle(0x1b2a1f).fillRect(0, 0, 128, 128);
  g.lineStyle(2, 0x23382a).strokeRect(0, 0, 128, 128);
  g.fillStyle(0x24392b).fillCircle(32, 40, 3).fillCircle(90, 96, 2).fillCircle(100, 30, 2);
  g.generateTexture('ground', 128, 128);

  g.destroy();
}
