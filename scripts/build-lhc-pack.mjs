// Authors the "LHC // Breach Grid" fan campaign and emits src/lhc-levels.js.
//
// This is an original, security-themed level pack — NOT extracted from any
// geoDefense archive. It rides alongside the bundled base missions as its own
// `lhc` campaign (see src/level-index.js). Every mission is a Swarm-style maze
// on the 14x15 hex grid: the player walls creeps in with towers, so all we author
// is the arena, the spawn/exit openings, the creep roster and the wave script.
//
// Correctness is proven, not hoped for: each generated level is fed back through
// the real engine (parseLevel) and its every spawn->exit route is checked with
// the engine's own pathfinder (findPath) against the exact `blocked` set the game
// computes. A level with no open route — or with a spawn/exit sealed by an
// obstacle — fails the build instead of shipping unplayable.
//
// Usage:  node scripts/build-lhc-pack.mjs

import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installDomParser } from '../tests/support/xml-dom.mjs';
installDomParser();
import { parseLevel, findPath, cellKey } from '../src/core.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// --- geometry helpers: every builder returns an array of [q,r] cells ----------
// The playable interior is q in 1..12, r in 1..13; q=0/13 and r=0/14 are the
// auto-blocked boundary (openings are punched by listing a spawn/exit there).
const rect = (q0, q1, r0, r1) => { const out = []; for (let q = q0; q <= q1; q++) for (let r = r0; r <= r1; r++) out.push([q, r]); return out; };
const colRun = (q, r0, r1) => rect(q, q, r0, r1);
const rowRun = (r, q0, q1) => rect(q0, q1, r, r);
const cells = (...groups) => { const seen = new Set(), out = []; for (const g of groups) for (const c of g) { const k = cellKey(...c); if (!seen.has(k)) { seen.add(k); out.push(c); } } return out; };
// A full wall across column `q` with an open gap centred on rows `gaps`.
const wallCol = (q, r0, r1, gaps) => colRun(q, r0, r1).filter(([, r]) => !gaps.includes(r));
const wallRow = (r, q0, q1, gaps) => rowRun(r, q0, q1).filter(([q]) => !gaps.includes(q));

// --- XML assembly -------------------------------------------------------------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hex = ([q, r]) => `${q},${r}`;

function levelXml(spec) {
  const L = [];
  L.push('<?xml version="1.0"?>');
  L.push('<gameLevel>');
  L.push(`\t<info name="${esc(spec.name)}" id="${spec.id}" initCash="${spec.cash}" initLives="${spec.lives}" description="${esc(spec.description)}" />`);
  for (const h of spec.hints ?? []) L.push(`\t<hint text="${esc(h)}"/>`);
  L.push('<hexmap>');
  for (const e of spec.exits) L.push(`\t<exithex name="${e.name}" hex="${hex(e.hex)}"/>`);
  for (const s of spec.spawns) L.push(`\t<spawnhex name="${s.name}" hex="${hex(s.hex)}" exit="${s.exit}"/>`);
  for (const c of spec.blocked ?? []) L.push(`\t<specialhex type="blocked" hex="${hex(c)}"/>`);
  for (const c of spec.pass ?? []) L.push(`\t<specialhex type="pass" hex="${hex(c)}"/>`);
  for (const c of spec.fast ?? []) L.push(`\t<specialhex type="fastpass" hex="${hex(c)}"/>`);
  for (const c of spec.heal ?? []) L.push(`\t<specialhex type="healpass" hex="${hex(c)}"/>`);
  L.push('</hexmap>');
  const cr = spec.creeps;
  const crAttrs = [`waveHealthFactor="${cr.waveHealthFactor}"`];
  if (cr.waveHealthFactor2 != null) crAttrs.push(`waveHealthFactor2="${cr.waveHealthFactor2}"`);
  if (cr.waveSpeedFactor != null) crAttrs.push(`waveSpeedFactor="${cr.waveSpeedFactor}"`);
  if (cr.waveWealthFactor != null) crAttrs.push(`waveWealthFactor="${cr.waveWealthFactor}"`);
  L.push(`\t<creeps ${crAttrs.join(' ')}>`);
  for (const c of cr.list) L.push(`\t\t<creep type="${c.type}" speed="${c.speed}" health="${c.health}" />`);
  L.push('\t</creeps>');
  L.push(`\t<creepWaves delayBetweenWaves="${spec.delayBetweenWaves}" delayBetweenSpawns="${spec.delayBetweenSpawns}">`);
  for (const w of spec.waves) {
    const attrs = [`spawnHex="${w.spawn}"`];
    if (w.concurrent) attrs.push('concurrent="true"');
    L.push(`\t\t<wave ${attrs.join(' ')}>`);
    for (const g of w.groups) L.push(`\t\t\t<spawn type="${g.type}" count="${g.count}"/>`);
    L.push('\t\t</wave>');
  }
  L.push('\t</creepWaves>');
  L.push('\t<towers>');
  for (const t of spec.towers) L.push(`\t\t<tower type="${t.type}" cost="${t.cost}"/>`);
  L.push('\t</towers>');
  L.push('</gameLevel>');
  return L.join('\n');
}

