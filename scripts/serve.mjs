import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname,join,normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root=normalize(join(fileURLToPath(new URL('.',import.meta.url)),'..'));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.png':'image/png','.svg':'image/svg+xml; charset=utf-8'};
const port=Number(process.env.PORT??4173);
const shouldOpen=process.argv.includes('--open')||process.env.OPEN==='1';

function openBrowser(url){
  const [cmd,args]=process.platform==='win32'?['cmd',['/c','start','',url]]:process.platform==='darwin'?['open',[url]]:['xdg-open',[url]];
  try{spawn(cmd,args,{stdio:'ignore',detached:true}).unref();}catch{/* opening the browser is best-effort */}
}

const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const relative=pathname==='/'?'index.html':decodeURIComponent(pathname).replace(/^\//,'');
  if(!/^(index\.html|styles\.css|manifest\.webmanifest|sw\.js|icons\/icon-(180|192|512)\.png|icons\/icon\.svg|screenshots\/android-gameplay\.png|src\/[a-z-]+\.js)$/.test(relative)){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');return;}
  const file=join(root,relative);
  try{const info=await stat(file);res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-store'});if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end('Not found');}
});
server.on('error',err=>{
  if(err.code==='EADDRINUSE'){console.error(`Port ${port} is already in use. Stop the other server, or pick a free port: PORT=4174 npm start`);process.exit(1);}
  throw err;
});
server.listen(port,'127.0.0.1',()=>{
  const url=`http://127.0.0.1:${port}`;
  console.log(`Swarm Web Engine running at ${url}`);
  console.log('Load your own .xap (and optional .ipa) in the page to play. Press Ctrl+C to stop.');
  if(shouldOpen)openBrowser(url);
});
