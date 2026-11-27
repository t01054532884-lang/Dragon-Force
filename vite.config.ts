/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// 앱 버전(package.json) → 코드에서 __APP_VERSION__. 시작 화면의 업데이트 확인이 서버의 version.json과 비교한다.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

// base를 './'로 두면 GitHub Pages 하위 경로와 나중에 iOS(Capacitor) 앱 안에서도 그대로 열린다.
export default defineConfig({
  base: './',
  server: { port: 5173 },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // 테스트 제한 시간 5초 → 15초(2026-11-28): 확률 수렴 시뮬레이션(10만~500만 회)·소스 전체 검사가 웹 빌드와 동시에 돌면 느려져 가끔 시간 초과
  test: { testTimeout: 15_000 },
});
