import { TOWER_STATS, cellKey, creepHealth, creepSpeed, findNextCell, findPath, hexCenter, killCash, levelValue, pixelToHex, towerRange, upgradeCost } from './core.js';
import { DynamicBackdrop } from './dynamic-backdrop.js';

const CREEP_SPRITES={CHOMPER:[0,0],CUBIC:[64,0],SPINNER:[0,64],PULSAR:[64,64],STAR:[0,128],WIGGLE:[0,192],SWARM:[64,192]};
// Distinct additive colors for the procedural (no-sprite-sheet) creep shapes.
const CREEP_COLORS={CHOMPER:'#7bff5a',SPINNER:'#29ffe6',WIGGLE:'#ff5bda',STAR:'#ffe45c',CUBIC:'#ff9a3c',PULSAR:'#8bd0ff',SWARM:'#5affc0'};
const TOWER_ROWS={BLASTER:64,LASER:128,MISSILE:192,SHOCK:256,POP:320,THUMP:384};
const BOOST_CAPACITY={BLASTER:l=>75+l*50,LASER:l=>25+l*25,MISSILE:l=>100*l};
// Per-frame movement multiplier for fixed-path (classic geoDefense) creeps.
// Matches the maze engine's feel constant; the authored path is pre-scaled in core.js.
const PATH_MOVE_SCALE=1.5;

function pointSegmentDistance(p,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
  if(!length)return Math.hypot(p.x-a.x,p.y-a.y);
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length));
  return Math.hypot(p.x-(a.x+t*dx),p.y-(a.y+t*dy));
}

function angleDelta(target,current){return Math.atan2(Math.sin(target-current),Math.cos(target-current));}
function turnToward(current,target,maxRadians){const delta=angleDelta(target,current);return current+Math.max(-maxRadians,Math.min(maxRadians,delta));}
function creepHeading(creep){const next=creep.path?.[creep.pathIndex];if(next){const dx=next.x-creep.x,dy=next.y-creep.y;if(dx||dy)return Math.atan2(dy,dx);}return creep.rotation??0;}
function inPlayfield(point){return point.x>=0&&point.x<480&&point.y>=32&&point.y<660;}

export class Game {
  constructor(canvas,level,assets,callbacks={},savedState=null,options={}){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.level=level;this.assets=assets;this.callbacks=callbacks;this.pathMode=!!level.pathMode;
    this.hardcore=savedState?.hardcore??options.hardcore??false;this.healthBars=savedState?.healthBars??options.healthBars??true;this.placeAboveFinger=savedState?.placeAboveFinger??options.placeAboveFinger??false;this.cash=Math.floor(level.cash*(this.hardcore?1:1.25));this.lives=level.lives;this.score=0;this.multiplier=1;this.waveIndex=0;this.apparentWave=0;this.placedTypes=new Set(savedState?.placedTypes??[]);this.fullyUpgraded=new Set(savedState?.fullyUpgraded??[]);this.gotX50=!!savedState?.gotX50;
    this.towers=new Map();this.creeps=[];this.projectiles=[];this.particles=[];this.effects=[];this.sequences=[];this.backdrop=new DynamicBackdrop();this.nextWaveTimer=level.delayBetweenWaves;this.awaitingEndlessReset=false;
    this.selectedType=null;this.selectedTower=null;this.linkingTower=null;this.lastTowerTap=0;this.buildPreview=null;this.lastBuildPointer=null;this.hexBrightness=.25;this.hexBrightnessVelocity=0;this.hexBrightnessImpulse=0;this.nativeBuildDrag=null;this.nativePointerDown=false;this.nativeLinkTarget=null;this.nativeLinkPosition=null;this.oscillatorStarts={};
    this.paused=false;this.ended=false;this.won=false;this.fireworkTimer=0;this.lastTime=0;this.saveAccumulator=0;this.visualTime=0;this.sceneTime=0;
    if(savedState){this.restore(savedState);if(this.towers.size)this.oscillatorStarts.LINK=0;if([...this.towers.values()].some(t=>t.type==='POP'))this.oscillatorStarts.POP=0;for(const type of ['WIGGLE','PULSAR'])if(this.creeps.some(c=>c.type===type))this.oscillatorStarts[type]=0;}else for(const p of level.placed)this.addTower(p.type,p.cell,true);
    this.onPointer=this.onPointer.bind(this);this.onPointerMove=this.onPointerMove.bind(this);this.onPointerUp=this.onPointerUp.bind(this);canvas.addEventListener('pointerdown',this.onPointer);canvas.addEventListener('pointermove',this.onPointerMove);canvas.addEventListener('pointerup',this.onPointerUp);canvas.addEventListener('pointercancel',this.onPointerUp);
    this.frame=this.frame.bind(this);this.raf=requestAnimationFrame(this.frame);this.emit();
  }

  destroy(){this.persist();cancelAnimationFrame(this.raf);this.backdrop.dispose();this.canvas.removeEventListener('pointerdown',this.onPointer);this.canvas.removeEventListener('pointermove',this.onPointerMove);this.canvas.removeEventListener('pointerup',this.onPointerUp);this.canvas.removeEventListener('pointercancel',this.onPointerUp);}
  blocked(extra=null){const out=new Set(this.level.blocked);for(const spawn of this.level.spawns)out.add(cellKey(...spawn.cell));for(const key of this.towers.keys())out.add(key);if(extra)out.add(cellKey(...extra));return out;}
  allRoutes(blocked=this.blocked()){const spawns=new Set(this.level.spawns.map(s=>cellKey(...s.cell)));return this.level.spawns.every(s=>findPath(s.cell,s.exit,blocked))&&this.creeps.filter(c=>!c.dead&&c.placed!==false).every(c=>{const at=pixelToHex(c.x,c.y),key=at?cellKey(...at):'';return at&&(!blocked.has(key)||spawns.has(key))&&findPath(at,c.exit,blocked);});}
  say(text){this.callbacks.message?.(text);return false;}
  sound(name){this.callbacks.sound?.(name);}

  addTower(type,cell,free=false){
    const key=cellKey(...cell),def=this.level.towers.find(t=>t.type===type);
    if(!free){const check=this.canPlace(type,cell);if(!check.ok)return this.say(check.reason);}
    else if(!def||this.towers.has(key)||this.level.blocked.has(key)||this.level.pass.has(key)||this.level.spawns.some(s=>cellKey(...s.cell)===key)||[...this.level.exits.values()].some(e=>cellKey(...e)===key))return false;
    if(!free)this.cash-=def.cost;
    this.oscillatorStarts.LINK??=this.sceneTime;if(type==='POP')this.oscillatorStarts.POP??=this.sceneTime;this.towers.set(key,{type,cell,level:1,cooldown:0,cost:def.cost,value:def.cost,upgradeRemaining:0,upgradeDuration:0,link:null,target:null,boost:0,energy:0,heading:0,rotation:0,lockedHeading:false,turretToFire:0,visualScale:1});
    if(!free)this.placedTypes.add(type);
    this.repath();this.sound('menu');this.emit();if(!free)this.persist();return true;
  }

  canPlace(type,cell){const key=cellKey(...cell),def=this.level.towers.find(t=>t.type===type);
    if(this.pathMode){if(!def)return {ok:false,reason:'That tower is not available in this mission.'};if(this.towers.has(key))return {ok:false,reason:'A tower already occupies that hex.'};if(this.level.blocked.has(key))return {ok:false,reason:"You can't build on the creep path."};if(this.cash<def.cost)return {ok:false,reason:'Not enough credits.'};return {ok:true,reason:''};}
    if(!def||type==='POP')return {ok:false,reason:'That tower cannot be built in Swarm.'};if(this.towers.has(key)||this.level.blocked.has(key)||this.level.pass.has(key)||this.level.spawns.some(s=>cellKey(...s.cell)===key)||[...this.level.exits.values()].some(e=>cellKey(...e)===key))return {ok:false,reason:'That hex is unavailable.'};if(this.cash<def.cost)return {ok:false,reason:'Not enough credits.'};if(!this.allRoutes(this.blocked(cell)))return {ok:false,reason:'That tower would seal an entrance.'};return {ok:true,reason:''};}
  setBuildPreview(type,clientX,clientY,pointerType='mouse'){const rect=this.canvas.getBoundingClientRect(),rawX=(clientX-rect.left)*480/rect.width,rawY=(clientY-rect.top)*800/rect.height,x=rawX,y=rawY-(this.placeAboveFinger&&pointerType==='touch'?96:0);if(this.lastBuildPointer)this.hexBrightnessImpulse=Math.hypot(rawX-this.lastBuildPointer.x,rawY-this.lastBuildPointer.y)*.75;this.lastBuildPointer={x:rawX,y:rawY};if(x<0||y<0||x>480||y>800){this.buildPreview=null;return;}const cell=pixelToHex(x,y);this.buildPreview=cell?{type,cell,...this.canPlace(type,cell)}:null;}
  commitBuildPreview(){const preview=this.buildPreview;this.buildPreview=null;this.lastBuildPointer=null;if(preview?.ok)return this.addTower(preview.type,preview.cell);return false;}
  cancelBuildPreview(){this.buildPreview=null;this.lastBuildPointer=null;}

  selectType(type){this.selectedType=type;this.selectedTower=null;this.linkingTower=null;this.callbacks.selection?.(null);}

  pointerPosition(event){const rect=this.canvas.getBoundingClientRect();return {x:(event.clientX-rect.left)*480/rect.width,y:(event.clientY-rect.top)*800/rect.height};}
  nativeBuildTypes(){return this.pathMode?this.level.towers.slice():this.level.towers.filter(t=>t.type!=='POP');}
  handleNativeBar(px,py,event){
    if(py<646)return false;
    if(this.selectedTower){
      if(Math.hypot(px-352,py-746)<48){this.upgrade();return true;}
      if(Math.hypot(px-440,py-746)<48){this.sell();return true;}
      this.selectedTower=null;this.callbacks.selection?.(null);return true;
    }
    if(Math.hypot(px-28,py-689)<48){this.startWave();return true;}
    if(Math.hypot(px-452,py-689)<48){this.togglePause();return true;}
    const types=this.nativeBuildTypes(),offset=(types.length-1)*40;let best=null,distance=Infinity;for(let i=0;i<types.length;i++){const x=240-offset+i*80,d=Math.hypot(px-x,py-741);if(d<96&&d<distance){best=types[i];distance=d;}}
    if(best&&this.cash>=best.cost){this.nativeBuildDrag={type:best.type,pointerId:event.pointerId};this.selectedType=null;this.canvas.setPointerCapture?.(event.pointerId);this.setBuildPreview(best.type,event.clientX,event.clientY,event.pointerType);}
    return true;
  }

