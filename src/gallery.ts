import Phaser from 'phaser';
import { COLOR, RARITY, TYPE } from './ui/theme';
import { badge, button, currencyPill, header, modal, panel, progressBar, slot, text } from './ui/kit';
import { drawLobbyBackdrop, drawScreenBackdrop, makeArtPlaceholders, preloadArt } from './ui/art';
import { makeDragonTextures } from './dragonArt';

// 디자인 시안 페이지(개발용): 새 UI 부품과 v1.2 화면(로비·상점·장비) 시안을 실제 게임 해상도로 본다.
// 시안의 숫자·이름은 보기용 예시이고 실제 데이터와 연결돼 있지 않다.
type Page = 'lobby' | 'shop' | 'equip' | 'kit';
const PAGES: { id: Page; label: string }[] = [
  { id: 'lobby', label: '로비' },
  { id: 'shop', label: '상점' },
  { id: 'equip', label: '장비' },
  { id: 'kit', label: '부품' },
];

class GalleryScene extends Phaser.Scene {
  private page: Page = 'lobby';

  constructor() {
    super('gallery');
  }

  init(data: { page?: Page }): void {
    this.page = data.page ?? ((new URLSearchParams(location.search).get('page') as Page) || 'lobby');
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    makeArtPlaceholders(this);
    if (!this.textures.exists('dragon-red')) makeDragonTextures(this);
    if (this.page === 'lobby') drawLobbyBackdrop(this);
    else drawScreenBackdrop(this);
    if (this.page === 'lobby') this.lobby();
    if (this.page === 'shop') this.shop();
    if (this.page === 'equip') this.equip();
    if (this.page === 'kit') this.kit();
    this.tabs();
  }

  /** 시안 전환 탭(맨 아래, 시안 페이지 전용) */
  private tabs(): void {
    PAGES.forEach((p, i) => {
      button(this, 105 + i * 170, 1236, 150, 56, p.label, () => this.scene.restart({ page: p.id }), {
        kind: p.id === this.page ? 'magic' : 'secondary',
        size: TYPE.caption,
      });
    });
  }

  /** 로비 시안: 재화 줄 · 출격 드래곤 · 전투력 · 단계·난이도 · 전투 시작 · 하단 메뉴 */
  private lobby(): void {
    currencyPill(this, 120, 50, 'ui-gold', 12890, COLOR.gold, 200);
    currencyPill(this, 330, 50, 'ui-ruby', 300, COLOR.ruby, 180);
    currencyPill(this, 520, 50, 'ui-ticket', 23, 0xd8b4fe, 150);

    text(this, 360, 150, '드래곤 특공대', TYPE.display, COLOR.gold, true).setOrigin(0.5).setStroke('#2a1206', 10);
    text(this, 360, 210, 'DRAGON FORCE', TYPE.caption, COLOR.textSub).setOrigin(0.5).setLetterSpacing(8);

    // 출격 드래곤 카드
    const card = panel(this, 360, 470, 620, 380, { radius: 28, glow: RARITY.starter });
    card.add(this.add.circle(0, -40, 120, COLOR.ember, 0.12));
    if (this.textures.exists('dragon-red')) card.add(this.add.image(0, -40, 'portrait-red').setScale(1.25));
    else card.add(text(this, 0, -40, '🐉', 120).setOrigin(0.5));
    card.add(badge(this, -230, -150, '기본', RARITY.starter));
    card.add(text(this, 0, 100, '레드 드래곤', TYPE.title, COLOR.text, true).setOrigin(0.5));
    card.add(text(this, 0, 142, 'Lv.12  ★★☆☆☆', TYPE.body, COLOR.textSub).setOrigin(0.5));

    // 전투력 vs 권장
    const cp = panel(this, 360, 720, 620, 96, { fill: 0x161b2a });
    cp.add(text(this, -280, 0, '⚔ 전투력', TYPE.body, COLOR.textSub).setOrigin(0, 0.5));
    cp.add(text(this, -110, 0, '1,240', TYPE.title, COLOR.text, true).setOrigin(0, 0.5));
    cp.add(text(this, 90, 0, '권장 900', TYPE.body, COLOR.textSub).setOrigin(0, 0.5));
    cp.add(badge(this, 250, 0, '여유', COLOR.ok));

    // 단계·난이도
    const st = panel(this, 360, 845, 620, 120);
    st.add(button(this, -250, 0, 72, 72, '‹', () => {}, { kind: 'secondary', size: 40 }).root);
    st.add(text(this, 0, -22, '1단계 잿빛 숲', TYPE.heading, COLOR.text, true).setOrigin(0.5));
    st.add(text(this, 0, 22, '쉬움 · 진행도 5%', TYPE.caption, COLOR.textSub).setOrigin(0.5));
    st.add(button(this, 250, 0, 72, 72, '›', () => {}, { kind: 'secondary', size: 40 }).root);

    button(this, 360, 985, 620, 120, '전투 시작', () => {}, { kind: 'primary', size: 48 });

    const menu: [string, string, NonNullable<Parameters<typeof button>[7]>][] = [
      ['드래곤', 'ui-card', { kind: 'secondary' }],
      ['장비', 'equip-weapon', { kind: 'secondary' }],
      ['상점', 'ui-ruby', { kind: 'magic' }],
      ['연구소', 'ui-essence', { kind: 'growth' }],
    ];
    menu.forEach(([label, icon, o], i) => button(this, 105 + i * 170, 1120, 150, 110, label, () => {}, { ...o, icon, size: TYPE.body }));
  }

