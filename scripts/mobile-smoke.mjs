import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..'),output=resolve(root,'.visual'),session='swarm-mobile',url='http://127.0.0.1:4176';
const cli=resolve(root,'node_modules/agent-browser/bin/agent-browser.js');
function command(program,args,options={}){return new Promise((resolvePromise,reject)=>{const child=spawn(program,args,{cwd:root,windowsHide:true,...options});let stdout='',stderr='';child.stdout?.on('data',value=>stdout+=value);child.stderr?.on('data',value=>stderr+=value);child.on('error',reject);child.on('exit',code=>code===0?resolvePromise(stdout.trim()):reject(new Error(`${program} ${args.join(' ')} failed (${code})\n${stderr||stdout}`)));});}
const browser=(...args)=>command(process.execPath,[cli,'--session',session,...args]);
async function waitForServer(){for(let i=0;i<80;i++){try{const response=await fetch(url);if(response.ok)return;}catch{}await new Promise(resolvePromise=>setTimeout(resolvePromise,100));}throw new Error(`Server did not become ready at ${url}`);}

await mkdir(output,{recursive:true});
const server=spawn(process.execPath,['scripts/serve.mjs'],{cwd:root,env:{...process.env,PORT:'4176'},windowsHide:true,stdio:['ignore','pipe','pipe']});
try{
  await waitForServer();
  await browser('open',url);
  await browser('set','viewport','390','844');
  await browser('wait','#mainMenuScreen');
  await browser('eval',"(()=>{const menu=document.querySelector('#mainMenuScreen').getBoundingClientRect();if(getComputedStyle(document.querySelector('header')).display!=='none')throw new Error('mobile header is visible');if(menu.top>1||menu.height>844)throw new Error(`menu bounds ${menu.top}/${menu.height}`);return 'mobile menu fits';})()");
  await browser('screenshot',resolve(output,'mobile-01-menu.png'));
  await browser('wait','500');
  await browser('click','#menuOptions');
  await browser('wait','#menuDialogBody');
  if(!(await browser('get','text','#menuDialogBody')).includes('Install game'))throw new Error('Chromium did not expose the install prompt for the PWA.');
  await browser('click','#closeMenuDialog');
  await browser('eval',"Object.defineProperties(navigator,{userAgent:{configurable:true,get:()=>\"Mozilla/5.0 (Linux; Android 15; SM-S938U) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36\"},platform:{configurable:true,get:()=>\"Linux armv8l\"},vendor:{configurable:true,get:()=>\"Google Inc.\"},maxTouchPoints:{configurable:true,get:()=>5}});localStorage.removeItem('swarm-web-android-install-dismissed-v1');sessionStorage.removeItem('swarm-web-android-install-shown');");
  await browser('click','#menuSwarm');
  await browser('wait','#levelGrid .level-card');
  if(!(await browser('is','visible','#installSuggestionPrompt')).includes('true'))throw new Error('Android install suggestion did not appear on mission-select entry.');
  if(!(await browser('get','text','#installSuggestionCopy')).includes('optional'))throw new Error('Android install suggestion did not use optional wording.');
  if(!(await browser('get','text','#installSuggestionBenefits')).includes('Works offline'))throw new Error('Android install benefits are missing.');
  if(!(await browser('is','visible','#acceptInstallSuggestion')).includes('true'))throw new Error('Android install suggestion did not expose the native install action.');
  await browser('screenshot',resolve(output,'mobile-01a-android-install.png'));
  await browser('click','#dismissInstallSuggestion');
  if(!(await browser('is','visible','#installSuggestionPrompt')).includes('false'))throw new Error('Android install suggestion did not dismiss.');
  await browser('eval',"(()=>{const level=document.querySelector('#levelScreen').getBoundingClientRect();if(level.top>1||level.bottom>845)throw new Error(`level bounds ${level.top}/${level.bottom}`);return 'level screen fits';})()");
  await browser('screenshot',resolve(output,'mobile-02-levels.png'));
  await browser('click','#levelGrid .level-card');
  await browser('wait','#playMission');
  await browser('screenshot',resolve(output,'mobile-03-pregame.png'));
  await browser('click','#playMission');
  if((await browser('is','visible','#tutorialOverlay')).includes('true'))await browser('click','#closeTutorial');
  await browser('wait','250');
  if(!(await browser('is','visible','#toggleDesktopPanel')).includes('false'))throw new Error('Desktop controls toggle is visible at phone width.');
  await browser('eval',"(()=>{const canvas=document.querySelector('#game').getBoundingClientRect();if(canvas.top>1||canvas.right>391||canvas.bottom>845)throw new Error(`canvas bounds ${canvas.top}/${canvas.right}/${canvas.bottom}`);return 'game board fits';})()");
  await browser('screenshot',resolve(output,'mobile-04-game.png'));
  await browser('set','viewport','834','1112');
  await browser('wait','100');
  if(!(await browser('is','visible','#toggleDesktopPanel')).includes('true'))throw new Error('Desktop controls toggle is hidden at tablet width.');
  await browser('click','#toggleDesktopPanel');
  if(!(await browser('is','visible','.controls')).includes('true'))throw new Error('Desktop controls panel did not open at tablet width.');
  await browser('screenshot',resolve(output,'mobile-05-tablet-controls.png'));
  server.kill();
  await browser('wait','300');
  await browser('reload');
  await browser('wait','#mainMenuScreen');
  await browser('screenshot',resolve(output,'mobile-06-offline.png'));
  console.log(`Mobile visual smoke artifacts: ${output}`);
}finally{
  await browser('close').catch(()=>{});
  server.kill();
}
