import Phaser from 'phaser';
import { musicOn } from './Settings';

// 배경 음악(8단계 v2.0 10.2: BGM 기본 음량 0.35). 제작자가 만드는 3곡: 로비 · 일반 전투 · 보스전.
// 파일이 MUSIC_FILES에 적혀 있을 때만 읽고 튼다 → 곡이 오기 전에는 조용히 아무 일도 안 함.
// 소리 끄기 설정은 Phaser 음소거(applySound)로 함께 꺼진다. 백그라운드에서는 Phaser가 멈췄다가 돌아오면 이어서 튼다.

export type Track = 'bgm-lobby' | 'bgm-battle' | 'bgm-boss';

/** 곡 → public/bgm/ 파일 이름. 제작자 직접 작곡·합성 1차 시안(2026-11-20, docs/SOUND.md). 없는 곡은 null */
export const MUSIC_FILES: Record<Track, string | null> = {
  'bgm-lobby': 'bgm-lobby-fantasy', // 동화 같은 판타지 · 100 BPM · 19.2초 반복
  'bgm-battle': 'bgm-battle-adventure', // 신나는 모험 · 140 BPM · 13.7초 반복
  'bgm-boss': 'bgm-boss-crown', // 긴장감 있는 결전 · 128 BPM · 15초 반복
};

const VOLUME = 0.35;
const FADE_MS = 700; // 화면 전환 페이드 0.5~1초(제작자 요청)

let current: { key: Track; snd: Phaser.Sound.BaseSound } | null = null;
/** 지금 장면이 원하는 곡(배경 음악을 껐다 켜면 이 곡을 다시 튼다) */
let wanted: Track | null = null;

/** 이 장면에서 쓸 곡만 미리 읽기(처음부터 모든 곡을 읽지 않음 — 기획 13.2) */
export function preloadMusic(scene: Phaser.Scene, keys: Track[]): void {
  for (const k of keys) {
    const f = MUSIC_FILES[k];
    if (f && !scene.cache.audio.exists(k)) scene.load.audio(k, `bgm/${f}.mp3`);
  }
}

/**
 * 곡 바꾸기: 같은 곡이면 그대로 이어서(로비 ↔ 상점 같은 메뉴 이동에서 끊기지 않게), 다른 곡이면 짧게 줄였다가 새 곡.
 * 파일이 없으면 아무것도 안 한다.
 */
export function playMusic(scene: Phaser.Scene, key: Track): void {
  wanted = key;
  if (!musicOn()) return; // 설정에서 배경 음악 끔
  if (current?.key === key && current.snd.isPlaying) return;
  if (!scene.cache.audio.exists(key)) return;
  stopMusic(scene);
  try {
    const snd = scene.sound.add(key, { loop: true, volume: 0 });
    snd.play();
    current = { key, snd };
    fade(scene, snd, VOLUME);
  } catch {
    /* 소리를 못 내는 환경 */
  }
}

/** 배경 음악 설정을 바꾼 직후: 끄면 지금 곡을 멈추고, 켜면 장면이 원하던 곡을 다시 튼다 */
export function refreshMusic(scene: Phaser.Scene): void {
  if (!musicOn()) stopMusic(scene, true);
  else if (wanted) playMusic(scene, wanted);
}

/** 지금 곡을 줄여서 끄기(결과 화면 등). keepWanted=false면 다시 켜도 이어 틀지 않음 */
export function stopMusic(scene: Phaser.Scene, keepWanted = false): void {
  if (!keepWanted) wanted = null;
  if (!current) return;
  const old = current.snd;
  current = null;
  let gone = false;
  const kill = () => {
    if (gone) return;
    gone = true;
    try {
      old.stop();
      old.destroy();
    } catch {
      /* 이미 지워짐 */
    }
  };
  fade(scene, old, 0, kill);
  setTimeout(kill, FADE_MS + 150); // 화면 갱신이 멈춘 상태(백그라운드 등)에서도 이전 곡이 반드시 꺼지게
}

function fade(scene: Phaser.Scene, snd: Phaser.Sound.BaseSound, to: number, done?: () => void): void {
  // 장면을 떠나도 페이드가 끝나도록 장면 시간 대신 실제 시간으로
  const s = snd as Phaser.Sound.WebAudioSound;
  const from = s.volume ?? 0;
  const start = performance.now();
  const step = () => {
    const t = Math.min(1, (performance.now() - start) / FADE_MS);
    try {
      s.setVolume(from + (to - from) * t);
    } catch {
      /* 이미 지워짐 */
    }
    if (t < 1) requestAnimationFrame(step);
    else done?.();
  };
  void scene;
  step();
}
