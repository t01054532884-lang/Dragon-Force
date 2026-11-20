import Phaser from 'phaser';
import { COLOR } from './theme';

// UI 그림 키와 임시 그림.
// 기획자가 만든 그림이 public/art/에 들어오면 ART_FILES에 파일명을 적는다 → preloadArt가 실제 그림을 읽는다.
// 아직 없는 그림은 makeArtPlaceholders가 도형으로 그린 임시 그림으로 채운다(키는 같아서 화면 코드는 그대로).
export const ART_KEYS = [
  'ui-gold', 'ui-ruby', 'ui-card', 'ui-essence', 'ui-fragment', 'ui-ticket',
  'chest-equipment', 'chest-dragon', 'chest-gold',
  'equip-weapon', 'equip-armor', 'equip-necklace', 'equip-ring',
  'nav-battle', 'nav-lab', 'ui-calendar', 'ui-mission',
] as const;
export type ArtKey = (typeof ART_KEYS)[number];

/** 장비 그림은 등급마다 색이 다르다(일반 구리·희귀 파랑·영웅 보라·전설 금). 기본 등급(starter)은 일반 그림을 쓴다. */
export const EQUIP_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export const equipIcon = (slot: 'weapon' | 'armor' | 'necklace' | 'ring', rarity: string) =>
  `equip-${slot}-${(EQUIP_RARITIES as readonly string[]).includes(rarity) ? rarity : 'common'}`;

/** 스킬 카드 아이콘(그림 요청서 3 ②). passive-greed는 아직 없음 → 그 자리는 도형 임시 그림 */
export const SKILL_ICONS = [
  'skill-basic', 'skill-breath', 'skill-ice', 'skill-lightning', 'skill-meteor', 'skill-orb', 'skill-wind',
  'passive-heart', 'passive-scale', 'passive-amp', 'passive-clock', 'passive-eye', 'passive-wings', 'passive-reach',
] as const;

/**
 * public/art/ 안에 실제로 있는 그림(키 → 파일명). scripts/process_art.py가 기획자 그림(art-src/)을 가공해 만든다.
 * 2026-11-18 기획자 그림(GPT 이미지): 로비 배경, 상자 3종, 재화 6종, 드래곤 초상 10종(아틀라스), 스킬 아이콘 14, 장비 16, 탑다운 드래곤 4.
 * 아직 없음: passive-greed, 탑다운 드래곤 2종(스톤·워터). 적 5·보스 초상 3·바닥·날갯짓 프레임은 art-src에 받았고 가공 전.
 */
