import { DEMO, PLATFORM, onStoreWrite, platform, store } from '../platform';
import { ACCOUNT_KEY, setAccountProvider, wipeLocalData, type AccountProvider, type AccountResult, type AccountState } from './Account';
import { AppleCancelled, appleCredential } from './appleAuth';
import { CLOUD_KEY, decideSync, readMeta, summarize, type CloudMeta, type SaveSummary } from './cloudSync';
import { loadProgress, saveProgress, SAVE_KEY } from './Progress';

// 클라우드 저장 1단계(2026-11-21, docs/CLOUD.md): Firebase 익명 로그인(= 게스트 UID) + Firestore users/{uid}에 진행 저장.
// - 설정 값(VITE_FIREBASE_*)이 없거나 토스·데모 빌드면 꺼짐 → 지금처럼 기기에만 저장.
// - 자동 덮어쓰기·합산 금지: 둘 다 바뀌었으면 "이 기기 / 서버" 선택(로비가 cloud.conflict를 보고 묻는다).
// - 서버 쓰기는 트랜잭션 + 버전(rev) 하나씩 증가(보안 규칙도 같은 조건) → 두 기기가 동시에 써도 한쪽만 성공, 다른 쪽은 고르기.
// - 재화를 서버가 계산하는 것은 3단계(Cloud Functions). 이 단계는 "진행 백업·기기 이전".
// - 2단계(2026-11-23, docs/PAYMENTS.md): iOS에서 Sign in with Apple 연결(같은 UID 유지) · 다른 기기에서 Apple로 이어 하기 ·
//   계정 삭제 때 Apple 토큰 해지. iOS + RevenueCat 키가 있으면 결제(iosPurchases.ts)를 켠다.

const env = import.meta.env;
const CONFIG = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
};
const BEFORE_KEY = 'dragon-force:progress:before-cloud'; // 서버 기록을 받기 직전 이 기기 저장(되돌리기용)
const UPLOAD_DELAY_MS = 8000;
const START_TIMEOUT_MS = 4000;

export type CloudStatus = 'off' | 'connecting' | 'synced' | 'pending' | 'offline' | 'conflict' | 'error';

class Conflict extends Error {}

// Firebase 모듈은 켜질 때만 불러온다(번들 첫 화면 크기 유지)
type Fb = {
  app: import('firebase/app').FirebaseApp;
  auth: import('firebase/auth').Auth;
  db: import('firebase/firestore').Firestore;
  A: typeof import('firebase/auth');
  F: typeof import('firebase/firestore');
};
let fb: Fb | null = null;
let uid = '';
let applying = false;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Apple ID가 이미 다른 계정에 연결돼 있을 때 받은 자격 증명(그 계정으로 바꿀 때 씀) */
let pendingApple: import('firebase/auth').AuthCredential | null = null;
const userListeners: ((uid: string) => void)[] = [];
export const FUNCTIONS_REGION = 'asia-northeast3';

export const cloud = {
  enabled: !!(CONFIG.apiKey && CONFIG.projectId && CONFIG.appId) && PLATFORM !== 'toss' && !DEMO,
  status: 'off' as CloudStatus,
  lastSyncAt: 0,
  conflict: null as { local: SaveSummary; remote: SaveSummary; remoteRev: number } | null,
  listeners: [] as (() => void)[],

  /** 게임 만들기 전에 부른다. 오래 걸려도 START_TIMEOUT_MS 뒤에는 게임을 시작(이후 계속 진행) */
  async start(): Promise<void> {
    if (!this.enabled) return;
    setStatus('connecting');
    const run = connect().catch((e) => {
      console.warn('클라우드 연결 실패', e);
      setStatus(navigator.onLine === false ? 'offline' : 'error');
    });
    await Promise.race([run, new Promise((r) => setTimeout(r, START_TIMEOUT_MS))]);
  },

  /** 선택 창에서 고른 결과 반영 */
  async resolve(choice: 'local' | 'remote'): Promise<boolean> {
    const c = this.conflict;
    if (!fb || !c) return false;
    try {
      if (choice === 'remote') {
        const snap = await fb.F.getDoc(fb.F.doc(fb.db, 'users', uid));
        if (!snap.exists()) return false;
        applyRemote(snap.data() as RemoteDoc);
      } else {
        await upload(c.remoteRev);
      }
      this.conflict = null;
      return true;
    } catch (e) {
      console.warn('선택 반영 실패', e);
      if (e instanceof Conflict) void sync();
      return false;
    }
  },

  /** 지금 바로 올리기(백그라운드로 갈 때) */
  flush: () => (fb && meta()?.dirty && cloud.status !== 'conflict' ? sync() : Promise.resolve()),
  onChange(cb: () => void) {
    this.listeners.push(cb);
  },
  /** 로그인 계정(UID)이 바뀔 때(Apple 계정으로 전환·계정 삭제 후 새 게스트) — 결제(RevenueCat) 사용자 맞추기 */
  onUser(cb: (uid: string) => void) {
    userListeners.push(cb);
  },
  get uid() {
    return uid;
  },
  /** 서버 함수 호출(functions/, 서울 지역). 로그인 토큰이 자동으로 붙는다 */
  async call<T = unknown>(name: string, data: unknown = {}): Promise<T> {
    if (!fb) throw new Error('cloud-off');
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const res = await httpsCallable(getFunctions(fb.app, FUNCTIONS_REGION), name, { timeout: 20_000 })(data);
    return res.data as T;
  },
};

