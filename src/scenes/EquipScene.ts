import Phaser from 'phaser';
import { DRAGONS, RARITY_COLOR, RARITY_LABEL } from '../data/dragons';
import { RARITIES } from '../data/economy';
import { EQUIP_BASE, EQUIP_RULES, equipDef, equipValue, NEXT_RARITY, SLOT_LABEL, SLOTS, type Slot } from '../data/equipment';
import { fuseCandidates, isEquipped, Progress, type EquipmentItem, type PlayerProgress } from '../systems/Progress';
import { loadout } from '../systems/Loadout';
import { equipIcon, preloadArt } from '../ui/art';
import { badge, button, slot as slotBox, text, type KitButton } from '../ui/kit';
import { altar, plate, tabs } from '../ui/kit2';
import { popWord, screenFrame, toast, type ScreenFrame } from '../ui/screen';
import { COLOR, TYPE } from '../ui/theme';

const PAGE = 10; // 보유 목록 한 쪽(5 × 2)

/**
 * 장비 4슬롯(강화·잠금·합성) — 6단계 v1.2 8장. (장착형 특수 스킬은 v1.2 시스템 개편에서 연구소 룬으로 옮김)
 * 8단계 v2.0 C: 시안 형식(제단 위 출격 드래곤 + 양옆 장착 슬롯 · 능력치 줄 · 탭 · 보유 장비 격자 · 고른 장비 판). 규칙·저장은 그대로.
 */
export class EquipScene extends Phaser.Scene {
  private slot: Slot = 'weapon';
  private selected: string | null = null;
  private page = 0;
  private sort: 'rarity' | 'level' | 'recent' = 'rarity';
  private layer: Phaser.GameObjects.GameObject[] = [];
  private frame!: ScreenFrame;

  constructor() {
    super('equip');
  }

