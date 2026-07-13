import test from 'node:test';
import assert from 'node:assert/strict';
import { cellKey, creepHealth, creepSpeed, findPath, hexCenter, killCash, neighbors, pixelToHex, towerRange, upgradeCost } from '../src/core.js';

test('hex coordinate round-trip covers the full game board',()=>{for(let q=0;q<14;q++)for(let r=0;r<15;r++){const p=hexCenter(q,r);assert.deepEqual(pixelToHex(p.x,p.y),[q,r]);}});
test('neighbors are reciprocal',()=>{for(let q=1;q<13;q++)for(let r=1;r<14;r++)for(const n of neighbors(q,r))assert(neighbors(...n).some(v=>cellKey(...v)===cellKey(q,r)));});
test('pathfinder routes around towers and rejects a sealed lane',()=>{const open=findPath([0,1],[2,1],new Set(),3,3);assert.ok(open);assert.equal(cellKey(...open[0]),'0,1');assert.equal(cellKey(...open.at(-1)),'2,1');const wall=new Set(['1,0','1,1','1,2']);assert.equal(findPath([0,1],[2,1],wall,3,3),null);});

test('WP7 Mango open-list sorting preserves native equal-depth route ties',()=>{const blocked=new Set(['0,0','0,4','1,2','2,2','3,2','3,3','3,4','4,0','5,1']);assert.deepEqual(findPath([0,2],[5,3],blocked,6,6),[[0,2],[1,3],[1,4],[2,4],[3,5],[4,4],[5,4],[5,3]]);});
test('recovered native progression formulas retain integer truncation',()=>{assert.equal(upgradeCost(5,1),2);assert.equal(upgradeCost(5,3),7);assert.equal(creepHealth(70,1,1.7),52);assert.equal(creepHealth(70,2,1.7),105);assert.equal(creepHealth(40,4,2,.1),60);assert.equal(creepSpeed(40,3,1.25),60);assert.equal(killCash(5,.25),2);assert.equal(towerRange('BLASTER',7),225);assert.equal(towerRange('POP',3),130);});
