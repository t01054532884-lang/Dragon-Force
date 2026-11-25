import { skinDef, type SkinKind, type SkinSlot } from '../data/skins';
import {
  boardSlots as sharedBoard,
  drawSlot,
  nextRotationAt,
  rotationIndex,
  rouletteWeek,
  syncBoard,
  type BoardSlot,
  type ServerSkinState,
  type ServerSpin,
} from '../data/skinRoulette';
import { grantEssence, withTx, type PlayerProgress, type Result } from './Progress';

/**
 * 스킨 룰렛·장착 규칙(순수 함수, 2026-11-23 밤 제작자 요청, 11/24 서버 추첨으로 변경).
 * - 판 9칸 = 가운데 망토 1 + 발자국 2 + 재화 6. 매주 월요일 0시(KST) 새 판(뽑은 기록 초기화, 열쇠는 그대로).
 * - 열쇠 1개 = 1회. 뽑힌 칸은 다시 안 나오고 남은 칸 가중치로 다시 나눈다 → 열쇠 최대 9개로 판 전체.
 * - 이미 가진 스킨 칸은 루비(SKIN_ROULETTE.duplicateRubies)로 바뀌어 나온다.
 * - 결제가 되는 앱(iOS)은 서버가 뽑는다(src/data/skinRoulette.ts · functions/ skinSpin). 앱은 서버 결과만 지급(applyServerSpin).
 *   서버가 없는 곳(개발 ?dev=1)만 spinSkinRoulette로 기기에서 뽑는다.
 */

export { nextRotationAt, rotationIndex, type BoardSlot };
export const weekKey = rouletteWeek;

/** 남은 시간 표시: 하루 이상 "5일 20시간 20분", 하루 미만 "20시간 20분 5초", 1시간 미만 "20분 5초" */
export function resetLeftText(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(t / 86_400);
  const h = Math.floor(t / 3_600) % 24;
  const m = Math.floor(t / 60) % 60;
  const s = t % 60;
  if (d > 0) return `${d}일 ${h}시간 ${m}분`;
  if (h > 0) return `${h}시간 ${m}분 ${s}초`;
  return `${m}분 ${s}초`;
}

/** 이번 주 판(저장의 보유 스킨·뽑은 칸 기준) */
export const boardSlots = (p: PlayerProgress, now: number): BoardSlot[] => sharedBoard(p.skins.owned, p.skins.board.picked, now);

/** 이번 주 기준으로 판 기록 맞추기(주가 바뀌었으면 뽑은 칸 비움) */
export function syncSkinBoard(p: PlayerProgress, now: number): PlayerProgress {
  const b = syncBoard(p.skins.board, now);
  if (b === p.skins.board) return p;
  return { ...p, skins: { ...p.skins, board: { ...b, spins: p.skins.board.spins } } };
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

/** 뽑힌 칸 보상 지급(스킨·루비·골드·개봉권·정수). 판 기록·열쇠는 부르는 쪽이 맞춘다 */
function grantSlot(p0: PlayerProgress, slot: BoardSlot, essenceRoll: number): { progress: PlayerProgress; spin: SkinSpinResult } {
  let p = p0;
  const spin: SkinSpinResult = { slot };
  if (slot.skin && !p.skins.owned.includes(slot.skin)) {
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
    const g = grantEssence(p, 'epic', essenceRoll);
    p = g.progress;
    spin.essence = { dragonId: g.dragonId, isNew: g.isNew, fragments: g.fragments };
  }
  return { progress: p, spin };
}

/** 기기에서 뽑기(서버가 없는 개발 모드 전용). 열쇠 1개로 1회. rnd는 0~1 난수(테스트에서 고정) */
export function spinSkinRoulette(p0: PlayerProgress, now: number, rnd: () => number = Math.random): Result<{ spin: SkinSpinResult }> {
  let p = syncSkinBoard(p0, now);
  if (p.skins.keys < 1) return { ok: false, reason: 'keys', cost: 1 };
  const slot = drawSlot(boardSlots(p, now), p.skins.board.picked, rnd());
  if (!slot) return { ok: false, reason: 'done' };
  p = { ...p, skins: { ...p.skins, keys: p.skins.keys - 1, board: { ...p.skins.board, picked: [...p.skins.board.picked, slot.id], spins: p.skins.board.spins + 1 } } };
  const g = grantSlot(p, slot, rnd());
  return { ok: true, progress: g.progress, spin: g.spin };
}

/**
 * 서버 추첨 한 건을 저장에 반영(같은 추첨은 한 번만 — 추첨 ID). 판 기록에 그 칸을 더한다(같은 주일 때).
 * 이미 반영한 추첨이면 'duplicate'(ack 해도 됨).
 */
export function applyServerSpin(p0: PlayerProgress, s: ServerSpin, now: number): Result<{ spin: SkinSpinResult }> {
  let spin: SkinSpinResult = { slot: s.slot };
  const r = withTx(p0, `skinspin:${s.id}`, () => {
    let p = syncSkinBoard(p0, now);
    if (s.week === p.skins.board.week && !p.skins.board.picked.includes(s.slot.id)) {
      p = { ...p, skins: { ...p.skins, board: { ...p.skins.board, picked: [...p.skins.board.picked, s.slot.id], spins: p.skins.board.spins + 1 } } };
    }
    const g = grantSlot(p, s.slot, s.essenceRoll);
    spin = g.spin;
    return { ok: true, progress: g.progress };
  });
  return r.ok ? { ok: true, progress: r.progress, spin } : r;
}

/** 서버 상태로 열쇠 수·이번 주 판·보유 스킨을 맞춘다(서버가 기준). 지급은 applyServerSpin이 따로 */
export function syncServerSkinState(p: PlayerProgress, st: Pick<ServerSkinState, 'keysLeft' | 'owned' | 'board'>, now: number): PlayerProgress {
  const q = syncSkinBoard(p, now);
  const sameWeek = st.board.week === q.skins.board.week;
  return {
    ...q,
    skins: {
      ...q.skins,
      keys: st.keysLeft,
      owned: [...new Set([...q.skins.owned, ...st.owned])],
      board: sameWeek ? { ...q.skins.board, picked: [...new Set([...q.skins.board.picked, ...st.board.picked])] } : q.skins.board,
    },
  };
}

/** 결제로 산 열쇠 지급(같은 거래는 한 번만). 서버 추첨을 쓰는 앱에서는 화면 표시용 — 룰렛을 열면 서버 수로 맞춘다 */
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
  if (s.epicEssence) return '영웅 랜덤 정수';
  return s.id;
}

