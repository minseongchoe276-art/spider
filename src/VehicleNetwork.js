export const VEHICLE_IDS=Object.freeze(['bmw','corvette']);
export const VEHICLE_LABELS=Object.freeze({bmw:'BMW 330i',corvette:'Corvette C6 ZR1'});
const phases=new Set(['NONE','PARKED','ENTERING','DRIVING','EXITING']);
const point=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k])&&Math.abs(p[k])<=2500)?{x:p.x,y:p.y,z:p.z}:null;
export function sanitizeVehicle(v){
 if(!v||!Number.isInteger(v.sequence)||v.sequence<0||v.sequence>2147483647||!phases.has(v.phase))return null;
 if(v.phase==='NONE')return {phase:'NONE',sequence:v.sequence};
 if(!VEHICLE_IDS.includes(v.model)||!point(v.position)||!point(v.start)||!point(v.exit))return null;
 const limits={yaw:Math.PI*2,pitch:.55,roll:.55,speed:24.1,steering:.6,spin:1000000,elapsed:1.5,startYaw:Math.PI*2};
 if(Object.entries(limits).some(([k,max])=>!Number.isFinite(v[k])||Math.abs(v[k])>max)||v.elapsed<0)return null;
 const drops=v.wheelDrops||[0,0,0,0];if(!Array.isArray(drops)||drops.length!==4||drops.some(n=>!Number.isFinite(n)||Math.abs(n)>.2))return null;
 if(['PARKED','EXITING'].includes(v.phase)&&Math.abs(v.speed)>1.21)return null;
 return {wheelDrops:drops.slice(),phase:v.phase,sequence:v.sequence,model:v.model,position:point(v.position),start:point(v.start),exit:point(v.exit),...Object.fromEntries(Object.keys(limits).map(k=>[k,v[k]]))};
}
export function vehicleOverlap(a,b,margin=0){
 if(!a||!b||a.phase==='NONE'||b.phase==='NONE'||Math.abs(a.position.y-b.position.y)>1.5)return false;
 const dx=b.position.x-a.position.x,dz=b.position.z-a.position.z;
 return [a.yaw,b.yaw].every(yaw=>[[Math.cos(yaw),-Math.sin(yaw)],[Math.sin(yaw),Math.cos(yaw)]].every(([x,z])=>{
  const radius=v=>1.33*Math.abs(Math.cos(v.yaw)*x-Math.sin(v.yaw)*z)+2.35*Math.abs(Math.sin(v.yaw)*x+Math.cos(v.yaw)*z);
  return Math.abs(dx*x+dz*z)<radius(a)+radius(b)+margin;
 }));
}
export function vehicleUpdateError(next,previous,{player,previousPlayer=player,elapsed=0,others=[],limit=2400}={}){
 if(!next)return previous&&previous.phase!=='NONE'?'missing':null;
 if(previous&&next.sequence<=previous.sequence)return 'stale';
 if(next.phase==='NONE')return previous&&['ENTERING','DRIVING','EXITING'].includes(previous.phase)?'exit-required':null;
 const p=next.position;if(Math.abs(p.x)+2.7>limit||Math.abs(p.z)+2.7>limit||p.y<-.1||p.y>1000)return 'bounds';
 const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
 if(next.phase!=='PARKED'&&distance(p,player)>3.5)return 'driver-position';
 if(previous&&previous.phase!=='NONE'){
  const travel=distance(p,previous.position),driving=['ENTERING','DRIVING','EXITING'].includes(previous.phase);
  if(driving&&next.model!==previous.model)return 'model-change';
  if(driving&&travel>Math.min(1,Math.max(.04,elapsed))*28+.5)return 'speed';
  if(!driving&&next.phase!=='PARKED'&&travel>.15)return 'entry-moved-car';
  if(next.phase==='PARKED'&&!driving&&travel>.15&&distance(p,player)>55)return 'spawn-distance';
  if(previous.phase==='PARKED'&&next.phase!=='PARKED'&&distance(previous.position,previousPlayer)>6)return 'entry-distance';
 }else if(next.phase!=='PARKED')return 'spawn-required';
 else if(distance(p,player)>55)return 'spawn-distance';
 if(others.some(other=>vehicleOverlap(next,other,.03)))return 'vehicle-collision';
 return null;
}
