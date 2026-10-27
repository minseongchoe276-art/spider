import fs from 'node:fs';
import path from 'node:path';
import {root} from './lib/release-identity.mjs';

// Ship complete license texts with both web and portable builds, offline.
export function softwareNotices(){
  const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
  const sections=['SHADOW PULSE — third-party software notices',
    'These software notices do not establish rights for characters, models, animations, map data, branding or promotional art.'];
  let packages=0;
  for(const [name,metadata] of Object.entries(lock.packages||{}).sort(([a],[b])=>a.localeCompare(b))){
    if(!name.startsWith('node_modules/')||metadata.dev||metadata.devOptional)continue;
    const folder=path.join(root,name);if(!fs.existsSync(folder))continue;
    const texts=fs.readdirSync(folder).filter(file=>/^(licen[cs]e|notice|copying)(\.|$|-)/i.test(file))
      .filter(file=>fs.statSync(path.join(folder,file)).isFile()).map(file=>`${file}:\n${fs.readFileSync(path.join(folder,file),'utf8')}`);
    // pmtiles 4.5.0 omits its upstream license text from the npm archive.
    if(name==='node_modules/pmtiles')texts.push(fs.readFileSync(path.join(root,'config/licenses/PMTiles.txt'),'utf8'));
    if(!texts.length)throw Error(`Missing distribution license text: ${name}`);
    sections.push(`${name} ${metadata.version}\nDeclared license: ${metadata.license||'See license text'}\n${texts.join('\n')}`);packages++;
  }
  sections.push('Basis Universal transcoder (unmodified files supplied by Three.js)\n'+fs.readFileSync(path.join(root,'config/licenses/Basis-Universal.txt'),'utf8'));
  sections.push('Kenney Particle Pack\n'+fs.readFileSync(path.join(root,'config/licenses/Kenney-Particle-Pack.txt'),'utf8'));
  sections.push('BMW vehicle model attribution\n'+fs.readFileSync(path.join(root,'public/vehicles/CREDITS.txt'),'utf8'));
  return {text:sections.join('\n\n----------------------------------------\n\n')+'\n',packages};
}
