export function assetEncoding(header,available=['br','gzip','identity']){
  const qualities=new Map();
  for(const item of String(header||'').toLowerCase().split(',')){
    const [name,...parameters]=item.trim().split(';');if(!name)continue;
    const value=parameters.find(p=>p.trim().startsWith('q='));
    const q=value===undefined?1:Number(value.trim().slice(2));
    qualities.set(name,Number.isFinite(q)&&q>=0&&q<=1?q:0);
  }
  const quality=name=>qualities.has(name)?qualities.get(name):name==='identity'?(qualities.get('*')===0?0:1):(qualities.get('*')||0);
  return available.map((name,i)=>({name,q:quality(name),i})).filter(v=>v.q>0).sort((a,b)=>b.q-a.q||a.i-b.i)[0]?.name||null;
}
