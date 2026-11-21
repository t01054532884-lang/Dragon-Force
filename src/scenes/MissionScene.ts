import Phaser from 'phaser';
import { DRAGON_ORDER, DRAGONS, RARITY_COLOR } from '../data/dragons';
import {
  ACHIEVEMENTS, DIFFICULTIES, DIFFICULTY_RELEASED, DIFFICULTY_LABEL, PROGRESS_REWARDS, PROGRESS_STEPS, STAGE_COUNT, type MissionDef, type RewardBundle,
} from '../data/economy';
import { achievementProgress, activeMissions, claimableMissions, missionClaimed, missionProgress, progressPct, Progress, type PlayerProgress } from '../systems/Progress';
import { rewardPopup, type RewardItem } from '../ui/celebrate';
import { ACTIVITY_DAILY, ACTIVITY_DAILY_MAX, ACTIVITY_WEEKLY, ACTIVITY_WEEKLY_MAX, ATTENDANCE_28, activityRewardIcon, activityRewardText, type ActivityReward, type ActivityTier } from '../data/activity';
import { activityClaimed, activityPoints, attendanceState, claimableActivity } from '../systems/Activity';
import { RUNES } from '../data/runes';
import type { DragonId } from '../data/dragons';
import { progressBar } from '../ui/kit';
import { playSfx } from '../systems/Sfx';
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
  private tab: Tab = 'progress';
  private layer: Phaser.GameObjects.GameObject[] = [];
  private frame!: ScreenFrame;

  constructor() {
    super('missions');
  }

  onPlatformBack(): boolean {
    this.scene.start('lobby');
    return true;
  }

  /** 로비 출석 팝업에서 "받기"로 들어오면 출석 탭을 열고 바로 받기(카드 고르기가 필요한 날은 여기서 고름) */
  private autoClaim = false;

  init(data: { tab?: Tab; claim?: boolean }): void {
    if (data?.tab) this.tab = data.tab;
    this.autoClaim = !!data?.claim;
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    this.layer = [];
    this.frame = screenFrame(this, { title: '보상', nav: '' });
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('lobby'));
    this.refresh();
    if (this.autoClaim && this.tab === 'attendance' && !attendanceState(Progress.load(), gameNow()).claimedToday) this.time.delayedCall(250, () => this.claimAttendance());
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
    const now = gameNow();
    const keys: Tab[] = ['progress', 'daily', 'missions', 'achievements', 'attendance'];
    const ready = claimableMissions(p, now);
    const nDaily = ready.filter((m) => m.period === 'daily').length + claimableActivity(p, now);
    const nMission = ready.filter((m) => m.period !== 'daily').length;
    const att = attendanceState(p, now);
    this.A(tabs(this, 262, ['진행도', `일일${nDaily ? ` (${nDaily})` : ''}`, `미션${nMission ? ` (${nMission})` : ''}`, '업적', `출석${att.claimedToday ? '' : ' !'}`], keys.indexOf(this.tab), (i) => {
      if (keys[i] === this.tab) return;
      this.tab = keys[i];
      this.refresh();
    }));
    if (this.tab === 'progress') this.drawProgress(p);
    else if (this.tab === 'daily') this.drawDaily(p);
    else if (this.tab === 'missions') this.drawMissions(p);
    else if (this.tab === 'attendance') this.drawAttendance(p);
    else this.drawAchievements(p);
  }

  private drawProgress(p: PlayerProgress): void {
    this.A(text(this, 360, 314, `진행도 = 난이도별로 클리어한 서로 다른 단계 ÷ ${STAGE_COUNT} · 같은 단계 반복은 한 번만`, 16, COLOR.textSub, true).setOrigin(0.5));
    // 출시한 난이도만(기획자 요청 1). 미출시 난이도 진행 데이터는 저장에 그대로 남는다
    DIFFICULTIES.filter((d) => DIFFICULTY_RELEASED[d]).forEach((d, i) => {
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
    if (r.ok) rewardPopup(this, '진행도 보상', [bundleItem(r.reward)]);
    this.refresh();
  }

  /**
   * 미션(2026-11-21 기획서 9장): 받을 수 있는 것 → 진행 중 → 받은 것 순서. 진행 막대, 진행 중이면 "이동"(로비 전투),
   * 완료면 "받기", 받은 것은 체크. 위의 "모두 받기"는 골드·루비 미션을 한 번에(선택 보상은 하나씩 고름).
   */
  private drawMissions(p: PlayerProgress): void {
    this.drawMissionRows(p, (m) => m.period !== 'daily', 330, 426, 112, 102);
  }

  /** 미션 줄 목록(일일 탭·미션 탭이 같이 씀). headY = 안내·모두 받기 줄, y0 = 첫 줄, gap = 줄 간격, h = 줄 높이 */
  private drawMissionRows(p: PlayerProgress, pick: (m: MissionDef) => boolean, headY: number, y0: number, gap: number, h: number): void {
    const now = gameNow();
    const list = activeMissions(now).filter(pick).map((m) => {
      const prog = Math.min(m.goal, missionProgress(p, m, now));
      const claimed = missionClaimed(p, m, now);
      return { m, prog, claimed, done: prog >= m.goal };
    });
    const rank = (x: { claimed: boolean; done: boolean }) => (x.claimed ? 2 : x.done ? 0 : 1);
    list.sort((a, b) => rank(a) - rank(b));
    const ready = list.filter((x) => x.done && !x.claimed).length;
    this.A(text(this, 40, headY, ready ? `받을 수 있는 보상 ${ready}개` : '진행 중인 미션을 완료해 보세요', TYPE.caption, ready ? COLOR.gold : COLOR.textSub, true, true).setOrigin(0, 0.5));
    const all = this.keep(button(this, 572, headY, 240, 62, `모두 받기${ready ? ` (${ready})` : ''}`, () => this.claimAll(), { kind: 'cta', size: TYPE.caption }));
    // 골드·루비만 주는 완료 미션이 있을 때만(선택 보상은 하나씩 고름)
    all.setEnabled(list.some((x) => x.done && !x.claimed && !x.m.reward.pickCards && !x.m.reward.pickFragments));
    // 줄 구성(v1.2 UI 참고 반영): 왼쪽 보상 칸(그림 + 수량) · 가운데 미션 이름 + 진행 막대 · 오른쪽 이동/받기
    list.forEach(({ m, prog, claimed, done }, i) => {
      const y = y0 + i * gap;
      this.A(plate(this, 360, y, 664, h, { r: 20, gold: done && !claimed, fill: claimed ? 0x1a1626 : undefined }));
      this.rewardBox(84, y, missionIcon(m), claimed);
      this.A(text(this, 140, y - 24, `[${PERIOD_LABEL[m.period]}] ${m.text}`, 19, claimed ? COLOR.textDim : COLOR.text, true, true).setOrigin(0, 0.5));
      this.A(progressBar(this, 330, y + 18, 380, 18, prog / m.goal, claimed ? 0x4a5577 : done ? COLOR.ok : COLOR.violet, `${prog.toLocaleString()} / ${m.goal.toLocaleString()}`).root);
      const label = claimed ? '✔' : done ? '받기' : '이동';
      const b = this.keep(button(this, 616, y, 116, 64, label, () => (done ? this.claimMission(m) : this.scene.start('lobby')), {
        kind: claimed ? 'secondary' : done ? 'growth' : 'cta', size: TYPE.caption,
      }));
      b.setEnabled(!claimed);
    });
    this.A(text(this, 360, y0 + list.length * gap - 20, '초기화(한국 시간): 일일 매일 자정 · 주간 월요일 자정 · 월간 매월 1일 자정', 15, COLOR.textSub, true).setOrigin(0.5));
  }

  private claimMission(m: MissionDef): void {
    if (m.reward.pickCards || m.reward.pickFragments) return this.choose(m);
    const r = Progress.claimMission(m.id, undefined, gameNow());
    if (r.ok) rewardPopup(this, '미션 보상', missionItems(m));
    this.refresh();
  }

  private claimAll(): void {
    const r = Progress.claimAllMissions(gameNow());
    if (!r.ok) {
      toast(this, '모두 받기는 골드·루비 미션만 — 선택 보상은 하나씩 골라 주세요', COLOR.danger);
      return;
    }
    // 같은 보상끼리 합쳐 한 화면에(매번 팝업 X)
    const sum = { gold: 0, rubies: 0 };
    for (const m of r.got) {
      sum.gold += m.reward.gold ?? 0;
      sum.rubies += m.reward.rubies ?? 0;
    }
    const items: RewardItem[] = [];
    if (sum.gold) items.push({ image: 'ui-gold', emoji: '🪙', label: '골드', amount: `+${sum.gold.toLocaleString()}` });
    if (sum.rubies) items.push({ image: 'ui-ruby', emoji: '💎', label: '루비', amount: `+${sum.rubies.toLocaleString()}`, grade: 'rare' });
    rewardPopup(this, `미션 ${r.got.length}개 보상`, items);
    if (r.left) toast(this, `선택 보상 미션 ${r.left}개는 직접 골라 받아 주세요`, COLOR.gold, 1060);
    this.refresh();
  }

  /**
   * 업적(2026-11-21 기획서 11장): 카테고리별, 진행률 막대, 가까운 것부터. 업적 루비는 전투가 끝날 때 자동으로 들어온다(기존 규칙).
   * 1,000·10,000마리 목표는 그대로(제작자 확정).
   */
  private drawAchievements(p: PlayerProgress): void {
    const prog = achievementProgress(p);
    const cats: { title: string; ids: string[] }[] = [
      { title: '전투', ids: ['first-run', 'first-elite', 'kills-1000', 'kills-10000'] },
      { title: '수집', ids: ['collector-3'] },
    ];
    const doneN = prog.filter((a) => a.done).length;
    this.A(text(this, 40, 330, `달성 ${doneN} / ${prog.length} · 업적 루비는 달성한 판이 끝날 때 자동 지급`, TYPE.tiny, COLOR.textSub, true).setOrigin(0, 0.5));
    let y = 392;
    for (const c of cats) {
      this.A(text(this, 40, y, c.title, TYPE.body, 0xe1bee7, true, true).setOrigin(0, 0.5));
      y += 56;
      const rows = c.ids.map((id) => ({ a: ACHIEVEMENTS.find((x) => x.id === id)!, pr: prog.find((x) => x.id === id)! }));
      rows.sort((r1, r2) => Number(r1.pr.done) - Number(r2.pr.done) || r2.pr.cur / r2.pr.goal - r1.pr.cur / r1.pr.goal);
      for (const { a, pr } of rows) {
        this.A(plate(this, 360, y, 664, 96, { r: 20, fill: pr.done ? 0x1a1626 : undefined }));
        this.rewardBox(84, y, { image: 'ui-ruby', emoji: '💎', amount: `${a.rubies}` }, pr.done);
        this.A(text(this, 140, y - 22, a.text, 19, pr.done ? COLOR.ok : COLOR.text, true, true).setOrigin(0, 0.5));
        this.A(progressBar(this, 330, y + 18, 380, 16, pr.cur / pr.goal, pr.done ? COLOR.ok : COLOR.violet, `${pr.cur.toLocaleString()} / ${pr.goal.toLocaleString()}`).root);
        // 업적 루비는 달성한 판이 끝날 때 자동 지급(기존 규칙) → 달성하면 체크, 아직이면 이동
        const b = this.keep(button(this, 616, y, 116, 60, pr.done ? '✔' : '이동', () => this.scene.start('lobby'), { kind: pr.done ? 'secondary' : 'cta', size: TYPE.caption }));
        b.setEnabled(!pr.done);
        y += 106;
      }
      y += 10;
    }
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
        if (r.ok) rewardPopup(this, '미션 보상', [{ portrait: id, label: `${DRAGONS[id].short} ${cards ? '카드' : '조각'}`, amount: `+${cards ? m.reward.pickCards : m.reward.pickFragments}`, grade: 'rare' }]);
        else toast(this, '받을 수 없어요', COLOR.danger);
        this.refresh();
      });
    });
    const c = button(this, 360, 900, 300, 76, '취소', close, { kind: 'secondary', size: TYPE.body });
    c.root.setDepth(102);
    layer.push(c.root);
  }

  /**
   * 일일 탭(상시 활동 점수, 2026-11-21): 위 = 오늘 활동 점수 막대 + 상자 5개, 이번 주 막대 + 상자 5개, 아래 = 일일 미션 5개.
   * 일일 미션 하나를 받을 때마다 활동 점수 20(하루 100, 주 700).
   */
  private drawDaily(p: PlayerProgress): void {
    const now = gameNow();
    const pts = activityPoints(p, now);
    this.activityBar(p, 'daily', 380, pts.daily, ACTIVITY_DAILY_MAX, ACTIVITY_DAILY, `오늘 활동 점수 ${pts.daily} / ${ACTIVITY_DAILY_MAX}`);
    this.activityBar(p, 'weekly', 540, pts.weekly, ACTIVITY_WEEKLY_MAX, ACTIVITY_WEEKLY, `이번 주 활동 점수 ${pts.weekly} / ${ACTIVITY_WEEKLY_MAX}`);
    this.drawMissionRows(p, (m) => m.period === 'daily', 654, 730, 94, 86);
  }

  /** 활동 막대: 제목 · 점수 막대 · 그 위 상자 버튼(받을 수 있으면 초록, 받았으면 체크) */
  private activityBar(p: PlayerProgress, kind: 'daily' | 'weekly', y: number, pts: number, max: number, tiers: ActivityTier[], title: string): void {
    const now = gameNow();
    this.A(plate(this, 360, y, 664, 150, { r: 20, fill: 0x231d38 }));
    this.A(text(this, 44, y - 52, title, TYPE.caption, COLOR.gold, true, true).setOrigin(0, 0.5));
    const x0 = 64;
    const w = 576;
    // 상자는 고르게 놓고, 막대는 상자 사이를 점수에 맞춰 채움(주간 600·700처럼 가까운 단계도 겹치지 않게)
    const n = tiers.length;
    let fill = 0;
    tiers.forEach((t, i) => {
      const prev = i ? tiers[i - 1].at : 0;
      fill += Math.max(0, Math.min(1, (pts - prev) / (t.at - prev))) / n;
    });
    this.A(progressBar(this, x0 + w / 2, y + 52, w, 14, Math.min(1, fill), COLOR.ok).root);
    for (const [i, t] of tiers.entries()) {
      const x = x0 + (w * (i + 1)) / n - 56;
      const claimed = activityClaimed(p, kind, t.at, now);
      const ready = pts >= t.at && !claimed;
      const ic = activityRewardIcon(t.reward);
      const b = this.keep(button(this, x, y, 100, 62, claimed ? '✔' : ic.amount, () => this.claimTier(kind, t), {
        kind: ready ? 'growth' : 'secondary', icon: claimed || !this.textures.exists(ic.image) ? undefined : ic.image, size: 15,
      }));
      b.setEnabled(ready);
      this.A(text(this, x + 56, y + 52, `${t.at}`, 13, pts >= t.at ? COLOR.text : COLOR.textDim, true, true).setOrigin(0.5, -0.4));
    }
  }

  private claimTier(kind: 'daily' | 'weekly', t: ActivityTier): void {
    const run = (choice?: DragonId) => {
      const r = Progress.claimActivity(kind, t.at, gameNow(), choice);
      if (r.ok) rewardPopup(this, kind === 'daily' ? `오늘 활동 ${t.at}점 상자` : `이번 주 활동 ${t.at}점 상자`, activityItems(t.reward, choice, r.runeId));
      else toast(this, r.reason === 'claimed' ? '이미 받았어요' : '아직 받을 수 없어요', COLOR.danger);
      this.refresh();
    };
    if (t.reward.pickCards) this.pickDragon(`카드 ${t.reward.pickCards}장을 받을 드래곤을 고르세요`, true, run);
    else run();
  }

  /**
   * 출석 탭(상시 28일, 2026-11-21): 7칸 × 4줄. 연속이 아니라 받은 날 수로 진행, 28일차 다음은 1일차.
   * 날마다 보상이 다르고(골드·루비·카드·룬 조각·드래곤/장비/룬 상자 개봉권), 7일마다 큰 보상.
   */
  private drawAttendance(p: PlayerProgress): void {
    const now = gameNow();
    const st = attendanceState(p, now);
    const doneInCycle = st.claimedToday ? st.index + 1 : st.index;
    this.A(text(this, 40, 320, `출석 ${doneInCycle} / ${ATTENDANCE_28.length}일 · 하루 빠져도 이어서 받아요`, TYPE.caption, COLOR.text, true, true).setOrigin(0, 0.5));
    ATTENDANCE_28.forEach((r, i) => {
      const col = i % 7;
      const row = Math.floor(i / 7);
      const x = 360 + (col - 3) * 94;
      const y = 438 + row * 166;
      const got = i < doneInCycle;
      const today = !st.claimedToday && i === st.index;
      const big = (i + 1) % 7 === 0;
      this.A(plate(this, x, y, 88, 154, { r: 14, gold: today || big, fill: got ? 0x1a1626 : big ? 0x3a2a5a : undefined }));
      this.A(text(this, x, y - 58, `${i + 1}일`, 15, today ? COLOR.gold : COLOR.textSub, true, true).setOrigin(0.5));
      const ic = activityRewardIcon(r);
      if (this.textures.exists(ic.image)) this.A(this.add.image(x, y - 6, ic.image).setDisplaySize(52, 52).setAlpha(got ? 0.35 : 1));
      else this.A(text(this, x, y - 6, ic.emoji, 30).setOrigin(0.5).setAlpha(got ? 0.35 : 1));
      this.A(text(this, x, y + 44, ic.amount, 14, got ? COLOR.textDim : COLOR.text, true, true).setOrigin(0.5));
      if (got) this.A(text(this, x + 26, y - 32, '✔', 22, COLOR.ok, true, true).setOrigin(0.5));
    });
    const shown = st.claimedToday ? `내일 보상: ${activityRewardText(ATTENDANCE_28[(st.index + 1) % ATTENDANCE_28.length])}` : `오늘 보상: ${activityRewardText(ATTENDANCE_28[st.index])}`;
    this.A(text(this, 360, 1040, shown, 17, COLOR.textSub, true).setOrigin(0.5));
    const b = this.keep(button(this, 360, 1100, 360, 68, st.claimedToday ? '내일 또 만나요' : '오늘 출석 받기', () => this.claimAttendance(), { kind: st.claimedToday ? 'secondary' : 'growth', size: TYPE.body }));
    b.setEnabled(!st.claimedToday);
  }

  private claimAttendance(): void {
    const st = attendanceState(Progress.load(), gameNow());
    const reward = ATTENDANCE_28[st.index];
    const run = (choice?: DragonId) => {
      const r = Progress.claimDailyAttendance(gameNow(), choice);
      if (r.ok) {
        playSfx(this, 'sfx-claim');
        rewardPopup(this, `출석 ${r.day}일차 보상`, activityItems(r.reward, choice, r.runeId));
      } else toast(this, r.reason === 'claimed' ? '오늘은 이미 받았어요' : '받을 수 없어요', COLOR.danger);
      this.refresh();
    };
    if (reward.pickCards) this.pickDragon(`카드 ${reward.pickCards}장을 받을 드래곤을 고르세요`, true, run);
    else run();
  }

  /** 드래곤 고르기 창(카드 = 보유 드래곤만) */
  private pickDragon(title: string, ownedOnly: boolean, onPick: (id: DragonId) => void): void {
    const p = Progress.load();
    const ids = DRAGON_ORDER.filter((id) => !ownedOnly || p.dragons[id].unlocked);
    const layer: Phaser.GameObjects.GameObject[] = [];
    const close = () => layer.forEach((o) => o.destroy());
    layer.push(this.add.rectangle(360, 640, 720, 1280, 0x000000, 0.85).setInteractive().setDepth(100));
    layer.push(this.add.text(360, 260, title, { fontFamily: FONT, fontSize: '26px', color: '#ffd34d' }).setOrigin(0.5).setDepth(101));
    ids.forEach((id, i) => {
      const x = 76 + (i % 5) * 142;
      const y = 400 + Math.floor(i / 5) * 170;
      const fr = this.add.rectangle(x, y, 132, 150, 0x1d2430).setStrokeStyle(3, RARITY_COLOR[DRAGONS[id].rarity]).setDepth(101);
      layer.push(fr, this.add.image(x, y - 14, `portrait-${id}`).setDisplaySize(106, 106).setDepth(102));
      layer.push(this.add.text(x, y + 50, DRAGONS[id].short, { fontFamily: FONT, fontSize: '20px', color: '#ffffff' }).setOrigin(0.5).setDepth(102));
      fr.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        close();
        onPick(id);
      });
    });
    const c = button(this, 360, 900, 300, 76, '취소', close, { kind: 'secondary', size: TYPE.body });
    c.root.setDepth(102);
    layer.push(c.root);
  }

  /** 왼쪽 보상 칸: 둥근 사각 + 보상 그림 + 수량(받았으면 흐리게) */
  private rewardBox(x: number, y: number, r: { image: string; emoji: string; amount: string }, dim: boolean): void {
    const g = this.A(this.add.graphics());
    g.fillStyle(COLOR.outline, 1).fillRoundedRect(x - 40, y - 40, 80, 80, 14);
    g.fillStyle(0x3a2a6b, 1).fillRoundedRect(x - 37, y - 37, 74, 74, 12);
    g.lineStyle(2, COLOR.gold, dim ? 0.3 : 0.9).strokeRoundedRect(x - 37, y - 37, 74, 74, 12);
    if (this.textures.exists(r.image)) this.A(this.add.image(x, y - 8, r.image).setDisplaySize(46, 46).setAlpha(dim ? 0.4 : 1));
    else this.A(text(this, x, y - 8, r.emoji, 32).setOrigin(0.5).setAlpha(dim ? 0.4 : 1));
    this.A(text(this, x, y + 24, r.amount, 16, dim ? COLOR.textDim : COLOR.text, true, true).setOrigin(0.5));
  }

  private pop(word: string): void {
    popWord(this, word, 640);
    playSfx(this, 'sfx-claim');
  }
}

