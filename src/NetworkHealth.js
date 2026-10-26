export class NetworkHealth {
  constructor(){this.samples=[];this.lastReceived=null;this.lastPing=null;}
  received(now){if(Number.isFinite(now))this.lastReceived=now;}
  ping(now){if(Number.isFinite(now))this.lastPing=now;}
  pong(stamp,now){
    // Accept only the current probe: malformed/unrelated stamps cannot create
    // a misleading latency sample or hide a failed probe.
    if(stamp!==this.lastPing||!Number.isFinite(now)||now<stamp||now-stamp>60000)return false;
    this.samples.push(now-stamp);if(this.samples.length>24)this.samples.shift();this.lastPing=null;return true;
  }
  snapshot(now){
    const values=[...this.samples].sort((a,b)=>a-b),p95=values.length?values[Math.min(values.length-1,Math.floor(values.length*.95))]:null;
    const jitter=this.samples.length>1?this.samples.slice(1).reduce((sum,v,i)=>sum+Math.abs(v-this.samples[i]),0)/(this.samples.length-1):0;
    const stalled=this.lastReceived!==null&&now-this.lastReceived>12000;
    return {p95Ms:p95===null?null:Math.round(p95),jitterMs:Math.round(jitter),stalled,
      degraded:stalled||(p95!==null&&p95>300)||jitter>100,
      reconnect:stalled&&this.lastPing!==null&&now-this.lastPing>15000};
  }
}
