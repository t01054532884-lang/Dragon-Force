import Phaser from 'phaser';
import { makeTextures } from '../textures';
import { STAGES } from '../data/stages';
import { DRAGONS, ELEMENT_LABEL, RARITY_COLOR, RARITY_LABEL } from '../data/dragons';
import { DIFFICULTIES, DIFFICULTY_LABEL, DIFFICULTY_RELEASED, DIFFICULTY_UNLOCK_AT, STAGE_COUNT, type Difficulty } from '../data/economy';
import { cpVerdict, recommendedCp } from '../data/power';
import { hardStage } from '../data/hardStages';
import { attendanceActive, attendedToday, pendingDifficultyUnlock, CHEST_TIERS, claimableMissions, claimableStageBoxes, eventActive, eventState, progressPct, Progress, spinsAvailable, stageChestState, stageReach } from '../systems/Progress';
import { loadout } from '../systems/Loadout';
import { pendingGifts, staminaNow } from '../systems/Mailbox';
import { STAMINA, formatLeft, nextRegenIn } from '../systems/Stamina';
import { devMode, devQuery, gameNow } from '../ui/widgets';
import { enterBattle } from '../ui/entry';
import { drawLobbyBackdrop, makeArtPlaceholders, preloadArt } from '../ui/art';
import { button, modal, navBar, text, type KitButton } from '../ui/kit';
import { applySound, loadSettings, markTip, saveSettings, tipSeen } from '../systems/Settings';
import { PACKAGES } from '../data/economy';
import { RUNE_MILESTONES, RUNE_MILESTONE_TICKETS, runeGiftId } from '../systems/Mailbox';
import { passValuePct } from '../data/pass';
import { playSfx, preloadSfx, UI_SFX_FILES } from '../systems/Sfx';
import { playMusic, preloadMusic, refreshMusic } from '../systems/Music';
import { altar, iconTile, plate, tabs, topBar, torch, wingBanner } from '../ui/kit2';
import { COLOR, css, TYPE } from '../ui/theme';
import { giftAlert } from '../ui/giftFx';
import { bundleItems, difficultyUnlock, openSmallChest, rewardPopup } from '../ui/celebrate';
import { openStaminaShop } from '../ui/staminaShop';
import { account, shortId } from '../systems/Account';
import { cloud, cloudLine } from '../systems/Cloud';
import { summaryLine } from '../systems/cloudSync';
import { attendanceState, claimableActivity } from '../systems/Activity';
import { DEMO, PLATFORM, platform } from '../platform';
import { goTab, navTabsWithAlerts } from '../ui/screen';
import { accountLevel } from '../systems/AccountLevel';
import { claimablePass, syncPass } from '../systems/Pass';
import { claimableRubyPass } from '../systems/RubyPass';
import { rubyPassValuePct } from '../data/rubyPass';
import { ATTENDANCE_28, activityRewardIcon, activityRewardText } from '../data/activity';
import { fullH } from '../ui/layout';
import { purchases } from '../systems/Purchases';
import { rotationIndex, syncSkinBoard } from '../systems/Skins';
import { SKIN_ROULETTE } from '../data/skins';
import { makeSkinTextures, skinIconKey } from '../ui/skinArt';
import { offY } from '../ui/layout';

/** 처리방침·약관 공개 주소(GitHub Pages, public/*.html) */
const LEGAL_BASE = 'https://t01054532884-lang.github.io/Dragon-Force/';

/** 접속 출석 팝업을 이번 실행에서 이미 띄운 날(같은 날 로비에 다시 와도 또 뜨지 않게) */
let attendancePopupShown = '';
/** 계정 레벨 축하·권유 팝업을 띄우는 레벨(2026-11-26 제작자) */
const LV_PROMO = [5, 10, 15, 20, 25, 30];

/**
 * 메인 로비(8단계 v2.0 필수 B, 기획자 UI 시안 형식): 머리줄(출격 드래곤·행동력·골드·루비·전투력) · 날개 배너(단계·난이도·진행도)
 * · 양옆 바로가기(보상·겨울 축제 / 선물함) · 제단 위 출격 드래곤(숨쉬기·터치 반응) · 보유 드래곤 캐러셀 · 난이도 탭
 * · 단계 선택과 권장 전투력 · 전투 시작(행동력 5) · 하단 탭.
 * 기능·조건·수치는 예전 로비와 같다(그림과 배치만 바뀜).
 */
export class LobbyScene extends Phaser.Scene {
  /** 0 = 앱을 막 켬 → 가장 최근에 열린(가장 높은) 단계로 시작(제작자 피드백 2026-11-25: 껐다 켜면 1단계로 돌아가 있었음) */
  private stageId = 0;
  /** 개발용(?dev=1)으로 잠긴 난이도를 고른 경우(저장하지 않는 시험 플레이) */
  private devDiff: Difficulty | null = null;
  private exitLayer: Phaser.GameObjects.GameObject[] = [];
  private settingsUi: { close: () => void } | null = null;

  constructor() {
    super('lobby');
  }

  preload(): void {
    // 기획자 그림 전체(로비가 첫 화면이라 여기서 한 번 읽으면 다른 화면도 같은 그림을 쓴다)
    preloadArt(this);
    preloadMusic(this, ['bgm-lobby']);
    preloadSfx(this, [...UI_SFX_FILES, 'sfx-chest-shake', 'sfx-chest-open']); // 진행도 상자 개봉 + 보상·해금·확인 소리(상점·보상·드래곤 화면이 같이 씀)
  }

  /**
   * 뒤로가기(로비): 종료 확인 창을 띄운다(앱인토스 검수 기준: 종료 시 확인).
   * 창이 떠 있을 때 한 번 더 누르면 창을 닫는다. 종료할 수 없는 플랫폼(iOS·웹)은 아무것도 안 함.
   */
  onPlatformBack(): boolean {
    if (this.settingsUi) {
      this.closeSettings();
      return true;
    }
    if (!platform.canExit) return true;
    if (this.exitLayer.length) {
      this.closeExit();
      return true;
    }
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => (this.exitLayer.push(o), o);
    add(this.add.rectangle(360, 640, 720, fullH(this), 0x000000, 0.7).setInteractive().setDepth(500));
    add(plate(this, 360, 640, 560, 340, { r: 28 }).setDepth(501));
    add(text(this, 360, 570, '게임을 종료할까요?', TYPE.title, COLOR.text, true, true).setOrigin(0.5).setDepth(502));
    add(text(this, 360, 622, '진행 상황은 저장돼 있어요', TYPE.caption, COLOR.textSub).setOrigin(0.5).setDepth(502));
    add(button(this, 250, 720, 200, 84, '취소', () => this.closeExit(), { kind: 'secondary', size: TYPE.body }).root.setDepth(502));
    add(button(this, 470, 720, 200, 84, '종료', () => platform.exit(), { kind: 'danger', size: TYPE.body }).root.setDepth(502));
    return true;
  }