// Reusable creep archetypes (theme flavor is in the level names; the engine only
// cares about type/speed/health). Scaling per difficulty via waveHealthFactor.
// Vortex (POP) is deliberately omitted: on Swarm-style (non-path) levels the
// build bar filters it out — native geoDefense Swarm only ever pre-places it —
// so `redteam` is the full buildable arsenal for a maze mission.
const towerTiers = {
  recon: [{ type: 'BLASTER', cost: 5 }],
  probe: [{ type: 'BLASTER', cost: 6 }, { type: 'LASER', cost: 10 }],
  pentest: [{ type: 'BLASTER', cost: 6 }, { type: 'LASER', cost: 10 }, { type: 'MISSILE', cost: 15 }],
  redteam: [{ type: 'BLASTER', cost: 6 }, { type: 'LASER', cost: 10 }, { type: 'MISSILE', cost: 15 }, { type: 'SHOCK', cost: 12 }, { type: 'THUMP', cost: 14 }]
};

// --- The campaign -------------------------------------------------------------
const specs = [
  // ============================ EASY: RECON =================================
  {
    file: 'GAME_LEVEL_LHC_E_0001.xml', id: 100, name: 'Port Scan', cash: 34, lives: 15,
    description: 'Automated scanners sweep every open port. Stack blasters to filter the noise before it reaches the core.',
    hints: ['Wall the packets into a long lane so your blasters get more shots on each one.', "Buy blasters the moment you can afford them — idle credits defend nothing."],
    exits: [{ name: 'e1', hex: [13, 7] }],
    spawns: [{ name: 's1', hex: [0, 7], exit: 'e1' }],
    blocked: cells(colRun(4, 2, 6), colRun(7, 8, 12), colRun(10, 2, 6)),
    creeps: { waveHealthFactor: 1.5, list: [{ type: 'CHOMPER', speed: 22, health: 60 }, { type: 'WIGGLE', speed: 24, health: 60 }, { type: 'STAR', speed: 30, health: 45 }] },
    delayBetweenWaves: 20, delayBetweenSpawns: 1,
    waves: [
      { spawn: 's1', groups: [{ type: 'CHOMPER', count: 6 }] },
      { spawn: 's1', groups: [{ type: 'WIGGLE', count: 6 }] },
      { spawn: 's1', groups: [{ type: 'CHOMPER', count: 4 }, { type: 'WIGGLE', count: 4 }] },
      { spawn: 's1', groups: [{ type: 'STAR', count: 6 }] },
      { spawn: 's1', groups: [{ type: 'CHOMPER', count: 8 }] },
      { spawn: 's1', groups: [{ type: 'STAR', count: 4 }, { type: 'WIGGLE', count: 4 }, { type: 'STAR', count: 4 }] }
    ],
    towers: towerTiers.recon
  },
  {
    file: 'GAME_LEVEL_LHC_E_0002.xml', id: 101, name: 'Ping Flood', cash: 36, lives: 15,
    description: 'Two subnets hammer the gateway at once. Split your defenses or drown in ICMP.',
    hints: ['Both corners spawn — do not commit every tower to one lane.', 'Long, snaking mazes keep creeps in blaster range the longest.'],
    exits: [{ name: 'e1', hex: [6, 14] }],
    spawns: [{ name: 's1', hex: [1, 0], exit: 'e1' }, { name: 's2', hex: [12, 0], exit: 'e1' }],
    blocked: cells(rect(6, 7, 4, 5), rect(3, 4, 8, 9), rect(9, 10, 8, 9)),
    creeps: { waveHealthFactor: 1.5, list: [{ type: 'CHOMPER', speed: 24, health: 55 }, { type: 'SPINNER', speed: 30, health: 50 }, { type: 'WIGGLE', speed: 24, health: 60 }] },
    delayBetweenWaves: 18, delayBetweenSpawns: 0.8,
    waves: [
      { spawn: 's1', groups: [{ type: 'CHOMPER', count: 6 }] },
      { spawn: 's2', groups: [{ type: 'CHOMPER', count: 6 }] },
      { spawn: 's1', groups: [{ type: 'SPINNER', count: 6 }] },
      { spawn: 's2', groups: [{ type: 'WIGGLE', count: 6 }] },
      { spawn: 's1', groups: [{ type: 'SPINNER', count: 5 }] },
      { spawn: 's2', groups: [{ type: 'SPINNER', count: 5 }] },
      { spawn: 's1', groups: [{ type: 'CHOMPER', count: 5 }, { type: 'WIGGLE', count: 5 }] },
      { spawn: 's2', groups: [{ type: 'WIGGLE', count: 5 }, { type: 'CHOMPER', count: 5 }] }
    ],
    towers: towerTiers.probe
  },
  {
    file: 'GAME_LEVEL_LHC_E_0003.xml', id: 102, name: 'Brute Force', cash: 40, lives: 14,
    description: 'A relentless dictionary attack pushes through one narrow auth gate. Fortify the chokepoint.',
    hints: ['Everything funnels through the gap in the wall — pile your best towers there.', 'The tighter you pack the gate, the more damage each pass deals.'],
    exits: [{ name: 'e1', hex: [13, 7] }],
    spawns: [{ name: 's1', hex: [0, 7], exit: 'e1' }],
    blocked: cells(wallCol(7, 1, 13, [7])),
    creeps: { waveHealthFactor: 1.6, list: [{ type: 'CHOMPER', speed: 20, health: 70 }, { type: 'CUBIC', speed: 26, health: 60 }] },
    delayBetweenWaves: 20, delayBetweenSpawns: 0.9,
    waves: [
      { spawn: 's1', groups: [{ type: 'CHOMPER', count: 8 }] },
      { spawn: 's1', groups: [{ type: 'CUBIC', count: 8 }] },
      { spawn: 's1', groups: [{ type: 'CHOMPER', count: 10 }] },
      { spawn: 's1', groups: [{ type: 'CUBIC', count: 6 }, { type: 'CHOMPER', count: 6 }] },
      { spawn: 's1', groups: [{ type: 'CHOMPER', count: 12 }] },
      { spawn: 's1', groups: [{ type: 'CUBIC', count: 12 }] }
    ],
    towers: towerTiers.probe
  },
  {
    file: 'GAME_LEVEL_LHC_E_0004.xml', id: 103, name: 'Phishing Net', cash: 42, lives: 14,
    description: 'Lures drift in from up top hunting for one careless click. Cast a wide net of towers.',
    hints: ['Scattered obstacles are hooks — weave your maze between them.', 'Fast lures slip through gaps; cover the open ground.'],
    exits: [{ name: 'e1', hex: [7, 14] }],
    spawns: [{ name: 's1', hex: [7, 0], exit: 'e1' }],
    blocked: cells([[3, 3]], [[6, 4]], [[10, 3]], [[4, 7]], [[8, 8]], [[11, 7]], [[3, 11]], [[7, 11]], [[10, 11]]),
    creeps: { waveHealthFactor: 1.55, waveSpeedFactor: 1.03, list: [{ type: 'WIGGLE', speed: 28, health: 55 }, { type: 'STAR', speed: 34, health: 45 }, { type: 'SPINNER', speed: 30, health: 55 }] },
    delayBetweenWaves: 18, delayBetweenSpawns: 0.8,
    waves: [
      { spawn: 's1', groups: [{ type: 'WIGGLE', count: 7 }] },
      { spawn: 's1', groups: [{ type: 'STAR', count: 7 }] },
      { spawn: 's1', groups: [{ type: 'SPINNER', count: 7 }] },
      { spawn: 's1', groups: [{ type: 'STAR', count: 5 }, { type: 'WIGGLE', count: 5 }] },
      { spawn: 's1', groups: [{ type: 'SPINNER', count: 8 }] },
      { spawn: 's1', groups: [{ type: 'STAR', count: 10 }] },
      { spawn: 's1', groups: [{ type: 'WIGGLE', count: 6 }, { type: 'SPINNER', count: 6 }] }
    ],
    towers: towerTiers.probe
  },
  // ========================= MEDIUM: EXPLOITATION ===========================
  {
    file: 'GAME_LEVEL_LHC_M_0001.xml', id: 104, name: 'SQL Injection', cash: 50, lives: 12,
    description: "A malformed query walks your tables row by row. Route it through the columns and drop it.",
    hints: ['The pillars are table columns — thread the payload between them.', 'Missiles hit hard but reload slowly; pair them with rapid blasters.'],
    exits: [{ name: 'e1', hex: [13, 7] }],
    spawns: [{ name: 's1', hex: [0, 7], exit: 'e1' }],
    blocked: cells(colRun(3, 2, 5), colRun(3, 9, 12), colRun(6, 2, 5), colRun(6, 9, 12), colRun(9, 2, 5), colRun(9, 9, 12)),
    creeps: { waveHealthFactor: 1.8, list: [{ type: 'CHOMPER', speed: 26, health: 70 }, { type: 'CUBIC', speed: 30, health: 65 }, { type: 'SPINNER', speed: 34, health: 60 }, { type: 'STAR', speed: 40, health: 50 }] },
    delayBetweenWaves: 18, delayBetweenSpawns: 0.7,
    waves: [
      { spawn: 's1', groups: [{ type: 'CHOMPER', count: 8 }] },
      { spawn: 's1', groups: [{ type: 'CUBIC', count: 8 }] },
      { spawn: 's1', groups: [{ type: 'SPINNER', count: 8 }] },
      { spawn: 's1', groups: [{ type: 'STAR', count: 8 }] },
      { spawn: 's1', groups: [{ type: 'CHOMPER', count: 6 }, { type: 'CUBIC', count: 6 }] },
      { spawn: 's1', groups: [{ type: 'SPINNER', count: 6 }, { type: 'STAR', count: 6 }] },
      { spawn: 's1', groups: [{ type: 'CUBIC', count: 10 }] },
      { spawn: 's1', groups: [{ type: 'STAR', count: 12 }] },
      { spawn: 's1', groups: [{ type: 'CHOMPER', count: 4 }, { type: 'SPINNER', count: 4 }, { type: 'STAR', count: 4 }] }
    ],
    towers: towerTiers.pentest
  },
  {
    file: 'GAME_LEVEL_LHC_M_0002.xml', id: 105, name: 'Buffer Overflow', cash: 52, lives: 12,
    description: 'The stack floods past its bounds through a cramped buffer. Contain the overrun in the channel.',
    hints: ['Only the middle band is open — every creep is forced through it.', 'Upgrade a few towers high rather than spreading thin in tight space.'],
    exits: [{ name: 'e1', hex: [13, 8] }],
    spawns: [{ name: 's1', hex: [0, 6], exit: 'e1' }],
    blocked: cells(rect(1, 12, 1, 3), rect(1, 12, 11, 13)),
    creeps: { waveHealthFactor: 1.9, list: [{ type: 'CHOMPER', speed: 24, health: 80 }, { type: 'CUBIC', speed: 28, health: 72 }, { type: 'WIGGLE', speed: 26, health: 78 }] },
    delayBetweenWaves: 16, delayBetweenSpawns: 0.7,
    waves: [
      { spawn: 's1', groups: [{ type: 'CHOMPER', count: 8 }] },
      { spawn: 's1', groups: [{ type: 'WIGGLE', count: 8 }] },
      { spawn: 's1', groups: [{ type: 'CUBIC', count: 8 }] },
      { spawn: 's1', groups: [{ type: 'CHOMPER', count: 10 }] },
      { spawn: 's1', groups: [{ type: 'WIGGLE', count: 6 }, { type: 'CUBIC', count: 6 }] },
      { spawn: 's1', groups: [{ type: 'CUBIC', count: 12 }] },
      { spawn: 's1', groups: [{ type: 'CHOMPER', count: 14 }] },
      { spawn: 's1', groups: [{ type: 'WIGGLE', count: 7 }, { type: 'CHOMPER', count: 7 }] }
    ],
    towers: towerTiers.pentest
  },
  {
    file: 'GAME_LEVEL_LHC_M_0003.xml', id: 106, name: 'Man in the Middle', cash: 55, lives: 12,
    description: 'Traffic converges from both endpoints on an intercept node. Grind it down before it relays.',
    hints: ['Two spawns funnel to one central exit — build a killbox around it.', 'Concurrent streams arrive together; area coverage beats single strong towers.'],
    exits: [{ name: 'e1', hex: [6, 7] }],
    spawns: [{ name: 's1', hex: [0, 7], exit: 'e1' }, { name: 's2', hex: [13, 7], exit: 'e1' }],
    blocked: cells(rowRun(5, 3, 10), rowRun(9, 3, 10), [[4, 7]], [[9, 7]]),
    creeps: { waveHealthFactor: 1.85, list: [{ type: 'SPINNER', speed: 32, health: 62 }, { type: 'STAR', speed: 42, health: 52 }, { type: 'CUBIC', speed: 30, health: 70 }] },
    delayBetweenWaves: 16, delayBetweenSpawns: 0.7,
    waves: [
      { spawn: 's1', groups: [{ type: 'SPINNER', count: 6 }] },
      { spawn: 's2', groups: [{ type: 'SPINNER', count: 6 }] },
      { spawn: 's1', concurrent: true, groups: [{ type: 'STAR', count: 6 }] },
      { spawn: 's2', groups: [{ type: 'STAR', count: 6 }] },
      { spawn: 's1', concurrent: true, groups: [{ type: 'CUBIC', count: 6 }] },
      { spawn: 's2', groups: [{ type: 'CUBIC', count: 6 }] },
      { spawn: 's1', concurrent: true, groups: [{ type: 'SPINNER', count: 5 }, { type: 'STAR', count: 5 }] },
      { spawn: 's2', groups: [{ type: 'STAR', count: 5 }, { type: 'SPINNER', count: 5 }] },
      { spawn: 's1', concurrent: true, groups: [{ type: 'CUBIC', count: 8 }] },
      { spawn: 's2', groups: [{ type: 'CUBIC', count: 8 }] }
    ],
    towers: towerTiers.pentest
  },
  {
    file: 'GAME_LEVEL_LHC_M_0004.xml', id: 107, name: 'Privilege Escalation', cash: 54, lives: 11,
    description: 'The exploit climbs from user land toward root. Hold the staircase and deny the ascent.',
    hints: ['Creeps climb bottom to top — layer defenses on each step.', 'Do not let a fast runner slip a whole flight; keep continuous coverage.'],
    exits: [{ name: 'e1', hex: [7, 0] }],
    spawns: [{ name: 's1', hex: [6, 14], exit: 'e1' }],
    blocked: cells(rect(1, 4, 3, 4), rect(6, 9, 6, 7), rect(9, 12, 9, 10), rect(2, 5, 11, 12)),
    creeps: { waveHealthFactor: 1.9, waveSpeedFactor: 1.03, list: [{ type: 'CHOMPER', speed: 26, health: 72 }, { type: 'STAR', speed: 44, health: 50 }, { type: 'CUBIC', speed: 30, health: 68 }, { type: 'SPINNER', speed: 34, health: 60 }] },
    delayBetweenWaves: 16, delayBetweenSpawns: 0.6,
    waves: [
      { spawn: 's1', groups: [{ type: 'CHOMPER', count: 8 }] },
      { spawn: 's1', groups: [{ type: 'STAR', count: 8 }] },
      { spawn: 's1', groups: [{ type: 'CUBIC', count: 8 }] },
      { spawn: 's1', groups: [{ type: 'SPINNER', count: 8 }] },
      { spawn: 's1', groups: [{ type: 'STAR', count: 6 }, { type: 'CHOMPER', count: 6 }] },
      { spawn: 's1', groups: [{ type: 'CUBIC', count: 6 }, { type: 'SPINNER', count: 6 }] },
      { spawn: 's1', groups: [{ type: 'STAR', count: 12 }] },
      { spawn: 's1', groups: [{ type: 'CHOMPER', count: 6 }, { type: 'STAR', count: 4 }, { type: 'CUBIC', count: 6 }] }
    ],
    towers: towerTiers.redteam
  },
  // ========================== HARD: NATION-STATE ============================
  {
    file: 'GAME_LEVEL_LHC_H_0001.xml', id: 108, name: 'Zero Day', cash: 62, lives: 10,
    description: 'An unpatched exploit no signature can see. Pulsars phase through targeting — box them in the open.',
    hints: ['Pulsars dodge missile splash; blankets of blasters and lasers still bite.', 'Open ground means you build the whole maze — make it long.'],
    exits: [{ name: 'e1', hex: [13, 7] }],
    spawns: [{ name: 's1', hex: [0, 3], exit: 'e1' }, { name: 's2', hex: [0, 11], exit: 'e1' }],
    blocked: cells(rect(6, 7, 6, 8)),
    creeps: { waveHealthFactor: 2.0, waveHealthFactor2: 0.02, list: [{ type: 'PULSAR', speed: 40, health: 70 }, { type: 'WIGGLE', speed: 30, health: 80 }, { type: 'STAR', speed: 48, health: 55 }] },
    delayBetweenWaves: 16, delayBetweenSpawns: 0.6,
    waves: [
      { spawn: 's1', groups: [{ type: 'WIGGLE', count: 8 }] },
      { spawn: 's2', groups: [{ type: 'PULSAR', count: 6 }] },
      { spawn: 's1', groups: [{ type: 'STAR', count: 10 }] },
      { spawn: 's2', concurrent: true, groups: [{ type: 'PULSAR', count: 6 }] },
      { spawn: 's1', groups: [{ type: 'PULSAR', count: 6 }] },
      { spawn: 's2', groups: [{ type: 'WIGGLE', count: 8 }, { type: 'STAR', count: 6 }] },
      { spawn: 's1', concurrent: true, groups: [{ type: 'PULSAR', count: 8 }] },
      { spawn: 's2', groups: [{ type: 'PULSAR', count: 8 }] },
      { spawn: 's1', groups: [{ type: 'STAR', count: 10 }, { type: 'PULSAR', count: 6 }] }
    ],
    towers: towerTiers.redteam
  },
  {
    file: 'GAME_LEVEL_LHC_H_0002.xml', id: 109, name: 'Ransomware', cash: 66, lives: 10,
    description: 'Self-healing payloads regenerate as they crawl across the healpass sectors. Burst them down fast.',
    hints: ['Creeps mend on the marked tiles — kill them before or after, not on top of them.', 'Front-load damage; a slow grind lets them heal the difference back.'],
    exits: [{ name: 'e1', hex: [13, 12] }],
    spawns: [{ name: 's1', hex: [0, 2], exit: 'e1' }, { name: 's2', hex: [6, 0], exit: 'e1' }],
    blocked: cells(rect(3, 4, 4, 6), rect(8, 9, 3, 5), rect(5, 6, 8, 10), rect(9, 10, 8, 11)),
    heal: cells([[6, 6]], [[7, 6]], [[3, 9]], [[11, 6]]),
    creeps: { waveHealthFactor: 2.05, list: [{ type: 'CHOMPER', speed: 26, health: 90 }, { type: 'CUBIC', speed: 30, health: 82 }, { type: 'SPINNER', speed: 36, health: 70 }, { type: 'PULSAR', speed: 40, health: 72 }] },
    delayBetweenWaves: 15, delayBetweenSpawns: 0.6,
    waves: [
      { spawn: 's1', groups: [{ type: 'CHOMPER', count: 8 }] },
      { spawn: 's2', groups: [{ type: 'CUBIC', count: 8 }] },
      { spawn: 's1', groups: [{ type: 'SPINNER', count: 10 }] },
      { spawn: 's2', concurrent: true, groups: [{ type: 'CHOMPER', count: 8 }] },
      { spawn: 's1', groups: [{ type: 'PULSAR', count: 6 }] },
      { spawn: 's2', groups: [{ type: 'CUBIC', count: 6 }, { type: 'SPINNER', count: 6 }] },
      { spawn: 's1', concurrent: true, groups: [{ type: 'CHOMPER', count: 10 }] },
      { spawn: 's2', groups: [{ type: 'PULSAR', count: 8 }] },
      { spawn: 's1', groups: [{ type: 'CUBIC', count: 8 }, { type: 'SPINNER', count: 8 }] },
      { spawn: 's2', groups: [{ type: 'CHOMPER', count: 6 }, { type: 'PULSAR', count: 8 }] }
    ],
    towers: towerTiers.redteam
  },
  {
    file: 'GAME_LEVEL_LHC_H_0003.xml', id: 110, name: 'Rootkit', cash: 64, lives: 10,
    description: 'A swarm burrows below the detection layer, immune to shock sweeps. Grind it out with raw firepower.',
    hints: ['Shock towers cannot see swarm creeps — lean on blasters, lasers and missiles.', 'The buried maze is tight; place your first towers where they matter most.'],
    exits: [{ name: 'e1', hex: [13, 7] }],
    spawns: [{ name: 's1', hex: [0, 7], exit: 'e1' }, { name: 's2', hex: [6, 0], exit: 'e1' }, { name: 's3', hex: [6, 14], exit: 'e1' }],
    blocked: cells(colRun(3, 2, 5), colRun(3, 9, 12), colRun(6, 4, 10), colRun(9, 2, 5), colRun(9, 9, 12), rect(11, 11, 6, 8)),
    creeps: { waveHealthFactor: 2.0, list: [{ type: 'SWARM', speed: 34, health: 40 }, { type: 'CHOMPER', speed: 26, health: 88 }, { type: 'CUBIC', speed: 30, health: 80 }] },
    delayBetweenWaves: 15, delayBetweenSpawns: 0.6,
    waves: [
      { spawn: 's1', groups: [{ type: 'SWARM', count: 10 }] },
      { spawn: 's2', groups: [{ type: 'CHOMPER', count: 8 }] },
      { spawn: 's3', groups: [{ type: 'SWARM', count: 10 }] },
      { spawn: 's1', concurrent: true, groups: [{ type: 'CUBIC', count: 8 }] },
      { spawn: 's2', groups: [{ type: 'SWARM', count: 12 }] },
      { spawn: 's3', concurrent: true, groups: [{ type: 'CHOMPER', count: 8 }] },
      { spawn: 's1', groups: [{ type: 'SWARM', count: 14 }] },
      { spawn: 's2', concurrent: true, groups: [{ type: 'CUBIC', count: 8 }] },
      { spawn: 's3', groups: [{ type: 'SWARM', count: 12 }, { type: 'CHOMPER', count: 6 }] },
      { spawn: 's1', groups: [{ type: 'SWARM', count: 16 }] }
    ],
    towers: towerTiers.redteam
  },
  {
    file: 'GAME_LEVEL_LHC_H_0004.xml', id: 111, name: 'Kernel Panic', cash: 70, lives: 10,
    description: 'Everything hits at once — a full-spectrum breach on ring zero. Hold the line or watch it all come down.',
    hints: ['Six vectors, concurrent waves — you need overlapping fields of fire.', 'Save credits for vortex and thump; the final surge is merciless.'],
    exits: [{ name: 'e1', hex: [6, 7] }, { name: 'e2', hex: [7, 7] }],
    spawns: [
      { name: 's1', hex: [0, 3], exit: 'e1' }, { name: 's2', hex: [0, 11], exit: 'e1' },
      { name: 's3', hex: [13, 3], exit: 'e2' }, { name: 's4', hex: [13, 11], exit: 'e2' },
      { name: 's5', hex: [6, 0], exit: 'e1' }, { name: 's6', hex: [7, 14], exit: 'e2' }
    ],
    blocked: cells(rect(3, 5, 3, 5), rect(8, 10, 3, 5), rect(3, 5, 9, 11), rect(8, 10, 9, 11)),
    creeps: { waveHealthFactor: 2.1, waveHealthFactor2: 0.03, list: [{ type: 'CHOMPER', speed: 28, health: 90 }, { type: 'SPINNER', speed: 38, health: 74 }, { type: 'STAR', speed: 48, health: 60 }, { type: 'PULSAR', speed: 42, health: 78 }, { type: 'SWARM', speed: 34, health: 46 }, { type: 'CUBIC', speed: 32, health: 84 }] },
    delayBetweenWaves: 14, delayBetweenSpawns: 0.55,
    waves: [
      { spawn: 's1', concurrent: true, groups: [{ type: 'CHOMPER', count: 6 }] },
      { spawn: 's3', groups: [{ type: 'CHOMPER', count: 6 }] },
      { spawn: 's2', concurrent: true, groups: [{ type: 'SPINNER', count: 6 }] },
      { spawn: 's4', groups: [{ type: 'SPINNER', count: 6 }] },
      { spawn: 's5', concurrent: true, groups: [{ type: 'STAR', count: 8 }] },
      { spawn: 's6', groups: [{ type: 'STAR', count: 8 }] },
      { spawn: 's1', concurrent: true, groups: [{ type: 'PULSAR', count: 6 }] },
      { spawn: 's3', concurrent: true, groups: [{ type: 'PULSAR', count: 6 }] },
      { spawn: 's5', groups: [{ type: 'SWARM', count: 12 }] },
      { spawn: 's2', concurrent: true, groups: [{ type: 'CUBIC', count: 8 }] },
      { spawn: 's4', concurrent: true, groups: [{ type: 'CUBIC', count: 8 }] },
      { spawn: 's6', groups: [{ type: 'SWARM', count: 12 }] },
      { spawn: 's1', concurrent: true, groups: [{ type: 'PULSAR', count: 6 }] },
      { spawn: 's2', concurrent: true, groups: [{ type: 'STAR', count: 8 }] },
      { spawn: 's3', concurrent: true, groups: [{ type: 'CHOMPER', count: 8 }] },
      { spawn: 's4', concurrent: true, groups: [{ type: 'SPINNER', count: 8 }] },
      { spawn: 's5', concurrent: true, groups: [{ type: 'SWARM', count: 10 }] },
      { spawn: 's6', groups: [{ type: 'CUBIC', count: 6 }, { type: 'PULSAR', count: 6 }, { type: 'STAR', count: 6 }] }
    ],
    towers: towerTiers.redteam
  }
];

