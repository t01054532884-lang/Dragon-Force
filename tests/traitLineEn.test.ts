import { afterAll, describe, expect, it } from 'vitest';
import { DRAGON_ORDER, traitLine } from '../src/data/dragons';
import { setLang, tr } from '../src/i18n';

// 1.0.5: 드래곤 화면 고유 특성 줄 — 별 1~5개 모두 영어에서 한국어가 남지 않는다(4성 이상 "(승급 강화 ×2)" 틀 깨짐 수정)
const KO = /[가-힣]/;
afterAll(() => setLang('ko'));

describe('고유 특성 줄 영어', () => {
  it('24종 × 별 1~5 모두 한국어 없이, "Trait:"로 시작', () => {
    setLang('en');
    const bad: string[] = [];
    for (const id of DRAGON_ORDER) {
      for (let stars = 1; stars <= 5; stars++) {
        const out = tr(traitLine(id, stars));
        if (KO.test(out) || !out.startsWith('Trait: ')) bad.push(`${id} ${stars}★ ${out}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('승급 강화 꼬리가 영어로 붙는다', () => {
    setLang('en');
    expect(tr(traitLine('bahamut', 5))).toBe('Trait: +5% damage each consecutive breath hit on the same enemy (up to 5) (Star Up bonus ×2)');
    expect(tr(traitLine('red', 3))).toMatch(/\(inactive at 1–4★\)$/);
    expect(tr(traitLine('red', 5))).toMatch(/\(active\)$/);
  });
  it('웨이브 안내는 필살기 버튼에 안 닿게 짧게', () => {
    setLang('en');
    expect(tr('엘리트를 쓰러뜨리면 다음 웨이브').length).toBeLessThanOrEqual(28);
  });
});
