import type Phaser from 'phaser';
import { store } from '../platform';

// 설정(8단계 v2.0 10.3, 제작자 결정 2026-11-20: 첫 제출은 "소리 켜기/끄기"만).
// 계정 진행 저장과 따로 둔다 → 진행 초기화·저장 손상과 상관없이 유지, 앱을 다시 켜도 그대로.

export const SETTINGS_KEY = 'dragon-force:settings';

export interface Settings {
  sound: boolean; // 효과음(파일·합성음 모두)
}

const DEFAULTS: Settings = { sound: true };

export function loadSettings(): Settings {
  try {
    const j = JSON.parse(store.getItem(SETTINGS_KEY) ?? '{}');
    return { sound: typeof j.sound === 'boolean' ? j.sound : DEFAULTS.sound };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  store.setItem(SETTINGS_KEY, JSON.stringify(s));
}

/** 지금 소리를 내도 되는지(합성음은 Phaser 음소거를 거치지 않으므로 직접 확인) */
export const soundOn = (): boolean => loadSettings().sound;

/** 게임 전체 소리에 반영: 파일 소리는 Phaser 음소거로, 합성음은 soundOn() 확인으로 */
export function applySound(game: Phaser.Game): void {
  game.sound.mute = !soundOn();
}
