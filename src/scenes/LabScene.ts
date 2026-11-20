import Phaser from 'phaser';
import { getUpgradeCost, PERMANENT_UPGRADES, UPGRADE_TYPES, type UpgradeType } from '../data/progression';
import { Progress } from '../systems/Progress';
import { STAGES } from '../data/stages';
import { enterBattle } from '../ui/entry';
import { soundOn } from '../systems/Settings';
import { preloadArt } from '../ui/art';
import { button, text, type KitButton } from '../ui/kit';
import { plate } from '../ui/kit2';
import { popWord, screenFrame, toast, type ScreenFrame } from '../ui/screen';
import { COLOR, TYPE } from '../ui/theme';

interface Card {
  type: UpgradeType;
  box: Phaser.GameObjects.Container;
  level: Phaser.GameObjects.Text;
  effect: Phaser.GameObjects.Text;
  buy: KitButton;
}

// 드래곤 성장 연구소: 골드로 영구 능력치 4종 강화 (5단계 기획서 6장)
// 8단계 v2.0 C: 공통 머리줄·리본·하단 탭(연구소 탭), 카드는 시안 형식 판. 규칙·비용은 그대로.
export class LabScene extends Phaser.Scene {
  private cards: Card[] = [];
  private frame!: ScreenFrame;

  constructor() {
    super('lab');
  }

  /** 뒤로가기: 로비로 */
  onPlatformBack(): boolean {
    this.scene.start('lobby');
    return true;
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    this.cards = [];
    this.frame = screenFrame(this, { title: '연구소', nav: 'lab' });
    text(this, 360, 254, '영구 능력치 강화 · 모든 드래곤 공통 · 다음 전투부터 적용', TYPE.tiny, COLOR.textSub, true, true).setOrigin(0.5);

    UPGRADE_TYPES.forEach((type, i) => {
      const y = 368 + i * 186;
      const def = PERMANENT_UPGRADES[type];
      const box = plate(this, 360, y, 664, 168, { r: 22 });
      const g = this.add.graphics();
      g.fillStyle(COLOR.ember, 0.18).fillCircle(-262, 0, 54);
      box.add(g);
      box.add(text(this, -262, 0, def.icon, 56).setOrigin(0.5));
      box.add(text(this, -192, -46, def.name, TYPE.heading, COLOR.text, true, true).setOrigin(0, 0.5));
      const level = text(this, -192, -6, '', TYPE.caption, COLOR.gold, true, true).setOrigin(0, 0.5);
      const effect = text(this, -192, 34, '', 18, COLOR.textSub, true).setOrigin(0, 0.5);
      box.add([level, effect]);
      const buy = button(this, 580, y, 170, 112, '강화', () => this.buy(type), { kind: 'growth', size: TYPE.body, icon: 'ui-gold' });
      this.cards.push({ type, box, level, effect, buy });
    });

    button(this, 360, 1080, 420, 76, '바로 전투', () => enterBattle(this, { stageId: this.lastStage() }), { kind: 'cta', size: TYPE.heading, icon: 'ic-swords' });
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
      toast(this, r.reason === 'max' ? '이미 최대 레벨이에요' : `골드가 부족해요 (필요 ${r.cost}G)`, COLOR.danger);
      this.cameras.main.shake(120, 0.003);
    } else {
      // 구매 이펙트: 카드가 살짝 튀고 금색 글자
      this.tweens.killTweensOf(card.box);
      card.box.setScale(1);
      this.tweens.add({ targets: card.box, scaleX: 1.03, scaleY: 1.06, duration: 90, yoyo: true });
      popWord(this, `강화! Lv.${r.progress.upgrades[type]}`, card.box.y - 40);
      this.beep();
    }
    this.refresh();
  }

  /** 골드·레벨·효과·버튼 비용을 저장소 상태로 다시 그린다 */
  private refresh(): void {
    const p = Progress.load();
    this.frame.refresh();
    for (const c of this.cards) {
      const def = PERMANENT_UPGRADES[c.type];
      const lv = p.upgrades[c.type];
      const pct = (l: number) => `+${Math.round(l * def.bonusPerLevel * 100)}%`;
      const max = lv >= def.maxLevel;
      c.level.setText(`Lv.${lv} / ${def.maxLevel}`);
      c.effect.setText(max ? `${def.effect} ${pct(lv)} (최대)` : `${def.effect} ${pct(lv)} → ${pct(lv + 1)}`);
      c.buy.root.destroy();
      const y = c.box.y;
      if (max) {
        c.buy = button(this, 580, y, 170, 112, 'MAX', () => {}, { kind: 'secondary', size: TYPE.body });
        c.buy.setEnabled(false);
      } else {
        const cost = getUpgradeCost(lv);
        c.buy = button(this, 580, y, 170, 112, '강화', () => this.buy(c.type), { kind: 'growth', size: TYPE.body, sub: `${cost.toLocaleString()}G` });
        c.buy.setEnabled(p.gold >= cost);
      }
    }
  }

  /** 효과음 파일 없이 짧은 소리(6단계에서 진짜 효과음으로 교체) */
  private beep(): void {
    if (!soundOn()) return; // 설정에서 소리 끔
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
