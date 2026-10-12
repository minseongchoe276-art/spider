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