type Tab = 'progress' | 'daily' | 'missions' | 'achievements' | 'attendance';

/** 진행도 보상 → 보상 카드 */
function bundleItem(b: RewardBundle): RewardItem {
  if (b.gold) return { image: 'ui-gold', emoji: '🪙', label: '골드', amount: `+${b.gold.toLocaleString()}` };
  if (b.rubies) return { image: 'ui-ruby', emoji: '💎', label: '루비', amount: `+${b.rubies.toLocaleString()}`, grade: 'epic' };
  if (b.fragments) return { portrait: b.fragments.dragonId, label: `${DRAGONS[b.fragments.dragonId].short} 조각`, amount: `+${b.fragments.count}`, grade: 'rare' };
  return { emoji: '🎁', label: bundleText(b) };
}

function missionItems(m: MissionDef): RewardItem[] {
  const out: RewardItem[] = [];
  if (m.reward.gold) out.push({ image: 'ui-gold', emoji: '🪙', label: '골드', amount: `+${m.reward.gold.toLocaleString()}` });
  if (m.reward.rubies) out.push({ image: 'ui-ruby', emoji: '💎', label: '루비', amount: `+${m.reward.rubies}`, grade: 'rare' });
  if (m.period === 'daily') out.push({ emoji: '⭐', label: '활동 점수', amount: '+20' });
  return out;
}

