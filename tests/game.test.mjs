import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { TOWER_STATS, hexCenter } from '../src/core.js';
import { DynamicBackdrop } from '../src/dynamic-backdrop.js';

const noOp=()=>{};
function canvasStub(){return {getContext:()=>({}),addEventListener:noOp,removeEventListener:noOp,getBoundingClientRect:()=>({left:0,top:0,width:480,height:800})};}
function testLevel(){return {
  cash:20,lives:1,blocked:new Set(Array.from({length:14},(_,q)=>`${q},1`)),pass:new Set(),fast:new Set(),heal:new Set(),placed:[],endless:false,
  towers:[{type:'BLASTER',cost:5}],spawns:[{name:'s1',cell:[0,0],exit:[2,0]}],exits:new Map([['e1',[2,0]]]),
  creeps:{CHOMPER:{speed:100,health:10}},waveHealthFactor:1,waveHealthFactor2:0,waveSpeedFactor:1,waveWealthFactor:1,delayBetweenSpawns:.01,delayBetweenWaves:20,
  waves:[{spawnName:'s1',groups:[{type:'CHOMPER',count:1}]}]
};}

test('game economy accepts safe builds and rejects route-blocking builds',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;
  const game=new Game(canvasStub(),testLevel(),{});
  assert.equal(game.addTower('BLASTER',[5,0]),true);
  assert.equal(game.cash,20);
  assert.equal(game.addTower('BLASTER',[1,0]),false);
  assert.equal(game.cash,20);
  game.destroy();
});

test('a creep follows its route, consumes a life, and ends the mission',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;
  let result=null;const game=new Game(canvasStub(),testLevel(),{}, {end:won=>result=won});
  game.startWave(true);
  for(let i=0;i<100&&!game.ended;i++)game.update(.05);
  assert.equal(game.lives,0);
  assert.equal(result,false);
  game.destroy();
});

test('creeps recompute their native next destination at every reached hex',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const level=testLevel();level.blocked=new Set(['0,0','0,4','1,2','2,2','3,2','3,3','3,4','4,0','5,1']);const game=new Game(canvasStub(),level,{}),start=hexCenter(0,2),first=hexCenter(1,3);game.creeps=[{type:'CHOMPER',pathCells:[[0,2],[1,3],[5,3]],path:[start,first,hexCenter(5,3)],pathIndex:1,distanceTraveled:0,x:start.x,y:start.y,speed:100,currentSpeed:100,health:100,maxHealth:100,wave:1,exit:[5,3],dead:false,rotation:0,visualScale:.375,rotationSpeed:0}];game.update(.29);assert.deepEqual(game.creeps[0].pathCells,[[1,3],[1,4]]);assert.equal(game.creeps[0].pathIndex,1);game.destroy();
});

test('upgrades take native time, contribute to resale value, and can be sold',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;
  const game=new Game(canvasStub(),testLevel(),{});game.addTower('BLASTER',[5,0]);
  game.selectedTower=game.towers.get('5,0');game.selectedTower.cooldown=1;game.upgrade();
  assert.equal(game.cash,18);assert.equal(game.selectedTower.level,1);assert.equal(game.selectedTower.upgradeRemaining,1);
  game.update(1.01);assert.equal(game.selectedTower.level,2);assert.equal(game.selectedTower.value,7);assert.equal(game.selectedTower.cooldown,0);
  game.sell();assert.equal(game.cash,21);assert.equal(game.towers.size,0);game.destroy();
});

test('automatic wave timing permits later waves while earlier creeps remain alive',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;
  const level=testLevel();level.delayBetweenWaves=.1;level.waves=[...level.waves,...level.waves];
  const game=new Game(canvasStub(),level,{});game.update(.11);assert.equal(game.waveIndex,1);assert.equal(game.creeps.length,1);
  game.update(.11);assert.equal(game.waveIndex,2);assert.equal(game.creeps.length,2);game.destroy();
});

test('SpawnManager runs after combat so fresh creeps wait one frame before moving or targeting',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const game=new Game(canvasStub(),testLevel(),{});game.nextWaveTimer=0;game.update(.1);assert.equal(game.creeps.length,1);assert.equal(game.creeps[0].distanceTraveled,0);assert.deepEqual({x:game.creeps[0].x,y:game.creeps[0].y},{x:0,y:0});assert.equal(game.creeps[0].placed,false);game.update(.1);assert.equal(game.creeps[0].placed,true);assert.ok(game.creeps[0].distanceTraveled>0);game.destroy();
});

