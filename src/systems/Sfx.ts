import Phaser from 'phaser';
import { soundOn } from './Settings';

// 효과음(8단계 v2.0 10장): public/sfx/<키>.mp3가 있으면 그 파일, 없으면 짧은 합성음.
// - 채널별 기본 음량(10.2): UI 0.45 · 전투 0.35 · 보상 0.6
// - 같은 소리는 최소 간격 안에 다시 울리지 않고(적중 60ms 등), 동시에 8개까지만
// - 소리를 못 내는 환경(오디오 차단·백그라운드)이어도 게임은 그대로 진행

/** public/sfx/에 실제로 있는 파일(키 = 파일 이름). 출처 확인 후 여기에 적으면 미리 읽고 그 파일을 쓴다 */
export const SFX_FILES: string[] = [
  // 상자 개봉 8종 — 제작자 직접 생성(2026-11-20), 출처 기록은 docs/SOUND.md
  'sfx-chest-shake', 'sfx-chest-open', 'sfx-chest-burst-common', 'sfx-chest-burst-rare', 'sfx-chest-burst-epic', 'sfx-chest-burst-legendary',
  'sfx-card-flip', 'sfx-card-rare',
  // 전투 10종 — 제작자 직접 생성(2026-11-20, 원본 합성음), 출처 기록은 docs/SOUND.md
  'sfx-red-fire', 'sfx-hit', 'sfx-player-hit', 'sfx-enemy-die', 'sfx-levelup', 'sfx-crit', 'sfx-explode', 'sfx-boss-die', 'sfx-gem', 'sfx-ui-tap',
  // 속성 8종 — 제작자 직접 합성(2026-11-20)
  'sfx-ice-shard', 'sfx-thunder-breath', 'sfx-wing-wind', 'sfx-water-blast', 'sfx-shadow-magic', 'sfx-heal', 'sfx-coin-pickup', 'sfx-shield',
];
/** 상자 개봉 화면에서 미리 읽는 것 */
export const CHEST_SFX_FILES = SFX_FILES.filter((k) => k.startsWith('sfx-chest') || k.startsWith('sfx-card'));
/** 전투에서 미리 읽는 것 */
export const BATTLE_SFX_FILES = SFX_FILES.filter((k) => !CHEST_SFX_FILES.includes(k));

type Channel = 'ui' | 'battle' | 'reward';
const CHANNEL_VOL: Record<Channel, number> = { ui: 0.45, battle: 0.35, reward: 0.6 };
const MAX_CONCURRENT = 8;

interface Recipe {
  ch: Channel;
  /** 같은 소리 최소 간격(ms) */
  gap: number;
  /** 합성음: 시작·끝 주파수, 길이, 파형, 크기 */
  f0: number;
  f1: number;
  ms: number;
  wave: OscillatorType;
  gain: number;
  /** 잡음(타격감) 섞기 */
  noise?: number;
  /** 파일일 때 채널 음량에 곱하는 값(자주 나는 소리를 조금 작게) */
  fileVol?: number;
  /** 파일일 때 이 길이(ms)까지만 내고 끝 80ms는 줄여 끈다(긴 파일을 짧게) */
  fileMaxMs?: number;
}

/** 소리 키별 규칙. 파일 이름은 docs/HANDOFF.md 4절 표와 같다 */
const RECIPES: Record<string, Recipe> = {
  // 화염탄: 1.02~1.2초마다 나는 가장 잦은 소리 → 파일(0.72초) 앞 0.3초만, 음량 60%(제작자 요청 2026-11-20 "계속 들으면 피곤")
  'sfx-red-fire': { ch: 'battle', gap: 90, f0: 520, f1: 260, ms: 110, wave: 'triangle', gain: 0.05, noise: 0.25, fileVol: 0.6, fileMaxMs: 300 },
  'sfx-hit': { ch: 'battle', gap: 60, f0: 300, f1: 120, ms: 70, wave: 'square', gain: 0.025, noise: 0.5 },
  'sfx-crit': { ch: 'battle', gap: 80, f0: 880, f1: 1320, ms: 120, wave: 'triangle', gain: 0.045 },
  'sfx-explode': { ch: 'battle', gap: 120, f0: 180, f1: 60, ms: 260, wave: 'sawtooth', gain: 0.05, noise: 0.7 },
  'sfx-player-hit': { ch: 'battle', gap: 150, f0: 220, f1: 90, ms: 180, wave: 'sawtooth', gain: 0.07, noise: 0.4 },
  'sfx-enemy-die': { ch: 'battle', gap: 70, f0: 700, f1: 240, ms: 140, wave: 'triangle', gain: 0.035 },
  'sfx-boss-die': { ch: 'reward', gap: 500, f0: 160, f1: 40, ms: 900, wave: 'sawtooth', gain: 0.08, noise: 0.6 },
  'sfx-gem': { ch: 'battle', gap: 80, f0: 1200, f1: 1800, ms: 70, wave: 'sine', gain: 0.025 },
  'sfx-levelup': { ch: 'reward', gap: 300, f0: 520, f1: 1560, ms: 450, wave: 'triangle', gain: 0.06 },
  'sfx-ui-tap': { ch: 'ui', gap: 60, f0: 660, f1: 880, ms: 60, wave: 'sine', gain: 0.03 },
  // 속성 소리(파일 있음). 합성음 값은 파일이 없을 때만 쓰는 대체
  'sfx-ice-shard': { ch: 'battle', gap: 90, f0: 1400, f1: 900, ms: 120, wave: 'triangle', gain: 0.03 },
  'sfx-thunder-breath': { ch: 'battle', gap: 90, f0: 900, f1: 200, ms: 140, wave: 'sawtooth', gain: 0.03, noise: 0.5 },
  'sfx-wing-wind': { ch: 'battle', gap: 90, f0: 400, f1: 700, ms: 160, wave: 'sine', gain: 0.03, noise: 0.6 },
  'sfx-water-blast': { ch: 'battle', gap: 90, f0: 300, f1: 160, ms: 160, wave: 'sine', gain: 0.04, noise: 0.4 },
  'sfx-shadow-magic': { ch: 'battle', gap: 90, f0: 260, f1: 520, ms: 160, wave: 'square', gain: 0.025 },
  'sfx-heal': { ch: 'reward', gap: 300, f0: 660, f1: 1320, ms: 300, wave: 'sine', gain: 0.04 },
  'sfx-coin-pickup': { ch: 'reward', gap: 120, f0: 1500, f1: 2200, ms: 120, wave: 'square', gain: 0.02 },
  'sfx-shield': { ch: 'battle', gap: 300, f0: 500, f1: 900, ms: 260, wave: 'triangle', gain: 0.04 },
};

