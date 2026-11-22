import Phaser from 'phaser';
import { PASS, PASS_ITEM_ICON, PASS_ITEM_LABEL, PASS_REWARDS, passValuePct, type PassItem, type PassTrack } from '../data/pass';
import { cellState, claimPass, passLevel, seasonEnd, syncPass } from '../systems/Pass';
import { Progress } from '../systems/Progress';
import { buyFailText, buyProduct, PAY_NOTICE, purchases } from '../systems/Purchases';
import { preloadArt } from '../ui/art';
import { rewardPopup, type RewardItem } from '../ui/celebrate';
import { badge, button, progressBar, text } from '../ui/kit';
import { plate } from '../ui/kit2';
import { screenFrame, toast, type ScreenFrame } from '../ui/screen';
import { makeScroll, type Scroller } from '../ui/scroll';
import { COLOR, TYPE } from '../ui/theme';
import { gameNow } from '../ui/widgets';

/**
 * 드래곤 패스 화면(2026-11-23, 제작자 예시 "드래곤 패스 시즌 1"): 시즌 정보 · 패스 레벨 막대 · 무료/프리미엄/로열 30칸 · 일괄 수령 · 구매 카드(가치 %).
 * 칸을 누르면 그 칸만, "일괄 수령"은 받을 수 있는 칸 모두. 유료 줄은 결제 연결 전이라 구매 버튼은 안내만.
 */
const COL: Record<PassTrack, { x: number; w: number; fill: number; head: string; headFill: number }> = {
  free: { x: 158, w: 252, fill: 0x22305a, head: '무료 패스', headFill: 0x3a4a7a },
  premium: { x: 446, w: 186, fill: 0x3a2370, head: '프리미엄', headFill: 0x6a3aa8 },
  royal: { x: 632, w: 170, fill: 0x5a3a14, head: '로열 패스', headFill: 0xc8901e },
};
const LV_X = 316;
const ROW0 = 640;
const ROW_GAP = 82;

const rewardItem = (it: PassItem): RewardItem => ({
  image: it.kind === 'redFrag' ? undefined : PASS_ITEM_ICON[it.kind],
  portrait: it.kind === 'redFrag' ? 'red' : undefined,
  label: PASS_ITEM_LABEL[it.kind],
  amount: `+${it.n.toLocaleString()}`,
  grade: it.kind === 'dragonTicket' || it.kind === 'uniFrag' ? 'epic' : it.kind === 'rubies' ? 'rare' : 'common',
});

export class PassScene extends Phaser.Scene {
  private frame!: ScreenFrame;
  private scroll: Scroller | null = null;
  private popup = false;
  private keepY: number | null = null;

  constructor() {
    super('pass');
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
    const now = gameNow();
    const loaded = Progress.load();
    const p = syncPass(loaded, now);
    if (p !== loaded) Progress.save(p); // 새 시즌 시작점 저장
    this.frame = screenFrame(this, { title: '드래곤 패스', nav: '' });
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('lobby'));
    const before = new Set(this.children.list);

    // ── 시즌 정보 + 상자 3개
    const head = plate(this, 360, 318, 680, 150, { r: 24, fill: 0x2a1f45 });
    head.add(text(this, -310, -42, `시즌 ${p.pass.season}`, TYPE.title, COLOR.gold, true, true).setOrigin(0, 0.5));
    head.add(text(this, -310, 6, `${PASS.seasonDays}일 시즌 · ${PASS.levels}레벨`, TYPE.caption, COLOR.text, true, true).setOrigin(0, 0.5));
    const left = Math.max(0, seasonEnd(now) - now);
    head.add(text(this, -310, 44, `⏱ 시즌 종료까지 ${Math.floor(left / 86_400_000)}일 ${Math.floor((left % 86_400_000) / 3_600_000)}시간`, TYPE.tiny, COLOR.gold, true, true).setOrigin(0, 0.5));
    (['free', 'premium', 'royal'] as const).forEach((t, i) => {
      const x = 60 + i * 100;
      const key = `pass-${t}`;
      if (this.textures.exists(key)) head.add(this.add.image(x, -10, key).setDisplaySize(t === 'royal' ? 100 : 86, t === 'royal' ? 100 : 86));
      head.add(text(this, x, 50, COL[t].head, 14, COLOR.text, true, true).setOrigin(0.5));
    });

    // ── 패스 레벨 막대
    const lv = passLevel(p);
    const bar = plate(this, 360, 448, 680, 92, { r: 22 });
    const shield = this.add.circle(-290, 0, 40, 0x4a2a8a).setStrokeStyle(5, COLOR.gold);
    bar.add([shield, text(this, -290, 0, `Lv.${lv.level}`, TYPE.body, COLOR.text, true, true).setOrigin(0.5)]);
    bar.add(text(this, -232, -22, `현재 Lv. ${lv.level} / ${PASS.levels}`, TYPE.caption, COLOR.text, true, true).setOrigin(0, 0.5));
    bar.add(progressBar(this, -40, 18, 380, 22, lv.maxed ? 1 : lv.inLevel / PASS.pointsPerLevel, COLOR.gold, lv.maxed ? 'MAX' : `${lv.inLevel}P / ${PASS.pointsPerLevel}P`).root);
    bar.add(text(this, 320, 0, lv.maxed ? '모두 달성!' : `다음 보상까지\n${PASS.pointsPerLevel - lv.inLevel}P`, TYPE.tiny, COLOR.gold, true, true).setOrigin(1, 0.5).setAlign('right'));
    text(this, 360, 512, '⚔ 전투로 패스 포인트(계정 경험치)를 모아요 · 클리어 100P', TYPE.tiny, COLOR.textSub, true).setOrigin(0.5);

