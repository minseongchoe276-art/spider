export const BINDINGS = {
  forward:'KeyW', backward:'KeyS', left:'KeyA', right:'KeyD', sprint:'ShiftLeft',
  jump:'Space', wall:'KeyF', zip:'KeyE', trick:'KeyT', mode:'KeyQ', guard:'KeyB',
  heavy:'KeyG', dodge:'ControlLeft', recenter:'KeyC', camera:'KeyV', trial:'KeyR',
};
export const SETTING_LIMITS = {
  sensitivity:[0.3,3,1], fov:[55,95,64], shake:[0,1,0.5], speedFov:[0,1,1],
  follow:[0,1,1], speedLines:[0,1,1], effectsVolume:[0,1,0.8],
  environmentVolume:[0,1,0.55], musicVolume:[0,1,0.35], hudScale:[0.8,1.4,1],
};
// H/M remain available for help and mute, including while a dialog is open.
export const validBinding = value => typeof value==='string' && !['KeyH','KeyM'].includes(value) && /^(Key[A-Z]|Digit[0-9]|Space|ShiftLeft|ControlLeft|AltLeft)$/.test(value);
export function cleanSettings(saved={}) {
  if(!saved || typeof saved!=='object' || Array.isArray(saved))saved={};
  const result={invertY:false,webToggle:false,sprintToggle:false,aimAssist:true,autoQuality:true,
    trajectory:false,ghost:true,bindings:{...BINDINGS}};
  for(const [key,[min,max,fallback]] of Object.entries(SETTING_LIMITS))
    result[key]=Number.isFinite(saved[key])?Math.max(min,Math.min(max,saved[key])):fallback;
  for(const key of ['invertY','webToggle','sprintToggle','aimAssist','autoQuality','trajectory','ghost'])
    if(typeof saved[key]==='boolean')result[key]=saved[key];
  // Keep remaps bijective. Invalid or duplicate input restores the whole map.
  const map=Object.fromEntries(Object.keys(BINDINGS).map(k=>[k,saved.bindings?.[k]??BINDINGS[k]]));
  if(Object.keys(BINDINGS).every(k=>validBinding(map[k])) && new Set(Object.values(map)).size===Object.keys(BINDINGS).length)
    result.bindings=Object.fromEntries(Object.keys(BINDINGS).map(k=>[k,map[k]]));
  return result;
}
export function canonicalKey(code,settings) {
  const bindings=settings?.bindings || BINDINGS;
  const aliases={ArrowUp:'forward',ArrowDown:'backward',ArrowLeft:'left',ArrowRight:'right'};
  code=({ShiftRight:'ShiftLeft',ControlRight:'ControlLeft',AltRight:'AltLeft'})[code] || code;
  const action=aliases[code] || Object.keys(BINDINGS).find(k=>bindings[k]===code);
  if(action)return BINDINGS[action];
  return Object.values(BINDINGS).includes(code)?null:code;
}
export function rebind(settings,action,code) {
  if(!Object.hasOwn(BINDINGS,action)||!validBinding(code))return false;
  const previous=settings.bindings[action],other=Object.keys(BINDINGS).find(k=>settings.bindings[k]===code);
  if(other)settings.bindings[other]=previous;
  settings.bindings[action]=code;return true;
}
export const keyLabel = code => code?.replace(/^Key|^Digit/,'').replace('Left','').replace('Control','Ctrl') || '';
export function deadzone(value,zone=0.18){
  if(!Number.isFinite(value))return 0;
  value=Math.max(-1,Math.min(1,value));
  zone=Number.isFinite(zone)?Math.max(0,Math.min(.99,zone)):.18;
  return Math.abs(value)<=zone?0:Math.sign(value)*(Math.abs(value)-zone)/(1-zone);
}
