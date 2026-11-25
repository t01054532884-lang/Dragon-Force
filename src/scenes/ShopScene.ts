import Phaser from 'phaser';
import { makeTextures } from '../textures';
import { DRAGONS, RARITY_COLOR, RARITY_LABEL } from '../data/dragons';
import { BOXES, DEALS, DRAGON_BOX, EQUIPMENT_BOX, ESSENCE, FREE_DAILY_GIFT, GOLD_OFFERS, PACKAGES, RARITIES, RUBY_PRODUCTS, type BoxId, type PackageDef } from '../data/economy';
import { buyFailText, buyProduct, claimFreeDaily, freeDailyClaimed, grantLine, packageBought, PAY_NOTICE, purchases, restoreAll, type RubyProduct } from '../systems/Purchases';
import { rewardPopup } from '../ui/celebrate';
import { gameNow } from '../ui/widgets';
import { tabs } from '../ui/kit2';

type DealTab = 'once' | 'daily' | 'weekly' | 'monthly';
import { CONTENT } from '../ui/screen';
import { makeScroll, type Scroller } from '../ui/scroll';
import { offY } from '../ui/layout';
import { RUNE_BOX } from '../data/runes';
import { popWord, toast } from '../ui/screen';
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
import { fullH } from '../ui/layout';

/**
 * 루비 상점(6단계 v1.2 6장): 드래곤·스킬 상자 / 장비 상자 / 골드 상자, 1회·10회(드래곤 상자 12% · 나머지 10% 할인 — v1.1).
 * 기존 소환권은 드래곤·스킬 상자 무료 개봉권으로 쓴다. 루비는 게임 안 보상·이벤트로만 얻는다(첫 출시: 현금 결제 없음).
 * 8단계 v2.0 C: 로비와 같은 머리줄·리본·하단 탭, 시안 형식(큰 소환 배너 · 보장 진행 막대 · 상자 카드 2장). 규칙·가격·저장은 그대로.
 */
export class ShopScene extends Phaser.Scene {
  private frame!: ScreenFrame;
  private buttons: { btn: KitButton; box: BoxId; count: 1 | 10; pay: 'ruby' | 'ticket' }[] = [];
  private goldButtons: { btn: KitButton; rubies: number }[] = [];
  private pityRoot: Phaser.GameObjects.Container | null = null;
  private ticketText!: Phaser.GameObjects.Text;
  private boxTicketButtons: { btn: KitButton; box: BoxId; desc: Phaser.GameObjects.Text }[] = [];
  private layer: Phaser.GameObjects.GameObject[] = [];
  private busy = false;
  private tx = 0;
  private opening: ChestOpening | null = null;
  /** 세로 스크롤(2026-11-22 제작자 요청: 상자 → 골드 → 루비 구매 → 기간 한정 패키지를 아래로 내려 보기) */
  private content: Phaser.GameObjects.Container | null = null;
  private scroller: Scroller | null = null;
  private storeProducts: RubyProduct[] = [];
  private dealTab: DealTab = 'once';
  private keepScroll = 0;
  private payBusy = false;

  constructor() {
    super('shop');
  }

