// 드래곤 특공대 결제 서버(Firebase Cloud Functions 2세대, 서울) — docs/PAYMENTS.md
//
// 원칙: 앱이 보낸 영수증·금액은 믿지 않는다. 앱 사용자 = Firebase UID = RevenueCat 앱 사용자 ID.
// 서버가 그 UID로 RevenueCat에 거래를 직접 물어보고, 확인된 거래만 장부(purchases/{스토어_거래ID})에 적은 뒤 지급 내용을 돌려준다.
// - iapCheck : 결제 창을 열기 전에 기간·계정당 구매 횟수 확인
// - iapSync  : RevenueCat 거래 확인 → 새 거래 장부 기록(같은 거래는 한 번만) → 아직 앱에 지급하지 않은 것 돌려줌
// - iapAck   : 앱이 저장까지 끝낸 지급 표시(다음부터 안 돌려줌)
// - rcWebhook: RevenueCat 알림(환불 등)을 장부에 기록
// 장부는 클라이언트가 읽거나 쓸 수 없다(firestore.rules 기본 거부, 관리자 SDK만).

import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { setGlobalOptions } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { randomInt } from 'node:crypto';
import { canBuy, iapPeriodKey, iapProduct, ledgerId, passSeasonOf, readRcTransactions, type IapGrant, type LedgerLite, type ServerGrant } from '../../src/data/iap';
import { boardSlots, drawSlot, syncBoard, type BoardState, type ServerSkinState, type ServerSpin } from '../../src/data/skinRoulette';

initializeApp();
const db = getFirestore();
setGlobalOptions({ region: 'asia-northeast3', maxInstances: 10 });

/** RevenueCat 비밀 API 키(sk_…): `firebase functions:secrets:set REVENUECAT_SECRET_KEY` */
const RC_SECRET = defineSecret('REVENUECAT_SECRET_KEY');
/** RevenueCat 웹훅 Authorization 값(아무 긴 무작위 문자열): `firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH` */
const RC_WEBHOOK_AUTH = defineSecret('REVENUECAT_WEBHOOK_AUTH');

const LEDGER = 'purchases';

/** 장부 한 줄 */
interface LedgerDoc extends LedgerLite {
  uid: string;
  kind: string;
  transactionId: string;
  store: string;
  sandbox: boolean;
  purchasedAt: number;
  season?: number;
  grant: IapGrant;
  paidRubies: number; // 유료 루비(기획자 요청: 서버 장부는 유료·무료 루비 구분)
  delivered: boolean;
  overLimit: boolean; // 확인 뒤 동시에 두 번 결제된 경우 등 — 돈을 냈으니 지급은 하고 운영 확인용으로 표시
  refunded: boolean;
}

function requireUid(auth: { uid: string } | undefined): string {
  if (!auth?.uid) throw new HttpsError('unauthenticated', '로그인이 필요해요');
  return auth.uid;
}

async function ledgerOf(uid: string): Promise<(LedgerDoc & { id: string })[]> {
  const snap = await db.collection(LEDGER).where('uid', '==', uid).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as LedgerDoc) }));
}

/** 결제 창을 열기 전: 이 상품을 지금 더 살 수 있나 */
export const iapCheck = onCall(async (req) => {
  const uid = requireUid(req.auth);
  const productId = String((req.data as { productId?: unknown })?.productId ?? '');
  return canBuy(productId, await ledgerOf(uid), Date.now());
});

