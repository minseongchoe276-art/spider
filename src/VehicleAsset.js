import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {fetchAsset} from './AssetLoader.js';
export function prepareBMW(model){
 const frame=new T.Group(),visual=new T.Group();frame.name='BMW330i';frame.add(visual);visual.add(model);
 model.rotation.y=-Math.PI/2;model.updateMatrixWorld(true);
 let box=new T.Box3().setFromObject(model),size=box.getSize(new T.Vector3());model.scale.multiplyScalar(4.7/size.z);model.updateMatrixWorld(true);
 box=new T.Box3().setFromObject(model);const center=box.getCenter(new T.Vector3());model.position.set(-center.x,-box.min.y,-center.z);frame.updateMatrixWorld(true);
 box=new T.Box3().setFromObject(model);size=box.getSize(new T.Vector3());
 const wheels=[];
 for(const name of ['Object_13_169','Object_13004_172','Object_13001_173','Object_13002_174']){
  const part=model.getObjectByName(name);if(!part)continue;const pivot=new T.Group(),bounds=new T.Box3().setFromObject(part);pivot.position.copy(bounds.getCenter(new T.Vector3()));visual.add(pivot);pivot.attach(part);wheels.push({pivot,front:pivot.position.z>0,radius:(bounds.max.y-bounds.min.y)/2});
 }
 const door=new T.Group();door.position.set(size.x*.36,.6,.85);visual.add(door);
 const doorParts=[];model.traverse(n=>{if(/^SK_Door_FL_/.test(n.name))doorParts.push(n);});for(const part of doorParts)door.attach(part);
 model.traverse(n=>{if(n.isMesh){n.castShadow=false;n.receiveShadow=true;const materials=Array.isArray(n.material)?n.material:[n.material];for(const m of materials){if(m.name==='MI_Glass'){m.transmission=0;m.opacity=.22;m.transparent=true;m.depthWrite=false;}if(m.name==='CarPaint')m.roughness=Math.max(.25,m.roughness);}}});
 return {frame,visual,model,wheels,door,size,seat:new T.Vector3(.43,.62,.02),pedals:[new T.Vector3(.58,.32,.85),new T.Vector3(.27,.32,.9)],wheel:new T.Vector3(.43,1.0,.54)};
}
export async function loadBMW(){const bytes=await fetchAsset('/vehicles/bmw-330i.glb?v=1',30000);return prepareBMW((await new GLTFLoader().parseAsync(bytes,'/vehicles/')).scene);}
