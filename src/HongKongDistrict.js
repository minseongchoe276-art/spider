import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {fetchAsset} from './AssetLoader.js';
import {HONG_KONG_FACADES} from './data/HongKongFacades.js';
import {insideFacade} from './HongKongDistrictGeometry.js';

const UP=new T.Vector3(0,1,0),PITCH_X=3.2,PITCH_Y=3.6,MAX_FACES=6,MAX_TREES=32;
// Reviewed canopy footprints in the landscaped strip seen in the overhead
// survey. Ground/roads below each canopy are deliberately outside the masks.
export const CENTRAL_TREES=[
  {x:-48,z:-29,base:4.5,height:14,radius:6.8},
  {x:-39,z:-28,base:4.5,height:13.5,radius:5.8},
  {x:-25,z:-26,base:4.5,height:14.5,radius:9},
  {x:69,z:43,base:4.5,height:15,radius:7.2},
  {x:78,z:48,base:4.5,height:15,radius:7},
  {x:96,z:82,base:4.5,height:14,radius:7},
  {x:-127,z:-31,base:4.5,height:16,radius:8},
];

export function facadePoint(face,u,y,offset=0){
  const n=new T.Vector3(...face.normal),right=new T.Vector3(n.z,0,-n.x);
  return right.multiplyScalar(u).addScaledVector(n,face.distance+offset).setY(y);
}

export function facadeWindows(face){
  const rows=[];
  for(let y=face.minY+PITCH_Y*.6;y<face.maxY-1.6;y+=PITCH_Y){
    for(let u=face.minU+PITCH_X*.5;u<face.maxU-1.5;u+=PITCH_X){
      // Corners, edge midpoints and centre must all lie on an actual source
      // polygon. No window can bridge an opening in an irregular facade.
      if([-1.32,0,1.32].every(dx=>[-1.35,0,1.35].every(dy=>insideFacade(u+dx,y+dy,face))))rows.push({u,y});
    }
  }
  return rows;
}

