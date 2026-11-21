import Phaser from 'phaser';
import { getUpgradeCost, labBonus, PERMANENT_UPGRADES, UPGRADE_TYPES, type UpgradeType } from '../data/progression';
import { Progress, type PlayerProgress } from '../systems/Progress';
import { STAGES } from '../data/stages';
import { enterBattle } from '../ui/entry';
import { soundOn } from '../systems/Settings';
import { preloadArt } from '../ui/art';
import { button, text, type KitButton } from '../ui/kit';
import { plate, tabs } from '../ui/kit2';
import { popWord, screenFrame, toast, type ScreenFrame } from '../ui/screen';
import { COLOR, TYPE } from '../ui/theme';
import { RUNE_RULES, RUNE_STAT, RUNES, runeText, runeUpgradeCost } from '../data/runes';
import type { SpecialId } from '../data/specials';

type Tab = 'stats' | 'runes';

/**
 * 드래곤 성장 연구소(5단계 6장 → v1.2 시스템 개편 2026-11-21):
 * - "능력치 강화" 탭: 영구 능력치 4종, 최대 Lv.40(기존 구간 효과·비용 그대로, 뒤를 이어 붙임)
 * - "룬" 탭: 옛 장착형 특수 스킬 15종 → 룬. 조각으로 해금, 조각 + 골드로 강화(최대 Lv.10), 해금한 룬은 모든 드래곤에 항상 적용
 */
export class LabScene extends Phaser.Scene {
  private frame!: ScreenFrame;
  private tab: Tab = 'stats';
  private layer: Phaser.GameObjects.GameObject[] = [];
  private selected: SpecialId = 'rage';

  constructor() {
    super('lab');
  }

  /** 뒤로가기: 로비로 */
  onPlatformBack(): boolean {
    this.scene.start('lobby');
    return true;
  }

