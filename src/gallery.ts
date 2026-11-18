import Phaser from 'phaser';
import { COLOR, RARITY, RARITY_NAME, TYPE, type RarityKey } from './ui/theme';
import { badge, button, currencyBar, header, itemCard, milestoneBar, modal, navBar, panel, progressBar, ribbon, slot, text } from './ui/kit';
import { drawLobbyBackdrop, drawScreenBackdrop, makeArtPlaceholders, preloadArt } from './ui/art';
import { makeDragonTextures } from './dragonArt';
import { altar, dragonCarousel, iconTile, milestonePanel, roundButton, topBar, torch, wingBanner } from './ui/kit2';

// 디자인 시안 페이지(개발용): 새 UI 부품과 v1.2 화면 시안을 실제 게임 해상도(720×1280)로 본다.
// 시안의 숫자·이름은 보기용 예시이고 실제 데이터와 연결돼 있지 않다.
// 구조(재화 줄·하단 탭·등급 카드·리본 제목·진행도 상자)는 장르 공통 형식을 참고했고, 그림·색은 우리 것.
type Page = 'lobby' | 'shop' | 'equip' | 'dragons' | 'kit';
// 하단 탭(시안 형식): 상점 · 드래곤 · 전투 · 장비 · 소환. 연구소는 로비의 원형 버튼으로.
const NAV: { key: Page | 'summon'; label: string; icon: string; alert?: boolean }[] = [
  { key: 'shop', label: '상점', icon: 'ic-shop', alert: true },
  { key: 'dragons', label: '드래곤', icon: 'ic-dragon' },
  { key: 'lobby', label: '전투', icon: 'ic-swords' },
  { key: 'equip', label: '장비', icon: 'ic-shield', alert: true },
  { key: 'summon', label: '소환', icon: 'ic-egg' },
];
const DRAGON_IDS = ['red', 'blue', 'yellow', 'green', 'white', 'black', 'stone', 'wind', 'water', 'arcane'];

