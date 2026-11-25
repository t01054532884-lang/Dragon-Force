/**
 * 맵 테마 공격 효과(B안, 제작자 요청 2026-11-25): "보스·엘리트 스킬이 다 빨간 도형 — 얼음 맵은 서리 가시, 불 맵은 불꽃 균열,
 * 성당은 거미줄, 황금 폐허는 빛기둥처럼 맵에 맞게".
 * - warn: 예고 테두리·채움 색(빨강 대신 맵 색 — 밝고 진한 색으로 바닥과 구분)
 * - fx: 맞는 순간 튀는 입자 색 3개
 * - 바닥 효과 그림 `public/art/fx/atk-s<단계>.webp`(Higgsfield): 원형 예고 안에서 차오르고, 터질 때 크게 찍힌 뒤 사라짐.
 *   직선·부채꼴·고리 공격도 터질 때 이 그림을 줄지어 찍는다.
 * - shot: 적 탄 그림 `public/art/fx/shot-<종류>.webp`(오른쪽을 향함, 날아가는 방향으로 돌림)
 * 판정(위치·크기·시간)은 그대로 — 그림만 바뀐다.
 */
export type ShotKind = 'thorn' | 'moon' | 'fire' | 'ice' | 'ghost' | 'gold';

export interface AttackTheme {
  warn: number;
  fx: [number, number, number];
  shot: ShotKind;
}

export const ATTACK_THEMES: Record<number, AttackTheme> = {
  1: { warn: 0xff7043, fx: [0xff8a65, 0xffcc80, 0x9e9e9e], shot: 'fire' }, // 잿빛 숲: 재·불씨
  2: { warn: 0x9ccc65, fx: [0xc5e1a5, 0x8bc34a, 0x33691e], shot: 'thorn' }, // 가시덩굴 길
  3: { warn: 0xb388ff, fx: [0xd1c4e9, 0xb388ff, 0xeceff1], shot: 'moon' }, // 버려진 사냥터: 달빛 발톱
  4: { warn: 0xd4e157, fx: [0xe6ee9c, 0xc0ca33, 0x8d6e63], shot: 'thorn' }, // 고목의 심장: 포자·뿌리
  5: { warn: 0xff6d00, fx: [0xffab40, 0xffd740, 0xff3d00], shot: 'fire' }, // 불타는 관문
  6: { warn: 0xff3d00, fx: [0xff8a65, 0xffd180, 0xbdbdbd], shot: 'fire' }, // 붉은 병영
  7: { warn: 0xff9100, fx: [0xffab40, 0xffe57f, 0xff3d00], shot: 'fire' }, // 용암 제련소
  8: { warn: 0xffab00, fx: [0xffd180, 0xff6d00, 0x9e9e9e], shot: 'fire' }, // 불멸의 성벽
  9: { warn: 0x4fc3f7, fx: [0xe1f5fe, 0x81d4fa, 0xffffff], shot: 'ice' }, // 얼어붙은 계곡
  10: { warn: 0x18ffff, fx: [0x84ffff, 0x4dd0e1, 0xe0f7fa], shot: 'ice' }, // 수정 동굴
  11: { warn: 0x80d8ff, fx: [0xffffff, 0xe1f5fe, 0xb3e5fc], shot: 'ice' }, // 눈보라 고원
  12: { warn: 0x40c4ff, fx: [0xb3e5fc, 0x80d8ff, 0xffffff], shot: 'ice' }, // 영원의 빙궁
  13: { warn: 0x7c8cff, fx: [0x9fa8da, 0xb388ff, 0xe8eaf6], shot: 'ghost' }, // 망자의 거리
  14: { warn: 0xd500f9, fx: [0xce93d8, 0x7e57c2, 0x212121], shot: 'ghost' }, // 그림자 성당
  15: { warn: 0x448aff, fx: [0x90caf9, 0x5c6bc0, 0xe3f2fd], shot: 'ghost' }, // 검은 왕좌의 길
  16: { warn: 0xff4081, fx: [0xf48fb1, 0xea80fc, 0x6a1b9a], shot: 'ghost' }, // 저주받은 왕궁
  17: { warn: 0xffd740, fx: [0xfff8e1, 0xffd54f, 0xffb300], shot: 'gold' }, // 황금빛 폐허
  18: { warn: 0xb388ff, fx: [0xfff59d, 0xb388ff, 0xffffff], shot: 'gold' }, // 별의 회랑
  19: { warn: 0xff6e40, fx: [0xffab40, 0xff3d00, 0xffd180], shot: 'fire' }, // 용의 제단
  20: { warn: 0xffe57f, fx: [0xfff8e1, 0xffd54f, 0xffffff], shot: 'gold' }, // 봉인의 중심
};

export const attackTheme = (stageId: number): AttackTheme => ATTACK_THEMES[((stageId - 1) % 20) + 1] ?? ATTACK_THEMES[1];
export const SHOT_KINDS: ShotKind[] = ['thorn', 'moon', 'fire', 'ice', 'ghost', 'gold'];

/**
 * 연속 피해 상한(2026-11-25, 제작자: "보스·엘리트 공격에 한 번에 죽는 오류가 없어야"):
 * 패턴 공격은 맞을 때 무적 시간을 무시해서(여러 겹 고리·이어지는 폭발·어려움 재공격) 한 방 상한 35%가 연달아 들어갈 수 있었다.
 * → 엘리트·보스에게서 windowMs 안에 받는 피해 합계를 최대 HP의 ratio까지로 막는다(일반 몬스터는 제외 — 무리에 둘러싸이는 건 위치 선택의 몫).
 * 봇 측정(같은 날): 맵 기믹은 상한이 없어 HP가 낮으면 0.5초 만에 다 닳는 구간(쉬움 19단계) → 맵 기믹도 1초 합계에 넣고, 한 번 피해는 최대 HP의 mapHit까지.
 */
export const BURST_CAP = { windowMs: 1000, ratio: 0.5, mapHit: 0.2 };
