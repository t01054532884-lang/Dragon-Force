import { describe, expect, it } from 'vitest';
import { RUBY_PRODUCTS } from '../src/data/economy';
import { canBuy, GIFT_CODE, iapProduct, readRcTransactions, type ServerGrant } from '../src/data/iap';
import { claimOne, pendingGifts } from '../src/systems/Mailbox';
import { defaultProgress } from '../src/systems/Progress';
import { applyServerGrant } from '../src/systems/Purchases';

// 선물 코드(1.0.5, 2026-11-28 제작자 승인): Apple 오퍼 코드 → 소모성 상품 ruby_2000_gift → 서버 장부 → 선물함
const T0 = Date.parse('2026-12-05T12:00:00+09:00');
const grant = (tx: string): ServerGrant => ({ id: `app_store_${tx}`, productId: GIFT_CODE.productId, transactionId: tx, purchasedAt: T0, grant: iapProduct(GIFT_CODE.productId)!.grant });

describe('선물 코드 상품', () => {
  it('ruby_2000_gift: 루비 2,000, 무료(0원), 상점 루비 목록에는 없음', () => {
    const d = iapProduct('ruby_2000_gift')!;
    expect(d).toMatchObject({ kind: 'gift', krw: 0, period: 'none' });
    expect(d.grant.rubies).toBe(2000);
    expect(RUBY_PRODUCTS.map((r) => r.productId)).not.toContain('ruby_2000_gift');
  });
  it('서버: 횟수 제한은 Apple 오퍼 코드가 맡으므로 앱 장부로는 막지 않음, RevenueCat 거래로 읽힘', () => {
    expect(canBuy('ruby_2000_gift', [{ productId: 'ruby_2000_gift', periodKey: 'none' }], T0)).toEqual({ ok: true });
    const txs = readRcTransactions({ subscriber: { non_subscriptions: { ruby_2000_gift: [{ store_transaction_id: '2000000999', purchase_date: '2026-12-05T03:00:00Z', store: 'app_store' }] } } });
    expect(txs).toEqual([expect.objectContaining({ productId: 'ruby_2000_gift', transactionId: '2000000999' })]);
  });
});

describe('선물 코드 지급', () => {
  it('루비를 바로 넣지 않고 선물함에 "선물 코드 보상 루비 2,000" → 받으면 +2,000', () => {
    const p0 = defaultProgress();
    const r = applyServerGrant(p0, grant('t1'), T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.progress.rubies).toBe(p0.rubies);
    const gifts = pendingGifts(r.progress.mailbox, T0);
    const g = gifts.find((x) => x.id === 'giftcode:t1')!;
    expect(g).toMatchObject({ kind: 'rubies', amount: 2000, title: '선물 코드 보상', body: '선물 코드 보상 루비 2,000', expiresAt: null });
    const c = claimOne(r.progress, g.id, T0 + 1000);
    expect(c.ok).toBe(true);
    if (c.ok) expect(c.progress.rubies - p0.rubies).toBe(2000);
  });
  it('같은 거래는 한 번만(앱이 꺼졌다 켜져 서버가 다시 돌려줘도)', () => {
    const r = applyServerGrant(defaultProgress(), grant('t2'), T0);
    if (!r.ok) throw new Error('first');
    expect(applyServerGrant(r.progress, grant('t2'), T0 + 5000)).toMatchObject({ ok: false, reason: 'duplicate' });
    expect(pendingGifts(r.progress.mailbox, T0).filter((x) => x.id === 'giftcode:t2')).toHaveLength(1);
  });
  it('다른 코드(다른 거래)는 각각 선물로', () => {
    const a = applyServerGrant(defaultProgress(), grant('t3'), T0);
    if (!a.ok) throw new Error('a');
    const b = applyServerGrant(a.progress, grant('t4'), T0);
    expect(b.ok).toBe(true);
    if (b.ok) expect(pendingGifts(b.progress.mailbox, T0).filter((x) => x.id.startsWith('giftcode:'))).toHaveLength(2);
  });
});
