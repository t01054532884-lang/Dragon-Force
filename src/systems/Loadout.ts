import { buildRunStats } from '../data/progression';
import { DRAGONS, type DragonId } from '../data/dragons';
import { equipDef, equipValue, SLOTS } from '../data/equipment';
import { SPECIAL_RULES, SPECIAL_VALUES, type SpecialId } from '../data/specials';
import { combatPower, CP_RULES } from '../data/power';
import { permTiersReached } from '../data/permGrowth';
import type { PlayerProgress } from './Progress';

/**
 * 판 시작 능력치 한 벌: 드래곤(종·영구 레벨·승급) + 연구소 + 장비 4종 + 장착형 특수 스킬.
 * 로비·드래곤·장비 화면의 전투력과 실제 전투가 같은 함수를 쓴다(화면과 전투 값이 어긋나지 않게).
 * 장비 없음·특수 스킬 없음이면 buildRunStats 결과와 똑같다(기존 전투 결과 보존).
 */
export function loadout(p: PlayerProgress, dragonId: DragonId = p.selectedDragonId) {
  const def = DRAGONS[dragonId];
  const own = p.dragons[dragonId];
  const built = buildRunStats(def, p.upgrades, own);
  const stats = { ...built.stats };
  const traits = { ...built.traits };
  let signatureCdMult = 1;

  // 장비(v1.3): 무기 공격력 +a% · 갑옷 HP +a%, 피해 감소 b% — 드래곤 기본값 × a%를 더한다
  // (= 기본값 × (1 + 연구소 + 레벨 + 승급 + 장비), 같은 능력치 보너스는 합산). 목걸이 스킬 피해 a%, 쿨타임 b% · 반지 치명타 a%, 이동속도 b%
  const equips = SLOTS.map((s) => p.equipment.items.find((i) => i.uid === p.equipment.equipped[s])).filter((i) => !!i);
  for (const it of equips) {
    const slot = equipDef(it.itemId)!.slot;
    const [a, b] = equipValue(slot, it.rarity, it.level);
    if (slot === 'weapon') stats.attack += def.baseAttack * (a / 100);
    if (slot === 'armor') {
      stats.maxHp += def.baseHp * (a / 100);
      stats.damageTaken -= b / 100;
    }
    if (slot === 'necklace') {
      stats.skillDamageMult += a / 100;
      stats.cooldownMult *= 1 - b / 100;
      signatureCdMult *= 1 - b / 100;
    }
    if (slot === 'ring') {
      stats.critChance += a / 100;
      stats.speed += def.baseMoveSpeed * (b / 100);
    }
  }

  // 장착형 특수 스킬 중 능력치·특성에 바로 붙는 것(시간형·확률형은 전투 장면이 처리)
  const sp: SpecialId | null = p.equippedSpecial && p.specials[p.equippedSpecial]?.unlocked ? p.equippedSpecial : null;
  const V = SPECIAL_VALUES;
  if (sp === 'earthWill') stats.maxHp += def.baseHp * V.earthWill.hp;
  if (sp === 'ancientEye') stats.critChance += V.ancientEye.crit;
  if (sp === 'stormBless') {
    stats.speed += def.baseMoveSpeed * V.stormBless.move;
    traits.intervalMult *= 1 - V.stormBless.haste;
  }
  if (sp === 'starMana') {
    stats.cooldownMult *= 1 - V.starMana.cooldown;
    signatureCdMult *= 1 - V.starMana.cooldown;
  }
  if (sp === 'venomMark') traits.poisonDurMult *= 1 + V.venomMark.poisonMs;
  if (sp === 'thunderCrest') traits.extraChain += V.thunderCrest.chain;
  stats.damageTaken = Math.max(0.5, stats.damageTaken);

  const tiers = permTiersReached(own.level);
  const S = tiers * CP_RULES.perTier + (sp ? SPECIAL_RULES.cpBonus : 0);
  const cp = combatPower(stats.attack, stats.maxHp, stats.speed, S);
  return {
    def,
    own,
    stats,
    traits,
    perm: built.perm,
    traitMult: built.traitMult,
    // 35% 한 방 상한 기준 = 종별 기본 HP. 연구소·영구 레벨·승급·장비·대지의 의지로 오른 HP는 모두 뺀다.
    permHpBonus: stats.maxHp - def.baseHp,
    special: sp,
    signatureCdMult,
    cp,
    cpS: S,
  };
}
export type Loadout = ReturnType<typeof loadout>;
