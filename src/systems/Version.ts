import { PLATFORM } from '../platform';

/**
 * 업데이트 확인(제작자 요청 2026-11-23: 출시 뒤 업데이트가 나오면 시작할 때 "업데이트 확인 중" → 안내).
 * 서버 기준 파일: GitHub Pages의 version.json { latest, min, notice } (public/version.json — main에 push하면 반영).
 * - min보다 낮으면 '필수 업데이트'(App Store로 보내고 시작 막음) · latest보다 낮으면 '새 버전 있음'(시작은 가능).
 * - 웹은 열 때마다 최신이라 확인하지 않는다. 인터넷이 없거나 3초 안에 답이 없으면 그냥 시작(게임은 기기 안에 다 들어 있음).
 */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
export const VERSION_URL = 'https://t01054532884-lang.github.io/Dragon-Force/version.json';
export const APP_STORE_URL = 'itms-apps://apps.apple.com/app/id6837190960';

/** 'a.b.c' 비교: a < b면 음수 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export type VersionCheck = { status: 'ok' | 'optional' | 'required'; latest: string; notice: string };

export function judgeVersion(current: string, info: { latest?: unknown; min?: unknown; notice?: unknown }): VersionCheck {
  const latest = typeof info.latest === 'string' ? info.latest : current;
  const min = typeof info.min === 'string' ? info.min : '0.0.0';
  const notice = typeof info.notice === 'string' ? info.notice : '';
  if (compareVersions(current, min) < 0) return { status: 'required', latest, notice };
  if (compareVersions(current, latest) < 0) return { status: 'optional', latest, notice };
  return { status: 'ok', latest, notice };
}

export async function checkVersion(timeoutMs = 3000): Promise<VersionCheck> {
  const none: VersionCheck = { status: 'ok', latest: APP_VERSION, notice: '' };
  if (PLATFORM !== 'ios') return none; // 웹·앱인토스는 늘 최신 묶음이 내려와 업데이트 안내가 필요 없음(토스에서 "App Store로" 안내 금지)
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: 'no-store', signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) return none;
    return judgeVersion(APP_VERSION, (await res.json()) as Record<string, unknown>);
  } catch {
    return none;
  }
}
