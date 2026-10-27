import fs from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
export async function loadCitizenRigs(){
 globalThis.ProgressEvent ||= class{};
 const manifest=JSON.parse(fs.readFileSync('public/citizens/manifest.json'));
 const assets=[];
 for(const id of ['remy','megan','louise']){const b=fs.readFileSync(`public/citizens/${id}.glb`),length=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+length));j.buffers[0].uri='data:application/octet-stream;base64,'+b.subarray(28+length).toString('base64');delete j.images;delete j.textures;j.materials=[];j.meshes.forEach(m=>m.primitives.forEach(p=>delete p.material));const g=await new GLTFLoader().parseAsync(JSON.stringify(j),'');const meta=manifest.characters.find(c=>c.id===id);assets.push({id,model:g.scene,clips:g.animations,speeds:Object.fromEntries(meta.animations.map(a=>[a.key,a.nominalSpeed]))});}
 return assets;
}
