import { cellKey, findPath, neighbors, parseLevel } from './core.js';
import { parseProceduralIdentity } from './level-index.js';

export const PROCEDURAL_VERSION = 1;
export const PROCEDURAL_DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
export const PROCEDURAL_ECONOMIES = ['normal', 'random'];

const DIFFICULTY_CODE = { Easy: 'E', Medium: 'M', Hard: 'H' };
const STANDARD_COSTS = { BLASTER: 6, LASER: 10, MISSILE: 15, SHOCK: 12, THUMP: 14 };
const NAME_ADJECTIVES = ['Clockwork', 'Cosmic', 'Crooked', 'Electric', 'Ferocious', 'Fractal', 'Glitchy', 'Honeyed', 'Lunar', 'Neon', 'Phantom', 'Quantum', 'Rogue', 'Shifting', 'Sneaky', 'Turbo', 'Unruly', 'Wild'];
const NAME_NOUNS = ['Bottleneck', 'Circuit', 'Constellation', 'Crossroads', 'Detour', 'Firebreak', 'Gauntlet', 'Honeycomb', 'Kaleidoscope', 'Labyrinth', 'Pinball', 'Switchback', 'Trapdoor', 'Whirlpool', 'Zigzag'];
const CREEP_ARCHETYPES = {
  CHOMPER: { speed: [24, 30], health: [65, 85] },
  WIGGLE: { speed: [24, 32], health: [65, 85] },
  SPINNER: { speed: [30, 38], health: [55, 75] },
  STAR: { speed: [36, 48], health: [40, 60] },
  CUBIC: { speed: [26, 34], health: [70, 95] },
  PULSAR: { speed: [36, 44], health: [60, 85] },
  SWARM: { speed: [30, 38], health: [35, 50] }
};

const CONFIG = {
  Easy: {
    spawns: [1, 2], exits: [1, 1], blocked: [8, 16], terrain: [0, 3], roster: [2, 3], waves: [6, 8],
    groups: [1, 2], count: [4, 9], towers: [2, 3], healthScale: .8, speedScale: .9,
    allowedCreeps: ['CHOMPER', 'WIGGLE', 'SPINNER', 'STAR'], terrainTypes: ['pass', 'pass', 'fastpass'],
    healthFactor: [1.45, 1.65], healthFactor2: [0, 0], speedFactor: [1, 1.02], waveDelay: [18, 22], spawnDelay: [.8, 1.05],
    normal: { cash: 40, lives: 15 }, random: { cash: [30, 50], lives: [12, 18], wealth: [.9, 1.1] }, concurrentChance: .08
  },
  Medium: {
    spawns: [1, 3], exits: [1, 2], blocked: [14, 26], terrain: [1, 5], roster: [3, 5], waves: [8, 10],
    groups: [1, 3], count: [5, 11], towers: [3, 4], healthScale: 1, speedScale: 1,
    allowedCreeps: ['CHOMPER', 'WIGGLE', 'SPINNER', 'STAR', 'CUBIC', 'PULSAR'], terrainTypes: ['pass', 'pass', 'fastpass', 'healpass'],
    healthFactor: [1.7, 1.95], healthFactor2: [0, .01], speedFactor: [1, 1.04], waveDelay: [15, 19], spawnDelay: [.6, .85],
    normal: { cash: 55, lives: 12 }, random: { cash: [42, 70], lives: [8, 15], wealth: [.85, 1.15] }, concurrentChance: .24
  },
  Hard: {
    spawns: [2, 4], exits: [1, 2], blocked: [20, 36], terrain: [2, 8], roster: [4, 7], waves: [9, 12],
    groups: [1, 3], count: [6, 14], towers: [4, 5], healthScale: 1.15, speedScale: 1.05,
    allowedCreeps: ['CHOMPER', 'WIGGLE', 'SPINNER', 'STAR', 'CUBIC', 'PULSAR', 'SWARM'], terrainTypes: ['pass', 'fastpass', 'fastpass', 'healpass', 'healpass'],
    healthFactor: [1.95, 2.15], healthFactor2: [.01, .03], speedFactor: [1, 1.05], waveDelay: [13, 17], spawnDelay: [.5, .7],
    normal: { cash: 65, lives: 10 }, random: { cash: [50, 85], lives: [5, 12], wealth: [.8, 1.2] }, concurrentChance: .42
  }
};

