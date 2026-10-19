const KEY='web-runner-progress-v1';
const rewards=[{id:'cyan',label:'청록 거미줄',color:0x72f1ff},
  {id:'gold',label:'황금 거미줄',color:0xffd47a},
  {id:'violet',label:'보라 거미줄',color:0xcda2ff}];
const finitePosition=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)&&Math.abs(p[0])<2500&&Math.abs(p[2])<2500&&p[1]>-40&&p[1]<1000;
export class Progression {
  constructor(storage=null) {
    this.storage=storage;this.dirty=false;this.lastSaveSucceeded=true;
    this.data={distance:0,discoveries:[],safe:{},theme:'white'};
    try {
      const saved=JSON.parse(storage?.getItem(KEY)||'null');
      if(saved&&typeof saved==='object') {
        if(Number.isFinite(saved.distance)&&saved.distance>=0)this.data.distance=Math.min(saved.distance,1e12);
        this.dirty=Object.keys(saved).some(key=>!Object.hasOwn(this.data,key));
        this.data.discoveries=Array.isArray(saved.discoveries)?saved.discoveries.filter(x=>typeof x==='string'&&/^(procedural|hong-kong):-?\d+:-?\d+$/.test(x)).slice(-2048):[];
        for(const city of ['procedural','hong-kong'])if(finitePosition(saved.safe?.[city]))this.data.safe[city]=saved.safe[city];
        if(['white',...rewards.map(r=>r.id)].includes(saved.theme))this.data.theme=saved.theme;
      }
    }catch{/* Local storage may be unavailable. */}
    this.visited=new Set(this.data.discoveries);this.previous=null;
  }
  get unlocked(){return rewards;}
  get color(){return rewards.find(r=>r.id===this.data.theme)?.color||0xf4f8ff;}
  resetTravel(){this.previous=null;}
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
  save(){if(!this.dirty)return this.lastSaveSucceeded;try{this.storage?.setItem(KEY,JSON.stringify(this.data));this.lastSaveSucceeded=!!this.storage;this.dirty=!this.lastSaveSucceeded;}catch{this.lastSaveSucceeded=false;}return this.lastSaveSucceeded;}
}
