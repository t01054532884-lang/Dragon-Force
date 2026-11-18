import { graniteEvent, SafeArea, Screen, Storage } from '@apps-in-toss/web-framework';
import type { PlatformImpl } from './types';

/**
 * 토스 앱 안(앱인토스 미니앱).
 * - 저장: SDK Storage(토스앱을 지우기 전까지 유지)
 * - 오른쪽 위 더보기·X(닫기) 버튼과 겹치면 검수 반려 → 그 줄(아래 TOSS_BAR)만큼 게임 화면을 아래로 내린다
 * - 안드로이드 뒤로가기: backEvent를 받아 게임이 처리(전투 중엔 일시정지, 로비에선 종료 확인)
 */
const TOSS_BAR = 48; // 닫기 버튼 줄 높이(CSS px). 버튼 위치: safe area top + 5(iOS)/10(Android), 높이 약 34

export const tossPlatform: PlatformImpl = {
  id: 'toss',
  async loadStore(keys) {
    const m = new Map<string, string>();
    for (const k of keys) {
      const v = await Storage.getItem(k);
      if (v != null) m.set(k, v);
    }
    return m;
  },
  writeStore(key, value) {
    void Storage.setItem(key, value);
  },
  insets() {
    const s = SafeArea.get();
    return { top: s.top + TOSS_BAR, right: s.right, bottom: s.bottom, left: s.left };
  },
  onInsetsChange(cb) {
    SafeArea.subscribe({ onEvent: () => cb() });
  },
  onBack(cb) {
    graniteEvent.addEventListener('backEvent', {
      onEvent: () => {
        if (!cb()) void Screen.close();
      },
    });
  },
  onPause(cb) {
    document.addEventListener('visibilitychange', () => document.hidden && cb());
  },
  onResume(cb) {
    document.addEventListener('visibilitychange', () => !document.hidden && cb());
  },
  canExit: true,
  exit() {
    void Screen.close();
  },
  async init() {
    try {
      if (Screen.setOrientation.isSupported()) await Screen.setOrientation({ type: 'portrait' });
    } catch {
      /* 오래된 토스앱: 세로 기본 */
    }
  },
};
