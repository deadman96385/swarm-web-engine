import test from 'node:test';
import assert from 'node:assert/strict';
import { ProfileStore } from '../src/profile.js';
class MemoryStorage{constructor(){this.values=new Map();}getItem(k){return this.values.get(k)??null;}setItem(k,v){this.values.set(k,v);}}
const level=(n,difficulty='Easy')=>({sourceName:`level-${difficulty}-${n}`,name:`Mission ${n}`,difficulty,lives:10,endless:false});
const result=(score,lives=10,extra={})=>({won:true,score,lives,gotX50:false,placedTypes:[],fullyUpgraded:[],...extra});
test('local profile preserves native high-score and perfect-run semantics',()=>{const storage=new MemoryStorage(),profile=new ProfileStore(storage),mission=level(1);profile.record(mission,result(100,10));assert.equal(profile.highScore(mission).livesLost,0);profile.record(mission,result(200,5));assert.equal(profile.highScore(mission).score,200);assert.equal(profile.highScore(mission).livesLost,0);profile.record(mission,result(50,10));assert.equal(profile.highScore(mission).score,200);assert.ok(profile.data.achievements.includes('E1'));assert.equal(new ProfileStore(storage).highScore(mission).score,200);});
test('achievement qualification matches difficulty, tower, close-call, and toolbox rules',()=>{const profile=new ProfileStore(new MemoryStorage());for(let i=1;i<=9;i++)profile.record(level(i),result(i*100,10));profile.record(level(10),result(1000,10,{gotX50:true,fullyUpgraded:['BLASTER','LASER','MISSILE','SHOCK','POP'],placedTypes:['BLASTER','LASER','MISSILE','SHOCK','THUMP']}));const earned=new Set(profile.data.achievements);for(const code of ['E1','E2','E3','CC','LB','LL','LM','LS','LV','TH'])assert.ok(earned.has(code),code);});
test('classic campaign scores stay out of the Swarm difficulty achievements',()=>{
  const profile=new ProfileStore(new MemoryStorage());
  for(let i=1;i<=9;i++)profile.record({sourceName:`classic-E-${i}`,name:`C${i}`,difficulty:'Easy',campaign:'classic',lives:10,endless:false},result(i*100,10));
  const earned=new Set(profile.data.achievements);
  assert.ok(!earned.has('E1'));assert.ok(!earned.has('E2'));assert.ok(!earned.has('E3'));
  profile.record({sourceName:'classic-H-1',name:'CH',difficulty:'Hard',campaign:'classic',lives:10,endless:false},result(500,10,{gotX50:true,fullyUpgraded:['POP'],placedTypes:['BLASTER','LASER','MISSILE','SHOCK','POP']}));
  const earned2=new Set(profile.data.achievements);
  assert.ok(earned2.has('CC'));assert.ok(earned2.has('LV'));assert.ok(earned2.has('TH'));
  profile.record({sourceName:'swarm-E-1',name:'S1',difficulty:'Easy',campaign:'swarm',lives:10,endless:false},result(100,10));
  assert.ok(new Set(profile.data.achievements).has('E1'));
});
test('procedural scores persist per seed without farming authored difficulty achievements',()=>{
  const profile=new ProfileStore(new MemoryStorage());
  for(let i=1;i<=9;i++)profile.record({sourceName:`Procedural/v1/GAME_LEVEL_PROC_E_NORMAL_${i.toString(16).padStart(8,'0')}.xml`,name:`Seed ${i}`,difficulty:'Easy',campaign:'procedural',lives:10,endless:false},result(i*100,10));
  const earned=new Set(profile.data.achievements);
  assert.ok(!earned.has('E1'));assert.ok(!earned.has('E2'));assert.ok(!earned.has('E3'));
  assert.equal(profile.leaderboard().length,9);
  assert.equal(profile.highScore({sourceName:'Procedural/v1/GAME_LEVEL_PROC_E_NORMAL_00000009.xml'}).score,900);
  profile.record({sourceName:'Procedural/v1/GAME_LEVEL_PROC_H_RANDOM_FFFFFFFF.xml',name:'Toolbox Seed',difficulty:'Hard',campaign:'procedural',lives:10,endless:false},result(1200,10,{gotX50:true,fullyUpgraded:['BLASTER'],placedTypes:['BLASTER','LASER','MISSILE','SHOCK','THUMP']}));
  const earned2=new Set(profile.data.achievements);assert.ok(earned2.has('CC'));assert.ok(earned2.has('LB'));assert.ok(earned2.has('TH'));
});
