import Phaser from 'phaser';
import { accountLevel } from '../systems/AccountLevel';
import { DRAGONS } from '../data/dragons';
import { Progress } from '../systems/Progress';
import { loadout } from '../systems/Loadout';
import { staminaNow } from '../systems/Mailbox';
import { STAMINA, formatLeft, nextRegenIn } from '../systems/Stamina';
import { ART_FILES, drawScreenBackdrop, makeArtPlaceholders } from './art';
import { navBar, ribbon, text } from './kit';
import { topBar } from './kit2';
import { COLOR, TYPE } from './theme';
import { gameNow } from './widgets';
import { playMusic } from '../systems/Music';
import { openStaminaShop } from './staminaShop';
import { playSfx } from '../systems/Sfx';
import { CASH_SHOP } from '../systems/Purchases';
import { navAlerts } from './alerts';
import { fullH, offY } from './layout';

/**
 * 화면 배경 그림(2026-11-25 Higgsfield, `public/art/bg/scrbg-<화면>.webp` 720×1280): 단색 바탕 위에 깔고
 * 어두운 막을 덮어 글씨·판이 잘 읽히게. 메모리(아이폰): 처음 읽을 때 따로 읽고, 다른 화면 배경은 내려서 한 장만 남긴다.
 * 전투에서는 artMemory가 내린다.
 */
function screenBackground(scene: Phaser.Scene, key: string): void {
  if (!ART_FILES[key]) return;
  const put = () => {
    if (!scene.sys.isActive() || !scene.textures.exists(key)) return;
    const h = fullH(scene);
    scene.add.image(360, -offY(scene) + h / 2, key).setDisplaySize((720 * h) / 1280, h).setDepth(-10);
    scene.add.rectangle(360, -offY(scene) + h / 2, 720, h, COLOR.bg, 0.5).setDepth(-9);
  };
  for (const k of scene.textures.getTextureKeys()) if (k.startsWith('scrbg-') && k !== key) scene.textures.remove(k);
  if (scene.textures.exists(key)) return put();
  scene.load.image(key, `art/${ART_FILES[key]}`);
  scene.load.once(`filecomplete-image-${key}`, put);
  scene.load.start();
}

// 로비 밖 화면 공통 틀(8단계 v2.0 C): 로비와 같은 머리줄(출격 드래곤·행동력·골드·루비·전투력) + 금색 리본 제목 + 하단 탭.
// 화면마다 따로 그리던 제목·재화 줄·"로비로" 버튼을 이 틀 하나로 바꾼다 → 색·위치·동작이 모든 화면에서 같다.

/** 하단 탭(로비 = 전투). 순서: 상점 · 드래곤 · 전투 · 장비 · 연구소 */
export const NAV_TABS = [
  { key: 'shop', label: '상점', icon: 'ic-shop' },
  { key: 'dragons', label: '드래곤', icon: 'ic-dragon' },
  { key: 'lobby', label: '전투', icon: 'ic-swords' },
  { key: 'equip', label: '장비', icon: 'ic-shield' }, // 톱니(ic-gear)는 설정과 헷갈려 날개 방패로(2026-11-22)
  { key: 'lab', label: '연구소', icon: 'ic-lab' }, // 2026-11-26 플라스크·마법서(Higgsfield)
];

/** 하단 탭 + 빨간 알림 점(지금 있는 탭은 빼고) — 로비와 다른 화면이 같이 쓴다 */
export function navTabsWithAlerts(selected: string) {
  const a = navAlerts(Progress.load(), gameNow());
  return NAV_TABS.map((t) => ({ ...t, alert: t.key !== selected && !!a[t.key] }));
}

/** 하단 탭으로 화면 이동(연구소는 돌아갈 곳을 로비로) */
export function goTab(scene: Phaser.Scene, key: string): void {
  scene.scene.start(key, key === 'lab' ? { from: 'lobby' } : undefined);
}

/** 내용이 들어갈 세로 범위: 리본 아래 ~ 하단 탭 위 */
export const CONTENT = { top: 232, bottom: 1124 } as const;

