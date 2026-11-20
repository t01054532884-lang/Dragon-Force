import type Phaser from 'phaser';
import { store } from '../platform';

// 설정(8단계 v2.0 10.3, 제작자 결정 2026-11-20: 첫 제출은 "소리 켜기/끄기"만 → 같은 날 효과음·배경 음악을 따로 켜고 끔).
// 전투 일시정지 화면 맨 아래에서 효과음·배경 음악을 따로 바꿀 수 있다(제작자 요청 2026-11-20).
// 계정 진행 저장과 따로 둔다 → 진행 초기화·저장 손상과 상관없이 유지, 앱을 다시 켜도 그대로.

export const SETTINGS_KEY = 'dragon-force:settings';

export interface Settings {
  sound: boolean; // 효과음(파일·합성음 모두)
  music: boolean; // 배경 음악
  /** 이미 본 첫 플레이 안내(기획자 요청 6: 한 번 확인하면 다시 안 보임) */
  tips: string[];
}

const DEFAULTS: Settings = { sound: true, music: true, tips: [] };

export function loadSettings(): Settings {
  try {
    const j = JSON.parse(store.getItem(SETTINGS_KEY) ?? '{}');
    return {
      sound: typeof j.sound === 'boolean' ? j.sound : DEFAULTS.sound,
      // 예전 저장(소리 하나)은 배경 음악도 같은 값으로 이어받는다
      music: typeof j.music === 'boolean' ? j.music : typeof j.sound === 'boolean' ? j.sound : DEFAULTS.music,
      tips: Array.isArray(j.tips) ? j.tips.filter((t: unknown): t is string => typeof t === 'string') : [],
    };
  } catch {
    return { ...DEFAULTS, tips: [] };
  }
}

export function saveSettings(s: Settings): void {
  store.setItem(SETTINGS_KEY, JSON.stringify(s));
}

/** 첫 플레이 안내: 'battle-move'(이동·자동 공격) · 'first-card'(레벨업 카드) · 'lab'(연구소 강화) */
export type TipId = 'battle-move' | 'first-card' | 'lab' | 'first-magnet';
export const tipSeen = (id: TipId): boolean => loadSettings().tips.includes(id);
export function markTip(id: TipId): void {
  const s = loadSettings();
  if (!s.tips.includes(id)) saveSettings({ ...s, tips: [...s.tips, id] });
}

/** 지금 효과음을 내도 되는지(파일·합성음 모두 playSfx 등에서 직접 확인) */
export const soundOn = (): boolean => loadSettings().sound;
/** 배경 음악을 틀어도 되는지(Music.ts가 확인) */
export const musicOn = (): boolean => loadSettings().music;

/** 게임 전체 소리에 반영: 둘 다 꺼져 있으면 Phaser 전체 음소거. 하나만 꺼진 경우는 각 모듈이 직접 확인 */
export function applySound(game: Phaser.Game): void {
  game.sound.mute = !soundOn() && !musicOn();
}
