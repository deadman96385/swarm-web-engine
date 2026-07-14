import test from 'node:test';
import assert from 'node:assert/strict';
import { installDomParser } from './support/xml-dom.mjs';
installDomParser();
import { cellKey, findPath, parseLevel } from '../src/core.js';
import { buildLevels, classifyName } from '../src/level-index.js';
import { entries } from '../src/xl-levels.js';

test('Swarm XL ships twelve classified missions in a 4/4/4 split',()=>{
  assert.equal(entries.length,12);for(const entry of entries)assert.equal(classifyName(entry.sourceName),'xl');const levels=buildLevels(entries,parseLevel);for(const difficulty of ['Easy','Medium','Hard'])assert.equal(levels.filter(level=>level.difficulty===difficulty).length,4);assert.ok(levels.every(level=>level.campaign==='xl'&&level.xl&&level.grid.cols===22&&level.grid.rows===24));
});

test('every curated XL lane, wave, and opening economy is valid',()=>{
  const floors={Easy:8,Medium:11,Hard:14};for(const level of buildLevels(entries,parseLevel)){const spawnNames=new Set(level.spawns.map(spawn=>spawn.name)),types=new Set(Object.keys(level.creeps)),assigned=new Set(level.spawns.map(spawn=>spawn.exitName));for(const name of level.exits.keys())assert.ok(assigned.has(name),`${level.name}/${name}`);for(const spawn of level.spawns){assert.ok(findPath(spawn.cell,spawn.exit,level.blocked,level.grid)?.length>1,`${level.name}/${spawn.name}`);assert.ok(!level.blocked.has(cellKey(...spawn.cell)));}for(const wave of level.waves){assert.ok(spawnNames.has(wave.spawnName));for(const group of wave.groups)assert.ok(types.has(group.type));}const cheapest=Math.min(...level.towers.filter(t=>t.type!=='POP').map(t=>t.cost));assert.ok(level.cash>=cheapest*floors[level.difficulty]);if(level.name!=='Beginner Swarm XL')assert.ok(level.waves.length>level.apparentWaves);}
});
