import Phaser from 'phaser';
import { getLang } from '../i18n';
import { drawLobbyBackdrop, makeArtPlaceholders, preloadArt } from '../ui/art';
import { text } from '../ui/kit';
import { COLOR, TYPE } from '../ui/theme';
import { playMusic, preloadMusic } from '../systems/Music';
import { DEMO, PLATFORM } from '../platform';
import { loadSettings, saveSettings } from '../systems/Settings';
import { fullH } from '../ui/layout';
import { APP_STORE_URL, APP_VERSION, checkVersion, type VersionCheck } from '../systems/Version';
import { button, modal } from '../ui/kit';

/**
 * 시작 화면(8단계 HANDOFF 5번): 기획자 그림 한글 로고(logo-ko) + 타이틀 장식(title-deco).
 * 여기서 게임 그림을 한 번 읽고(진행 막대), 화면을 누르면 로비로. 첫 터치에서 브라우저·iOS가 소리를 허용하므로
 * 배경 음악도 이 터치 뒤에 시작한다(10.2 "첫 사용자 입력 이후 오디오 활성화").
 */
export class TitleScene extends Phaser.Scene {
  /** 업데이트 확인 결과(그림을 읽는 동안 같이 확인) */
  private version: Promise<VersionCheck> | null = null;
  private checked: VersionCheck | null = null;

  constructor() {
    super('title');
  }

  preload(): void {
    // 업데이트 확인 → 정보 불러오기(초록 막대 + %) — 제작자 요청 2026-11-23
    this.checked = null;
    this.version = checkVersion().then((v) => (this.checked = v));
    const bar = this.add.graphics();
    const label = text(this, 360, 1146, '업데이트 확인 중…', TYPE.caption, COLOR.text, true, true).setOrigin(0.5);
    const pct = text(this, 360, 1191, '0%', TYPE.tiny, COLOR.text, true, true).setOrigin(0.5).setDepth(1);
    const draw = (v: number) => {
      bar.clear();
      bar.fillStyle(COLOR.outline, 1).fillRoundedRect(108, 1178, 504, 26, 13);
      bar.fillStyle(0x1c3a22, 1).fillRoundedRect(110, 1180, 500, 22, 11);
      bar.fillStyle(0x3ecf5a, 1).fillRoundedRect(110, 1180, Math.max(22, 500 * v), 22, 11);
      bar.fillStyle(0xffffff, 0.25).fillRoundedRect(114, 1182, Math.max(14, 500 * v - 8), 7, 4);
      pct.setText(`${Math.round(v * 100)}%`);
      label.setText(this.checked || v > 0.15 ? `게임 정보 불러오는 중… ${Math.round(v * 100)}%` : '업데이트 확인 중…');
    };
    draw(0);
    this.load.on('progress', draw);
    this.load.once('complete', () => {
      bar.destroy();
      label.destroy();
      pct.destroy();
    });
    preloadArt(this);
    preloadMusic(this, ['bgm-lobby']);
  }