    // ── 줄 제목
    for (const t of ['free', 'premium', 'royal'] as const) {
      const c = COL[t];
      const h = plate(this, c.x, 572, c.w, 56, { r: 16, fill: c.headFill, gold: t === 'royal' });
      h.add(text(this, 0, 0, c.head, TYPE.caption, COLOR.text, true, true).setOrigin(0.5));
      if (t === 'royal') h.add(text(this, 0, -36, '👑', 22).setOrigin(0.5));
    }

    // ── 30칸 × 3줄
    for (let i = 0; i < PASS.levels; i++) {
      const lvN = i + 1;
      const y = ROW0 + i * ROW_GAP;
      const reached = lv.level >= lvN;
      const hex = this.add.circle(LV_X, y, 26, reached ? 0xc8901e : 0x3a3352).setStrokeStyle(4, reached ? 0xffe39a : 0x6b6488);
      text(this, LV_X, y, String(lvN), TYPE.caption, COLOR.text, true, true).setOrigin(0.5);
      void hex;
      for (const t of ['free', 'premium', 'royal'] as const) this.cell(p, t, lvN, y);
    }
    let y = ROW0 + PASS.levels * ROW_GAP + 10;

    // ── 일괄 수령
    const n = (['free', 'premium', 'royal'] as const).reduce((s, t) => s + PASS_REWARDS[t].filter((_, i) => cellState(p, t, i + 1) === 'ready').length, 0);
    const all = button(this, 360, y + 20, 320, 76, n ? `일괄 수령 (${n})` : '받을 보상 없음', () => this.claim(), { kind: 'growth', size: TYPE.body });
    all.setEnabled(n > 0);
    y += 100;

