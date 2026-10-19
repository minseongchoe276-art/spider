import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {fetchAsset} from './AssetLoader.js';

export async function loadAppearances() {
  const entries=await Promise.all(['web','combat'].map(async mode=>{
    const gltf=await new GLTFLoader().parseAsync(await fetchAsset(`/models/appearance-${mode}.glb`),'/models/');
    const mesh=gltf.scene.getObjectByProperty('isSkinnedMesh',true);
    if(!mesh || mesh.skeleton.bones.length!==65)throw new Error(`Invalid ${mode} appearance rig`);
    mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
    // Only immutable geometry and the authored textures are shared with remote actors.
    return [mode,{geometry:mesh.geometry,material:mesh.material}];
  }));
  return Object.fromEntries(entries);
}

export function setAppearance(character,mode,animate=true) {
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
  // The mixer, skeleton, IK, root and physics stay alive throughout the swap.
  if(character.firstPersonRig?.parent)character.setFirstPersonCamera(character.firstPersonRig.parent);
  if(animate) {
    if(!character.transformEffect){
      const group=new THREE.Group();group.name='SuitTransformation';
      const material=new THREE.MeshBasicMaterial({color:0x89eaff,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
      for(let i=0;i<2;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(.54,.018,6,64),material);ring.rotation.x=Math.PI/2;group.add(ring);}
      character.group.add(group);character.transformEffect=group;
    }
    character.transformEffect.visible=!character.isFirstPerson;character.transformTime=0;
  }
  return true;
}

export function updateAppearance(character,delta) {
  if(!character.appearances)return;
  setAppearance(character,character.combatStance?'combat':'web',!!character.appearanceMode);
  if(character.transformTime==null)return;
  character.transformTime+=Math.max(0,delta);const t=Math.min(1,character.transformTime/.42),pulse=Math.sin(Math.PI*t);
  for(let i=0;i<character.appearanceMaterials.length;i++){
    const m=character.appearanceMaterials[i],base=character.appearanceBaseGlow[i];
    m.emissive.copy(base.color).lerp(new THREE.Color(0x277fba),pulse*.65);m.emissiveIntensity=base.intensity+pulse*.9;
  }
  const effect=character.transformEffect;if(effect){effect.visible=t<1&&!character.isFirstPerson;effect.children.forEach((ring,i)=>{ring.position.y=i?2.1*(1-t):2.1*t;ring.scale.setScalar(.8+.35*pulse);ring.material.opacity=.65*pulse;});}
  if(t>=1)character.transformTime=null;
}

export function disposeAppearance(character) {
  character.appearanceMaterials?.forEach(m=>m.dispose());
  character.transformEffect?.traverse(n=>{n.geometry?.dispose();});
  character.transformEffect?.children[0]?.material.dispose();character.transformEffect?.removeFromParent();
}
