import { App } from '@capacitor/app';
import { iosPlatform } from './ios';
import type { PlatformImpl } from './types';

/**
 * 안드로이드 앱(Capacitor, Google Play — 2026-11-26). 저장·안전 영역·백그라운드는 iOS와 같다(Preferences = SharedPreferences).
 * 다른 점: 시스템 뒤로가기 버튼이 있다(전투 → 일시정지, 다른 화면 → 로비, 로비 → 종료 확인 — 게임 장면의 onPlatformBack이 처리).
 */
export const androidPlatform: PlatformImpl = {
  ...iosPlatform,
  id: 'android',
  onBack(cb) {
    // 게임이 처리하지 않은 뒤로가기는 무시(갑자기 앱이 꺼지지 않게). 앱 종료는 로비의 종료 확인 창에서만
    void App.addListener('backButton', () => void cb());
  },
  canExit: true,
  exit() {
    void App.exitApp();
  },
};