// --- Validate every level through the real engine, then emit ------------------
function validate(spec, xml) {
  const level = parseLevel(xml, `LHC/${spec.file}`, null, 'lhc');
  const problems = [];
  const blockedKeys = level.blocked; // exact Set the engine walks
  for (const s of level.spawns) {
    if (blockedKeys.has(cellKey(...s.cell))) problems.push(`spawn ${s.name} ${cellKey(...s.cell)} is blocked`);
    if (blockedKeys.has(cellKey(...s.exit))) problems.push(`exit for ${s.name} ${cellKey(...s.exit)} is blocked`);
    const path = findPath(s.cell, s.exit, blockedKeys);
    if (!path) problems.push(`no route ${s.name} ${cellKey(...s.cell)} -> ${cellKey(...s.exit)}`);
    else if (path.length < 6) problems.push(`route ${s.name} suspiciously short (${path.length} hexes)`);
  }
  // Sanity: every wave references a real spawn and a known creep type.
  const spawnNames = new Set(level.spawns.map(s => s.name));
  const creepTypes = new Set(Object.keys(level.creeps));
  for (const [i, w] of level.waves.entries()) {
    if (!spawnNames.has(w.spawnName)) problems.push(`wave ${i + 1} spawnHex "${w.spawnName}" not defined`);
    for (const g of w.groups) if (!creepTypes.has(g.type)) problems.push(`wave ${i + 1} creep "${g.type}" not in <creeps>`);
  }
  return { level, problems };
}

