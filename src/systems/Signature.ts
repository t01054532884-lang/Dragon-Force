import Phaser from 'phaser';
import type { Enemy } from '../objects/Enemy';
import { RED_BASIC } from '../data/basicAttack';
import { aoePerTarget, signatureCap, SIGNATURE_RULES as R, SIGNATURES, type SignatureDef } from '../data/signature';
import type { DragonId } from '../data/dragons';
import type { CombatHost } from './CombatHost';

/**
 * 드래곤 전용 액티브(v1.2 3장 · v1.3 2장). 화면 위 버튼(또는 스페이스·Q)으로 직접 쓴다.
 * 피해는 쓰는 순간의 기본 공격 DPS(dps())를 기준으로 한 고정 피해라 공격력·특성 보너스를 다시 곱하지 않는다.
 * 모든 시간은 update(delta)로만 흐르므로 일시정지·카드 선택 중에는 쿨타임과 지속시간이 같이 멈춘다.
 * 판마다 새로 만들어 준비 완료 상태로 시작한다(쿨타임은 저장하지 않음, 출격 드래곤은 전투 중 못 바꿈).
 */
export class Signature {
  readonly def: SignatureDef;
  readonly cooldownMs: number;
  private cd = 0;
  private active = 0;
  private running = false; // 지속 효과가 걸려 있는 동안 true
  private tickLeft = 0;
  private tickTimer = 0;
  private tickDamage = 0; // 지속형 한 번에 넣는 피해(시전 순간 DPS로 고정)
  private zone: { x: number; y: number; g: Phaser.GameObjects.Arc } | null = null;
  uses = 0;
  /** 이번 사용에서 엘리트·보스에게 넣은 피해(한 번 사용 상한용) */
  private dealt = new Map<Enemy, number>();
  /** 전투 장면이 읽는 지속 효과 */
  reduce = 0; // 받는 피해 감소
  moveBoost = 0;

  constructor(
    private h: CombatHost,
    dragonId: DragonId,
    cdMult: number,
    private dps: () => number,
    private healPct: (pct: number) => void,
  ) {
    this.def = SIGNATURES[dragonId];
    this.cooldownMs = this.def.cooldownMs * cdMult;
  }

  get ready(): boolean {
    return this.cd <= 0;
  }

  /** 0(방금 씀) ~ 1(준비) */
  get charge(): number {
    return this.cooldownMs > 0 ? 1 - Math.max(0, this.cd) / this.cooldownMs : 1;
  }

  get cooldownLeft(): number {
    return Math.max(0, this.cd);
  }

  cast(): boolean {
    if (!this.ready) return false;
    const d = this.def;
    const dps = this.dps();
    this.cd = this.cooldownMs;
    this.uses++;
    this.dealt.clear();
    const { x, y } = this.h.player;
    switch (d.kind) {
      case 'aoe': {
        this.ring(x, y, d.radius!, d.color);
        const t = this.inCircle(x, y, d.radius!);
        this.strike(t, aoePerTarget(dps, t.length));
        break;
      }
      case 'beam': {
        // 명중 편의: 24방향 중 적이 가장 많이 맞는 방향(엘리트·보스는 5마리 몫)으로 자동 조준
        const ang = this.bestAngle(x, y, d.length!, d.width!);
        const t = this.inBeam(x, y, ang, d.length!, d.width!);
        this.strike(t, aoePerTarget(dps, t.length), ang);
        const g = this.h.scene.add.rectangle(x + (Math.cos(ang) * d.length!) / 2, y + (Math.sin(ang) * d.length!) / 2, d.length!, d.width! * 2, d.color, 0.45)
          .setRotation(ang).setDepth(8);
        this.h.scene.tweens.add({ targets: g, alpha: 0, duration: 450, onComplete: () => g.destroy() });
        break;
      }
      case 'dot':
        this.zone = { x, y, g: this.h.scene.add.circle(x, y, d.radius!, d.color, 0.25).setStrokeStyle(4, d.color, 0.8).setDepth(3) };
        this.startTicks((dps * R.dotSec) / d.ticks!);
        break;
      case 'move':
        this.moveBoost = R.moveBoost;
        this.startTicks((dps * R.moveWeakSec) / d.ticks!);
        break;
      case 'single':
        this.startTicks((dps * R.singleSec) / d.ticks!);
        break;
      case 'heal':
        this.healPct(R.heal);
        this.reduce = R.healGuardReduce;
        this.active = R.healGuardMs;
        this.running = true;
        for (const e of this.inCircle(x, y, d.radius!)) e.knock(e.x - x || 1, e.y - y, d.knock!, 200);
        this.ring(x, y, d.radius!, d.color);
        break;
      case 'guard':
        this.reduce = R.guardReduce;
        this.active = R.guardMs;
        this.running = true;
        {
          const t = this.inCircle(x, y, d.radius!);
          this.strike(t, dps * R.guardHitSec); // strike가 밀쳐내기(knock)도 함께
        }
        this.ring(x, y, d.radius!, d.color);
        break;
    }
    return true;
  }

  update(delta: number): void {
    this.cd -= delta;
    // 틱을 먼저 처리한 뒤 지속시간을 끝낸다(마지막 틱이 끝나는 순간과 겹쳐도 빠지지 않게)
    if (this.tickLeft > 0) {
      this.tickTimer -= delta;
      while (this.tickTimer <= 1e-6 && this.tickLeft > 0) {
        this.tickTimer += this.def.durationMs! / this.def.ticks!;
        this.tickLeft--;
        this.tick();
      }
    }
    if (this.active > 0) this.active -= delta;
    if (this.running && this.active <= 0 && this.tickLeft === 0) this.end();
  }