  onPointer(event){
    if(this.ended||this.paused)return;
    const {x:px,y:py}=this.pointerPosition(event);if(this.handleNativeBar(px,py,event))return;this.nativePointerDown=true;this.nativeLinkTarget=null;
    const cell=pixelToHex(px,py);
    if(!cell){this.selectedTower=null;this.callbacks.selection?.(null);return;}
    const tower=this.towers.get(cellKey(...cell));
    if(this.linkingTower){
      const source=this.linkingTower;this.linkingTower=null;
      if(!tower||tower===source||tower.type!=='POP'||tower.link===source||source.link===tower)return this.say('Links must end at a different, unpaired Vortex tower.');
      source.link=tower;this.selectedTower=source;this.callbacks.selection?.(source);this.sound('menu');this.say(`${source.type} linked to the Vortex tower.`);this.persist();return;
    }
    if(tower){const now=performance.now();if(tower===this.selectedTower&&tower.type==='LASER'&&now-this.lastTowerTap<1000)this.toggleLaserLock(tower);this.lastTowerTap=now;this.selectedTower=tower;this.selectedType=null;this.callbacks.selection?.(tower);this.say(`${tower.type} tower selected (level ${tower.level}).`);return;}
    this.selectedTower=null;if(this.selectedType)this.addTower(this.selectedType,cell);this.callbacks.selection?.(null);
  }

  onPointerMove(event){
    if(this.ended||this.paused)return;
    if(this.nativeBuildDrag){this.setBuildPreview(this.nativeBuildDrag.type,event.clientX,event.clientY,event.pointerType);return;}
    if(!this.nativePointerDown||!this.selectedTower||(!['BLASTER','LASER','MISSILE'].includes(this.selectedTower.type)&&!(this.selectedTower.type==='POP'&&this.selectedTower.level===7)))return;
    const p=this.pointerPosition(event);this.nativeLinkPosition=p;this.nativeLinkTarget=[...this.towers.values()].filter(t=>t!==this.selectedTower&&t.type==='POP'&&t.link!==this.selectedTower&&this.selectedTower.link!==t).sort((a,b)=>{const pa=hexCenter(...a.cell),pb=hexCenter(...b.cell);return Math.hypot(pa.x-p.x,pa.y-p.y)-Math.hypot(pb.x-p.x,pb.y-p.y);}).find(t=>{const at=hexCenter(...t.cell);return Math.hypot(at.x-p.x,at.y-p.y)<37.5;})??null;
  }

  onPointerUp(event){
    if(this.ended||this.paused){this.nativeBuildDrag=null;this.nativePointerDown=false;this.buildPreview=null;this.lastBuildPointer=null;return;}
    if(this.nativeBuildDrag){this.commitBuildPreview();this.nativeBuildDrag=null;this.canvas.releasePointerCapture?.(event.pointerId);return;}
    if(this.nativePointerDown&&this.selectedTower&&this.nativeLinkTarget){this.selectedTower.link=this.nativeLinkTarget;this.sound('menu');this.say(`${this.selectedTower.type} linked to the Vortex tower.`);this.persist();}
    this.nativePointerDown=false;this.nativeLinkTarget=null;this.nativeLinkPosition=null;
  }

  upgrade(){
    const t=this.selectedTower;if(!t||t.upgradeRemaining>0)return;
    if(t.level>=7)return this.say('This tower is fully upgraded.');
    const price=upgradeCost(t.cost,t.level);
    if(this.cash<price)return this.say('Not enough credits.');
    this.cash-=price;t.upgradeDuration=t.level;t.upgradeRemaining=t.level;this.sound('menu');this.emit();this.callbacks.selection?.(t);
    this.say(`Upgrade started: ${t.upgradeDuration} second${t.upgradeDuration===1?'':'s'}.`);this.persist();
  }

  sell(){
    const t=this.selectedTower;if(!t)return;
    const refund=t.type==='POP'?0:Math.floor(t.value/2);this.cash=Math.min(5000,this.cash+refund);
    const at=hexCenter(...t.cell);if(t.type==='POP')this.addLight(at.x,at.y,96,'#ffffff',.25,.1,.1,'random');else this.addLight(at.x,at.y,48,'#ff0000',.2,.05,.1,'star');
    if(t.type==='POP')this.projectiles.push({type:'POP_WAVE',x:at.x,y:at.y,radius:12,damagePayload:Math.floor(t.energy),life:2.5,rings:['#ff0000','#00ff00','#0000ff'].map(color=>({color,offset:(Math.random()*2-1)*8,rotation:Math.random()*Math.PI*2}))});
    this.towers.delete(cellKey(...t.cell));for(const other of this.towers.values())if(other.link===t)other.link=null;
    this.selectedTower=null;this.linkingTower=null;this.repath();this.sound('menu');this.emit();this.callbacks.selection?.(null);this.say(`Tower sold for ${refund} credits.`);this.persist();
  }

  beginLink(){
    const t=this.selectedTower;if(!t)return;
    if(!['BLASTER','LASER','MISSILE'].includes(t.type)&&!(t.type==='POP'&&t.level===7))return this.say('Only Blaster, Laser, Missile, and level 7 Vortex towers can create links.');
    this.linkingTower=t;this.say('Tap a Vortex tower to complete the link.');
  }

  toggleLaserLock(t=this.selectedTower){
    if(!t||t.type!=='LASER')return false;
    if(t.lockedHeading){t.lockedHeading=false;this.say('Laser tracking restored.');}
    else if(t.level>2){t.lockedHeading=true;this.say('Laser heading locked. Double-tap again to track targets.');}
    else return this.say('Heading lock unlocks at Laser level 3.');
    this.callbacks.selection?.(t);this.sound('menu');this.persist();return true;
  }

  canLaunchWave(){return !this.ended&&!this.awaitingEndlessReset&&(this.level.endless||this.waveIndex<this.level.waves.length);}
  startWave(force=false){if(!this.canLaunchWave())return this.say(this.awaitingEndlessReset?'Waiting for the current swarm to finish spawning.':'All waves have launched.');if(!force&&this.nextWaveTimer>=this.level.delayBetweenWaves*.75)return this.say('Wave advance unlocks after the timer reaches 25%.');this.nextWaveTimer=0;return true;}
  launchWave(){
    if(!this.canLaunchWave())return;
    const sourceIndex=this.waveIndex%this.level.waves.length,wave=this.level.waves[sourceIndex],spawn=this.level.spawns.find(s=>s.name===wave.spawnName)??this.level.spawns[0];
    const items=wave.groups.flatMap(g=>Array.from({length:g.count},()=>({type:g.type,spawn})));
    if(!wave.concurrent)this.apparentWave++;const sequence={items,timer:0,wave:this.apparentWave};this.sequences.push(sequence);this.waveIndex++;
    this.spawnOne(sequence);this.nextWaveTimer=wave.concurrent?0:this.level.delayBetweenWaves;if(this.level.endless&&this.waveIndex%this.level.waves.length===0)this.awaitingEndlessReset=true;if(this.selectedTower){this.addLight(28,689,40,'#00ff00',1,.1,.3,'flareRandom',true);this.addLight(28,689,16,'#ffffff',1,.1,.9,'glow',true);}this.say(`Wave ${this.apparentWave} launched.`);this.emit();this.persist();
  }

  spawnOne(sequence){
    const item=sequence.items.shift();if(!item)return;
    const def=this.level.creeps[item.type]??{speed:30,health:50},w=sequence.wave,health=creepHealth(def.health,w,this.level.waveHealthFactor??1.25,this.level.waveHealthFactor2??0,this.hardcore),speed=creepSpeed(def.speed,w,this.level.waveSpeedFactor??1);
    if(this.pathMode){if(item.type==='WIGGLE'||item.type==='PULSAR')this.oscillatorStarts[item.type]??=this.sceneTime;this.creeps.push({type:item.type,pathCells:[],path:this.level.path,pathIndex:0,distanceTraveled:0,x:this.level.path[0].x,y:this.level.path[0].y,speed,currentSpeed:speed,health,maxHealth:health,wave:w,exit:null,placed:false,dead:false,rotation:0,visualScale:.375,rotationSpeed:0});sequence.timer=this.level.delayBetweenSpawns;return;}
    const swarm=item.type==='SWARM';if(item.type==='WIGGLE'||item.type==='PULSAR')this.oscillatorStarts[item.type]??=this.sceneTime;this.creeps.push({type:item.type,pathCells:[],path:[],pathIndex:0,distanceTraveled:0,x:0,y:0,speed,currentSpeed:speed,health,maxHealth:health,wave:w,spawnCell:[...item.spawn.cell],exit:[...item.spawn.exit],placed:false,dead:false,rotation:0,visualScale:swarm?.375+Math.random()*.375:.375,rotationSpeed:swarm?Math.random()*14042*Math.PI/180:0});
    sequence.timer=this.level.delayBetweenSpawns*(item.type==='SWARM'?.5:1);
  }

  repath(){
    if(this.pathMode)return;
    for(const c of this.creeps){if(c.placed===false)continue;const current=pixelToHex(c.x,c.y),next=current?findNextCell(current,c.exit,this.blocked()):null;if(next){c.pathCells=[current,next];c.path=c.pathCells.map(v=>hexCenter(...v));c.pathIndex=1;}}
  }

