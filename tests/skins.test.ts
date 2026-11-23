import { describe, expect, it } from 'vitest';
import { SKIN_ROULETTE, SKINS } from '../src/data/skins';
import { iapProduct, type ServerGrant } from '../src/data/iap';
import { defaultProgress, sanitize, type PlayerProgress } from '../src/systems/Progress';
import { applyServerGrant } from '../src/systems/Purchases';
import { boardSlots, equipSkin, nextRotationAt, resetLeftText, rotationIndex, skinOdds, spinSkinRoulette, syncSkinBoard, weekKey } from '../src/systems/Skins';

// 스킨 룰렛(제작자 요청 2026-11-23 밤): 9칸 · 뽑힌 칸 제외 · 열쇠 4,900원 · 매주 월요일 새 판
const T0 = Date.parse('2026-11-25T12:00:00+09:00'); // 수요일, 첫 판 주
const withKeys = (n: number, p: PlayerProgress = defaultProgress()): PlayerProgress => ({ ...p, skins: { ...p.skins, keys: n } });
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('스킨 룰렛', () => {
  it('판 9칸: 가운데 망토 1 · 발자국 2 · 재화 6, 처음 확률 합 100%', () => {
    const slots = boardSlots(defaultProgress(), T0);
    expect(slots).toHaveLength(9);
    expect(slots[0]).toMatchObject({ center: true, skin: 'cape-ember-king', weight: SKIN_ROULETTE.capeWeight });
    expect(slots.filter((s) => s.skin && SKINS.find((k) => k.id === s.skin)?.kind === 'trail')).toHaveLength(2);
    expect(slots.reduce((a, s) => a + s.weight, 0)).toBe(100);
    const odds = skinOdds(defaultProgress(), T0);
    expect(odds.reduce((a, o) => a + o.pct, 0)).toBeCloseTo(100, 6);
    expect(odds[0].pct).toBeCloseTo(4, 6);
  });
  it('열쇠 9개면 판 전체(같은 칸 다시 안 나옴), 10번째는 막힘, 열쇠 없으면 막힘', () => {
    expect(spinSkinRoulette(defaultProgress(), T0, rnd)).toMatchObject({ ok: false, reason: 'keys' });
    let p = withKeys(10);
    const got: string[] = [];
    for (let i = 0; i < 9; i++) {
      const r = spinSkinRoulette(p, T0, rnd);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      got.push(r.spin.slot.id);
      p = r.progress;
    }
    expect(new Set(got).size).toBe(9);
    expect(p.skins.keys).toBe(1);
    expect(p.skins.owned.sort()).toEqual(['cape-ember-king', 'trail-flame', 'trail-star']);
    expect(p.skins.cape).toBe('cape-ember-king'); // 처음 얻은 스킨은 바로 장착
    expect(spinSkinRoulette(p, T0, rnd)).toMatchObject({ ok: false, reason: 'done' });
    // 남은 칸 확률은 남은 가중치로 다시 나눔
    const one = spinSkinRoulette(withKeys(1), T0, () => 0).progress;
    const odds = skinOdds(one!, T0);
    expect(odds.find((o) => o.picked)?.slot.id).toBe('cape-ember-king');
    expect(odds.reduce((a, o) => a + o.pct, 0)).toBeCloseTo(100, 6);
    expect(odds[1].pct).toBeCloseTo((20 / 96) * 100, 6);
  });
  it('매주 월요일 0시(KST) 새 판: 뽑은 칸 초기화·스킨 묶음 바뀜·열쇠는 그대로', () => {
    let p = withKeys(3);
    p = spinSkinRoulette(p, T0, () => 0).progress!;
    const nextWeek = nextRotationAt(T0);
    expect(new Date(nextWeek).toISOString()).toBe('2026-11-29T15:00:00.000Z'); // 11/30(월) 0시 KST
    expect(rotationIndex(T0)).toBe(0);
    expect(rotationIndex(nextWeek)).toBe(1);
    expect(rotationIndex(nextWeek - 1)).toBe(0);
    const q = syncSkinBoard(p, nextWeek);
    expect(q.skins.board).toMatchObject({ week: weekKey(nextWeek), picked: [] });
    expect(q.skins.keys).toBe(2);
    expect(boardSlots(q, nextWeek)[0].skin).toBe('cape-frost-crown');
    // 3주 뒤 다시 첫 묶음 → 이미 가진 망토 칸은 루비로
    const later = nextWeek + 14 * 86_400_000;
    expect(rotationIndex(later)).toBe(0);
    expect(boardSlots(q, later)[0]).toMatchObject({ duplicate: true, rubies: SKIN_ROULETTE.duplicateRubies });
    expect(boardSlots(q, later)[0].skin).toBeUndefined();
  });
  it('영웅 정수 칸: 영웅 드래곤 하나 해금 또는 조각', () => {
    const p = withKeys(1);
    const slots = boardSlots(p, T0);
    const idx = slots.findIndex((s) => s.epicEssence);
    // 그 칸만 남기고 나머지를 이미 뽑은 것처럼
    const q = { ...syncSkinBoard(p, T0) };
    q.skins = { ...q.skins, board: { ...q.skins.board, picked: slots.filter((_, i) => i !== idx).map((s) => s.id) } };
    const r = spinSkinRoulette(q, T0, () => 0.1);
    expect(r.ok && r.spin.essence?.isNew).toBe(true);
  });
  it('장착: 가진 스킨만, 종류가 맞아야, 해제 가능 · 저장 손상 값은 버림', () => {
    let p = withKeys(1);
    expect(equipSkin(p, 'cape', 'cape-ember-king')).toMatchObject({ ok: false });
    p = { ...p, skins: { ...p.skins, owned: ['cape-ember-king', 'trail-flame'] } };
    expect(equipSkin(p, 'trail', 'cape-ember-king')).toMatchObject({ ok: false });
    const r = equipSkin(p, 'trail', 'trail-flame');
    expect(r.ok && r.progress.skins.trail).toBe('trail-flame');
    expect(equipSkin(p, 'cape', null)).toMatchObject({ ok: true });
    const raw = JSON.parse(JSON.stringify(defaultProgress()));
    raw.skins = { owned: ['cape-ember-king', 'hack'], cape: 'trail-flame', trail: 'x', keys: -5, board: { week: 'w2026-11-23', picked: ['ruby-300'] } };
    const s = sanitize(raw).skins;
    expect(s).toMatchObject({ owned: ['cape-ember-king'], cape: null, trail: null, keys: 0 });
    expect(sanitize(JSON.parse(JSON.stringify(defaultProgress()))).skins.keys).toBe(0); // 예전 저장 → 빈 스킨
  });
  it('결제 지급: 열쇠 1개, 같은 거래는 한 번만', () => {
    const def = iapProduct('skin_key_1')!;
    const g: ServerGrant = { id: 'app_store_t1', productId: 'skin_key_1', transactionId: 't1', purchasedAt: T0, grant: def.grant };
    const a = applyServerGrant(defaultProgress(), g, T0);
    expect(a.ok && a.progress.skins.keys).toBe(1);
    if (!a.ok) return;
    expect(applyServerGrant(a.progress, g, T0)).toMatchObject({ ok: false });
  });
});

describe('스킨 룰렛 초기화 타이머 문구', () => {
  it('하루 이상은 일·시간·분, 하루 미만은 초까지', () => {
    const M = 60_000, H = 60 * M, D = 24 * H;
    expect(resetLeftText(5 * D + 20 * H + 20 * M + 59_000)).toBe('5일 20시간 20분');
    expect(resetLeftText(20 * H + 20 * M + 5_000)).toBe('20시간 20분 5초');
    expect(resetLeftText(20 * M + 5_000)).toBe('20분 5초');
    expect(resetLeftText(-1)).toBe('0분 0초');
  });
});
