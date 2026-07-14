import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomParser } from './support/xml-dom.mjs';
installDomParser();
import { parseLevel, findPath, cellKey } from '../src/core.js';
import { buildLevels, classifyName } from '../src/level-index.js';
import { entries } from '../src/lhc-levels.js';

const TOWER_TYPES = new Set(['BLASTER', 'LASER', 'MISSILE', 'SHOCK', 'THUMP', 'POP']);
const CREEP_TYPES = new Set(['CHOMPER', 'CUBIC', 'PULSAR', 'SPINNER', 'STAR', 'SWARM', 'WIGGLE']);

test('every LHC source name classifies as the lhc campaign', () => {
  assert.ok(entries.length === 12, `expected 12 LHC missions, got ${entries.length}`);
  for (const { sourceName } of entries) assert.equal(classifyName(sourceName), 'lhc', sourceName);
});

test('buildLevels groups the pack into 4 Easy / 4 Medium / 4 Hard', () => {
  const pack = buildLevels(entries, parseLevel);
  assert.equal(pack.length, 12);
  assert.ok(pack.every(l => l.campaign === 'lhc'));
  for (const d of ['Easy', 'Medium', 'Hard']) assert.equal(pack.filter(l => l.difficulty === d).length, 4, `${d} count`);
});

test('every LHC mission has a real spawn->exit route and valid content', () => {
  for (const { sourceName, xml } of entries) {
    const l = parseLevel(xml, sourceName, null, 'lhc');
    assert.ok(l.name && l.description, `${sourceName} has name + description`);
    assert.ok(l.spawns.length > 0 && l.waves.length > 0 && l.towers.length > 0, `${sourceName} is populated`);
    for (const s of l.spawns) {
      assert.ok(!l.blocked.has(cellKey(...s.cell)), `${sourceName} spawn ${s.name} not walled in`);
      const path = findPath(s.cell, s.exit, l.blocked);
      assert.ok(path && path.length > 1, `${sourceName} spawn ${s.name} can reach its exit`);
    }
    const spawnNames = new Set(l.spawns.map(s => s.name));
    for (const t of l.towers) assert.ok(TOWER_TYPES.has(t.type), `${sourceName} tower ${t.type} valid`);
    for (const [i, w] of l.waves.entries()) {
      assert.ok(spawnNames.has(w.spawnName), `${sourceName} wave ${i + 1} targets a defined spawn`);
      for (const g of w.groups) {
        assert.ok(CREEP_TYPES.has(g.type), `${sourceName} wave ${i + 1} creep ${g.type} valid`);
        assert.ok(l.creeps[g.type], `${sourceName} wave ${i + 1} creep ${g.type} declared in <creeps>`);
      }
    }
  }
});
