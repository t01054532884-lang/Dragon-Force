import Phaser from 'phaser';
import { makeTextures } from '../textures';
import { STAGES } from '../data/stages';
import { DRAGON_ORDER, DRAGONS, ELEMENT_LABEL, RARITY_COLOR, RARITY_LABEL } from '../data/dragons';
import { DIFFICULTIES, DIFFICULTY_LABEL, DIFFICULTY_RELEASED, STAGE_COUNT, type Difficulty } from '../data/economy';
import { cpVerdict, recommendedCp } from '../data/power';
import { hardStage } from '../data/hardStages';
import { attendedToday, claimableMissions, eventActive, eventState, progressPct, Progress, spinsAvailable } from '../systems/Progress';
import { loadout } from '../systems/Loadout';
import { pendingGifts, staminaNow } from '../systems/Mailbox';
import { STAMINA, formatLeft, nextRegenIn } from '../systems/Stamina';
import { devMode, gameNow } from '../ui/widgets';
import { enterBattle } from '../ui/entry';
import { drawLobbyBackdrop, makeArtPlaceholders, preloadArt } from '../ui/art';
import { button, modal, navBar, text, type KitButton } from '../ui/kit';
import { applySound, loadSettings, saveSettings } from '../systems/Settings';
import { playSfx } from '../systems/Sfx';
import { playMusic, preloadMusic, refreshMusic } from '../systems/Music';
import { altar, dragonCarousel, iconTile, plate, tabs, topBar, torch, wingBanner } from '../ui/kit2';
import { COLOR, css, TYPE } from '../ui/theme';
import { giftAlert } from '../ui/giftFx';
import { openRubyShop } from '../ui/rubyShop';
import { account, shortId } from '../systems/Account';
import { DEMO, platform } from '../platform';
import { goTab, NAV_TABS } from '../ui/screen';

/**
 * 메인 로비(8단계 v2.0 필수 B, 기획자 UI 시안 형식): 머리줄(출격 드래곤·행동력·골드·루비·전투력) · 날개 배너(단계·난이도·진행도)
 * · 양옆 바로가기(보상·겨울 축제 / 선물함) · 제단 위 출격 드래곤(숨쉬기·터치 반응) · 보유 드래곤 캐러셀 · 난이도 탭
 * · 단계 선택과 권장 전투력 · 전투 시작(행동력 5) · 하단 탭.
 * 기능·조건·수치는 예전 로비와 같다(그림과 배치만 바뀜).
 */
export class LobbyScene extends Phaser.Scene {
  private stageId = 1;
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
    add(this.add.rectangle(360, 640, 720, 1280, 0x000000, 0.7).setInteractive().setDepth(500));
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
    Progress.syncMail(now, dev); // 운영자 캠페인·지난 최초 클리어 소급 → 선물함, 오래된 선물 정리
    const p = Progress.load();
    const curDiff: Difficulty = this.devDiff ?? p.selectedDifficulty;
    const dp = p.difficulty[curDiff];
    if (!dp.unlocked.includes(this.stageId)) this.stageId = Math.max(1, ...dp.unlocked.filter((s) => STAGES.some((st) => st.id === s)));

    drawLobbyBackdrop(this);
    playMusic(this, 'bgm-lobby'); // 메뉴 화면끼리는 같은 곡을 끊지 않고 이어 감
    const d = DRAGONS[p.selectedDragonId];
    const o = p.dragons[d.id];
    const lo = loadout(p, d.id);

