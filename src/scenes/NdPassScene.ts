import Phaser from 'phaser';
import { DRAGONS, RARITY_COLOR, type DragonId } from '../data/dragons';
import { ND_PASS, ND_REWARDS, ndEnd, ndOpen, ndValuePct, type NdItem, type NdTrack } from '../data/ndPass';
import { PASS_ITEM_ICON, PASS_ITEM_LABEL, type PassItem } from '../data/pass';
import { ULT_NAMES } from '../data/signature';
import { PLATFORM } from '../platform';
import { gameNow } from '../ui/widgets';
import { choosePick, claimNd, ndCellState, ndLevel, pickLocked, syncNd, type NdGot } from '../systems/NdPass';
import { Progress, type PlayerProgress } from '../systems/Progress';
import { buyFailText, buyProduct, PAY_NOTICE, purchases } from '../systems/Purchases';
import { preloadArt } from '../ui/art';
import { rewardPopup, type RewardItem } from '../ui/celebrate';
import { badge, button, modal, progressBar, text } from '../ui/kit';
import { plate } from '../ui/kit2';
import { offY } from '../ui/layout';
import { CONTENT, screenFrame, toast, type ScreenFrame } from '../ui/screen';
import { makeScroll, type Scroller } from '../ui/scroll';
import { COLOR, TYPE } from '../ui/theme';

/**
 * 신규 드래곤 패스 화면(1.0.5, 기획 docs/NEW_DRAGON_PASS.md): 21일 · 20레벨 · 무료 줄(기어스 해금) / 신규 패스 줄(영웅 1종 골라 해금).
 * 아래 고정 줄: 일괄 수령 · 신규 패스 ₩11,000 · 바하무트 패스 ₩33,000(바하무트 즉시 해금 + 신규 패스 줄).
 * 유료 줄은 iOS 앱에서만(웹·토스는 무료 줄만, 개발 서버 ?dev=1은 모두 보임).
 */
const PAID = PLATFORM === 'ios' || (import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).get('dev') === '1');
const COL: Record<NdTrack, { x: number; w: number; fill: number; head: string; headFill: number }> = PAID
  ? { free: { x: 236, w: 290, fill: 0x22305a, head: '무료', headFill: 0x3a4a7a }, pass: { x: 540, w: 290, fill: 0x3a2a12, head: '신규 패스', headFill: 0xb8860b } }
  : { free: { x: 390, w: 560, fill: 0x22305a, head: '무료', headFill: 0x3a4a7a }, pass: { x: -999, w: 0, fill: 0, head: '', headFill: 0 } };
const TRACKS: NdTrack[] = PAID ? ['free', 'pass'] : ['free'];
const LV_X = 48;
const CELL_H = 104;
const ROW_GAP = 120;
const BAR_H = 150;

const daysLeft = (now: number) => Math.max(0, Math.ceil((ndEnd() - now) / 86_400_000));

/** 미리 보기 영상 정리: 재생 멈춤 → 오브젝트·영상 텍스처 제거 → <video> 소스 비우기 → 캐시에서 빼기(다음에 볼 때 다시 읽음, 브라우저 캐시라 빠름) */
function releasePreview(scene: Phaser.Scene, v: Phaser.GameObjects.Video | null, key: string): void {
  if (v) {
    const texKey = v.texture?.key;
    const el = v.video;
    if (v.active) {
      v.stop();
      v.destroy();
    }
    if (texKey && texKey !== '__MISSING' && texKey !== '__DEFAULT' && scene.textures.exists(texKey)) scene.textures.remove(texKey);
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
  }
  if (scene.cache.video.exists(key)) {
    const el = scene.cache.video.get(key) as HTMLVideoElement | undefined;
    scene.cache.video.remove(key);
    if (el && el.pause) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
  }
}

export class NdPassScene extends Phaser.Scene {
  private frame!: ScreenFrame;
  private scroll: Scroller | null = null;
  private popup = false;
  private keepY: number | null = null;
  private buying = false;

  constructor() {
    super('ndpass');
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
    const p0 = Progress.load();
    const p = syncNd(p0, now);
    if (p !== p0) Progress.save(p);
    this.frame = screenFrame(this, { title: '신규 드래곤 패스', nav: '', ribbonColor: 0xb8860b, bg: 'scrbg-pass' });
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('lobby'));
    this.events.once('shutdown', () => {
      for (const k of this.cache.video.getKeys()) if (k.startsWith('ndprev-')) releasePreview(this, null, k);
    });
    const before = new Set(this.children.list);

