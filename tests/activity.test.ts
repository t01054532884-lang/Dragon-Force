import { describe, expect, it } from 'vitest';
import { ACTIVITY_DAILY, ATTENDANCE_28 } from '../src/data/activity';
import { MISSIONS } from '../src/data/economy';
import { activityPoints, attendanceState, claimActivity, claimDailyAttendance, claimableActivity } from '../src/systems/Activity';
import { addMissionProgress, claimMission, defaultProgress, openBox, sanitize, settleRun, type PlayerProgress } from '../src/systems/Progress';

// 상시 활동 점수·28일 출석(2026-11-21, docs/ACTIVITY_ATTENDANCE.md)
const NOW = Date.UTC(2026, 10, 25, 3); // 2026-11-25(수) 12:00 KST
const DAY = 86_400_000;
const rnd = () => 0.1;

function doneAllDaily(p: PlayerProgress, now: number): PlayerProgress {
  let cur = addMissionProgress(p, { sorties: 1, clears: 1, normalKills: 300, eliteKills: 3, growth: 1 }, now);
  for (const m of MISSIONS.filter((x) => x.period === 'daily')) {
    const r = claimMission(cur, m.id, now, 'red');
    expect(r.ok, m.id).toBe(true);
    if (r.ok) cur = r.progress;
  }
  return cur;
}

describe('활동 점수', () => {
  it('일일 미션 5개 = 하루 100점, 주간에 쌓임', () => {
    expect(MISSIONS.filter((m) => m.period === 'daily')).toHaveLength(5);
    const p = doneAllDaily(defaultProgress(0), NOW);
    expect(activityPoints(p, NOW)).toEqual({ daily: 100, weekly: 100 });
    const p2 = doneAllDaily(p, NOW + DAY);
    expect(activityPoints(p2, NOW + DAY)).toEqual({ daily: 100, weekly: 200 });
    // 다음 주 월요일이면 주간 0부터
    expect(activityPoints(p2, NOW + 5 * DAY).weekly).toBe(0);
  });
  it('상자는 점수가 돼야, 기간당 한 번', () => {
    let p = defaultProgress(0);
    expect(claimActivity(p, 'daily', 20, NOW, rnd)).toMatchObject({ ok: false, reason: 'progress' });
    p = doneAllDaily(p, NOW);
    expect(claimableActivity(p, NOW)).toBe(5);
    const r = claimActivity(p, 'daily', 40, NOW, rnd);
    expect(r.ok && r.progress.rubies - p.rubies).toBe(ACTIVITY_DAILY[1].reward.rubies);
    if (!r.ok) return;
    expect(claimActivity(r.progress, 'daily', 40, NOW, rnd)).toMatchObject({ ok: false, reason: 'claimed' });
    // 다음 날은 새로(점수도 다시 모아야)
    expect(claimActivity(r.progress, 'daily', 40, NOW + DAY, rnd)).toMatchObject({ ok: false, reason: 'progress' });
    // 카드 선택 상자는 드래곤을 골라야
    expect(claimActivity(p, 'daily', 60, NOW, rnd)).toMatchObject({ ok: false, reason: 'choice' });
    const c = claimActivity(p, 'daily', 60, NOW, rnd, 'red');
    expect(c.ok && c.progress.dragons.red.cards - p.dragons.red.cards).toBe(2);
  });
  it('출격(30초 이상)·성장 미션이 진행된다', () => {
    const s = settleRun(defaultProgress(0), 'run-1', 50, undefined, { stageId: 1, cleared: false, elapsedMs: 40_000, normalKills: 10, eliteKills: 0 }, NOW);
    const sortie = MISSIONS.find((m) => m.id === 'd-sortie')!;
    expect(claimMission(s.progress, sortie.id, NOW).ok).toBe(true);
  });
});

describe('28일 출석', () => {
  it('하루 한 번, 연속 아니어도 이어서, 28일 다음은 1일차', () => {
    let p = { ...defaultProgress(0), dragons: defaultProgress(0).dragons };
    let t = NOW;
    for (let i = 0; i < 30; i++) {
      const r = claimDailyAttendance(p, t, rnd, 'red');
      expect(r.ok, `day ${i + 1}`).toBe(true);
      if (!r.ok) return;
      expect(r.day).toBe((i % 28) + 1);
      expect(claimDailyAttendance(r.progress, t, rnd, 'red')).toMatchObject({ ok: false, reason: 'claimed' });
      p = r.progress;
      t += (i % 3 === 0 ? 2 : 1) * DAY; // 가끔 하루 빠져도 진행은 이어짐
    }
    expect(p.attendance.count).toBe(30);
    expect(attendanceState(p, t)).toEqual({ index: 2, claimedToday: false });
  });
  it('개봉권: 장비·룬 상자도 무료로 열린다', () => {
    let p = defaultProgress(0);
    let t = NOW;
    for (let i = 0; i < 22; i++) {
      const r = claimDailyAttendance(p, t, rnd, 'red');
      if (r.ok) p = r.progress;
      t += DAY;
    }
    // 3·13·17일 = 룬 1+1+3, 5·10·22일 = 장비 1+1+3
    expect(p.summon.runeTickets).toBe(5);
    expect(p.summon.equipTickets).toBe(5);
    const o = openBox(p, 'rune', 1, 'ticket', rnd);
    expect(o.ok && o.progress.summon.runeTickets).toBe(4);
    expect(o.ok && o.progress.rubies).toBe(p.rubies);
    expect(openBox({ ...p, summon: { ...p.summon, equipTickets: 0 } }, 'equipment', 1, 'ticket', rnd)).toMatchObject({ ok: false, reason: 'tickets' });
  });
  it('보상표 28칸, 루비 합계 750', () => {
    expect(ATTENDANCE_28).toHaveLength(28);
    expect(ATTENDANCE_28.reduce((a, r) => a + (r.rubies ?? 0), 0)).toBe(750);
  });
  it('저장 이어받기: 출석·개봉권 없던 예전 저장', () => {
    const old = JSON.parse(JSON.stringify(defaultProgress(0)));
    delete old.attendance;
    delete old.summon.equipTickets;
    const s = sanitize(old);
    expect(s.attendance).toEqual({ count: 0, last: '' });
    expect(s.summon.equipTickets).toBe(0);
  });
});
