import Phaser from 'phaser';
import { makeTextures } from '../textures';
import {
  DRAGON_ORDER, releasedDragons, DRAGONS, ELEMENT_LABEL, GROWTH, RARITY_COLOR, RARITY_LABEL, traitMultFor, type DragonId,
} from '../data/dragons';
import { PERM_TIER_LEVELS, PERM_TIERS } from '../data/permGrowth';
import { SIG_TIER_LEVELS, sigGrowthLines, sigTier, SIGNATURES, ULT_NAMES, ultCooldown, ultEffectText, ultSummary } from '../data/signature';
import { dragonUnlock } from '../ui/celebrate';
import { econRarity, ESSENCE, UNIVERSAL } from '../data/economy';
import { Progress, universalLimit } from '../systems/Progress';
import { loadout } from '../systems/Loadout';
import { preloadArt } from '../ui/art';
import { dragonCanGrow } from '../ui/alerts';
import { badge, button, modal, text, type KitButton } from '../ui/kit';
import { plate } from '../ui/kit2';
import { popWord, screenFrame, toast, type ScreenFrame } from '../ui/screen';
import { COLOR, tint, TYPE } from '../ui/theme';

/**
 * 드래곤 선택 · 도감 · 상세 · 육성 (6단계 v1.2).
 * 위: 10종 초상 타일(등급 테두리·레벨, 미보유는 실루엣) / 아래: 상세 판(능력치·전투력·특성·전용 액티브)과
 * 육성(레벨업 = 카드 + 골드, 승급 = 조각(+범용 조각), 미보유는 조각 → 정수 해금, 5성 이후 범용 조각 교환).
 * 영구 성장표·기본 공격 Lv.1~7은 버튼으로 여는 팝업(8단계 v2.0 C: 시안 형식으로 바꾸며 화면 공간을 위해 옮김). 규칙·저장은 그대로.
 */
/** 도감 한 쪽 칸 수(5열 × 2줄) */
const PER_PAGE = 10;

export class DragonsScene extends Phaser.Scene {
  private viewing: DragonId = 'red';
  /** 도감 쪽(한 쪽 10칸 = 5×2). 드래곤이 10종을 넘으면 ◀ ▶로 넘긴다(아래 상세 판 자리를 그대로 두려고) */
  private page = 0;
  private layer: Phaser.GameObjects.GameObject[] = [];
  private frame!: ScreenFrame;
  private popup: { close: () => void } | null = null;

  constructor() {
    super('dragons');
  }

  /** 뒤로가기: 팝업이 열려 있으면 닫고, 아니면 로비로 */
  onPlatformBack(): boolean {
    if (this.popup) this.closePopup();
    else this.scene.start('lobby');
    return true;
  }

