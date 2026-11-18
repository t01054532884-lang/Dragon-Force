import Phaser from 'phaser';
import { RARITY_COLOR, RARITY_LABEL } from '../data/dragons';
import { RARITIES } from '../data/economy';
import { EQUIP_BASE, EQUIP_RULES, equipDef, equipValue, NEXT_RARITY, SLOT_ICON, SLOT_LABEL, SLOTS, type Slot } from '../data/equipment';
import { SPECIAL_RULES, SPECIALS, specialDef, type SpecialId } from '../data/specials';
import { fuseCandidates, isEquipped, Progress, type EquipmentItem, type PlayerProgress } from '../systems/Progress';
import { loadout } from '../systems/Loadout';
import { FONT, makeButton, type Button } from '../ui/widgets';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
const PAGE = 7;

/** 장비 4슬롯(강화·잠금·합성)과 장착형 특수 스킬 15종(해금·1슬롯 장착) — 6단계 v1.2 8·9장 */
export class EquipScene extends Phaser.Scene {
  private tab: 'equip' | 'special' = 'equip';
  private slot: Slot = 'weapon';
  private selected: string | null = null;
  private selectedSpecial: SpecialId | null = null;
  private page = 0;
  private layer: Phaser.GameObjects.GameObject[] = [];
  private header!: Phaser.GameObjects.Text;
  private msg!: Phaser.GameObjects.Text;

  constructor() {
    super('equip');
  }

  onPlatformBack(): boolean {
    this.scene.start('lobby');
    return true;
  }

  init(data: { tab?: 'equip' | 'special' }): void {
    if (data?.tab) this.tab = data.tab;
  }

