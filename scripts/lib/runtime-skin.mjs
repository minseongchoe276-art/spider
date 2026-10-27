import fs from 'node:fs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
export async function loadRuntimeSkin(mode='web'){
 const raw=fs.readFileSync(`public/models/appearance-${mode}.glb`),length=raw.readUInt32LE(12),json=JSON.parse(raw.subarray(20,20+length));
 json.buffers[0].uri=`data:application/octet-stream;base64,${raw.subarray(28+length).toString('base64')}`;
 delete json.images;delete json.textures;json.materials=[];json.meshes.forEach(mesh=>mesh.primitives.forEach(part=>delete part.material));
 const asset=await new GLTFLoader().parseAsync(JSON.stringify(json),''),mesh=asset.scene.getObjectByProperty('isSkinnedMesh',true);
 return {geometry:mesh.geometry,bones:mesh.skeleton.bones.map(b=>b.name)};
}
export function useRuntimeSkin(c,skin){
 const mesh=c.model.getObjectByProperty('isSkinnedMesh',true);
 if(mesh.skeleton.bones.some((b,i)=>b.name!==skin.bones[i]))throw Error('Appearance bone order differs from runtime skeleton');
 mesh.geometry=skin.geometry;
}
