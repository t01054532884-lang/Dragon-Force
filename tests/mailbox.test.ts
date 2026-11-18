import { describe, expect, it } from 'vitest';
import { claimAll, claimOne, grantClearGift, pendingCount, pendingGifts, pruneMailbox, spendStamina, syncCampaigns, addGift, type Campaign, type Gift } from '../src/systems/Mailbox';
import { backfillClearGifts, defaultProgress, loadProgress, SAVE_KEY, settleRun, type PlayerProgress, type Store } from '../src/systems/Progress';
import { STAMINA } from '../src/systems/Stamina';
import { activeCampaigns } from '../src/data/campaigns';

const T0 = Date.UTC(2026, 10, 19, 3, 0, 0);
const DAY = 86_400_000;
const mem = (init: Record<string, string> = {}): Store => {
  const d = new Map(Object.entries(init));
  return { getItem: (k) => d.get(k) ?? null, setItem: (k, v) => void d.set(k, v) };
};
const withStamina = (p: PlayerProgress, value: number): PlayerProgress => ({ ...p, stamina: { value, regenFrom: T0 } });
const gift = (id: string, kind: Gift['kind'], amount: number, createdAt = T0, expiresAt: number | null = null): Gift => ({
  id, kind, amount, title: id, source: 'test', sender: 'operator', createdAt, expiresAt,
});

describe('선물함 — 최초 클리어 선물', () => {
  it('스테이지·난이도별 1회, 만료 없음', () => {
    let p = defaultProgress(T0);
    const a = grantClearGift(p, 'easy', 1, '쉬움 1단계', T0);
    expect(a.added).toBe(true);
    p = a.progress;
    expect(grantClearGift(p, 'easy', 1, '쉬움 1단계', T0).added).toBe(false);
    expect(grantClearGift(p, 'hard', 1, '어려움 1단계', T0).added).toBe(true);
    expect(p.mailbox.gifts[0]).toMatchObject({ id: 'clear:easy:1', kind: 'stamina', amount: 20, expiresAt: null });
  });
  it('전투 정산에서 최초 클리어만 선물 생성(반복 클리어 없음)', () => {
    const run = { stageId: 1, cleared: true, elapsedMs: 400_000, normalKills: 100, eliteKills: 2, difficulty: 'easy' as const };
    const a = settleRun(defaultProgress(T0), 'r1', 100, 2, run, T0);
    expect(pendingCount(a.progress.mailbox, T0)).toBe(1);
    const b = settleRun(a.progress, 'r2', 100, 2, run, T0);
    expect(b.progress.mailbox.gifts).toHaveLength(1);
  });
});

