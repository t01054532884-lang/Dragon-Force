import type Phaser from 'phaser';
import { ART_FILES, LAZY_ART } from './art';

/**
 * 전투 중 메모리 줄이기(2026-11-25 제작자 요청 "렉이 안 걸리게").
 * 첫 화면이 그림 300여 장(GPU 약 160MB 추정)을 한꺼번에 읽어 둔다. 전투에서는 쓰지 않는 큰 그림
 * (상자 개봉·속성 문양·초상·다른 드래곤 탑다운·로비 배경·타이틀·장비·패스·이벤트·패키지·로고·스킨 아이콘)을
 * 전투가 시작될 때 GPU에서 내린다. 로비·메뉴 장면은 preload에서 preloadArt가 없는 그림만 다시 읽으므로
 * 돌아가면 저절로 다시 올라온다(브라우저 캐시라 빠름).
 * 내리는 것은 ART_FILES에 있는 실제 그림 파일만 — 도형으로 만든 대체 그림은 건드리지 않는다.
 */
const BATTLE_UNUSED = /^(scrbg-|att-|medal-|ruby-pack-|mail-open|lobby-bg|title-deco|skin-board-bg|chest-|sigil-|portrait-|equip-|pass-|event-|pkg-|logo-|skin-icon-)/;

/** 전투에서 안 쓰는 그림인가(탑다운은 출격 드래곤과 블랙 — 다른 드래곤 필살기 연출이 빌려 씀 — 만 씀) */
function battleUnused(key: string, dragonId: string): boolean {
  if (key.startsWith('top-')) return key !== `top-${dragonId}` && key !== 'top-black';
  return BATTLE_UNUSED.test(key);
}

/** 전투 preload: 전투에서 쓰는 그림 중 아직 없는 것만(다시 도전할 때 내린 그림을 또 읽지 않게) */
export function preloadBattleArt(scene: Phaser.Scene, dragonId: string): void {
  for (const [key, file] of Object.entries(ART_FILES)) {
    if (!file || LAZY_ART.test(key) || battleUnused(key, dragonId) || scene.textures.exists(key)) continue;
    scene.load.image(key, `art/${file}`);
  }
}

/** 전투 create 끝에서: 전투에서 안 쓰는 그림을 GPU에서 내린다. 내린 개수를 돌려준다 */
export function releaseLobbyArt(scene: Phaser.Scene, dragonId: string): number {
  const tm = scene.textures;
  let n = 0;
  for (const key of Object.keys(ART_FILES)) {
    if ((LAZY_ART.test(key) && !key.startsWith('scrbg-')) || !tm.exists(key) || !battleUnused(key, dragonId)) continue; // 화면 배경은 따로 읽지만 전투에선 내림
    tm.remove(key);
    n++;
  }
  return n;
}