  init(data: { dealTab?: DealTab; scrollY?: number }): void {
    if (data?.dealTab) this.dealTab = data.dealTab;
    this.keepScroll = data?.scrollY ?? 0;
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
    this.boxTicketButtons = [];
    this.goldButtons = [];
    this.busy = false;
    this.opening = null;
    this.pityRoot = null;
    // 화면을 떠나면 연출만 정리(보상은 개봉 순간 이미 저장됨)
    this.events.once('shutdown', () => this.opening?.destroy());
    this.frame = screenFrame(this, { title: '상점', nav: 'shop' });
    this.scroller = null;
    const before = new Set(this.children.list);

    // ── 드래곤·스킬 상자: 큰 배너
    const D = BOXES.dragon;
    const ban = plate(this, 360, 392, 664, 300, { r: 26, gold: true, fill: 0x3a2370 });
    const glow = this.add.circle(0, -18, 130, COLOR.violet, 0.28);
    ban.add(glow);
    this.tweens.add({ targets: glow, scale: 1.12, alpha: 0.12, yoyo: true, repeat: -1, duration: 1100 });
    ban.add(this.add.image(-200, 0, 'portrait-blue').setDisplaySize(160, 160));
    ban.add(this.add.image(200, 0, 'portrait-arcane').setDisplaySize(160, 160));
    ban.add(this.add.image(0, -22, 'chest-dragon').setDisplaySize(210, 210));
    ban.add(text(this, 0, 80, D.name, 36, COLOR.gold, true, true).setOrigin(0.5));
    ban.add(text(this, 0, 110, D.desc, TYPE.tiny, COLOR.text, true, true).setOrigin(0.5));
    this.ticketText = text(this, -312, -128, '', TYPE.tiny, COLOR.text, true, true).setOrigin(0, 0.5);
    ban.add(this.ticketText);
    // 중복 정수 안내(제작자 2026-11-25): 이미 가진 드래곤의 정수는 그 자리에서 조각으로(따로 바꾸는 화면 없음)
    const E = ESSENCE.essenceToFragments;
    ban.add(text(this, 0, 134, `보유한 드래곤의 정수는 조각으로 자동 변환: 일반 ${E.common} · 희귀 ${E.rare} · 영웅 ${E.epic} · 전설 ${E.legendary}개`, 15, 0xffe39a, true, true).setOrigin(0.5));

    this.boxButtons('dragon', 600, 300, 88, TYPE.heading);
    // 무료 개봉권(기존 소환권) — 드래곤·스킬 상자 전용
    const t1 = button(this, 205, 692, 300, 58, '무료 개봉권 1회', () => this.open('dragon', 1, 'ticket'), { kind: 'secondary', icon: 'ui-ticket', size: TYPE.caption });
    const t10 = button(this, 515, 692, 300, 58, '무료 개봉권 10회', () => this.open('dragon', 10, 'ticket'), { kind: 'secondary', icon: 'ui-ticket', size: TYPE.caption });
    this.buttons.push({ btn: t1, box: 'dragon', count: 1, pay: 'ticket' }, { btn: t10, box: 'dragon', count: 10, pay: 'ticket' });

    // ── 장비 상자 · 룬 상자 카드(v1.2: 골드 상자 자리에 룬 상자 — 룬 조각은 연구소 "룬"에서 해금·강화)
    (['equipment', 'rune'] as const).forEach((box, i) => {
      const def = BOXES[box];
      const x = 196 + i * 328;
      const card = plate(this, x, 905, 316, 200, { r: 22, fill: box === 'equipment' ? 0x1d3a52 : 0x22306a });
      // 룬 상자 그림(v1.2 3차 묶음 chest-rune)이 없으면 금 상자 그림을 푸른빛으로 물들여 임시 사용
      const runeArt = box === 'rune' && this.textures.exists('chest-rune');
      const img = this.add.image(-92, -34, box === 'rune' ? (runeArt ? 'chest-rune' : 'chest-gold') : `chest-${box}`).setDisplaySize(120, 120);
      if (box === 'rune' && !runeArt) img.setTint(0x9db4ff);
      card.add(img);
      card.add(text(this, 46, -58, def.name, TYPE.body, COLOR.text, true, true).setOrigin(0.5));
      const desc = text(this, 46, -22, def.desc, 16, COLOR.textSub, true).setOrigin(0.5).setWordWrapWidth(170).setAlign('center');
      card.add(desc);
      this.boxButtons(box, 905 + 56, 142, 58, TYPE.caption, x);
      // 무료 개봉권(출석·활동 보상, 2026-11-21): 가진 만큼 1회씩
      // 개봉권이 있으면 설명 자리에 버튼(설명은 숨김)
      const tb = button(this, x + 46, 905 - 16, 196, 50, '무료 1회', () => this.open(box, 1, 'ticket'), { kind: 'growth', size: TYPE.tiny });
      this.buttons.push({ btn: tb, box, count: 1, pay: 'ticket' });
      this.boxTicketButtons.push({ btn: tb, box, desc });
    });

    // ── 아래로 이어지는 상품 칸: 골드(큰 카드 3장) → 루비 구매(5장) → 기간 한정 패키지(3장) → 안내
    let y = this.goldSection(1050);
    y = this.rubySection(y + 30);
    y = this.packageSection(y + 30);
    button(this, 200, y + 50, 300, 54, '확률 · 보장 안내', () => this.showRates(), { kind: 'secondary', size: TYPE.tiny });
    button(this, 520, y + 50, 300, 54, '구매 복원', () => this.restorePurchases(), { kind: 'secondary', size: TYPE.tiny });
    text(this, 360, y + 135, PAY_NOTICE, 15, COLOR.textSub, true)
      .setOrigin(0.5).setAlign('center').setLineSpacing(6);
    this.makeScroll(before, y + 200);
    if (this.keepScroll && this.content) this.content.y = Math.max(this.keepScroll, Math.min(0, CONTENT.bottom + offY(this) - (y + 200)));
    // 스토어 가격 받아 오기(결제를 쓸 수 없으면 빈 목록 → 예정 가격 표시)
    purchases.products().catch(() => [] as RubyProduct[]).then((list) => (this.storeProducts = list));

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
    const off = Math.round((1 - def.price10 / (def.price1 * 10)) * 100);
    if (box === 'dragon' && off > 0) b10.root.add(badge(this, w / 2 - 34, -h / 2 - 6, `${off}% 할인`, COLOR.ruby));
    this.buttons.push({ btn: b1, box, count: 1, pay: 'ruby' }, { btn: b10, box, count: 10, pay: 'ruby' });
  }

