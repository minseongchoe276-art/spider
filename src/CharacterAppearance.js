import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {fetchAsset} from './AssetLoader.js';

// The model files keep stable public paths. Bump this revision whenever their
// baked geometry is regenerated so browsers and edge caches cannot reuse the old rigs.
const APPEARANCE_REVISION='shadow-pulse-1';

export async function loadAppearances() {
  const entries=await Promise.all(['web'].map(async mode=>{
    const gltf=await new GLTFLoader().parseAsync(await fetchAsset(`/models/appearance-${mode}.glb?v=${APPEARANCE_REVISION}`),'/models/');
    const mesh=gltf.scene.getObjectByProperty('isSkinnedMesh',true);
    if(!mesh || mesh.skeleton.bones.length!==65)throw new Error(`Invalid ${mode} appearance rig`);
    mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
    // Only immutable geometry and the authored textures are shared with remote actors.
    return [mode,{geometry:mesh.geometry,material:mesh.material}];
  }));
  return Object.fromEntries(entries);
}

// Appearance is independent of gameplay mode, including remote actors and review tools.
export function setAppearance(character,mode='web',animate=false) {
  mode='web';
  if(!character.appearances?.[mode] || !character.model || character.appearanceMode===mode)return false;
  const mesh=character.model.getObjectByProperty('isSkinnedMesh',true);
  if(!mesh)return false;
  const asset=character.appearances[mode];
  if(character.appearanceMaterials)for(const material of character.appearanceMaterials)material.dispose();
  const materials=(Array.isArray(asset.material)?asset.material:[asset.material]).map(m=>m.clone());
  character.appearanceMaterials=materials;
  mesh.geometry=asset.geometry;mesh.material=Array.isArray(asset.material)?materials:materials[0];
  mesh.frustumCulled=false; // Posed arms can extend beyond the authored rest bounds.
  character.appearanceMode=mode;
  character.appearanceBaseGlow=materials.map(m=>({color:m.emissive.clone(),intensity:m.emissiveIntensity}));
  return true;
}

export function updateAppearance(character,delta) {
  setAppearance(character,'web',false);
}

export function disposeAppearance(character) {
  character.appearanceMaterials?.forEach(m=>m.dispose());
  character.transformEffect?.traverse(n=>{n.geometry?.dispose();});
  character.transformEffect?.children[0]?.material.dispose();character.transformEffect?.removeFromParent();
}
