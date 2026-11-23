/**
 * 스킨(제작자 요청 2026-11-23 밤): 프리미엄 꾸미기 — 능력치는 없다(전투력·밸런스에 영향 없음).
 * - 망토: 전투 중 드래곤 등에 붙어 함께 움직인다(탑다운 그림 아래층).
 * - 발자국(흔적): 드래곤이 움직일 때 지나간 자리에 효과가 남는다.
 * 스킨은 계정 공통(장비처럼 어느 드래곤으로 출격해도 같은 스킨). 장비 화면의 "스킨" 칸에서 장착.
 *
 * 얻는 곳: 겨울 축제 아래 "스킨 룰렛" — 열쇠 1개로 1회, 뽑힌 칸은 다시 안 나옴(남은 칸 가중치로 다시 계산).
 * 9칸이라 열쇠 최대 9개로 판 전체(가운데 망토 포함)를 받는다. 판은 매주 월요일 0시(KST)에 바뀐다.
 * 그림이 오기 전에는 색·모양 값으로 도형 그림을 그린다(src/ui/skinArt.ts). 그림 파일이 오면 같은 아이디로 연결.
 */

export type SkinKind = 'cape' | 'trail';
export type TrailShape = 'flame' | 'frost' | 'star' | 'petal' | 'spark' | 'shadow';

export interface SkinDef {
  id: string;
  kind: SkinKind;
  name: string;
  text: string;
  /** 망토: 바깥색·안감색 / 흔적: 효과 색 두 가지 */
  colors: [number, number];
  trail?: TrailShape;
}

export const SKINS: SkinDef[] = [
  // ── 망토(가운데 칸 = 그 주의 대표 스킨) ──
  { id: 'cape-ember-king', kind: 'cape', name: '불꽃왕의 망토', text: '진홍 비단에 금실 불꽃 무늬', colors: [0xb71c1c, 0xffc107] },
  { id: 'cape-frost-crown', kind: 'cape', name: '서리 왕관 망토', text: '눈꽃 결정이 반짝이는 하늘빛 망토', colors: [0x4fc3f7, 0xe1f5fe] },
  { id: 'cape-starlight', kind: 'cape', name: '별빛 망토', text: '밤하늘처럼 별이 흐르는 망토', colors: [0x311b92, 0xb388ff] },
  // ── 발자국(흔적) ──
  { id: 'trail-flame', kind: 'trail', name: '불꽃 발자국', text: '지나간 자리에 작은 불꽃이 남는다', colors: [0xff7043, 0xffd54f], trail: 'flame' },
  { id: 'trail-frost', kind: 'trail', name: '서리 발자국', text: '지나간 자리에 눈꽃이 피었다 녹는다', colors: [0x81d4fa, 0xffffff], trail: 'frost' },
  { id: 'trail-star', kind: 'trail', name: '별가루 발자국', text: '반짝이는 별가루가 흩날린다', colors: [0xfff176, 0xffffff], trail: 'star' },
  { id: 'trail-petal', kind: 'trail', name: '꽃잎 발자국', text: '분홍 꽃잎이 흩어진다', colors: [0xf48fb1, 0xfce4ec], trail: 'petal' },
  { id: 'trail-spark', kind: 'trail', name: '번개 발자국', text: '푸른 전기 불꽃이 튄다', colors: [0x40c4ff, 0xe1f5fe], trail: 'spark' },
  { id: 'trail-shadow', kind: 'trail', name: '그림자 발자국', text: '보랏빛 연기가 남았다 사라진다', colors: [0x7e57c2, 0x311b92], trail: 'shadow' },
];

export const skinDef = (id: string | null | undefined): SkinDef | undefined => SKINS.find((s) => s.id === id);

/** 룰렛 칸 하나. 스킨 칸 또는 재화 칸 */
export interface SkinSlot {
  id: string;
  weight: number;
  skin?: string;
  rubies?: number;
  gold?: number;
  dragonTickets?: number;
  equipTickets?: number;
  /** 영웅 드래곤 정수 1개(영웅 중 하나, 균등 — 없으면 해금, 있으면 조각) */
  epicEssence?: boolean;
}

/**
 * 판 공통 재화 칸 6개 + 매주 바뀌는 스킨 칸 3개(가운데 망토 1 · 발자국 2) = 9칸, 처음 가중치 합 100(AI 1차안, 임시 수치).
 * 처음 1회 확률 = 가중치 %. 뽑힌 칸은 빠지고 남은 칸 가중치 합으로 다시 나눈다.
 * 루비 가치 참고: 루비 상품 1루비 ≈ 7.3~12원 → 열쇠 4,900원 ≈ 루비 410~670.
 */
export const SKIN_ROULETTE = {
  keyKrw: 4_900,
  keyProductId: 'skin_key_1', // App Store Connect·RevenueCat 소모성 상품으로 등록(등록 전 확정 필요)
  /** 이미 가진 스킨이 다시 판에 오면 그 칸은 루비로 대신 */
  duplicateRubies: 1_500,
  capeWeight: 4,
  trailWeight: 8,
  common: [
    { id: 'ruby-300', weight: 20, rubies: 300 },
    { id: 'gold-30k', weight: 18, gold: 30_000 },
    { id: 'dragon-ticket-3', weight: 14, dragonTickets: 3 },
    { id: 'equip-ticket-5', weight: 14, equipTickets: 5 },
    { id: 'ruby-1000', weight: 8, rubies: 1_000 },
    { id: 'epic-essence', weight: 6, epicEssence: true },
  ] as SkinSlot[],
  /** 주마다 바뀌는 스킨 묶음(순서대로 돌고, 끝나면 처음부터). 새 스킨을 만들면 여기에 한 줄 */
  rotations: [
    { cape: 'cape-ember-king', trails: ['trail-flame', 'trail-star'] },
    { cape: 'cape-frost-crown', trails: ['trail-frost', 'trail-spark'] },
    { cape: 'cape-starlight', trails: ['trail-petal', 'trail-shadow'] },
  ] as { cape: string; trails: [string, string] }[],
  /** 첫 판이 시작하는 주의 월요일(KST). 이 주가 rotations[0] */
  epochMonday: '2026-11-23',
};