  // ───────── 스크롤 · 상품 칸(2026-11-22) ─────────

  /** 공용 스크롤 판(ui/scroll.ts) — 상자 개봉 연출·결과 창이 떠 있으면 스크롤하지 않음 */
  private makeScroll(before: Set<Phaser.GameObjects.GameObject>, bottom: number): void {
    this.scroller = makeScroll(this, before, bottom, () => !!this.opening || this.layer.length > 0);
    this.content = this.scroller.box;
  }

  private get dragged(): boolean {
    return this.scroller?.dragged ?? false;
  }

  /** 칸 제목(왼쪽 아이콘 + 글자 + 오른쪽 작은 안내) */
  private section(y: number, icon: string, title: string, note?: string): void {
    const bar = plate(this, 360, y, 680, 64, { r: 20, fill: 0x241c3d });
    if (this.textures.exists(icon)) bar.add(this.add.image(-300, 0, icon).setDisplaySize(48, 48));
    bar.add(text(this, -264, 0, title, TYPE.body, COLOR.text, true, true).setOrigin(0, 0.5));
    if (note) bar.add(text(this, 320, 0, note, TYPE.tiny, COLOR.gold, true, true).setOrigin(1, 0.5));
  }

  /** 골드: 독립된 큰 카드 3장(그림 · 골드 양 · 루비 가격 버튼) → 다음 칸 시작 y */
  private goldSection(y0: number): number {
    this.section(y0, 'ui-gold', '골드', '루비로 바로 교환');
    const cy = y0 + 180;
    GOLD_OFFERS.forEach((o, i) => {
      const x = 130 + i * 230;
      const card = plate(this, x, cy, 216, 260, { r: 22, fill: 0x1d3a52, gold: i === 2 });
      const pack = `gold-pack-${o.id.replace('gold-', '')}`;
      card.add(this.add.image(0, -50, this.textures.exists(pack) ? pack : 'ui-gold').setDisplaySize(130, 130));
      card.add(text(this, 0, 36, `${o.gold.toLocaleString()} G`, TYPE.heading, COLOR.gold, true, true).setOrigin(0.5));
      const extra = Math.round((o.gold / o.rubies / (GOLD_OFFERS[0].gold / GOLD_OFFERS[0].rubies) - 1) * 100);
      if (extra > 0) card.add(badge(this, 62, -112, `+${extra}%`, COLOR.ruby));
      const b = button(this, x, cy + 90, 180, 60, o.rubies.toLocaleString(), () => this.buyGold(o.id), { kind: 'growth', icon: 'ui-ruby', size: TYPE.caption });
      this.goldButtons.push({ btn: b, rubies: o.rubies });
    });
    return cy + 130;
  }

