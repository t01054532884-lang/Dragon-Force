import { iapPeriodKey } from './iap';
import { SKIN_ROULETTE as R, type SkinSlot } from './skins';

/**
 * 스킨 룰렛 판·추첨 규칙(순수 함수) — 앱과 서버(functions/)가 같이 쓴다(2026-11-24).
 * 열쇠는 현금 결제라 추첨은 서버가 한다(제작자 결정 11/24: "더 적절한 쪽으로"):
 * 앱에서 뽑으면 저장을 되돌려(클라우드 저장 선택 창 등) 마음에 들 때까지 다시 뽑거나, 저장을 고쳐 열쇠를 늘릴 수 있다.
 * 서버는 장부의 열쇠 구매 수 − 쓴 열쇠로 남은 열쇠를 세고, 판·보유 스킨도 서버 기록으로 판단한다.
 */

/** 이번 주 키(그 주 월요일, KST): 'wYYYY-MM-DD' */
export const rouletteWeek = (now: number) => iapPeriodKey('weekly', now);

/** 이번 주가 첫 판(epochMonday)으로부터 몇 번째 주인지 → 스킨 묶음 */
export function rotationIndex(now: number): number {
  const monday = rouletteWeek(now).slice(1);
  const weeks = Math.round((Date.parse(`${monday}T00:00:00Z`) - Date.parse(`${R.epochMonday}T00:00:00Z`)) / (7 * 86_400_000));
  const n = R.rotations.length;
  return ((weeks % n) + n) % n;
}

/** 다음 판이 바뀌는 시각(다음 주 월요일 0시 KST, ms) */
export function nextRotationAt(now: number): number {
  return Date.parse(`${rouletteWeek(now).slice(1)}T00:00:00+09:00`) + 7 * 86_400_000;
}

export interface BoardSlot extends SkinSlot {
  /** 가진 스킨이라 루비로 바뀐 칸 */
  duplicate?: boolean;
  center?: boolean;
}

/** 판 기록: 이번 주에 뽑은 칸 */
export interface BoardState {
  week: string;
  picked: string[];
}

/**
 * 이번 주 판: [0] = 가운데 망토, [1..8] = 바깥 8칸(그리는 순서).
 * 이미 가진 스킨(이번 판에서 뽑은 것 말고 — 예전 주에 얻은 것)은 루비 칸(R.duplicateRubies)으로 바뀐다.
 */
export function boardSlots(owned: readonly string[], picked: readonly string[], now: number): BoardSlot[] {
  const rot = R.rotations[rotationIndex(now)];
  const skinSlot = (id: string, weight: number, center = false): BoardSlot => {
    const dup = owned.includes(id) && !picked.includes(id);
    return dup ? { id, weight, rubies: R.duplicateRubies, duplicate: true, center } : { id, weight, skin: id, center };
  };
  const [c0, c1, c2, c3, c4, c5] = R.common;
  return [
    skinSlot(rot.cape, R.capeWeight, true),
    { ...c0 }, skinSlot(rot.trails[0], R.trailWeight), { ...c1 }, { ...c2 },
    { ...c3 }, skinSlot(rot.trails[1], R.trailWeight), { ...c4 }, { ...c5 },
  ];
}

/** 이번 주 기준 판 기록(주가 바뀌었으면 뽑은 칸 비움) */
export const syncBoard = (b: BoardState, now: number): BoardState => (b.week === rouletteWeek(now) ? b : { week: rouletteWeek(now), picked: [] });

/** 남은 칸 중 가중치로 하나. rnd는 0 이상 1 미만. 남은 칸이 없으면 null */
export function drawSlot(slots: BoardSlot[], picked: readonly string[], rnd: number): BoardSlot | null {
  const left = slots.filter((s) => !picked.includes(s.id));
  if (!left.length) return null;
  const total = left.reduce((a, s) => a + s.weight, 0);
  let x = rnd * total;
  for (const s of left) if ((x -= s.weight) < 0) return s;
  return left[left.length - 1];
}

/** 서버 추첨 한 번의 기록(장부 skinSpins/{id}) — 앱은 이것만 보고 지급한다 */
export interface ServerSpin {
  id: string;
  week: string;
  slot: BoardSlot;
  /** 영웅 정수 칸일 때 어떤 영웅인지 고르는 난수(서버가 정함, 0~1) */
  essenceRoll: number;
  at: number;
}

/** 서버가 알려 주는 룰렛 상태 */
export interface ServerSkinState {
  keysLeft: number;
  owned: string[];
  board: BoardState;
  /** 아직 앱에 지급하지 않은 추첨 */
  pending: ServerSpin[];
}