export interface ScreenFrame {
  /** 골드·루비·전투력·출격 드래곤을 저장 값으로 다시 표시(구매·강화 뒤) */
  refresh(): void;
}

/**
 * 공통 틀 그리기. nav = 선택된 하단 탭 키(탭에 없는 화면은 ''), ribbonColor = 제목 리본 색.
 * 행동력 게이지는 1초마다 갱신, + 는 선물함(결제 없음 — 로비와 같음).
 */
export function screenFrame(scene: Phaser.Scene, opts: { title: string; nav: string; ribbonColor?: number; banner?: string; bg?: string }): ScreenFrame {
  makeArtPlaceholders(scene);
  drawScreenBackdrop(scene).setDepth(-20);
  screenBackground(scene, opts.bg ?? `scrbg-${scene.scene.key}`);
  playMusic(scene, 'bgm-lobby'); // 전투에서 돌아온 경우 로비 곡으로(이미 나오고 있으면 그대로)
  let bar: ReturnType<typeof topBar> | null = null;
  let barRoot: Phaser.GameObjects.Container | null = null;
  const tick = () => {
    if (!bar) return;
    const t = gameNow();
    const st = staminaNow(Progress.load(), t);
    const left = nextRegenIn(st, t);
    bar.set(0, `${st.value}/${STAMINA.max}`, left === null ? (st.value >= STAMINA.max ? '가득' : '') : `${formatLeft(left)} 후 +1`);
  };
  const draw = () => {
    barRoot?.destroy();
    const p = Progress.load();
    const d = DRAGONS[p.selectedDragonId];
    bar = topBar(scene, {
      portrait: `portrait-${d.id}`,
      level: accountLevel(p).level, // 계정 레벨(2026-11-23)
      royalFrame: p.ndPass.bahamut, // 바하무트 패스 프로필 테두리(1.0.5)
      cp: loadout(p, d.id).cp.toLocaleString(),
      currencies: [
        // 2026-11-26 제작자: 행동력 + = 행동력 구매 창, 골드·루비 + = 상점의 그 칸으로(상점 안이면 그 칸으로 스크롤)
        { icon: 'ui-energy', value: '', onPlus: () => openStaminaShop(scene, () => draw()) },
        { icon: 'ui-gold', value: p.gold, onPlus: () => scene.scene.start('shop', { focus: 'gold' }) },
        { icon: 'ui-ruby', value: p.rubies, onPlus: CASH_SHOP ? () => scene.scene.start('shop', { focus: 'ruby' }) : undefined }, // 앱인토스: 루비 구매 칸 없음
      ],
    });
    barRoot = bar.root.setDepth(40).setY(-offY(scene)); // 머리줄은 실제 화면 맨 위에
    tick();
  };
  draw();
  scene.time.addEvent({ delay: 1000, loop: true, callback: tick });
  if (opts.banner && scene.textures.exists(opts.banner)) {
    // 제목 대신 기획자 배너 그림(겨울 축제 등) — 글자가 그림에 있어 리본은 생략
    const b = scene.add.image(360, 190, opts.banner).setDepth(41);
    b.setScale(380 / b.width);
  } else {
    ribbon(scene, 360, 182, 340, opts.title, opts.ribbonColor ?? 0xe0a032, 70).setDepth(40);
  }
  navBar(scene, navTabsWithAlerts(opts.nav), opts.nav, (k) => {
    if (k !== opts.nav) goTab(scene, k);
  }).setDepth(40).setY(offY(scene)); // 하단 메뉴는 실제 화면 맨 아래에
  return { refresh: draw };
}

/** 짧은 안내(화면 가운데, 1.4초 뒤 사라짐) — 화면마다 따로 두던 빨간 안내 줄 대신 */
export function toast(scene: Phaser.Scene, msg: string, color: number = COLOR.text, y = 640): void {
  if (color === COLOR.danger) playSfx(scene, 'sfx-ui-error'); // 처리 불가 안내
  const t = text(scene, 360, y, msg, TYPE.body, color, true, true).setOrigin(0.5).setDepth(1000);
  t.setWordWrapWidth(600).setAlign('center');
  const bg = scene.add.rectangle(360, y, Math.min(680, t.width + 60), t.height + 36, 0x000000, 0.78).setDepth(999);
  scene.tweens.add({ targets: [t, bg], alpha: 0, delay: 1300, duration: 400, onComplete: () => (t.destroy(), bg.destroy()) });
}

