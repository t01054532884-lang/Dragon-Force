import Phaser from 'phaser';
import { RUBY_PRODUCTS } from '../data/economy';
import { buyFailText, buyProduct, grantLine, PAY_NOTICE, purchases, restoreAll, type RubyProduct } from '../systems/Purchases';
import { button, modal, text } from './kit';
import { plate } from './kit2';
import { toast } from './screen';
import { COLOR, TYPE } from './theme';

/**
 * 루비 충전 창(첫 출시 결제 — 제작자 결정 2026-11-20). 머리줄 루비 "+"에서 연다.
 * 결제 → RevenueCat → 서버 검증 → 서버 장부의 지급만 반영(docs/PAYMENTS.md). 구매 복원 버튼 포함(애플 필수).
 * 결제를 쓸 수 없는 곳(웹·토스·데모·서버 연결 전)은 "앱에서" 안내만.
 */
export function openRubyShop(scene: Phaser.Scene, onChanged?: () => void): { close: () => void } {
  const m = modal(scene, 660, 1000, '루비 충전', { closeOnBackdrop: true, ribbonColor: COLOR.ruby });
  let busy = false;

  const draw = (products: RubyProduct[]) => {
    const available = purchases.available && products.length > 0;
    RUBY_PRODUCTS.forEach((def, i) => {
      const y = -340 + i * 118;
      const row = plate(scene, 0, y, 590, 104, { r: 20, fill: i >= 3 ? 0x3a2370 : 0x2b2442, gold: i === 2 });
      if (scene.textures.exists('ui-ruby')) row.add(scene.add.image(-245, 0, 'ui-ruby').setDisplaySize(70, 70));
      row.add(text(scene, -195, -14, `${(def.rubies + def.bonus).toLocaleString()} 루비`, TYPE.body, COLOR.text, true, true).setOrigin(0, 0.5));
      row.add(text(scene, -195, 20, def.bonus ? `기본 ${def.rubies.toLocaleString()} + 보너스 ${def.bonus.toLocaleString()}` : '기본', 16, def.bonus ? COLOR.gold : COLOR.textSub, true).setOrigin(0, 0.5));
      const p = products.find((x) => x.productId === def.productId);
      const b = button(scene, 200, 0, 170, 70, available && p ? p.priceLabel : '앱에서', () => {
        if (busy) return;
        if (!available || !p) {
          toast(scene, '루비 구매는 App Store 앱에서 할 수 있어요', COLOR.textSub);
          return;
        }
        busy = true;
        void buyProduct(def.productId)
          .then((r) => {
            if (r.ok) {
              toast(scene, `${grantLine(r.delivered.total) || '루비'} 충전 완료`, COLOR.ok);
              onChanged?.();
              return;
            }
            const msg = buyFailText(r.reason);
            if (msg) toast(scene, msg, r.reason === 'failed' ? COLOR.danger : COLOR.textSub);
          })
          .finally(() => (busy = false));
      }, { kind: available && p ? 'cta' : 'secondary', size: TYPE.caption });
      row.add(b.root);
      m.body(row);
    });
    m.body(button(scene, -150, 270, 250, 64, '구매 복원', () => {
      if (busy) return;
      if (!purchases.available) {
        toast(scene, '구매 복원은 App Store 앱에서 할 수 있어요', COLOR.textSub);
        return;
      }
      busy = true;
      restoreAll()
        .then((d) => {
          const line = d ? grantLine(d.total) : '';
          toast(scene, line ? `복원 완료 · ${line}` : d?.applied.length ? '복원 완료' : '복원할 결제가 없어요', d?.applied.length ? COLOR.ok : COLOR.textSub);
          if (d?.applied.length) onChanged?.();
        })
        .catch(() => toast(scene, '복원하지 못했어요. 잠시 뒤 다시 시도해 주세요', COLOR.danger))
        .finally(() => (busy = false));
    }, { kind: 'secondary', size: TYPE.caption }).root);
    m.body(button(scene, 150, 270, 250, 64, '닫기', () => m.close(), { kind: 'secondary', size: TYPE.caption }).root);
    // 결제 전 안내 + 확률 안내 위치
    m.body(
      text(scene, 0, 395, `${PAY_NOTICE}\n루비 상자 확률은 상점의 "확률 · 보장 안내"에서 볼 수 있어요`, 15, COLOR.textSub, true)
        .setOrigin(0.5)
        .setAlign('center')
        .setLineSpacing(6),
    );
  };

  // 스토어 가격 받아 오기(결제를 쓸 수 없으면 바로 빈 목록)
  purchases
    .products()
    .catch(() => [] as RubyProduct[])
    .then((list) => {
      if (m.box.active) draw(list);
    });
  return m;
}
