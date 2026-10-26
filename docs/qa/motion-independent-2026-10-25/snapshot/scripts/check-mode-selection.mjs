import assert from 'node:assert/strict';
import {Multiplayer} from '../src/Multiplayer.js';
class Element extends EventTarget{
 constructor(mode){super();this.dataset={mode};this.classes=new Set();this.attributes={};this.value='tag';this.classList={toggle:(key,on)=>on?this.classes.add(key):this.classes.delete(key)};}
 setAttribute(key,value){this.attributes[key]=value;}
}
const old=globalThis.document,elements=new Map(),buttons=['tag','custom','free'].map(mode=>new Element(mode));
globalThis.document={getElementById:id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},querySelectorAll:()=>buttons};
try{
 const p=Object.create(Multiplayer.prototype);p.bind();const select=elements.get('room-mode');
 for(const mode of ['custom','free','tag','custom']){select.value=mode;select.dispatchEvent(new Event('change'));assert.equal(elements.get('custom-options').classes.has('hidden'),mode!=='custom');for(const b of buttons)assert.equal(b.attributes['aria-selected'],String(b.dataset.mode===mode));}
 buttons[2].dispatchEvent(new Event('click'));assert.equal(select.value,'free');assert(elements.get('custom-options').classes.has('hidden'));
 console.log('PASS accessible select and visible mode cards share the same selected state and custom format options');
}finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
