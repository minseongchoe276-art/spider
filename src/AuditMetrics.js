// Bounded, opt-in QA measurements; no upload or production telemetry.
export class AuditMetrics {
  constructor(){this.frames=[];this.totalFrames=0;this.activeSeconds=0;this.longFrames=0;this.last=null;this.lastActive=false;this.sections={};}
  profile(target,method,label,active=()=>true){
    if(typeof target?.[method]!=='function')return;
    const original=target[method],section=this.sections[label]={samples:[],calls:0};
    target[method]=function(...args){
      if(!active())return original.apply(this,args);
      const start=performance.now();try{return original.apply(this,args);}finally{
        section.calls++;section.samples.push(performance.now()-start);if(section.samples.length>600)section.samples.shift();
      }
    };
  }
  sectionSnapshot(){return Object.fromEntries(Object.entries(this.sections).map(([name,s])=>{
    const sorted=[...s.samples].sort((a,b)=>a-b),n=sorted.length;
    return [name,{calls:s.calls,samples:n,meanMs:n?+(sorted.reduce((a,b)=>a+b,0)/n).toFixed(3):null,
      p95Ms:n?+sorted[Math.max(0,Math.ceil(n*.95)-1)].toFixed(3):null}];
  }));}
  update(now,active){
    if(this.last!==null&&active&&this.lastActive){const seconds=now-this.last;if(Number.isFinite(seconds)&&seconds>0){
      const ms=seconds*1000;this.frames.push(ms);if(this.frames.length>3600)this.frames.shift();
      this.totalFrames++;this.activeSeconds+=seconds;if(ms>50)this.longFrames++;
    }}
    this.last=now;this.lastActive=active;
  }
  snapshot(){const sorted=[...this.frames].sort((a,b)=>a-b),n=sorted.length;
    const percentile=p=>n?+sorted[Math.max(0,Math.ceil(n*p)-1)].toFixed(2):null;
    return {windowFrames:n,totalFrames:this.totalFrames,activeSeconds:+this.activeSeconds.toFixed(2),
      averageFps:n?+(1000*n/this.frames.reduce((a,b)=>a+b,0)).toFixed(2):null,
      frameMs:{p50:percentile(.5),p95:percentile(.95),p99:percentile(.99)},longFramesOver50ms:this.longFrames};
  }
}
