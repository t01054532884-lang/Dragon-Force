import { afterEach, describe, expect, it } from 'vitest';
import { DEALS, PACKAGES, RUBY_PRODUCTS } from '../src/data/economy';
import { canBuy, IAP_PRODUCTS, iapPeriodKey, iapProduct, ledgerId, passSeasonOf, readRcTransactions, type ServerGrant } from '../src/data/iap';
import { PASS } from '../src/data/pass';
import { seasonOf } from '../src/systems/Pass';
import { dealPeriodKey, defaultProgress, Progress } from '../src/systems/Progress';
import { applyServerGrant, buyProduct, deliverPending, NoPurchases, packageBought, setPurchaseProvider, type PurchaseProvider } from '../src/systems/Purchases';

// 인앱결제 2단계(2026-11-23, docs/PAYMENTS.md): 상품표 17종 · 서버 구매 제한 · RevenueCat 응답 읽기 · 서버 지급 반영 · 결제 흐름
const T0 = Date.parse('2026-11-25T12:00:00+09:00');
const grantOf = (productId: string, tx: string, at = T0): ServerGrant => {
  const def = iapProduct(productId)!;
  return { id: `app_store_${tx}`, productId, transactionId: tx, purchasedAt: at, grant: def.grant, ...(def.kind === 'pass' ? { season: passSeasonOf(at) } : {}) };
};

describe('상품표', () => {
  it('18종: 루비 5 · 패키지 3 · 특혜 6 · 패스 2 · 루비 패스 1 · 스킨 열쇠 1, ID 중복 없음', () => {
    expect(IAP_PRODUCTS).toHaveLength(18);
    expect(IAP_PRODUCTS.filter((p) => p.kind === 'skinkey').map((p) => [p.productId, p.krw, p.grant.skinKeys])).toEqual([['skin_key_1', 4900, 1]]);
    expect(IAP_PRODUCTS.filter((p) => p.kind === 'ruby')).toHaveLength(RUBY_PRODUCTS.length);
    expect(IAP_PRODUCTS.filter((p) => p.kind === 'package')).toHaveLength(PACKAGES.length + DEALS.length);
    expect(IAP_PRODUCTS.filter((p) => p.kind === 'pass').map((p) => p.productId)).toEqual([PASS.productId.premium, PASS.productId.royal]);
    expect(new Set(IAP_PRODUCTS.map((p) => p.productId)).size).toBe(18);
    for (const p of IAP_PRODUCTS) expect(p.productId).toMatch(/^[a-z0-9_]+$/); // App Store 상품 ID로 쓸 수 있는 글자
  });
  it('기간 키가 상점(dealPeriodKey)·패스 시즌(seasonOf)과 같다', () => {
    for (let t = Date.parse('2026-11-20T00:00:00+09:00'); t < Date.parse('2027-02-01T00:00:00+09:00'); t += 3_600_000 * 7) {
      for (const per of ['daily', 'weekly', 'monthly', 'once'] as const) expect(iapPeriodKey(per, t)).toBe(dealPeriodKey(per, t));
      expect(passSeasonOf(t)).toBe(seasonOf(t));
    }
  });
});

describe('서버 구매 제한(canBuy)', () => {
  it('루비는 제한 없음 · 없는 상품 거절', () => {
    expect(canBuy('ruby_100', Array(50).fill({ productId: 'ruby_100', periodKey: 'none' }), T0)).toEqual({ ok: true });
    expect(canBuy('nope', [], T0)).toEqual({ ok: false, reason: 'product' });
  });
  it('일일 특혜: 오늘 1번 → 막힘, 다음 날(KST 자정 뒤) 다시 가능, 환불분은 안 셈', () => {
    const id = 'deal_daily_ruby';
    const bought = [{ productId: id, periodKey: iapPeriodKey('daily', T0) }];
    expect(canBuy(id, bought, T0)).toEqual({ ok: false, reason: 'limit' });
    expect(canBuy(id, bought, Date.parse('2026-11-26T00:00:01+09:00'))).toEqual({ ok: true });
    expect(canBuy(id, [{ ...bought[0], refunded: true }], T0)).toEqual({ ok: true });
  });
  it('한정 패키지: 계정당 1번(기간 없음)', () => {
    const bought = [{ productId: 'pkg_growth_1', periodKey: 'once' }];
    expect(canBuy('pkg_growth_1', bought, T0 + 400 * 86_400_000)).toEqual({ ok: false, reason: 'limit' });
  });
  it('패스: 로열이 있으면 둘 다 막힘, 프리미엄만 있으면 로열은 가능, 다음 시즌은 다시 가능', () => {
    const s = `s${passSeasonOf(T0)}`;
    const prem = [{ productId: PASS.productId.premium, periodKey: s }];
    expect(canBuy(PASS.productId.premium, prem, T0)).toEqual({ ok: false, reason: 'owned' });
    expect(canBuy(PASS.productId.royal, prem, T0)).toEqual({ ok: true });
    const royal = [{ productId: PASS.productId.royal, periodKey: s }];
    expect(canBuy(PASS.productId.premium, royal, T0)).toEqual({ ok: false, reason: 'owned' });
    expect(canBuy(PASS.productId.royal, royal, T0 + PASS.seasonDays * 86_400_000)).toEqual({ ok: true });
  });
});

