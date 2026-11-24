/* 개발 전용 자동 전투 측정 봇(배포본에는 빠짐 — main.ts가 import.meta.env.DEV일 때만 읽음).
 * 2026-11-20 전투 속도·성장 체감 개선 검수용: 브라우저 콘솔에서
 *   await botRun({ stage: 1, dragon: 'red', seed: 1, atk: 1, hp: 1 })
 * → 화면 없이(headlessStep) 빠르게 한 판을 돌리고 클리어 시간·레벨업 시각·웨이브·드롭·전용 스킬 피해를 돌려준다.
 * atk·hp: 판 시작 능력치 배율(성장한 드래곤 흉내). 이동은 단순한 회피 + 보석 줍기라 사람보다 약하다(하한 측정용).
 */
import type Phaser from 'phaser';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface BotOpt {
  stage: number;
  dragon?: string;
  seed?: number;
  atk?: number;
  hp?: number;
  sig?: boolean;
  maxSec?: number;
  difficulty?: 'easy' | 'hard';
}

export function installBot(game: Phaser.Game): void {
  (window as Any).botRun = (opt: BotOpt) => run(game, opt);
}

function run(game: Phaser.Game, opt: BotOpt): Promise<unknown> {
  const g = game as Any;
  g.loop.wake();
  for (const s of game.scene.getScenes(true)) if (s.scene.key !== 'game') game.scene.stop(s.scene.key);
  if (game.scene.isActive('game')) game.scene.stop('game');
  // anyDragon: 보유 여부와 상관없이 요청한 드래곤으로(예전엔 미보유면 출격 드래곤으로 바뀌어 다른 드래곤을 잰 셈이었음 — 2026-11-22 발견)
  game.scene.start('game', { stageId: opt.stage, dragonId: opt.dragon ?? 'red', seed: opt.seed ?? 1, difficulty: opt.difficulty ?? 'easy', anyDragon: true });
  return new Promise((resolve) => {
    const wait = () => {
      const s = game.scene.getScene('game') as Any;
      // 어려움은 시작 스킬 고르기('choose')로 시작한다. 창이 숨겨져 화면 갱신이 멈춰 있어도 불러오기가 진행되게 직접 한 프레임씩
      if (s?.sys.settings.status === 5 && s.player && s.director) play(g, s, opt, resolve);
      else {
        if (g.loop.frame === 0 || document.hidden) g.headlessStep(performance.now(), 16.667);
        setTimeout(wait, 20);
      }
    };
    setTimeout(wait, 30);
  });
}

function play(g: Any, s: Any, opt: BotOpt, resolve: (v: unknown) => void): void {
  g.loop.sleep();
  let t = performance.now();
  const step = () => {
    t += 16.667;
    g.headlessStep(t, 16.667);
  };
  if (opt.atk) s.stats.attack *= opt.atk;
  if (opt.hp) {
    s.stats.maxHp *= opt.hp;
    s.hp = s.stats.maxHp;
  }
  const lv: [number, number][] = [];
  let lastLevel = 1;
  const maxMs = (opt.maxSec ?? 660) * 1000;
  const chunk = () => {
    for (let i = 0; i < 900; i++) {
      if (s.mode === 'choose') {
        const ch = s.currentChoices as Any[];
        const score = (u: Any) => (u.kind === 'basic' ? 5 : u.kind === 'active' ? 4 : u.id === 'heart' || u.id === 'scale' ? 2 : u.kind === 'passive' ? 1.5 : 0);
        let bi = 0;
        ch.forEach((u, k) => {
          if (score(u) > score(ch[bi])) bi = k;
        });
        s.pickChoice(bi);
      }
      if (s.mode === 'paused') s.closePause(); // 창이 숨겨지면 게임이 스스로 일시정지함
      if (s.mode === 'result') break;
      if (s.mode === 'play') steer(s, opt);
      if (s.level > lastLevel) {
        for (let l = lastLevel + 1; l <= s.level; l++) lv.push([l, Math.round(s.elapsed / 1000)]);
        lastLevel = s.level;
      }
      step();
    }
    if (s.mode === 'result' || s.elapsed > maxMs) {
      const d = s.director;
      g.loop.wake();
      const sec = (x: number | null | undefined) => (x == null ? null : Math.round(x / 1000));
      resolve({
        stage: opt.stage, dragon: opt.dragon ?? 'red', seed: opt.seed ?? 1, atk: opt.atk ?? 1,
        clear: d.record.bossKillMs != null, end: d.phase, sec: sec(s.elapsed), level: s.level, hp: Math.round(s.hp),
        kills: s.normalKills, coinGold: s.coinGold, drops: s.itemLog.drop, picks: s.itemLog.pick,
        waveEnd: d.record.waveEndAt.map(sec), eliteAt: d.record.eliteSpawnAt.map(sec), eliteKill: d.record.eliteKillMs.map(sec),
        bossAt: sec(d.record.bossSpawnAt), bossKill: sec(d.record.bossKillMs), firstLevels: lv.slice(0, 5),
        sigUses: s.signature.uses, sigDmg: Math.round(s.dmgLog.signature ?? 0), dmg: Math.round(Object.values(s.dmgLog as Record<string, number>).reduce((a, b) => a + b, 0)),
      });
      return;
    }
    setTimeout(chunk, 0);
  };
  chunk();
}

