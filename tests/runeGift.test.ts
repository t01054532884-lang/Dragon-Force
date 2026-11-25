import { describe, expect, it } from 'vitest';
import { defaultProgress } from '../src/systems/Progress';
import { backfillClearGifts } from '../src/systems/Progress';
import { claimOne, grantRuneMilestoneGift, runeGiftId } from '../src/systems/Mailbox';

describe('10·20단계 클리어 룬 상자 10회권(2026-11-26)', () => {
  it('쉬움·어려움 10·20단계만, 한 번만 선물함에', () => {
    const p = defaultProgress(0);
    expect(grantRuneMilestoneGift(p, 'easy', 9, '쉬움 9단계', 1).added).toBe(false);
    expect(grantRuneMilestoneGift(p, 'normal', 10, '보통 10단계', 1).added).toBe(false);
    const a = grantRuneMilestoneGift(p, 'easy', 10, '쉬움 10단계', 1);
    expect(a.added).toBe(true);
    expect(a.progress.mailbox.gifts.find((g) => g.id === runeGiftId('easy', 10))).toMatchObject({ kind: 'runeTickets', amount: 10 });
    expect(grantRuneMilestoneGift(a.progress, 'easy', 10, '쉬움 10단계', 2).added).toBe(false);
  });
  it('받으면 룬 상자 개봉권 +10', () => {
    const a = grantRuneMilestoneGift(defaultProgress(0), 'hard', 20, '어려움 20단계', 1).progress;
    const before = a.summon.runeTickets ?? 0;
    const r = claimOne(a, runeGiftId('hard', 20), 2);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.progress.summon.runeTickets).toBe(before + 10);
  });
  it('이미 10·20단계를 깬 계정은 접속 때 소급으로 받는다', () => {
    const p0 = defaultProgress(0);
    const p = { ...p0, difficulty: { ...p0.difficulty, easy: { ...p0.difficulty.easy, cleared: Array.from({ length: 20 }, (_, i) => i + 1) } } };
    const b = backfillClearGifts(p, 5).progress;
    expect(b.mailbox.granted).toEqual(expect.arrayContaining([runeGiftId('easy', 10), runeGiftId('easy', 20)]));
    expect(b.mailbox.granted).not.toContain(runeGiftId('hard', 10));
  });
});
