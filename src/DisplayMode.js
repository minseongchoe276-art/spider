export function displayState(doc = document, win = window, nav = navigator) {
  const fullscreen=!!(doc.fullscreenElement || doc.webkitFullscreenElement);
  const standalone=!!nav.standalone || !!win.matchMedia?.('(display-mode: standalone)').matches || !!win.matchMedia?.('(display-mode: fullscreen)').matches;
  return {fullscreen,standalone,expanded:fullscreen||standalone};
}

export class DisplayMode {
  constructor(game) {
    this.game=game;this.pending=false;
    document.querySelectorAll('[data-fullscreen]').forEach(button=>button.addEventListener('click',()=>game.toggleFullscreen()));
    this.onChange=()=>{this.sync();game.resizeViewport();game.touchControls?.release();};
    document.addEventListener('fullscreenchange',this.onChange);
    document.addEventListener('webkitfullscreenchange',this.onChange);
    window.visualViewport?.addEventListener('resize',()=>game.resizeViewport());
    this.observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>game.resizeViewport()):null;
    this.observer?.observe(game.canvas.parentElement);
    document.getElementById('fullscreen-help-close')?.addEventListener('click',()=>this.closeHelp());
    document.getElementById('fullscreen-help')?.addEventListener('cancel',event=>{event.preventDefault();this.closeHelp();});
    this.sync();game.resizeViewport();
  }
  sync(){
    const state=displayState();
    document.body.classList.toggle('native-fullscreen',state.fullscreen);
    for(const button of document.querySelectorAll('[data-fullscreen], [data-ui="fullscreen"]')){
      if(button.hasAttribute?.('data-icon-only')){
        button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>';
        button.title=state.fullscreen?'전체화면 종료':'전체화면';
      }else button.textContent=state.fullscreen?'화면 복귀':state.standalone?'앱 화면':'전체화면';
      button.setAttribute('aria-pressed',String(state.expanded));
      button.setAttribute('aria-label',state.fullscreen?'전체화면 종료':'전체화면으로 플레이');
    }
  }
  showHelp(){
    const dialog=document.getElementById('fullscreen-help');
    if(!dialog){this.game.showNotice('이 브라우저는 전체화면 전환을 지원하지 않습니다. 홈 화면에 추가해 웹앱으로 실행하세요.');return;}
    this.resumeAfterHelp=this.game.isPlaying&&!this.game.isPaused;
    if(this.resumeAfterHelp)this.game.setPaused(true);
    if(!dialog.open)dialog.showModal();
  }
  closeHelp(){
    document.getElementById('fullscreen-help')?.close();
    if(this.resumeAfterHelp&&this.game.isPlaying){this.game.setPaused(false);this.game.canvas.focus?.();}
    this.resumeAfterHelp=false;
  }
  async toggle(){
    if(this.pending)return false;
    const state=displayState(),root=document.documentElement;
    const enter=root.requestFullscreen || root.webkitRequestFullscreen;
    const exit=document.exitFullscreen || document.webkitExitFullscreen;
    if(!state.fullscreen&&!enter){this.showHelp();return false;}
    this.pending=true;this.game.displayTransition=true;this.game.clearInput();
    try{
      if(state.fullscreen){if(!exit)throw Error('Fullscreen exit unavailable');await exit.call(document);}
      else await enter.call(root,{navigationUI:'hide'});
      this.sync();this.game.resizeViewport();return true;
    }catch{this.showHelp();return false;}
    finally{this.pending=false;this.game.displayTransition=false;}
  }
}
