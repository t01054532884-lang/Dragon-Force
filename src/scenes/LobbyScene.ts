import Phaser from 'phaser';
import { makeTextures } from '../textures';
import { STAGES } from '../data/stages';
import { DRAGONS, ELEMENT_LABEL, RARITY_COLOR, RARITY_LABEL } from '../data/dragons';
import { DIFFICULTIES, DIFFICULTY_LABEL, STAGE_COUNT, type Difficulty } from '../data/economy';
import { cpVerdict, recommendedCp } from '../data/power';
import { SIGNATURES } from '../data/signature';
import { attendedToday, eventActive, eventState, progressPct, Progress, spinsAvailable } from '../systems/Progress';
import { loadout } from '../systems/Loadout';
import { devMode, FONT, gameNow, makeButton, type Button } from '../ui/widgets';
import { platform } from '../platform';

/**
 * 메인 로비(6단계 v1.2): 출격 드래곤·전투력 · 난이도(쉬움/어려움/매우 어려움) · 1~20단계(지금은 1단계만, 나머지 준비 중)
 * · 권장 전투력 비교(입장 제한 아님) · 드래곤·상점·장비·연구소·보상.
 */
export class LobbyScene extends Phaser.Scene {
  private stageId = 1;

  constructor() {
    super('lobby');
  }

  private exitLayer: Phaser.GameObjects.GameObject[] = [];

