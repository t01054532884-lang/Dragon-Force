import Phaser from 'phaser';
import { makeTextures } from '../textures';
import {
  DRAGON_ORDER, DRAGONS, ELEMENT_LABEL, GROWTH, RARITY_COLOR, RARITY_LABEL, levelBonus, starBonus, traitMultFor, type DragonId,
} from '../data/dragons';
import { PERM_TIER_LEVELS, PERM_TIERS } from '../data/permGrowth';
import { SIGNATURES } from '../data/signature';
import { econRarity, ESSENCE, UNIVERSAL } from '../data/economy';
import { Progress, universalLimit } from '../systems/Progress';
import { loadout } from '../systems/Loadout';
import { preloadArt } from '../ui/art';
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
export class DragonsScene extends Phaser.Scene {
  private viewing: DragonId = 'red';
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
    const owned = DRAGON_ORDER.filter((id) => p.dragons[id].unlocked).length;
    this.A(text(this, 30, 246, `보유 ${owned} / 10`, TYPE.tiny, COLOR.text, true, true).setOrigin(0, 0.5));
    this.A(text(this, 690, 246, `범용 조각 ${p.universalFragments}`, TYPE.tiny, COLOR.textSub, true, true).setOrigin(1, 0.5));

    // 10종 초상 타일(5 × 2)
    DRAGON_ORDER.forEach((id, i) => {
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
      tile.add(text(this, 0, 52, o.unlocked ? `${DRAGONS[id].short} Lv.${o.level}` : o.fragments > 0 ? `조각 ${o.fragments}` : '???', 15, o.unlocked ? COLOR.text : COLOR.textDim, true, true).setOrigin(0.5));
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
    const lb = levelBonus(o.level);
    const sb = starBonus(o.stars);
    const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
    T(214, top + 122, `공격력 ${lo.stats.attack.toFixed(1)} · HP ${Math.round(lo.stats.maxHp)} · 속도 ${Math.round(lo.stats.speed)}`, 17);
    T(214, top + 148, `전투력 ${lo.cp.toLocaleString()}`, TYPE.caption, COLOR.gold, true, true);
    T(214, top + 174, `레벨 +${pct(lb.attack)}/+${pct(lb.hp)} · 승급 +${pct(sb.attack)}/+${pct(sb.hp)} (공격/HP) · 장비·연구소 포함`, 13, COLOR.textSub, false);

    const tm = traitMultFor(d.id, o.stars);
    const traitNote = d.id === 'red' ? (tm > 0 ? ' (활성)' : ' (1~4성 비활성)') : tm > 1 ? ` (승급 강화 ×${tm})` : '';
    this.A(text(this, 46, top + 206, `고유 특성: ${d.trait.text}${traitNote}`, 16, COLOR.ok, true).setOrigin(0, 0).setWordWrapWidth(628).setAlign('left'));
    const sg = SIGNATURES[d.id];
    this.A(text(this, 46, top + 254, `전용 액티브: ${sg.icon} ${sg.name} — ${sg.detail} · 재사용 60초`, 16, 0xffcc80, true).setOrigin(0, 0).setWordWrapWidth(628).setAlign('left'));

    // 성장표·기본 공격 팝업
    const ty = top + 340;
    this.B(button(this, 200, ty, 300, 56, '영구 성장표', () => this.permPopup(), { kind: 'secondary', size: TYPE.caption }));
    this.B(button(this, 520, ty, 300, 56, `기본 공격 ${d.basic.icon} ${d.basic.name}`, () => this.basicPopup(), { kind: 'secondary', size: TYPE.caption }));

    // 육성 버튼
    const by = top + 432;
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
      const note = d.id === 'red'
        ? '레드 조각: 진행도 50% 상자·미션·이벤트 · 카드: 스테이지 클리어(최초 2·반복 1)·상자·미션'
        : `카드: 스테이지 클리어·상자·미션 · 조각: 상자·중복 정수(${ESSENCE.essenceToFragments[econRarity(d.rarity)]}개)`;
      this.A(text(this, 360, by + 60, note, 13, COLOR.textDim, true).setOrigin(0.5));
    } else {
      const cost = ESSENCE.fragmentsToEssence[econRarity(d.rarity)];
      this.A(text(this, 360, by - 52, `미보유 — 드래곤·스킬 상자의 정수로 해금, 또는 조각 ${cost}개를 정수 1개로 교환`, 15, COLOR.textSub, true).setOrigin(0.5));
      const b = this.B(button(this, 360, by + 4, 440, 76, `조각 ${o.fragments}/${cost} → 정수로 해금`, () => this.grow('essence'), { kind: 'magic', size: TYPE.caption }));
      b.setEnabled(o.fragments >= cost);
    }
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
    } else {
      popWord(this, { level: '레벨 업!', star: '승급!', essence: '해금!', universal: '범용 조각 교환' }[kind], 560);
    }
    this.refresh();
  }
}
