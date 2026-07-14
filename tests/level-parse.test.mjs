import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { installDomParser } from './support/xml-dom.mjs';
installDomParser();
import { parseLevel } from '../src/core.js';
import { buildLevels } from '../src/level-index.js';

const haveBundle = existsSync(new URL('../src/bundled-levels.js', import.meta.url));

test('parseLevel reads the documented level schema', () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?><level><info name="Test Swarm" id="7" initCash="200" initLives="15" description="line&#13;two" Tutorial="T1"/><creeps waveHealthFactor="1.25"><creep type="CHOMPER" speed="30" health="50"/></creeps><creepWaves delayBetweenWaves="20" delayBetweenSpawns="1"><wave spawnHex="A"><spawn type="CHOMPER" count="5"/></wave></creepWaves><spawnhex name="A" hex="0,7" exit="X"/><exithex name="X" hex="13,7"/><specialhex type="blocked" hex="1,1"/><placetower type="POP" hex="2,2"/><towers><tower type="BLASTER" cost="5"/></towers></level>`;
  const l = parseLevel(xml, 'Content/MainLevels/GAME_LEVEL_E_0007.xml');
  assert.equal(l.name, 'Test Swarm');
  assert.equal(l.id, 7);
  assert.equal(l.cash, 200);
  assert.equal(l.lives, 15);
  assert.equal(l.difficulty, 'Easy');
  assert.equal(l.tutorial, 't1');
  assert.equal(l.description, 'line two'); // \r decoded then replaced with space
  assert.equal(l.waves.length, 1);
  assert.equal(l.waves[0].groups[0].type, 'CHOMPER');
  assert.equal(l.waves[0].groups[0].count, 5);
  assert.equal(l.towers[0].type, 'BLASTER');
  assert.equal(l.towers[0].cost, 5);
  assert.equal(l.creeps.CHOMPER.health, 50);
  assert.ok(l.blocked.has('1,1'));
  assert.equal(l.placed[0].type, 'POP');
});

test('parseLevel detects fixed-path (classic) levels', () => {
  const xml = `<level><info name="Path" id="1" initCash="100" initLives="10"/><creepPath><point x="10" y="20"/><point x="200" y="300"/></creepPath><creeps><creep type="CHOMPER" speed="30" health="40"/></creeps><creepWaves><wave><spawn type="CHOMPER" count="3"/></wave></creepWaves><towers><tower type="POP" cost="10"/></towers></level>`;
  const l = parseLevel(xml, 'GAME_LEVEL_E_0001.xml', null, 'classic');
  assert.equal(l.campaign, 'classic');
  assert.equal(l.pathMode, true);
  assert.equal(l.path.length, 2);
  assert.ok(l.exitPoint);
});

test('bundled levels parse into the expected campaigns', { skip: haveBundle ? false : 'src/bundled-levels.js not generated (run npm run extract-data)' }, async () => {
  const { entries } = await import('../src/bundled-levels.js');
  assert.ok(entries.length >= 30, `expected >=30 bundled entries, got ${entries.length}`);
  const levels = buildLevels(entries, parseLevel);
  const base = levels.filter(l => l.campaign === 'swarm' && l.difficulty !== 'Bonus');
  assert.equal(base.length, 30, 'exactly 30 base missions');
  const beginner = levels.find(l => l.name === 'Beginner Swarm');
  assert.ok(beginner, 'Beginner Swarm mission present');
  assert.equal(beginner.difficulty, 'Easy');
  assert.ok(beginner.waves.length > 0 && beginner.towers.length > 0);
  const classic = levels.filter(l => l.campaign === 'classic');
  assert.ok(classic.length > 0 && classic.every(l => l.pathMode && l.path.length > 1), 'classic levels are fixed-path');
  assert.ok(levels.some(l => l.difficulty === 'Bonus'), 'Level Pack 1 bonus levels present');
});
