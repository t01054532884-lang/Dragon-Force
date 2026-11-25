import Phaser from 'phaser';
import { Progress } from '../systems/Progress';
import { CLAIM_FAIL_TEXT, GIFT_LABEL, GIFT_KINDS, pendingGifts, staminaNow, type ClaimFail, type Gift, type GiftKind } from '../systems/Mailbox';
import { STAMINA, formatLeft } from '../systems/Stamina';
import { devMode, gameNow } from '../ui/widgets';
import { markGiftsSeen } from '../ui/giftFx';
import { preloadArt } from '../ui/art';
import { button, modal, text } from '../ui/kit';
import { plate, tabs } from '../ui/kit2';
import { screenFrame, toast, type ScreenFrame } from '../ui/screen';
import { COLOR, TYPE } from '../ui/theme';

/** 글자 앞 아이콘(루비는 이모지 없이 — 빨간 루비 그림은 따로 그린다) */
const tag = (k: GiftKind) => (GIFT_LABEL[k].icon ? `${GIFT_LABEL[k].icon} ` : '');

const PER_PAGE = 6;
const ROW_H = 106;
const TOP = 296;
const DAY = 86_400_000;

/**
 * 선물함(8단계 v1.0 4장): 받을 선물 목록(오래된 순) · 개별 받기 · 모두 받기(받은 것/남긴 것 요약) · 받은 내역.
 * 규칙은 모두 src/systems/Mailbox.ts(순수 함수) — 이 화면은 결과를 보여 주기만 한다.
 * 8단계 v2.0 C: 공통 머리줄(행동력 회복 시간 포함)·리본·하단 탭, 시안 형식 판·탭·버튼.
 */
export class GiftScene extends Phaser.Scene {
  private tab: 'pending' | 'history' = 'pending';
  private page = 0;
  private layer: Phaser.GameObjects.GameObject[] = [];
  private popup: { close: () => void } | null = null;
  private frame!: ScreenFrame;

  constructor() {
    super('gifts');
  }

  onPlatformBack(): boolean {
    if (this.popup) this.closePopup();
    else this.scene.start('lobby');
    return true;
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    this.layer = [];
    this.popup = null;
    this.page = 0;
    Progress.syncMail(gameNow(), devMode());
    markGiftsSeen(this, pendingGifts(Progress.load().mailbox, gameNow()).map((g) => g.id)); // 선물함을 열면 새 선물 별 효과는 끝
    this.frame = screenFrame(this, { title: '선물함', nav: '', ribbonColor: COLOR.violet });
    tabs(this, 262, ['받을 선물', '받은 내역'], this.tab === 'pending' ? 0 : 1, (i) => {
      const t = i === 0 ? 'pending' : 'history';
      if (t === this.tab) return;
      this.tab = t;
      this.scene.restart();
    });
    if (this.tab === 'pending') button(this, 360, 1076, 420, 76, '모두 받기', () => this.claimAll(), { kind: 'cta', size: TYPE.heading, icon: 'ui-mailbox' });
    this.input.keyboard?.on('keydown-ESC', () => this.onPlatformBack());
    this.render();
  }

