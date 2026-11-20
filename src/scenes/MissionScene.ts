import Phaser from 'phaser';
import { DRAGON_ORDER, DRAGONS, RARITY_COLOR } from '../data/dragons';
import {
  ACHIEVEMENTS, DIFFICULTIES, DIFFICULTY_RELEASED, DIFFICULTY_LABEL, PROGRESS_REWARDS, PROGRESS_STEPS, STAGE_COUNT, type MissionDef, type RewardBundle,
} from '../data/economy';
import { activeMissions, missionClaimed, missionProgress, progressPct, Progress, type PlayerProgress } from '../systems/Progress';
import { FONT, gameNow } from '../ui/widgets';
import { preloadArt } from '../ui/art';
import { button, text, type KitButton } from '../ui/kit';
import { plate, tabs } from '../ui/kit2';
import { popWord, screenFrame, toast, type ScreenFrame } from '../ui/screen';
import { COLOR, TYPE } from '../ui/theme';

const PERIOD_LABEL = { daily: '일일', weekly: '주간', monthly: '월간', event: '이벤트' } as const;
const bundleText = (b: RewardBundle) =>
  b.gold ? `🪙 ${b.gold.toLocaleString()}G` : b.rubies ? `💎 루비 ${b.rubies.toLocaleString()}` : b.fragments ? `${DRAGONS[b.fragments.dragonId].short} 조각 ${b.fragments.count}` : '';
const missionReward = (m: MissionDef) =>
  [m.reward.gold && `🪙 ${m.reward.gold}G`, m.reward.rubies && `💎 ${m.reward.rubies}`, m.reward.pickCards && `선택 카드 ${m.reward.pickCards}장`, m.reward.pickFragments && `선택 조각 ${m.reward.pickFragments}개`]
    .filter(Boolean)
    .join(' + ');

/**
 * 보상: 난이도 진행도 상자(25·50·100%, 계정당 1회, 직접 눌러 수령) + 일일·주간·월간 미션(KST 자정 초기화) — 6단계 v1.2 4·5장.
 * 8단계 v2.0 C: 공통 머리줄·리본·하단 탭, 시안 형식 판·탭·버튼. 규칙은 그대로.
 */
export class MissionScene extends Phaser.Scene {
  private tab: 'progress' | 'missions' = 'progress';
  private layer: Phaser.GameObjects.GameObject[] = [];
  private frame!: ScreenFrame;

  constructor() {
    super('missions');
  }

  onPlatformBack(): boolean {
    this.scene.start('lobby');
    return true;
  }

  init(data: { tab?: 'progress' | 'missions' }): void {
    if (data?.tab) this.tab = data.tab;
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    this.layer = [];
    this.frame = screenFrame(this, { title: '보상', nav: '' });
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
    const p = Progress.load();
    this.frame.refresh();
    const keys: ('progress' | 'missions')[] = ['progress', 'missions'];
    this.A(tabs(this, 262, ['왕국 정복 진행도', '미션'], keys.indexOf(this.tab), (i) => {
      if (keys[i] === this.tab) return;
      this.tab = keys[i];
      this.refresh();
    }));
    if (this.tab === 'progress') this.drawProgress(p);
    else this.drawMissions(p);
  }

  private drawProgress(p: PlayerProgress): void {
    this.A(text(this, 360, 314, `진행도 = 난이도별로 클리어한 서로 다른 단계 ÷ ${STAGE_COUNT} · 같은 단계 반복은 한 번만`, 16, COLOR.textSub, true).setOrigin(0.5));
    DIFFICULTIES.forEach((d, i) => {
      const y = 450 + i * 256;
      const dp = p.difficulty[d];
      const released = DIFFICULTY_RELEASED[d];
      const open = released && dp.unlocked.length > 0;
      const pct = progressPct(p, d);
      this.A(plate(this, 360, y, 664, 236, { r: 22, gold: open, fill: open ? 0x2b2442 : 0x1a1626 }));
      this.A(this.add.text(40, y - 105, `${DIFFICULTY_LABEL[d]}${!released ? ' — 출시 예정' : open ? '' : ' — 잠김'}`, { fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: open ? '#ffffff' : '#6f7a8c' }));
      this.A(this.add.text(680, y - 100, `${dp.cleared.length} / ${STAGE_COUNT} · ${pct}%`, { fontFamily: FONT, fontSize: '22px', color: '#ffd34d' }).setOrigin(1, 0));
      this.A(this.add.rectangle(360, y - 50, 640, 18, 0x0d0b12).setStrokeStyle(1, 0x555566));
      if (pct > 0) this.A(this.add.rectangle(40, y - 50, 640 * (pct / 100), 14, 0xffd34d).setOrigin(0, 0.5));
      if (!open) {
        const prev = d === 'hard' ? '쉬움' : '어려움';
        this.A(this.add.text(360, y - 22, released ? `${prev} ${STAGE_COUNT}단계를 모두 클리어하면 열립니다` : '다음 업데이트에서 열립니다', { fontFamily: FONT, fontSize: '18px', color: '#8a93a6' }).setOrigin(0.5));
      }
      PROGRESS_STEPS.forEach((step, k) => {
        const x = 145 + k * 215;
        const claimed = dp.claimed.includes(step);
        const reached = pct >= step;
        const label = `${step}% · ${(step / 100) * STAGE_COUNT}개\n${bundleText(PROGRESS_REWARDS[d][step])}\n${claimed ? '받음 ✔' : reached ? '눌러서 받기' : '잠김'}`;
        const b = this.keep(button(this, x, y + 50, 200, 104, label, () => this.claimBox(d, step), { kind: 'growth', size: 17 }));
        b.setEnabled(open && reached && !claimed);
      });
    });
  }

