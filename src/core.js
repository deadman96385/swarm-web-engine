export const TOWER_STATS = {
  BLASTER: { color:'#55ff84', baseRange:75, damage:[10,15,10,12,10,12,400], shots:[1,1,2,2,3,3,1], cooldown:[.5,.5,.5,.5,.5,.5,4] },
  LASER:   { color:'#29aaff', baseRange:150, damage:[16,24,16,19,16,20,75], shots:[1,1,2,2,3,3,1], cooldown:[2,2,2,2,2,2,2], pulses:3, beam:true },
  MISSILE: { color:'#ff4778', baseRange:105, damage:[150,160,170,180,190,200,500], shots:[1,1,1,1,1,1,1], cooldown:[3.5,3,2.5,2,1.5,1,4], missile:true },
  SHOCK:   { color:'#fff35c', baseRange:75, damage:[0,0,0,0,0,0,0], shots:[1,1,2,2,3,3,4], cooldown:[1.5,1.5,1.5,1.5,1.5,1.5,1.5], shock:true },
  POP:     { color:'#c260ff', baseRange:100, damage:[0,0,0,0,0,0,0], shots:[0,0,0,0,0,0,0], cooldown:[0,0,0,0,0,0,0], vortex:true },
  THUMP:   { color:'#ff55ed', baseRange:60, damage:[20,30,20,24,20,24,30], shots:[1,1,2,2,2,2,4], cooldown:[1.5,1.5,1.5,1.5,1.5,1.5,1.5], thump:true }
};

export function towerRange(type,level){const s=TOWER_STATS[type]??TOWER_STATS.BLASTER;if(type==='BLASTER'&&level===7)return s.baseRange*3;if((type==='LASER'||type==='MISSILE'||type==='SHOCK'||type==='THUMP')&&level===7)return s.baseRange*2;return s.baseRange*(1+level*(type==='POP'?.1:.05));}
export function levelValue(values,level){return values[Math.max(0,Math.min(6,level-1))];}
export function upgradeCost(baseCost,level){return Math.floor(baseCost*level/2);}
export function creepHealth(baseHealth,wave,factor,factor2=0,hardcore=false){const n=wave-1,step=factor2===0?Math.floor(n*factor):Math.floor(n*factor*(n*factor2));return Math.max(1,Math.floor((baseHealth+baseHealth*step)*(hardcore?1:.75)));}
export function creepSpeed(baseSpeed,wave,factor){return baseSpeed+baseSpeed*(wave-1)*(factor-1);}
export function killCash(wave,factor){return Math.trunc(1+(wave-1)*factor);}

export function cellKey(q, r) { return `${q},${r}`; }
export function parseCell(value) { return value.split(',').map(Number); }
export function hexCenter(q, r) { return { x:8 + q * 36, y:26 + r * 44 + (q % 2 === 0 ? 22 : 0) }; }

// The original geoDefense fixed-path levels are authored in the iPhone 320x480
// portrait space. Map that logical area into the web engine's 480x800 play
// field (below the score bar at y=32, above the build bar at y=646), preserving
// aspect: uniform 1.279 scale centered horizontally. Spawn/exit points authored
// off-screen (negative or >320/480) land outside the field, so creeps stream in.
export const PATH_SCALE = 1.279, PATH_OFFSET_X = 35, PATH_OFFSET_Y = 32;
export function scalePathPoint(x, y) { return { x: PATH_OFFSET_X + x * PATH_SCALE, y: PATH_OFFSET_Y + y * PATH_SCALE }; }
function distanceToSegment(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
  if (!len) return Math.hypot(px - a.x, py - a.y);
  const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}