  onPlatformBack(): boolean {
    this.scene.start('lobby');
    return true;
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    this.layer = [];
    this.frame = screenFrame(this, { title: '장비', nav: 'equip' });
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('lobby'));
    this.refresh();
  }

  private refresh(): void {
    this.layer.forEach((o) => o.destroy());
    this.layer = [];
    const p = Progress.load();
    this.frame.refresh();
    // v1.2(2026-11-21): 특수 스킬 탭은 연구소 "룬"으로 옮김 → 장비만
    this.A(text(this, 360, 262, '장비 4칸 · 강화 · 잠금 · 합성 (룬은 연구소에서)', TYPE.tiny, COLOR.textSub, true, true).setOrigin(0.5));
    this.drawEquip(p);
  }

  private A<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.layer.push(o);
    return o;
  }

  private B(b: KitButton): KitButton {
    this.layer.push(b.root);
    return b;
  }

  private statText(it: EquipmentItem): string {
    const slot = equipDef(it.itemId)!.slot;
    const B = EQUIP_BASE[slot];
    const [a, b] = equipValue(slot, it.rarity, it.level);
    return `${B.a} +${a}${B.unitA}${B.b ? ` · ${B.b} ${b}${B.unitB}` : ''}`;
  }

  // ───────── 장비 ─────────
  private drawEquip(p: PlayerProgress): void {
    const A = this.A.bind(this);
    const lo = loadout(p);
    const d = DRAGONS[p.selectedDragonId];

    // 제단 위 출격 드래곤 + 양옆 장착 슬롯(누르면 그 슬롯 목록)
    this.layer.push(...altar(this, 360, 512, 300));
    const hero = A(this.add.image(360, 418, `portrait-${d.id}`).setDisplaySize(230, 230));
    this.tweens.add({ targets: hero, y: 410, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    SLOTS.forEach((s, i) => {
      const x = i < 2 ? 98 : 622;
      const y = 382 + (i % 2) * 150;
      const uid = p.equipment.equipped[s];
      const it = p.equipment.items.find((x2) => x2.uid === uid);
      const on = this.slot === s;
      if (on) A(this.add.rectangle(x, y, 132, 132, COLOR.cta, 0.9).setStrokeStyle(4, COLOR.outline));
      const box = A(slotBox(this, x, y, 116, { icon: it ? equipIcon(s, it.rarity) : undefined, rarity: it ? RARITY_COLOR[it.rarity] : undefined }));
      A(text(this, x, y - 76, SLOT_LABEL[s], TYPE.tiny, on ? COLOR.gold : COLOR.textSub, true, true).setOrigin(0.5));
      if (it) box.add(text(this, 0, 44, `Lv.${it.level}`, TYPE.tiny, COLOR.text, true, true).setOrigin(0.5));
      if (it && it.level < EQUIP_RULES.maxLevel && p.gold >= EQUIP_RULES.upgradeCost(it.level)) box.add(text(this, 44, -42, '▲', 24, COLOR.ok, true, true).setOrigin(0.5));
      box.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.slot = s;
        this.page = 0;
        this.selected = uid ?? null;
        this.refresh();
      });
    });

    // 능력치 줄(장비·특수 스킬·연구소까지 들어간 실제 출격 값)
    const st = A(plate(this, 360, 624, 664, 64, { r: 20 }));
    const stats: [string, string, string][] = [
      ['ic-swords', '공격력', lo.stats.attack.toFixed(1)],
      ['ic-heart', '최대 HP', `${Math.round(lo.stats.maxHp)}`],
      ['ic-shield', '피해 감소', `${Math.round((1 - lo.stats.damageTaken) * 100)}%`],
    ];
    stats.forEach(([ic, l, v], i) => {
      const x = -220 + i * 220;
      if (this.textures.exists(ic)) st.add(this.add.image(x - 64, 0, ic).setDisplaySize(44, 44));
      st.add(text(this, x - 34, -13, l, 15, COLOR.textSub, true).setOrigin(0, 0.5));
      st.add(text(this, x - 34, 12, v, TYPE.caption, COLOR.text, true, true).setOrigin(0, 0.5));
    });

    // 보유 목록(고른 슬롯). 정렬: 등급순 · 레벨순 · 획득순(최근 먼저) — 2026-11-21 기획서 6장
    const order = (u: string) => Number(u.replace(/\D/g, '')) || 0;
    const byRarity = (a: EquipmentItem, b: EquipmentItem) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity);
    const list = p.equipment.items
      .filter((it) => equipDef(it.itemId)!.slot === this.slot)
      .sort((a, b) =>
        this.sort === 'level' ? b.level - a.level || byRarity(a, b) || order(b.uid) - order(a.uid) :
        this.sort === 'recent' ? order(b.uid) - order(a.uid) :
        byRarity(a, b) || b.level - a.level || order(b.uid) - order(a.uid));
    const SORT_LABEL = { rarity: '등급순', level: '레벨순', recent: '획득순' } as const;
    this.B(button(this, 466, 680, 132, 42, `정렬: ${SORT_LABEL[this.sort]}`, () => {
      this.sort = this.sort === 'rarity' ? 'level' : this.sort === 'level' ? 'recent' : 'rarity';
      this.page = 0;
      this.refresh();
    }, { kind: 'secondary', size: 15 }));
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    this.page = Math.min(this.page, pages - 1);
    A(text(this, 30, 680, `${SLOT_LABEL[this.slot]} ${list.length}개 · ▲ 강화 가능`, TYPE.tiny, COLOR.textSub, true, true).setOrigin(0, 0.5));
    if (pages > 1) {
      const prev = this.B(button(this, 576, 680, 56, 42, '◀', () => (this.page--, this.refresh()), { kind: 'secondary', size: TYPE.tiny }));
      const next = this.B(button(this, 660, 680, 56, 42, '▶', () => (this.page++, this.refresh()), { kind: 'secondary', size: TYPE.tiny }));
      prev.setEnabled(this.page > 0);
      next.setEnabled(this.page < pages - 1);
      A(text(this, 618, 650, `${this.page + 1}/${pages}`, 15, COLOR.textSub, true).setOrigin(0.5));
    }
    list.slice(this.page * PAGE, this.page * PAGE + PAGE).forEach((it, i) => {
      const x = 96 + (i % 5) * 132;
      const y = 762 + Math.floor(i / 5) * 124;
      const sel = this.selected === it.uid;
      if (sel) A(this.add.rectangle(x, y, 122, 122, COLOR.cta, 0.95).setStrokeStyle(4, COLOR.outline));
      const box = A(slotBox(this, x, y, 106, { icon: equipIcon(this.slot, it.rarity), rarity: RARITY_COLOR[it.rarity] }));
      box.add(text(this, 0, 40, `Lv.${it.level}`, 15, COLOR.text, true, true).setOrigin(0.5));
      if (isEquipped(p, it.uid)) box.add(badge(this, -30, -40, '장착', COLOR.teal));
      if (it.locked) box.add(text(this, 38, -38, '🔒', 18).setOrigin(0.5));
      // 지금 골드로 강화할 수 있는 장비에만 초록 화살표(자원이 부족하면 표시하지 않음)
      else if (it.level < EQUIP_RULES.maxLevel && p.gold >= EQUIP_RULES.upgradeCost(it.level)) box.add(text(this, 38, -36, '▲', 22, COLOR.ok, true, true).setOrigin(0.5));
      box.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.selected = it.uid;
        this.refresh();
      });
    });
    if (list.length === 0) A(text(this, 360, 820, `${SLOT_LABEL[this.slot]}가 없어요\n상점의 장비 상자에서 얻을 수 있어요`, TYPE.caption, COLOR.textDim, true).setOrigin(0.5).setAlign('center'));

    // 고른 장비 판: 이름·능력치 + 장착·강화·잠금·합성
    const it = p.equipment.items.find((x) => x.uid === this.selected && equipDef(x.itemId)!.slot === this.slot);
    const pl = A(plate(this, 360, 1028, 664, 176, { r: 22, fill: it ? 0x2b2442 : 0x221d36 }));
    if (!it) {
      pl.add(text(this, 0, 0, '장비를 누르면 장착 · 강화 · 잠금 · 합성을 할 수 있어요', TYPE.tiny, COLOR.textSub, true).setOrigin(0.5));
      return;
    }
    const eq = isEquipped(p, it.uid);
    const nextR = NEXT_RARITY[it.rarity];
    const mats = fuseCandidates(p, it.uid).length;
    const cost = EQUIP_RULES.upgradeCost(it.level);
    pl.add(text(this, -306, -58, `${equipDef(it.itemId)!.name}  ${RARITY_LABEL[it.rarity]} Lv.${it.level}/${EQUIP_RULES.maxLevel}`, TYPE.caption, RARITY_COLOR[it.rarity], true, true).setOrigin(0, 0.5));
    const nextLv = it.level < EQUIP_RULES.maxLevel ? `  →  Lv.${it.level + 1}: ${this.statText({ ...it, level: it.level + 1 })}` : '';
    pl.add(text(this, -306, -24, `${this.statText(it)}${nextLv}`, 15, COLOR.text, true).setOrigin(0, 0.5));
    const y = 1066;
    this.B(button(this, 112, y, 148, 66, eq ? '해제' : '장착', () => this.act(eq ? Progress.unequip(this.slot) : Progress.equip(it.uid)), { kind: 'growth', size: TYPE.caption }));
    const bUp = this.B(button(this, 276, y, 164, 66, it.level >= EQUIP_RULES.maxLevel ? '강화 MAX' : '강화', () => this.act(Progress.upgradeItem(it.uid), '강화!'), {
      kind: 'primary', size: TYPE.caption, icon: it.level >= EQUIP_RULES.maxLevel ? undefined : 'ui-gold', sub: it.level >= EQUIP_RULES.maxLevel ? undefined : cost.toLocaleString(),
    }));
    bUp.setEnabled(it.level < EQUIP_RULES.maxLevel && p.gold >= cost);
    this.B(button(this, 444, y, 148, 66, it.locked ? '잠금 해제' : '잠금', () => this.act(Progress.lock(it.uid)), { kind: 'secondary', size: TYPE.caption }));
    const bF = this.B(button(this, 610, y, 164, 66, nextR ? `합성 ${Math.min(mats, 3)}/3` : '합성 불가', () => this.act(Progress.fuse(it.uid), '합성!'), {
      kind: 'magic', size: TYPE.caption, sub: nextR ? `→ ${RARITY_LABEL[nextR]}` : undefined,
    }));
    bF.setEnabled(!!nextR && !it.locked && !eq && mats >= EQUIP_RULES.fuseCount);
    if (nextR && (it.locked || eq)) pl.add(text(this, 306, -58, '잠금·장착 중엔 합성 재료 제외', 14, COLOR.textDim, true).setOrigin(1, 0.5));
  }

  private act(r: { ok: boolean; reason?: string; cost?: number }, done?: string): void {
    if (!r.ok) {
      const m: Record<string, string> = {
        gold: `골드가 부족해요(${r.cost?.toLocaleString()}G)`, max: '이미 최대예요', count: '같은 장비·같은 등급 재료가 모자라요(잠금·장착 제외)',
        locked: '잠금·장착 중인 장비는 합성할 수 없어요', fragments: '조각이 부족해요',
      };
      toast(this, m[r.reason ?? ''] ?? '할 수 없어요', COLOR.danger);
    } else {
      if (done) popWord(this, done);
      const res = r as { item?: EquipmentItem };
      if (res.item) this.selected = res.item.uid;
    }
    this.refresh();
  }
}