/** 미션 보상의 대표 그림·수량(보상이 여러 개면 첫 번째 + "외") */
function missionIcon(m: MissionDef): { image: string; emoji: string; amount: string } {
  const r = m.reward;
  if (!r.gold && !r.rubies && !r.pickCards && !r.pickFragments) return { image: '', emoji: '⭐', amount: '활동 +20' };
  const many = [r.gold, r.rubies, r.pickCards, r.pickFragments].filter(Boolean).length > 1 ? '+' : '';
  if (r.rubies) return { image: 'ui-ruby', emoji: '💎', amount: `${r.rubies}${many}` };
  if (r.gold) return { image: 'ui-gold', emoji: '🪙', amount: `${r.gold}${many}` };
  if (r.pickCards) return { image: 'ui-card', emoji: '🃏', amount: `${r.pickCards}장${many}` };
  return { image: 'ui-fragment', emoji: '🧩', amount: `${r.pickFragments ?? 0}개${many}` };
}

/** 활동·출석 보상 → 보상 카드 */
function activityItems(r: ActivityReward, choice?: DragonId, runeId?: string): RewardItem[] {
  const out: RewardItem[] = [];
  if (r.rubies) out.push({ image: 'ui-ruby', emoji: '💎', label: '루비', amount: `+${r.rubies.toLocaleString()}`, grade: 'rare' });
  if (r.gold) out.push({ image: 'ui-gold', emoji: '🪙', label: '골드', amount: `+${r.gold.toLocaleString()}` });
  if (r.pickCards && choice) out.push({ portrait: choice, label: `${DRAGONS[choice].short} 카드`, amount: `+${r.pickCards}`, grade: 'rare' });
  if (r.runeFragments) {
    const rune = RUNES.find((x) => x.id === runeId);
    out.push({ image: runeId ? `sp-${runeId}` : 'ui-fragment', emoji: rune?.icon ?? '🔷', label: `${rune?.name ?? '룬'} 조각`, amount: `+${r.runeFragments}`, grade: 'epic' });
  }
  const t = r.tickets ?? {};
  if (t.dragon) out.push({ image: 'ui-ticket', emoji: '🎟', label: '드래곤 상자 개봉권', amount: `+${t.dragon}`, grade: 'epic' });
  if (t.equipment) out.push({ image: 'ui-ticket', emoji: '🎟', label: '장비 상자 개봉권', amount: `+${t.equipment}`, grade: 'rare' });
  if (t.rune) out.push({ image: 'ui-ticket', emoji: '🎟', label: '룬 상자 개봉권', amount: `+${t.rune}`, grade: 'rare' });
  return out;
}