  create(): void {
    makeArtPlaceholders(this);
    drawLobbyBackdrop(this);
    this.add.rectangle(360, 640, 720, fullH(this), 0x0b0d17, 0.35);
    if (this.textures.exists('title-deco')) {
      const deco = this.add.image(360, 700, 'title-deco');
      deco.setScale(720 / deco.width);
      this.tweens.add({ targets: deco, y: 690, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
    // 영어 모드: 영어 로고 그림(logo-en)이 오기 전까지는 한글 로고 대신 글자 로고
    const logoKey = getLang() === 'en' ? 'logo-en' : 'logo-ko';
    if (this.textures.exists(logoKey)) {
      const logo = this.add.image(360, 230, logoKey);
      const base = 620 / logo.width;
      logo.setScale(base * 0.6).setAlpha(0);
      this.tweens.add({ targets: logo, scale: base, alpha: 1, duration: 420, ease: 'Back.Out' });
      this.tweens.add({ targets: logo, y: 238, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.InOut', delay: 420 });
    } else {
      text(this, 360, 230, '드래곤 특공대', TYPE.display, COLOR.gold, true, true).setOrigin(0.5);
    }
    // 영어 부제(제작자 2026-11-25: 외국인도 첫 화면에서 무슨 게임인지 알고 바로 언어를 바꿀 수 있게)
    if (getLang() === 'ko') text(this, 360, 372, 'DRAGON FORCE', TYPE.heading, 0xffe39a, true, true).setOrigin(0.5);
    const tap = text(this, 360, 1140, '화면을 눌러 시작', TYPE.heading, COLOR.text, true, true).setOrigin(0.5);
    this.tweens.add({ targets: tap, alpha: 0.35, duration: 800, yoyo: true, repeat: -1 });
    if (getLang() === 'ko') text(this, 360, 1182, 'Tap to start', TYPE.tiny, COLOR.textSub, true).setOrigin(0.5);
    // 언어 바꾸기(토스는 한국어 전용이라 없음): 누르면 한국어 ↔ English 저장 후 다시 불러옴
    if (PLATFORM !== 'toss') {
      const st = loadSettings();
      button(this, 360, 1010, 340, 64, `🌐 ${st.lang === 'en' ? 'English' : '한국어'}  ·  Korean / English`, () => {
        saveSettings({ ...st, lang: st.lang === 'en' ? 'ko' : 'en' });
        setTimeout(() => location.reload(), 150);
      }, { kind: 'secondary', size: TYPE.tiny });
    }
    text(this, 360, 1236, `Dragon Force · v${APP_VERSION}`, TYPE.tiny, COLOR.textDim, true).setOrigin(0.5);
    if (DEMO) text(this, 360, 1060, 'DEMO · 시험용 저장(실제 진행과 따로)', TYPE.caption, 0xffb74d, true, true).setOrigin(0.5);

    let going = false;
    let blocked = false;
    // 업데이트 확인 결과: 필수면 시작을 막고 App Store로, 새 버전만 있으면 안내만(시작 가능)
    void this.version?.then((v) => {
      if (!this.scene.isActive() || v.status === 'ok') return;
      blocked = true; // 창이 떠 있는 동안 화면 터치로 시작하지 않게(선택 업데이트는 "나중에"로 풀림)
      this.updatePrompt(v, () => this.time.delayedCall(200, () => (blocked = false)));
    });
    const go = () => {
      if (going || blocked) return;
      going = true;
      playMusic(this, 'bgm-lobby');
      this.cameras.main.fadeOut(220, 11, 13, 23);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('lobby'));
    };
    // 버튼(언어 등)을 누른 건 시작으로 치지 않음
    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, hit: Phaser.GameObjects.GameObject[]) => {
      if (!hit.length) go();
    });
    this.input.keyboard?.on('keydown', go);
  }

  /** 업데이트 안내 창: 필수 업데이트는 닫기 없음 */
  private updatePrompt(v: VersionCheck, onLater: () => void): void {
    const required = v.status === 'required';
    const m = modal(this, 600, 520, required ? '업데이트가 필요해요' : '새 버전이 나왔어요', { closeOnBackdrop: false, ribbonColor: COLOR.violet });
    m.body(text(this, 0, -80, `지금 버전 v${APP_VERSION} → 새 버전 v${v.latest}`, TYPE.caption, COLOR.text, true, true).setOrigin(0.5));
    m.body(text(this, 0, -20, v.notice || (required ? '계속하려면 App Store에서 업데이트해 주세요' : '새로운 드래곤과 기능이 기다리고 있어요'), TYPE.tiny, COLOR.textSub, true).setOrigin(0.5).setWordWrapWidth(520).setAlign('center'));
    m.body(button(this, required ? 0 : -130, 110, 240, 72, '업데이트하기', () => window.open(APP_STORE_URL, '_system'), { kind: 'cta', size: TYPE.body }).root);
    if (!required) m.body(button(this, 130, 110, 220, 72, '나중에', () => (m.close(), onLater()), { kind: 'secondary', size: TYPE.body }).root);
  }
}
