import assert from 'node:assert/strict';
import * as T from 'three';
import {loadMotionRig,disposeRig,point} from './lib/motion-rig.mjs';
const {actor}=await loadMotionRig();
for(const fps of [24,60,144]){
  const c=actor(),dt=1/fps;let supported=0,diagonal=0,samples=0;
  try{
    c.wallNormal=new T.Vector3(0,0,1);c.wallDistance=.7;c.groundProbe=()=>null;c.group.position.set(0,4,.7);
    for(let i=0;i<fps*3;i++){
      const v=new T.Vector3(0,2.8,0);c.group.position.addScaledVector(v,dt);c.update(dt,'WALL_RUNNING',v);
      if(i<fps/2)continue;
      const contacts=c.wallContacts; samples++;
      if(Object.values(contacts).filter(x=>x.stance).length>=2)supported++;
      if(contacts.lefthand.stance===contacts.rightfoot.stance && contacts.righthand.stance===contacts.leftfoot.stance)diagonal++;
    }
    assert.equal(supported,samples,'Crawl loses its support pair');
    assert(diagonal/samples>.8,'Hands still cycle with the same-side feet');
    const before=c.wallTravelDirection.clone();
    c.update(dt,'WALL_RUNNING',new T.Vector3(0,-2.8,0));
    assert(before.dot(c.wallTravelDirection)>.5,'Direction reversal snaps the reaching limbs');
    for(let i=0;i<fps;i++)c.update(dt,'WALL_RUNNING',new T.Vector3(0,-2.8,0));
    assert(c.wallTravelDirection.y<-.99,'Reversed crawl never follows the new direction');
    for(let i=0;i<fps;i++)c.update(dt,'WALL_RUNNING',new T.Vector3());
    const held=['lefthand','righthand','leftfoot','rightfoot'].map(id=>point(c,id));
    const phase=c.wallPhase;
    for(let i=0;i<fps/2;i++)c.update(dt,'WALL_RUNNING',new T.Vector3());
    assert.equal(c.wallPhase,phase,'Stopped crawl keeps stepping');
    ['lefthand','righthand','leftfoot','rightfoot'].forEach((id,i)=>assert(point(c,id).distanceTo(held[i])<.005,'Held contact drifts'));
    console.log(`PASS ${fps}fps cross-crawl: two supports throughout, ${(100*diagonal/samples).toFixed(1)}% diagonal pairing, stable reversal and hold`);
  }finally{disposeRig(c);}
}
