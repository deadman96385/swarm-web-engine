import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomParser } from './support/xml-dom.mjs';
installDomParser();

import { cellKey, findPath, parseLevel } from '../src/core.js';
import { buildLevels, classifyName, parseProceduralIdentity } from '../src/level-index.js';
import {
  entryFromProceduralSourceName,
  generateProceduralEntry,
  normalizeProceduralSeed,
  normalizeProceduralState,
  PROCEDURAL_CONFIG,
  PROCEDURAL_DIFFICULTIES,
  PROCEDURAL_ECONOMIES,
  validateProceduralLevel
} from '../src/procedural-levels.js';

const seedAt = index => (Math.imul(index + 1, 0x9e3779b1) >>> 0).toString(16).padStart(8, '0').toUpperCase();
const parsed = options => buildLevels([generateProceduralEntry(options)], parseLevel)[0];

test('procedural generation is deterministic and its source name is replayable', () => {
  const options = { seed: '12AB34CD', difficulty: 'Medium', economyMode: 'random' };
  const first = generateProceduralEntry(options), second = generateProceduralEntry(options);
  assert.deepEqual(first, second);
  assert.equal(classifyName(first.sourceName), 'procedural');
  assert.deepEqual(entryFromProceduralSourceName(first.sourceName), first);
  assert.deepEqual(parseProceduralIdentity(first.sourceName), { version: 1, difficulty: 'Medium', economyMode: 'random', seed: '12AB34CD' });
  assert.match(parsed(options).name, /^[A-Z][a-z]+ [A-Z][a-z]+$/);
  assert.doesNotMatch(parsed(options).name, /12AB34CD|Generated Swarm/);
  assert.notEqual(generateProceduralEntry({ ...options, seed: '12AB34CE' }).xml, first.xml);
});

test('seed input and stored four-card sets normalize safely', () => {
  assert.equal(normalizeProceduralSeed(' ab12cd34 '), 'AB12CD34');
  assert.throws(() => normalizeProceduralSeed('not-a-seed'), /eight hexadecimal/i);
  let next = 0;
  const state = normalizeProceduralState({ version: 1, economyMode: 'random', sets: { random: { Easy: ['AAAAAAAA', 'AAAAAAAA', 'bad'] } } }, () => (++next).toString(16).padStart(8, '0'));
  assert.equal(state.economyMode, 'random');
  for (const mode of PROCEDURAL_ECONOMIES) for (const difficulty of PROCEDURAL_DIFFICULTIES) {
    assert.equal(state.sets[mode][difficulty].length, 4);
    assert.equal(new Set(state.sets[mode][difficulty]).size, 4);
    assert.ok(state.sets[mode][difficulty].every(seed => /^[0-9A-F]{8}$/.test(seed)));
  }
  assert.equal(state.sets.random.Easy[0], 'AAAAAAAA');
});

test('Normal Economy uses the documented fixed cash, lives, prices, and wealth', () => {
  const expected = {
    Easy: { cash: 40, lives: 15 },
    Medium: { cash: 55, lives: 12 },
    Hard: { cash: 65, lives: 10 }
  }, prices = { BLASTER: 6, LASER: 10, MISSILE: 15, SHOCK: 12, THUMP: 14 };
  for (const difficulty of PROCEDURAL_DIFFICULTIES) {
    const level = parsed({ seed: 'A0B0C0D0', difficulty, economyMode: 'normal' });
    assert.equal(level.cash, expected[difficulty].cash);
    assert.equal(level.lives, expected[difficulty].lives);
    assert.equal(level.waveWealthFactor, 1);
    for (const tower of level.towers) assert.equal(tower.cost, prices[tower.type]);
  }
});

test('a broad deterministic seed corpus always produces valid, guardrailed levels', () => {
  for (const difficulty of PROCEDURAL_DIFFICULTIES) for (const economyMode of PROCEDURAL_ECONOMIES) {
    const config = PROCEDURAL_CONFIG[difficulty];
    for (let index = 0; index < 100; index++) {
      const seed = seedAt(index), level = parsed({ seed, difficulty, economyMode });
      assert.equal(level.campaign, 'procedural');
      assert.equal(level.procedural.seed, seed);
      assert.equal(level.procedural.economyMode, economyMode);
      assert.deepEqual(validateProceduralLevel(level), [], `${difficulty}/${economyMode}/${seed}`);
      assert.ok(level.spawns.length >= config.spawns[0] && level.spawns.length <= config.spawns[1]);
      assert.ok(level.exits.size >= config.exits[0] && level.exits.size <= config.exits[1]);
      const interiorBlocked = [...level.blocked].filter(key => { const [q, r] = key.split(',').map(Number); return q > 0 && q < 13 && r > 0 && r < 14; }).length;
      assert.ok(interiorBlocked >= config.blocked[0] && interiorBlocked <= config.blocked[1]);
      assert.ok(level.pass.size >= config.terrain[0] && level.pass.size <= config.terrain[1]);
      assert.ok(Object.keys(level.creeps).length >= config.roster[0] && Object.keys(level.creeps).length <= config.roster[1]);
      assert.ok(level.apparentWaves >= config.waves[0] && level.apparentWaves <= config.waves[1]);
      assert.ok(level.towers.length >= config.towers[0] && level.towers.length <= config.towers[1]);
      for (const spawn of level.spawns) {
        const route = findPath(spawn.cell, spawn.exit, level.blocked);
        assert.ok(route?.length >= 8);
        assert.ok(!level.blocked.has(cellKey(...spawn.cell)) && !level.blocked.has(cellKey(...spawn.exit)));
      }
      if (economyMode === 'random') {
        assert.ok(level.cash >= config.random.cash[0] && level.cash <= config.random.cash[1]);
        assert.ok(level.lives >= config.random.lives[0] && level.lives <= config.random.lives[1]);
        assert.ok(level.waveWealthFactor >= config.random.wealth[0] && level.waveWealthFactor <= config.random.wealth[1]);
      }
    }
  }
});
