import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root=dirname(dirname(fileURLToPath(import.meta.url))),dist=join(root,'dist');
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
await Promise.all(['index.html','styles.css'].map(file=>cp(join(root,file),join(dist,file))));
await cp(join(root,'src'),join(dist,'src'),{recursive:true});
// Serve the files verbatim on static hosts (e.g. GitHub Pages) without Jekyll processing.
await writeFile(join(dist,'.nojekyll'),'');
console.log('Built asset-free static site in dist/');
