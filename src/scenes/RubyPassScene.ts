import Phaser from 'phaser';
import { RUBY_PASS, rubyPassPaidTotal, rubyPassValuePct } from '../data/rubyPass';
import { accountLevel } from '../systems/AccountLevel';
import { claimRubyPass, rubyCellState, rubyPassLevel, type RubyTrack } from '../systems/RubyPass';
import { Progress } from '../systems/Progress';
import { buyFailText, buyProduct, PAY_NOTICE, purchases } from '../systems/Purchases';
import { preloadArt } from '../ui/art';
import { rewardPopup } from '../ui/celebrate';
import { badge, button, progressBar, text } from '../ui/kit';
import { plate } from '../ui/kit2';
import { CONTENT, screenFrame, toast, type ScreenFrame } from '../ui/screen';
import { offY } from '../ui/layout';
import { makeScroll, type Scroller } from '../ui/scroll';
import { COLOR, TYPE } from '../ui/theme';

/**
 * 루비 패스 화면(2026-11-26 제작자 요청, 다른 게임 "모험 기금" 참고): 계정 레벨 1~30에 따라 무료 줄 · 유료 줄(₩25,000) 루비.
 * 유료 줄은 사기 전에는 상자가 잠겨 있다. 아래 고정 줄 = 일괄 수령 · 구매(가치 %) — 드래곤 패스와 같은 형식.
 */
const COL: Record<RubyTrack, { x: number; w: number; fill: number; head: string; headFill: number }> = {
  free: { x: 236, w: 290, fill: 0x22305a, head: '무료', headFill: 0x3a4a7a },
  paid: { x: 540, w: 290, fill: 0x5a1a2a, head: '루비 패스', headFill: 0xc62848 },
};
const LV_X = 48;
const CELL_H = 104;
const ROW0 = 650;
const ROW_GAP = 120;
const BAR_H = 150;

export class RubyPassScene extends Phaser.Scene {
  private frame!: ScreenFrame;
  private scroll: Scroller | null = null;
  private popup = false;
  private keepY: number | null = null;
  private buying = false;

  constructor() {
    super('rubypass');
  }

  onPlatformBack(): boolean {
    this.scene.start('lobby');
    return true;
  }

  init(data: { scrollY?: number }): void {
    this.keepY = data?.scrollY ?? null;
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    this.popup = false;
    const p = Progress.load();
    this.frame = screenFrame(this, { title: '루비 패스', nav: '', ribbonColor: 0xc62848, bg: 'scrbg-pass' });
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('lobby'));
    const before = new Set(this.children.list);

    // ── 머리: 그림 + 설명 + 총 보상
    const head = plate(this, 360, 318, 680, 150, { r: 24, fill: 0x3a1424 });
    if (this.textures.exists('rubypass-hero')) {
      const im = this.add.image(-200, 0, 'rubypass-hero');
      im.setScale(Math.min(260 / im.width, 150 / im.height));
      head.add(im);
    }
    head.add(text(this, -40, -44, '계정 레벨을 올리면 루비가 쏟아져요!', TYPE.caption, COLOR.gold, true, true).setOrigin(0, 0.5));
    head.add(text(this, -40, -6, `루비 패스 전용 보상 총 ${rubyPassPaidTotal().toLocaleString()}루비`, TYPE.caption, COLOR.text, true, true).setOrigin(0, 0.5));
    head.add(text(this, -40, 32, '시즌 없음 · 한 번 사면 계속 · 30레벨까지', TYPE.tiny, COLOR.textSub, true, true).setOrigin(0, 0.5));

    // ── 레벨 막대(계정 레벨)
    const acc = accountLevel(p);
    const lv = rubyPassLevel(p);
    const maxed = lv >= RUBY_PASS.levels;
    const bar = plate(this, 360, 448, 680, 92, { r: 22 });
    bar.add([this.add.circle(-290, 0, 40, 0x8a1a3a).setStrokeStyle(5, COLOR.gold), text(this, -290, 0, `Lv.${lv}`, TYPE.body, COLOR.text, true, true).setOrigin(0.5)]);
    bar.add(text(this, -232, -22, `계정 레벨 ${lv} / ${RUBY_PASS.levels}`, TYPE.caption, COLOR.text, true, true).setOrigin(0, 0.5));
    bar.add(progressBar(this, -40, 18, 380, 22, maxed ? 1 : acc.xp / acc.need, COLOR.ruby, maxed ? 'MAX' : `${acc.xp} / ${acc.need}`).root);
    bar.add(text(this, 320, 0, maxed ? '모두 달성!' : '전투하면\n경험치가 올라요', TYPE.tiny, COLOR.gold, true, true).setOrigin(1, 0.5).setAlign('right'));

