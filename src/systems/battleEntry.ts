import type { DragonId } from '../data/dragons';
import type { Difficulty } from '../data/economy';

/**
 * 전투 입장 규칙(2026-11-28 재도전 점검, 제작자 제보 "재도전을 눌렀더니 다른 드래곤이 나왔다").
 * Phaser 없이 시험할 수 있게 장면 밖 순수 함수로 둔다. 화면 쪽은 src/ui/entry.ts.
 */
export interface BattleRun {
  stageId: number;
  difficulty: Difficulty;
  /** 이번 판에 실제로 싸운 드래곤 — 재도전·다음 단계도 이 드래곤으로(저장된 출격 드래곤이 아니라) */
  dragonId: DragonId;
  /** 개발 전용: 보유하지 않은 드래곤 시험 출격 */
  anyDragon?: boolean;
  /** 행동력을 쓰지 않는 판(개발용 잠긴 난이도 시험) — 재도전도 무료 */
  free?: boolean;
}

/** 재도전: 같은 드래곤·같은 단계·같은 난이도. 시드는 새로(같은 판을 그대로 되풀이하지 않음) */
export function retryData(run: BattleRun): BattleRun {
  return { stageId: run.stageId, difficulty: run.difficulty, dragonId: run.dragonId, anyDragon: run.anyDragon, free: run.free };
}

/** 다음 단계: 같은 드래곤·같은 난이도로 다음 단계 */
export function nextStageData(run: BattleRun, nextStageId: number): BattleRun {
  return { ...retryData(run), stageId: nextStageId };
}

/**
 * 입장 한 번: 무료가 아니면 행동력을 먼저 쓰고(부족하면 안내만, 시작 안 함), 된 경우에만 시작.
 * 실패·포기 때 돌려주지 않는다(제작자 확정 2026-11-18).
 */
export function runEntry(free: boolean, spend: () => { ok: boolean }, onShort: () => void, start: () => void): boolean {
  if (!free && !spend().ok) {
    onShort();
    return false;
  }
  start();
  return true;
}

/**
 * 결과 화면 하나에서 입장은 한 번만(재도전·다음 단계 버튼을 빠르게 두 번 누르거나 R 키와 겹쳐도 행동력이 두 번 빠지지 않게).
 * 행동력이 부족해 막혔으면 다시 누를 수 있다.
 */
export function createEntryGate() {
  let used = false;
  return {
    tryEnter(enter: () => boolean): boolean {
      if (used) return false;
      const ok = enter();
      if (ok) used = true;
      return ok;
    },
    get used() {
      return used;
    },
  };
}