  /** 루비 구매(인앱결제): 5장(3 + 2). 가격은 스토어 가격, 없으면 예정 가격 */
  private rubySection(y0: number): number {
    this.section(y0, 'ui-ruby', '루비 구매', '보너스 루비 포함');
    RUBY_PRODUCTS.forEach((def, i) => {
      const row = Math.floor(i / 3);
      const col = i % 3;
      const perRow = row === 0 ? 3 : RUBY_PRODUCTS.length - 3;
      const x = 360 + (col - (perRow - 1) / 2) * 230;
      const cy = y0 + 160 + row * 250;
      const card = plate(this, x, cy, 216, 236, { r: 22, fill: i >= 3 ? 0x3a2370 : 0x2b2442, gold: i === RUBY_PRODUCTS.length - 1 });
      const pack = `ruby-pack-${Math.min(5, i + 1)}`; // 2026-11-26: 양에 따라 몇 알 → 주머니 → 더미 → 그릇 → 보물 상자
      if (this.textures.exists(pack)) card.add(this.add.image(0, -56, pack).setDisplaySize(118, 118));
      else {
        const n = Math.min(5, 1 + i);
        for (let k = 0; k < n; k++) {
          const a = n === 1 ? 0 : (k / (n - 1) - 0.5) * 1.2;
          card.add(this.add.image(Math.sin(a) * 44, -52 + Math.abs(a) * 14, 'ui-ruby').setDisplaySize(62 - n * 3, 62 - n * 3));
        }
      }
      card.add(text(this, 0, 14, (def.rubies + def.bonus).toLocaleString(), TYPE.heading, COLOR.text, true, true).setOrigin(0.5));
      card.add(text(this, 0, 46, def.bonus ? `보너스 +${def.bonus.toLocaleString()}` : '루비', TYPE.tiny, def.bonus ? COLOR.gold : COLOR.textSub, true, true).setOrigin(0.5));
      const price = () => this.storeProducts.find((x) => x.productId === def.productId)?.priceLabel ?? `₩${def.krw.toLocaleString()}`;
      button(this, x, cy + 88, 180, 58, price(), () => this.buyRuby(def.productId), { kind: 'cta', size: TYPE.caption });
    });
    return y0 + 160 + 250 + 120;
  }

