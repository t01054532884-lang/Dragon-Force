import Phaser from 'phaser';
import { DRAGONS, RARITY_COLOR, RARITY_LABEL } from '../data/dragons';
import { RARITIES } from '../data/economy';
import { EQUIP_BASE, EQUIP_BONUS, EQUIP_RULES, equipAuraRarity, equipBonus, equipDef, equipValue, NEXT_RARITY, SLOT_LABEL, SLOTS, type Slot } from '../data/equipment';
import { fuseCandidates, isEquipped, Progress, type EquipmentItem, type PlayerProgress } from '../systems/Progress';
import { loadout } from '../systems/Loadout';
import { equipIcon, preloadArt } from '../ui/art';
import { badge, button, slot as slotBox, text, type KitButton } from '../ui/kit';
import { altar, plate, tabs } from '../ui/kit2';
import { popWord, screenFrame, toast, type ScreenFrame } from '../ui/screen';
import { COLOR, TYPE } from '../ui/theme';
import { SKINS, skinDef, type SkinKind } from '../data/skins';
import { equipSkin } from '../systems/Skins';
import { capeKey, makeSkinTextures, skinIconKey, trailKey } from '../ui/skinArt';
import { purchases } from '../systems/Purchases';
import { devMode } from '../ui/widgets';

const PAGE = 10; // 보유 목록 한 쪽(5 × 2)

/**
 * 장비 4슬롯(강화·잠금·합성) — 6단계 v1.2 8장. (장착형 특수 스킬은 v1.2 시스템 개편에서 연구소 룬으로 옮김)
 * 8단계 v2.0 C: 시안 형식(제단 위 출격 드래곤 + 양옆 장착 슬롯 · 능력치 줄 · 탭 · 보유 장비 격자 · 고른 장비 판). 규칙·저장은 그대로.
 */
export class EquipScene extends Phaser.Scene {
  private slot: Slot = 'weapon';
  private selected: string | null = null;
  private page = 0;
  private sort: 'rarity' | 'level' | 'recent' = 'rarity';
  private layer: Phaser.GameObjects.GameObject[] = [];
  private frame!: ScreenFrame;
  /** 장비 / 스킨(2026-11-23 밤: 장비 메뉴에 스킨 추가) */
  private tab: 'equip' | 'skin' = 'equip';

  constructor() {
    super('equip');
  }

