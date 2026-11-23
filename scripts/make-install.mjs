// 설치용 고정 버전 만들기(웹 "다운로드" = 홈 화면 앱 설치).
// 사용: node scripts/make-install.mjs <빌드 폴더> <버전 이름>   예) node scripts/make-install.mjs dist/app/2026.11.24 2026.11.24
// 하는 일: 그 빌드 폴더를 '설치 가능한 앱'으로 만든다.
//  - manifest.webmanifest(이름·아이콘·세로·전체화면, 버전마다 다른 앱 id → 버전끼리 따로 설치됨)
//  - sw.js: 설치할 때 그 폴더 파일을 전부 기기에 저장하고, 그 뒤로는 기기 사본만 쓴다(인터넷 없어도 실행, 업데이트 안 됨)
//  - index.html에 설치 안내(다운로드 버튼) 끼워 넣기 — 이미 설치된 앱으로 열면 안 보인다
// 버전 폴더는 Pages 배포 때마다 같은 태그 코드로 다시 만들어져 내용이 바뀌지 않는다(.github/workflows/pages.yml).
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const [dir, label] = process.argv.slice(2);
if (!dir || !label) {
  console.error('사용: node scripts/make-install.mjs <빌드 폴더> <버전 이름>');
  process.exit(1);
}

function walk(d) {
  const out = [];
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(relative(dir, p).split('\\').join('/'));
  }
  return out;
}

const SKIP = /^(privacy|support|download)\.html$|^version\.json$|^app\//;

// 1) 앱 정보
const manifest = {
  id: `./?v=${label}`,
  name: `드래곤 특공대 테스트 ${label}`,
  short_name: `드래곤 ${label.slice(5)}`,
  start_url: './',
  scope: './',
  display: 'fullscreen',
  orientation: 'portrait',
  background_color: '#0d0f14',
  theme_color: '#0d0f14',
  icons: [
    { src: 'app-icon/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'app-icon/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  ],
};
writeFileSync(join(dir, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

// 2) 기기 저장(서비스 워커)
const files = ['./', ...walk(dir).filter((f) => !SKIP.test(f) && f !== 'sw.js')];
const sw = `// 드래곤 특공대 설치 버전 ${label} — 자동 생성(scripts/make-install.mjs)
const CACHE = 'df-install-${label}';
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.open(CACHE).then((c) =>
      c.match(e.request, { ignoreSearch: true, ignoreVary: true }).then(
        (hit) => hit || fetch(e.request).then((res) => { if (res.ok) c.put(e.request, res.clone()); return res; }),
      ),
    ),
  );
});
`;
writeFileSync(join(dir, 'sw.js'), sw);

// 3) index.html에 설치 안내 끼워 넣기
const head = `
    <link rel="manifest" href="manifest.webmanifest" />
    <link rel="apple-touch-icon" href="app-icon/icon-180.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="드래곤 ${label.slice(5)}" />
    <meta name="theme-color" content="#0d0f14" />`;

const body = `
    <div id="df-install" style="display:none;position:fixed;inset:0;z-index:99;background:rgba(8,10,16,.94);color:#f3ead6;font:16px/1.5 system-ui,-apple-system,'Apple SD Gothic Neo',sans-serif;align-items:center;justify-content:center;text-align:center;padding:24px;box-sizing:border-box">
      <div style="max-width:340px">
        <img src="app-icon/icon-192.png" alt="" style="width:96px;height:96px;border-radius:22px" />
        <h1 style="font-size:22px;margin:14px 0 4px">드래곤 특공대 테스트</h1>
        <div style="opacity:.75">버전 ${label} · 설치하면 이 버전 그대로 남아요</div>
        <button id="df-install-go" style="margin:22px 0 10px;width:100%;padding:16px;border:0;border-radius:14px;background:#e0632a;color:#fff;font-size:18px;font-weight:700">다운로드</button>
        <div id="df-install-msg" style="min-height:48px;font-size:14px;opacity:.85"></div>
        <button id="df-install-skip" style="margin-top:8px;background:none;border:0;color:#bbb;text-decoration:underline;font-size:14px">설치하지 않고 브라우저에서 플레이</button>
        <div style="margin-top:18px;font-size:12px;opacity:.55">새 버전을 하려면 이 앱을 지우고 테스트 링크에서 다시 받으세요.<br>안드로이드는 이전 버전 기록을 이어받고, 아이폰은 새로 시작해요.</div>
      </div>
    </div>
    <script>
      (function () {
        if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
        var standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone === true;
        if (standalone) return;
        var box = document.getElementById('df-install'), msg = document.getElementById('df-install-msg');
        var ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
        var deferred = null;
        addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; });
        addEventListener('appinstalled', function () { msg.textContent = '설치 완료! 홈 화면의 드래곤 아이콘으로 실행하세요.'; });
        box.style.display = 'flex';
        document.getElementById('df-install-skip').onclick = function () { box.style.display = 'none'; };
        document.getElementById('df-install-go').onclick = function () {
          if (deferred) {
            deferred.prompt();
            deferred.userChoice.then(function (c) { if (c.outcome !== 'accepted') msg.textContent = '설치를 취소했어요. 다시 누르면 설치할 수 있어요.'; });
            deferred = null;
          } else if (ios) {
            msg.innerHTML = '사파리 아래쪽 <b>공유 버튼(□↑)</b> → <b>홈 화면에 추가</b>를 누르세요.<br>(사파리에서 열어야 해요)';
          } else {
            msg.innerHTML = '브라우저 메뉴(⋮) → <b>앱 설치</b> 또는 <b>홈 화면에 추가</b>를 누르세요.<br>(이미 설치했다면 홈 화면에서 실행하세요)';
          }
        };
      })();
    </script>`;

const indexPath = join(dir, 'index.html');
let html = readFileSync(indexPath, 'utf-8');
if (!html.includes('manifest.webmanifest')) {
  html = html.replace('</head>', `${head}\n  </head>`).replace('</body>', `${body}\n  </body>`);
  writeFileSync(indexPath, html);
}
console.log(`설치 버전 ${label}: 파일 ${files.length}개 → ${dir}`);
