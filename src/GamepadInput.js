import {deadzone} from './PlayerSettings.js';
export class GamepadInput {
  constructor(game){this.game=game;this.buttons=new Set();this.lastPad=null;this.axes={};}
  key(code,down,source=code){
    this.keySources??=new Map();
    if(down){
      if(this.keySources.has(source))return;
      const held=[...this.keySources.values()].includes(code);this.keySources.set(source,code);
      if(held)return;
    }else{
      const original=this.keySources.get(source);if(!original)return;
      this.keySources.delete(source);code=original;
      if([...this.keySources.values()].includes(code))return;
    }
    const event=new KeyboardEvent(down?'keydown':'keyup',{code,bubbles:true});
    Object.defineProperty(event,'gamepadInput',{value:true});window.dispatchEvent(event);
  }
  mouse(button,down){const canvas=this.game.canvas,rect=canvas.getBoundingClientRect();
    const event=new MouseEvent(down?'mousedown':'mouseup',{button,clientX:rect.x+rect.width/2,clientY:rect.y+rect.height/2,bubbles:true});
    Object.defineProperty(event,'gamepadInput',{value:true});
    (down?canvas:window).dispatchEvent(event);}
  release(){for(const b of this.buttons)this.action(b,false);this.buttons.clear();this.axes={};this.game.gamepadDirections={};this.game.syncHeldInput();}
  action(button,down){const g=this.game,bindings=g.preferences.values.settings.bindings;
    if([6,7].includes(button))this.mouse(button===7?0:2,down);
    else {const map={0:'jump',1:'wall',2:g.combat?.mode==='combat'?'heavy':'zip',3:'mode',4:'wall',10:'sprint',11:'recenter',12:'wall',14:'camera'};
      const code=button===9?'Escape':bindings[map[button]];if(code || this.keySources?.has(button))this.key(code,down,button);}}
  update(delta) {
    const pad=Array.from(navigator.getGamepads?.()||[]).find(p=>p?.mapping==='standard');
    if(!pad){if(this.lastPad!==null){this.release();this.game.showNotice('게임패드 연결이 끊겼습니다.');}this.lastPad=null;return;}
    if(this.lastPad!==pad.index){if(this.lastPad!==null)this.release();this.lastPad=pad.index;this.game.showNotice('게임패드 연결됨');}
    const modalOpen=()=>this.game.worldMap?.isOpen || !!document.querySelector('dialog[open]');
    const isActive=()=>this.game.isPlaying&&!this.game.isPaused&&!this.game.contextLost&&!this.game.gameplaySuspended&&!this.game.helpOpen&&!document.hidden&&!modalOpen()&&!this.game.multiplayer?.spectating&&!document.querySelector('#controls-guide:not(.hidden)');
    const wasActive=isActive();
    const next=new Set(pad.buttons.map((b,i)=>b.pressed?i:-1).filter(i=>i>=0));
    for(const b of next)if(!this.buttons.has(b)&&((wasActive&&isActive())||(b===9&&!modalOpen())))this.action(b,true);
    for(const b of this.buttons)if(!next.has(b))this.action(b,false);
    this.buttons=next;
    // Start can pause inside action(). Do not restore cleared movement or
    // rotate the camera using the state captured before the button events.
    if(!wasActive||!isActive()){this.game.gamepadDirections={};this.game.syncHeldInput();return;}
    const x=deadzone(pad.axes[0]||0),y=deadzone(pad.axes[1]||0);
    this.game.gamepadDirections={forward:y<-.05,backward:y>.05,left:x<-.05,right:x>.05};this.game.syncHeldInput();
    const rx=deadzone(pad.axes[2]||0),ry=deadzone(pad.axes[3]||0);
    if((rx||ry)&&Number.isFinite(delta)&&delta>0)this.game.tpsCamera.handleMouseMove(rx*Math.min(delta,.05)*1400,ry*Math.min(delta,.05)*1400);
  }
}