  private render(): void {
    this.layer.forEach((o) => o.destroy());
    this.layer = [];
    this.frame.refresh();
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => (this.layer.push(o), o);
    const now = gameNow();
    const p = Progress.load();

    if (this.tab === 'history') {
      const h = p.mailbox.history;
      if (!h.length) add(text(this, 360, 560, '아직 받은 선물이 없어요', TYPE.body, COLOR.textDim, true).setOrigin(0.5));
      add(plate(this, 360, 330 + 7 * 52, 664, 15 * 52 + 20, { r: 22 })).setVisible(h.length > 0);
      h.slice(0, 14).forEach((r, i) => {
        const L = GIFT_LABEL[r.kind];
        const y = 330 + i * 52;
        let x = 50;
        if (r.kind === 'rubies' && this.textures.exists('ui-ruby')) {
          add(this.add.image(x, y, 'ui-ruby').setDisplaySize(30, 30).setOrigin(0, 0.5));
          x += 36;
        }
        add(text(this, x, y, `${tag(r.kind)}${L.name} ${r.amount.toLocaleString()}${L.unit}`, TYPE.caption, COLOR.text, true, true).setOrigin(0, 0.5));
        add(text(this, 670, y, `${r.title} · ${fmtDate(r.claimedAt)}`, 17, COLOR.textSub, true).setOrigin(1, 0.5));
      });
      if (h.length > 14) add(text(this, 360, 1060, `최근 ${Math.min(h.length, 50)}건까지 보관`, 16, COLOR.textDim, true).setOrigin(0.5));
      return;
    }

    const list = pendingGifts(p.mailbox, now);
    const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    this.page = Math.min(this.page, pages - 1);
    if (!list.length) {
      add(text(this, 360, 600, '받을 선물이 없어요', TYPE.caption, COLOR.textDim, true).setOrigin(0.5).setAlign('center').setLineSpacing(10));
    }
    const st = staminaNow(p, now);
    list.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE).forEach((g, i) => {
      const y = TOP + 50 + i * ROW_H;
      const L = GIFT_LABEL[g.kind];
      const over = g.kind === 'stamina' && st.value + g.amount > STAMINA.hold;
      const row = add(plate(this, 360, y, 664, ROW_H - 10, { r: 20, gold: g.sender === 'operator' }));
      const icon = g.kind === 'stamina' ? 'ui-energy' : g.kind === 'rubies' ? 'ui-ruby' : g.kind === 'gold' ? 'ui-gold' : g.kind === 'tickets' ? 'ui-ticket' : '';
      if (icon && this.textures.exists(icon)) row.add(this.add.image(-282, 0, icon).setDisplaySize(64, 64));
      else row.add(text(this, -282, 0, L.icon, 34).setOrigin(0.5));
      const amt = text(this, -238, -24, `${g.amount.toLocaleString()}${L.unit}`, TYPE.body, COLOR.text, true, true).setOrigin(0, 0.5);
      row.add(amt);
      row.add(text(this, -238 + amt.width + 12, -24, clip(g.title, 16), 18, COLOR.gold, true, true).setOrigin(0, 0.5));
      row.add(text(this, -238, 6, g.body ? clip(g.body, 26) : g.source, 16, COLOR.textSub, true).setOrigin(0, 0.5));
      row.add(text(this, -238, 30, over ? `행동력은 ${STAMINA.hold}을 초과할 수 없어요 — 사용 후 받을 수 있어요` : expiryText(g, now), 14, over ? COLOR.danger : COLOR.textDim, true).setOrigin(0, 0.5));
      const b = button(this, 600, y - 4, 112, 62, '받기', () => this.claimOne(g.id), { kind: 'growth', size: TYPE.caption });
      add(b.root);
      b.setEnabled(!over);
    });
    if (pages > 1) {
      const prev = button(this, 230, 1000, 90, 50, '◀', () => (this.page--, this.render()), { kind: 'secondary', size: TYPE.caption });
      const next = button(this, 490, 1000, 90, 50, '▶', () => (this.page++, this.render()), { kind: 'secondary', size: TYPE.caption });
      prev.setEnabled(this.page > 0);
      next.setEnabled(this.page < pages - 1);
      add(prev.root);
      add(next.root);
      add(text(this, 360, 1000, `${this.page + 1} / ${pages}`, TYPE.caption, COLOR.textSub, true).setOrigin(0.5));
    }
  }

  private claimOne(id: string): void {
    const r = Progress.claimGift(id, gameNow());
    if (!r.ok) {
      toast(this, CLAIM_FAIL_TEXT[r.reason as ClaimFail], COLOR.danger);
      this.cameras.main.shake(100, 0.002);
    } else {
      const L = GIFT_LABEL[r.gift.kind];
      toast(this, `${tag(r.gift.kind)}${L.name} ${r.gift.amount.toLocaleString()}${L.unit} 받았어요`, COLOR.ok);
    }
    this.render();
    if (r.ok) this.mailPop();
  }

  private claimAll(): void {
    if (this.popup) return;
    const r = Progress.claimAllGifts(gameNow());
    if (!r.claimed.length && !r.kept.length) {
      toast(this, '받을 선물이 없어요', COLOR.textSub);
      return;
    }
    // 종류별 합계
    const sum = new Map<GiftKind, number>();
    for (const g of r.claimed) sum.set(g.kind, (sum.get(g.kind) ?? 0) + g.amount);
    const lines = GIFT_KINDS.filter((k) => sum.has(k)).map((k) => `${tag(k)}${GIFT_LABEL[k].name} +${sum.get(k)!.toLocaleString()}${GIFT_LABEL[k].unit}`);
    const keptLines = r.kept.map((k) => `${tag(k.gift.kind)}${k.gift.amount}${GIFT_LABEL[k.gift.kind].unit} — ${CLAIM_FAIL_TEXT[k.reason]}`);
    this.render();
    this.showSummary(r.claimed.length, lines, keptLines);
    if (r.claimed.length) this.mailPop();
  }

  /** 받기 연출(2026-11-26 Higgsfield): 봉인이 깨진 봉투에서 빛나는 편지가 떠오르는 그림이 톡 튀어 올랐다 사라짐 */
  private mailPop(): void {
    if (!this.textures.exists('mail-open')) return;
    const im = this.add.image(360, 560, 'mail-open').setDepth(1000).setDisplaySize(240, 240).setAlpha(0);
    const s0 = im.scale;
    im.setScale(s0 * 0.4);
    this.tweens.add({ targets: im, scale: s0, alpha: 1, y: 520, duration: 260, ease: 'Back.Out' });
    this.tweens.add({ targets: im, alpha: 0, y: 470, delay: 750, duration: 350, onComplete: () => im.destroy() });
  }

  private showSummary(n: number, lines: string[], kept: string[]): void {
    const m = modal(this, 600, 600, n ? `${n}개 받았어요` : '받을 수 있는 선물이 없어요', { ribbonColor: COLOR.violet });
    m.body(text(this, 0, -200, lines.join('\n') || '-', TYPE.body, COLOR.text, true, true).setOrigin(0.5, 0).setAlign('center').setLineSpacing(10));
    if (kept.length) {
      m.body(text(this, 0, 20, `남겨 둔 선물 ${kept.length}개\n${kept.slice(0, 4).join('\n')}${kept.length > 4 ? '\n…' : ''}`, 18, COLOR.danger, true).setOrigin(0.5, 0).setAlign('center').setLineSpacing(6));
    }
    m.body(button(this, 0, 220, 240, 76, '확인', () => this.closePopup(), { kind: 'growth', size: TYPE.body }).root);
    this.popup = m;
  }

  private closePopup(): void {
    this.popup?.close();
    this.popup = null;
  }
}

function expiryText(g: Gift, now: number): string {
  if (g.expiresAt === null) return '기한 없음';
  const left = g.expiresAt - now;
  return `${fmtDate(g.expiresAt)}까지 · ${left >= DAY ? `${Math.floor(left / DAY)}일 남음` : `${formatLeft(left)} 남음`}`;
}

function fmtDate(ms: number): string {
  // 한국 시간 기준 월/일 시:분
  const d = new Date(ms + 9 * 3_600_000);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
