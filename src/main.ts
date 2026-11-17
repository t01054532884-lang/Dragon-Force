import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { LobbyScene } from './scenes/LobbyScene';
import { LabScene } from './scenes/LabScene';

// 게임 전체 설정. 화면 크기는 세로형 휴대폰(9:16)을 기준으로 잡고,
// Scale.FIT으로 PC 브라우저·휴대폰 어디서든 비율을 지키며 꽉 차게 한다.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 720,
  height: 1280,
  backgroundColor: '#1b2a1f',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { debug: false } },
  scene: [LobbyScene, GameScene, LabScene], // 첫 화면은 로비
});

// 개발 중에만 브라우저 콘솔에서 게임 상태를 볼 수 있게 열어 둔다(배포본에는 빠짐).
if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
