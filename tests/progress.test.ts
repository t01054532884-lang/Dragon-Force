import { describe, expect, it } from 'vitest';
import { applyPermanent, computeRunGold, getUpgradeCost, stageGoldMult, type RunSummary } from '../src/data/progression';
import { BASE_STATS } from '../src/data/stats';
import {
  BACKUP_KEY, defaultProgress, LEGACY_UNLOCK_KEY, loadProgress, purchase, SAVE_KEY, saveProgress, settleRun, type Store,
} from '../src/systems/Progress';

const mem = (init: Record<string, string> = {}): Store & { data: Map<string, string> } => {
  const data = new Map(Object.entries(init));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};
const withGold = (gold: number) => ({ ...defaultProgress(), gold });

describe('비용 곡선 C(n) = ceil(50 × 1.2^(n−1))', () => {
  it('기획서 표와 일치', () => {
    const at = (n: number) => getUpgradeCost(n - 1);
    expect([1, 2, 3, 5, 10, 15, 20].map(at)).toEqual([50, 60, 72, 104, 258, 642, 1598]);
  });
  it('누적: 0→10 1,301G · 0→20 9,342G · 4종 만렙 21,286G', () => {
    const sum = (max: number) => Array.from({ length: max }, (_, i) => getUpgradeCost(i)).reduce((a, b) => a + b, 0);
    expect(sum(10)).toBe(1301);
    expect(sum(20)).toBe(9342);
    expect(sum(20) * 2 + sum(10) * 2).toBe(21286);
  });
});

describe('구매', () => {
  it('보유 49G, 비용 50G → 실패', () => {
    expect(purchase(withGold(49), 'attack')).toMatchObject({ ok: false, reason: 'gold' });
  });
  it('보유 50G, 비용 50G → 잔액 0G, Lv.1', () => {
    const r = purchase(withGold(50), 'attack');
    expect(r.ok && r.progress.gold).toBe(0);
    expect(r.ok && r.progress.upgrades.attack).toBe(1);
  });
  it('최대 레벨이면 구매 불가', () => {
    const p = { ...withGold(1e6), upgrades: { attack: 20, hp: 20, speed: 10, pickup: 10 } };
    for (const t of ['attack', 'hp', 'speed', 'pickup'] as const) expect(purchase(p, t)).toMatchObject({ ok: false, reason: 'max' });
  });
  it('연속 구매: 최신 상태로 검사하므로 골드가 음수가 되지 않음', () => {
    const s = mem();
    saveProgress(s, withGold(110));
    for (let i = 0; i < 5; i++) {
      const r = purchase(loadProgress(s), 'hp');
      if (r.ok) saveProgress(s, r.progress);
    }
    const p = loadProgress(s);
    expect(p.upgrades.hp).toBe(2); // 50 + 60
    expect(p.gold).toBe(0);
  });
});

describe('영구 강화 적용', () => {
  it('Lv.0은 4단계 기본 능력치와 완전히 같음', () => {
    expect(applyPermanent(BASE_STATS, defaultProgress().upgrades)).toEqual(BASE_STATS);
  });
  it('만렙: 공격력 +40% · HP +60% · 속도 +10% · 반경 +50%', () => {
    const s = applyPermanent(BASE_STATS, { attack: 20, hp: 20, speed: 10, pickup: 10 });
    expect(s.attack).toBeCloseTo(BASE_STATS.attack * 1.4);
    expect(s.maxHp).toBeCloseTo(BASE_STATS.maxHp * 1.6);
    expect(s.speed).toBeCloseTo(BASE_STATS.speed * 1.1);
    expect(s.magnet).toBeCloseTo(BASE_STATS.magnet * 1.5);
  });
});

