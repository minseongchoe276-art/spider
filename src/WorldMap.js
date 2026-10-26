import {LOCAL_MAPS,mapName} from './MapCatalog.js';
import {language,t} from './I18n.js';
import { worldToMinimap, worldToHongKongCoordinates } from './Minimap.js';

export function mercatorPixels(latitude, longitude, zoom = 14) {
  const scale=256*2**zoom,lat=latitude*Math.PI/180;
  return {x:(longitude+180)/360*scale,y:(1-Math.asinh(Math.tan(lat))/Math.PI)/2*scale};
}

// A separate 2D overview never adds a territory-wide streaming camera.
export class WorldMap {
  constructor(game) {
    this.game=game;this.isOpen=false;this.mapTiles=new Map();
    this.root=document.createElement('dialog');this.root.id='world-map';
    this.root.setAttribute('aria-label','전체 지도');
    this.root.innerHTML='<header><div><small>WORLD MAP</small><h2>전체 지도</h2></div><button type="button" aria-label="전체 지도 닫기">닫기 <kbd>M / Esc</kbd></button></header><canvas aria-label="전체 플레이 구역과 플레이어 위치"></canvas><footer><span>북쪽 ↑ · 흰색: 내 위치 · 청록: 플레이어 · 빨강: 적</span><span class="map-coverage"></span></footer><a class="map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>';
    this.root.querySelector('h2').textContent=mapName(game.city.isStreamed?'hong-kong':game.city.mapId,language());
    const nav=document.createElement('nav');nav.className='world-map-destinations';nav.setAttribute('aria-label',t('플레이 지도 선택'));
    for(const map of [{id:'hong-kong'},...LOCAL_MAPS]){const link=document.createElement('a'),url=new URL(location.href);url.searchParams.set('city',map.id);url.searchParams.delete('join');link.href=url.pathname+url.search;link.textContent=mapName(map.id,language());if((game.city.isStreamed?'hong-kong':game.city.mapId)===map.id)link.setAttribute('aria-current','page');nav.append(link);}
    this.root.append(nav);
    this.root.querySelector('.map-attribution').hidden=!game.city.isStreamed;
    document.body.append(this.root);this.canvas=this.root.querySelector('canvas');this.ctx=this.canvas.getContext('2d');
    this.root.querySelector('button').addEventListener('click',()=>this.close());
    this.root.addEventListener('cancel',e=>{e.preventDefault();this.close();});
    this.root.addEventListener('click',e=>{if(e.target===this.root)this.close();});
  }
  toggle(){if(this.isOpen)this.close();else this.open();}
  open(){
    if(this.isOpen || !this.game.isPlaying || this.game.contextLost)return;
    this.wasPaused=this.game.isPaused;this.game.clearInput();
    this.game.setPaused(true);
    this.root.showModal();this.isOpen=true;this.lastDraw=0;this.update();
  }
  close(){
    if(!this.isOpen)return;
    this.isOpen=false;this.root.close();this.game.clearInput();
    if(!this.wasPaused && this.game.isPlaying && !this.game.contextLost && !document.hidden){this.game.setPaused(false);this.game.canvas.focus?.();
      if(this.game.pointerLockWanted)Promise.resolve(this.game.canvas.requestPointerLock?.()).catch(()=>{});}
  }
  drawHongKongBase(ctx, extent, pad, radius) {
    const nw=worldToHongKongCoordinates({x:extent,z:extent});
    const se=worldToHongKongCoordinates({x:-extent,z:-extent});
    const a=mercatorPixels(nw.latitude,nw.longitude),b=mercatorPixels(se.latitude,se.longitude);
    const scale=radius*2/(b.x-a.x);let loaded=0;
    ctx.save();ctx.beginPath();ctx.rect(pad,pad,radius*2,radius*2);ctx.clip();
    for(let x=Math.floor(a.x/256);x<=Math.floor(b.x/256);x++)for(let y=Math.floor(a.y/256);y<=Math.floor(b.y/256);y++){
      const key=`14/${x}/${y}`;let tile=this.mapTiles.get(key);
      if(!tile){tile=new Image();tile.decoding='async';tile.referrerPolicy='strict-origin-when-cross-origin';
        tile.src=`https://tile.openstreetmap.org/${key}.png`;this.mapTiles.set(key,tile);}
      if(tile.complete&&tile.naturalWidth){ctx.drawImage(tile,pad+(x*256-a.x)*scale,pad+(y*256-a.y)*scale,256*scale+.5,256*scale+.5);loaded++;}
    }
    ctx.fillStyle='rgba(6,20,33,.18)';ctx.fillRect(pad,pad,radius*2,radius*2);ctx.restore();
    return loaded;
  }
  update(){
    if(!this.isOpen || performance.now()-this.lastDraw<200)return;
    this.lastDraw=performance.now();
    const size=Math.max(200,Math.floor(Math.min(innerWidth-64,innerHeight-200,900)));
    if(this.canvas.width!==size){this.canvas.width=size;this.canvas.height=size;}
    const ctx=this.ctx,city=this.game.city,extent=city.playableHalfExtent||2400,pad=22,radius=size/2-pad;
    const project=p=>worldToMinimap(p,{x:0,z:0},extent,radius,size/2);
    ctx.fillStyle='#09121e';ctx.fillRect(0,0,size,size);
    ctx.strokeStyle='#203447';ctx.lineWidth=1;
    for(let v=-extent;v<=extent;v+=extent/6){const a=project({x:v,z:v});ctx.beginPath();ctx.moveTo(a.x,pad);ctx.lineTo(a.x,size-pad);ctx.moveTo(pad,a.y);ctx.lineTo(size-pad,a.y);ctx.stroke();}
    const baseTiles=city.isStreamed?this.drawHongKongBase(ctx,extent,pad,radius):0;
    if(!city.isStreamed){
      // Draw the real street grid under the same building footprints.
      ctx.fillStyle=city.mapId==='harbor'?'#163e4b':'#142b36';ctx.fillRect(pad,pad,radius*2,radius*2);
      if(city.mapId==='procedural') {
        const step=(city.layout?.blockSize||32)+(city.layout?.streetWidth||28);
        ctx.strokeStyle='#253e4a';ctx.lineWidth=(city.layout?.streetWidth||28)*radius/extent;
        for(let v=-2*step;v<=2*step;v+=step){const a=project({x:v,z:v});ctx.beginPath();ctx.moveTo(a.x,pad);ctx.lineTo(a.x,size-pad);ctx.moveTo(pad,a.y);ctx.lineTo(size-pad,a.y);ctx.stroke();}
      } else {
        const rectangle=(rect,color)=>{const a=project({x:rect.x+rect.width/2,z:rect.z+rect.depth/2}),b=project({x:rect.x-rect.width/2,z:rect.z-rect.depth/2});ctx.fillStyle=color;ctx.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);};
        ctx.save();ctx.beginPath();ctx.rect(pad,pad,radius*2,radius*2);ctx.clip();
        for(const rect of city.district?.zones||[])rectangle(rect,rect.color);
        for(const rect of city.district?.roads||[])rectangle(rect,'#526374');
        ctx.restore();
      }
    }
    // Reuse local city geometry; streamed districts use the geographic basemap.
    let footprints=[];
    if(!city.isStreamed){
      const map=this.game.minimap,previousRange=map.range;map.range=extent*1.5;
      try{footprints=map.collectFootprints({x:0,z:0});}finally{map.range=previousRange;}
    }
    // Roads use world-scaled strokes; building outlines stay readable in pixels.
    ctx.lineWidth=1;
    for(const f of footprints){const a=project({x:f.maxX,z:f.maxZ}),b=project({x:f.minX,z:f.minZ});
      ctx.fillStyle=city.mapId==='gardens'?'#315b4a':'#244857';ctx.strokeStyle=city.profile?.accent||'#3a7580';ctx.fillRect(a.x,a.y,Math.max(1,b.x-a.x),Math.max(1,b.y-a.y));ctx.strokeRect(a.x,a.y,Math.max(1,b.x-a.x),Math.max(1,b.y-a.y));}
    ctx.lineWidth=1.5;ctx.strokeStyle='#75a6be';ctx.strokeRect(pad,pad,size-pad*2,size-pad*2);
    const dot=(position,color,label,r=4)=>{const p=project(position);ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#081422';ctx.lineWidth=2;ctx.stroke();if(label){ctx.font='bold 12px system-ui';ctx.lineWidth=3;ctx.strokeText(label,p.x+10,p.y-8);ctx.fillText(label,p.x+10,p.y-8);}};
    for(const p of this.game.multiplayer?.minimapPlayers()||[])dot(p,'#61dbea',p.name||t('플레이어'));
    for(const e of this.game.combat?.enemies||[])if(e.health>0)dot(e.position,'#ff647e');
    dot(this.game.physics.position,'#ffffff',t('내 위치'),6);
    ctx.fillStyle='#a9c6d7';ctx.font='12px system-ui';ctx.fillText('N ↑',pad,16);ctx.fillText(`${(extent*2/1000).toFixed(1)} km`,size/2-20,size-6);
    this.root.querySelector('.map-coverage').textContent=city.isStreamed?(baseTiles?'홍콩 전체 플레이 구역 · 도로·해안 지도':'지도 배경 불러오는 중 · 위치 표시 가능'):`${mapName(city.mapId,language())} · ${t('전체 구역')}`;
  }
}
