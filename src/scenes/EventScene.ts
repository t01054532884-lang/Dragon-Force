import Phaser from 'phaser';
import { makeTextures } from '../textures';
import { DRAGONS } from '../data/dragons';
import { WINTER_2026 as EV } from '../data/events';
import { attendedToday, eventActive, eventState, Progress, spinsAvailable, type SpinResult } from '../systems/Progress';
import { FONT, gameNow } from '../ui/widgets';
import { preloadArt } from '../ui/art';
import { button, text, type KitButton } from '../ui/kit';
import { tabs } from '../ui/kit2';
import { screenFrame, type ScreenFrame } from '../ui/screen';
import { COLOR, TYPE } from '../ui/theme';
import { fullH } from '../ui/layout';

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
    this.last = null;
    this.busy = false;
    this.frame = screenFrame(this, { title: '겨울 축제', nav: '', ribbonColor: 0x3b82c4, banner: 'event-winter' });
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

  private refresh(): void {
    this.layer.forEach((o) => o.destroy());
    this.layer = [];
    const now = gameNow();
    const p = Progress.load();
    const active = eventActive(now);
    const start = Date.parse(EV.startKst);
    const end = Date.parse(EV.endKst);
    const period = `기간 ${fmtKst(start)} ~ ${fmtKst(end - 60_000)} (한국 시간)`;
    this.frame.refresh();
    this.A(text(this, 360, 1106, `❄ ${EV.name} · ${period}`, 15, 0xbbdefb, true, true).setOrigin(0.5));
    if (!active) {
      const msg = now < start ? `${fmtKst(start)}에 시작합니다` : '이벤트가 끝났습니다. 받은 보상은 그대로 남아 있어요.';
      this.A(this.add.text(360, 560, msg, { fontFamily: FONT, fontSize: '30px', color: '#e3f2fd', align: 'center', wordWrap: { width: 620 } }).setOrigin(0.5));
      this.A(this.add.text(360, 640, '행운 룰렛: 전투 5판마다 1회\n크리스마스 출석: 매일 루비 100~700(7일 반복)', { fontFamily: FONT, fontSize: '22px', color: '#90caf9', align: 'center', lineSpacing: 8 }).setOrigin(0.5, 0));
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
    this.A(this.add.text(360, 312, `남은 룰렛 ${avail}회 · 돌린 횟수 ${st.spinsUsed}회 · 다음 기회까지 ${toNext}판`, { fontFamily: FONT, fontSize: '22px', color: '#ffffff' }).setOrigin(0.5));
    this.A(this.add.text(360, 342, `전투 ${EV.minBattleMs / 1000}초 이상 + 클리어·사망·시간 초과로 끝난 판만 셉니다(포기 제외)`, { fontFamily: FONT, fontSize: '16px', color: '#90caf9' }).setOrigin(0.5));

    // 룰렛 판(칸 크기 = 확률)
    const cx = 360;
    const cy = 532;
    const R = 148;
    const g = this.A(this.add.graphics());
    const total = EV.roulette.reduce((a, r) => a + r.weight, 0);
    const colors = [0x42a5f5, 0x26c6da, 0x66bb6a, 0xffca28, 0xffa726, 0xab47bc, 0xef5350];
    let a0 = -Math.PI / 2;
    EV.roulette.forEach((r, i) => {
      const a1 = a0 + (r.weight / total) * Math.PI * 2;
      g.fillStyle(colors[i % colors.length], 0.9).slice(cx, cy, R, a0, a1, false).fillPath();
      g.lineStyle(2, 0x0e1a2a).slice(cx, cy, R, a0, a1, false).strokePath();
      const am = (a0 + a1) / 2;
      this.A(this.add.text(cx + Math.cos(am) * R * 0.66, cy + Math.sin(am) * R * 0.66, r.rubies ? `${r.rubies}` : r.essence === 'rare' ? '희귀' : '영웅', {
        fontFamily: FONT, fontSize: r.weight >= 8 ? '20px' : '14px', color: '#0e1a2a', fontStyle: 'bold',
      }).setOrigin(0.5));
      a0 = a1;
    });
    this.A(this.add.triangle(cx, cy - R - 6, -14, -18, 14, -18, 0, 6, 0xffffff));
    const spin = this.keep(button(this, cx, 738, 360, 76, avail > 0 ? '룰렛 돌리기' : '기회 없음', () => this.spin(), { kind: 'cta', size: TYPE.heading }));
    spin.setEnabled(avail > 0 && !this.busy);

    if (this.last) {
      const r = this.last;
      const lines = [r.essence ? `${r.reward.label}: ${DRAGONS[r.essence.dragonId].short} ${r.essence.isNew ? '해금!' : `(보유 → 조각 +${r.essence.fragments})`}` : `💎 ${r.reward.label}`];
      if (r.milestone) {
        lines.push(`누적 ${r.milestone.spins}회 보상: 💎 ${r.milestone.rubies}${r.milestone.essence ? ` + ${DRAGONS[r.milestone.essence.dragonId].short} 영웅 정수${r.milestone.essence.isNew ? ' 해금!' : ` (조각 +${r.milestone.essence.fragments})`}` : ''}`);
      }
      this.A(this.add.text(360, 784, lines.join('\n'), { fontFamily: FONT, fontSize: '22px', color: '#ffe082', align: 'center', lineSpacing: 6 }).setOrigin(0.5, 0));
    }

    // 누적 보상
    this.A(this.add.text(40, 836, '룰렛 누적 보상(구간마다 1회, 도달하면 자동 지급)', { fontFamily: FONT, fontSize: '19px', color: '#bbdefb' }));
    EV.milestones.forEach((m, i) => {
      const x = 105 + i * 170;
      const got = st.milestones.includes(m.spins);
      this.A(this.add.rectangle(x, 914, 155, 96, got ? 0x1b5e20 : 0x1f2a3a).setStrokeStyle(2, got ? 0x81c784 : 0x37474f));
      this.A(this.add.text(x, 914, `${m.spins}회\n💎 ${m.rubies}${m.essence ? '\n+ 영웅 정수' : ''}\n${got ? '받음 ✔' : `${Math.min(st.spinsUsed, m.spins)}/${m.spins}`}`, {
        fontFamily: FONT, fontSize: '17px', color: '#ffffff', align: 'center', lineSpacing: 2,
      }).setOrigin(0.5));
    });
    // 확률 공개(설정 데이터 그대로)
    const total2 = EV.roulette.reduce((a, r) => a + r.weight, 0);
    this.A(this.add.text(360, 976, `확률: ${EV.roulette.map((r) => `${r.label} ${((r.weight / total2) * 100).toFixed(0)}%`).join(' · ')}\n정수 확정 상자는 그 등급 드래곤 중 하나(균등, 보유 중이면 조각) · 소환 천장 횟수와 별개`, {
      fontFamily: FONT, fontSize: '15px', color: '#90caf9', align: 'center', lineSpacing: 4, wordWrap: { width: 660 },
    }).setOrigin(0.5, 0));
    void now;
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
    const cyclePos = done ? (n - 1) % 7 : n % 7; // 오늘 받을(받은) 칸
    this.A(this.add.text(360, 316, `누적 출석 ${n}일 · 매일 00:00(한국 시간) 갱신 · 빠진 날이 있어도 누적은 이어집니다`, {
      fontFamily: FONT, fontSize: '18px', color: '#bbdefb', align: 'center', wordWrap: { width: 660 },
    }).setOrigin(0.5));
    EV.attendance.forEach((rub, i) => {
      const x = i < 4 ? 120 + i * 160 : 200 + (i - 4) * 160;
      const y = i < 4 ? 440 : 610;
      const passed = i < cyclePos || (i === cyclePos && done);
      const today = i === cyclePos;
      this.A(this.add.rectangle(x, y, 145, 150, passed ? 0x1b5e20 : today ? 0x0d47a1 : 0x1f2a3a).setStrokeStyle(today ? 5 : 2, today ? 0xffe082 : 0x37474f));
      this.A(this.add.text(x, y - 40, `${i + 1}일차`, { fontFamily: FONT, fontSize: '20px', color: '#ffffff' }).setOrigin(0.5));
      this.A(this.add.text(x, y + 4, `💎 ${rub}`, { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#e1bee7' }).setOrigin(0.5));
      this.A(this.add.text(x, y + 44, passed ? '받음 ✔' : today ? '오늘' : '', { fontFamily: FONT, fontSize: '17px', color: '#ffe082' }).setOrigin(0.5));
    });
    const sum = EV.attendance.reduce((a, b) => a + b, 0);
    this.A(this.add.text(360, 724, `7일 합계 💎 ${sum.toLocaleString()} · 7일마다 1일차부터 다시`, { fontFamily: FONT, fontSize: '19px', color: '#90caf9' }).setOrigin(0.5));
    const b = this.keep(button(this, 360, 830, 440, 90, done ? '오늘 출석 완료' : `출석하고 ${EV.attendance[n % 7]} 받기`, () => {
      const r = Progress.attend(gameNow());
      if (r.ok) this.cameras.main.flash(250, 200, 255, 200);
      this.refresh();
    }, { kind: 'growth', size: TYPE.body, icon: done ? undefined : 'ui-ruby' }));
    b.setEnabled(!done);
  }
}
