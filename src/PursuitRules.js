export const PURSUIT={goal:3,checkpointRadius:7,checkpointCooldown:1200,reviveMs:3000,reviveRadius:3.5,pulseInterval:20000,pulseLength:3500};
export const matchDuration=count=>count<=2?180000:count<=6?240000:300000;
export function validArenaPoint(p){return p&&[p.x,p.y,p.z].every(Number.isFinite)&&Math.abs(p.x)<2400&&Math.abs(p.z)<2400&&p.y>=0&&p.y<=900;}
export function arenaFrom(point,city,roofs=[]) {
  if(!validArenaPoint(point))return null;
  const radius=city==='procedural'?300:450;
  const points=roofs.filter(validArenaPoint).filter(p=>Math.hypot(p.x-point.x,p.z-point.z)<radius-25&&Math.hypot(p.x-point.x,p.z-point.z)>25).slice(0,12);
  if(points.length<2)return null;
  return {x:point.x,y:point.y,z:point.z,radius,points};
}
export function arenaContains(arena,p,padding=0){return !arena||Math.hypot(p.x-arena.x,p.z-arena.z)<=arena.radius+padding;}