interface RemoteDoc {
  save: string;
  rev: number;
  summary?: SaveSummary;
}

function setStatus(s: CloudStatus): void {
  cloud.status = s;
  for (const cb of cloud.listeners) cb();
}

const meta = (): CloudMeta | null => readMeta(store.getItem(CLOUD_KEY));
const writeMeta = (m: CloudMeta) => store.setItem(CLOUD_KEY, JSON.stringify(m));

async function connect(): Promise<void> {
  const [{ initializeApp }, A, F] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
  const app = initializeApp(CONFIG as Required<typeof CONFIG>);
  // 웹뷰(iOS)에서도 팝업 없이 동작하도록 기기 저장 방식 지정
  const auth = A.initializeAuth(app, { persistence: [A.indexedDBLocalPersistence, A.browserLocalPersistence] });
  const db = F.getFirestore(app);
  fb = { app, auth, db, A, F };
  await auth.authStateReady();
  const user = auth.currentUser ?? (await A.signInAnonymously(auth)).user;
  uid = user.uid;
  adoptUid(uid, providerOf(user));
  setAccountProvider(FirebaseAccount);

  onStoreWrite((k) => {
    if (k !== SAVE_KEY || applying) return;
    const m = meta();
    if (m && !m.dirty) writeMeta({ ...m, dirty: true });
    if (cloud.status === 'synced') setStatus('pending');
    schedule();
  });
  platform.onPause(() => void cloud.flush());
  platform.onResume(() => void sync());
  window.addEventListener('online', () => void sync());
  await sync();
  // 결제: iOS·안드로이드 앱 + 그 플랫폼 RevenueCat 공개 키가 있을 때만(웹·토스는 결제 없음). 앱이 꺼져 못 받은 지급이 있으면 지금 받는다
  // 안드로이드(2026-11-26 Google Play): 같은 RevenueCat SDK·같은 서버 함수, 키만 VITE_REVENUECAT_ANDROID_KEY
  const rcKey = (PLATFORM === 'android' ? env.VITE_REVENUECAT_ANDROID_KEY : env.VITE_REVENUECAT_IOS_KEY) as string | undefined;
  if ((PLATFORM === 'ios' || PLATFORM === 'android') && rcKey) {
    void import('./iosPurchases')
      .then((m) => m.installIosPurchases(rcKey))
      .catch((e) => console.warn('결제 준비 실패', e));
  }
}

const providerOf = (user: import('firebase/auth').User): AccountState['provider'] =>
  user.providerData.some((d) => d.providerId === 'apple.com') ? 'apple' : 'guest';

/** 다른 계정으로 바뀜(Apple 계정 전환·삭제 후 새 게스트): 저장 타이머 정리 → 새 UID → 결제 사용자 맞춤 → 서버 기록 확인 */
async function switchUser(user: import('firebase/auth').User): Promise<void> {
  if (timer) clearTimeout(timer);
  uid = user.uid;
  store.setItem(ACCOUNT_KEY, '');
  adoptUid(uid, providerOf(user));
  cloud.conflict = null;
  for (const cb of userListeners) cb(uid);
  setStatus('synced');
  await sync();
}

