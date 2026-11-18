import Phaser from 'phaser';
import { Progress } from '../systems/Progress';
import { CLAIM_FAIL_TEXT, GIFT_LABEL, GIFT_KINDS, pendingGifts, staminaNow, type ClaimFail, type Gift, type GiftKind } from '../systems/Mailbox';
import { STAMINA, formatLeft, nextRegenIn } from '../systems/Stamina';
import { devMode, FONT, gameNow, makeButton } from '../ui/widgets';

const PER_PAGE = 6;
const ROW_H = 120;
const TOP = 250;
const DAY = 86_400_000;

/**
 * 선물함(8단계 v1.0 4장): 받을 선물 목록(오래된 순) · 개별 받기 · 모두 받기(받은 것/남긴 것 요약) · 받은 내역.
 * 규칙은 모두 src/systems/Mailbox.ts(순수 함수) — 이 화면은 결과를 보여 주기만 한다.
 */
export class GiftScene extends Phaser.Scene {
  private tab: 'pending' | 'history' = 'pending';
  private page = 0;
  private layer: Phaser.GameObjects.GameObject[] = [];
  private popup: Phaser.GameObjects.GameObject[] = [];
  private msg!: Phaser.GameObjects.Text;
  private wallet!: Phaser.GameObjects.Text;

  constructor() {
    super('gifts');
  }

  onPlatformBack(): boolean {
    if (this.popup.length) this.closePopup();
    else this.scene.start('lobby');
    return true;
  }

  create(): void {
    this.layer = [];
    this.popup = [];
    this.page = 0;
    Progress.syncMail(gameNow(), devMode());
    this.add.rectangle(360, 640, 720, 1280, 0x14181f);
    this.add.text(30, 22, '🎁 선물함', { fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#ffd34d' });
    this.wallet = this.add.text(30, 84, '', { fontFamily: FONT, fontSize: '21px', color: '#c9d3ee', lineSpacing: 6 });
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.refreshWallet() });

    const tabBtn = (x: number, label: string, t: 'pending' | 'history') =>
      makeButton(this, x, 190, 320, 64, label, this.tab === t ? 0xb35a00 : 0x2a3140, () => {
        this.tab = t;
        this.scene.restart();
      }, 24);
    tabBtn(195, '받을 선물', 'pending');
    tabBtn(525, '받은 내역', 'history');

    this.msg = this.add.text(360, 1040, '', { fontFamily: FONT, fontSize: '22px', color: '#ff8a80', align: 'center' }).setOrigin(0.5);
    makeButton(this, 205, 1220, 290, 80, '로비로', 0x3a4458, () => this.scene.start('lobby'), 30);
    if (this.tab === 'pending') {
      makeButton(this, 515, 1220, 290, 80, '모두 받기', 0x2e8b57, () => this.claimAll(), 30);
    }
    this.input.keyboard?.on('keydown-ESC', () => this.onPlatformBack());
    this.render();
  }

  private refreshWallet(): void {
    const now = gameNow();
    const p = Progress.load();
    const st = staminaNow(p, now);
    const next = nextRegenIn(st, now);
    this.wallet.setText(
      `⚡ 행동력 ${st.value}/${STAMINA.max}${next === null ? '' : ` (+1까지 ${formatLeft(next)})`}\n` +
        `💎 ${p.rubies.toLocaleString()} · 🪙 ${p.gold.toLocaleString()}G · 🎟 ${p.summon.legacyTickets} · 🧩 ${p.universalFragments}`,
    );
  }