export const ART_FILES: Record<string, string> = {
  'lobby-bg': 'lobby-bg.jpg',
  'chest-equipment': 'chest-equipment.webp',
  'chest-dragon': 'chest-dragon.webp',
  'chest-gold': 'chest-gold.webp',
  // 상자 개봉 연출용 본체·뚜껑(4차분 2026-11-19, scripts/process_art_batch4.py): 600×600 같은 캔버스, 겹치면 닫힌 상자
  ...Object.fromEntries((['dragon', 'equipment', 'gold'] as const).flatMap((b) => (['body', 'lid'] as const).map((part) => [`chest-${b}-${part}`, `chest/chest-${b}-${part}.webp`]))),
  'ui-gold': 'ui-gold.webp',
  'ui-ruby': 'ui-ruby.webp',
  'ui-card': 'ui-card.webp',
  'ui-essence': 'ui-essence.webp',
  'ui-fragment': 'ui-fragment.webp',
  'ui-ticket': 'ui-ticket.webp',
  // 드래곤 초상 10종: 6단계 기획서 v1.0 아틀라스에서 잘라 냄(v1.2 31쪽: 도감·소환 결과·상세·선택 카드 사용 가능)
  ...Object.fromEntries(['red', 'blue', 'yellow', 'green', 'white', 'black', 'stone', 'wind', 'water', 'arcane'].map((id) => [`portrait-${id}`, `portrait-${id}.webp`])),
  // UI 아이콘(임시): 기획자 UI 시안 6장에서 타일 바탕을 지우고 떼어 낸 것. 깨끗한 아이콘 묶음이 오면 교체
  ...Object.fromEntries(
    ['ic-banner', 'ic-book', 'ic-cal-star', 'ic-calendar', 'ic-cards', 'ic-chest', 'ic-crystal', 'ic-dragon', 'ic-egg', 'ic-gear', 'ic-gift', 'ic-heart',
      'ic-laurel', 'ic-mission', 'ic-portal', 'ic-scroll', 'ic-shield', 'ic-shop', 'ic-swords', 'ic-target', 'ic-trophy', 'ic-upgrade', 'ic-energy'].map((k) => [k, `ui/${k}.webp`]),
  ),
  // 2차분(2026-11-18 오후, scripts/process_art_batch2.py): 스킬 아이콘 14 · 장비 4슬롯×4등급 · 전투용 탑다운 드래곤 4
  ...Object.fromEntries(SKILL_ICONS.map((k) => [k, `skill/${k}.webp`])),
  ...Object.fromEntries(
    (['weapon', 'armor', 'necklace', 'ring'] as const).flatMap((s) => EQUIP_RARITIES.map((r) => [`equip-${s}-${r}`, `equip/equip-${s}-${r}.webp`])),
  ),
  // 탑다운 드래곤: 2차분 4종 + 3차분 4종(scripts/process_art_batch3.py, 보라 번개 = 블랙 — 제작자 확인 2026-11-19). 남은 것: 스톤·워터
  ...Object.fromEntries(['red', 'blue', 'wind', 'arcane', 'black', 'yellow', 'green', 'white', 'stone', 'water'].map((id) => [`top-${id}`, `top/top-${id}.webp`])),
  // 5차분(8단계 v2.0 묶음 2026-11-19, scripts/process_art_batch5.py): 선물함·행동력·탐욕, 로고, 타이틀 장식, 겨울 배너, 스톤·워터 탑다운, 상자 안쪽 빛
  'ui-mailbox': 'ui/ui-mailbox.webp',
  'ui-energy': 'ui/ui-energy.webp',
  'passive-greed': 'skill/passive-greed.webp',
  'logo-ko': 'logo-ko.webp',
  'title-deco': 'title-deco.webp',
  'event-winter': 'event-winter.webp',
  // 1단계 적 5종·얼굴 3·잿빛 바닥(scripts/process_art_batch7.py, 기획자 요청 5)
  ...Object.fromEntries(['wolf', 'boar', 'moonfang', 'matriarch', 'graymane'].map((k) => [`art-${k}`, `enemy/art-${k}.webp`])),
  ...Object.fromEntries(['graymane', 'moonfang', 'matriarch'].map((k) => [`face-${k}`, `enemy/face-${k}.webp`])),
  'floor-ash': 'floor-ash.webp',
  ...Object.fromEntries(['blue', 'purple', 'gold'].map((c) => [`chest-inner-${c}`, `chest/chest-inner-${c}.webp`])),
  // 8차분(2026-11-21, 그림·소리 요청서 5 A-1, scripts/process_art_batch8.py): 전용 스킬 전투 효과 10장 512×512
  ...Object.fromEntries(
    ['fx-wind-blade', 'fx-fire-ground', 'fx-ice-crystal', 'fx-lightning-arc', 'fx-poison-cloud', 'fx-rock-wave', 'fx-light-shield', 'fx-shadow-orb', 'fx-wave', 'fx-arcane-bolt'].map((k) => [k, `fx/${k}.webp`]),
  ),
};

/** 필요한 그림만 읽는다(키가 ART_FILES에 없거나 이미 읽었으면 건너뜀). 화면별 preload()에서 쓴다 */
export function preloadKeys(scene: Phaser.Scene, keys: readonly string[]): void {
  for (const key of keys) {
    const file = ART_FILES[key];
    if (file && !scene.textures.exists(key)) scene.load.image(key, `art/${file}`);
  }
}

/** 상자 개봉 연출 그림(본체·뚜껑 3종) */
export const CHEST_LAYER_KEYS = [
  ...(['dragon', 'equipment', 'gold'] as const).flatMap((b) => [`chest-${b}-body`, `chest-${b}-lid`]),
  'chest-inner-blue', 'chest-inner-purple', 'chest-inner-gold',
];

export function preloadArt(scene: Phaser.Scene): void {
  for (const [key, file] of Object.entries(ART_FILES)) {
    if (file && !scene.textures.exists(key)) scene.load.image(key, `art/${file}`);
  }
}