describe('선물함 — 수령', () => {
  it('개별 수령: 행동력은 받은 뒤 40을 넘으면 보류, 21 이상이면 20짜리 못 받음', () => {
    let p = addGift(withStamina(defaultProgress(T0), 21), gift('s', 'stamina', 20)).progress;
    expect(claimOne(p, 's', T0)).toMatchObject({ ok: false, reason: 'wouldExceed' });
    p = withStamina(p, 20);
    const r = claimOne(p, 's', T0);
    expect(r.ok && r.progress.stamina.value).toBe(40);
    expect(r.ok && claimOne(r.progress, 's', T0)).toMatchObject({ ok: false, reason: 'claimed' });
  });
  it('기획서 예: 25/40에 행동력 20 두 개 + 루비 + 골드 → 모두 받기는 루비·골드만, 행동력 둘은 남김', () => {
    let p = withStamina(defaultProgress(T0), 25);
    for (const g of [gift('s1', 'stamina', 20, T0), gift('s2', 'stamina', 20, T0 + 1), gift('r', 'rubies', 1000, T0 + 2), gift('g', 'gold', 500, T0 + 3)]) p = addGift(p, g).progress;
    const r = claimAll(p, T0);
    expect(r.claimed.map((g) => g.id)).toEqual(['r', 'g']);
    expect(r.kept.map((k) => [k.gift.id, k.reason])).toEqual([['s1', 'wouldExceed'], ['s2', 'wouldExceed']]);
    expect(r.progress.rubies).toBe(1000);
    expect(r.progress.gold).toBe(500);
    expect(pendingCount(r.progress.mailbox, T0)).toBe(2);
    // 행동력을 써서 20 이하가 되면 하나 받을 수 있음
    const spent = spendStamina(r.progress, 5, T0).progress; // 20
    const r2 = claimAll(spent, T0);
    expect(r2.claimed.map((g) => g.id)).toEqual(['s1']);
    expect(r2.progress.stamina.value).toBe(40);
    expect(pendingCount(r2.progress.mailbox, T0)).toBe(1);
  });
  it('모두 받기를 두 번 눌러도 중복 지급 없음', () => {
    let p = addGift(defaultProgress(T0), gift('r', 'rubies', 100)).progress;
    p = claimAll(p, T0).progress;
    const again = claimAll(p, T0);
    expect(again.claimed).toEqual([]);
    expect(again.progress.rubies).toBe(100);
  });
  it('정렬: 오래된 순, 받은 것·만료된 것은 미수령 목록에서 빠짐', () => {
    let p = defaultProgress(T0);
    p = addGift(p, gift('new', 'gold', 1, T0 + 10)).progress;
    p = addGift(p, gift('old', 'gold', 1, T0)).progress;
    p = addGift(p, gift('exp', 'gold', 1, T0 + 5, T0 + DAY)).progress;
    expect(pendingGifts(p.mailbox, T0).map((g) => g.id)).toEqual(['old', 'exp', 'new']);
    expect(pendingGifts(p.mailbox, T0 + 2 * DAY).map((g) => g.id)).toEqual(['old', 'new']);
    expect(claimOne(p, 'exp', T0 + 2 * DAY)).toMatchObject({ ok: false, reason: 'expired' });
  });
  it('개봉권·범용 조각·골드·루비 지급과 수령 내역', () => {
    let p = defaultProgress(T0);
    const t0 = p.summon.legacyTickets;
    for (const g of [gift('t', 'tickets', 2), gift('u', 'universalFragments', 5)]) p = addGift(p, g).progress;
    p = claimAll(p, T0).progress;
    expect(p.summon.legacyTickets).toBe(t0 + 2);
    expect(p.universalFragments).toBe(5);
    expect(p.mailbox.history.map((h) => h.id)).toEqual(['u', 't']);
  });
  it('정리: 만료·오래 지난 수령 선물은 목록에서 빠져도 다시 만들어지지 않음', () => {
    let p = addGift(defaultProgress(T0), gift('x', 'gold', 1, T0, T0 + DAY)).progress;
    p = { ...p, mailbox: pruneMailbox(p.mailbox, T0 + 2 * DAY) };
    expect(p.mailbox.gifts).toHaveLength(0);
    expect(addGift(p, gift('x', 'gold', 1)).added).toBe(false);
  });
});

describe('운영자 캠페인(전체 보상)', () => {
  const c: Campaign = { id: 'launch', title: '출시 기념', kind: 'rubies', amount: 1000, startAt: T0, endAt: T0 + 7 * DAY, audience: 'all' };
  it('기간 안 접속 시 1번만 선물함에, 30일 만료', () => {
    const p = defaultProgress(T0 - DAY);
    const a = syncCampaigns(p, [c], T0 + 1000);
    expect(a.added).toHaveLength(1);
    expect(a.added[0]).toMatchObject({ id: 'campaign:launch', expiresAt: T0 + 1000 + 30 * DAY, sender: 'operator' });
    expect(syncCampaigns(a.progress, [c], T0 + 2000).added).toHaveLength(0);
    expect(syncCampaigns(p, [c], T0 - 1).added).toHaveLength(0); // 시작 전
    expect(syncCampaigns(p, [c], T0 + 8 * DAY).added).toHaveLength(0); // 끝난 뒤
  });
  it('기존 유저 한정: 캠페인 시작 뒤 만든 계정은 제외', () => {
    const ex = { ...c, audience: 'existing' as const };
    expect(syncCampaigns(defaultProgress(T0 - DAY), [ex], T0 + 1).added).toHaveLength(1);
    expect(syncCampaigns(defaultProgress(T0 + 10), [ex], T0 + 20).added).toHaveLength(0);
  });
});

