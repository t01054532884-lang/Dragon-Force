import Phaser from 'phaser';

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
export const devMode = () => import.meta.env.DEV || new URLSearchParams(location.search).get('dev') === '1';