test('concurrent authored entries retain one apparent wave number and scaling',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const level=testLevel();level.delayBetweenWaves=.1;level.waves=[level.waves[0],{...level.waves[0],concurrent:true}];const game=new Game(canvasStub(),level,{});game.update(.11);assert.equal(game.apparentWave,1);assert.equal(game.waveIndex,1);game.update(.11);assert.equal(game.apparentWave,1);assert.equal(game.waveIndex,2);assert.equal(game.creeps[0].maxHealth,game.creeps[1].maxHealth);game.destroy();
});

test('fast-pass terrain doubles movement without becoming buildable',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;
  const normal=new Game(canvasStub(),testLevel(),{});normal.startWave(true);normal.update(0);normal.update(.1);const normalX=normal.creeps[0].x;normal.destroy();
  const level=testLevel();level.fast.add('0,0');level.pass.add('0,0');const fast=new Game(canvasStub(),level,{});fast.startWave(true);fast.update(0);fast.update(.1);
  assert.ok(fast.creeps[0].x-normalX>8);assert.equal(fast.addTower('BLASTER',[0,0]),false);fast.destroy();
});

test('endless missions cycle their authored wave bank instead of declaring victory',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;
  const level=testLevel();level.endless=true;level.delayBetweenWaves=.05;const game=new Game(canvasStub(),level,{});
  game.update(.06);assert.equal(game.waveIndex,1);assert.equal(game.ended,false);game.update(.06);assert.equal(game.waveIndex,2);assert.equal(game.ended,false);game.destroy();
});

test('Vortex towers remain preplaced-only in Swarm missions',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;
  const level=testLevel();level.towers.push({type:'POP',cost:20});level.placed=[{type:'POP',cell:[5,0]}];const game=new Game(canvasStub(),level,{});
  assert.equal(game.towers.get('5,0').type,'POP');assert.equal(game.addTower('POP',[6,0]),false);game.destroy();
});

test('Laser heading lock starts at tier 3 and Laser fire heals Swarm creeps',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;
  const level=testLevel();level.towers.push({type:'LASER',cost:10});level.creeps.SWARM={speed:30,health:20};level.waves=[{spawnName:'s1',groups:[{type:'SWARM',count:1}]}];
  const game=new Game(canvasStub(),level,{});game.addTower('LASER',[3,0]);const laser=game.towers.get('3,0');game.selectedTower=laser;
  assert.equal(game.toggleLaserLock(),false);laser.level=3;assert.equal(game.toggleLaserLock(),true);assert.equal(laser.lockedHeading,true);game.toggleLaserLock();
  game.startWave(true);game.update(0);const swarm=game.creeps[0];swarm.health=5;game.update(0);game.updateTower(laser,1);game.updateProjectiles(0);assert.equal(swarm.health,swarm.maxHealth);game.destroy();
});

test('a complete live match round-trips through the browser save format',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;
  const level=testLevel();level.towers.push({type:'POP',cost:20});level.placed=[{type:'POP',cell:[5,0]}];level.waves[0].groups[0].count=3;
  const first=new Game(canvasStub(),level,{});first.addTower('BLASTER',[3,0]);first.towers.get('3,0').link=first.towers.get('5,0');first.startWave(true);first.update(.2);
  const saved=JSON.parse(JSON.stringify(first.snapshot()));first.destroy();const resumed=new Game(canvasStub(),level,{}, {},saved);
  assert.equal(resumed.cash,first.cash);assert.equal(resumed.waveIndex,1);assert.equal(resumed.creeps.length,first.creeps.length);assert.equal(resumed.sequences[0].items.length,first.sequences[0].items.length);assert.equal(resumed.towers.get('3,0').link,resumed.towers.get('5,0'));resumed.destroy();
});

test('Hardcore mode uses native cash and health without assist multipliers',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;
  const level=testLevel(),normal=new Game(canvasStub(),level,{});normal.startWave(true);normal.update(0);assert.equal(normal.cash,25);assert.equal(normal.creeps[0].maxHealth,7);normal.destroy();
  const hardcore=new Game(canvasStub(),level,{}, {},null,{hardcore:true});hardcore.startWave(true);hardcore.update(0);assert.equal(hardcore.cash,20);assert.equal(hardcore.creeps[0].maxHealth,10);hardcore.destroy();
});

