import Phaser from 'phaser';
import { makeTextures } from '../textures';
import { DRAGONS, type DragonId } from '../data/dragons';
import { SKIN_ROULETTE as R, skinDef } from '../data/skins';
import { Progress } from '../systems/Progress';
import { applyServerSpin, boardSlots, nextRotationAt, resetLeftText, skinOdds, slotLabel, spinSkinRoulette, syncServerSkinState, syncSkinBoard, type BoardSlot, type SkinSpinResult } from '../systems/Skins';
import type { ServerSkinState } from '../data/skinRoulette';
import { buyFailText, buyProduct, PAY_NOTICE, purchases } from '../systems/Purchases';
import { preloadArt } from '../ui/art';
import { rewardPopup, type RewardItem } from '../ui/celebrate';
import { button, modal, text, type KitButton } from '../ui/kit';
import { screenFrame, toast, type ScreenFrame } from '../ui/screen';
import { COLOR, TYPE } from '../ui/theme';
import { FONT, gameNow, devMode } from '../ui/widgets';
import { tr } from '../i18n';
import { makeSkinTextures, skinIconKey } from '../ui/skinArt';
import { playSfx, preloadSfx } from '../systems/Sfx';

/**
 * 스킨 룰렛(제작자 요청 2026-11-23 밤): 9칸 판(가운데 = 그 주의 대표 망토), 열쇠 1개로 1회, 뽑힌 칸은 다시 안 나옴.
 * 매주 월요일 0시(KST) 판이 바뀐다(열쇠는 남음). 열쇠는 App Store 결제(4,900원)로만 — 웹·토스는 결제가 없어 로비에 안 보인다.
 * 확률은 "확률" 창에서 지금 판 기준(남은 칸 가중치)으로 보여 준다(확률형 아이템 표시).
 * 추첨은 서버가 한다(11/24, functions/ skinSpin): 열쇠 수·판·보유 스킨은 서버 기준, 앱은 서버 결과만 지급한다.
 * 서버가 없는 개발 모드(?dev=1 웹)만 기기에서 뽑는다.
 */
export class SkinScene extends Phaser.Scene {
  private layer: Phaser.GameObjects.GameObject[] = [];
  private frame!: ScreenFrame;
  private busy = false;
  private buying = false;
  private cells: { slot: BoardSlot; x: number; y: number; hl: Phaser.GameObjects.Rectangle }[] = [];

  constructor() {
    super('skins');
  }

  onPlatformBack(): boolean {
    if (this.busy) return true;
    this.scene.start('lobby');
    return true;
  }

  preload(): void {
    preloadArt(this);
    preloadSfx(this, ['sfx-roulette-tick', 'sfx-roulette-win', 'sfx-roulette-jackpot', 'sfx-key-use']); // 로비를 거치지 않고 들어와도
  }

