import { describe, expect, it } from 'vitest';
import { WINTER_2026 as EV, WINTER_DRAGON } from '../src/data/events';
import { DRAGONS } from '../src/data/dragons';
import {
  claimAttendance, defaultProgress, eventActive, eventRng, eventState, loadProgress, pickRoulette, SAVE_KEY, saveProgress, settleRun, spinRoulette,
  spinsAvailable, type PlayerProgress, type RunRecord, type Store,
} from '../src/systems/Progress';

const KST = (s: string) => Date.parse(`${s}+09:00`);
const DEC5 = KST('2026-12-05T12:00:00');
const mem = (): Store => {
  const d = new Map<string, string>();
  return { getItem: (k) => d.get(k) ?? null, setItem: (k, v) => void d.set(k, v) };
};
const run = (o: Partial<RunRecord> = {}): RunRecord => ({ stageId: 1, cleared: false, elapsedMs: 120_000, normalKills: 50, eliteKills: 0, dragonId: 'red', outcome: 'dead', ...o });
/** 이벤트 전투 n판 정산 */
const battles = (p: PlayerProgress, n: number, o: Partial<RunRecord> = {}, now = DEC5, tag = 'b') => {
  let q = p;
  for (let i = 0; i < n; i++) q = settleRun(q, `${tag}${i}`, 10, undefined, run(o), now).progress;
  return q;
};

describe('겨울 축제 기간(KST, 끝 시각 제외)', () => {
  it('12/1 00:00 시작 ~ 1/1 00:00 직전까지', () => {
    expect(eventActive(KST('2026-11-30T23:59:59'))).toBe(false);
    expect(eventActive(KST('2026-12-01T00:00:00'))).toBe(true);
    expect(eventActive(KST('2026-12-31T23:59:59'))).toBe(true);
    expect(eventActive(KST('2027-01-01T00:00:00'))).toBe(false);
  });
});

describe('행운 룰렛 진행', () => {
  it('정상 종료(클리어·사망·시간 초과) + 60초 이상만 1판, 5판마다 1회', () => {
    let p = battles(defaultProgress(), 2, { outcome: 'clear', cleared: true }, DEC5, 'c');
    p = battles(p, 2, { outcome: 'timeout' }, DEC5, 't');
    p = battles(p, 1, { outcome: 'dead' }, DEC5, 'd');
    expect(eventState(p).battles).toBe(5);
    expect(spinsAvailable(eventState(p))).toBe(1);
  });
  it('자발적 포기·60초 미만·이벤트 기간 밖은 세지 않음', () => {
    let p = battles(defaultProgress(), 3, { outcome: 'quit' }, DEC5, 'q');
    p = battles(p, 3, { elapsedMs: 59_999 }, DEC5, 's');
    p = battles(p, 3, {}, KST('2026-11-30T12:00:00'), 'n');
    expect(p.events[EV.id]?.battles ?? 0).toBe(0);
  });
  it('같은 전투(같은 runId)는 한 번만', () => {
    let p = settleRun(defaultProgress(), 'same', 10, undefined, run(), DEC5).progress;
    p = settleRun(p, 'same', 10, undefined, run(), DEC5).progress;
    expect(eventState(p).battles).toBe(1);
  });
});