// Hexes the creep route passes through cannot hold a tower (mirrors the
// original's "can't build on the path" rule via checkCanPathEvenIfBlockedHex:).
export function pathBlockedHexes(path, cols = 14, rows = 15, radius = 24) {
  const blocked = new Set();
  for (let q = 0; q < cols; q++) for (let r = 0; r < rows; r++) {
    const c = hexCenter(q, r);
    for (let i = 1; i < path.length; i++) if (distanceToSegment(c.x, c.y, path[i - 1], path[i]) <= radius) { blocked.add(cellKey(q, r)); break; }
  }
  return blocked;
}
export function pixelToHex(x, y, cols=14, rows=15) {
  let best=null, distance=Infinity;
  for(let q=0;q<cols;q++) for(let r=0;r<rows;r++) {
    const p=hexCenter(q,r), d=(p.x-x)**2+(p.y-y)**2;
    if(d<distance){distance=d;best=[q,r];}
  }
  return distance <= 26**2 ? best : null;
}
export function neighbors(q,r) {
  const offset=q%2===1?-1:0;
  return [[0,-1],[1,offset],[1,1+offset],[0,1],[-1,1+offset],[-1,offset]].map(([dq,dr])=>[q+dq,r+dr]);
}

function mangoSort(array,left,right,compare,depth=32){
  do{
    if(depth===0){array.sort(compare);return;}
    let i=left,j=right;const middle=i+((j-i)>>1),swap=(a,b)=>{const value=array[a];array[a]=array[b];array[b]=value;},swapIfGreater=(a,b)=>{if(a!==b&&compare(array[a],array[b])>0)swap(a,b);};
    swapIfGreater(i,middle);swapIfGreater(i,j);swapIfGreater(middle,j);const pivot=array[middle];
    do{while(compare(array[i],pivot)<0)i++;while(compare(pivot,array[j])<0)j--;if(i>j)break;if(i<j)swap(i,j);i++;j--;}while(i<=j);
    depth--;if(j-left<=right-i){if(left<j)mangoSort(array,left,j,compare,depth);left=i;}else{if(i<right)mangoSort(array,i,right,compare,depth);right=j;}
  }while(left<right);
}

export function findNextCell(start,goal,blocked,cols=14,rows=15){
  if(cellKey(...start)===cellKey(...goal))return null;
  const records=new Map();for(let q=0;q<cols;q++)for(let r=0;r<rows;r++)records.set(cellKey(q,r),{cell:[q,r],cost:0,parent:null,opened:false,closed:false});
  const startRecord=records.get(cellKey(...start)),goalRecord=records.get(cellKey(...goal));if(!startRecord||!goalRecord)return null;startRecord.opened=true;startRecord.closed=true;const open=[startRecord];let count=1;
  while(count>0){if(count>1)mangoSort(open,0,count-1,(a,b)=>(b.cost-a.cost)*100);const current=open[count-1];if(current===goalRecord){let step=current;while(step.parent!==startRecord)step=step.parent;return [...step.cell];}current.closed=true;current.opened=false;count--;
    for(const cell of neighbors(...current.cell)){const [q,r]=cell,key=cellKey(q,r),next=records.get(key);if(q<0||r<0||q>=cols||r>=rows||!next||next.opened||next.closed||blocked.has(key))continue;next.parent=current;next.cost=current.cost+1;open[count++]=next;next.opened=true;}
  }
  return null;
}

export function findPath(start, goal, blocked, cols=14, rows=15) {
  const path=[[...start]],seen=new Set([cellKey(...start)]);let current=[...start];while(cellKey(...current)!==cellKey(...goal)){const next=findNextCell(current,goal,blocked,cols,rows);if(!next||seen.has(cellKey(...next)))return null;path.push(next);seen.add(cellKey(...next));current=next;}return path;
}