  update(dt){
    this.sceneTime+=dt;if(this.paused)return;this.backdrop.update(dt);this.visualTime+=dt;this.hexBrightnessVelocity+=this.hexBrightnessImpulse*dt*.25;this.hexBrightnessImpulse=0;this.hexBrightness+=this.hexBrightnessVelocity*dt;if(this.hexBrightness<.25){this.hexBrightness=.25;this.hexBrightnessVelocity=0;}if(this.hexBrightness>1){this.hexBrightness=1;this.hexBrightnessVelocity=0;}this.hexBrightnessVelocity-=dt*3;if(this.ended){this.updateGameOverEffects(dt);return;}
    for(const c of this.creeps){
      if(c.dead)continue;
      if(this.pathMode){this.updatePathCreep(c,dt);continue;}
      if(c.placed===false){c.placed=true;const start=c.spawnCell??this.level.spawns[0].cell,next=findNextCell(start,c.exit,this.blocked()),point=hexCenter(...start);c.x=point.x;c.y=point.y;if(!next){this.breach(c);continue;}c.pathCells=[[...start],next];c.path=c.pathCells.map(cell=>hexCenter(...cell));c.pathIndex=1;}
      c.currentSpeed=Math.max(c.speed*.1,c.currentSpeed);
      const terrain=cellKey(...(c.pathCells[Math.max(0,c.pathIndex-1)]??c.pathCells[0]));
      if(this.level.heal?.has(terrain))c.health=Math.min(c.maxHealth,c.health+Math.floor(c.maxHealth*dt));
      const target=c.path[c.pathIndex];if(!target){this.breach(c);continue;}
      const dx=target.x-c.x,dy=target.y-c.y;
      if(['CHOMPER','WIGGLE','PULSAR'].includes(c.type))c.rotation=Math.atan2(dy,dx);else if(['SPINNER','STAR','CUBIC'].includes(c.type))c.rotation-=Math.PI*2*dt;else if(c.type==='SWARM')c.rotation+=c.rotationSpeed*dt;
      if(c.type==='WIGGLE'||c.type==='PULSAR'){this.oscillatorStarts[c.type]??=this.sceneTime;const phase=((this.sceneTime-this.oscillatorStarts[c.type])%.2)/.1,osc=phase<=1?.875+.25*phase:1.125-.25*(phase-1);c.visualScale=.375*osc;}
      let remaining=c.currentSpeed*1.5*(this.level.fast?.has(terrain)?2:1)*dt;
      while(remaining>0&&!c.dead){const next=c.path[c.pathIndex],nextCell=c.pathCells[c.pathIndex];if(!next||!nextCell){this.breach(c);break;}const mx=next.x-c.x,my=next.y-c.y,d=Math.hypot(mx,my);if(d<=remaining){c.x=next.x;c.y=next.y;if(cellKey(...nextCell)===cellKey(...c.exit)){this.breach(c);break;}remaining-=d;c.distanceTraveled=(c.distanceTraveled??0)+d;const following=findNextCell(nextCell,c.exit,this.blocked());if(!following){remaining=0;break;}c.pathCells=[[...nextCell],following];c.path=c.pathCells.map(cell=>hexCenter(...cell));c.pathIndex=1;}else{c.x+=mx/d*remaining;c.y+=my/d*remaining;c.distanceTraveled=(c.distanceTraveled??0)+remaining;remaining=0;}}
      c.currentSpeed=Math.min(c.speed,c.currentSpeed+8*dt);if(c.shakeTimer>0)c.shakeTimer-=dt;
    }

    for(const t of this.towers.values())this.updateTower(t,dt);this.updateProjectiles(dt);this.updateParticles(dt);
    for(const c of this.creeps)if(!c.dead&&!c.nativeZeroHealth&&c.health<=0){c.dead=true;this.reward(c);}
    this.creeps=this.creeps.filter(c=>!c.dead);this.updateEffects(dt);this.updateSpawns(dt);this.saveAccumulator+=dt;if(this.saveAccumulator>=1){this.saveAccumulator=0;this.persist();}

    if(this.lives<=0){this.finish(this.level.endless&&this.score!==0);this.emit();return;}
    if(!this.level.endless&&this.waveIndex>=this.level.waves.length&&!this.sequences.length&&!this.creeps.length)this.finish(true);
    this.emit();
  }

  updatePathCreep(c,dt){
    if(c.placed===false){c.placed=true;c.path=this.level.path;c.pathIndex=1;c.x=c.path[0].x;c.y=c.path[0].y;}
    c.currentSpeed=Math.max(c.speed*.1,c.currentSpeed);
    const target=c.path[c.pathIndex];if(!target){this.breach(c);return;}
    const dx=target.x-c.x,dy=target.y-c.y;
    if(['CHOMPER','WIGGLE','PULSAR'].includes(c.type))c.rotation=Math.atan2(dy,dx);else if(['SPINNER','STAR','CUBIC'].includes(c.type))c.rotation-=Math.PI*2*dt;
    if(c.type==='WIGGLE'||c.type==='PULSAR'){this.oscillatorStarts[c.type]??=this.sceneTime;const phase=((this.sceneTime-this.oscillatorStarts[c.type])%.2)/.1,osc=phase<=1?.875+.25*phase:1.125-.25*(phase-1);c.visualScale=.375*osc;}
    let remaining=c.currentSpeed*PATH_MOVE_SCALE*dt;
    while(remaining>0&&!c.dead){const next=c.path[c.pathIndex];if(!next){this.breach(c);break;}const mx=next.x-c.x,my=next.y-c.y,d=Math.hypot(mx,my);if(d<=remaining){c.x=next.x;c.y=next.y;c.distanceTraveled=(c.distanceTraveled??0)+d;remaining-=d;c.pathIndex++;if(c.pathIndex>=c.path.length){this.breach(c);break;}}else{c.x+=mx/d*remaining;c.y+=my/d*remaining;c.distanceTraveled=(c.distanceTraveled??0)+remaining;remaining=0;}}
    c.currentSpeed=Math.min(c.speed,c.currentSpeed+8*dt);if(c.shakeTimer>0)c.shakeTimer-=dt;
  }

  updateSpawns(dt){
    if(this.canLaunchWave()){this.nextWaveTimer-=dt;if(this.nextWaveTimer<=0&&this.canLaunchWave())this.launchWave();}
    for(const sequence of this.sequences){sequence.timer-=dt;if(sequence.timer<=0&&sequence.items.length)this.spawnOne(sequence);}this.sequences=this.sequences.filter(sequence=>sequence.items.length);
    if(this.awaitingEndlessReset&&!this.sequences.length){this.awaitingEndlessReset=false;this.nextWaveTimer=this.level.delayBetweenWaves;}
  }

  breach(c){if(c.dead)return;c.dead=true;c.breached=true;this.lives--;this.boomAt(c.x,c.y,128,100,2,'#ff80ff');this.boomAt(c.x,c.y,128,250,2,'#ff22ff');this.boomAt(c.x,c.y,1024,500,2,'#ff0048');this.addLight(c.x,c.y,256,'#ffffff',1,.1,.5,'flareRandom');this.sound('life');if(this.lives>0&&this.lives<=10)this.sound(`countdown${this.lives}`);}

  updateTower(t,dt){
    t.boosting=false;if(t.type==='POP'){this.oscillatorStarts.POP??=this.sceneTime;const elapsed=this.sceneTime-this.oscillatorStarts.POP,phase=(elapsed%1)/.5;t.visualScale=t.level===7?(phase<=1?.9+.2*phase:1.1-.2*(phase-1)):1;}let completedUpgrade=false;if(t.upgradeRemaining>0){t.target=null;t.cooldown=0;t.upgradeRemaining-=dt;if(t.upgradeRemaining>0)return;const paid=upgradeCost(t.cost,t.level);t.upgradeRemaining=0;t.value+=paid;t.level++;completedUpgrade=true;if(t.level===7)this.fullyUpgraded.add(t.type);this.sound('menu');this.say(`${t.type} reached level ${t.level}.`);if(t===this.selectedTower)this.callbacks.selection?.(t);}
    if(t.type==='SHOCK'||t.type==='THUMP')t.rotation+=Math.PI/4*dt;else if(t.type==='POP')t.rotation+=(Math.PI/4+Math.PI*2*(t.energy/(250*t.level)||0))*dt;
    t.cooldown=Math.max(0,t.cooldown-dt);
    if(!completedUpgrade&&t.link?.type==='POP'&&BOOST_CAPACITY[t.type]){const cap=BOOST_CAPACITY[t.type](t.level),amount=Math.min(10*dt,cap-t.boost,t.link.energy);if(amount>0){t.boost+=amount;t.link.energy-=amount;t.boosting=true;}}
    if(t.type==='POP'){this.updateVortex(t);return;}
    const stats=TOWER_STATS[t.type],origin=hexCenter(...t.cell),range=towerRange(t.type,t.level),live=this.creeps.filter(c=>!c.dead&&inPlayfield(c)),targetValid=c=>c&&!c.dead&&inPlayfield(c)&&Math.hypot(c.x-origin.x,c.y-origin.y)<=range;
    if(t.lockedHeading||(stats.beam&&t.level===7))t.target=null;else if(!targetValid(t.target))t.target=null;
    let targets=live.filter(c=>Math.hypot(c.x-origin.x,c.y-origin.y)<=(stats.beam?range*2:range));
    if(stats.beam&&t.lockedHeading){const end={x:origin.x+Math.cos(t.heading)*range,y:origin.y+Math.sin(t.heading)*range};targets=targets.filter(c=>pointSegmentDistance(c,origin,end)<=10);}
    if(stats.shock)targets=targets.filter(c=>c.type!=='SWARM');
    const farthest=t.level===7&&['BLASTER','MISSILE'].includes(t.type);if(farthest)targets=targets.filter(c=>(c.distanceTraveled??0)>0).sort((a,b)=>(b.distanceTraveled??0)-(a.distanceTraveled??0));else if(!stats.shock&&!(stats.beam&&t.lockedHeading))targets.sort((a,b)=>Math.hypot(a.x-origin.x,a.y-origin.y)-Math.hypot(b.x-origin.x,b.y-origin.y));
    if(!t.target){
      if(stats.beam&&t.level===7){const candidates=targets.filter(targetValid);let best=null,bestCount=0;for(const candidate of candidates){const heading=Math.atan2(candidate.y-origin.y,candidate.x-origin.x),end={x:origin.x+Math.cos(heading)*1600,y:origin.y+Math.sin(heading)*1600},count=live.filter(c=>pointSegmentDistance(c,origin,end)<=8).length;if(count>bestCount){best=candidate;bestCount=count;}}t.target=best??targets[0]??null;}
      else t.target=targets[0]??null;
    }
    const primary=t.target;if(!primary)return;
    const targetHeading=Math.atan2(primary.y-origin.y,primary.x-origin.x),shots=levelValue(stats.shots,t.level),baseDamage=levelValue(stats.damage,t.level);let boost=0;
    if(t.type==='BLASTER'){const distance=Math.hypot(primary.x-origin.x,primary.y-origin.y),travel=distance/(t.level===7?600:300),lead=primary.currentSpeed??primary.speed??0,heading=creepHeading(primary);t.heading=Math.atan2(primary.y+Math.sin(heading)*lead*1.5*travel-origin.y,primary.x+Math.cos(heading)*lead*1.5*travel-origin.x);}
    else if(stats.beam&&!t.lockedHeading)t.heading=turnToward(t.heading,targetHeading,200*Math.PI/180*dt);
    else if(stats.missile)t.heading=turnToward(t.heading,targetHeading,25*Math.PI/180*dt);
    else if(!t.lockedHeading)t.heading=targetHeading;
    if(stats.beam&&(Math.hypot(primary.x-origin.x,primary.y-origin.y)>range||(!t.lockedHeading&&Math.abs(angleDelta(targetHeading,t.heading))>5*Math.PI/180)))return;
    if(t.cooldown>0)return;
    const cap=BOOST_CAPACITY[t.type]?.(t.level);if(cap&&t.boost>=cap){boost=t.type==='MISSILE'?Math.floor(t.boost):Math.floor(t.boost/shots);t.boost=0;this.boostFlare(origin.x,origin.y,t.type,t.level);}

    if(stats.shock){for(const c of targets.slice(0,shots)){this.addLight(origin.x,origin.y,10+Math.random()*10,'#808000',.5,.1,.25,'starRandom');this.projectiles.push({type:'SHOCK',x:origin.x,y:origin.y,target:c,level:t.level,life:.5,lightAccumulator:0});}}
    else if(stats.beam){const offsets=shots===1?[0]:shots===2?[-4.5,4.5]:[-4.5,0,4.5];for(const offset of offsets)this.projectiles.push({type:'LASER',x:origin.x,y:origin.y,heading:t.heading,source:t,level:t.level,damage:baseDamage+boost,boosted:boost>0,yOffset:offset,nextPulse:0,life:.5});}
    else if(stats.missile){const mounts=[1,1,2,2,3,3,1][t.level-1];t.turretToFire=(t.turretToFire+1)%mounts;let mount=t.turretToFire;if(t.level===3||t.level===4)mount++;const offset=mount===1?10.5:mount===2?-10.5:0,side={x:-Math.sin(t.heading)*offset,y:Math.cos(t.heading)*offset};this.projectiles.push({type:'MISSILE',x:origin.x+side.x,y:origin.y+side.y,heading:t.heading,target:primary,level:t.level,damage:baseDamage+boost,boosted:boost>0,velocity:t.level===7?217.5:150,maxTurn:0,life:t.level===7?10:5});}
    else if(stats.thump){const starts=t.level<3?[24]:t.level<5?[24,12]:t.level<7?[24,12,24]:[24,12,24,18,6];for(let i=0;i<starts.length;i++)this.projectiles.push({type:'THUMP',x:origin.x,y:origin.y,radius:starts[i],damage:i===2&&t.level>4?0:baseDamage+boost,level:i===2&&t.level>4?0:t.level,color:i>=3?'#ff80ff':'#ff00ff',rotation:Math.random()*Math.PI*2,life:1});}
    else {const offsets=shots===1?[0]:shots===2?[-6,6]:[-6,0,6];for(const offset of offsets){const side={x:-Math.sin(t.heading)*offset,y:Math.cos(t.heading)*offset};this.projectiles.push({type:'BLASTER',x:origin.x+side.x,y:origin.y+side.y,heading:t.heading,target:null,level:t.level,damage:baseDamage+boost,boosted:boost>0,velocity:t.level===7?600:300,life:5});}}
    t.cooldown=levelValue(stats.cooldown,t.level);this.sound(t.type==='LASER'&&t.level===7?'laserbeam':t.type==='MISSILE'&&t.level===7?'photon':t.type.toLowerCase());
  }

