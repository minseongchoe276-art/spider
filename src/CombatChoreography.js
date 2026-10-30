import * as THREE from 'three';

const smooth=t=>t*t*(3-2*t);
const v=(x,y,z)=>new THREE.Vector3(x,y,z);
const handPath=(t,keys)=>{
  const end=keys.findIndex(([time])=>time>=t);
  if(end<=0)return keys[0][1].clone();
  const [a,p]=keys[end-1],[b,q]=keys[end];
  return p.clone().lerp(q,smooth((t-a)/(b-a)));
};
// Bake coordinated fighting poses on the actual target rig. These are
// derivatives of the imported fighting stance, not unmodified source takes.
export function choreographCombat(base,key,bones,boneId) {
  const nodes=Object.values(bones),find=id=>nodes.find(b=>boneId(b.name)===id);
  const saved=nodes.map(n=>({n,p:n.position.clone(),q:n.quaternion.clone()}));
  let root=find('hips');while(root.parent)root=root.parent;
  root.updateMatrixWorld(true);
  const groundSoles=Object.fromEntries(['left','right'].map(side=>[side,find(side+'foot').getWorldQuaternion(new THREE.Quaternion()).toArray()]));
  const hips=find('hips'),restHip=new THREE.Vector3().fromArray(base.tracks.find(track=>track.name===hips.name+'.position').createInterpolant().evaluate(base.duration*.45));
  const parentRotation=hips.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
  const parentScale=hips.parent.getWorldScale(new THREE.Vector3());
  const localOffset=worldOffset=>worldOffset.clone().applyQuaternion(parentRotation).divide(parentScale);
  // The bind-pose ankles are not the fighting stance ankles. Using their
  // world rotations made every IK-corrected foot fold under the shin.
  for(const track of base.tracks){const [name,property]=track.name.split('.');const node=bones[name];if(node)node[property].fromArray(track.createInterpolant().evaluate(base.duration*.45));}
  root.updateMatrixWorld(true);
  const soles=Object.fromEntries(['left','right'].map(side=>[side,find(side+'foot').getWorldQuaternion(new THREE.Quaternion())]));
  saved.forEach(({n,p,q})=>{n.position.copy(p);n.quaternion.copy(q);});root.updateMatrixWorld(true);
  const dodge=key.startsWith('dodge');
  const duration={combatIdle:2,guard:2,jab:.56,cross:.65,rightHook:.68,special:1.2,hook:.85,heavy:.72,
    dodgeLeft:.38,dodgeRight:.38,dodgeBack:.42,dodgeForward:.52}[key];
  const impact={jab:.32,cross:.58,rightHook:.58,special:.5,hook:.62,heavy:.56}[key] || .5;
  const count=Math.ceil(duration*60),times=[],values=new Map(nodes.map(n=>[n,[]])),positions=[];
  const rotateWorld=(bone,rotation)=>{
    const world=rotation.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));bone.updateMatrixWorld(true);
  };
  const solve=(upper,lower,end,target,pole)=>{
    root.updateMatrixWorld(true);const start=upper.getWorldPosition(new THREE.Vector3()),elbow=lower.getWorldPosition(new THREE.Vector3()),tip=end.getWorldPosition(new THREE.Vector3());
    const a=start.distanceTo(elbow),b=elbow.distanceTo(tip),dir=target.clone().sub(start).normalize(),length=THREE.MathUtils.clamp(start.distanceTo(target),Math.abs(a-b)+.001,(a+b)*.985);
    const bend=pole.clone().addScaledVector(dir,-pole.dot(dir)).normalize(),along=(a*a+length*length-b*b)/(2*length);
    const joint=start.clone().addScaledVector(dir,along).addScaledVector(bend,Math.sqrt(Math.max(0,a*a-along*along)));
    for(const [bone,child,goal] of [[upper,lower,joint],[lower,end,start.clone().addScaledVector(dir,length)]]) {
      const origin=bone.getWorldPosition(new THREE.Vector3()),from=child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize(),to=goal.clone().sub(origin).normalize();
      rotateWorld(bone,new THREE.Quaternion().setFromUnitVectors(from,to));
    }
  };
  try {
    for(let i=0;i<=count;i++) {
      const t=i/count,time=t*duration;times.push(time);
      for(const {n,p,q} of saved){n.position.copy(p);n.quaternion.copy(q);}
      for(const track of base.tracks){const [name,property]=track.name.split('.');const node=bones[name];if(node)node[property].fromArray(track.createInterpolant().evaluate(base.duration*.45));}
      const attack=!['combatIdle','guard'].includes(key) && !dodge;
      const anticipate=attack?Math.sin(Math.PI*THREE.MathUtils.clamp(t/impact,0,1)):0;
      const drive=attack?(t<=impact?smooth(THREE.MathUtils.clamp((t-impact*.42)/(impact*.58),0,1)):1-smooth((t-impact)/(1-impact))):0;
      const evade=dodge?smooth(THREE.MathUtils.clamp(t/.32,0,1))*(1-smooth(THREE.MathUtils.clamp((t-.48)/.48,0,1))):0;
      const wind=anticipate*(1-drive),breath=attack?0:Math.sin(t*Math.PI*2)*.009;
      const spin=key==='hook'?-Math.PI*2*smooth(THREE.MathUtils.clamp((t-.12)/.50,0,1)):0;
      const yaw={jab:-.24,cross:.72,rightHook:.85,special:1.05,hook:0,heavy:.60}[key] || 0;
      const duck=key==='dodgeForward'?.18:key==='dodgeBack'?.06:dodge?.025:0;
      hips.position.copy(restHip).add(localOffset(v(0,-.08+breath-(key==='special'?.11:.025)*wind-duck*evade,0)));
      root.updateMatrixWorld(true);
      if(attack || dodge)hips.position.add(localOffset(v((({jab:.04,cross:-.06,hook:-.08,heavy:-.035,dodgeLeft:.035,dodgeRight:-.035}[key] || 0)*(dodge?evade:drive)),0,(({jab:.08,cross:.12,hook:0,heavy:.11,dodgeBack:-.07,dodgeForward:.08}[key] || 0)*(dodge?evade:drive)))));
      root.updateMatrixWorld(true);
      rotateWorld(hips,new THREE.Quaternion().setFromAxisAngle(v(0,1,0),spin+yaw*(drive*.55-wind*.3)));
      const spine=find('spine2') || find('spine1');
      const sideLean=key==='dodgeLeft'?-.19:key==='dodgeRight'?.19:0;
      rotateWorld(spine,new THREE.Quaternion().setFromEuler(new THREE.Euler((key==='special'?.18:key==='heavy'?.12:.05)*drive+(key==='dodgeBack'?.13:key==='dodgeForward'?.22:0)*evade,yaw*(drive*.45-wind*.25),sideLean*evade,'YXZ')));
      if(dodge){
        const neck=find('neck'),head=find('head');
        if(neck)rotateWorld(neck,new THREE.Quaternion().setFromEuler(new THREE.Euler(-.04*evade,0,sideLean*.45*evade)));
        if(head)rotateWorld(head,new THREE.Quaternion().setFromEuler(new THREE.Euler(-.06*evade,0,sideLean*.35*evade)));
      }
      const kick=key==='hook',kickingSide='left';
      for(const [side,sign,z] of [['left',1,.22],['right',-1,-.24]]) {
        const foot=find(side+'foot');let goal=v(sign*.24,.11,z);
        if(key==='jab' && side==='left')goal.add(v(0,.035*Math.sin(Math.PI*drive),.07*drive));
        if(key==='cross' && side==='right')goal.add(v(0,.10*Math.sin(Math.PI*drive),.20*drive));
        if(kick && side===kickingSide){goal.lerp(v(.06,1.05,1.35),drive);goal.applyAxisAngle(v(0,1,0),spin);}
        if(key==='dodgeForward' && side==='left')goal.z+=.10*evade;
        if(key==='dodgeBack' && side==='right')goal.z-=.12*evade;
        solve(find(side+'upleg'),find(side+'leg'),foot,goal,v(sign*.20,0,1).applyAxisAngle(v(0,1,0),spin));
        const pivot=side==='right' && ['cross','rightHook','special'].includes(key)?(key==='special'?.45:.30)*drive:0;
        const sole=new THREE.Quaternion().setFromAxisAngle(v(0,1,0),spin+pivot).multiply(soles[side]);
        if(kick && side===kickingSide)sole.premultiply(new THREE.Quaternion().setFromAxisAngle(v(1,0,0),-.15*drive));
        foot.quaternion.copy(foot.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(sole));foot.updateMatrixWorld(true);
      }
      const leftGuard=v(.18,1.56+breath,.19),rightGuard=v(-.18,1.58+breath,.19);
      let left=leftGuard.clone(),right=rightGuard.clone();
      if(key==='guard'){left=v(.18,1.49+breath,.30);right=v(-.18,1.51+breath,.30);}
      if(key==='jab')left.lerp(v(.10,1.55,.83),drive).addScaledVector(v(.015,0,-.05),wind);
      if(key==='rightHook'){
        // Compact right hook: elbow travels outside, fist arcs across the
        // opponent's jaw, and the left hand stays by the cheek.
        right=handPath(t,[[0,rightGuard],[.24,v(-.32,1.52,.25)],
          [impact,v(.02,1.51,.49)],[.70,v(.12,1.50,.47)],[1,rightGuard]]);
      }
      if(key==='special'){
        // A rear-hand overhand: load low, drive up and over the guard,
        // continue through contact, then recover. Never replay a lead jab.
        right=handPath(t,[[0,rightGuard],[.28,v(-.38,1.36,.06)],
          [.40,v(-.30,1.74,.32)],[impact,v(-.02,1.56,.69)],
          [.64,v(.13,1.42,.50)],[1,rightGuard]]);
        left.lerp(v(.21,1.57,.27),Math.max(drive,wind));
      }
      if(key==='cross')right.lerp(v(-.04,1.58,1.45),drive).addScaledVector(v(-.06,0,-.22),wind);
      if(key==='hook'){left.add(v(.12,-.12,.05).multiplyScalar(drive));right.add(v(-.1,-.05,-.04).multiplyScalar(drive));left.applyAxisAngle(v(0,1,0),spin);right.applyAxisAngle(v(0,1,0),spin);}
      if(key==='heavy'){left.lerp(v(.17,1.65,.38),drive);right.lerp(v(-.04,1.55,1.6),drive);right.z-=.24*wind;}
      if(dodge){left.z+=.04*evade;right.z+=.04*evade;}
      if(key==='dodgeForward'){left.y-=duck*evade;right.y-=duck*evade;}
      for(const [side,goal,sign] of [['left',left,1],['right',right,-1]]) {
        const hooking=side==='right' && key==='rightHook';
        const pole=hooking?v(-.7,-.15,.22):key==='guard'?v(sign*.26,-1,.22):v(sign*.65,-.75,.05);
        const hand=find(side+'hand');solve(find(side+'arm'),find(side+'forearm'),hand,goal,pole.applyAxisAngle(v(0,1,0),spin));
        // Keep each wrist aligned with its forearm instead of bending the fist
        // backward to preserve the imported take's unrelated hand orientation.
        const neutral=saved.find(entry=>entry.n===hand).q;hand.quaternion.copy(neutral);hand.updateMatrixWorld(true);
      }
      for(const node of nodes){const list=values.get(node);const q=node.quaternion.clone().normalize();if(list.length && q.dot(new THREE.Quaternion().fromArray(list,list.length-4))<0)q.set(-q.x,-q.y,-q.z,-q.w);list.push(...q.toArray());}
      positions.push(...hips.position.toArray());
    }
  } finally {saved.forEach(({n,p,q})=>{n.position.copy(p);n.quaternion.copy(q);});root.updateMatrixWorld(true);}
  const tracks=nodes.map(n=>new THREE.QuaternionKeyframeTrack(n.name+'.quaternion',times,values.get(n)));
  tracks.push(new THREE.VectorKeyframeTrack(hips.name+'.position',times,positions));
  const clip=new THREE.AnimationClip(key,duration,tracks);clip.userData={...base.userData,derivative:'coordinated target-rig fighting stance',impactPhase:impact,soleRotations:groundSoles,choreography:({jab:'stepping jab',cross:'pivot cross',rightHook:'compact right hook',special:'loaded rear overhand',hook:'spinning roundhouse',heavy:'grounded power straight',guard:'compact boxing guard',dodgeLeft:'left upper-body slip',dodgeRight:'right upper-body slip',dodgeBack:'short back lean',dodgeForward:'short forward duck'}[key] || key)};return clip;
}
