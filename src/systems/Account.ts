import { store } from '../platform';
import { BACKUP_KEY, defaultProgress, SAVE_KEY, saveProgress } from './Progress';
import { SETTINGS_KEY } from './Settings';

// 계정(첫 출시 결정 2026-11-20: 게스트 자동 시작 + Sign in with Apple 연결, 앱 안 계정 삭제 — docs/MONETIZATION_PLAN.md).
// 지금은 "기기 안 게스트" 구현만 있다. Firebase 프로젝트가 준비되면 같은 인터페이스(AccountProvider)로
// Firebase 구현(익명 로그인 → Apple 연결, 같은 UID 유지)을 만들어 setAccountProvider로 바꿔 끼운다.

export const ACCOUNT_KEY = 'dragon-force:account';

export interface AccountState {
  uid: string; // 게스트: 'guest-<무작위>' · Firebase가 붙으면 Firebase UID
  provider: 'guest' | 'apple';
  createdAt: number;
  linkedAt?: number; // Apple 연결 시각
}

/** in-use: 이 Apple ID가 이미 다른 기록(다른 기기에서 연결한 계정)에 연결됨 → switchToApple로 그 계정으로 바꿀 수 있음 */
export type AccountResult = { ok: true } | { ok: false; reason: 'unavailable' | 'cancelled' | 'failed' | 'in-use' | 'offline' };

export interface AccountProvider {
  /** 화면 표시용 이름 */
  readonly label: string;
  /** Apple 연결을 지금 쓸 수 있나(서버 연결 전·웹에서는 false) */
  readonly canLinkApple: boolean;
  current(): AccountState;
  linkApple(): Promise<AccountResult>;
  /** linkApple이 'in-use'를 돌려준 뒤: 그 Apple 계정으로 바꿔 로그인(이 기기 기록과 서버 기록 중 고르기 창이 뜰 수 있음) */
  switchToApple(): Promise<AccountResult>;
  /** 계정 삭제: 서버 기록(있으면)과 이 기기의 진행 저장을 모두 지운다. 되돌릴 수 없음 */
  deleteAccount(): Promise<AccountResult>;
}

function randomId(): string {
  const a = new Uint8Array(8);
  globalThis.crypto?.getRandomValues?.(a);
  if (a.every((v) => v === 0)) for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  return Array.from(a, (v) => v.toString(16).padStart(2, '0')).join('');
}

function readState(): AccountState | null {
  try {
    const j = JSON.parse(store.getItem(ACCOUNT_KEY) ?? 'null');
    if (j && typeof j.uid === 'string' && (j.provider === 'guest' || j.provider === 'apple')) return j as AccountState;
  } catch {
    /* 손상 → 새 게스트 */
  }
  return null;
}

function newGuest(now = Date.now()): AccountState {
  const s: AccountState = { uid: `guest-${randomId()}`, provider: 'guest', createdAt: now };
  store.setItem(ACCOUNT_KEY, JSON.stringify(s));
  return s;
}

/** 이 기기 진행 저장 지우기(계정 삭제): 진행·백업·설정(안내 본 기록 포함)을 처음 상태로 */
export function wipeLocalData(now = Date.now()): void {
  saveProgress(store, defaultProgress(now));
  store.setItem(BACKUP_KEY, '');
  store.setItem(SETTINGS_KEY, '');
}

/** 기기 안 게스트(서버 없음). Apple 연결은 서버가 생겨야 가능 */
export const LocalGuest: AccountProvider = {
  label: '게스트',
  canLinkApple: false,
  current: () => readState() ?? newGuest(),
  linkApple: async () => ({ ok: false, reason: 'unavailable' }),
  switchToApple: async () => ({ ok: false, reason: 'unavailable' }),
  deleteAccount: async () => {
    wipeLocalData();
    newGuest();
    return { ok: true };
  },
};

export let account: AccountProvider = LocalGuest;
/** 플랫폼 초기화에서 실제 구현(Firebase)으로 바꿔 끼운다 */
export const setAccountProvider = (p: AccountProvider) => (account = p);

/** 화면에 보일 짧은 ID(앞 4 · 뒤 4) */
export const shortId = (uid: string) => (uid.length > 12 ? `${uid.slice(0, 10)}…${uid.slice(-4)}` : uid);