  /** 기간 한정 패키지: 넓은 카드 3장(구성 아이콘 + 가격). 결제 연결 전에는 안내만 */
  /**
   * 패키지 · 특혜(2026-11-23 제작자 요청: 참고 시안처럼 일일/주간/월간 특혜 탭).
   * 탭: 한정(계정당 1회) · 일일(무료 선물 + 꾸러미 2) · 주간 · 월간. 탭을 바꾸면 스크롤 위치를 지킨 채 다시 그린다.
   */
  private packageSection(y0: number): number {
    const TABS: { key: DealTab; label: string; note: string }[] = [
      { key: 'once', label: '한정', note: '계정당 1회' },
      { key: 'daily', label: '일일 특혜', note: '매일 0시 초기화' },
      { key: 'weekly', label: '주간 특혜', note: '매주 월요일 초기화' },
      { key: 'monthly', label: '월간 특혜', note: '매월 1일 초기화' },
    ];
    const cur = TABS.find((t) => t.key === this.dealTab) ?? TABS[0];
    this.section(y0, 'ic-gift', '패키지 · 특혜', cur.note);
    const p = Progress.load();
    const now = gameNow();
    tabs(this, y0 + 76, TABS.map((t) => (t.key === 'daily' && !freeDailyClaimed(p, now) ? `${t.label} !` : t.label)), TABS.indexOf(cur), (i) => {
      if (this.dragged || TABS[i].key === this.dealTab) return;
      this.scene.restart({ dealTab: TABS[i].key, scrollY: this.content?.y ?? 0 });
    });
    let y = y0 + 150;
    if (cur.key === 'daily') {
      // 무료 일일 선물(결제 없음)
      const got = freeDailyClaimed(p, now);
      const card = plate(this, 360, y + 54, 680, 128, { r: 24, fill: 0x1f4a2a, gold: !got });
      card.add(this.add.image(-262, 0, 'ic-gift').setDisplaySize(96, 96));
      card.add(text(this, -196, -24, '무료 일일 선물', TYPE.body, COLOR.gold, true, true).setOrigin(0, 0.5));
      card.add(text(this, -196, 18, `골드 ${FREE_DAILY_GIFT.gold.toLocaleString()} + 루비 ${FREE_DAILY_GIFT.rubies}`, TYPE.caption, COLOR.text, true, true).setOrigin(0, 0.5));
      const fb = button(this, 360 + 236, y + 54, 160, 62, got ? '내일 또' : '무료 받기', () => this.claimFree(), { kind: got ? 'secondary' : 'growth', size: TYPE.caption });
      fb.setEnabled(!got);
      y += 150;
    }
    const list = cur.key === 'once' ? PACKAGES : DEALS.filter((d) => d.period === cur.key);
    list.forEach((pk, i) => {
      const cy = y + 100 + i * 220;
      const left = Math.max(0, pk.limit - packageBought(p, pk.productId, now));
      const card = plate(this, 360, cy, 680, 200, { r: 24, fill: [0x4a2a1a, 0x1d3a52, 0x22306a][i % 3], gold: left > 0 });
      const art = this.packageArt(pk);
      card.add(this.add.image(-236, -6, art).setDisplaySize(160, 160));
      card.add(badge(this, -268, -78, cur.key === 'once' ? '한정' : cur.label.replace(' 특혜', ''), COLOR.ruby));
      card.add(text(this, -130, -64, pk.name, TYPE.body, COLOR.gold, true, true).setOrigin(0, 0.5));
      card.add(text(this, 316, -64, `남은 구매 ${left}/${pk.limit}`, TYPE.tiny, left ? COLOR.textSub : COLOR.danger, true, true).setOrigin(1, 0.5));
      this.packageItems(pk).forEach((it, k) => {
        const cell = plate(this, -96 + k * 84, -2, 74, 74, { r: 14, fill: 0x15102a });
        if (this.textures.exists(it.icon)) cell.add(this.add.image(0, -8, it.icon).setDisplaySize(46, 46));
        cell.add(text(this, 0, 24, it.amount, 14, COLOR.text, true, true).setOrigin(0.5));
        card.add(cell);
      });
      const price = this.storeProducts.find((x) => x.productId === pk.productId)?.priceLabel ?? `₩${pk.krw.toLocaleString()}`;
      const b = button(this, 360 + 236, cy + 62, 160, 56, left ? price : '구매 완료', () => this.buyPackage(pk), { kind: 'cta', size: TYPE.caption });
      b.setEnabled(left > 0);
    });
    return y + 100 + (list.length - 1) * 220 + 110;
  }

