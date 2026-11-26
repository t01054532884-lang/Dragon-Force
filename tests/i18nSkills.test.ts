import { afterAll, describe, expect, it } from 'vitest';
import { setLang, tr } from '../src/i18n';
import { DRAGON_ORDER, DRAGONS } from '../src/data/dragons';
import { setBasicCard, UPGRADES, FILLERS, compareText } from '../src/data/upgrades';
import { SIGNATURES, ULT_NAMES, ultSummary, ultEffectText, sigGrowthLines } from '../src/data/signature';
import { SPECIALS } from '../src/data/specials';
import { RUNE_STAT, runeText } from '../src/data/runes';
import { PERM_TIERS } from '../src/data/permGrowth';
import { HARD_STAGES } from '../src/data/hardStages';
import { STAGES } from '../src/data/stages';
import { ENEMIES } from '../src/data/enemies';
import { SEASON1_ENEMIES, CHAPTERS } from '../src/data/season1';
import { SLOT_LABEL } from '../src/data/equipment';

// 영어 모드 스킬 문장(2026-11-26 제작자 제보: 영어로 바꾸고 스킬을 누르면 한글이 나옴)
// 화면에 그려지는 순간 번역되는 문장을 데이터에서 그대로 만들어, 영어 모드에서 한글이 남지 않는지 확인한다.
const KO = /[가-힣]/;
afterAll(() => setLang('ko'));

/** 화면이 실제로 그리는 모양 그대로의 스킬 문장 모음 */
function skillStrings(): string[] {
  const out: string[] = [];
  const push = (s: string | undefined | null) => s && out.push(s);
  // 레벨업 카드: 드래곤마다 기본 공격 카드(이름·Lv.1~7 설명)가 바뀐다
  for (const id of DRAGON_ORDER) {
    const d = DRAGONS[id];
    setBasicCard(d.basic);
    push(d.name); push(d.short); push(d.role); push(d.trait.text);
    for (const u of [...UPGRADES, ...FILLERS]) {
      push(u.name);
      for (let lv = 1; lv <= u.maxLevel; lv++) {
        push(u.describe(lv));
        push(compareText(u, lv));
        const st = u.stat?.(lv);
        if (st) for (const [k, v] of Object.entries(st)) push(`${k} ${v}`);
      }
      for (const t of u.tags ?? []) push(`#${t}`);
      push(`🔗 보유 스킬과 연계 · ${u.name}`);
    }
    // 전용 스킬·필살기
    const sig = SIGNATURES[id];
    push(sig.name); push(sig.text); push(sig.detail);
    push(ULT_NAMES[id]); push(ultSummary(id)); push(ultEffectText(id));
    for (let tier = 0; tier <= 3; tier++) for (const [k, v] of Object.entries(sigGrowthLines(id, tier))) push(`${k} ${v}`);
    // 영구 성장(5레벨 단위) — 드래곤 화면 팝업 모양 그대로("✔ Lv.5  이름")
    PERM_TIERS[id].forEach((t, i) => { push(t.name); push(t.text); push(`✔ Lv.${(i + 1) * 5}  ${t.name}`); push(`· Lv.${(i + 1) * 5}  ${t.name}`); });
    push(`${d.short} 영구 성장`);
    // 드래곤 화면 기본 공격 팝업("Lv.1  설명")·필살기 팝업(요약 + 효과)
    d.basic.levels.forEach((L, i) => push(`Lv.${i + 1}  ${L.text}`));
    push(`${ultSummary(id)}
효과:${ultEffectText(id)}`);
    for (const label of ['기본', 'Lv.10', 'Lv.20', 'Lv.30']) { push(`${label} ◀ 지금`); push(`${label} ✔`); }
  }
  // 룬(옛 특수 스킬)
  for (const s of SPECIALS) {
    push(s.name); push(s.text); push(s.detail); push(RUNE_STAT[s.id].label);
    for (let lv = 0; lv <= 10; lv++) push(runeText(s.id, lv));
  }
  return [...new Set(out)];
}

describe('영어 모드: 스킬 문장에 한글이 남지 않는다', () => {
  it('어려움 단계 이름·기믹, 단계·적·챕터 이름, 장비 슬롯(전투 배너·로비·결과 화면)', () => {
    setLang('en');
    const all: string[] = [];
    for (const h of HARD_STAGES) all.push(h.title, h.mechanicText, `어려움 ${h.stageId}단계 — ${h.title}`, `어려움 ${h.stageId} — ${h.title}`, `어려움 ${h.stageId}단계 ${h.title}`);
    for (const st of STAGES) all.push(st.name, `${st.id}단계 — ${st.name}`);
    for (const e of [...Object.values(ENEMIES), ...Object.values(SEASON1_ENEMIES)]) all.push(e.name);
    for (const c of CHAPTERS as unknown as { name?: string }[]) if (c.name) all.push(c.name);
    for (const l of Object.values(SLOT_LABEL)) all.push(l, `${l} 0`, `${l} 3`);
    const left = [...new Set(all)].map((s) => [s, tr(s)] as const).filter(([, o]) => KO.test(o));
    expect(left.map(([s, o]) => `${s} => ${o}`)).toEqual([]);
  });
  it('레벨업 카드·기본 공격·전용 스킬·필살기·영구 성장·룬', () => {
    setLang('en');
    const left = skillStrings().map((s) => [s, tr(s)] as const).filter(([, o]) => KO.test(o));
    expect(left.map(([s, o]) => `${s} => ${o}`)).toEqual([]);
  });
});
