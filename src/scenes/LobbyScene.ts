import Phaser from 'phaser';
import { makeTextures } from '../textures';
import { STAGES } from '../data/stages';
import { buildRunStats } from '../data/progression';
import { DRAGONS, ELEMENT_LABEL, RARITY_COLOR, RARITY_LABEL } from '../data/dragons';
import { Progress } from '../systems/Progress';
import { devMode, FONT, makeButton } from '../ui/widgets';

// 메인 로비: 드래곤 선택 · 스테이지 선택 · 성장 연구소 · 전투 시작 (5단계 기획서 5장)
export class LobbyScene extends Phaser.Scene {
  private stageIndex = 0;

  constructor() {
    super('lobby');
  }

  create(): void {
    if (!this.textures.exists('dragon-red')) makeTextures(this);
    const p = Progress.load();
    const playable = STAGES.filter((s) => p.unlockedStages.includes(s.id));
    this.stageIndex = Math.min(this.stageIndex, playable.length - 1);

    this.add.rectangle(360, 640, 720, 1280, 0x14181f);
    this.add.text(360, 150, '드래곤 특공대', { fontFamily: FONT, fontSize: '68px', fontStyle: 'bold', color: '#ffd34d', stroke: '#000', strokeThickness: 8 }).setOrigin(0.5);
    this.add.text(360, 220, 'DRAGON FORCE', { fontFamily: FONT, fontSize: '26px', color: '#c9d3ee' }).setOrigin(0.5);
    this.add.text(690, 24, `🪙 ${p.gold.toLocaleString()}G`, { fontFamily: FONT, fontSize: '28px', color: '#ffd34d' }).setOrigin(1, 0);
    this.add.text(30, 24, `🎟 ${p.summonTickets}장`, { fontFamily: FONT, fontSize: '28px', color: '#e1bee7' });

    // 출격 드래곤(선택은 '드래곤' 화면에서)
    const d = DRAGONS[p.selectedDragonId];
    const o = p.ownedDragons[d.id]!;
    const st = buildRunStats(d, p.upgrades, o).stats;
    const rc = RARITY_COLOR[d.rarity];
    this.add.rectangle(360, 450, 640, 300, 0x1f2633).setStrokeStyle(3, rc, 0.9);
    const dragon = this.add.image(180, 450, `portrait-${d.id}`).setScale(1.1);
    this.tweens.add({ targets: dragon, y: 435, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.add.text(310, 330, d.name, { fontFamily: FONT, fontSize: '38px', fontStyle: 'bold', color: '#ffffff' });
    this.add.text(310, 382, `${ELEMENT_LABEL[d.element]} · ${RARITY_LABEL[d.rarity]} · ${d.basic.name}`, { fontFamily: FONT, fontSize: '22px', color: `#${rc.toString(16).padStart(6, '0')}` });
    this.add.text(310, 420, `${'★'.repeat(o.stars)}${'☆'.repeat(5 - o.stars)}  영구 Lv.${o.level}`, { fontFamily: FONT, fontSize: '24px', color: '#ffd34d' });
    this.add.text(310, 460, `공격력 ${st.attack.toFixed(1)} · HP ${Math.round(st.maxHp)}\n속도 ${Math.round(st.speed)} · 보석 반경 ${Math.round(st.magnet)}\n${d.trait.text}`, {
      fontFamily: FONT, fontSize: '20px', color: '#c9d3ee', lineSpacing: 4, wordWrap: { width: 370 },
    });
    this.add.text(360, 625, `보유 드래곤 ${Object.keys(p.ownedDragons).length} / 10`, { fontFamily: FONT, fontSize: '20px', color: '#6f7a8c' }).setOrigin(0.5);

    // 스테이지 선택(해금된 단계만)
    const stageText = this.add.text(360, 760, '', { fontFamily: FONT, fontSize: '36px', color: '#ffffff' }).setOrigin(0.5);
    const show = () => {
      const s = playable[this.stageIndex];
      stageText.setText(`${s.id}단계 — ${s.name}`);
      prev.setEnabled(this.stageIndex > 0);
      next.setEnabled(this.stageIndex < playable.length - 1);
    };
    const prev = makeButton(this, 90, 760, 90, 90, '◀', 0x3a4458, () => (this.stageIndex--, show()));
    const next = makeButton(this, 630, 760, 90, 90, '▶', 0x3a4458, () => (this.stageIndex++, show()));
    this.add.text(360, 815, `해금 ${Math.max(...p.unlockedStages)}단계까지 · 지금 플레이 가능: ${STAGES.length}개`, { fontFamily: FONT, fontSize: '20px', color: '#6f7a8c' }).setOrigin(0.5);
    show();

    makeButton(this, 360, 935, 560, 110, '전투 시작', 0xc0392b, () => this.scene.start('game', { stageId: playable[this.stageIndex].id }), 44);
    makeButton(this, 160, 1070, 200, 100, '드래곤', 0x2e5d8a, () => this.scene.start('dragons'), 30);
    makeButton(this, 360, 1070, 180, 100, '소환', 0x6a3fb5, () => this.scene.start('summon'), 30);
    makeButton(this, 560, 1070, 200, 100, '연구소', 0x7a5a12, () => this.scene.start('lab', { from: 'lobby' }), 30);
    this.add.text(360, 1190, 'PC: WASD·방향키 이동, ESC 일시정지 · 휴대폰: 화면을 끌어 이동', { fontFamily: FONT, fontSize: '20px', color: '#6f7a8c' }).setOrigin(0.5);

    this.input.keyboard?.on('keydown-ENTER', () => this.scene.start('game', { stageId: playable[this.stageIndex].id }));

    if (devMode()) this.devReset();
  }

  /** 개발·심사용 진행 초기화: 두 번 확인한다 */
  private devReset(): void {
    let armed = false;
    const t = this.add.text(360, 1245, '[개발용] 진행 초기화', { fontFamily: FONT, fontSize: '20px', color: '#8a5555' }).setOrigin(0.5);
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
      this.scene.restart();
    });
  }
}
