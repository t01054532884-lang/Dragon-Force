import { defineConfig } from 'vite';

// base를 './'로 두면 GitHub Pages 하위 경로와 나중에 iOS(Capacitor) 앱 안에서도 그대로 열린다.
export default defineConfig({
  base: './',
  server: { port: 5173 },
});