  /** 패키지 대표 그림: 드래곤 개봉권 → 드래곤 상자, 장비 → 장비 상자, 룬 → 룬 상자, 그 밖엔 금 상자 */
  private packageArt(pk: PackageDef): string {
    // 16차분 패키지 그림: 여러 종류가 섞이면 큰 묶음, 드래곤·장비·룬 하나면 그 묶음, 루비·골드만이면 큰 묶음
    const kinds = [pk.dragonTickets, pk.equipTickets, pk.runeTickets].filter(Boolean).length;
    const key = kinds > 1 ? 'pkg-mega' : pk.dragonTickets ? 'pkg-dragon' : pk.equipTickets ? 'pkg-gear' : pk.runeTickets ? 'pkg-rune' : 'pkg-mega';
    return this.textures.exists(key) ? key : 'chest-gold';
  }

  /** 무료 일일 선물 받기 → 보상 팝업 */
  private claimFree(): void {
    if (this.dragged) return;
    const r = claimFreeDaily(Progress.load(), gameNow());
    if (!r.ok) return toast(this, '오늘은 이미 받았어요', COLOR.textSub);
    Progress.save(r.progress);
    rewardPopup(this, '무료 일일 선물', [
      { image: 'ui-gold', emoji: '🪙', label: '골드', amount: `+${FREE_DAILY_GIFT.gold.toLocaleString()}` },
      { image: 'ui-ruby', emoji: '💎', label: '루비', amount: `+${FREE_DAILY_GIFT.rubies}`, grade: 'rare' },
    ], () => this.scene.restart({ dealTab: this.dealTab, scrollY: this.content?.y ?? 0 }));
  }

  /** 패키지 구성 → 아이콘 칸(루비·골드·드래곤/장비/룬 개봉권) */
  private packageItems(pk: PackageDef): { icon: string; amount: string }[] {
    const out: { icon: string; amount: string }[] = [];
    if (pk.rubies) out.push({ icon: 'ui-ruby', amount: `×${pk.rubies.toLocaleString()}` });
    if (pk.gold) out.push({ icon: 'ui-gold', amount: `×${(pk.gold / 1000).toLocaleString()}K` });
    if (pk.dragonTickets) out.push({ icon: 'ui-ticket', amount: `드래곤 ×${pk.dragonTickets}` });
    if (pk.equipTickets) out.push({ icon: this.textures.exists('ui-ticket-equip') ? 'ui-ticket-equip' : 'chest-equipment', amount: `장비 ×${pk.equipTickets}` });
    if (pk.runeTickets) out.push({ icon: this.textures.exists('ui-ticket-rune') ? 'ui-ticket-rune' : 'chest-rune', amount: `룬 ×${pk.runeTickets}` });
    return out;
  }

  /** 루비 결제: 결제 → 서버 검증 → 검증된 거래만 지급(거래 ID 한 번만). 결제를 못 쓰는 곳은 안내 */
  private buyRuby(productId: string): void {
    this.pay(productId);
  }

  /** 패키지·특혜 결제: 서버가 기간·계정당 횟수를 확인한 뒤 결제 → 서버 검증 → 지급 */
  private buyPackage(pk: PackageDef): void {
    this.pay(pk.productId);
  }

  /** 공통 결제: 서버 확인 → App Store 결제 → 서버 검증 → 지급(docs/PAYMENTS.md). 결제를 못 쓰는 곳은 안내 */
  private pay(productId: string): void {
    if (this.payBusy) return;
    if (!purchases.available) {
      toast(this, '결제는 App Store 앱에서 할 수 있어요', COLOR.textSub);
      return;
    }
    this.payBusy = true;
    void buyProduct(productId)
      .then((r) => {
        if (!this.sys.isActive()) return;
        if (r.ok) {
          popWord(this, grantLine(r.delivered.total) || '구매 완료', 640);
          this.frame.refresh();
          // 지급 글자를 잠깐 보여 준 뒤 남은 구매 횟수·개봉권을 다시 그리기
          this.time.delayedCall(1100, () => this.scene.restart({ dealTab: this.dealTab, scrollY: this.content?.y ?? 0 }));
          return;
        }
        const msg = buyFailText(r.reason);
        if (msg) toast(this, msg, r.reason === 'failed' ? COLOR.danger : COLOR.textSub);
      })
      .finally(() => (this.payBusy = false));
  }

