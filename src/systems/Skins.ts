import { SKIN_ROULETTE as R, skinDef, type SkinKind, type SkinSlot } from '../data/skins';
import { dealPeriodKey, grantEssence, withTx, type PlayerProgress, type Result } from './Progress';

/**
 * 스킨 룰렛·장착 규칙(순수 함수, 2026-11-23 밤 제작자 요청).
 * - 판 9칸 = 가운데 망토 1 + 발자국 2 + 재화 6. 매주 월요일 0시(KST) 새 판(뽑은 기록 초기화, 열쇠는 그대로).
 * - 열쇠 1개 = 1회. 뽑힌 칸은 다시 안 나오고 남은 칸 가중치로 다시 나눈다 → 열쇠 최대 9개로 판 전체.
 * - 이미 가진 스킨 칸은 루비(SKIN_ROULETTE.duplicateRubies)로 바뀌어 나온다.
 */

export const weekKey = (now: number) => dealPeriodKey('weekly', now);

/** 이번 주가 첫 판(epochMonday)으로부터 몇 번째 주인지 → 스킨 묶음 */
export function rotationIndex(now: number): number {
  const monday = weekKey(now).slice(1); // 'w2026-11-23' → '2026-11-23'
  const weeks = Math.round((Date.parse(`${monday}T00:00:00Z`) - Date.parse(`${R.epochMonday}T00:00:00Z`)) / (7 * 86_400_000));
  const n = R.rotations.length;
  return ((weeks % n) + n) % n;
}

/** 다음 판이 바뀌는 시각(다음 주 월요일 0시 KST, ms) */
export function nextRotationAt(now: number): number {
  const monday = weekKey(now).slice(1);
  return Date.parse(`${monday}T00:00:00+09:00`) + 7 * 86_400_000;
}

export interface BoardSlot extends SkinSlot {
  /** 가진 스킨이라 루비로 바뀐 칸 */
  duplicate?: boolean;
  center?: boolean;
}

/** 이번 주 판: [0] = 가운데 망토, [1..8] = 바깥 8칸(그리는 순서, 스킨 칸을 재화 사이에 나눠 둠) */
export function boardSlots(p: PlayerProgress, now: number): BoardSlot[] {
  const rot = R.rotations[rotationIndex(now)];
  const skinSlot = (id: string, weight: number, center = false): BoardSlot => {
    // 이미 가진 스킨(이번 판에서 뽑은 것 말고 — 예전 주에 얻은 것)은 루비 칸으로
    const dup = p.skins.owned.includes(id) && !p.skins.board.picked.includes(id);
    return dup ? { id, weight, rubies: R.duplicateRubies, duplicate: true, center } : { id, weight, skin: id, center };
  };
  const [c0, c1, c2, c3, c4, c5] = R.common;
  return [
    skinSlot(rot.cape, R.capeWeight, true),
    { ...c0 }, skinSlot(rot.trails[0], R.trailWeight), { ...c1 }, { ...c2 },
    { ...c3 }, skinSlot(rot.trails[1], R.trailWeight), { ...c4 }, { ...c5 },
  ];
}

/** 이번 주 기준으로 판 기록 맞추기(주가 바뀌었으면 뽑은 칸 비움) */
export function syncSkinBoard(p: PlayerProgress, now: number): PlayerProgress {
  const wk = weekKey(now);
  if (p.skins.board.week === wk) return p;
  return { ...p, skins: { ...p.skins, board: { week: wk, picked: [], spins: p.skins.board.spins } } };
}

/** 남은 칸과 다음 1회 확률(%) — 확률 안내 화면이 그대로 읽는다 */
export function skinOdds(p: PlayerProgress, now: number): { slot: BoardSlot; picked: boolean; pct: number }[] {
  const q = syncSkinBoard(p, now);
  const slots = boardSlots(q, now);
  const left = slots.filter((s) => !q.skins.board.picked.includes(s.id));
  const total = left.reduce((a, s) => a + s.weight, 0);
  return slots.map((slot) => {
    const picked = q.skins.board.picked.includes(slot.id);
    return { slot, picked, pct: picked || total === 0 ? 0 : (slot.weight / total) * 100 };
  });
}

