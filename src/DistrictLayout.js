// Authored local districts. The online Neon Core layout stays in LocalCityLayout.
// Rectangles are shared by the street renderer and atlas, in world metres.
export function districtLayout(id) {
  const buildings=[],roads=[],zones=[];
  const building=(x,z,size,height,type=0,depth=size)=>buildings.push({x,z,size,depth,height,type});
  const road=(x,z,width,depth)=>roads.push({x,z,width,depth});
  const zone=(kind,x,z,width,depth,color)=>zones.push({kind,x,z,width,depth,color});
  if(id==='harbor') {
    // Three warehouse rows open onto a long waterfront freight apron.
    for(const z of [-100,-30,40,110]) {
      building(-112,z,30,24+(z+100)/14,3,42);
      building(-50,z,36,30+(z+100)/18,3,42);
    }
    building(18,-105,24,76,2);building(18,100,28,66,0);
    for(const z of [-65,5,75])road(-45,z,224,18);
    road(60,0,22,300);road(-80,0,16,300);
    zone('quay',112,0,82,316,'#b5a68d');
    // Water starts beyond the playable ground, so players cannot walk on it.
    zone('water',330,0,320,650,'#397e99');
  } else if(id==='gardens') {
    // A clear central park, surrounded by a stepping ring of roof gardens.
    for(const z of [-102,102])for(const x of [-100,-34,34,100])building(x,z,28,48+(100-Math.abs(x))*.45+(z>0?8:0),0);
    for(const x of [-106,106])for(const z of [-34,34])building(x,z,26,58+(z>0?12:0),1);
    zone('park',0,0,154,142,'#739b65');
    road(0,0,12,154);road(0,0,154,12);
    for(const v of [-77,77]){road(v,0,14,300);road(0,v,300,14);}
  } else if(id==='old-town') {
    // Staggered terraces with narrow lanes and a small market square.
    for(let row=0;row<5;row++)for(let col=0;col<5;col++) {
      if(row===2&&col===2)continue;
      const x=-116+col*56+(row%2?9:0),z=-112+row*55;
      building(x,z,24+(col%2)*6,28+((row*3+col)%5)*7+(col===0&&row===0?40:0),3,34);
    }
    for(let row=0;row<4;row++)road(0,-84.5+row*55,306,12);
    for(let col=0;col<4;col++)road(-88+col*56,0,14,300);
    zone('market',0,-2,40,42,'#c6ab83');
  } else if(id==='skyline') {
    // A central crown and eight satellite towers create a radial skyline.
    building(0,0,38,205,1);
    for(let i=0;i<8;i++) {
      const angle=i*Math.PI/4;
      building(Math.round(Math.cos(angle)*104),Math.round(Math.sin(angle)*104),26,i%2?142:174,i%3);
    }
    for(const x of [-130,130])for(const z of [-130,130])building(x,z,24,80,2);
    zone('plaza',0,0,134,134,'#a3a6bc');
    for(const v of [-48,48]){road(v,0,12,310);road(0,v,310,12);}
    for(const v of [-105,105]){road(v,0,90,12);road(0,v,12,90);}
  }
  return {buildings,roads,zones};
}