describe('RevenueCat 응답 읽기', () => {
  it('우리 상품의 거래만 · App Store 거래 ID 우선', () => {
    const body = {
      subscriber: {
        non_subscriptions: {
          ruby_550: [{ id: 'rc1', store_transaction_id: '2000001', purchase_date: '2026-11-25T03:00:00Z', is_sandbox: true, store: 'app_store' }],
          deal_daily_ruby: [{ id: 'rc2', purchase_date: '2026-11-25T04:00:00Z', store: 'app_store' }],
          other_game_item: [{ id: 'rc3', store_transaction_id: '9', purchase_date: '2026-11-25T04:00:00Z' }],
          ruby_100: [{ id: 'rc4', store_transaction_id: '3', purchase_date: 'bad' }],
        },
      },
    };
    expect(readRcTransactions(body)).toEqual([
      { productId: 'ruby_550', transactionId: '2000001', purchasedAt: Date.parse('2026-11-25T03:00:00Z'), sandbox: true, store: 'app_store' },
      { productId: 'deal_daily_ruby', transactionId: 'rc2', purchasedAt: Date.parse('2026-11-25T04:00:00Z'), sandbox: false, store: 'app_store' },
    ]);
    expect(readRcTransactions(null)).toEqual([]);
    expect(ledgerId('app_store', 'a/b')).toBe('app_store_a_b');
  });
});

describe('서버 지급 반영(applyServerGrant)', () => {
  it('루비: 보너스 포함 지급, 같은 거래는 한 번만', () => {
    const r = applyServerGrant(defaultProgress(), grantOf('ruby_1350', 't1'), T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.progress.rubies - defaultProgress().rubies).toBe(1350);
    expect(applyServerGrant(r.progress, grantOf('ruby_1350', 't1'), T0)).toMatchObject({ ok: false, reason: 'duplicate' });
  });
  it('패키지: 서버가 확인한 지급은 앱 횟수 기록과 상관없이 지급(돈 낸 결제), 구매한 날로 기록', () => {
    const pk = 'deal_daily_ruby';
    const night = Date.parse('2026-11-25T23:59:30+09:00');
    let p = defaultProgress();
    const a = applyServerGrant(p, grantOf(pk, 'a', night), night + 60_000); // 자정 넘어 반영
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    p = a.progress;
    expect(packageBought(p, pk, night)).toBe(1); // 산 날(11/25)로 셈
    expect(packageBought(p, pk, night + 60_000)).toBe(0); // 다음 날은 다시 살 수 있음
    const b = applyServerGrant(p, grantOf(pk, 'b', night), night); // 같은 날 두 번째(서버 overLimit) → 그래도 지급
    expect(b.ok).toBe(true);
  });
  it('패스: 이번 시즌이면 유료 줄 열림, 지난 시즌 구매는 expired', () => {
    const r = applyServerGrant(defaultProgress(), grantOf(PASS.productId.royal, 'p1'), T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.progress.pass).toMatchObject({ premium: true, royal: true, season: seasonOf(T0) });
    const late = T0 + PASS.seasonDays * 86_400_000;
    expect(applyServerGrant(defaultProgress(), grantOf(PASS.productId.premium, 'p2'), late)).toMatchObject({ ok: false, reason: 'expired' });
  });
});

describe('결제 흐름(가짜 결제 창구)', () => {
  afterEach(() => setPurchaseProvider(NoPurchases));
  const fake = (over: Partial<PurchaseProvider> = {}) => {
    const acked: string[] = [];
    let server: ServerGrant[] = [];
    const p: PurchaseProvider = {
      available: true,
      products: async () => [],
      check: async () => ({ ok: true }),
      purchase: async (id) => {
        server.push(grantOf(id, `tx${server.length + acked.length}`, Date.now()));
        return 'done';
      },
      restore: async () => {},
      pending: async () => server.filter((g) => !acked.includes(g.id)),
      ack: async (ids) => {
        acked.push(...ids);
        server = server.filter((g) => !ids.includes(g.id));
      },
      ...over,
    };
    setPurchaseProvider(p);
    return { acked, push: (g: ServerGrant) => server.push(g) };
  };

  it('결제 → 서버 지급 → 저장 → ack, 결제 못 쓰는 곳은 unavailable', async () => {
    expect(await buyProduct('ruby_100')).toEqual({ ok: false, reason: 'unavailable' });
    const f = fake();
    const before = Progress.load().rubies;
    const r = await buyProduct('ruby_550');
    expect(r.ok).toBe(true);
    expect(Progress.load().rubies - before).toBe(550);
    expect(f.acked).toHaveLength(1);
  });
  it('서버가 막으면 결제 창을 열지 않음 · 취소는 안내 없음', async () => {
    let opened = false;
    fake({ check: async () => ({ ok: false, reason: 'limit' }), purchase: async () => ((opened = true), 'done') });
    expect(await buyProduct('deal_daily_ruby')).toEqual({ ok: false, reason: 'limit' });
    expect(opened).toBe(false);
    fake({ purchase: async () => 'cancelled' });
    expect(await buyProduct('ruby_100')).toEqual({ ok: false, reason: 'cancelled' });
  });
  it('지급 실패 후 재처리: 앱이 저장 전에 꺼져도 다음 확인 때 한 번만 지급(ack 실패해도 중복 없음)', async () => {
    const f = fake({ ack: async () => Promise.reject(new Error('net')) });
    const g = grantOf('ruby_100', 'retry1', Date.now());
    f.push(g);
    const before = Progress.load().rubies;
    await deliverPending();
    await deliverPending(); // ack가 실패해 서버가 같은 지급을 또 돌려줌 → 거래 ID로 막힘
    expect(Progress.load().rubies - before).toBe(100);
  });
});
