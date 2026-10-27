import {t} from './I18n.js';
import * as THREE from 'three';

export function positionMarker(point,camera,width,height,padding=36) {
  camera.updateMatrixWorld(true);
  const local=point.clone().applyMatrix4(camera.matrixWorldInverse);
  const projected=point.clone().project(camera);
  const behind=local.z>=-camera.near;
  let dx=projected.x*width/2,dy=-projected.y*height/2;
  if(behind){dx=local.x;dy=Math.max(1,local.z);}
  const maxX=Math.max(1,width/2-padding),maxY=Math.max(1,height/2-padding);
  const offscreen=behind || Math.abs(dx)>maxX || Math.abs(dy)>maxY || projected.z>1;
  if(offscreen){const scale=Math.min(maxX/Math.max(Math.abs(dx),1e-6),maxY/Math.max(Math.abs(dy),1e-6));dx*=scale;dy*=scale;}
  return {x:width/2+dx,y:height/2+dy,offscreen,angle:Math.atan2(dy,dx)};
}

// Keep a full eight-player squad readable when projected heads share a row.
export function separateMarker(placed,occupied,width,height) {
  const compact=height<480,w=Math.min(compact?220:250,Math.max(32,width-16)),h=compact?28:40;
  const x=THREE.MathUtils.clamp(placed.x,w/2+8,width-w/2-8);
  const minY=Math.min(height-8,(compact?64:96)+h),maxY=height-8,step=h+4;
  const candidates=[placed.y,minY,maxY];
  for(let n=1;n<=8;n++)candidates.push(placed.y+n*step,placed.y-n*step,minY+n*step,maxY-n*step);
  let best=null;
  for(const raw of candidates){
    const y=THREE.MathUtils.clamp(raw,minY,maxY),box={x:x-w/2,y:y-h,w,h};
    const overlaps=occupied.filter(b=>box.x<b.x+b.w+2&&box.x+box.w+2>b.x&&box.y<b.y+b.h+2&&box.y+box.h+2>b.y).length;
    const score=overlaps*10000+Math.abs(y-placed.y);
    if(!best||score<best.score)best={...box,score};
  }
  occupied.push(best);return {x,y:best.y+h,compact};
}

export class PlayerPositionMarkers {
  constructor(game){this.game=game;this.root=document.getElementById('player-markers');this.markers=new Map();}
  update(players,origin,active) {
    if(!this.root)return;
    this.root.classList.toggle('hidden',!active);
    const ids=new Set(),rect=this.game.canvas.getBoundingClientRect(),occupied=[];
    if(active)for(const player of players){
      if(![player.x,player.y,player.z].every(Number.isFinite))continue;
      ids.add(player.id);let el=this.markers.get(player.id);
      if(!el){el=document.createElement('div');el.className='player-position-marker';this.root.append(el);this.markers.set(player.id,el);}
      const point=new THREE.Vector3(player.x,player.y+2.6,player.z);
      const padding=Math.min(140,Math.max(36,rect.width/2-20),Math.max(36,rect.height/2-20));
      const placed=positionMarker(point,this.game.camera,rect.width,rect.height,padding);
      const distance=Math.round(origin.distanceTo(new THREE.Vector3(player.x,player.y,player.z)));
      const altitude=Math.round(player.y-origin.y);
      const role=player.team==='red'?'레드 팀':player.team==='blue'?'블루 팀':player.team==='police'?'경찰':player.team==='runner'?'도망자':'플레이어';
      const arrow=placed.offscreen?['→','↘','↓','↙','←','↖','↑','↗'][(Math.round(placed.angle/(Math.PI/4))+8)%8]+' ':'';
      const name=String(player.name || t(role)).slice(0,12);
      el.textContent=`${arrow}${name}${Number.isFinite(player.health)?' · HP '+player.health:''} · ${distance}m${Math.abs(altitude)>=3?' · '+(altitude>0?'↑':'↓')+Math.abs(altitude)+'m':''}${player.targeted?t(' · 조준 대상'):''}${player.rescue?t(' · 구조'):player.downed?t(' · 탈락'):''}${player.connected===false?t(' · 마지막 위치'):''}`;
      el.dataset.userContent='';el.setAttribute('aria-label',`${t(role)} ${player.name}, ${t('거리')} ${distance}${t('미터')}, ${t('높이 차')} ${altitude}${t('미터')}${Number.isFinite(player.health)?`, HP ${player.health}/100`:''}`);
      el.classList.toggle('targeted',!!player.targeted);el.classList.toggle('low-health',Number.isFinite(player.health)&&player.health<=25);el.classList.toggle('has-health',Number.isFinite(player.health));el.style.setProperty('--hp-value',`${Math.max(0,Math.min(100,player.health??100))}%`);
      el.style.setProperty('--hp-ratio',String(Math.max(0,Math.min(100,player.health??100))/100));
      el.dataset.team=player.ally?'ally':player.team;el.classList.toggle('offscreen',placed.offscreen);
      const separated=separateMarker(placed,occupied,rect.width,rect.height);
      el.classList.toggle('compact',separated.compact);
      el.style.left=`${separated.x}px`;el.style.top=`${separated.y}px`;
    }
    for(const [id,el]of this.markers)if(!ids.has(id)){el.remove();this.markers.delete(id);}
  }
}