/** 실제 그림이 없는 키만 도형 임시 그림을 만든다 */
export function makeArtPlaceholders(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const make = (key: string, size: number, draw: () => void) => {
    if (scene.textures.exists(key)) return;
    g.clear();
    draw();
    g.generateTexture(key, size, size);
  };

  // 골드: 겹친 금화 세 닢
  make('ui-gold', 128, () => {
    for (const [x, y] of [[44, 78], [84, 78], [64, 50]]) {
      g.fillStyle(0xb7791f).fillCircle(x, y + 4, 30);
      g.fillStyle(COLOR.gold).fillCircle(x, y, 30);
      g.fillStyle(0xfff1b8).fillCircle(x - 8, y - 9, 8);
      g.lineStyle(4, 0xd69e2e).strokeCircle(x, y, 21);
    }
  });

  // 루비: 깎인 보석
  make('ui-ruby', 128, () => {
    g.fillStyle(0x9b1239).fillTriangle(64, 116, 14, 52, 114, 52);
    g.fillStyle(COLOR.ruby).fillTriangle(64, 108, 24, 54, 104, 54);
    g.fillStyle(0xff8fab).fillTriangle(34, 52, 50, 22, 94, 52).fillTriangle(50, 22, 78, 22, 94, 52);
    g.fillStyle(0xffffff, 0.8).fillTriangle(50, 28, 60, 28, 44, 48);
  });

  // 드래곤 카드: 금테 카드 + 용 머리 실루엣
  make('ui-card', 128, () => {
    g.fillStyle(0x000000, 0.3).fillRoundedRect(30, 16, 74, 104, 10);
    g.fillStyle(0x3b2a5e).fillRoundedRect(26, 10, 74, 104, 10);
    g.lineStyle(5, COLOR.gold).strokeRoundedRect(26, 10, 74, 104, 10);
    g.fillStyle(COLOR.ember).fillCircle(63, 56, 18).fillTriangle(50, 44, 40, 26, 58, 40).fillTriangle(76, 44, 86, 26, 68, 40);
    g.fillStyle(0xffd34d).fillCircle(57, 54, 3).fillCircle(69, 54, 3);
    g.fillStyle(COLOR.gold).fillRect(40, 92, 46, 6);
  });

  // 정수: 빛나는 구슬
  make('ui-essence', 128, () => {
    g.fillStyle(COLOR.violet, 0.25).fillCircle(64, 64, 56);
    g.fillStyle(COLOR.violet, 0.45).fillCircle(64, 64, 44);
    g.fillStyle(0xb69cff).fillCircle(64, 64, 32);
    g.fillStyle(0xffffff, 0.85).fillCircle(54, 52, 10);
    g.lineStyle(4, 0xffffff, 0.6).strokeCircle(64, 64, 32);
  });

  // 조각: 깨진 비늘 세 개
  make('ui-fragment', 128, () => {
    g.fillStyle(0x0e7490).fillTriangle(30, 96, 58, 30, 70, 90);
    g.fillStyle(0x22d3ee).fillTriangle(62, 100, 92, 36, 104, 96);
    g.fillStyle(0x67e8f9).fillTriangle(46, 108, 70, 70, 84, 112);
    g.fillStyle(0xffffff, 0.6).fillTriangle(58, 40, 62, 40, 54, 70);
  });

  // 무료 개봉권: 톱니 가장자리 티켓
  make('ui-ticket', 128, () => {
    g.fillStyle(0xd8b4fe).fillRoundedRect(14, 34, 100, 60, 10);
    g.fillStyle(COLOR.bg).fillCircle(14, 64, 10).fillCircle(114, 64, 10);
    g.lineStyle(3, 0x7c3aed).lineBetween(44, 40, 44, 88);
    g.fillStyle(0x7c3aed).fillCircle(80, 64, 14);
    g.fillStyle(0xffffff).fillCircle(80, 64, 6);
  });

  // 상자 3종: 같은 모양, 색과 문양만 다르게
  const chest = (key: string, body: number, band: number, gem: number, glow: number) =>
    make(key, 256, () => {
      g.fillStyle(glow, 0.18).fillCircle(128, 136, 118);
      g.fillStyle(0x000000, 0.35).fillEllipse(128, 214, 200, 30);
      g.fillStyle(body).fillRoundedRect(42, 112, 172, 96, 14); // 몸통
      g.fillStyle(Phaser.Display.Color.IntegerToColor(body).darken(20).color).fillRoundedRect(42, 168, 172, 40, { tl: 0, tr: 0, bl: 14, br: 14 });
      g.fillStyle(Phaser.Display.Color.IntegerToColor(body).brighten(15).color).fillRoundedRect(36, 64, 184, 60, { tl: 40, tr: 40, bl: 6, br: 6 }); // 뚜껑
      g.fillStyle(band).fillRect(62, 64, 18, 144).fillRect(176, 64, 18, 144).fillRect(36, 112, 184, 12);
      g.fillStyle(band).fillRoundedRect(108, 104, 40, 50, 8); // 자물쇠
      g.fillStyle(gem).fillCircle(128, 128, 11);
      g.fillStyle(0xffffff, 0.7).fillCircle(124, 124, 4);
      g.fillStyle(0xffffff, 0.12).fillRoundedRect(46, 70, 170, 18, 9);
    });
  chest('chest-equipment', 0x7a4a2a, 0x9aa3b5, 0x60a5fa, 0x60a5fa);
  chest('chest-dragon', 0x4c2a85, COLOR.gold, COLOR.ruby, COLOR.violet);
  chest('chest-gold', 0xb7791f, 0xfde68a, COLOR.ember, COLOR.gold);

  // 장비 4종(등급 색은 슬롯 테두리로)
  // 발톱 장식(공격력): 금판 + 칼날 발톱 세 개
  make('equip-weapon', 128, () => {
    for (const [x, tip] of [[38, 10], [64, 4], [90, 10]] as const) {
      g.fillStyle(0xe5e7eb).fillTriangle(x, tip, x - 12, 70, x + 12, 70);
      g.fillStyle(0x9ca3af).fillTriangle(x, tip, x, 70, x + 12, 70);
    }
    g.fillStyle(COLOR.gold).fillRoundedRect(20, 66, 88, 40, 16);
    g.fillStyle(COLOR.ruby).fillCircle(64, 86, 10);
    g.fillStyle(0xffffff, 0.6).fillCircle(60, 82, 3);
  });
  // 비늘 갑주(최대 HP·피해 감소): 비늘을 겹친 둥근 가슴판 + 금테
  make('equip-armor', 128, () => {
    g.fillStyle(COLOR.gold).fillRoundedRect(22, 20, 84, 94, { tl: 30, tr: 30, bl: 40, br: 40 });
    g.fillStyle(0xb91c1c).fillRoundedRect(28, 26, 72, 82, { tl: 26, tr: 26, bl: 36, br: 36 });
    for (let row = 0; row < 4; row++)
      for (let c = 0; c < 3; c++) {
        const x = 40 + c * 24 + (row % 2) * 12 - (row % 2 ? 6 : 0);
        g.fillStyle(row % 2 ? 0xdc2626 : 0xef4444).fillCircle(x, 40 + row * 17, 11);
      }
    g.fillStyle(COLOR.ember).fillCircle(64, 66, 10);
  });
  make('equip-necklace', 128, () => {
    g.lineStyle(6, COLOR.gold).beginPath().arc(64, 40, 38, 0.2, Math.PI - 0.2).strokePath();
    g.fillStyle(COLOR.gold).fillCircle(64, 86, 22);
    g.fillStyle(0x38bdf8).fillCircle(64, 86, 14);
    g.fillStyle(0xffffff, 0.8).fillCircle(59, 81, 5);
  });
  make('equip-ring', 128, () => {
    g.lineStyle(12, COLOR.gold).strokeCircle(64, 76, 30);
    g.fillStyle(COLOR.ruby).fillTriangle(64, 22, 46, 46, 82, 46).fillTriangle(46, 46, 82, 46, 64, 60);
    g.fillStyle(0xffffff, 0.8).fillCircle(58, 38, 4);
  });

  // 하단 탭·바로가기 아이콘
  make('nav-battle', 128, () => {
    for (const s of [1, -1]) {
      const x0 = 64 - s * 40;
      g.fillStyle(0xe5e7eb).fillTriangle(x0, 18, x0 + s * 10, 18, 64 + s * 30, 96);
      g.fillStyle(0x9ca3af).fillTriangle(x0 + s * 10, 18, 64 + s * 30, 96, 64 + s * 22, 100);
      g.fillStyle(COLOR.ember).fillRoundedRect(64 + s * 22 - 14, 90, 28, 10, 4);
      g.fillStyle(0x7c2d12).fillCircle(64 + s * 36, 112, 8);
    }
  });
  make('nav-lab', 128, () => {
    g.fillStyle(0x7dd3fc, 0.35).fillCircle(64, 84, 36);
    g.fillStyle(0xe0f2fe).fillRect(52, 14, 24, 40);
    g.fillStyle(0x22d3ee).fillTriangle(30, 110, 98, 110, 64, 40);
    g.fillStyle(0xe0f2fe).fillRoundedRect(46, 10, 36, 10, 4);
    g.fillStyle(0xffffff, 0.8).fillCircle(56, 92, 6).fillCircle(72, 80, 4);
  });
  make('ui-calendar', 128, () => {
    g.fillStyle(0xf3e6c8).fillRoundedRect(16, 28, 96, 88, 12);
    g.fillStyle(COLOR.danger).fillRoundedRect(16, 28, 96, 28, { tl: 12, tr: 12, bl: 0, br: 0 });
    g.fillStyle(0x6b7280).fillRect(38, 16, 10, 24).fillRect(80, 16, 10, 24);
    g.fillStyle(COLOR.ok).fillTriangle(42, 82, 56, 96, 92, 62).fillTriangle(42, 82, 50, 74, 56, 86);
  });
  make('ui-mission', 128, () => {
    g.fillStyle(0xf3e6c8).fillRoundedRect(24, 14, 80, 100, 10);
    g.fillStyle(0x8b6b3d).fillRoundedRect(44, 8, 40, 16, 6);
    for (let i = 0; i < 3; i++) {
      g.fillStyle(COLOR.ok).fillCircle(42, 46 + i * 24, 6);
      g.fillStyle(0x9ca3af).fillRect(54, 42 + i * 24, 36, 8);
    }
  });

  g.destroy();
}

