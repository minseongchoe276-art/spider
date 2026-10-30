// World-space microdetail follows the existing surface; no planes or colliders
// are added, and vegetation / strongly colored photography remains untouched.
export const PHOTO_SURFACE_TIME={value:0};
export function preparePhotoSurfaceFinish(material){
  if(!material || material.userData.hkPhotoFinish || material.userData.startSurface)return;
  const previous=material.onBeforeCompile.bind(material),key=material.customProgramCacheKey.bind(material);
  material.userData.hkPhotoFinish=true;
  material.onBeforeCompile=shader=>{
    previous(shader);
    shader.uniforms.photoSurfaceTime=PHOTO_SURFACE_TIME;
    shader.vertexShader='varying vec3 vPhotoWorld;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvPhotoWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader=`varying vec3 vPhotoWorld;uniform float photoSurfaceTime;
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
      float photoWater=0.0;
      #ifdef USE_MAP
        vec3 photoBlue=texture2D(map,vMapUv).rgb;
        vec2 photoStep=vec2(3.0)/vec2(textureSize(map,0));
        for(int photoI=0;photoI<4;photoI++){
          vec2 offset=vec2(photoI==0?-1.0:photoI==1?1.0:0.0,photoI==2?-1.0:photoI==3?1.0:0.0)*photoStep;
          vec3 candidate=texture2D(map,vMapUv+offset).rgb;
          if(candidate.g/(candidate.r+.005)>photoBlue.g/(photoBlue.r+.005))photoBlue=candidate;
        }
        photoWater=smoothstep(1.3,1.8,photoBlue.g/(photoBlue.r+.005))*smoothstep(1.1,1.5,photoBlue.b/(photoBlue.r+.005));
        photoWater*=smoothstep(.98,.998,photoN.y)*(1.0-smoothstep(5.0,7.0,vPhotoWorld.y));
        float ripple=sin(vPhotoWorld.x*.7+vPhotoWorld.z*.3+photoSurfaceTime*.7)*sin(vPhotoWorld.z*.9-photoSurfaceTime*.45);
        vec3 sea=vec3(.025,.155,.185)+vec3(.007,.012,.014)*ripple;
        diffuseColor.rgb=mix(diffuseColor.rgb,sea*diffuse,photoWater*.96);
      #endif
      // Material diffuse contains night tint on unlit source tiles. Preserve it.
      diffuseColor.rgb=mix(diffuseColor.rgb,photoAsphalt*diffuse,photoTop*photoNeutral*photoNear*(1.0-photoWater)*.58);
    `);
  };
  material.customProgramCacheKey=()=>key()+'|photo-surface-finish-v1';material.needsUpdate=true;
}
