// 하단 메뉴 빨간 알림 점(2026-11-22, 참고 UI 비교 — 받을 것·할 수 있는 강화가 있으면 메뉴에 표시).
// 조건은 각 화면의 버튼이 켜지는 조건과 같게 둔다(점이 떴는데 들어가 보니 할 게 없는 일이 없게).
import { DIFFICULTIES, econRarity, ESSENCE } from '../data/economy';
import { releasedDragons, DRAGONS, GROWTH, type DragonId } from '../data/dragons';
import { getUpgradeCost, PERMANENT_UPGRADES, UPGRADE_TYPES } from '../data/progression';
import { RUNE_RULES, RUNES, runeUpgradeCost } from '../data/runes';
import { attendanceState, claimableActivity } from '../systems/Activity';
import { pendingGifts } from '../systems/Mailbox';
import { claimableMissions, progressPct, universalLimit, type PlayerProgress } from '../systems/Progress';

/** 드래곤 하나: 보유 → 레벨업·승급 가능, 미보유 → 조각으로 해금 가능 */
export function dragonCanGrow(p: PlayerProgress, id: DragonId): boolean {
  const o = p.dragons[id];
  if (!o.unlocked) return o.fragments >= ESSENCE.fragmentsToEssence[econRarity(DRAGONS[id].rarity)];
  const canLevel = o.level < GROWTH.maxLevel && o.cards >= GROWTH.cardCost(o.level) && p.gold >= GROWTH.levelCost(o.level);
  if (canLevel) return true;
  if (o.stars >= GROWTH.maxStars) return false;
  const need = GROWTH.starCost[o.stars - 1];
  const uni = Math.min(Math.max(0, need - o.fragments), p.universalFragments, universalLimit(id, need));
  return o.fragments + uni >= need;
}

/** 연구소: 능력치 강화 골드가 되거나, 룬 해금·강화 조각이 모였을 때 */
export function labAlert(p: PlayerProgress): boolean {
  const stat = UPGRADE_TYPES.some((t) => p.upgrades[t] < PERMANENT_UPGRADES[t].maxLevel && p.gold >= getUpgradeCost(p.upgrades[t]));
  const rune = RUNES.some((r) => {
    const st = p.specials[r.id];
    return st.level > 0 ? st.level < RUNE_RULES.maxLevel && st.fragments >= runeUpgradeCost(st.level).fragments : st.fragments >= RUNE_RULES.unlockFragments;
  });
  return stat || rune;
}

/** 로비(전투 탭): 보상 화면에서 받을 것 + 선물함 */
export function lobbyAlert(p: PlayerProgress, now: number): boolean {
  const progress = DIFFICULTIES.some((k) => [25, 50, 100].some((s) => progressPct(p, k) >= s && !p.difficulty[k].claimed.includes(s)));
  return progress || claimableMissions(p, now).length > 0 || claimableActivity(p, now) > 0 || !attendanceState(p, now).claimedToday || pendingGifts(p.mailbox, now).length > 0;
}

/** 하단 메뉴 탭별 알림 */
export function navAlerts(p: PlayerProgress, now: number): Record<string, boolean> {
  const s = p.summon;
  return {
    shop: s.legacyTickets + (s.equipTickets ?? 0) + (s.runeTickets ?? 0) > 0, // 무료 개봉권
    dragons: releasedDragons().some((id) => dragonCanGrow(p, id)),
    lobby: lobbyAlert(p, now),
    equip: false,
    lab: labAlert(p),
  };
}
