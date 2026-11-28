import { DRAGONS, type DragonId } from '../data/dragons';
import { ESSENCE } from '../data/economy';
import { ND_PASS, ND_REWARDS, ndEnd, ndOpen, type NdItem, type NdTrack } from '../data/ndPass';
import type { PassItem } from '../data/pass';
import { accountXp } from './AccountLevel';
import { grantPassItem } from './Pass';
import { addFragments, exchangeEssence, withTx, type NdPassState, type PlayerProgress, type Result } from './Progress';

/**
 * 신규 드래곤 패스 규칙(1.0.5, 데이터 src/data/ndPass.ts · 기획 docs/NEW_DRAGON_PASS.md).
 * 저장: PlayerProgress.ndPass. 시작은 기간 안에 처음 화면을 열거나 판을 끝낸 때(그 시점 계정 경험치가 0포인트).
 */

const fresh = (p: PlayerProgress): NdPassState => ({ id: ND_PASS.id, baseXp: accountXp(p), bonusXp: 0, claimed: [], pass: false, bahamut: false, pick: null });

/** 기간 안이고 아직 이번 패스 기록이 없으면 시작. 바뀐 게 없으면 같은 객체 */
export function syncNd(p: PlayerProgress, now: number): PlayerProgress {
  if (p.ndPass.id === ND_PASS.id || !ndOpen(now)) return p;
  return { ...p, ndPass: fresh(p) };
}

export function ndPointsTo(lv: number): number {
  let s = 0;
  for (let n = 1; n < lv; n++) s += ND_PASS.levelCost(n);
  return s;
}

/** 포인트·레벨(Lv.1에서 시작, 최대 20) */
export function ndLevel(p: PlayerProgress): { points: number; level: number; inLevel: number; need: number; maxed: boolean } {
  const started = p.ndPass.id === ND_PASS.id;
  const points = started ? Math.max(0, accountXp(p) - p.ndPass.baseXp) + p.ndPass.bonusXp : 0;
  let level = 1;
  let left = points;
  while (level < ND_PASS.levels && left >= ND_PASS.levelCost(level)) {
    left -= ND_PASS.levelCost(level);
    level++;
  }
  const maxed = level >= ND_PASS.levels;
  return { points, level, inLevel: maxed ? 0 : left, need: maxed ? 0 : ND_PASS.levelCost(level), maxed };
}

export const ndKey = (t: NdTrack, lv: number) => `${t}-${lv}`;
const ownsLine = (p: PlayerProgress, t: NdTrack) => t === 'free' || p.ndPass.pass || p.ndPass.bahamut;

/** 칸 상태: 받음 · 받기 가능 · 레벨 부족 · 구매 필요 · 영웅 고르기 필요 · 기간 끝 */
export function ndCellState(p: PlayerProgress, t: NdTrack, lv: number, now: number): 'claimed' | 'ready' | 'locked' | 'buy' | 'pick' | 'ended' {
  if (p.ndPass.claimed.includes(ndKey(t, lv))) return 'claimed';
  if (now >= ndEnd()) return 'ended';
  if (ndLevel(p).level < lv) return 'locked';
  if (!ownsLine(p, t)) return 'buy';
  if (ND_REWARDS[t][lv - 1].kind === 'pickFrag' && !p.ndPass.pick) return 'pick';
  return 'ready';
}

export const claimableNd = (p: PlayerProgress, now: number) =>
  ndOpen(now) || now < ND_PASS.start
    ? (['free', 'pass'] as NdTrack[]).flatMap((t) => ND_REWARDS[t].map((_, i) => ({ t, lv: i + 1 }))).filter((c) => ndCellState(p, c.t, c.lv, now) === 'ready')
    : [];

/** 받은 보상(조각이면 어느 드래곤 · 이번에 해금됐는지) */
export type NdGot = NdItem & { dragonId?: DragonId; unlocked?: boolean };

/** 드래곤 조각을 주고, 해금 조각 수가 모이면 바로 해금(사용자가 드래곤 화면에서 교환하지 않아도 되게) */
function giveFragments(p: PlayerProgress, id: DragonId, n: number): { progress: PlayerProgress; unlocked: boolean } {
  let next = addFragments(p, id, n);
  if (!next.dragons[id].unlocked) {
    const r = exchangeEssence(next, id);
    if (r.ok) return { progress: r.progress, unlocked: true };
  }
  return { progress: next, unlocked: false };
}

