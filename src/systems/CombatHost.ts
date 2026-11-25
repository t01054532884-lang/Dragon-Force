import type Phaser from 'phaser';
import type { Enemy } from '../objects/Enemy';
import type { RunStats } from '../data/stats';
import type { HitSpec } from './Damage';
import type { BattleFx } from '../fx/BattleFx';

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
  /** 남은 체력과 상관없이 처치(필살기: 화면 안 일반 몬스터). 피해 기록에는 남은 체력만큼 */
  kill?(enemy: Enemy, tag: string): void;
  /** 드래곤 회복(최대 HP 비율). 화이트 특성 */
  heal?(pct: number): void;
  /** 보이기만 하는 전투 연출(8단계 D). 없으면 연출 없이 그대로 동작 */
  fx?: BattleFx;
  /** 기본 공격 한 묶음을 쏠 때 한 번(발사점 섬광·반동·발사음). angle = 첫 탄 방향 */
  onFire?(angle: number): void;
  /** 이 자리가 벽 밖이거나 장애물 안이면 true — 드래곤 탄은 여기서 사라진다(제작자 2026-11-26: 장애물을 통과하지 않게) */
  blocked?(x: number, y: number): boolean;
}
