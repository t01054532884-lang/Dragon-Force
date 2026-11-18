import Phaser from 'phaser';

// 디자인 토큰: 화면 전체가 같은 색·글꼴·모서리를 쓰도록 한곳에 모은다.
// 방향: 통통한 카툰 UI(굵은 어두운 외곽선 + 두께 있는 버튼) — 장르 공통 형식.
// 색은 우리 것: 어두운 남보라 바탕 + 용암 주황·금색 강조(드래곤 성지), 등급은 정해진 5색.
export const COLOR = {
  bg: 0x0f1220, // 가장 뒤 배경
  bgTop: 0x1b1530, // 배경 그라데이션 위쪽(보랏빛)
  panel: 0x232a40, // 카드·패널 바탕
  panelHi: 0x2e3756, // 강조 패널
  panelLight: 0xf3e6c8, // 밝은 양피지 패널(출석·보상 목록)
  line: 0x3a4566, // 얇은 구분선
  outline: 0x0b0d17, // 카툰 외곽선(버튼·카드·리본)
  text: 0xffffff,
  textSub: 0xb9c2da,
  textDim: 0x6f7a96,
  textDark: 0x3b2410, // 밝은 패널 위 글자
  gold: 0xffc94d,
  ruby: 0xff3d6e,
  ember: 0xff7a1a, // 용암 주황
  emberDeep: 0xc2410c,
  cta: 0xffc22e, // 가장 중요한 행동(전투 시작) — 노란색
  ctaDeep: 0xd18400,
  violet: 0x8a63ff, // 마법(소환·상점)
  teal: 0x22b8a8, // 성장·확인
  danger: 0xe53950,
  alert: 0xff3348, // 새 소식 "!"
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
export type RarityKey = keyof typeof RARITY;
export const RARITY_NAME: Record<RarityKey, string> = { starter: '기본', common: '일반', rare: '희귀', epic: '영웅', legendary: '전설' };

/** 0xRRGGBB → '#rrggbb' (Phaser 글자 색) */
export const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** 색을 밝게(+)/어둡게(-) */
export const tint = (c: number, amount: number) => {
  const col = Phaser.Display.Color.IntegerToColor(c);
  return (amount >= 0 ? col.brighten(amount) : col.darken(-amount)).color;
};

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

export const RADIUS = { s: 10, m: 18, l: 26, pill: 999 } as const;
export const SPACE = { xs: 6, s: 12, m: 20, l: 32, xl: 48 } as const;
export const STROKE = { outline: 5, text: 6 } as const;

/** 버튼 종류별 색: cta = 전투 시작(노랑), primary = 용암 주황, secondary = 회청, magic = 보라, growth = 청록, danger = 빨강 */
export const BUTTON = {
  cta: { fill: COLOR.cta, deep: COLOR.ctaDeep },
  primary: { fill: COLOR.ember, deep: COLOR.emberDeep },
  secondary: { fill: 0x4a5577, deep: 0x2c3450 },
  magic: { fill: COLOR.violet, deep: 0x5534c9 },
  growth: { fill: COLOR.teal, deep: 0x117a6f },
  danger: { fill: COLOR.danger, deep: 0x8f1f30 },
} as const;
export type ButtonKind = keyof typeof BUTTON;

