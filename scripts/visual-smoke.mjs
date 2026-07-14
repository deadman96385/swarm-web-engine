import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..'),output=resolve(root,'.visual'),session='swarm-visual',url='http://127.0.0.1:4174';
const cli=resolve(root,'node_modules/agent-browser/bin/agent-browser.js');
const xap=resolve(root,'archive/geoDefense Swarm v1.0.23.0.xap'),ipa=resolve(root,'archive/geodefenseswarm-v1.3.ipa');

function command(program,args,options={}){
  return new Promise((resolvePromise,reject)=>{const child=spawn(program,args,{cwd:root,windowsHide:true,...options});let stdout='',stderr='';child.stdout?.on('data',v=>stdout+=v);child.stderr?.on('data',v=>stderr+=v);child.on('error',reject);child.on('exit',code=>code===0?resolvePromise(stdout.trim()):reject(new Error(`${program} ${args.join(' ')} failed (${code})\n${stderr||stdout}`)));});
}
const browser=(...args)=>command(process.execPath,[cli,'--session',session,...args]);

async function waitForServer(){for(let i=0;i<80;i++){try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error(`Server did not become ready at ${url}`);}

await mkdir(output,{recursive:true});
const server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:root,env:{...process.env,PORT:'4174'},windowsHide:true,stdio:['ignore','pipe','pipe']});
try{
  await waitForServer();
  await browser('open',url);
  await browser('set','viewport','1440','1000');
  // The engine auto-boots to the menu from bundled data — no upload required.
  await browser('wait','#mainMenuScreen');
  await browser('screenshot',resolve(output,'00-main-menu-bundled.png'),'--full');
  // If the optional originals are present, exercise the archive-import override.
  if(existsSync(xap)){await browser('upload','#archiveInput',...(existsSync(ipa)?[xap,ipa]:[xap]));await browser('wait','#mainMenuScreen');}
  await browser('screenshot',resolve(output,'01-main-menu.png'),'--full');
  await writeFile(resolve(output,'01-main-menu.snapshot.txt'),await browser('snapshot','-i'));
  await browser('eval',"[...document.querySelectorAll('#expansionButtons button')].find(b=>/Procedural Swarm/.test(b.textContent)).click()");
  await browser('wait','#proceduralTools');
  if(!(await browser('get','count','#levelGrid .level-card')).includes('4'))throw new Error('Procedural Swarm did not present four generated missions.');
  await browser('screenshot',resolve(output,'01a-procedural-swarm.png'),'--full');
  await browser('click','#proceduralRandom');
  await browser('click','#rerollProcedural');
  await browser('eval',"document.querySelector('#proceduralSeed').value='A1B2C3D4';document.querySelector('#loadProceduralSeed').click()");
  if(!(await browser('get','text','#levelGrid')).includes('A1B2C3D4'))throw new Error('Procedural seed entry did not restore the requested mission.');
  await browser('click','#levelGrid .level-card');
  await browser('wait','#playMission');
  if(!(await browser('get','text','.pregame-seed')).includes('A1B2C3D4'))throw new Error('Procedural pre-game card lost its seed identity.');
  await browser('click','#cancelMission');
  await browser('click','#backToMenu');
  await browser('click','#menuSwarm');
  await browser('wait','#levelGrid .level-card');
  await browser('screenshot',resolve(output,'02-level-select.png'),'--full');
  await browser('click','#levelGrid .level-card');
  await browser('wait','#playMission');
  await browser('screenshot',resolve(output,'03-pre-game.png'),'--full');
  await browser('click','#playMission');
  if((await browser('is','visible','#tutorialOverlay')).includes('true')){await browser('wait','250');await browser('screenshot',resolve(output,'03a-tutorial.png'),'--full');await browser('click','#closeTutorial');}
  await browser('wait','250');
  await browser('screenshot',resolve(output,'04-gameplay.png'),'--full');
  await writeFile(resolve(output,'04-gameplay.snapshot.txt'),await browser('snapshot','-i'));
  await browser('click','#toggleDesktopPanel');
  await browser('mouse','move','530','861');
  await browser('mouse','down','left');
  await browser('mouse','move','550','520');
  await browser('wait','250');
  await browser('screenshot',resolve(output,'04a-tower-placement.png'),'--full');
  await browser('mouse','up','left');
  await browser('click','#toggleDesktopPanel');
  await browser('wait','50');
  await browser('screenshot',resolve(output,'04b-tower-built.png'),'--full');
  await browser('wait','200');
  await browser('click','#toggleDesktopPanel');
  await browser('click','#pauseGame');
  await browser('click','#toggleDesktopPanel');
  await browser('wait','300');
  await browser('screenshot',resolve(output,'04c-pause-menu.png'),'--full');
  await browser('click','#pauseResume');
  await browser('wait','300');
  await browser('wait','5100');
  await browser('click','#toggleDesktopPanel');
  await browser('click','#startWave');
  await browser('click','#toggleDesktopPanel');
  await browser('wait','1000');
  await browser('screenshot',resolve(output,'05-active-wave.png'),'--full');
  await browser('click','#toggleDesktopPanel');
  await browser('click','#backToLevels');
  await browser('wait','#levelGrid .level-card');
  await browser('click','#backToMenu');
  await browser('click','#menuSwarm');
  await browser('wait','#levelGrid .level-card');
  // Switch to the Medium difficulty tab (2nd tab) to reach the game-over mission.
  await browser('eval',"[...document.querySelectorAll('#difficultyTabs button')].find(b=>/Medium/.test(b.textContent)).click()");
  await browser('wait','#levelGrid .level-card');
  await browser('click','#levelGrid .level-card:nth-child(8)');
  await browser('wait','#playMission');
  const gameOverMission=await browser('get','text','#levelName');if(!gameOverMission.includes('A Bit of a Juggle'))throw new Error(`Failed to select the one-life game-over smoke mission; selected ${gameOverMission}.`);
  await browser('click','#playMission');
  await browser('wait','5100');
  await browser('click','#toggleDesktopPanel');
  await browser('click','#startWave');
  await browser('wait','250');
  if(!(await browser('get','text','#wave')).includes('1/1'))throw new Error('One-life game-over smoke wave did not launch.');
  await browser('click','#toggleDesktopPanel');
  await browser('wait','25000');
  await browser('screenshot',resolve(output,'06-game-over-check.png'),'--full');
  const remainingLives=await browser('get','text','#lives');if(!remainingLives.includes('0'))throw new Error(`One-life mission did not end after its first unopposed wave; lives ${remainingLives}.`);
  await browser('wait','2200');
  await browser('screenshot',resolve(output,'06-game-over.png'),'--full');
  await writeFile(resolve(output,'browser-errors.json'),await browser('errors','--json'));
  console.log(`Visual smoke artifacts: ${output}`);
}finally{
  await browser('close').catch(()=>{});
  server.kill();
}
