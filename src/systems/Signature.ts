import Phaser from 'phaser';
import type { Enemy } from '../objects/Enemy';
import { RED_BASIC } from '../data/basicAttack';
import { aoePerTarget, signatureCap, sigGrowth, SIGNATURE_RULES as R, SIGNATURES, type SigGrowth, type SignatureDef } from '../data/signature';
import type { DragonId } from '../data/dragons';
import type { CombatHost } from './CombatHost';
import { playSfx } from './Sfx';
import { ART_FILES } from '../ui/art';

/** 기획자 그림이 들어온 효과인지(그림은 비스듬한 시점이라 돌리지 않음) */
const isArt = (key: string): boolean => !!ART_FILES[key];

/** 남는 바닥 효과(불길·냉기·독구름): 일정 간격마다 안의 적에게 피해·상태이상 */
interface Zone {
  x: number;
  y: number;
  r: number;
  left: number;
  every: number;
  acc: number;
  perTick: number;
  kind: 'fire' | 'frost' | 'poison' | 'sand' | 'thorn';
  follow: boolean;
  img: Phaser.GameObjects.Image;
  /** 가시 꽃: 남은 붙잡기 횟수 */
  charges?: number;
}

/** 전투 효과 깊이: 바닥에 남는 것은 적 공격 예고(3~4)보다 아래, 순간 섬광은 위(짧고 반투명) */
const DEPTH_GROUND = 2.6;
const DEPTH_FLASH = 8;
/** 바닥 효과 동시 최대 개수(저사양 기기 보호) */
const MAX_ZONES = 4;

/**
 * 드래곤 전용 액티브(v1.2 3장 · v1.3 2장 · 2026-11-20 강화 · 2026-11-21 드래곤별 전투 방식·연출·성장).
 * 화면 위 버튼(또는 스페이스·Q)으로 직접 쓴다. 피해는 쓰는 순간의 기본 공격 DPS(dps())를 기준으로 한 고정 피해라
 * 공격력·특성 보너스를 다시 곱하지 않는다. 엘리트·보스는 한 번 사용 피해 상한(signatureCap)이 그대로 적용된다.
 * 모든 시간은 update(delta)로만 흐르므로 일시정지·카드 선택 중에는 쿨타임·지속시간·바닥 효과가 같이 멈춘다.
 * 성장(tier 0~3): 드래곤 영구 레벨 10·20·30 — sigGrowth()로 범위·개수·남는 시간이 바뀐다.
 */
export class Signature {
  readonly def: SignatureDef;
  readonly cooldownMs: number;
  readonly growth: SigGrowth;
  private cd = 0;
  private active = 0;
  private running = false; // 지속 효과가 걸려 있는 동안 true
  private tickLeft = 0;
  private tickTimer = 0;
  private tickMs = 0;
  private tickDamage = 0; // 지속형 한 번에 넣는 피해(시전 순간 DPS로 고정)
  private zones: Zone[] = [];
  private blades: Phaser.GameObjects.Image[] = [];
  private bladeAngle = 0;
  private ghostAt = 0;
  private bubble: Phaser.GameObjects.Image | null = null;
  private pending: { at: number; run: () => void }[] = [];
  private clock = 0;
  private swordsPriority = 0; // 칼날비: 엘리트·보스를 먼저 노리는 남은 자루 수
  uses = 0;
  /** 이번 사용에서 엘리트·보스에게 넣은 피해(한 번 사용 상한용) */
  private dealt = new Map<Enemy, number>();
  /** 전투 장면이 읽는 지속 효과 */
  reduce = 0; // 받는 피해 감소
  moveBoost = 0;