test('manual wave advance unlocks at the native 25 percent threshold',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const game=new Game(canvasStub(),testLevel(),{});
  assert.equal(game.startWave(),false);assert.equal(game.waveIndex,0);game.update(5.01);assert.equal(game.startWave(),true);assert.equal(game.waveIndex,0);game.update(0);assert.equal(game.waveIndex,1);game.destroy();
});

test('drag-preview placement uses the same route and economy validation',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const game=new Game(canvasStub(),testLevel(),{});
  const p=hexCenter(5,0);game.setBuildPreview('BLASTER',p.x,p.y);assert.equal(game.buildPreview.ok,true);assert.equal(game.commitBuildPreview(),true);assert.ok(game.towers.has('5,0'));game.destroy();
});

test('Blaster and Missile shots resolve through native travel and impact timing',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const game=new Game(canvasStub(),testLevel(),{});
  const target={x:80,y:70,health:200,maxHealth:200,dead:false,type:'CHOMPER'};game.creeps=[target];game.projectiles=[{type:'BLASTER',x:44,y:70,heading:0,target:null,level:1,damage:10,velocity:300,life:5}];
  game.updateProjectiles(.05);assert.equal(target.health,200);game.updateProjectiles(.05);assert.equal(target.health,190);assert.equal(game.projectiles.length,0);
  const near={x:60,y:70,health:300,maxHealth:300,dead:false,type:'CHOMPER'},splash={x:80,y:70,health:300,maxHealth:300,dead:false,type:'CHOMPER'};game.creeps=[near,splash];game.projectiles=[{type:'MISSILE',x:44,y:70,heading:0,target:near,level:1,damage:150,velocity:150,maxTurn:0,life:5}];game.updateProjectiles(.03);
  assert.ok(near.health<300);assert.ok(splash.health<300);assert.equal(game.projectiles.length,0);game.destroy();
});

test('native ballistic collision samples the post-move point instead of sweeping the segment',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const game=new Game(canvasStub(),testLevel(),{}),target={x:60,y:70,health:100,maxHealth:100,dead:false,type:'CHOMPER'};game.creeps=[target];game.projectiles=[{type:'BLASTER',x:44,y:70,heading:0,target:null,level:7,damage:400,velocity:600,life:5}];game.updateProjectiles(.05);assert.equal(game.projectiles[0].x,74);assert.equal(target.health,100);assert.equal(game.projectiles.length,1);game.destroy();
});

test('Laser beams pulse every 0.2 seconds and Thump rings damage on crossing',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const game=new Game(canvasStub(),testLevel(),{});
  const beamTarget={x:80,y:70,health:100,maxHealth:100,dead:false,type:'CHOMPER'};game.creeps=[beamTarget];game.projectiles=[{type:'LASER',x:44,y:70,heading:0,source:null,level:1,damage:16,yOffset:0,nextPulse:0,life:.5}];game.updateProjectiles(0);assert.equal(beamTarget.health,84);game.updateProjectiles(.1);assert.equal(beamTarget.health,84);game.updateProjectiles(.1);assert.equal(beamTarget.health,68);
  const ringTarget={x:74,y:70,health:100,maxHealth:100,dead:false,type:'CHOMPER',currentSpeed:30};game.creeps=[ringTarget];game.projectiles=[{type:'THUMP',x:44,y:70,radius:24,damage:20,level:1,life:1}];game.updateProjectiles(.1);assert.equal(ringTarget.health,80);game.destroy();
});

test('place-above-touch offsets touch input without offsetting the mouse cursor',()=>{globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const game=new Game(canvasStub(),testLevel(),{}, {},null,{hardcore:false,placeAboveFinger:true}),underCursor=hexCenter(5,0),aboveTouch=hexCenter(7,0);game.setBuildPreview('BLASTER',underCursor.x,underCursor.y,'mouse');assert.deepEqual(game.buildPreview.cell,[5,0]);game.setBuildPreview('BLASTER',aboveTouch.x,aboveTouch.y+96,'touch');assert.deepEqual(game.buildPreview.cell,[7,0]);game.destroy();});

test('drag motion drives the native honeycomb brightness impulse',()=>{globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const game=new Game(canvasStub(),testLevel(),{}),a=hexCenter(5,0),b=hexCenter(7,0);assert.equal(game.hexBrightness,.25);game.setBuildPreview('BLASTER',a.x,a.y);game.setBuildPreview('BLASTER',b.x,b.y);game.update(.1);assert.ok(game.hexBrightness>.25);game.cancelBuildPreview();for(let i=0;i<30;i++)game.update(.1);assert.equal(game.hexBrightness,.25);game.destroy();});

