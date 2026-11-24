import { afterAll, describe, expect, it } from 'vitest';
import { EN } from '../src/i18n/en';
import { setLang, tr } from '../src/i18n';

// 영어 버전(2026-11-25): 한국어 문장이 영어 모드에서 한국어 없이 나오는지
const KO = /[가-힣]/;
afterAll(() => setLang('ko'));

describe('영어 사전', () => {
  it('한국어 모드는 아무것도 바꾸지 않는다', () => {
    setLang('ko');
    expect(tr('전투 시작')).toBe('전투 시작');
  });
  it('사전의 모든 문장(자리에 숫자를 넣어)이 영어 모드에서 한국어 없이 나온다', () => {
    setLang('en');
    const left: string[] = [];
    for (const k of Object.keys(EN)) {
      const s = k.replace(/\{\d+\}/g, '12');
      const out = tr(s);
      if (KO.test(out)) left.push(`${s} => ${out}`);
    }
    // 번역값 자체에 한국어가 남은 경우만 실패(자리 틀이 다른 문장을 잘못 잡는 일은 따로 본다)
    expect(left.slice(0, 15)).toEqual([]);
  });
  it('조합된 문장: 자리 안의 한국어도 번역(설정·보상·이름)', () => {
    setLang('en');
    for (const s of ['효과음 켜짐 · 배경 음악 꺼짐', '레드 드래곤', '전투 시작', '선물함', '받을 선물이 없어요']) {
      const out = tr(s);
      expect(out, s).not.toMatch(KO);
    }
  });
  it('자리({0})는 원문과 번역에서 수가 같다', () => {
    for (const [k, v] of Object.entries(EN)) {
      const a = (k.match(/\{\d+\}/g) ?? []).sort().join();
      const b = (v.match(/\{\d+\}/g) ?? []).sort().join();
      expect(b, k).toBe(a);
    }
  });
});
