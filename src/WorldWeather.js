import * as T from 'three';
import {language} from './I18n.js';

export const WEATHER_TYPES=['맑음','구름 조금','흐림','비','뇌우','안개'];
const PRESETS=[{cloud:.08,rain:0,fog:1},{cloud:.4,rain:0,fog:.95},{cloud:.85,rain:0,fog:.75},{cloud:.95,rain:.65,fog:.58},{cloud:1,rain:1,fog:.4},{cloud:.65,rain:0,fog:.32}];
const mix=T.MathUtils.lerp;
const hash=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
// Epoch based clock: local play and observers see the same Hong Kong time.
// A real minute advances one game minute; weather changes every half hour.
export function weatherAt(epoch=Date.now()){
  const slot=Math.floor(epoch/1800000),phase=(epoch%1800000)/1800000;
  const choose=n=>Math.min(5,Math.floor(hash(n)*6));
  const index=choose(slot),previous=choose(slot-1),blend=T.MathUtils.smoothstep(phase,0,.15);
  const a=PRESETS[previous],b=PRESETS[index];
  const hour=((epoch/3600000+8)%24+24)%24;
  const elevation=Math.sin((hour-6)/24*Math.PI*2);
  return {epoch,hour,elevation,day:T.MathUtils.smoothstep(elevation,-.12,.3),type:WEATHER_TYPES[index],index,
    cloud:mix(a.cloud,b.cloud,blend),rain:mix(a.rain,b.rain,blend),fog:mix(a.fog,b.fog,blend)};
}
export class WorldWeather{
  constructor({scene,camera,renderer,sun,ambient,sky,city}){
    Object.assign(this,{scene,camera,renderer,sun,ambient,sky,city});
    this.elapsed=0;this.probeAt=0;this.materialAt=0;this.shelters=Array(25).fill(-Infinity);this.wetMaterials=new WeakMap();
    this.hud=document.createElement('div');this.hud.id='world-weather';this.hud.setAttribute('aria-label','홍콩 현지 시간과 날씨');
    Object.assign(this.hud.style,{position:'fixed',top:'72px',right:'16px',color:'#e7f2fa',font:'12px system-ui',textShadow:'0 1px 3px #000',pointerEvents:'none',zIndex:5});document.body.append(this.hud);
    this.skyMaterial=sky.material;
    sky.material=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{time:{value:0},day:{value:1},cloud:{value:0},sunDir:{value:new T.Vector3(0,1,0)}},
      vertexShader:'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec3 direction;uniform float time,day,cloud;uniform vec3 sunDir;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
      void main(){vec3 d=normalize(direction);float horizon=pow(1.-max(d.y,0.),3.);
      vec3 sky=mix(vec3(.008,.015,.04),mix(vec3(.17,.43,.72),vec3(.65,.76,.82),horizon),day);
      float dusk=pow(1.-abs(day-.45),12.);sky+=vec3(.38,.12,.025)*dusk*horizon;
      vec2 p=d.xz/max(.12,d.y+.28)*2.+vec2(time*.003,0.);
      float n=noise(p)*.55+noise(p*2.1)*.27+noise(p*4.3)*.13+noise(p*8.6)*.05;
      float clouds=smoothstep(1.-cloud*.8,1.-cloud*.8+.15,n)*smoothstep(-.03,.18,d.y);
      sky=mix(sky,mix(vec3(.035,.045,.07),vec3(.69,.72,.75),day),clouds*.92);
      float disc=smoothstep(.99965,.9999,dot(d,sunDir));sky+=vec3(1.,.8,.5)*disc*day*(1.-clouds);
      float moon=smoothstep(.9995,.9998,dot(d,-sunDir));sky+=vec3(.45,.53,.66)*moon*(1.-day)*(1.-clouds);
      float star=step(.9985,h(floor(d.xz/max(.1,d.y)*650.)))*smoothstep(.05,.3,d.y);sky+=star*(1.-day)*(1.-clouds)*.5;
      gl_FragColor=vec4(sky,1.);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(';#include',';\n#include')});
    const count=1300,positions=new Float32Array(count*6);this.drops=Array.from({length:count},(_,i)=>({x:(hash(i+1)-.5)*50,z:(hash(i+7000)-.5)*50,y:hash(i+3000)*32}));
    this.rainGeometry=new T.BufferGeometry();this.rainGeometry.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));
    this.rainMaterial=new T.LineBasicMaterial({color:0xbdd7e4,transparent:true,opacity:.4,depthWrite:false});
    this.rainMesh=new T.LineSegments(this.rainGeometry,this.rainMaterial);this.rainMesh.frustumCulled=false;scene.add(this.rainMesh);
    this.flash=new T.DirectionalLight(0xdbeaff,0);scene.add(this.flash);
  }
  update(delta,position,epoch=this.overrideEpoch??Date.now(),{reducedMotion=false}={}){
    const w=this.state=weatherAt(epoch);this.elapsed+=Math.min(delta,.1);
    const direction=new T.Vector3(Math.cos((w.hour-6)/12*Math.PI)*.7,w.elevation,Math.sin((w.hour-6)/12*Math.PI)*.4).normalize();
    this.sun.position.copy(position).addScaledVector(w.elevation>0?direction:direction.clone().negate(),300);this.sun.target.position.copy(position);this.sun.target.updateMatrixWorld();
    this.sun.intensity=mix(.16,2.6,w.day)*(1-w.cloud*.65);this.sun.color.set(w.day>.6?0xfff5df:0xa9bfff);
    this.ambient.intensity=mix(.3,1.55,w.day)*(1-w.cloud*.28);this.ambient.color.setHex(w.day>.5?0xd8f1ff:0x7185b0);
    this.scene.environmentIntensity=mix(.12,.7,w.day)*(1-w.rain*.35);
    const skyColor=new T.Color(0x121d36).lerp(new T.Color(0xaed0df),w.day).lerp(new T.Color(0x798994),w.cloud*.4);
    this.scene.background.copy(skyColor);if(this.scene.fog){this.scene.fog.color.copy(skyColor);const distance=this.city.activeStreamDistance??this.city.renderingProfile.streamDistance;this.scene.fog.near=distance*.55*w.fog;this.scene.fog.far=distance*.85*w.fog;}
    const u=this.sky.material.uniforms;u.day.value=w.day;u.cloud.value=w.cloud;u.time.value=this.elapsed;u.sunDir.value.copy(direction);
    this.sky.position.copy(this.camera.position);
    const locale=language();
    if(this.hudLanguage!==locale){this.hudLanguage=locale;this.hud.setAttribute('aria-label',locale==='en'?'Hong Kong local time and weather':'홍콩 현지 시간과 날씨');}
    this.hud.hidden=!position;const minute=Math.floor(w.hour*60);const clockText=`${locale==='en'?'Hong Kong':'홍콩'} ${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')} · ${locale==='en'?['Clear','Partly cloudy','Overcast','Rain','Thunderstorm','Fog'][w.index]:w.type}`;
    if(this.hud.textContent!==clockText)this.hud.textContent=clockText;
    this.rainMesh.visible=w.rain>.01;this.rainMaterial.opacity=.25+w.rain*.3;
    if(w.rain>.01){
      const cx=Math.floor(position.x/10)*10,cz=Math.floor(position.z/10)*10;
      if(this.elapsed>=this.probeAt||cx!==this.probeX||cz!==this.probeZ){
        this.probeAt=this.elapsed+.3;this.probeX=cx;this.probeZ=cz;
        for(let i=0;i<25;i++){
          const origin=new T.Vector3(cx+(i%5-2)*10,position.y+34,cz+(Math.floor(i/5)-2)*10);
          const hit=this.city.raycast?.(origin,new T.Vector3(0,-1,0),70);this.shelters[i]=hit?origin.y-hit.distance:position.y-35;
        }
      }
      const a=this.rainGeometry.attributes.position;a.count=this.drops.length*2;this.rainGeometry.setDrawRange(0,Math.floor(this.drops.length*w.rain)*2);
      this.drops.forEach((drop,i)=>{
        drop.y=(drop.y-delta*(18+hash(i)*8)+32)%32;
        const x=position.x+drop.x,z=position.z+drop.z,y=position.y+drop.y;
        const ix=T.MathUtils.clamp(Math.round((x-cx)/10)+2,0,4),iz=T.MathUtils.clamp(Math.round((z-cz)/10)+2,0,4),floor=this.shelters[iz*5+ix]+.1;
        // Collapse streaks below roofs; preserve depth testing against walls.
        const top=Math.max(floor,y),bottom=Math.max(floor,y-.7);
        a.setXYZ(i*2,x,top,z);a.setXYZ(i*2+1,x-.16,bottom,z-.07);
      });a.needsUpdate=true;
    }
    this.flash.intensity=!reducedMotion&&w.index===4&&hash(Math.floor(epoch/4500))>.84&&epoch%4500<110?3.5:0;
    if(this.elapsed>=this.materialAt){this.materialAt=this.elapsed+1;
      this.city.root.traverse(mesh=>{if(!mesh.isMesh)return;for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
        if(m?.isMeshBasicMaterial){let base=this.wetMaterials.get(m);if(!base){base={color:m.color.clone()};this.wetMaterials.set(m,base);}m.color.copy(base.color).multiplyScalar(mix(.2,1,w.day)*(1-w.rain*.15));continue;}
        if(!m?.isMeshStandardMaterial)continue;let base=this.wetMaterials.get(m);if(!base){base={roughness:m.roughness,metalness:m.metalness};this.wetMaterials.set(m,base);}
        m.roughness=mix(base.roughness,Math.min(base.roughness,.24),w.rain);m.metalness=mix(base.metalness,Math.max(base.metalness,.08),w.rain);
      }});
    }
  }
  dispose(){this.hud.remove();this.scene.remove(this.rainMesh,this.flash);this.rainGeometry.dispose();this.rainMaterial.dispose();this.sky.material.dispose();this.sky.material=this.skyMaterial;}
}
