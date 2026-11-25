import Phaser from 'phaser';
import { DRAGON_ORDER, DRAGONS } from '../data/dragons';
import {
  ACHIEVEMENTS, DIFFICULTIES, DIFFICULTY_RELEASED, DIFFICULTY_LABEL, STAGE_COUNT, type MissionDef, type RewardBundle,
} from '../data/economy';
import { achievementProgress, activeMissions, claimableMissions, claimableStageBoxes, missionClaimed, missionProgress, progressPct, Progress, type PlayerProgress } from '../systems/Progress';
import { bundleItem, bundleItems, rewardPopup, type RewardItem } from '../ui/celebrate';
import { ACTIVITY_DAILY, ACTIVITY_DAILY_MAX, ACTIVITY_WEEKLY, ACTIVITY_WEEKLY_MAX, ATTENDANCE_28, activityRewardIcon, activityRewardText, type ActivityReward, type ActivityTier } from '../data/activity';
import { activityClaimed, activityPoints, attendanceState, claimableActivity } from '../systems/Activity';
import { RUNES } from '../data/runes';
import type { DragonId } from '../data/dragons';
import { progressBar } from '../ui/kit';
import { playSfx } from '../systems/Sfx';
import { FONT, gameNow } from '../ui/widgets';
import { preloadArt } from '../ui/art';
import { badge, button, text, type KitButton } from '../ui/kit';
import { plate, tabs } from '../ui/kit2';
import { popWord, screenFrame, toast, type ScreenFrame } from '../ui/screen';
import { COLOR, TYPE } from '../ui/theme';

const PERIOD_LABEL = { daily: '일일', weekly: '주간', monthly: '월간', event: '이벤트' } as const;
const bundleText = (b: RewardBundle) =>
  b.gold ? `🪙 ${b.gold.toLocaleString()}G` : b.rubies ? `루비 ${b.rubies.toLocaleString()}` : b.fragments ? `${DRAGONS[b.fragments.dragonId].short} 조각 ${b.fragments.count}` : '';