describe('룰렛 추첨', () => {
  it('설정 확률 합 100%, 루비 기대값 19.2 → 30회 576', () => {
    expect(EV.roulette.reduce((a, r) => a + r.weight, 0)).toBe(100);
    const ev = EV.roulette.reduce((a, r) => a + (r.rubies ?? 0) * (r.weight / 100), 0);
    expect(ev).toBeCloseTo(19.2);
    expect(ev * 30).toBeCloseTo(576);
  });
  it('겨울 축제 드래곤 = 워터(영웅): 정수 2% · 조각 5개 칸 4개(각 5%) · 루비 78%', () => {
    expect(WINTER_DRAGON).toBe('blue');
    expect(DRAGONS[WINTER_DRAGON].rarity).toBe('epic');
    const frag = EV.roulette.filter((r) => r.fragments);
    expect(frag.map((r) => [r.fragments, r.weight])).toEqual([[5, 5], [5, 5], [5, 5], [5, 5]]);
    expect(EV.roulette.filter((r) => r.dragonEssence).map((r) => r.weight)).toEqual([2]);
    expect(EV.roulette.filter((r) => r.rubies).reduce((a, r) => a + r.weight, 0)).toBe(78);
    expect(EV.roulette.some((r) => r.essence)).toBe(false); // 예전 희귀·영웅 정수 상자 칸은 없음
  });
  it('조각 칸은 워터 조각 +5, 정수 칸은 없으면 해금·있으면 조각 +50', () => {
    // 칸마다 그 칸이 나오는 시드를 찾아 돌린다
    const findSeed = (pred: (id: string) => boolean) => {
      for (let s = 1; s < 100_000; s++) if (pred(pickRoulette(eventRng(s, 0)()).id)) return s;
      throw new Error('seed');
    };
    const withSeed = (p: PlayerProgress, seed: number) => ({ ...p, events: { ...p.events, [EV.id]: { ...eventState(p), seed } } });
    const base = battles(defaultProgress(), 5);
    const fragSeed = findSeed((id) => id.startsWith('frag'));
    const a = spinRoulette(withSeed(base, fragSeed), DEC5);
    if (!a.ok) throw new Error(a.reason);
    expect(a.fragments).toEqual({ dragonId: 'blue', count: 5 });
    expect(a.progress.dragons.blue.fragments).toBe(base.dragons.blue.fragments + 5);
    expect(a.progress.rubies).toBe(base.rubies);

    const essSeed = findSeed((id) => id === 'essence');
    const b = spinRoulette(withSeed(base, essSeed), DEC5);
    if (!b.ok) throw new Error(b.reason);
    expect(base.dragons.blue.unlocked).toBe(false);
    expect(b.essence).toEqual({ dragonId: 'blue', isNew: true, fragments: 0 });
    expect(b.progress.dragons.blue.unlocked).toBe(true);

    const owned = { ...base, dragons: { ...base.dragons, blue: { ...base.dragons.blue, unlocked: true } } };
    const c = spinRoulette(withSeed(owned, essSeed), DEC5);
    if (!c.ok) throw new Error(c.reason);
    expect(c.essence).toEqual({ dragonId: 'blue', isNew: false, fragments: 50 });
    expect(c.progress.dragons.blue.fragments).toBe(owned.dragons.blue.fragments + 50);
  });
  it('100만 회: 각 칸이 설정 확률 ±3% 안(난수 경계 검증)', () => {
    const count: Record<string, number> = {};
    let seed = 12345;
    const N = 1_000_000;
    for (let i = 0; i < N; i++) {
      const r = eventRng(seed, i)();
      const k = pickRoulette(r).id;
      count[k] = (count[k] ?? 0) + 1;
    }
    for (const r of EV.roulette) expect(Math.abs(count[r.id] / N - r.weight / 100) / (r.weight / 100)).toBeLessThan(0.03);
    seed++;
  });
  it('같은 시드·같은 회차면 같은 결과(다시 시도해도 안 바뀜)', () => {
    const p = battles(defaultProgress(), 5);
    const a = spinRoulette(p, DEC5);
    const b = spinRoulette(p, DEC5);
    expect(a.ok && b.ok && a.reward.id === b.reward.id).toBe(true);
    if (!a.ok) return;
    expect(spinRoulette(a.progress, DEC5)).toMatchObject({ ok: false, reason: 'spins' });
  });
  it('정수 확정 상자는 소환 천장 카운터를 바꾸지 않음, 루비는 이벤트 뒤에도 남음', () => {
    let p = battles({ ...defaultProgress(), summon: { tenPity: 4, legendaryPity: 33, legacyTickets: 5, totalOpens: 9 } }, 150);
    for (let i = 0; i < 30; i++) {
      const r = spinRoulette(p, DEC5);
      if (!r.ok) throw new Error(r.reason);
      p = r.progress;
    }
    expect(p.summon).toEqual({ tenPity: 4, legendaryPity: 33, legacyTickets: 5, totalOpens: 9 });
    const s = mem();
    saveProgress(s, p);
    const after = loadProgress(s); // 이벤트가 끝난 뒤 다시 열어도
    expect(after.rubies).toBe(p.rubies);
    expect(spinRoulette(after, KST('2027-01-01T00:00:00'))).toMatchObject({ ok: false, reason: 'ended' });
  });
});