export type SkinSpinResult = { slot: BoardSlot; essence?: { dragonId: string; isNew: boolean; fragments: number } };

/** 열쇠 1개로 1회. rnd는 0~1 난수(테스트에서 고정) */
export function spinSkinRoulette(p0: PlayerProgress, now: number, rnd: () => number = Math.random): Result<{ spin: SkinSpinResult }> {
  let p = syncSkinBoard(p0, now);
  if (p.skins.keys < 1) return { ok: false, reason: 'keys', cost: 1 };
  const slots = boardSlots(p, now);
  const left = slots.filter((s) => !p.skins.board.picked.includes(s.id));
  if (!left.length) return { ok: false, reason: 'done' };
  const total = left.reduce((a, s) => a + s.weight, 0);
  let x = rnd() * total;
  let slot = left[left.length - 1];
  for (const s of left) if ((x -= s.weight) < 0) {
    slot = s;
    break;
  }
  p = { ...p, skins: { ...p.skins, keys: p.skins.keys - 1, board: { ...p.skins.board, picked: [...p.skins.board.picked, slot.id], spins: p.skins.board.spins + 1 } } };
  const spin: SkinSpinResult = { slot };
  if (slot.skin) {
    const def = skinDef(slot.skin)!;
    p = { ...p, skins: { ...p.skins, owned: [...p.skins.owned, slot.skin], ...(def.kind === 'cape' && !p.skins.cape ? { cape: slot.skin } : {}), ...(def.kind === 'trail' && !p.skins.trail ? { trail: slot.skin } : {}) } };
  }
  p = {
    ...p,
    rubies: p.rubies + (slot.rubies ?? 0),
    gold: p.gold + (slot.gold ?? 0),
    summon: { ...p.summon, legacyTickets: p.summon.legacyTickets + (slot.dragonTickets ?? 0), equipTickets: (p.summon.equipTickets ?? 0) + (slot.equipTickets ?? 0) },
  };
  if (slot.epicEssence) {
    const g = grantEssence(p, 'epic', rnd());
    p = g.progress;
    spin.essence = { dragonId: g.dragonId, isNew: g.isNew, fragments: g.fragments };
  }
  return { ok: true, progress: p, spin };
}

/** 결제로 산 열쇠 지급(같은 거래는 한 번만) */
export function grantVerifiedSkinKeys(p: PlayerProgress, transactionId: string, keys: number): Result {
  if (!Number.isInteger(keys) || keys <= 0) return { ok: false, reason: 'amount' };
  return withTx(p, `skinkey:${transactionId}`, () => ({ ok: true, progress: { ...p, skins: { ...p.skins, keys: p.skins.keys + keys } } }));
}

/** 스킨 장착(가진 것만)·해제(null) */
export function equipSkin(p: PlayerProgress, kind: SkinKind, id: string | null): Result {
  if (id !== null && (!p.skins.owned.includes(id) || skinDef(id)?.kind !== kind)) return { ok: false, reason: 'locked' };
  return { ok: true, progress: { ...p, skins: { ...p.skins, [kind]: id } } };
}

/** 칸 이름(화면·결과 안내) */
export function slotLabel(s: SkinSlot & { duplicate?: boolean }): string {
  if (s.skin) return skinDef(s.skin)?.name ?? s.skin;
  if (s.duplicate) return `루비 ${s.rubies?.toLocaleString()}(보유 스킨)`;
  if (s.rubies) return `루비 ${s.rubies.toLocaleString()}`;
  if (s.gold) return `골드 ${s.gold.toLocaleString()}`;
  if (s.dragonTickets) return `드래곤 상자 개봉권 ${s.dragonTickets}장`;
  if (s.equipTickets) return `장비 상자 개봉권 ${s.equipTickets}장`;
  if (s.epicEssence) return '영웅 드래곤 정수';
  return s.id;
}
