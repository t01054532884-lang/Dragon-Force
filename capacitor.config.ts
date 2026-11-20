import type { CapacitorConfig } from '@capacitor/cli';

/**
 * iOS 앱(App Store). 게임 파일(dist)을 앱 안에 넣는다 — 인터넷 없이도 실행되고,
 * "웹사이트를 감싼 앱"(심사 4.2)으로 보이지 않게. 빌드: npm run build:ios → Codemagic.
 */
const config: CapacitorConfig = {
  appId: 'com.dragonforce.app',
  appName: '드래곤 특공대',
  webDir: 'dist',
  ios: {
    contentInset: 'never', // 안전 영역은 게임이 직접 처리(src/platform)
    backgroundColor: '#0d0f14',
    scrollEnabled: false,
  },
};

export default config;
