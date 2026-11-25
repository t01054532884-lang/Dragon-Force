import { M } from './stats';
import type { ArtShape, EnemyDef, PatternSpec } from './enemies';
import { BOSS_P2 } from './bossPhase2';

// 개발 7단계 상세 기획서 v1.0 — 시즌 1 "WORLD EXPANSION" 2~20단계(제작자 2026-11-18).
// 1단계 잿빛 숲은 기존 구현 그대로(제작자 결정: 기존 확정 콘텐츠 우선). 2~20단계는 이름·몬스터·보스·패턴 방향은 원문,
// 능력치·패턴 수치는 **초기 테스트값(AI 1차안)** — 원문도 "1단계 쉬움의 기존 처치시간부터 비교해 확정"하라고 함.
// 스테이지별 코드를 복제하지 않고 공통 AI 5종(추적·돌진·원거리·방어·소환)과 보스 패턴 모듈을 조합한다.

type Art = [ArtShape, number, number];
const art = ([shape, body, accent]: Art, size: number) => ({ shape, body, accent, size });

// ───────── 일반 몬스터 프리셋(1단계 기준 능력치, 스테이지 배율은 따로 곱함) ─────────
const chase = (name: string, a: Art, o: Partial<EnemyDef> = {}): EnemyDef => ({
  name, texture: '', rank: 'normal', behavior: 'chase', hp: 11, speed: 120, contactDamage: 8, radius: 15, xp: 1, art: art(a, 40), ...o,
});
const fast = (name: string, a: Art, o: Partial<EnemyDef> = {}): EnemyDef => chase(name, a, { hp: 7, speed: 160, contactDamage: 6, radius: 13, art: art(a, 36), ...o });
const charge = (name: string, a: Art, o: Partial<EnemyDef> = {}): EnemyDef => ({
  name, texture: '', rank: 'normal', behavior: 'charge', hp: 24, speed: 75, contactDamage: 12, radius: 19, xp: 2, art: art(a, 46), ...o,
});
const ranged = (name: string, a: Art, o: Partial<EnemyDef> = {}): EnemyDef => ({
  name, texture: '', rank: 'normal', behavior: 'ranged', hp: 9, speed: 100, contactDamage: 6, radius: 15, xp: 2, art: art(a, 40),
  keep: 5 * M, shot: { every: 2800, speed: 260, damage: 7, count: 1, spread: 0 }, ...o,
});
const tank = (name: string, a: Art, o: Partial<EnemyDef> = {}): EnemyDef => ({
  name, texture: '', rank: 'normal', behavior: 'tank', hp: 40, speed: 58, contactDamage: 12, radius: 21, xp: 3, guard: 0.5, art: art(a, 50), ...o,
});
const summoner = (name: string, a: Art, minion: string, o: Partial<EnemyDef> = {}): EnemyDef => ({
  name, texture: '', rank: 'normal', behavior: 'summoner', hp: 14, speed: 80, contactDamage: 6, radius: 16, xp: 2, art: art(a, 42),
  keep: 5.5 * M, summon: { kind: minion, count: 2, every: 8000, max: 3 }, ...o,
});
const minion = (name: string, a: Art, o: Partial<EnemyDef> = {}): EnemyDef => ({
  name, texture: '', rank: 'normal', behavior: 'chase', hp: 4, speed: 145, contactDamage: 5, radius: 11, xp: 0, noReward: true, art: art(a, 30), ...o,
});

// ───────── 엘리트·보스 ─────────
const elite = (name: string, a: Art, patterns: PatternSpec[], o: Partial<EnemyDef> = {}): EnemyDef => ({
  name, texture: '', rank: 'elite', behavior: 'module', hp: 600, speed: 88, contactDamage: 16, radius: 36, xp: 25, art: art(a, 100), patterns, patternGap: 3200, ...o,
});
const heavyElite = (name: string, a: Art, patterns: PatternSpec[], o: Partial<EnemyDef> = {}): EnemyDef =>
  elite(name, a, patterns, { hp: 850, speed: 60, contactDamage: 18, radius: 40, guard: 0.2, art: art(a, 112), ...o });
const boss = (name: string, a: Art, patterns: PatternSpec[], patterns2: PatternSpec[], o: Partial<EnemyDef> = {}): EnemyDef => ({
  name, texture: '', rank: 'boss', behavior: 'module', hp: 3000, speed: 78, contactDamage: 20, radius: 52, xp: 0, art: art(a, 140),
  patterns, patterns2, patternGap: 2600, phaseAt: 0.5, ...o,
});

