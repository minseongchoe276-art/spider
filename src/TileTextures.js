import * as THREE from 'three';
export function isKTX2(buffer) {
  const magic=[171,75,84,88,32,50,48,187,13,10,26,10];
  return buffer.byteLength>=12 && magic.every((byte,i)=>new Uint8Array(buffer)[i]===byte);
}
export function decodeRGBKTX2(buffer) {
  if(!isKTX2(buffer) || buffer.byteLength<104)return null;
  const view=new DataView(buffer),format=view.getUint32(12,true);
  if(![23,29].includes(format) || view.getUint32(16,true)!==1 || view.getUint32(28,true)!==0 || view.getUint32(32,true)!==0 || view.getUint32(36,true)!==1 || view.getUint32(44,true)!==0)return null;
  const width=view.getUint32(20,true),height=view.getUint32(24,true),levels=view.getUint32(40,true);
  if(!width || !height || width>4096 || height>4096 || !levels || levels>16 || 80+levels*24>buffer.byteLength)return null;
  const mipmaps=[];
  for(let level=0;level<levels;level++) {
    const offset=Number(view.getBigUint64(80+level*24,true)),length=Number(view.getBigUint64(88+level*24,true));
    const w=Math.max(1,width>>level),h=Math.max(1,height>>level),size=w*h;
    if(!Number.isSafeInteger(offset) || length!==size*3 || offset<80+levels*24 || offset+length>buffer.byteLength)return null;
    const source=new Uint8Array(buffer,offset,length),data=new Uint8Array(size*4);
    for(let i=0;i<size;i++){data.set(source.subarray(i*3,i*3+3),i*4);data[i*4+3]=255;}
    mipmaps.push({data,width:w,height:h});
  }
  const texture=new THREE.DataTexture(mipmaps[0].data,width,height,THREE.RGBAFormat,THREE.UnsignedByteType);
  if(levels>1)texture.mipmaps=mipmaps;texture.generateMipmaps=false;texture.flipY=false;texture.colorSpace=format===29?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.needsUpdate=true;
  return texture;
}
export function createTileTexturePlugin(parser,ktxLoader,city) {
  return {name:'HongKongEmbeddedTextures',beforeRoot(){
    const original=parser.loadTextureImage.bind(parser);
    // Wrap the common image path so standard extension plugins are covered too.
    parser.loadTextureImage=async(textureIndex,sourceIndex,loader)=>{
      const image=parser.json.images[sourceIndex];
      const buffer=image?.bufferView===undefined?null:await parser.getDependency('bufferView',image.bufferView);
      const rgb=buffer?decodeRGBKTX2(buffer):null;
      const selected=rgb?{load(uri,onLoad){onLoad(rgb);}}:buffer&&isKTX2(buffer)?ktxLoader:loader;
      const result=await original(textureIndex,sourceIndex,selected);
      if(rgb)city.decodedRGBTextures=(city.decodedRGBTextures || 0)+1;
      if(!result) {
        city.textureDiagnostics.push({failed:true,path:parser.options.path,mime:image?.mimeType,head:buffer?Array.from(new Uint8Array(buffer,0,Math.min(12,buffer.byteLength))):null,bytes:buffer?.byteLength});city.textureDiagnostics=city.textureDiagnostics.slice(-12);
        if(buffer && typeof location!=='undefined' && new URLSearchParams(location.search).has('hongKongAudit') && !document.getElementById('failed-tile-texture')) {
          const details=document.createElement('details');details.style.cssText='position:fixed;bottom:70px;right:12px;z-index:30;background:#fff;color:#111';
          const summary=document.createElement('summary');summary.textContent='실패한 지도 텍스처 원본';details.append(summary);
          const evidence=document.createElement('textarea');evidence.id='failed-tile-texture';let raw='';for(const byte of new Uint8Array(buffer))raw+=String.fromCharCode(byte);evidence.value=btoa(raw);details.append(evidence);document.body.append(details);
        }
      }
      return result;
    };
  }};
}