    // ── 머리: 신규 5종 얼굴 + 남은 기간
    const head = plate(this, 360, 318, 680, 150, { r: 24, fill: 0x2a1e0a, gold: true });
    ND_PASS.newDragons.forEach((id, i) => {
      const x = -294 + i * 46;
      if (this.textures.exists(`portrait-${id}`)) head.add(this.add.image(x, 8, `portrait-${id}`).setDisplaySize(62, 62));
    });
    const nw = text(this, -306, -50, 'NEW', 20, 0xff5a5a, true, true).setOrigin(0, 0.5);
    head.add(nw);
    this.tweens.add({ targets: nw, alpha: 0.5, duration: 600, yoyo: true, repeat: -1 });
    head.add(text(this, -84, -44, '새 드래곤 5종 등장!', TYPE.caption, COLOR.gold, true, true).setOrigin(0, 0.5));
    head.add(text(this, -84, -8, `20레벨까지 하면 ${DRAGONS[ND_PASS.freeDragon].short} 무료 해금`, TYPE.tiny, COLOR.text, true, true).setOrigin(0, 0.5));
    head.add(
      text(this, -84, 34, ndOpen(now) ? `남은 기간 ${daysLeft(now)}일 · 신규 드래곤으로 싸우면 포인트 +50%` : '기간이 끝났어요', 15, COLOR.textSub, true, true)
        .setOrigin(0, 0.5).setWordWrapWidth(410).setLineSpacing(2),
    );

    // ── 레벨 막대
    const lv = ndLevel(p);
    const bar = plate(this, 360, 448, 680, 92, { r: 22 });
    bar.add([this.add.circle(-290, 0, 40, 0x8a6a1a).setStrokeStyle(5, COLOR.gold), text(this, -290, 0, `Lv.${lv.level}`, TYPE.body, COLOR.text, true, true).setOrigin(0.5)]);
    bar.add(text(this, -232, -22, `패스 레벨 ${lv.level} / ${ND_PASS.levels}`, TYPE.caption, COLOR.text, true, true).setOrigin(0, 0.5));
    bar.add(progressBar(this, -40, 18, 380, 22, lv.maxed ? 1 : lv.inLevel / lv.need, COLOR.gold, lv.maxed ? 'MAX' : `${lv.inLevel} / ${lv.need}`).root);
    bar.add(text(this, 320, 0, lv.maxed ? '모두 달성!' : '전투하면\n포인트가 올라요', TYPE.tiny, COLOR.gold, true, true).setOrigin(1, 0.5).setAlign('right'));

    let y0 = 540;
    if (PAID) y0 = this.heroPanel(p, y0);

    for (const t of TRACKS) {
      const c = COL[t];
      const h = plate(this, c.x, y0 + 32, c.w, 56, { r: 16, fill: c.headFill, gold: t === 'pass' });
      h.add(text(this, 0, 0, c.head, TYPE.caption, COLOR.text, true, true).setOrigin(0.5));
    }
    const row0 = y0 + 110;
    for (let i = 0; i < ND_PASS.levels; i++) {
      const n = i + 1;
      const y = row0 + i * ROW_GAP;
      const reached = lv.level >= n;
      this.add.circle(LV_X, y, 30, reached ? 0xc8901e : 0x3a3352).setStrokeStyle(4, reached ? 0xffe39a : 0x6b6488);
      text(this, LV_X, y, String(n), TYPE.caption, COLOR.text, true, true).setOrigin(0.5);
      for (const t of TRACKS) this.cell(p, t, n, y, now);
    }
    let y = row0 + ND_PASS.levels * ROW_GAP + 10;
    const note = PAID
      ? `신규 패스·바하무트 패스는 계정당 한 번, 패스 기간에만 살 수 있어요. 랜덤 보상은 없어요.\n${PAY_NOTICE.replace(/\n/g, ' ')}`
      : '기간 안에 레벨을 올려 무료 보상을 받으세요. 기간이 끝나면 받지 않은 보상은 사라져요.';
    text(this, 360, y + 20, note, 13, COLOR.textSub, true).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(660).setLineSpacing(4);
    y += 130 + BAR_H;