  private startTicks(perTick: number): void {
    this.active = this.def.durationMs!;
    this.running = true;
    this.tickLeft = this.def.ticks!;
    this.tickTimer = this.def.durationMs! / this.def.ticks!; // 첫 틱은 한 칸 뒤(5초 동안 10번)
    this.tickDamage = perTick;
  }

  private tick(): void {
    const d = this.def;
    if (d.kind === 'dot' && this.zone) {
      // 독구름은 드래곤을 따라다닌다(맞히기 쉽게)
      this.zone.x = this.h.player.x;
      this.zone.y = this.h.player.y;
      this.zone.g.setPosition(this.zone.x, this.zone.y);
    }
    if (d.kind === 'dot' && this.zone) this.strike(this.inCircle(this.zone.x, this.zone.y, d.radius!), this.tickDamage);
    if (d.kind === 'move') {
      const { x, y } = this.h.player;
      this.strike(this.inCircle(x, y, d.radius!), this.tickDamage);
      this.ring(x, y, d.radius!, d.color, 180);
    }
    if (d.kind === 'single') {
      const { x, y } = this.h.player;
      const t = this.priorityTarget(x, y, d.radius!);
      if (!t) return;
      const g = this.h.scene.add.graphics().setDepth(9);
      g.lineStyle(4, d.color, 0.9).lineBetween(x, y, t.x, t.y);
      this.h.scene.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
      this.strike([t], this.tickDamage);
    }
  }

  private end(): void {
    this.running = false;
    this.active = 0;
    this.reduce = 0;
    this.moveBoost = 0;
    this.tickLeft = 0;
    this.zone?.g.destroy();
    this.zone = null;
  }

  /** 대상마다 고정 피해(이미 DPS로 계산된 값) + 상태이상 */
  private strike(targets: Enemy[], each: number, ang?: number): void {
    const d = this.def;
    for (const e of targets) {
      if (!e.active) continue;
      if (d.burn) e.burn(RED_BASIC.burn.perSec, RED_BASIC.burn.ms, RED_BASIC.burn.maxStacks);
      if (d.poison) e.poison(0.12, 3000, 5);
      if (d.shock) e.shock(1.1, 2000);
      if (d.slow) e.slow(d.slow.ratio, d.slow.ms);
      if (d.freezeMs) e.hardCc('freeze', d.freezeMs);
      if (d.knock) {
        const a = ang ?? Math.atan2(e.y - this.h.player.y, e.x - this.h.player.x);
        e.knock(Math.cos(a), Math.sin(a), d.knock, 200);
      }
      // 엘리트·보스는 한 번 사용 피해 상한(보스가 한 번에 사라지지 않게)
      let amount = each;
      if (e.rank !== 'normal') {
        const used = this.dealt.get(e) ?? 0;
        amount = Math.max(0, Math.min(each, signatureCap(e.rank, e.maxHp) - used));
        this.dealt.set(e, used + amount);
        if (amount <= 0) continue;
      }
      this.h.hit(e, { source: 'active', coef: 0, flat: amount, tag: 'signature' });
    }
  }

  private live(): Enemy[] {
    return this.h.enemies().filter((e) => e.active);
  }

  private inCircle(x: number, y: number, r: number): Enemy[] {
    return this.live().filter((e) => Phaser.Math.Distance.Between(x, y, e.x, e.y) < r * this.h.stats.areaMult + e.def.radius);
  }

  private inBeam(x: number, y: number, ang: number, len: number, half: number): Enemy[] {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    return this.live().filter((e) => {
      const dx = e.x - x;
      const dy = e.y - y;
      const along = dx * c + dy * s;
      const side = Math.abs(-dx * s + dy * c);
      return along > -e.def.radius && along < len + e.def.radius && side < half + e.def.radius;
    });
  }

  /** 전방형 조준: 24방향 중 맞는 적이 가장 많은 방향(엘리트·보스 가중 5). 아무도 없으면 바라보는 방향 */
  private bestAngle(x: number, y: number, len: number, half: number): number {
    const f = this.h.facing;
    let best = Math.atan2(f.y, f.x);
    let bestScore = 0;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const score = this.inBeam(x, y, a, len, half).reduce((acc, e) => acc + (e.rank === 'normal' ? 1 : 5), 0);
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
    return best;
  }

  /** 단일형 대상: 사거리 안 보스 → 엘리트 → 가장 가까운 적 */
  private priorityTarget(x: number, y: number, maxD: number): Enemy | null {
    const inRange = this.live().filter((e) => Phaser.Math.Distance.Between(x, y, e.x, e.y) < maxD);
    return inRange.find((e) => e.rank === 'boss') ?? inRange.find((e) => e.rank === 'elite') ?? this.nearest(x, y, maxD);
  }

  private nearest(x: number, y: number, maxD: number): Enemy | null {
    let best: Enemy | null = null;
    let bd = maxD;
    for (const e of this.live()) {
      const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  private ring(x: number, y: number, r: number, color: number, ms = 350): void {
    const c = this.h.scene.add.circle(x, y, 20).setStrokeStyle(10, color, 0.9).setDepth(8);
    this.h.scene.tweens.add({ targets: c, radius: r * this.h.stats.areaMult, alpha: 0.15, duration: ms, onComplete: () => c.destroy() });
  }

  destroy(): void {
    this.zone?.g.destroy();
    this.zone = null;
  }
}