/** 드래곤별 기본 공격 발사음(묶음당 1번, 짧고 작게). 없는 드래곤은 소리 없음 */
export const BASIC_FIRE_SFX: Record<string, string | undefined> = {
  red: 'sfx-red-fire', blue: 'sfx-ice-shard', yellow: 'sfx-thunder-breath', wind: 'sfx-wing-wind', water: 'sfx-water-blast',
  black: 'sfx-shadow-magic', arcane: 'sfx-shadow-magic',
};
/** 액티브 스킬 발동음 */
export const SKILL_SFX: Record<string, string | undefined> = {
  breath: 'sfx-red-fire', ice: 'sfx-ice-shard', lightning: 'sfx-thunder-breath', meteor: 'sfx-explode', wind: 'sfx-wing-wind',
};
/** 드래곤 전용 액티브 발동음 */
export const SIGNATURE_SFX: Record<string, string | undefined> = {
  red: 'sfx-explode', blue: 'sfx-ice-shard', yellow: 'sfx-thunder-breath', white: 'sfx-heal', black: 'sfx-shadow-magic',
  stone: 'sfx-shield', wind: 'sfx-wing-wind', water: 'sfx-water-blast', arcane: 'sfx-shadow-magic',
};

const lastAt = new Map<string, number>();
let playing = 0;

/** 있는 파일만 미리 읽는다(SFX_FILES에 적힌 것). keys를 주면 그중에서만 */
export function preloadSfx(scene: Phaser.Scene, keys: readonly string[] = SFX_FILES): void {
  for (const k of keys) if (SFX_FILES.includes(k) && !scene.cache.audio.exists(k)) scene.load.audio(k, `sfx/${k}.mp3`);
}

/**
 * 효과음 재생. 파일이 읽혀 있으면 파일, 아니면 합성음. RECIPES에 없는 키는 파일이 있을 때만 난다.
 * freq: 합성음일 때 음높이를 바꿔 같은 소리가 단조롭지 않게(선택)
 */
export function playSfx(scene: Phaser.Scene, key: string, opts: { pitch?: number; channel?: Channel; vol?: number; maxMs?: number } = {}): void {
  if (!soundOn()) return; // 설정에서 소리 끔
  const r = RECIPES[key];
  const now = performance.now();
  if (r && now - (lastAt.get(key) ?? -1e9) < r.gap) return;
  if (playing >= MAX_CONCURRENT) return;
  lastAt.set(key, now);
  const vol = CHANNEL_VOL[opts.channel ?? r?.ch ?? 'ui'];
  try {
    if (scene.sound.locked) return; // 첫 터치 전(브라우저가 소리를 막음)
    if (scene.cache.audio.exists(key)) {
      const v = vol * (opts.vol ?? r?.fileVol ?? 1);
      const maxMs = opts.maxMs ?? r?.fileMaxMs;
      if (maxMs) {
        // 긴 파일을 앞부분만: 재생 → (최대 길이 − 80ms)부터 줄여서 끄기
        const snd = scene.sound.add(key, { volume: v });
        let gone = false;
        const done = () => {
          if (gone) return;
          gone = true;
          snd.destroy();
        };
        snd.once('complete', done);
        snd.play();
        scene.tweens.add({ targets: snd, volume: 0, delay: maxMs - 80, duration: 80, onComplete: () => (snd.stop(), done()) });
        hold(maxMs);
      } else {
        scene.sound.play(key, { volume: v });
        hold(r?.ms ?? 300);
      }
      return;
    }
    if (!r) return;
    const ctx = (scene.sound as Phaser.Sound.WebAudioSoundManager).context;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const dur = r.ms / 1000;
    const p = opts.pitch ?? 1;
    const out = ctx.createGain();
    out.gain.setValueAtTime(r.gain * vol * 2, t);
    out.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    out.connect(ctx.destination);
    const o = ctx.createOscillator();
    o.type = r.wave;
    o.frequency.setValueAtTime(r.f0 * p, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, r.f1 * p), t + dur);
    o.connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
    if (r.noise) {
      // 짧은 잡음 = "치익"·"퍽" 같은 타격감
      const len = Math.max(1, Math.floor(ctx.sampleRate * Math.min(dur, 0.12)));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const n = ctx.createBufferSource();
      n.buffer = buf;
      const ng = ctx.createGain();
      ng.gain.value = r.noise;
      n.connect(ng).connect(out);
      n.start(t);
    }
    hold(r.ms);
  } catch {
    /* 소리를 못 내는 환경이면 건너뜀 */
  }
}

function hold(ms: number): void {
  playing++;
  setTimeout(() => (playing = Math.max(0, playing - 1)), ms + 20);
}
