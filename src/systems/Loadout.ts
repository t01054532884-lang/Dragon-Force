import { buildRunStats } from '../data/progression';
import { DRAGONS, type DragonId } from '../data/dragons';
import { equipBonus, equipDef, equipValue, SLOTS } from '../data/equipment';
import { SPECIAL_IDS } from '../data/specials';
import { RUNE_RULES, runeEffects } from '../data/runes';
import { combatPower, CP_RULES } from '../data/power';
import { permTiersReached } from '../data/permGrowth';
import type { PlayerProgress } from './Progress';

/**
 * 판 시작 능력치 한 벌: 드래곤(종·영구 레벨·승급) + 연구소 + 장비 4종 + 룬 15종(v1.2, 해금한 룬은 모두 적용).
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
  // 영웅·전설 장비 추가 능력(흡혈·가시는 전투 장면이 처리)
  const gear = { lifesteal: 0, thorns: 0 };
  for (const it of equips) {
    const slot = equipDef(it.itemId)!.slot;
    const [a, b] = equipValue(slot, it.rarity, it.level);
    const bonus = equipBonus(slot, it.rarity);
    if (slot === 'weapon') gear.lifesteal += bonus / 100;
    if (slot === 'armor') gear.thorns += bonus / 100;
    if (slot === 'necklace') stats.critMult += bonus / 100;
    if (slot === 'ring') stats.xpMult += bonus / 100;
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

  // 룬(v1.2): 능력치 증가형. 기본값 기준 % 는 연구소·장비처럼 더한다. 전투 중 조건형(화상·둔화·저체력·처치 회복·골드·추가 발동)은 전투 장면이 runes로 처리
  const runes = runeEffects(Object.fromEntries(SPECIAL_IDS.map((id) => [id, p.specials[id]?.level ?? 0])));
  stats.attack += def.baseAttack * runes.attack;
  stats.maxHp += def.baseHp * runes.hp;
  stats.speed += def.baseMoveSpeed * runes.move;
  stats.critChance += runes.crit;
  stats.skillDamageMult += runes.skillDamage;
  stats.damageTaken -= runes.damageReduce;
  stats.cooldownMult *= 1 - runes.cooldown;
  signatureCdMult *= 1 - runes.cooldown;
  traits.poisonDurMult *= 1 + runes.poisonDur;
  traits.chainRelief += runes.chainRelief;
  stats.damageTaken = Math.max(0.5, stats.damageTaken);

  const tiers = permTiersReached(own.level);
  const S = tiers * CP_RULES.perTier + runes.totalLevels * RUNE_RULES.cpPerLevel;
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
    runes,
    gear,
    signatureCdMult,
    cp,
    cpS: S,
  };
}
export type Loadout = ReturnType<typeof loadout>;
