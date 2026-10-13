const KEY='web-runner-progress-v1';
const rewards=[{id:'cyan',label:'청록 거미줄',score:1500,color:0x72f1ff},
  {id:'gold',label:'황금 거미줄',score:5000,color:0xffd47a},
  {id:'violet',label:'보라 거미줄',score:12000,color:0xcda2ff}];
const finitePosition=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)&&Math.abs(p[0])<2500&&Math.abs(p[2])<2500&&p[1]>-40&&p[1]<1000;
export class Progression {
  constructor(storage=null) {
    this.storage=storage;this.dirty=false;this.lastSaveSucceeded=true;
    this.data={score:0,bestCombo:0,distance:0,discoveries:[],safe:{},ghosts:{},medals:{},theme:'white'};
    try {
      const saved=JSON.parse(storage?.getItem(KEY)||'null');
      if(saved&&typeof saved==='object') {
        for(const key of ['score','bestCombo','distance'])if(Number.isFinite(saved[key])&&saved[key]>=0)this.data[key]=Math.min(saved[key],1e12);
        this.data.discoveries=Array.isArray(saved.discoveries)?saved.discoveries.filter(x=>typeof x==='string'&&/^(procedural|hong-kong):-?\d+:-?\d+$/.test(x)).slice(-2048):[];
        for(const city of ['procedural','hong-kong'])if(finitePosition(saved.safe?.[city]))this.data.safe[city]=saved.safe[city];
        for(const [course,g] of Object.entries(saved.ghosts||{}).slice(-6)) {
          if(!/^(procedural|hong-kong)-v[34]-[0-9a-f]{8}$/.test(course)||!Number.isFinite(g?.time)||g.time<=0)continue;
          if(!Array.isArray(g.samples)||g.samples.length<2||g.samples.length>3000)continue;
          if(!g.samples.every((s,i)=>Array.isArray(s)&&s.length===5&&s.every(Number.isFinite)&&s[0]>=0&&s[0]<=g.time+.2&&(!i||s[0]>g.samples[i-1][0])&&finitePosition(s.slice(1,4))))continue;
          this.data.ghosts[course]={time:g.time,samples:g.samples,splits:Array.isArray(g.splits)?g.splits.filter(t=>Number.isFinite(t)&&t>=0&&t<=g.time).slice(0,32):[]};
        }
        for(const [course,medal] of Object.entries(saved.medals||{}).slice(-64))if(/^(procedural|hong-kong)-v[34]-[0-9a-f]{8}$/.test(course)&&['bronze','silver','gold'].includes(medal))this.data.medals[course]=medal;
        if(['white',...rewards.filter(r=>this.data.score>=r.score).map(r=>r.id)].includes(saved.theme))this.data.theme=saved.theme;
      }
    }catch{/* Local storage may be unavailable. */}
    this.visited=new Set(this.data.discoveries);this.previous=null;
  }
  get unlocked(){return rewards.filter(r=>this.data.score>=r.score);}
  get color(){return rewards.find(r=>r.id===this.data.theme&&this.data.score>=r.score)?.color||0xf4f8ff;}
  bank(points){const before=this.unlocked.length;this.data.score+=points;this.data.bestCombo=Math.max(this.data.bestCombo,points);this.dirty=true;return this.unlocked.slice(before);}
  visit(position,city,grounded=false) {
    const p=position.toArray();if(!finitePosition(p))return false;
    if(this.previous&&this.previous.city===city){const distance=position.distanceTo(this.previous.position);if(distance<100)this.data.distance+=distance;}
    this.previous={city,position:position.clone()};
    const id=`${city}:${Math.floor(position.x/100)}:${Math.floor(position.z/100)}`;
    const discovered=!this.visited.has(id);
    if(discovered){this.visited.add(id);this.data.discoveries=[...this.visited].slice(-2048);}
    if(grounded)this.data.safe[city]=p;
    this.dirty=true;return discovered;
  }
  recordGhost(course,time,samples,splits,medal) {
    this.data.medals[course]=['bronze','silver','gold'].indexOf(medal)>['bronze','silver','gold'].indexOf(this.data.medals[course])?medal:(this.data.medals[course]||medal);
    const old=this.data.ghosts[course];
    if(!old||time<old.time){this.data.ghosts[course]={time,samples:samples.slice(0,3000),splits};while(Object.keys(this.data.ghosts).length>6)delete this.data.ghosts[Object.keys(this.data.ghosts)[0]];}
    this.dirty=true;this.save();
  }
  save(){if(!this.dirty)return this.lastSaveSucceeded;try{this.storage?.setItem(KEY,JSON.stringify(this.data));this.lastSaveSucceeded=!!this.storage;this.dirty=!this.lastSaveSucceeded;}catch{this.lastSaveSucceeded=false;}return this.lastSaveSucceeded;}
}
