import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { openZip } from '../src/zip.js';
import { loadArchiveStrings, parseDotNetResources } from '../src/resources.js';

test('the browser ZIP reader opens the preserved XAP and inflates its external data',async()=>{
  const data=await readFile(new URL('../archive/geoDefense%20Swarm%20v1.0.23.0.xap',import.meta.url));
  const archive=await openZip({arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)});
  const levels=archive.names.filter(n=>/^Content\/MainLevels\/GAME_LEVEL_[EMH]_\d+\.xml$/.test(n));
  assert.equal(levels.length,30);
  const xml=await archive.text('Content/MainLevels/GAME_LEVEL_E_0001.xml');
  assert.match(xml,/<info name="Beginner Swarm"/);
  const png=await archive.bytes('Content/Towers.png');
  assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  const english=parseDotNetResources(await archive.bytes('geoLib.dll'));
  const german=parseDotNetResources(await archive.bytes('de/geoLib.resources.dll'));
  assert.match(english.EasyLevels,/Easy/i);
  assert.equal(german.Upgrading,'Aktualisieren');
  const tutorials=await loadArchiveStrings(archive,'de');
  assert.equal(tutorials.T1_META,'3');
  assert.match(tutorials.T1_1,/Fieslinge/);
  assert.equal(tutorials.Upgrading,'Aktualisieren');
});

test('the optional iOS archive exposes browser-playable external WAV audio',async()=>{
  const data=await readFile(new URL('../archive/geodefenseswarm-v1.3.ipa',import.meta.url));
  const archive=await openZip({arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)});
  const sounds=archive.names.filter(n=>/\/(BlasterShot|LaserShot3|LaserBeam|Missile|Photon|David_EnemyPop|DeepThrob|PowerDown|MenuButton|Countdown_FemaleComputer_\d+)\.wav$/i.test(n));
  assert.equal(sounds.length,19);
  const wav=await archive.bytes(sounds.find(n=>n.endsWith('/BlasterShot.wav')));
  assert.equal(new TextDecoder().decode(wav.subarray(0,4)),'RIFF');
});