function grantNdItem(p: PlayerProgress, it: NdItem): { progress: PlayerProgress; got: NdGot } {
  if (it.kind === 'dragonFrag' || it.kind === 'pickFrag') {
    const id = it.kind === 'dragonFrag' ? it.id : p.ndPass.pick!;
    const g = giveFragments(p, id, it.n);
    return { progress: g.progress, got: { ...it, dragonId: id, unlocked: g.unlocked } };
  }
  return { progress: grantPassItem(p, it as PassItem).progress, got: it };
}

/** 받기 가능한 칸을 모두(칸 하나만이면 only) */
export function claimNd(p0: PlayerProgress, now: number, only?: { t: NdTrack; lv: number }): Result<{ items: NdGot[] }> {
  let p = syncNd(p0, now);
  const list = claimableNd(p, now).filter((c) => !only || (c.t === only.t && c.lv === only.lv));
  if (!list.length) return { ok: false, reason: 'none' };
  const items: NdGot[] = [];
  for (const c of list) {
    const g = grantNdItem(p, ND_REWARDS[c.t][c.lv - 1]);
    p = g.progress;
    items.push(g.got);
  }
  p = { ...p, ndPass: { ...p.ndPass, claimed: [...p.ndPass.claimed, ...list.map((c) => ndKey(c.t, c.lv))] } };
  return { ok: true, progress: p, items };
}

/** 신규 패스 영웅 고르기: 패스를 사기 전에는 바꿀 수 있고, 산 뒤에는 한 번 고르면 끝 */
export function choosePick(p0: PlayerProgress, id: DragonId, now: number): Result {
  if (!ND_PASS.heroes.includes(id)) return { ok: false, reason: 'hero' };
  const p = syncNd(p0, now);
  const bought = p.ndPass.pass || p.ndPass.bahamut;
  if (bought && p.ndPass.pick) return { ok: false, reason: 'locked' };
  return { ok: true, progress: { ...p, ndPass: { ...p.ndPass, pick: id } } };
}

/** 고른 영웅을 아직 바꿀 수 있나 */
export const pickLocked = (p: PlayerProgress) => !!p.ndPass.pick && (p.ndPass.pass || p.ndPass.bahamut);

/**
 * 결제 서버가 검증한 구매만 반영(같은 거래 한 번).
 * - 신규 패스: 신규 패스 줄을 연다
 * - 바하무트 패스: 신규 패스 줄 + 바하무트 즉시 해금(이미 있으면 조각 160) + 프로필 테두리
 * 기간이 지난 뒤 늦게 도착한 지급도 반영한다(바하무트 해금은 그대로, 줄 보상은 기간이 끝나면 받을 수 없음).
 */
export function grantVerifiedNdPass(p0: PlayerProgress, transactionId: string, kind: 'pass' | 'bahamut', now: number): Result<{ bahamutNew?: boolean }> {
  const p = p0.ndPass.id === ND_PASS.id ? p0 : { ...p0, ndPass: fresh(p0) };
  if (kind === 'bahamut' ? p.ndPass.bahamut : p.ndPass.pass) return { ok: false, reason: 'owned' };
  void now;
  return withTx(p, `ndpass:${ND_PASS.id}:${kind}:${transactionId}`, () => {
    let next: PlayerProgress = { ...p, ndPass: { ...p.ndPass, pass: true, bahamut: p.ndPass.bahamut || kind === 'bahamut' } };
    let bahamutNew = false;
    if (kind === 'bahamut') {
      const id = ND_PASS.legendary;
      const d = next.dragons[id];
      if (d.unlocked) next = addFragments(next, id, ND_PASS.bahamutDupFragments);
      else {
        next = { ...next, dragons: { ...next.dragons, [id]: { ...d, unlocked: true } } };
        bahamutNew = true;
      }
    }
    return { ok: true, progress: next, bahamutNew };
  });
}

/** 해금에 필요한 조각 수(화면 안내용) */
export const unlockFragments = (id: DragonId) => ESSENCE.fragmentsToEssence[DRAGONS[id].rarity === 'starter' ? 'common' : (DRAGONS[id].rarity as keyof typeof ESSENCE.fragmentsToEssence)];
