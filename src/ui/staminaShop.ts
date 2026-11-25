import Phaser from 'phaser';
import { gameNow } from './widgets';
import { Progress } from '../systems/Progress';
import { regen, STAMINA } from '../systems/Stamina';
import { buyStaminaWithRubies, claimFreeStamina, freeStaminaLeft, STAMINA_BUY_FAIL_TEXT, STAMINA_SHOP, type StaminaBuyFail } from '../systems/StaminaShop';
import { playSfx } from '../systems/Sfx';
import { button, modal, text } from './kit';
import { plate } from './kit2';
import { toast } from './screen';
import { COLOR, TYPE } from './theme';

/**
 * 행동력 구매 창(제작자 요청 2026-11-26): 머리줄 행동력 "+"에서 연다(예전엔 선물함으로 이동).
 * 왼쪽 = 루비로 20개, 오른쪽 = 무료 5개(오늘 남은 횟수). 아래에 선물함 바로가기.
 * 그림: stamina-pack(행동력 묶음) · stamina-free(선물 상자 위 행동력) — Higgsfield, 우리 행동력 아이콘을 참고 그림으로.
 */
export function openStaminaShop(scene: Phaser.Scene, onChanged?: () => void): { close: () => void } {
  const m = modal(scene, 660, 640, '행동력 구매', { closeOnBackdrop: true, ribbonColor: 0x26a69a });
  let parts: Phaser.GameObjects.GameObject[] = [];

  const draw = () => {
    parts.forEach((o) => o.destroy());
    parts = [];
    const add = (o: Phaser.GameObjects.GameObject) => (m.body(o), parts.push(o));
    const now = gameNow();
    const p = Progress.load();
    const st = regen(p.stamina, now);
    add(text(scene, 0, -220, `보유 행동력 ${st.value} / ${STAMINA.max}  (최대 ${STAMINA.hold}까지 보관)`, TYPE.caption, COLOR.text, true, true).setOrigin(0.5));

    // 왼쪽: 루비로 구매
    const L = plate(scene, -158, 10, 290, 380, { r: 24, fill: 0x2b2442, gold: true });
    if (scene.textures.exists('stamina-pack')) L.add(scene.add.image(0, -92, 'stamina-pack').setDisplaySize(170, 170));
    L.add(text(scene, 0, 22, `×${STAMINA_SHOP.ruby.amount}`, 50, COLOR.text, true, true).setOrigin(0.5));
    add(L);
    add(button(scene, -158, 140, 230, 76, STAMINA_SHOP.ruby.rubies.toLocaleString(), () => run('ruby'), { kind: 'cta', icon: 'ui-ruby', size: TYPE.heading }).root);

    // 오른쪽: 무료(하루 3번)
    const left = freeStaminaLeft(p, now);
    const R = plate(scene, 158, 10, 290, 380, { r: 24, fill: 0x1f4a2a, gold: left > 0 });
    if (scene.textures.exists('stamina-free')) R.add(scene.add.image(0, -92, 'stamina-free').setDisplaySize(170, 170));
    R.add(text(scene, 0, 22, `×${STAMINA_SHOP.free.amount}`, 50, COLOR.text, true, true).setOrigin(0.5));
    R.add(text(scene, 0, 68, `오늘 남은 횟수: ${left}/${STAMINA_SHOP.free.perDay}`, TYPE.tiny, left > 0 ? COLOR.gold : COLOR.textSub, true, true).setOrigin(0.5));
    add(R);
    add(button(scene, 158, 140, 230, 76, left > 0 ? '무료' : '내일 다시', () => run('free'), { kind: left > 0 ? 'growth' : 'secondary', size: TYPE.heading }).root);

    add(button(scene, -150, 250, 250, 60, '선물함 열기', () => (m.close(), scene.scene.start('gifts')), { kind: 'secondary', size: TYPE.caption }).root);
    add(button(scene, 150, 250, 250, 60, '닫기', () => m.close(), { kind: 'secondary', size: TYPE.caption }).root);
  };

  const run = (kind: 'ruby' | 'free') => {
    const now = gameNow();
    const r = kind === 'ruby' ? buyStaminaWithRubies(Progress.load(), now) : claimFreeStamina(Progress.load(), now);
    if (!r.ok) {
      toast(scene, STAMINA_BUY_FAIL_TEXT[r.reason as StaminaBuyFail] ?? '받을 수 없어요', r.reason === 'noFree' ? COLOR.textSub : COLOR.danger);
      return;
    }
    Progress.save(r.progress);
    playSfx(scene, 'sfx-claim');
    toast(scene, `행동력 +${kind === 'ruby' ? STAMINA_SHOP.ruby.amount : STAMINA_SHOP.free.amount}`, COLOR.ok);
    onChanged?.();
    if (m.box.active) draw();
  };

  draw();
  return { close: m.close };
}