test('Vortex energy comes from one-for-one particle absorption',()=>{globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const level=testLevel();level.towers.push({type:'POP',cost:20});level.placed=[{type:'POP',cell:[5,0]}];const game=new Game(canvasStub(),level,{}),vortex=game.towers.get('5,0'),center=hexCenter(5,0);game.particles=[{x:center.x+1,y:center.y,vx:0,vy:0,life:1,color:'#fff'}];game.updateParticles(.01);assert.equal(vortex.energy,1);assert.equal(game.particles.length,0);game.destroy();});

test('linked Vortex energy walls pulse every 0.1 seconds across the native width',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const level=testLevel();level.towers.push({type:'POP',cost:20});level.placed=[{type:'POP',cell:[5,0]},{type:'POP',cell:[7,0]}];
  const game=new Game(canvasStub(),level,{}),source=game.towers.get('5,0'),partner=game.towers.get('7,0'),a=hexCenter(5,0),b=hexCenter(7,0),target={x:(a.x+b.x)/2,y:(a.y+b.y)/2+18,health:300,maxHealth:300,dead:false,type:'CHOMPER',pathCells:[[0,0]],path:[hexCenter(0,0)],pathIndex:0,exit:[2,0]};source.link=partner;source.energy=100;game.creeps=[target];game.updateVortex(source);
  assert.equal(source.energy,0);assert.equal(game.projectiles[0].type,'ENERGY_WALL');game.updateProjectiles(0);assert.equal(target.health,250);game.updateProjectiles(.05);assert.equal(target.health,250);game.updateProjectiles(.05);assert.equal(target.health,200);
  const saved=JSON.parse(JSON.stringify(game.snapshot())),resumed=new Game(canvasStub(),level,{}, {},saved);assert.equal(resumed.projectiles[0].source,resumed.towers.get('5,0'));assert.equal(resumed.projectiles[0].partner,resumed.towers.get('7,0'));game.destroy();resumed.destroy();
});

test('selling a charged Vortex releases its stored energy as an expanding wave',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const level=testLevel();level.towers.push({type:'POP',cost:20});level.placed=[{type:'POP',cell:[5,2]}];const game=new Game(canvasStub(),level,{}),vortex=game.towers.get('5,2'),center=hexCenter(5,2),target={x:center.x+30,y:center.y,health:300,maxHealth:300,dead:false,type:'CHOMPER',pathCells:[[0,0]],path:[hexCenter(0,0)],pathIndex:0,exit:[2,0]};vortex.energy=120;game.creeps=[target];game.selectedTower=vortex;game.sell();
  assert.equal(game.cash,25);assert.equal(game.projectiles[0].type,'POP_WAVE');assert.equal(game.projectiles[0].radius,12);assert.equal(game.projectiles[0].rings.length,3);assert.deepEqual(game.projectiles[0].rings.map(r=>r.color),['#ff0000','#00ff00','#0000ff']);assert.equal(game.projectiles[0].damagePayload,120);game.updateProjectiles(.05);assert.equal(target.health,200);game.destroy();
});

test('Blaster fire leads moving creeps by native projectile travel time',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const game=new Game(canvasStub(),testLevel(),{});game.addTower('BLASTER',[3,2]);const tower=game.towers.get('3,2'),origin=hexCenter(3,2),target={x:origin.x+48,y:origin.y,currentSpeed:100,speed:100,health:100,maxHealth:100,dead:false,type:'CHOMPER',pathIndex:1,path:[origin,{x:origin.x+48,y:origin.y+48}]};game.creeps=[target];game.updateTower(tower,0);
  assert.ok(Math.abs(tower.heading-Math.atan2(24,48))<1e-9);assert.equal(game.projectiles[0].heading,tower.heading);game.destroy();
});

test('Swarm Blasters use the native GDS recharge branch rather than geoDefense timing',()=>{
  assert.deepEqual(TOWER_STATS.BLASTER.cooldown,[.5,.5,.5,.5,.5,.5,4]);globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const game=new Game(canvasStub(),testLevel(),{});game.addTower('BLASTER',[5,2]);const tower=game.towers.get('5,2'),origin=hexCenter(5,2);game.creeps=[{x:origin.x+30,y:origin.y,currentSpeed:30,speed:30,health:100,maxHealth:100,dead:false,type:'CHOMPER',pathIndex:1,path:[origin,{x:origin.x+60,y:origin.y}]}];game.updateTower(tower,0);assert.equal(tower.cooldown,.5);tower.level=7;tower.cooldown=0;game.updateTower(tower,0);assert.equal(tower.cooldown,4);game.destroy();
});

