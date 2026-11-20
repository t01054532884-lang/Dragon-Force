import Phaser from 'phaser';
import { DEMO, PLATFORM } from '../platform';

export const FONT = 'sans-serif';

export interface Button {
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  setEnabled(on: boolean, color?: number): void;
  setText(t: string): void;
}

/** 사각 버튼. enabled=false면 회색이고 눌리지 않는다. */
export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  text: string,
  color: number,
  onClick: () => void,
  fontSize = 32,
): Button {
  const bg = scene.add.rectangle(x, y, w, h, color).setStrokeStyle(4, 0xffffff, 0.8);
  const label = scene.add.text(x, y, text, { fontFamily: FONT, fontSize: `${fontSize}px`, color: '#ffffff', align: 'center' }).setOrigin(0.5);
  let enabled = true;
  let base = color;
  bg.setInteractive({ useHandCursor: true })
    .on('pointerdown', () => enabled && onClick())
    .on('pointerover', () => enabled && bg.setFillStyle(Phaser.Display.Color.IntegerToColor(base).brighten(15).color))
    .on('pointerout', () => bg.setFillStyle(enabled ? base : 0x3a3f4b));
  return {
    bg,
    label,
    setEnabled(on, c) {
      enabled = on;
      if (c !== undefined) base = c;
      bg.setFillStyle(on ? base : 0x3a3f4b).setStrokeStyle(4, 0xffffff, on ? 0.8 : 0.2);
      label.setColor(on ? '#ffffff' : '#9aa0aa');
    },
    setText(t) {
      label.setText(t);
    },
  };
}

/** 개발용 기능(진행 초기화) 표시 여부: 개발 서버이거나 주소에 ?dev=1 */
// iOS·토스 빌드에서는 주소창이 없어도 혹시 모를 노출을 막기 위해 항상 끔(App Store 심사: 개발용 UI 노출 금지)
export const devMode = () =>
  PLATFORM === 'web' && (import.meta.env.DEV || DEMO || new URLSearchParams(location.search).get('dev') === '1');

/**
 * 게임 안 현재 시각. 개발용(?dev=1&now=2026-12-05 또는 2026-12-05T23:59:30)으로 날짜를 바꿔 이벤트·미션을 시험할 수 있다.
 * 날짜만 주면 그날 KST 정오. 배포본(dev 아님)에서는 항상 실제 시각.
 */
export function gameNow(): number {
  if (!devMode()) return Date.now();
  const q = new URLSearchParams(location.search).get('now');
  if (!q) return Date.now();
  const t = Date.parse(q.length <= 10 ? `${q}T12:00:00+09:00` : q.includes('+') || q.endsWith('Z') ? q : `${q}+09:00`);
  return Number.isFinite(t) ? t : Date.now();
}