  constructor(
    private h: CombatHost,
    private dragonId: DragonId,
    cdMult: number,
    private dps: () => number,
    private healPct: (pct: number) => void,
    readonly tier = 0,
  ) {
    this.def = SIGNATURES[dragonId];
    this.cooldownMs = this.def.cooldownMs * cdMult;
    this.growth = sigGrowth(dragonId, tier);
    makeSigTextures(h.scene);
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

  private get scene(): Phaser.Scene {
    return this.h.scene;
  }

  cast(): boolean {
    if (!this.ready) return false;
    const d = this.def;
    const g = this.growth;
    const dps = this.dps() * g.dmg;
    this.cd = this.cooldownMs;
    this.uses++;
    this.dealt.clear();
    const { x, y } = this.h.player;
    const rad = (d.radius ?? 0) * g.radius;
    switch (this.dragonId) {
      // ── 광역 3종: 폭발 + 속성별 남는 효과 ──
      case 'red': {
        this.burst(x, y, rad, d.color, 'fx-fire-ground');
        const t = this.inCircle(x, y, rad);
        this.strike(t, aoePerTarget(dps, t.length));
        // 폭발 뒤 바닥에 불길: 1초마다 DPS × 0.6 + 화상(광역 지속 피해)
        this.addZone({ x, y, r: rad * 0.7, left: g.lingerMs, every: 500, perTick: dps * 0.3, kind: 'fire', follow: false, tex: 'fx-fire-ground' });
        playSfx(this.scene, 'sfx-fire-ground');
        break;
      }
      case 'blue': {
        this.burst(x, y, rad, d.color, 'fx-ice-crystal');
        const t = this.inCircle(x, y, rad);
        this.strike(t, aoePerTarget(dps, t.length));
        // 냉기 장판: 안에 있는 적 45% 둔화(피해 없음, 생존·이동 방해)
        this.addZone({ x, y, r: rad * 0.8, left: g.lingerMs, every: 400, perTick: 0, kind: 'frost', follow: false, tex: 'fx-frost-ground' });
        break;
      }
      case 'yellow': {
        this.burst(x, y, rad, d.color, null);
        const t = this.inCircle(x, y, rad);
        const each = aoePerTarget(dps, t.length);
        this.strike(t, each);
        // 연쇄 번개: 맞은 적에서 범위 밖 적에게 차례로 튄다(다수 처치)
        this.chainOut(t, g.count, each * 0.6);
        break;
      }
      // ── 지속형: 드래곤을 따라다니는 독구름 ──
      case 'green':
        this.addZone({ x, y, r: rad, left: g.lingerMs, every: g.lingerMs / 10, perTick: (dps * R.dotSec) / 10, kind: 'poison', follow: true, tex: 'fx-poison-cloud' });
        break;
      // ── 회복: 회복 + 빛의 보호막(피해 감소) + 밀쳐내기 ──
      case 'white': {
        this.healPct(R.heal + 0.05 * this.tier);
        this.reduce = R.healGuardReduce;
        this.active = g.lingerMs;
        this.running = true;
        for (const e of this.inCircle(x, y, rad)) e.knock(e.x - x || 1, e.y - y, d.knock!, 200);
        this.burst(x, y, rad, d.color, null);
        this.showBubble('fx-light-shield', 0xfff3c4);
        break;
      }
      // ── 전방형: 적이 많은 방향 자동 조준, 성장하면 그림자 분신이 빔 추가 ──
      case 'black':
      case 'water': {
        const len = d.length!;
        const half = d.width! * g.radius;
        for (let k = 0; k < g.count; k++) {
          const fire = () => {
            const px = this.h.player.x;
            const py = this.h.player.y;
            const ang = this.bestAngle(px, py, len, half);
            const t = this.inBeam(px, py, ang, len, half);
            this.strike(t, aoePerTarget(dps, t.length) / (k === 0 ? 1 : 2), ang);
            this.beamFx(px, py, ang, len, half, k > 0);
          };
          if (k === 0) fire();
          else this.later(k * 420, fire);
        }
        break;
      }
      // ── 방어: 피해 감소 + 바위 파동(여러 번) ──
      case 'stone': {
        this.reduce = R.guardReduce;
        this.active = R.guardMs;
        this.running = true;
        this.showBubble(null, d.color);
        for (let k = 0; k < g.count; k++) {
          const wave = () => {
            const px = this.h.player.x;
            const py = this.h.player.y;
            this.strike(this.inCircle(px, py, rad), (dps * R.guardHitSec) / (k === 0 ? 1 : 2));
            this.rockWave(px, py, rad);
          };
          if (k === 0) wave();
          else this.later(k * 600, wave);
        }
        break;
      }
      // ── 이동: 질주 + 회전 바람 칼날 + 잔상 ──
      case 'wind':
        this.moveBoost = R.moveBoost;
        this.startTicks(R.moveMs + g.lingerMs, 500, (dps * R.moveWeakSec) / ((R.moveMs + g.lingerMs) / 500));
        this.spawnBlades(g.count);
        break;
      // ── 신규 1묶음 ──
      case 'sand': // 모래 늪: 시전 자리에 남는 지속 피해 + 둔화·약화(머문 적마다 총 DPS × 5초)
        this.addZone({ x, y, r: rad, left: g.lingerMs, every: 500, perTick: (dps * R.dotSec) / (g.lingerMs / 500), kind: 'sand', follow: false, tex: 'fx-rock-wave' });
        break;
      case 'steel': { // 칼날비: 짧은 시간 검이 연달아 떨어짐(처음 3자루는 엘리트·보스 우선)
        const dur = d.durationMs!;
        this.swordsPriority = 3;
        this.startTicks(dur, dur / g.count, (dps * R.singleSec) / g.count);
        break;
      }
      case 'bloom': { // 가시 정원: 드래곤 둘레에 가시 꽃(다가온 적을 붙잡고 피해, 꽃마다 3번)
        for (let i = 0; i < g.count; i++) {
          const a = (i / g.count) * Math.PI * 2 + Math.PI / 4;
          this.addZone({ x: x + Math.cos(a) * rad, y: y + Math.sin(a) * rad, r: 1.2 * 50 * g.radius, left: g.lingerMs, every: 250, perTick: dps * 2, kind: 'thorn', follow: false, tex: 'fx-thorn', charges: 3 }, true);
        }
        break;
      }
      // ── 단일: 엘리트·보스 우선 마력탄 ──
      case 'arcane': {
        const dur = d.durationMs!;
        this.startTicks(dur, dur / g.count, (dps * R.singleSec) / g.count);
        break;
      }
    }
    return true;
  }

  update(delta: number): void {
    this.cd -= delta;
    this.clock += delta;
    // 예약된 추가 공격(분신 빔·두 번째 파동)
    if (this.pending.length) {
      const due = this.pending.filter((p) => p.at <= this.clock);
      this.pending = this.pending.filter((p) => p.at > this.clock);
      due.forEach((p) => p.run());
    }
    // 틱을 먼저 처리한 뒤 지속시간을 끝낸다(마지막 틱이 끝나는 순간과 겹쳐도 빠지지 않게)
    if (this.tickLeft > 0) {
      this.tickTimer -= delta;
      while (this.tickTimer <= 1e-6 && this.tickLeft > 0) {
        this.tickTimer += this.tickMs;
        this.tickLeft--;
        this.tick();
      }
    }
    this.updateBlades(delta);
    this.updateZones(delta);
    if (this.bubble) this.bubble.setPosition(this.h.player.x, this.h.player.y);
    if (this.active > 0) this.active -= delta;
    if (this.running && this.active <= 0 && this.tickLeft === 0) this.end();
  }

  private later(ms: number, run: () => void): void {
    this.pending.push({ at: this.clock + ms, run });
  }

  private startTicks(durationMs: number, everyMs: number, perTick: number): void {
    this.active = durationMs;
    this.running = true;
    this.tickMs = everyMs;
    this.tickLeft = Math.max(1, Math.round(durationMs / everyMs));
    this.tickTimer = everyMs; // 첫 틱은 한 칸 뒤
    this.tickDamage = perTick;
  }

  private tick(): void {
    const { x, y } = this.h.player;
    if (this.dragonId === 'wind') {
      const r = this.def.radius! * this.growth.radius;
      const hit = this.inCircle(x, y, r);
      this.strike(hit, this.tickDamage);
      if (hit.length) playSfx(this.scene, 'sfx-wind-blade', { pitch: 0.9 + Math.random() * 0.2 });
    }
    if (this.dragonId === 'arcane') {
      const t = this.priorityTarget(x, y, this.def.radius!);
      if (!t) return;
      this.boltFx(x, y, t);
      this.strike([t], this.tickDamage);
    }
    if (this.dragonId === 'steel') {
      // 처음 몇 자루는 보스·엘리트, 나머지는 적이 가장 많이 모인 곳
      const t = this.swordsPriority > 0 ? this.priorityTarget(x, y, this.def.radius!) : this.densest(x, y, this.def.radius!);
      this.swordsPriority--;
      if (!t) return;
      this.swordFx(t.x, t.y);
      this.strike(this.inCircle(t.x, t.y, 1.2 * 50), this.tickDamage);
    }
  }

  private end(): void {
    this.running = false;
    this.active = 0;
    this.reduce = 0;
    this.moveBoost = 0;
    this.tickLeft = 0;
    this.blades.forEach((b) => b.destroy());
    this.blades = [];
    if (this.bubble) {
      const b = this.bubble;
      this.bubble = null;
      this.scene.tweens.add({ targets: b, alpha: 0, scale: b.scale * 1.3, duration: 250, onComplete: () => b.destroy() });
    }
  }

  /** 칼날비 연출: 위에서 검이 내려꽂힘 */
  private swordFx(x: number, y: number): void {
    const img = this.scene.add.image(x, y - 140, 'fx-sword').setDepth(DEPTH_FLASH).setAlpha(0.95);
    this.scene.tweens.add({ targets: img, y, duration: 120, ease: 'Quad.In', onComplete: () => {
      const ring = this.scene.add.circle(x, y, 1.2 * 50 * this.h.stats.areaMult, 0xc9d0d6, 0.3).setStrokeStyle(3, 0xff8a2a, 0.8).setDepth(DEPTH_FLASH);
      this.scene.tweens.add({ targets: [img, ring], alpha: 0, duration: 260, onComplete: () => (img.destroy(), ring.destroy()) });
    } });
  }

  /** 반경 안에서 주변 1.5m에 적이 가장 많이 모인 적 */
  private densest(x: number, y: number, maxD: number): Enemy | null {
    const inRange = this.live().filter((e) => Phaser.Math.Distance.Between(x, y, e.x, e.y) < maxD);
    let best: Enemy | null = null;
    let bestN = -1;
    for (const e of inRange) {
      const n = inRange.filter((o) => Phaser.Math.Distance.Between(e.x, e.y, o.x, o.y) < 75).length;
      if (n > bestN) {
        bestN = n;
        best = e;
      }
    }
    return best;
  }

  // ───────── 남는 바닥 효과 ─────────
  /** many = 한 번에 여러 개를 까는 경우(가시 꽃) — 개수 상한 대신 같은 종류끼리만 바꾼다 */
  private addZone(z: Omit<Zone, 'acc' | 'img'> & { tex: string }, many = false): void {
    if (!many && this.zones.length >= MAX_ZONES) this.dropZone(this.zones[0]);
    const color = z.kind === 'fire' ? 0xff7a1a : z.kind === 'frost' ? 0x9be7ff : 0x8bc34a;
    const img = this.scene.add.image(z.x, z.y, z.tex).setDepth(DEPTH_GROUND).setAlpha(0).setTint(z.tex === 'fx-ice-crystal' ? 0xffffff : 0xffffff);
    img.setDisplaySize(z.r * 2, z.r * 2);
    void color;
    if (z.kind === 'sand') img.setTint(0xe6c38f); // 모래 늪: 바위 파동 그림을 모래색으로
    this.scene.tweens.add({ targets: img, alpha: z.kind === 'frost' ? 0.45 : z.kind === 'thorn' ? 1 : 0.6, duration: 200 });
    this.zones.push({ ...z, acc: 0, img });
  }

  private dropZone(z: Zone): void {
    this.zones = this.zones.filter((o) => o !== z);
    this.scene.tweens.add({ targets: z.img, alpha: 0, duration: 300, onComplete: () => z.img.destroy() });
  }

  private updateZones(delta: number): void {
    for (const z of [...this.zones]) {
      if (z.follow) {
        z.x = this.h.player.x;
        z.y = this.h.player.y;
        z.img.setPosition(z.x, z.y);
      }
      if (!isArt(z.img.texture.key)) z.img.rotation += (z.kind === 'poison' ? 0.4 : 0.15) * (delta / 1000);
      z.left -= delta;
      z.acc += delta;
      while (z.acc >= z.every) {
        z.acc -= z.every;
        const t = this.inCircle(z.x, z.y, z.r, false);
        if (z.kind === 'frost') t.forEach((e) => e.slow(0.45, 600));
        else if (z.kind === 'thorn') {
          // 가시 꽃: 아직 붙잡히지 않은 적부터, 남은 횟수만큼
          const fresh = t.filter((e) => !e.rooted).slice(0, z.charges ?? 0);
          if (fresh.length) {
            this.strike(fresh, z.perTick);
            z.charges = (z.charges ?? 0) - fresh.length;
            this.scene.tweens.add({ targets: z.img, scale: z.img.scale * 1.2, duration: 90, yoyo: true });
            if (z.charges <= 0) z.left = 0;
          }
        } else this.strike(t, z.perTick);
      }
      if (z.left <= 0) this.dropZone(z);
    }
  }

  // ───────── 윈드: 회전 바람 칼날 + 잔상 ─────────
  private spawnBlades(n: number): void {
    this.blades.forEach((b) => b.destroy());
    this.blades = [];
    for (let i = 0; i < n; i++) this.blades.push(this.scene.add.image(this.h.player.x, this.h.player.y, 'fx-wind-blade').setDepth(DEPTH_FLASH).setDisplaySize(88, 88).setAlpha(1));
  }

  private updateBlades(delta: number): void {
    if (!this.blades.length) return;
    const r = this.def.radius! * this.growth.radius * 0.72;
    this.bladeAngle += 7 * (delta / 1000);
    const { x, y } = this.h.player;
    this.blades.forEach((b, i) => {
      const a = this.bladeAngle + (i / this.blades.length) * Math.PI * 2;
      b.setPosition(x + Math.cos(a) * r, y + Math.sin(a) * r).setRotation(a + Math.PI / 2);
    });
    // 질주 잔상(약 0.1초마다, 짧게 사라짐)
    this.ghostAt -= delta;
    if (this.ghostAt <= 0) {
      this.ghostAt = 100;
      const key = this.scene.textures.exists(`top-${this.dragonId}`) ? `top-${this.dragonId}` : 'fx-wind-blade';
      const gh = this.scene.add.image(x, y, key).setDepth(9).setAlpha(0.35).setTint(this.def.color).setDisplaySize(90, 90).setRotation(this.h.player.rotation);
      this.scene.tweens.add({ targets: gh, alpha: 0, duration: 260, onComplete: () => gh.destroy() });
    }
  }

  // ───────── 연출 ─────────
  /** 광역 폭발: 퍼지는 고리 + (있으면) 속성 그림이 잠깐 번쩍 */
  private burst(x: number, y: number, r: number, color: number, tex: string | null): void {
    const c = this.scene.add.circle(x, y, 20).setStrokeStyle(12, color, 0.95).setDepth(DEPTH_FLASH);
    this.scene.tweens.add({ targets: c, radius: r * this.h.stats.areaMult, alpha: 0.1, duration: 360, onComplete: () => c.destroy() });
    const f = this.scene.add.circle(x, y, r * this.h.stats.areaMult, color, 0.22).setDepth(DEPTH_FLASH);
    this.scene.tweens.add({ targets: f, alpha: 0, duration: 420, onComplete: () => f.destroy() });
    if (tex) {
      const im = this.scene.add.image(x, y, tex).setDepth(DEPTH_FLASH).setDisplaySize(r * 2, r * 2).setAlpha(0.8);
      this.scene.tweens.add({ targets: im, alpha: 0, scale: im.scale * 1.15, duration: 450, onComplete: () => im.destroy() });
    }
    this.scene.cameras.main.shake(160, 0.004);
  }

  private beamFx(x: number, y: number, ang: number, len: number, half: number, clone: boolean): void {
    const cx = x + (Math.cos(ang) * len) / 2;
    const cy = y + (Math.sin(ang) * len) / 2;
    const color = this.def.color;
    const g = this.scene.add.rectangle(cx, cy, len, half * 2, color, clone ? 0.3 : 0.45).setRotation(ang).setDepth(DEPTH_FLASH);
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 450, onComplete: () => g.destroy() });
    if (this.dragonId === 'water') {
      // 해일: 물결 띠가 앞으로 밀려감
      const w = this.scene.add.image(x, y, 'fx-wave').setDepth(DEPTH_FLASH).setRotation(ang).setFlipX(true).setDisplaySize(half * 1.6, half * 1.6).setAlpha(0.9);
      this.scene.tweens.add({ targets: w, x: x + Math.cos(ang) * len, y: y + Math.sin(ang) * len, alpha: 0.2, duration: 420, onComplete: () => w.destroy() });
    } else {
      // 암흑: 암흑 구체가 빔을 따라 날아감, 분신 빔은 반투명 분신에서
      if (clone) {
        const key = this.scene.textures.exists(`top-black`) ? 'top-black' : 'fx-shadow-orb';
        const gh = this.scene.add.image(x - Math.cos(ang) * 40, y - Math.sin(ang) * 40, key).setDisplaySize(90, 90).setTint(0x4a2d7a).setAlpha(0.55).setDepth(9).setRotation(ang + Math.PI / 2);
        this.scene.tweens.add({ targets: gh, alpha: 0, duration: 500, onComplete: () => gh.destroy() });
      }
      for (let i = 0; i < 3; i++) {
        const o = this.scene.add.image(x, y, 'fx-shadow-orb').setDepth(DEPTH_FLASH).setDisplaySize(46, 46);
        this.scene.tweens.add({ targets: o, x: x + Math.cos(ang) * len, y: y + Math.sin(ang) * len, delay: i * 60, duration: 320, onComplete: () => o.destroy() });
      }
    }
  }

  /** 바위 파동: 위에서 본 바위 고리 그림이 범위 끝까지 퍼져 나감 */
  private rockWave(x: number, y: number, r: number): void {
    const size = r * 2 * this.h.stats.areaMult;
    const im = this.scene.add.image(x, y, 'fx-rock-wave').setDepth(DEPTH_FLASH).setDisplaySize(80, 80).setAlpha(1);
    this.scene.tweens.add({ targets: im, displayWidth: size, displayHeight: size, alpha: 0.25, duration: 460, ease: 'Quad.Out', onComplete: () => im.destroy() });
    this.scene.cameras.main.shake(200, 0.006);
  }

  private boltFx(x: number, y: number, t: Enemy): void {
    const b = this.scene.add.image(x, y, 'fx-arcane-bolt').setDepth(DEPTH_FLASH).setDisplaySize(64, 64).setRotation(Math.atan2(t.y - y, t.x - x));
    this.scene.tweens.add({ targets: b, x: t.x, y: t.y, duration: 140, onComplete: () => b.destroy() });
  }

  private showBubble(tex: string | null, color: number): void {
    this.bubble?.destroy();
    // 스톤 방어막은 같은 보호막 그림을 흙빛으로
    this.bubble = this.scene.add.image(this.h.player.x, this.h.player.y, 'fx-light-shield').setDepth(11).setDisplaySize(130, 130).setAlpha(0.6).setTint(tex ? 0xffffff : color);
    this.scene.tweens.add({ targets: this.bubble, alpha: 0.3, duration: 600, yoyo: true, repeat: -1 });
  }

  /** 연쇄 번개: 이미 맞은 적에서 가장 가까운 새 적으로 n번 튄다(범위 밖까지) */
  private chainOut(from: Enemy[], n: number, each: number): void {
    const hitSet = new Set(from);
    let cur: { x: number; y: number } = from[0] ?? this.h.player;
    const points: { x: number; y: number }[] = [{ x: this.h.player.x, y: this.h.player.y }, { x: cur.x, y: cur.y }];
    for (let i = 0; i < n; i++) {
      let best: Enemy | null = null;
      let bd = 7 * 50;
      for (const e of this.live()) {
        if (hitSet.has(e)) continue;
        const d = Phaser.Math.Distance.Between(cur.x, cur.y, e.x, e.y);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      if (!best) break;
      hitSet.add(best);
      points.push({ x: best.x, y: best.y });
      this.strike([best], each);
      cur = best;
    }
    if (points.length < 3) return;
    const g = this.scene.add.graphics().setDepth(DEPTH_FLASH);
    g.lineStyle(5, 0xfff176, 1);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      // 지그재그 번개 줄기
      g.beginPath().moveTo(a.x, a.y);
      for (let s = 1; s <= 4; s++) {
        const t = s / 5;
        g.lineTo(a.x + (b.x - a.x) * t + (Math.random() - 0.5) * 22, a.y + (b.y - a.y) * t + (Math.random() - 0.5) * 22);
      }
      g.lineTo(b.x, b.y).strokePath();
    }
    g.lineStyle(2, 0xb388ff, 0.9).strokePoints(points.map((p) => new Phaser.Math.Vector2(p.x, p.y)));
    this.scene.tweens.add({ targets: g, alpha: 0, duration: 380, onComplete: () => g.destroy() });
    // 번개 줄기 그림을 구간마다(그림이 있을 때)
    if (isArt('fx-lightning-arc')) {
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        // 가로로 긴 번개 줄기 그림을 두 적 사이에 맞춰 늘이고 돌린다
        const im = this.scene.add.image((a.x + b.x) / 2, (a.y + b.y) / 2, 'fx-lightning-arc').setDepth(DEPTH_FLASH).setDisplaySize(len * 1.15, len * 1.15).setRotation(Math.atan2(b.y - a.y, b.x - a.x));
        this.scene.tweens.add({ targets: im, alpha: 0, duration: 380, onComplete: () => im.destroy() });
      }
    }
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
      if (d.weaken) e.weaken(d.weaken.ratio, d.weaken.ms);
      if (d.root) e.root(d.root);
      if (d.knock) {
        const a = ang ?? Math.atan2(e.y - this.h.player.y, e.x - this.h.player.x);
        e.knock(Math.cos(a), Math.sin(a), d.knock, 200);
      }
      // 엘리트·보스는 한 번 사용 피해 상한(보스가 한 번에 사라지지 않게) — 남는 불길·분신 빔·연쇄까지 합쳐서
      let amount = each;
      if (e.rank !== 'normal') {
        const used = this.dealt.get(e) ?? 0;
        amount = Math.max(0, Math.min(each, signatureCap(e.rank, e.maxHp) - used));
        this.dealt.set(e, used + amount);
        if (amount <= 0) continue;
      }
      if (amount > 0) this.h.hit(e, { source: 'active', coef: 0, flat: amount, tag: 'signature' });
    }
  }

  private live(): Enemy[] {
    return this.h.enemies().filter((e) => e.active);
  }

  /** area=true면 마력 확장(범위 패시브)을 곱한다. 남는 바닥 효과는 그림 크기와 맞추려고 곱하지 않음 */
  private inCircle(x: number, y: number, r: number, area = true): Enemy[] {
    const rr = area ? r * this.h.stats.areaMult : r;
    return this.live().filter((e) => Phaser.Math.Distance.Between(x, y, e.x, e.y) < rr + e.def.radius);
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

  destroy(): void {
    this.zones.forEach((z) => z.img.destroy());
    this.zones = [];
    this.blades.forEach((b) => b.destroy());
    this.blades = [];
    this.bubble?.destroy();
    this.bubble = null;
  }
}

