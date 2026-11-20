import Phaser from 'phaser';
import { makeTextures } from '../textures';
import { DRAGONS, RARITY_COLOR, RARITY_LABEL } from '../data/dragons';
import { BOXES, DRAGON_BOX, EQUIPMENT_BOX, ESSENCE, GOLD_BOX, RARITIES, type BoxId } from '../data/economy';
import { equipDef, SLOT_ICON, SLOT_LABEL } from '../data/equipment';
import { specialDef } from '../data/specials';
import { poolOf, Progress, type BoxResult, type Reward } from '../systems/Progress';
import { devMode } from '../ui/widgets';
import { ChestOpening } from '../ui/ChestOpening';
import { dragonUnlock } from '../ui/celebrate';
import { CHEST_SFX_FILES, playSfx, preloadSfx } from '../systems/Sfx';
import { CHEST_LAYER_KEYS, equipIcon, preloadArt, preloadKeys } from '../ui/art';
import { badge, button, progressBar, text, type KitButton } from '../ui/kit';
import { plate } from '../ui/kit2';
import { screenFrame, type ScreenFrame } from '../ui/screen';
import { COLOR, css, TYPE } from '../ui/theme';

/**
 * 루비 상점(6단계 v1.2 6장): 드래곤·스킬 상자 / 장비 상자 / 골드 상자, 1회·10회(10% 할인).
 * 기존 소환권은 드래곤·스킬 상자 무료 개봉권으로 쓴다. 루비는 게임 안 보상·이벤트로만 얻는다(첫 출시: 현금 결제 없음).
 * 8단계 v2.0 C: 로비와 같은 머리줄·리본·하단 탭, 시안 형식(큰 소환 배너 · 보장 진행 막대 · 상자 카드 2장). 규칙·가격·저장은 그대로.
 */
export class ShopScene extends Phaser.Scene {
  private frame!: ScreenFrame;
  private buttons: { btn: KitButton; box: BoxId; count: 1 | 10; pay: 'ruby' | 'ticket' }[] = [];
  private pityRoot: Phaser.GameObjects.Container | null = null;
  private ticketText!: Phaser.GameObjects.Text;
  private layer: Phaser.GameObjects.GameObject[] = [];
  private busy = false;
  private tx = 0;
  private opening: ChestOpening | null = null;

  constructor() {
    super('shop');
  }

  onPlatformBack(): boolean {
    if (this.opening && !this.opening.finished) this.opening.skip(); // 연출 중 뒤로가기 = 건너뛰기
    else if (this.layer.length) this.clearLayer();
    else this.scene.start('lobby');
    return true;
  }

  preload(): void {
    // 상자 개봉 연출 그림(파일이 없으면 ChestOpening이 도형 임시 그림으로 대신)
    preloadKeys(this, CHEST_LAYER_KEYS);
    preloadArt(this); // 로비에서 이미 읽었으면 건너뜀(로비 로딩 중 바로 넘어온 경우 대비)
    preloadSfx(this, CHEST_SFX_FILES); // 상자 개봉 효과음(public/sfx, 없으면 합성음)
  }