    this.scroll = makeScroll(this, before, y, () => this.popup);
    if (this.keepY !== null) this.scroll.box.y = this.keepY;
    else this.scroll.scrollTo(row0 + Math.max(0, lv.level - 2) * ROW_GAP, 640);
    this.stickyBar(p, now);
  }

  /** 영웅 고르기(실바·포지·크리스탈): 구매 전엔 바꿀 수 있고, 패스를 산 뒤 고르면 끝. 필살기 미리 보기 */
  private heroPanel(p: PlayerProgress, y: number): number {
    const locked = pickLocked(p);
    const box = plate(this, 360, y + 120, 680, 230, { r: 22, fill: 0x231a33 });
    box.add(text(this, 0, -94, locked ? `고른 영웅: ${DRAGONS[p.ndPass.pick!].short} (변경 불가)` : '신규 패스로 해금할 영웅을 골라요', TYPE.caption, COLOR.gold, true, true).setOrigin(0.5));
    ND_PASS.heroes.forEach((id, i) => {
      const x = -220 + i * 220;
      const on = p.ndPass.pick === id;
      const g = this.add.graphics();
      g.fillStyle(on ? 0x4a3a12 : 0x1a1430, 1).fillRoundedRect(x - 100, -70, 200, 180, 18);
      g.lineStyle(on ? 5 : 2, on ? COLOR.gold : RARITY_COLOR[DRAGONS[id].rarity], 1).strokeRoundedRect(x - 100, -70, 200, 180, 18);
      box.add(g);
      if (this.textures.exists(`portrait-${id}`)) box.add(this.add.image(x, -14, `portrait-${id}`).setDisplaySize(92, 92));
      box.add(text(this, x, 44, DRAGONS[id].short + (on ? ' ✔' : ''), 20, on ? COLOR.gold : COLOR.text, true, true).setOrigin(0.5));
      const hit = this.add.rectangle(x, -10, 200, 120, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => this.pick(id));
      box.add(hit);
      box.add(button(this, x, 86, 170, 40, '필살기 보기', () => this.preview(id), { kind: 'secondary', size: 16 }).root);
    });
    return y + 250;
  }

  private pick(id: DragonId): void {
    if (this.scroll?.dragged || this.popup) return;
    const p = Progress.load();
    if (pickLocked(p)) return toast(this, '이미 고른 영웅은 바꿀 수 없어요', COLOR.textSub);
    const r = choosePick(p, id, gameNow());
    if (!r.ok) return;
    Progress.save(r.progress);
    toast(this, r.progress.ndPass.pass ? `${DRAGONS[id].short} 선택 완료 — 이제 바꿀 수 없어요` : `${DRAGONS[id].short} 선택 완료 (구매 전에는 바꿀 수 있어요)`, COLOR.ok);
    this.time.delayedCall(700, () => this.scene.restart({ scrollY: this.scroll?.box.y ?? 0 }));
  }

  /** 필살기 영상 미리 보기(구매 전에 세 드래곤 비교) — 영상은 볼 때만 읽고 화면을 나가면 내린다 */
  private preview(id: DragonId): void {
    if (this.scroll?.dragged || this.popup) return;
    this.popup = true;
    const m = modal(this, 620, 1000, ULT_NAMES[id] ?? DRAGONS[id].name, { closeOnBackdrop: true, ribbonColor: 0xb8860b, depth: 900 });
    const key = `ndprev-${id}`;
    let v: Phaser.GameObjects.Video | null = null;
    // 닫을 때 영상을 완전히 내린다(1.0.5 메모리 점검: 영상 오브젝트만 지우면 720×1280 영상 텍스처와 <video>가 한 번 볼 때마다 3.7MB씩 남았음)
    m.box.once('destroy', () => {
      this.popup = false;
      releasePreview(this, v, key);
      v = null;
    });
    const show = () => {
      if (!m.box.active) return releasePreview(this, null, key);
      v = this.add.video(0, -40, key);
      const vv = v;
      vv.play(false);
      vv.once(Phaser.GameObjects.Events.VIDEO_PLAYING, () => vv.setDisplaySize(540, 540 * (vv.height / Math.max(1, vv.width))));
      m.body(vv);
    };
    m.body(text(this, 0, 420, `${DRAGONS[id].name} · ${DRAGONS[id].role}`, TYPE.tiny, COLOR.textSub, true, true).setOrigin(0.5));
    if (this.cache.video.exists(key)) return show();
    m.body(text(this, 0, -40, '불러오는 중…', TYPE.caption, COLOR.textSub, true, true).setOrigin(0.5));
    this.load.video(key, `art/ult/ult-${id}.mp4`, true);
    this.load.once(Phaser.Loader.Events.COMPLETE, show);
    this.load.start();
  }

  /** 칸: 보상 그림 + 이름·수량 */
  private cell(p: PlayerProgress, t: NdTrack, n: number, y: number, now: number): void {
    const c = COL[t];
    const st = ndCellState(p, t, n, now);
    const it = ND_REWARDS[t][n - 1];
    const { icon, label, amount } = this.look(p, it);
    const big = it.kind === 'dragonFrag' || it.kind === 'pickFrag';
    const box = plate(this, c.x, y, c.w, CELL_H, { r: 16, fill: big ? 0x4a2a5a : c.fill, gold: st === 'ready' });
    const ix = -c.w / 2 + 56;
    if (this.textures.exists('pass-pedestal')) box.add(this.add.image(ix, 22, 'pass-pedestal').setDisplaySize(80, 80));
    const ic = t === 'pass' && st === 'buy' ? 'chest-dragon' : icon;
    if (this.textures.exists(ic)) box.add(this.add.image(ix, -6, ic).setDisplaySize(66, 66));
    else box.add(text(this, ix, -6, '❔', 40).setOrigin(0.5));
    box.add(text(this, ix + 50, -16, label, 17, COLOR.text, true, true).setOrigin(0, 0.5));
    box.add(text(this, ix + 50, 14, amount, 24, big ? 0xffb3ff : COLOR.gold, true, true).setOrigin(0, 0.5));
    if (st === 'claimed') {
      box.setAlpha(0.55);
      box.add(text(this, c.w / 2 - 24, -CELL_H / 2 + 22, '✔', 28, COLOR.ok, true, true).setOrigin(0.5));
    } else if (st === 'ready') {
      const tag = plate(this, 0, CELL_H / 2 - 4, 110, 34, { r: 12, fill: 0x2e9e4a });
      tag.add(text(this, 0, 0, '받기', 18, COLOR.text, true, true).setOrigin(0.5));
      box.add(tag);
      this.tweens.add({ targets: tag, scale: 1.08, duration: 500, yoyo: true, repeat: -1 });
    } else {
      box.add(text(this, c.w / 2 - 22, -CELL_H / 2 + 22, st === 'pick' ? '❔' : '🔒', 22, COLOR.text).setOrigin(0.5));
      if (st === 'locked' || st === 'ended') box.setAlpha(0.8);
    }
    box.setInteractive({ useHandCursor: true, hitArea: new Phaser.Geom.Rectangle(0, 0, c.w, CELL_H + 14), hitAreaCallback: Phaser.Geom.Rectangle.Contains });
    box.on('pointerup', () => {
      if (st === 'ready') this.claim({ t, lv: n });
      else if (st === 'buy') toast(this, '신규 패스를 구매하면 받을 수 있어요', COLOR.textSub);
      else if (st === 'pick') toast(this, '위에서 해금할 영웅을 먼저 골라 주세요', COLOR.textSub);
      else if (st === 'locked') toast(this, `패스 레벨 ${n}에 열려요`, COLOR.textSub);
      else if (st === 'ended') toast(this, '패스 기간이 끝났어요', COLOR.textSub);
    });
  }

  private look(p: PlayerProgress, it: NdItem): { icon: string; label: string; amount: string } {
    if (it.kind === 'dragonFrag') return { icon: `portrait-${it.id}`, label: `${DRAGONS[it.id].short} 조각`, amount: `×${it.n}` };
    if (it.kind === 'pickFrag') {
      const id = p.ndPass.pick;
      return { icon: id ? `portrait-${id}` : 'ui-fragment', label: id ? `${DRAGONS[id].short} 조각` : '고른 영웅 조각', amount: `×${it.n}` };
    }
    const k = (it as PassItem).kind;
    return { icon: PASS_ITEM_ICON[k], label: PASS_ITEM_LABEL[k], amount: (it as PassItem).n.toLocaleString() };
  }

  /** 아래 고정 줄: 일괄 수령 · (iOS) 신규 패스 · 바하무트 패스 */
  private stickyBar(p: PlayerProgress, now: number): void {
    const cy = CONTENT.bottom + offY(this) - BAR_H / 2 + 6;
    this.add.rectangle(360, cy, 720, BAR_H, 0x1a1430, 0.96).setDepth(35);
    this.add.rectangle(360, cy - BAR_H / 2, 720, 4, COLOR.gold, 0.9).setDepth(35);
    const n = TRACKS.reduce((s, t) => s + ND_REWARDS[t].filter((_, i) => ndCellState(p, t, i + 1, now) === 'ready').length, 0);
    if (!PAID) {
      const all = button(this, 360, cy + 10, 420, 78, n ? `일괄 수령 ${n}` : '받을 보상이 없어요', () => this.claim(), { kind: 'growth', size: TYPE.caption });
      all.setEnabled(n > 0);
      all.root.setDepth(36);
      return;
    }
    const all = button(this, 124, cy + 10, 220, 78, n ? `일괄 수령 ${n}` : '받을 보상 없음', () => this.claim(), { kind: 'growth', size: TYPE.tiny });
    all.setEnabled(n > 0);
    all.root.setDepth(36);
    const open = ndOpen(now);
    const nd = p.ndPass;
    const passBtn = button(this, 360, cy + 10, 230, 78, nd.pass ? '신규 패스 ✔' : `신규 패스\n${ND_PASS.price.pass.toLocaleString()}원`, () => this.buy('pass'), { kind: 'cta', size: TYPE.tiny });
    passBtn.setEnabled(open && !nd.pass);
    passBtn.root.setDepth(36);
    const bahaBtn = button(this, 598, cy + 10, 230, 78, nd.bahamut ? '바하무트 ✔' : `바하무트 패스\n${ND_PASS.price.bahamut.toLocaleString()}원`, () => this.buy('bahamut'), { kind: 'cta', size: TYPE.tiny });
    bahaBtn.setEnabled(open && !nd.bahamut);
    bahaBtn.root.setDepth(36);
    const t1 = badge(this, 360, cy - 42, `${ndValuePct('pass').toLocaleString()}% 가치`, COLOR.ruby).setDepth(37);
    const t2 = badge(this, 598, cy - 42, nd.pass && !nd.bahamut ? '바하무트 즉시 해금' : '전설 확정 해금', 0x7a1a9a).setDepth(37);
    if (!nd.pass) this.tweens.add({ targets: t1, scale: 1.08, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    if (!nd.bahamut) this.tweens.add({ targets: t2, scale: 1.08, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut', delay: 300 });
    if (purchases.available)
      void purchases.products().then((list) => {
        const sp = (id: string) => list.find((x) => x.productId === id)?.priceLabel;
        if (!nd.pass && passBtn.root.active && sp(ND_PASS.productId.pass)) passBtn.setLabel(`신규 패스\n${sp(ND_PASS.productId.pass)}`);
        if (!nd.bahamut && bahaBtn.root.active && sp(ND_PASS.productId.bahamut)) bahaBtn.setLabel(`바하무트 패스\n${sp(ND_PASS.productId.bahamut)}`);
      }).catch(() => {});
  }

  private claim(only?: { t: NdTrack; lv: number }): void {
    if (this.scroll?.dragged || this.popup) return;
    const r = claimNd(Progress.load(), gameNow(), only);
    if (!r.ok) return toast(this, '받을 보상이 없어요', COLOR.textSub);
    Progress.save(r.progress);
    this.popup = true;
    const y = this.scroll?.box.y ?? 0;
    const items: RewardItem[] = r.items.map((g: NdGot) => {
      const lk = this.look(r.progress, g);
      return { image: lk.icon, label: g.unlocked && g.dragonId ? `${DRAGONS[g.dragonId].short} 해금!` : lk.label, amount: lk.amount, grade: g.unlocked ? 'legendary' : g.kind === 'dragonFrag' || g.kind === 'pickFrag' ? 'epic' : 'rare' };
    });
    rewardPopup(this, only ? `신규 드래곤 패스 Lv.${only.lv}` : '신규 드래곤 패스 보상', items, () => this.scene.restart({ scrollY: y }));
  }

  /** 구매: 서버 확인 → App Store 결제 → 서버 검증 → 반영(드래곤 패스와 같은 경로) */
  private buy(kind: 'pass' | 'bahamut'): void {
    if (this.scroll?.dragged || this.buying || this.popup) return;
    if (!purchases.available) return toast(this, '결제는 App Store 앱에서 할 수 있어요', COLOR.textSub);
    const p = Progress.load();
    if (kind === 'pass' && !p.ndPass.pick) return toast(this, '먼저 해금할 영웅을 골라 주세요', COLOR.gold);
    this.buying = true;
    void buyProduct(ND_PASS.productId[kind])
      .then((r) => {
        if (!this.sys.isActive()) return;
        if (r.ok) {
          toast(this, kind === 'bahamut' ? '바하무트가 합류했어요!' : '신규 패스가 열렸어요', COLOR.ok);
          this.time.delayedCall(1100, () => this.scene.restart({ scrollY: this.scroll?.box.y ?? 0 }));
          return;
        }
        const msg = buyFailText(r.reason);
        if (msg) toast(this, msg, r.reason === 'failed' ? COLOR.danger : COLOR.textSub);
      })
      .finally(() => (this.buying = false));
  }
}
