// World-space microdetail follows the existing surface; no planes or colliders
// are added, and vegetation / strongly colored photography remains untouched.
export const PHOTO_SURFACE_TIME={value:0};
export const HONG_KONG_SEA_LEVEL=0;
export function preparePhotoSurfaceFinish(material){
  if(!material || material.userData.hkPhotoFinish || material.userData.startSurface)return;
  const previous=material.onBeforeCompile.bind(material),key=material.customProgramCacheKey.bind(material);
  material.userData.hkPhotoFinish=true;
  material.onBeforeCompile=shader=>{
    previous(shader);
    shader.vertexShader='varying vec3 vPhotoWorld;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvPhotoWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader=`varying vec3 vPhotoWorld;
      float photoNoise(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec3 photoN=normalize(cross(dFdx(vPhotoWorld),dFdy(vPhotoWorld)));
      float photoHigh=max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b));
      float photoLow=min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b));
      float photoNeutral=1.0-smoothstep(.12,.32,(photoHigh-photoLow)/max(.02,photoHigh));
      float photoTop=smoothstep(.94,.995,photoN.y);
      float photoNear=1.0-smoothstep(65.0,170.0,distance(cameraPosition,vPhotoWorld));
      float photoGrain=photoNoise(floor(vPhotoWorld.xz*24.0));
      float photoAA=1.0-smoothstep(.025,.12,length(fwidth(vPhotoWorld.xz)));
      vec3 photoAsphalt=vec3(.17,.18,.185)+(photoGrain-.5)*.025*photoAA;
      // Material diffuse contains night tint on unlit source tiles. Preserve it.
      // Height alone cannot distinguish harbour water from a quay or road.
      // Preserve the survey's colours until a geographic water mask exists.
      float aboveHarbour=smoothstep(1.5,3.0,vPhotoWorld.y);
      diffuseColor.rgb=mix(diffuseColor.rgb,photoAsphalt*diffuse,photoTop*photoNeutral*photoNear*aboveHarbour*.58);
    `);
  };
  material.customProgramCacheKey=()=>key()+'|photo-surface-finish-v2';material.needsUpdate=true;
}
