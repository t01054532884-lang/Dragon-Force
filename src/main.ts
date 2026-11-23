import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { LobbyScene } from './scenes/LobbyScene';
import { LabScene } from './scenes/LabScene';
import { DragonsScene } from './scenes/DragonsScene';
import { ShopScene } from './scenes/ShopScene';
import { PassScene } from './scenes/PassScene';
import { EquipScene } from './scenes/EquipScene';
import { MissionScene } from './scenes/MissionScene';
import { EventScene } from './scenes/EventScene';
import { SkinScene } from './scenes/SkinScene';
import { GiftScene } from './scenes/GiftScene';
import { TitleScene } from './scenes/TitleScene';
import { DEMO, initPlatform, platform } from './platform';
import { Progress } from './systems/Progress';
import { STORAGE_KEYS } from './systems/Progress';
import { applySound, SETTINGS_KEY } from './systems/Settings';
import { ACCOUNT_KEY, account } from './systems/Account';
import { cloud } from './systems/Cloud';
import { CLOUD_KEY } from './systems/cloudSync';
import { BASE_W, centerBase, gameHeightFor } from './ui/layout';

/** 장면이 플랫폼 이벤트를 받고 싶으면 이 함수들을 가진다 */
export interface PlatformAware {
  /** 안드로이드·토스 뒤로가기. 처리했으면 true(false면 플랫폼 기본 동작 = 닫기) */
  onPlatformBack?(): boolean;
  /** 앱이 백그라운드로 갔을 때(전투는 일시정지) */
  onPlatformPause?(): void;
}

async function boot(): Promise<void> {
  // 저장소·안전 영역·세로 고정을 먼저 맞춘 뒤 게임을 만든다(저장된 진행을 동기로 읽기 위해)
  await initPlatform([...STORAGE_KEYS, SETTINGS_KEY, ACCOUNT_KEY, CLOUD_KEY]);
  account.current(); // 첫 실행이면 게스트 계정 만들기
  await cloud.start(); // 클라우드 저장(설정 값이 있을 때만, 최대 4초 기다리고 시작 — docs/CLOUD.md)
  if (DEMO) Progress.seedDemo(); // 시험용 저장(진짜 진행과 따로)

  // 게임 전체 설정. 설계 기준은 세로형 휴대폰(720×1280, 9:16)이고, Scale.FIT으로 비율을 지키며 꽉 차게 한다(안전 영역 안쪽에서).
  // 세로가 더 긴 화면(요즘 아이폰 약 9:19.5)은 높이를 그만큼 늘려 위아래 빈 띠가 생기지 않게 한다(src/ui/layout.ts).
  const host = document.getElementById('game');
  const height = gameHeightFor(host?.clientWidth ?? window.innerWidth, host?.clientHeight ?? window.innerHeight);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: BASE_W,
    height,
    backgroundColor: '#1b2a1f',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: [TitleScene, LobbyScene, GameScene, LabScene, DragonsScene, ShopScene, EquipScene, MissionScene, EventScene, SkinScene, GiftScene, PassScene], // 첫 화면은 시작 화면(로고) → 로비
  });

  // 메뉴 화면(전투 제외)은 시작할 때마다 기준 화면을 가운데로
  // (장면 목록은 게임 준비가 끝난 뒤 만들어지므로 ready 뒤에 연결)
  game.events.once('ready', () => {
    for (const s of game.scene.scenes) {
      if (s.scene.key !== 'game') s.sys.events.on('create', () => centerBase(s));
    }
  });

  const active = (): (Phaser.Scene & PlatformAware) | undefined =>
    game.scene.getScenes(true)[0] as (Phaser.Scene & PlatformAware) | undefined;
  platform.onBack(() => active()?.onPlatformBack?.() ?? false);
  platform.onPause(() => active()?.onPlatformPause?.());

  // 개발 중에만 브라우저 콘솔에서 게임 상태를 볼 수 있게 열어 둔다(배포본에는 빠짐).
  applySound(game); // 저장된 소리 설정(끔이면 처음부터 음소거)
  if (import.meta.env.DEV) {
    (window as unknown as { __game: Phaser.Game }).__game = game;
    void import('./dev/bot').then((m) => m.installBot(game)); // 자동 전투 측정 봇(개발 전용)
  }
}

void boot();
