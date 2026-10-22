import * as THREE from 'three';
import {language} from './I18n.js';
const NAMES={jab:['잽','Jab'],cross:['크로스','Cross'],hook:['라이징 훅','Rising Hook'],special:['펄스 스트라이크','Pulse Strike'],slam:['에어 다이브','Air Dive'],slamLand:['임팩트','Impact'],dodgeLeft:['회피','Evade'],dodgeRight:['회피','Evade'],dodgeForward:['회피','Evade'],dodgeBack:['회피','Evade'],trick:['에어 롤','Air Roll']};
// Presentation observes accepted actions: it never changes damage, cooldown or input.
export class SkillPresentation {
  constructor(game){
    this.game=game;this.lastAction=null;this.lastState='';this.lastWebs=0;this.until=0;this.nextCast=0;
    this.root=document.createElement('output');this.root.id='skill-cast';this.root.hidden=true;this.root.setAttribute('aria-live','polite');
    this.root.innerHTML='<svg class="cast-emblem" viewBox="0 0 72 72" aria-hidden="true"><circle cx="36" cy="36" r="30"/><circle cx="36" cy="36" r="23"/><path d="M16 39h13l6-20 8 35 5-19h9"/></svg><span><small>SHADOW / KINETIC ARTS</small><strong></strong><i></i></span>';
    document.body.append(this.root);
    this.pool=Array.from({length:6},(_,i)=>{
      const geometry=new THREE.TorusGeometry(1,.018,4,52,Math.PI*1.45);
      const material=new THREE.MeshBasicMaterial({color:i%2?0xbca7ff:0x7df1f5,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false});
      const mesh=new THREE.Mesh(geometry,material);mesh.visible=false;mesh.frustumCulled=false;game.scene.add(mesh);return {mesh,age:1,life:.55};
    });this.lastTime=performance.now();
  }
  cast(key){
    const g=this.game,now=performance.now();if(now<this.nextCast)return;this.nextCast=now+180;
    const names=NAMES[key];if(!names)return;
    this.root.querySelector('strong').textContent=names[language()==='en'?1:0];
    this.root.querySelector('i').textContent=key==='special'?'POWER / 035':key.startsWith('dodge')?'MOTION / EVADE':'FLOW / ACTIVE';
    this.root.dataset.kind=key;this.root.hidden=false;this.root.classList.remove('casting');void this.root.offsetWidth;this.root.classList.add('casting');this.until=now+1050;
    if(g.preferences.values.reducedMotion)return;
    const origin=g.physics.position,angle=g.physics.facingAngle||0;
    for(let i=0;i<3;i++){
      const effect=this.pool.find(p=>p.age>=p.life);if(!effect)break;
      effect.age=-i*.055;effect.life=key==='special'?.75:.48;
      effect.mesh.position.set(origin.x+Math.sin(angle)*.65,origin.y+1.1,origin.z+Math.cos(angle)*.65);
      effect.mesh.rotation.set(Math.PI/3+i*.6,angle+i*.8,i*.7);effect.mesh.visible=true;effect.mesh.material.opacity=0;
    }
  }
  update(){
    const g=this.game,now=performance.now(),frameGap=(now-this.lastTime)/1000,dt=Math.min(.05,frameGap);this.lastTime=now;
    if(frameGap>.25)for(const effect of this.pool)effect.age=effect.life;
    const active=g.isPlaying&&!g.isPaused&&!g.gameplaySuspended;
    const action=g.combat?.action,p=g.physics;
    if(active){
      if(action&&action.id!==this.lastAction){this.cast(action.key);this.lastAction=action.id;}
      if(g.character.airTrick&&!this.lastTrick)this.cast('trick');
    }
    this.lastState=p.state;this.lastWebs=p.webs.length;this.lastTrick=g.character.airTrick;
    this.root.hidden=!active||now>this.until;
    document.body.classList.toggle('skill-casting',!this.root.hidden);
    for(const e of this.pool){
      if(!active||g.preferences.values.reducedMotion)e.age=e.life;else e.age+=dt;const live=active&&!g.preferences.values.reducedMotion&&e.age>=0&&e.age<e.life;e.mesh.visible=live;
      if(live){const t=e.age/e.life;e.mesh.scale.setScalar(.45+t*2.3);e.mesh.rotation.z+=dt*2;e.mesh.material.opacity=Math.sin(t*Math.PI)*(1-t)*.7;}
    }
  }
}
