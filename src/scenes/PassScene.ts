import Phaser from 'phaser';
import { PASS, PASS_ITEM_ICON, PASS_ITEM_LABEL, PASS_REWARDS, passValuePct, type PassItem, type PassTrack } from '../data/pass';
import { DRAGONS } from '../data/dragons';
import { cellState, claimPass, passLevel, seasonEnd, syncPass, type PassGot } from '../systems/Pass';
import { Progress } from '../systems/Progress';
import { buyFailText, buyProduct, PAY_NOTICE, purchases } from '../systems/Purchases';
import { preloadArt } from '../ui/art';
import { rewardPopup, type RewardItem } from '../ui/celebrate';
import { badge, button, progressBar, text } from '../ui/kit';
import { plate } from '../ui/kit2';
import { CONTENT, screenFrame, toast, type ScreenFrame } from '../ui/screen';
import { offY } from '../ui/layout';
import { makeScroll, type Scroller } from '../ui/scroll';
import { COLOR, TYPE } from '../ui/theme';
import { gameNow } from '../ui/widgets';

/**
 * 드래곤 패스 화면(2026-11-23, 제작자 예시 "드래곤 패스 시즌 1"): 시즌 정보 · 패스 레벨 막대 · 무료/프리미엄/로열 30칸 · 일괄 수령 · 구매 카드(가치 %).
 * 칸을 누르면 그 칸만, "일괄 수령"은 받을 수 있는 칸 모두. 유료 줄은 결제 연결 전이라 구매 버튼은 안내만.
 */
// 칸 크기(2026-11-24 테스터 피드백 "보상받기가 잘 안 눌림"): 레벨 번호를 맨 왼쪽으로 빼고 세 줄을 같은 너비·더 높게.
const COL: Record<PassTrack, { x: number; w: number; fill: number; head: string; headFill: number }> = {
  free: { x: 186, w: 206, fill: 0x22305a, head: '무료 패스', headFill: 0x3a4a7a },
  premium: { x: 400, w: 206, fill: 0x3a2370, head: '프리미엄', headFill: 0x6a3aa8 },
  royal: { x: 614, w: 206, fill: 0x5a3a14, head: '로열 패스', headFill: 0xc8901e },
};
const LV_X = 48;
const CELL_H = 104;
const ROW0 = 650;
const ROW_GAP = 120;
/** 아래 고정 줄(일괄 수령·구매) 높이 */
const BAR_H = 150;