/** 성공 연출(강화!·해금! 등): 크게 떠올랐다 사라지는 금색 글자 */
/**
 * 결제 지급 알림(2026-11-26 제작자: 실제 결제 뒤 "루비 100" 노란 글씨가 너무 금방 사라져 잘 안 보임).
 * 어두운 띠 + 퍼지는 빛 고리 + 반짝이 + 큰 금색 글씨, 약 1.6초 머문 뒤 사라진다. 화면 위치는 카메라 기준(스크롤과 무관).
 */
export const PURCHASE_POP_MS = 1700;
export function popPurchase(scene: Phaser.Scene, word: string, title = '구매 완료!'): void {
  playSfx(scene, 'sfx-upgrade');
  const cam = scene.cameras.main;
  const cx = cam.width / 2;
  const cy = cam.height / 2 - 40;
  const D = 1000;
  const parts: Phaser.GameObjects.GameObject[] = [];
  const fix = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
    (o as unknown as { setScrollFactor: (n: number) => void; setDepth: (n: number) => void }).setScrollFactor(0);
    (o as unknown as { setDepth: (n: number) => void }).setDepth(D);
    parts.push(o);
    return o;
  };
  const band = fix(scene.add.rectangle(cx, cy, cam.width, 190, 0x12061f, 0.82));
  band.setScale(1, 0);
  scene.tweens.add({ targets: band, scaleY: 1, duration: 140, ease: 'Quad.Out' });
  const ring = fix(scene.add.circle(cx, cy, 60, 0xffd54a, 0).setStrokeStyle(8, 0xffd54a, 0.9));
  scene.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 700, ease: 'Cubic.Out' });
  const glow = fix(scene.add.circle(cx, cy, 150, 0xffc23a, 0.25));
  scene.tweens.add({ targets: glow, alpha: 0.05, yoyo: true, repeat: 2, duration: 260 });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const s = fix(scene.add.star(cx, cy, 4, 4, 12, i % 3 ? 0xffe27a : 0xff5f7a));
    scene.tweens.add({ targets: s, x: cx + Math.cos(a) * (170 + (i % 4) * 40), y: cy + Math.sin(a) * (90 + (i % 3) * 30), angle: 180, alpha: 0, duration: 900, ease: 'Cubic.Out' });
  }
  fix(text(scene, cx, cy - 46, title, TYPE.caption, COLOR.text, true, true).setOrigin(0.5));
  const t = fix(text(scene, cx, cy + 18, word, 58, COLOR.gold, true, true).setOrigin(0.5));
  t.setScale(0.4);
  scene.tweens.add({ targets: t, scale: 1, duration: 260, ease: 'Back.Out' });
  scene.tweens.add({ targets: t, scale: 1.06, yoyo: true, repeat: 1, delay: 300, duration: 220 });
  scene.time.delayedCall(PURCHASE_POP_MS - 350, () =>
    scene.tweens.add({ targets: parts.filter((p) => p.active), alpha: 0, duration: 330, onComplete: () => parts.forEach((p) => p.destroy()) }),
  );
}

export function popWord(scene: Phaser.Scene, word: string, y = 600): void {
  playSfx(scene, 'sfx-upgrade'); // 성공(레벨 업·승급·강화 등) — 2026-11-26 Higgsfield 강화 소리
  const t = text(scene, 360, y, word, 46, COLOR.gold, true, true).setOrigin(0.5).setDepth(1000);
  t.setScale(0.6);
  scene.tweens.add({ targets: t, scale: 1, duration: 160, ease: 'Back.Out' });
  scene.tweens.add({ targets: t, y: y - 30, alpha: 0, delay: 450, duration: 450, onComplete: () => t.destroy() });
}
