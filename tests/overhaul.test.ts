import { describe, expect, it } from 'vitest';
import { sigGrowth, sigGrowthLines, sigTier } from '../src/data/signature';
import { DRAGON_ORDER } from '../src/data/dragons';
import { achievementProgress, addMissionProgress, claimAllMissions, claimableMissions, defaultProgress } from '../src/systems/Progress';

const NOW = Date.parse('2026-11-21T03:00:00Z');

describe('전용 스킬 성장(2026-11-21 기획서 3.4)', () => {
  it('드래곤 영구 레벨 10·20·30에서 한 단계씩', () => {
    expect([1, 9, 10, 19, 20, 29, 30, 40].map(sigTier)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
  it('피해는 단계당 +8%만, 나머지는 전투 방식(범위·개수·남는 시간) 변화', () => {
    for (const id of DRAGON_ORDER) {
      expect(sigGrowth(id, 0).dmg).toBe(1);
      expect(sigGrowth(id, 3).dmg).toBeCloseTo(1.24);
    }
    expect([0, 1, 2, 3].map((t) => sigGrowth('wind', t).count)).toEqual([2, 3, 4, 5]); // 바람 칼날 2 → 5
    expect([0, 1, 2, 3].map((t) => sigGrowth('red', t).lingerMs)).toEqual([3000, 4000, 5000, 6000]); // 남는 불길
    expect([0, 1, 2, 3].map((t) => sigGrowth('black', t).count)).toEqual([1, 2, 2, 3]); // 그림자 분신 빔
  });
  it('드래곤 화면 "현재 → 다음"이 실제로 달라진다(10종)', () => {
    for (const id of DRAGON_ORDER) {
      const a = sigGrowthLines(id, 0);
      const b = sigGrowthLines(id, 1);
      expect(Object.keys(b).some((k) => a[k] !== b[k]), id).toBe(true);
    }
  });
});

describe('미션 모두 받기·업적 진행(2026-11-21 기획서 9·11장)', () => {
  it('완료한 미션을 한 번에 받는다(카드도 무작위라 같이, 2026-11-25)', () => {
    let p = defaultProgress(NOW);
    p = addMissionProgress(p, { clears: 10, normalKills: 300, eliteKills: 15 }, NOW);
    expect(claimableMissions(p, NOW).map((m) => m.id).sort()).toEqual(['d-clear', 'd-elite', 'd-kills', 'w-clear', 'w-elite'].sort()); // 2026-11-21 일일 미션 5개(엘리트 3마리 포함)
    const r = claimAllMissions(p, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.got.map((m) => m.id).sort()).toEqual(['d-clear', 'd-elite', 'd-kills', 'w-clear', 'w-elite']);
    expect(r.left).toBe(0);
    expect(r.cards).toEqual([{ dragonId: 'red', count: 1 }, { dragonId: 'red', count: 5 }]); // 레드만 보유 → 레드
    expect(r.fragments).toHaveLength(1);
    expect(r.progress.dragons[r.fragments[0].dragonId].fragments).toBe(p.dragons[r.fragments[0].dragonId].fragments + 10);
    expect(r.progress.gold).toBe(p.gold + 300);
    // 두 번 받으면 실패(중복 지급 없음)
    expect(claimAllMissions(r.progress, NOW).ok).toBe(false);
  });
  it('업적 진행: 1,000마리 목표는 그대로, 현재 값과 달성 여부', () => {
    const p = { ...defaultProgress(NOW), lifetime: { ...defaultProgress(NOW).lifetime, normalKills: 640 } };
    const k = achievementProgress(p).find((a) => a.id === 'kills-1000')!;
    expect(k).toMatchObject({ cur: 640, goal: 1000, done: false });
  });
});
