import type Phaser from 'phaser';
import { PLATFORM } from '../platform';

/**
 * 앱 열기 주소(딥 링크, 1.0.1 — 2026-11-26).
 * App Store 앱 내 이벤트 카드의 "열기"가 `dragonforce://event`로 앱을 연다(이벤트 등록에 딥 링크가 필수).
 * - 받은 주소는 "갈 곳"으로 기억해 두고, 로비가 열릴 때(시작 화면을 지난 뒤) 그 화면으로 보낸다.
 * - 앱이 이미 로비에 있으면 로비를 다시 열어 바로 보낸다. 전투 중이면 전투가 끝나고 로비로 돌아올 때 간다.
 * - 웹·앱인토스는 해당 없음(주소 체계가 없음).
 */
export type DeepTarget = 'event' | 'shop' | 'skins';
const TARGETS: readonly DeepTarget[] = ['event', 'shop', 'skins'];

let pending: DeepTarget | null = null;

/** `dragonforce://event`, `dragonforce:///event`, `dragonforce://open/event` 모두 'event' */
export function parseDeepLink(url: string): DeepTarget | null {
  const m = /^dragonforce:\/{2,3}(?:open\/)?([a-z-]+)/i.exec(url.trim());
  const t = m?.[1].toLowerCase() as DeepTarget | undefined;
  return t && TARGETS.includes(t) ? t : null;
}

/** 로비가 한 번 꺼내 쓴다(꺼내면 비움) */
export function takeDeepLink(): DeepTarget | null {
  const t = pending;
  pending = null;
  return t;
}

export function installDeepLinks(game: Phaser.Game): void {
  if (PLATFORM !== 'ios' && PLATFORM !== 'android') return;
  let last = '';
  const handle = (url?: string) => {
    if (!url || url === last) return;
    last = url;
    const t = parseDeepLink(url);
    if (!t) return;
    pending = t;
    if (game.scene.isActive('lobby')) game.scene.getScene('lobby').scene.restart();
  };
  void import('@capacitor/app').then(({ App }) => {
    void App.addListener('appUrlOpen', (e) => handle(e.url));
    void App.getLaunchUrl().then((r) => handle(r?.url));
  });
}
