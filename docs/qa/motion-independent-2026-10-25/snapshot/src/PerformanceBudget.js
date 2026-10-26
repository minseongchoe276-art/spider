export class PerformanceBudget {
  constructor(){this.samples=[];this.time=0;this.bad=0;this.good=0;this.level=1.5;this.p95=0;}
  reset(level=1.5){this.samples=[];this.time=0;this.bad=this.good=0;this.level=level;this.p95=0;}
  update(seconds,enabled,ceiling=1.5) {
    if(!Number.isFinite(seconds)||seconds<=0)return null;
    this.samples.push(Math.min(seconds*1000,1000));if(this.samples.length>240)this.samples.shift();
    this.time+=seconds;if(this.time<3)return null;this.time=0;
    const sorted=[...this.samples].sort((a,b)=>a-b);
    this.p95=sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))];
    if(!enabled){this.bad=this.good=0;this.level=ceiling;return null;}
    this.level=Math.min(this.level,ceiling);
    if(this.p95>25){this.bad++;this.good=0;}else if(this.p95<17){this.good++;this.bad=0;}else this.bad=this.good=0;
    if(this.bad>=2&&this.level>.7){this.level=Math.max(.7,this.level-.2);this.bad=0;return this.level;}
    if(this.good>=5&&this.level<ceiling){this.level=Math.min(ceiling,this.level+.1);this.good=0;return this.level;}
    return null;
  }
}
