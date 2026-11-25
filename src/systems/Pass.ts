import { PASS, PASS_REWARDS, type PassItem, type PassTrack } from '../data/pass';
import { accountXp } from './AccountLevel';
import type { DragonId } from '../data/dragons';
import { addFragments, randomFragmentDragon, withTx, type PlayerProgress, type Result } from './Progress';

/** 지금 시즌 번호(1부터, KST 2026-11-23 0시부터 28일씩) */
export const seasonOf = (now: number) => Math.max(1, Math.floor((now - PASS.epoch) / (PASS.seasonDays * 86_400_000)) + 1);
/** 시즌 끝나는 시각 */
export const seasonEnd = (now: number) => PASS.epoch + seasonOf(now) * PASS.seasonDays * 86_400_000;

/**
 * 시즌이 바뀌었으면(또는 처음이면) 새 시즌으로: 지금 계정 경험치를 시작점으로, 받은 칸·유료 줄 초기화.
 * 지난 시즌에 받지 않은 칸은 사라진다(시즌 패스 일반 규칙). 바뀐 게 없으면 같은 객체를 돌려준다.
 */
export function syncPass(p: PlayerProgress, now: number): PlayerProgress {
  const season = seasonOf(now);
  if (p.pass.season === season) return p;
  return { ...p, pass: { season, baseXp: accountXp(p), claimed: [], premium: false, royal: false } };
}

/** Lv.1에서 Lv.lv까지 필요한 누적 포인트 */
export function passPointsTo(lv: number): number {
  let s = 0;
  for (let n = 1; n < lv; n++) s += PASS.levelCost(n);
  return s;
}

/** 이번 시즌 패스 포인트·레벨: Lv.1에서 시작(첫 칸은 바로 받기), 필요량 100·150·200…(50P씩 증가), 최대 30(= 23,200P) */
export function passLevel(p: PlayerProgress): { points: number; level: number; inLevel: number; need: number; maxed: boolean } {
  const points = Math.max(0, accountXp(p) - p.pass.baseXp);
  let level = 1;
  let left = points;
  while (level < PASS.levels && left >= PASS.levelCost(level)) {
    left -= PASS.levelCost(level);
    level++;
  }
  const maxed = level >= PASS.levels;
  return { points, level, inLevel: maxed ? 0 : left, need: maxed ? 0 : PASS.levelCost(level), maxed };
}

const owns = (p: PlayerProgress, t: PassTrack) => t === 'free' || (t === 'premium' ? p.pass.premium || p.pass.royal : p.pass.royal);
export const passKey = (t: PassTrack, lv: number) => `${t}-${lv}`;

/** 칸 상태: 받음 · 받기 가능 · 레벨 부족 · 구매 필요 */
export function cellState(p: PlayerProgress, t: PassTrack, lv: number): 'claimed' | 'ready' | 'locked' | 'buy' {
  if (p.pass.claimed.includes(passKey(t, lv))) return 'claimed';
  if (passLevel(p).level < lv) return 'locked';
  return owns(p, t) ? 'ready' : 'buy';
}

export const claimablePass = (p: PlayerProgress) =>
  (['free', 'premium', 'royal'] as PassTrack[]).flatMap((t) => PASS_REWARDS[t].map((_, i) => ({ t, lv: i + 1 }))).filter((c) => cellState(p, c.t, c.lv) === 'ready');

/** 받은 보상 한 칸(랜덤 조각이면 뽑힌 드래곤) */
export type PassGot = PassItem & { dragonId?: DragonId };

export function grantPassItem(p: PlayerProgress, it: PassItem, rng: () => number = Math.random): { progress: PlayerProgress; got: PassGot } {
  if (it.kind === 'randFrag') {
    const dragonId = randomFragmentDragon(rng);
    return { progress: addFragments(p, dragonId, it.n), got: { ...it, dragonId } };
  }
  return { progress: grantFixed(p, it), got: it };
}

function grantFixed(p: PlayerProgress, it: Exclude<PassItem, { kind: 'randFrag' }>): PlayerProgress {
  switch (it.kind) {
    case 'gold': return { ...p, gold: p.gold + it.n };
    case 'rubies': return { ...p, rubies: p.rubies + it.n };
    case 'redFrag': return addFragments(p, 'red', it.n);
    case 'uniFrag': return { ...p, universalFragments: p.universalFragments + it.n };
    case 'dragonTicket': return { ...p, summon: { ...p.summon, legacyTickets: p.summon.legacyTickets + it.n } };
    case 'equipTicket': return { ...p, summon: { ...p.summon, equipTickets: (p.summon.equipTickets ?? 0) + it.n } };
    case 'runeTicket': return { ...p, summon: { ...p.summon, runeTickets: (p.summon.runeTickets ?? 0) + it.n } };
  }
}

/** 받기 가능한 칸을 모두 받기(칸 하나만이면 only) → 받은 보상 목록(랜덤 조각은 뽑힌 드래곤 포함) */
export function claimPass(p0: PlayerProgress, now: number, only?: { t: PassTrack; lv: number }, rng: () => number = Math.random): Result<{ items: PassGot[] }> {
  let p = syncPass(p0, now);
  const list = claimablePass(p).filter((c) => !only || (c.t === only.t && c.lv === only.lv));
  if (!list.length) return { ok: false, reason: 'none' };
  const items: PassGot[] = [];
  for (const c of list) {
    const g = grantPassItem(p, PASS_REWARDS[c.t][c.lv - 1], rng);
    p = g.progress;
    items.push(g.got);
  }
  p = { ...p, pass: { ...p.pass, claimed: [...p.pass.claimed, ...list.map((c) => passKey(c.t, c.lv))] } };
  return { ok: true, progress: p, items };
}

/** 결제 서버가 검증한 패스 구매만 반영(같은 거래 한 번). 로열은 프리미엄 포함 */
export function grantVerifiedPass(p0: PlayerProgress, transactionId: string, kind: 'premium' | 'royal', now: number): Result {
  const p = syncPass(p0, now);
  if (kind === 'royal' ? p.pass.royal : p.pass.premium) return { ok: false, reason: 'owned' };
  return withTx(p, `pass:${p.pass.season}:${kind}:${transactionId}`, () => ({
    ok: true,
    progress: { ...p, pass: { ...p.pass, premium: true, royal: p.pass.royal || kind === 'royal' } },
  }));
}