  create(): void {
    if (!this.textures.exists('dragon-red')) makeTextures(this);
    this.layer = [];
    this.buttons = [];
    this.busy = false;
    this.opening = null;
    this.pityRoot = null;
    // 화면을 떠나면 연출만 정리(보상은 개봉 순간 이미 저장됨)
    this.events.once('shutdown', () => this.opening?.destroy());
    this.frame = screenFrame(this, { title: '상점', nav: 'shop' });

    // ── 드래곤·스킬 상자: 큰 배너
    const D = BOXES.dragon;
    const ban = plate(this, 360, 392, 664, 300, { r: 26, gold: true, fill: 0x3a2370 });
    const glow = this.add.circle(0, -18, 130, COLOR.violet, 0.28);
    ban.add(glow);
    this.tweens.add({ targets: glow, scale: 1.12, alpha: 0.12, yoyo: true, repeat: -1, duration: 1100 });
    ban.add(this.add.image(-200, 0, 'portrait-blue').setDisplaySize(160, 160));
    ban.add(this.add.image(200, 0, 'portrait-arcane').setDisplaySize(160, 160));
    ban.add(this.add.image(0, -22, 'chest-dragon').setDisplaySize(210, 210));
    ban.add(text(this, 0, 92, D.name, 36, COLOR.gold, true, true).setOrigin(0.5));
    ban.add(text(this, 0, 124, D.desc, TYPE.tiny, COLOR.text, true, true).setOrigin(0.5));
    this.ticketText = text(this, -312, -128, '', TYPE.tiny, COLOR.text, true, true).setOrigin(0, 0.5);
    ban.add(this.ticketText);

    this.boxButtons('dragon', 600, 300, 88, TYPE.heading);
    // 무료 개봉권(기존 소환권) — 드래곤·스킬 상자 전용
    const t1 = button(this, 205, 692, 300, 58, '무료 개봉권 1회', () => this.open('dragon', 1, 'ticket'), { kind: 'secondary', icon: 'ui-ticket', size: TYPE.caption });
    const t10 = button(this, 515, 692, 300, 58, '무료 개봉권 10회', () => this.open('dragon', 10, 'ticket'), { kind: 'secondary', icon: 'ui-ticket', size: TYPE.caption });
    this.buttons.push({ btn: t1, box: 'dragon', count: 1, pay: 'ticket' }, { btn: t10, box: 'dragon', count: 10, pay: 'ticket' });

    // ── 장비 상자 · 골드 상자 카드
    (['equipment', 'gold'] as const).forEach((box, i) => {
      const def = BOXES[box];
      const x = 196 + i * 328;
      const card = plate(this, x, 935, 316, 214, { r: 22, fill: box === 'equipment' ? 0x1d3a52 : 0x4a3612 });
      card.add(this.add.image(-92, -36, `chest-${box}`).setDisplaySize(128, 128));
      card.add(text(this, 46, -62, def.name, TYPE.body, COLOR.text, true, true).setOrigin(0.5));
      card.add(text(this, 46, -26, def.desc, 16, COLOR.textSub, true).setOrigin(0.5).setWordWrapWidth(170).setAlign('center'));
      this.boxButtons(box, 935 + 60, 142, 60, TYPE.caption, x);
    });

    // ── 확률 안내 · 루비 얻는 곳
    button(this, 360, 1074, 360, 52, '확률 · 보장 안내 보기', () => this.showRates(), { kind: 'secondary', size: TYPE.caption });
    text(this, 360, 1112, '루비: 진행도 100% 보상 · 업적 · 미션 · 이벤트 (현금 결제 없음)', 16, COLOR.textDim, true).setOrigin(0.5);

    if (devMode()) {
      const t = text(this, 704, 238, '[개발용] 루비·골드·카드 +', 16, 0xc98a8a, true, true).setOrigin(1, 0.5).setDepth(41);
      t.setInteractive({ useHandCursor: true }).on('pointerdown', () => (Progress.devGrant(), this.refresh()));
    }
    this.input.keyboard?.on('keydown-ESC', () => this.onPlatformBack());
    this.refresh();
  }

  /** 1회·10회 버튼 한 쌍. cx = 두 버튼의 가운데(기본 화면 가운데) */
  private boxButtons(box: BoxId, y: number, w: number, h: number, size: number, cx = 360): void {
    const def = BOXES[box];
    const gap = box === 'dragon' ? 10 : 6;
    const kind = box === 'dragon' ? undefined : 'magic';
    const b1 = button(this, cx - w / 2 - gap, y, w, h, '1회', () => this.open(box, 1, 'ruby'), { kind: kind ?? 'growth', icon: 'ui-ruby', sub: def.price1.toLocaleString(), size });
    const b10 = button(this, cx + w / 2 + gap, y, w, h, '10회', () => this.open(box, 10, 'ruby'), { kind: kind ?? 'cta', icon: 'ui-ruby', sub: def.price10.toLocaleString(), size });
    if (box === 'dragon') b10.root.add(badge(this, w / 2 - 34, -h / 2 - 6, '10% 할인', COLOR.ruby));
    this.buttons.push({ btn: b1, box, count: 1, pay: 'ruby' }, { btn: b10, box, count: 10, pay: 'ruby' });
  }

