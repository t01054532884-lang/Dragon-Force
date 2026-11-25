import type { Insets, PlatformId, PlatformImpl, SyncStore } from './types';
import { webPlatform } from './web';

export type { Insets, PlatformId } from './types';

/** 빌드 대상: npm run build(web) / build:ios / build:toss 가 VITE_PLATFORM을 정한다 */
export const PLATFORM: PlatformId = (import.meta.env.VITE_PLATFORM as PlatformId | undefined) ?? 'web';

let impl: PlatformImpl = webPlatform;
const cache = new Map<string, string>();

/**
 * 데모(시험용 저장): 웹에서 주소에 ?demo=1 → 모든 저장 키 앞에 'demo:'를 붙여 진짜 진행과 완전히 따로 저장.
 * 기획자·테스터가 재화가 많은 상태로 확인하는 용도. iOS·토스 빌드에서는 항상 꺼짐(심사·실사용자에게 노출 금지).
 */
export const DEMO: boolean = PLATFORM === 'web' && typeof location !== 'undefined' && new URLSearchParams(location.search).get('demo') === '1';
const mapKey = (k: string) => (DEMO ? `demo:${k}` : k);

/** 게임 저장소: 읽기는 메모리(동기), 쓰기는 메모리 + 기기 저장(비동기) */
export const store: SyncStore = {
  getItem: (k) => cache.get(mapKey(k)) ?? null,
  setItem: (k, v) => {
    cache.set(mapKey(k), v);
    impl.writeStore(mapKey(k), v);
    for (const cb of writeListeners) cb(k);
  },
};

const writeListeners: ((key: string) => void)[] = [];
/** 저장 키가 바뀔 때마다 알림(클라우드 저장이 "이 기기 변경됨"을 표시하는 데 씀) */
export const onStoreWrite = (cb: (key: string) => void) => writeListeners.push(cb);

/**
 * 게임 시작 전에 한 번 부른다: 플랫폼 구현을 고르고(다른 플랫폼 SDK는 번들에 안 들어감),
 * 저장된 값을 미리 읽고, 안전 영역을 화면에 반영한다.
 */
export async function initPlatform(storageKeys: string[]): Promise<void> {
  if (PLATFORM === 'toss') impl = (await import('./toss')).tossPlatform;
  else if (PLATFORM === 'ios') impl = (await import('./ios')).iosPlatform;
  else if (PLATFORM === 'android') impl = (await import('./android')).androidPlatform;
  try {
    await impl.init();
    const loaded = await impl.loadStore(storageKeys.map(mapKey));
    loaded.forEach((v, k) => cache.set(k, v));
  } catch (e) {
    console.warn('플랫폼 초기화 일부 실패', e);
  }
  // iOS 앱은 켜자마자 안전 영역(env safe-area-inset-*)이 0으로 읽힐 때가 있다 → 그때 시작하면 화면이 노치·다이내믹 아일랜드 밑까지
  // 꽉 차서 머리줄·체력 막대가 가려졌다(테스터 제보 2026-11-25). 위쪽 값이 잡힐 때까지 최대 1.5초 기다렸다가 화면 크기를 정한다.
  if (impl.id === 'ios') {
    for (let t = 0; t < 1500 && impl.insets().top <= 0; t += 50) await new Promise((r) => setTimeout(r, 50));
  }
  applyInsets();
  impl.onInsetsChange(applyInsets);
  impl.onResume(applyInsets);
}

export function insets(): Insets {
  return impl.insets();
}

let extBottom = 0;
/**
 * 게임 화면이 홈 바 밑까지 늘어난 높이(CSS px). 이 자리에는 배경·하단 메뉴 바탕만 그리고 버튼은 두지 않는다(src/ui/layout.ts safeBottom).
 * 토스는 0(닫기 버튼 줄 등 앱인토스가 주는 영역을 그대로 비움).
 */
export const extendedBottomPx = (): number => extBottom;

/**
 * 게임 화면(#game)을 안전 영역 안쪽에 둔다 → Phaser 캔버스가 노치·토스 닫기 버튼과 겹치지 않음.
 * (2026-11-24 제작자 요청: 아래쪽 검은 띠 없애기) 웹·iOS는 아래만 홈 바 밑까지 늘린다 — 하단 메뉴 바탕이 화면 끝까지 칠해지고 버튼은 홈 바 위.
 */
function applyInsets(): void {
  const el = document.getElementById('game');
  if (!el) return;
  const i = impl.insets();
  extBottom = impl.id === 'toss' ? 0 : i.bottom;
  const bottom = i.bottom - extBottom;
  Object.assign(el.style, { position: 'absolute', top: `${i.top}px`, right: `${i.right}px`, bottom: `${bottom}px`, left: `${i.left}px`, width: 'auto', height: 'auto' });
}

export const platform = {
  get id() {
    return impl.id;
  },
  get canExit() {
    return impl.canExit;
  },
  exit: () => impl.exit(),
  onBack: (cb: () => boolean) => impl.onBack(cb),
  onPause: (cb: () => void) => impl.onPause(cb),
  onResume: (cb: () => void) => impl.onResume(cb),
};
