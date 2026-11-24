import { describe, expect, it } from 'vitest';
import {
  STAMINA,
  claimGift,
  fullIn,
  grantClearGift,
  newGiftBox,
  newStamina,
  nextRegenIn,
  regen,
  spend,
  unclaimedCount,
} from '../src/systems/Stamina';

const MIN = 60_000;
const R = STAMINA.regenMs;
const T0 = Date.UTC(2026, 10, 18, 0, 0, 0);

describe('행동력 회복 (기획 v1.4)', () => {
  it('처음은 가득(40), 타이머 정지', () => {
    const s = newStamina(T0);
    expect(s.value).toBe(40);
    expect(nextRegenIn(s, T0 + 999 * MIN)).toBeNull();
  });

  it('가득일 때 사용해 39 이하가 되면 그 순간부터 회복 타이머 시작(5분, 테스터 피드백 11/23)', () => {
    expect(R).toBe(5 * MIN);
    const r = spend(newStamina(T0), 5, T0 + 10 * MIN);
    expect(r.ok).toBe(true);
    expect(r.state.value).toBe(35);
    expect(nextRegenIn(r.state, T0 + 10 * MIN)).toBe(R);
    expect(regen(r.state, T0 + 10 * MIN + R - 1).value).toBe(35); // 아직
    expect(regen(r.state, T0 + 10 * MIN + R).value).toBe(36); // 한 칸 경과: +1
  });

  it('앱을 꺼 둔 시간도 회복(경과 시간 기준), 자투리 시간은 다음 회복으로 이어짐', () => {
    const s = { value: 10, regenFrom: T0 };
    const later = regen(s, T0 + 3 * R + MIN); // 3틱 + 1분
    expect(later.value).toBe(13);
    expect(nextRegenIn(later, T0 + 3 * R + MIN)).toBe(R - MIN);
  });

  it('0→40 전부 회복은 40칸(5분 × 40 = 3시간 20분)', () => {
    const s = { value: 0, regenFrom: T0 };
    expect(fullIn(s, T0)).toBe(40 * R);
    expect(regen(s, T0 + 40 * R - 1).value).toBe(39);
    expect(regen(s, T0 + 40 * R).value).toBe(40);
  });

  it('40을 넘어 회복하지 않고, 가득 차면 타이머 정지', () => {
    const s = regen({ value: 38, regenFrom: T0 }, T0 + 10 * 60 * MIN);
    expect(s.value).toBe(40);
    expect(nextRegenIn(s, T0 + 10 * 60 * MIN)).toBeNull();
  });

  it('부족하면 입장 불가, 값은 그대로', () => {
    const r = spend({ value: 4, regenFrom: T0 }, STAMINA.entryCost, T0);
    expect(r.ok).toBe(false);
    expect(r.state.value).toBe(4);
  });

  it('기기 시계를 뒤로 돌려도 줄거나 깨지지 않음(기준 시각을 다시 잡음)', () => {
    const s = { value: 20, regenFrom: T0 };
    const back = regen(s, T0 - 5 * 60 * MIN);
    expect(back.value).toBe(20);
    expect(back.regenFrom).toBe(T0 - 5 * 60 * MIN);
  });
});

describe('선물함 · 최초 클리어 행동력 선물', () => {
  it('스테이지·난이도별 최초 클리어 때 1회만 선물 생성(반복 클리어는 없음)', () => {
    let box = newGiftBox();
    const a = grantClearGift(box, 'easy', 1, '쉬움 1단계 최초 클리어', T0);
    expect(a.granted).toBe(true);
    box = a.box;
    expect(grantClearGift(box, 'easy', 1, '쉬움 1단계', T0 + MIN).granted).toBe(false);
    expect(grantClearGift(box, 'hard', 1, '어려움 1단계', T0 + MIN).granted).toBe(true); // 난이도가 다르면 따로
    expect(grantClearGift(box, 'easy', 2, '쉬움 2단계', T0 + MIN).granted).toBe(true);
  });

  it('행동력에 바로 더하지 않고 선물함에 보관, 선물함 행동력은 상한에 안 들어감', () => {
    const box = grantClearGift(newGiftBox(), 'easy', 1, '쉬움 1단계', T0).box;
    const s = { value: 40, regenFrom: T0 };
    expect(unclaimedCount(box)).toBe(1);
    expect(regen(s, T0 + 60 * MIN).value).toBe(40);
  });

  it('수령하면 +20, 받은 선물은 수령 완료(다시 못 받음)', () => {
    let box = grantClearGift(newGiftBox(), 'easy', 1, '쉬움 1단계', T0).box;
    const r = claimGift(box, { value: 15, regenFrom: T0 }, 'clear:easy:1', T0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.value).toBe(35);
    box = r.box;
    expect(unclaimedCount(box)).toBe(0);
    const again = claimGift(box, r.state, 'clear:easy:1', T0);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.reason).toBe('claimed');
  });

  it('선물로는 40을 넘겨 받을 수 있고, 받으면 100을 넘는 경우만 받지 않고 그대로 둠(일부 수령 없음, 11/25)', () => {
    const box = grantClearGift(newGiftBox(), 'easy', 1, '쉬움 1단계', T0).box;
    const over40 = claimGift(box, { value: 35, regenFrom: T0 }, 'clear:easy:1', T0);
    expect(over40.ok && over40.state.value).toBe(55);
    const r = claimGift(box, { value: 81, regenFrom: T0 }, 'clear:easy:1', T0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('wouldExceed');
    expect(unclaimedCount(r.box)).toBe(1);
    expect(r.state.value).toBe(81);
    const ok = claimGift(box, { value: 80, regenFrom: T0 }, 'clear:easy:1', T0);
    expect(ok.ok && ok.state.value).toBe(STAMINA.hold);
  });

  it('40을 넘는 동안은 시간 회복이 멈추고, 써서 40 아래로 내려가면 그때부터 다시 회복', () => {
    const s = { value: 60, regenFrom: T0 };
    expect(regen(s, T0 + 10 * R).value).toBe(60);
    expect(nextRegenIn(s, T0 + 10 * R)).toBeNull();
    const a = spend(regen(s, T0 + 10 * R), 5, T0 + 10 * R).state; // 55: 아직 40 이상
    expect(regen(a, T0 + 20 * R).value).toBe(55);
    const b = spend(regen({ value: 42, regenFrom: T0 }, T0), 5, T0).state; // 37: 지금부터 회복
    expect(regen(b, T0 + R).value).toBe(38);
  });

  it('수령으로 40이 되면 회복 타이머 정지', () => {
    const box = grantClearGift(newGiftBox(), 'easy', 1, '쉬움 1단계', T0).box;
    const r = claimGift(box, { value: 20, regenFrom: T0 }, 'clear:easy:1', T0 + MIN);
    expect(r.ok && nextRegenIn(r.state, T0 + MIN)).toBeNull();
  });
});
