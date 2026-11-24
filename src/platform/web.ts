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
  // 개발 서버 전용: 주소에 ?safe=59,34 → 위·아래 안전 영역을 흉내(아이폰 15 Pro 세로 59/34pt). PC 브라우저로 홈 바 처리를 확인하려고(2026-11-24)
  if (import.meta.env.DEV && typeof location !== 'undefined') {
    const m = new URLSearchParams(location.search).get('safe')?.split(',').map(Number);
    if (m && m.length === 2 && m.every((n) => n >= 0)) return { ...r, top: m[0], bottom: m[1] };
  }
  return r;
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // 사생활 보호 모드 등
  }
}

/**
 * 설치용 고정 버전(다운로드 페이지, 빌드 때 VITE_STORE_NS = 'play-2026.11.24' 같은 태그 이름)은
 * 저장 칸을 버전마다 따로 쓴다: `play-2026.11.24:dragon-force:progress`. 웹 링크·다른 버전 기록과 섞이지 않는다.
 * 그 버전 칸이 비어 있으면(새로 깐 첫 실행) 기기에 남은 '이전 설치 버전' 중 가장 최근 것의 기록을 복사해 이어 간다.
 * (안드로이드 크롬은 설치 앱끼리 저장을 같이 써서 이어받기가 되고, 아이폰 홈 화면 앱은 앱마다 저장이 따로라 새로 시작한다.)
 */
const NS = (import.meta.env.VITE_STORE_NS as string | undefined) || '';
const nsKey = (k: string) => (NS ? `${NS}:${k}` : k);

/** 지금 버전보다 이름이 앞선(= 예전) 설치 버전 중 가장 최근 칸 이름. 없으면 null */
function previousNamespace(ls: Storage, keys: string[]): string | null {
  let best: string | null = null;
  for (let i = 0; i < ls.length; i++) {
    const full = ls.key(i);
    if (!full || !full.startsWith('play-')) continue;
    const cut = full.indexOf(':');
    if (cut < 0) continue;
    const ns = full.slice(0, cut);
    if (ns >= NS || !keys.includes(full.slice(cut + 1))) continue;
    if (!best || ns > best) best = ns;
  }
  return best;
}

/** 브라우저(웹 배포·개발 서버·설치용 고정 버전). 저장은 localStorage. */
export const webPlatform: PlatformImpl = {
  id: 'web',
  async loadStore(keys) {
    const ls = safeLocalStorage();
    const m = new Map<string, string>();
    for (const k of keys) {
      const v = ls?.getItem(nsKey(k));
      if (v != null) m.set(k, v);
    }
    if (NS && ls && m.size === 0) {
      const prev = previousNamespace(ls, keys);
      if (prev) {
        for (const k of keys) {
          const v = ls.getItem(`${prev}:${k}`);
          if (v == null) continue;
          m.set(k, v);
          try {
            ls.setItem(nsKey(k), v);
          } catch {
            /* 용량 초과 — 메모리 값으로 진행 */
          }
        }
      }
    }
    return m;
  },
  writeStore(key, value) {
    try {
      safeLocalStorage()?.setItem(nsKey(key), value);
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
