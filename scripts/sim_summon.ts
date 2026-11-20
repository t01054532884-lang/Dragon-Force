// 드래곤·스킬 상자 정수 수급 시뮬레이션(2026-11-21 종합 개선 기획서 4.1 "개발 전 확인").
// 실행: npx vite-node scripts/sim_summon.ts   — 실제 게임 규칙(openBox)을 그대로 돌린다.
import { defaultProgress, openBox } from '../src/systems/Progress';
import { DRAGON_ORDER } from '../src/data/dragons';

function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RUNS = 20000;
const per10: number[] = [];
const unlockedAfter: Record<number, number[]> = { 1: [], 3: [], 5: [], 10: [] };
const pullsToAll: number[] = [];
const dist: Record<number, number> = {};
for (let s = 1; s <= RUNS; s++) {
  const rnd = seeded(s);
  let p = { ...defaultProgress(0), rubies: 1e9 };
  let essences = 0;
  let tens = 0;
  let allAt = 0;
  while (tens < 60) {
    const r = openBox(p, 'dragon', 10, 'ruby', rnd);
    if (!r.ok) throw new Error('fail');
    p = r.progress;
    tens++;
    const e = r.results.filter((x) => x.kind === 'essence').length;
    if (tens === 1) {
      per10.push(e);
      dist[e] = (dist[e] ?? 0) + 1;
    }
    essences += e;
    const owned = DRAGON_ORDER.filter((id) => p.dragons[id].unlocked).length;
    if (unlockedAfter[tens]) unlockedAfter[tens].push(owned);
    if (!allAt && owned === DRAGON_ORDER.length) allAt = tens;
  }
  pullsToAll.push(allAt || 61);
  void essences;
}
const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const pct = (a: number[], q: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * q)];
console.log('첫 10회 정수 평균', avg(per10).toFixed(2), '분포', Object.fromEntries(Object.entries(dist).map(([k, v]) => [k, `${((v / RUNS) * 100).toFixed(1)}%`])));
for (const k of [1, 3, 5, 10]) console.log(`10회 × ${k} 뒤 보유 드래곤(레드 포함) 평균`, avg(unlockedAfter[k]).toFixed(2));
console.log('10종 모두 보유까지 10회 묶음 수 — 중앙값', pct(pullsToAll, 0.5), '· 90%', pct(pullsToAll, 0.9));