  updateVortex(t){
    if(!t.link){t.cooldown=0;return;}if(t.cooldown>0||t.link.type!=='POP'||t.energy<100)return;
    const a=hexCenter(...t.cell),b=hexCenter(...t.link.cell);t.energy-=100;t.cooldown=1+Math.hypot(b.x-a.x,b.y-a.y)/192;
    this.projectiles.push({type:'ENERGY_WALL',x:a.x,y:a.y,x2:b.x,y2:b.y,source:t,partner:t.link,nextPulse:0,life:.5});
  }

  cloneSwarm(c){const at=pixelToHex(c.x,c.y);if(!at)return;const next=findNextCell(at,c.exit,this.blocked()),pathCells=next?[at,next]:[at,[-1,-1]],path=next?pathCells.map(v=>hexCenter(...v)):[hexCenter(...at),{x:0,y:0}];this.creeps.push({type:'SWARM',pathCells,path,pathIndex:1,distanceTraveled:0,x:c.x,y:c.y,speed:30,currentSpeed:0,health:0,maxHealth:0,wave:0,spawnCell:[...(c.spawnCell??this.level.spawns[0].cell)],exit:[...c.exit],placed:true,dead:false,nativeZeroHealth:true,rotation:0,visualScale:.375+Math.random()*.375,rotationSpeed:Math.random()*14042*Math.PI/180});this.addLight(c.x,c.y,96,'#0000ff',1,.1,.9,'star');this.addLight(c.x,c.y,48,'#ffffff',1,.1,.9,'flare');}