describe('행동력 입장·저장', () => {
  it('부족하면 아무것도 바뀌지 않음', () => {
    const p = withStamina(defaultProgress(T0), 4);
    const r = spendStamina(p, STAMINA.entryCost, T0);
    expect(r.ok).toBe(false);
    expect(r.progress).toBe(p);
  });
  it('v3 저장 → v4: 행동력 40, 빈 선물함, 지난 최초 클리어는 접속 때 소급 1회(v2.0 확정)', () => {
    const v3 = { saveVersion: 3, gold: 50, rubies: 7, difficulty: { easy: { unlocked: [1, 2, 3], cleared: [1, 2], claimed: [] } } };
    const p = loadProgress(mem({ [SAVE_KEY]: JSON.stringify(v3) }));
    expect(p.saveVersion).toBe(4);
    expect(p.stamina.value).toBe(40);
    expect(p.mailbox.gifts).toEqual([]);
    expect(p.createdAt).toBe(0);
    expect(p.gold).toBe(50);
    const a = backfillClearGifts(p, T0);
    expect(a.added).toBe(2);
    expect(pendingGifts(a.progress.mailbox, T0).map((g) => g.id)).toEqual(['clear:easy:1', 'clear:easy:2']);
    // 다시 접속해도, 받은 뒤에도 다시 생기지 않음
    expect(backfillClearGifts(a.progress, T0 + 1).added).toBe(0);
    const c = claimOne(a.progress, 'clear:easy:1', T0).progress;
    expect(backfillClearGifts(pruneMailbox(c.mailbox, T0 + 30 * DAY) === c.mailbox ? c : { ...c, mailbox: pruneMailbox(c.mailbox, T0 + 30 * DAY) }, T0 + 30 * DAY).added).toBe(0);
  });
  it('v4 첫판(소급 없이 지급함 표시만 한 저장)도 한 번 고쳐서 소급', () => {
    const old = { ...defaultProgress(T0), difficulty: { ...defaultProgress(T0).difficulty, easy: { unlocked: [1, 2], cleared: [1], claimed: [] } } };
    const marked = { ...old, mailbox: { gifts: [], granted: ['clear:easy:1'], history: [] } };
    const p = loadProgress(mem({ [SAVE_KEY]: JSON.stringify(marked) }));
    const a = backfillClearGifts(p, T0);
    expect(a.added).toBe(1);
    expect(a.progress.mailbox.backfilled).toBe(true);
    expect(backfillClearGifts(a.progress, T0).added).toBe(0);
  });
  it('이미 받은 최초 클리어 선물은 소급 대상 아님(수령 내역 확인)', () => {
    let p = settleRun(defaultProgress(T0), 'r1', 100, 2, { stageId: 1, cleared: true, elapsedMs: 400_000, normalKills: 0, eliteKills: 0, difficulty: 'easy' }, T0).progress;
    p = withStamina(p, 10);
    p = claimOne(p, 'clear:easy:1', T0).progress;
    p = { ...p, mailbox: { ...p.mailbox, backfilled: false } };
    expect(backfillClearGifts(p, T0).added).toBe(0);
  });
  it('출시 기념 루비 1,000: 1회, 30일 만료, 시험 선물과 분리', () => {
    expect(activeCampaigns(false).map((c) => c.id)).toEqual(['launch-ruby-1000-v1']);
    expect(activeCampaigns(true).map((c) => c.id)).toContain('dev-ruby');
    const a = syncCampaigns(defaultProgress(T0), activeCampaigns(false), T0);
    expect(a.added).toHaveLength(1);
    expect(a.added[0]).toMatchObject({ kind: 'rubies', amount: 1000, expiresAt: T0 + 30 * DAY, title: 'Dragon Force 출시 기념 선물' });
    expect(syncCampaigns(a.progress, activeCampaigns(false), T0 + 1).added).toHaveLength(0);
    const c = claimOne(a.progress, 'campaign:launch-ruby-1000-v1', T0).progress;
    expect(c.rubies).toBe(defaultProgress(T0).rubies + 1000);
    expect(syncCampaigns(c, activeCampaigns(false), T0 + 40 * DAY).added).toHaveLength(0);
  });
  it('저장·불러오기 후에도 선물함·내역 유지(앱 종료 후 유지)', () => {
    const s = mem();
    let p = addGift(defaultProgress(T0), gift('r', 'rubies', 3)).progress;
    p = addGift(p, gift('g', 'gold', 9)).progress;
    p = claimOne(p, 'r', T0).progress;
    s.setItem(SAVE_KEY, JSON.stringify(p));
    const q = loadProgress(s);
    expect(q.mailbox.gifts.map((g) => [g.id, !!g.claimedAt])).toEqual([['r', true], ['g', false]]);
    expect(q.mailbox.history[0].id).toBe('r');
  });
});
