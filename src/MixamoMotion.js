import * as THREE from 'three';

// Clip selection is explicit per source. Keep authored body rotations and
// vertical anticipation; the controller already owns horizontal movement.
export function selectMixamoTake(clip, item) {
  if(item.trim) {
    const [start,end]=item.trim;
    const original=clip.userData;
    clip=THREE.AnimationUtils.subclip(clip,item.key,Math.round(start*30),Math.round(end*30),30);
    clip.userData={...original,rootMotion:original.rootMotion?.filter(p=>p.time>=start&&p.time<=end).map(p=>({time:p.time-start,distance:p.distance}))};
    const origin=clip.userData.rootMotion?.[0]?.distance || 0;
    clip.userData.rootMotion?.forEach(p=>p.distance-=origin);
  }
  clip.userData={...clip.userData,authoredMixamo:true,source:item.url,impactPhase:item.impactPhase};
  return clip;
}

// Bake one restrained body track into the punch. The arms retain the selected
// authored take; no runtime spine yaw / lean / pelvis shift is added later.
export function compactStraightBody(clip,base,key,boneId){
  if(!base || !['jab','cross'].includes(key))return clip;
  for(const track of clip.tracks){
    const [name,property]=track.name.split('.'),id=boneId(name);
    const lower=/^(left|right)(upleg|leg|foot|toebase)$/.test(id);
    if(!lower && !/^(hips|spine\d*|neck|head)$/.test(id))continue;
    const reference=base.tracks.find(t=>t.name===track.name);if(!reference)continue;
    if(property==='quaternion'){
      const first=new THREE.Quaternion().fromArray(track.values).normalize();
      const guard=new THREE.Quaternion().fromArray(reference.createInterpolant().evaluate(0)).normalize();
      const weight=lower ? 0.2 : id==='hips' ? (key==='jab' ? 0.18 : 0.3) : ['neck','head'].includes(id) ? 0.25 : key==='jab' ? 0.4 : 0.55;
      for(let i=0;i<track.values.length;i+=4){
        const delta=first.clone().invert().multiply(new THREE.Quaternion().fromArray(track.values,i)).normalize();
        const compact=new THREE.Quaternion().slerp(delta,weight);
        guard.clone().multiply(compact).normalize().toArray(track.values,i);
      }
    }else if(property==='position' && id==='hips'){
      const first=new THREE.Vector3().fromArray(track.values),guard=new THREE.Vector3().fromArray(reference.createInterpolant().evaluate(0));
      for(let i=0;i<track.values.length;i+=3)guard.clone().add(new THREE.Vector3().fromArray(track.values,i).sub(first).multiplyScalar(.25)).toArray(track.values,i);
    }
  }
  clip.userData={...clip.userData,bodyProfile:'compact authored straight over boxing guard',bodyProfileVersion:1};
  return clip;
}
