import Phaser from 'phaser';
import { makeTextures } from '../textures';
import { DRAGONS } from '../data/dragons';
import { WINTER_2026 as EV, WINTER_DRAGON, type RouletteReward } from '../data/events';
import { ESSENCE, econRarity } from '../data/economy';
import { attendanceActive, attendanceDate, attendanceDay, attendanceDays, attendanceReward, attendedToday, eventActive, eventState, Progress, spinsAvailable, type SpinResult } from '../systems/Progress';
import { FONT, gameNow } from '../ui/widgets';
import { preloadArt } from '../ui/art';
import { button, modal, text, type KitButton } from '../ui/kit';
import { tabs } from '../ui/kit2';
import { screenFrame, type ScreenFrame } from '../ui/screen';
import { COLOR, TYPE } from '../ui/theme';
import { fullH } from '../ui/layout';
import { getLang } from '../i18n';

const KST = 9 * 3600_000;
const fmtKst = (t: number) => {
  const d = new Date(t + KST);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

/**
 * 2026 크리스마스 이벤트 "드래곤의 겨울 축제"(기획 v1.3): 행운 룰렛(정상 종료 5판마다 1회, 누적 보상) + 7일 반복 출석.
 * 확률·보상 표는 `src/data/events.ts`를 그대로 읽어 보여 준다(설정과 화면이 어긋나지 않게).
 * 8단계 v2.0 C: 공통 머리줄·리본(겨울 파랑)·하단 탭, 시안 형식 탭·버튼. 눈송이 배경은 유지.
 */
export class EventScene extends Phaser.Scene {
  private tab: 'roulette' | 'attend' = 'roulette';
  private layer: Phaser.GameObjects.GameObject[] = [];
  private last: SpinResult | null = null;
  private busy = false;
  private frame!: ScreenFrame;

  constructor() {
    super('event');
  }

  onPlatformBack(): boolean {
    this.scene.start('lobby');
    return true;
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    if (!this.textures.exists('dragon-red')) makeTextures(this);
    this.layer = [];
    this.tab = 'roulette'; // 이벤트를 누르면 늘 행운 룰렛부터(제작자 2026-11-25), 출석은 옆 탭
    this.last = null;
    this.busy = false;
    this.frame = screenFrame(this, { title: '겨울 축제', nav: '', ribbonColor: 0x3b82c4, banner: getLang() === 'en' ? 'event-winter-en' : 'event-winter' }); // 배너 그림에 글자가 박혀 있어 영어판 따로
    this.add.rectangle(360, 640, 720, fullH(this), 0x0e2a4a, 0.45); // 겨울 빛(공통 배경 위에 푸른 막)
    // 눈송이 배경
    for (let i = 0; i < 40; i++) {
      const s = this.add.circle(Phaser.Math.Between(0, 720), Phaser.Math.Between(0, 1280), Phaser.Math.Between(2, 5), 0xffffff, 0.35);
      this.tweens.add({ targets: s, y: s.y + 1280, duration: Phaser.Math.Between(9000, 16000), repeat: -1, onRepeat: () => s.setY(-10) });
    }
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('lobby'));
    this.refresh();
  }

  private keep(b: KitButton): KitButton {
    this.layer.push(b.root);
    return b;
  }

  private A<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.layer.push(o);
    return o;
  }

  /**
   * 루비 금액 한 줄: [앞 글자] + 빨간 루비 그림(ui-ruby) + 금액 + [뒤 글자], 가운데 맞춤.
   * (2026-11-23 제작자 요청) 루비는 파란 보석 이모지가 아니라 게임의 빨간 루비 그림으로.
   */
  private rubyRow(cx: number, y: number, amount: number | string, size: number, color: string, before = '', after = ''): void {
    const style = { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color };
    const parts: (Phaser.GameObjects.Text | Phaser.GameObjects.Image)[] = [];
    const widths: number[] = [];
    const gap = Math.round(size * 0.2);
    const hasArt = this.textures.exists('ui-ruby');
    const push = (o: Phaser.GameObjects.Text | Phaser.GameObjects.Image, w: number) => {
      this.A(o);
      parts.push(o);
      widths.push(w);
    };
    if (before) {
      const t = this.add.text(0, y, before, style).setOrigin(0, 0.5);
      push(t, t.width);
    }
    if (hasArt) {
      const d = Math.round(size * 1.25);
      push(this.add.image(0, y, 'ui-ruby').setDisplaySize(d, d).setOrigin(0, 0.5), d);
    }
    const t = this.add.text(0, y, `${hasArt ? '' : '루비 '}${typeof amount === 'number' ? amount.toLocaleString() : amount}${after}`, style).setOrigin(0, 0.5);
    push(t, t.width);
    const total = widths.reduce((a, w) => a + w, 0) + gap * (widths.length - 1);
    let x = cx - total / 2;
    parts.forEach((o, i) => {
      o.x = x;
      x += widths[i] + gap;
    });
  }

  private refresh(): void {
    this.layer.forEach((o) => o.destroy());
    this.layer = [];
    const now = gameNow();
    const p = Progress.load();
    const active = eventActive(now);
    const start = Date.parse(EV.startKst);
    const end = Date.parse(EV.endKst);
    const period = `${fmtKst(start)} ~ ${fmtKst(end - 60_000)}`;
    this.frame.refresh();
    this.A(text(this, 360, 1106, `❄ ${EV.name} · ${period}`, 15, 0xbbdefb, true, true).setOrigin(0.5));
    if (!active) {
      const msg = now < start ? `${fmtKst(start)}에 시작합니다` : '이벤트가 끝났습니다. 받은 보상은 그대로 남아 있어요.';
      this.A(this.add.text(360, 560, msg, { fontFamily: FONT, fontSize: '30px', color: '#e3f2fd', align: 'center', wordWrap: { width: 620 } }).setOrigin(0.5));
      this.A(this.add.text(360, 640, '행운 룰렛(12월 한 달): 전투 5판마다 1회\n크리스마스 출석(12/18~12/31): 매일 루비 100~700', { fontFamily: FONT, fontSize: '22px', color: '#90caf9', align: 'center', lineSpacing: 8 }).setOrigin(0.5, 0));
      return;
    }
    const keys: ('roulette' | 'attend')[] = ['roulette', 'attend'];
    this.A(tabs(this, 262, ['행운 룰렛', '크리스마스 출석'], keys.indexOf(this.tab), (i) => {
      if (keys[i] === this.tab) return;
      this.tab = keys[i];
      this.refresh();
    }));
    if (this.tab === 'roulette') this.drawRoulette(p, now);
    else this.drawAttend(p, now);
  }

  private drawRoulette(p: ReturnType<typeof Progress.load>, now: number): void {
    const st = eventState(p);
    const avail = Math.max(0, spinsAvailable(st));
    const toNext = EV.battlesPerSpin - (st.battles % EV.battlesPerSpin);
    // (2026-11-23 제작자 요청) 긴 설명은 빼고 꼭 필요한 숫자만. 규칙·확률은 "확률" 버튼 창에서
    this.A(this.add.text(300, 314, `남은 룰렛 ${avail}회 · 다음까지 ${toNext}판`, { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5));
    this.keep(button(this, 628, 314, 120, 52, '확률', () => this.openOdds(), { kind: 'secondary', size: TYPE.caption }));

    // 룰렛 판(칸 크기 = 확률) + 오른쪽 범례(무엇이 나오는지만, 확률 숫자는 "확률" 창)
    // 칸 색: 루비는 금액이 클수록 진한 빨강, 워터 조각은 물빛, 워터 정수는 금색
    const cx = 236;
    const cy = 536;
    const R = 148;
    const g = this.A(this.add.graphics());
    const total = EV.roulette.reduce((a, r) => a + r.weight, 0);
    const dragonShort = DRAGONS[WINTER_DRAGON].short;
    let a0 = -Math.PI / 2;
    EV.roulette.forEach((r) => {
      const a1 = a0 + (r.weight / total) * Math.PI * 2;
      g.fillStyle(this.colorOf(r), 0.95).slice(cx, cy, R, a0, a1, false).fillPath();
      g.lineStyle(2, 0x0e1a2a).slice(cx, cy, R, a0, a1, false).strokePath();
      const am = (a0 + a1) / 2;
      if (r.rubies) {
        this.A(this.add.text(cx + Math.cos(am) * R * 0.7, cy + Math.sin(am) * R * 0.7, `${r.rubies}`, { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: r.rubies >= 40 ? '#ffffff' : '#4a0d0d' }).setOrigin(0.5));
      } else if (r.fragments && this.textures.exists('ui-fragment')) {
        this.A(this.add.image(cx + Math.cos(am) * R * 0.78, cy + Math.sin(am) * R * 0.78, 'ui-fragment').setDisplaySize(26, 26));
      }
      a0 = a1;
    });
    this.A(this.add.triangle(cx, cy - R - 6, -14, -18, 14, -18, 0, 6, 0xffffff));
    // 가운데: 축제 드래곤(빙하 드래곤) 초상 — 정수 칸의 주인공(2026-11-25 제작자)
    const pk = `portrait-${WINTER_DRAGON}`;
    this.A(this.add.circle(cx, cy, 52, 0x0e1a2a, 1).setStrokeStyle(4, 0xffd54f));
    if (this.textures.exists(pk)) this.A(this.add.image(cx, cy - 2, pk).setDisplaySize(96, 96));
    const groups = this.oddsGroups();
    const rowH = 44;
    groups.forEach(({ r, slots }, i) => {
      const ly = cy - ((groups.length - 1) * rowH) / 2 + i * rowH;
      this.A(this.add.rectangle(420, ly, 22, 22, this.colorOf(r), 0.95).setStrokeStyle(2, 0x0e1a2a));
      const icon = r.rubies ? 'ui-ruby' : r.fragments ? 'ui-fragment' : r.dragonEssence ? `portrait-${WINTER_DRAGON}` : '';
      let tx = 442;
      if (icon && this.textures.exists(icon)) {
        this.A(this.add.image(tx, ly, icon).setDisplaySize(28, 28).setOrigin(0, 0.5));
        tx += 34;
      }
      const name = r.rubies ? `${r.rubies}` : r.fragments ? `${dragonShort} 조각 ${r.fragments}${slots > 1 ? ` ×${slots}` : ''}` : `${dragonShort} 드래곤 정수`;
      this.A(this.add.text(tx, ly, name, { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color: r.dragonEssence ? '#ffd54f' : r.fragments ? '#81d4fa' : '#ffffff' }).setOrigin(0, 0.5));
    });
    const spin = this.keep(button(this, 360, 748, 360, 76, avail > 0 ? '룰렛 돌리기' : '기회 없음', () => this.spin(), { kind: 'cta', size: TYPE.heading }));
    spin.setEnabled(avail > 0 && !this.busy);

    if (this.last) {
      const r = this.last;
      const dname = (id: keyof typeof DRAGONS) => DRAGONS[id].name;
      const lines = [
        r.essence
          ? r.essence.isNew
            ? `${dname(r.essence.dragonId)} 해금!`
            : `${dname(r.essence.dragonId)} 정수 → 조각 +${r.essence.fragments}`
          : r.fragments
            ? `${DRAGONS[r.fragments.dragonId].short} 조각 +${r.fragments.count}`
            : r.reward.label,
      ];
      if (r.milestone) lines.push(`누적 ${r.milestone.spins}회 보상 도착!`);
      this.A(this.add.text(360, 800, lines.join('  ·  '), { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffe082', align: 'center' }).setOrigin(0.5));
    }

    this.snowGauge(st.spinsUsed, st.milestones);
    void now;
  }

  /** 칸 색: 루비는 금액이 클수록 진한 빨강, 워터 조각은 물빛, 워터 정수는 금색 */
  private colorOf(r: RouletteReward): number {
    const RUBY: Record<number, number> = { 10: 0xffcdd2, 20: 0xf6a3a3, 30: 0xee7b7b, 40: 0xe15757, 50: 0xc93838 };
    return r.dragonEssence ? 0xffd54f : r.fragments ? 0x4fc3f7 : RUBY[r.rubies ?? 10] ?? 0xef9a9a;
  }

  /** 같은 보상은 한 줄로(조각 칸 4개 → ×4) */
  private oddsGroups(): { r: RouletteReward; weight: number; slots: number }[] {
    const groups: { r: RouletteReward; weight: number; slots: number }[] = [];
    for (const r of EV.roulette) {
      const same = groups.find((x) => x.r.label === r.label);
      if (same) {
        same.weight += r.weight;
        same.slots++;
      } else groups.push({ r, weight: r.weight, slots: 1 });
    }
    // 보이는 순서: 루비(적은 것부터) → 조각 → 정수
    const rank = (r: RouletteReward) => (r.dragonEssence ? 2000 : r.fragments ? 1000 : (r.rubies ?? 0));
    return groups.sort((a, b) => rank(a.r) - rank(b.r));
  }

  /**
   * 누적 보상 눈 게이지(2026-11-23 제작자 요청: 네모 4칸 대신 겨울 장식 게이지).
   * 얼음 막대(돌린 횟수만큼 차오름) + 위에 쌓인 눈 + 아래 고드름, 구간(5·10·20·30회)마다 눈송이 매듭.
   * 보상은 도달하면 자동 지급(기존 규칙 그대로) — 받은 매듭은 금색 + ✔.
   */
  private snowGauge(spins: number, claimed: number[]): void {
    const y = 940;
    const x0 = 78;
    const x1 = 642;
    const max = EV.milestones[EV.milestones.length - 1].spins;
    const xAt = (n: number) => x0 + ((x1 - x0) * Math.min(n, max)) / max;
    this.A(this.add.text(360, 852, '❄ 룰렛 누적 보상', { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#e3f2fd' }).setOrigin(0.5));
    const g = this.A(this.add.graphics());
    // 고드름(막대 아래)
    g.fillStyle(0xbfe6ff, 0.85);
    for (let x = x0 + 14; x < x1 - 6; x += 26) {
      const len = 10 + ((x * 7) % 13);
      g.fillTriangle(x - 6, y + 12, x + 6, y + 12, x, y + 12 + len);
    }
    // 얼음 막대 바탕 · 채움
    g.fillStyle(0x0b2440, 1).fillRoundedRect(x0 - 6, y - 14, x1 - x0 + 12, 28, 14);
    g.lineStyle(3, 0xbfe6ff, 0.9).strokeRoundedRect(x0 - 6, y - 14, x1 - x0 + 12, 28, 14);
    const fx = xAt(spins);
    if (spins > 0) {
      g.fillStyle(0x4fc3f7, 1).fillRoundedRect(x0 - 3, y - 11, Math.max(22, fx - x0 + 6), 22, 11);
      g.fillStyle(0xffffff, 0.35).fillRoundedRect(x0 + 2, y - 9, Math.max(12, fx - x0 - 4), 7, 4); // 얼음 광택
    }
    // 막대 위에 쌓인 눈
    g.fillStyle(0xffffff, 0.95);
    for (let x = x0 - 2; x <= x1 + 2; x += 18) g.fillEllipse(x, y - 14, 24 + ((x * 3) % 10), 10);
    // 구간 매듭: 눈송이 + 위에 보상, 아래에 횟수
    EV.milestones.forEach((m) => {
      const x = xAt(m.spins);
      const got = claimed.includes(m.spins);
      const reached = spins >= m.spins;
      this.snowflake(x, y, got ? 0xffd54f : reached ? 0xffffff : 0x90a4ae, got || reached ? 1 : 0.85);
      if (got) this.A(this.add.text(x, y + 1, '✔', { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#3e2723' }).setOrigin(0.5));
      this.rubyRow(x, y - 48, m.rubies, 18, got ? '#ffd54f' : '#ffffff');
      if (m.essence) this.A(this.add.text(x, y - 72, '+ 영웅 정수', { fontFamily: FONT, fontSize: '15px', fontStyle: 'bold', color: '#e1bee7' }).setOrigin(0.5));
      this.A(this.add.text(x, y + 50, `${m.spins}회`, { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: reached ? '#ffffff' : '#90a4ae' }).setOrigin(0.5));
    });
    this.A(this.add.text(360, y + 84, `${Math.min(spins, max)} / ${max}회`, { fontFamily: FONT, fontSize: '17px', color: '#bbdefb' }).setOrigin(0.5));
  }

  /** 눈송이 매듭(원 + 여섯 갈래 가지) */
  private snowflake(x: number, y: number, color: number, alpha: number): void {
    const g = this.A(this.add.graphics());
    g.fillStyle(0x0b2440, 1).fillCircle(x, y, 26);
    g.lineStyle(3, color, alpha).strokeCircle(x, y, 26);
    g.lineStyle(3, color, alpha);
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 3) * k - Math.PI / 2;
      const ex = x + Math.cos(a) * 19;
      const ey = y + Math.sin(a) * 19;
      g.lineBetween(x, y, ex, ey);
      const bx = x + Math.cos(a) * 12;
      const by = y + Math.sin(a) * 12;
      g.lineBetween(bx, by, bx + Math.cos(a + 0.7) * 6, by + Math.sin(a + 0.7) * 6);
      g.lineBetween(bx, by, bx + Math.cos(a - 0.7) * 6, by + Math.sin(a - 0.7) * 6);
    }
    g.fillStyle(color, alpha).fillCircle(x, y, 4);
  }

  /** 확률·규칙 창(긴 설명은 여기로만) */
  private openOdds(): void {
    const m = modal(this, 620, 660, '룰렛 확률', { closeOnBackdrop: true, ribbonColor: 0x3b82c4 });
    const total = EV.roulette.reduce((a, r) => a + r.weight, 0);
    const pct = (w: number) => `${((w / total) * 100).toFixed(0)}%`;
    const groups = this.oddsGroups();
    groups.forEach(({ r, weight, slots }, i) => {
      const y = -210 + i * 50;
      const gg = this.add.graphics();
      gg.fillStyle(i % 2 ? 0x1b2a40 : 0x22334d, 1).fillRoundedRect(-270, y - 22, 540, 44, 10);
      m.body(gg);
      m.body(this.add.rectangle(-246, y, 20, 20, this.colorOf(r), 1).setStrokeStyle(2, 0x0e1a2a));
      const name = r.fragments && slots > 1 ? `${r.label} (${pct(r.weight)} × ${slots}칸)` : r.label;
      m.body(text(this, -222, y, name, 19, COLOR.text, true, true).setOrigin(0, 0.5));
      m.body(text(this, 254, y, pct(weight), 20, COLOR.gold, true, true).setOrigin(1, 0.5));
    });
    const dupFrag = ESSENCE.essenceToFragments[econRarity(DRAGONS[WINTER_DRAGON].rarity)];
    const notes = [
      `${DRAGONS[WINTER_DRAGON].name} 정수: 없으면 해금, 있으면 조각 ${dupFrag}개`,
      `전투 ${EV.battlesPerSpin}판마다 룰렛 1회 (${EV.minBattleMs / 1000}초 이상, 포기 제외)`,
      '누적 보상은 도달하면 자동 지급 · 소환 천장과 별개',
    ];
    m.body(text(this, 0, -210 + groups.length * 50 + 14, notes.join('\n'), 16, COLOR.textSub, true).setOrigin(0.5, 0).setAlign('center').setLineSpacing(8));
    m.body(button(this, 0, 262, 220, 64, '닫기', () => m.close(), { kind: 'secondary', size: TYPE.caption }).root);
  }

  private spin(): void {
    if (this.busy) return;
    const r = Progress.spin(gameNow());
    if (!r.ok) return;
    this.busy = true;
    this.last = r;
    this.cameras.main.flash(250, 255, 240, 200);
    this.time.delayedCall(350, () => {
      this.busy = false;
      this.refresh();
    });
    this.refresh();
  }

  private drawAttend(p: ReturnType<typeof Progress.load>, now: number): void {
    const st = eventState(p);
    const n = st.attendance.length;
    const done = attendedToday(p, now);
    // 출석은 12/18(금)~12/31(목) 2주만(제작자 2026-11-25). 그 전엔 시작일 안내만
    if (!attendanceActive(now)) {
      const aStart = Date.parse(EV.attendanceStartKst);
      this.A(this.add.text(360, 520, now < aStart ? `크리스마스 출석은\n${fmtKst(aStart).split(' ')[0]}(금)부터 시작해요` : '크리스마스 출석이 끝났어요', { fontFamily: FONT, fontSize: '30px', color: '#e3f2fd', align: 'center', lineSpacing: 10 }).setOrigin(0.5));
      this.A(this.add.text(360, 640, '12/18(금) ~ 12/31(목) 14일 · 매일 루비 100~700\n그날 출석해야 그날 보상(지난 날은 못 받음)', { fontFamily: FONT, fontSize: '20px', color: '#90caf9', align: 'center' }).setOrigin(0.5));
      return;
    }
    // 2주 달력(제작자 2026-11-25): 12/18 = 1일차 … 12/31 = 14일차. 그날 들어와야 그날 보상 — 지난 날은 "놓침"(나중에 못 받음)
    const todayN = attendanceDay(now);
    const days = attendanceDays();
    this.A(this.add.text(360, 316, `출석 ${n}/${days}일 · 오늘 ${todayN}일차`, { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5));
    for (let day = 1; day <= days; day++) {
      const i = day - 1;
      const x = 66 + (i % 7) * 98;
      const y = i < 7 ? 440 : 600;
      const got = st.attendance.includes(attendanceDate(day));
      const today = day === todayN;
      const missed = day < todayN && !got;
      this.A(this.add.rectangle(x, y, 90, 142, got ? 0x1b5e20 : today ? 0x0d47a1 : missed ? 0x2a2a2a : 0x1f2a3a).setStrokeStyle(today ? 5 : 2, today ? 0xffe082 : 0x37474f).setAlpha(missed ? 0.6 : 1));
      this.A(this.add.text(x, y - 46, `${day}일차`, { fontFamily: FONT, fontSize: '16px', color: '#ffffff' }).setOrigin(0.5));
      this.A(this.add.text(x, y - 24, attendanceDate(day).slice(5).replace('-', '/'), { fontFamily: FONT, fontSize: '13px', color: '#90caf9' }).setOrigin(0.5));
      this.rubyRow(x, y + 8, attendanceReward(day), 18, missed ? '#9e9e9e' : '#ffffff');
      this.A(this.add.text(x, y + 46, got ? '받음 ✔' : today ? '오늘' : missed ? '놓침' : '', { fontFamily: FONT, fontSize: '15px', color: missed ? '#9e9e9e' : '#ffe082' }).setOrigin(0.5));
    }
    this.A(this.add.text(360, 712, '그날 출석해야 그날 보상을 받아요 · 지난 날 보상은 받을 수 없어요', { fontFamily: FONT, fontSize: '17px', color: '#90caf9', align: 'center' }).setOrigin(0.5));
    const b = this.keep(button(this, 360, 830, 440, 90, done ? '오늘 출석 완료' : `출석하고 ${attendanceReward(todayN)} 받기`, () => {
      const r = Progress.attend(gameNow());
      if (r.ok) this.cameras.main.flash(250, 200, 255, 200);
      this.refresh();
    }, { kind: 'growth', size: TYPE.body, icon: done ? undefined : 'ui-ruby' }));
    b.setEnabled(!done);
  }
}
