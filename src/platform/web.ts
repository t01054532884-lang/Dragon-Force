import type { Insets, PlatformImpl } from './types';

/** CSS env(safe-area-inset-*) 값을 숨은 요소로 읽는다(iPhone 사파리·WebView 공통) */
export function cssSafeArea(): Insets {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const s = getComputedStyle(probe);
  const v = (x: string) => parseFloat(x) || 0;
  const r = { top: v(s.paddingTop), right: v(s.paddingRight), bottom: v(s.paddingBottom), left: v(s.paddingLeft) };
  probe.remove();
  return r;
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // 사생활 보호 모드 등
  }
}

/** 브라우저(웹 배포·개발 서버). 저장은 localStorage. */
export const webPlatform: PlatformImpl = {
  id: 'web',
  async loadStore(keys) {
    const ls = safeLocalStorage();
    const m = new Map<string, string>();
    for (const k of keys) {
      const v = ls?.getItem(k);
      if (v != null) m.set(k, v);
    }
    return m;
  },
  writeStore(key, value) {
    try {
      safeLocalStorage()?.setItem(key, value);
    } catch {
      /* 용량 초과 등은 무시(메모리 값은 남음) */
    }
  },
  insets: cssSafeArea,
  onInsetsChange(cb) {
    window.addEventListener('resize', cb);
  },
  onBack() {
    /* 브라우저 뒤로가기는 건드리지 않는다 */
  },
  onPause(cb) {
    document.addEventListener('visibilitychange', () => document.hidden && cb());
  },
  onResume(cb) {
    document.addEventListener('visibilitychange', () => !document.hidden && cb());
  },
  canExit: false,
  exit() {},
  async init() {},
};