describe('골드 정산', () => {
  const run = (o: Partial<RunSummary>): RunSummary => ({
    stageId: 1, durationMs: 480_000, outcome: 'clear', elapsedMs: 400_000,
    normalKills: 0, eliteKills: 0, bossKilled: true, treasureGold: 0, ...o,
  });
  it('클리어: 보스를 언제 잡든 생존 보상 160G로 동일', () => {
    const early = computeRunGold(run({ elapsedMs: 360_000 }));
    const late = computeRunGold(run({ elapsedMs: 449_000 }));
    expect(early.total).toBe(late.total);
    expect(early.total).toBe(30 + 160 + 50 + 100); // 340
  });
  it('클리어 범위 340~460G', () => {
    expect(computeRunGold(run({})).total).toBe(340);
    expect(computeRunGold(run({ normalKills: 2500, eliteKills: 2 })).total).toBe(460);
  });
  it('사망: 보물 더미 포함 총액의 50%', () => {
    const g = computeRunGold(run({ outcome: 'dead', bossKilled: false, elapsedMs: 125_000, normalKills: 245, eliteKills: 1, treasureGold: 20 }));
    // 30 + 40(4×30초) + 10(200마리) + 20 + 20 = 120 → 60
    expect(g.subtotal).toBe(120);
    expect(g.total).toBe(60);
  });
  it('30초 미만: 사망은 50%, 포기는 0G', () => {
    const dead = computeRunGold(run({ outcome: 'dead', bossKilled: false, elapsedMs: 20_000 }));
    const quit = computeRunGold(run({ outcome: 'quit', bossKilled: false, elapsedMs: 20_000 }));
    expect(dead.total).toBe(15);
    expect(quit.total).toBe(0);
  });
  it('30초 이상 포기: 50%', () => {
    expect(computeRunGold(run({ outcome: 'quit', bossKilled: false, elapsedMs: 61_000 })).total).toBe(25); // (30+20)/2
  });
  it('단계 배율을 곱한 뒤 최종 금액만 버림', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(stageGoldMult)).toEqual([1, 1.2, 1.4, 1.6, 1.8, 1.9, 2, 2]);
    const g = computeRunGold(run({ stageId: 2, outcome: 'dead', bossKilled: false, elapsedMs: 35_000, treasureGold: 20 }));
    // (30 + 10 + 20) × 1.2 × 0.5 = 36
    expect(g.total).toBe(36);
  });
});

describe('처치 보상(v1.3: 100마리당 5G, 최대 80G)', () => {
  const kills = (n: number) => computeRunGold({ stageId: 1, durationMs: 480_000, outcome: 'clear', elapsedMs: 400_000, normalKills: n, eliteKills: 0, bossKilled: true, treasureGold: 0 }).lines[2].gold;
  it('99 → 0G, 100 → 5G, 320 → 15G, 1,599 → 75G, 1,600 → 80G, 2,500 → 80G', () => {
    expect([99, 100, 320, 1599, 1600, 2500].map(kills)).toEqual([0, 5, 15, 75, 80, 80]);
  });
});

describe('시간 초과', () => {
  it('8분 생존 보상 160G를 넣고 전체에 50%', () => {
    const g = computeRunGold({ stageId: 1, durationMs: 480_000, outcome: 'timeout', elapsedMs: 480_016, normalKills: 2500, eliteKills: 2, bossKilled: false, treasureGold: 0 });
    // 30 + 160 + 80 + 40 = 310 → 155
    expect(g.subtotal).toBe(310);
    expect(g.total).toBe(155);
  });
});

describe('중복 정산 방지', () => {
  it('같은 전투 ID는 한 번만 지급', () => {
    const a = settleRun(defaultProgress(), 'run-1', 340);
    const b = settleRun(a.progress, 'run-1', 340);
    expect(a.paid).toBe(true);
    expect(b.paid).toBe(false);
    expect(b.progress.gold).toBe(340);
  });
});

describe('저장·복원', () => {
  it('저장 후 다시 읽으면 그대로(새로고침)', () => {
    const s = mem();
    const p = { ...withGold(123), upgrades: { attack: 3, hp: 2, speed: 1, pickup: 0 } };
    saveProgress(s, p);
    expect(loadProgress(s)).toMatchObject({ gold: 123, upgrades: p.upgrades });
  });
  it('첫 실행: 0G, 모든 강화 Lv.0', () => {
    expect(loadProgress(mem())).toEqual(defaultProgress());
  });
  it('음수 골드·범위 밖 레벨은 보정', () => {
    const s = mem({ [SAVE_KEY]: JSON.stringify({ saveVersion: 1, gold: -500, upgrades: { attack: 99, hp: -3 } }) });
    const p = loadProgress(s);
    expect(p.gold).toBe(0);
    expect(p.upgrades).toEqual({ attack: 20, hp: 0, speed: 0, pickup: 0 });
  });
  it('손상된 데이터: 원본 백업 후 기본값', () => {
    const s = mem({ [SAVE_KEY]: '{깨진 데이터' });
    expect(loadProgress(s)).toEqual(defaultProgress());
    expect(s.data.get(BACKUP_KEY)).toBe('{깨진 데이터');
  });
  it('이전 버전(4단계 해금 키만 있음): 해금 유지', () => {
    const s = mem({ [LEGACY_UNLOCK_KEY]: '2' });
    expect(loadProgress(s).unlockedStages).toEqual([1, 2]);
  });
  it('저장 시 4단계 해금 키도 함께 갱신(덮어써서 줄이지 않음)', () => {
    const s = mem({ [LEGACY_UNLOCK_KEY]: '2' });
    saveProgress(s, loadProgress(s));
    expect(s.data.get(LEGACY_UNLOCK_KEY)).toBe('2');
  });
});
