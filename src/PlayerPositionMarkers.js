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

export class PlayerPositionMarkers {
  constructor(game){this.game=game;this.root=document.getElementById('player-markers');this.markers=new Map();}
  update(players,origin,active) {
    if(!this.root)return;
    this.root.classList.toggle('hidden',!active);
    const ids=new Set(),rect=this.game.canvas.getBoundingClientRect();
    if(active)for(const player of players){
      if(player.rescue)continue;
      ids.add(player.id);let el=this.markers.get(player.id);
      if(!el){el=document.createElement('div');el.className='player-position-marker';this.root.append(el);this.markers.set(player.id,el);}
      const point=new THREE.Vector3(player.x,player.y+2.6,player.z);
      const placed=positionMarker(point,this.game.camera,rect.width,rect.height,110);
      const distance=Math.round(origin.distanceTo(new THREE.Vector3(player.x,player.y,player.z)));
      const altitude=Math.round(player.y-origin.y);
      const role=player.team==='police'?'경찰':player.team==='runner'?'도망자':'플레이어';
      const arrow=placed.offscreen?['→','↘','↓','↙','←','↖','↑','↗'][(Math.round(placed.angle/(Math.PI/4))+8)%8]+' ':'';
      const name=String(player.name || role).slice(0,12);
      el.textContent=`${arrow}${name} · ${distance}m${Math.abs(altitude)>=3?' · '+(altitude>0?'↑':'↓')+Math.abs(altitude)+'m':''}${player.connected===false?' · 연결 끊김':''}`;
      el.setAttribute('aria-label',`${role} ${player.name}, 거리 ${distance}미터, 높이 차 ${altitude}미터`);
      el.dataset.team=player.ally?'ally':player.team;el.classList.toggle('offscreen',placed.offscreen);
      el.style.left=`${placed.x}px`;el.style.top=`${placed.y}px`;
    }
    for(const [id,el]of this.markers)if(!ids.has(id)){el.remove();this.markers.delete(id);}
  }
}