/** 게스트 계정 기록을 Firebase UID로(화면 ID·계정 삭제가 같은 UID를 본다). 연결 방식은 Firebase 로그인 정보가 기준 */
function adoptUid(id: string, provider: AccountState['provider']): void {
  let cur: AccountState | null = null;
  try {
    cur = JSON.parse(store.getItem(ACCOUNT_KEY) ?? 'null');
  } catch {
    /* 새로 */
  }
  if (cur?.uid === id && cur.provider === provider) return;
  const same = cur?.uid === id;
  const next: AccountState = { uid: id, provider, createdAt: same && cur ? cur.createdAt : Date.now() };
  if (provider === 'apple') next.linkedAt = same && cur?.linkedAt ? cur.linkedAt : Date.now();
  store.setItem(ACCOUNT_KEY, JSON.stringify(next));
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void sync(), UPLOAD_DELAY_MS);
}

async function sync(): Promise<void> {
  if (!fb || cloud.status === 'conflict') return;
  try {
    const snap = await fb.F.getDoc(fb.F.doc(fb.db, 'users', uid));
    const remote = snap.exists() ? (snap.data() as RemoteDoc) : null;
    const m = meta();
    const action = decideSync(m, uid, remote, m ? m.dirty : true);
    if (action === 'upload') await upload(remote?.rev ?? 0);
    else if (action === 'download' && remote) applyRemote(remote);
    else if (action === 'choose' && remote && (!m || m.uid !== uid) && isFresh(summarize(loadProgress(store)))) applyRemote(remote); // 막 설치한 기기(또는 빈 진행으로 Apple 계정 전환) → 묻지 않고 서버 기록
    else if (action === 'choose' && remote) {
      cloud.conflict = { local: summarize(loadProgress(store)), remote: remote.summary ?? summarize(parseSave(remote.save)), remoteRev: remote.rev };
      setStatus('conflict');
      return;
    }
    setStatus('synced');
  } catch (e) {
    if (e instanceof Conflict) {
      cloud.status = 'synced'; // 다시 읽어서 판단
      return sync();
    }
    console.warn('클라우드 저장 실패', e);
    setStatus(navigator.onLine === false ? 'offline' : 'error');
  }
}

async function upload(expectedRev: number): Promise<void> {
  if (!fb) return;
  const { F, db } = fb;
  const ref = F.doc(db, 'users', uid);
  const p = loadProgress(store);
  const text = store.getItem(SAVE_KEY) ?? JSON.stringify(p);
  const rev = await F.runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists() ? Number((snap.data() as RemoteDoc).rev) || 0 : 0;
    if (cur !== expectedRev) throw new Conflict();
    tx.set(ref, { save: text, rev: cur + 1, summary: summarize(p), schema: 1, platform: PLATFORM, updatedAt: F.serverTimestamp() });
    return cur + 1;
  });
  cloud.lastSyncAt = Date.now();
  writeMeta({ uid, rev, dirty: false, syncedAt: cloud.lastSyncAt });
}

const isFresh = (s: SaveSummary) => s.easyStage <= 1 && s.hardStage === 0 && s.dragons <= 1 && s.rubies === 0 && s.gold === 0;

/** 서버 저장 검사(손상·구버전은 기존 보정 규칙으로) */
function parseSave(text: string) {
  const mem = new Map<string, string>([[SAVE_KEY, text]]);
  return loadProgress({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) });
}

function applyRemote(remote: RemoteDoc): void {
  const p = parseSave(remote.save);
  applying = true;
  try {
    store.setItem(BEFORE_KEY, store.getItem(SAVE_KEY) ?? '');
    saveProgress(store, p);
  } finally {
    applying = false;
  }
  cloud.lastSyncAt = Date.now();
  writeMeta({ uid, rev: remote.rev, dirty: false, syncedAt: cloud.lastSyncAt });
}

const authDomain = () => CONFIG.authDomain || `${CONFIG.projectId}.firebaseapp.com`;
const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** Apple 오류 → 화면 결과 */
function appleFail(e: unknown, where: string): AccountResult {
  if (e instanceof AppleCancelled) return { ok: false, reason: 'cancelled' };
  console.warn(where, e);
  return { ok: false, reason: offline() ? 'offline' : 'failed' };
}

