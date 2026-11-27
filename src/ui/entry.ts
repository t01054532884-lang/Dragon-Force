import Phaser from 'phaser';
import { Progress } from '../systems/Progress';
import { staminaNow } from '../systems/Mailbox';
import { STAMINA, formatLeft, nextRegenIn } from '../systems/Stamina';
import { FONT, gameNow } from './widgets';
import { runEntry } from '../systems/battleEntry';

/**
 * 전투 입장(8단계): 행동력 5를 먼저 빼고 전투를 시작한다. 부족하면 아무것도 바뀌지 않고 안내만 띄운다.
 * 입장 지점 4곳(로비 전투 시작 · 연구소 바로 전투 · 결과 화면 다음 단계 · 재도전)이 모두 이 함수를 쓴다.
 * 실패·포기 때 돌려주지 않는다(제작자 확정 2026-11-18).
 * @param free true면 차감하지 않음(개발용 잠긴 난이도 시험 플레이처럼 저장하지 않는 판)
 */
export function enterBattle(
  scene: Phaser.Scene,
  data: { stageId: number; difficulty?: string; dragonId?: string; anyDragon?: boolean; free?: boolean },
  opts: { restart?: boolean; free?: boolean } = {},
): boolean {
  const free = !!opts.free;
  const now = gameNow();
  // 무료 판(개발용 시험)이라는 표시를 전투에도 넘겨, 그 판의 재도전·다음 단계도 무료로 이어지게 한다
  const d = free ? { ...data, free: true } : data;
  return runEntry(free, () => Progress.spendEntry(now), () => showStaminaShort(scene, now), () => {
    if (opts.restart) scene.scene.restart(d);
    else scene.scene.start('game', d);
  });
}

/** 행동력 부족 안내(화면 가운데 2.5초) */
export function showStaminaShort(scene: Phaser.Scene, now = gameNow()): void {
  const s = staminaNow(Progress.load(), now);
  const next = nextRegenIn(s, now);
  const need = STAMINA.entryCost - s.value;
  const wait = next === null ? '' : `\n입장 가능까지 ${formatLeft(next + Math.max(0, need - 1) * STAMINA.regenMs)} 남음`;
  const box = scene.add.rectangle(360, 640, 600, 190, 0x1e2430, 0.97).setStrokeStyle(4, 0xff8a80, 0.9).setDepth(900);
  const t = scene.add
    .text(360, 640, `⚡ 행동력이 부족해요 (필요 ${STAMINA.entryCost} · 현재 ${s.value})${wait}\n선물함에 받을 행동력이 있는지 확인해 보세요`, {
      fontFamily: FONT, fontSize: '24px', color: '#ffffff', align: 'center', lineSpacing: 8,
    })
    .setOrigin(0.5)
    .setDepth(901);
  scene.cameras.main.shake(120, 0.003);
  scene.time.delayedCall(2500, () => {
    box.destroy();
    t.destroy();
  });
}
