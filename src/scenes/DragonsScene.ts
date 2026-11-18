import Phaser from 'phaser';
import { makeTextures } from '../textures';
import {
  DRAGON_ORDER, DRAGONS, ELEMENT_LABEL, GROWTH, RARITY_COLOR, RARITY_LABEL, levelBonus, starBonus, traitMultFor, type DragonId,
} from '../data/dragons';
import { PERM_TIER_LEVELS, PERM_TIERS } from '../data/permGrowth';
import { SIGNATURES } from '../data/signature';
import { econRarity, ESSENCE, UNIVERSAL } from '../data/economy';
import { Progress, universalLimit } from '../systems/Progress';
import { loadout } from '../systems/Loadout';
import { FONT, makeButton, type Button } from '../ui/widgets';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
type Tab = 'basic' | 'perm';

/**
 * 드래곤 선택 · 도감 · 상세 · 육성 (6단계 v1.2).
 * 위: 10종 목록(미보유는 어두운 실루엣) / 아래: 상세(능력치·전투력·특성·전용 액티브·기본 공격 또는 영구 성장표)와
 * 육성(레벨업 = 카드 + 골드, 승급 = 조각(+범용 조각), 미보유는 조각 → 정수 해금, 5성 이후 범용 조각 교환).
 */
export class DragonsScene extends Phaser.Scene {
  private viewing: DragonId = 'red';
  private tab: Tab = 'perm';
  private detail: Phaser.GameObjects.GameObject[] = [];
  private cards: { id: DragonId; frame: Phaser.GameObjects.Rectangle; img: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; mark: Phaser.GameObjects.Text }[] = [];
  private headerText!: Phaser.GameObjects.Text;
  private msg!: Phaser.GameObjects.Text;

  constructor() {
    super('dragons');
  }

  /** 뒤로가기: 로비로 */
  onPlatformBack(): boolean {
    this.scene.start('lobby');
    return true;
  }

  init(data: { view?: DragonId }): void {
    this.viewing = data?.view ?? Progress.load().selectedDragonId;
  }