  create(): void {
    this.layer = [];
    this.add.rectangle(360, 640, 720, 1280, 0x10161a);
    this.add.text(360, 40, '장비 · 특수 스킬', { fontFamily: FONT, fontSize: '38px', fontStyle: 'bold', color: '#80cbc4' }).setOrigin(0.5);
    this.header = this.add.text(360, 82, '', { fontFamily: FONT, fontSize: '21px', color: '#c9d3ee' }).setOrigin(0.5);
    this.msg = this.add.text(360, 1162, '', { fontFamily: FONT, fontSize: '22px', color: '#ff8a80' }).setOrigin(0.5);
    makeButton(this, 205, 1230, 290, 76, '로비로', 0x3a4458, () => this.scene.start('lobby'), 28);
    makeButton(this, 515, 1230, 290, 76, '상점', 0x6a3fb5, () => this.scene.start('shop'), 28);
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('lobby'));
    this.refresh();
  }

  private refresh(): void {
    this.layer.forEach((o) => o.destroy());
    this.layer = [];
    const p = Progress.load();
    const lo = loadout(p);
    this.header.setText(`🪙 ${p.gold.toLocaleString()}G  ·  출격 드래곤 전투력 ${lo.cp.toLocaleString()}`);
    const tabs: ['equip' | 'special', string][] = [['equip', '장비'], ['special', '특수 스킬']];
    tabs.forEach(([t, label], i) => {
      const b = makeButton(this, 190 + i * 340, 135, 320, 56, label, this.tab === t ? 0x2e7d6a : 0x252c3a, () => {
        this.tab = t;
        this.msg.setText('');
        this.refresh();
      }, 24);
      this.keep(b);
    });
    if (this.tab === 'equip') this.drawEquip(p);
    else this.drawSpecial(p);
  }

  private keep(b: Button): Button {
    this.layer.push(b.bg, b.label);
    return b;
  }

  private add2<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.layer.push(o);
    return o;
  }

  private statText(it: EquipmentItem): string {
    const slot = equipDef(it.itemId)!.slot;
    const B = EQUIP_BASE[slot];
    const [a, b] = equipValue(slot, it.rarity, it.level);
    return `${B.a} +${a}${B.unitA}${B.b ? ` · ${B.b} ${b}${B.unitB}` : ''}`;
  }

  // ───────── 장비 ─────────
  private drawEquip(p: PlayerProgress): void {
    const A = this.add2.bind(this);
    // 4슬롯
    SLOTS.forEach((s, i) => {
      const x = 95 + i * 177;
      const y = 255;
      const uid = p.equipment.equipped[s];
      const it = p.equipment.items.find((x2) => x2.uid === uid);
      const color = it ? RARITY_COLOR[it.rarity] : 0x445064;
      const r = A(this.add.rectangle(x, y, 165, 150, this.slot === s ? 0x24414a : 0x1a2229).setStrokeStyle(this.slot === s ? 5 : 3, color));
      A(this.add.text(x, y - 52, `${SLOT_ICON[s]} ${SLOT_LABEL[s]}`, { fontFamily: FONT, fontSize: '20px', color: '#ffffff' }).setOrigin(0.5));
      A(this.add.text(x, y - 10, it ? `${equipDef(it.itemId)!.name}\n${RARITY_LABEL[it.rarity]} Lv.${it.level}` : '비어 있음', {
        fontFamily: FONT, fontSize: '16px', color: it ? hex(color) : '#6f7a8c', align: 'center',
      }).setOrigin(0.5, 0));
      r.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.slot = s;
        this.page = 0;
        this.selected = uid ?? null;
        this.refresh();
      });
    });

    // 보유 목록(고른 슬롯, 등급 높은 순·레벨 높은 순)
    const list = p.equipment.items
      .filter((it) => equipDef(it.itemId)!.slot === this.slot)
      .sort((a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity) || b.level - a.level || a.uid.localeCompare(b.uid));
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    this.page = Math.min(this.page, pages - 1);
    A(this.add.text(30, 346, `${SLOT_LABEL[this.slot]} ${list.length}개  (장비 상자에서 획득 · 같은 장비·등급 3개 → 한 등급 위)`, { fontFamily: FONT, fontSize: '18px', color: '#9aa6bd' }));
    list.slice(this.page * PAGE, this.page * PAGE + PAGE).forEach((it, i) => {
      const y = 405 + i * 72;
      const sel = this.selected === it.uid;
      const eq = isEquipped(p, it.uid);
      const row = A(this.add.rectangle(360, y, 680, 64, sel ? 0x24414a : 0x182026).setStrokeStyle(sel ? 4 : 2, RARITY_COLOR[it.rarity], sel ? 1 : 0.5));
      A(this.add.text(40, y - 22, `${eq ? '[장착] ' : ''}${it.locked ? '🔒 ' : ''}${equipDef(it.itemId)!.name}`, { fontFamily: FONT, fontSize: '20px', color: '#ffffff' }));
      A(this.add.text(40, y + 4, `${RARITY_LABEL[it.rarity]} · Lv.${it.level}/${EQUIP_RULES.maxLevel} · ${this.statText(it)}`, { fontFamily: FONT, fontSize: '16px', color: hex(RARITY_COLOR[it.rarity]) }));
      row.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.selected = it.uid;
        this.msg.setText('');
        this.refresh();
      });
    });
    if (list.length === 0) A(this.add.text(360, 520, '이 슬롯 장비가 없습니다.\n상점의 장비 상자에서 얻을 수 있어요.', { fontFamily: FONT, fontSize: '22px', color: '#6f7a8c', align: 'center' }).setOrigin(0.5));
    if (pages > 1) {
      const prev = this.keep(makeButton(this, 90, 905, 120, 50, '◀', 0x3a4458, () => (this.page--, this.refresh()), 22));
      const next = this.keep(makeButton(this, 630, 905, 120, 50, '▶', 0x3a4458, () => (this.page++, this.refresh()), 22));
      prev.setEnabled(this.page > 0);
      next.setEnabled(this.page < pages - 1);
      A(this.add.text(360, 905, `${this.page + 1} / ${pages}`, { fontFamily: FONT, fontSize: '20px', color: '#9aa6bd' }).setOrigin(0.5));
    }

    // 고른 장비 동작
    const it = p.equipment.items.find((x) => x.uid === this.selected && equipDef(x.itemId)!.slot === this.slot);
    if (!it) return;
    const eq = isEquipped(p, it.uid);
    const y = 1000;
    A(this.add.rectangle(360, y + 20, 690, 200, 0x162026).setStrokeStyle(2, RARITY_COLOR[it.rarity], 0.7));
    const next = NEXT_RARITY[it.rarity];
    const mats = fuseCandidates(p, it.uid).length;
    const cost = EQUIP_RULES.upgradeCost(it.level);
    A(this.add.text(30, y - 66, `${equipDef(it.itemId)!.name} ${RARITY_LABEL[it.rarity]} Lv.${it.level} — ${this.statText(it)}${it.level < EQUIP_RULES.maxLevel ? ` → Lv.${it.level + 1}: ${this.statText({ ...it, level: it.level + 1 })}` : ''}`, {
      fontFamily: FONT, fontSize: '16px', color: '#dfe6f5', wordWrap: { width: 660 },
    }));
    const bEq = this.keep(makeButton(this, 105, y + 50, 160, 76, eq ? '해제' : '장착', 0x2e7d6a, () => this.act(eq ? Progress.unequip(this.slot) : Progress.equip(it.uid)), 24));
    const bUp = this.keep(makeButton(this, 275, y + 50, 160, 76, it.level >= EQUIP_RULES.maxLevel ? '강화 MAX' : `강화\n${cost.toLocaleString()}G`, 0x2e8b57, () => this.act(Progress.upgradeItem(it.uid), '강화!'), 20));
    bUp.setEnabled(it.level < EQUIP_RULES.maxLevel && p.gold >= cost);
    this.keep(makeButton(this, 445, y + 50, 160, 76, it.locked ? '잠금 해제' : '잠금', 0x5d4037, () => this.act(Progress.lock(it.uid)), 22));
    const bF = this.keep(makeButton(this, 615, y + 50, 160, 76, next ? `합성 ${Math.min(mats, 3)}/3\n→ ${RARITY_LABEL[next]}` : '합성 불가', 0x6a3fb5, () => this.act(Progress.fuse(it.uid), '합성!'), 19));
    bF.setEnabled(!!next && !it.locked && !eq && mats >= EQUIP_RULES.fuseCount);
    bEq.setEnabled(true);
    if (next && (it.locked || eq)) A(this.add.text(360, y + 102, '잠금·장착 중인 장비는 합성 재료로 쓰지 않습니다', { fontFamily: FONT, fontSize: '15px', color: '#6f7a8c' }).setOrigin(0.5));
  }

  // ───────── 특수 스킬 ─────────
  private drawSpecial(p: PlayerProgress): void {
    const A = this.add2.bind(this);
    A(this.add.text(360, 190, `장착 슬롯 ${SPECIAL_RULES.slots}개 · 스킬별 조각 ${SPECIAL_RULES.unlockFragments}개로 해금 · 드래곤 전용 액티브와 별개(자동 발동)`, {
      fontFamily: FONT, fontSize: '17px', color: '#9aa6bd', align: 'center', wordWrap: { width: 660 },
    }).setOrigin(0.5));
    SPECIALS.forEach((s, i) => {
      const x = 76 + (i % 5) * 142;
      const y = 300 + Math.floor(i / 5) * 160;
      const st = p.specials[s.id];
      const eq = p.equippedSpecial === s.id;
      const sel = this.selectedSpecial === s.id;
      const box = A(this.add.rectangle(x, y, 132, 148, sel ? 0x2b2540 : 0x1b1a26).setStrokeStyle(sel ? 5 : 3, s.color, st.unlocked ? 1 : 0.35));
      A(this.add.text(x, y - 38, s.icon, { fontFamily: FONT, fontSize: '40px', color: hex(s.color) }).setOrigin(0.5).setAlpha(st.unlocked ? 1 : 0.4));
      A(this.add.text(x, y + 6, s.name, { fontFamily: FONT, fontSize: '17px', color: st.unlocked ? '#ffffff' : '#8a93a6' }).setOrigin(0.5, 0));
      A(this.add.text(x, y + 34, eq ? '장착 중' : st.unlocked ? '해금' : `${st.fragments}/${SPECIAL_RULES.unlockFragments}`, {
        fontFamily: FONT, fontSize: '16px', color: eq ? '#ffd34d' : '#9aa6bd',
      }).setOrigin(0.5, 0));
      box.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.selectedSpecial = s.id;
        this.msg.setText('');
        this.refresh();
      });
    });
    const id = this.selectedSpecial;
    if (!id) return;
    const s = specialDef(id)!;
    const st = p.specials[id];
    const eq = p.equippedSpecial === id;
    const y = 830;
    A(this.add.rectangle(360, y + 60, 690, 250, 0x1b1a26).setStrokeStyle(2, s.color, 0.8));
    A(this.add.text(40, y - 50, `${s.icon} ${s.name} — ${s.text}`, { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: hex(s.color) }));
    A(this.add.text(40, y - 12, `${s.detail}\n임시 밸런스 수치 · 전투력 보정 없음(우선 0)`, { fontFamily: FONT, fontSize: '18px', color: '#dfe6f5', lineSpacing: 4, wordWrap: { width: 640 } }));
    if (!st.unlocked) {
      const b = this.keep(makeButton(this, 360, y + 110, 420, 80, `해금 (조각 ${st.fragments}/${SPECIAL_RULES.unlockFragments})`, 0x6a3fb5, () => this.act(Progress.unlockSpecial(id), '해금!'), 24));
      b.setEnabled(st.fragments >= SPECIAL_RULES.unlockFragments);
    } else {
      this.keep(makeButton(this, 360, y + 110, 420, 80, eq ? '장착 해제' : '장착', 0x2e7d6a, () => this.act(Progress.equipSpecial(eq ? null : id)), 26));
    }
  }

  private act(r: { ok: boolean; reason?: string; cost?: number }, done?: string): void {
    if (!r.ok) {
      const m: Record<string, string> = {
        gold: `골드가 부족합니다(${r.cost?.toLocaleString()}G)`, max: '이미 최대입니다', count: '같은 장비·같은 등급 재료가 모자랍니다(잠금·장착 제외)',
        locked: '잠금·장착 중인 장비는 합성할 수 없습니다', fragments: '조각이 부족합니다',
      };
      this.msg.setText(m[r.reason ?? ''] ?? '할 수 없습니다');
    } else {
      this.msg.setText('');
      if (done) {
        const t = this.add.text(360, 600, done, { fontFamily: FONT, fontSize: '46px', fontStyle: 'bold', color: '#ffe082', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setDepth(50);
        this.tweens.add({ targets: t, y: 580, alpha: 0, duration: 700, onComplete: () => t.destroy() });
      }
      const res = r as { item?: EquipmentItem };
      if (res.item) this.selected = res.item.uid;
    }
    this.refresh();
  }
}
