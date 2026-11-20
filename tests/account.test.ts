import { describe, expect, it } from 'vitest';
import { RUBY_PRODUCTS } from '../src/data/economy';
import { grantVerifiedRubies } from '../src/systems/Purchases';
import { defaultProgress, Progress } from '../src/systems/Progress';
import { ACCOUNT_KEY, LocalGuest, shortId } from '../src/systems/Account';
import { store } from '../src/platform';

describe('루비 결제 지급(첫 출시 결제)', () => {
  it('상품 ID가 겹치지 않고 지급량은 양수', () => {
    const ids = RUBY_PRODUCTS.map((p) => p.productId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of RUBY_PRODUCTS) expect(p.rubies + p.bonus).toBeGreaterThan(0);
  });
  it('검증된 거래만, 같은 거래 ID는 한 번만 지급', () => {
    const p0 = defaultProgress(0);
    const a = grantVerifiedRubies(p0, 'tx-1', 550);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.progress.rubies).toBe(550);
    const b = grantVerifiedRubies(a.progress, 'tx-1', 550);
    expect(b.ok && b.progress.rubies).not.toBe(1100); // 같은 거래 재시도 → 더 지급하지 않음
    const c = grantVerifiedRubies(a.progress, 'tx-2', 100);
    expect(c.ok && c.progress.rubies).toBe(650);
  });
  it('잘못된 수량은 거절', () => {
    expect(grantVerifiedRubies(defaultProgress(0), 'tx-x', 0).ok).toBe(false);
    expect(grantVerifiedRubies(defaultProgress(0), 'tx-y', 1.5).ok).toBe(false);
  });
});

describe('게스트 계정(기기 안)', () => {
  it('처음 부르면 게스트를 만들고 같은 ID를 유지', () => {
    store.setItem(ACCOUNT_KEY, '');
    const a = LocalGuest.current();
    expect(a.provider).toBe('guest');
    expect(a.uid.startsWith('guest-')).toBe(true);
    expect(LocalGuest.current().uid).toBe(a.uid);
    expect(shortId(a.uid).length).toBeLessThanOrEqual(15);
  });
  it('Apple 연결은 서버 연결 전에는 불가로 응답', async () => {
    expect(await LocalGuest.linkApple()).toEqual({ ok: false, reason: 'unavailable' });
  });
  it('계정 삭제: 진행을 처음으로 되돌리고 새 게스트 ID', async () => {
    const before = LocalGuest.current().uid;
    Progress.save({ ...Progress.load(), gold: 12345, rubies: 999 });
    expect(Progress.load().gold).toBe(12345);
    expect((await LocalGuest.deleteAccount()).ok).toBe(true);
    expect(Progress.load().gold).toBe(0);
    expect(Progress.load().rubies).toBe(0);
    expect(LocalGuest.current().uid).not.toBe(before);
  });
});
