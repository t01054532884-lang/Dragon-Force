import type { Insets, PlatformId, PlatformImpl, SyncStore } from './types';
import { webPlatform } from './web';

export type { Insets, PlatformId } from './types';

/** 빌드 대상: npm run build(web) / build:ios / build:toss 가 VITE_PLATFORM을 정한다 */
export const PLATFORM: PlatformId = (import.meta.env.VITE_PLATFORM as PlatformId | undefined) ?? 'web';

let impl: PlatformImpl = webPlatform;
const cache = new Map<string, string>();

/** 게임 저장소: 읽기는 메모리(동기), 쓰기는 메모리 + 기기 저장(비동기) */
export const store: SyncStore = {
  getItem: (k) => cache.get(k) ?? null,
  setItem: (k, v) => {
    cache.set(k, v);
    impl.writeStore(k, v);
  },
};

/**
 * 게임 시작 전에 한 번 부른다: 플랫폼 구현을 고르고(다른 플랫폼 SDK는 번들에 안 들어감),
 * 저장된 값을 미리 읽고, 안전 영역을 화면에 반영한다.
 */
export async function initPlatform(storageKeys: string[]): Promise<void> {
  if (PLATFORM === 'toss') impl = (await import('./toss')).tossPlatform;
  else if (PLATFORM === 'ios') impl = (await import('./ios')).iosPlatform;
  try {
    await impl.init();
    const loaded = await impl.loadStore(storageKeys);
    loaded.forEach((v, k) => cache.set(k, v));
  } catch (e) {
    console.warn('플랫폼 초기화 일부 실패', e);
  }
  applyInsets();
  impl.onInsetsChange(applyInsets);
}

export function insets(): Insets {
  return impl.insets();
}

/** 게임 화면(#game)을 안전 영역 안쪽에 둔다 → Phaser 캔버스가 노치·홈바·토스 닫기 버튼과 겹치지 않음 */
function applyInsets(): void {
  const el = document.getElementById('game');
  if (!el) return;
  const i = impl.insets();
  Object.assign(el.style, { position: 'absolute', top: `${i.top}px`, right: `${i.right}px`, bottom: `${i.bottom}px`, left: `${i.left}px`, width: 'auto', height: 'auto' });
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