function maskAtlas(faces){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256*MAX_FACES;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fff';
  faces.forEach((f,index)=>{
    const right=new T.Vector3(f.normal[2],0,-f.normal[0]);
    for(let i=0;i<f.vertices.length;i+=9){
      ctx.beginPath();
      for(let j=0;j<3;j++){
        const k=i+j*3,u=f.vertices[k]*right.x+f.vertices[k+2]*right.z;
        const x=(u-f.minU)/f.width*256,y=(index+1)*256-(f.vertices[k+1]-f.minY)/f.height*256;
        if(j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.closePath();ctx.fill();
    }
  });
  const texture=new T.CanvasTexture(canvas);texture.minFilter=texture.magFilter=T.NearestFilter;texture.generateMipmaps=false;texture.flipY=false;
  return texture;
}

export class HongKongDistrict {
  constructor(scene){
    this.scene=scene;this.faces=HONG_KONG_FACADES.slice(0,MAX_FACES);this.group=new T.Group();this.group.name='HongKongCentralPrecision';scene.add(this.group);
    this.resources=new Set();this.facePlanes=this.faces.map(f=>new T.Vector4(f.normal[0],f.normal[2],f.distance,f.minU));
    this.faceBounds=this.faces.map(f=>new T.Vector4(f.maxU,f.minY,f.maxY,.8));
    this.treeSources=[];this.allTreeSites=[...CENTRAL_TREES];
    this.treeCenters=CENTRAL_TREES.map(t=>new T.Vector4(t.x,t.base+1.5,t.z,t.radius));
    this.treeTops=CENTRAL_TREES.map(t=>t.base+t.height+1);
    while(this.treeCenters.length<MAX_TREES){this.treeCenters.push(new T.Vector4(0,1e6,0,0));this.treeTops.push(1e6);}
    this.treeSites=CENTRAL_TREES;this.active={value:1};this.treeActive={value:0};this.report={facades:this.faces.length,windows:0,frameParts:0,trees:0,treeStatus:'loading',source:'Existing workspace tree.glb; authored facade geometry from reviewed local planes'};
    this.buildFacades();
    this.treeReady=this.loadTrees().catch(error=>{this.report.treeStatus='failed';this.report.treeError=String(error);});
  }

  own(resource){this.resources.add(resource);return resource;}

  buildFacades(){
    // Finish the source wall in its own material. An opaque second shell and
    // binary cutout made diagonal gaps and diverged from the collision wall.
    this.report.windows=this.faces.reduce((sum,face)=>sum+facadeWindows(face).length,0);
    this.report.frameParts=0;this.report.facadeMode='source-aligned analytic glazing';
  }

  setEnabled(enabled){this.group.visible=!!enabled;this.active.value=enabled?1:0;return this.group.visible;}

  captureReflection(renderer){
    if(!this.panes){this.report.reflection='shared-sky';return;}
    if(this.report.reflection)return;
    this.report.reflection='pending';
    const target=new T.WebGLCubeRenderTarget(128,{type:T.HalfFloatType}),probe=new T.CubeCamera(.5,400,target);
    const auto=renderer.shadowMap.autoUpdate;
    try{
      renderer.shadowMap.autoUpdate=false;probe.position.set(0,32,0);probe.update(renderer,this.scene);
      const generator=new T.PMREMGenerator(renderer),environment=generator.fromCubemap(target.texture);
      generator.dispose();this.reflectionTarget=this.own(environment);this.panes.material.envMap=environment.texture;this.panes.material.needsUpdate=true;
      this.report.reflection='local-city-128';
    }catch(error){this.report.reflection='sky-fallback';this.report.reflectionError=String(error);}
    finally{renderer.shadowMap.autoUpdate=auto;target.dispose();}
  }

  resetReflection(){
    if(this.reflectionTarget){this.reflectionTarget.dispose();this.resources.delete(this.reflectionTarget);this.reflectionTarget=null;}
    if(this.panes){this.panes.material.envMap=null;this.panes.material.needsUpdate=true;}delete this.report.reflection;
  }

  applySourceMask(material,surfaceType='terrain'){
    if(material.userData.hkDistrictMask)return;
    material.userData.hkDistrictMask=true;
    const previous=material.onBeforeCompile.bind(material),key=material.customProgramCacheKey.bind(material);
    material.onBeforeCompile=shader=>{
      previous(shader);
      Object.assign(shader.uniforms,{hkDistrictActive:this.active,hkFacePlanes:{value:this.facePlanes},hkFaceBounds:{value:this.faceBounds},hkTreeCenters:{value:this.treeCenters},hkTreeTops:{value:this.treeTops},hkTreeActive:this.treeActive});
      shader.vertexShader='varying vec3 vHkDistrictWorld;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvHkDistrictWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
      shader.fragmentShader=`varying vec3 vHkDistrictWorld;
        uniform vec4 hkFacePlanes[${MAX_FACES}];uniform vec4 hkFaceBounds[${MAX_FACES}];
        uniform vec4 hkTreeCenters[${MAX_TREES}];uniform float hkTreeTops[${MAX_TREES}];uniform float hkTreeActive;uniform float hkDistrictActive;
      `+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec3 hkN=normalize(cross(dFdx(vHkDistrictWorld),dFdy(vHkDistrictWorld)));
        if(hkDistrictActive>0.5 && abs(hkN.y)<0.15){
          for(int i=0;i<${MAX_FACES};i++){
            vec4 p=hkFacePlanes[i],b=hkFaceBounds[i];float u=p.y*vHkDistrictWorld.x-p.x*vHkDistrictWorld.z;
            float boundary=min(min(u-p.w,b.x-u),min(vHkDistrictWorld.y-b.y,b.z-vHkDistrictWorld.y));
            float wall=(1.0-smoothstep(.18,.45,abs(dot(p.xy,vHkDistrictWorld.xz)-p.z)))*smoothstep(0.0,1.5,boundary);
            vec2 grid=vec2((u-p.w)/3.2,(vHkDistrictWorld.y-b.y)/3.6),cell=fract(grid),aa=max(fwidth(grid),vec2(.002));
            float pane=smoothstep(.12,.12+aa.x,cell.x)*(1.0-smoothstep(.88-aa.x,.88,cell.x))*smoothstep(.19,.19+aa.y,cell.y)*(1.0-smoothstep(.83-aa.y,.83,cell.y));
            vec3 facade=mix(vec3(.28,.29,.285),vec3(.07,.115,.14),pane);
            diffuseColor.rgb=mix(diffuseColor.rgb,facade*diffuse,wall*.68);
          }
        }
        if(${surfaceType==='terrain'?'true':'false'} && hkDistrictActive>0.5 && hkTreeActive>0.5){
          for(int i=0;i<${MAX_TREES};i++){
            vec4 t=hkTreeCenters[i];float radius=t.w;if(radius<=0.0)continue;
            float top=hkTreeTops[i];
            float crown=distance(vHkDistrictWorld.xz,t.xz)/radius;
            float fade=1.0-smoothstep(140.0,220.0,distance(cameraPosition,vec3(t.x,t.y,t.z)));
            float hash=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
            bool structuralCap=abs(hkN.y)>.98 && max(diffuseColor.r,diffuseColor.b)>=diffuseColor.g*.98;
            if(!structuralCap && vHkDistrictWorld.y>t.y && vHkDistrictWorld.y<top && crown<1.0 && hash<fade)discard;
          }
        }
      `);
    };
    material.customProgramCacheKey=()=>key()+'|hk-source-aligned-v3-'+surfaceType;material.needsUpdate=true;
  }

  async loadTrees(){
    const buffer=await fetchAsset('/models/environment/hong-kong-pine.glb');
    const gltf=await new GLTFLoader().parseAsync(buffer,'/models/environment/');
    if(this.disposed){this.disposeTreeSource(gltf.scene);return;}
    gltf.scene.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(gltf.scene),sourceHeight=bounds.max.y-bounds.min.y;
    this.report.treeBounds={min:bounds.min.toArray(),max:bounds.max.toArray()};
    if(!(sourceHeight>1))throw new Error('Invalid source tree bounds');
    this.sourceTreeBounds=bounds;
    gltf.scene.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const material=mesh.material;material.roughness=.9;material.envMapIntensity=.55;
      if(material.alphaTest>0){material.alphaToCoverage=true;material.side=T.DoubleSide;material.roughness=.95;}
      for(const value of Object.values(material))if(value?.isTexture){value.anisotropy=4;this.resources.add(value);}
      this.own(material);this.own(mesh.geometry);
      const previous=material.onBeforeCompile.bind(material),cache=material.customProgramCacheKey.bind(material);
      material.onBeforeCompile=shader=>{
        previous(shader);shader.vertexShader='varying vec3 hkTreeWorld;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvec4 treeP=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\ntreeP=instanceMatrix*treeP;\n#endif\nhkTreeWorld=(modelMatrix*treeP).xyz;');
        shader.fragmentShader='varying vec3 hkTreeWorld;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nfloat treeFade=1.0-smoothstep(140.0,220.0,distance(cameraPosition,hkTreeWorld));\nif(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)>=treeFade)discard;');
      };
      material.customProgramCacheKey=()=>cache()+'|whole-tree-distance-v1';
      const batch=this.own(new T.InstancedMesh(mesh.geometry,material,MAX_TREES));batch.name='Central authored '+(material.alphaTest>0?'foliage':'trunks');batch.castShadow=batch.receiveShadow=true;batch.count=0;
      batch.userData.presentationRepair=true;this.treeSources.push({mesh:batch,sourceMatrix:mesh.matrixWorld.clone()});this.group.add(batch);
    });
    this.setTreeSites(this.allTreeSites,new T.Vector3());
    this.treeActive.value=1;this.report.treeStatus='ready';this.report.source='Whole authored tree asset and source-aligned facade finish';
  }

  setTreeSites(sites,focus){
    this.allTreeSites=sites;
    const selected=[...sites].sort((a,b)=>Math.hypot(a.x-focus.x,a.z-focus.z)-Math.hypot(b.x-focus.x,b.z-focus.z)).filter(t=>Math.hypot(t.x-focus.x,t.z-focus.z)<220).slice(0,MAX_TREES);
    this.treeSites=selected;
    for(let i=0;i<MAX_TREES;i++){
      const t=selected[i];this.treeCenters[i].set(t?.x??0,t?t.base+1.5:1e6,t?.z??0,t?.radius??0);this.treeTops[i]=t?t.base+t.height+1:1e6;
    }
    if(this.sourceTreeBounds){
      const size=this.sourceTreeBounds.getSize(new T.Vector3()),center=this.sourceTreeBounds.getCenter(new T.Vector3());
      for(const {mesh,sourceMatrix}of this.treeSources){
        mesh.count=selected.length;selected.forEach((t,i)=>{
          const matrix=new T.Matrix4().compose(new T.Vector3(t.x,t.base,t.z),new T.Quaternion().setFromAxisAngle(UP,(t.x+t.z)*.17),new T.Vector3(t.radius*2/Math.max(size.x,size.z),t.height/size.y,t.radius*2/Math.max(size.x,size.z)));
          matrix.multiply(new T.Matrix4().makeTranslation(-center.x,-this.sourceTreeBounds.min.y,-center.z)).multiply(sourceMatrix);mesh.setMatrixAt(i,matrix);
        });mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();
      }
    }
    this.report.trees=selected.length;this.report.knownTreeSites=sites.length;this.report.foliageClusters=selected.length;
  }

  disposeTreeSource(root){root.traverse(o=>{if(!o.isMesh)return;o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const v of Object.values(m))if(v?.isTexture){v.dispose();v.image?.close?.();}m.dispose();}});}
  dispose(){this.disposed=true;this.treeActive.value=0;this.scene.remove(this.group);for(const r of this.resources){r.dispose();if(r.isTexture)r.image?.close?.();}this.resources.clear();}
}
