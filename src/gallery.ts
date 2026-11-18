import Phaser from 'phaser';
import { COLOR, RARITY, RARITY_NAME, tint, TYPE, type RarityKey } from './ui/theme';
import { badge, button, currencyBar, header, itemCard, milestoneBar, modal, navBar, panel, progressBar, ribbon, slot, text } from './ui/kit';
import { drawLobbyBackdrop, drawScreenBackdrop, makeArtPlaceholders, preloadArt } from './ui/art';
import { makeDragonTextures } from './dragonArt';
import { altar, dragonCarousel, plate, tabs, iconTile, milestonePanel, roundButton, topBar, torch, wingBanner } from './ui/kit2';
import {
  STAMINA, claimGift, formatLeft, grantClearGift, newGiftBox, newStamina, nextRegenIn, regen, spend, unclaimedCount,
  type GiftBox, type StaminaState,
} from './systems/Stamina';

// 시안 페이지 전용 저장(브라우저). 실제 게임에서는 계정 저장(Progress)에 들어간다.
const SKEY = 'gallery:stamina-v1';
function loadDemo(): { s: StaminaState; box: GiftBox } {
  try {
    const j = JSON.parse(localStorage.getItem(SKEY) ?? '');
    if (j && j.s && j.box) return j;
  } catch {
    /* 처음 */
  }
  return { s: newStamina(Date.now()), box: newGiftBox() };
}
function saveDemo(d: { s: StaminaState; box: GiftBox }): void {
  try {
    localStorage.setItem(SKEY, JSON.stringify(d));
  } catch {
    /* 저장 불가 환경 */
  }
}

// 디자인 시안 페이지(개발용): 새 UI 부품과 v1.2 화면 시안을 실제 게임 해상도(720×1280)로 본다.
// 시안의 숫자·이름은 보기용 예시이고 실제 데이터와 연결돼 있지 않다.
// 구조(재화 줄·하단 탭·등급 카드·리본 제목·진행도 상자)는 장르 공통 형식을 참고했고, 그림·색은 우리 것.
type Page = 'lobby' | 'shop' | 'equip' | 'dragons' | 'kit';
// 하단 탭(시안 형식): 상점 · 드래곤 · 전투(가운데) · 장비 · 연구소.
// 소환 탭은 없앰(제작자 결정 2026-11-18): 소환 = 상점의 드래곤 소환(루비 상자)이라 같은 기능이 두 곳에 생기지 않게.
const NAV: { key: Page | 'lab'; label: string; icon: string; alert?: boolean }[] = [
  { key: 'shop', label: '상점', icon: 'ic-shop', alert: true },
  { key: 'dragons', label: '드래곤', icon: 'ic-dragon' },
  { key: 'lobby', label: '전투', icon: 'ic-swords' },
  { key: 'equip', label: '장비', icon: 'ic-shield', alert: true },
  { key: 'lab', label: '연구소', icon: 'ic-upgrade' },
];
const DRAGON_IDS = ['red', 'blue', 'yellow', 'green', 'white', 'black', 'stone', 'wind', 'water', 'arcane'];

class GalleryScene extends Phaser.Scene {
  private page: Page = 'lobby';
  private picked = 0; // 로비 캐러셀에서 고른 드래곤
  private demo = loadDemo(); // 행동력·선물함(시안용 저장)
  private bar!: ReturnType<typeof topBar>;
  private tick = 0;

  constructor() {
    super('gallery');
  }

  init(data: { page?: Page; picked?: number }): void {
    this.page = data.page ?? ((new URLSearchParams(location.search).get('page') as Page) || 'lobby');
    this.picked = data.picked ?? 0;
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    makeArtPlaceholders(this);
    if (!this.textures.exists('portrait-red')) makeDragonTextures(this);
    if (this.page === 'lobby') drawLobbyBackdrop(this);
    else drawScreenBackdrop(this);
    this.demo = loadDemo();
    this.demo.s = regen(this.demo.s, Date.now()); // 앱을 꺼 둔 시간만큼 회복
    saveDemo(this.demo);
    this[this.page]();
    this.bar = topBar(this, {
      portrait: `portrait-${DRAGON_IDS[this.picked]}`,
      level: 12,
      cp: '1,240',
      currencies: [
        { icon: 'ic-energy', value: '', onPlus: () => this.giftBox() }, // 행동력: + 는 선물함(결제 없음)
        { icon: 'ui-gold', value: 12890, onPlus: () => {} },
        { icon: 'ui-ruby', value: 300, onPlus: () => {} },
      ],
    });
    this.refreshStamina();
    navBar(this, NAV, this.page === 'kit' ? '' : this.page, (k) => this.scene.restart({ page: k === 'lab' ? 'kit' : (k as Page) }));
  }

