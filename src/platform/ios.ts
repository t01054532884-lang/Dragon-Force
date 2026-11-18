import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { cssSafeArea } from './web';
import type { PlatformImpl } from './types';

/**
 * iOS 앱(Capacitor). 저장은 Preferences(iOS UserDefaults) — OS가 WebView의 localStorage를 지울 수 있어서.
 * 처음 한 번은 예전 localStorage 값(웹에서 하던 진행)을 옮겨 온다.
 */
export const iosPlatform: PlatformImpl = {
  id: 'ios',
  async loadStore(keys) {
    const m = new Map<string, string>();
    for (const k of keys) {
      const { value } = await Preferences.get({ key: k });
      if (value != null) m.set(k, value);
      else {
        try {
          const old = window.localStorage.getItem(k);
          if (old != null) {
            m.set(k, old);
            await Preferences.set({ key: k, value: old });
          }
        } catch {
          /* localStorage 없음 */
        }
      }
    }
    return m;
  },
  writeStore(key, value) {
    void Preferences.set({ key, value });
  },
  insets: cssSafeArea,
  onInsetsChange(cb) {
    window.addEventListener('resize', cb);
  },
  onBack() {
    /* iOS에는 시스템 뒤로가기 버튼이 없다 */
  },
  onPause(cb) {
    void App.addListener('appStateChange', ({ isActive }) => !isActive && cb());
  },
  onResume(cb) {
    void App.addListener('appStateChange', ({ isActive }) => isActive && cb());
  },
  canExit: false,
  exit() {},
  async init() {},
};