  /** 구매 복원(애플 필수): 스토어 복원 + 결제 서버 장부에서 아직 못 받은 지급 */
  private restorePurchases(): void {
    if (this.payBusy) return;
    if (!purchases.available) {
      toast(this, '구매 복원은 App Store 앱에서 할 수 있어요', COLOR.textSub);
      return;
    }
    this.payBusy = true;
    restoreAll()
      .then((d) => {
        if (!this.sys.isActive()) return;
        const line = d ? grantLine(d.total) : '';
        toast(this, line ? `복원 완료 · ${line}` : d?.applied.length ? '복원 완료' : '복원할 결제가 없어요', d?.applied.length ? COLOR.ok : COLOR.textSub);
        if (d?.applied.length) this.time.delayedCall(1400, () => this.scene.restart({ dealTab: this.dealTab, scrollY: this.content?.y ?? 0 }));
      })
      .catch(() => toast(this, '복원하지 못했어요. 잠시 뒤 다시 시도해 주세요', COLOR.danger))
      .finally(() => (this.payBusy = false));
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
    this.content?.add(pity); // 스크롤 판 안으로(위치는 판 기준 그대로)
    const tickets = (box: BoxId) => (box === 'dragon' ? p.summon.legacyTickets : box === 'equipment' ? p.summon.equipTickets ?? 0 : p.summon.runeTickets ?? 0);
    for (const b of this.buttons) {
      const price = b.count === 10 ? BOXES[b.box].price10 : BOXES[b.box].price1;
      const can = b.pay === 'ticket' ? tickets(b.box) >= b.count : p.rubies >= price;
      b.btn.setEnabled(!this.busy && can);
    }
    for (const t of this.boxTicketButtons) {
      const n = tickets(t.box);
      t.btn.root.setVisible(n > 0);
      t.desc.setVisible(n === 0);
      t.btn.setLabel(`무료 개봉권 1회 · ${n}장`);
    }
    for (const g of this.goldButtons) g.btn.setEnabled(!this.busy && p.rubies >= g.rubies);
  }

