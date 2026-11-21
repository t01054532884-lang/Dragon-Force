import { describe, expect, it } from 'vitest';
import { decideSync, readMeta, summarize, summaryLine, type CloudMeta } from '../src/systems/cloudSync';
import { defaultProgress } from '../src/systems/Progress';

// 클라우드 저장 1단계(docs/CLOUD.md): 자동 덮어쓰기·합산 금지 규칙
describe('클라우드 저장 판단', () => {
  const m = (rev: number, dirty = false, uid = 'u1'): CloudMeta => ({ uid, rev, dirty, syncedAt: 0 });

  it('서버에 기록이 없으면 이 기기 저장을 올린다(기존 기기 저장 이전)', () => {
    expect(decideSync(null, 'u1', null, true)).toBe('upload');
    expect(decideSync(m(3), 'u1', null, false)).toBe('upload');
  });
  it('이 기기가 맞춘 적 없는데 서버에 기록이 있으면 고르기', () => {
    expect(decideSync(null, 'u1', { rev: 2 }, true)).toBe('choose');
    expect(decideSync(m(2, false, 'other'), 'u1', { rev: 2 }, false)).toBe('choose');
  });
  it('같은 버전: 이 기기 변경만 올림', () => {
    expect(decideSync(m(4), 'u1', { rev: 4 }, false)).toBe('none');
    expect(decideSync(m(4, true), 'u1', { rev: 4 }, true)).toBe('upload');
  });
  it('서버가 앞섬: 이 기기가 그대로면 받고, 바뀌었으면 고르기', () => {
    expect(decideSync(m(4), 'u1', { rev: 6 }, false)).toBe('download');
    expect(decideSync(m(4, true), 'u1', { rev: 6 }, true)).toBe('choose');
  });
  it('서버 버전이 더 낮으면(서버 기록 재생성) 고르기', () => {
    expect(decideSync(m(9), 'u1', { rev: 1 }, false)).toBe('choose');
  });
  it('손상된 기억은 처음으로', () => {
    expect(readMeta('{bad')).toBeNull();
    expect(readMeta(JSON.stringify({ uid: 'a', rev: 2, dirty: 1, syncedAt: 5 }))).toEqual({ uid: 'a', rev: 2, dirty: true, syncedAt: 5 });
  });
  it('요약 한 줄', () => {
    const p = { ...defaultProgress(0), gold: 12300, rubies: 540 };
    const s = summarize(p, 0);
    expect(s.dragons).toBe(1);
    expect(summaryLine(s)).toBe('쉬움 1단계 · 드래곤 1 · 골드 12,300 · 루비 540');
  });
});
