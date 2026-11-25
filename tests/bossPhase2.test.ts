import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';

import { SEASON1_ENEMIES, SEASON1_STAGE_ROWS } from '../src/data/season1';
import { BOSS_P2, BOSS_P2_ART } from '../src/data/bossPhase2';

describe('보스 2페이즈(2026-11-25)', () => {
  it('2~20단계 보스는 모두 2페이즈 전용 공격이 2페이즈 목록 맨 앞에 있고, 1페이즈 목록에는 없다', () => {
    for (const [, , , , boss] of SEASON1_STAGE_ROWS) {
      const p = BOSS_P2[boss];
      expect(p?.move, boss).toBeTruthy();
      const d = SEASON1_ENEMIES[boss];
      expect(d.patterns2?.[0], boss).toBe(p.move);
      expect(d.patterns?.includes(p.move!), boss).toBe(false);
    }
  });

  it('1~20단계 보스 모두 2페이즈 그림 파일이 있다', () => {
    for (let s = 1; s <= 20; s++) {
      const tex = BOSS_P2_ART[s];
      expect(tex, `${s}단계`).toBeTruthy();
      expect(existsSync(`public/art/enemy/art-${tex}-p2.webp`), tex).toBe(true);
    }
    // 단계 표의 보스와 그림 이름이 맞는다
    for (const [stage, , , , boss] of SEASON1_STAGE_ROWS) expect(BOSS_P2_ART[stage]).toBe(SEASON1_ENEMIES[boss].texture);
  });
});