// ───────── 패턴 프리셋(1단계 기준 피해) ─────────
const P = {
  fan: (count: number, spread = 0.45, damage = 14, speed = 300): PatternSpec => ({ t: 'projectile', count, spread, speed, damage }),
  radial: (count: number, damage = 13, repeat = 1): PatternSpec => ({ t: 'projectile', count, spread: 0, speed: 260, damage, radial: true, repeat }),
  spear: (damage = 22): PatternSpec => ({ t: 'projectile', count: 1, spread: 0, speed: 620, damage, size: 1.8 }),
  dash: (count: number, then?: PatternSpec): PatternSpec => ({ t: 'charge', count, speed: 720, ms: 480, then }),
  area: (count: number, at: 'player' | 'scatter' | 'self' = 'player', r = 1.8 * M, damage = 20, delayMs?: number): PatternSpec => ({ t: 'area', count, r, damage, at, delayMs }),
  shock: (r = 3.5 * M, damage = 24): PatternSpec => ({ t: 'shockwave', r, damage }),
  ring: (inner = 2.5 * M, outer = 8 * M, damage = 22): PatternSpec => ({ t: 'ring', inner, outer, damage }),
  claw: (half = 0.8, r = 4 * M, damage = 24, slowPlayer = false): PatternSpec => ({ t: 'cone', half, r, damage, slowPlayer }),
  breath: (half = 0.52, r = 6.5 * M, damage = 26): PatternSpec => ({ t: 'cone', half, r, damage, breath: true }),
  line: (count = 1, width = 1.1 * M, length = 11 * M, damage = 22, o: { cross?: boolean; sequential?: boolean } = {}): PatternSpec => ({ t: 'line', count, width, length, damage, ...o }),
  sum: (kind: string, count: number): PatternSpec => ({ t: 'summon', kind, count }),
  shield: (front = true, ms = 3000, reduce = 0.6): PatternSpec => ({ t: 'shield', ms, reduce, front }),
  tp: { t: 'teleport' } as PatternSpec,
  orbs: (count: number, damage = 16): PatternSpec => ({ t: 'orbs', count, speed: 110, lifeMs: 6500, damage }),
  snow: (): PatternSpec => ({ t: 'slowZone', r: 3.2 * M, ms: 4000, slow: 0.4 }),
};

// 색
const GREEN = 0x5f8f3e, DARKGREEN = 0x3c5a2a, LEAF = 0x9ccc65, BROWN = 0x6b4423, BARK = 0x5d4a35, RED = 0xc0392b, ORANGE = 0xff8a3d, LAVA = 0xff5722, IRON = 0x8d8d95, DARK = 0x2e2a36;
const ICE = 0x9cd3f0, SNOW = 0xe8f4ff, FROST = 0x6fb4e8, CRYSTAL = 0xb3e5fc, PURPLE = 0x7e57c2, GHOST = 0x9fa8da, CURSE = 0x6a1b9a, BONE = 0xd7ccc8, GOLD = 0xffc94d, STAR = 0xfff3c4, ARCANE = 0xb388ff, AMBER = 0xffb300;

