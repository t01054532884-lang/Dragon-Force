import { defineConfig } from '@apps-in-toss/web-framework/config';

/**
 * 앱인토스(토스 앱 안 미니앱) 설정. appName은 콘솔에 등록한 값과 같아야 하고 한 번 정하면 바꿀 수 없다.
 * 빌드: npm run build:toss → .ait 파일을 콘솔에 올리거나 npx ait deploy.
 */
export default defineConfig({
  appName: 'dragon-force',
  permissions: [],
  navigationBar: {
    transparentBackground: true, // 게임 권장: 투명 바(더보기·X 버튼만). 게임 화면은 그 아래로 내림(src/platform/toss.ts)
    theme: 'dark',
  },
  webView: {
    bounces: false,
    pullToRefreshEnabled: false,
    overScrollMode: 'never',
    allowsInlineMediaPlayback: true,
  },
  webBundleDir: 'dist',
});
