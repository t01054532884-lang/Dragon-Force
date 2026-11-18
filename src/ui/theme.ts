// 디자인 토큰: 화면 전체가 같은 색·글꼴·모서리를 쓰도록 한곳에 모은다.
// 방향(기획 콘셉트 아트 기준): 어두운 보랏빛 남색 바탕 + 용암 주황·금색 강조, 등급은 정해진 5색.
export const COLOR = {
  bg: 0x0f1220, // 가장 뒤 배경
  bgTop: 0x1b1530, // 배경 그라데이션 위쪽(보랏빛)
  panel: 0x1c2233, // 카드·패널 바탕
  panelHi: 0x262e44, // 눌림·강조 패널
  line: 0x3a4566, // 패널 테두리
  text: 0xf2f4fa,
  textSub: 0xa9b3cc,
  textDim: 0x6f7a96,
  gold: 0xffc94d,
  ruby: 0xff3d6e,
  ember: 0xff7a1a, // 용암 주황(주 버튼·강조)
  emberDeep: 0xc2410c,
  violet: 0x7c5cff, // 마법(소환·상점)
  teal: 0x2ec4b6, // 성장·확인
  danger: 0xe53950,
  ok: 0x3ddc84,
} as const;

/** 등급 5색(기존 RARITY_COLOR와 같은 값 — 게임 전체에서 등급 색을 바꾸지 않는다) */
export const RARITY = {
  starter: 0xb0bec5,
  common: 0x9ccc65,
  rare: 0x4fc3f7,
  epic: 0xba68c8,
  legendary: 0xffb300,
} as const;

/** 0xRRGGBB → '#rrggbb' (Phaser 글자 색) */
export const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

export const FONT_FAMILY = "'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";

/** 글자 크기 단계(게임 좌표 720×1280 기준 px) */
export const TYPE = {
  display: 64, // 화면 제목
  title: 40,
  heading: 32,
  body: 26,
  caption: 22,
  tiny: 18,
} as const;

export const RADIUS = { s: 10, m: 18, l: 28, pill: 999 } as const;
export const SPACE = { xs: 6, s: 12, m: 20, l: 32, xl: 48 } as const;

/** 버튼 종류별 색(주 버튼 = 용암 주황, 보조 = 패널, 마법 = 보라, 위험 = 빨강) */
export const BUTTON = {
  primary: { fill: COLOR.ember, deep: COLOR.emberDeep, text: COLOR.text },
  secondary: { fill: 0x323b55, deep: 0x1f2538, text: COLOR.text },
  magic: { fill: COLOR.violet, deep: 0x4a33b8, text: COLOR.text },
  growth: { fill: 0x1fa394, deep: 0x116b61, text: COLOR.text },
  danger: { fill: COLOR.danger, deep: 0x8f1f30, text: COLOR.text },
} as const;
export type ButtonKind = keyof typeof BUTTON;