function xmur3(value) {
  let h = 1779033703 ^ value.length;
  for (let i = 0; i < value.length; i++) { h = Math.imul(h ^ value.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
  return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return (h ^= h >>> 16) >>> 0; };
}

function mulberry32(seed) {
  return () => { let t = seed += 0x6d2b79f5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function randomApi(key) {
  const next = mulberry32(xmur3(key)());
  const api = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    chance: probability => next() < probability,
    pick: list => list[Math.floor(next() * list.length)],
    shuffle(list) { const out = [...list]; for (let i = out.length - 1; i > 0; i--) { const j = api.int(0, i); [out[i], out[j]] = [out[j], out[i]]; } return out; }
  };
  return api;
}

const step = (rng, [min, max], amount = 1) => Number((Math.round(rng.float(min, max) / amount) * amount).toFixed(6));
const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hex = ([q, r]) => `${q},${r}`;
const inside = ([q, r]) => q >= 0 && q < 14 && r >= 0 && r < 15;
const interior = ([q, r]) => q > 0 && q < 13 && r > 0 && r < 14;

export function normalizeProceduralSeed(value) {
  const seed = String(value ?? '').trim().toUpperCase();
  if (!/^[0-9A-F]{8}$/.test(seed)) throw new Error('Seed must be exactly eight hexadecimal characters.');
  return seed;
}

export function createProceduralSeed(randomSource = globalThis.crypto) {
  let value;
  if (randomSource?.getRandomValues) { const data = new Uint32Array(1); randomSource.getRandomValues(data); value = data[0]; }
  else value = Math.floor(Math.random() * 0x100000000);
  return value.toString(16).padStart(8, '0').toUpperCase();
}

function uniqueSeeds(seedFactory, existing = []) {
  const seeds = [...new Set(existing.map(value => { try { return normalizeProceduralSeed(value); } catch { return null; } }).filter(Boolean))].slice(0, 4);
  for (let guard = 0; seeds.length < 4 && guard < 100; guard++) {
    const seed = normalizeProceduralSeed(seedFactory());
    if (!seeds.includes(seed)) seeds.push(seed);
  }
  if (seeds.length < 4) throw new Error('Unable to create four unique procedural seeds.');
  return seeds;
}

export function normalizeProceduralState(value, seedFactory = createProceduralSeed) {
  const state = { version: 1, economyMode: PROCEDURAL_ECONOMIES.includes(value?.economyMode) ? value.economyMode : 'normal', sets: {} };
  for (const mode of PROCEDURAL_ECONOMIES) {
    state.sets[mode] = {};
    for (const difficulty of PROCEDURAL_DIFFICULTIES) state.sets[mode][difficulty] = uniqueSeeds(seedFactory, value?.version === 1 ? value?.sets?.[mode]?.[difficulty] : []);
  }
  return state;
}

export function proceduralSourceName({ seed, difficulty, economyMode }) {
  const normalized = normalizeProceduralSeed(seed);
  if (!DIFFICULTY_CODE[difficulty]) throw new Error(`Unknown procedural difficulty: ${difficulty}`);
  if (!PROCEDURAL_ECONOMIES.includes(economyMode)) throw new Error(`Unknown procedural economy: ${economyMode}`);
  return `Procedural/v${PROCEDURAL_VERSION}/GAME_LEVEL_PROC_${DIFFICULTY_CODE[difficulty]}_${economyMode.toUpperCase()}_${normalized}.xml`;
}

function boundaryCells(side) {
  if (side === 'left') return Array.from({ length: 11 }, (_, i) => [0, i + 2]);
  if (side === 'right') return Array.from({ length: 11 }, (_, i) => [13, i + 2]);
  if (side === 'top') return Array.from({ length: 10 }, (_, i) => [i + 2, 0]);
  return Array.from({ length: 10 }, (_, i) => [i + 2, 14]);
}

function endpoints(rng, config) {
  const horizontal = rng.chance(.5), first = horizontal ? (rng.chance(.5) ? 'left' : 'right') : (rng.chance(.5) ? 'top' : 'bottom');
  const opposite = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }[first];
  const spawnCount = rng.int(...config.spawns), exitCount = Math.min(spawnCount, rng.int(...config.exits));
  const spawnCells = rng.shuffle(boundaryCells(first)).slice(0, spawnCount), exitCells = rng.shuffle(boundaryCells(opposite)).slice(0, exitCount);
  const exits = exitCells.map((cell, i) => ({ name: `e${i + 1}`, hex: cell }));
  const spawns = spawnCells.map((cell, i) => ({ name: `s${i + 1}`, hex: cell, exit: exits[i % exits.length].name }));
  return { exits, spawns };
}

function randomBlocked(rng, target) {
  const blocked = new Set();
  for (let guard = 0; blocked.size < target && guard < target * 20; guard++) {
    let cell = [rng.int(1, 12), rng.int(1, 13)], direction = rng.pick(neighbors(...cell).map(next => [next[0] - cell[0], next[1] - cell[1]]));
    const length = rng.int(2, 6);
    for (let i = 0; i < length && blocked.size < target; i++) {
      if (interior(cell)) blocked.add(cellKey(...cell));
      if (rng.chance(.25)) { const next = rng.pick(neighbors(...cell).filter(interior)); direction = [next[0] - cell[0], next[1] - cell[1]]; }
      const next = [cell[0] + direction[0], cell[1] + direction[1]];
      if (!interior(next)) break;
      cell = next;
    }
  }
  return [...blocked].map(key => key.split(',').map(Number));
}

function fallbackBlocked(target) {
  const cells = [];
  for (const q of [3, 5, 7, 9, 11]) for (const r of [3, 5, 7, 9, 11]) cells.push([q, r]);
  return cells.slice(0, target);
}

function terrain(rng, config, blocked) {
  const target = rng.int(...config.terrain), blockedKeys = new Set(blocked.map(cell => cellKey(...cell)));
  const candidates = [];
  for (let q = 1; q <= 12; q++) for (let r = 1; r <= 13; r++) if (!blockedKeys.has(cellKey(q, r))) candidates.push([q, r]);
  const out = { pass: [], fast: [], heal: [] };
  for (const cell of rng.shuffle(candidates).slice(0, target)) {
    const type = rng.pick(config.terrainTypes);
    out[type === 'fastpass' ? 'fast' : type === 'healpass' ? 'heal' : 'pass'].push(cell);
  }
  return out;
}

function creepRoster(rng, config) {
  const count = rng.int(...config.roster), types = ['CHOMPER', ...rng.shuffle(config.allowedCreeps.filter(type => type !== 'CHOMPER'))].slice(0, count);
  return types.map(type => {
    const base = CREEP_ARCHETYPES[type];
    return { type, speed: Math.round(step(rng, base.speed) * config.speedScale), health: Math.round(step(rng, base.health, 5) * config.healthScale) };
  });
}

function towers(rng, config, economyMode) {
  const count = rng.int(...config.towers), types = ['BLASTER', ...rng.shuffle(['LASER', 'MISSILE', 'SHOCK', 'THUMP']).slice(0, count - 1)];
  return types.map(type => ({ type, cost: economyMode === 'normal' ? STANDARD_COSTS[type] : Math.max(4, Math.round(STANDARD_COSTS[type] * rng.float(.75, 1.25))) }));
}

function waveGroups(rng, config, roster, apparentIndex) {
  const groups = [], groupCount = rng.int(...config.groups), progress = Math.floor(apparentIndex / 3);
  for (let i = 0; i < groupCount; i++) groups.push({ type: rng.pick(roster).type, count: Math.min(config.count[1], rng.int(...config.count) + progress) });
  return groups;
}

function waves(rng, config, roster, spawns) {
  const result = [], count = rng.int(...config.waves);
  for (let i = 0; i < count; i++) {
    const mainSpawn = spawns[i < spawns.length ? i : rng.int(0, spawns.length - 1)].name;
    if (spawns.length > 1 && rng.chance(config.concurrentChance)) {
      const alternatives = spawns.filter(spawn => spawn.name !== mainSpawn);
      result.push({ spawn: rng.pick(alternatives).name, concurrent: true, groups: waveGroups(rng, config, roster, i) });
    }
    result.push({ spawn: mainSpawn, concurrent: false, groups: waveGroups(rng, config, roster, i) });
  }
  return result;
}

function buildSpec(rng, difficulty, economyMode, seed, missionName, useFallback = false) {
  const config = CONFIG[difficulty], { exits, spawns } = endpoints(rng, config);
  const blocked = useFallback ? fallbackBlocked(config.blocked[0]) : randomBlocked(rng, rng.int(...config.blocked));
  const special = terrain(rng, config, blocked), roster = creepRoster(rng, config), towerList = towers(rng, config, economyMode);
  const econ = economyMode === 'normal'
    ? { ...config.normal, wealth: 1 }
    : { cash: rng.int(...config.random.cash), lives: rng.int(...config.random.lives), wealth: step(rng, config.random.wealth, .05) };
  econ.cash = Math.max(econ.cash, Math.min(...towerList.map(tower => tower.cost)) * 5);
  const waveList = waves(rng, config, roster, spawns), terrainCount = special.pass.length + special.fast.length + special.heal.length;
  return {
    id: parseInt(seed, 16), seed, name: missionName, cash: econ.cash, lives: econ.lives,
    description: `${spawns.length} entrance${spawns.length === 1 ? '' : 's'} · ${waveList.filter(wave => !wave.concurrent).length} waves · ${terrainCount} terrain hex${terrainCount === 1 ? '' : 'es'} · ${economyMode === 'normal' ? 'Normal' : 'Random'} economy.`,
    exits, spawns, blocked, ...special, roster, waves: waveList, towers: towerList,
    waveHealthFactor: step(rng, config.healthFactor, .05), waveHealthFactor2: step(rng, config.healthFactor2, .01),
    waveSpeedFactor: step(rng, config.speedFactor, .01), waveWealthFactor: econ.wealth,
    delayBetweenWaves: step(rng, config.waveDelay, .5), delayBetweenSpawns: step(rng, config.spawnDelay, .05)
  };
}

function levelXml(spec) {
  const lines = ['<?xml version="1.0"?>', '<gameLevel>', `\t<info name="${esc(spec.name)}" id="${spec.id}" initCash="${spec.cash}" initLives="${spec.lives}" description="${esc(spec.description)}" />`, '<hexmap>'];
  for (const exit of spec.exits) lines.push(`\t<exithex name="${exit.name}" hex="${hex(exit.hex)}"/>`);
  for (const spawn of spec.spawns) lines.push(`\t<spawnhex name="${spawn.name}" hex="${hex(spawn.hex)}" exit="${spawn.exit}"/>`);
  for (const cell of spec.blocked) lines.push(`\t<specialhex type="blocked" hex="${hex(cell)}"/>`);
  for (const cell of spec.pass) lines.push(`\t<specialhex type="pass" hex="${hex(cell)}"/>`);
  for (const cell of spec.fast) lines.push(`\t<specialhex type="fastpass" hex="${hex(cell)}"/>`);
  for (const cell of spec.heal) lines.push(`\t<specialhex type="healpass" hex="${hex(cell)}"/>`);
  lines.push('</hexmap>', `\t<creeps waveHealthFactor="${spec.waveHealthFactor}" waveHealthFactor2="${spec.waveHealthFactor2}" waveSpeedFactor="${spec.waveSpeedFactor}" waveWealthFactor="${spec.waveWealthFactor}">`);
  for (const creep of spec.roster) lines.push(`\t\t<creep type="${creep.type}" speed="${creep.speed}" health="${creep.health}" />`);
  lines.push('\t</creeps>', `\t<creepWaves delayBetweenWaves="${spec.delayBetweenWaves}" delayBetweenSpawns="${spec.delayBetweenSpawns}">`);
  for (const wave of spec.waves) {
    lines.push(`\t\t<wave spawnHex="${wave.spawn}"${wave.concurrent ? ' concurrent="true"' : ''}>`);
    for (const group of wave.groups) lines.push(`\t\t\t<spawn type="${group.type}" count="${group.count}"/>`);
    lines.push('\t\t</wave>');
  }
  lines.push('\t</creepWaves>', '\t<towers>');
  for (const tower of spec.towers) lines.push(`\t\t<tower type="${tower.type}" cost="${tower.cost}"/>`);
  lines.push('\t</towers>', '</gameLevel>');
  return lines.join('\n');
}

export function validateProceduralLevel(level) {
  const problems = [], spawnNames = new Set(level.spawns.map(spawn => spawn.name)), creepTypes = new Set(Object.keys(level.creeps));
  for (const spawn of level.spawns) {
    const route = findPath(spawn.cell, spawn.exit, level.blocked);
    if (!route || route.length < 8) problems.push(`invalid route from ${spawn.name}`);
    const ingress = neighbors(...spawn.cell).filter(cell => inside(cell) && !level.blocked.has(cellKey(...cell)));
    if (ingress.length < 2) problems.push(`sealed ingress at ${spawn.name}`);
  }
  const buildable = Array.from({ length: 12 * 13 }, (_, index) => [1 + Math.floor(index / 13), 1 + index % 13])
    .filter(cell => !level.blocked.has(cellKey(...cell)) && !level.pass.has(cellKey(...cell))).length;
  if (buildable < 80) problems.push(`only ${buildable} buildable interior cells`);
  if (!level.towers.some(tower => tower.type === 'BLASTER')) problems.push('Blaster is not available');
  if (!level.towers.some(tower => tower.cost * 5 <= level.cash)) problems.push('starting cash cannot buy five cheapest towers');
  const usedSpawns = new Set();
  for (const wave of level.waves) {
    if (!spawnNames.has(wave.spawnName)) problems.push(`unknown wave spawn ${wave.spawnName}`); else usedSpawns.add(wave.spawnName);
    for (const group of wave.groups) if (!creepTypes.has(group.type)) problems.push(`undeclared creep ${group.type}`);
  }
  for (const spawn of spawnNames) if (!usedSpawns.has(spawn)) problems.push(`spawn ${spawn} has no wave`);
  for (const value of [level.cash, level.lives, level.waveHealthFactor, level.waveHealthFactor2, level.waveSpeedFactor, level.waveWealthFactor, level.delayBetweenWaves, level.delayBetweenSpawns]) if (!Number.isFinite(value)) problems.push('non-finite numeric setting');
  return problems;
}

export function generateProceduralEntry({ seed, difficulty, economyMode }) {
  seed = normalizeProceduralSeed(seed);
  if (!CONFIG[difficulty]) throw new Error(`Unknown procedural difficulty: ${difficulty}`);
  if (!PROCEDURAL_ECONOMIES.includes(economyMode)) throw new Error(`Unknown procedural economy: ${economyMode}`);
  const sourceName = proceduralSourceName({ seed, difficulty, economyMode }), key = `v${PROCEDURAL_VERSION}|${difficulty}|${economyMode}|${seed}`, rng = randomApi(key), nameRng = randomApi(`name|${key}`);
  const missionName = `${nameRng.pick(NAME_ADJECTIVES)} ${nameRng.pick(NAME_NOUNS)}`;
  for (let attempt = 0; attempt <= 200; attempt++) {
    const spec = buildSpec(rng, difficulty, economyMode, seed, missionName, attempt === 200), xml = levelXml(spec);
    const level = parseLevel(xml, sourceName, difficulty, 'procedural'), problems = validateProceduralLevel(level);
    if (!problems.length) return { sourceName, xml };
  }
  throw new Error(`Unable to generate a valid ${difficulty} mission for seed ${seed}.`);
}

export function entryFromProceduralSourceName(sourceName) {
  const identity = parseProceduralIdentity(sourceName);
  if (!identity || identity.version !== PROCEDURAL_VERSION) return null;
  return generateProceduralEntry(identity);
}

export const PROCEDURAL_CONFIG = CONFIG;