  private claimBox(d: (typeof DIFFICULTIES)[number], step: 25 | 50 | 100): void {
    const r = Progress.claimProgress(d, step);
    if (!r.ok) toast(this, r.reason === 'claimed' ? '이미 받았어요' : '아직 달성하지 못했어요', COLOR.danger);
    if (r.ok) this.pop(`${bundleText(r.reward)} 획득!`);
    this.refresh();
  }

  private drawMissions(p: PlayerProgress): void {
    const now = gameNow();
    this.A(text(this, 360, 314, '초기화(한국 시간): 일일 매일 자정 · 주간 월요일 자정 · 월간 매월 1일 자정', 16, COLOR.textSub, true).setOrigin(0.5));
    const list = activeMissions(now);
    list.forEach((m, i) => {
      const y = 384 + i * 106;
      const prog = Math.min(m.goal, missionProgress(p, m, now));
      const claimed = missionClaimed(p, m, now);
      const done = prog >= m.goal;
      this.A(plate(this, 360, y, 664, 96, { r: 20, gold: done && !claimed }));
      this.A(this.add.text(44, y - 36, `[${PERIOD_LABEL[m.period]}] ${m.text}`, { fontFamily: FONT, fontSize: '21px', color: '#ffffff', fontStyle: 'bold' }));
      this.A(this.add.text(44, y + 2, `${prog.toLocaleString()} / ${m.goal.toLocaleString()}  ·  ${missionReward(m)}`, { fontFamily: FONT, fontSize: '18px', color: '#c9d3ee' }));
      const b = this.keep(button(this, 600, y - 4, 150, 62, claimed ? '받음 ✔' : done ? '받기' : '진행 중', () => this.claimMission(m), { kind: 'growth', size: TYPE.caption }));
      b.setEnabled(done && !claimed);
    });
    // 일회성 업적(루비)
    const y0 = 384 + list.length * 106 - 20;
    this.A(this.add.text(40, y0, '업적(한 번만)', { fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#e1bee7' }));
    ACHIEVEMENTS.forEach((a, i) => {
      const got = p.claimed.includes(a.id);
      this.A(this.add.text(40, y0 + 38 + i * 30, `${got ? '✔' : '·'} ${a.text} — 💎 ${a.rubies}`, { fontFamily: FONT, fontSize: '18px', color: got ? '#8bc34a' : '#9aa6bd' }));
    });
  }

  private claimMission(m: MissionDef): void {
    if (m.reward.pickCards || m.reward.pickFragments) return this.choose(m);
    const r = Progress.claimMission(m.id, undefined, gameNow());
    if (r.ok) this.pop('보상 획득!');
    this.refresh();
  }

  /** 선택 카드·조각: 받을 드래곤 고르기(카드는 보유 드래곤만, 조각은 모든 드래곤 — 레드 조각 포함) */
  private choose(m: MissionDef): void {
    const p = Progress.load();
    const cards = !!m.reward.pickCards;
    const ids = DRAGON_ORDER.filter((id) => !cards || p.dragons[id].unlocked);
    const layer: Phaser.GameObjects.GameObject[] = [];
    const close = () => layer.forEach((o) => o.destroy());
    layer.push(this.add.rectangle(360, 640, 720, 1280, 0x000000, 0.85).setInteractive().setDepth(100));
    layer.push(this.add.text(360, 260, `${cards ? `카드 ${m.reward.pickCards}장` : `조각 ${m.reward.pickFragments}개`}을 받을 드래곤을 고르세요`, {
      fontFamily: FONT, fontSize: '26px', color: '#ffd34d',
    }).setOrigin(0.5).setDepth(101));
    ids.forEach((id, i) => {
      const x = 76 + (i % 5) * 142;
      const y = 400 + Math.floor(i / 5) * 170;
      const fr = this.add.rectangle(x, y, 132, 150, 0x1d2430).setStrokeStyle(3, RARITY_COLOR[DRAGONS[id].rarity]).setDepth(101);
      layer.push(fr, this.add.image(x, y - 14, `portrait-${id}`).setDisplaySize(106, 106).setDepth(102));
      layer.push(this.add.text(x, y + 50, DRAGONS[id].short, { fontFamily: FONT, fontSize: '20px', color: '#ffffff' }).setOrigin(0.5).setDepth(102));
      fr.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        const r = Progress.claimMission(m.id, id, gameNow());
        close();
        if (r.ok) this.pop(`${DRAGONS[id].short} ${cards ? '카드' : '조각'} 획득!`);
        else toast(this, '받을 수 없어요', COLOR.danger);
        this.refresh();
      });
    });
    const c = button(this, 360, 900, 300, 76, '취소', close, { kind: 'secondary', size: TYPE.body });
    c.root.setDepth(102);
    layer.push(c.root);
  }

  private pop(word: string): void {
    popWord(this, word, 640);
  }
}
