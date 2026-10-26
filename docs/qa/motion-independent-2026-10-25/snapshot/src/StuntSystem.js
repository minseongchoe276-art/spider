export class StuntSystem {
  constructor({onBank=()=>{},onChange=()=>{}}={}) {
    this.onBank=onBank;this.onChange=onChange;this.total=0;this.best=0;this.reset();
  }
  reset(){this.pending=0;this.multiplier=1;this.actions=new Set();this.repeats=new Map();this.idle=0;this.lastState=null;this.wallTime=0;}
  add(name,points) {
    if(!Number.isFinite(points)||points<=0)return 0;
    const repeated=this.repeats.get(name)||0;
    this.repeats.set(name,repeated+1);this.actions.add(name);
    this.multiplier=Math.min(4,1+(this.actions.size-1)*0.5);
    const earned=Math.round(points/Math.pow(2,Math.min(repeated,4))*this.multiplier);
    this.pending+=earned;this.idle=0;this.onChange(name,earned);return earned;
  }
  bank(impact=0) {
    if(!this.pending)return 0;
    const awarded=Math.round(this.pending*(impact<18?1.2:1));
    const variety=this.actions.size;this.total+=awarded;this.best=Math.max(this.best,awarded);
    this.reset();this.onBank(awarded,variety);return awarded;
  }
  fail(){if(this.pending){this.reset();this.onChange('연속 묘기 중단',0);}}
  update(delta,state,speed=0) {
    if(this.lastState==='MANTLING'&&['IDLE','RUNNING','SPRINTING'].includes(state))this.bank(0);
    if(this.pending)this.idle+=delta;
    if(this.idle>12)this.fail();
    this.wallTime=state==='WALL_RUNNING'?this.wallTime+delta:0;
    if(state==='WALL_RUNNING'&&this.wallTime>=.6&&this.lastState!=='WALL_RUNNING_REWARDED') {
      this.add('벽 이동',120);this.lastState='WALL_RUNNING_REWARDED';
    }
    if(state!=='WALL_RUNNING') {
      if(state==='MANTLING'&&this.lastState!==state)this.add('옥상 진입',100);
      if(state==='SWINGING'&&this.lastState!==state&&speed>10)this.add('스윙 연결',80);
      this.lastState=state;
    }
  }
}
