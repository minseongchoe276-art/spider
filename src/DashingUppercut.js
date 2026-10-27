// One timeline drives movement, animation contact, and server damage.
export const UPPERCUT=Object.freeze({duration:1.35,from:.43,to:.55,damage:48,reach:2,stamina:35,cooldown:8,impactPhase:.36,dashStart:.05,dashEnd:.44,distance:2.1});
const clamp=x=>Math.max(0,Math.min(1,x));
export function uppercutDistance(time){const u=clamp((time-UPPERCUT.dashStart)/(UPPERCUT.dashEnd-UPPERCUT.dashStart));return UPPERCUT.distance*(.5-.5*Math.cos(Math.PI*u));}
// Average per-frame speed integrates identically at different frame rates.
export function uppercutSpeed(previous,time){return time>previous?(uppercutDistance(time)-uppercutDistance(previous))/(time-previous):0;}
