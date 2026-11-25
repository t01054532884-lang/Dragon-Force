import { RUBY_PASS } from '../data/rubyPass';
import { accountLevel } from './AccountLevel';
import { withTx, type PlayerProgress, type Result } from './Progress';

/** 루비 패스(2026-11-26): 레벨 = 계정 레벨(최대 30). 칸 키 'free-3' · 'paid-12' */
export type RubyTrack = 'free' | 'paid';
export const rubyPassLevel = (p: PlayerProgress) => Math.min(RUBY_PASS.levels, accountLevel(p).level);
const key = (t: RubyTrack, lv: number) => `${t}-${lv}`;

export function rubyCellState(p: PlayerProgress, t: RubyTrack, lv: number): 'claimed' | 'ready' | 'locked' | 'buy' {
  if (p.rubyPass.claimed.includes(key(t, lv))) return 'claimed';
  if (rubyPassLevel(p) < lv) return 'locked';
  return t === 'free' || p.rubyPass.owned ? 'ready' : 'buy';
}

export const claimableRubyPass = (p: PlayerProgress) =>
  (['free', 'paid'] as RubyTrack[]).flatMap((t) => RUBY_PASS[t].map((_, i) => ({ t, lv: i + 1 }))).filter((c) => rubyCellState(p, c.t, c.lv) === 'ready');

/** 받을 수 있는 칸 모두(또는 한 칸) 받기 → 받은 루비 합계 */
export function claimRubyPass(p: PlayerProgress, only?: { t: RubyTrack; lv: number }): Result<{ rubies: number }> {
  const list = claimableRubyPass(p).filter((c) => !only || (c.t === only.t && c.lv === only.lv));
  if (!list.length) return { ok: false, reason: 'none' };
  const rubies = list.reduce((s, c) => s + RUBY_PASS[c.t][c.lv - 1], 0);
  return {
    ok: true,
    rubies,
    progress: { ...p, rubies: p.rubies + rubies, rubyPass: { ...p.rubyPass, claimed: [...p.rubyPass.claimed, ...list.map((c) => key(c.t, c.lv))] } },
  };
}

/** 결제 서버가 검증한 루비 패스 구매만 반영(같은 거래 한 번, 계정당 1번) */
export function grantVerifiedRubyPass(p: PlayerProgress, transactionId: string): Result {
  if (p.rubyPass.owned) return { ok: false, reason: 'owned' };
  return withTx(p, `rubypass:${transactionId}`, () => ({ ok: true, progress: { ...p, rubyPass: { ...p.rubyPass, owned: true } } }));
}
