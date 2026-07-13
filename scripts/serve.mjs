import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname,join,normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=normalize(join(fileURLToPath(new URL('.',import.meta.url)),'..'));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const relative=pathname==='/'?'index.html':decodeURIComponent(pathname).replace(/^\//,'');
  if(!/^(index\.html|styles\.css|src\/[a-z-]+\.js)$/.test(relative)){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');return;}
  const file=join(root,relative);
  try{const info=await stat(file);res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-store'});if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end('Not found');}
});
server.listen(Number(process.env.PORT??4173),'127.0.0.1',()=>console.log('Swarm Web Engine: http://127.0.0.1:4173'));