class GalleryScene extends Phaser.Scene {
  private page: Page = 'lobby';
  private picked = 0; // 로비 캐러셀에서 고른 드래곤

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
    this[this.page]();
    topBar(this, {
      portrait: `portrait-${DRAGON_IDS[this.picked]}`,
      level: 12,
      cp: '1,240',
      currencies: [
        { icon: 'ui-gold', value: 12890, onPlus: () => {} },
        { icon: 'ui-ruby', value: 300, onPlus: () => {} },
        { icon: 'ui-ticket', value: 23 },
      ],
    });
    navBar(this, NAV, this.page === 'kit' ? '' : this.page, (k) => this.scene.restart({ page: k === 'summon' ? 'kit' : (k as Page) }));
  }

  /** 로비(기획자 시안 형식): 날개 배너 · 양옆 아이콘 기둥 · 횃불과 제단 위 드래곤 · 캐러셀 · 진행도 상자 · 전투 버튼 */
  private lobby(): void {
    wingBanner(this, 360, 205, 400, '1단계 · 잿빛 숲', { sub: '쉬움 · 진행도 5%', emblem: 'ic-banner' });

    // 양옆 아이콘 기둥(시안의 바로가기 자리 — 우리 기능에 맞춤)
    const left: [string, string, boolean][] = [['ic-calendar', '출석', true], ['ic-mission', '임무', true], ['ic-book', '도감', false], ['ic-laurel', '업적', false]];
    const right: [string, string, boolean][] = [['ic-gift', '이벤트', true], ['ic-chest', '상자', false], ['ic-cards', '카드', false], ['ic-target', '목표', false]];
    left.forEach(([ic, l, al], i) => iconTile(this, 62, 300 + i * 112, ic, { size: 86, label: l, alert: al, onClick: i === 0 ? () => this.attendance() : undefined }));
    right.forEach(([ic, l, al], i) => iconTile(this, 658, 300 + i * 112, ic, { size: 86, label: l, alert: al }));

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
    roundButton(this, 628, 1046, 'ic-upgrade', { label: '연구소' });
    const go = button(this, 360, 1040, 370, 112, '전투 시작', () => {}, { kind: 'cta', size: 44, icon: 'ic-swords' });
    this.tweens.add({ targets: go.root, scale: 1.03, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.InOut' });
  }

  /** 상점: 리본 구역 · 상자 카드 3칸 · 보상 상점 · 확률 보기 */
  private shop(): void {
    ribbon(this, 360, 140, 420, '루비 상자', COLOR.violet, 72);
    const boxes = [
      { key: 'chest-dragon', name: '드래곤·스킬', one: 150, ten: 1350, color: COLOR.violet },
      { key: 'chest-equipment', name: '장비', one: 100, ten: 900, color: 0x3b82c4 },
      { key: 'chest-gold', name: '골드', one: 50, ten: 450, color: 0xd99a1c },
    ];
    boxes.forEach((b, i) => {
      const x = 128 + i * 232;
      const card = panel(this, x, 380, 216, 340, { fill: b.color });
      card.add(text(this, 0, -140, b.name, TYPE.body, COLOR.text, true, true).setOrigin(0.5));
      card.add(this.add.image(0, -30, b.key).setDisplaySize(170, 170));
      card.add(button(this, 0, 76, 180, 64, `${b.one}`, () => {}, { kind: 'secondary', icon: 'ui-ruby', size: TYPE.body }).root);
      card.add(button(this, 0, 146, 180, 64, `10회 ${b.ten.toLocaleString()}`, () => {}, { kind: 'magic', size: TYPE.caption }).root);
    });
    progressBar(this, 360, 600, 560, 30, 0.3, COLOR.violet, '드래곤·스킬 상자 · 희귀 보장 3/10 · 전설 보장 27/90');
    button(this, 360, 670, 360, 64, '확률 · 보장 규칙 보기', () => this.probModal(), { kind: 'secondary', size: TYPE.caption });

    ribbon(this, 360, 770, 420, '보상 상점', COLOR.teal, 72);
    const goods: [string, string, string][] = [
      ['ui-gold', '골드 2,000', '루비 50'],
      ['ui-card', '선택 카드 1', '루비 80'],
      ['ui-fragment', '조각 10', '골드 500'],
    ];
    goods.forEach(([icon, name, price], i) => {
      const x = 128 + i * 232;
      const card = panel(this, x, 940, 216, 250, { fill: COLOR.panelLight });
      card.add(text(this, 0, -98, name, TYPE.body, COLOR.textDark, true).setOrigin(0.5));
      card.add(this.add.image(0, -14, icon).setDisplaySize(110, 110));
      card.add(button(this, 0, 82, 180, 64, price, () => {}, { kind: 'growth', size: TYPE.caption }).root);
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

  /** 장비: 장착 4슬롯 카드 · 보유 목록 카드(등급 머리띠·레벨·조각) */
  private equip(): void {
    header(this, '장착 장비', undefined, 140);
    const eq: [string, string, RarityKey, string, number, number][] = [
      ['불꽃검', 'equip-weapon', 'rare', 'Lv.5', 12, 15],
      ['비늘 갑옷', 'equip-armor', 'common', 'Lv.3', 4, 10],
      ['용의 목걸이', 'equip-necklace', 'legendary', 'Lv.1', 0, 30],
      ['핏빛 반지', 'equip-ring', 'epic', 'Lv.2', 20, 20],
    ];
    panel(this, 360, 370, 690, 280, { fill: 0x1a2032 });
    eq.forEach(([name, icon, r, lv, have, need], i) =>
      itemCard(this, 102 + i * 172, 370, { name, icon, color: RARITY[r], level: lv, have, need, selected: i === 0, alert: have >= need }),
    );
    ribbon(this, 360, 570, 300, '보유 중', COLOR.panelHi, 60);
    const own: [string, string, RarityKey, string][] = [
      ['쇠 검', 'equip-weapon', 'common', 'Lv.7'], ['쇠 검', 'equip-weapon', 'common', 'Lv.1'], ['푸른 반지', 'equip-ring', 'rare', 'Lv.4'], ['가죽 갑옷', 'equip-armor', 'common', 'Lv.2'],
      ['달빛 목걸이', 'equip-necklace', 'epic', 'Lv.6'], ['쇠 검', 'equip-weapon', 'common', 'Lv.1'], ['수정 갑옷', 'equip-armor', 'rare', 'Lv.1'], ['금 반지', 'equip-ring', 'common', 'Lv.3'],
    ];
    own.forEach(([name, icon, r, lv], i) =>
      itemCard(this, 102 + (i % 4) * 172, 715 + Math.floor(i / 4) * 210, { name, icon, color: RARITY[r], level: lv, h: 190 }),
    );
    button(this, 240, 1090, 300, 76, '강화 1,250G', () => {}, { kind: 'growth', icon: 'ui-gold', size: TYPE.caption });
    button(this, 520, 1090, 220, 76, '합성 3→1', () => {}, { kind: 'magic', size: TYPE.caption, alert: true });
  }

  /** 드래곤 도감: 10종 카드(보유·미보유) */
  private dragons(): void {
    header(this, '드래곤', undefined, 140);
    const list: [string, string, RarityKey, boolean, string][] = [
      ['레드', 'red', 'starter', true, 'Lv.12'], ['블루', 'blue', 'common', true, 'Lv.4'], ['옐로', 'yellow', 'common', false, ''], ['그린', 'green', 'common', true, 'Lv.2'],
      ['화이트', 'white', 'rare', false, ''], ['블랙', 'black', 'rare', true, 'Lv.1'], ['스톤', 'stone', 'rare', false, ''], ['윈드', 'wind', 'epic', false, ''],
      ['워터', 'water', 'epic', false, ''], ['아케인', 'arcane', 'legendary', false, ''],
    ];
    list.forEach(([name, id, r, owned, lv], i) => {
      const c = itemCard(this, 102 + (i % 4) * 172, 300 + Math.floor(i / 4) * 250, {
        name, icon: `portrait-${id}`, color: owned ? RARITY[r] : 0x4b5163, level: owned ? lv : RARITY_NAME[r], have: owned ? 3 : 0, need: owned ? 5 : 40, h: 230, selected: i === 0,
      });
      if (!owned) c.list.forEach((o) => o instanceof Phaser.GameObjects.Image && o.setTint(0x151515));
    });
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