  onPlatformBack(): boolean {
    this.scene.start('lobby');
    return true;
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    this.layer = [];
    this.frame = screenFrame(this, { title: '장비', nav: 'equip' });
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('lobby'));
    this.refresh();
  }

  private orbit: Phaser.Time.TimerEvent | null = null;

  private refresh(): void {
    this.orbit?.remove();
    this.orbit = null;
    this.layer.forEach((o) => o.destroy());
    this.layer = [];
    const p = Progress.load();
    this.frame.refresh();
    // v1.2(2026-11-21): 특수 스킬 탭은 연구소 "룬"으로 옮김. 2026-11-23 밤: 스킨 탭 추가(망토·발자국)
    const keys = ['equip', 'skin'] as const;
    this.A(tabs(this, 250, ['장비', '스킨'], keys.indexOf(this.tab), (i) => {
      if (keys[i] === this.tab) return;
      this.tab = keys[i];
      this.refresh();
    }));
    if (this.tab === 'skin') this.drawSkins(p);
    else this.drawEquip(p);
  }

  private A<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.layer.push(o);
    return o;
  }

  private B(b: KitButton): KitButton {
    this.layer.push(b.root);
    return b;
  }

  private statText(it: EquipmentItem): string {
    const slot = equipDef(it.itemId)!.slot;
    const B = EQUIP_BASE[slot];
    const [a, b] = equipValue(slot, it.rarity, it.level);
    const bonus = equipBonus(slot, it.rarity);
    const extra = bonus > 0 ? ` · ${EQUIP_BONUS[slot].name} ${bonus}${EQUIP_BONUS[slot].unit}` : '';
    return `${B.a} +${a}${B.unitA}${B.b ? ` · ${B.b} ${b}${B.unitB}` : ''}${extra}`;
  }

  /** 등급 오라: 드래곤 뒤에서 천천히 돌며 숨 쉬는 빛 */
  private drawAura(r: Exclude<EquipmentItem['rarity'], 'common'>): void {
    const color = RARITY_COLOR[r];
    const art = `aura-equip-${r}`;
    if (this.textures.exists(art)) {
      const im = this.A(this.add.image(360, 420, art).setDisplaySize(360, 360).setDepth(1).setAlpha(0.95));
      this.tweens.add({ targets: im, angle: 360, duration: 24000, repeat: -1 });
      this.tweens.add({ targets: im, alpha: 0.7, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      return;
    }
    // 임시: 둥근 빛 + 빛줄기(fx-unlock-rays)를 등급 색으로
    const glow = this.A(this.add.circle(360, 420, 150, color, 0.18).setDepth(1));
    this.tweens.add({ targets: glow, scale: 1.12, alpha: 0.08, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    if (this.textures.exists('fx-unlock-rays')) {
      const rays = this.A(this.add.image(360, 420, 'fx-unlock-rays').setDisplaySize(r === 'legendary' ? 380 : 330, r === 'legendary' ? 380 : 330).setDepth(1).setTint(color).setAlpha(r === 'rare' ? 0.45 : 0.65).setBlendMode(Phaser.BlendModes.ADD));
      this.tweens.add({ targets: rays, angle: 360, duration: 30000, repeat: -1 });
    }
  }

  /** 낀 장비 아이콘이 드래곤 둘레를 타원으로 돎(앞쪽일 때 드래곤 앞, 뒤쪽일 때 뒤) */
  private drawOrbit(worn: { slot: Slot; rarity: EquipmentItem['rarity'] }[]): void {
    if (!worn.length) return;
    const items = worn.map(({ slot, rarity }) => {
      const orb = `equip-orb-${rarity}`;
      const back = this.textures.exists(orb)
        ? this.A(this.add.image(0, 0, orb).setDisplaySize(74, 74))
        : this.A(this.add.circle(0, 0, 30, RARITY_COLOR[rarity], 0.35).setStrokeStyle(3, RARITY_COLOR[rarity], 0.95));
      const icon = this.A(this.add.image(0, 0, equipIcon(slot, rarity)).setDisplaySize(52, 52));
      return { back, icon };
    });
    let t = 0;
    const place = () => {
      items.forEach(({ back, icon }, i) => {
        const a = t / 2400 + (i / items.length) * Math.PI * 2;
        const x = 360 + Math.cos(a) * 168;
        const y = 440 + Math.sin(a) * 52;
        const front = Math.sin(a) > 0;
        const k = 0.82 + 0.18 * (Math.sin(a) + 1) / 2; // 앞쪽일수록 크게
        back.setPosition(x, y).setDepth(front ? 3 : 0.5);
        if (back instanceof Phaser.GameObjects.Image) back.setDisplaySize(74 * k, 74 * k);
        else back.setScale(k);
        icon.setPosition(x, y).setDepth(front ? 3.1 : 0.6).setDisplaySize(52 * k, 52 * k).setAlpha(front ? 1 : 0.8);
      });
    };
    place();
    this.orbit = this.time.addEvent({ delay: 16, loop: true, callback: () => {
      t += 16;
      place();
    } });
  }

  // ───────── 장비 ─────────
  private drawEquip(p: PlayerProgress): void {
    const A = this.A.bind(this);
    const lo = loadout(p);
    const d = DRAGONS[p.selectedDragonId];

    // 제단 위 출격 드래곤 + 양옆 장착 슬롯(누르면 그 슬롯 목록)
    this.layer.push(...altar(this, 360, 512, 300));
    // 장비 보이기(제작자 결정 2026-11-24): 몸에 그리지 않고 ① 4부위 모두 낀 등급 오라(드래곤 뒤) ② 낀 장비 아이콘이 둘레를 돎.
    // 그림 aura-equip-<등급>·equip-orb-<등급>이 있으면 그것을, 없으면 빛줄기 그림을 등급 색으로 물들인 임시 연출(요청서 docs/ART_REQUEST_8.md)
    const wornItems = SLOTS.map((s) => p.equipment.items.find((x) => x.uid === p.equipment.equipped[s]) ?? null);
    const aura = equipAuraRarity(wornItems.map((it) => it?.rarity));
    if (aura) this.drawAura(aura);
    const hero = A(this.add.image(360, 418, `portrait-${d.id}`).setDisplaySize(230, 230).setDepth(2));
    this.tweens.add({ targets: hero, y: 410, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.drawOrbit(SLOTS.flatMap((s, i) => (wornItems[i] ? [{ slot: s, rarity: wornItems[i]!.rarity }] : [])));
    SLOTS.forEach((s, i) => {
      const x = i < 2 ? 98 : 622;
      const y = 382 + (i % 2) * 150;
      const uid = p.equipment.equipped[s];
      const it = p.equipment.items.find((x2) => x2.uid === uid);
      const on = this.slot === s;
      if (on) A(this.add.rectangle(x, y, 132, 132, COLOR.cta, 0.9).setStrokeStyle(4, COLOR.outline));
      const box = A(slotBox(this, x, y, 116, { icon: it ? equipIcon(s, it.rarity) : undefined, rarity: it ? RARITY_COLOR[it.rarity] : undefined }));
      A(text(this, x, y - 76, SLOT_LABEL[s], TYPE.tiny, on ? COLOR.gold : COLOR.textSub, true, true).setOrigin(0.5));
      if (it) box.add(text(this, 0, 44, `Lv.${it.level}`, TYPE.tiny, COLOR.text, true, true).setOrigin(0.5));
      if (it && it.level < EQUIP_RULES.maxLevel && p.gold >= EQUIP_RULES.upgradeCost(it.level)) box.add(text(this, 44, -42, '▲', 24, COLOR.ok, true, true).setOrigin(0.5));
      box.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.slot = s;
        this.page = 0;
        this.selected = uid ?? null;
        this.refresh();
      });
    });

    // 능력치 줄(장비·특수 스킬·연구소까지 들어간 실제 출격 값)
    const st = A(plate(this, 360, 624, 664, 64, { r: 20 }));
    const stats: [string, string, string][] = [
      ['ic-swords', '공격력', lo.stats.attack.toFixed(1)],
      ['ic-heart', '최대 HP', `${Math.round(lo.stats.maxHp)}`],
      ['ic-shield', '피해 감소', `${Math.round((1 - lo.stats.damageTaken) * 100)}%`],
    ];
    stats.forEach(([ic, l, v], i) => {
      const x = -220 + i * 220;
      if (this.textures.exists(ic)) st.add(this.add.image(x - 64, 0, ic).setDisplaySize(44, 44));
      st.add(text(this, x - 34, -13, l, 15, COLOR.textSub, true).setOrigin(0, 0.5));
      st.add(text(this, x - 34, 12, v, TYPE.caption, COLOR.text, true, true).setOrigin(0, 0.5));
    });

    // 보유 목록(고른 슬롯). 정렬: 등급순 · 레벨순 · 획득순(최근 먼저) — 2026-11-21 기획서 6장
    const order = (u: string) => Number(u.replace(/\D/g, '')) || 0;
    const byRarity = (a: EquipmentItem, b: EquipmentItem) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity);
    const list = p.equipment.items
      .filter((it) => equipDef(it.itemId)!.slot === this.slot)
      .sort((a, b) =>
        this.sort === 'level' ? b.level - a.level || byRarity(a, b) || order(b.uid) - order(a.uid) :
        this.sort === 'recent' ? order(b.uid) - order(a.uid) :
        byRarity(a, b) || b.level - a.level || order(b.uid) - order(a.uid));
    const SORT_LABEL = { rarity: '등급순', level: '레벨순', recent: '획득순' } as const;
    this.B(button(this, 466, 680, 132, 42, `정렬: ${SORT_LABEL[this.sort]}`, () => {
      this.sort = this.sort === 'rarity' ? 'level' : this.sort === 'level' ? 'recent' : 'rarity';
      this.page = 0;
      this.refresh();
    }, { kind: 'secondary', size: 15 }));
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    this.page = Math.min(this.page, pages - 1);
    A(text(this, 30, 680, `${SLOT_LABEL[this.slot]} ${list.length}개 · ▲ 강화 가능`, TYPE.tiny, COLOR.textSub, true, true).setOrigin(0, 0.5));
    if (pages > 1) {
      const prev = this.B(button(this, 576, 680, 56, 42, '◀', () => (this.page--, this.refresh()), { kind: 'secondary', size: TYPE.tiny }));
      const next = this.B(button(this, 660, 680, 56, 42, '▶', () => (this.page++, this.refresh()), { kind: 'secondary', size: TYPE.tiny }));
      prev.setEnabled(this.page > 0);
      next.setEnabled(this.page < pages - 1);
      A(text(this, 618, 650, `${this.page + 1}/${pages}`, 15, COLOR.textSub, true).setOrigin(0.5));
    }
    list.slice(this.page * PAGE, this.page * PAGE + PAGE).forEach((it, i) => {
      const x = 96 + (i % 5) * 132;
      const y = 762 + Math.floor(i / 5) * 124;
      const sel = this.selected === it.uid;
      if (sel) A(this.add.rectangle(x, y, 122, 122, COLOR.cta, 0.95).setStrokeStyle(4, COLOR.outline));
      const box = A(slotBox(this, x, y, 106, { icon: equipIcon(this.slot, it.rarity), rarity: RARITY_COLOR[it.rarity] }));
      box.add(text(this, 0, 40, `Lv.${it.level}`, 15, COLOR.text, true, true).setOrigin(0.5));
      if (isEquipped(p, it.uid)) box.add(badge(this, -30, -40, '장착', COLOR.teal));
      if (it.locked) box.add(text(this, 38, -38, '🔒', 18).setOrigin(0.5));
      // 지금 골드로 강화할 수 있는 장비에만 초록 화살표(자원이 부족하면 표시하지 않음)
      else if (it.level < EQUIP_RULES.maxLevel && p.gold >= EQUIP_RULES.upgradeCost(it.level)) box.add(text(this, 38, -36, '▲', 22, COLOR.ok, true, true).setOrigin(0.5));
      box.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        this.selected = it.uid;
        this.refresh();
      });
    });
    if (list.length === 0) A(text(this, 360, 820, `${SLOT_LABEL[this.slot]}가 없어요`, TYPE.caption, COLOR.textDim, true).setOrigin(0.5).setAlign('center'));

    // 고른 장비 판: 이름·능력치 + 장착·강화·잠금·합성
    const it = p.equipment.items.find((x) => x.uid === this.selected && equipDef(x.itemId)!.slot === this.slot);
    const pl = A(plate(this, 360, 1028, 664, 176, { r: 22, fill: it ? 0x2b2442 : 0x221d36 }));
    if (!it) {
      pl.add(text(this, 0, 0, '장비를 눌러 보세요', TYPE.tiny, COLOR.textSub, true).setOrigin(0.5));
      return;
    }
    const eq = isEquipped(p, it.uid);
    const nextR = NEXT_RARITY[it.rarity];
    const mats = fuseCandidates(p, it.uid).length;
    const cost = EQUIP_RULES.upgradeCost(it.level);
    pl.add(text(this, -306, -58, `${equipDef(it.itemId)!.name}  ${RARITY_LABEL[it.rarity]} Lv.${it.level}/${EQUIP_RULES.maxLevel}`, TYPE.caption, RARITY_COLOR[it.rarity], true, true).setOrigin(0, 0.5));
    const nextLv = it.level < EQUIP_RULES.maxLevel ? `  →  Lv.${it.level + 1}: ${this.statText({ ...it, level: it.level + 1 })}` : '';
    pl.add(text(this, -306, -24, `${this.statText(it)}${nextLv}`, 15, COLOR.text, true).setOrigin(0, 0.5));
    const y = 1066;
    this.B(button(this, 112, y, 148, 66, eq ? '해제' : '장착', () => this.act(eq ? Progress.unequip(this.slot) : Progress.equip(it.uid)), { kind: 'growth', size: TYPE.caption }));
    const bUp = this.B(button(this, 276, y, 164, 66, it.level >= EQUIP_RULES.maxLevel ? '강화 MAX' : '강화', () => this.act(Progress.upgradeItem(it.uid), '강화!'), {
      kind: 'primary', size: TYPE.caption, icon: it.level >= EQUIP_RULES.maxLevel ? undefined : 'ui-gold', sub: it.level >= EQUIP_RULES.maxLevel ? undefined : cost.toLocaleString(),
    }));
    bUp.setEnabled(it.level < EQUIP_RULES.maxLevel && p.gold >= cost);
    this.B(button(this, 444, y, 148, 66, it.locked ? '잠금 해제' : '잠금', () => this.act(Progress.lock(it.uid)), { kind: 'secondary', size: TYPE.caption }));
    const bF = this.B(button(this, 610, y, 164, 66, nextR ? `합성 ${Math.min(mats, 3)}/3` : '합성 불가', () => this.act(Progress.fuse(it.uid), '합성!'), {
      kind: 'magic', size: TYPE.caption, sub: nextR ? `→ ${RARITY_LABEL[nextR]}` : undefined,
    }));
    bF.setEnabled(!!nextR && !it.locked && !eq && mats >= EQUIP_RULES.fuseCount);
    if (nextR && (it.locked || eq)) pl.add(text(this, 306, -58, '잠금·장착 중엔 합성 재료 제외', 14, COLOR.textDim, true).setOrigin(1, 0.5));
  }

  // ───────── 스킨 ─────────
  /** 스킨 탭: 위쪽 미리보기(전투 모습 — 위에서 본 드래곤 + 망토 + 발자국이 원을 그리며) · 망토 줄 · 발자국 줄 · 룰렛 가기 */
  private drawSkins(p: PlayerProgress): void {
    makeSkinTextures(this);
    const A = this.A.bind(this);
    const d = DRAGONS[p.selectedDragonId];
    A(plate(this, 360, 440, 664, 280, { r: 26, fill: 0x161126 }));
    A(text(this, 44, 322, '전투에서 보이는 모습', TYPE.tiny, COLOR.textSub, true, true).setOrigin(0, 0.5));
    const cx = 360;
    const cy = 462;
    const R = 92;
    const cape = p.skins.cape ? A(this.add.image(cx, cy, capeKey(p.skins.cape)).setDisplaySize(120, 120)) : null;
    const top = this.textures.exists(`top-${d.id}`) ? `top-${d.id}` : `dragon-${d.id}`;
    const dragon = A(this.add.image(cx, cy, top).setDisplaySize(130, 130));
    // 원을 따라 돌며 지나간 자리에 흔적
    let t = 0;
    let lastX = cx;
    let lastY = cy;
    let dropX = cx;
    let dropY = cy;
    const trailId = p.skins.trail;
    const ev = this.time.addEvent({
      delay: 16, loop: true, callback: () => {
        if (!dragon.active) return ev.remove();
        t += 0.016 * 0.9;
        const x = cx + Math.cos(t) * R * 1.6;
        const y = cy + Math.sin(t) * R * 0.75;
        const ang = Math.atan2(y - lastY, x - lastX) + Math.PI / 2;
        dragon.setPosition(x, y).setRotation(ang);
        cape?.setPosition(x - Math.sin(ang) * 30, y + Math.cos(ang) * 30).setRotation(ang + Math.sin(t * 9) * 0.06);
        if (trailId && Phaser.Math.Distance.Between(x, y, dropX, dropY) > 22) {
          dropX = x;
          dropY = y;
          const fx = A(this.add.image(x - Math.sin(ang) * 48, y + Math.cos(ang) * 48, trailKey(trailId)).setDisplaySize(36, 36).setRotation(ang));
          this.children.moveBelow(fx, cape ?? dragon);
          this.tweens.add({ targets: fx, alpha: 0, scale: fx.scale * 0.5, duration: 800, onComplete: () => fx.destroy() });
        }
        lastX = x;
        lastY = y;
      },
    });

    // 칸(2026-11-25 제작자): 망토 4·발자국 8 칸을 모두 미리 두고, 없는 스킨은 어둡게 + "룰렛" — 스킨 룰렛에서만 얻음
    A(text(this, 360, 606, '외형 스킨(능력치 없으며, 모든 드래곤에 적용됩니다)', TYPE.tiny, COLOR.textSub, true).setOrigin(0.5));
    const row = (kind: SkinKind, y: number, label: string) => {
      A(text(this, 40, y - 80, label, TYPE.caption, COLOR.gold, true, true).setOrigin(0, 0.5));
      A(text(this, 680, y - 80, '없는 스킨은 스킨 룰렛에서 얻을 수 있어요', TYPE.tiny, COLOR.textDim, true).setOrigin(1, 0.5));
      const cur = kind === 'cape' ? p.skins.cape : p.skins.trail;
      const cells: (string | null)[] = [null, ...SKINS.filter((s) => s.kind === kind).map((s) => s.id)];
      cells.forEach((id, i) => {
        const x = 84 + (i % 5) * 138;
        const yy = y + Math.floor(i / 5) * 108;
        const on = cur === id;
        const have = !id || p.skins.owned.includes(id);
        if (on) A(this.add.rectangle(x, yy, 108, 108, COLOR.cta, 0.95).setStrokeStyle(4, COLOR.outline));
        const box = A(slotBox(this, x, yy, 94, { icon: id ? skinIconKey(id) : undefined }));
        if (id) box.add(text(this, 0, 36, skinDef(id)!.name, 12, have ? COLOR.text : COLOR.textDim, true, true).setOrigin(0.5));
        else {
          // 빈 칸: "+" 대신 "장착 해제"(2026-11-25 제작자)
          (box.list[1] as Phaser.GameObjects.GameObject).destroy();
          box.add(text(this, 0, 0, '장착\n해제', 17, COLOR.textSub, true, true).setOrigin(0.5).setAlign('center'));
        }
        if (on) box.add(badge(this, -26, -36, '장착', COLOR.teal));
        if (!have) {
          box.setAlpha(0.45);
          box.add(badge(this, 0, -6, '룰렛', 0x6a2bbf));
          return;
        }
        box.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
          const r = equipSkin(Progress.load(), kind, id);
          if (r.ok) Progress.save(r.progress);
          this.refresh();
        });
      });
    };
    row('cape', 720, '망토');
    row('trail', 872, '발자국');
    if (purchases.available || devMode()) this.B(button(this, 360, 1094, 340, 52, '스킨 룰렛 가기', () => this.scene.start('skins'), { kind: 'magic', size: TYPE.caption }));
  }

  private act(r: { ok: boolean; reason?: string; cost?: number }, done?: string): void {
    if (!r.ok) {
      const m: Record<string, string> = {
        gold: `골드가 부족해요(${r.cost?.toLocaleString()}G)`, max: '이미 최대예요', count: '같은 장비·같은 등급 재료가 모자라요(잠금·장착 제외)',
        locked: '잠금·장착 중인 장비는 합성할 수 없어요', fragments: '조각이 부족해요',
      };
      toast(this, m[r.reason ?? ''] ?? '할 수 없어요', COLOR.danger);
    } else {
      if (done) popWord(this, done);
      const res = r as { item?: EquipmentItem };
      if (res.item) this.selected = res.item.uid;
    }
    this.refresh();
  }
}