test('level-seven farthest-along targeting ignores zero-progress creeps',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const game=new Game(canvasStub(),testLevel(),{});game.addTower('BLASTER',[3,2]);const tower=game.towers.get('3,2'),origin=hexCenter(3,2),creep={x:origin.x+30,y:origin.y,currentSpeed:30,speed:30,health:100,maxHealth:100,dead:false,type:'CHOMPER',distanceTraveled:0,pathIndex:1,path:[origin,{x:origin.x+60,y:origin.y}]};tower.level=7;game.creeps=[creep];game.updateTower(tower,0);assert.equal(game.projectiles.length,0);creep.distanceTraveled=.01;game.updateTower(tower,0);assert.equal(game.projectiles.length,1);game.destroy();
});

test('level-seven Laser chooses the firing line that intersects the most creeps',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const level=testLevel();level.towers.push({type:'LASER',cost:10});const game=new Game(canvasStub(),level,{});game.addTower('LASER',[3,2]);const tower=game.towers.get('3,2'),origin=hexCenter(3,2);tower.level=7;const horizontal={x:origin.x+48,y:origin.y,health:100,maxHealth:100,dead:false,type:'CHOMPER',pathIndex:1},horizontal2={x:origin.x+98,y:origin.y,health:100,maxHealth:100,dead:false,type:'CHOMPER',pathIndex:1},vertical={x:origin.x,y:origin.y+50,health:100,maxHealth:100,dead:false,type:'CHOMPER',pathIndex:1};game.creeps=[vertical,horizontal,horizontal2];game.updateTower(tower,1);
  assert.equal(tower.target,horizontal);assert.ok(Math.abs(tower.heading)<1e-9);assert.equal(game.projectiles[0].type,'LASER');game.destroy();
});

test('Missile turrets launch on their native slow tracking heading',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const level=testLevel();level.towers.push({type:'MISSILE',cost:10});const game=new Game(canvasStub(),level,{});game.addTower('MISSILE',[3,0]);const tower=game.towers.get('3,0'),origin=hexCenter(3,0),target={x:origin.x,y:origin.y+50,health:100,maxHealth:100,dead:false,type:'CHOMPER',pathIndex:1};game.creeps=[target];tower.cooldown=1;game.updateTower(tower,.1);
  assert.ok(Math.abs(tower.heading-2.5*Math.PI/180)<1e-9);assert.equal(game.projectiles.length,0);tower.cooldown=0;game.updateTower(tower,0);assert.equal(game.projectiles[0].heading,tower.heading);game.destroy();
});

test('Swarm movement applies the native 1.5 world-speed multiplier',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const game=new Game(canvasStub(),testLevel(),{});game.startWave(true);game.update(0);game.update(0);const creep=game.creeps[0],start={x:creep.x,y:creep.y};game.update(.1);assert.ok(Math.abs(Math.hypot(creep.x-start.x,creep.y-start.y)-15)<1e-9);game.destroy();
});

test('Shock persists for half a second and slows at the native frame-equivalent rate',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const level=testLevel();level.towers.push({type:'SHOCK',cost:10});const game=new Game(canvasStub(),level,{});game.addTower('SHOCK',[3,2]);const tower=game.towers.get('3,2'),origin=hexCenter(3,2),target={x:origin.x+28,y:origin.y,currentSpeed:100,speed:100,health:100,maxHealth:100,dead:false,type:'CHOMPER',pathIndex:1};game.creeps=[target];game.updateTower(tower,0);assert.equal(game.projectiles[0].type,'SHOCK');game.updateProjectiles(1/30);assert.ok(Math.abs(target.currentSpeed-95)<1e-9);assert.ok(game.projectiles[0].life<.5);game.destroy();
});

