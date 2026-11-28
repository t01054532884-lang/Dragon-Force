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
const BATTLE_UNUSED = /^(scrbg-|att-|rubypass-|lvup-|rune-reward-|medal-|ruby-pack-|mail-open|lobby-bg|title-deco|skin-board-bg|chest-|sigil-|portrait-|equip-|pass-|event-|pkg-|logo-|skin-icon-)/;

/**
 * 드래곤마다 하나씩 있는 그림(2026-11-27 1.0.3 메모리 최적화): 전투에서는 출격 드래곤 것만 쓴다
 * — 전용 스킬 그림(sigart-)·전용 스킬 효과(sigfx-)·필살기 버튼 아이콘(sig-)·기본 공격 카드 아이콘(basic-)
 */
const PER_DRAGON = /^(sigart|sigfx|sig|basic)-([a-z]+)$/;
/** 전투에서 안 쓰는 그림 더(2026-11-27): 룬 아이콘(연구소·상점·보상), 로비 단계 배경(로비가 돌아오면 다시 읽음) */
const BATTLE_UNUSED_MORE = /^(sp-|lobby-bg-\d+$)/;

/** 전투에서 안 쓰는 그림인가(탑다운은 출격 드래곤과 블랙 — 다른 드래곤 필살기 연출이 빌려 씀 — 만 씀) */
function battleUnused(key: string, dragonId: string): boolean {
  if (key.startsWith('top-')) return key !== `top-${dragonId}` && key !== 'top-black';
  const per = PER_DRAGON.exec(key);
  if (per) return per[2] !== dragonId;
  return BATTLE_UNUSED.test(key) || BATTLE_UNUSED_MORE.test(key);
}

/**
 * 로비·메뉴에서 안 쓰는 전투 전용 그림·영상(2026-11-27 1.0.3 메모리 최적화).
 * 전투 preload(preloadBattleArt·preloadUlt)가 없는 것만 다시 읽으므로 내려도 다음 전투에 저절로 올라온다.
 * - 적 그림(art-), 어려움 오라·위험 지대, 처치 시 폭발 그림, 필살기 배경·효과 그림
 * - 필살기 영상·소리 캐시(드래곤을 바꿔 가며 싸우면 드래곤마다 쌓이던 것)
 */
// 1.0.5: 전투 전용 스킬 그림·효과 그림과 해금 축하용 속성 문양도 로비로 돌아오면 내린다(메뉴 preload는 MENU_LAZY라 다시 안 읽음)
// 1.0.5: 단계별 바닥·공격 예고·장애물·위험 지대·적 탄 그림도(단계마다 약 2.5MB가 로비에 쌓이던 것 — 전투 preloadStageArt가 그 단계 것만 다시 읽음)
const LOBBY_UNUSED = /^(art-|aura-enrage$|aura-elite$|zone-danger$|fx-(?!unlock-rays$)|ult-bg$|ult-fx-|sigart-|sigfx-|sigil-|top-|floor-s\d+$|atk-s\d+$|obstacle-(pillar|rock)-s\d+$|zone-s\d+$|shot-(thorn|moon|fire|ice|ghost|gold)$)/;
export function releaseBattleArt(scene: Phaser.Scene): number {
  let n = 0;
  for (const key of scene.textures.getTextureKeys()) {
    // 파일에서 읽은 그림만(도형으로 만든 대체 그림은 다시 만들 수 없으니 건드리지 않음)
    if (!LOBBY_UNUSED.test(key) || !(scene.textures.get(key).getSourceImage() instanceof HTMLImageElement)) continue;
    scene.textures.remove(key);
    n++;
  }
  for (const key of scene.cache.video.getKeys()) if (key.startsWith('ult-')) (scene.cache.video.remove(key), n++);
  for (const key of scene.cache.audio.getKeys()) if (/^ult-.+-(sfx|ko|en)$/.test(key)) (scene.cache.audio.remove(key), n++);
  return n;
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
    if ((LAZY_ART.test(key) && !key.startsWith('scrbg-') && !/^lobby-bg-\d+$/.test(key)) || !tm.exists(key) || !battleUnused(key, dragonId)) continue; // 화면 배경·로비 단계 배경은 따로 읽지만 전투에선 내림
    tm.remove(key);
    n++;
  }
  return n;
}
