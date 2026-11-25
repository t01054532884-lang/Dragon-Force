import { M } from './stats';
import type { PatternSpec } from './enemies';

/**
 * 보스 2페이즈(제작자 요청 2026-11-25): "체력 50%가 되면 더 어둡고 분노한 모습(디테일도 조금씩 바뀜) +
 * 2페이즈에서만 쓰는 공격 하나씩 + 발밑에 보스 색 오라".
 * - 그림: `public/art/enemy/art-<텍스처>-p2.webp`(Higgsfield, 1페이즈 그림을 참고 그림으로). 없으면 1페이즈 그림 그대로.
 * - aura: 발밑 오라 색
 * - move: 2페이즈에서만 쓰는 공격. 2페이즈 공격 목록 맨 앞에 넣어 전환 직후 첫 공격이 된다(그 뒤로는 차례대로 돌아감).
 *   수치는 AI 1차안(1단계 기준 피해, 단계 배율은 따로 곱함) — 사람 플레이로 조정.
 * 1단계 회색갈기(graymane)는 고유 행동이라 move 대신 Enemy.ts graymane 차례에 "피의 울부짖음"(고리 충격파)을 넣었다.
 */
export interface BossPhase2 {
  aura: number;
  /** 공격 이름(기록·문서용) */
  name: string;
  move?: PatternSpec;
}

const lines = (count: number, damage = 20, width = 0.9 * M, length = 10 * M): PatternSpec => ({ t: 'lineRadial', count, width, length, damage });
const spiral = (waves: number, count: number, damage = 12, speed = 240, turn = 0.2): PatternSpec => ({ t: 'spiral', waves, count, speed, damage, turn });
const march = (count: number, damage = 18, r = 1.3 * M, slowPlayer = false): PatternSpec => ({ t: 'march', count, r, gap: 1.6 * M, damage, slowPlayer });
const waves = (count: number, damage = 20, step = 2.6 * M, width = 1.4 * M): PatternSpec => ({ t: 'ringWaves', count, step, width, damage });
const rain = (count: number, damage = 18, slowPlayer = false): PatternSpec => ({ t: 'area', count, at: 'scatter', r: 1.4 * M, damage, delayMs: 1500, slowPlayer });

export const BOSS_P2: Record<string, BossPhase2> = {
  graymane_alpha: { aura: 0xd500f9, name: '피의 울부짖음(고리 충격파)' },
  thornhorn_treant: { aura: 0x9ccc65, name: '가시뿌리 폭발(6방향 직선)', move: lines(6) },
  moonshadow_devourer: { aura: 0xb388ff, name: '달그림자 소용돌이(회전 탄막 3번)', move: spiral(3, 8) },
  morkan: { aura: 0x76ff03, name: '포자 대폭발(주변 6곳·둔화)', move: rain(6, 16, true) },
  verkan: { aura: 0xff6d00, name: '마수왕의 포효(연속 고리 3번)', move: waves(3, 22) },
  dravan: { aura: 0xff3d00, name: '전군 돌격(드래곤 쪽으로 이어지는 폭격 6곳)', move: march(6, 20) },
  graum: { aura: 0xff5722, name: '용광로 분출(회전 탄막 3번, 12발)', move: spiral(3, 12, 11, 200, 0.13) },
  valterion: { aura: 0xffab00, name: '화염 팔방참(8방향 직선)', move: lines(8, 22, 0.8 * M) },
  air: { aura: 0x29b6f6, name: '빙결 가시길(이어지는 얼음 가시 6곳·둔화)', move: march(6, 18, 1.3 * M, true) },
  kardion: { aura: 0x4dd0e1, name: '수정 공명(연속 고리 3번)', move: waves(3, 22) },
  seria: { aura: 0x81d4fa, name: '눈보라 강림(주변 7곳·둔화)', move: rain(7, 16, true) },
  valkir: { aura: 0x80d8ff, name: '서리 팔방검(8방향 직선)', move: lines(8, 20, 0.8 * M) },
  morte: { aura: 0x7c4dff, name: '영혼 소용돌이(회전 탄막 3번)', move: spiral(3, 10, 12, 220) },
  nox: { aura: 0xd500f9, name: '저주의 행렬(이어지는 저주 폭발 7곳)', move: march(7, 20) },
  bargan: { aura: 0x448aff, name: '망령 진군(연속 고리 3번)', move: waves(3, 20) },
  ardeon: { aura: 0xea80fc, name: '저주왕의 칙령(회전 탄막 3번)', move: spiral(3, 10, 13, 230) },
  auren: { aura: 0xffd740, name: '태양 광휘(8방향 빛줄기)', move: lines(8, 22, 0.8 * M, 11 * M) },
  lumiel: { aura: 0x7c4dff, name: '유성우(주변 8곳)', move: rain(8, 18) },
  serkan: { aura: 0xff6e40, name: '용염 행진(이어지는 화염 7곳)', move: march(7, 22, 1.4 * M) },
  eirgon: { aura: 0xffe57f, name: '봉인 해방(연속 고리 4번)', move: waves(4, 22, 2.4 * M) },
};

/**
 * 보스 2페이즈 그림(2026-11-25, src/data/bossPhase2.ts): 단계 → 보스 텍스처. `public/art/enemy/art-<텍스처>-p2.webp`.
 * src/ui/art.ts가 읽기 목록(ART_FILES·preloadStageArt)에 넣는다. 체력 50%(1단계 60%)에 Enemy.enterPhase2가 이 그림으로 바꾼다. 없으면 1페이즈 그림 그대로.
 */
export const BOSS_P2_ART: Record<number, string> = {
  1: 'graymane', 2: 'e-thornhorn_treant', 3: 'e-moonshadow_devourer', 4: 'e-morkan', 5: 'e-verkan', 6: 'e-dravan', 7: 'e-graum', 8: 'e-valterion', 9: 'e-air', 10: 'e-kardion',
  11: 'e-seria', 12: 'e-valkir', 13: 'e-morte', 14: 'e-nox', 15: 'e-bargan', 16: 'e-ardeon', 17: 'e-auren', 18: 'e-lumiel', 19: 'e-serkan', 20: 'e-eirgon',
};