/** 단순 조작: 가까운 적은 피하고(엘리트·보스 가중), 보석·아이템으로 다가가고, 벽에서 멀어진다. 전용 스킬은 적이 모이면 쓴다 */
function steer(s: Any, opt: BotOpt): void {
  const px = s.player.x;
  const py = s.player.y;
  let vx = 0;
  let vy = 0;
  let near = 0;
  for (const e of s.enemies.getChildren() as Any[]) {
    if (!e.active) continue;
    const dx = px - e.x;
    const dy = py - e.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 220 * 220) near++;
    if (d2 < 260 * 260) {
      const w = (e.rank === 'normal' ? 1 : 4) / Math.max(400, d2);
      vx += dx * w * 3000;
      vy += dy * w * 3000;
    }
  }
  // 위험한 예고 범위(붉은 원·부채꼴)는 크게 피한다
  for (const h of s.hazards as Any[]) {
    for (const o of h.objs as Any[]) {
      if (o.radius == null || o.radius < 30) continue;
      const dx = px - o.x;
      const dy = py - o.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < o.radius + 60) {
        vx += (dx / d) * 4;
        vy += (dy / d) * 4;
      }
    }
  }
  let best: Any = null;
  let bd = 380;
  for (const gm of [...s.gems.getChildren(), ...s.items.getChildren()] as Any[]) {
    const d = Math.hypot(gm.x - px, gm.y - py);
    if (d < bd) {
      bd = d;
      best = gm;
    }
  }
  if (best && near < 4) {
    vx += ((best.x - px) / bd) * 1.2;
    vy += ((best.y - py) / bd) * 1.2;
  }
  // 투기장 중심 둘레(반지름 약 600px)를 돌며 적을 끌고 다닌다(카이팅)
  const cx = s.arena.x - px;
  const cy = s.arena.y - py;
  const cd = Math.hypot(cx, cy) || 1;
  vx += (-cy / cd) * 0.7 + (cx / cd) * ((cd - 600) / 600);
  vy += (cx / cd) * 0.7 + (cy / cd) * ((cd - 600) / 600);
  // 정사각형 전장: 벽·모서리에 몰리면 갇히므로 벽에서 밀어낸다(원형은 위 카이팅이 벽을 따라 돎).
  // 바로 붙은 적을 피하는 힘이 너무 커서 모서리로 밀려 갇히지 않게, 사각형에서는 그 힘을 3으로 자른다.
  if (s.arena.shape === 'square') {
    const F = Math.hypot(vx, vy);
    if (F > 3) {
      vx *= 3 / F;
      vy *= 3 / F;
    }
    const lim = s.arena.r - 260;
    const ox = px - s.arena.x;
    const oy = py - s.arena.y;
    if (Math.abs(ox) > lim) vx -= Math.sign(ox) * ((Math.abs(ox) - lim) / 260) * 3;
    if (Math.abs(oy) > lim) vy -= Math.sign(oy) * ((Math.abs(oy) - lim) / 260) * 3;
  }
  // 장애물(2026-11-24 전장 모양): 가까우면 밀려나고 옆으로 돌아간다(사람처럼 기둥·바위를 피해 다님)
  for (const o of (s.arena.obstacles ?? []) as Any[]) {
    const qx = o.kind === 'pillar' ? o.x : Math.max(o.x - o.w / 2, Math.min(o.x + o.w / 2, px));
    const qy = o.kind === 'pillar' ? o.y : Math.max(o.y - o.h / 2, Math.min(o.y + o.h / 2, py));
    const dx = px - qx;
    const dy = py - qy;
    const d = Math.max(1, Math.hypot(dx, dy) - (o.kind === 'pillar' ? o.r : 0));
    if (d < 170) {
      const k = (170 - d) / 170;
      const L0 = Math.hypot(dx, dy) || 1;
      const side = dx * vy - dy * vx > 0 ? 1 : -1; // 지금 가던 쪽으로 돌아 나감
      vx += (dx / L0) * k * 2.5 + (-dy / L0) * side * k * 1.5;
      vy += (dy / L0) * k * 2.5 + (dx / L0) * side * k * 1.5;
    }
  }
  const L = Math.hypot(vx, vy);
  if (L > 0.05) s.stickVec.set(vx / L, vy / L);
  else s.stickVec.set(0, 0);
  const boss = s.director.boss?.active || s.director.elites.some((e: Any) => e?.active);
  if (opt.sig !== false && s.signature.ready && (near >= 5 || boss)) s.castSignature();
}