/** 2~20단계 적(아이디 → 정의). 텍스처 이름은 아이디와 같다(아래에서 채움) */
export const SEASON1_ENEMIES: Record<string, EnemyDef> = {
  // ── 2 가시덩굴 길 ──
  thorn_bug: fast('가시벌레', ['insect', GREEN, LEAF]),
  vine_sprite: summoner('덩굴 정령', ['plant', LEAF, GREEN], 'vine_sprout'),
  vine_sprout: minion('덩굴 싹', ['plant', LEAF, DARKGREEN]),
  forest_archer: ranged('숲 궁수', ['archer', DARKGREEN, BROWN]),
  thorn_boar: heavyElite('가시 멧돼지', ['boar', BROWN, LEAF], [P.dash(2), P.shock(3 * M, 20)]),
  vine_hunter: elite('덩굴 사냥꾼', ['archer', GREEN, LEAF], [P.fan(5, 0.5), P.area(2, 'player')], { keep: 6 * M }),
  thornhorn_treant: boss('가시뿔 트렌트', ['plant', BARK, LEAF], [P.line(1), P.fan(2, 0.3, 16), P.sum('vine_sprout', 3)], [P.line(2), P.fan(3, 0.4, 16), P.sum('vine_sprout', 5)]),
  // ── 3 버려진 사냥터 ──
  rabid_wolf: chase('광폭 늑대', ['beast', 0x7a2f2f, 0xff8a80], { speed: 140 }),
  wraith_hunter: ranged('망령 사냥꾼', ['archer', GHOST, 0xe8eaf6]),
  crow: fast('까마귀 떼', ['flyer', 0x222228, 0x9e9e9e]),
  shadow_panther: elite('그림자 표범', ['beast', 0x1f1f2b, 0xb39ddb], [P.dash(2), P.claw(0.9)], { speed: 110 }),
  cursed_hunter: elite('저주받은 사냥꾼', ['archer', CURSE, GHOST], [P.fan(3, 0.25, 16), P.area(1, 'player', 2.2 * M)], { keep: 6 * M }),
  moonshadow_devourer: boss('달그림자 포식자', ['beast', 0x26233a, 0xd1c4e9], [P.dash(2), P.tp, P.claw(1.57)], [P.dash(3), P.tp, P.claw(1.57), P.dash(2)]),
  // ── 4 고목의 심장 ──
  rotten_spirit: chase('썩은 정령', ['spirit', 0x6d7f4e, 0xc5e1a5]),
  spore_beast: ranged('포자 괴물', ['slime', 0x8d6e63, 0xd4e157], { shot: { every: 3200, speed: 200, damage: 8, count: 3, spread: 0.35 } }),
  oak_guard: tank('고목 수호병', ['plant', BARK, GREEN]),
  spore_queen: elite('포자 여왕', ['insect', 0x8d6e63, 0xd4e157], [P.sum('spore_mite', 4), P.area(2, 'scatter')], { keep: 6 * M }),
  spore_mite: minion('포자 진드기', ['insect', 0xa1887f, 0xd4e157]),
  oak_giant: heavyElite('고목 거인', ['plant', BARK, DARKGREEN], [P.shock(), P.shield(true, 2500)]),
  morkan: boss('숲의 심장 모르칸', ['plant', 0x4e342e, 0x76ff03], [P.line(2, 1.1 * M, 11 * M, 22, { cross: true }), P.fan(5, 0.9, 13), P.sum('oak_sprite', 3)], [P.area(2, 'scatter', 2.2 * M), P.line(2, 1.1 * M, 11 * M, 22, { cross: true }), P.fan(5, 0.9, 13), P.sum('oak_sprite', 3)], { hp: 3200 }),
  oak_sprite: minion('나무 정령', ['plant', LEAF, BARK], { hp: 6 }),
  // ── 5 불타는 관문(마일스톤) ──
  fire_imp: chase('화염 임프', ['imp', RED, ORANGE]),
  iron_soldier: tank('쇠갑옷 병사', ['knight', IRON, RED]),
  flame_bat: fast('불꽃 박쥐', ['flyer', ORANGE, 0xffe082]),
  flame_charger: elite('화염 돌격병', ['knight', RED, ORANGE], [P.dash(2), P.area(1, 'self', 2.5 * M)]),
  lava_golem: heavyElite('용암 골렘', ['golem', 0x4e342e, LAVA], [P.area(3, 'scatter'), P.shock()]),
  verkan: boss('마수왕 베르칸', ['beast', 0x8b1a1a, 0xffab40], [P.dash(1), P.shock(4 * M, 26), P.area(3, 'scatter')], [P.dash(1, P.shock(4 * M, 26)), P.area(3, 'scatter'), P.dash(2)]),
  // ── 6 붉은 병영 ──
  spearman: charge('창병', ['humanoid', 0x8d6e63, RED]),
  flame_archer: ranged('화염 궁수', ['archer', RED, ORANGE]),
  shield_knight: tank('방패 기사', ['knight', IRON, GOLD]),
  berserker_captain: elite('광전사 대장', ['humanoid', 0x8b1a1a, ORANGE], [P.claw(0.9, 3.5 * M), P.dash(2)], { speed: 115 }),
  order_commander: elite('기사단 지휘관', ['knight', GOLD, RED], [P.sum('spearman', 3), P.line(1)], { keep: 5 * M }),
  dravan: boss('철혈 장군 드라반', ['knight', 0x5d4037, 0xff7043], [P.dash(1), P.line(3, 1, 11 * M, 20, { sequential: true }), P.shield(true)], [P.dash(1, P.line(3, 1, 11 * M, 20, { sequential: true })), P.shield(true), P.line(3, 1, 11 * M, 20, { sequential: true })]),
  // ── 7 용암 제련소 ──
  lava_slime: chase('용암 슬라임', ['slime', LAVA, 0xffcc80], { hp: 14, speed: 100 }),
  smith_wraith: ranged('대장장이 망령', ['spirit', 0x6d4c41, ORANGE]),
  lava_thrower: ranged('용암 투척병', ['humanoid', 0x5d4037, LAVA], { shot: { every: 3400, speed: 220, damage: 9, count: 1, spread: 0 } }),
  forge_beast: elite('화염 제련수', ['golem', 0x6d4c41, ORANGE], [P.radial(10), P.dash(1)]),
  iron_giant: heavyElite('철갑 거인', ['golem', IRON, LAVA], [P.shock(), P.shield(true, 2500)]),
  graum: boss('용광로 거인 그라움', ['golem', 0x3e2723, LAVA], [P.area(1, 'player', 3 * M, 26), P.area(3, 'scatter'), P.fan(7, 1.0, 13)], [P.area(1, 'player', 3 * M, 26), P.area(5, 'scatter'), P.fan(7, 1.0, 13)], { hp: 3300 }),
  // ── 8 불멸의 성벽 ──
  black_knight: tank('흑기사', ['knight', DARK, 0x9e9e9e]),
  fire_mage: ranged('화염 마도사', ['mage', RED, ORANGE], { shot: { every: 3000, speed: 280, damage: 8, count: 2, spread: 0.2 } }),
  blast_imp: fast('폭발 임프', ['imp', 0xff7043, 0xffee58]),
  wall_breaker: heavyElite('성벽 파괴자', ['golem', IRON, 0xff7043], [P.dash(1, P.shock(3 * M, 22)), P.shock()]),
  flame_executioner: elite('화염 집행관', ['knight', RED, 0xffee58], [P.claw(0.9, 4 * M), P.line(1)]),
  valterion: boss('불꽃 기사 발테리온', ['knight', 0xb71c1c, 0xffd54f], [P.line(1, 1.3 * M), P.claw(2.36, 3.6 * M, 24), P.dash(1)], [P.line(2, 1.3 * M, 11 * M, 22, { sequential: true }), P.dash(1), P.claw(2.36, 3.6 * M, 24)]),
  // ── 9 얼어붙은 계곡 ──
  snow_wolf: chase('눈늑대', ['beast', SNOW, FROST], { speed: 135 }),
  ice_bat: fast('얼음 박쥐', ['flyer', ICE, SNOW]),
  snow_spirit: ranged('설원 정령', ['spirit', SNOW, FROST]),
  ice_wolf_king: elite('얼음 늑대왕', ['beast', 0xcfe8ff, 0x4fc3f7], [P.dash(3), P.claw(0.8, 4 * M, 22, true)]),
  frost_mage: elite('서리 마법사', ['mage', FROST, SNOW], [P.snow(), P.fan(3, 0.3, 15)], { keep: 6 * M }),
  air: boss('빙결 수호수 아이르', ['beast', 0xb3e5fc, 0x0288d1], [P.spear(), P.claw(0.9, 4 * M, 24, true), P.shield(false, 3000, 0.5)], [P.fan(3, 0.3, 20, 600), P.claw(0.9, 4 * M, 24, true), P.shield(false, 3000, 0.5)]),
  // ── 10 수정 동굴(마일스톤) ──
  crystal_spider: fast('수정 거미', ['insect', CRYSTAL, 0x4dd0e1]),
  ice_golem: tank('얼음 골렘', ['golem', ICE, SNOW]),
  crystal_bat: fast('수정 박쥐', ['flyer', 0x80deea, SNOW]),
  spider_queen: elite('수정 거미 여왕', ['insect', 0x4dd0e1, CRYSTAL], [P.sum('crystal_spider', 4), P.fan(5, 0.6)], { keep: 5 * M }),
  ice_giant: heavyElite('얼음 거인', ['golem', FROST, SNOW], [P.shock(), P.area(2, 'scatter')]),
  kardion: boss('수정 골렘 카르디온', ['golem', 0x4dd0e1, 0xe0f7fa], [P.radial(10), P.area(1, 'player', 2 * M, 24), P.shield(true)], [P.radial(10, 13, 2), P.area(2, 'player', 2 * M, 24), P.shield(true)]),
  // ── 11 눈보라 고원 ──
  storm_spirit: chase('눈폭풍 정령', ['spirit', 0xcfd8dc, FROST]),
  tundra_hunter: ranged('설원 사냥꾼', ['archer', 0x90a4ae, SNOW]),
  ice_spearman: charge('얼음 창병', ['humanoid', FROST, SNOW]),
  tundra_beast: elite('설원 맹수', ['beast', 0xeceff1, 0x78909c], [P.dash(2), P.claw(0.8)]),
  storm_shaman: elite('폭풍 주술사', ['mage', 0x78909c, ICE], [P.snow(), P.sum('storm_spirit', 3)], { keep: 6 * M }),
  seria: boss('백설의 여왕 세리아', ['mage', 0xe1f5fe, 0x81d4fa], [P.area(3, 'player', 1.5 * M, 20), P.snow(), P.sum('frost_clone', 2)], [P.area(3, 'player', 1.5 * M, 20), P.snow(), P.sum('frost_clone', 3)]),
  frost_clone: minion('서리 분신', ['mage', 0xb3e5fc, SNOW], { hp: 30, speed: 90, contactDamage: 10, radius: 26, lifeMs: 12000, art: art(['mage', 0xb3e5fc, SNOW], 90) }),
  // ── 12 영원의 빙궁 ──
  ice_knight: tank('얼음 기사', ['knight', FROST, SNOW]),
  freeze_mage: ranged('빙결 마법사', ['mage', ICE, SNOW], { shot: { every: 3000, speed: 280, damage: 8, count: 2, spread: 0.2 } }),
  frost_wraith: chase('서리 망령', ['spirit', 0xb3e5fc, 0xe1f5fe]),
  palace_guard: heavyElite('빙궁 수호기사', ['knight', 0x90caf9, SNOW], [P.shield(true), P.dash(2)]),
  ice_judge: elite('얼음 심판관', ['knight', 0xe1f5fe, 0x29b6f6], [P.line(2, 1.2 * M, 11 * M, 20, { sequential: true }), P.claw()]),
  valkir: boss('서리 군주 발키르', ['knight', 0x81d4fa, 0xe1f5fe], [P.line(1, 1.8 * M), P.line(2, 0.8 * M, 9 * M, 18, { cross: true }), P.ring()], [P.line(2, 0.8 * M, 9 * M, 18, { cross: true }), P.line(1, 1.8 * M), P.ring()]),
  // ── 13 망자의 거리 ──
  wraith_soldier: chase('망령 병사', ['humanoid', GHOST, 0xe8eaf6]),
  cursed_citizen: chase('저주받은 시민', ['humanoid', 0x6d6875, CURSE], { hp: 14, speed: 95 }),
  black_crow: fast('검은 까마귀', ['flyer', 0x121212, CURSE]),
  wraith_knight: elite('망령 기사', ['knight', GHOST, CURSE], [P.dash(2), P.claw()]),
  curse_priest: elite('저주의 사제', ['mage', CURSE, GHOST], [P.sum('wraith_soldier', 3), P.orbs(2)], { keep: 6 * M }),
  morte: boss('영혼 수확자 모르테', ['spirit', 0x311b92, 0xb388ff], [P.claw(1.2, 4.5 * M, 24), P.orbs(1, 18), P.sum('wraith_soldier', 3)], [P.claw(1.2, 4.5 * M, 24), P.claw(1.2, 4.5 * M, 24), P.orbs(2, 18), P.sum('wraith_soldier', 3)]),
  // ── 14 그림자 성당 ──
  dark_cultist: chase('암흑 신도', ['humanoid', DARK, CURSE]),
  shadow_hunter: ranged('그림자 사냥꾼', ['archer', DARK, 0x7e57c2]),
  curse_caster: summoner('저주술사', ['mage', CURSE, 0xce93d8], 'curse_imp'),
  curse_imp: minion('저주 임프', ['imp', CURSE, 0xce93d8]),
  dark_executioner: elite('암흑 집행관', ['knight', DARK, CURSE], [P.claw(0.9, 4 * M), P.dash(1)]),
  shadow_priest: elite('그림자 사제', ['mage', DARK, ARCANE], [P.area(2, 'player', 2 * M, 20, 2000), P.tp], { keep: 6 * M }),
  nox: boss('타락한 대사제 노크스', ['mage', 0x1a1a2e, 0x9c27b0], [P.shock(4 * M), P.area(1, 'player', 2.4 * M, 24, 2000), P.tp], [P.area(2, 'player', 2.4 * M, 24, 2000), P.shock(4 * M), P.tp], { hp: 2700 }), // 실측: 소환형이 많은 단계라 보스 체력 낮춤
  // ── 15 검은 왕좌의 길(마일스톤) ──
  soul_soldier: chase('영혼 병사', ['humanoid', 0x7986cb, 0xe8eaf6], { hp: 13 }),
  curse_golem: tank('저주 골렘', ['golem', 0x4a148c, CURSE]),
  black_knight_captain: heavyElite('흑기사 대장', ['knight', 0x111111, 0xffd54f], [P.dash(2), P.line(1)]),
  soul_devourer: elite('영혼 포식자', ['spirit', 0x4a148c, ARCANE], [P.orbs(3), P.claw()]),
  wraith_cavalry: minion('망령 기병', ['beast', GHOST, CURSE], { behavior: 'charge', hp: 10, speed: 90, contactDamage: 10, radius: 18, lifeMs: 9000, art: art(['beast', GHOST, CURSE], 46) }),
  bargan: boss('망령 장군 바르간', ['knight', 0x283593, 0x90caf9], [P.line(3, 1, 11 * M, 20, { sequential: true }), P.sum('wraith_cavalry', 3), P.shield(true)], [P.line(4, 1, 11 * M, 20, { sequential: true }), P.sum('wraith_cavalry', 5), P.shield(true)]),
  // ── 16 저주받은 왕궁 ──
  palace_wraith: chase('왕궁 망령', ['spirit', 0x9575cd, GOLD]),
  dark_mage: ranged('암흑 마도사', ['mage', 0x311b92, ARCANE], { shot: { every: 3000, speed: 280, damage: 9, count: 2, spread: 0.2 } }),
  cursed_guard: tank('저주받은 수호병', ['knight', 0x4a148c, GOLD]),
  palace_executioner: elite('왕궁 집행관', ['knight', 0x4a148c, GOLD], [P.claw(1.0, 4 * M), P.dash(2)]),
  dark_witch_king: elite('암흑 주술왕', ['mage', 0x1a1a2e, ARCANE], [P.orbs(3), P.sum('palace_wraith', 3)], { keep: 6 * M }),
  ardeon: boss('저주왕 아르데온', ['knight', 0x1a1a2e, 0xce93d8], [P.line(1, 2 * M), P.area(2, 'player', 2.2 * M, 22, 1600), P.sum('ardeon_clone', 2)], [P.line(1, 2 * M, 11 * M, 22), P.area(2, 'player', 2.2 * M, 22, 1600), P.line(1, 2 * M), P.sum('ardeon_clone', 2)]),
  ardeon_clone: minion('환영 분신', ['knight', 0x4a148c, 0xce93d8], { hp: 40, speed: 110, contactDamage: 12, radius: 30, lifeMs: 8000, art: art(['knight', 0x4a148c, 0xce93d8], 100) }),
  // ── 17 황금빛 폐허 ──
  ancient_guard: tank('고대 수호병', ['knight', 0x8d6e63, GOLD]),
  mana_spirit: ranged('마력 정령', ['spirit', ARCANE, 0xe1bee7]),
  gold_beetle: charge('황금 갑충', ['insect', GOLD, AMBER]),
  ancient_lancer: elite('고대 창기사', ['knight', 0xa1887f, GOLD], [P.dash(2), P.spear()]),
  mana_giant: heavyElite('마력 거인', ['golem', 0x7e57c2, GOLD], [P.shock(), P.radial(8)]),
  auren: boss('황금 수호자 아우렌', ['knight', AMBER, 0xfff8e1], [P.spear(24), P.shield(true), P.shock(4 * M)], [P.shield(true), P.spear(24), P.spear(24), P.shock(4 * M)]),
  // ── 18 별의 회랑 ──
  star_spirit: chase('별빛 정령', ['spirit', STAR, GOLD]),
  mana_archer: ranged('마력 궁수', ['archer', ARCANE, STAR]),
  space_stalker: fast('공간 추적자', ['beast', 0x283593, STAR], { hp: 9 }),
  star_executioner: elite('별빛 집행관', ['knight', STAR, ARCANE], [P.fan(7, 0.6), P.claw()]),
  dimension_warden: elite('차원 파수꾼', ['mage', 0x1a237e, STAR], [P.tp, P.area(3, 'scatter', 1.8 * M, 20, 1500)], { keep: 5 * M }),
  lumiel: boss('별의 감시자 루미엘', ['mage', STAR, 0x7c4dff], [P.fan(7, 0.5, 14), P.area(3, 'scatter', 1.8 * M, 22, 1500), P.tp], [P.fan(7, 0.5, 14), P.fan(7, 0.5, 14), P.area(3, 'scatter', 1.8 * M, 22, 1500), P.tp]),
  // ── 19 용의 제단 ──
  ancient_merc: charge('고대 용병', ['humanoid', 0x795548, GOLD]),
  dragon_soul: chase('용의 영혼', ['spirit', 0xff7043, AMBER]),
  mana_guard: tank('마력 수호병', ['knight', 0x5e35b1, STAR]),
  dragon_apostle: elite('용의 사도', ['mage', 0xbf360c, AMBER], [P.breath(0.5, 5 * M, 22), P.fan(3, 0.3)]),
  ancient_captain: heavyElite('고대 대장', ['knight', 0x6d4c41, GOLD], [P.dash(2), P.shock()]),
  serkan: boss('용의 심판자 세르칸', ['dragon', 0x8d6e63, AMBER], [P.breath(), P.spear(24), P.ring(3 * M, 9 * M, 22)], [P.breath(), P.spear(24), P.ring(3 * M, 9 * M, 22), P.spear(24)]),
  // ── 20 봉인의 중심(시즌 1 마지막) ──
  seal_guard: tank('봉인 수호병', ['knight', 0x37474f, STAR]),
  mana_golem: charge('마력 골렘', ['golem', 0x5e35b1, ARCANE], { hp: 30 }),
  ancient_spirit: ranged('고대 정령', ['spirit', 0xffe082, STAR]),
  seal_warden: heavyElite('봉인의 파수꾼', ['golem', 0x455a64, STAR], [P.shield(true), P.shock(4 * M)]),
  sanctum_executioner: elite('성역 집행관', ['knight', 0xfff8e1, AMBER], [P.claw(), P.line(1, 1.3 * M)]),
  eirgon: boss('봉인 수호룡 에이르곤', ['dragon', 0xeceff1, 0xffd54f], [P.breath(0.52, 7 * M, 26), P.claw(1.57, 4 * M, 24), P.orbs(3), P.ring()], [P.breath(0.52, 7 * M, 26), P.orbs(3), P.claw(1.57, 4 * M, 24), P.ring()], { hp: 2400 }), // 최종보스 ×2.0(기존 규칙) 적용 후 20단계 약 17,400
};
for (const [id, d] of Object.entries(SEASON1_ENEMIES)) d.texture = `e-${id}`;
// 보스 2페이즈 전용 공격(2026-11-25, bossPhase2.ts): 2페이즈 목록 맨 앞 → 전환 직후 첫 공격, 그 뒤로 차례대로
for (const [id, p] of Object.entries(BOSS_P2)) {
  const d = SEASON1_ENEMIES[id];
  if (d?.patterns2 && p.move) d.patterns2 = [p.move, ...d.patterns2];
}

