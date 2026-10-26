import {RELEASE_SOURCE} from './ReleaseIdentity.js';
const count=value=>Number.isFinite(value)?Math.max(0,Math.round(value)):null;
const heap=()=>count(globalThis.performance?.memory?.usedJSHeapSize);
const percentile=(histogram,total,worst)=>{
  if(!total)return null;let count=0;
  for(let ms=0;ms<histogram.length;ms++){count+=histogram[ms];if(count>=Math.ceil(total*.95))return ms===1000?Math.ceil(worst):ms;}
  return null;
};
const eventTypes=new Set(['hidden','visible','resize','context-lost','context-restored','pause','resume','recovery','disconnected','reconnect']);
// Bounded, local-only measurements. No player names, tokens or positions.
export class PlayDiagnostics {
  constructor(){this.seconds=0;this.frames=0;this.slowFrames=0;this.reconnects=0;this.buckets=[];this.elapsed=0;this.worst=0;
    this.sessionId=globalThis.crypto?.randomUUID?.()||`local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.histogram=new Uint32Array(1001);this.totalHistogram=new Float64Array(1001);this.totalFrames=0;this.totalSlow=0;this.totalWorst=0;
    this.events=[];this.firstHeap=null;this.lastHeap=null;
  }
  record(type){if(!eventTypes.has(type))return;if(type==='reconnect')this.reconnects++;
    this.events.push({type,activeSeconds:Math.round(this.seconds)});if(this.events.length>256)this.events.shift();}
  sample(dt,game){
    if(!Number.isFinite(dt)||dt<=0)return;
    // Active stalls are evidence, not a reason to discard a slow frame. A
    // one-minute bound keeps a corrupted clock from producing nonfinite totals.
    dt=Math.min(dt,60);
    const ms=dt*1000,bin=Math.min(1000,Math.ceil(ms));
    this.histogram[bin]++;this.totalHistogram[bin]++;this.totalFrames++;
    if(dt>1/30)this.totalSlow++;this.totalWorst=Math.max(this.totalWorst,ms);
    this.seconds+=dt;this.elapsed+=dt;this.frames++;if(dt>1/30)this.slowFrames++;
    this.worst=Math.max(this.worst,dt*1000);
    if(this.elapsed>=5){const memory=heap(),info=game?.renderer?.info;
      if(this.firstHeap===null&&memory!==null)this.firstHeap=memory;if(memory!==null)this.lastHeap=memory;
      this.buckets.push({seconds:Math.round(this.seconds),fps:Math.round(this.frames/this.elapsed),slowFrames:this.slowFrames,worstMs:Math.round(this.worst),
        p95Ms:percentile(this.histogram,this.frames,this.worst),heapBytes:memory,
        geometries:count(info?.memory?.geometries),textures:count(info?.memory?.textures),calls:count(info?.render?.calls),triangles:count(info?.render?.triangles)});
      if(this.buckets.length>360)this.buckets.shift();this.elapsed=this.frames=this.slowFrames=this.worst=0;this.histogram.fill(0);}
  }
  report(game){return {version:2,sessionId:this.sessionId,sourceId:RELEASE_SOURCE,measuredActiveSeconds:Math.round(this.seconds),reconnects:this.reconnects,
    summary:{frames:this.totalFrames,p95Ms:percentile(this.totalHistogram,this.totalFrames,this.totalWorst),slowFrames:this.totalSlow,worstMs:Math.round(this.totalWorst),
      firstHeapBytes:this.firstHeap,lastHeapBytes:this.lastHeap,heapChangeBytes:this.firstHeap===null||this.lastHeap===null?null:this.lastHeap-this.firstHeap},
    capabilities:{heap:heap()!==null,thermal:false,battery:false},interruptions:this.events.map(e=>({...e})),study:game.experience?.study?.report()||null,
    city:game.city.mapId||(game.city.isStreamed?'hong-kong':'procedural'),touch:!!game.touchControls?.enabled,
    viewport:[game.viewportWidth||0,game.viewportHeight||0],quality:game.preferences.values.quality,
    pixelRatio:game.renderer.getPixelRatio(),startupMs:Math.round(game.readyMilliseconds||0),
    renderer:{calls:game.renderer.info.render.calls,triangles:game.renderer.info.render.triangles,geometries:game.renderer.info.memory.geometries,textures:game.renderer.info.memory.textures},
    latencyMs:Number.isFinite(game.multiplayer?.ws?.lastRpcMs??game.multiplayer?.latency)?Math.round(game.multiplayer.ws?.lastRpcMs??game.multiplayer.latency):null,
    network:game.multiplayer?.networkHealth?.snapshot(performance.now())||null,
    recentSamples:this.buckets.map(b=>({...b}))};}
}
