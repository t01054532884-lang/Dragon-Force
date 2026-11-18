import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { LobbyScene } from './scenes/LobbyScene';
import { LabScene } from './scenes/LabScene';
import { DragonsScene } from './scenes/DragonsScene';
import { ShopScene } from './scenes/ShopScene';
import { EquipScene } from './scenes/EquipScene';
import { MissionScene } from './scenes/MissionScene';
import { EventScene } from './scenes/EventScene';
import { initPlatform, platform } from './platform';
import { STORAGE_KEYS } from './systems/Progress';

/** 장면이 플랫폼 이벤트를 받고 싶으면 이 함수들을 가진다 */
export interface PlatformAware {
  /** 안드로이드·토스 뒤로가기. 처리했으면 true(false면 플랫폼 기본 동작 = 닫기) */
  onPlatformBack?(): boolean;
  /** 앱이 백그라운드로 갔을 때(전투는 일시정지) */
  onPlatformPause?(): void;
}

async function boot(): Promise<void> {
  // 저장소·안전 영역·세로 고정을 먼저 맞춘 뒤 게임을 만든다(저장된 진행을 동기로 읽기 위해)
  await initPlatform(STORAGE_KEYS);

  // 게임 전체 설정. 화면 크기는 세로형 휴대폰(9:16)을 기준으로 잡고,
  // Scale.FIT으로 PC 브라우저·휴대폰 어디서든 비율을 지키며 꽉 차게 한다(안전 영역 안쪽에서).
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: 720,
    height: 1280,
    backgroundColor: '#1b2a1f',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: [LobbyScene, GameScene, LabScene, DragonsScene, ShopScene, EquipScene, MissionScene, EventScene], // 첫 화면은 로비
  });

  const active = (): (Phaser.Scene & PlatformAware) | undefined =>
    game.scene.getScenes(true)[0] as (Phaser.Scene & PlatformAware) | undefined;
  platform.onBack(() => active()?.onPlatformBack?.() ?? false);
  platform.onPause(() => active()?.onPlatformPause?.());

  // 개발 중에만 브라우저 콘솔에서 게임 상태를 볼 수 있게 열어 둔다(배포본에는 빠짐).
  if (import.meta.env.DEV) (window as unknown as { __game: Phaser.Game }).__game = game;
}

void boot();
