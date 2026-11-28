import { describe, expect, it } from 'vitest';
import { ND_PASS, ND_REWARDS, ndEnd, ndValuePct } from '../src/data/ndPass';
import { canBuy, iapPeriodKey, iapProduct } from '../src/data/iap';
import { choosePick, claimNd, grantVerifiedNdPass, ndCellState, ndLevel, ndPointsTo, pickLocked, syncNd } from '../src/systems/NdPass';
import { defaultProgress, sanitize, settleRun, type PlayerProgress } from '../src/systems/Progress';
import { applyServerGrant } from '../src/systems/Purchases';

// 신규 드래곤 패스(1.0.5, docs/NEW_DRAGON_PASS.md)
const T0 = ND_PASS.start + 3_600_000; // 기간 첫날
const DAY = 86_400_000;
const withXp = (p: PlayerProgress, clears: number): PlayerProgress => ({ ...p, lifetime: { ...p.lifetime, runs: p.lifetime.runs + clears, clears: p.lifetime.clears + clears } });
const started = () => syncNd(defaultProgress(T0 - 10 * DAY), T0);
const maxed = (p: PlayerProgress) => withXp(p, Math.ceil(ndPointsTo(ND_PASS.levels) / 100) + 1);

describe('신규 드래곤 패스 데이터', () => {
  it('21일 · 20레벨 · 합계 9,025P', () => {
    expect(ndEnd() - ND_PASS.start).toBe(21 * DAY);
    expect(ndPointsTo(20)).toBe(9025);
    expect(ND_REWARDS.free.length).toBe(20);
    expect(ND_REWARDS.pass.length).toBe(20);
  });
  it('무료 줄 기어스 조각 60(희귀 해금량) · 신규 패스 줄 고른 영웅 조각 100(5·10·15·20레벨) · 루비 1,500', () => {
    const sum = (t: 'free' | 'pass', k: string) => ND_REWARDS[t].filter((i) => i.kind === k).reduce((s, i) => s + i.n, 0);
    expect(sum('free', 'dragonFrag')).toBe(60);
    expect(sum('pass', 'pickFrag')).toBe(100);
    expect(ND_REWARDS.pass.map((i, k) => (i.kind === 'pickFrag' ? k + 1 : 0)).filter(Boolean)).toEqual([5, 10, 15, 20]);
    expect(sum('pass', 'rubies')).toBe(1500);
    expect(sum('pass', 'dragonTicket')).toBe(5);
    expect(sum('free', 'dragonTicket')).toBe(2);
  });
  it('가치(%)는 드래곤 패스와 같은 방식의 계산값', () => {
    expect(ndValuePct('pass')).toBe(420);
    expect(ndValuePct('bahamut')).toBe(180);
  });
});

describe('상품·구매 제한(서버 canBuy)', () => {
  const led = (...ids: string[]) => ids.map((productId) => ({ productId, periodKey: 'nd1' }));
  it('두 상품: ₩11,000 · ₩33,000, 기간 키 nd1', () => {
    expect(iapProduct(ND_PASS.productId.pass)?.krw).toBe(11_000);
    expect(iapProduct(ND_PASS.productId.bahamut)?.krw).toBe(33_000);
    expect(iapPeriodKey('ndpass', T0)).toBe('nd1');
  });
  it('기간 밖에는 못 산다', () => {
    expect(canBuy(ND_PASS.productId.pass, [], ND_PASS.start - 1)).toEqual({ ok: false, reason: 'closed' });
    expect(canBuy(ND_PASS.productId.bahamut, [], ndEnd())).toEqual({ ok: false, reason: 'closed' });
    expect(canBuy(ND_PASS.productId.pass, [], T0)).toEqual({ ok: true });
  });
  it('신규 패스는 1번, 신규 패스 뒤 바하무트 패스는 가능, 바하무트 패스 뒤에는 둘 다 막힘', () => {
    expect(canBuy(ND_PASS.productId.pass, led(ND_PASS.productId.pass), T0).ok).toBe(false);
    expect(canBuy(ND_PASS.productId.bahamut, led(ND_PASS.productId.pass), T0).ok).toBe(true);
    expect(canBuy(ND_PASS.productId.pass, led(ND_PASS.productId.bahamut), T0).ok).toBe(false);
    expect(canBuy(ND_PASS.productId.bahamut, led(ND_PASS.productId.bahamut), T0).ok).toBe(false);
    // 환불된 거래는 세지 않음
    expect(canBuy(ND_PASS.productId.pass, [{ productId: ND_PASS.productId.pass, periodKey: 'nd1', refunded: true }], T0).ok).toBe(true);
  });
});

