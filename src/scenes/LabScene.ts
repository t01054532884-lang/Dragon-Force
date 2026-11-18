import Phaser from 'phaser';
import { getUpgradeCost, PERMANENT_UPGRADES, UPGRADE_TYPES, type UpgradeType } from '../data/progression';
import { Progress } from '../systems/Progress';
import { loadout } from '../systems/Loadout';
import { STAGES } from '../data/stages';
import { FONT, makeButton, type Button } from '../ui/widgets';
import { enterBattle } from '../ui/entry';

interface Card {
  type: UpgradeType;
  bg: Phaser.GameObjects.Rectangle;
  level: Phaser.GameObjects.Text;
  effect: Phaser.GameObjects.Text;
  buy: Button;
}

// 드래곤 성장 연구소: 골드로 영구 능력치 4종 강화 (5단계 기획서 6장)
export class LabScene extends Phaser.Scene {
  private cards: Card[] = [];
  private goldText!: Phaser.GameObjects.Text;
  private msg!: Phaser.GameObjects.Text;

  constructor() {
    super('lab');
  }

  /** 뒤로가기: 로비로 */
  onPlatformBack(): boolean {
    this.scene.start('lobby');
    return true;
  }

  create(): void {
    this.cards = [];
    this.add.rectangle(360, 640, 720, 1280, 0x15120c);
    this.add.text(360, 90, '드래곤 성장 연구소', { fontFamily: FONT, fontSize: '52px', fontStyle: 'bold', color: '#ffd34d', stroke: '#000', strokeThickness: 6 }).setOrigin(0.5);
    this.add.text(360, 150, '영구 능력치 강화 · 모든 드래곤 공통 · 다음 전투부터 적용', { fontFamily: FONT, fontSize: '22px', color: '#c9b98f' }).setOrigin(0.5);
    this.goldText = this.add.text(360, 215, '', { fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#ffd34d' }).setOrigin(0.5);

    UPGRADE_TYPES.forEach((type, i) => {
      const y = 360 + i * 205;
      const def = PERMANENT_UPGRADES[type];
      const bg = this.add.rectangle(360, y, 660, 185, 0x241f16).setStrokeStyle(3, 0x7a5a12);
      this.add.text(80, y, def.icon, { fontFamily: FONT, fontSize: '60px' }).setOrigin(0.5);
      this.add.text(130, y - 62, def.name, { fontFamily: FONT, fontSize: '32px', fontStyle: 'bold', color: '#ffffff' });
      const level = this.add.text(130, y - 18, '', { fontFamily: FONT, fontSize: '24px', color: '#ffd34d' });
      const effect = this.add.text(130, y + 18, '', { fontFamily: FONT, fontSize: '22px', color: '#c9d3ee', lineSpacing: 4 });
      const buy = makeButton(this, 580, y, 170, 120, '', 0x2e8b57, () => this.buy(type), 26);
      this.cards.push({ type, bg, level, effect, buy });
    });

    this.msg = this.add.text(360, 1180, '', { fontFamily: FONT, fontSize: '24px', color: '#ff8a80' }).setOrigin(0.5);
    makeButton(this, 205, 1235, 290, 80, '로비로', 0x3a4458, () => this.scene.start('lobby'), 30);
    makeButton(this, 515, 1235, 290, 80, '바로 전투', 0xc0392b, () => enterBattle(this, { stageId: this.lastStage() }), 30);
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('lobby'));
    this.refresh();
  }

  /** 해금됐고 실제로 만들어진 단계 중 가장 높은 단계 */
  private lastStage(): number {
    const p = Progress.load();
    return Math.max(...STAGES.filter((st) => p.unlockedStages.includes(st.id)).map((st) => st.id), 1);
  }

  private buy(type: UpgradeType): void {
    // 버튼을 빠르게 여러 번 눌러도 매번 저장소의 최신 골드·레벨로 다시 검사한다
    const r = Progress.buy(type);
    const card = this.cards.find((c) => c.type === type)!;
    if (!r.ok) {
      this.msg.setText(r.reason === 'max' ? '이미 최대 레벨입니다.' : `골드가 부족합니다. (필요 ${r.cost}G)`);
      this.cameras.main.shake(120, 0.003);
    } else {
      this.msg.setText('');
      // 구매 이펙트: 카드 테두리 번쩍 + 위로 떠오르는 글자
      this.tweens.killTweensOf(card.bg);
      card.bg.setScale(1).setStrokeStyle(6, 0xffe082);
      this.tweens.add({ targets: card.bg, scaleX: 1.03, scaleY: 1.06, duration: 90, yoyo: true, onComplete: () => card.bg.setStrokeStyle(3, 0x7a5a12) });
      const t = this.add.text(card.bg.x, card.bg.y - 40, `강화! Lv.${r.progress.upgrades[type]}`, { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#ffe082', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5);
      this.tweens.add({ targets: t, y: t.y - 60, alpha: 0, duration: 700, onComplete: () => t.destroy() });
      this.beep();
    }
    this.refresh();
  }

  /** 골드·레벨·효과·버튼 비용을 저장소 상태로 다시 그린다 */
  private refresh(): void {
    const p = Progress.load();
    this.goldText.setText(`🪙 ${p.gold.toLocaleString()}G  ·  전투력 ${loadout(p).cp.toLocaleString()}`).setFontSize(34);
    for (const c of this.cards) {
      const def = PERMANENT_UPGRADES[c.type];
      const lv = p.upgrades[c.type];
      const pct = (l: number) => `+${Math.round(l * def.bonusPerLevel * 100)}%`;
      const max = lv >= def.maxLevel;
      c.level.setText(`Lv.${lv} / ${def.maxLevel}`);
      c.effect.setText(max ? `${def.effect} ${pct(lv)} (최대)` : `${def.effect} ${pct(lv)} → ${pct(lv + 1)}`);
      if (max) {
        c.buy.setText('MAX');
        c.buy.setEnabled(false);
      } else {
        const cost = getUpgradeCost(lv);
        const can = p.gold >= cost;
        c.buy.setText(can ? `강화\n${cost}G` : `골드 부족\n${cost}G`);
        c.buy.setEnabled(can, 0x2e8b57);
      }
    }
  }

  /** 효과음 파일 없이 짧은 소리(6단계에서 진짜 효과음으로 교체) */
  private beep(): void {
    try {
      const ctx = (this.sound as Phaser.Sound.WebAudioSoundManager).context;
      if (!ctx) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(660, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
      g.gain.setValueAtTime(0.08, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.2);
    } catch {
      /* 소리를 못 내는 환경이면 건너뜀 */
    }
  }
}