describe('룰렛 누적 보상', () => {
  it('5·10·20·30회 도달 때 한 번씩: 루비 100+200+400+700 = 1,400 + 영웅 정수 1', () => {
    let p = battles(defaultProgress(), 150);
    let milestoneRubies = 0;
    let epic = 0;
    const got: number[] = [];
    for (let i = 0; i < 30; i++) {
      const r = spinRoulette(p, DEC5);
      if (!r.ok) throw new Error();
      p = r.progress;
      if (r.milestone) {
        got.push(r.milestone.spins);
        milestoneRubies += r.milestone.rubies;
        if (r.milestone.essence) epic++;
      }
    }
    expect(got).toEqual([5, 10, 20, 30]);
    expect(milestoneRubies).toBe(1400);
    expect(epic).toBe(1);
    expect(eventState(p).milestones).toEqual([5, 10, 20, 30]);
  });
});

describe('크리스마스 출석(12/18~12/31 2주, 달력 기준 — 2026-11-25)', () => {
  it('14일 개근 = 2,800 × 2 = 5,600루비, 하루 한 번만', () => {
    let p = defaultProgress();
    for (let d = 18; d <= 31; d++) {
      const now = KST(`2026-12-${d}T09:00:00`);
      const r = claimAttendance(p, now);
      if (!r.ok) throw new Error(`${d}일 ${r.reason}`);
      expect(r.day).toBe(d - 17);
      p = r.progress;
      expect(claimAttendance(p, now)).toMatchObject({ ok: false, reason: 'claimed' });
    }
    expect(p.rubies).toBe(5_600);
    expect(EV.attendance.reduce((a, b) => a + b, 0)).toBe(2_800);
  });
  it('KST 자정에 갱신, 빠진 날 보상은 사라짐(1일차 받고 2일차 빠지면 3일차엔 3일차 보상)', () => {
    let p = defaultProgress();
    const a = claimAttendance(p, KST('2026-12-18T23:59:59'));
    if (!a.ok) throw new Error();
    expect(a.rubies).toBe(100);
    p = a.progress;
    const c = claimAttendance(p, KST('2026-12-20T00:00:00')); // 12/19 빠짐
    expect(c.ok && c.day).toBe(3);
    expect(c.ok && c.rubies).toBe(300);
    const late = claimAttendance(c.ok ? c.progress : p, KST('2026-12-25T10:00:00')); // 8일차 = 다시 100
    expect(late.ok && late.rubies).toBe(100);
  });
  it('기간 밖에는 받을 수 없음(룰렛 기간인 12/1~12/17에도 출석은 아직)', () => {
    expect(claimAttendance(defaultProgress(), KST('2026-11-30T12:00:00'))).toMatchObject({ ok: false, reason: 'notYet' });
    expect(claimAttendance(defaultProgress(), KST('2026-12-17T23:59:59'))).toMatchObject({ ok: false, reason: 'notYet' });
    expect(eventActive(KST('2026-12-05T12:00:00'))).toBe(true);
    expect(claimAttendance(defaultProgress(), KST('2027-01-01T00:00:00'))).toMatchObject({ ok: false, reason: 'ended' });
  });
});

describe('이벤트 경제 목표(14일 출석 + 룰렛 30회)', () => {
  it('출석 5,600 + 누적 1,400 + 추첨 기대 576 = 7,576루비', () => {
    const ev = EV.roulette.reduce((a, r) => a + (r.rubies ?? 0) * (r.weight / 100), 0) * 30;
    const total = 5_600 + EV.milestones.reduce((a, m) => a + m.rubies, 0) + ev;
    expect(Math.round(total)).toBe(7_576);
  });
  it('저장 이어받기: 이벤트 기록이 없는 저장도 그대로 열림', () => {
    const s = mem();
    s.setItem(SAVE_KEY, JSON.stringify({ ...defaultProgress(), events: undefined }));
    expect(loadProgress(s).events).toEqual({});
  });
});