/** 챕터(원문 5개). 바닥·벽 색은 투기장 테마 */
export const CHAPTERS = [
  { id: 1, name: '잿빛 숲', floor: 0x3a3a3f, line: 0x6b2a2a, wall: 0x24252b, stone: 0x3b3d46, color: '#6bc786' },
  { id: 2, name: '불타는 요새', floor: 0x3d2a24, line: 0xff5722, wall: 0x2b1712, stone: 0x5d2f22, color: '#ff684d' },
  { id: 3, name: '영원의 설원', floor: 0x56677a, line: 0xb3e5fc, wall: 0x2c3a4a, stone: 0x7a90a6, color: '#71bfff' },
  { id: 4, name: '저주받은 왕국', floor: 0x2b2433, line: 0x9c27b0, wall: 0x18121f, stone: 0x3d2f4a, color: '#b995ff' },
  { id: 5, name: '고대 용의 성역', floor: 0x4a4130, line: 0xffc94d, wall: 0x2a2418, stone: 0x6b5b3a, color: '#f2c167' },
];
export const chapterOf = (stageId: number) => CHAPTERS[Math.min(CHAPTERS.length - 1, Math.floor((stageId - 1) / 4))];

/** 2~20단계 구성: [단계, 이름, 일반 3종, 엘리트 1·2, 보스] — 일반 몬스터 비중은 첫째 55% · 둘째 28% · 셋째 17%(셋째는 1분부터) */
type Row = [number, string, [string, string, string], [string, string], string];
export const SEASON1_STAGE_ROWS: Row[] = [
  [2, '가시덩굴 길', ['thorn_bug', 'vine_sprite', 'forest_archer'], ['thorn_boar', 'vine_hunter'], 'thornhorn_treant'],
  [3, '버려진 사냥터', ['rabid_wolf', 'crow', 'wraith_hunter'], ['shadow_panther', 'cursed_hunter'], 'moonshadow_devourer'],
  [4, '고목의 심장', ['rotten_spirit', 'oak_guard', 'spore_beast'], ['spore_queen', 'oak_giant'], 'morkan'],
  [5, '불타는 관문', ['fire_imp', 'flame_bat', 'iron_soldier'], ['flame_charger', 'lava_golem'], 'verkan'],
  [6, '붉은 병영', ['spearman', 'shield_knight', 'flame_archer'], ['berserker_captain', 'order_commander'], 'dravan'],
  [7, '용암 제련소', ['lava_slime', 'smith_wraith', 'lava_thrower'], ['forge_beast', 'iron_giant'], 'graum'],
  [8, '불멸의 성벽', ['blast_imp', 'black_knight', 'fire_mage'], ['wall_breaker', 'flame_executioner'], 'valterion'],
  [9, '얼어붙은 계곡', ['snow_wolf', 'ice_bat', 'snow_spirit'], ['ice_wolf_king', 'frost_mage'], 'air'],
  [10, '수정 동굴', ['crystal_spider', 'crystal_bat', 'ice_golem'], ['spider_queen', 'ice_giant'], 'kardion'],
  [11, '눈보라 고원', ['storm_spirit', 'ice_spearman', 'tundra_hunter'], ['tundra_beast', 'storm_shaman'], 'seria'],
  [12, '영원의 빙궁', ['frost_wraith', 'ice_knight', 'freeze_mage'], ['palace_guard', 'ice_judge'], 'valkir'],
  [13, '망자의 거리', ['wraith_soldier', 'black_crow', 'cursed_citizen'], ['wraith_knight', 'curse_priest'], 'morte'],
  [14, '그림자 성당', ['dark_cultist', 'shadow_hunter', 'curse_caster'], ['dark_executioner', 'shadow_priest'], 'nox'],
  [15, '검은 왕좌의 길', ['soul_soldier', 'black_knight', 'curse_golem'], ['black_knight_captain', 'soul_devourer'], 'bargan'],
  [16, '저주받은 왕궁', ['palace_wraith', 'cursed_guard', 'dark_mage'], ['palace_executioner', 'dark_witch_king'], 'ardeon'],
  [17, '황금빛 폐허', ['gold_beetle', 'ancient_guard', 'mana_spirit'], ['ancient_lancer', 'mana_giant'], 'auren'],
  [18, '별의 회랑', ['star_spirit', 'space_stalker', 'mana_archer'], ['star_executioner', 'dimension_warden'], 'lumiel'],
  [19, '용의 제단', ['dragon_soul', 'ancient_merc', 'mana_guard'], ['dragon_apostle', 'ancient_captain'], 'serkan'],
  [20, '봉인의 중심', ['ancient_spirit', 'mana_golem', 'seal_guard'], ['seal_warden', 'sanctum_executioner'], 'eirgon'],
];

// 엘리트 체력은 1단계와 같은 틀: 1:40 엘리트 1 = 520, 3:40 엘리트 2 = 850(1단계 월광송곳니·철갑어미 기준)
for (const [, , , [e1, e2]] of SEASON1_STAGE_ROWS) {
  SEASON1_ENEMIES[e1].hp = 520;
  SEASON1_ENEMIES[e2].hp = 850;
}

/** 에이르곤 처치 메시지(원문 10장) */
export const SEASON1_FINALE = '봉인이 흔들리기 시작했다. 아직 잠들어 있는 고대의 용들이 존재한다.';