  private refresh(): void {
    const p = Progress.load();
    this.frame.refresh();
    this.ticketText.setText(`무료 개봉권 ${p.summon.legacyTickets}장`);
    // 보장 진행: 희귀 이상(10회) 막대 + 전설(90회) 숫자
    this.pityRoot?.destroy();
    const pity = plate(this, 360, 770, 664, 68, { r: 20 });
    pity.add(text(this, -306, 0, '희귀 이상 보장', TYPE.tiny, COLOR.text, true, true).setOrigin(0, 0.5));
    const r10 = p.summon.tenPity / DRAGON_BOX.rareGuarantee;
    pity.add(progressBar(this, 10, 0, 250, 22, r10, COLOR.violet, `${p.summon.tenPity}/${DRAGON_BOX.rareGuarantee}`).root);
    pity.add(text(this, 306, 0, `전설 정수 ${p.summon.legendaryPity}/${DRAGON_BOX.legendaryGuarantee}`, TYPE.tiny, RARITY_COLOR.legendary, true, true).setOrigin(1, 0.5));
    this.pityRoot = pity;
    for (const b of this.buttons) {
      const price = b.count === 10 ? BOXES[b.box].price10 : BOXES[b.box].price1;
      const can = b.pay === 'ticket' ? p.summon.legacyTickets >= b.count : p.rubies >= price;
      b.btn.setEnabled(!this.busy && can);
    }
  }

  private open(box: BoxId, count: 1 | 10, pay: 'ruby' | 'ticket'): void {
    if (this.busy) return; // 연출 중 연속 클릭 방지(저장소 쪽에서도 거래 ID로 한 번만 반영)
    const r = Progress.openBox(box, count, pay, `shop-${Date.now()}-${this.tx++}`);
    if (!r.ok) {
      this.cameras.main.shake(120, 0.004);
      return;
    }
    // 보상은 위에서 확정·저장됨 → 이제 연출만(흔들림 → 뚜껑 → 빛·파티클 → 카드). 건너뛰어도 결과는 같다.
    this.busy = true;
    this.refresh();
    this.opening = new ChestOpening(this, box, r.results, () => {
      this.showResults(r.results, r.rewards);
      this.time.delayedCall(400 + r.results.length * 90, () => {
        this.busy = false;
        this.refresh();
      });
    });
    this.opening.play();
  }

  private clearLayer(): void {
    this.layer.forEach((o) => o.destroy());
    this.layer = [];
  }

  /** 결과·확률 창: 화면을 어둡게 덮고 판 + 리본 제목 + 닫기 */
  private overlay(title: string, h = 980): <T extends Phaser.GameObjects.GameObject>(o: T) => T {
    this.clearLayer();
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => (this.layer.push(o), (o as unknown as { setDepth: (n: number) => T }).setDepth?.(100) ?? o);
    add(this.add.rectangle(360, 640, 720, 1280, 0x000000, 0.82).setInteractive());
    add(plate(this, 360, 660, 680, h, { r: 28 }));
    const rb = add(this.add.container(360, 660 - h / 2, []));
    rb.add(plate(this, 0, 0, 360, 70, { r: 35, gold: true, fill: 0x3a2a6b }));
    rb.add(text(this, 0, 0, title, TYPE.heading, COLOR.gold, true, true).setOrigin(0.5));
    add(button(this, 360, 660 + h / 2 - 70, 340, 76, '닫기', () => this.clearLayer(), { kind: 'secondary', size: TYPE.body }).root);
    return add;
  }

