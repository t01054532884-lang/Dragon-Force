import Phaser from 'phaser';

// 효과음(8단계 v2.0 10장): public/sfx/<키>.mp3가 있으면 그 파일, 없으면 짧은 합성음.
// - 채널별 기본 음량(10.2): UI 0.45 · 전투 0.35 · 보상 0.6
// - 같은 소리는 최소 간격 안에 다시 울리지 않고(적중 60ms 등), 동시에 8개까지만
// - 소리를 못 내는 환경(오디오 차단·백그라운드)이어도 게임은 그대로 진행

/** public/sfx/에 실제로 있는 파일(키 = 파일 이름). 출처 확인 후 여기에 적으면 미리 읽고 그 파일을 쓴다 */
export const SFX_FILES: string[] = [
  // 상자 개봉 8종(2026-11-20 제작자 전달)은 출처·상업 이용 확인 뒤 여기에 적는다:
  // 'sfx-chest-shake', 'sfx-chest-open', 'sfx-chest-burst-common', 'sfx-chest-burst-rare', 'sfx-chest-burst-epic', 'sfx-chest-burst-legendary', 'sfx-card-flip', 'sfx-card-rare',
];

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
}

/** 소리 키별 규칙. 파일 이름은 docs/HANDOFF.md 4절 표와 같다 */
const RECIPES: Record<string, Recipe> = {
  'sfx-red-fire': { ch: 'battle', gap: 90, f0: 520, f1: 260, ms: 110, wave: 'triangle', gain: 0.05, noise: 0.25 },
  'sfx-hit': { ch: 'battle', gap: 60, f0: 300, f1: 120, ms: 70, wave: 'square', gain: 0.025, noise: 0.5 },
  'sfx-crit': { ch: 'battle', gap: 80, f0: 880, f1: 1320, ms: 120, wave: 'triangle', gain: 0.045 },
  'sfx-explode': { ch: 'battle', gap: 120, f0: 180, f1: 60, ms: 260, wave: 'sawtooth', gain: 0.05, noise: 0.7 },
  'sfx-player-hit': { ch: 'battle', gap: 150, f0: 220, f1: 90, ms: 180, wave: 'sawtooth', gain: 0.07, noise: 0.4 },
  'sfx-enemy-die': { ch: 'battle', gap: 70, f0: 700, f1: 240, ms: 140, wave: 'triangle', gain: 0.035 },
  'sfx-boss-die': { ch: 'reward', gap: 500, f0: 160, f1: 40, ms: 900, wave: 'sawtooth', gain: 0.08, noise: 0.6 },
  'sfx-gem': { ch: 'battle', gap: 80, f0: 1200, f1: 1800, ms: 70, wave: 'sine', gain: 0.025 },
  'sfx-levelup': { ch: 'reward', gap: 300, f0: 520, f1: 1560, ms: 450, wave: 'triangle', gain: 0.06 },
  'sfx-ui-tap': { ch: 'ui', gap: 60, f0: 660, f1: 880, ms: 60, wave: 'sine', gain: 0.03 },
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
export function playSfx(scene: Phaser.Scene, key: string, opts: { pitch?: number; channel?: Channel } = {}): void {
  const r = RECIPES[key];
  const now = performance.now();
  if (r && now - (lastAt.get(key) ?? -1e9) < r.gap) return;
  if (playing >= MAX_CONCURRENT) return;
  lastAt.set(key, now);
  const vol = CHANNEL_VOL[opts.channel ?? r?.ch ?? 'ui'];
  try {
    if (scene.sound.locked) return; // 첫 터치 전(브라우저가 소리를 막음)
    if (scene.cache.audio.exists(key)) {
      scene.sound.play(key, { volume: vol });
      hold(r?.ms ?? 300);
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