  /**
   * 뒤로가기(로비): 종료 확인 창을 띄운다(앱인토스 검수 기준: 종료 시 확인).
   * 창이 떠 있을 때 한 번 더 누르면 창을 닫는다. 종료할 수 없는 플랫폼(iOS·웹)은 아무것도 안 함.
   */
  onPlatformBack(): boolean {
    if (!platform.canExit) return true;
    if (this.exitLayer.length) {
      this.closeExit();
      return true;
    }
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.exitLayer.push(o);
      return o;
    };
    add(this.add.rectangle(360, 640, 720, 1280, 0x000000, 0.7).setInteractive().setDepth(500));
    add(this.add.rectangle(360, 640, 560, 340, 0x1e2430).setStrokeStyle(4, 0xffffff, 0.6).setDepth(501));
    add(this.add.text(360, 560, '게임을 종료할까요?', { fontFamily: FONT, fontSize: '40px', color: '#ffffff' }).setOrigin(0.5).setDepth(502));
    add(this.add.text(360, 615, '진행 상황은 저장돼 있어요', { fontFamily: FONT, fontSize: '24px', color: '#c9d3ee' }).setOrigin(0.5).setDepth(502));
    const b1 = makeButton(this, 250, 720, 200, 90, '취소', 0x3a4458, () => this.closeExit(), 30);
    const b2 = makeButton(this, 470, 720, 200, 90, '종료', 0xc0392b, () => platform.exit(), 30);
    for (const b of [b1, b2]) add(b.bg.setDepth(501)) && add(b.label.setDepth(502));
    return true;
  }

  private closeExit(): void {
    this.exitLayer.forEach((o) => o.destroy());
    this.exitLayer = [];
  }

  create(): void {
    this.exitLayer = [];
    if (!this.textures.exists('dragon-red')) makeTextures(this);
    const p = Progress.load();
    const dev = devMode();
    const curDiff: Difficulty = this.devDiff ?? p.selectedDifficulty;
    const dp = p.difficulty[curDiff];
    if (!dp.unlocked.includes(this.stageId)) this.stageId = Math.max(1, ...dp.unlocked.filter((s) => STAGES.some((st) => st.id === s)));

    this.add.rectangle(360, 640, 720, 1280, 0x14181f);
    this.add.text(30, 22, `💎 ${p.rubies.toLocaleString()}`, { fontFamily: FONT, fontSize: '26px', color: '#e1bee7' });
    this.add.text(690, 22, `🪙 ${p.gold.toLocaleString()}G`, { fontFamily: FONT, fontSize: '26px', color: '#ffd34d' }).setOrigin(1, 0);
    this.add.text(360, 110, '드래곤 특공대', { fontFamily: FONT, fontSize: '56px', fontStyle: 'bold', color: '#ffd34d', stroke: '#000', strokeThickness: 8 }).setOrigin(0.5);
    this.add.text(360, 166, 'DRAGON FORCE', { fontFamily: FONT, fontSize: '22px', color: '#c9d3ee' }).setOrigin(0.5);

    // 출격 드래곤(선택은 '드래곤' 화면에서)
    const d = DRAGONS[p.selectedDragonId];
    const o = p.dragons[d.id];
    const lo = loadout(p, d.id);
    const rc = RARITY_COLOR[d.rarity];
    this.add.rectangle(360, 330, 660, 250, 0x1f2633).setStrokeStyle(3, rc, 0.9);
    const dragon = this.add.image(150, 330, `portrait-${d.id}`).setScale(0.95);
    this.tweens.add({ targets: dragon, y: 318, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.add.text(270, 220, d.name, { fontFamily: FONT, fontSize: '34px', fontStyle: 'bold', color: '#ffffff' });
    this.add.text(270, 264, `${ELEMENT_LABEL[d.element]} · ${RARITY_LABEL[d.rarity]} · ${'★'.repeat(o.stars)}${'☆'.repeat(5 - o.stars)} · 영구 Lv.${o.level}`, {
      fontFamily: FONT, fontSize: '20px', color: `#${rc.toString(16).padStart(6, '0')}`,
    });
    this.add.text(270, 298, `전투력 ${lo.cp.toLocaleString()}`, { fontFamily: FONT, fontSize: '30px', fontStyle: 'bold', color: '#ffd34d' });
    this.add.text(270, 342, `공격력 ${lo.stats.attack.toFixed(1)} · HP ${Math.round(lo.stats.maxHp)} · 속도 ${Math.round(lo.stats.speed)}\n전용 액티브 ${SIGNATURES[d.id].icon} ${SIGNATURES[d.id].name}`, {
      fontFamily: FONT, fontSize: '19px', color: '#c9d3ee', lineSpacing: 4,
    });

    // 난이도
    DIFFICULTIES.forEach((k: Difficulty, i) => {
      const real = p.difficulty[k].unlocked.length > 0;
      const open = real || dev;
      const color = k === curDiff ? 0xb35a00 : 0x2a3140;
      const b = makeButton(this, 140 + i * 220, 505, 205, 66, `${DIFFICULTY_LABEL[k]}${real ? '' : ' 🔒'}`, color, () => {
        if (real) {
          this.devDiff = null;
          Progress.selectDifficulty(k);
        } else if (dev) {
          this.devDiff = k; // 개발용(?dev=1): 잠긴 난이도 1단계 시험 플레이(선택은 저장하지 않음)
        } else return;
        this.scene.restart();
      }, 24);
      b.setEnabled(open, color);
    });
    const progressLine = DIFFICULTIES.map((k) => `${DIFFICULTY_LABEL[k]} ${p.difficulty[k].cleared.length}/${STAGE_COUNT}(${progressPct(p, k)}%)`).join(' · ');
    this.add.text(360, 555, `왕국 정복 진행도 ${progressLine}`, { fontFamily: FONT, fontSize: '17px', color: '#8a93a6' }).setOrigin(0.5);

    // 단계 선택(1~20, 진행도 분모 20 고정). 만들어진 단계만 플레이 가능 — 나머지는 "준비 중"
    const stageText = this.add.text(360, 625, '', { fontFamily: FONT, fontSize: '32px', color: '#ffffff' }).setOrigin(0.5);
    const sub = this.add.text(360, 672, '', { fontFamily: FONT, fontSize: '20px', color: '#9aa6bd', align: 'center' }).setOrigin(0.5);
    const cpLine = this.add.text(360, 716, '', { fontFamily: FONT, fontSize: '22px', color: '#ffffff' }).setOrigin(0.5);
    const unlocked = this.devDiff ? [1] : dp.unlocked;
    let start: Button;
    const show = () => {
      const s = STAGES.find((st) => st.id === this.stageId);
      const isOpen = unlocked.includes(this.stageId);
      const cleared = p.difficulty[curDiff].cleared.includes(this.stageId);
      stageText.setText(`${this.stageId}단계 — ${s ? s.name : '준비 중'}`);
      sub.setText(!s ? '아직 만들지 않은 단계입니다(준비 중)' : !isOpen ? `${this.stageId - 1}단계를 클리어하면 열립니다` : cleared ? `클리어함 · 반복 클리어 시 카드 1장` : '첫 클리어 시 출격 드래곤 카드 2장');
      const rec = recommendedCp(this.stageId, curDiff);
      const v = cpVerdict(lo.cp, rec);
      cpLine.setText(`권장 전투력 ${rec.toLocaleString()} · 현재 ${lo.cp.toLocaleString()} — ${v.text}`).setColor(v.color);
      prev.setEnabled(this.stageId > 1);
      next.setEnabled(this.stageId < STAGE_COUNT);
      start.setEnabled(!!s && isOpen);
      start.setText(!s ? '준비 중' : !isOpen ? '잠김' : `전투 시작 (${DIFFICULTY_LABEL[curDiff]})`);
    };
    const prev = makeButton(this, 70, 625, 90, 80, '◀', 0x3a4458, () => (this.stageId--, show()));
    const next = makeButton(this, 650, 625, 90, 80, '▶', 0x3a4458, () => (this.stageId++, show()));
    const go = () => {
      const s = STAGES.find((st) => st.id === this.stageId);
      if (s && unlocked.includes(this.stageId)) this.scene.start('game', { stageId: this.stageId, difficulty: curDiff });
    };
    start = makeButton(this, 360, 820, 560, 104, '전투 시작', 0xc0392b, go, 40);
    show();

    // 메뉴
    makeButton(this, 135, 960, 210, 96, '드래곤', 0x2e5d8a, () => this.scene.start('dragons'), 28);
    makeButton(this, 360, 960, 210, 96, '상점', 0x6a3fb5, () => this.scene.start('shop'), 28);
    makeButton(this, 585, 960, 210, 96, '장비', 0x2e7d6a, () => this.scene.start('equip'), 28);
    makeButton(this, 135, 1075, 210, 96, '연구소', 0x7a5a12, () => this.scene.start('lab', { from: 'lobby' }), 28);
    makeButton(this, 360, 1075, 210, 96, '보상', 0x9a6b12, () => this.scene.start('missions'), 28);
    if (this.hasClaimable()) this.add.circle(455, 1032, 12, 0xff5252).setStrokeStyle(2, 0xffffff);
    // 2026 크리스마스 이벤트(드래곤의 겨울 축제): 기간 중엔 강조, 받을 것이 있으면 빨간 점
    const now = gameNow();
    const live = eventActive(now);
    makeButton(this, 585, 1075, 210, 96, live ? '❄ 겨울 축제' : '겨울 축제\n12/1 시작', live ? 0x1565c0 : 0x2a3140, () => this.scene.start('event'), live ? 26 : 20);
    if (live) {
      const st = eventState(p);
      if (spinsAvailable(st) > 0 || !attendedToday(p, now)) this.add.circle(680, 1032, 12, 0xff5252).setStrokeStyle(2, 0xffffff);
    }
    this.add.text(360, 1160, 'PC: WASD·방향키 이동, 스페이스·Q 전용 액티브, ESC 일시정지\n휴대폰: 화면을 끌어 이동, 위쪽 둥근 버튼으로 전용 액티브', {
      fontFamily: FONT, fontSize: '18px', color: '#6f7a8c', align: 'center', lineSpacing: 4,
    }).setOrigin(0.5);

    this.input.keyboard?.on('keydown-ENTER', go);
    if (dev) this.devTools();
  }

  /** 개발용(?dev=1)으로 잠긴 난이도를 고른 경우(저장하지 않는 시험 플레이) */
  private devDiff: Difficulty | null = null;

  /** 받을 보상이 있으면 보상 버튼에 빨간 점 */
  private hasClaimable(): boolean {
    const p = Progress.load();
    return DIFFICULTIES.some((k) => [25, 50, 100].some((s) => progressPct(p, k) >= s && !p.difficulty[k].claimed.includes(s)));
  }

  /** 개발·심사용: 진행 초기화(두 번 확인) */
  private devTools(): void {
    let armed = false;
    const t = this.add.text(360, 1245, '[개발용] 진행 초기화', { fontFamily: FONT, fontSize: '19px', color: '#8a5555' }).setOrigin(0.5);
    t.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      if (!armed) {
        armed = true;
        t.setText('정말 초기화할까요? 골드·강화·해금이 모두 사라집니다. (한 번 더 누르기)').setColor('#ff6b6b');
        this.time.delayedCall(4000, () => {
          armed = false;
          if (t.active) t.setText('[개발용] 진행 초기화').setColor('#8a5555');
        });
        return;
      }
      Progress.reset();
      this.devDiff = null;
      this.scene.restart();
    });
  }
}