/** Firebase 계정: 게스트(익명) UID → iOS에서 Apple 연결(같은 UID 유지) */
const FirebaseAccount: AccountProvider = {
  get label() {
    return FirebaseAccount.current().provider === 'apple' ? 'Apple' : '게스트';
  },
  canLinkApple: PLATFORM === 'ios',
  current: () => {
    const s = JSON.parse(store.getItem(ACCOUNT_KEY) ?? 'null') as AccountState | null;
    return s ?? { uid, provider: 'guest', createdAt: Date.now() };
  },

  /**
   * 지금 게스트 계정에 Apple ID를 붙인다 → UID·서버 기록·결제 기록이 그대로 이어진다.
   * 이 Apple ID가 이미 다른 계정(예전 기기)에 붙어 있으면 'in-use' → 화면이 묻고 switchToApple.
   */
  linkApple: async () => {
    if (!fb || PLATFORM !== 'ios') return { ok: false, reason: 'unavailable' };
    const user = fb.auth.currentUser;
    if (!user) return { ok: false, reason: 'failed' };
    try {
      const { credential } = await appleCredential(fb.A, authDomain());
      const r = await fb.A.linkWithCredential(user, credential);
      adoptUid(r.user.uid, 'apple');
      return { ok: true };
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use') {
        pendingApple = fb.A.OAuthProvider.credentialFromError(e as import('firebase/app').FirebaseError);
        if (pendingApple) return { ok: false, reason: 'in-use' };
      }
      if (code === 'auth/provider-already-linked') {
        adoptUid(uid, 'apple');
        return { ok: true };
      }
      return appleFail(e, 'Apple 연결 실패');
    }
  },

  /** Apple ID에 연결된 예전 계정으로 바꿔 로그인. 이 기기 진행과 서버 기록이 다르면 로비가 고르기 창을 띄운다 */
  switchToApple: async () => {
    if (!fb || !pendingApple) return { ok: false, reason: 'failed' };
    try {
      await cloud.flush(); // 바꾸기 전 게스트 진행을 게스트 서버 기록에 마저 올려 둔다(이 기기 저장도 고르기 창에서 고를 수 있음)
      const r = await fb.A.signInWithCredential(fb.auth, pendingApple);
      pendingApple = null;
      await switchUser(r.user);
      return { ok: true };
    } catch (e) {
      return appleFail(e, 'Apple 계정 전환 실패');
    }
  },

  /**
   * 서버 기록 → (Apple이면 토큰 해지) → 로그인 계정 → 이 기기 저장 순서로 지우고, 새 게스트로 다시 시작.
   * 결제 장부(purchases)는 법정 보관 기간 동안 서버에 남는다(개인정보처리방침 4절).
   */
  deleteAccount: async () => {
    if (!fb) return { ok: false, reason: 'failed' };
    const user = fb.auth.currentUser;
    try {
      if (timer) clearTimeout(timer);
      if (user && PLATFORM === 'ios' && providerOf(user) === 'apple') {
        // 애플 요구: Sign in with Apple 계정을 지우면 Apple 토큰도 해지. 최근 로그인 확인을 겸해 한 번 더 Apple 창을 띄운다
        const { credential, authorizationCode } = await appleCredential(fb.A, authDomain());
        await fb.A.reauthenticateWithCredential(user, credential);
        await fb.A.revokeAccessToken(fb.auth, authorizationCode);
      }
      await fb.F.deleteDoc(fb.F.doc(fb.db, 'users', uid));
      if (user) await fb.A.deleteUser(user);
      applying = true;
      wipeLocalData();
      applying = false;
      store.setItem(CLOUD_KEY, '');
      store.setItem(BEFORE_KEY, '');
      const fresh = await fb.A.signInAnonymously(fb.auth);
      await switchUser(fresh.user);
      return { ok: true };
    } catch (e) {
      applying = false;
      return appleFail(e, '계정 삭제 실패');
    }
  },
};

/** 설정 화면 한 줄 */
export function cloudLine(now = Date.now()): string {
  if (!cloud.enabled) return '이 기기에만 저장 중';
  const ago = cloud.lastSyncAt ? Math.max(0, Math.round((now - cloud.lastSyncAt) / 60000)) : -1;
  switch (cloud.status) {
    case 'synced':
      return ago < 0 ? '클라우드 저장 켜짐' : `클라우드 저장됨 · ${ago < 1 ? '방금' : `${ago}분 전`}`;
    case 'pending':
      return '클라우드 저장 대기 중';
    case 'connecting':
      return '클라우드 연결 중…';
    case 'offline':
      return '오프라인 · 연결되면 저장해요';
    case 'conflict':
      return '저장 기록을 골라 주세요';
    case 'error':
      return '클라우드 저장 실패 · 이 기기에는 저장했어요';
    default:
      return '이 기기에만 저장 중';
  }
}
