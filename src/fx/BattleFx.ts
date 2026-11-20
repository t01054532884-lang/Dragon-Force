import Phaser from 'phaser';

// 전투 연출(8단계 v2.0 7장 "레드 드래곤 전투 연출"). 보이기만 하는 층 — 판정·좌표·피해는 건드리지 않는다.
// 시간 값은 기획서 7.2·7.4 표의 초기 제안 값, 개수 상한은 13.1 Standard(장식 파티클 160 · 충격 링 12).
// 그리기 순서(깊이): 장식 꼬리·폭발 채움은 위험 예고(깊이 4) 아래(3.9), 적중 불꽃은 적(6) 바로 위(6.5).

export const FX = {
  muzzleMs: 80, // 발사점 섬광 60~90
  recoilMs: 100, // 드래곤 반동 80~120(그림 층만)
  hitMs: 150, // 일반 적중 120~180
  hitSparks: 5, // 4~8
  critSparks: 8,
  explodeMs: 280, // Lv.7 폭발 220~320
  explodeSparks: 10, // 8~12
  dieMs: 190, // 일반 적 처치 150~220
  dieSparks: 5, // 4~6
  bossDieMs: 900, // 보스 처치 700~1000
  playerHitMs: 110, // 드래곤 피격 80~120
  shakeMs: 130, // 큰 피해 흔들림 100~160
  shakeGapMs: 300, // 연속 흔들림 최소 간격
  levelRingMs: 420, // 레벨업 링 350~500
  emberEveryMs: 260, // 화상 불씨(동시 2~4)
  maxParts: 160,
  maxRings: 12,
  maxTrails: 24,
} as const;

const FIRE = [0xffe08a, 0xffb347, 0xff7a1a];

/** 드래곤별 적중 불꽃 색(기획 8장 속성 팔레트). 첫 색이 충격 링 */
export const PALETTE: Record<string, readonly number[]> = {
  red: FIRE,
  blue: [0xc9f0ff, 0x8fd3ff, 0x4fc3f7],
  yellow: [0xfff59d, 0xffe066, 0xffc107],
  green: [0xc5e1a5, 0x8bc34a, 0x7cb342],
  white: [0xffffff, 0xfff3c4, 0xffe082],
  black: [0xd1b3ff, 0x9e7bc8, 0x7e57c2],
  stone: [0xe0c9a6, 0xb08d57, 0x8d6e63],
  wind: [0xd7fff4, 0xb2fff0, 0x63d9cd],
  water: [0xb3e5fc, 0x4fc3f7, 0x26c6da],
  arcane: [0xf3d1ff, 0xcf8eff, 0xb693ff],
};
const DEPTH_UNDER = 3.9; // 위험 예고(4)보다 아래
const DEPTH_OVER = 6.5; // 적(6) 바로 위, 드래곤(10)·적 탄 아래

export class BattleFx {
  private parts = 0;
  private rings = 0;
  private trails = 0;
  private lastShake = -1e9;

  constructor(private scene: Phaser.Scene) {
    BattleFx.textures(scene);
  }

  /** 부드러운 빛 점(입자) 텍스처 한 번만 */
  static textures(scene: Phaser.Scene): void {
    if (scene.textures.exists('fx-dot')) return;
    const g = scene.add.graphics();
    for (let r = 16; r > 0; r -= 2) g.fillStyle(0xffffff, 0.08 + (1 - r / 16) * 0.5).fillCircle(16, 16, r);
    g.generateTexture('fx-dot', 32, 32);
    g.destroy();
  }

  private part(x: number, y: number, color: number, size: number, depth: number, ms: number, dx = 0, dy = 0): void {
    if (this.parts >= FX.maxParts) return; // 넘치면 장식만 생략(판정과 무관)
    this.parts++;
    const p = this.scene.add.image(x, y, 'fx-dot').setTint(color).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
    p.setDisplaySize(size, size);
    this.scene.tweens.add({
      targets: p, x: x + dx, y: y + dy, scale: 0, alpha: 0, duration: ms, ease: 'Quad.Out',
      onComplete: () => {
        p.destroy();
        this.parts--;
      },
    });
  }

  private ring(x: number, y: number, r0: number, r1: number, color: number, width: number, ms: number, depth = DEPTH_OVER, alpha = 0.9): void {
    if (this.rings >= FX.maxRings) return;
    this.rings++;
    const c = this.scene.add.circle(x, y, r0).setStrokeStyle(width, color, alpha).setDepth(depth);
    this.scene.tweens.add({
      targets: c, radius: r1, alpha: 0, duration: ms, ease: 'Quad.Out',
      onComplete: () => {
        c.destroy();
        this.rings--;
      },
    });
  }

