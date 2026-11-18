import Phaser from 'phaser';
import { makeTextures } from '../textures';
import { DRAGONS, RARITY_COLOR, RARITY_LABEL } from '../data/dragons';
import { BOXES, DRAGON_BOX, EQUIPMENT_BOX, ESSENCE, GOLD_BOX, RARITIES, type BoxId } from '../data/economy';
import { equipDef, SLOT_ICON, SLOT_LABEL } from '../data/equipment';
import { specialDef } from '../data/specials';
import { poolOf, Progress, type BoxResult, type Reward } from '../systems/Progress';
import { devMode, FONT, makeButton, type Button } from '../ui/widgets';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/**
 * 루비 상점(6단계 v1.2 6장): 드래곤·스킬 상자 / 장비 상자 / 골드 상자, 1회·10회(10% 할인).
 * 기존 소환권은 드래곤·스킬 상자 무료 개봉권으로 쓴다. 루비는 게임 안 보상·이벤트로만 얻는다(첫 출시: 현금 결제 없음).
 */
export class ShopScene extends Phaser.Scene {
  private info!: Phaser.GameObjects.Text;
  private pity!: Phaser.GameObjects.Text;
  private buttons: { btn: Button; box: BoxId; count: 1 | 10; pay: 'ruby' | 'ticket' }[] = [];
  private layer: Phaser.GameObjects.GameObject[] = [];
  private busy = false;
  private tx = 0;

  constructor() {
    super('shop');
  }

  onPlatformBack(): boolean {
    if (this.layer.length) this.clearLayer();
    else this.scene.start('lobby');
    return true;
  }