  update(_t: number, delta: number): void {
    this.tick += delta;
    if (this.tick >= 500) {
      this.tick = 0;
      this.refreshStamina();
    }
  }

  /** 행동력 게이지: '35/40' + 다음 회복까지 남은 시간(가득이면 '가득') */
  private refreshStamina(): void {
    const now = Date.now();
    const s = regen(this.demo.s, now);
    if (s.value !== this.demo.s.value) {
      this.demo.s = s;
      saveDemo(this.demo);
    }
    const left = nextRegenIn(s, now);
    this.bar?.set(0, `${s.value}/${STAMINA.max}`, left === null ? '가득' : `${formatLeft(left)} 후 +1`);
  }

  private toast(msg: string, color: number = COLOR.text): void {
    const t = text(this, 360, 640, msg, TYPE.body, color, true, true).setOrigin(0.5).setDepth(1000);
    const bg = this.add.rectangle(360, 640, t.width + 60, 70, 0x000000, 0.75).setDepth(999);
    this.tweens.add({ targets: [t, bg], alpha: 0, delay: 1300, duration: 400, onComplete: () => (t.destroy(), bg.destroy()) });
  }

  /** 전투 시작: 행동력 5 사용(임시값). 부족하면 안내 */
  private startBattle(): void {
    const now = Date.now();
    const r = spend(this.demo.s, STAMINA.entryCost, now);
    if (!r.ok) {
      const left = nextRegenIn(r.state, now);
      this.toast(`행동력이 부족해요 (${STAMINA.entryCost} 필요${left !== null ? ` · ${formatLeft(left)} 후 +1` : ''})`, COLOR.danger);
      return;
    }
    this.demo.s = r.state;
    saveDemo(this.demo);
    this.refreshStamina();
    this.toast(`행동력 -${STAMINA.entryCost} · 출격! (시안: 전투는 실제 게임에서)`, COLOR.gold);
  }

  /** 선물함 팝업: 행동력 충전 선물 목록 · 개별 수령 */
  private giftBox(): void {
    const box = this.demo.box;
    const m = modal(this, 640, 720, '선물함', { closeOnBackdrop: true, ribbonColor: COLOR.violet });
    const list = [...box.gifts].sort((a, b) => Number(!!a.claimedAt) - Number(!!b.claimedAt) || b.createdAt - a.createdAt);
    if (list.length === 0) m.body(text(this, 0, -40, '받을 선물이 없어요\n스테이지를 처음 클리어하면\n행동력 20개가 들어와요', TYPE.body, COLOR.textSub, true).setOrigin(0.5));
    list.slice(0, 4).forEach((g, i) => {
      const y = -200 + i * 120;
      const row = plate(this, 0, y, 560, 104, { r: 18, fill: g.claimedAt ? 0x221d33 : 0x2b2442 });
      row.add(this.add.image(-230, 0, 'ic-energy').setDisplaySize(70, 70));
      row.add(text(this, -180, -18, `${g.title} ×${g.amount}`, TYPE.body, g.claimedAt ? COLOR.textDim : COLOR.text, true, true).setOrigin(0, 0.5));
      row.add(text(this, -180, 20, g.source, TYPE.tiny, COLOR.textSub).setOrigin(0, 0.5));
      if (g.claimedAt) row.add(text(this, 200, 0, '수령 완료', TYPE.caption, COLOR.textDim, true).setOrigin(0.5));
      else {
        const now = Date.now();
        const cur = regen(this.demo.s, now).value;
        const can = cur + g.amount <= STAMINA.max;
        const b = button(this, 200, 0, 140, 64, '받기', () => {
          const r = claimGift(this.demo.box, this.demo.s, g.id, Date.now());
          if (r.ok) {
            this.demo = { s: r.state, box: r.box };
            saveDemo(this.demo);
            m.close();
            this.scene.restart({ page: this.page, picked: this.picked });
          }
        }, { kind: 'growth', size: TYPE.body });
        if (!can) {
          b.setEnabled(false);
          row.add(text(this, 200, 42, `행동력 ${STAMINA.max - g.amount} 이하일 때`, 15, COLOR.textSub).setOrigin(0.5));
        }
        row.add(b.root);
      }
      m.body(row);
    });
    m.body(text(this, 0, 290, `받으면 최대 ${STAMINA.max}개를 넘지 않을 때만 받을 수 있어요. 남은 선물은 그대로 보관돼요.`, TYPE.tiny, COLOR.textSub).setOrigin(0.5));
  }