  private sparks(x: number, y: number, n: number, dist: number, ms: number, colors: readonly number[] = FIRE, size = 14, depth = DEPTH_OVER): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6;
      const d = dist * (0.6 + Math.random() * 0.5);
      this.part(x, y, colors[i % colors.length], size * (0.7 + Math.random() * 0.5), depth, ms * (0.8 + Math.random() * 0.4), Math.cos(a) * d, Math.sin(a) * d);
    }
  }

  /** 공격 발생: 입(발사점) 섬광 — 드래곤 앞쪽 */
  muzzle(x: number, y: number, angle: number, reach = 34): void {
    const mx = x + Math.cos(angle) * reach;
    const my = y + Math.sin(angle) * reach;
    this.part(mx, my, 0xfff0b0, 34, 10.5, FX.muzzleMs);
    this.part(mx, my, 0xff9a3c, 22, 10.5, FX.muzzleMs, Math.cos(angle) * 10, Math.sin(angle) * 10);
  }

  /**
   * 화염탄 꼬리: 투사체를 따라가는 짧은 불꽃(4~8조각). 반환값 stop()은 탄이 사라질 때 부른다.
   * 동시 꼬리 수가 상한을 넘으면 꼬리 없이(탄 자체는 그대로).
   */
  trail(img: Phaser.GameObjects.Image, colors: readonly number[] = FIRE): () => void {
    if (this.trails >= FX.maxTrails) return () => {};
    this.trails++;
    const em = this.scene.add.particles(0, 0, 'fx-dot', {
      follow: img, lifespan: 150, frequency: 26, quantity: 1, maxAliveParticles: 6,
      scale: { start: 0.55, end: 0 }, alpha: { start: 0.75, end: 0 }, tint: [...colors], blendMode: 'ADD',
    }).setDepth(DEPTH_UNDER);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.trails--;
      em.stop();
      this.scene.time.delayedCall(170, () => em.destroy());
    };
  }

  /** 일반 적중: 작은 충격 링 + 불꽃 파편(치명타는 파편·빛 조금 더) */
  hit(x: number, y: number, crit: boolean, colors: readonly number[] = FIRE): void {
    this.ring(x, y, 6, crit ? 26 : 20, colors[0], crit ? 4 : 3, FX.hitMs);
    this.sparks(x, y, crit ? FX.critSparks : FX.hitSparks, crit ? 34 : 26, FX.hitMs, colors, 12);
    if (crit) this.part(x, y, 0xffffff, 40, DEPTH_OVER, 80);
  }

  /** 폭발(Lv.7·최종 고유 공격): 실제 판정 반지름 r까지만 — 크게 부풀리지 않는다 */
  explode(x: number, y: number, r: number, color: number): void {
    this.part(x, y, 0xfff3c4, r * 0.9, DEPTH_UNDER, 120);
    this.ring(x, y, r * 0.3, r, color, 6, FX.explodeMs, DEPTH_UNDER);
    this.sparks(x, y, FX.explodeSparks, r * 0.9, FX.explodeMs, [color, ...FIRE], 18, DEPTH_UNDER);
  }

  /** 화상 중인 적 주위 작은 불씨(위로 떠오름) */
  ember(x: number, y: number, radius: number): void {
    const ox = (Math.random() - 0.5) * radius * 1.4;
    this.part(x + ox, y - radius * 0.3, FIRE[1 + Math.floor(Math.random() * 2)], 10, DEPTH_OVER, 420, (Math.random() - 0.5) * 8, -26);
  }

  /** 일반 적 처치: 같은 그림이 줄어들며 사라짐 + 잔광 파편 */
  die(e: Phaser.GameObjects.Image, color = 0xffd8a8): void {
    if (this.parts < FX.maxParts) {
      this.parts++;
      const g = this.scene.add.image(e.x, e.y, e.texture.key).setRotation(e.rotation).setScale(e.scaleX, e.scaleY).setDepth(6).setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      g.setAlpha(0.85);
      this.scene.tweens.add({
        targets: g, scaleX: e.scaleX * 0.2, scaleY: e.scaleY * 0.2, alpha: 0, duration: FX.dieMs, ease: 'Quad.In',
        onComplete: () => {
          g.destroy();
          this.parts--;
        },
      });
    }
    this.sparks(e.x, e.y, FX.dieSparks, 30, FX.dieMs + 40, [color, 0xffffff], 12);
  }

  /** 보스 처치: 중심 소멸 + 충격파 3겹(700~1000ms) */
  bossDie(x: number, y: number, radius: number): void {
    for (let i = 0; i < 3; i++) this.scene.time.delayedCall(i * 160, () => this.ring(x, y, radius * 0.5, radius * 3, i === 0 ? 0xffffff : 0xffc94d, 8 - i * 2, FX.bossDieMs - i * 160));
    this.part(x, y, 0xfff3c4, radius * 2.4, DEPTH_OVER, 500);
    this.sparks(x, y, 14, radius * 2.2, FX.bossDieMs * 0.7, [0xffc94d, 0xffffff, 0xff7a1a], 22);
  }

  /** 경험치 획득 반짝임(드래곤 위치) */
  pickup(x: number, y: number): void {
    this.part(x, y - 10, 0x9be7ff, 20, 10.5, 160, 0, -12);
  }

  /** 드래곤 피격: 그림 층만 붉게(흰 번쩍임을 화면 전체에 쓰지 않음) + 큰 피해면 짧은 흔들림 */
  playerHit(skin: Phaser.GameObjects.Image, big: boolean): void {
    skin.setTint(0xff7070);
    this.scene.time.delayedCall(FX.playerHitMs, () => skin.active && skin.clearTint());
    const now = this.scene.time.now;
    if (big && now - this.lastShake >= FX.shakeGapMs) {
      this.lastShake = now;
      this.scene.cameras.main.shake(FX.shakeMs, 0.004); // 720 기준 약 3px
    }
  }

  /** 레벨업: 드래곤 주변 금색 링 2겹 */
  levelUp(x: number, y: number): void {
    this.ring(x, y, 20, 90, 0xffc94d, 6, FX.levelRingMs, 10.5);
    this.scene.time.delayedCall(90, () => this.ring(x, y, 20, 70, 0xfff3c4, 4, FX.levelRingMs - 60, 10.5));
    this.sparks(x, y, 8, 70, FX.levelRingMs, [0xffc94d, 0xffffff], 14, 10.5);
  }
}