/** RevenueCat에 이 사용자의 거래를 묻고, 새 거래를 장부에 적은 뒤, 아직 지급 안 한 것을 돌려준다 */
export const iapSync = onCall({ secrets: [RC_SECRET] }, async (req): Promise<ServerGrant[]> => {
  const uid = requireUid(req.auth);
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
    headers: { Authorization: `Bearer ${RC_SECRET.value()}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    console.error('RevenueCat 응답 오류', res.status, await res.text().catch(() => ''));
    throw new HttpsError('unavailable', '결제 확인 서버에 연결하지 못했어요');
  }
  const txs = readRcTransactions(await res.json());
  const ledger = await ledgerOf(uid);
  const known = new Set(ledger.map((e) => e.id));

  for (const t of txs.sort((a, b) => a.purchasedAt - b.purchasedAt)) {
    const id = ledgerId(t.store, t.transactionId);
    if (known.has(id)) continue;
    const def = iapProduct(t.productId)!;
    const doc: LedgerDoc = {
      uid,
      productId: t.productId,
      kind: def.kind,
      transactionId: t.transactionId,
      store: t.store,
      sandbox: t.sandbox,
      purchasedAt: t.purchasedAt,
      periodKey: iapPeriodKey(def.period, t.purchasedAt),
      ...(def.kind === 'pass' ? { season: passSeasonOf(t.purchasedAt) } : {}),
      grant: def.grant,
      paidRubies: def.grant.rubies,
      delivered: false,
      overLimit: !canBuy(t.productId, ledger, t.purchasedAt).ok,
      refunded: false,
    };
    try {
      // create: 같은 거래 문서가 이미 있으면 실패 → 다른 계정(복원으로 옮겨 간 거래)이나 동시 요청이 먼저 적은 것. 다시 지급하지 않음
      await db.collection(LEDGER).doc(id).create({ ...doc, createdAt: FieldValue.serverTimestamp() });
      ledger.push({ id, ...doc });
      known.add(id);
      if (doc.overLimit) console.warn('구매 제한 초과 결제(지급함, 운영 확인 필요)', uid, id);
    } catch (e) {
      if ((e as { code?: number }).code !== 6) throw e; // 6 = ALREADY_EXISTS
    }
  }

  return ledger
    .filter((e) => !e.delivered && !e.refunded)
    .sort((a, b) => a.purchasedAt - b.purchasedAt)
    .map((e) => ({ id: e.id, productId: e.productId, transactionId: e.transactionId, purchasedAt: e.purchasedAt, grant: e.grant, ...(e.season ? { season: e.season } : {}) }));
});

/** 앱이 지급을 저장까지 끝냄 → 다음부터 돌려주지 않는다(본인 장부만) */
export const iapAck = onCall(async (req) => {
  const uid = requireUid(req.auth);
  const ids = (req.data as { ids?: unknown })?.ids;
  if (!Array.isArray(ids) || ids.length > 100) throw new HttpsError('invalid-argument', 'ids');
  let done = 0;
  for (const raw of ids) {
    const ref = db.collection(LEDGER).doc(String(raw));
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.get('uid') !== uid || snap.get('delivered')) return;
      tx.update(ref, { delivered: true, deliveredAt: FieldValue.serverTimestamp() });
      done++;
    });
  }
  return { done };
});

// ───────────────────────── 스킨 룰렛(서버 추첨, 2026-11-24) ─────────────────────────
// 열쇠는 현금 결제라 추첨을 서버가 한다: 앱 저장을 되돌려 다시 뽑거나 열쇠 수를 고치는 것을 막는다.
// - 남은 열쇠 = 장부의 열쇠 구매(환불 제외) − 서버가 기록한 사용 수
// - 상태 skinRoulette/{uid}: 사용 수·보유 스킨·이번 주 판(뽑은 칸)
// - 추첨 기록 skinSpins/{id}: 앱이 지급·저장을 끝내면 skinAck로 delivered 표시(그 전까지 skinState가 다시 돌려줌)
const ROULETTE = 'skinRoulette';
const SPINS = 'skinSpins';

interface RouletteDoc {
  spent: number;
  owned: string[];
  board: BoardState;
}

async function keysBought(uid: string): Promise<number> {
  const ledger = await ledgerOf(uid);
  return ledger.filter((e) => e.kind === 'skinkey' && !e.refunded).reduce((a, e) => a + (e.grant.skinKeys ?? 1), 0);
}

const rouletteOf = (d: Partial<RouletteDoc> | undefined, now: number): RouletteDoc => ({
  spent: d?.spent ?? 0,
  owned: d?.owned ?? [],
  board: syncBoard(d?.board ?? { week: '', picked: [] }, now),
});

async function pendingSpins(uid: string): Promise<ServerSpin[]> {
  const snap = await db.collection(SPINS).where('uid', '==', uid).where('delivered', '==', false).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ServerSpin, 'id'>) })).map(({ id, week, slot, essenceRoll, at }) => ({ id, week, slot, essenceRoll, at })).sort((a, b) => a.at - b.at);
}

/** 룰렛 화면을 열 때: 남은 열쇠·보유 스킨·이번 주 판·아직 지급 안 한 추첨 */
export const skinState = onCall(async (req): Promise<ServerSkinState> => {
  const uid = requireUid(req.auth);
  const now = Date.now();
  const [bought, snap, pending] = await Promise.all([keysBought(uid), db.collection(ROULETTE).doc(uid).get(), pendingSpins(uid)]);
  const st = rouletteOf(snap.data() as Partial<RouletteDoc> | undefined, now);
  return { keysLeft: Math.max(0, bought - st.spent), owned: st.owned, board: st.board, pending };
});

/** 열쇠 1개로 1회 추첨(서버 난수). 열쇠 부족 → failed-precondition 'keys', 판을 다 받음 → 'done' */
export const skinSpin = onCall(async (req): Promise<ServerSkinState & { spin: ServerSpin }> => {
  const uid = requireUid(req.auth);
  const now = Date.now();
  const bought = await keysBought(uid);
  const ref = db.collection(ROULETTE).doc(uid);
  const spinRef = db.collection(SPINS).doc();
  const out = await db.runTransaction(async (tx) => {
    const st = rouletteOf((await tx.get(ref)).data() as Partial<RouletteDoc> | undefined, now);
    if (bought - st.spent < 1) throw new HttpsError('failed-precondition', 'keys');
    const slot = drawSlot(boardSlots(st.owned, st.board.picked, now), st.board.picked, randomInt(0, 1_000_000_000) / 1_000_000_000);
    if (!slot) throw new HttpsError('failed-precondition', 'done');
    const spin: ServerSpin = { id: spinRef.id, week: st.board.week, slot, essenceRoll: randomInt(0, 1_000_000_000) / 1_000_000_000, at: now };
    const next: RouletteDoc = {
      spent: st.spent + 1,
      owned: slot.skin && !st.owned.includes(slot.skin) ? [...st.owned, slot.skin] : st.owned,
      board: { week: st.board.week, picked: [...st.board.picked, slot.id] },
    };
    tx.set(ref, { ...next, updatedAt: FieldValue.serverTimestamp() });
    const { id: _id, ...rec } = spin;
    tx.create(spinRef, { ...rec, uid, delivered: false, createdAt: FieldValue.serverTimestamp() });
    return { spin, next };
  });
  const pending = await pendingSpins(uid);
  return { spin: out.spin, keysLeft: Math.max(0, bought - out.next.spent), owned: out.next.owned, board: out.next.board, pending };
});

/** 앱이 추첨 결과 지급을 저장까지 끝냄 → 다음부터 돌려주지 않는다(본인 것만) */
export const skinAck = onCall(async (req) => {
  const uid = requireUid(req.auth);
  const ids = (req.data as { ids?: unknown })?.ids;
  if (!Array.isArray(ids) || ids.length > 100) throw new HttpsError('invalid-argument', 'ids');
  let done = 0;
  for (const raw of ids) {
    const ref = db.collection(SPINS).doc(String(raw));
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.get('uid') !== uid || snap.get('delivered')) return;
      tx.update(ref, { delivered: true, deliveredAt: FieldValue.serverTimestamp() });
      done++;
    });
  }
  return { done };
});

/**
 * RevenueCat 웹훅: 환불(CANCELLATION)을 장부에 기록한다. 루비 회수 규칙은 아직 미정(docs/MONETIZATION_PLAN.md 0-1)이라
 * 여기서는 기록만 하고, 아직 앱에 지급하지 않은 거래는 더 이상 지급하지 않는다.
 * RevenueCat 대시보드 → Integrations → Webhooks: URL = 이 함수 주소, Authorization = REVENUECAT_WEBHOOK_AUTH 값.
 */
export const rcWebhook = onRequest({ secrets: [RC_WEBHOOK_AUTH] }, async (req, res) => {
  const auth = String(req.headers.authorization ?? '');
  const expected = RC_WEBHOOK_AUTH.value();
  if (req.method !== 'POST' || (auth !== expected && auth !== `Bearer ${expected}`)) {
    res.status(401).send('unauthorized');
    return;
  }
  const ev = (req.body as { event?: Record<string, unknown> })?.event ?? {};
  const type = String(ev.type ?? '');
  const txId = String(ev.transaction_id ?? '');
  const store = String(ev.store ?? 'app_store').toLowerCase();
  await db.collection('iapEvents').add({ type, txId, store, productId: ev.product_id ?? null, appUserId: ev.app_user_id ?? null, env: ev.environment ?? null, at: FieldValue.serverTimestamp() });
  if (type === 'CANCELLATION' && txId) {
    await db.collection(LEDGER).doc(ledgerId(store, txId)).set(
      { refunded: true, refundedAt: FieldValue.serverTimestamp(), refundReason: ev.cancel_reason ?? null, transactionId: txId, store },
      { merge: true },
    );
  }
  res.status(200).send('ok');
});