  private buyGold(id: string): void {
    const r = Progress.buyGold(id, `gold-${Date.now()}-${this.tx++}`);
    if (!r.ok) toast(this, '루비가 부족해요', COLOR.danger);
    else popWord(this, `골드 +${r.gold.toLocaleString()}`, 980);
    this.refresh();
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
    add(this.add.rectangle(360, 640, 720, fullH(this), 0x000000, 0.82).setInteractive());
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
    lines.push(`[드래곤·스킬 상자] 1차: 카드 ${B.kind.card}% · 조각 ${B.kind.fragment}% · 정수 ${B.kind.essence}%`);
    for (const r of RARITIES) {
      const ids = poolOf(r, false);
      const p = (B.kind.essence / kTotal) * (B.essenceRarity[r] / rTotal);
      lines.push(`  정수 ${RARITY_LABEL[r]} ${B.essenceRarity[r]}% → 상자 전체 ${pct(p)} (${ids.map((id) => DRAGONS[id].short).join('·')} 각 ${pct(p / ids.length)})`);
    }
    lines.push(`  전설 정수의 상자 전체 확률은 ${pct((B.kind.essence / kTotal) * (B.essenceRarity.legendary / rTotal))} (정수 ${B.kind.essence}% × 전설 ${B.essenceRarity.legendary}%)`);
    lines.push(`  보장: 매 ${B.rareGuarantee}회째 희귀 이상 정수(희귀:영웅:전설 = ${B.guaranteeWeights.rare}:${B.guaranteeWeights.epic}:${B.guaranteeWeights.legendary}), ${B.legendaryGuarantee}회째 전설 정수 — 그 회차 결과를 대신함`);
    lines.push(`  카드: 일반 ${B.cardCount.common}·희귀 ${B.cardCount.rare}·영웅 ${B.cardCount.epic}·전설 ${B.cardCount.legendary}장(레드 포함) · 조각: ${B.fragmentCount.common}/${B.fragmentCount.rare}/${B.fragmentCount.epic}/${B.fragmentCount.legendary}개`);
    lines.push(`  중복 정수 → 조각 ${ESSENCE.essenceToFragments.common}/${ESSENCE.essenceToFragments.rare}/${ESSENCE.essenceToFragments.epic}/${ESSENCE.essenceToFragments.legendary} · 레드는 정수·조각 대상 아님`);
    lines.push('');
    lines.push(`[장비 상자] 일반 ${EQUIPMENT_BOX.rarity.common}% · 희귀 ${EQUIPMENT_BOX.rarity.rare}% · 영웅 ${EQUIPMENT_BOX.rarity.epic}% · 전설 ${EQUIPMENT_BOX.rarity.legendary}% · 장비 8종 균등`);
    lines.push(`[룬 상자] 룬 조각 ${RUNE_BOX.bundles.map(([n, w]) => `${n}개 ${w}%`).join(' · ')} (15종 균등) · 보장: 매 ${RUNE_BOX.guaranteeEvery}회째 10개 이상(${RUNE_BOX.guaranteeBundles.map(([n, w]) => `${n}개 ${w}`).join(':')})`);
    lines.push(`[골드 구매] ${GOLD_OFFERS.map((o) => `루비 ${o.rubies.toLocaleString()} → ${o.gold.toLocaleString()}G`).join(' · ')}`);
    lines.push('');
    lines.push('루비는 게임 보상과 App Store 구매로 얻을 수 있어요.');
    add(this.add.text(48, 230, lines.join('\n'), { fontFamily: 'sans-serif', fontSize: '18px', color: css(0xe1d5f5), lineSpacing: 9, wordWrap: { width: 624 } }));
  }
}

function describe(res: BoxResult): { color: number; title: string; sub: string; portrait?: string; image?: string; icon: string } {
  switch (res.kind) {
    case 'essence':
      return {
        color: RARITY_COLOR[res.rarity], portrait: res.dragonId, icon: '',
        title: `${DRAGONS[res.dragonId].short} 정수${res.guaranteed ? ' (보장)' : ''}`,
        // 이미 가진 드래곤의 정수는 그 자리에서 조각으로 바뀌어 들어간다(따로 바꾸는 화면 없음 — 제작자 질문 2026-11-25)
        sub: res.isNew ? 'NEW! 해금' : `중복→조각 +${res.fragments}`,
      };
    case 'card':
      return { color: RARITY_COLOR[res.rarity], portrait: res.dragonId, icon: '', title: `${DRAGONS[res.dragonId].short} 카드`, sub: `+${res.count}장` };
    case 'fragment':
      return { color: RARITY_COLOR[res.rarity], portrait: res.dragonId, icon: '', title: `${DRAGONS[res.dragonId].short} 조각`, sub: `+${res.count}` };
    case 'special': {
      const s = specialDef(res.specialId)!;
      return { color: s.color, image: `sp-${res.specialId}`, icon: s.icon, title: `${s.name} 룬`, sub: `룬 조각 +${res.count}` };
    }
    case 'equipment': {
      const d = equipDef(res.item.itemId)!;
      return { color: RARITY_COLOR[res.item.rarity], image: equipIcon(d.slot, res.item.rarity), icon: SLOT_ICON[d.slot], title: `${d.name}\n${SLOT_LABEL[d.slot]}`, sub: RARITY_LABEL[res.item.rarity] };
    }
    case 'gold':
      return { color: 0xffd34d, image: 'ui-gold', icon: '🪙', title: '골드', sub: `+${res.gold.toLocaleString()}G` };
  }
}