  private render(): void {
    this.layer.forEach((o) => o.destroy());
    this.layer = [];
    this.refreshWallet();
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => (this.layer.push(o), o);
    const now = gameNow();
    const p = Progress.load();

    if (this.tab === 'history') {
      const h = p.mailbox.history;
      if (!h.length) add(this.add.text(360, 500, '아직 받은 선물이 없어요', { fontFamily: FONT, fontSize: '26px', color: '#8a93a6' }).setOrigin(0.5));
      h.slice(0, 14).forEach((r, i) => {
        const L = GIFT_LABEL[r.kind];
        add(this.add.text(40, TOP + 10 + i * 54, `${L.icon} ${L.name} ${r.amount.toLocaleString()}${L.unit}`, { fontFamily: FONT, fontSize: '23px', color: '#ffffff' }));
        add(this.add.text(680, TOP + 10 + i * 54, `${r.title} · ${fmtDate(r.claimedAt)}`, { fontFamily: FONT, fontSize: '19px', color: '#9aa6bd' }).setOrigin(1, 0));
      });
      if (h.length > 14) add(this.add.text(360, 1010, `최근 ${Math.min(h.length, 50)}건까지 보관`, { fontFamily: FONT, fontSize: '18px', color: '#6f7a8c' }).setOrigin(0.5));
      return;
    }

    const list = pendingGifts(p.mailbox, now);
    const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
    this.page = Math.min(this.page, pages - 1);
    if (!list.length) {
      add(this.add.text(360, 520, '받을 선물이 없어요\n스테이지를 처음 클리어하면 행동력 20이 도착해요', {
        fontFamily: FONT, fontSize: '25px', color: '#8a93a6', align: 'center', lineSpacing: 10,
      }).setOrigin(0.5));
    }
    const st = staminaNow(p, now);
    list.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE).forEach((g, i) => {
      const y = TOP + 60 + i * ROW_H;
      const L = GIFT_LABEL[g.kind];
      const over = g.kind === 'stamina' && st.value + g.amount > STAMINA.max;
      add(this.add.rectangle(360, y, 660, ROW_H - 12, 0x1f2633).setStrokeStyle(2, g.sender === 'operator' ? 0xffd34d : 0x4fc3f7, 0.6));
      add(this.add.text(50, y - 44, `${L.icon} ${g.amount.toLocaleString()}${L.unit}`, { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#ffffff' }));
      add(this.add.text(50, y - 2, `${g.title} · ${g.source}`, { fontFamily: FONT, fontSize: '19px', color: '#c9d3ee' }));
      add(this.add.text(50, y + 24, over ? `행동력 ${st.value} + ${g.amount} > ${STAMINA.max} — 사용 후 받을 수 있어요` : expiryText(g, now), {
        fontFamily: FONT, fontSize: '17px', color: over ? '#ff8a80' : '#8a93a6',
      }));
      const b = makeButton(this, 610, y - 6, 120, 70, '받기', 0x2e8b57, () => this.claimOne(g.id), 26);
      add(b.bg);
      add(b.label);
      b.setEnabled(!over);
    });
    if (pages > 1) {
      const prev = makeButton(this, 220, 985, 90, 56, '◀', 0x3a4458, () => (this.page--, this.render()), 24);
      const next = makeButton(this, 500, 985, 90, 56, '▶', 0x3a4458, () => (this.page++, this.render()), 24);
      prev.setEnabled(this.page > 0);
      next.setEnabled(this.page < pages - 1);
      [prev.bg, prev.label, next.bg, next.label].forEach(add);
      add(this.add.text(360, 985, `${this.page + 1} / ${pages}`, { fontFamily: FONT, fontSize: '22px', color: '#c9d3ee' }).setOrigin(0.5));
    }
  }

  private claimOne(id: string): void {
    const r = Progress.claimGift(id, gameNow());
    if (!r.ok) {
      this.msg.setColor('#ff8a80').setText(CLAIM_FAIL_TEXT[r.reason as ClaimFail]);
      this.cameras.main.shake(100, 0.002);
    } else {
      const L = GIFT_LABEL[r.gift.kind];
      this.msg.setColor('#a5f3a5').setText(`${L.icon} ${L.name} ${r.gift.amount.toLocaleString()}${L.unit} 받았어요`);
    }
    this.render();
  }

  private claimAll(): void {
    if (this.popup.length) return;
    const r = Progress.claimAllGifts(gameNow());
    if (!r.claimed.length && !r.kept.length) {
      this.msg.setColor('#8a93a6').setText('받을 선물이 없어요');
      return;
    }
    // 종류별 합계
    const sum = new Map<GiftKind, number>();
    for (const g of r.claimed) sum.set(g.kind, (sum.get(g.kind) ?? 0) + g.amount);
    const lines = GIFT_KINDS.filter((k) => sum.has(k)).map((k) => `${GIFT_LABEL[k].icon} ${GIFT_LABEL[k].name} +${sum.get(k)!.toLocaleString()}${GIFT_LABEL[k].unit}`);
    const keptLines = r.kept.map((k) => `${GIFT_LABEL[k.gift.kind].icon} ${k.gift.amount}${GIFT_LABEL[k.gift.kind].unit} — ${k.reason === 'wouldExceed' ? `받으면 최대 ${STAMINA.max}를 넘어요` : CLAIM_FAIL_TEXT[k.reason]}`);
    this.render();
    this.showSummary(r.claimed.length, lines, keptLines);
  }

  private showSummary(n: number, lines: string[], kept: string[]): void {
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => (this.popup.push(o), o);
    add(this.add.rectangle(360, 640, 720, 1280, 0x000000, 0.7).setInteractive().setDepth(500));
    add(this.add.rectangle(360, 620, 620, 620, 0x1e2430).setStrokeStyle(4, 0xffd34d, 0.8).setDepth(501));
    add(this.add.text(360, 360, n ? `${n}개 받았어요` : '받을 수 있는 선물이 없어요', { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#ffd34d' }).setOrigin(0.5).setDepth(502));
    add(this.add.text(360, 420, lines.join('\n') || '-', { fontFamily: FONT, fontSize: '26px', color: '#ffffff', align: 'center', lineSpacing: 10 }).setOrigin(0.5, 0).setDepth(502));
    if (kept.length) {
      add(this.add.text(360, 640, `남겨 둔 선물 ${kept.length}개\n${kept.slice(0, 4).join('\n')}${kept.length > 4 ? '\n…' : ''}`, {
        fontFamily: FONT, fontSize: '20px', color: '#ff8a80', align: 'center', lineSpacing: 6,
      }).setOrigin(0.5, 0).setDepth(502));
    }
    const ok = makeButton(this, 360, 860, 240, 80, '확인', 0x2e8b57, () => this.closePopup(), 28);
    add(ok.bg.setDepth(501));
    add(ok.label.setDepth(502));
  }

  private closePopup(): void {
    this.popup.forEach((o) => o.destroy());
    this.popup = [];
  }
}

function expiryText(g: Gift, now: number): string {
  if (g.expiresAt === null) return '기한 없음';
  const left = g.expiresAt - now;
  return left >= DAY ? `${Math.floor(left / DAY)}일 남음` : `${formatLeft(left)} 남음`;
}

function fmtDate(ms: number): string {
  // 한국 시간 기준 월/일 시:분
  const d = new Date(ms + 9 * 3_600_000);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}
