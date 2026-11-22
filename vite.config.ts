import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// 앱 버전(package.json) → 코드에서 __APP_VERSION__. 시작 화면의 업데이트 확인이 서버의 version.json과 비교한다.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

// base를 './'로 두면 GitHub Pages 하위 경로와 나중에 iOS(Capacitor) 앱 안에서도 그대로 열린다.
export default defineConfig({
  base: './',
  server: { port: 5173 },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
