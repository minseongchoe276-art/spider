const EMBLEM='<svg viewBox="0 0 64 64" class="pulse-emblem" aria-hidden="true"><circle cx="32" cy="32" r="27" fill="none" stroke="#d9ccff" stroke-width="2.4"/><path d="M8 34h12l6-16 10 30 7-18 5 4h8" fill="none" stroke="#efe7ff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// One stable DOM tree; changing resource values never rebuilds the HUD.
export function updateVitalsHud(node,{health,stamina,mode,warning=false,visible=true,translate=s=>s}) {
  if(!node)return;
  if(!node.querySelector('.vitals-emblem')){
    node.textContent='';node.removeAttribute('role');node.classList.add('vitals-hud');
    const emblem=document.createElement('div');emblem.className='vitals-emblem';emblem.innerHTML=EMBLEM;
    const title=document.createElement('div');title.className='vitals-mode';
    const stack=document.createElement('div');stack.className='vitals-stack';stack.append(title);
    for(const [key,label,mark] of [['health','체력','HP'],['stamina','기력','ENERGY']]){
      const row=document.createElement('label');row.className='vitals-row';
      const name=document.createElement('span');name.textContent=mark;
      const meter=document.createElement('meter');meter.min=0;meter.max=100;meter.className=`vitals-${key}`;meter.setAttribute('aria-label',translate(label));
      const value=document.createElement('output');value.className=`vitals-${key}-value`;
      row.append(name,meter,value);stack.append(row);
    }
    node.append(emblem,stack);
  }
  node.classList.toggle('hidden',!visible);
  node.classList.toggle('is-low-health',health<=25);
  node.classList.toggle('is-low-stamina',stamina<12);
  node.classList.toggle('is-warning',!!warning);
  node.classList.toggle('is-spectating',mode==='spectating'&&!warning);
  node.classList.toggle('is-wire',mode==='web'&&!warning);
  node.classList.toggle('is-combat',mode==='combat'&&!warning);
  const title=node.querySelector('.vitals-mode');
  const text=translate(warning?'공격 예고! · 방어 / 이동':mode==='spectating'?'관전 중':mode==='combat'?'전투 모드':'와이어 모드');
  if(title.textContent!==text)title.textContent=text;
  for(const [key,input] of [['health',health],['stamina',stamina]]){
    const value=Math.max(0,Math.min(100,Math.floor(Number.isFinite(input)?input:0)));
    const meter=node.querySelector(`.vitals-${key}`),output=node.querySelector(`.vitals-${key}-value`);
    const shown=`${value} / 100`;
    if(meter.value!==value)meter.value=value;
    if(output.textContent!==shown)output.textContent=shown;
  }
}

// Each mode exposes E plus its contextual F action.
export function abilitySlotState({mode='web',locked=false,grounded=true,stamina=100,zipCooling=false,strikeGround=grounded,busy=false,blocking=false,zipBlocked=false}={}){
  const wire=mode!=='combat';
  return {
    mode:wire?'web':'combat',
    label:wire?'와이어 기술':'전투 기술',
    slots:{
      mode:{active:!locked,unavailable:locked,dry:false,cooling:false},
      zip:{
        unavailable:wire?(grounded||zipBlocked):(!strikeGround||busy||blocking),
        active:(wire&&!grounded&&!zipCooling&&!zipBlocked)||(!wire&&strikeGround&&!busy&&!blocking&&stamina>=18),
        dry:!wire&&grounded&&stamina<18,
        cooling:wire&&!grounded&&zipCooling,
      },
      wall:{unavailable:!wire,active:wire,dry:false,cooling:false},
      guard:{unavailable:wire||!strikeGround||busy,active:!wire&&strikeGround&&!busy&&stamina>=12,dry:!wire&&stamina<12,cooling:false},
    },
  };
}
