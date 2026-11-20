import Phaser from 'phaser';
import { drawLobbyBackdrop, makeArtPlaceholders, preloadArt } from '../ui/art';
import { text } from '../ui/kit';
import { COLOR, TYPE } from '../ui/theme';
import { playMusic, preloadMusic } from '../systems/Music';

/**
 * 시작 화면(8단계 HANDOFF 5번): 기획자 그림 한글 로고(logo-ko) + 타이틀 장식(title-deco).
 * 여기서 게임 그림을 한 번 읽고(진행 막대), 화면을 누르면 로비로. 첫 터치에서 브라우저·iOS가 소리를 허용하므로
 * 배경 음악도 이 터치 뒤에 시작한다(10.2 "첫 사용자 입력 이후 오디오 활성화").
 */
export class TitleScene extends Phaser.Scene {
  constructor() {
    super('title');
  }

  preload(): void {
    // 진행 막대(그림 읽는 동안)
    const bar = this.add.graphics();
    const label = text(this, 360, 1150, '불러오는 중…', TYPE.caption, COLOR.textSub, true, true).setOrigin(0.5);
    this.load.on('progress', (v: number) => {
      bar.clear();
      bar.fillStyle(COLOR.outline, 1).fillRoundedRect(158, 1180, 404, 22, 11);
      bar.fillStyle(COLOR.cta, 1).fillRoundedRect(160, 1182, Math.max(18, 400 * v), 18, 9);
    });
    this.load.once('complete', () => {
      bar.destroy();
      label.destroy();
    });
    preloadArt(this);
    preloadMusic(this, ['bgm-lobby']);
  }

  create(): void {
    makeArtPlaceholders(this);
    drawLobbyBackdrop(this);
    this.add.rectangle(360, 640, 720, 1280, 0x0b0d17, 0.35);
    if (this.textures.exists('title-deco')) {
      const deco = this.add.image(360, 700, 'title-deco');
      deco.setScale(720 / deco.width);
      this.tweens.add({ targets: deco, y: 690, duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
    if (this.textures.exists('logo-ko')) {
      const logo = this.add.image(360, 230, 'logo-ko');
      const base = 620 / logo.width;
      logo.setScale(base * 0.6).setAlpha(0);
      this.tweens.add({ targets: logo, scale: base, alpha: 1, duration: 420, ease: 'Back.Out' });
      this.tweens.add({ targets: logo, y: 238, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.InOut', delay: 420 });
    } else {
      text(this, 360, 230, '드래곤 특공대', TYPE.display, COLOR.gold, true, true).setOrigin(0.5);
    }
    const tap = text(this, 360, 1140, '화면을 눌러 시작', TYPE.heading, COLOR.text, true, true).setOrigin(0.5);
    this.tweens.add({ targets: tap, alpha: 0.35, duration: 800, yoyo: true, repeat: -1 });
    text(this, 360, 1236, 'Dragon Force', TYPE.tiny, COLOR.textDim, true).setOrigin(0.5);

    let going = false;
    const go = () => {
      if (going) return;
      going = true;
      playMusic(this, 'bgm-lobby');
      this.cameras.main.fadeOut(220, 11, 13, 23);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('lobby'));
    };
    this.input.once('pointerdown', go);
    this.input.keyboard?.once('keydown', go);
  }
}