  private showResults(results: BoxResult[], rewards: Reward[]): void {
    const add = this.overlay('개봉 결과');
    const n = results.length;
    results.forEach((res, i) => {
      const x = n === 1 ? 360 : 92 + (i % 5) * 134;
      const y = n === 1 ? 600 : 470 + Math.floor(i / 5) * 270;
      const big = n === 1 ? 1.6 : 1;
      const { color, title, sub, portrait, image, icon } = describe(res);
      const card = add(this.add.container(x, y));
      card.add(plate(this, 0, 0, 124 * big, 230 * big, { r: 18, fill: 0x221a33 }));
      const g = this.add.graphics();
      g.lineStyle(5, color, 1).strokeRoundedRect(-62 * big + 4, -115 * big + 4, 124 * big - 8, 230 * big - 8, 14);
      card.add(g);
      if (portrait) card.add(this.add.image(0, -40 * big, `portrait-${portrait}`).setDisplaySize(108 * big, 108 * big));
      else if (image && this.textures.exists(image)) card.add(this.add.image(0, -40 * big, image).setDisplaySize(96 * big, 96 * big));
      else card.add(text(this, 0, -40 * big, icon, 50 * big, color).setOrigin(0.5));
      card.add(text(this, 0, 30 * big, title, 17 * big, COLOR.text, true, true).setOrigin(0.5, 0).setWordWrapWidth(116 * big).setAlign('center'));
      card.add(text(this, 0, 76 * big, sub, 16 * big, color, true, true).setOrigin(0.5, 0));
      // 드래곤 정수: 일반 보상보다 강한 빛(속성 색 고리가 숨 쉬듯) + "정수" 배지 + 정수 소리(2026-11-21 기획서 4.4)
      if (res.kind === 'essence') {
        const dc = DRAGONS[res.dragonId].color;
        const glow = this.add.circle(0, -40 * big, 66 * big, dc, 0.35);
        card.addAt(glow, 1);
        this.tweens.add({ targets: glow, scale: 1.3, alpha: 0.08, duration: 650, yoyo: true, repeat: -1 });
        card.add(badge(this, 0, -118 * big, res.isNew ? 'NEW 정수' : '정수', res.isNew ? COLOR.ruby : 0x7a4fd0));
        this.time.delayedCall(i * 90 + 120, () => playSfx(this, 'sfx-essence'));
      }
      card.setScale(0.01, 1);
      this.tweens.add({ targets: card, scaleX: 1, duration: 180, delay: i * 90 });
    });
    if (rewards.length) add(text(this, 360, 268, rewards.map((w) => `${w.text}: 루비 +${w.rubies}`).join('\n'), TYPE.caption, COLOR.gold, true, true).setOrigin(0.5).setAlign('center'));
    // 새로 해금한 드래곤: 결과를 잠깐 보여 준 뒤 해금 축하(건너뛰기 가능, 여러 마리면 차례로)
    const fresh = results.flatMap((r) => (r.kind === 'essence' && r.isNew ? [r.dragonId] : []));
    if (fresh.length) this.time.delayedCall(700 + n * 90, () => dragonUnlock(this, fresh));
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
    add(this.add.text(48, 230, lines.join('\n'), { fontFamily: 'sans-serif', fontSize: '18px', color: css(0xe1d5f5), lineSpacing: 9, wordWrap: { width: 624 } }));
  }
}

function describe(res: BoxResult): { color: number; title: string; sub: string; portrait?: string; image?: string; icon: string } {
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
      return { color: RARITY_COLOR[res.item.rarity], image: equipIcon(d.slot, res.item.rarity), icon: SLOT_ICON[d.slot], title: `${d.name}\n${SLOT_LABEL[d.slot]}`, sub: RARITY_LABEL[res.item.rarity] };
    }
    case 'gold':
      return { color: 0xffd34d, image: 'ui-gold', icon: '🪙', title: '골드', sub: `+${res.gold.toLocaleString()}G` };
  }
}
