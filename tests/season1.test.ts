import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../src/data/enemies';
import { difficulty, pace, rankHpMult, STAGES } from '../src/data/stages';
import { SEASON1_STAGE_ROWS, chapterOf } from '../src/data/season1';
import { recommendedCp } from '../src/data/power';
import { DIFFICULTY_RELEASED } from '../src/data/economy';

describe('7단계 시즌 1 데이터', () => {
  it('1~20단계, 1단계는 기존 구성 그대로(잿빛 숲·늑대·멧돼지·월광송곳니·철갑어미·회색갈기)', () => {
    expect(STAGES.map((s) => s.id)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    const s1 = STAGES[0];
    expect(s1).toMatchObject({ name: '잿빛 숲', bossId: 'graymane_alpha', enemyPool: ['shadow_wolf', 'iron_boar'] });
    expect(s1.eliteSpawns.map((e) => e.eliteId)).toEqual(['moonfang_alpha', 'ironback_matriarch']);
    expect(s1.spawnTable).toBeUndefined(); // 1단계는 기존 생성 코드(시드 재현 보존)
  });
  it('2~20단계: 일반 3종 · 엘리트 2종 · 보스 1종(구간별 진행표 pace), 모든 적 정의·패턴 존재', () => {
    for (const s of STAGES.slice(1)) {
      expect(s.enemyPool).toHaveLength(3);
      expect(s.eliteSpawns.map((e) => e.timeMs)).toEqual(pace(s.id).elite);
      expect(s.bossSpawnMs).toBe(pace(s.id).bossSpawnMs);
      expect(s.waveKills).toEqual(pace(s.id).waveKills);
      for (const k of [...s.enemyPool, ...s.eliteSpawns.map((e) => e.eliteId), s.bossId]) expect(ENEMIES[k], `${s.id}단계 ${k}`).toBeDefined();
      const boss = ENEMIES[s.bossId];
      expect(boss.rank).toBe('boss');
      expect(boss.patterns!.length).toBeGreaterThanOrEqual(3);
      expect(boss.patterns2!.length).toBeGreaterThanOrEqual(3);
      for (const e of s.eliteSpawns) expect(ENEMIES[e.eliteId].rank).toBe('elite');
      expect(s.spawnTable!.reduce((a, t) => a + t.weight, 0)).toBe(100);
    }
    expect(SEASON1_STAGE_ROWS).toHaveLength(19);
  });
  it('소환·분신 대상도 정의돼 있음', () => {
    for (const d of Object.values(ENEMIES)) {
      if (d.summon) expect(ENEMIES[d.summon.kind]).toBeDefined();
      for (const p of [...(d.patterns ?? []), ...(d.patterns2 ?? [])]) if (p.t === 'summon') expect(ENEMIES[p.kind], p.kind).toBeDefined();
    }
  });
  it('엘리트 체력: 1:40 = 520, 3:40 = 850(1단계와 같은 틀)', () => {
    for (const s of STAGES.slice(1)) {
      expect(ENEMIES[s.eliteSpawns[0].eliteId].hp).toBe(520);
      expect(ENEMIES[s.eliteSpawns[1].eliteId].hp).toBe(850);
    }
  });
  it('적 체력 증가율 ×1.07/단계(1단계 ×1, 20단계 ≈ 3.62), 피해 공식은 기존 그대로', () => {
    expect(difficulty(1).hp).toBe(1);
    expect(difficulty(20).hp).toBeCloseTo(Math.pow(1.07, 19));
    expect(difficulty(20).hp).toBeCloseTo(3.617, 2);
    expect(difficulty(20).damage).toBeCloseTo(Math.pow(1.075, 19));
  });
  it('최종보스 배율(기존 규칙): 5단계 ×1.7 · 10·15단계 ×1.8 · 20단계 ×2.0, 그 외 ×1.3', () => {
    expect([5, 10, 15, 20, 2].map((id) => rankHpMult(STAGES[id - 1], 'boss'))).toEqual([1.7, 1.8, 1.8, 2.0, 1.3]);
  });
  it('챕터 5개 × 4단계', () => {
    expect([1, 4, 5, 8, 9, 13, 17, 20].map((s) => chapterOf(s).id)).toEqual([1, 1, 2, 2, 3, 4, 5, 5]);
  });
  it('권장 전투력 v1.3 임시표 900 → 2,500, 쉬움·어려움·매우 어려움 출시', () => {
    // 쉬움 1~5단계는 표 그대로, 6~20단계 ×1.2(2026-11-27 제작자)
    expect([1, 5, 6, 10, 15, 20].map((s) => recommendedCp(s, 'easy'))).toEqual([900, 1150, 1464, 1860, 2424, 3000]);
    expect(DIFFICULTY_RELEASED).toEqual({ easy: true, hard: true, extreme: true }); // 2026-11-21 어려움 · 2026-11-26 매우 어려움 출시
  });
});
