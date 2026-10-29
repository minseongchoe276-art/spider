// Subtle world-scale floors for geometry-only building tiles. Authored textures,
// vertex colors, glass and colored materials retain their original appearance.
export function isFlatCityTexture(texture) {
  const image=texture?.image,data=image?.data;
  return !!(image?.width===1 && image?.height===1 && data?.length>=3 &&
    Math.max(data[0],data[1],data[2])-Math.min(data[0],data[1],data[2])<=8);
}

export function prepareCityFacade(material,{allowFlatTexture=false}={}) {
  const placeholder=allowFlatTexture&&isFlatCityTexture(material?.map)?material.map:null;
  const authored=()=>!!((material.map&&material.map!==placeholder)||material.vertexColors);
  if(!(material?.isMeshStandardMaterial||material?.isMeshBasicMaterial)||authored()||material.transparent||material.userData?.cityFacade)return false;
  const {r,g,b}=material.color;
  if(Math.max(r,g,b)-Math.min(r,g,b)>.15)return false;
  material.userData.cityFacade=true;
  if(material.isMeshStandardMaterial)material.roughness=.82;
  material.onBeforeCompile=shader=>{
    if(authored())return;
    shader.vertexShader='varying vec3 vFacadeWorld;\nvarying vec3 vFacadeNormal;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvFacadeWorld=(modelMatrix*vec4(transformed,1.0)).xyz;\nvFacadeNormal=normalize(mat3(modelMatrix)*normal);');
    shader.fragmentShader='varying vec3 vFacadeWorld;\nvarying vec3 vFacadeNormal;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec3 facadeNormal=normalize(vFacadeNormal);
      float wall=1.0-smoothstep(0.2,0.65,abs(facadeNormal.y));
      float horizontal=abs(facadeNormal.x)>abs(facadeNormal.z)?vFacadeWorld.z:vFacadeWorld.x;
      vec2 cell=fract(vec2(horizontal/2.4,vFacadeWorld.y/3.2));
      float pane=step(0.14,cell.x)*(1.0-step(0.86,cell.x))*step(0.22,cell.y)*(1.0-step(0.82,cell.y));
      vec3 glazing=vec3(0.38,0.52,0.61);
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*glazing,wall*pane*0.65);
    `);
  };
  material.customProgramCacheKey=()=> authored()?'authored-city-material':'world-city-facade-v2';
  material.needsUpdate=true;
  return true;
}
