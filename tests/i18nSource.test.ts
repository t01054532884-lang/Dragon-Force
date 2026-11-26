import fs from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { setLang, tr } from '../src/i18n';

/**
 * 영어 모드에서 화면에 한글이 남지 않게(2026-11-26 제작자 제보 뒤 추가).
 * src 안의 한국어 문자열(주석 제외)을 scripts/i18n_extract.py와 같은 방식으로 모두 뽑아, 영어 모드로 번역했을 때
 * 한글이 남으면 실패한다 → 새 문장을 넣고 src/i18n/en.ts에 영어를 안 넣으면 여기서 잡힌다.
 * 템플릿 `${…}` 자리에는 숫자 12를 넣어 본다.
 */
const KO = /[가-힣]/;
const ROOT = path.resolve(__dirname, '..', 'src');

/** 화면에 나오지 않는 문자열(로그·정규식 바꾸기·한국어 모드 전용) 또는 자리 값이 숫자가 아닌 틀(따로 검사) */
const ALLOW = new Set<string>([
  '광고 준비 실패', // console.warn
  '$1 $2 감소', // 한국어 모드 전용 "피해 +15%" → "피해 15% 증가" 바꾸기
  '회', // 선물 단위(앞에 숫자가 붙어 "10회" → 번역 규칙이 처리)
  '발', '줄', // 전용 스킬 성장 단위(앞에 숫자가 붙어 "12발" → 번역 규칙이 처리, 2026-11-27)
  // 자리에 "2.0초"처럼 단위가 붙은 값이 들어가는 틀 — tests/i18nSkills.test.ts가 실제 문장으로 확인
  '{0}마다 앞쪽 부채꼴 화염 ({1})',
  '{0}마다 적 밀집 지점에 운석 ({1})',
  '{0}마다 주변 회오리, 적을 밀쳐냄 ({1})',
]);

function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'dev' || e.name === 'i18n') continue;
      yield* walk(p);
    } else if (p.endsWith('.ts') && !e.name.startsWith('gallery')) yield p;
  }
}

/** 문자열 리터럴(주석 제외). 템플릿은 `${…}`를 {0},{1}…로 */
function literals(src: string): string[] {
  const out: string[] = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (src.startsWith('//', i)) {
      const j = src.indexOf('\n', i);
      i = j < 0 ? n : j;
      continue;
    }
    if (src.startsWith('/*', i)) {
      const j = src.indexOf('*/', i + 2);
      i = j < 0 ? n : j + 2;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      out.push(src.slice(i + 1, j));
      i = j + 1;
      continue;
    }
    if (c === '`') {
      let j = i + 1;
      const parts: string[] = [];
      let buf = '';
      while (j < n && src[j] !== '`') {
        if (src[j] === '\\') {
          buf += src.slice(j, j + 2);
          j += 2;
          continue;
        }
        if (src.startsWith('${', j)) {
          let depth = 1;
          let k = j + 2;
          while (k < n && depth) {
            if (src[k] === '{') depth++;
            else if (src[k] === '}') depth--;
            else if (src[k] === '`') {
              const k2 = src.indexOf('`', k + 1);
              k = k2 > 0 ? k2 : k;
            }
            k++;
          }
          parts.push(buf);
          buf = '';
          j = k;
          continue;
        }
        buf += src[j];
        j++;
      }
      parts.push(buf);
      out.push(parts.map((p, idx) => (idx < parts.length - 1 ? `${p}{${idx}}` : p)).join(''));
      i = j + 1;
      continue;
    }
    i++;
  }
  return out.map((s) => s.replace(/\\n/g, '\n'));
}

afterAll(() => setLang('ko'));

describe('영어 모드: 소스의 한국어 문장이 모두 번역된다', () => {
  it('src 안 화면 문장(주석 제외)에 한글이 남지 않는다', () => {
    setLang('en');
    const miss: string[] = [];
    let count = 0;
    for (const f of walk(ROOT)) {
      for (const k of literals(fs.readFileSync(f, 'utf8'))) {
        if (!KO.test(k) || ALLOW.has(k)) continue;
        count++;
        const out = tr(k.replace(/\{\d+\}/g, '12'));
        if (KO.test(out)) miss.push(`${path.relative(ROOT, f).replace(/\\/g, '/')}: ${k} => ${out}`);
      }
    }
    expect(count).toBeGreaterThan(1000);
    expect(miss).toEqual([]);
  });
});
