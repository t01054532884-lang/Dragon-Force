import Phaser from 'phaser';
import { makeTextures } from '../textures';
import {
  DRAGON_ORDER, DRAGONS, ELEMENT_LABEL, GROWTH, RARITY_COLOR, RARITY_LABEL, levelBonus, starBonus, type DragonId,
} from '../data/dragons';
import { buildRunStats } from '../data/progression';
import { Progress } from '../systems/Progress';
import { FONT, makeButton, type Button } from '../ui/widgets';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/**
 * 드래곤 선택 · 도감 · 상세 · 육성 (6단계 기획서 7장 UI).
 * 위: 10종 목록(미보유는 어두운 실루엣) / 아래: 고른 드래곤의 상세(능력치·기본 공격 Lv.1~7·특성·레벨·승급).
 */
export class DragonsScene extends Phaser.Scene {
  private viewing: DragonId = 'red';
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
    this.add.text(360, 46, '드래곤', { fontFamily: FONT, fontSize: '44px', fontStyle: 'bold', color: '#ffd34d' }).setOrigin(0.5);
    this.headerText = this.add.text(360, 92, '', { fontFamily: FONT, fontSize: '22px', color: '#c9d3ee' }).setOrigin(0.5);

    // 10종 목록(5 × 2)
    DRAGON_ORDER.forEach((id, i) => {
      const x = 76 + (i % 5) * 142;
      const y = 200 + Math.floor(i / 5) * 172;
      const frame = this.add.rectangle(x, y, 132, 160, 0x1d2430).setStrokeStyle(3, RARITY_COLOR[DRAGONS[id].rarity], 0.8);
      const img = this.add.image(x, y - 12, `portrait-${id}`).setScale(0.62);
      const label = this.add.text(x, y + 56, DRAGONS[id].short, { fontFamily: FONT, fontSize: '22px', color: '#ffffff' }).setOrigin(0.5);
      const mark = this.add.text(x + 58, y - 74, '', { fontFamily: FONT, fontSize: '20px', color: '#ffd34d' }).setOrigin(1, 0);
      frame.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.viewing = id;
        this.refresh();
      });
      this.cards.push({ id, frame, img, label, mark });
    });

    this.msg = this.add.text(360, 1150, '', { fontFamily: FONT, fontSize: '22px', color: '#ff8a80' }).setOrigin(0.5);
    makeButton(this, 205, 1225, 290, 80, '로비로', 0x3a4458, () => this.scene.start('lobby'), 30);
    makeButton(this, 515, 1225, 290, 80, '소환', 0x6a3fb5, () => this.scene.start('summon'), 30);
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('lobby'));
    this.refresh();
  }

  private refresh(): void {
    const p = Progress.load();
    const owned = Object.keys(p.ownedDragons).length;
    this.headerText.setText(`보유 ${owned} / 10 · 🪙 ${p.gold.toLocaleString()}G · 🎟 ${p.summonTickets}장`);
    for (const c of this.cards) {
      const o = p.ownedDragons[c.id];
      if (o) c.img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      else c.img.setTint(0x0b0e14).setTintMode(Phaser.TintModes.FILL); // 미보유: 실루엣
      c.img.setAlpha(o ? 1 : 0.9);
      c.label.setText(o ? DRAGONS[c.id].short : '???').setColor(o ? '#ffffff' : '#6f7a8c');
      c.mark.setText(p.selectedDragonId === c.id ? '출격' : o ? `Lv.${o.level}` : '');
      c.frame.setFillStyle(this.viewing === c.id ? 0x2c3a52 : 0x1d2430).setStrokeStyle(this.viewing === c.id ? 5 : 3, RARITY_COLOR[DRAGONS[c.id].rarity], this.viewing === c.id ? 1 : 0.6);
    }
    this.drawDetail();
  }

  private drawDetail(): void {
    this.detail.forEach((o) => o.destroy());
    this.detail = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => (this.detail.push(o), o);
    const p = Progress.load();
    const d = DRAGONS[this.viewing];
    const o = p.ownedDragons[d.id];
    const level = o?.level ?? 1;
    const stars = o?.stars ?? 1;
    const top = 470;

    add(this.add.rectangle(360, top + 330, 680, 640, 0x1a1f2b).setStrokeStyle(3, RARITY_COLOR[d.rarity], 0.6));
    const img = add(this.add.image(130, top + 110, `portrait-${d.id}`).setScale(0.95));
    if (!o) img.setTint(0x0b0e14).setTintMode(Phaser.TintModes.FILL);
    const txt = (x: number, y: number, s: string, size = 22, color = '#ffffff', bold = false) =>
      add(this.add.text(x, y, s, { fontFamily: FONT, fontSize: `${size}px`, color, fontStyle: bold ? 'bold' : 'normal', wordWrap: { width: 700 - x - 30 } }));

    txt(240, top + 20, d.name, 36, '#ffffff', true);
    txt(240, top + 66, `${ELEMENT_LABEL[d.element]} · ${RARITY_LABEL[d.rarity]} · ${d.role}`, 22, hex(RARITY_COLOR[d.rarity]));
    txt(240, top + 100, `${'★'.repeat(stars)}${'☆'.repeat(GROWTH.maxStars - stars)}  영구 Lv.${level} / ${GROWTH.maxLevel}${o ? '' : '  (미보유)'}`, 24, '#ffd34d');

    // 능력치: 드래곤 기본값 × (1 + 연구소 + 레벨 + 승급)
    const built = buildRunStats(d, p.upgrades, { level, stars });
    const lb = levelBonus(level);
    const sb = starBonus(stars);
    const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
    txt(240, top + 140, `공격력 ${built.stats.attack.toFixed(1)}  ·  HP ${Math.round(built.stats.maxHp)}  ·  속도 ${Math.round(built.stats.speed)}`, 22);
    txt(240, top + 170, `레벨 +${pct(lb.attack)}/+${pct(lb.hp)} · 승급 +${pct(sb.attack)}/+${pct(sb.hp)} (공격/HP, 연구소 별도)`, 18, '#9aa6bd');
    const traitNote = sb.traitMult > 1 ? ` (승급 강화 ×${sb.traitMult})` : '';
    txt(40, top + 226, `고유 특성: ${d.trait.text}${traitNote}`, 22, '#a5d6a7');

    // 기본 공격 Lv.1~7 미리보기
    txt(40, top + 266, `기본 공격 — ${d.basic.icon} ${d.basic.name} (전투마다 Lv.1부터)`, 22, '#ffcc80', true);
    d.basic.levels.forEach((L, i) =>
      add(this.add.text(48, top + 300 + i * 30, `Lv.${i + 1}  ${L.text}`, { fontFamily: FONT, fontSize: '18px', color: i === 6 ? '#ffd34d' : '#dfe6f5', wordWrap: { width: 620 } })),
    );

    // 육성 버튼
    const by = top + 560;
    const btns: Button[] = [];
    if (o) {
      const lvCost = GROWTH.levelCost(o.level);
      const lvMax = o.level >= GROWTH.maxLevel;
      const lvBtn = makeButton(this, 150, by, 230, 84, lvMax ? '레벨 MAX' : `레벨업\n${lvCost.toLocaleString()}G`, 0x2e8b57, () => this.grow('level'), 24);
      lvBtn.setEnabled(!lvMax && p.gold >= lvCost);
      btns.push(lvBtn);
      const stMax = o.stars >= GROWTH.maxStars;
      const need = stMax ? 0 : GROWTH.starCost[o.stars - 1];
      const stBtn = makeButton(this, 380, by, 210, 84, stMax ? '승급 MAX' : `승급 ${o.shards}/${need}\n조각`, 0x7a5a12, () => this.grow('star'), 24);
      stBtn.setEnabled(!stMax && o.shards >= need);
      btns.push(stBtn);
      const sel = p.selectedDragonId === d.id;
      const selBtn = makeButton(this, 590, by, 190, 84, sel ? '출격 중' : '출격 선택', 0xc0392b, () => {
        Progress.select(d.id);
        this.refresh();
      }, 26);
      selBtn.setEnabled(!sel);
      btns.push(selBtn);
      if (d.id === 'red' && !stMax) txt(40, by + 50, '레드는 소환 대상이 아니라 조각 획득처가 아직 없습니다.', 16, '#6f7a8c');
    } else {
      txt(40, by - 20, `미보유 — 소환으로 획득(${RARITY_LABEL[d.rarity]} 등급)`, 24, '#9aa6bd');
    }
    for (const b of btns) this.detail.push(b.bg, b.label);
  }

  private grow(kind: 'level' | 'star'): void {
    const r = kind === 'level' ? Progress.levelUp(this.viewing) : Progress.starUp(this.viewing);
    if (!r.ok) {
      this.msg.setText({ gold: `골드가 부족합니다(${r.cost}G)`, shards: `조각이 부족합니다(${r.cost}개)`, max: '이미 최대입니다', locked: '보유하지 않은 드래곤입니다' }[r.reason]);
    } else {
      this.msg.setText('');
      const t = this.add.text(360, 560, kind === 'level' ? '레벨 업!' : '승급!', { fontFamily: FONT, fontSize: '48px', fontStyle: 'bold', color: '#ffe082', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5);
      this.tweens.add({ targets: t, y: 580, alpha: 0, duration: 700, onComplete: () => t.destroy() });
    }
    this.refresh();
  }
}