  create(): void {
    if (!this.textures.exists('dragon-red')) makeTextures(this);
    makeSkinTextures(this);
    this.layer = [];
    this.busy = false;
    this.frame = screenFrame(this, { title: '스킨 룰렛', nav: '', ribbonColor: 0x7b3fe4 });
    this.add.rectangle(360, 640, 720, 2000, 0x1a0b33, 0.55);
    this.input.keyboard?.on('keydown-ESC', () => !this.busy && this.scene.start('lobby'));
    // 판이 바뀌는 순간 화면에 있으면 다시 그림
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickTimer() });
    this.refresh();
    if (purchases.available) void this.syncServer();
  }

  /** 서버 상태 반영: 아직 지급 안 한 추첨을 지급하고(같은 추첨은 한 번만) 열쇠·판·보유 스킨을 서버 기준으로 맞춘다 */
  private applyServer(st: ServerSkinState): SkinSpinResult[] {
    const now = gameNow();
    let p = Progress.load();
    const done: string[] = [];
    const got: SkinSpinResult[] = [];
    for (const s of st.pending) {
      const r = applyServerSpin(p, s, now);
      if (r.ok) {
        p = r.progress;
        got.push(r.spin);
      }
      done.push(s.id); // 성공·이미 받음 모두 처리 끝
    }
    p = syncServerSkinState(p, st, now);
    Progress.save(p);
    if (done.length) void purchases.skinAck(done).catch((e) => console.warn('룰렛 지급 확인 알림 실패(다음에 다시)', e));
    return got;
  }

  private async syncServer(): Promise<void> {
    try {
      const st = await purchases.skinState();
      if (!this.sys.isActive() || this.busy) return;
      const got = this.applyServer(st);
      if (got.length) toast(this, '지난 룰렛 보상을 받았어요', COLOR.ok);
      this.refresh();
    } catch (e) {
      console.warn('룰렛 서버 상태 확인 실패', e);
    }
  }

  private A<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.layer.push(o);
    return o;
  }
  private keep(b: KitButton): KitButton {
    this.layer.push(b.root);
    return b;
  }

  private timerText: Phaser.GameObjects.Text | null = null;
  private shownWeekEnd = 0;
  private tickTimer(): void {
    const now = gameNow();
    if (this.shownWeekEnd && now >= this.shownWeekEnd && !this.busy) return this.refresh();
    if (!this.timerText?.active) return;
    const left = Math.max(0, this.shownWeekEnd - now);
    this.timerText.setText(`초기화까지 ${resetLeftText(left)}`);
  }

  private refresh(): void {
    this.layer.forEach((o) => o.destroy());
    this.layer = [];
    this.cells = [];
    const now = gameNow();
    let p = Progress.load();
    const synced = syncSkinBoard(p, now);
    if (synced !== p) {
      Progress.save(synced);
      p = synced;
    }
    this.frame.refresh();
    this.shownWeekEnd = nextRotationAt(now);
    // 초기화 타이머(제작자 요청 2026-11-24): 빨간 글씨로 눈에 띄게 — 받지 못한 칸이 사라지는 시각을 주의하도록
    this.A(this.add.rectangle(300, 250, 470, 56, 0x2a0006, 0.85).setStrokeStyle(3, 0xff3b3b, 0.9));
    this.timerText = this.A(this.add.text(300, 250, '', { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#ff4d4d', stroke: '#120000', strokeThickness: 5 }).setOrigin(0.5));
    this.tweens.add({ targets: this.timerText, alpha: 0.65, yoyo: true, repeat: -1, duration: 900 });
    this.tickTimer();
    this.keep(button(this, 625, 250, 110, 52, '확률', () => this.openOdds(), { kind: 'secondary', size: TYPE.caption }));

    // ── 판: 3×3, 가운데 큰 칸 = 대표 망토
    const slots = boardSlots(p, now);
    const picked = new Set(p.skins.board.picked);
    const pos = [
      [360, 590],
      [140, 370], [360, 370], [580, 370],
      [580, 590],
      [580, 810], [360, 810], [140, 810],
      [140, 590],
    ];
    // 판 뒤 마법진(24차분 그림, 없으면 생략): 천천히 돌며 가운데 대표 망토를 비춤
    if (this.textures.exists('skin-board-bg')) {
      const bg = this.A(this.add.image(360, 590, 'skin-board-bg').setDisplaySize(660, 660).setAlpha(0.9));
      this.tweens.add({ targets: bg, angle: 360, duration: 60000, repeat: -1 });
    }
    // 칸 사이를 잇는 빛줄기
    const g = this.A(this.add.graphics());
    g.lineStyle(10, 0xd05cff, 0.35).strokeRoundedRect(140, 370, 440, 440, 30);
    g.lineStyle(4, 0xf3b5ff, 0.9).strokeRoundedRect(140, 370, 440, 440, 30);
    slots.forEach((slot, i) => {
      const [x, y] = pos[i];
      const size = slot.center ? 250 : 168;
      const got = picked.has(slot.id);
      const hl = this.A(this.add.rectangle(x, y, size + 18, size + 18, 0xffe066, 0).setStrokeStyle(8, 0xffe066, 0));
      this.drawCell(slot, x, y, size, got);
      this.cells.push({ slot, x, y, hl });
    });

    // ── 아래: 열쇠·뽑기·구매
    const keys = p.skins.keys;
    const keyLine = this.A(text(this, 378, 950, `열쇠 ${keys}개 · 받지 못한 칸은 초기화 때 사라져요`, TYPE.caption, COLOR.gold, true, true).setOrigin(0.5));
    if (this.textures.exists('ui-skinkey')) this.A(this.add.image(keyLine.x - keyLine.width / 2 - 22, 950, 'ui-skinkey').setDisplaySize(38, 38));
    const left = slots.filter((s) => !picked.has(s.id)).length;
    const canBuy = purchases.available || devMode();
    const spinBtn = this.keep(button(this, canBuy ? 270 : 360, 1026, canBuy ? 360 : 400, 88, left ? '1회 뽑기' : '이번 판을 다 받았어요', () => this.spin(), { kind: 'cta', size: 34, sub: left ? '열쇠 1개' : '다음 주 새 판' }));
    spinBtn.setEnabled(left > 0);
    if (canBuy) {
      const buy = this.keep(button(this, 572, 1026, 210, 78, '열쇠 구매', () => this.buyKey(), { kind: 'secondary', size: TYPE.caption, sub: `${R.keyKrw.toLocaleString()}원` }));
      if (this.textures.exists('ui-skinkey')) buy.root.add(this.add.image(-78, 0, 'ui-skinkey').setDisplaySize(46, 46));
    }
    this.A(this.add.text(360, 1080, PAY_NOTICE, { fontFamily: FONT, fontSize: '13px', color: '#b9a9d9', align: 'center', wordWrap: { width: 640 } }).setOrigin(0.5, 0));
  }

  /** 칸 하나: 스킨이면 스킨 그림, 재화면 아이콘 + 수량. 받은 칸은 어둡게 + "획득" */
  private drawCell(slot: BoardSlot, x: number, y: number, size: number, got: boolean): void {
    const skin = slot.skin ? skinDef(slot.skin) : undefined;
    const fill = skin ? (skin.kind === 'cape' ? 0x6a2bbf : 0xe08a1e) : slot.epicEssence ? 0x8e3bd8 : slot.rubies && slot.rubies >= 1000 ? 0xc62828 : 0x3a2f63;
    this.A(this.add.rectangle(x, y, size, size, fill, 1).setStrokeStyle(5, 0x120a24));
    this.A(this.add.rectangle(x, y, size - 16, size - 16, 0xffffff, 0.08));
    const iconSize = size * (skin ? 0.78 : 0.5);
    let key = '';
    if (skin) key = skinIconKey(skin.id);
    else if (slot.rubies) key = 'ui-ruby';
    else if (slot.gold) key = 'ui-gold';
    else if (slot.dragonTickets) key = 'ui-ticket';
    else if (slot.equipTickets) key = 'ui-ticket-equip';
    else if (slot.epicEssence) key = 'ui-essence';
    if (key && this.textures.exists(key)) this.A(this.add.image(x, y - (skin ? 4 : 12), key).setDisplaySize(iconSize, iconSize));
    const amount = slot.rubies ? `×${slot.rubies.toLocaleString()}` : slot.gold ? `×${slot.gold.toLocaleString()}` : slot.dragonTickets ? `×${slot.dragonTickets}` : slot.equipTickets ? `×${slot.equipTickets}` : slot.epicEssence ? '영웅 랜덤 정수' : '';
    if (amount) this.A(text(this, x + size / 2 - 12, y + size / 2 - 14, amount, slot.center ? 30 : 24, COLOR.text, true, true).setOrigin(1, 1));
    if (skin) {
      this.A(text(this, x, y + size / 2 - 18, skin.name, slot.center ? 24 : 17, COLOR.text, true, true).setOrigin(0.5));
      if (slot.center) {
        const tag = this.A(text(this, x - size / 2 + 12, y - size / 2 + 12, '대표 망토', 20, COLOR.gold, true, true).setOrigin(0, 0));
        this.tweens.add({ targets: tag, alpha: 0.5, yoyo: true, repeat: -1, duration: 700 });
      }
    }
    if (slot.duplicate) this.A(text(this, x, y - size / 2 + 20, '보유 → 루비', 16, COLOR.gold, true, true).setOrigin(0.5));
    if (got) {
      this.A(this.add.rectangle(x, y, size, size, 0x000000, 0.62));
      this.A(text(this, x, y, '획득', slot.center ? 40 : 30, COLOR.ok, true, true).setOrigin(0.5).setAngle(-12));
    }
  }

  private spin(): void {
    if (this.busy) return;
    if (purchases.available) return void this.spinServer();
    const now = gameNow();
    const r = spinSkinRoulette(Progress.load(), now);
    if (!r.ok) {
      if (r.reason === 'keys') return toast(this, '열쇠는 App Store 앱에서 구매할 수 있어요', COLOR.textSub);
      return toast(this, '이번 판은 모두 받았어요', COLOR.textSub);
    }
    Progress.save(r.progress);
    this.busy = true;
    playSfx(this, 'sfx-key-use');
    this.animate(r.spin, r.progress.skins.board.picked);
  }

  /** 서버 추첨: 열쇠 확인·추첨·기록은 서버, 앱은 결과 지급과 연출만 */
  private async spinServer(): Promise<void> {
    this.busy = true;
    try {
      const res = await purchases.skinSpin();
      if (!this.sys.isActive()) return;
      const got = this.applyServer(res);
      const mine = got.find((g) => g.slot.id === res.spin.slot.id) ?? { slot: res.spin.slot };
      playSfx(this, 'sfx-key-use');
      this.animate(mine, Progress.load().skins.board.picked);
    } catch (e) {
      this.busy = false;
      const msg = String((e as { message?: unknown })?.message ?? '');
      if (msg === 'keys') return toast(this, '열쇠가 없어요 — 열쇠를 구매해 주세요', COLOR.textSub);
      if (msg === 'done') return toast(this, '이번 판은 모두 받았어요', COLOR.textSub);
      console.warn('룰렛 추첨 실패', e);
      toast(this, '서버에 연결하지 못했어요 — 열쇠는 쓰지 않았어요', COLOR.danger);
    }
  }

  /** 남은 칸을 돌며 빛이 지나가다 결과 칸에서 멈춤 */
  private animate(spin: SkinSpinResult, pickedAfter: readonly string[]): void {
    const order = this.cells.filter((c) => !pickedAfter.includes(c.slot.id) || c.slot.id === spin.slot.id);
    const target = Math.max(0, order.findIndex((c) => c.slot.id === spin.slot.id));
    if (!order.length) return this.showResult(spin.slot, spin.essence);
    const steps = order.length * 2 + target;
    let i = 0;
    const tick = () => {
      order.forEach((c) => c.hl.setStrokeStyle(8, 0xffe066, 0));
      const c = order[i % order.length];
      c.hl.setStrokeStyle(8, 0xffe066, 1);
      playSfx(this, 'sfx-roulette-tick');
      if (i >= steps) {
        this.time.delayedCall(450, () => this.showResult(spin.slot, spin.essence));
        return;
      }
      i++;
      this.time.delayedCall(60 + Math.max(0, i - steps + 6) * 70, tick);
    };
    tick();
  }

  private showResult(slot: BoardSlot, essence?: { dragonId: string; isNew: boolean; fragments: number }): void {
    const items: RewardItem[] = [];
    const skin = slot.skin ? skinDef(slot.skin) : undefined;
    if (skin) items.push({ image: skinIconKey(skin.id), label: skin.name, amount: skin.kind === 'cape' ? '망토' : '발자국', grade: skin.kind === 'cape' ? 'legendary' : 'epic' });
    if (slot.rubies) items.push({ image: 'ui-ruby', label: slot.duplicate ? '루비(보유 스킨)' : '루비', amount: `+${slot.rubies.toLocaleString()}` });
    if (slot.gold) items.push({ image: 'ui-gold', label: '골드', amount: `+${slot.gold.toLocaleString()}` });
    if (slot.dragonTickets) items.push({ image: 'ui-ticket', label: '드래곤 개봉권', amount: `+${slot.dragonTickets}` });
    if (slot.equipTickets) items.push({ image: 'ui-ticket-equip', label: '장비 개봉권', amount: `+${slot.equipTickets}` });
    if (essence) {
      const d = DRAGONS[essence.dragonId as DragonId];
      items.push({ portrait: essence.dragonId as DragonId, label: `${d.short} 정수`, amount: essence.isNew ? '새 드래곤!' : `조각 +${essence.fragments}`, grade: 'epic' });
    }
    // 당첨 소리(소리 요청서 9): 스킨이면 팡파르, 아니면 짧은 당첨음 — 보상 창 기본 소리는 끔(겹치지 않게)
    playSfx(this, skin ? 'sfx-roulette-jackpot' : 'sfx-roulette-win');
    rewardPopup(this, skin ? '스킨 획득!' : '룰렛 보상', items, () => {
      this.busy = false;
      this.refresh();
    }, { silent: true });
  }

  private buyKey(): void {
    if (this.buying || this.busy) return;
    if (!purchases.available) {
      // 개발 모드(웹): 결제 없이 열쇠 1개를 넣어 화면 시험
      if (devMode()) {
        const p = Progress.load();
        Progress.save({ ...p, skins: { ...p.skins, keys: p.skins.keys + 1 } });
        toast(this, '[개발용] 열쇠 +1', COLOR.ok);
        return this.refresh();
      }
      return toast(this, '결제는 App Store 앱에서 할 수 있어요', COLOR.textSub);
    }
    this.buying = true;
    void buyProduct(R.keyProductId)
      .then((r) => {
        if (!this.sys.isActive()) return;
        if (r.ok) {
          toast(this, '열쇠를 받았어요', COLOR.ok);
          this.refresh();
          void this.syncServer(); // 남은 열쇠는 서버 기준
          return;
        }
        const msg = buyFailText(r.reason);
        if (msg) toast(this, msg, r.reason === 'failed' ? COLOR.danger : COLOR.textSub);
      })
      .finally(() => (this.buying = false));
  }

  /** 확률 안내: 지금 판 기준 다음 1회 확률(남은 칸 가중치) + 규칙 */
  private openOdds(): void {
    const now = gameNow();
    const odds = skinOdds(Progress.load(), now);
    const m = modal(this, 640, 900, '스킨 룰렛 확률', { closeOnBackdrop: true, ribbonColor: 0x7b3fe4 });
    const lines = [
      '다음 1회 확률(지금 판 기준)',
      ...odds.map((o) => `${o.picked ? '✓ ' : '· '}${tr(slotLabel(o.slot))}${o.slot.center ? tr(' (대표)') : ''}  ${o.picked ? '받았어요' : `${o.pct.toFixed(2)}%`}`),
      '',
      `규칙`,
      `· 열쇠 1개(${R.keyKrw.toLocaleString()}원)로 1회. 뽑힌 칸은 다시 나오지 않고, 남은 칸의 가중치로 확률을 다시 나눕니다.`,
      `· 열쇠 9개면 이 판의 9칸을 모두 받습니다.`,
      `· 매주 월요일 0시(한국 시간)에 새 판으로 바뀝니다. 남은 열쇠는 그대로이고, 받지 못한 칸은 사라집니다.`,
      `· 이미 가진 스킨이 판에 오면 그 칸은 루비 ${R.duplicateRubies.toLocaleString()}로 바뀝니다.`,
      `· 영웅 드래곤 정수: 영웅 드래곤 중 하나(같은 확률). 없으면 해금, 있으면 조각.`,
      `· 추첨과 열쇠 수는 서버에서 처리해요(앱 저장을 되돌려도 결과는 바뀌지 않아요).`,
      `· 스킨은 꾸미기 전용이며 능력치는 없습니다.`,
    ];
    m.body(this.add.text(-280, -390, lines.join('\n'), { fontFamily: FONT, fontSize: '20px', color: '#ece6ff', lineSpacing: 7, wordWrap: { width: 560 } }).setOrigin(0, 0));
    m.body(button(this, 0, 390, 220, 64, '닫기', () => m.close(), { kind: 'secondary', size: TYPE.caption }).root);
  }
}