  private closeExit(): void {
    this.exitLayer.forEach((o) => o.destroy());
    this.exitLayer = [];
  }

  create(): void {
    this.exitLayer = [];
    this.settingsUi = null;
    if (!this.textures.exists('dragon-red')) makeTextures(this);
    makeArtPlaceholders(this);
    const dev = devMode();
    const now = gameNow();
    // 테스터 링크(?dev=1, 웹만): 로비에 올 때마다 루비·골드 20,000 이상 + 만든 단계 전부 열기
    if (devQuery()) Progress.devBoost(STAGES.map((st) => st.id));
    Progress.syncMail(now, dev); // 운영자 캠페인·지난 최초 클리어 소급 → 선물함, 오래된 선물 정리
    const p = Progress.load();
    const curDiff: Difficulty = this.devDiff ?? p.selectedDifficulty;
    const dp = p.difficulty[curDiff];
    if (this.stageId === 0 || !dp.unlocked.includes(this.stageId)) this.stageId = Math.max(1, ...dp.unlocked.filter((s) => STAGES.some((st) => st.id === s)));

    drawLobbyBackdrop(this, this.stageId); // 단계별 배경(받은 단계만, 그림 요청서 10)
    playMusic(this, 'bgm-lobby'); // 메뉴 화면끼리는 같은 곡을 끊지 않고 이어 감
    const d = DRAGONS[p.selectedDragonId];
    const o = p.dragons[d.id];
    const lo = loadout(p, d.id);

    // ── 머리줄: 출격 드래곤 · 행동력(+ = 행동력 구매 창) · 골드(+ = 상점 골드) · 루비(+ = 상점 루비 구매) · 전투력 — 제작자 2026-11-26
    const bar = topBar(this, {
      portrait: `portrait-${d.id}`,
      level: accountLevel(p).level, // 계정 레벨(2026-11-23, 드래곤 레벨 아님)
      cp: lo.cp.toLocaleString(),
      currencies: [
        { icon: 'ui-energy', value: '', onPlus: () => (this.settingsUi = openStaminaShop(this, () => this.scene.restart())) },
        { icon: 'ui-gold', value: p.gold, onPlus: () => this.scene.start('shop', { focus: 'gold' }) },
        { icon: 'ui-ruby', value: p.rubies, onPlus: () => this.scene.start('shop', { focus: 'ruby' }) },
      ],
    });
    bar.root.setY(-offY(this)); // 머리줄은 실제 화면 맨 위에(세로가 긴 화면)
    const tickStamina = () => {
      const t = gameNow();
      const st = staminaNow(Progress.load(), t);
      const left = nextRegenIn(st, t);
      bar.set(0, `${st.value}/${STAMINA.max}`, left === null ? (st.value >= STAMINA.max ? '가득' : '') : `${formatLeft(left)} 후 +1`);
    };
    tickStamina();
    this.time.addEvent({ delay: 1000, loop: true, callback: tickStamina });

    // ── 날개 배너: 단계 이름 · 난이도 · 진행도
    const s0 = STAGES.find((st) => st.id === this.stageId);
    wingBanner(this, 360, 222, 430, `${this.stageId}단계 · ${s0 ? s0.name : '준비 중'}`, {
      sub: `${DIFFICULTY_LABEL[curDiff]} · 왕국 정복 ${p.difficulty[curDiff].cleared.length}/${STAGE_COUNT} (${progressPct(p, curDiff)}%)`,
      // 어려움이면 배너 문장을 어려움 배지로(badge-hard, 요청서 6 ⑤)
      emblem: curDiff === 'hard' && this.textures.exists('badge-hard') ? 'badge-hard' : 'ic-banner',
    });

    // ── 양옆 바로가기
    const live = eventActive(now);
    const evAlert = live && (spinsAvailable(eventState(p)) > 0 || (attendanceActive(now) && !attendedToday(p, now)));
    // 2026-11-22 제작자 요청: 왼쪽 이벤트·미션·업적·출석, 오른쪽 우편함·설정. 진행도 상자는 드래곤 아래에서 바로 받기
    const t0 = gameNow();
    const missionAlert = claimableMissions(p, t0).length > 0 || claimableActivity(p, t0) > 0;
    const side = (x: number, i: number, icon: string, label: string, onClick: () => void, alert = false) =>
      iconTile(this, x, 312 + i * 100, icon, { size: 76, label, alert, onClick });
    const toMissions = (tab: string) => () => this.scene.start('missions', { tab, only: tab === 'daily' ? 'mission' : tab });
    // (2026-11-23 제작자 결정) 이벤트 버튼은 기간 중에만 보인다 — 시작 전 "12/1에 시작합니다"만 있는 화면이
    // 심사 2.1(미완성)로 보이지 않게. 12/1이 되면 로비에 들어올 때 저절로 나타나고, 끝나면 다시 사라진다.
    // 개발 모드(?dev=1)에서는 기간 밖에도 보여 시험할 수 있다. 데모(?demo=1)는 출시 화면과 같게 숨긴다.
    const leftTiles: [string, string, () => void, boolean][] = [];
    if (live || (dev && !DEMO)) leftTiles.push(['ic-cal-star', live ? '이벤트' : '이벤트(시험)', () => this.scene.start('event'), evAlert]);
    // 스킨 룰렛(2026-11-23 밤 제작자 요청: 겨울 축제 아래). 열쇠는 App Store 결제로만 → 결제가 되는 iOS 앱(또는 개발 모드)에서만 보임.
    // 열쇠가 남아 있으면 "!"(이번 판에 남은 칸이 있을 때)
    if (purchases.available || (dev && !DEMO)) {
      makeSkinTextures(this);
      const sk = syncSkinBoard(p, t0).skins;
      leftTiles.push([skinIconKey(SKIN_ROULETTE.rotations[rotationIndex(t0)].cape), '스킨 룰렛', () => this.scene.start('skins'), sk.keys > 0 && sk.board.picked.length < 9]);
    }
    leftTiles.push(['ic-mission', '미션', toMissions('daily'), missionAlert]);
    leftTiles.push(['ic-trophy', '업적', toMissions('achievements'), false]);
    leftTiles.push(['ic-calendar', '출석', toMissions('attendance'), !attendanceState(p, t0).claimedToday]);
    // 왼쪽은 4칸까지(그 아래는 단계 상자 판) — 넘치는 칸은 오른쪽 패스 아래로
    const overflow = leftTiles.splice(4);
    leftTiles.forEach(([icon, label, onClick, alert], i) => side(62, i, icon, label, onClick, alert));
    overflow.forEach(([icon, label, onClick, alert], i) => side(658, 3 + i, icon, label, onClick, alert));
    side(658, 0, 'ui-mailbox', '우편함', () => this.scene.start('gifts'));
    giftAlert(this, 658, 310, 76, pendingGifts(p.mailbox, now).map((g) => g.id));
    side(658, 1, 'ic-gear', '설정', () => this.openSettings());
    // 드래곤 패스(2026-11-23 제작자 요청: 설정 아래) — 받을 칸이 있으면 !
    side(658, 2, this.textures.exists('pass-royal') ? 'pass-royal' : 'ic-crown', '패스', () => this.openPassMenu(), claimablePass(syncPass(p, t0)).length > 0 || claimableRubyPass(p).length > 0);

    // ── 횃불 · 제단 · 출격 드래곤(숨쉬기 + 터치하면 살짝 뛰어오름)
    torch(this, 172, 560);
    torch(this, 548, 560);
    altar(this, 360, 598, 400);
    const hero = this.add.image(360, 428, `portrait-${d.id}`).setDisplaySize(310, 310);
    const baseScale = hero.scaleX;
    this.tweens.add({ targets: hero, y: 418, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    hero.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.tweens.add({ targets: hero, scaleX: baseScale * 1.06, scaleY: baseScale * 0.94, duration: 90, yoyo: true, ease: 'Quad.Out' });
    });
    const rc = RARITY_COLOR[d.rarity];
    // 이름·정보를 한 줄로(아래에 진행도 상자 자리)
    const nameT = text(this, 0, 640, `${d.name} ${'★'.repeat(o.stars)}`, TYPE.caption, COLOR.text, true, true).setOrigin(0, 0.5);
    const infoT = text(this, 0, 640, `${ELEMENT_LABEL[d.element]} · ${RARITY_LABEL[d.rarity]} · Lv.${o.level}`, TYPE.tiny, rc, true, true).setOrigin(0, 0.5);
    const lineW = nameT.width + 12 + infoT.width;
    nameT.setX(360 - lineW / 2);
    infoT.setX(nameT.x + nameT.width + 12);

    // ── 단계 상자(2026-11-23 제작자 요청: 25·50·100% 대신 단계마다, 드래곤 아래, 보상은 받기 전 비공개)
    this.progressChests(p, curDiff);

    // (2026-11-23 제작자 결정) 로비의 드래곤 바꾸기 줄은 없앰 — 출격 드래곤은 드래곤 화면의 "출격하기"로만 정하고, 로비는 그 드래곤만 보여 줌.
    // 그 자리는 진행도 상자를 크게.

    // ── 난이도 탭: 출시한 난이도만 보인다(기획자 요청 1, 2026-11-20 — 심사 2.1 미완성 노출 방지). 진행 데이터는 그대로 둔다.
    // 개발 모드에서는 미출시 난이도도 보여 시험 플레이. 보이는 난이도가 하나뿐이면 탭을 그리지 않는다.
    // 데모(?demo=1)는 출시 화면과 같게 보여야 하므로 미출시 난이도를 숨긴다
    // (2026-11-23) 개발 모드에서도 미출시 난이도는 숨김(제작자: 심사·이용자에게 보이면 안 됨). 시험할 때만 ?dev=1&unreleased=1
    const showUnreleased = dev && !DEMO && new URLSearchParams(location.search).has('unreleased');
    const shownDiffs = DIFFICULTIES.filter((k) => DIFFICULTY_RELEASED[k] || showUnreleased);
    const labels = shownDiffs.map((k) => {
      const released = DIFFICULTY_RELEASED[k];
      const real = released && p.difficulty[k].unlocked.length > 0;
      return released ? `${DIFFICULTY_LABEL[k]}${real ? '' : ' 🔒'}` : `${DIFFICULTY_LABEL[k]} · 출시 예정`;
    });
    if (shownDiffs.length > 1) tabs(this, 914, labels, shownDiffs.indexOf(curDiff), (i) => {
      const k = shownDiffs[i];
      const real = DIFFICULTY_RELEASED[k] && p.difficulty[k].unlocked.length > 0;
      if (real) {
        this.devDiff = null;
        Progress.selectDifficulty(k);
      } else if (dev) {
        this.devDiff = k;
      } else {
        const prevLabel = DIFFICULTY_LABEL[DIFFICULTIES[DIFFICULTIES.indexOf(k) - 1]];
        const need = k === 'easy' ? 0 : DIFFICULTY_UNLOCK_AT[k];
        this.toast(DIFFICULTY_RELEASED[k] ? `${prevLabel} ${need}단계를 깨면 열려요` : '다음 업데이트에서 열려요');
        return;
      }
      this.scene.restart();
    });

    // ── 단계 선택 + 권장 전투력
    // 제작자 요청(2026-11-22): 단계 이름 아래에는 권장 전투력만
    plate(this, 360, 994, 660, 84, { r: 24 });
    const stageText = text(this, 360, 976, '', TYPE.body, COLOR.text, true, true).setOrigin(0.5);
    const cpLine = text(this, 360, 1014, '', TYPE.tiny, COLOR.text, true, true).setOrigin(0.5);
    const arrow = (dir: -1 | 1) => {
      const tri = this.add.triangle(360 + dir * 290, 994, 0, -26, 0, 26, dir * 32, 0, 0xffe39a).setStrokeStyle(4, COLOR.outline);
      // 왼쪽 화살표는 꼭짓점이 음수 좌표라 도형 자체의 누르는 영역이 오른쪽으로 밀림(제작자 버그 제보 2026-11-22)
      // → 화살표 그림 위에 넓은 투명 영역을 따로 깔아 누른다
      const hit = this.add.zone(344 + dir * 306, 994, 84, 94); // 그림 가운데(왼쪽 38 · 오른쪽 650)
      hit.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
        const nx = this.stageId + dir;
        if (nx < 1 || nx > STAGE_COUNT) return;
        this.stageId = nx;
        this.scene.restart();
      });
      return tri;
    };
    const prev = arrow(-1);
    const next = arrow(1);
    const unlocked = this.devDiff ? [1] : dp.unlocked;
    const s = s0;
    const isOpen = unlocked.includes(this.stageId);
    const cleared = p.difficulty[curDiff].cleared.includes(this.stageId);
    stageText.setText(`${this.stageId}단계 — ${s ? s.name : '준비 중'}`);
    // 어려움: 단계 이름·특수 기믹·최초 클리어 루비·최고 기록(기획서 9장)
    const hs = curDiff === 'hard' ? hardStage(this.stageId) : null;
    const bestMs = p.difficulty[curDiff].best?.[String(this.stageId)];
    const bestTxt = bestMs ? ` · 최고 ${Math.floor(bestMs / 60000)}:${String(Math.floor(bestMs / 1000) % 60).padStart(2, '0')}` : '';
    if (hs) {
      stageText.setText(`어려움 ${this.stageId} — ${hs.title}`);
      if (this.textures.exists('badge-hard')) this.add.image(360 - stageText.width / 2 - 24, 976, 'badge-hard').setDisplaySize(38, 38);
    }
    const rec = recommendedCp(this.stageId, curDiff);
    const v = cpVerdict(lo.cp, rec);
    cpLine.setText(`권장 전투력 ${rec.toLocaleString()} · 현재 ${lo.cp.toLocaleString()} — ${v.text}`).setColor(v.color);
    void cleared;
    void bestTxt;
    prev.setAlpha(this.stageId > 1 ? 1 : 0.3);
    next.setAlpha(this.stageId < STAGE_COUNT ? 1 : 0.3);

    // ── 전투 시작(행동력 5, 부족하면 안내)
    const canGo = !!s && isOpen;
    const go = () => {
      if (canGo) enterBattle(this, { stageId: this.stageId, difficulty: curDiff }, { free: !!this.devDiff });
    };
    const startBtn: KitButton = button(this, 360, 1088, 420, 80, !s ? '준비 중' : !isOpen ? '잠김' : '전투 시작', go, {
      kind: 'cta', size: 36, icon: canGo ? 'ic-swords' : undefined, sub: canGo ? `${DIFFICULTY_LABEL[curDiff]} · 행동력 ${this.devDiff ? 0 : STAMINA.entryCost}` : undefined,
    });
    startBtn.setEnabled(canGo);
    if (canGo) this.tweens.add({ targets: startBtn.root, scale: 1.03, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.InOut' });

    // ── 하단 탭
    navBar(this, navTabsWithAlerts('lobby'), 'lobby', (k) => {
      if (k !== 'lobby') goTab(this, k);
    }).setY(offY(this)); // 하단 메뉴는 실제 화면 맨 아래에(세로가 긴 화면)

    this.input.keyboard?.on('keydown-ENTER', go);
    if (dev) this.devTools();
    // 클라우드 저장: 이 기기와 서버 기록이 둘 다 바뀌었으면 고르기(자동 덮어쓰기 금지)
    if (cloud.conflict) this.openCloudChoice();
    else {
      this.maybeUnlockPopup(() => this.maybeRuneGiftPopup(() => this.maybeLevelPromo(() => this.maybeAttendancePopup())));
      const watch = () => {
        if (cloud.conflict && this.scene.isActive()) this.openCloudChoice();
      };
      cloud.onChange(watch);
      this.events.once('shutdown', () => cloud.listeners.splice(cloud.listeners.indexOf(watch) >>> 0, 1));
    }
  }

  /**
   * 난이도 해금 연출(2026-11-24): 쉬움 10단계를 처음 깨고 로비에 오면 한 번. "도전하기"는 그 난이도 1단계를 고른 로비로.
   * 연출을 닫은 뒤에 출석 팝업이 이어서 뜬다.
   */
  private maybeUnlockPopup(then: () => void): void {
    const d = DEMO ? null : pendingDifficultyUnlock(Progress.load());
    if (!d) return then();
    Progress.markUnlockSeen(d);
    const prev = DIFFICULTIES[DIFFICULTIES.indexOf(d) - 1];
    const n = d === 'easy' ? 0 : DIFFICULTY_UNLOCK_AT[d];
    difficultyUnlock(this, {
      title: `${DIFFICULTY_LABEL[d]} 모드 해금!`,
      sub: `${DIFFICULTY_LABEL[prev]} ${n}단계 돌파! 이제 ${DIFFICULTY_LABEL[d]} 1단계에 도전할 수 있어요`,
      detail: `${DIFFICULTY_LABEL[d]} 1단계 권장 전투력 ${recommendedCp(1, d).toLocaleString()}`, // 부가 설명 줄("단계마다 새로운 기믹 · 처음 깰 때 루비 보상")은 뺌(제작자 11/25)
      color: d === 'hard' ? 0xff5a4a : 0xb04aff,
      goLabel: '도전하기',
    }, () => {
      Progress.selectDifficulty(d);
      this.devDiff = null;
      this.stageId = 1;
      this.scene.restart();
    }, then);
  }

  /**
   * 계정 레벨 축하 팝업(2026-11-26 제작자): 5·10·15·20·25·30레벨이 되면 로비에서 한 번 — 축하 + 드래곤 패스·패키지 권유.
   * 한 번에 여러 단계를 넘었으면 가장 높은 것만 보여 주고 나머지는 본 것으로. 결제가 없는 빌드(웹·토스)는 띄우지 않는다.
   */
  private maybeLevelPromo(then: () => void): void {
    if (DEMO || !(purchases.available || devMode())) return then();
    const p = Progress.load();
    const lv = accountLevel(p).level;
    const due = LV_PROMO.filter((n) => n <= lv && !tipSeen(`lv-promo-${n}`));
    if (!due.length) return then();
    for (const n of due) markTip(`lv-promo-${n}`);
    const n = due[due.length - 1];
    const pk = PACKAGES[LV_PROMO.indexOf(n) % PACKAGES.length];
    const royalFirst = n >= 20; // 높은 레벨일수록 로열 패스를 먼저 권함
    playSfx(this, 'sfx-upgrade');
    const m = modal(this, 690, 860, `계정 레벨 ${n} 달성!`, { closeOnBackdrop: true, ribbonColor: COLOR.gold, depth: 900 });
    // 축하 문장 그림(2026-11-26 Higgsfield): 가운데 둥근 판에 레벨 숫자
    if (this.textures.exists('lvup-crest')) {
      const crest = this.add.image(0, -270, 'lvup-crest');
      crest.setScale(560 / crest.width);
      m.body(crest);
      m.body(text(this, -14, -284, String(n), 64, 0x7a3a00, true, true).setOrigin(0.5));
    } else m.body(text(this, 0, -270, '축하드립니다! 🎉', TYPE.title, COLOR.gold, true, true).setOrigin(0.5));
    m.body(text(this, 0, -122, '축하드립니다! ' + (n >= 20 ? '여기까지 온 용사님께 드리는 특별 제안' : '더 빠르게 강해지고 싶다면 지금이 기회예요'), TYPE.caption, COLOR.text, true, true).setOrigin(0.5));
    const card = (x: number, icon: string, title: string, line1: string, line2: string, go: () => void, kind: 'magic' | 'cta' | 'growth') => {
      const g = this.add.graphics();
      g.fillStyle(0x2b2442, 1).fillRoundedRect(x - 102, -86, 204, 330, 18);
      g.lineStyle(3, COLOR.gold, 0.9).strokeRoundedRect(x - 102, -86, 204, 330, 18);
      m.body(g);
      if (this.textures.exists(icon)) m.body(this.add.image(x, -10, icon).setDisplaySize(110, 110));
      m.body(text(this, x, 70, title, 22, COLOR.gold, true, true).setOrigin(0.5));
      m.body(text(this, x, 104, line1, 19, 0xffe14d, true, true).setOrigin(0.5));
      m.body(text(this, x, 134, line2, 14, COLOR.textSub, true, true).setOrigin(0.5).setAlign('center'));
      m.body(button(this, x, 198, 170, 58, '보러 가기', () => { m.close(); go(); }, { kind, size: TYPE.caption }).root);
    };
    card(-215, royalFirst ? 'pass-royal' : 'pass-premium', '드래곤 패스', `최대 ${passValuePct('royal').toLocaleString()}% 가치`, '시즌마다 새 보상', () => this.scene.start('pass'), 'magic');
    card(0, this.textures.exists('ruby-pack-5') ? 'ruby-pack-5' : 'ui-ruby', '루비 패스', `${rubyPassValuePct().toLocaleString()}% 가치`, '레벨만 올려도\n루비가 쏟아져요', () => this.scene.start('rubypass'), 'cta');
    card(215, ['pkg-dragon', 'pkg-gear', 'pkg-rune'][PACKAGES.indexOf(pk)] ?? 'pkg-dragon', pk.name, `₩${pk.krw.toLocaleString()}`, '계정당 1회 한정', () => this.scene.start('shop', { focus: 'package' }), 'growth');
    m.body(button(this, 0, 340, 260, 64, '닫기', () => m.close(), { kind: 'secondary', size: TYPE.caption }).root);
    m.box.once('destroy', then); // 닫으면 이어서 출석 팝업
  }

  /**
   * 10·20단계 클리어 축하(2026-11-26 제작자): 쉬움·어려움 10·20단계를 처음 깨서 룬 상자 10회권이 선물함에 들어갔으면 한 번.
   * 여러 개가 한꺼번이면(소급 지급) 한 창에 모아서. "선물함 가기"는 선물함으로.
   */
  private maybeRuneGiftPopup(then: () => void): void {
    if (DEMO) return then();
    const p = Progress.load();
    const LABEL: Record<string, string> = { easy: '쉬움', hard: '어려움' };
    const due = RUNE_MILESTONES.filter((m) => p.mailbox.granted.includes(runeGiftId(m.difficulty, m.stageId)) && !tipSeen(`rune-pop-${runeGiftId(m.difficulty, m.stageId)}`));
    if (!due.length) return then();
    for (const m of due) markTip(`rune-pop-${runeGiftId(m.difficulty, m.stageId)}`);
    const names = due.map((m) => `${LABEL[m.difficulty] ?? m.difficulty} ${m.stageId}단계`);
    const total = due.length * RUNE_MILESTONE_TICKETS;
    playSfx(this, 'sfx-reward-rare');
    const m = modal(this, 660, 760, `${names[names.length - 1]} 클리어!`, { closeOnBackdrop: true, ribbonColor: 0x7b3fe4, depth: 900 });
    if (this.textures.exists('rune-reward-pop')) {
      const im = this.add.image(0, -150, 'rune-reward-pop');
      im.setScale(Math.min(560 / im.width, 340 / im.height));
      m.body(im);
      this.tweens.add({ targets: im, scale: im.scale * 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
    m.body(text(this, 0, 60, '축하드립니다! 🎉', TYPE.title, COLOR.gold, true, true).setOrigin(0.5));
    m.body(text(this, 0, 128, `${names.join(' · ')} 클리어 보상으로\n룬 상자 ${total}회권을 선물함에 넣어드렸어요!`, TYPE.caption, COLOR.text, true, true).setOrigin(0.5).setAlign('center').setLineSpacing(6));
    m.body(button(this, -140, 270, 240, 72, '닫기', () => m.close(), { kind: 'secondary', size: TYPE.caption }).root);
    m.body(button(this, 140, 270, 240, 72, '선물함 가기', () => { m.close(); this.scene.start('gifts'); }, { kind: 'growth', size: TYPE.caption }).root);
    m.box.once('destroy', then);
  }

  /** 로비 "패스" → 드래곤 패스 / 루비 패스 고르기(2026-11-26 제작자) */
  private openPassMenu(): void {
    const p = Progress.load();
    const m = modal(this, 640, 560, '패스', { closeOnBackdrop: true, ribbonColor: COLOR.gold, depth: 900 });
    // free: 지금 받을 수 있는 무료 칸 수 — 있으면 가치 줄 아래에 초록 안내(2026-11-26 제작자: 유료라고 생각해 안 누를 수 있어서)
    const row = (y: number, icon: string, title: string, sub: string, alert: boolean, free: number, go: () => void) => {
      const g = this.add.graphics();
      g.fillStyle(0x2b2442, 1).fillRoundedRect(-280, y - 80, 560, 160, 20);
      g.lineStyle(3, COLOR.gold, 0.9).strokeRoundedRect(-280, y - 80, 560, 160, 20);
      m.body(g);
      if (this.textures.exists(icon)) m.body(this.add.image(-200, y, icon).setDisplaySize(124, 124));
      m.body(text(this, -120, y - (free ? 40 : 26), title, TYPE.heading, COLOR.gold, true, true).setOrigin(0, 0.5));
      m.body(text(this, -120, y + (free ? 2 : 18), sub, TYPE.tiny, COLOR.text, true, true).setOrigin(0, 0.5));
      if (free) {
        const note = text(this, -120, y + 40, `🎁 무료 보상 ${free}개가 기다리고 있어요!`, 18, COLOR.ok, true, true).setOrigin(0, 0.5);
        m.body(note);
        this.tweens.add({ targets: note, alpha: 0.55, duration: 700, yoyo: true, repeat: -1 });
      }
      if (alert) m.body(text(this, 250, y - 56, '!', 30, COLOR.danger, true, true).setOrigin(0.5));
      const hit = this.add.rectangle(0, y, 560, 160, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => { m.close(); go(); });
      m.body(hit);
    };
    row(-100, this.textures.exists('pass-royal') ? 'pass-royal' : 'ic-crown', '드래곤 패스', `28일 시즌 · 최대 ${passValuePct('royal').toLocaleString()}% 가치`, claimablePass(syncPass(p, gameNow())).length > 0, claimablePass(syncPass(p, gameNow())).filter((c) => c.t === 'free').length, () => this.scene.start('pass'));
    row(90, this.textures.exists('ruby-pack-5') ? 'ruby-pack-5' : 'ui-ruby', '루비 패스', `계정 레벨 보상 · ${rubyPassValuePct().toLocaleString()}% 가치`, claimableRubyPass(p).length > 0, claimableRubyPass(p).filter((c) => c.t === 'free').length, () => this.scene.start('rubypass'));
  }

  /**
   * 접속 출석 팝업(참고 UI 비교 2026-11-22): 오늘 출석을 아직 안 받았으면 로비에 처음 들어올 때 한 번(앱을 켤 때마다).
   * 이번 주 7칸(오늘 강조)만 보여 주고, "받기"는 보상 화면 출석 탭으로 가서 같은 흐름으로 받는다(카드 고르기 날 포함).
   */
  private maybeAttendancePopup(): void {
    const now = gameNow();
    const p = Progress.load();
    const st = attendanceState(p, now);
    const day = new Date(now).toDateString();
    if (st.claimedToday || attendancePopupShown === day || DEMO) return;
    attendancePopupShown = day;
    const m = modal(this, 640, 520, `출석 ${st.index + 1}일차`, { closeOnBackdrop: true, ribbonColor: COLOR.ok, depth: 900 });
    const start = Math.floor(st.index / 7) * 7;
    for (let i = 0; i < 7; i++) {
      const idx = start + i;
      if (idx >= ATTENDANCE_28.length) break;
      const r = ATTENDANCE_28[idx];
      const ic = activityRewardIcon(r);
      const x = -246 + i * 82;
      const today = idx === st.index;
      const g = this.add.graphics();
      g.fillStyle(today ? 0x3a2a6b : 0x221d36, 1).fillRoundedRect(x - 38, -150, 76, 132, 12);
      g.lineStyle(today ? 4 : 2, today ? COLOR.gold : COLOR.line, 1).strokeRoundedRect(x - 38, -150, 76, 132, 12);
      m.body(g);
      m.body(text(this, x, -134, `${idx + 1}일`, 14, today ? COLOR.gold : COLOR.textSub, true, true).setOrigin(0.5));
      if (this.textures.exists(ic.image)) m.body(this.add.image(x, -88, ic.image).setDisplaySize(46, 46).setAlpha(idx < st.index ? 0.35 : 1));
      else m.body(text(this, x, -88, ic.emoji, 28).setOrigin(0.5));
      m.body(text(this, x, -42, idx < st.index ? '✔' : ic.amount, 13, idx < st.index ? COLOR.ok : COLOR.text, true, true).setOrigin(0.5));
    }
    m.body(text(this, 0, 30, `오늘 보상: ${activityRewardText(ATTENDANCE_28[st.index])}`, TYPE.caption, COLOR.text, true, true).setOrigin(0.5));
    m.body(text(this, 0, 70, '하루 빠져도 이어서 받아요', TYPE.tiny, COLOR.textSub, true).setOrigin(0.5));
    m.body(button(this, -130, 160, 220, 72, '나중에', () => m.close(), { kind: 'secondary', size: TYPE.caption }).root);
    m.body(button(this, 130, 160, 220, 72, '받기', () => {
      m.close();
      this.scene.start('missions', { tab: 'attendance', only: 'attendance', claim: true });
    }, { kind: 'growth', size: TYPE.caption }).root);
  }

  /** 저장 기록 선택: 이 기기 / 서버. 고르지 않은 쪽은 덮어써진다는 것을 알린다 */
  private openCloudChoice(): void {
    const c = cloud.conflict;
    if (!c) return;
    this.closeSettings();
    const m = modal(this, 640, 640, '저장 기록 선택', { ribbonColor: COLOR.violet, depth: 950 });
    m.body(text(this, 0, -200, '이 기기와 서버의 저장 기록이 달라요.\n이어서 할 기록을 골라 주세요.', TYPE.caption, COLOR.text, true, true).setOrigin(0.5).setAlign('center').setLineSpacing(8));
    const row = (y: number, title: string, line: string) => {
      m.body(text(this, -270, y - 22, title, TYPE.body, COLOR.gold, true, true).setOrigin(0, 0.5));
      m.body(text(this, -270, y + 18, line, 16, COLOR.textSub, true).setOrigin(0, 0.5).setWordWrapWidth(540));
    };
    row(-90, '이 기기 기록', summaryLine(c.local));
    row(10, '서버 기록', summaryLine(c.remote));
    m.body(text(this, 0, 92, '고르지 않은 기록은 지워지고 되돌릴 수 없어요', TYPE.tiny, COLOR.danger, true).setOrigin(0.5));
    const pick = (choice: 'local' | 'remote') =>
      cloud.resolve(choice).then((ok) => {
        m.close();
        if (!ok) this.toast('지금은 고를 수 없어요. 잠시 뒤 다시 시도해 주세요');
        this.scene.restart();
      });
    m.body(button(this, -140, 200, 250, 84, '이 기기 기록', () => void pick('local'), { kind: 'secondary', size: TYPE.caption }).root);
    m.body(button(this, 140, 200, 250, 84, '서버 기록', () => void pick('remote'), { kind: 'primary', size: TYPE.caption }).root);
    this.settingsUi = m;
  }

  /** 설정 창(첫 제출: 효과음 켜기/끄기만 — 제작자 결정 2026-11-20). 저장은 진행 저장과 따로 */
  private openSettings(): void {
    this.closeSettings();
    const st = loadSettings();
    const m = modal(this, 600, 820, '설정', { closeOnBackdrop: true, ribbonColor: COLOR.violet });
    m.body(text(this, -240, -300, '소리', TYPE.heading, COLOR.text, true, true).setOrigin(0, 0.5));
    // 로비 설정은 효과음·배경 음악을 함께 켜고 끈다(따로는 전투 일시정지 화면에서)
    const on = st.sound || st.music;
    m.body(text(this, -240, -256, `효과음 ${st.sound ? '켜짐' : '꺼짐'} · 배경 음악 ${st.music ? '켜짐' : '꺼짐'}`, TYPE.tiny, COLOR.textSub, true).setOrigin(0, 0.5));
    m.body(
      button(this, 170, -284, 170, 76, on ? '켜짐' : '꺼짐', () => {
        saveSettings({ ...st, sound: !on, music: !on });
        applySound(this.game);
        refreshMusic(this);
        if (!on) playSfx(this, 'sfx-ui-tap'); // 켰을 때 확인 소리
        this.openSettings();
      }, { kind: on ? 'growth' : 'secondary', size: TYPE.body }).root,
    );
    // 언어(2026-11-25): 누를 때마다 한국어 ↔ English — 글자 전체와 필살기 외침이 바뀐다. 모든 화면을 다시 그리려고 새로 불러온다
    if (PLATFORM !== 'toss') {
      m.body(text(this, -240, -190, '언어 / Language', TYPE.body, COLOR.text, true, true).setOrigin(0, 0.5));
      // 밑줄은 두 언어 이름을 그대로(번역 안 됨) — 어느 언어로 보고 있어도 여기서 바꿀 수 있다는 걸 알게(제작자 2026-11-25)
      m.body(text(this, -240, -152, 'Korean / English', TYPE.tiny, COLOR.gold, true).setOrigin(0, 0.5));
      m.body(
        button(this, 170, -178, 170, 70, st.lang === 'en' ? 'English' : '한국어', () => {
          saveSettings({ ...st, lang: st.lang === 'en' ? 'ko' : 'en' });
          setTimeout(() => location.reload(), 150);
        }, { kind: 'primary', size: TYPE.caption }).root,
      );
    }
    // 계정(첫 출시: 게스트 자동 + Apple 연결, 앱 안 계정 삭제 — 애플 심사 5.1.1(v))
    const acc = account.current();
    m.body(this.add.rectangle(0, -110, 520, 2, COLOR.line));
    m.body(text(this, -240, -70, '계정', TYPE.heading, COLOR.text, true, true).setOrigin(0, 0.5));
    m.body(text(this, -240, -26, `${acc.provider === 'apple' ? 'Apple 연결됨' : '게스트'} · ${shortId(acc.uid)}`, TYPE.tiny, COLOR.textSub, true).setOrigin(0, 0.5));
    const link = button(this, 170, -50, 220, 76, acc.provider === 'apple' ? '연결됨' : 'Apple로 연결', () => {
      account.linkApple().then((r) => {
        if (r.ok) {
          this.openSettings();
          this.toast('Apple 계정에 연결했어요');
        } else if (r.reason === 'in-use') this.confirmSwitchApple();
        else if (r.reason === 'unavailable') this.toast('Apple 연결은 App Store 앱에서 할 수 있어요');
        else if (r.reason === 'offline') this.toast('인터넷 연결을 확인해 주세요');
        else if (r.reason === 'failed') this.toast('연결하지 못했어요. 잠시 뒤 다시 시도해 주세요');
      });
    }, { kind: 'primary', size: TYPE.caption }); // 버튼은 "Apple로 연결"만(제작자 11/25: 아래 회색 안내 문구와 겹침)
    link.setEnabled(acc.provider !== 'apple');
    m.body(link.root);
    m.body(text(this, -240, 50, '연결하면 기기를 바꾸거나 앱을 다시 설치해도 이어서 할 수 있어요', 15, COLOR.textDim, true).setOrigin(0, 0.5));
    m.body(text(this, -240, 82, `☁ ${cloudLine()}`, 15, cloud.status === 'error' || cloud.status === 'conflict' ? COLOR.danger : COLOR.textSub, true).setOrigin(0, 0.5));
    m.body(button(this, 0, 140, 300, 66, '계정 삭제', () => this.confirmDelete(), { kind: 'danger', size: TYPE.caption }).root);
    // 처리방침·약관(애플 심사 5.1.1(i): 앱 안에서 처리방침을 열 수 있어야 함). 영어 모드면 -en 페이지. 토스는 외부 링크 금지라 뺌
    if (PLATFORM !== 'toss') {
      const legal = (page: string) => () => window.open(`${LEGAL_BASE}${page}${st.lang === 'en' ? '-en' : ''}.html`, '_system');
      m.body(button(this, -135, 220, 250, 56, '개인정보처리방침', legal('privacy'), { kind: 'secondary', size: TYPE.tiny }).root);
      m.body(button(this, 135, 220, 250, 56, '이용약관', legal('terms'), { kind: 'secondary', size: TYPE.tiny }).root);
    }
    m.body(button(this, 0, 300, 220, 70, '닫기', () => this.closeSettings(), { kind: 'secondary', size: TYPE.caption }).root);
    this.settingsUi = m;
  }

  /**
   * 이 Apple ID가 이미 다른 기록(예전 기기·재설치 전)에 연결돼 있을 때: 그 계정으로 바꿀지 묻는다.
   * 바꾸면 이 기기 진행과 그 계정 서버 기록 중 고르는 창이 뜬다(이 기기가 처음 상태면 바로 서버 기록).
   */
  private confirmSwitchApple(): void {
    this.closeSettings();
    const m = modal(this, 600, 560, 'Apple 계정', { closeOnBackdrop: true, ribbonColor: COLOR.violet });
    m.body(
      text(this, 0, -120, '이 Apple ID에는 이미 저장된 기록이 있어요.\n그 계정으로 바꿔 이어서 할까요?', TYPE.caption, COLOR.text, true, true)
        .setOrigin(0.5).setAlign('center').setLineSpacing(8),
    );
    m.body(
      text(this, 0, -20, '바꾸면 이 기기 기록과 서버 기록 중 하나를 고를 수 있어요', TYPE.tiny, COLOR.textSub, true).setOrigin(0.5),
    );
    m.body(button(this, -130, 120, 220, 76, '취소', () => this.closeSettings(), { kind: 'secondary', size: TYPE.body }).root);
    m.body(
      button(this, 130, 120, 220, 76, '바꾸기', () => {
        account.switchToApple().then((r) => {
          if (!r.ok) {
            if (r.reason !== 'cancelled') this.toast(r.reason === 'offline' ? '인터넷 연결을 확인해 주세요' : '바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요');
            return;
          }
          this.closeSettings();
          this.registry.remove('gift-seen-ids');
          this.scene.start('title'); // 새 계정 기록으로 처음부터 그리기(고르기 창은 로비가 띄움)
        });
      }, { kind: 'primary', size: TYPE.body }).root,
    );
    this.settingsUi = m;
  }

  /** 계정 삭제 확인: 모든 진행·루비가 사라지고 되돌릴 수 없음을 알리고 한 번 더 확인 */
  private confirmDelete(): void {
    this.closeSettings();
    const m = modal(this, 600, 520, '계정 삭제', { closeOnBackdrop: true, ribbonColor: COLOR.danger });
    m.body(
      text(this, 0, -110, '계정을 삭제하면 드래곤·장비·골드·루비(구매한 루비 포함)와\n모든 진행 기록이 지워지고 되돌릴 수 없어요.', TYPE.caption, COLOR.text, true, true)
        .setOrigin(0.5).setAlign('center').setLineSpacing(8),
    );
    m.body(text(this, 0, -20, '삭제 후에는 새 게스트로 처음부터 시작해요', TYPE.tiny, COLOR.textSub, true).setOrigin(0.5));
    m.body(button(this, -130, 110, 220, 76, '취소', () => this.closeSettings(), { kind: 'secondary', size: TYPE.body }).root);
    m.body(
      button(this, 130, 110, 220, 76, '삭제', () => {
        account.deleteAccount().then((r) => {
          if (!r.ok) {
            if (r.reason !== 'cancelled') this.toast(r.reason === 'offline' ? '인터넷 연결을 확인해 주세요' : '삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요');
            return;
          }
          this.closeSettings();
          this.registry.remove('gift-seen-ids');
          this.scene.start('title');
        });
      }, { kind: 'danger', size: TYPE.body }).root,
    );
    this.settingsUi = m;
  }

  private closeSettings(): void {
    this.settingsUi?.close();
    this.settingsUi = null;
  }

  /** 짧은 안내(화면 가운데 1.6초) */
  private toast(msg: string): void {
    const t = text(this, 360, 640, msg, TYPE.body, COLOR.text, true, true).setOrigin(0.5).setDepth(1000);
    const bg = this.add.rectangle(360, 640, t.width + 60, 70, 0x000000, 0.75).setDepth(999);
    this.tweens.add({ targets: [t, bg], alpha: 0, delay: 1200, duration: 400, onComplete: () => (t.destroy(), bg.destroy()) });
  }

  /**
   * 단계 상자 판(제작자 요청 2026-11-23 밤, 참고 화면의 25·50·100% 상자): 로비에서 고른 단계의 상자 3개.
   * 25% = 첫 엘리트 처치 · 50% = 두 번째 엘리트 처치 · 100% = 클리어. 단계를 바꾸면 그 단계의 상자로 바뀐다.
   * 상태: 닫힘(아직) → 반짝임(도달 — 눌러서 받기) → 열린 상자(받음). 최초 보상이라 다시 와도 열린 채로 남는다.
   * 보상 내용은 받기 전까지 보여 주지 않는다.
   */
  private progressChests(p: ReturnType<typeof Progress.load>, diff: Difficulty): void {
    const stage = this.stageId;
    const reach = stageReach(p, diff, stage);
    const others = claimableStageBoxes(p, diff).filter((c) => c.stage !== stage);
    plate(this, 360, 786, 680, 184, { r: 26, fill: 0x1d1733 });
    text(this, 44, 716, `${DIFFICULTY_LABEL[diff]} ${stage}단계 상자`, TYPE.caption, COLOR.gold, true, true).setOrigin(0, 0.5);
    text(this, 676, 716, others.length ? `다른 단계에 받을 상자 ${others.length}개` : '첫 달성 때 한 번', TYPE.tiny, others.length ? COLOR.ok : COLOR.textSub, true, true).setOrigin(1, 0.5);

    // 진행 막대(참고 화면처럼 상자 뒤로 지나감): 0 → 25 → 50 → 100%
    const x0 = 70;
    const x1 = 650;
    const by = 812;
    const at = (pct: number) => x0 + (x1 - x0) * pct;
    const PCT = [0.25, 0.5, 1] as const;
    this.add.rectangle((x0 + x1) / 2, by, x1 - x0 + 16, 26, 0x0e0b18).setStrokeStyle(3, COLOR.outline);
    const fillTo = reach >= 3 ? 1 : reach >= 1 ? PCT[reach - 1] : 0;
    if (fillTo > 0) this.add.rectangle(x0, by, (x1 - x0) * fillTo, 16, 0x5ee35a).setOrigin(0, 0.5);

    CHEST_TIERS.forEach((tier, i) => {
      const x = Math.min(at(PCT[i]), 612);
      const y = 790;
      const state = stageChestState(p, diff, stage, tier);
      const box = tier === 3 && stage % 5 === 0 ? 'dragon' : 'gold';
      const size = 112;
      const parts = this.chestArt(x, y, box, size, state);
      text(this, x, by + 42, `${Math.round(PCT[i] * 100)}%`, 20, COLOR.text, true, true).setOrigin(0.5);
      const hit = this.add.zone(x, y, size, size + 20).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        if (state === 'opened') return this.toast('이미 받은 상자예요');
        if (state === 'locked') return this.toast(tier === 3 ? '이 단계를 클리어하면 열려요' : `이 단계에서 ${tier === 1 ? '첫' : '두 번째'} 엘리트를 처치하면 열려요`);
        const r = Progress.claimStageBox(diff, stage, tier);
        if (!r.ok) return this.toast('아직 받을 수 없어요');
        parts.forEach((o) => { this.tweens.killTweensOf(o); o.setVisible(false); });
        openSmallChest(this, x, y, `chest-${box}`, () =>
          rewardPopup(this, `${DIFFICULTY_LABEL[diff]} ${stage}단계 ${Math.round(PCT[i] * 100)}% 상자`, bundleItems(r.reward), () => this.scene.restart()));
      });
    });
  }

  /** 상자 그림 한 개: 닫힘(어둡게) · 받기(반짝임·통통) · 열림(뚜껑이 뒤로 젖혀지고 안쪽 빛) */
  private chestArt(x: number, y: number, box: 'gold' | 'dragon', size: number, state: 'locked' | 'ready' | 'opened'): Phaser.GameObjects.Image[] {
    const bodyKey = `chest-${box}-body`;
    const lidKey = `chest-${box}-lid`;
    const out: Phaser.GameObjects.Image[] = [];
    if (!this.textures.exists(bodyKey) || !this.textures.exists(lidKey)) {
      const im = this.add.image(x, y, `chest-${box}`).setDisplaySize(size, size);
      if (state === 'locked') im.setTint(0x8c86a3);
      if (state === 'opened') im.setAlpha(0.55);
      return [im];
    }
    if (state === 'opened' && this.textures.exists('chest-inner-gold')) {
      out.push(this.add.image(x, y - size * 0.12, 'chest-inner-gold').setDisplaySize(size * 0.9, size * 0.9).setAlpha(0.7).setBlendMode(Phaser.BlendModes.ADD));
    }
    const body = this.add.image(x, y, bodyKey).setDisplaySize(size, size);
    const lid = this.add.image(x, y, lidKey).setDisplaySize(size, size);
    if (state === 'opened') {
      // 뚜껑을 뒤로 젖혀 올린 모양(본체 뒤에 그려 열린 상자처럼)
      lid.setPosition(x + size * 0.02, y - size * 0.3).setAngle(-12).setScale(lid.scaleX, lid.scaleY * 0.8).setTint(0xd8d0c0);
      this.children.moveBelow(lid, body);
    }
    out.push(lid, body);
    if (state === 'locked') out.forEach((o) => o.setTint(0x8c86a3));
    if (state === 'ready') {
      const glow = this.add.circle(x, y, size * 0.52, 0xffd34d, 0.18).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: glow, alpha: 0.45, scale: 1.15, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      [body, lid].forEach((o) => this.tweens.add({ targets: o, y: o.y - 6, duration: 520, yoyo: true, repeat: -1, ease: 'Sine.InOut' }));
      // 반짝이 별 4개가 번갈아 깜빡임
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.6;
        const st = this.add.star(x + Math.cos(a) * size * 0.46, y + Math.sin(a) * size * 0.4 - 8, 4, 3, 11, 0xfff6c2).setAlpha(0);
        this.tweens.add({ targets: st, alpha: 1, scale: 1.4, angle: 90, duration: 420, yoyo: true, repeat: -1, delay: k * 260, repeatDelay: 500 });
      }
      const dot = this.add.circle(x + size * 0.38, y - size * 0.4, 13, COLOR.danger).setStrokeStyle(3, 0xffffff);
      text(this, dot.x, dot.y, '!', 16, COLOR.text, true).setOrigin(0.5);
    }
    return out;
  }

  /** 받을 보상이 있으면 보상 버튼에 "!" */
  private hasClaimable(): boolean {
    const p = Progress.load();
    // 진행도 상자 + 받을 수 있는 미션(2026-11-21: 미션 완료도 알림에 포함)
    return DIFFICULTIES.some((k) => claimableStageBoxes(p, k).length > 0) || claimableMissions(p, gameNow()).length > 0 || claimableActivity(p, gameNow()) > 0 || !attendanceState(p, gameNow()).claimedToday;
  }

  /** 개발·심사용: 진행 초기화(두 번 확인) */
  private devTools(): void {
    let armed = false;
    const t = this.add.text(20, 146, '[개발용] 진행 초기화', { fontFamily: 'sans-serif', fontSize: '16px', color: '#c98a8a', backgroundColor: '#00000088' });
    t.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      if (!armed) {
        armed = true;
        t.setText('정말 초기화할까요? 한 번 더 누르기').setColor('#ff6b6b');
        this.time.delayedCall(4000, () => {
          armed = false;
          if (t.active) t.setText('[개발용] 진행 초기화').setColor('#c98a8a');
        });
        return;
      }
      Progress.reset();
      this.devDiff = null;
      this.registry.remove('gift-seen-ids');
      this.scene.restart();
    });
    void css;
  }
}