  /** 상점 시안: 상자 3종 · 1회/10회 · 보장 진행 · 확률 보기 */
  private shop(): void {
    header(this, '상점', () => {});
    currencyPill(this, 560, 160, 'ui-ruby', 300, COLOR.ruby, 200);
    currencyPill(this, 340, 160, 'ui-ticket', 23, 0xd8b4fe, 170);
    const boxes = [
      { key: 'chest-dragon', name: '드래곤·스킬 상자', desc: '정수·조각·카드·스킬 조각', one: 150, ten: 1350, color: COLOR.violet, pity: true },
      { key: 'chest-equipment', name: '장비 상자', desc: '장비 · 합성 재료', one: 100, ten: 900, color: 0x60a5fa, pity: false },
      { key: 'chest-gold', name: '골드 상자', desc: '500G ~ 5,000G', one: 50, ten: 450, color: COLOR.gold, pity: false },
    ];
    boxes.forEach((b, i) => {
      const y = 360 + i * 285;
      const p = panel(this, 360, y, 660, 260, { glow: i === 0 ? b.color : undefined });
      p.add(this.add.circle(-215, -10, 95, b.color, 0.15));
      p.add(this.add.image(-215, -10, b.key).setDisplaySize(190, 190));
      p.add(text(this, -90, -88, b.name, TYPE.heading, COLOR.text, true).setOrigin(0, 0.5));
      p.add(text(this, -90, -46, b.desc, TYPE.caption, COLOR.textSub).setOrigin(0, 0.5));
      if (b.pity) {
        p.add(progressBar(this, 75, -2, 330, 26, 0.3, COLOR.violet, '희귀 보장 3/10').root);
      }
      p.add(button(this, -5, 72, 160, 84, '1회', () => {}, { kind: 'secondary', icon: 'ui-ruby', sub: `${b.one}`, size: TYPE.body }).root);
      p.add(button(this, 175, 72, 180, 84, '10회', () => {}, { kind: 'magic', icon: 'ui-ruby', sub: `${b.ten.toLocaleString()}`, size: TYPE.body }).root);
    });
    button(this, 360, 1150, 400, 70, '확률 · 보장 규칙 보기', () => this.probModal(), { kind: 'secondary', size: TYPE.body });
  }

  private probModal(): void {
    const m = modal(this, 600, 640, '드래곤·스킬 상자 확률', { closeOnBackdrop: true });
    const rows: [string, string, number][] = [
      ['카드', '40%', COLOR.text],
      ['조각', '25%', COLOR.text],
      ['정수', '15%', COLOR.violet],
      ['특수 스킬 조각', '20%', COLOR.text],
      ['└ 정수 일반 70% · 희귀 22%', '', COLOR.textSub],
      ['└ 영웅 7% · 전설 1%', '', COLOR.textSub],
      ['전설 정수(상자 전체 기준)', '0.15%', RARITY.legendary],
    ];
    rows.forEach(([a, b, c], i) => {
      m.body(text(this, -250, -200 + i * 52, a, TYPE.body, c).setOrigin(0, 0.5));
      m.body(text(this, 250, -200 + i * 52, b, TYPE.body, c, true).setOrigin(1, 0.5));
    });
    m.body(text(this, 0, 200, '10회마다 희귀 이상 정수 · 90회까지 전설 정수 확정', TYPE.caption, COLOR.textSub).setOrigin(0.5));
    m.body(button(this, 0, 260, 240, 70, '닫기', () => m.close(), { kind: 'secondary', size: TYPE.body }).root);
  }