test('Shock target enumeration preserves native creep insertion order',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const level=testLevel();level.towers.push({type:'SHOCK',cost:10});const game=new Game(canvasStub(),level,{});game.addTower('SHOCK',[3,2]);const tower=game.towers.get('3,2'),origin=hexCenter(3,2),first={x:origin.x+60,y:origin.y,currentSpeed:30,speed:30,health:100,maxHealth:100,dead:false,type:'CHOMPER'},nearer={x:origin.x+15,y:origin.y,currentSpeed:30,speed:30,health:100,maxHealth:100,dead:false,type:'CHOMPER'};game.creeps=[first,nearer];game.updateTower(tower,0);assert.equal(game.projectiles[0].target,first);game.destroy();
});

test('each Thump ring can stun at most one creep',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const game=new Game(canvasStub(),testLevel(),{}),first={x:74,y:70,currentSpeed:30,health:100,maxHealth:100,dead:false,type:'CHOMPER'},second={x:73,y:71,currentSpeed:30,health:100,maxHealth:100,dead:false,type:'CHOMPER'},random=Math.random;game.creeps=[first,second];game.projectiles=[{type:'THUMP',x:44,y:70,radius:24,damage:20,level:7,life:1}];Math.random=()=>0;try{game.updateProjectiles(.1);}finally{Math.random=random;}assert.equal(first.currentSpeed,0);assert.equal(second.currentSpeed,30);assert.equal(first.health,80);assert.equal(second.health,80);game.destroy();
});

test('the native third Thump ring is visual-only at tiers five and six',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const level=testLevel();level.towers.push({type:'THUMP',cost:20});const game=new Game(canvasStub(),level,{});game.addTower('THUMP',[5,2]);const tower=game.towers.get('5,2'),origin=hexCenter(5,2);tower.level=5;tower.cooldown=0;game.creeps=[{x:origin.x+30,y:origin.y,currentSpeed:30,speed:30,health:100,maxHealth:100,dead:false,type:'CHOMPER',pathIndex:1,path:[origin,{x:origin.x+60,y:origin.y}]}];game.updateTower(tower,0);assert.equal(game.projectiles.length,3);assert.equal(game.projectiles[2].damage,0);assert.equal(game.projectiles[2].level,0);game.destroy();
});

test('tower placement rejects native spawn, exit, and live-creep hexes',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const level=testLevel();level.blocked=new Set();level.spawns[0].exit=[13,0];level.exits=new Map([['e1',[13,0]]]);const game=new Game(canvasStub(),level,{});assert.equal(game.canPlace('BLASTER',[0,0]).ok,false);assert.equal(game.canPlace('BLASTER',[13,0]).ok,false);const center=hexCenter(5,0);game.creeps=[{...center,pathIndex:1,pathCells:[[5,0]],path:[center],exit:[13,0],dead:false}];assert.equal(game.canPlace('BLASTER',[5,0]).ok,false);game.destroy();
});

test('Laser-created Swarm clones preserve the original zero-health default quirk',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const game=new Game(canvasStub(),testLevel(),{}),at=hexCenter(2,2),swarm={type:'SWARM',x:at.x,y:at.y,speed:100,currentSpeed:100,health:20,maxHealth:20,wave:1,spawnCell:[0,0],pathCells:[[2,2],[3,2]],path:[at,hexCenter(3,2)],pathIndex:1,exit:[5,3],placed:true,dead:false},random=Math.random;game.creeps=[swarm];game.projectiles=[{type:'LASER',x:44,y:at.y,heading:0,source:null,level:1,damage:16,yOffset:0,nextPulse:0,life:.5}];Math.random=()=>0;try{game.updateProjectiles(0);}finally{Math.random=random;}assert.equal(game.creeps.length,2);const clone=game.creeps[1];assert.equal(clone.health,0);assert.equal(clone.maxHealth,0);assert.equal(clone.speed,30);assert.equal(clone.wave,0);assert.equal(clone.nativeZeroHealth,true);game.update(.01);assert.ok(game.creeps.includes(clone));game.destroy();
});

test('native lower bar supports drag-to-build, wave advance, pause, and upgrade controls',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const game=new Game(canvasStub(),testLevel(),{}),pointer=(x,y)=>({clientX:x,clientY:y,pointerId:1});game.onPointer(pointer(240,741));assert.equal(game.nativeBuildDrag.type,'BLASTER');const target=hexCenter(5,0);game.onPointerMove(pointer(target.x,target.y));game.onPointerUp(pointer(target.x,target.y));assert.ok(game.towers.has('5,0'));game.nextWaveTimer=14;game.onPointer(pointer(28,689));assert.equal(game.waveIndex,0);game.update(0);assert.equal(game.waveIndex,1);game.onPointer(pointer(452,689));assert.equal(game.paused,true);game.paused=false;game.selectedTower=game.towers.get('5,0');game.onPointer(pointer(352,746));assert.equal(game.selectedTower.upgradeRemaining,1);game.destroy();
});