  create(): void {
    if (!this.textures.exists('dragon-red')) makeTextures(this);
    this.cards = [];
    this.detail = [];
    this.add.rectangle(360, 640, 720, 1280, 0x12161e);
    this.add.text(360, 40, '드래곤', { fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#ffd34d' }).setOrigin(0.5);
    this.headerText = this.add.text(360, 82, '', { fontFamily: FONT, fontSize: '21px', color: '#c9d3ee' }).setOrigin(0.5);

    // 10종 목록(5 × 2)
    DRAGON_ORDER.forEach((id, i) => {
      const x = 76 + (i % 5) * 142;
      const y = 180 + Math.floor(i / 5) * 158;
      const frame = this.add.rectangle(x, y, 132, 148, 0x1d2430).setStrokeStyle(3, RARITY_COLOR[DRAGONS[id].rarity], 0.8);
      const img = this.add.image(x, y - 12, `portrait-${id}`).setDisplaySize(108, 108);
      const label = this.add.text(x, y + 50, DRAGONS[id].short, { fontFamily: FONT, fontSize: '20px', color: '#ffffff' }).setOrigin(0.5);
      const mark = this.add.text(x + 58, y - 68, '', { fontFamily: FONT, fontSize: '18px', color: '#ffd34d' }).setOrigin(1, 0);
      frame.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.viewing = id;
        this.msg.setText('');
        this.refresh();
      });
      this.cards.push({ id, frame, img, label, mark });
    });

    this.msg = this.add.text(360, 1160, '', { fontFamily: FONT, fontSize: '22px', color: '#ff8a80' }).setOrigin(0.5);
    makeButton(this, 205, 1230, 290, 76, '로비로', 0x3a4458, () => this.scene.start('lobby'), 28);
    makeButton(this, 515, 1230, 290, 76, '상점', 0x6a3fb5, () => this.scene.start('shop'), 28);
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('lobby'));
    this.refresh();
  }

  private refresh(): void {
    const p = Progress.load();
    const owned = DRAGON_ORDER.filter((id) => p.dragons[id].unlocked).length;
    this.headerText.setText(`보유 ${owned} / 10 · 🪙 ${p.gold.toLocaleString()}G · 범용 조각 ${p.universalFragments}`);
    for (const c of this.cards) {
      const o = p.dragons[c.id];
      if (o.unlocked) c.img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      else c.img.setTint(0x0b0e14).setTintMode(Phaser.TintModes.FILL); // 미보유: 실루엣
      c.label.setText(o.unlocked ? DRAGONS[c.id].short : '???').setColor(o.unlocked ? '#ffffff' : '#6f7a8c');
      c.mark.setText(p.selectedDragonId === c.id ? '출격' : o.unlocked ? `Lv.${o.level}` : o.fragments > 0 ? `조각 ${o.fragments}` : '');
      const v = this.viewing === c.id;
      c.frame.setFillStyle(v ? 0x2c3a52 : 0x1d2430).setStrokeStyle(v ? 5 : 3, RARITY_COLOR[DRAGONS[c.id].rarity], v ? 1 : 0.6);
    }
    this.drawDetail();
  }

  private drawDetail(): void {
    this.detail.forEach((o) => o.destroy());
    this.detail = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => (this.detail.push(o), o);
    const p = Progress.load();
    const d = DRAGONS[this.viewing];
    const o = p.dragons[d.id];
    const top = 410;

    add(this.add.rectangle(360, top + 355, 690, 710, 0x1a1f2b).setStrokeStyle(3, RARITY_COLOR[d.rarity], 0.6));
    const img = add(this.add.image(115, top + 95, `portrait-${d.id}`).setDisplaySize(154, 154));
    if (!o.unlocked) img.setTint(0x0b0e14).setTintMode(Phaser.TintModes.FILL);
    const txt = (x: number, y: number, s: string, size = 20, color = '#ffffff', bold = false, w = 700 - x - 24) =>
      add(this.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: bold ? 'bold' : 'normal', wordWrap: { width: w }, lineSpacing: 3 }));

    txt(220, top + 14, d.name, 32, '#ffffff', true);
    txt(220, top + 54, `${ELEMENT_LABEL[d.element]} · ${RARITY_LABEL[d.rarity]} · ${d.role}`, 20, hex(RARITY_COLOR[d.rarity]));
    txt(220, top + 84, `${'★'.repeat(o.stars)}${'☆'.repeat(GROWTH.maxStars - o.stars)}  영구 Lv.${o.level} / ${GROWTH.maxLevel}${o.unlocked ? '' : '  (미보유)'}`, 22, '#ffd34d');

    // 능력치·전투력: 장비·특수 스킬까지 포함한 실제 출격 값(로비와 같은 계산)
    const lo = loadout(p, d.id);
    const lb = levelBonus(o.level);
    const sb = starBonus(o.stars);
    const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
    txt(220, top + 118, `공격력 ${lo.stats.attack.toFixed(1)} · HP ${Math.round(lo.stats.maxHp)} · 속도 ${Math.round(lo.stats.speed)}  ·  전투력 ${lo.cp.toLocaleString()}`, 20);
    txt(220, top + 146, `레벨 +${pct(lb.attack)}/+${pct(lb.hp)} · 승급 +${pct(sb.attack)}/+${pct(sb.hp)} (공격/HP) · 장비·연구소 포함`, 16, '#9aa6bd');
    const tm = traitMultFor(d.id, o.stars);
    const traitNote = d.id === 'red' ? (tm > 0 ? ' (활성)' : ' (1~4성 비활성)') : tm > 1 ? ` (승급 강화 ×${tm})` : '';
    txt(30, top + 192, `고유 특성: ${d.trait.text}${traitNote}`, 20, '#a5d6a7');
    const sg = SIGNATURES[d.id];
    txt(30, top + 222, `전용 액티브: ${sg.icon} ${sg.name} — ${sg.detail} · 재사용 60초`, 18, '#ffcc80');

    // 탭: 영구 성장표 / 기본 공격 Lv.1~7
    const tabY = top + 290;
    const tabs: [Tab, string][] = [['perm', '영구 성장(5레벨마다)'], ['basic', `기본 공격 ${d.basic.icon} ${d.basic.name}`]];
    tabs.forEach(([t, label], i) => {
      const b = makeButton(this, 190 + i * 340, tabY, 320, 50, label, this.tab === t ? 0x2e5d8a : 0x252c3a, () => {
        this.tab = t;
        this.drawDetail();
      }, 19);
      this.detail.push(b.bg, b.label);
    });
    const listY = tabY + 36;
    if (this.tab === 'perm') {
      PERM_TIERS[d.id].forEach((tier, i) => {
        const lv = PERM_TIER_LEVELS[i];
        const on = o.level >= lv;
        add(this.add.text(40, listY + i * 34, `${on ? '✔' : '·'} Lv.${lv}  ${tier.name}`, { fontFamily: FONT, fontSize: '18px', color: on ? '#ffd34d' : '#8a93a6', fontStyle: on ? 'bold' : 'normal' }));
        add(this.add.text(250, listY + i * 34, tier.text, { fontFamily: FONT, fontSize: '17px', color: on ? '#dfe6f5' : '#6f7a8c', wordWrap: { width: 430 } }));
      });
    } else {
      d.basic.levels.forEach((L, i) =>
        add(this.add.text(40, listY + i * 38, `Lv.${i + 1}  ${L.text}`, { fontFamily: FONT, fontSize: '17px', color: i === 6 ? '#ffd34d' : '#dfe6f5', wordWrap: { width: 640 } })),
      );
    }

    // 육성 버튼
    const by = top + 640;
    const btns: Button[] = [];
    if (o.unlocked) {
      const lvMax = o.level >= GROWTH.maxLevel;
      const lvGold = GROWTH.levelCost(o.level);
      const lvCards = GROWTH.cardCost(o.level);
      const lvBtn = makeButton(this, 125, by, 210, 90, lvMax ? '레벨 MAX' : `레벨업\n카드 ${o.cards}/${lvCards} · ${lvGold.toLocaleString()}G`, 0x2e8b57, () => this.grow('level'), 18);
      lvBtn.setEnabled(!lvMax && o.cards >= lvCards && p.gold >= lvGold);
      btns.push(lvBtn);
      const stMax = o.stars >= GROWTH.maxStars;
      if (stMax) {
        const rate = UNIVERSAL.rate[econRarity(d.rarity)];
        const b = makeButton(this, 350, by, 220, 90, `범용 조각 교환\n조각 ${o.fragments} (${rate}:1)`, 0x7a5a12, () => this.grow('universal'), 18);
        b.setEnabled(o.fragments >= rate);
        btns.push(b);
      } else {
        const need = GROWTH.starCost[o.stars - 1];
        const uni = Math.min(Math.max(0, need - o.fragments), p.universalFragments, universalLimit(d.id, need));
        const can = o.fragments + uni >= need;
        const b = makeButton(this, 350, by, 220, 90, `승급\n조각 ${o.fragments}/${need}${uni > 0 ? ` +범용 ${uni}` : ''}`, 0x7a5a12, () => this.grow('star'), 18);
        b.setEnabled(can);
        btns.push(b);
      }
      const sel = p.selectedDragonId === d.id;
      const selBtn = makeButton(this, 575, by, 210, 90, sel ? '출격 중' : '출격 선택', 0xc0392b, () => {
        Progress.select(d.id);
        this.refresh();
      }, 24);
      selBtn.setEnabled(!sel);
      btns.push(selBtn);
      const note = d.id === 'red'
        ? '레드 조각: 난이도 진행도 50% 상자·미션·이벤트 · 카드: 스테이지 클리어(최초 2·반복 1)·상자·미션'
        : `카드: 스테이지 클리어·상자·미션 · 조각: 상자·중복 정수(${ESSENCE.essenceToFragments[econRarity(d.rarity)]}개)`;
      txt(30, by + 52, note, 15, '#6f7a8c');
    } else {
      const cost = ESSENCE.fragmentsToEssence[econRarity(d.rarity)];
      txt(30, by - 40, `미보유 — 드래곤·스킬 상자의 정수로 즉시 해금, 또는 조각 ${cost}개를 정수 1개로 교환`, 19, '#9aa6bd');
      const b = makeButton(this, 360, by + 20, 420, 76, `조각 ${o.fragments}/${cost} → 정수로 해금`, 0x6a3fb5, () => this.grow('essence'), 22);
      b.setEnabled(o.fragments >= cost);
      btns.push(b);
    }
    for (const b of btns) this.detail.push(b.bg, b.label);
  }

  private grow(kind: 'level' | 'star' | 'essence' | 'universal'): void {
    const id = this.viewing;
    const r =
      kind === 'level' ? Progress.levelUp(id) :
      kind === 'star' ? Progress.starUp(id, true) :
      kind === 'essence' ? Progress.exchangeEssence(id) : Progress.toUniversal(id);
    if (!r.ok) {
      const msg: Record<string, string> = {
        gold: `골드가 부족합니다(${r.cost?.toLocaleString()}G)`, cards: '카드가 부족합니다', fragments: `조각이 부족합니다(${r.cost}개)`,
        max: '이미 최대입니다', locked: '보유하지 않은 드래곤입니다', owned: '이미 보유한 드래곤입니다', not5: '5성 이후에 교환할 수 있습니다',
      };
      this.msg.setText(msg[r.reason] ?? '할 수 없습니다');
    } else {
      this.msg.setText('');
      const label = { level: '레벨 업!', star: '승급!', essence: '해금!', universal: '범용 조각 교환' }[kind];
      const t = this.add.text(360, 520, label, { fontFamily: FONT, fontSize: '46px', fontStyle: 'bold', color: '#ffe082', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5).setDepth(50);
      this.tweens.add({ targets: t, y: 500, alpha: 0, duration: 700, onComplete: () => t.destroy() });
    }
    this.refresh();
  }
}
