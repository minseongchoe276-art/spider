import * as THREE from 'three';
import {prepareCityFacade} from './CityFacades.js';

export function createHongKongEnvironment(renderer) {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
  const ctx=canvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,0,256);
  gradient.addColorStop(0,'#88b9d4');gradient.addColorStop(.44,'#d4e4e9');
  gradient.addColorStop(.53,'#dce1de');gradient.addColorStop(1,'#686d70');
  ctx.fillStyle=gradient;ctx.fillRect(0,0,512,256);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.mapping=THREE.EquirectangularReflectionMapping;
  const generator=new THREE.PMREMGenerator(renderer);
  const environment=generator.fromEquirectangular(texture);
  generator.dispose();texture.dispose();
  return environment;
}

// Screen-space errors are pixels, not metres. Keep photographic terrain
// detailed near the player without increasing the territory's draw distance.
export function hongKongRenderingProfile(quality='balanced') {
  return {
    low:{errors:[20,20,24],streamDistance:500,anisotropy:2,shadowRadius:65},
    balanced:{errors:[10,12,16],streamDistance:750,anisotropy:8,shadowRadius:85},
    high:{errors:[6,8,10],streamDistance:1200,anisotropy:8,shadowRadius:100},
  }[quality] || hongKongRenderingProfile('balanced');
}

export function configureHongKongTiles(tiles,index,profile) {
  tiles.errorTarget=profile.errors[index];
  // Do not use distance falloff here: territory-sized bounding volumes can
  // classify the player's own supporting photo tile as distant and coarsen it.
  tiles.errorFalloff=0;
  tiles.loadAncestors=index===0;tiles.loadSiblings=index===0;
}

// Hide the streaming boundary before tiles enter/leave the requested frustum.
// Linear depth fog reaches full coverage inside that boundary; exponential
// sky haze left distant buildings almost completely visible at the cutoff.
export function configureHongKongFog(scene,profile,viewDistance=profile.streamDistance) {
  if(!scene?.fog)return;
  const distance=Math.min(profile.streamDistance,viewDistance);
  const near=distance*.55,far=distance*.85;
  if(!scene.fog.isFog)scene.fog=new THREE.Fog(scene.fog.color,near,far);
  else {scene.fog.near=near;scene.fog.far=far;}
}

export function nextHongKongError(current,baseline,{full,refused,utilization}) {
  // A 5% step took many two-second checks to release a saturated photo cache.
  if(full&&refused>0)return Math.min(28,current*1.25);
  // Hysteresis: do not sharpen immediately when one refused request finishes,
  // only to exhaust the same cache and coarsen again two seconds later.
  return utilization<.8?Math.max(baseline,current/1.1):current;
}

export function tuneHongKongTexture(texture,anisotropy=8,maxAnisotropy=8) {
  if(!texture)return false;
  const target=Math.max(1,Math.min(anisotropy,maxAnisotropy));
  if(texture.anisotropy===target)return false;
  // Do not change color space, mip chains, wrapping or compressed pixel data.
  texture.anisotropy=target;texture.needsUpdate=true;
  return true;
}

export function prepareHongKongTile(scene,surfaceType,profile,maxAnisotropy) {
  scene.traverse(mesh=>{
    if(!mesh.isMesh)return;
    mesh.userData.surfaceType=surfaceType;
    mesh.receiveShadow=true;
    // Photogrammetry already contains baked lighting. Structural geometry
    // supplies building shadows without drawing the entire photo terrain a
    // second time into the shadow map (tile meshes disable renderer culling).
    mesh.castShadow=surfaceType!=='terrain';
    let facade=false;
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
      tuneHongKongTexture(material.map,profile.anisotropy,maxAnisotropy);
      if(surfaceType==='building')facade=prepareCityFacade(material,{allowFlatTexture:true})||!!material.userData.cityFacade||facade;
    }
    // Generate normals only for placeholder buildings that need the facade
    // shader. Photographic meshes keep their authored/flat-shaded appearance.
    if(facade&&!mesh.geometry.attributes.normal)mesh.geometry.computeVertexNormals();
  });
}

// A player-centred, texel-snapped shadow volume avoids losing contact shadows
// away from the origin and prevents sub-pixel swimming while walking.
export function updateHongKongSun(sun,position,quality='balanced') {
  const radius=hongKongRenderingProfile(quality).shadowRadius;
  const camera=sun.shadow.camera,step=2*radius/sun.shadow.mapSize.x;
  const focus=new THREE.Vector3(...position.toArray().map(n=>Math.round(n/step)*step));
  sun.target.position.copy(focus);
  sun.position.copy(focus).add(new THREE.Vector3(160,280,140));
  camera.left=camera.bottom=-radius;camera.right=camera.top=radius;
  camera.near=1;camera.far=650;camera.updateProjectionMatrix();
  sun.target.updateMatrixWorld(true);sun.updateMatrixWorld(true);
}