  create(): void {
    if (!this.textures.exists('dragon-red')) makeTextures(this);
    this.layer = [];
    this.buttons = [];
    this.busy = false;
    this.add.rectangle(360, 640, 720, 1280, 0x140f22);
    this.add.text(360, 50, '상점', { fontFamily: FONT, fontSize: '44px', fontStyle: 'bold', color: '#e1bee7' }).setOrigin(0.5);
    this.info = this.add.text(360, 104, '', { fontFamily: FONT, fontSize: '25px', color: '#ffd34d' }).setOrigin(0.5);

    const rows: BoxId[] = ['dragon', 'equipment', 'gold'];
    const layout = { dragon: { y: 280, h: 270 }, equipment: { y: 565, h: 220 }, gold: { y: 810, h: 220 } };
    rows.forEach((box) => {
      const def = BOXES[box];
      const { y, h } = layout[box];
      const top = y - h / 2;
      const by = box === 'dragon' ? top + 135 : top + 150;
      this.add.rectangle(360, y, 680, h, 0x1f1830).setStrokeStyle(3, def.color, 0.8);
      this.add.text(40, top + 16, def.name, { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#ffffff' });
      this.add.text(40, top + 56, def.desc, { fontFamily: FONT, fontSize: '20px', color: '#c9bfe0' });
      const b1 = makeButton(this, 180, by, 280, 80, `1회\n💎 ${def.price1.toLocaleString()}`, def.color, () => this.open(box, 1, 'ruby'), 23);
      const b10 = makeButton(this, 500, by, 280, 80, `10회\n💎 ${def.price10.toLocaleString()} (10% 할인)`, def.color, () => this.open(box, 10, 'ruby'), 21);
      this.buttons.push({ btn: b1, box, count: 1, pay: 'ruby' }, { btn: b10, box, count: 10, pay: 'ruby' });
    });
    // 드래곤·스킬 상자 무료 개봉권(기존 소환권)
    const ty = layout.dragon.y + layout.dragon.h / 2 - 38;
    const t1 = makeButton(this, 180, ty, 280, 48, '무료 개봉권 1회', 0x8e24aa, () => this.open('dragon', 1, 'ticket'), 20);
    const t10 = makeButton(this, 500, ty, 280, 48, '무료 개봉권 10회', 0x8e24aa, () => this.open('dragon', 10, 'ticket'), 20);
    this.buttons.push({ btn: t1, box: 'dragon', count: 1, pay: 'ticket' }, { btn: t10, box: 'dragon', count: 10, pay: 'ticket' });
    this.pity = this.add.text(360, 1000, '', { fontFamily: FONT, fontSize: '19px', color: '#c9d3ee', align: 'center', lineSpacing: 6, wordWrap: { width: 660 } }).setOrigin(0.5);

    makeButton(this, 360, 1085, 440, 64, '확률·보장 안내 보기', 0x2c3346, () => this.showRates(), 24);
    this.add.text(360, 1140, '루비 획득: 난이도 진행도 100% 보상 · 업적 · 미션 · 이벤트 (현금 결제 없음)', { fontFamily: FONT, fontSize: '17px', color: '#7d7394' }).setOrigin(0.5);
    makeButton(this, 205, 1220, 290, 76, '로비로', 0x3a4458, () => this.scene.start('lobby'), 28);
    makeButton(this, 515, 1220, 290, 76, '드래곤', 0x2e5d8a, () => this.scene.start('dragons'), 28);
    if (devMode()) {
      const t = this.add.text(690, 18, '[개발용] 루비·골드·카드 +', { fontFamily: FONT, fontSize: '17px', color: '#8a5555' }).setOrigin(1, 0);
      t.setInteractive({ useHandCursor: true }).on('pointerdown', () => (Progress.devGrant(), this.refresh()));
    }
    this.input.keyboard?.on('keydown-ESC', () => this.onPlatformBack());
    this.refresh();
  }

  private refresh(): void {
    const p = Progress.load();
    this.info.setText(`💎 ${p.rubies.toLocaleString()}  ·  🎟 무료 개봉권 ${p.summon.legacyTickets}  ·  🪙 ${p.gold.toLocaleString()}G`);
    this.pity.setText(
      `드래곤·스킬 상자 보장: 희귀 이상 정수 ${p.summon.tenPity} / ${DRAGON_BOX.rareGuarantee}  ·  전설 정수 ${p.summon.legendaryPity} / ${DRAGON_BOX.legendaryGuarantee}\n` +
        `매 ${DRAGON_BOX.rareGuarantee}회째 희귀 이상 정수, ${DRAGON_BOX.legendaryGuarantee}회째까지 전설 정수가 없으면 전설 정수 확정(겹치면 전설 우선)`,
    );
    for (const b of this.buttons) {
      const price = b.count === 10 ? BOXES[b.box].price10 : BOXES[b.box].price1;
      const can = b.pay === 'ticket' ? p.summon.legacyTickets >= b.count : p.rubies >= price;
      b.btn.setEnabled(!this.busy && can, BOXES[b.box].color);
    }
  }

  private open(box: BoxId, count: 1 | 10, pay: 'ruby' | 'ticket'): void {
    if (this.busy) return; // 연출 중 연속 클릭 방지(저장소 쪽에서도 거래 ID로 한 번만 반영)
    const r = Progress.openBox(box, count, pay, `shop-${Date.now()}-${this.tx++}`);
    if (!r.ok) {
      this.cameras.main.shake(120, 0.004);
      return;
    }
    this.busy = true;
    this.refresh();
    this.cameras.main.flash(300, 200, 160, 255);
    this.showResults(r.results, r.rewards);
    this.time.delayedCall(400 + r.results.length * 90, () => {
      this.busy = false;
      this.refresh();
    });
  }

  private clearLayer(): void {
    this.layer.forEach((o) => o.destroy());
    this.layer = [];
  }

  private overlay(title: string): <T extends Phaser.GameObjects.GameObject>(o: T) => T {
    this.clearLayer();
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => (this.layer.push(o), (o as unknown as { setDepth: (n: number) => T }).setDepth?.(100) ?? o);
    add(this.add.rectangle(360, 640, 720, 1280, 0x000000, 0.82).setInteractive());
    add(this.add.text(360, 170, title, { fontFamily: FONT, fontSize: '36px', fontStyle: 'bold', color: '#ffd34d' }).setOrigin(0.5));
    const close = makeButton(this, 360, 1150, 360, 80, '닫기', 0x3a4458, () => this.clearLayer(), 28);
    add(close.bg);
    add(close.label);
    return add;
  }

  private showResults(results: BoxResult[], rewards: Reward[]): void {
    const add = this.overlay('개봉 결과');
    const n = results.length;
    results.forEach((res, i) => {
      const x = n === 1 ? 360 : 76 + (i % 5) * 142;
      const y = n === 1 ? 560 : 400 + Math.floor(i / 5) * 260;
      const big = n === 1 ? 1.6 : 1;
      const { color, title, sub, portrait, icon } = describe(res);
      const card = add(this.add.rectangle(x, y, 132 * big, 220 * big, 0x221a33).setStrokeStyle(4, color));
      if (portrait) add(this.add.image(x, y - 30 * big, `portrait-${portrait}`).setScale(0.55 * big));
      else add(this.add.text(x, y - 30 * big, icon, { fontFamily: FONT, fontSize: `${54 * big}px` }).setOrigin(0.5));
      add(this.add.text(x, y + 48 * big, title, { fontFamily: FONT, fontSize: `${17 * big}px`, color: '#ffffff', align: 'center', wordWrap: { width: 124 * big } }).setOrigin(0.5, 0));
      add(this.add.text(x, y + 82 * big, sub, { fontFamily: FONT, fontSize: `${16 * big}px`, color: hex(color), fontStyle: 'bold', align: 'center' }).setOrigin(0.5, 0));
      card.setScale(0.01, 1);
      this.tweens.add({ targets: card, scaleX: 1, duration: 180, delay: i * 90 });
    });
    if (rewards.length) add(this.add.text(360, 230, rewards.map((w) => `💎 ${w.text}: 루비 +${w.rubies}`).join('\n'), { fontFamily: FONT, fontSize: '22px', color: '#ffd34d', align: 'center' }).setOrigin(0.5));
  }

  /** 확률 공개(원문: 희귀도별 확률과 천장 조건을 정확히 고지) */
  private showRates(): void {
    const add = this.overlay('확률·보장 안내');
    const B = DRAGON_BOX;
    const kTotal = Object.values(B.kind).reduce((a, b) => a + b, 0);
    const rTotal = Object.values(B.essenceRarity).reduce((a, b) => a + b, 0);
    const pct = (v: number) => `${(v * 100).toFixed(v * 100 < 1 ? 3 : 2).replace(/\.?0+$/, '')}%`;
    const lines: string[] = [];
    lines.push(`[드래곤·스킬 상자] 1차: 카드 ${B.kind.card}% · 조각 ${B.kind.fragment}% · 정수 ${B.kind.essence}% · 특수 스킬 조각 ${B.kind.special}%`);
    for (const r of RARITIES) {
      const ids = poolOf(r, false);
      const p = (B.kind.essence / kTotal) * (B.essenceRarity[r] / rTotal);
      lines.push(`  정수 ${RARITY_LABEL[r]} ${B.essenceRarity[r]}% → 상자 전체 ${pct(p)} (${ids.map((id) => DRAGONS[id].short).join('·')} 각 ${pct(p / ids.length)})`);
    }
    lines.push(`  전설 정수의 상자 전체 확률은 ${pct((B.kind.essence / kTotal) * (B.essenceRarity.legendary / rTotal))} (정수 15% × 전설 1%)`);
    lines.push(`  보장: 매 ${B.rareGuarantee}회째 희귀 이상 정수(희귀:영웅:전설 = ${B.guaranteeWeights.rare}:${B.guaranteeWeights.epic}:${B.guaranteeWeights.legendary}), ${B.legendaryGuarantee}회째 전설 정수 — 그 회차 결과를 대신함`);
    lines.push(`  카드: 일반 ${B.cardCount.common}·희귀 ${B.cardCount.rare}·영웅 ${B.cardCount.epic}·전설 ${B.cardCount.legendary}장(레드 포함) · 조각: ${B.fragmentCount.common}/${B.fragmentCount.rare}/${B.fragmentCount.epic}/${B.fragmentCount.legendary}개 · 특수 스킬 조각 ${B.specialFragments}개(15종 균등)`);
    lines.push(`  중복 정수 → 조각 ${ESSENCE.essenceToFragments.common}/${ESSENCE.essenceToFragments.rare}/${ESSENCE.essenceToFragments.epic}/${ESSENCE.essenceToFragments.legendary} · 레드는 정수·조각 대상 아님`);
    lines.push('');
    lines.push(`[장비 상자] 일반 ${EQUIPMENT_BOX.rarity.common}% · 희귀 ${EQUIPMENT_BOX.rarity.rare}% · 영웅 ${EQUIPMENT_BOX.rarity.epic}% · 전설 ${EQUIPMENT_BOX.rarity.legendary}% · 장비 8종 균등`);
    lines.push(`[골드 상자] ${GOLD_BOX.table.map(([g, w]) => `${g.toLocaleString()}G ${w}%`).join(' · ')}`);
    lines.push('');
    lines.push('모든 수치는 출시 전 임시 밸런스 값입니다. 루비는 게임 안 보상으로만 얻으며 현금 결제는 없습니다.');
    add(this.add.text(36, 230, lines.join('\n'), { fontFamily: FONT, fontSize: '18px', color: '#e1d5f5', lineSpacing: 9, wordWrap: { width: 650 } }));
  }
}

function describe(res: BoxResult): { color: number; title: string; sub: string; portrait?: string; icon: string } {
  switch (res.kind) {
    case 'essence':
      return {
        color: RARITY_COLOR[res.rarity], portrait: res.dragonId, icon: '',
        title: `${DRAGONS[res.dragonId].short} 정수${res.guaranteed ? ' (보장)' : ''}`,
        sub: res.isNew ? 'NEW! 해금' : `조각 +${res.fragments}`,
      };
    case 'card':
      return { color: RARITY_COLOR[res.rarity], portrait: res.dragonId, icon: '', title: `${DRAGONS[res.dragonId].short} 카드`, sub: `+${res.count}장` };
    case 'fragment':
      return { color: RARITY_COLOR[res.rarity], portrait: res.dragonId, icon: '', title: `${DRAGONS[res.dragonId].short} 조각`, sub: `+${res.count}` };
    case 'special': {
      const s = specialDef(res.specialId)!;
      return { color: s.color, icon: s.icon, title: s.name, sub: `조각 +${res.count}` };
    }
    case 'equipment': {
      const d = equipDef(res.item.itemId)!;
      return { color: RARITY_COLOR[res.item.rarity], icon: SLOT_ICON[d.slot], title: `${d.name}\n${SLOT_LABEL[d.slot]}`, sub: RARITY_LABEL[res.item.rarity] };
    }
    case 'gold':
      return { color: 0xffd34d, icon: '🪙', title: '골드', sub: `+${res.gold.toLocaleString()}G` };
  }
}