const rewardItem = (it: PassGot): RewardItem => ({
  image: it.kind === 'redFrag' || it.dragonId ? undefined : PASS_ITEM_ICON[it.kind],
  portrait: it.kind === 'redFrag' ? 'red' : it.dragonId,
  label: it.dragonId ? `${DRAGONS[it.dragonId].short} 조각` : PASS_ITEM_LABEL[it.kind],
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
    bar.add(progressBar(this, -40, 18, 380, 22, lv.maxed ? 1 : lv.inLevel / lv.need, COLOR.gold, lv.maxed ? 'MAX' : `${lv.inLevel}P / ${lv.need}P`).root);
    bar.add(text(this, 320, 0, lv.maxed ? '모두 달성!' : `다음 보상까지\n${lv.need - lv.inLevel}P`, TYPE.tiny, COLOR.gold, true, true).setOrigin(1, 0.5).setAlign('right'));

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
      const hex = this.add.circle(LV_X, y, 30, reached ? 0xc8901e : 0x3a3352).setStrokeStyle(4, reached ? 0xffe39a : 0x6b6488);
      text(this, LV_X, y, String(lvN), TYPE.caption, COLOR.text, true, true).setOrigin(0.5);
      void hex;
      for (const t of ['free', 'premium', 'royal'] as const) this.cell(p, t, lvN, y);
    }
    let y = ROW0 + PASS.levels * ROW_GAP + 10;

    text(this, 360, y + 20, `유료 패스는 구매한 시즌에만 적용돼요\n${PAY_NOTICE.replace(/\n/g, ' ')}`, 13, COLOR.textSub, true)
      .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(660).setLineSpacing(4);
    y += 130 + BAR_H; // 맨 아래 칸이 고정 줄에 가리지 않게

    this.scroll = makeScroll(this, before, y, () => this.popup);
    if (this.keepY !== null) this.scroll.box.y = this.keepY;
    else this.scroll.scrollTo(ROW0 + Math.max(0, lv.level - 2) * ROW_GAP, 640); // 지금 레벨 근처로
    this.stickyBar(p);
  }

  /**
   * 아래 고정 줄(2026-11-26 제작자: "한참 내려야 구매 칸이 떠서" 다른 게임처럼 스크롤해도 늘 보이게):
   * 일괄 수령 · 프리미엄 가격 · 로열 가격, 가격 위에 "가치 N%" 리본. 스크롤 판 밖에 두어 고정.
   */
  private stickyBar(p: ReturnType<typeof Progress.load>): void {
    const cy = CONTENT.bottom + offY(this) - BAR_H / 2 + 6;
    const bg = this.add.rectangle(360, cy, 720, BAR_H, 0x1a1430, 0.96).setDepth(35);
    this.add.rectangle(360, cy - BAR_H / 2, 720, 4, COLOR.gold, 0.9).setDepth(35);
    void bg;
    const n = (['free', 'premium', 'royal'] as const).reduce((s, t) => s + PASS_REWARDS[t].filter((_, i) => cellState(p, t, i + 1) === 'ready').length, 0);
    const all = button(this, 128, cy + 10, 212, 78, n ? `일괄 수령 ${n}` : '받을 것 없음', () => this.claim(), { kind: 'growth', size: TYPE.caption });
    all.setEnabled(n > 0);
    all.root.setDepth(36);
    (['premium', 'royal'] as const).forEach((k, i) => {
      const x = 360 + i * 232;
      const owned = k === 'royal' ? p.pass.royal : p.pass.premium;
      const b = button(this, x, cy + 10, 216, 78, owned ? '구매함 ✔' : `${PASS.price[k].toLocaleString()}원`, () => this.buy(k), { kind: k === 'royal' ? 'cta' : 'magic', size: TYPE.body });
      b.setEnabled(!owned && !(k === 'premium' && p.pass.royal));
      b.root.setDepth(36);
      // 가치 리본: "N% 가치" (제작자 요청: 몇 퍼센트 이득인지 강조)
      const tag = badge(this, x, cy - 42, `${k === 'royal' ? '로열' : '프리미엄'} ${passValuePct(k).toLocaleString()}% 가치`, k === 'royal' ? COLOR.ruby : 0x7b3fe4).setDepth(37);
      if (!owned) this.tweens.add({ targets: tag, scale: 1.08, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      if (!owned && purchases.available)
        void purchases.products().then((list) => {
          const sp = list.find((x) => x.productId === PASS.productId[k]);
          if (sp && b.root.active) b.setLabel(sp.priceLabel);
        }).catch(() => {});
    });
  }

  /** 칸 하나: 아이콘 + 이름·수량, 상태(받음 ✔ · 받기 · 레벨 잠금 🔒 · 구매 필요 🔒) */
  private cell(p: ReturnType<typeof Progress.load>, t: PassTrack, lv: number, y: number): void {
    const c = COL[t];
    const it = PASS_REWARDS[t][lv - 1];
    const st = cellState(p, t, lv);
    const H = CELL_H;
    const box = plate(this, c.x, y, c.w, H, { r: 16, fill: c.fill, gold: st === 'ready' });
    const ix = -c.w / 2 + 40;
    // 보상 받침대(2026-11-26 Higgsfield): 아이콘이 받침대 위에 놓인 모습, 받을 수 있는 칸은 받침대 빛이 숨 쉼
    if (this.textures.exists('pass-pedestal')) {
      const ped = this.add.image(ix, 20, 'pass-pedestal').setDisplaySize(78, 78);
      box.add(ped);
      if (st === 'ready') this.tweens.add({ targets: ped, alpha: 0.6, duration: 600, yoyo: true, repeat: -1 });
    }
    if (it.kind === 'redFrag') box.add(this.add.image(ix, -6, 'portrait-red').setDisplaySize(64, 64));
    else if (this.textures.exists(PASS_ITEM_ICON[it.kind])) box.add(this.add.image(ix, -6, PASS_ITEM_ICON[it.kind]).setDisplaySize(60, 60));
    const tx = ix + 38;
    const short = PASS_ITEM_LABEL[it.kind].replace(' 개봉권', '권');
    box.add(text(this, tx, -18, short, 18, COLOR.text, true, true).setOrigin(0, 0.5));
    box.add(text(this, tx, 12, it.kind === 'gold' || it.kind === 'rubies' ? it.n.toLocaleString() : `×${it.n}`, 22, COLOR.gold, true, true).setOrigin(0, 0.5));
    if (st === 'claimed') {
      box.setAlpha(0.55);
      box.add(text(this, c.w / 2 - 22, -H / 2 + 22, '✔', 28, COLOR.ok, true, true).setOrigin(0.5));
    } else if (st === 'locked' || st === 'buy') {
      box.add(text(this, c.w / 2 - 20, -H / 2 + 22, '🔒', 22, COLOR.text).setOrigin(0.5));
      if (st === 'locked') box.setAlpha(0.8);
    } else {
      // 받기 가능: 금 테두리 + 칸 아래쪽 가운데 "받기"(칸 어디를 눌러도 받아짐)
      const tag = plate(this, 0, H / 2 - 4, 110, 34, { r: 12, fill: 0x2e9e4a });
      tag.add(text(this, 0, 0, '받기', 18, COLOR.text, true, true).setOrigin(0.5));
      box.add(tag);
      this.tweens.add({ targets: tag, scale: 1.08, duration: 500, yoyo: true, repeat: -1 });
    }
    // 히트 영역은 컨테이너 왼쪽 위(0,0) 기준(Phaser가 displayOrigin을 더함). 전에는 (-w/2,-h/2)로 잡아 칸의 왼쪽 위 1/4만 눌렸다(2026-11-24 수정).
    box.setInteractive({ useHandCursor: true, hitArea: new Phaser.Geom.Rectangle(0, 0, c.w, H + 14), hitAreaCallback: Phaser.Geom.Rectangle.Contains });
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
    // 랜덤 조각은 뽑힌 드래곤별로 합침
    const sum = new Map<string, PassGot>();
    for (const it of r.items) {
      const k = it.dragonId ? `${it.kind}:${it.dragonId}` : it.kind;
      const cur = sum.get(k);
      sum.set(k, cur ? ({ ...cur, n: cur.n + it.n } as PassGot) : it);
    }
    rewardPopup(this, only ? `패스 Lv.${only.lv} 보상` : '패스 보상', [...sum.values()].map(rewardItem), () => this.scene.restart({ scrollY: y }));
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
