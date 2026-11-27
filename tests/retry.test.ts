import { describe, expect, it } from 'vitest';
import { createEntryGate, nextStageData, retryData, runEntry, type BattleRun } from '../src/systems/battleEntry';
import { DRAGON_ORDER } from '../src/data/dragons';
import { STAMINA, newStamina, spend, type StaminaState } from '../src/systems/Stamina';

// 2026-11-28 제작자 제보: "바하무트로 싸우다 포기 → 재도전을 눌렀더니 다른 드래곤이 나왔다", 재도전 행동력 확인
const T0 = Date.UTC(2026, 10, 28, 0, 0, 0);

/** 행동력 지갑(Progress.spendEntry와 같은 규칙: Stamina.spend 5) */
function wallet(value = 40) {
  let s: StaminaState = { ...newStamina(T0), value };
  return {
    spend: () => {
      const r = spend(s, STAMINA.entryCost, T0);
      if (r.ok) s = r.state;
      return { ok: r.ok };
    },
    get value() {
      return s.value;
    },
  };
}

describe('재도전·다음 단계 — 같은 드래곤·단계·난이도', () => {
  it('24종 × 쉬움·어려움·매우 어려움 모두 그대로 넘어감', () => {
    for (const dragonId of DRAGON_ORDER) {
      for (const difficulty of ['easy', 'hard', 'extreme'] as const) {
        const run: BattleRun = { stageId: 7, difficulty, dragonId };
        expect(retryData(run)).toMatchObject({ stageId: 7, difficulty, dragonId });
        expect(nextStageData(run, 8)).toMatchObject({ stageId: 8, difficulty, dragonId });
      }
    }
  });
  it('무료 판(개발용 시험)·시험 출격 표시도 이어짐', () => {
    const run: BattleRun = { stageId: 3, difficulty: 'extreme', dragonId: 'bahamut', anyDragon: true, free: true };
    expect(retryData(run)).toEqual(run);
  });
});

describe('재도전 행동력', () => {
  it('일반 입장과 같이 5가 한 번 줄어듦', () => {
    const w = wallet(40);
    let started = 0;
    expect(runEntry(false, w.spend, () => undefined, () => started++)).toBe(true);
    expect(w.value).toBe(35);
    expect(started).toBe(1);
  });
  it('부족하면 시작하지 않고 안내만, 행동력은 그대로', () => {
    const w = wallet(4);
    let short = 0;
    let started = 0;
    expect(runEntry(false, w.spend, () => short++, () => started++)).toBe(false);
    expect([w.value, short, started]).toEqual([4, 1, 0]);
  });
  it('무료 판은 줄지 않음', () => {
    const w = wallet(40);
    expect(runEntry(true, w.spend, () => undefined, () => undefined)).toBe(true);
    expect(w.value).toBe(40);
  });
  it('결과 화면에서 재도전을 두 번 눌러도(또는 다음 단계와 겹쳐도) 한 번만 차감', () => {
    const w = wallet(40);
    const gate = createEntryGate();
    let started = 0;
    const press = () => gate.tryEnter(() => runEntry(false, w.spend, () => undefined, () => started++));
    expect(press()).toBe(true);
    expect(press()).toBe(false);
    expect(press()).toBe(false);
    expect([w.value, started]).toEqual([35, 1]);
  });
  it('부족해서 막힌 뒤에는 다시 누를 수 있음(행동력이 차면 입장)', () => {
    const w = wallet(4);
    const gate = createEntryGate();
    expect(gate.tryEnter(() => runEntry(false, w.spend, () => undefined, () => undefined))).toBe(false);
    expect(gate.used).toBe(false);
  });
});