async function main() {
  const entries = [];
  let ok = true;
  for (const spec of specs) {
    const xml = levelXml(spec);
    const { level, problems } = validate(spec, xml);
    const routes = level.spawns.map(s => (findPath(s.cell, s.exit, level.blocked)?.length ?? 0)).join('/');
    if (problems.length) { ok = false; console.error(`✗ ${spec.file} (${spec.name}):`); for (const p of problems) console.error(`    - ${p}`); }
    else console.log(`✓ ${spec.file.padEnd(28)} ${spec.name.padEnd(22)} ${level.difficulty.padEnd(6)} routes=${routes} waves=${level.waves.length}`);
    entries.push({ sourceName: `LHC/${spec.file}`, xml });
  }
  if (!ok) { console.error('\nValidation failed — not writing src/lhc-levels.js.'); process.exit(1); }

  const header = '// GENERATED by scripts/build-lhc-pack.mjs — do not edit by hand.\n// Regenerate with: node scripts/build-lhc-pack.mjs\n//\n// Original security-themed fan campaign ("LHC // Breach Grid"). Ships as its own\n// `lhc` campaign; not derived from any geoDefense archive.\n';
  const body = entries.map(e => '  ' + JSON.stringify(e)).join(',\n');
  await writeFile(join(root, 'src', 'lhc-levels.js'), `${header}export const entries = [\n${body}\n];\n`);
  console.log(`\nWrote src/lhc-levels.js — ${entries.length} missions.`);
}

main().catch(err => { console.error(err); process.exit(1); });
