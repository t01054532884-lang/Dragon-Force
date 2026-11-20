import { describe, expect, it } from 'vitest';
import { compareText, rollOffer, synergyWith, UPGRADES } from '../src/data/upgrades';
import { xpToNext } from '../src/data/stats';
import { ENEMIES } from '../src/data/enemies';
import { pace, STAGES } from '../src/data/stages';

const byId = (id: string) => UPGRADES.find((u) => u.id === id)!;

describe('카드 조합 안내(2026-11-20 개선 6번)', () => {
  it('강화 전후 차이를 숫자로: 얼음 파편 Lv.1 → Lv.2 = 투사체 1개 → 2개', () => {
    expect(compareText(byId('ice'), 2)).toContain('투사체 1개 → 2개');
    expect(compareText(byId('breath'), 3)).toContain('범위 4.4m → 5.3m');
    expect(compareText(byId('reach'), 2)).toBe('공격 범위 +6% → +12%');
  });
  it('보유 스킬과 연계: 같은 태그가 가장 많이 겹치는 스킬', () => {
    const lv = new Map([['basic', 1], ['breath', 1]]);
    expect(synergyWith(byId('meteor'), lv)).toBe('화염 브레스'); // 화염·범위 둘 다 겹침
    expect(synergyWith(byId('reach'), lv)).toBe('화염 브레스'); // 범위
    expect(synergyWith(byId('amp'), lv)).toBe('화염 브레스'); // 액티브 강화
    expect(synergyWith(byId('wings'), lv)).toBe(null);
  });
  it('초반 두 번의 레벨업에는 새 액티브가 반드시 한 장', () => {
    for (let seed = 0; seed < 200; seed++) {
      let a = seed + 1;
      const rnd = () => ((a = (a * 16807) % 2147483647) / 2147483647);
      const first = rollOffer({ levels: new Map([['basic', 1]]), playerLevel: 2, basicEverOffered: false }, rnd);
      expect(first.some((u) => u.kind === 'active')).toBe(true);
    }
  });
});

describe('몬스터·성장 재조정(2026-11-20 개선 4번)', () => {
  it('가벼운 일반 몬스터는 초반 기본 공격(10) 2회, 공격력 +30% & 기본 공격 Lv.2면 1회', () => {
    for (const k of ['shadow_wolf', 'thorn_bug', 'forest_archer', 'rabid_wolf']) {
      const hp = ENEMIES[k].hp;
      expect(Math.ceil(hp / 10), k).toBe(2);
      expect(10 * 1.3 * 1.2 >= hp, k).toBe(true);
    }
    expect(ENEMIES.iron_boar.hp).toBe(26); // 무거운 적은 그대로
    expect(ENEMIES.shadow_wolf.contactDamage).toBe(8); // 공격력은 올리지 않음
    expect(ENEMIES.shadow_wolf.xp).toBe(2);
  });
  it('첫 레벨업 경험치 8·11·17, 그 뒤는 기존 공식', () => {
    expect([1, 2, 3, 4].map(xpToNext)).toEqual([8, 11, 17, 27]);
  });
  it('진행 구간: 초반 7분·중반 8.5분·후반 10분 제한, 보스 늦은 등장 3:40·4:30·5:30', () => {
    expect([1, 6, 15].map((s) => STAGES[s - 1].durationMs)).toEqual([420_000, 510_000, 600_000]);
    expect([1, 6, 15].map((s) => pace(s).bossSpawnMs)).toEqual([220_000, 270_000, 330_000]);
  });
});
