export const PURSUIT={goal:3,checkpointRadius:7,checkpointCooldown:1200,reviveMs:3000,reviveRadius:3.5,pulseInterval:20000,pulseLength:3500};
export const matchDuration=count=>count<=2?180000:count<=6?240000:300000;
export function validArenaPoint(p){return p&&[p.x,p.y,p.z].every(Number.isFinite)&&Math.abs(p.x)<2400&&Math.abs(p.z)<2400&&p.y>=0&&p.y<=900;}
export function arenaFrom(point,city,roofs=[]) {
  if(!validArenaPoint(point))return null;
  const radius=city==='procedural'?300:450;
  const points=[];
  for(const p of roofs.slice(0,128).filter(validArenaPoint)) {
    const distance=Math.hypot(p.x-point.x,p.z-point.z);
    if(distance<=25 || distance>=radius-25 || points.some(other=>Math.hypot(other.x-p.x,other.z-p.z)<25))continue;
    points.push({x:p.x,y:p.y,z:p.z});if(points.length===12)break;
  }
  if(points.length<2)return null;
  return {x:point.x,y:point.y,z:point.z,radius,points};
}
export function arenaContains(arena,p,padding=0){return !arena||Math.hypot(p.x-arena.x,p.z-arena.z)<=arena.radius+padding;}