  /** 장비 시안: 드래곤 + 4슬롯 · 보유 장비 목록 · 합성 */
  private equip(): void {
    header(this, '장비', () => {});
    const top = panel(this, 360, 400, 660, 420);
    top.add(this.add.circle(0, -20, 110, COLOR.ember, 0.12));
    top.add(this.textures.exists('dragon-red') ? this.add.image(0, -20, 'portrait-red').setScale(1.1) : text(this, 0, -20, '🐉', 110).setOrigin(0.5));
    const slots: [string, string, number | undefined][] = [
      ['equip-weapon', '무기', RARITY.rare],
      ['equip-armor', '갑옷', RARITY.common],
      ['equip-necklace', '목걸이', undefined],
      ['equip-ring', '반지', RARITY.epic],
    ];
    slots.forEach(([icon, label, r], i) => {
      const x = i < 2 ? -230 : 230;
      const y = i % 2 === 0 ? -100 : 70;
      top.add(slot(this, x, y, 120, { icon: r !== undefined ? icon : undefined, rarity: r, label }));
    });
    top.add(text(this, 0, 170, '공격력 +14.5 · HP +6 · 치명타 +4%', TYPE.caption, COLOR.textSub).setOrigin(0.5));

    text(this, 40, 650, '보유 장비', TYPE.heading, COLOR.text, true).setOrigin(0, 0.5);
    const list: [string, number, string][] = [
      ['equip-weapon', RARITY.rare, 'Lv.5'], ['equip-weapon', RARITY.rare, 'Lv.1'], ['equip-weapon', RARITY.rare, 'Lv.1'],
      ['equip-armor', RARITY.common, 'Lv.3'], ['equip-ring', RARITY.epic, 'Lv.2'], ['equip-necklace', RARITY.legendary, 'Lv.1'],
      ['equip-armor', RARITY.common, 'Lv.1'], ['equip-ring', RARITY.common, 'Lv.1'],
    ];
    list.forEach(([icon, r, lv], i) => slot(this, 100 + (i % 4) * 173, 760 + Math.floor(i / 4) * 170, 130, { icon, rarity: r, label: lv }));
    button(this, 220, 1120, 300, 90, '강화', () => {}, { kind: 'growth', icon: 'ui-gold', sub: '1,250G', size: TYPE.body });
    button(this, 520, 1120, 260, 90, '합성 (3→1)', () => {}, { kind: 'magic', size: TYPE.body });
  }

  /** 부품 목록 */
  private kit(): void {
    header(this, 'UI 부품', () => {});
    const kinds = ['primary', 'secondary', 'magic', 'growth', 'danger'] as const;
    kinds.forEach((k, i) => button(this, 190 + (i % 2) * 340, 190 + Math.floor(i / 2) * 110, 300, 84, k, () => {}, { kind: k, size: TYPE.body }));
    button(this, 530, 410, 300, 84, '비활성', () => {}, { kind: 'primary', size: TYPE.body }).setEnabled(false);

    (['starter', 'common', 'rare', 'epic', 'legendary'] as const).forEach((r, i) =>
      badge(this, 90 + i * 135, 520, ['기본', '일반', '희귀', '영웅', '전설'][i], RARITY[r]),
    );
    const icons = ['ui-gold', 'ui-ruby', 'ui-card', 'ui-essence', 'ui-fragment', 'ui-ticket'];
    icons.forEach((k, i) => {
      this.add.image(80 + i * 112, 620, k).setDisplaySize(84, 84);
      text(this, 80 + i * 112, 680, k.replace('ui-', ''), TYPE.tiny, COLOR.textSub).setOrigin(0.5);
    });
    ['chest-equipment', 'chest-dragon', 'chest-gold'].forEach((k, i) => this.add.image(140 + i * 220, 820, k).setDisplaySize(190, 190));
    progressBar(this, 360, 980, 600, 34, 0.62, COLOR.ember, '진행도 62%');
    progressBar(this, 360, 1040, 600, 34, 0.25, COLOR.teal, '25% 보상까지 0/5');
    button(this, 360, 1130, 360, 80, '팝업 보기', () => this.probModal(), { kind: 'secondary', size: TYPE.body });
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 720,
  height: 1280,
  backgroundColor: '#0f1220',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [GalleryScene],
});