    for (const t of ['free', 'paid'] as const) {
      const c = COL[t];
      const h = plate(this, c.x, 572, c.w, 56, { r: 16, fill: c.headFill, gold: t === 'paid' });
      h.add(text(this, 0, 0, c.head, TYPE.caption, COLOR.text, true, true).setOrigin(0.5));
    }

    for (let i = 0; i < RUBY_PASS.levels; i++) {
      const n = i + 1;
      const y = ROW0 + i * ROW_GAP;
      const reached = lv >= n;
      this.add.circle(LV_X, y, 30, reached ? 0xc8901e : 0x3a3352).setStrokeStyle(4, reached ? 0xffe39a : 0x6b6488);
      text(this, LV_X, y, String(n), TYPE.caption, COLOR.text, true, true).setOrigin(0.5);
      for (const t of ['free', 'paid'] as const) this.cell(p, t, n, y);
    }
    let y = ROW0 + RUBY_PASS.levels * ROW_GAP + 10;
    text(this, 360, y + 20, `루비 패스는 계정당 한 번 살 수 있어요\n${PAY_NOTICE.replace(/\n/g, ' ')}`, 13, COLOR.textSub, true)
      .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(660).setLineSpacing(4);
    y += 130 + BAR_H;

    this.scroll = makeScroll(this, before, y, () => this.popup);
    if (this.keepY !== null) this.scroll.box.y = this.keepY;
    else this.scroll.scrollTo(ROW0 + Math.max(0, lv - 2) * ROW_GAP, 640);
    this.stickyBar(p);
  }

  /** 칸: 루비 그림 + 수량. 유료 줄은 사기 전 잠긴 상자 그림 */
  private cell(p: ReturnType<typeof Progress.load>, t: RubyTrack, n: number, y: number): void {
    const c = COL[t];
    const st = rubyCellState(p, t, n);
    const amount = RUBY_PASS[t][n - 1];
    const box = plate(this, c.x, y, c.w, CELL_H, { r: 16, fill: c.fill, gold: st === 'ready' });
    const ix = -c.w / 2 + 56;
    if (this.textures.exists('pass-pedestal')) box.add(this.add.image(ix, 22, 'pass-pedestal').setDisplaySize(80, 80));
    const icon = t === 'paid' && st === 'buy' ? 'chest-dragon' : amount >= 1000 ? 'ruby-pack-4' : amount >= 500 ? 'ruby-pack-3' : amount >= 300 ? 'ruby-pack-2' : 'ui-ruby';
    if (this.textures.exists(icon)) box.add(this.add.image(ix, -6, icon).setDisplaySize(66, 66));
    box.add(text(this, ix + 50, -16, '루비', 18, COLOR.text, true, true).setOrigin(0, 0.5));
    box.add(text(this, ix + 50, 14, amount.toLocaleString(), 26, t === 'paid' ? 0xffe14d : COLOR.gold, true, true).setOrigin(0, 0.5));
    if (st === 'claimed') {
      box.setAlpha(0.55);
      box.add(text(this, c.w / 2 - 24, -CELL_H / 2 + 22, '✔', 28, COLOR.ok, true, true).setOrigin(0.5));
    } else if (st === 'locked' || st === 'buy') {
      box.add(text(this, c.w / 2 - 22, -CELL_H / 2 + 22, '🔒', 22, COLOR.text).setOrigin(0.5));
      if (st === 'locked') box.setAlpha(0.8);
    } else {
      const tag = plate(this, 0, CELL_H / 2 - 4, 110, 34, { r: 12, fill: 0x2e9e4a });
      tag.add(text(this, 0, 0, '받기', 18, COLOR.text, true, true).setOrigin(0.5));
      box.add(tag);
      this.tweens.add({ targets: tag, scale: 1.08, duration: 500, yoyo: true, repeat: -1 });
    }
    box.setInteractive({ useHandCursor: true, hitArea: new Phaser.Geom.Rectangle(0, 0, c.w, CELL_H + 14), hitAreaCallback: Phaser.Geom.Rectangle.Contains });
    box.on('pointerup', () => {
      if (st === 'ready') this.claim({ t, lv: n });
      else if (st === 'buy') toast(this, '루비 패스를 구매하면 받을 수 있어요', COLOR.textSub);
      else if (st === 'locked') toast(this, `계정 레벨 ${n}에 열려요`, COLOR.textSub);
    });
  }

  /** 아래 고정 줄: 일괄 수령 · 구매(가치 % 리본) */
  private stickyBar(p: ReturnType<typeof Progress.load>): void {
    const cy = CONTENT.bottom + offY(this) - BAR_H / 2 + 6;
    this.add.rectangle(360, cy, 720, BAR_H, 0x1a1430, 0.96).setDepth(35);
    this.add.rectangle(360, cy - BAR_H / 2, 720, 4, COLOR.gold, 0.9).setDepth(35);
    const n = (['free', 'paid'] as const).reduce((s, t) => s + RUBY_PASS[t].filter((_, i) => rubyCellState(p, t, i + 1) === 'ready').length, 0);
    const all = button(this, 190, cy + 10, 300, 78, n ? `일괄 수령 ${n}` : '받을 것 없음', () => this.claim(), { kind: 'growth', size: TYPE.caption });
    all.setEnabled(n > 0);
    all.root.setDepth(36);
    const owned = p.rubyPass.owned;
    const b = button(this, 520, cy + 10, 300, 78, owned ? '구매함 ✔' : `${RUBY_PASS.price.toLocaleString()}원`, () => this.buy(), { kind: 'cta', size: TYPE.body });
    b.setEnabled(!owned);
    b.root.setDepth(36);
    const tag = badge(this, 520, cy - 42, `${rubyPassValuePct().toLocaleString()}% 가치`, COLOR.ruby).setDepth(37);
    if (!owned) this.tweens.add({ targets: tag, scale: 1.08, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    if (!owned && purchases.available)
      void purchases.products().then((list) => {
        const sp = list.find((x) => x.productId === RUBY_PASS.productId);
        if (sp && b.root.active) b.setLabel(sp.priceLabel);
      }).catch(() => {});
  }

  private claim(only?: { t: RubyTrack; lv: number }): void {
    if (this.scroll?.dragged) return;
    const r = claimRubyPass(Progress.load(), only);
    if (!r.ok) return toast(this, '받을 보상이 없어요', COLOR.textSub);
    Progress.save(r.progress);
    this.popup = true;
    const y = this.scroll?.box.y ?? 0;
    rewardPopup(this, only ? `루비 패스 Lv.${only.lv}` : '루비 패스 보상', [{ image: 'ui-ruby', label: '루비', amount: `+${r.rubies.toLocaleString()}`, grade: 'rare' }], () => this.scene.restart({ scrollY: y }));
  }

  /** 구매: 서버 확인 → App Store 결제 → 서버 검증 → 유료 줄 열기(드래곤 패스와 같은 경로, docs/PAYMENTS.md) */
  private buy(): void {
    if (this.scroll?.dragged || this.buying) return;
    if (!purchases.available) return toast(this, '결제는 App Store 앱에서 할 수 있어요', COLOR.textSub);
    this.buying = true;
    void buyProduct(RUBY_PASS.productId)
      .then((r) => {
        if (!this.sys.isActive()) return;
        if (r.ok) {
          toast(this, '루비 패스가 열렸어요', COLOR.ok);
          this.time.delayedCall(1100, () => this.scene.restart({ scrollY: this.scroll?.box.y ?? 0 }));
          return;
        }
        const msg = buyFailText(r.reason);
        if (msg) toast(this, msg, r.reason === 'failed' ? COLOR.danger : COLOR.textSub);
      })
      .finally(() => (this.buying = false));
  }
}