export function parseLevel(xml, sourceName='', difficulty=null, campaign='swarm') {
  const doc=new DOMParser().parseFromString(xml,'application/xml');
  if(doc.querySelector('parsererror')) throw new Error(`Invalid level XML: ${sourceName}`);
  const attr=(el,name,fallback='')=>el?.getAttribute(name)??fallback;
  const info=doc.querySelector('info');
  const pathEl=doc.querySelector('creepPath');
  const path=pathEl?[...pathEl.querySelectorAll('point')].map(p=>scalePathPoint(Number(attr(p,'x','0')),Number(attr(p,'y','0')))):null;
  const pathMode=!!(path&&path.length>1);
  const pathBlocked=pathMode?pathBlockedHexes(path):null;
  const spawns=[...doc.querySelectorAll('spawnhex')].map(el=>({name:attr(el,'name'),cell:parseCell(attr(el,'hex')),exitName:attr(el,'exit')}));
  const exits=new Map([...doc.querySelectorAll('exithex')].map(el=>[attr(el,'name'),parseCell(attr(el,'hex'))]));
  const creepRoot=doc.querySelector('creeps'), waveRoot=doc.querySelector('creepWaves');
  const specials=[...doc.querySelectorAll('specialhex')].map(el=>({type:attr(el,'type'),hex:attr(el,'hex')}));
  const waves=[...doc.querySelectorAll('creepWaves > wave')].map(el=>({spawnName:attr(el,'spawnHex',spawns[0]?.name),concurrent:attr(el,'concurrent','false').toLowerCase()==='true',groups:[...el.querySelectorAll('spawn')].map(s=>({type:attr(s,'type'),count:Number(attr(s,'count','1'))}))}));
  const overrides=new Set([...specials.map(s=>s.hex),...spawns.map(s=>cellKey(...s.cell)),...exits.values()].map(v=>Array.isArray(v)?cellKey(...v):v)),boundary=[];for(let q=0;q<14;q++)for(let r=0;r<15;r++)if((q===0||q===13||r===0||r===14)&&!overrides.has(cellKey(q,r)))boundary.push(cellKey(q,r));
  return {
    sourceName, campaign,
    difficulty: difficulty ?? (/_E_/.test(sourceName)?'Easy':/_M_/.test(sourceName)?'Medium':'Hard'),
    name:attr(info,'name','Untitled swarm'), id:Number(attr(info,'id','0')),
    cash:Number(attr(info,'initCash','0')), lives:Number(attr(info,'initLives','10')),
    description:attr(info,'description').replaceAll('\r',' '),
    pathMode, path, exitPoint:pathMode?path[path.length-1]:null,
    blocked:pathMode?pathBlocked:new Set([...boundary,...specials.filter(s=>s.type==='blocked').map(s=>s.hex)]),
    pass:new Set(specials.filter(s=>s.type.endsWith('pass')).map(s=>s.hex)),
    fast:new Set(specials.filter(s=>s.type==='fastpass').map(s=>s.hex)),
    heal:new Set(specials.filter(s=>s.type==='healpass').map(s=>s.hex)),
    placed:[...doc.querySelectorAll('placetower')].map(el=>({type:attr(el,'type'),cell:parseCell(attr(el,'hex'))})),
    spawns:spawns.map(s=>({...s,exit:exits.get(s.exitName)??[13,7]})), exits,
    creeps:Object.fromEntries([...doc.querySelectorAll('creeps > creep')].map(el=>[attr(el,'type'),{speed:Number(attr(el,'speed','30')),health:Number(attr(el,'health','50'))}])),
    waveHealthFactor:Number(attr(creepRoot,'waveHealthFactor','1.25')),
    waveHealthFactor2:Number(attr(creepRoot,'waveHealthFactor2','0')),
    waveSpeedFactor:Number(attr(creepRoot,'waveSpeedFactor','1')),
    waveWealthFactor:Number(attr(creepRoot,'waveWealthFactor','1')),
    delayBetweenWaves:Number(attr(waveRoot,'delayBetweenWaves','20')),
    delayBetweenSpawns:Number(attr(waveRoot,'delayBetweenSpawns','1')),
    endless:attr(waveRoot,'endless','false').toLowerCase()==='true',
    waves, apparentWaves:waves.filter(w=>!w.concurrent).length,
    tutorial:attr(info,'Tutorial').toLowerCase(),
    towers:[...doc.querySelectorAll('towers > tower')].map(el=>({type:attr(el,'type'),cost:Number(attr(el,'cost','0'))}))
  };
}
