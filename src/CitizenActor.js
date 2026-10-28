import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {fetchAsset} from './AssetLoader.js';
export const CITIZEN_VARIANTS=['remy','megan','louise'];
let pending;
export function loadCitizenAssets(){
 if(!pending)pending=(async()=>{
  const manifest=JSON.parse(new TextDecoder().decode(await fetchAsset('/citizens/manifest.json?v=3')));
  const assets=[];for(const id of CITIZEN_VARIANTS){const gltf=await new GLTFLoader().parseAsync(await fetchAsset(`/citizens/${id}.glb?v=3`),'/citizens/');const meta=manifest.characters.find(c=>c.id===id);assets.push({id,model:gltf.scene,clips:gltf.animations,speeds:Object.fromEntries((meta?.animations||[]).map(a=>[a.key,a.nominalSpeed]))});}
  return assets;
 })().catch(error=>{pending=null;throw error;});
 return pending;
}
export class CitizenActor{
 constructor(asset){
  this.variant=asset.id;this.speeds=asset.speeds||{};this.group=new T.Group();this.model=clone(asset.model);this.group.add(this.model);this.group.name='Citizen-'+asset.id;
  this.mixer=new T.AnimationMixer(this.model);this.actions=Object.fromEntries(asset.clips.map(clip=>[clip.name,this.mixer.clipAction(clip)]));
  this.model.traverse(n=>{if(n.isMesh){n.castShadow=false;n.receiveShadow=false;n.frustumCulled=false;}});
  this.healthBar=new T.Group();this.healthBar.position.y=2.05;const backing=new T.Mesh(new T.PlaneGeometry(.76,.085),new T.MeshBasicMaterial({color:0x171a20,depthTest:false}));this.healthFill=new T.Mesh(new T.PlaneGeometry(.72,.055),new T.MeshBasicMaterial({color:0x65dc81,depthTest:false}));this.healthFill.position.z=.002;this.healthBar.add(backing,this.healthFill);this.healthBar.visible=false;this.healthBar.renderOrder=20;backing.renderOrder=20;this.healthFill.renderOrder=21;this.group.add(this.healthBar);this.current=null;this.play('idle',0);
 }
 play(key,fade=.16,restart=false){const next=this.actions[key]||this.actions.idle;if(this.current===next){if(restart)next.reset().play();return;}const oneShot=['jab','cross','hook','startle','hit','hitBody','hitUppercut'].includes(key);next.reset().setLoop(oneShot?T.LoopOnce:T.LoopRepeat,oneShot?1:Infinity);next.clampWhenFinished=oneShot;next.setEffectiveTimeScale(1).setEffectiveWeight(1).play();if(this.current)this.current.crossFadeTo(next,fade,false);this.current=next;this.key=key;}
 update(delta,speed=0){if(this.key==='walk')this.current.timeScale=(speed<0?-1:1)*T.MathUtils.clamp(Math.abs(speed)/(this.speeds.walk||1.8),.4,1.4);else if(this.key==='run')this.current.timeScale=T.MathUtils.clamp(speed/(this.speeds.run||6.5),.4,1.4);this.mixer.update(delta);}
 setHealth(health,max=100){const ratio=T.MathUtils.clamp(health/max,0,1);this.healthBar.visible=ratio>0&&ratio<1;this.healthFill.scale.x=ratio;this.healthFill.position.x=-.36*(1-ratio);this.healthFill.material.color.setHex(ratio>.35?0x65dc81:0xf06454);}
 reset(){this.model.rotation.set(0,0,0);this.model.position.set(0,0,0);this.setHealth(100);this.mixer.stopAllAction();this.current=null;this.play('idle',0);this.group.visible=true;}
 dispose(){this.mixer.stopAllAction();this.mixer.uncacheRoot(this.model);this.model.traverse(n=>n.skeleton?.dispose());this.healthBar.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});this.group.removeFromParent();}
}