  /** 로비(기획자 시안 형식): 날개 배너 · 양옆 아이콘 기둥 · 횃불과 제단 위 드래곤 · 캐러셀 · 진행도 상자 · 전투 버튼 */
  private lobby(): void {
    wingBanner(this, 360, 205, 400, '1단계 · 잿빛 숲', { sub: '쉬움 · 진행도 5%', emblem: 'ic-banner' });

    // 양옆 아이콘 기둥(시안의 바로가기 자리 — 우리 기능에 맞춤)
    const left: [string, string, boolean][] = [['ic-calendar', '출석', true], ['ic-mission', '임무', true], ['ic-book', '도감', false], ['ic-laurel', '업적', false]];
    const gifts = unclaimedCount(this.demo.box);
    const right: [string, string, boolean][] = [['ic-gift', gifts ? `선물함 ${gifts}` : '선물함', gifts > 0], ['ic-chest', '상자', false], ['ic-cards', '카드', false], ['ic-target', '목표', false]];
    left.forEach(([ic, l, al], i) => iconTile(this, 62, 300 + i * 112, ic, { size: 86, label: l, alert: al, onClick: i === 0 ? () => this.attendance() : undefined }));
    right.forEach(([ic, l, al], i) => iconTile(this, 658, 300 + i * 112, ic, { size: 86, label: l, alert: al, onClick: i === 0 ? () => this.giftBox() : undefined }));

    // 횃불 · 제단 · 출격 드래곤
    torch(this, 172, 600);
    torch(this, 548, 600);
    altar(this, 360, 640, 400);
    const id = DRAGON_IDS[this.picked];
    const hero = this.add.image(360, 480, `portrait-${id}`).setDisplaySize(370, 370);
    this.tweens.add({ targets: hero, y: 472, yoyo: true, repeat: -1, duration: 1600, ease: 'Sine.InOut' });

    // 드래곤 캐러셀
    dragonCarousel(this, 768, DRAGON_IDS.map((d) => `portrait-${d}`), this.picked, (i) => this.scene.restart({ page: 'lobby', picked: i }));

    // 진행도 상자
    milestonePanel(this, 912, 0.05, [
      { at: 0.25, icon: 'chest-gold' },
      { at: 0.5, icon: 'chest-equipment' },
      { at: 1, icon: 'chest-dragon' },
    ], '진행도');

    // 전투 버튼 + 양옆 원형 버튼(단계 지도 · 연구소)
    roundButton(this, 92, 1046, 'ic-scroll', { label: '단계', alert: true });
    roundButton(this, 628, 1046, 'ic-target', { label: '난이도', onClick: () => this.toast('쉬움 → 어려움 → 매우 어려움 (v1.2 난이도 선택)', COLOR.gold) });
    const go = button(this, 360, 1040, 370, 112, '전투 시작', () => this.startBattle(), { kind: 'cta', size: 40, icon: 'ic-swords', sub: `행동력 ${STAMINA.entryCost}` });
    this.tweens.add({ targets: go.root, scale: 1.03, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.InOut' });
  }

  /** 상점(시안 형식): 금색 리본 제목 · 탭 · 큰 소환 배너(드래곤·스킬 상자) · 1회/10회 · 보장 진행 · 상자 2종 · 보상 교환 */
  private shop(): void {
    ribbon(this, 360, 182, 330, '상점', 0xe0a032, 70);
    tabs(this, 262, ['상자', '보상', '교환'], 0);

    // 큰 소환 배너
    const ban = plate(this, 360, 470, 660, 330, { r: 26, gold: true, fill: 0x3a2370 });
    const glow = this.add.circle(0, -10, 150, COLOR.violet, 0.25);
    ban.add(glow);
    this.tweens.add({ targets: glow, scale: 1.12, alpha: 0.12, yoyo: true, repeat: -1, duration: 1100 });
    ban.add(this.add.image(-150, 20, 'portrait-blue').setDisplaySize(170, 170));
    ban.add(this.add.image(150, 20, 'portrait-black').setDisplaySize(170, 170));
    ban.add(this.add.image(0, -10, 'chest-dragon').setDisplaySize(230, 230));
    ban.add(text(this, 0, 112, '드래곤 소환', 40, COLOR.gold, true, true).setOrigin(0.5));
    ban.add(text(this, 0, 146, '드래곤·스킬 상자 — 정수 · 조각 · 카드 · 특수 스킬 조각', TYPE.tiny, COLOR.text, true, true).setOrigin(0.5));
    for (const sgn of [-1, 1]) ban.add(this.add.triangle(sgn * 300, 0, 0, -22, 0, 22, sgn * 26, 0, 0xffe39a).setStrokeStyle(4, COLOR.outline));

    button(this, 205, 700, 290, 108, '1회 소환', () => {}, { kind: 'growth', icon: 'ui-ruby', sub: '150', size: TYPE.heading });
    button(this, 515, 700, 290, 108, '10회 소환', () => {}, { kind: 'cta', icon: 'ui-ruby', sub: '1,350', size: TYPE.heading });
    const pity = plate(this, 360, 806, 660, 70, { r: 20 });
    pity.add(text(this, -300, 0, '희귀 보장', TYPE.caption, COLOR.text, true, true).setOrigin(0, 0.5));
    pity.add(progressBar(this, 30, 0, 330, 24, 0.3, COLOR.violet, '3/10').root);
    pity.add(text(this, 300, 0, '전설 27/90', TYPE.caption, RARITY.legendary, true, true).setOrigin(1, 0.5));
    button(this, 360, 878, 330, 56, '확률 · 보장 규칙 보기', () => this.probModal(), { kind: 'secondary', size: TYPE.caption });

    // 상자 2종
    const two = [
      { key: 'chest-equipment', name: '장비 상자', price: '100', fill: 0x24406e },
      { key: 'chest-gold', name: '골드 상자', price: '50', fill: 0x6b4a14 },
    ];
    two.forEach((c, i) => {
      const x = 196 + i * 328;
      const card = plate(this, x, 1010, 312, 170, { r: 22, fill: c.fill });
      card.add(this.add.image(-88, -4, c.key).setDisplaySize(130, 130));
      card.add(text(this, 40, -40, c.name, TYPE.body, COLOR.text, true, true).setOrigin(0.5));
      card.add(button(this, 40, 30, 150, 60, c.price, () => {}, { kind: 'magic', icon: 'ui-ruby', size: TYPE.body }).root);
    });
  }

  private probModal(): void {
    const m = modal(this, 620, 660, '확률 공개', { closeOnBackdrop: true, ribbonColor: COLOR.violet });
    const rows: [string, string, number][] = [
      ['카드', '40%', COLOR.text],
      ['조각', '25%', COLOR.text],
      ['정수', '15%', COLOR.violet],
      ['특수 스킬 조각', '20%', COLOR.text],
      ['정수 등급: 일반 70 · 희귀 22', '', COLOR.textSub],
      ['영웅 7 · 전설 1 (%)', '', COLOR.textSub],
      ['전설 정수(상자 전체 기준)', '0.15%', RARITY.legendary],
    ];
    rows.forEach(([a, b, c], i) => {
      m.body(text(this, -260, -200 + i * 54, a, TYPE.body, c, true).setOrigin(0, 0.5));
      m.body(text(this, 260, -200 + i * 54, b, TYPE.body, c, true, true).setOrigin(1, 0.5));
    });
    m.body(text(this, 0, 196, '10회마다 희귀 이상 정수 · 90회까지 전설 정수 확정', TYPE.caption, COLOR.textSub).setOrigin(0.5));
    m.body(button(this, 0, 264, 240, 70, '확인', () => m.close(), { kind: 'cta', size: TYPE.body }).root);
  }

  /** 장비(시안 형식): 제단 위 드래곤 + 양옆 장착 슬롯 4 · 능력치 줄 · 탭 · 보유 장비 격자 */
  private equip(): void {
    ribbon(this, 360, 182, 330, '장비', 0xe0a032, 70);
    altar(this, 360, 470, 300);
    this.add.image(360, 360, 'portrait-red').setDisplaySize(290, 290);
    const eq: [string, RarityKey | null, string][] = [
      ['equip-weapon', 'rare', 'Lv.5'], ['equip-armor', 'common', 'Lv.3'],
      ['equip-necklace', null, ''], ['equip-ring', 'epic', 'Lv.2'],
    ];
    eq.forEach(([icon, r, lv], i) => {
      const x = i < 2 ? 100 : 620;
      const y = 300 + (i % 2) * 150;
      const sl = slot(this, x, y, 120, { icon: r ? icon : undefined, rarity: r ? RARITY[r] : undefined });
      if (lv) sl.add(text(this, 0, 46, lv, TYPE.tiny, COLOR.text, true, true).setOrigin(0.5));
    });
    // 능력치 줄
    const st = plate(this, 360, 560, 660, 80, { r: 20 });
    const stats: [string, string, string][] = [['ic-swords', '공격력', '14.5'], ['ic-heart', 'HP', '+6'], ['ic-shield', '피해 감소', '4%']];
    stats.forEach(([ic, l, v], i) => {
      const x = -220 + i * 220;
      st.add(this.add.image(x - 62, 0, ic).setDisplaySize(48, 48));
      st.add(text(this, x - 30, -14, l, TYPE.tiny, COLOR.textSub, true).setOrigin(0, 0.5));
      st.add(text(this, x - 30, 14, v, TYPE.body, COLOR.text, true, true).setOrigin(0, 0.5));
    });
    tabs(this, 650, ['장비 목록', '강화', '합성'], 0);
    const own: [string, RarityKey, string][] = [
      ['equip-weapon', 'common', 'Lv.7'], ['equip-weapon', 'common', 'Lv.1'], ['equip-ring', 'rare', 'Lv.4'], ['equip-armor', 'common', 'Lv.2'], ['equip-necklace', 'epic', 'Lv.6'],
      ['equip-weapon', 'common', 'Lv.1'], ['equip-armor', 'rare', 'Lv.1'], ['equip-ring', 'common', 'Lv.3'], ['equip-necklace', 'legendary', 'Lv.1'], ['equip-armor', 'epic', 'Lv.2'],
    ];
    own.forEach(([icon, r, lv], i) => {
      const sl = slot(this, 96 + (i % 5) * 132, 770 + Math.floor(i / 5) * 140, 114, { icon, rarity: RARITY[r] });
      sl.add(text(this, 0, 44, lv, TYPE.tiny, COLOR.text, true, true).setOrigin(0.5));
    });
    button(this, 360, 1068, 360, 80, '합성 3 → 1', () => {}, { kind: 'magic', size: TYPE.body, alert: true });
  }

  /** 드래곤(시안 형식): 금색 리본 · 탭 · 초상 타일 4열(등급 테두리·레벨·별) · 미보유는 실루엣 · 보유 수 · 정렬 */
  private dragons(): void {
    ribbon(this, 360, 182, 330, '드래곤', 0xe0a032, 70);
    tabs(this, 262, ['보유 드래곤', '성장', '승급'], 0);
    const list: [string, RarityKey, number, number][] = [
      ['red', 'starter', 12, 2], ['blue', 'common', 4, 1], ['yellow', 'common', 0, 0], ['green', 'common', 2, 1],
      ['white', 'rare', 0, 0], ['black', 'rare', 1, 1], ['stone', 'rare', 0, 0], ['wind', 'epic', 0, 0],
      ['water', 'epic', 0, 0], ['arcane', 'legendary', 0, 0],
    ];
    list.forEach(([id, r, lv, stars], i) => {
      const x = 104 + (i % 4) * 171;
      const y = 410 + Math.floor(i / 4) * 196;
      const owned = lv > 0;
      const t = plate(this, x, y, 156, 178, { r: 20, gold: i === 0, fill: owned ? tint(RARITY[r], -55) : 0x1e1a2c });
      const img = this.add.image(0, -14, `portrait-${id}`).setDisplaySize(160, 160);
      if (!owned) img.setTint(0x141018);
      t.add(img);
      t.add(this.add.circle(-56, -66, 16, RARITY[r]).setStrokeStyle(4, COLOR.outline));
      if (owned) {
        t.add(text(this, 0, 42, `Lv.${lv}`, TYPE.body, COLOR.text, true, true).setOrigin(0.5));
        t.add(text(this, 0, 70, '★'.repeat(stars) + '☆'.repeat(5 - stars), TYPE.caption, COLOR.gold, true, true).setOrigin(0.5));
      } else {
        t.add(text(this, 0, 52, RARITY_NAME[r], TYPE.caption, COLOR.textSub, true, true).setOrigin(0.5));
      }
    });
    const foot = plate(this, 360, 1070, 660, 76, { r: 20 });
    foot.add(text(this, -300, 0, '보유 5/10', TYPE.body, COLOR.text, true, true).setOrigin(0, 0.5));
    foot.add(button(this, 110, -2, 150, 54, '정렬 ▾', () => {}, { kind: 'secondary', size: TYPE.caption }).root);
    foot.add(button(this, 250, -2, 120, 54, '필터', () => {}, { kind: 'secondary', size: TYPE.caption }).root);
  }

  /** 출석 체크 팝업(밝은 양피지 패널) */
  private attendance(): void {
    const m = modal(this, 640, 760, '7일 출석 체크', { closeOnBackdrop: true, fill: COLOR.panelLight, ribbonColor: COLOR.ember });
    const days: [string, string][] = [['ui-gold', '1,000'], ['ui-ruby', '50'], ['ui-card', '2'], ['ui-ticket', '1'], ['ui-gold', '3,000'], ['ui-fragment', '20'], ['chest-dragon', '1']];
    days.forEach(([icon, n], i) => {
      const last = i === 6;
      const x = last ? 0 : -200 + (i % 3) * 200;
      const y = last ? 230 : -200 + Math.floor(i / 3) * 200;
      const p = panel(this, x, y, last ? 560 : 180, 170, { fill: i === 0 ? 0x9bd8a0 : 0xe8d4a8 });
      p.add(text(this, 0, -62, `${i + 1}일`, TYPE.caption, COLOR.textDark, true).setOrigin(0.5));
      p.add(this.add.image(0, 2, icon).setDisplaySize(84, 84));
      p.add(text(this, 0, 58, `×${n}`, TYPE.body, COLOR.text, true, true).setOrigin(0.5));
      if (i === 0) p.add(text(this, 40, -10, '✔', 64, COLOR.ok, true, true).setOrigin(0.5));
      m.body(p);
    });
  }

  /** 부품 목록 */
  private kit(): void {
    header(this, 'UI 부품', undefined, 140);
    const kinds = ['cta', 'primary', 'secondary', 'magic', 'growth', 'danger'] as const;
    kinds.forEach((k, i) => button(this, 190 + (i % 2) * 340, 250 + Math.floor(i / 2) * 105, 300, 80, k, () => {}, { kind: k, size: TYPE.body, alert: i === 0 }));
    button(this, 360, 570, 300, 80, '비활성', () => {}, { kind: 'cta', size: TYPE.body }).setEnabled(false);
    (Object.keys(RARITY) as RarityKey[]).forEach((r, i) => badge(this, 90 + i * 135, 660, RARITY_NAME[r], RARITY[r]));
    ['ui-gold', 'ui-ruby', 'ui-card', 'ui-essence', 'ui-fragment', 'ui-ticket'].forEach((k, i) => this.add.image(80 + i * 112, 750, k).setDisplaySize(84, 84));
    ['chest-equipment', 'chest-dragon', 'chest-gold'].forEach((k, i) => this.add.image(140 + i * 220, 880, k).setDisplaySize(170, 170));
    slot(this, 120, 1030, 110, {});
    slot(this, 260, 1030, 110, { icon: 'equip-ring', rarity: RARITY.epic });
    button(this, 520, 1030, 300, 80, '출석 팝업', () => this.attendance(), { kind: 'secondary', size: TYPE.body });
    // 행동력·선물함 시험(시안 전용)
    button(this, 190, 1120, 300, 70, '최초 클리어 흉내', () => {
      const n = this.demo.box.granted.length + 1;
      this.demo.box = grantClearGift(this.demo.box, 'easy', n, `쉬움 ${n}단계 최초 클리어`, Date.now()).box;
      saveDemo(this.demo);
      this.toast('선물함에 행동력 20 도착', COLOR.ok);
    }, { kind: 'growth', size: TYPE.caption });
    button(this, 530, 1120, 300, 70, '행동력 0으로', () => {
      this.demo.s = { value: 0, regenFrom: Date.now() };
      saveDemo(this.demo);
      this.refreshStamina();
    }, { kind: 'danger', size: TYPE.caption });
  }
}

(window as unknown as { __g: Phaser.Game }).__g = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 720,
  height: 1280,
  backgroundColor: '#0f1220',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  // Phaser 4.2.1에서 한 번에 32개가 넘는 파일을 읽으면 나머지가 대기열에서 멈추는 현상이 있어 동시 다운로드 수를 넉넉히
  loader: { maxParallelDownloads: 128 },
  scene: [GalleryScene],
});
