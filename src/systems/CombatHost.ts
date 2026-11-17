import type Phaser from 'phaser';
import type { Enemy } from '../objects/Enemy';
import type { RunStats } from '../data/stats';
import type { HitSpec } from './Damage';

/** 기본공격·스킬 시스템이 게임 장면에서 빌려 쓰는 것들 */
export interface CombatHost {
  scene: Phaser.Scene;
  player: Phaser.GameObjects.Image;
  facing: Phaser.Math.Vector2; // 드래곤이 마지막으로 움직인 방향(길이 1)
  stats: RunStats;
  enemies(): Enemy[];
  level(id: string): number; // 카드 레벨(0이면 없음)
  /** 모든 피해가 지나가는 한 곳: 피해 계산 → 적 체력 감소 → 처치 처리. 죽였으면 true */
  hit(enemy: Enemy, spec: HitSpec): boolean | void;
  /** 드래곤 회복(최대 HP 비율). 화이트 특성 */
  heal?(pct: number): void;
}