describe('지급', () => {
  it('신규 패스: 줄이 열리고 같은 거래는 한 번만', () => {
    const r = grantVerifiedNdPass(started(), 't1', 'pass', T0);
    expect(r.ok && r.progress.ndPass.pass).toBe(true);
    if (!r.ok) return;
    expect(grantVerifiedNdPass(r.progress, 't1', 'pass', T0).ok).toBe(false);
  });
  it('바하무트 패스: 즉시 해금 + 신규 패스 줄, 이미 있으면 조각 160', () => {
    const r = grantVerifiedNdPass(started(), 't2', 'bahamut', T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.progress.dragons.bahamut.unlocked).toBe(true);
    expect(r.progress.ndPass.pass && r.progress.ndPass.bahamut).toBe(true);
    const had = started();
    had.dragons.bahamut = { ...had.dragons.bahamut, unlocked: true };
    const r2 = grantVerifiedNdPass(had, 't3', 'bahamut', T0);
    expect(r2.ok && r2.progress.dragons.bahamut.fragments).toBe(160);
  });
  it('신규 패스를 산 뒤 바하무트 패스: 바하무트 해금만 더(줄은 이미 열림)', () => {
    const a = grantVerifiedNdPass(started(), 'a', 'pass', T0);
    if (!a.ok) throw new Error();
    const b = grantVerifiedNdPass(a.progress, 'b', 'bahamut', T0);
    expect(b.ok && b.progress.dragons.bahamut.unlocked && b.progress.ndPass.bahamut).toBe(true);
  });
  it('서버 지급 경로(applyServerGrant)로도 같은 결과', () => {
    const g = { id: 'x', productId: ND_PASS.productId.bahamut, transactionId: 'tx9', purchasedAt: T0, grant: iapProduct(ND_PASS.productId.bahamut)!.grant };
    const r = applyServerGrant(started(), g, T0);
    expect(r.ok && r.progress.dragons.bahamut.unlocked).toBe(true);
  });
});

describe('레벨·받기', () => {
  it('무료 줄 20레벨까지 받으면 기어스 해금(조각 60 자동 교환)', () => {
    const p = maxed(started());
    expect(ndLevel(p).level).toBe(20);
    const r = claimNd(p, T0 + DAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.progress.dragons.gears.unlocked).toBe(true);
    expect(r.items.some((i) => i.unlocked && i.dragonId === 'gears')).toBe(true);
    // 유료 줄은 구매 전이라 그대로
    expect(ndCellState(r.progress, 'pass', 1, T0 + DAY)).toBe('buy');
  });
  it('신규 패스: 영웅을 고르기 전 조각 칸은 "pick", 고르고 20레벨까지 받으면 그 영웅 해금', () => {
    const b = grantVerifiedNdPass(maxed(started()), 'p', 'pass', T0);
    if (!b.ok) throw new Error();
    expect(ndCellState(b.progress, 'pass', 5, T0)).toBe('pick');
    const c = choosePick(b.progress, 'forge', T0);
    if (!c.ok) throw new Error();
    expect(pickLocked(c.progress)).toBe(true);
    expect(choosePick(c.progress, 'silva', T0).ok).toBe(false);
    const r = claimNd(c.progress, T0);
    expect(r.ok && r.progress.dragons.forge.unlocked).toBe(true);
    if (r.ok) expect(r.progress.rubies).toBeGreaterThanOrEqual(c.progress.rubies + 170 + 1500); // 해금 업적 루비가 더해질 수 있음
  });
  it('구매 전에는 영웅을 바꿀 수 있고, 영웅 3종만', () => {
    const a = choosePick(started(), 'silva', T0);
    if (!a.ok) throw new Error();
    expect(choosePick(a.progress, 'crystal', T0).ok).toBe(true);
    expect(choosePick(a.progress, 'bahamut', T0).ok).toBe(false);
  });
  it('기간이 끝나면 받을 수 없음', () => {
    const p = maxed(started());
    expect(ndCellState(p, 'free', 1, ndEnd())).toBe('ended');
    expect(claimNd(p, ndEnd()).ok).toBe(false);
  });
});

describe('포인트: 신규 드래곤으로 싸우면 +50%', () => {
  const run = (dragonId: 'red' | 'gears') => ({ stageId: 1, cleared: true, elapsedMs: 60_000, normalKills: 0, eliteKills: 0, difficulty: 'easy' as const, dragonId, outcome: 'clear' as const });
  it('레드 클리어 100P · 기어스 클리어 150P', () => {
    const p = started();
    const a = settleRun(p, 'r1', 0, undefined, run('red'), T0).progress;
    expect(ndLevel(a).points).toBe(100);
    const b = settleRun(p, 'r2', 0, undefined, run('gears'), T0).progress;
    expect(ndLevel(b).points).toBe(150);
  });
  it('기간 밖 판은 패스를 시작하지 않음', () => {
    const p = defaultProgress(T0 - 10 * DAY);
    const a = settleRun(p, 'r3', 0, undefined, run('gears'), ND_PASS.start - DAY).progress;
    expect(a.ndPass.id).toBe('');
  });
});

describe('저장', () => {
  it('ndPass 필드 보정(이상한 값은 버림)', () => {
    const raw = { ...defaultProgress(T0), ndPass: { id: 'nd1', baseXp: -5, bonusXp: 'x', claimed: ['free-1', 3], pass: 'yes', bahamut: true, pick: 'nope' } };
    const p = sanitize(raw as unknown as Record<string, unknown>);
    expect(p.ndPass).toEqual({ id: 'nd1', baseXp: 0, bonusXp: 0, claimed: ['free-1'], pass: true, bahamut: true, pick: null });
  });
});