test('native sell, impact, death, and breach effects retain their authored scale',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const game=new Game(canvasStub(),testLevel(),{});game.addTower('BLASTER',[5,0]);assert.equal(game.effects.length,0);
  game.effects=[];game.selectedTower=game.towers.get('5,0');game.sell();assert.ok(game.effects.some(e=>e.kind==='light'&&e.color==='#ff0000'&&e.style==='star'&&e.fadeOut===.1));
  game.effects=[];game.creeps=[];game.impactMissile({x:80,y:70,level:3,damage:100});assert.ok(game.effects.some(e=>e.kind==='light'&&e.radius===84&&e.style==='ring'&&e.fadeOut===.75));assert.ok(game.backdrop.pressures.some(value=>value>0));
  game.particles=[];game.reward({x:80,y:70,wave:1,exit:[2,0]});assert.equal(game.particles.length,512);assert.ok(game.effects.some(e=>e.kind==='light'&&e.radius===32));
  game.particles=[];game.effects=[];game.breach({x:80,y:70,dead:false});assert.equal(game.particles.length,2560);assert.ok(game.effects.some(e=>e.kind==='light'&&e.radius===256));game.destroy();
});

test('BoomAt applies the native doubled count and 1.5 impulse multiplier',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const game=new Game(canvasStub(),testLevel(),{}),creep={x:80,y:70,health:100,maxHealth:100,dead:false,type:'CHOMPER'};game.damageCreep(creep,1);assert.equal(game.particles.length,20);for(const particle of game.particles){assert.ok(Math.abs(Math.hypot(particle.vx,particle.vy)-37.5)<1e-9);assert.equal(particle.life,1);assert.equal(particle.massless,false);}game.destroy();
});

test('dynamic backdrop uses the native 16-pixel spring mesh and pressure decay',()=>{
  const mesh=new DynamicBackdrop(),neighbor=25*mesh.gridX+16,center=25*mesh.gridX+15,boundary=15;
  assert.equal(mesh.gridX,31);assert.equal(mesh.gridY,51);assert.equal(mesh.indices.length,9000);mesh.boomAt(240,400,100,64);
  assert.equal(mesh.positions[neighbor*2],331);assert.equal(mesh.pressures[neighbor],75);assert.equal(mesh.positions[center*2],240);assert.equal(mesh.pressures[center],100);assert.equal(mesh.pressures[boundary],0);
  mesh.update(1/30);assert.ok(Math.abs(mesh.positions[neighbor*2]-325.9333333)<.0001);assert.ok(Math.abs(mesh.velocities[neighbor*2]+76)<.0001);assert.ok(Math.abs(mesh.brightness[neighbor]-.9)<1e-6);assert.equal(mesh.pressures[neighbor],67.5);
  const before=mesh.positions[neighbor*2];mesh.boomAt(240,400,-384,384);assert.equal(mesh.positions[neighbor*2],before);mesh.dispose();
});

test('massless shot sparkles remain visual while explosion debris feeds Vortex towers',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const level=testLevel();level.towers.push({type:'POP',cost:20});level.placed=[{type:'POP',cell:[5,0]}];const game=new Game(canvasStub(),level,{}),vortex=game.towers.get('5,0'),center=hexCenter(5,0);game.particles=[{x:center.x+1,y:center.y,vx:0,vy:0,life:1,maxLife:1,color:'#fff',massless:true},{x:center.x+1,y:center.y,vx:0,vy:0,life:1,maxLife:1,color:'#fff',massless:false}];game.updateParticles(.01);assert.equal(vortex.energy,1);assert.equal(game.particles.length,1);assert.equal(game.particles[0].massless,true);
  game.projectiles=[{type:'MISSILE',x:center.x+50,y:center.y,heading:0,target:null,level:2,damage:10,velocity:0,maxTurn:0,life:1}];game.updateProjectiles(.04);assert.ok(game.particles.filter(p=>p.massless).length>=21);game.destroy();
});