    // ── 구매 카드: 가치 % 크게(계산값)
    (['premium', 'royal'] as const).forEach((k, i) => {
      const x = 190 + i * 340;
      const owned = k === 'royal' ? p.pass.royal : p.pass.premium;
      const card = plate(this, x, y + 110, 320, 220, { r: 24, fill: k === 'royal' ? 0x5a3a14 : 0x3a2370, gold: true });
      if (this.textures.exists(`pass-${k}`)) card.add(this.add.image(-100, -20, `pass-${k}`).setDisplaySize(120, 120));
      card.add(text(this, 40, -70, k === 'royal' ? '로열 패스' : '프리미엄 패스', TYPE.body, COLOR.gold, true, true).setOrigin(0.5));
      card.add(text(this, 40, -38, k === 'royal' ? '프리미엄 포함 + 로열 보상' : '프리미엄 줄 30칸', TYPE.tiny, COLOR.text, true, true).setOrigin(0.5));
      // 가치 %: 가장 크게(제작자 요청: "몇 퍼센트 이득인지 엄청 강조")
      const pct = text(this, 40, 12, `${passValuePct(k).toLocaleString()}%`, 46, 0xffe14d, true, true).setOrigin(0.5);
      card.add(pct);
      card.add(text(this, 40, 44, '가치', TYPE.tiny, COLOR.gold, true, true).setOrigin(0.5));
      this.tweens.add({ targets: pct, scale: 1.08, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      card.add(badge(this, -112, -96, k === 'royal' ? '최고 이득' : '추천', COLOR.ruby));
      const b = button(this, x, y + 196, 260, 60, owned ? '구매함 ✔' : `${PASS.price[k].toLocaleString()}원`, () => this.buy(k), { kind: k === 'royal' ? 'cta' : 'magic', size: TYPE.caption });
      b.setEnabled(!owned && !(k === 'premium' && p.pass.royal));
      // 결제를 쓸 수 있으면 스토어 실제 가격으로 표시
      if (!owned && purchases.available)
        void purchases.products().then((list) => {
          const sp = list.find((x) => x.productId === PASS.productId[k]);
          if (sp && b.root.active) b.setLabel(sp.priceLabel);
        }).catch(() => {});
    });
    y += 250;
    text(this, 360, y + 20, `가치(%) = 보상을 상점 가격(루비 1,350 = ₩11,000 · 드래곤 상자 1회 250루비 · 장비·룬 상자 100루비 · 골드 20 = 1루비)으로 환산한 값\n유료 패스는 구매한 시즌에만 적용돼요\n${PAY_NOTICE.replace(/\n/g, ' ')}`, 13, COLOR.textSub, true)
      .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(660).setLineSpacing(4);
    y += 130;

    this.scroll = makeScroll(this, before, y, () => this.popup);
    if (this.keepY !== null) this.scroll.box.y = this.keepY;
    else this.scroll.scrollTo(ROW0 + Math.max(0, lv.level - 2) * ROW_GAP, 640); // 지금 레벨 근처로
  }

  /** 칸 하나: 아이콘 + 이름·수량, 상태(받음 ✔ · 받기 · 레벨 잠금 🔒 · 구매 필요 🔒) */
  private cell(p: ReturnType<typeof Progress.load>, t: PassTrack, lv: number, y: number): void {
    const c = COL[t];
    const it = PASS_REWARDS[t][lv - 1];
    const st = cellState(p, t, lv);
    const box = plate(this, c.x, y, c.w, 70, { r: 14, fill: c.fill, gold: st === 'ready' });
    const ix = -c.w / 2 + 34;
    if (it.kind === 'redFrag') box.add(this.add.image(ix, 0, 'portrait-red').setDisplaySize(52, 52));
    else if (this.textures.exists(PASS_ITEM_ICON[it.kind])) box.add(this.add.image(ix, 0, PASS_ITEM_ICON[it.kind]).setDisplaySize(46, 46));
    const tx = ix + 32;
    const short = t === 'free' ? PASS_ITEM_LABEL[it.kind] : PASS_ITEM_LABEL[it.kind].replace(' 개봉권', '권');
    box.add(text(this, tx, -13, short, 15, COLOR.text, true, true).setOrigin(0, 0.5));
    box.add(text(this, tx, 13, it.kind === 'gold' || it.kind === 'rubies' ? it.n.toLocaleString() : `×${it.n}`, 17, COLOR.gold, true, true).setOrigin(0, 0.5));
    if (st === 'claimed') {
      box.setAlpha(0.55);
      box.add(text(this, c.w / 2 - 18, -18, '✔', 24, COLOR.ok, true, true).setOrigin(0.5));
    } else if (st === 'locked' || st === 'buy') {
      box.add(text(this, c.w / 2 - 16, -18, '🔒', 18, COLOR.text).setOrigin(0.5));
      if (st === 'locked') box.setAlpha(0.8);
    } else {
      // 받기 가능: 금 테두리 + 칸 아래 테두리에 걸친 작은 "받기"(좁은 칸에서 이름·수량을 가리지 않게 — 2026-11-23)
      const tag = plate(this, c.w / 2 - 30, 30, 52, 24, { r: 10, fill: 0x2e9e4a });
      tag.add(text(this, 0, 0, '받기', 13, COLOR.text, true, true).setOrigin(0.5));
      box.add(tag);
      this.tweens.add({ targets: tag, scale: 1.1, duration: 500, yoyo: true, repeat: -1 });
    }
    box.setInteractive({ useHandCursor: true, hitArea: new Phaser.Geom.Rectangle(-c.w / 2, -35, c.w, 70), hitAreaCallback: Phaser.Geom.Rectangle.Contains });
    box.on('pointerup', () => {
      if (st === 'ready') this.claim({ t, lv });
      else if (st === 'buy') toast(this, t === 'royal' ? '로열 패스를 구매하면 받을 수 있어요' : '프리미엄 패스를 구매하면 받을 수 있어요', COLOR.textSub);
      else if (st === 'locked') toast(this, `패스 Lv.${lv}에 열려요`, COLOR.textSub);
    });
  }

  private claim(only?: { t: PassTrack; lv: number }): void {
    if (this.scroll?.dragged) return;
    const r = claimPass(Progress.load(), gameNow(), only);
    if (!r.ok) return toast(this, '받을 보상이 없어요', COLOR.textSub);
    Progress.save(r.progress);
    this.popup = true;
    const y = this.scroll?.box.y ?? 0;
    // 같은 종류는 합쳐서 보여 줌
    const sum = new Map<PassItem['kind'], number>();
    for (const it of r.items) sum.set(it.kind, (sum.get(it.kind) ?? 0) + it.n);
    rewardPopup(this, only ? `패스 Lv.${only.lv} 보상` : '패스 보상', [...sum].map(([kind, n]) => rewardItem({ kind, n } as PassItem)), () => this.scene.restart({ scrollY: y }));
  }

  /** 패스 구매: 서버가 이번 시즌 구매 여부 확인 → App Store 결제 → 서버 검증 → 이번 시즌 유료 줄 열기(docs/PAYMENTS.md) */
  private buying = false;
  private buy(kind: 'premium' | 'royal'): void {
    if (this.scroll?.dragged || this.buying) return;
    if (!purchases.available) return toast(this, '결제는 App Store 앱에서 할 수 있어요', COLOR.textSub);
    this.buying = true;
    void buyProduct(PASS.productId[kind])
      .then((r) => {
        if (!this.sys.isActive()) return;
        if (r.ok) {
          toast(this, `${kind === 'royal' ? '로열' : '프리미엄'} 패스가 열렸어요`, COLOR.ok);
          this.time.delayedCall(1100, () => this.scene.restart({ scrollY: this.scroll?.box.y ?? 0 }));
          return;
        }
        const msg = buyFailText(r.reason);
        if (msg) toast(this, msg, r.reason === 'failed' ? COLOR.danger : COLOR.textSub);
      })
      .finally(() => (this.buying = false));
  }
}
