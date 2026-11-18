import { describe, expect, it } from 'vitest';
import { WINTER_2026 as EV } from '../src/data/events';
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
  it('설정 확률 합 100%, 루비 기대값 22.3 → 30회 669', () => {
    expect(EV.roulette.reduce((a, r) => a + r.weight, 0)).toBe(100);
    const ev = EV.roulette.reduce((a, r) => a + (r.rubies ?? 0) * (r.weight / 100), 0);
    expect(ev).toBeCloseTo(22.3);
    expect(ev * 30).toBeCloseTo(669);
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

describe('크리스마스 출석(7일 반복 100~700)', () => {
  it('31일 개근 = 2,800 × 4 + 600 = 11,800루비, 하루 한 번만', () => {
    let p = defaultProgress();
    for (let d = 1; d <= 31; d++) {
      const now = KST(`2026-12-${String(d).padStart(2, '0')}T09:00:00`);
      const r = claimAttendance(p, now);
      if (!r.ok) throw new Error(`${d}일 ${r.reason}`);
      p = r.progress;
      expect(claimAttendance(p, now)).toMatchObject({ ok: false, reason: 'claimed' });
    }
    expect(p.rubies).toBe(11_800);
    expect(EV.attendance.reduce((a, b) => a + b, 0)).toBe(2_800);
  });
  it('KST 자정에 갱신, 빠진 날이 있어도 누적 출석일은 이어짐', () => {
    let p = defaultProgress();
    const a = claimAttendance(p, KST('2026-12-01T23:59:59'));
    if (!a.ok) throw new Error();
    p = a.progress;
    const b = claimAttendance(p, KST('2026-12-02T00:00:00')); // 자정 지나면 다음 날
    expect(b.ok && b.rubies).toBe(200);
    if (!b.ok) return;
    const c = claimAttendance(b.progress, KST('2026-12-09T10:00:00')); // 일주일 빠졌어도 3일차
    expect(c.ok && c.day).toBe(3);
    expect(c.ok && c.rubies).toBe(300);
  });
  it('기간 밖에는 받을 수 없음', () => {
    expect(claimAttendance(defaultProgress(), KST('2026-11-30T12:00:00'))).toMatchObject({ ok: false, reason: 'ended' });
    expect(claimAttendance(defaultProgress(), KST('2027-01-01T00:00:00'))).toMatchObject({ ok: false, reason: 'ended' });
  });
});

describe('이벤트 경제 목표(31일 출석 + 룰렛 30회)', () => {
  it('출석 11,800 + 누적 1,400 + 추첨 기대 669 = 13,869루비', () => {
    const ev = EV.roulette.reduce((a, r) => a + (r.rubies ?? 0) * (r.weight / 100), 0) * 30;
    const total = 11_800 + EV.milestones.reduce((a, m) => a + m.rubies, 0) + ev;
    expect(Math.round(total)).toBe(13_869);
  });
  it('저장 이어받기: 이벤트 기록이 없는 저장도 그대로 열림', () => {
    const s = mem();
    s.setItem(SAVE_KEY, JSON.stringify({ ...defaultProgress(), events: undefined }));
    expect(loadProgress(s).events).toEqual({});
  });
});
