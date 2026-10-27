// Reserve actual rendered space, including the player's HUD scale and wrapping.
// Only resize/content-size changes trigger layout; this never runs per frame.
export class HudLayout {
  constructor(root) {
    this.root=root;this.pending=false;
    this.actions=document.createElement('div');this.actions.id='hud-actions';
    for(const id of ['hand-status','gameplay-quickbar']){
      const node=document.getElementById(id);if(node)this.actions.append(node);
    }
    root.append(this.actions);
    this.observer=globalThis.ResizeObserver?new ResizeObserver(()=>this.schedule()):null;
    const contextPanels=['combat-status','pursuit-hud','connection-warning','game-notice','boundary-warning'];
    for(const id of ['hud-actions','hud-top-left','web-status-pill','match-hud','minimap-panel','solo-objective',...contextPanels]){
      const node=document.getElementById(id);if(node)this.observer?.observe(node);
    }
    this.visibility=new MutationObserver(()=>this.schedule());
    this.visibility.observe(document.body,{attributes:true,attributeFilter:['class']});
    for(const id of contextPanels){const node=document.getElementById(id);if(node)this.visibility.observe(node,{attributes:true,attributeFilter:['class','hidden']});}
    const touch=document.getElementById('touch-controls');
    if(touch)this.visibility.observe(touch,{attributes:true,attributeFilter:['data-combat','data-simple']});
    this.schedule();
  }
  schedule(){
    if(this.pending)return;this.pending=true;
    requestAnimationFrame(()=>{this.pending=false;this.update();});
  }
  update(){
    if(!document.body.classList.contains('in-game'))return;
    if(document.body.classList.contains('touch-device')){
      this.touchLayout=true;
      // Scaling must grow away from the toolbar and preserve the gap between
      // the two instruments on narrow phones, including 140% HUD settings.
      const width=this.root.getBoundingClientRect().width,height=this.root.getBoundingClientRect().height;
      const rootBounds=this.root.getBoundingClientRect();
      const shown=node=>{if(!node)return false;const s=getComputedStyle(node),r=node.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&(Number(s.opacity)>0||(node.id==='game-notice'&&node.classList.contains('visible')))&&r.width>0&&r.height>0;};
      const header=document.getElementById('match-hud')?.getBoundingClientRect();
      for(const [id,preferred,origin] of [['hud-top-left',128,'top left'],['minimap-panel',width>height&&height<500?(height<360?68:88):112,'top right']]){
        const node=document.getElementById(id);if(!node)continue;
        const scale=parseFloat(getComputedStyle(node).scale)||1;
        const size=`${Math.min(preferred,Math.floor((width-36)/(2*scale)))}px`;
        if(node.style.width!==size)node.style.width=size;
        node.style.transformOrigin=origin;
        if(id==='hud-top-left')node.style.top=`${Math.max(74,(header?.bottom??rootBounds.top)-rootBounds.top+12)}px`;
      }
      const alt=document.getElementById('alt-readout'),mapNode=document.getElementById('minimap-panel');
      if(alt&&shown(mapNode)&&document.body.classList.contains('hud-swing')){
        const mapBox=mapNode.getBoundingClientRect();
        const altBox=alt.getBoundingClientRect();
        const altWidth=Math.max(72,altBox.width),altHeight=Math.max(32,altBox.height);
        let cssTop=Math.round(mapBox.top-rootBounds.top);
        let cssRight=Math.round(rootBounds.right-mapBox.left+10);
        const proposed={left:rootBounds.right-cssRight-altWidth,right:rootBounds.right-cssRight,top:rootBounds.top+cssTop,bottom:rootBounds.top+cssTop+altHeight};
        const hits=node=>{
          if(!shown(node))return false;
          const box=node.getBoundingClientRect();
          return proposed.left<box.right+8&&proposed.right>box.left-8&&proposed.top<box.bottom+8&&proposed.bottom>box.top-8;
        };
        if(hits(document.getElementById('hud-top-left'))||hits(document.getElementById('match-hud'))){
          cssTop=Math.round(mapBox.bottom-rootBounds.top+8);
          cssRight=Math.round(rootBounds.right-mapBox.right);
        }
        alt.style.top=`${cssTop}px`;
        alt.style.right=`${cssRight}px`;
        alt.style.transformOrigin='top right';
      }else if(alt){alt.style.top='';alt.style.right='';}
      const toolbar=this.root.querySelector('.touch-toolbar'),map=document.getElementById('minimap-panel');
      if(toolbar&&map){
        const inset=width-(map.getBoundingClientRect().left-this.root.getBoundingClientRect().left)+12;
        const right=width>height&&height<500?`${Math.ceil(Math.max(116,inset))}px`:'';
        if(toolbar.style.right!==right)toolbar.style.right=right;
      }
      const objective=document.getElementById('solo-objective');
      if(objective){
        objective.style.width='';objective.style.top='';
        if(!objective.hidden&&map&&getComputedStyle(objective).display!=='none'){
          const a=objective.getBoundingClientRect(),b=map.getBoundingClientRect(),root=this.root.getBoundingClientRect();
          if(a.right>b.left&&a.left<b.right&&a.top<b.bottom&&a.bottom>b.top){
            const available=Math.floor(b.left-a.left-12);
            if(available>=120){
              // A visible objective hides telemetry, leaving this upper-left
              // slot free. Keep instructions beside the scaled map.
              objective.style.width=`${Math.min(245,available)}px`;
              const header=document.getElementById('match-hud')?.getBoundingClientRect();
              objective.style.top=`${Math.max(74,(header?.bottom??root.top)-root.top+12)}px`;
            }else objective.style.top=`${Math.ceil(b.bottom-root.top+12)}px`;
          }
        }
      }
      // Keep the designer's resource widgets and their values, but allocate
      // real space for every visible panel instead of independent fixed tops.
      const move=(id,x,y,available)=>{
        const node=document.getElementById(id);if(!shown(node))return y;
        const values={position:'absolute',left:`${x}px`,right:'auto',top:`${Math.ceil(y)}px`,bottom:'auto',width:`${Math.floor(available)}px`,maxWidth:'none',transform:'none'};
        for(const [key,value]of Object.entries(values))if(node.style[key]!==value)node.style[key]=value;
        return node.getBoundingClientRect().bottom-rootBounds.top+8;
      };
      if(width>height&&height<500){
        const stick=this.root.querySelector('.touch-stick')?.getBoundingClientRect();
        const buttons=[...this.root.querySelectorAll('.touch-actions button')].filter(shown).map(node=>node.getBoundingClientRect());
        const left=(stick?.right??rootBounds.left+144)-rootBounds.left+12;
        const right=buttons.length?Math.min(...buttons.map(r=>r.left))-rootBounds.left-12:width-184;
        const available=Math.max(120,Math.min(430,right-left)),x=left+Math.max(0,right-left-available)/2;
        let y=Math.max(header?.bottom??rootBounds.top,toolbar?.getBoundingClientRect().bottom??rootBounds.top)-rootBounds.top+12;
        for(const id of ['combat-status','pursuit-hud','connection-warning','boundary-warning','game-notice'])y=move(id,x,y,available);
      }else if(map){
        const mapBounds=map.getBoundingClientRect(),leftWidth=Math.max(96,Math.min(160,mapBounds.left-rootBounds.left-24));
        const instruments=['hud-top-left','solo-objective'].map(id=>document.getElementById(id)).filter(shown);
        let y=Math.max((header?.bottom??rootBounds.top)-rootBounds.top+12,...instruments.map(node=>node.getBoundingClientRect().bottom-rootBounds.top+8));
        for(const id of ['combat-status','pursuit-hud','boundary-warning'])y=move(id,12,y,leftWidth);
        y=mapBounds.bottom-rootBounds.top+8;
        for(const id of ['connection-warning','game-notice'])y=move(id,mapBounds.left-rootBounds.left,y,mapBounds.width);
      }
      return;
    }
    if(this.touchLayout){
      for(const id of ['hud-top-left','minimap-panel','solo-objective','combat-status']){
        const node=document.getElementById(id);if(!node)continue;
        node.style.width='';node.style.top='';node.style.transformOrigin='';
      }
      const alt=document.getElementById('alt-readout');
      if(alt){alt.style.top='';alt.style.right='';}
      for(const id of ['combat-status','pursuit-hud','connection-warning','game-notice','boundary-warning']){
        const node=document.getElementById(id);if(!node)continue;
        for(const key of ['position','left','right','top','bottom','width','maxWidth','transform'])node.style[key]='';
      }
      this.touchLayout=false;
    }
    const bounds=this.root.getBoundingClientRect(),height=bounds.height,width=bounds.width,gap=12,edge=12;
    const visible=id=>{
      const node=document.getElementById(id);if(!node)return null;
      const css=getComputedStyle(node);return css.display==='none'||css.visibility==='hidden'?null:node.getBoundingClientRect();
    };
    const telemetry=visible('hud-top-left');
    const set=(node,key,value)=>{if(node.style[key]!==value)node.style[key]=value;};
    const statusNode=document.getElementById('web-status-pill');
    if(statusNode&&telemetry)set(statusNode,'bottom',`${Math.ceil(height-(telemetry.top-bounds.top)+gap)}px`);
    const status=visible('web-status-pill');
    const vitals=document.getElementById('combat-status');
    if(vitals)set(vitals,'bottom',`${Math.ceil(height-Math.min(telemetry?.top??bounds.bottom,status?.top??bounds.bottom)+gap)}px`);
    const vitalBounds=visible('combat-status');
    const instrumentTop=Math.min(telemetry?.top??bounds.bottom,status?.top??bounds.bottom,vitalBounds?.top??bounds.bottom)-bounds.top;
    const narrow=width<=650;
    const left=narrow?edge:Math.max(edge,(telemetry?.right??bounds.left)-bounds.left+gap);
    const bottom=narrow?height-instrumentTop+gap:20;
    set(this.actions,'left',`${left}px`);set(this.actions,'right',`${edge}px`);set(this.actions,'bottom',`${bottom}px`);
    const actionTop=this.actions.getBoundingClientRect().top-bounds.top;
    const map=document.getElementById('minimap-panel');if(!map)return;
    const dockBottom=Math.ceil(height-(narrow?Math.min(instrumentTop,actionTop):actionTop)+gap);
    const header=visible('match-hud'),top=(header?.bottom??bounds.top+70)-bounds.top+gap;
    const rect=map.getBoundingClientRect(),scale=rect.width/Math.max(1,map.offsetWidth);
    const overhead=Math.max(0,(rect.height-rect.width)/Math.max(.1,scale));
    const available=(height-dockBottom-top)/Math.max(.1,scale)-overhead;
    const preferred=narrow?Math.min(160,Math.max(128,width*.30)):260;
    set(map,'width',`${Math.max(64,Math.min(preferred,Math.floor(available)))}px`);
    set(map,'bottom',`${dockBottom}px`);
  }
}
