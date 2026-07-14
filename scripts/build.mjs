import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root=dirname(dirname(fileURLToPath(import.meta.url))),dist=join(root,'dist');
// The bundled data modules are required for a playable build; fail loudly if the
// one-time extraction was never run/committed.
for(const f of ['src/bundled-levels.js','src/bundled-strings.js'])if(!existsSync(join(root,f))){console.error(`Missing ${f} — run "npm run extract-data" (needs the original archives) and commit the result.`);process.exit(1);}
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
await Promise.all(['index.html','styles.css'].map(file=>cp(join(root,file),join(dist,file))));
await cp(join(root,'src'),join(dist,'src'),{recursive:true});
// Serve the files verbatim on static hosts (e.g. GitHub Pages) without Jekyll processing.
await writeFile(join(dist,'.nojekyll'),'');
console.log('Built dependency-free static site in dist/ (bundled levels + strings, procedural art/audio)');
