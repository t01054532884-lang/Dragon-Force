import { describe, expect, it } from 'vitest';
import { accountLevel, accountXp, xpToNext } from '../src/systems/AccountLevel';

const life = (runs: number, clears: number, elites = 0, kills = 0) => ({ lifetime: { runs, clears, eliteKills: elites, normalKills: kills } });

describe('계정 레벨(평생 기록에서 계산)', () => {
  it('새 계정은 Lv.1', () => expect(accountLevel(life(0, 0)).level).toBe(1));
  it('경험치: 클리어 100 · 실패 30 · 엘리트 10 · 일반 10마리당 1', () => {
    expect(accountXp(life(3, 1, 2, 95))).toBe(100 + 2 * 30 + 20 + 9);
  });
  it('필요 경험치 100, 150, 200… 경계에서 올라감', () => {
    expect(accountLevel(life(1, 1)).level).toBe(2); // 100
    expect(accountLevel(life(3, 2)).level).toBe(2); // 230 < 250
    const r = accountLevel(life(4, 2, 0, 0)); // 260
    expect(r).toMatchObject({ level: 3, xp: 10, need: xpToNext(3) });
  });
});