/**
 * 전용 스킬 효과 그림(그림 요청서 5 A-1). public/art/fx/에 실제 그림이 들어와 ART_FILES로 읽히면 그 그림을 쓰고,
 * 없는 것만 여기서 도형으로 그린다(키 이름이 같아서 코드는 그대로).
 */
export function makeSigTextures(scene: Phaser.Scene): void {
  const need = ['fx-wind-blade', 'fx-fire-ground', 'fx-frost-ground', 'fx-ice-crystal', 'fx-poison-cloud', 'fx-rock-wave', 'fx-light-shield', 'fx-shadow-orb', 'fx-arcane-bolt', 'fx-wave', 'fx-sword', 'fx-thorn'];
  if (need.every((k) => scene.textures.exists(k))) return;
  const g = scene.make.graphics({}, false);
  const make = (key: string, size: number, draw: () => void) => {
    if (scene.textures.exists(key)) return;
    g.clear();
    draw();
    g.generateTexture(key, size, size);
  };
  const S = 128;
  const c = S / 2;
  // 신규 1묶음 임시 도형(그림이 오면 교체): 칼날비 검 · 가시 꽃
  make('fx-sword', 64, () => {
    g.fillStyle(0xc9d0d6).fillRect(29, 4, 6, 44);
    g.fillStyle(0xffffff, 0.8).fillRect(30, 6, 2, 40);
    g.fillStyle(0xff8a2a).fillRect(20, 46, 24, 5);
    g.fillStyle(0x6d4c41).fillRect(29, 51, 6, 10);
  });
  make('fx-thorn', 96, () => {
    g.fillStyle(0x558b2f);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.fillTriangle(48 + Math.cos(a) * 18, 48 + Math.sin(a) * 18, 48 + Math.cos(a + 0.25) * 44, 48 + Math.sin(a + 0.25) * 44, 48 + Math.cos(a + 0.5) * 18, 48 + Math.sin(a + 0.5) * 18);
    }
    g.fillStyle(0xf48fb1);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.fillCircle(48 + Math.cos(a) * 12, 48 + Math.sin(a) * 12, 10);
    }
    g.fillStyle(0xfff59d).fillCircle(48, 48, 7);
  });
  make('fx-wind-blade', S, () => {
    // 초승달 바람 칼날: 겹친 호 몇 겹(바깥 진한 청록 → 안쪽 흰빛)
    for (let i = 0; i < 6; i++) {
      const a0 = -2.5 + i * 0.05;
      g.lineStyle(10 - i * 1.4, i < 2 ? 0x6fd6b8 : 0xe6fffa, 0.9 - i * 0.1).beginPath().arc(c, c, 46 - i * 3, a0, 0.3 - i * 0.08, false).strokePath();
    }
  });
  const radial = (key: string, inner: number, outer: number, size = 256) =>
    make(key, size, () => {
      const r = size / 2;
      for (let i = 10; i >= 1; i--) {
        const t = i / 10;
        const col = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(inner), Phaser.Display.Color.ValueToColor(outer), 10, 10 - i);
        g.fillStyle(Phaser.Display.Color.GetColor(col.r, col.g, col.b), 0.12 + (1 - t) * 0.08).fillCircle(r, r, r * t);
      }
    });
  radial('fx-fire-ground', 0xfff176, 0xff6d00);
  radial('fx-frost-ground', 0xe1f5fe, 0x4fc3f7); // 냉기 장판(그림 요청 없이 도형 유지)
  radial('fx-poison-cloud', 0xc5e1a5, 0x6a1b9a);
  make('fx-ice-crystal', 256, () => {
    const r = 128;
    g.fillStyle(0x9be7ff, 0.18).fillCircle(r, r, 120);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const tipX = r + Math.cos(a) * 110;
      const tipY = r + Math.sin(a) * 110;
      g.fillStyle(i % 2 ? 0xe1f5fe : 0x81d4fa, 0.85).fillTriangle(r + Math.cos(a + 0.25) * 30, r + Math.sin(a + 0.25) * 30, r + Math.cos(a - 0.25) * 30, r + Math.sin(a - 0.25) * 30, tipX, tipY);
    }
  });
  make('fx-rock-wave', 256, () => {
    const r = 128;
    g.lineStyle(10, 0xb08d57, 0.9).strokeCircle(r, r, 116);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      g.fillStyle(i % 2 ? 0x8d7558 : 0xc8a97a, 1).fillRect(r + Math.cos(a) * 112 - 9, r + Math.sin(a) * 112 - 9, 18, 18);
    }
  });
  make('fx-light-shield', 256, () => {
    const r = 128;
    g.fillStyle(0xfff3c4, 0.22).fillCircle(r, r, 124);
    g.lineStyle(8, 0xffe082, 0.9).strokeCircle(r, r, 118);
    g.lineStyle(3, 0xffffff, 0.8).strokeCircle(r, r, 100);
  });
  make('fx-shadow-orb', 64, () => {
    g.fillStyle(0x4a2d7a, 0.4).fillCircle(32, 32, 30);
    g.fillStyle(0x7e57c2, 1).fillCircle(32, 32, 18);
    g.fillStyle(0x1a1026, 1).fillCircle(32, 32, 10);
  });
  make('fx-arcane-bolt', 64, () => {
    g.fillStyle(0xff8de8, 0.4).fillCircle(32, 32, 26);
    g.fillStyle(0xb693ff, 1).fillCircle(32, 32, 14);
    g.fillStyle(0xffffff, 1).fillCircle(28, 28, 5);
  });
  make('fx-wave', 128, () => {
    for (let i = 0; i < 5; i++) g.fillStyle(i % 2 ? 0xbdeeff : 0x4fc3f7, 0.55 - i * 0.07).fillRoundedRect(10 + i * 16, 6, 24, 116, 12);
  });
  g.destroy();
}