const missionReward = (m: MissionDef) =>
  [m.reward.gold && `🪙 ${m.reward.gold}G`, m.reward.rubies && `루비 ${m.reward.rubies}`, m.reward.pickCards && `랜덤 카드 ${m.reward.pickCards}장`, m.reward.randomFragments && `랜덤 조각 ${m.reward.randomFragments}개`]
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

  /**
   * 로비 바로가기로 들어오면 그 화면만(제작자 요청 2026-11-22: 출석은 출석만, 업적은 업적만, 진행도는 진행도만,
   * 미션은 일일·주간·월간만). 없으면 예전처럼 탭 5개.
   */
  private only: Only | null = null;

  init(data: { tab?: Tab; claim?: boolean; only?: Only }): void {
    this.only = data?.only ?? null;
    if (data?.tab) this.tab = data.tab;
    if (this.only === 'mission' && this.tab !== 'missions') this.tab = 'daily';
    else if (this.only && this.only !== 'mission') this.tab = this.only;
    this.autoClaim = !!data?.claim;
  }

  preload(): void {
    preloadArt(this);
  }

  create(): void {
    this.layer = [];
    this.frame = screenFrame(this, { title: this.only ? ONLY_TITLE[this.only] : '보상', nav: '', bg: this.only === 'attendance' ? 'scrbg-attendance' : this.only === 'achievements' ? 'scrbg-achievements' : 'scrbg-missions' });
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
    // 출석은 로비의 출석 버튼으로 따로(2026-11-22) → 전체 보상 탭에서는 뺌
    const keys: Tab[] = ['progress', 'daily', 'missions', 'achievements'];
    const ready = claimableMissions(p, now);
    const nDaily = ready.filter((m) => m.period === 'daily').length + claimableActivity(p, now);
    const nMission = ready.filter((m) => m.period !== 'daily').length;
    const att = attendanceState(p, now);
    if (this.only === 'mission') {
      const mk: Tab[] = ['daily', 'missions'];
      this.A(tabs(this, 262, [`일일${nDaily ? ` (${nDaily})` : ''}`, `주간·월간${nMission ? ` (${nMission})` : ''}`], mk.indexOf(this.tab), (i) => {
        if (mk[i] === this.tab) return;
        this.tab = mk[i];
        this.refresh();
      }));
    } else if (!this.only) this.A(tabs(this, 262, ['진행도', `일일${nDaily ? ` (${nDaily})` : ''}`, `미션${nMission ? ` (${nMission})` : ''}`, '업적'], keys.indexOf(this.tab), (i) => {
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
      // 단계 상자(2026-11-23): 단계마다 1개. 받을 수 있는 개수와 모두 받기(보상은 받기 전 비공개)
      const ready = claimableStageBoxes(p, d).length;
      this.A(this.add.text(40, y + 6, `받은 상자 ${dp.claimed.length} / ${STAGE_COUNT} · 받을 상자 ${ready}개\n단계를 처음 깰 때마다 상자 1개\n5단계마다 특별 상자`, {
        fontFamily: FONT, fontSize: '19px', color: ready ? '#7ee2a8' : '#b9c2da', lineSpacing: 6,
      }));
      const b = this.keep(button(this, 560, y + 62, 220, 76, ready ? `상자 ${ready}개 받기` : '받을 상자가 없어요', () => this.claimBox(d), { kind: 'growth', size: 20 }));
      b.setEnabled(open && ready > 0);
    });
  }

  private claimBox(d: (typeof DIFFICULTIES)[number]): void {
    const r = Progress.claimAllStageBoxes(d);
    if (!r.ok) toast(this, '받을 상자가 없어요', COLOR.danger);
    if (r.ok) rewardPopup(this, `${DIFFICULTY_LABEL[d]} 단계 상자 ${r.count}개`, bundleItems(r.reward));
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
    // 받을 미션이 있을 때만(카드도 무작위라 같이 받음, 2026-11-25)
    all.setEnabled(list.some((x) => x.done && !x.claimed));
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
  }

  private claimMission(m: MissionDef): void {
    const r = Progress.claimMission(m.id, gameNow());
    if (r.ok) {
      const items = missionItems(m);
      // 카드: 보유 드래곤 중 무작위(2026-11-25) — 어떤 드래곤 카드인지 보여 준다
      if (r.cardDragon) items.unshift({ portrait: r.cardDragon, label: `${DRAGONS[r.cardDragon].short} 카드`, amount: `+${m.reward.pickCards}`, grade: gradeOf(r.cardDragon) });
      // 랜덤 조각: 어떤 드래곤 조각이 나왔는지(등급 색 테두리)
      if (r.fragmentDragon) items.unshift({ portrait: r.fragmentDragon, label: `${DRAGONS[r.fragmentDragon].short} 조각`, amount: `+${m.reward.randomFragments}`, grade: gradeOf(r.fragmentDragon) });
      rewardPopup(this, '미션 보상', items);
    }
    this.refresh();
  }

  private claimAll(): void {
    const r = Progress.claimAllMissions(gameNow());
    if (!r.ok) {
      toast(this, '받을 수 있는 미션이 없어요', COLOR.danger);
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
    for (const c of r.cards) items.push({ portrait: c.dragonId, label: `${DRAGONS[c.dragonId].short} 카드`, amount: `+${c.count}`, grade: gradeOf(c.dragonId) });
    for (const f of r.fragments) items.push({ portrait: f.dragonId, label: `${DRAGONS[f.dragonId].short} 조각`, amount: `+${f.count}`, grade: gradeOf(f.dragonId) });
    rewardPopup(this, `미션 ${r.got.length}개 보상`, items);
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
    this.A(text(this, 40, 330, `달성 ${doneN} / ${prog.length}`, TYPE.tiny, COLOR.textSub, true).setOrigin(0, 0.5));
    let y = 392;
    for (const c of cats) {
      // 분류 제목이 첫 줄 판에 묻히지 않게(2026-11-23 제보): 제목 아래 여백을 넉넉히 + 밑줄
      this.A(text(this, 40, y, c.title, TYPE.body, 0xe1bee7, true, true).setOrigin(0, 0.5));
      this.A(this.add.rectangle(40, y + 22, 640, 3, 0xe1bee7, 0.35).setOrigin(0, 0.5));
      y += 80;
      const rows = c.ids.map((id) => ({ a: ACHIEVEMENTS.find((x) => x.id === id)!, pr: prog.find((x) => x.id === id)! }));
      rows.sort((r1, r2) => Number(r1.pr.done) - Number(r2.pr.done) || r2.pr.cur / r2.pr.goal - r1.pr.cur / r1.pr.goal);
      for (const { a, pr } of rows) {
        this.A(plate(this, 360, y, 664, 96, { r: 20, fill: pr.done ? 0x1a1626 : undefined }));
        // 업적 메달(2026-11-26 Higgsfield): 어려울수록 동 → 은 → 금 → 다이아. 못 이룬 업적은 흐리게. 보상 루비는 제목 오른쪽
        const medal = `medal-${ACH_MEDAL[a.id] ?? 'bronze'}`;
        if (this.textures.exists(medal)) this.A(this.add.image(84, y, medal).setDisplaySize(78, 78).setAlpha(pr.done ? 1 : 0.55));
        else this.rewardBox(84, y, { image: 'ui-ruby', emoji: '💎', amount: `${a.rubies}` }, pr.done);
        this.A(text(this, 140, y - 22, a.text, 19, pr.done ? COLOR.ok : COLOR.text, true, true).setOrigin(0, 0.5));
        if (this.textures.exists(medal)) {
          this.A(this.add.image(500, y - 22, 'ui-ruby').setDisplaySize(26, 26).setAlpha(pr.done ? 0.5 : 1));
          this.A(text(this, 518, y - 22, `${a.rubies}`, 18, pr.done ? COLOR.textDim : COLOR.gold, true, true).setOrigin(0, 0.5));
        }
        this.A(progressBar(this, 330, y + 18, 380, 16, pr.cur / pr.goal, pr.done ? COLOR.ok : COLOR.violet, `${pr.cur.toLocaleString()} / ${pr.goal.toLocaleString()}`).root);
        // 업적 루비는 달성한 판이 끝날 때 자동 지급(기존 규칙) → 달성하면 체크, 아직이면 이동
        const b = this.keep(button(this, 616, y, 116, 60, pr.done ? '✔' : '이동', () => this.scene.start('lobby'), { kind: pr.done ? 'secondary' : 'cta', size: TYPE.caption }));
        b.setEnabled(!pr.done);
        y += 106;
      }
      y += 30;
    }
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
    const r = Progress.claimActivity(kind, t.at, gameNow());
    if (r.ok) rewardPopup(this, kind === 'daily' ? `오늘 활동 ${t.at}점 상자` : `이번 주 활동 ${t.at}점 상자`, activityItems(t.reward, r.cardDragon, r.runeId));
    else toast(this, r.reason === 'claimed' ? '이미 받았어요' : '아직 받을 수 없어요', COLOR.danger);
    this.refresh();
  }

  /**
   * 출석 탭(상시 28일, 2026-11-21): 연속이 아니라 받은 날 수로 진행, 28일차 다음은 1일차.
   * 날마다 보상이 다르고(골드·루비·카드·룬 조각·드래곤/장비/룬 상자 개봉권), 7일마다 큰 보상.
   * 화면(2026-11-25 제작자: "한 화면에 다 담아 너무 작다"): 1주씩 묶어 칸을 크게(한 줄 4칸) — 한 화면에 2주,
   * 위아래로 끌어(마우스 휠도) 15~28일을 본다. 처음엔 오늘이 있는 주가 보이게.
   */
  private drawAttendance(p: PlayerProgress): void {
    const now = gameNow();
    const st = attendanceState(p, now);
    const doneInCycle = st.claimedToday ? st.index + 1 : st.index;
    this.A(text(this, 40, 320, `출석 ${doneInCycle} / ${ATTENDANCE_28.length}일`, TYPE.caption, COLOR.text, true, true).setOrigin(0, 0.5));
    this.A(text(this, 680, 320, '위아래로 밀어 보기', 16, COLOR.textDim, true).setOrigin(1, 0.5));
    const top = 346;
    const viewH = 660;
    const CW = 150;
    const CH = 126;
    const weekH = 44 + 2 * (CH + 8) + 14; // 주 제목 + 2줄(4칸·3칸) + 간격
    const box = this.A(this.add.container(0, top));
    const weeks = Math.ceil(ATTENDANCE_28.length / 7);
    for (let w = 0; w < weeks; w++) {
      const wy = w * weekH;
      box.add(text(this, 44, wy + 20, `${w + 1}주차 (${w * 7 + 1}~${w * 7 + 7}일)`, 18, COLOR.gold, true, true).setOrigin(0, 0.5));
      for (let k = 0; k < 7; k++) {
        const i = w * 7 + k;
        const r = ATTENDANCE_28[i];
        if (!r) break;
        const col = k < 4 ? k : k - 4;
        const perRow = k < 4 ? 4 : 3;
        const x = 360 + (col - (perRow - 1) / 2) * (CW + 12);
        const y = wy + 44 + CH / 2 + (k < 4 ? 0 : CH + 8);
        const got = i < doneInCycle;
        const today = !st.claimedToday && i === st.index;
        const big = (i + 1) % 7 === 0;
        // 7·14·21·28일 큰 보상(2026-11-25 Higgsfield): 금테 카드 + 뒤에서 천천히 도는 빛살 + 루비 날은 루비 보물 더미
        if (big && this.textures.exists('att-big-frame')) box.add(this.add.image(x, y - 8, 'att-big-frame').setDisplaySize(CW + 12, CH + 28).setAlpha(got ? 0.45 : 1));
        else box.add(plate(this, x, y, CW, CH, { r: 16, gold: today || big, fill: got ? 0x1a1626 : big ? 0x3a2a5a : undefined }));
        if (big && !got && this.textures.exists('att-rays')) {
          const ray = this.add.image(x, y - 2, 'att-rays').setDisplaySize(132, 132).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.75);
          box.add(ray);
          this.tweens.add({ targets: ray, angle: 360, duration: 9000, repeat: -1 });
        }
        box.add(text(this, x - CW / 2 + 14, y - CH / 2 + 18, `${i + 1}일`, 17, today ? COLOR.gold : COLOR.textSub, true, true).setOrigin(0, 0.5));
        const ic = activityRewardIcon(r);
        const icImg = big && r.rubies && this.textures.exists('att-ruby-hoard') ? 'att-ruby-hoard' : ic.image;
        if (this.textures.exists(icImg)) box.add(this.add.image(x, y - 2, icImg).setDisplaySize(big ? 76 : 62, big ? 76 : 62).setAlpha(got ? 0.35 : 1));
        else box.add(text(this, x, y - 2, ic.emoji, 40).setOrigin(0.5).setAlpha(got ? 0.35 : 1));
        box.add(text(this, x, y + CH / 2 - 22, ic.amount, 18, got ? COLOR.textDim : COLOR.text, true, true).setOrigin(0.5));
        if (got) box.add(text(this, x + CW / 2 - 22, y - CH / 2 + 20, '✔', 26, COLOR.ok, true, true).setOrigin(0.5));
        if (today) box.add(badge(this, x, y - CH / 2 - 2, '오늘', COLOR.ok));
      }
    }
    // 보이는 칸만(가림막) + 끌기·휠로 스크롤
    const maskG = this.make.graphics({}, false).fillStyle(0xffffff).fillRect(0, top, 720, viewH);
    box.enableFilters();
    box.filters?.external.addMask(maskG, false, this.cameras.main); // Phaser 4 필터 마스크(src/ui/scroll.ts와 같은 방식)
    const minY = top - Math.max(0, weeks * weekH - viewH);
    const clamp = (y: number) => Phaser.Math.Clamp(y, minY, top);
    box.y = clamp(top - Math.floor(st.index / 7) * weekH);
    const hit = this.A(this.add.zone(360, top + viewH / 2, 720, viewH).setInteractive());
    let dragFrom: number | null = null;
    let boxFrom = box.y;
    hit.on('pointerdown', (ptr: Phaser.Input.Pointer) => { dragFrom = ptr.y; boxFrom = box.y; });
    // 끌기 처리는 이 영역에서만(화면을 다시 그릴 때마다 장면 전체에 처리기가 쌓이지 않게)
    hit.on('pointermove', (ptr: Phaser.Input.Pointer) => { if (dragFrom !== null && ptr.isDown) box.y = clamp(boxFrom + (ptr.y - dragFrom)); });
    hit.on('pointerup', () => { dragFrom = null; });
    hit.on('pointerout', () => { dragFrom = null; });
    hit.on('wheel', (_p: unknown, _dx: number, dy: number) => { box.y = clamp(box.y - dy * 0.8); });
    const shown = st.claimedToday ? `내일 보상: ${activityRewardText(ATTENDANCE_28[(st.index + 1) % ATTENDANCE_28.length])}` : `오늘 보상: ${activityRewardText(ATTENDANCE_28[st.index])}`;
    this.A(text(this, 360, 1040, shown, 17, COLOR.textSub, true).setOrigin(0.5));
    const b = this.keep(button(this, 360, 1100, 360, 68, st.claimedToday ? '내일 또 만나요' : '오늘 출석 받기', () => this.claimAttendance(), { kind: st.claimedToday ? 'secondary' : 'growth', size: TYPE.body }));
    b.setEnabled(!st.claimedToday);
  }

  private claimAttendance(): void {
    const r = Progress.claimDailyAttendance(gameNow());
    if (r.ok) {
      playSfx(this, r.day % 7 === 0 ? 'sfx-day7' : 'sfx-claim'); // 7·14·21·28일 큰 보상은 전용 소리
      rewardPopup(this, `출석 ${r.day}일차 보상`, activityItems(r.reward, r.cardDragon, r.runeId));
    } else toast(this, r.reason === 'claimed' ? '오늘은 이미 받았어요' : '받을 수 없어요', COLOR.danger);
    this.refresh();
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
/** 업적별 메달 등급(2026-11-26 AI 1차안: 첫 판 동 · 첫 엘리트·수집 은 · 1,000마리 금 · 10,000마리 다이아) */
const ACH_MEDAL: Record<string, 'bronze' | 'silver' | 'gold' | 'diamond'> = { 'first-run': 'bronze', 'first-elite': 'silver', 'collector-3': 'silver', 'kills-1000': 'gold', 'kills-10000': 'diamond' };
type Only = 'mission' | 'progress' | 'achievements' | 'attendance';
const ONLY_TITLE: Record<Only, string> = { mission: '미션', progress: '진행도', achievements: '업적', attendance: '출석' };

/** 진행도 보상 → 보상 카드 */

/** 보상 팝업 테두리 등급(드래곤 희귀도 → 일반·희귀·영웅·전설) */
function gradeOf(id: DragonId): 'common' | 'rare' | 'epic' | 'legendary' {
  const r = DRAGONS[id].rarity;
  return r === 'starter' ? 'common' : r;
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
  if (!r.gold && !r.rubies && !r.pickCards && !r.randomFragments) return { image: '', emoji: '⭐', amount: '활동 +20' };
  const many = [r.gold, r.rubies, r.pickCards, r.randomFragments].filter(Boolean).length > 1 ? '+' : '';
  if (r.rubies) return { image: 'ui-ruby', emoji: '💎', amount: `${r.rubies}${many}` };
  if (r.gold) return { image: 'ui-gold', emoji: '🪙', amount: `${r.gold}${many}` };
  if (r.pickCards) return { image: 'ui-card', emoji: '🃏', amount: `${r.pickCards}장${many}` };
  return { image: 'ui-fragment', emoji: '🧩', amount: `랜덤 ${r.randomFragments ?? 0}${many}` };
}

/** 활동·출석 보상 → 보상 카드 */
function activityItems(r: ActivityReward, choice?: DragonId, runeId?: string): RewardItem[] {
  const out: RewardItem[] = [];
  if (r.rubies) out.push({ image: 'ui-ruby', emoji: '💎', label: '루비', amount: `+${r.rubies.toLocaleString()}`, grade: 'rare' });
  if (r.gold) out.push({ image: 'ui-gold', emoji: '🪙', label: '골드', amount: `+${r.gold.toLocaleString()}` });
  if (r.pickCards && choice) out.push({ portrait: choice, label: `${DRAGONS[choice].short} 카드`, amount: `+${r.pickCards}`, grade: gradeOf(choice) });
  if (r.runeFragments) {
    const rune = RUNES.find((x) => x.id === runeId);
    out.push({ image: runeId ? `sp-${runeId}` : 'ui-fragment', emoji: rune?.icon ?? '🔷', label: `${rune?.name ?? '룬'} 조각`, amount: `+${r.runeFragments}`, grade: 'epic' });
  }
  const t = r.tickets ?? {};
  if (t.dragon) out.push({ image: 'ui-ticket', emoji: '🎟', label: '드래곤 상자 개봉권', amount: `+${t.dragon}`, grade: 'epic' });
  if (t.equipment) out.push({ image: 'ui-ticket-equip', emoji: '🎟', label: '장비 상자 개봉권', amount: `+${t.equipment}`, grade: 'rare' });
  if (t.rune) out.push({ image: 'ui-ticket-rune', emoji: '🎟', label: '룬 상자 개봉권', amount: `+${t.rune}`, grade: 'rare' });
  return out;
}
