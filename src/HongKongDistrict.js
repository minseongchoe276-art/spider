import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {fetchAsset} from './AssetLoader.js';
import {HONG_KONG_FACADES} from './data/HongKongFacades.js';
import {insideFacade} from './HongKongDistrictGeometry.js';

const UP=new T.Vector3(0,1,0),PITCH_X=3.2,PITCH_Y=3.6,MAX_FACES=6,MAX_TREES=8;
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
    this.atlas=maskAtlas(this.faces);this.resources.add(this.atlas);
    this.treeCenters=CENTRAL_TREES.map(t=>new T.Vector4(t.x,t.base+1.5,t.z,t.radius));
    this.treeTops=CENTRAL_TREES.map(t=>t.base+t.height+1);
    while(this.treeCenters.length<MAX_TREES){this.treeCenters.push(new T.Vector4(0,1e6,0,0));this.treeTops.push(1e6);}
    this.treeSites=CENTRAL_TREES;this.active={value:1};this.treeActive={value:0};this.report={facades:this.faces.length,windows:0,frameParts:0,trees:0,treeStatus:'loading',source:'Existing workspace tree.glb; authored facade geometry from reviewed local planes'};
    this.buildFacades();
    this.treeReady=this.loadTrees().catch(error=>{this.report.treeStatus='failed';this.report.treeError=String(error);});
  }

  own(resource){this.resources.add(resource);return resource;}

  buildFacades(){
    const panels=[],frames=[],matrix=new T.Matrix4(),q=new T.Quaternion();
    const box=this.own(new T.BoxGeometry(1,1,1));
    for(let index=0;index<this.faces.length;index++){
      const face=this.faces[index],n=new T.Vector3(...face.normal),right=new T.Vector3(n.z,0,-n.x);
      q.setFromRotationMatrix(new T.Matrix4().makeBasis(right,UP,n));
      const vertices=[];
      for(let i=0;i<face.vertices.length;i+=3){
        const p=new T.Vector3().fromArray(face.vertices,i);vertices.push(...p.addScaledVector(n,face.distance+.045-p.dot(n)).toArray());
      }
      const geo=this.own(new T.BufferGeometry());geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();
      const mat=this.own(new T.MeshStandardMaterial({color:index%2?0xb4b3ac:0xabaeb0,roughness:.78,metalness:.08,side:T.DoubleSide}));
      const shell=new T.Mesh(geo,mat);shell.name=face.id;shell.castShadow=shell.receiveShadow=true;this.group.add(shell);
      for(const cell of facadeWindows(face)){
        const center=facadePoint(face,cell.u,cell.y,.14);
        matrix.compose(center,q,new T.Vector3(2.64,2.7,.055));panels.push(matrix.clone());
        for(const [du,dy,w,h]of [[-1.35,0,.065,2.82],[1.35,0,.065,2.82],[0,-1.39,2.76,.07],[0,1.39,2.76,.07]]){
          matrix.compose(center.clone().addScaledVector(right,du).addScaledVector(UP,dy).addScaledVector(n,.025),q,new T.Vector3(w,h,.12));frames.push(matrix.clone());
        }
      }
    }
    const glass=this.own(new T.MeshPhysicalMaterial({color:0x34505a,metalness:.42,roughness:.23,clearcoat:.65,clearcoatRoughness:.2,envMapIntensity:1.15}));
    const trim=this.own(new T.MeshStandardMaterial({color:0xa3aaad,metalness:.65,roughness:.37}));
    this.panes=this.own(new T.InstancedMesh(box,glass,panels.length));this.panes.name='Central recessed glazing';
    panels.forEach((m,i)=>{this.panes.setMatrixAt(i,m);this.panes.setColorAt(i,new T.Color().setRGB(.72+(i%7)*.025,.8+(i%5)*.025,.86+(i%3)*.035));});
    this.frames=this.own(new T.InstancedMesh(box,trim,frames.length));this.frames.name='Central aluminium window profiles';frames.forEach((m,i)=>this.frames.setMatrixAt(i,m));
    this.frames.castShadow=true;this.frames.receiveShadow=this.panes.receiveShadow=true;
    this.panes.computeBoundingSphere();this.frames.computeBoundingSphere();this.group.add(this.panes,this.frames);
    this.report.windows=panels.length;this.report.frameParts=frames.length;
  }

  setEnabled(enabled){this.group.visible=!!enabled;this.active.value=enabled?1:0;return this.group.visible;}

  captureReflection(renderer){
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
    this.panes.material.envMap=null;this.panes.material.needsUpdate=true;delete this.report.reflection;
  }

  applySourceMask(material,surfaceType='terrain'){
    if(material.userData.hkDistrictMask)return;
    material.userData.hkDistrictMask=true;
    const previous=material.onBeforeCompile.bind(material),key=material.customProgramCacheKey.bind(material);
    material.onBeforeCompile=shader=>{
      previous(shader);
      Object.assign(shader.uniforms,{hkDistrictActive:this.active,hkFacePlanes:{value:this.facePlanes},hkFaceBounds:{value:this.faceBounds},hkFaceAtlas:{value:this.atlas},hkTreeCenters:{value:this.treeCenters},hkTreeTops:{value:this.treeTops},hkTreeActive:this.treeActive});
      shader.vertexShader='varying vec3 vHkDistrictWorld;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvHkDistrictWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
      shader.fragmentShader=`varying vec3 vHkDistrictWorld;
        uniform vec4 hkFacePlanes[${MAX_FACES}];uniform vec4 hkFaceBounds[${MAX_FACES}];uniform sampler2D hkFaceAtlas;
        uniform vec4 hkTreeCenters[${MAX_TREES}];uniform float hkTreeTops[${MAX_TREES}];uniform float hkTreeActive;uniform float hkDistrictActive;
      `+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
        vec3 hkN=normalize(cross(dFdx(vHkDistrictWorld),dFdy(vHkDistrictWorld)));
        if(hkDistrictActive>0.5 && abs(hkN.y)<0.2){
          for(int i=0;i<${MAX_FACES};i++){
            vec4 p=hkFacePlanes[i],b=hkFaceBounds[i];float u=p.y*vHkDistrictWorld.x-p.x*vHkDistrictWorld.z;
            if(abs(dot(p.xy,vHkDistrictWorld.xz)-p.z)<b.w && u>p.w && u<b.x && vHkDistrictWorld.y>b.y && vHkDistrictWorld.y<b.z){
              vec2 uv=vec2((u-p.w)/(b.x-p.w),(vHkDistrictWorld.y-b.y)/(b.z-b.y));
              if(texture2D(hkFaceAtlas,vec2(uv.x,(float(i)+1.0-uv.y)/float(${MAX_FACES}))).r>0.5)discard;
            }
          }
        }
      `);
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        if(${surfaceType==='terrain'?'true':'false'} && hkDistrictActive>0.5 && hkTreeActive>0.5 && abs(hkN.y)<0.98){
          for(int i=0;i<${MAX_TREES};i++){
            vec4 t=hkTreeCenters[i];
            if(vHkDistrictWorld.y>t.y && vHkDistrictWorld.y<hkTreeTops[i] && distance(vHkDistrictWorld.xz,t.xz)<t.w)discard;
          }
        }
      `);
    };
    material.customProgramCacheKey=()=>key()+'|hk-precision-central-v2-'+surfaceType;material.needsUpdate=true;
  }

  async loadTrees(){
    const buffer=await fetchAsset('/models/environment/hong-kong-pine.glb');
    const gltf=await new GLTFLoader().parseAsync(buffer,'/models/environment/');
    if(this.disposed){this.disposeTreeSource(gltf.scene);return;}
    gltf.scene.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(gltf.scene),sourceHeight=bounds.max.y-bounds.min.y;
    this.report.treeBounds={min:bounds.min.toArray(),max:bounds.max.toArray()};
    if(!(sourceHeight>1))throw new Error('Invalid source tree bounds');
    gltf.scene.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const material=mesh.material;material.roughness=.88;material.envMapIntensity=.5;
      if(material.alphaTest>0){material.alphaToCoverage=false;material.side=T.DoubleSide;material.color.setHex(0x9baa8a);material.roughness=.95;material.envMapIntensity=.25;}
      for(const value of Object.values(material))if(value?.isTexture){value.anisotropy=4;this.resources.add(value);}
      this.own(material);this.own(mesh.geometry);
      const leafy=material.alphaTest>0;
      let geometry=mesh.geometry;
      if(!leafy){
        geometry=this.own(new T.CylinderGeometry(.23,.44,1,12,8).translate(0,.5,0));
        const p=geometry.attributes.position;for(let i=0;i<p.count;i++){const y=p.getY(i);p.setX(i,p.getX(i)+Math.sin(y*2.6)*.15);p.setZ(i,p.getZ(i)+Math.sin(y*3.8)*.1);}geometry.computeVertexNormals();
      }
      const batch=this.own(new T.InstancedMesh(geometry,material,CENTRAL_TREES.length*(leafy?20:1)));batch.name='Central precision '+(leafy?'foliage':'trunks');
      const leafBounds=new T.Box3().setFromObject(mesh),leafCenter=leafBounds.getCenter(new T.Vector3()),leafSize=leafBounds.getSize(new T.Vector3());let instance=0;
      CENTRAL_TREES.forEach((t,i)=>{
        if(!leafy){
          const root=new T.Matrix4().compose(new T.Vector3(t.x,t.base,t.z),new T.Quaternion().setFromAxisAngle(UP,i*2.399963),new T.Vector3(1,t.height*.65,1));
          batch.setMatrixAt(instance++,root);return;
        }
        for(let k=0;k<20;k++){
          const shrub=k>=13,j=shrub?k-13:k,angle=j*2.399963+i*.7;
          const r=shrub?t.radius*.63:j===0?0:t.radius*(j%2?.28:.45);
          const center=new T.Vector3(t.x+Math.cos(angle)*r,shrub?t.base+1.4:t.base+t.height*(.62+.065*(j%3)),t.z+Math.sin(angle)*r);
          const width=t.radius*(shrub?.35:.55)*2/Math.max(leafSize.x,leafSize.z),height=(shrub?3.2:t.height*.44)/leafSize.y;
          const rotation=new T.Quaternion().setFromEuler(new T.Euler(Math.sin(j*3.1)*.3,angle,Math.cos(j*2.1)*.25,'YXZ'));
          const root=new T.Matrix4().compose(center,rotation,new T.Vector3(width,height,width));
          root.multiply(new T.Matrix4().makeTranslation(-leafCenter.x,-leafCenter.y,-leafCenter.z)).multiply(mesh.matrixWorld);batch.setMatrixAt(instance++,root);
        }
      });
      batch.castShadow=batch.receiveShadow=true;batch.computeBoundingSphere();this.group.add(batch);
      if(!leafy){
        const branchGeometry=this.own(new T.CylinderGeometry(.07,.18,1,8,3));
        const branches=this.own(new T.InstancedMesh(branchGeometry,material,CENTRAL_TREES.length*5));let i=0;
        for(const t of CENTRAL_TREES)for(let k=0;k<5;k++){
          const angle=k*2.399963,start=new T.Vector3(t.x,t.base+t.height*(.37+k*.025),t.z),end=new T.Vector3(t.x+Math.cos(angle)*t.radius*.38,t.base+t.height*(.66+k*.018),t.z+Math.sin(angle)*t.radius*.38);
          const direction=end.clone().sub(start),matrix=new T.Matrix4().compose(start.add(end).multiplyScalar(.5),new T.Quaternion().setFromUnitVectors(UP,direction.clone().normalize()),new T.Vector3(1,direction.length(),1));branches.setMatrixAt(i++,matrix);
        }
        branches.name='Central organic primary branches';branches.castShadow=branches.receiveShadow=true;branches.computeBoundingSphere();this.group.add(branches);
      }
    });
    const soilGeometry=this.own(new T.CircleGeometry(1,48).rotateX(-Math.PI/2));
    const soilMaterial=this.own(new T.MeshStandardMaterial({color:0x343d29,roughness:1}));
    for(const t of CENTRAL_TREES){
      const soil=new T.Mesh(soilGeometry,soilMaterial);soil.name='Central planted bed';soil.position.set(t.x,t.base+.015,t.z);soil.scale.set(t.radius*.95,1,t.radius*.95);soil.receiveShadow=true;this.group.add(soil);
    }
    // Original canopy fragments are hidden only after the replacement is ready.
    // Conservative source collision stays intact; roads and support below the
    // canopy base are never cut or replaced with an invisible floor.
    this.treeActive.value=1;this.report.trees=CENTRAL_TREES.length;this.report.foliageClusters=CENTRAL_TREES.length*20;this.report.treeStatus='ready';
  }

  disposeTreeSource(root){root.traverse(o=>{if(!o.isMesh)return;o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const v of Object.values(m))if(v?.isTexture){v.dispose();v.image?.close?.();}m.dispose();}});}
  dispose(){this.disposed=true;this.treeActive.value=0;this.scene.remove(this.group);for(const r of this.resources){r.dispose();if(r.isTexture)r.image?.close?.();}this.resources.clear();}
}
