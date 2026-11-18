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
const T0 = Date.UTC(2026, 10, 18, 0, 0, 0);

describe('행동력 회복 (기획 v1.4)', () => {
  it('처음은 가득(40), 타이머 정지', () => {
    const s = newStamina(T0);
    expect(s.value).toBe(40);
    expect(nextRegenIn(s, T0 + 999 * MIN)).toBeNull();
  });

  it('가득일 때 사용해 39 이하가 되면 그 순간부터 30분 타이머 시작', () => {
    const r = spend(newStamina(T0), 5, T0 + 10 * MIN);
    expect(r.ok).toBe(true);
    expect(r.state.value).toBe(35);
    expect(nextRegenIn(r.state, T0 + 10 * MIN)).toBe(30 * MIN);
    expect(regen(r.state, T0 + 39 * MIN).value).toBe(35); // 29분 경과: 아직
    expect(regen(r.state, T0 + 40 * MIN).value).toBe(36); // 30분 경과: +1
  });

  it('앱을 꺼 둔 시간도 회복(경과 시간 기준), 자투리 시간은 다음 회복으로 이어짐', () => {
    const s = { value: 10, regenFrom: T0 };
    const later = regen(s, T0 + 95 * MIN); // 3틱 + 5분
    expect(later.value).toBe(13);
    expect(nextRegenIn(later, T0 + 95 * MIN)).toBe(25 * MIN);
  });

  it('0→40 전부 회복은 20시간', () => {
    const s = { value: 0, regenFrom: T0 };
    expect(fullIn(s, T0)).toBe(20 * 60 * MIN);
    expect(regen(s, T0 + 20 * 60 * MIN - 1).value).toBe(39);
    expect(regen(s, T0 + 20 * 60 * MIN).value).toBe(40);
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

  it('받으면 40을 넘는 경우 받지 않고 선물함에 그대로 둠(일부 수령 없음)', () => {
    const box = grantClearGift(newGiftBox(), 'easy', 1, '쉬움 1단계', T0).box;
    const r = claimGift(box, { value: 21, regenFrom: T0 }, 'clear:easy:1', T0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('wouldExceed');
    expect(unclaimedCount(r.box)).toBe(1);
    expect(r.state.value).toBe(21);
    const ok = claimGift(box, { value: 20, regenFrom: T0 }, 'clear:easy:1', T0);
    expect(ok.ok && ok.state.value).toBe(40);
  });

  it('수령으로 40이 되면 회복 타이머 정지', () => {
    const box = grantClearGift(newGiftBox(), 'easy', 1, '쉬움 1단계', T0).box;
    const r = claimGift(box, { value: 20, regenFrom: T0 }, 'clear:easy:1', T0 + 10 * MIN);
    expect(r.ok && nextRegenIn(r.state, T0 + 10 * MIN)).toBeNull();
  });
});
