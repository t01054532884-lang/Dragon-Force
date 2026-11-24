import type Phaser from 'phaser';
import { EN } from './en';

/**
 * 영어 버전(2026-11-25 제작자 결정: 해외 이용자도 쓸 수 있게).
 * 코드 곳곳의 한국어 문장을 하나하나 바꾸지 않고, **화면에 글자를 그리는 순간(Phaser Text.setText)** 영어 사전으로 바꾼다.
 * - 사전 `en.ts`: 한국어 원문 → 영어. 원문은 소스의 문자열 그대로, 템플릿 `${…}` 자리는 {0},{1}…(영어에서 순서를 바꿔도 됨)
 * - 찾는 순서: ① 원문 그대로 ② 틀({0} 자리에 숫자·이름이 들어간 문장) — 자리에 들어간 값도 다시 번역
 *   ③ 줄(\n)·구분자(" · ", " — ")로 나눠 조각마다 ④ 남은 한국어 낱말(이름 등)만 바꿈
 * - 한국어 모드면 아무것도 하지 않는다(지금 동작 그대로).
 * 새 문장을 추가하면 `npm run i18n:check`로 사전에 없는 문장을 확인한다(scripts/i18n_check.mjs).
 */
export type Lang = 'ko' | 'en';
let lang: Lang = 'ko';
export const getLang = (): Lang => lang;
export function setLang(l: Lang): void {
  lang = l;
  cache.clear();
}

const KO = /[가-힣]/;
const cache = new Map<string, string>();

interface Tpl {
  re: RegExp;
  /** 같은 틀의 욕심쟁이 버전(앞 자리를 길게) — 짧게 잡은 결과에 한국어가 남으면 이쪽도 시도 */
  reG: RegExp;
  value: string;
  /** 원문 안 가장 긴 고정 글자(빠른 거르기) */
  probe: string;
  weight: number;
}
let tpls: Tpl[] | null = null;
let words: [string, string][] | null = null;

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function build(): void {
  tpls = [];
  words = [];
  for (const [k, v] of Object.entries(EN)) {
    if (/\{\d+\}/.test(k)) {
      const parts = k.split(/\{(\d+)\}/);
      // parts: [글자, 번호, 글자, 번호, 글자 …]
      let src = '^';
      let srcG = '^';
      const order: number[] = [];
      let probe = '';
      let weight = 0;
      for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 0) {
          src += esc(parts[i]);
          srcG += esc(parts[i]);
          weight += parts[i].length;
          if (parts[i].length > probe.length) probe = parts[i];
        } else {
          order.push(Number(parts[i]));
          src += '([\\s\\S]*?)';
          srcG += '([\\s\\S]*)';
        }
      }
      src += '$';
      srcG += '$';
      if (weight === 0) continue; // 글자 없이 자리뿐인 틀은 쓰지 않음
      // 캡처 순서 → 원래 번호로 다시 맞추기 위해 값 안의 {n}을 캡처 순서 기준으로 바꿔 둔다
      let value = v;
      order.forEach((n, idx) => {
        value = value.split(`{${n}}`).join(`\u0000${idx}\u0000`);
      });
      tpls.push({ re: new RegExp(src), reG: new RegExp(srcG), value, probe, weight });
    } else if (k.length >= 2 && k.length <= 24 && !k.includes('\n')) {
      words.push([k, v]);
    }
  }
  tpls.sort((a, b) => b.weight - a.weight);
  words.sort((a, b) => b[0].length - a[0].length);
}

function viaTemplate(s: string): string | null {
  for (const t of tpls!) {
    if (t.probe && !s.includes(t.probe)) continue;
    const m = t.re.exec(s);
    if (!m) continue;
    const fill = (mm: RegExpExecArray) => {
      let out = t.value;
      for (let i = 1; i < mm.length; i++) out = out.split(`\u0000${i - 1}\u0000`).join(translate(mm[i]));
      return out;
    };
    const a = fill(m);
    if (!KO.test(a)) return a;
    // 자리 경계를 다르게(앞 자리를 길게) 잡아 보고, 한국어가 덜 남는 쪽
    const mg = t.reG.exec(s);
    if (!mg) return a;
    const b = fill(mg);
    const ko = (x: string) => (x.match(/[가-힣]/g) ?? []).length;
    return ko(b) < ko(a) ? b : a;
  }
  return null;
}

const SEPS = ['\n', ' · ', ' — ', ' / ', ', '];

/** 숫자 뒤 한국어 단위 → 영어(사전에 없는 조합 문장의 마지막 정리) */
function units(t: string): string {
  return t
    .replace(/(\d)\s?초/g, '$1s')
    .replace(/(\d)\s?분/g, '$1 min')
    .replace(/(\d)\s?시간/g, '$1h')
    .replace(/(\d)\s?일/g, '$1d')
    .replace(/(\d)\s?(개|마리|장|자루|송이|겹)/g, '$1')
    .replace(/(\d)\s?회/g, '$1x')
    .replace(/(\d)\s?단계/g, 'Stage $1');
}

function translate(s: string): string {
  if (!s || !KO.test(s)) return s;
  const hit = cache.get(s);
  if (hit !== undefined) return hit;
  if (!tpls) build();
  let out: string | undefined = EN[s];
  if (out === undefined) {
    const lead = s.match(/^\s*/)![0];
    const tail = s.match(/\s*$/)![0];
    const core = s.trim();
    if (core !== s && EN[core] !== undefined) out = lead + EN[core] + tail;
  }
  if (out === undefined) out = viaTemplate(s) ?? undefined;
  if (out === undefined) {
    for (const sep of SEPS) {
      if (s.includes(sep)) {
        out = s.split(sep).map(translate).join(sep);
        break;
      }
    }
  }
  if (out === undefined) {
    // 마지막: 아는 낱말(이름·용어)만 바꾸고, 숫자 뒤 단위(초·분·일·개…)를 영어로
    let t = s;
    for (const [k, v] of words!) if (t.includes(k)) t = t.split(k).join(v);
    out = units(t);
  }
  if (cache.size > 6000) cache.clear();
  cache.set(s, out);
  // 개발 서버: 번역이 덜 된 문장을 모아 둔다(콘솔에서 window.__i18nMiss) — 사전 보충용
  if (import.meta.env.DEV && KO.test(out) && typeof window !== 'undefined') {
    const w = window as unknown as { __i18nMiss?: Set<string> };
    (w.__i18nMiss ??= new Set()).add(s);
  }
  return out;
}

/** 화면 글자 번역(영어 모드에서만) */
export function tr(s: string): string {
  return lang === 'en' ? translate(s) : s;
}

/** 게임을 만들기 전에 한 번: 모든 Phaser 글자가 그려질 때 번역되게 */
export function installTextTranslation(P: typeof Phaser): void {
  const proto = P.GameObjects.Text.prototype as unknown as { setText: (v: string | string[]) => unknown; __i18n?: boolean };
  if (proto.__i18n) return;
  proto.__i18n = true;
  const orig = proto.setText;
  proto.setText = function (this: unknown, v: string | string[]) {
    if (lang === 'en' && v != null) v = Array.isArray(v) ? v.map((x) => translate(String(x))) : translate(String(v));
    return orig.call(this, v);
  };
}