  init(data: { tab?: Tab }): void {
    if (data?.tab) this.tab = data.tab;
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    this.layer = [];
    this.frame = screenFrame(this, { title: '연구소', nav: 'lab' });
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('lobby'));
    this.refresh();
  }

  private A<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.layer.push(o);
    return o;
  }

  private B(b: KitButton): KitButton {
    this.layer.push(b.root);
    return b;
  }

  private refresh(): void {
    this.layer.forEach((o) => o.destroy());
    this.layer = [];
    const p = Progress.load();
    this.frame.refresh();
    const keys: Tab[] = ['stats', 'runes'];
    this.A(tabs(this, 262, ['능력치 강화', '룬'], keys.indexOf(this.tab), (i) => {
      if (keys[i] === this.tab) return;
      this.tab = keys[i];
      this.refresh();
    }));
    if (this.tab === 'stats') this.drawStats(p);
    else this.drawRunes(p);
  }

  /** 해금됐고 실제로 만들어진 단계 중 가장 높은 단계 */
  private lastStage(): number {
    const p = Progress.load();
    return Math.max(...STAGES.filter((st) => p.unlockedStages.includes(st.id)).map((st) => st.id), 1);
  }

  // ───────── 능력치 강화 ─────────
  private drawStats(p: PlayerProgress): void {
    this.A(text(this, 360, 318, '영구 능력치 강화 · 모든 드래곤 공통 · 다음 전투부터 적용', TYPE.tiny, COLOR.textSub, true, true).setOrigin(0.5));
    UPGRADE_TYPES.forEach((type, i) => {
      const y = 418 + i * 172;
      const def = PERMANENT_UPGRADES[type];
      const lv = p.upgrades[type];
      const max = lv >= def.maxLevel;
      const pct = (l: number) => `+${Math.round(labBonus(type, l) * 1000) / 10}%`;
      const box = this.A(plate(this, 360, y, 664, 156, { r: 22 }));
      const g = this.add.graphics();
      g.fillStyle(COLOR.ember, 0.18).fillCircle(-262, 0, 52);
      box.add(g);
      box.add(text(this, -262, 0, def.icon, 54).setOrigin(0.5));
      box.add(text(this, -192, -44, def.name, TYPE.heading, COLOR.text, true, true).setOrigin(0, 0.5));
      box.add(text(this, -192, -4, `Lv.${lv} / ${def.maxLevel}`, TYPE.caption, COLOR.gold, true, true).setOrigin(0, 0.5));
      box.add(text(this, -192, 34, max ? `${def.effect} ${pct(lv)} (최대)` : `${def.effect} ${pct(lv)} → ${pct(lv + 1)}`, 18, COLOR.textSub, true).setOrigin(0, 0.5));
      // 진행 막대(40레벨)
      const bar = this.add.graphics();
      bar.fillStyle(0x0b0d17, 0.8).fillRoundedRect(-192, 56, 250, 10, 5);
      bar.fillStyle(COLOR.gold, 1).fillRoundedRect(-192, 56, Math.max(6, 250 * (lv / def.maxLevel)), 10, 5);
      box.add(bar);
      if (max) {
        const b = this.B(button(this, 580, y, 170, 108, 'MAX', () => {}, { kind: 'secondary', size: TYPE.body }));
        b.setEnabled(false);
      } else {
        const cost = getUpgradeCost(lv);
        const b = this.B(button(this, 580, y, 170, 108, '강화', () => this.buy(type, box), { kind: 'growth', size: TYPE.body, sub: `${cost.toLocaleString()}G` }));
        b.setEnabled(p.gold >= cost);
      }
    });
    this.B(button(this, 360, 1100, 420, 72, '바로 전투', () => enterBattle(this, { stageId: this.lastStage() }), { kind: 'cta', size: TYPE.heading, icon: 'ic-swords' }));
  }

  private buy(type: UpgradeType, box: Phaser.GameObjects.Container): void {
    // 버튼을 빠르게 여러 번 눌러도 매번 저장소의 최신 골드·레벨로 다시 검사한다
    const r = Progress.buy(type);
    if (!r.ok) {
      toast(this, r.reason === 'max' ? '이미 최대 레벨이에요' : `골드가 부족해요 (필요 ${r.cost}G)`, COLOR.danger);
      this.cameras.main.shake(120, 0.003);
    } else {
      popWord(this, `강화! Lv.${r.progress.upgrades[type]}`, box.y - 40);
      this.beep();
    }
    this.refresh();
  }

  // ───────── 룬 ─────────
  /** 룬 15종: 육각 칸 5×3(해금 = 색, 잠김 = 어둡게 + 조각 진행) + 고른 룬 판(효과 현재 → 다음, 해금·강화) */
  private drawRunes(p: PlayerProgress): void {
    const total = RUNES.reduce((a, r) => a + (p.specials[r.id].level ?? 0), 0);
    this.A(text(this, 360, 318, `해금한 룬은 모든 드래곤에 항상 적용 · 룬 레벨 합계 ${total} / ${RUNES.length * RUNE_RULES.maxLevel}`, TYPE.tiny, COLOR.textSub, true, true).setOrigin(0.5));
    RUNES.forEach((r, i) => {
      const col = i % 5;
      const row = Math.floor(i / 5);
      const x = 96 + col * 132;
      const y = 418 + row * 140;
      const st = p.specials[r.id];
      const on = st.level > 0;
      const sel = this.selected === r.id;
      const c = this.A(this.add.container(x, y));
      const g = this.add.graphics();
      const hex = (rad: number) => Array.from({ length: 6 }, (_, k) => new Phaser.Math.Vector2(Math.cos((k / 6) * Math.PI * 2 + Math.PI / 6) * rad, Math.sin((k / 6) * Math.PI * 2 + Math.PI / 6) * rad));
      const key = `sp-${r.id}`;
      const art = this.textures.exists(key); // 룬 그림(요청서 6 ③)은 그 자체가 육각 배지 → 그림이 있으면 도형 육각을 그리지 않는다
      if (!art) {
        g.fillStyle(COLOR.outline, 1).fillPoints(hex(60), true);
        g.fillStyle(on ? 0x2b3f8a : 0x1a1d2e, 1).fillPoints(hex(55), true);
        g.fillStyle(r.color, on ? 0.35 : 0.12).fillPoints(hex(44), true);
      }
      if (sel) g.lineStyle(5, COLOR.cta, 1).strokePoints(hex(art ? 64 : 58), true);
      c.add(g);
      if (art) {
        const im = this.add.image(0, -2, key).setDisplaySize(112, 112);
        if (!on) im.setTint(0x777788).setAlpha(0.75); // 잠김: 어둡게
        c.add(im);
      } else c.add(text(this, 0, -8, r.icon, 34, r.color).setOrigin(0.5).setAlpha(on ? 1 : 0.4));
      c.add(text(this, 0, art ? 40 : 34, on ? `Lv.${st.level}` : `${Math.min(st.fragments, RUNE_RULES.unlockFragments)}/${RUNE_RULES.unlockFragments}`, 15, on ? COLOR.gold : COLOR.textSub, true, true).setOrigin(0.5));
      // 해금·강화 가능하면 초록 화살표(자원이 부족하면 표시하지 않음)
      const can = on ? st.level < RUNE_RULES.maxLevel && st.fragments >= runeUpgradeCost(st.level).fragments && p.gold >= runeUpgradeCost(st.level).gold : st.fragments >= RUNE_RULES.unlockFragments;
      if (can) c.add(text(this, 40, -40, '▲', 22, COLOR.ok, true, true).setOrigin(0.5));
      c.setSize(120, 120).setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.selected = r.id;
        this.refresh();
      });
    });
    this.drawRuneDetail(p);
  }

  private drawRuneDetail(p: PlayerProgress): void {
    const r = RUNES.find((x) => x.id === this.selected)!;
    const st = p.specials[r.id];
    const on = st.level > 0;
    const max = st.level >= RUNE_RULES.maxLevel;
    const y = 920;
    this.A(plate(this, 360, y, 664, 230, { r: 22, gold: on }));
    this.A(text(this, 52, y - 82, `${r.name} 룬`, TYPE.heading, COLOR.text, true, true).setOrigin(0, 0.5));
    this.A(text(this, 668, y - 82, on ? `Lv.${st.level} / ${RUNE_RULES.maxLevel}` : '잠김', TYPE.caption, on ? COLOR.gold : COLOR.textSub, true, true).setOrigin(1, 0.5));
    const stat = RUNE_STAT[r.id];
    const effect = !on ? `해금하면: ${runeText(r.id, 1)}` : max ? `${runeText(r.id, st.level)} (최대)` : `${runeText(r.id, st.level)} → ${Math.round(stat.per * (st.level + 1) * 1000) / 10}${stat.unit}`;
    this.A(text(this, 52, y - 36, effect, 19, on ? COLOR.ok : COLOR.textSub, true).setOrigin(0, 0.5).setWordWrapWidth(600).setAlign('left'));
    this.A(text(this, 52, y + 2, `예전 이름: 특수 스킬 "${r.name}"(${r.text}) — 능력치 증가형으로 바뀜`, 14, COLOR.textDim, true).setOrigin(0, 0.5).setWordWrapWidth(600).setAlign('left'));
    if (!on) {
      const need = RUNE_RULES.unlockFragments;
      this.A(text(this, this.fragIcon(y + 52), y + 52, `룬 조각 ${st.fragments} / ${need}`, TYPE.caption, COLOR.text, true, true).setOrigin(0, 0.5));
      const b = this.B(button(this, 560, y + 52, 190, 70, '해금', () => this.runeAct('unlock'), { kind: 'magic', size: TYPE.body }));
      b.setEnabled(st.fragments >= need);
    } else if (!max) {
      const c = runeUpgradeCost(st.level);
      this.A(text(this, this.fragIcon(y + 52), y + 52, `룬 조각 ${st.fragments} / ${c.fragments} · 골드 ${c.gold.toLocaleString()}G`, TYPE.caption, COLOR.text, true, true).setOrigin(0, 0.5));
      const b = this.B(button(this, 580, y + 52, 160, 70, '강화', () => this.runeAct('up'), { kind: 'growth', size: TYPE.body }));
      b.setEnabled(st.fragments >= c.fragments && p.gold >= c.gold);
    } else {
      this.A(text(this, 52, y + 52, '최대 레벨이에요', TYPE.caption, COLOR.gold, true, true).setOrigin(0, 0.5));
    }
    this.B(button(this, 360, 1100, 420, 64, '룬 조각 얻기 — 상점 룬 상자', () => this.scene.start('shop'), { kind: 'secondary', size: TYPE.caption }));
  }

  /** 룬 조각 아이콘(ui-rune-fragment)을 왼쪽에 놓고, 글자가 시작할 x를 돌려준다(그림이 없으면 52) */
  private fragIcon(y: number): number {
    if (!this.textures.exists('ui-rune-fragment')) return 52;
    this.A(this.add.image(52 + 20, y, 'ui-rune-fragment').setDisplaySize(44, 44));
    return 52 + 48;
  }

  private runeAct(kind: 'unlock' | 'up'): void {
    const id = this.selected;
    const r = kind === 'unlock' ? Progress.unlockSpecial(id) : Progress.upgradeRune(id);
    if (!r.ok) {
      const msg: Record<string, string> = { fragments: `룬 조각이 부족해요(${r.cost}개)`, gold: `골드가 부족해요(${r.cost?.toLocaleString()}G)`, max: '이미 최대예요', locked: '먼저 해금하세요' };
      toast(this, msg[r.reason] ?? '할 수 없어요', COLOR.danger);
    } else {
      popWord(this, kind === 'unlock' ? '룬 해금!' : `룬 강화! Lv.${r.progress.specials[id].level}`, 780);
      this.beep();
    }
    this.refresh();
  }

  /** 효과음 파일 없이 짧은 소리 */
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