test('native light styles and boosted shot sparkle lifetimes are retained',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const game=new Game(canvasStub(),testLevel(),{});game.addLight(10,20,48,'#ff0000',1,.1,.7,'starRandom',true);const light=game.effects[0];assert.equal(light.style,'starRandom');assert.equal(light.fadeIn,.1);assert.equal(light.fadeOut,.7);assert.equal(light.post,true);
  game.particles=[];game.projectiles=[{type:'MISSILE',x:100,y:100,heading:0,target:null,level:2,damage:10,boosted:true,velocity:0,maxTurn:0,life:1}];game.updateProjectiles(1/30);assert.equal(game.particles.length,30);assert.equal(game.particles.filter(p=>p.life===.25).length,20);assert.equal(game.particles.filter(p=>p.life===3).length,10);assert.ok(game.particles.every(p=>p.massless));game.destroy();
});

test('random light rotation freezes with gameplay while scene oscillators keep time',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const game=new Game(canvasStub(),testLevel(),{}),random=Math.random;game.addLight(10,20,48,'#fff',1,.1,.7,'starRandom');const light=game.effects[0];Math.random=()=>.25;try{game.updateEffects(.01);assert.ok(Math.abs(light.rotation-Math.PI/2)<1e-9);game.paused=true;game.update(.1);assert.ok(Math.abs(light.rotation-Math.PI/2)<1e-9);assert.equal(game.sceneTime,.1);}finally{Math.random=random;}game.destroy();
});

test('pause intercepts board input and victory keeps native fireworks animating',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;let pauseState=null;const game=new Game(canvasStub(),testLevel(),{},{pause:value=>pauseState=value});game.addTower('BLASTER',[5,0]);const at=hexCenter(5,0);game.togglePause();assert.equal(pauseState,true);game.onPointer({clientX:at.x,clientY:at.y,pointerId:1});assert.equal(game.selectedTower,null);game.togglePause();assert.equal(pauseState,false);game.particles=[];game.effects=[];game.finish(true);game.update(.05);assert.equal(game.won,true);assert.ok(game.particles.length>=200);assert.ok(game.effects.some(e=>e.kind==='light'));game.destroy();
});

test('native multiplier bonuses drift as five-second color-cycling labels',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;const game=new Game(canvasStub(),testLevel(),{});game.reward({x:80,y:70,wave:1,exit:[2,0]});const bonus=game.effects.find(e=>e.kind==='bonus');assert.equal(bonus.text,'×20');assert.equal(bonus.life,5);assert.equal(bonus.maxLife,5);assert.ok(Math.hypot(bonus.x2-bonus.x,bonus.y2-bonus.y)>=64);game.destroy();
});

function pathLevel(){return {
  pathMode:true,path:[{x:0,y:100},{x:200,y:100},{x:200,y:300}],exitPoint:{x:200,y:300},
  cash:50,lives:3,blocked:new Set(['5,5']),pass:new Set(),fast:new Set(),heal:new Set(),placed:[],endless:false,spawns:[],exits:new Map(),
  towers:[{type:'BLASTER',cost:5},{type:'POP',cost:20}],
  creeps:{CHOMPER:{speed:100,health:10}},waveHealthFactor:1,waveHealthFactor2:0,waveSpeedFactor:1,waveWealthFactor:1,delayBetweenSpawns:.01,delayBetweenWaves:20,
  waves:[{spawnName:undefined,groups:[{type:'CHOMPER',count:1}]}]
};}

test('classic path creep spawns at the route start, advances along it, and breaches at the exit',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;
  const game=new Game(canvasStub(),pathLevel(),{});game.nextWaveTimer=0;game.update(.1);
  assert.equal(game.creeps.length,1);assert.equal(game.creeps[0].placed,false);
  assert.deepEqual({x:game.creeps[0].x,y:game.creeps[0].y},{x:0,y:100});
  game.update(.1);assert.equal(game.creeps[0].placed,true);assert.ok(game.creeps[0].distanceTraveled>0);assert.ok(game.creeps[0].x>0);
  for(let i=0;i<400&&game.creeps.length;i++)game.update(.1);
  assert.equal(game.creeps.length,0);assert.ok(game.lives<3);game.destroy();
});

test('classic build rules offer Vortex and forbid building on the creep path',()=>{
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=noOp;
  const game=new Game(canvasStub(),pathLevel(),{});
  assert.ok(game.nativeBuildTypes().some(t=>t.type==='POP'));
  assert.equal(game.canPlace('POP',[8,8]).ok,true);
  assert.equal(game.canPlace('BLASTER',[5,5]).ok,false);
  game.destroy();
});