  init(data: { view?: DragonId }): void {
    this.viewing = data?.view ?? Progress.load().selectedDragonId;
    const i = releasedDragons().indexOf(this.viewing);
    this.page = i >= 0 ? Math.floor(i / PER_PAGE) : 0; // 보고 있는 드래곤이 있는 쪽부터
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    if (!this.textures.exists('dragon-red')) makeTextures(this);
    this.layer = [];
    this.popup = null;
    this.frame = screenFrame(this, { title: '드래곤', nav: 'dragons' });
    this.input.keyboard?.on('keydown-ESC', () => this.onPlatformBack());
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

  private closePopup(): void {
    this.popup?.close();
    this.popup = null;
  }

  private refresh(): void {
    this.layer.forEach((o) => o.destroy());
    this.layer = [];
    const p = Progress.load();
    this.frame.refresh();
    const list = releasedDragons(); // 출시된 드래곤만(신규는 출시 스위치가 켜질 때까지 숨김)
    const owned = list.filter((id) => p.dragons[id].unlocked).length;
    this.A(text(this, 30, 246, `보유 ${owned} / ${list.length}`, TYPE.tiny, COLOR.text, true, true).setOrigin(0, 0.5));
    // 범용 조각(제작자 2026-11-25: 어디서 확인·교환하는지 티가 나게) — 누르면 설명 + 5성 드래곤 남은 조각 교환 창. 교환할 게 있으면 "!" 표시
    const canConvert = this.convertible(p).length > 0;
    const uniBtn = this.B(button(this, 590, 246, 210, 50, `🧩 범용 조각 ${p.universalFragments}`, () => this.universalPopup(), { kind: canConvert ? 'growth' : 'secondary', size: TYPE.tiny }));
    if (canConvert) {
      const dot = this.A(badge(this, 690, 226, '!', COLOR.ruby));
      this.tweens.add({ targets: dot, scale: 1.15, duration: 500, yoyo: true, repeat: -1 });
    }
    void uniBtn;

    // 초상 타일 5×2 한 쪽 — 10종을 넘으면 쪽 넘기기
    const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    this.page = Math.min(this.page, pages - 1);
    if (pages > 1) {
      const nav = (dx: number, label: string, to: number) => {
        const on = to >= 0 && to < pages;
        const t = this.A(text(this, 360 + dx, 246, label, TYPE.caption, on ? COLOR.gold : COLOR.textDim, true, true).setOrigin(0.5));
        if (on) t.setInteractive({ useHandCursor: true }).on('pointerdown', () => ((this.page = to), this.refresh()));
      };
      nav(-70, '◀', this.page - 1);
      this.A(text(this, 360, 246, `${this.page + 1} / ${pages}`, TYPE.tiny, COLOR.text, true, true).setOrigin(0.5));
      nav(70, '▶', this.page + 1);
    }
    list.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE).forEach((id, i) => {
      const x = 92 + (i % 5) * 134;
      const y = 340 + Math.floor(i / 5) * 150;
      const o = p.dragons[id];
      const rc = RARITY_COLOR[DRAGONS[id].rarity];
      const v = this.viewing === id;
      const tile = this.A(plate(this, x, y, 124, 140, { r: 18, gold: v, fill: o.unlocked ? tint(rc, -60) : 0x1a1626 }));
      const img = this.add.image(0, -14, `portrait-${id}`).setDisplaySize(116, 116);
      if (!o.unlocked) img.setTint(0x0b0e14).setTintMode(Phaser.TintModes.FILL); // 미보유: 실루엣
      tile.add(img);
      tile.add(this.add.circle(-46, -54, 11, rc).setStrokeStyle(3, COLOR.outline));
      if (o.unlocked) tile.add(text(this, 0, 52, `${DRAGONS[id].short} Lv.${o.level}`, 15, COLOR.text, true, true).setOrigin(0.5));
      else {
        // 미보유: "???" 대신 해금까지 조각 진행(참고 UI처럼 모으는 목표가 보이게, 2026-11-22)
        const need = ESSENCE.fragmentsToEssence[econRarity(DRAGONS[id].rarity)];
        const r = Math.min(1, o.fragments / need);
        const bar = this.add.graphics();
        bar.fillStyle(0x0b0e14, 1).fillRoundedRect(-48, 40, 96, 10, 5);
        if (r > 0) bar.fillStyle(r >= 1 ? COLOR.ok : rc, 1).fillRoundedRect(-48, 40, Math.max(8, 96 * r), 10, 5);
        tile.add(bar);
        tile.add(text(this, 0, 60, `${o.fragments}/${need}`, 13, r >= 1 ? COLOR.ok : COLOR.textDim, true, true).setOrigin(0.5));
      }
      if (dragonCanGrow(p, id)) tile.add(text(this, 48, 16, '▲', 22, COLOR.ok, true, true).setOrigin(0.5)); // 레벨업·승급·해금 가능(연구소 룬과 같은 표시)
      if (p.selectedDragonId === id) tile.add(badge(this, 30, -56, '출격', COLOR.ember));
      tile.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        if (this.viewing === id) return;
        this.viewing = id;
        this.refresh();
      });
    });
    this.drawDetail();
  }

  private drawDetail(): void {
    const p = Progress.load();
    const d = DRAGONS[this.viewing];
    const o = p.dragons[d.id];
    const rc = RARITY_COLOR[d.rarity];
    const top = 572;
    this.A(plate(this, 360, 846, 668, 548, { r: 24 }));
    const img = this.A(this.add.image(116, top + 96, `portrait-${d.id}`).setDisplaySize(170, 170));
    if (!o.unlocked) img.setTint(0x0b0e14).setTintMode(Phaser.TintModes.FILL);
    const T = (x: number, y: number, s: string, size: number, color: number = COLOR.text, bold = true, outline = false) =>
      this.A(text(this, x, y, s, size, color, bold, outline).setOrigin(0, 0.5));

    T(214, top + 24, d.name, TYPE.heading, COLOR.text, true, true);
    T(214, top + 60, `${ELEMENT_LABEL[d.element]} · ${RARITY_LABEL[d.rarity]} · ${d.role}`, TYPE.tiny, rc, true, true);
    T(214, top + 90, `${'★'.repeat(o.stars)}${'☆'.repeat(GROWTH.maxStars - o.stars)}  영구 Lv.${o.level}/${GROWTH.maxLevel}${o.unlocked ? '' : ' (미보유)'}`, TYPE.tiny, COLOR.gold, true, true);
    // 능력치·전투력: 장비·특수 스킬까지 포함한 실제 출격 값(로비와 같은 계산)
    const lo = loadout(p, d.id);
    T(214, top + 122, `공격력 ${lo.stats.attack.toFixed(1)} · HP ${Math.round(lo.stats.maxHp)} · 속도 ${Math.round(lo.stats.speed)}`, 17);
    T(214, top + 148, `전투력 ${lo.cp.toLocaleString()}`, TYPE.caption, COLOR.gold, true, true);

    const tm = traitMultFor(d.id, o.stars);
    const traitNote = d.id === 'red' ? (tm > 0 ? ' (활성)' : ' (1~4성 비활성)') : tm > 1 ? ` (승급 강화 ×${tm})` : '';
    this.A(text(this, 46, top + 206, `고유 특성: ${d.trait.text}${traitNote}`, 16, COLOR.ok, true).setOrigin(0, 0).setWordWrapWidth(628).setAlign('left'));
    // 전용 스킬: 지금 단계와 다음 성장(영구 Lv.10·20·30)에서 무엇이 바뀌는지 숫자로(2026-11-21 기획서 5.2)
    const sg = SIGNATURES[d.id];
    const tier = sigTier(o.level);
    const next = SIG_TIER_LEVELS[tier];
    const cur = sigGrowthLines(d.id, tier);
    const nxt = next ? sigGrowthLines(d.id, tier + 1) : null;
    const diff = nxt ? Object.keys(nxt).filter((k) => nxt[k] !== cur[k]).map((k) => `${k} ${cur[k] ?? '—'} → ${nxt[k]}`).join(' · ') : '';
    const sigKey = `sig-${d.id}`;
    const hasSigArt = this.textures.exists(sigKey);
    if (hasSigArt) this.A(this.add.image(46 + 15, top + 251, sigKey).setDisplaySize(30, 30));
    this.A(text(this, hasSigArt ? 84 : 46, top + 240, `필살기${hasSigArt ? '' : ` ${sg.icon}`} ${ULT_NAMES[d.id]} · 성장 ${tier}/3단계 · 재사용 ${ultCooldown(d.id) / 60_000}분`, 17, 0xffcc80, true, true).setOrigin(0, 0));
    this.A(text(this, 46, top + 268, nxt ? `다음 Lv.${next}: ${diff}` : '최고 단계 — 모든 성장 효과 적용 중', 15, nxt ? COLOR.gold : COLOR.ok, true).setOrigin(0, 0).setWordWrapWidth(628).setAlign('left'));

    // 성장표·기본 공격·전용 스킬 팝업
    const ty = top + 340;
    this.B(button(this, 140, ty, 210, 56, '영구 성장표', () => this.permPopup(), { kind: 'secondary', size: TYPE.tiny }));
    this.B(button(this, 360, ty, 210, 56, `기본 공격 ${d.basic.icon}`, () => this.basicPopup(), { kind: 'secondary', size: TYPE.tiny }));
    this.B(button(this, 580, ty, 210, 56, `전용 스킬 ${sg.icon}`, () => this.sigPopup(), { kind: 'magic', size: TYPE.tiny }));

    // 육성 버튼
    const by = top + 432;
    // 정수·조각 안내(제작자 2026-11-25): 중복 정수는 따로 바꿀 필요 없이 얻는 순간 조각으로 바뀐다
    const dupFrag = ESSENCE.essenceToFragments[econRarity(d.rarity)];
    this.A(text(this, 360, by + 62, d.id === 'red'
      ? '레드 조각: 단계 상자·패스·미션에서 획득 → 승급에 사용'
      : o.unlocked
        ? `이미 보유 — ${d.short} 정수를 또 얻으면 조각 ${dupFrag}개로 자동 변환(승급에 사용)`
        : `${d.short} 정수를 얻으면 바로 해금 · 해금 뒤 중복 정수는 조각 ${dupFrag}개로 자동 변환`, 15, COLOR.textSub, true).setOrigin(0.5, 0).setWordWrapWidth(640).setAlign('center'));
    if (o.unlocked) {
      const lvMax = o.level >= GROWTH.maxLevel;
      const lvGold = GROWTH.levelCost(o.level);
      const lvCards = GROWTH.cardCost(o.level);
      const lvBtn = this.B(button(this, 140, by, 212, 84, lvMax ? '레벨 MAX' : '레벨업', () => this.grow('level'), {
        kind: 'growth', size: TYPE.caption, sub: lvMax ? undefined : `카드 ${o.cards}/${lvCards} · ${lvGold.toLocaleString()}G`,
      }));
      lvBtn.setEnabled(!lvMax && o.cards >= lvCards && p.gold >= lvGold);
      if (o.stars >= GROWTH.maxStars) {
        const rate = UNIVERSAL.rate[econRarity(d.rarity)];
        const b = this.B(button(this, 360, by, 212, 84, '범용 조각 교환', () => this.grow('universal'), { kind: 'primary', size: TYPE.caption, sub: `조각 ${o.fragments} (${rate}:1)` }));
        b.setEnabled(o.fragments >= rate);
      } else {
        const need = GROWTH.starCost[o.stars - 1];
        const uni = Math.min(Math.max(0, need - o.fragments), p.universalFragments, universalLimit(d.id, need));
        const b = this.B(button(this, 360, by, 212, 84, '승급', () => this.grow('star'), { kind: 'primary', size: TYPE.caption, sub: `조각 ${o.fragments}/${need}${uni > 0 ? ` +범용 ${uni}` : ''}` }));
        b.setEnabled(o.fragments + uni >= need);
      }
      const sel = p.selectedDragonId === d.id;
      const selBtn = this.B(button(this, 580, by, 212, 84, sel ? '출격 중' : '출격 선택', () => {
        Progress.select(d.id);
        this.refresh();
      }, { kind: 'cta', size: TYPE.body, icon: sel ? undefined : 'ic-swords' }));
      selBtn.setEnabled(!sel);
    } else {
      const cost = ESSENCE.fragmentsToEssence[econRarity(d.rarity)];
      const b = this.B(button(this, 360, by + 4, 440, 76, `조각 ${o.fragments}/${cost} → 정수로 해금`, () => this.grow('essence'), { kind: 'magic', size: TYPE.caption }));
      b.setEnabled(o.fragments >= cost);
    }
  }

  /** 전용 스킬 상세: 효과 설명 + 성장 단계 4개(기본 · Lv.10 · Lv.20 · Lv.30)의 핵심 수치, 지금 단계 강조 */
  private sigPopup(): void {
    const d = DRAGONS[this.viewing];
    const o = Progress.load().dragons[d.id];
    const sg = SIGNATURES[d.id];
    const tier = o.unlocked ? sigTier(o.level) : -1;
    const m = modal(this, 660, 700, `${sg.icon} ${ULT_NAMES[d.id]}`, { closeOnBackdrop: true, ribbonColor: COLOR.violet });
    m.body(text(this, 0, -270, `${ultSummary(d.id)}\n효과:${ultEffectText(d.id)}`, 16, COLOR.text, true).setOrigin(0.5, 0).setWordWrapWidth(600).setAlign('center'));
    ['기본', ...SIG_TIER_LEVELS.map((l) => `Lv.${l}`)].forEach((label, i) => {
      const y = -150 + i * 92;
      const on = i === tier;
      const g = this.add.graphics();
      g.fillStyle(on ? 0x3a2a6b : 0x221d36, 1).fillRoundedRect(-300, y - 38, 600, 80, 16);
      if (on) g.lineStyle(3, COLOR.gold, 1).strokeRoundedRect(-300, y - 38, 600, 80, 16);
      m.body(g);
      m.body(text(this, -282, y, `${label}${on ? ' ◀ 지금' : i < tier ? ' ✔' : ''}`, 18, on ? COLOR.gold : i <= tier ? COLOR.ok : COLOR.textSub, true, true).setOrigin(0, 0.5));
      const lines = Object.entries(sigGrowthLines(d.id, i)).map(([k, v]) => `${k} ${v}`).join(' · ');
      m.body(text(this, -140, y, lines, 15, COLOR.text, true).setOrigin(0, 0.5).setWordWrapWidth(430).setAlign('left'));
    });
    m.body(button(this, 0, 282, 240, 64, '닫기', () => this.closePopup(), { kind: 'secondary', size: TYPE.caption }).root);
    this.popup = m;
  }

  /** 영구 성장표(5레벨마다 고유 성장 8단계) */
  private permPopup(): void {
    const d = DRAGONS[this.viewing];
    const o = Progress.load().dragons[d.id];
    const m = modal(this, 660, 640, `${d.short} 영구 성장`, { closeOnBackdrop: true, ribbonColor: COLOR.ember });
    PERM_TIERS[d.id].forEach((tier, i) => {
      const lv = PERM_TIER_LEVELS[i];
      const on = o.level >= lv;
      const y = -246 + i * 56;
      m.body(text(this, -296, y, `${on ? '✔' : '·'} Lv.${lv}  ${tier.name}`, 18, on ? COLOR.gold : COLOR.textDim, true, on).setOrigin(0, 0.5));
      m.body(text(this, -90, y, tier.text, 16, on ? COLOR.text : COLOR.textDim, true).setOrigin(0, 0.5).setWordWrapWidth(380).setAlign('left'));
    });
    m.body(button(this, 0, 262, 240, 64, '닫기', () => this.closePopup(), { kind: 'secondary', size: TYPE.caption }).root);
    this.popup = m;
  }

  /** 기본 공격 Lv.1~7 */
  private basicPopup(): void {
    const d = DRAGONS[this.viewing];
    const m = modal(this, 660, 640, `${d.basic.icon} ${d.basic.name}`, { closeOnBackdrop: true, ribbonColor: COLOR.violet });
    d.basic.levels.forEach((L, i) => {
      m.body(text(this, -296, -236 + i * 66, `Lv.${i + 1}  ${L.text}`, 16, i === 6 ? COLOR.gold : COLOR.text, true).setOrigin(0, 0).setWordWrapWidth(592).setAlign('left'));
    });
    m.body(button(this, 0, 262, 240, 64, '닫기', () => this.closePopup(), { kind: 'secondary', size: TYPE.caption }).root);
    this.popup = m;
  }

  /** 범용 조각으로 바꿀 수 있는 드래곤: 5성(최대 승급) + 남은 조각이 교환 비율 이상 */
  private convertible(p: ReturnType<typeof Progress.load>): DragonId[] {
    return releasedDragons().filter((id) => {
      const o = p.dragons[id];
      return o.unlocked && o.stars >= GROWTH.maxStars && o.fragments >= UNIVERSAL.rate[econRarity(DRAGONS[id].rarity)];
    });
  }

  /** 범용 조각 안내 + 교환 창 */
  private universalPopup(): void {
    this.closePopup();
    const p = Progress.load();
    const R = UNIVERSAL.rate;
    const m = modal(this, 660, 760, `🧩 범용 조각 ${p.universalFragments}개`, { closeOnBackdrop: true, ribbonColor: COLOR.violet });
    m.body(text(this, 0, -300, [
      '어느 드래곤 승급에나 쓰는 조각이에요.',
      '· 얻는 법: 5성(최대 승급) 드래곤의 남은 조각을 교환',
      `   일반 ${R.common}:1 · 희귀 ${R.rare}:1 · 영웅 ${R.epic}:1 · 전설 ${R.legendary}:1`,
      '· 쓰는 법: 승급할 때 조각이 모자라면 자동으로 채워요',
      `   (전설은 필요량의 ${Math.round(UNIVERSAL.legendaryMaxShare * 100)}%까지) — 승급 버튼에 "+범용 N"으로 표시`,
    ].join('\n'), 17, COLOR.text, true).setOrigin(0.5, 0).setAlign('left').setLineSpacing(8));
    const list = this.convertible(p);
    if (!list.length) {
      m.body(text(this, 0, 40, '지금 교환할 수 있는 드래곤이 없어요\n(5성을 달성한 뒤 남는 조각부터 교환돼요)', 17, COLOR.textSub, true).setOrigin(0.5).setAlign('center').setLineSpacing(6));
    }
    list.slice(0, 4).forEach((id, i) => {
      const o = p.dragons[id];
      const rate = R[econRarity(DRAGONS[id].rarity)];
      const y = -40 + i * 86;
      m.body(this.add.rectangle(0, y, 600, 74, 0x221d36).setStrokeStyle(2, COLOR.line));
      if (this.textures.exists(`portrait-${id}`)) m.body(this.add.image(-262, y, `portrait-${id}`).setDisplaySize(58, 58));
      m.body(text(this, -220, y, `${DRAGONS[id].short} 조각 ${o.fragments} → 범용 ${Math.floor(o.fragments / rate)}`, 18, COLOR.text, true, true).setOrigin(0, 0.5));
      m.body(button(this, 220, y, 140, 56, '교환', () => {
        const r = Progress.toUniversal(id);
        if (r.ok) toast(this, `범용 조각 +${r.gained}`, COLOR.ok);
        this.refresh();
        this.universalPopup();
      }, { kind: 'growth', size: TYPE.caption }).root);
    });
    m.body(button(this, 0, 320, 240, 64, '닫기', () => this.closePopup(), { kind: 'secondary', size: TYPE.caption }).root);
    this.popup = m;
  }

  private grow(kind: 'level' | 'star' | 'essence' | 'universal'): void {
    const id = this.viewing;
    const r =
      kind === 'level' ? Progress.levelUp(id) :
      kind === 'star' ? Progress.starUp(id, true) :
      kind === 'essence' ? Progress.exchangeEssence(id) : Progress.toUniversal(id);
    if (!r.ok) {
      const msg: Record<string, string> = {
        gold: `골드가 부족해요(${r.cost?.toLocaleString()}G)`, cards: '카드가 부족해요', fragments: `조각이 부족해요(${r.cost}개)`,
        max: '이미 최대예요', locked: '보유하지 않은 드래곤이에요', owned: '이미 보유한 드래곤이에요', not5: '5성 이후에 교환할 수 있어요',
      };
      toast(this, msg[r.reason] ?? '할 수 없어요', COLOR.danger);
    } else if (kind === 'essence') {
      this.refresh();
      dragonUnlock(this, [id], () => this.refresh()); // 조각 → 정수 교환으로 새 드래곤: 해금 축하(2026-11-21)
      return;
    } else {
      popWord(this, { level: '레벨 업!', star: '승급!', essence: '해금!', universal: '범용 조각 교환' }[kind], 560);
    }
    this.refresh();
  }
}
