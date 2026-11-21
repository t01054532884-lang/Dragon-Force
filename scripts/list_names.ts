// 신규 드래곤·스킬 이름 충돌 점검용 목록 출력(개발 전용): npx vite-node scripts/list_names.ts
import { DRAGONS, DRAGON_ORDER, ELEMENT_LABEL } from '../src/data/dragons';
import { SIGNATURES } from '../src/data/signature';
import { UPGRADES } from '../src/data/upgrades';
import { SPECIALS } from '../src/data/specials';
import { ENEMIES } from '../src/data/enemies';
import { EQUIPS } from '../src/data/equipment';
const out: Record<string, string[]> = {
  dragons: DRAGON_ORDER.map((id) => `${id}|${DRAGONS[id].name}|${DRAGONS[id].short}|${DRAGONS[id].element}(${ELEMENT_LABEL[DRAGONS[id].element]})|${DRAGONS[id].rarity}|기본공격:${DRAGONS[id].basic.name}|특성:${DRAGONS[id].trait.id}`),
  signatures: DRAGON_ORDER.map((id) => `${id}|${SIGNATURES[id].name}|${SIGNATURES[id].kind}`),
  skills: UPGRADES.filter((u) => u.kind !== 'basic').map((u) => `${u.id}|${u.name}|${u.kind}`),
  runes: SPECIALS.map((s) => `${s.id}|${s.name}`),
  equips: EQUIPS.map((e) => `${e.id}|${e.name}`),
  enemyCount: [String(Object.keys(ENEMIES).length)],
  enemyNames: Object.values(ENEMIES).map((e) => e.name),
};
console.log(JSON.stringify(out));