    // ── 머리줄: 출격 드래곤 · 행동력(+ = 선물함, 결제 없음) · 골드 · 루비 · 전투력
    const bar = topBar(this, {
      portrait: `portrait-${d.id}`,
      level: o.level,
      cp: lo.cp.toLocaleString(),
      currencies: [
        { icon: 'ui-energy', value: '', onPlus: () => this.scene.start('gifts') },
        { icon: 'ui-gold', value: p.gold },
        { icon: 'ui-ruby', value: p.rubies, onPlus: () => (this.settingsUi = openRubyShop(this, () => this.scene.restart())) },
      ],
    });
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
      emblem: 'ic-banner',
    });

    // ── 양옆 바로가기
    const live = eventActive(now);
    const evAlert = live && (spinsAvailable(eventState(p)) > 0 || !attendedToday(p, now));
    iconTile(this, 62, 340, 'ic-mission', { size: 86, label: '보상', alert: this.hasClaimable(), onClick: () => this.scene.start('missions') });
    iconTile(this, 62, 452, 'ic-cal-star', { size: 86, label: live ? '겨울 축제' : '축제 12/1', alert: evAlert, onClick: () => this.scene.start('event') });
    iconTile(this, 658, 340, 'ui-mailbox', { size: 86, label: '선물함', onClick: () => this.scene.start('gifts') });
    giftAlert(this, 658, 338, 86, pendingGifts(p.mailbox, now).map((g) => g.id));
    iconTile(this, 658, 452, 'ic-gear', { size: 86, label: '설정', onClick: () => this.openSettings() });

    // ── 횃불 · 제단 · 출격 드래곤(숨쉬기 + 터치하면 살짝 뛰어오름)
    torch(this, 172, 580);
    torch(this, 548, 580);
    altar(this, 360, 620, 400);
    const hero = this.add.image(360, 462, `portrait-${d.id}`).setDisplaySize(320, 320);
    const baseScale = hero.scaleX;
    this.tweens.add({ targets: hero, y: 452, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    hero.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.tweens.add({ targets: hero, scaleX: baseScale * 1.06, scaleY: baseScale * 0.94, duration: 90, yoyo: true, ease: 'Quad.Out' });
    });
    const rc = RARITY_COLOR[d.rarity];
    text(this, 360, 672, `${d.name}  ${'★'.repeat(o.stars)}`, TYPE.body, COLOR.text, true, true).setOrigin(0.5);
    text(this, 360, 700, `${ELEMENT_LABEL[d.element]} · ${RARITY_LABEL[d.rarity]} · 영구 Lv.${o.level}`, TYPE.tiny, rc, true, true).setOrigin(0.5);

    // ── 보유 드래곤 캐러셀(누르면 출격 드래곤 변경)
    const owned = DRAGON_ORDER.filter((id) => p.dragons[id].unlocked);
    if (owned.length > 1) {
      dragonCarousel(this, 784, owned.map((id) => `portrait-${id}`), Math.max(0, owned.indexOf(d.id)), (i) => {
        Progress.select(owned[i]);
        this.scene.restart();
      });
    } else {
      text(this, 360, 784, '상점에서 드래곤을 모으면 여기서 바꿀 수 있어요', TYPE.tiny, COLOR.textSub, true, true).setOrigin(0.5);
    }

    // ── 난이도 탭: 출시한 난이도만 보인다(기획자 요청 1, 2026-11-20 — 심사 2.1 미완성 노출 방지). 진행 데이터는 그대로 둔다.
    // 개발 모드에서는 미출시 난이도도 보여 시험 플레이. 보이는 난이도가 하나뿐이면 탭을 그리지 않는다.
    // 데모(?demo=1)는 출시 화면과 같게 보여야 하므로 미출시 난이도를 숨긴다
    const shownDiffs = DIFFICULTIES.filter((k) => DIFFICULTY_RELEASED[k] || (dev && !DEMO));
    const labels = shownDiffs.map((k) => {
      const released = DIFFICULTY_RELEASED[k];
      const real = released && p.difficulty[k].unlocked.length > 0;
      return released ? `${DIFFICULTY_LABEL[k]}${real ? '' : ' 🔒'}` : `${DIFFICULTY_LABEL[k]} · 출시 예정`;
    });
    if (shownDiffs.length > 1) tabs(this, 906, labels, shownDiffs.indexOf(curDiff), (i) => {
      const k = shownDiffs[i];
      const real = DIFFICULTY_RELEASED[k] && p.difficulty[k].unlocked.length > 0;
      if (real) {
        this.devDiff = null;
        Progress.selectDifficulty(k);
      } else if (dev) {
        this.devDiff = k;
      } else {
        this.toast(DIFFICULTY_RELEASED[k] ? '쉬움을 더 진행하면 열려요' : '다음 업데이트에서 열려요');
        return;
      }
      this.scene.restart();
    });

    // ── 단계 선택 + 권장 전투력
    plate(this, 360, 988, 660, 94, { r: 24 });
    const stageText = text(this, 360, 961, '', TYPE.body, COLOR.text, true, true).setOrigin(0.5);
    const sub = text(this, 360, 989, '', TYPE.tiny, COLOR.textSub, true).setOrigin(0.5);
    const cpLine = text(this, 360, 1015, '', TYPE.tiny, COLOR.text, true, true).setOrigin(0.5);
    const arrow = (dir: -1 | 1) => {
      const tri = this.add.triangle(360 + dir * 290, 988, 0, -26, 0, 26, dir * 32, 0, 0xffe39a).setStrokeStyle(4, COLOR.outline);
      tri.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
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
    if (hs) stageText.setText(`어려움 ${this.stageId} — ${hs.title}`);
    sub.setText(
      !s ? '아직 만들지 않은 단계예요' :
      !isOpen ? `${this.stageId === 1 ? '쉬움 20단계' : `어려움 ${this.stageId - 1}단계`}를 클리어하면 열려요` :
      hs ? `${hs.mechanicText}${cleared ? `${bestTxt} · 반복 골드 ×1.5` : ` · 최초 💎${hs.clearReward.rubies}`}` :
      cleared ? `클리어함 · 반복 클리어 시 카드 1장${bestTxt}` : '첫 클리어: 드래곤 카드 2장 + 행동력 20(선물함)',
    );
    const rec = recommendedCp(this.stageId, curDiff);
    const v = cpVerdict(lo.cp, rec);
    cpLine.setText(`권장 전투력 ${rec.toLocaleString()} · 현재 ${lo.cp.toLocaleString()} — ${v.text}`).setColor(v.color);
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
    navBar(this, NAV_TABS, 'lobby', (k) => {
      if (k !== 'lobby') goTab(this, k);
    });

    this.input.keyboard?.on('keydown-ENTER', go);
    if (dev) this.devTools();
  }

  /** 설정 창(첫 제출: 효과음 켜기/끄기만 — 제작자 결정 2026-11-20). 저장은 진행 저장과 따로 */
  private openSettings(): void {
    this.closeSettings();
    const st = loadSettings();
    const m = modal(this, 600, 700, '설정', { closeOnBackdrop: true, ribbonColor: COLOR.violet });
    m.body(text(this, -240, -230, '소리', TYPE.heading, COLOR.text, true, true).setOrigin(0, 0.5));
    // 로비 설정은 효과음·배경 음악을 함께 켜고 끈다(따로는 전투 일시정지 화면에서)
    const on = st.sound || st.music;
    m.body(text(this, -240, -186, `효과음 ${st.sound ? '켜짐' : '꺼짐'} · 배경 음악 ${st.music ? '켜짐' : '꺼짐'}`, TYPE.tiny, COLOR.textSub, true).setOrigin(0, 0.5));
    m.body(
      button(this, 170, -214, 170, 76, on ? '켜짐' : '꺼짐', () => {
        saveSettings({ ...st, sound: !on, music: !on });
        applySound(this.game);
        refreshMusic(this);
        if (!on) playSfx(this, 'sfx-ui-tap'); // 켰을 때 확인 소리
        this.openSettings();
      }, { kind: on ? 'growth' : 'secondary', size: TYPE.body }).root,
    );
    // 계정(첫 출시: 게스트 자동 + Apple 연결, 앱 안 계정 삭제 — 애플 심사 5.1.1(v))
    const acc = account.current();
    m.body(this.add.rectangle(0, -120, 520, 2, COLOR.line));
    m.body(text(this, -240, -70, '계정', TYPE.heading, COLOR.text, true, true).setOrigin(0, 0.5));
    m.body(text(this, -240, -26, `${acc.provider === 'apple' ? 'Apple 연결됨' : '게스트'} · ${shortId(acc.uid)}`, TYPE.tiny, COLOR.textSub, true).setOrigin(0, 0.5));
    const link = button(this, 170, -50, 220, 76, acc.provider === 'apple' ? '연결됨' : 'Apple로 연결', () => {
      account.linkApple().then((r) => {
        if (r.ok) this.openSettings();
        else if (r.reason === 'unavailable') this.toast('Apple 연결은 App Store 앱에서 할 수 있어요');
        else if (r.reason === 'failed') this.toast('연결하지 못했어요. 잠시 뒤 다시 시도해 주세요');
      });
    }, { kind: 'primary', size: TYPE.caption, sub: account.canLinkApple || acc.provider === 'apple' ? undefined : '기기 바꿔도 이어서' });
    link.setEnabled(acc.provider !== 'apple');
    m.body(link.root);
    m.body(text(this, -240, 50, '연결하면 기기를 바꾸거나 앱을 다시 설치해도 이어서 할 수 있어요', 15, COLOR.textDim, true).setOrigin(0, 0.5));
    m.body(button(this, 0, 140, 300, 66, '계정 삭제', () => this.confirmDelete(), { kind: 'danger', size: TYPE.caption }).root);
    m.body(button(this, 0, 260, 220, 70, '닫기', () => this.closeSettings(), { kind: 'secondary', size: TYPE.caption }).root);
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
            this.toast('삭제하지 못했어요. 잠시 뒤 다시 시도해 주세요');
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

  /** 받을 보상이 있으면 보상 버튼에 "!" */
  private hasClaimable(): boolean {
    const p = Progress.load();
    // 진행도 상자 + 받을 수 있는 미션(2026-11-21: 미션 완료도 알림에 포함)
    return DIFFICULTIES.some((k) => [25, 50, 100].some((s) => progressPct(p, k) >= s && !p.difficulty[k].claimed.includes(s))) || claimableMissions(p, gameNow()).length > 0;
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