/** 일반 화면 배경: 보랏빛→어두운 남색 그라데이션만(목록·상점처럼 정보가 많은 화면은 배경을 조용하게) */
export function drawScreenBackdrop(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const steps = 32;
  for (let i = 0; i < steps; i++) {
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.IntegerToColor(COLOR.bgTop),
      Phaser.Display.Color.IntegerToColor(COLOR.bg),
      steps,
      i,
    );
    g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b)).fillRect(0, (1280 / steps) * i, 720, 1280 / steps + 1);
  }
  return g;
}

/** 로비 배경 임시 그림: 보랏빛→어두운 남색 그라데이션 + 용암 지평선 + 별 */
export function drawLobbyBackdrop(scene: Phaser.Scene): Phaser.GameObjects.GameObject {
  if (scene.textures.exists('lobby-bg')) return scene.add.image(360, 640, 'lobby-bg').setDisplaySize(720, 1280);
  const g = scene.add.graphics();
  const steps = 32;
  for (let i = 0; i < steps; i++) {
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.IntegerToColor(COLOR.bgTop),
      Phaser.Display.Color.IntegerToColor(COLOR.bg),
      steps,
      i,
    );
    g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b)).fillRect(0, (1280 / steps) * i, 720, 1280 / steps + 1);
  }
  const rnd = new Phaser.Math.RandomDataGenerator(['lobby']);
  for (let i = 0; i < 60; i++) g.fillStyle(0xffffff, rnd.realInRange(0.2, 0.7)).fillCircle(rnd.between(0, 720), rnd.between(0, 520), rnd.realInRange(1, 2.4));
  // 멀리 무너진 성지 실루엣
  g.fillStyle(0x0b0d18);
  for (const [x, w, h] of [[40, 70, 260], [150, 50, 200], [520, 60, 240], [620, 80, 300]]) g.fillRect(x, 760 - h, w, h + 40);
  g.fillRect(0, 760, 720, 520);
  // 용암 지평선 빛
  g.fillStyle(COLOR.ember, 0.22).fillEllipse(360, 770, 900, 120);
  g.fillStyle(COLOR.ember, 0.12).fillEllipse(360, 770, 1100, 260);
  return g;
}
