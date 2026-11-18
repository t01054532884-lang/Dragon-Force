import Phaser from 'phaser';
import { makeTextures } from '../textures';
import { DRAGONS, RARITY_COLOR, RARITY_LABEL, SUMMON } from '../data/dragons';
import { Progress, type PullResult } from '../systems/Progress';
import { devMode, FONT, makeButton, type Button } from '../ui/widgets';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** 드래곤 소환 (6단계 기획서 5장): 소환권 · 1회/10회 · 보장 진행도 · 확률 보기 · 결과(신규/중복 조각) */
export class SummonScene extends Phaser.Scene {
  private info!: Phaser.GameObjects.Text;
  private pity!: Phaser.GameObjects.Text;
  private one!: Button;
  private ten!: Button;
  private layer: Phaser.GameObjects.GameObject[] = [];
  private busy = false;

  constructor() {
    super('summon');
  }

  /** 뒤로가기: 로비로 */
  onPlatformBack(): boolean {
    this.scene.start('lobby');
    return true;
  }

  create(): void {
    if (!this.textures.exists('dragon-red')) makeTextures(this);
    this.layer = [];
    this.busy = false;
    this.add.rectangle(360, 640, 720, 1280, 0x140f22);
    // 소환진(원 + 별)
    const ring = this.add.circle(360, 330, 150).setStrokeStyle(6, 0xb388ff, 0.7);
    this.add.circle(360, 330, 110).setStrokeStyle(2, 0xffd34d, 0.5);
    this.tweens.add({ targets: ring, scale: 1.06, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.add.text(360, 330, '✧', { fontFamily: FONT, fontSize: '120px', color: '#ffd34d' }).setOrigin(0.5);
    this.add.text(360, 70, '드래곤 소환', { fontFamily: FONT, fontSize: '48px', fontStyle: 'bold', color: '#e1bee7' }).setOrigin(0.5);
    this.info = this.add.text(360, 128, '', { fontFamily: FONT, fontSize: '28px', color: '#ffd34d' }).setOrigin(0.5);
    this.pity = this.add.text(360, 520, '', { fontFamily: FONT, fontSize: '22px', color: '#c9d3ee', align: 'center', lineSpacing: 6, wordWrap: { width: 660 } }).setOrigin(0.5);

    this.one = makeButton(this, 205, 620, 290, 100, '1회 소환\n소환권 1장', 0x6a3fb5, () => this.pull(1), 28);
    this.ten = makeButton(this, 515, 620, 290, 100, '10회 소환\n소환권 10장', 0x8e24aa, () => this.pull(10), 28);
    makeButton(this, 360, 1100, 420, 70, '등급·개별 확률 보기', 0x2c3346, () => this.showRates(), 26);
    makeButton(this, 205, 1215, 290, 80, '로비로', 0x3a4458, () => this.scene.start('lobby'), 30);
    makeButton(this, 515, 1215, 290, 80, '드래곤', 0x2e5d8a, () => this.scene.start('dragons'), 30);
    if (devMode()) {
      const t = this.add.text(690, 20, '[개발용] 소환권 +10', { fontFamily: FONT, fontSize: '18px', color: '#8a5555' }).setOrigin(1, 0);
      t.setInteractive({ useHandCursor: true }).on('pointerdown', () => (Progress.addTickets(10), this.refresh()));
    }
    this.add.text(360, 1160, '소환권 획득: 튜토리얼 · 단계 첫 클리어 · 업적', { fontFamily: FONT, fontSize: '18px', color: '#7d7394' }).setOrigin(0.5);
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('lobby'));
    this.refresh();
  }

  private refresh(): void {
    const p = Progress.load();
    this.info.setText(`🎟 소환권 ${p.summonTickets}장`);
    this.pity.setText(
      `희귀 이상 보장 ${p.pullsSinceRareOrHigher} / ${SUMMON.rareGuarantee}   ·   전설 보장 ${p.pullsSinceLegendary} / ${SUMMON.legendaryGuarantee}\n` +
        `연속 ${SUMMON.rareGuarantee - 1}번 일반 → 다음은 희귀 이상 · 연속 ${SUMMON.legendaryGuarantee - 1}번 전설 아님 → 다음은 전설`,
    );
    this.one.setEnabled(!this.busy && p.summonTickets >= 1);
    this.ten.setEnabled(!this.busy && p.summonTickets >= 10);
  }

  private pull(count: 1 | 10): void {
    if (this.busy) return; // 연출 중 연속 클릭 방지(저장소 쪽에서도 소환권을 최신 값으로 다시 확인)
    const r = Progress.summon(count);
    if (!r.ok) {
      this.cameras.main.shake(120, 0.004);
      return;
    }
    this.busy = true;
    this.refresh();
    this.cameras.main.flash(300, 200, 160, 255);
    this.showResults(r.results, r.rewards.map((w) => `🎟 ${w.text}: 소환권 +${w.tickets}`));
    this.time.delayedCall(400 + r.results.length * 90, () => {
      this.busy = false;
      this.refresh();
    });
  }

  private clearLayer(): void {
    this.layer.forEach((o) => o.destroy());
    this.layer = [];
  }

  private showResults(results: PullResult[], extra: string[]): void {
    this.clearLayer();
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => (this.layer.push(o), o);
    const n = results.length;
    const cols = n === 1 ? 1 : 5;
    results.forEach((res, i) => {
      const d = DRAGONS[res.dragonId];
      const x = n === 1 ? 360 : 76 + (i % cols) * 142;
      const y = n === 1 ? 830 : 760 + Math.floor(i / cols) * 190;
      const big = n === 1 ? 1.5 : 1;
      const card = add(this.add.rectangle(x, y, 132 * big, 176 * big, 0x221a33).setStrokeStyle(4, RARITY_COLOR[res.rarity]));
      const img = add(this.add.image(x, y - 18 * big, `portrait-${res.dragonId}`).setScale(0.6 * big));
      add(this.add.text(x, y + 46 * big, d.short, { fontFamily: FONT, fontSize: `${22 * big}px`, color: '#ffffff' }).setOrigin(0.5));
      add(
        this.add
          .text(x, y + 70 * big, res.isNew ? 'NEW!' : `조각 +${res.shards}`, { fontFamily: FONT, fontSize: `${18 * big}px`, color: res.isNew ? '#ffd34d' : '#b0bec5', fontStyle: 'bold' })
          .setOrigin(0.5),
      );
      add(this.add.text(x - 60 * big, y - 84 * big, RARITY_LABEL[res.rarity], { fontFamily: FONT, fontSize: `${16 * big}px`, color: hex(RARITY_COLOR[res.rarity]) }));
      if (res.guaranteed) add(this.add.text(x + 60 * big, y - 84 * big, '보장', { fontFamily: FONT, fontSize: `${16 * big}px`, color: '#ff8a80' }).setOrigin(1, 0));
      // 한 장씩 뒤집히듯 나타남
      for (const o of [card, img]) {
        (o as Phaser.GameObjects.Rectangle).setScale(0.01, (o as Phaser.GameObjects.Rectangle).scaleY);
      }
      this.tweens.add({ targets: card, scaleX: 1, duration: 180, delay: i * 90 });
      this.tweens.add({ targets: img, scaleX: 0.6 * big, duration: 180, delay: i * 90 });
    });
    if (extra.length) add(this.add.text(360, 172, extra.join('\n'), { fontFamily: FONT, fontSize: '22px', color: '#ffd34d', align: 'center' }).setOrigin(0.5));
  }

  /** 확률 공개 화면: 등급 확률과 개별 확률(등급 안 균등, 보장 전 기본 분포) */
  private showRates(): void {
    this.clearLayer();
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => (this.layer.push(o), o);
    const W = SUMMON.rarityWeights;
    const total = W.common + W.rare + W.epic + W.legendary;
    add(this.add.rectangle(360, 845, 660, 360, 0x1d1730).setStrokeStyle(3, 0xb388ff, 0.6));
    const lines: string[] = [];
    for (const r of ['common', 'rare', 'epic', 'legendary'] as const) {
      const ids = SUMMON.pool.filter((id) => DRAGONS[id].rarity === r);
      const each = ((W[r] / total) * 100) / ids.length;
      lines.push(`${RARITY_LABEL[r]} ${((W[r] / total) * 100).toFixed(0)}%  —  ${ids.map((id) => `${DRAGONS[id].short} ${each.toFixed(4)}%`).join(' · ')}`);
    }
    lines.push('', '레드는 기본 지급(소환 대상 아님) · 보장 발동 전 기본 확률', '중복은 조각으로: 일반 10 · 희귀 20 · 영웅 40 · 전설 80');
    add(this.add.text(60, 690, lines.join('\n'), { fontFamily: FONT, fontSize: '20px', color: '#e1d5f5', lineSpacing: 10, wordWrap: { width: 600 } }));
  }
}
