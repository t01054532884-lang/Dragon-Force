import { PASS, PASS_REWARDS, type PassItem, type PassTrack } from '../data/pass';
import { accountXp } from './AccountLevel';
import { addFragments, withTx, type PlayerProgress, type Result } from './Progress';

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

/** 이번 시즌 패스 포인트·레벨: Lv.1에서 시작(첫 칸은 바로 받기), 100P마다 +1, 최대 30(= 2,900P) */
export function passLevel(p: PlayerProgress): { points: number; level: number; inLevel: number; maxed: boolean } {
  const points = Math.max(0, accountXp(p) - p.pass.baseXp);
  const level = Math.min(PASS.levels, Math.floor(points / PASS.pointsPerLevel) + 1);
  return { points, level, inLevel: points % PASS.pointsPerLevel, maxed: level >= PASS.levels };
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

export function grantPassItem(p: PlayerProgress, it: PassItem): PlayerProgress {
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

/** 받기 가능한 칸을 모두 받기(칸 하나만이면 only) → 받은 보상 목록 */
export function claimPass(p0: PlayerProgress, now: number, only?: { t: PassTrack; lv: number }): Result<{ items: PassItem[] }> {
  let p = syncPass(p0, now);
  const list = claimablePass(p).filter((c) => !only || (c.t === only.t && c.lv === only.lv));
  if (!list.length) return { ok: false, reason: 'none' };
  const items: PassItem[] = [];
  for (const c of list) {
    const it = PASS_REWARDS[c.t][c.lv - 1];
    p = grantPassItem(p, it);
    items.push(it);
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