  updateProjectiles(dt){
    for(const p of this.projectiles){
      if(p.type==='POP_WAVE'){
        const old=p.radius;p.radius+=375*dt;for(const ring of p.rings??[])ring.rotation+=Math.PI*20*dt;for(const c of this.creeps){const d=Math.hypot(c.x-p.x,c.y-p.y);if(!c.dead&&inPlayfield(c)&&d>old&&d<=p.radius)this.damageCreep(c,Math.floor(p.life/3*p.damagePayload));}p.life-=dt;if(p.life<0)p.dead=true;
        continue;
      }
      p.life-=dt;if(p.life<0){p.dead=true;continue;}
      if(p.type==='LASER'){this.updateLaserBeam(p,dt);continue;}
      if(p.type==='SHOCK'){if(!p.target||p.target.dead){p.dead=true;continue;}p.target.currentSpeed*=Math.pow(1-(p.level+1)*.025,30*dt);p.lightAccumulator=(p.lightAccumulator??0)+dt*30;const bursts=Math.floor(p.lightAccumulator);p.lightAccumulator-=bursts;for(let i=0;i<bursts;i++)this.addLight(p.target.x,p.target.y,8+Math.random()*15,'#404000',.1,.01,.05,'starRandom');continue;}
      if(p.type==='ENERGY_WALL'){
        if(!p.source||!p.partner||p.source.link!==p.partner||!this.towers.has(cellKey(...p.source.cell))||!this.towers.has(cellKey(...p.partner.cell))){p.dead=true;continue;}
        const a=hexCenter(...p.source.cell),b=hexCenter(...p.partner.cell);p.x=a.x;p.y=a.y;p.x2=b.x;p.y2=b.y;p.nextPulse-=dt;
        while(p.nextPulse<=0&&!p.dead){p.nextPulse+=.1;for(const c of this.creeps)if(!c.dead&&inPlayfield(c)&&pointSegmentDistance(c,a,b)<=24)this.damageCreep(c,50);}p.lightAccumulator=(p.lightAccumulator??0)+dt*30;const bursts=Math.floor(p.lightAccumulator);p.lightAccumulator-=bursts;for(let i=0;i<bursts;i++){this.addLight(a.x,a.y,48,'#808080',.2,.01,.01,'flareRandom');this.addLight(b.x,b.y,48,'#808080',.2,.01,.01,'flareRandom');}
        continue;
      }
      if(p.type==='THUMP'){const old=p.radius;p.radius+=60*dt;for(const c of this.creeps){const d=Math.hypot(c.x-p.x,c.y-p.y);if(!c.dead&&inPlayfield(c)&&d>old&&d<=p.radius){this.damageCreep(c,p.damage);if(!p.stunned&&Math.random()<p.level*.015){c.currentSpeed=0;c.shakeTimer=2;p.stunned=true;}}}if(p.radius>=60)p.dead=true;continue;}
      if(p.type==='MISSILE'){
        if(p.target&&!inPlayfield(p))p.target=null;
        p.trailAccumulator=(p.trailAccumulator??0)+dt*30;const trailBursts=Math.floor(p.trailAccumulator);p.trailAccumulator-=trailBursts;for(let burst=0;burst<trailBursts;burst++)for(let i=0;i<10*p.level;i++){const ox=(Math.random()*2-1)*1.5,oy=(Math.random()*2-1)*1.5;this.sparkle(p.x+ox,p.y+oy,0,0,.25,'#993333',1.5);if(p.boosted&&i<5*p.level)this.sparkle(p.x+ox,p.y+oy,ox*30,oy*30,3,'#993333',1.5);}
        if(!p.target||p.target.dead||p.target.health<=0){p.target=null;if(p.level>4)p.target=this.creeps.filter(c=>!c.dead&&c.health>0&&inPlayfield(c)&&c.type!=='PULSAR'&&Math.hypot(c.x-p.x,c.y-p.y)<=100).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0]??null;if(p.target)p.life+=4;}
        const cap=p.level===7?150:270;p.maxTurn=Math.min(cap,p.maxTurn+cap*4*dt);
        if(p.target){const desired=Math.atan2(p.target.y-p.y,p.target.x-p.x),diff=Math.atan2(Math.sin(desired-p.heading),Math.cos(desired-p.heading)),step=p.maxTurn*Math.PI/180*dt;p.heading+=Math.max(-step,Math.min(step,diff));}else if(p.level!==7)p.heading+=p.maxTurn*Math.PI/180*dt;
      }
      if(p.type==='BLASTER'&&p.boosted){p.trailAccumulator=(p.trailAccumulator??0)+dt*30;const trailBursts=Math.floor(p.trailAccumulator);p.trailAccumulator-=trailBursts;for(let burst=0;burst<trailBursts;burst++)for(let i=0;i<5*p.level;i++){const ox=((Math.random()*2-1)-.5)*37.5,oy=((Math.random()*2-1)-.5)*37.5;this.sparkle(p.x+ox,p.y+oy,ox*1.5,oy*1.5,3,'#009900',1.5);}}
      p.x+=Math.cos(p.heading)*p.velocity*dt;p.y+=Math.sin(p.heading)*p.velocity*dt;
      let hit=null;if(p.type==='BLASTER')hit=this.creeps.filter(c=>!c.dead&&c.health>0&&inPlayfield(c)&&Math.hypot(c.x-p.x,c.y-p.y)<12).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0]??null;else if(p.target&&!p.target.dead&&Math.hypot(p.target.x-p.x,p.target.y-p.y)<12)hit=p.target;
      if(hit){p.dead=true;if(p.type==='MISSILE')this.impactMissile(p);else this.damageCreep(hit,p.damage);}
    }
    this.projectiles=this.projectiles.filter(p=>!p.dead);
  }

  updateLaserBeam(p,dt){
    if(p.source){p.heading=p.source.heading;const at=hexCenter(...p.source.cell);p.x=at.x;p.y=at.y;}
    p.nextPulse-=dt;while(p.nextPulse<=0&&!p.dead){p.nextPulse+=.2;const side={x:-Math.sin(p.heading)*p.yOffset,y:Math.cos(p.heading)*p.yOffset},start={x:p.x+side.x,y:p.y+side.y},end={x:start.x+Math.cos(p.heading)*1600,y:start.y+Math.sin(p.heading)*1600};const affected=[...this.creeps].filter(c=>!c.dead&&inPlayfield(c)&&pointSegmentDistance(c,start,end)<=12);for(const c of affected){if(c.type==='SWARM'){if(c.health<c.maxHealth)c.health=Math.min(c.maxHealth,c.health+p.damage);else if(Math.random()<1/25)this.cloneSwarm(c);}else this.damageCreep(c,p.damage);}if(p.boosted)for(let i=0;i<2*p.level;i++){const ox=(Math.random()*2-1)*7.5,oy=(Math.random()*2-1)*7.5,speed=(200+Math.random()*200)*1.5,tint=Math.floor(Math.random()*128);this.sparkle(start.x+ox,start.y+oy,Math.cos(p.heading)*speed,Math.sin(p.heading)*speed,3,`rgb(${tint} ${tint} 255)`,1.5);}}}

  impactMissile(p){const radius=(32+8*p.level)*1.5;for(const c of this.creeps){const d=Math.hypot(c.x-p.x,c.y-p.y);if(!c.dead&&inPlayfield(c)&&d<radius)this.damageCreep(c,Math.floor(p.damage*(1-d/radius)));}this.addLight(p.x,p.y,37.5*p.level,'#ff0000',.15,0,0,'flare');this.addLight(p.x,p.y,radius,'#ff0000',1,0,.75,'ring');this.addLight(p.x,p.y,24*p.level,'#ffffff',.1,0,.02,'glow');this.addLight(p.x,p.y,48*p.level,'#808080',.5,0,.5,'star');this.addBackdropBoom(p.x,p.y,10*p.level,radius,.8);}

  damageCreep(creep,amount){if(amount<0)return;this.boomAt(creep.x,creep.y,10,25,1,null);if(amount<=0)return;creep.nativeZeroHealth=false;creep.health-=amount;}
  addLight(x,y,radius,color='#ffffff',life=.3,fadeIn=0,fadeOut=life*.5,style='random',post=false,intensity=1){const styles=['glow','star','flare'];if(style==='random')style=styles[Math.floor(Math.random()*styles.length)];this.effects.push({kind:'light',x,y,radius,color,life,maxLife:life,fadeIn,fadeOut,style,post,intensity,rotation:Math.random()*Math.PI*2});}
  addBackdropBoom(x,y,force,range){this.backdrop.boomAt(x,y,force,range);}
  boostFlare(x,y,type,level){const color=type==='BLASTER'?'#00ff00':type==='MISSILE'?'#ff0000':'#0000ff';this.addLight(x,y,48,color,1,.05,.7,'starRandom');this.addLight(x,y,64,'#ffffff',.5,.05,.2,'flareRandom');}
  boomAt(x,y,count,impulse,seconds,color=null,glow=true){const speed=impulse*1.5,tint=color??`hsl(${Math.floor(Math.random()*360)} 100% 65%)`;this.spawnParticles(x,y,count*2,tint,{speedMin:speed,speedMax:speed,lifeMin:seconds,lifeMax:seconds,offsetTimeMax:.2});if(glow){const backdropRange=Math.min(150,speed),lightLife=seconds*.1;this.addLight(x,y,speed,tint,lightLife,lightLife*.1,lightLife*.25,'random',false,Math.min(.75,speed/500));this.addBackdropBoom(x,y,backdropRange/2,backdropRange,Math.max(.4,seconds*.4));}}
  spawnParticles(x,y,count,color='#d8f8ff',options={}){const {speedMin=25,speedMax=200,lifeMin=.6,lifeMax=2.2,massless=false,size=2,heading=null,spread=Math.PI,offsetTimeMax=0}=options;for(let i=0;i<count&&this.particles.length<16383;i++){const angle=heading==null?Math.random()*Math.PI*2:heading+(Math.random()*2-1)*spread,speed=speedMin+Math.random()*(speedMax-speedMin),life=lifeMin+Math.random()*(lifeMax-lifeMin),vx=Math.cos(angle)*speed,vy=Math.sin(angle)*speed,offset=Math.random()*offsetTimeMax;this.particles.push({x:x+vx*offset,y:y+vy*offset,vx,vy,life,maxLife:life,color,massless,size});}}
  sparkle(x,y,vx,vy,life,color,size=2){if(this.particles.length<16383)this.particles.push({x,y,vx,vy,life,maxLife:life,color,massless:true,size});}
  updateParticles(dt){for(const p of this.particles){p.life-=dt;if(p.life<=0){p.dead=true;continue;}if(!p.massless)for(const tower of this.towers.values()){if(tower.type!=='POP')continue;const center=hexCenter(...tower.cell),dx=center.x-p.x,dy=center.y-p.y,d=Math.hypot(dx,dy),range=towerRange('POP',tower.level);if(d>=range)continue;if(d<3){const max=250*tower.level;tower.energy+=1;if(tower.energy>max)tower.energy=max;else{const lightLife=Math.random()*.4;if(lightLife>0)this.addLight(center.x,center.y,Math.random()*64,`rgb(${Math.floor(Math.random()*64)} ${Math.floor(Math.random()*64)} ${Math.floor(Math.random()*64)})`,lightLife,lightLife*.25,lightLife*.25,'random');}p.dead=true;break;}const force=(1-d/range)*(2.5*tower.level)*100*dt;p.vx+=dx/d*force;p.vy+=dy/d*force;}if(!p.dead){const drag=Math.pow(.95,dt*30);p.vx*=drag;p.vy*=drag;p.x+=p.vx*dt;p.y+=p.vy*dt;}}this.particles=this.particles.filter(p=>!p.dead);}
  updateEffects(dt){for(const e of this.effects){if(e.kind==='light'&&e.style.toLowerCase().endsWith('random'))e.rotation=Math.random()*Math.PI*2;e.life-=dt;}this.effects=this.effects.filter(e=>e.life>0);}
  updateGameOverEffects(dt){if(this.won){this.fireworkTimer-=dt;while(this.fireworkTimer<=0){this.fireworkTimer+=.02+Math.random()*.98;const x=Math.random()*480,y=Math.random()*800,count=Math.floor(Math.random()*200+100),impulse=Math.random()*200+100,color=`hsl(${Math.floor(Math.random()*360)} 100% 50%)`;this.boomAt(x,y,count,impulse,3,color);}}this.updateParticles(dt);this.updateEffects(dt);}

  snapshot(){
    const towers=[...this.towers.values()].map(t=>{const {link,target,...plain}=t;return {...plain,cell:[...t.cell],linkKey:link?cellKey(...link.cell):null,targetIndex:target?this.creeps.indexOf(target):-1};});
    const creeps=this.creeps.filter(c=>!c.dead).map(c=>({...c,pathCells:(c.pathCells??[]).map(v=>[...v]),path:c.path.map(v=>({...v})),exit:c.exit?[...c.exit]:null}));
    const sequences=this.sequences.map(s=>({timer:s.timer,wave:s.wave,items:s.items.map(i=>({type:i.type,spawnName:i.spawn?.name??null}))}));
    const projectiles=this.projectiles.map(p=>({...p,targetIndex:p.target?this.creeps.indexOf(p.target):-1,sourceKey:p.source?cellKey(...p.source.cell):null,partnerKey:p.partner?cellKey(...p.partner.cell):null,target:undefined,source:undefined,partner:undefined}));
    return {version:1,hardcore:this.hardcore,healthBars:this.healthBars,placeAboveFinger:this.placeAboveFinger,placedTypes:[...this.placedTypes],fullyUpgraded:[...this.fullyUpgraded],gotX50:this.gotX50,cash:this.cash,lives:this.lives,score:this.score,multiplier:this.multiplier,waveIndex:this.waveIndex,apparentWave:this.apparentWave,nextWaveTimer:this.nextWaveTimer,awaitingEndlessReset:this.awaitingEndlessReset,towers,creeps,sequences,projectiles};
  }

  restore(state){
    if(state.version!==1)throw new Error('Unsupported saved-game version.');
    this.cash=state.cash;this.lives=state.lives;this.score=state.score;this.multiplier=state.multiplier;this.waveIndex=state.waveIndex;this.apparentWave=state.apparentWave??state.waveIndex;this.nextWaveTimer=state.nextWaveTimer;this.awaitingEndlessReset=!!state.awaitingEndlessReset;
    this.towers.clear();for(const saved of state.towers){const {linkKey,targetIndex,...tower}=saved;this.towers.set(cellKey(...tower.cell),{...tower,cell:[...tower.cell],link:null,target:null,_linkKey:linkKey,_targetIndex:targetIndex??-1});}
    for(const t of this.towers.values()){t.link=t._linkKey?this.towers.get(t._linkKey)??null:null;delete t._linkKey;}
    this.creeps=state.creeps.map(c=>({...c,pathCells:(c.pathCells??[]).map(v=>[...v]),path:c.path.map(v=>({...v})),exit:c.exit?[...c.exit]:null,dead:false}));
    for(const t of this.towers.values()){t.target=t._targetIndex>=0?this.creeps[t._targetIndex]??null:null;delete t._targetIndex;}
    this.projectiles=(state.projectiles??[]).map(p=>{const {targetIndex,sourceKey,partnerKey,...plain}=p,restored={...plain,target:targetIndex>=0?this.creeps[targetIndex]??null:null,source:sourceKey?this.towers.get(sourceKey)??null:null,partner:partnerKey?this.towers.get(partnerKey)??null:null};if(restored.type==='POP_WAVE'&&!restored.rings)restored.rings=['#ff0000','#00ff00','#0000ff'].map((color,index)=>({color,offset:(index-1)*4,rotation:0}));return restored;});
    this.sequences=state.sequences.map(s=>({timer:s.timer,wave:s.wave,items:s.items.map(i=>({type:i.type,spawn:this.level.spawns.find(sp=>sp.name===i.spawnName)??this.level.spawns[0]}))}));
  }

  persist(){if(!this.ended)this.callbacks.save?.(this.snapshot());}

  reward(c){
    this.cash=Math.min(5000,this.cash+killCash(c.wave,this.level.waveWealthFactor));
    const exit=this.pathMode?this.level.exitPoint:hexCenter(...c.exit),ratio=Math.min(1,Math.hypot(c.x-exit.x,c.y-exit.y)/480);let bonus=1;if(ratio<.02)bonus=50;else if(ratio<.05)bonus=20;else if(ratio<.1)bonus=10;else if(ratio<.2)bonus=5;
    if(bonus===50)this.gotX50=true;this.multiplier+=bonus;this.score+=c.wave*5*this.multiplier;const angle=Math.random()*Math.PI*2,distance=64+Math.random()*64,size=bonus<5?10:bonus<10?12:bonus<20?15:bonus<50?20:24;this.effects.push({kind:'bonus',x:c.x,y:c.y,x2:c.x+Math.cos(angle)*distance,y2:c.y+Math.sin(angle)*distance,text:`×${bonus}`,size,colorOffset:Math.random(),life:5,maxLife:5});
    this.boomAt(c.x,c.y,128,200,2,null);
    this.boomAt(c.x,c.y,128,100,1,'#91b9ff');
    this.addLight(c.x,c.y,32,'#ffffff',.15,0,.05,'starRandom');
    this.sound('enemy');
  }

  finish(won){if(this.ended)return;this.ended=true;this.won=won;this.fireworkTimer=0;this.sound(won?'menu':'powerdown');this.callbacks.end?.(won,this.score,{won,score:this.score,lives:this.lives,hardcore:this.hardcore,gotX50:this.gotX50,placedTypes:[...this.placedTypes],fullyUpgraded:[...this.fullyUpgraded]});}
  togglePause(){if(this.ended)return;this.paused=!this.paused;if(this.paused){this.nativeBuildDrag=null;this.nativePointerDown=false;this.buildPreview=null;this.lastBuildPointer=null;}this.callbacks.pause?.(this.paused);}
  emit(){this.callbacks.stats?.({cash:this.cash,lives:this.lives,wave:this.apparentWave,total:this.level.endless?'∞':this.level.apparentWaves??this.level.waves.filter(w=>!w.concurrent).length,score:this.score,multiplier:this.multiplier,nextWave:Math.max(0,this.nextWaveTimer),complete:!this.level.endless&&this.waveIndex>=this.level.waves.length,waiting:this.awaitingEndlessReset});}
  frame(time){const dt=Math.min(.05,(time-this.lastTime)/1000||0);this.lastTime=time;this.update(dt);this.draw();this.raf=requestAnimationFrame(this.frame);}

  draw(){
    const g=this.ctx;g.clearRect(0,0,480,800);g.fillStyle='#01030a';g.fillRect(0,0,480,800);
    this.drawBackdrop();if(this.assets.honeycomb){g.globalAlpha=this.hexBrightness;g.drawImage(this.assets.honeycomb,0,0);g.globalAlpha=1;}else this.drawHoneycombGrid();
    if(this.pathMode)this.drawPath();else{
    for(const key of this.level.blocked){const [q,r]=key.split(',').map(Number);this.hexFill(q,r,'rgba(255,70,40,.25)','#ff412d');}for(const key of this.level.pass){const [q,r]=key.split(',').map(Number);this.hexFill(q,r,'rgba(255,145,20,.22)','#ff9a24');}for(const key of this.level.fast??[]){const [q,r]=key.split(',').map(Number);this.hexFill(q,r,'rgba(0,190,255,.28)','#28dfff');}for(const key of this.level.heal??[]){const [q,r]=key.split(',').map(Number);this.hexFill(q,r,'rgba(70,255,110,.28)','#6dff7f');}
    for(const s of this.level.spawns)this.hexFill(...s.cell,'rgba(0,170,255,.28)','#21d7ff');for(const e of this.level.exits.values())this.hexFill(...e,'rgba(117,255,48,.24)','#8cff42');
    }
    if(this.nativeLinkPosition&&this.selectedTower){const a=hexCenter(...this.selectedTower.cell),b=this.nativeLinkTarget?hexCenter(...this.nativeLinkTarget.cell):this.nativeLinkPosition;g.strokeStyle=this.nativeLinkTarget?'#f3a4ff':'rgba(218,83,255,.55)';g.lineWidth=this.nativeLinkTarget?5:3;g.beginPath();g.moveTo(a.x,a.y);g.lineTo(b.x,b.y);g.stroke();}
    if(this.buildPreview){const p=hexCenter(...this.buildPreview.cell),range=towerRange(this.buildPreview.type,1);this.hexFill(...this.buildPreview.cell,this.buildPreview.ok?'rgba(80,255,120,.25)':'rgba(255,60,60,.3)',this.buildPreview.ok?'#7dff8b':'#ff4b5f');g.save();g.globalCompositeOperation='lighter';g.globalAlpha=.5;if(this.assets.touchIndicators){const sx=this.buildPreview.ok?256:0;g.drawImage(this.assets.touchIndicators,sx,0,256,256,p.x-range,p.y-range,range*2,range*2);}else{g.strokeStyle=this.buildPreview.ok?'#73ff8b':'#ff4b5f';g.lineWidth=3;g.beginPath();g.arc(p.x,p.y,range,0,Math.PI*2);g.stroke();}g.restore();}
    g.save();g.globalCompositeOperation='lighter';for(const p of this.particles){g.globalAlpha=Math.min(1,p.life/(p.maxLife||p.life)*1.5);g.fillStyle=p.color;const size=p.size??2;g.fillRect(p.x-size/2,p.y-size/2,size,size);}g.restore();
    for(const e of this.effects)if(!e.post&&e.kind==='light')this.drawEffect(e);
    for(const t of this.towers.values())this.drawTower(t);for(const c of this.creeps)this.drawCreep(c);for(const p of this.projectiles)this.drawProjectile(p);
    for(const e of this.effects)if(!e.post&&e.kind!=='light')this.drawEffect(e);
    this.drawNativeInterface();
    for(const e of this.effects)if(e.post)this.drawEffect(e);
    this.drawSelectionOverlay();
  }

  drawBackdrop(){this.backdrop.draw(this.ctx,this.assets.backdrop);}
  tintTouchFrame(sx,sy,color){if(!this.assets.touchIndicators)return null;if(!this.lightCanvas){this.lightCanvas=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(256,256):document.createElement('canvas');this.lightCanvas.width=256;this.lightCanvas.height=256;this.lightContext=this.lightCanvas.getContext('2d');}const l=this.lightContext;l.clearRect(0,0,256,256);l.globalCompositeOperation='source-over';l.drawImage(this.assets.touchIndicators,sx,sy,256,256,0,0,256,256);l.globalCompositeOperation='multiply';l.fillStyle=color;l.fillRect(0,0,256,256);l.globalCompositeOperation='source-over';return this.lightCanvas;}
  drawTintedTouchFrame(x,y,radius,color,rotation=0,alpha=1,sx=256,sy=768){const g=this.ctx,frame=this.tintTouchFrame(sx,sy,color);if(!frame)return false;g.save();g.globalCompositeOperation='lighter';g.globalAlpha=alpha;g.translate(x,y);g.rotate(rotation);g.drawImage(frame,-radius,-radius,radius*2,radius*2);g.restore();return true;}
  drawLightEffect(e){const g=this.ctx,age=e.maxLife-e.life,brightness=e.fadeOut>0&&age>=e.maxLife-e.fadeOut?Math.max(0,1-(age-(e.maxLife-e.fadeOut))/e.fadeOut):1,style=e.style.toLowerCase(),frames={glow:[256,256],star:[256,512],starrandom:[256,512],flare:[0,768],flarerandom:[0,768],ring:[256,768],ringrandom:[256,768]},frame=frames[style]??frames.glow;if(!this.drawTintedTouchFrame(e.x,e.y,e.radius,e.color,e.rotation,Math.min(1,brightness*e.intensity),frame[0],frame[1])){const gradient=g.createRadialGradient(e.x,e.y,0,e.x,e.y,e.radius);gradient.addColorStop(0,e.color);gradient.addColorStop(1,'rgba(0,0,0,0)');g.globalAlpha=Math.min(1,brightness*e.intensity);g.fillStyle=gradient;g.fillRect(e.x-e.radius,e.y-e.radius,e.radius*2,e.radius*2);}}
  drawEffect(e){if(e.kind==='backdrop')return;const g=this.ctx,progress=1-e.life/(e.maxLife||e.life),alpha=Math.max(0,Math.min(1,e.life/(e.maxLife||e.life)));g.save();g.globalCompositeOperation='lighter';if(e.kind==='bonus'){const eased=1-(1-progress)**2,x=e.x+(e.x2-e.x)*eased,y=e.y+(e.y2-e.y)*eased;g.globalAlpha=Math.min(1,alpha*2);g.fillStyle=`hsl(${Math.floor((this.visualTime*.5+e.colorOffset)*360)%360} 100% 65%)`;g.font=`700 ${e.size}px system-ui`;g.textAlign='center';g.textBaseline='middle';g.fillText(e.text,x,y);}else if(e.kind==='light')this.drawLightEffect(e);else if(e.kind==='shockwave'){const phase=e.inward?1-progress:progress;g.globalAlpha=Math.sin(Math.PI*progress)*.85;g.strokeStyle=e.color;g.lineWidth=Math.max(2,10*(1-progress));g.beginPath();g.arc(e.x,e.y,Math.max(2,e.radius*phase),0,Math.PI*2);g.stroke();}else{g.strokeStyle=e.color;g.globalAlpha=Math.min(1,e.life*6);g.lineWidth=e.kind==='line'?2:Math.max(2,5*(1-progress));g.beginPath();if(e.kind==='ring')g.arc(e.x,e.y,e.radius*progress,0,Math.PI*2);else{g.moveTo(e.x1,e.y1);g.lineTo(e.x2,e.y2);}g.stroke();}g.restore();}
  drawTowerSprite(type,level,x,y,size=48){const g=this.ctx,sy=TOWER_ROWS[type]??64;if(!this.assets.towers){this.drawTowerGlyph(type,x,y,size);return;}g.save();g.globalCompositeOperation='lighter';g.drawImage(this.assets.towers,0,sy,64,64,x-size/2,y-size/2,size,size);if(type!=='POP')g.drawImage(this.assets.towers,Math.min(7,level)*64,sy,64,64,x-size/2,y-size/2,size,size);g.restore();}
  drawWrapped(text,x,y,width,lineHeight=13,maxLines=3){const g=this.ctx,words=String(text??'').split(/\s+/);let line='',lineNo=0;for(const word of words){const next=line?`${line} ${word}`:word;if(g.measureText(next).width>width&&line){g.fillText(line,x,y+lineNo*lineHeight);line=word;if(++lineNo>=maxLines)return;}else line=next;}if(lineNo<maxLines)g.fillText(line,x,y+lineNo*lineHeight);}
  drawNativeInterface(){
    const g=this.ctx,total=this.level.endless?'∞':this.level.apparentWaves??this.level.waves.filter(w=>!w.concurrent).length;
    if(this.assets.scoreBar)g.drawImage(this.assets.scoreBar,0,0,480,32);else{g.fillStyle='rgba(0,15,22,.9)';g.fillRect(0,0,480,32);}
    g.font='700 12px system-ui';g.textBaseline='middle';g.fillStyle='#dfffff';g.textAlign='left';g.fillText(String(this.score),5,16);g.textAlign='center';g.fillText(`×${this.multiplier}`,240,16);g.textAlign='right';g.fillText(String(this.lives),355,16);g.fillStyle='#5ff5ff';g.fillText('♥',374,16);g.fillStyle='#dfffff';g.fillText(`${this.apparentWave}/${total}`,475,16);
    if(this.selectedTower)this.drawNativeTowerBar(this.selectedTower);else this.drawNativeBuildBar();g.textAlign='left';g.textBaseline='alphabetic';g.globalAlpha=1;
  }
  drawNativeBuildBar(){
    const g=this.ctx;if(this.assets.buildBar)g.drawImage(this.assets.buildBar,0,646,480,154);else{g.fillStyle='#053a54';g.fillRect(0,646,480,154);}
    g.font='700 12px system-ui';g.textAlign='center';g.fillStyle='#dfffff';g.fillText(`$${this.cash}`,240,676);
    const types=this.nativeBuildTypes(),offset=(types.length-1)*40;for(let i=0;i<types.length;i++){const def=types[i],x=240-offset+i*80,enabled=this.cash>=def.cost;g.globalAlpha=enabled?1:.32;this.drawTowerSprite(def.type,1,x,741,48);g.font='700 13px system-ui';g.fillStyle=enabled?'#fff':'#4d6670';g.fillText(`$${def.cost}`,x,789);if(this.nativeBuildDrag?.type===def.type){g.strokeStyle='#b7ff75';g.lineWidth=2;g.beginPath();g.arc(x,741,29,0,Math.PI*2);g.stroke();}}
    g.globalAlpha=1;if(this.canLaunchWave()){const percent=Math.max(0,Math.min(1,1-this.nextWaveTimer/this.level.delayBetweenWaves));g.fillStyle='rgba(0,20,35,.9)';g.beginPath();g.arc(28,689,20,0,Math.PI*2);g.fill();g.strokeStyle='#4df5ff';g.lineWidth=2;g.stroke();g.fillStyle='rgba(45,235,245,.65)';g.beginPath();g.moveTo(28,689);g.arc(28,689,18,-Math.PI/2,-Math.PI/2+Math.PI*2*percent);g.closePath();g.fill();}
  }
  drawNativeTowerBar(t){
    const g=this.ctx,s=this.assets.strings??{},stem=t.type[0]+t.type.slice(1).toLowerCase(),name=s[`${stem}TowerName`]??`${stem} Tower`,desc=s[`${stem}TowerDesc${t.level}`]??`Level ${t.level} ${name}`;
    if(this.assets.towerBar)g.drawImage(this.assets.towerBar,0,646,480,154);else{g.fillStyle='#053a54';g.fillRect(0,646,480,154);}g.fillStyle='#dfffff';g.font='700 13px system-ui';g.textAlign='center';g.fillText(`$${this.cash}`,240,676);this.drawTowerSprite(t.type,t.level,40,755,64);g.textAlign='left';g.fillStyle='#fff';g.font='700 14px system-ui';g.fillText(name,10,710);g.fillStyle='#b7d4df';g.font='12px system-ui';this.drawWrapped(desc,75,734,220,13,3);
    let status='';if(t.type==='POP')status=`${s.Energy??'Energy'}: ${Math.floor(t.energy)} / ${250*t.level}  ${(t.energy/(250*t.level)*100).toFixed(1)}%`;else if(t.link?.type==='POP'&&BOOST_CAPACITY[t.type]){const cap=BOOST_CAPACITY[t.type](t.level);status=`${s.Boost??'Boost'}: ${Math.floor(t.boost)} / ${cap}  ${(t.boost/cap*100).toFixed(1)}%`;}if(status){g.fillStyle='#73efff';g.font='11px system-ui';g.fillText(status,75,785);}
    if(t.upgradeRemaining>0){g.fillStyle='#dfffff';g.font='700 13px system-ui';g.textAlign='center';g.fillText(s.Upgrading??'Upgrading',380,726);return;}
    if(t.level<7){const price=upgradeCost(t.cost,t.level),enabled=this.cash>=price;g.globalAlpha=enabled?1:.28;if(this.assets.towers){g.save();g.globalCompositeOperation='lighter';g.drawImage(this.assets.towers,3*64,0,64,64,304,698,96,96);g.restore();}else this.drawHudGlyph('upgrade',352,734,18);g.fillStyle='#fff';g.font='700 11px system-ui';g.textAlign='center';g.fillText(`$${price}`,352,770);g.globalAlpha=1;}
    if(this.assets.towers){g.save();g.globalCompositeOperation='lighter';g.drawImage(this.assets.towers,(t.type==='POP'?4:2)*64,0,64,64,392,698,96,96);g.restore();}else this.drawHudGlyph(t.type==='POP'?'detonate':'sell',440,734,18);if(t.type!=='POP'){g.fillStyle='#fff';g.font='700 11px system-ui';g.textAlign='center';g.fillText(`$${Math.floor(t.value/2)}`,440,770);}
  }

  hexFill(q,r,fill,stroke){const {x,y}=hexCenter(q,r),radius=24;this.ctx.beginPath();for(let i=0;i<6;i++){const a=Math.PI/3*i,xp=x+Math.cos(a)*radius,yp=y+Math.sin(a)*radius;i?this.ctx.lineTo(xp,yp):this.ctx.moveTo(xp,yp);}this.ctx.closePath();this.ctx.fillStyle=fill;this.ctx.fill();this.ctx.strokeStyle=stroke;this.ctx.lineWidth=2;this.ctx.stroke();}
  drawHoneycombGrid(){const g=this.ctx,alpha=Math.max(.06,(this.hexBrightness??.25)*.5);g.save();g.globalCompositeOperation='lighter';g.globalAlpha=alpha;g.strokeStyle='#1f6f9a';g.lineWidth=1;for(let q=0;q<14;q++)for(let r=0;r<15;r++){const {x,y}=hexCenter(q,r);g.beginPath();for(let i=0;i<6;i++){const a=Math.PI/3*i,xp=x+Math.cos(a)*24,yp=y+Math.sin(a)*24;i?g.lineTo(xp,yp):g.moveTo(xp,yp);}g.closePath();g.stroke();}g.restore();}
  drawTowerGlyph(type,x,y,size){const g=this.ctx,col=TOWER_STATS[type]?.color??'#fff',r=size*.32;g.save();g.globalCompositeOperation='lighter';g.translate(x,y);g.strokeStyle=col;g.fillStyle=col;g.lineWidth=Math.max(1.5,size*.05);g.beginPath();g.arc(0,0,r,0,Math.PI*2);g.stroke();g.beginPath();g.arc(0,0,r*.4,0,Math.PI*2);g.fill();if(type==='THUMP'){g.fillRect(-r*.9,-2,r*1.8,4);g.fillRect(-2,-r*.9,4,r*1.8);}else if(type==='POP'){for(let i=0;i<4;i++){g.rotate(Math.PI/2);g.fillRect(-1.5,-r,3,r*.55);}}else{g.fillRect(-2,-r,4,r*.7);}g.restore();}
  drawTowerVector(t,p){const g=this.ctx,col=TOWER_STATS[t.type]?.color??'#fff';g.save();g.globalCompositeOperation='lighter';g.translate(p.x,p.y);g.fillStyle='rgba(8,16,30,.85)';g.beginPath();g.arc(0,0,15,0,Math.PI*2);g.fill();g.strokeStyle=col;g.lineWidth=2;g.beginPath();g.arc(0,0,15,0,Math.PI*2);g.stroke();g.save();if(['BLASTER','LASER','MISSILE'].includes(t.type))g.rotate((t.heading??0)+Math.PI/2);else if(t.type==='SHOCK'||t.type==='POP')g.rotate(t.rotation??0);else if(t.type==='THUMP')g.rotate(Math.PI/4);g.fillStyle=col;if(t.type==='POP'){for(let i=0;i<4;i++){g.rotate(Math.PI/2);g.fillRect(-2,-14,4,10);}}else if(t.type==='THUMP'){g.fillRect(-11,-3,22,6);g.fillRect(-3,-11,6,22);}else if(t.type==='SHOCK'){g.fillRect(-1.5,-15,3,15);g.beginPath();g.arc(0,0,4,0,Math.PI*2);g.fill();}else{g.fillRect(-2.5,-16,5,16);}g.restore();g.fillStyle=col;g.beginPath();g.arc(0,0,5,0,Math.PI*2);g.fill();const lv=Math.min(7,t.level);for(let i=0;i<lv;i++){const a=-Math.PI/2+i/7*Math.PI*2;g.beginPath();g.arc(Math.cos(a)*19,Math.sin(a)*19,1.6,0,Math.PI*2);g.fill();}g.restore();}
  drawCreepVector(c,size){const g=this.ctx,col=CREEP_COLORS[c.type]??'#ff5bda',rot=c.rotation??0,r=size/2;g.save();g.globalCompositeOperation='lighter';g.translate(c.x,c.y);g.fillStyle=col;g.strokeStyle=col;g.lineWidth=Math.max(1.2,size*.08);const poly=pts=>{g.beginPath();pts.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();};switch(c.type){case 'CHOMPER':g.rotate(rot);poly([[r,0],[-r*.8,r*.8],[-r*.35,0],[-r*.8,-r*.8]]);g.fill();break;case 'SPINNER':g.rotate(rot*3);for(let i=0;i<4;i++){g.rotate(Math.PI/2);poly([[0,-r],[r*.28,-r*.3],[0,-r*.1],[-r*.28,-r*.3]]);g.fill();}break;case 'WIGGLE':{g.rotate(rot);g.beginPath();for(let i=0;i<=24;i++){const a=i/24*Math.PI*2,rr=r*(1+.26*Math.sin(a*3+this.visualTime*6)),x=Math.cos(a)*rr*1.15,y=Math.sin(a)*rr*.7;i?g.lineTo(x,y):g.moveTo(x,y);}g.closePath();g.fill();break;}case 'STAR':g.rotate(rot);g.beginPath();for(let i=0;i<10;i++){const a=Math.PI/5*i-Math.PI/2,rr=i%2?r*.45:r,x=Math.cos(a)*rr,y=Math.sin(a)*rr;i?g.lineTo(x,y):g.moveTo(x,y);}g.closePath();g.fill();break;case 'CUBIC':g.rotate(rot);g.fillRect(-r*.8,-r*.8,r*1.6,r*1.6);g.save();g.rotate(Math.PI/4);g.globalAlpha=.55;g.strokeRect(-r*.6,-r*.6,r*1.2,r*1.2);g.restore();break;case 'PULSAR':{const pulse=.5+.5*Math.sin(this.visualTime*6);g.lineWidth=Math.max(1.4,size*.11);for(let k=0;k<3;k++){g.globalAlpha=(1-k*.28)*(.5+.5*pulse);g.beginPath();g.arc(0,0,r*(.4+k*.28+pulse*.15),0,Math.PI*2);g.stroke();}break;}case 'SWARM':g.rotate(rot*4);poly([[0,-r],[r*.85,r*.6],[-r*.85,r*.6]]);g.fill();break;default:g.beginPath();g.arc(0,0,r,0,Math.PI*2);g.fill();}g.restore();}
  drawHudGlyph(kind,cx,cy,r){const g=this.ctx,col=kind==='detonate'?'#c260ff':kind==='sell'?'#ffd15c':'#7dff8b';g.save();g.globalCompositeOperation='lighter';g.translate(cx,cy);g.strokeStyle=col;g.fillStyle=col;g.lineWidth=3;g.beginPath();g.arc(0,0,r,0,Math.PI*2);g.stroke();if(kind==='upgrade'){g.beginPath();g.moveTo(-r*.45,r*.2);g.lineTo(0,-r*.45);g.lineTo(r*.45,r*.2);g.stroke();g.beginPath();g.moveTo(-r*.45,r*.5);g.lineTo(0,-r*.15);g.lineTo(r*.45,r*.5);g.stroke();}else if(kind==='sell'){g.font=`700 ${Math.round(r*1.1)}px system-ui`;g.textAlign='center';g.textBaseline='middle';g.fillText('$',0,1);}else{for(let i=0;i<8;i++){const a=i/8*Math.PI*2;g.beginPath();g.moveTo(Math.cos(a)*r*.3,Math.sin(a)*r*.3);g.lineTo(Math.cos(a)*r*.85,Math.sin(a)*r*.85);g.stroke();}}g.restore();}
  strokeRing(x,y,radius,color,alpha){if(radius<=0)return;const g=this.ctx;g.save();g.globalCompositeOperation='lighter';g.globalAlpha=Math.max(0,Math.min(1,alpha));g.strokeStyle=color;g.lineWidth=3;g.beginPath();g.arc(x,y,radius,0,Math.PI*2);g.stroke();g.restore();}
  drawPath(){const path=this.level.path;if(!path||path.length<2)return;const g=this.ctx,trace=()=>{g.beginPath();g.moveTo(path[0].x,path[0].y);for(let i=1;i<path.length;i++)g.lineTo(path[i].x,path[i].y);};g.save();g.lineJoin='round';g.lineCap='round';g.strokeStyle='rgba(40,110,190,.20)';g.lineWidth=34;trace();g.stroke();g.globalCompositeOperation='lighter';g.strokeStyle='rgba(90,200,255,.35)';g.lineWidth=3;trace();g.stroke();const start=path[0],end=path[path.length-1];g.fillStyle='rgba(60,255,140,.8)';g.beginPath();g.arc(start.x,start.y,7,0,Math.PI*2);g.fill();g.fillStyle='rgba(255,80,120,.85)';g.beginPath();g.arc(end.x,end.y,7,0,Math.PI*2);g.fill();g.restore();}
  drawTower(t){const g=this.ctx,p=hexCenter(...t.cell),sy=TOWER_ROWS[t.type]??64,size=t.type==='POP'&&t.level===7?48*(t.visualScale??1):48;if(this.assets.towers){g.save();g.globalCompositeOperation='lighter';g.translate(p.x,p.y);if(t.type==='POP'||t.type==='THUMP')g.rotate(t.rotation);g.drawImage(this.assets.towers,0,sy,64,64,-size/2,-size/2,size,size);if(t.type!=='POP'){g.save();if(['BLASTER','LASER','MISSILE'].includes(t.type))g.rotate(t.heading+Math.PI/2);else if(t.type==='SHOCK')g.rotate(t.rotation);else if(t.type==='THUMP')g.rotate(Math.PI/4);g.drawImage(this.assets.towers,Math.min(7,t.level)*64,sy,64,64,-24,-24,48,48);g.restore();}if(t.type==='LASER'&&t.lockedHeading){g.save();g.rotate(Math.PI/4);g.drawImage(this.assets.towers,448,0,64,64,-48,-48,96,96);g.restore();}g.restore();}else this.drawTowerVector(t,p);if(t.type==='POP'&&t.energy>0){g.strokeStyle='#f55cff';g.lineWidth=3;g.beginPath();g.arc(p.x,p.y,21,-Math.PI/2,-Math.PI/2+Math.PI*2*t.energy/(250*t.level));g.stroke();}if(t.upgradeRemaining>0){const progress=1-t.upgradeRemaining/t.upgradeDuration;g.save();g.globalCompositeOperation='lighter';g.lineWidth=6;g.strokeStyle='#000080';g.beginPath();g.moveTo(p.x-30,p.y);g.lineTo(p.x+30,p.y);g.stroke();g.strokeStyle='#004080';g.beginPath();g.moveTo(p.x-30,p.y);g.lineTo(p.x-30+60*progress,p.y);g.stroke();g.restore();}this.drawTowerLink(t,p);}
  drawTowerLink(t,p){if(!t.link)return;const g=this.ctx,b=hexCenter(...t.link.cell),elapsed=this.sceneTime-(this.oscillatorStarts.LINK??this.sceneTime),phase=(elapsed%.5)/.25,pulse=phase<=1?.25+.5*phase:.75-.5*(phase-1),brightness=t.boosting?pulse:.25,base=t.type==='BLASTER'?[0,1,0]:t.type==='LASER'?[0,.25,1]:t.type==='MISSILE'?[1,0,0]:[1,0,1],channel=value=>Math.round(Math.min(1,value*brightness)*255);g.save();g.globalCompositeOperation='lighter';g.strokeStyle=`rgb(${channel(base[0])} ${channel(base[1])} ${channel(base[2])})`;g.lineWidth=3;g.beginPath();g.moveTo(p.x,p.y);g.lineTo(b.x,b.y);g.stroke();g.restore();}
  drawSelectionOverlay(){const t=this.selectedTower;if(!t)return;const g=this.ctx,p=hexCenter(...t.cell),range=towerRange(t.type,t.level),col=TOWER_STATS[t.type]?.color??'#4df5ff';g.save();g.globalCompositeOperation='lighter';if(this.assets.touchIndicators){g.globalAlpha=.25;g.drawImage(this.assets.touchIndicators,256,0,256,256,p.x-range,p.y-range,range*2,range*2);}else{g.globalAlpha=.12;g.fillStyle=col;g.beginPath();g.arc(p.x,p.y,range,0,Math.PI*2);g.fill();g.globalAlpha=.5;g.strokeStyle=col;g.lineWidth=2;g.beginPath();g.arc(p.x,p.y,range,0,Math.PI*2);g.stroke();}g.globalAlpha=1;g.translate(p.x,p.y);g.rotate(this.visualTime*Math.PI/2);if(this.assets.towers){g.drawImage(this.assets.towers,0,0,64,64,-40,-40,80,80);}else{g.globalAlpha=.9;g.strokeStyle='#eafcff';g.lineWidth=2;g.setLineDash([6,6]);g.beginPath();g.arc(0,0,22,0,Math.PI*2);g.stroke();g.setLineDash([]);}g.restore();}
  drawCreep(c){const g=this.ctx,s=CREEP_SPRITES[c.type]??[64,0],size=64*(c.visualScale??.375);if(this.assets.creeps){const draw=rotation=>{g.save();g.globalCompositeOperation='lighter';g.translate(c.x,c.y);g.rotate(rotation);g.drawImage(this.assets.creeps,s[0],s[1],64,64,-size/2,-size/2,size,size);g.restore();};draw(c.rotation??0);if(c.type==='CUBIC')draw(-(c.rotation??0));}else this.drawCreepVector(c,size);if(this.healthBars&&c.type!=='SWARM'){g.fillStyle='rgba(0,0,0,.8)';g.fillRect(c.x-7.5,c.y-15,15,2);g.fillStyle=c.health/c.maxHealth>.4?'#72ff55':'#ff4e55';g.fillRect(c.x-7.5,c.y-15,15*Math.max(0,c.health/c.maxHealth),2);}}
  drawProjectile(p){const g=this.ctx;if(p.type==='LASER'){const side={x:-Math.sin(p.heading)*p.yOffset,y:Math.cos(p.heading)*p.yOffset},start={x:p.x+side.x+Math.cos(p.heading)*21,y:p.y+side.y+Math.sin(p.heading)*21},end={x:start.x+Math.cos(p.heading)*1600,y:start.y+Math.sin(p.heading)*1600},tone=Math.floor(Math.random()*256);g.save();g.globalCompositeOperation='lighter';if(p.level===7){g.strokeStyle='#00001a';g.lineWidth=10;g.beginPath();g.moveTo(start.x,start.y);g.lineTo(end.x,end.y);g.stroke();g.strokeStyle=`rgb(255 ${tone} 255)`;g.lineWidth=2;}else{g.strokeStyle=`rgb(${tone} ${tone} 255)`;g.lineWidth=1;}g.beginPath();g.moveTo(start.x,start.y);g.lineTo(end.x,end.y);g.stroke();g.restore();return;}if(p.type==='SHOCK'){if(!p.target)return;g.save();g.globalCompositeOperation='lighter';g.strokeStyle='#fff35c';g.beginPath();g.moveTo(p.x,p.y);for(let i=1;i<=20;i++){const f=i/20;g.lineTo(p.x+(p.target.x-p.x)*f+(i<20?(Math.random()-.5)*8:0),p.y+(p.target.y-p.y)*f+(i<20?(Math.random()-.5)*8:0));}g.stroke();g.restore();return;}if(p.type==='ENERGY_WALL'){const dx=p.x2-p.x,dy=p.y2-p.y,length=Math.hypot(dx,dy),nx=-dy/length,ny=dx/length,segments=Math.min(100,Math.max(2,Math.floor(length/8))),top=[],bottom=[];for(let i=0;i<segments;i++){const f=i/(segments-1),envelope=1-(Math.abs(f-.5)+.5),jitter=envelope*(Math.random()*20-10)*1.5,cx=p.x+dx*f+nx*jitter,cy=p.y+dy*f+ny*jitter;top.push({x:cx+nx*10,y:cy+ny*10});bottom.push({x:cx-nx*10,y:cy-ny*10});}g.save();g.globalCompositeOperation='lighter';g.globalAlpha=Math.min(1,p.life*4);g.fillStyle='#7f23ac';g.beginPath();g.moveTo(top[0].x,top[0].y);for(const point of top.slice(1))g.lineTo(point.x,point.y);for(const point of bottom.reverse())g.lineTo(point.x,point.y);g.closePath();g.fill();g.strokeStyle='#f5c7ff';g.lineWidth=2;g.beginPath();for(let i=0;i<top.length;i++){const cx=(top[i].x+bottom[bottom.length-1-i].x)/2,cy=(top[i].y+bottom[bottom.length-1-i].y)/2;i?g.lineTo(cx,cy):g.moveTo(cx,cy);}g.stroke();g.restore();return;}if(p.type==='POP_WAVE'){for(const ring of p.rings??[]){const rad=Math.max(0,p.radius+ring.offset);if(!this.drawTintedTouchFrame(p.x,p.y,rad,ring.color,ring.rotation,1))this.strokeRing(p.x,p.y,rad,ring.color,1);}return;}if(p.type==='THUMP'){const alpha=p.radius<=48?1:Math.max(0,(60-p.radius)/12);if(!this.drawTintedTouchFrame(p.x,p.y,p.radius,p.color??'#ff00ff',p.rotation??0,alpha))this.strokeRing(p.x,p.y,p.radius,p.color??'#ff00ff',alpha);return;}const lo=[0,0,1,1,2,2,3][p.level-1]??0,sy=p.type==='MISSILE'?16:0,size=p.type==='MISSILE'?24:p.level===7?24:12;if(this.assets.shots){g.save();g.globalCompositeOperation='lighter';g.translate(p.x,p.y);if(p.type==='MISSILE'&&p.level===7){g.save();g.rotate(Math.random()*Math.PI*2);const flareSize=Math.random()*60;g.drawImage(this.assets.shots,lo*16,sy,16,16,-flareSize/2,-flareSize/2,flareSize,flareSize);g.restore();}g.rotate(p.heading);g.drawImage(this.assets.shots,lo*16,sy,16,16,-size/2,-size/2,size,size);g.restore();}else{g.save();g.globalCompositeOperation='lighter';g.fillStyle=p.type==='MISSILE'?'#ff4778':'#55ff84';g.beginPath();g.arc(p.x,p.y,size/4,0,Math.PI*2);g.fill();g.restore();}}
}
