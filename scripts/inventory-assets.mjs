import fs from 'node:fs';
import path from 'node:path';
import {MOTIONS} from '../src/MotionCatalog.js';
import {filesUnder,root,sha256} from './lib/release-identity.mjs';
import {pathToFileURL} from 'node:url';

const motions=new Map(MOTIONS.map(m=>[m.key,m.url]));
export function assetProvenance(name,data,rules){
 const rule=rules.find(r=>r.paths.includes(name));
 const exact=rule?.sha256?.[name]===sha256(data);
 const licenseFile=rule?.licenseEvidence&&path.join(root,rule.licenseEvidence);
 const licensed=!!licenseFile&&fs.existsSync(licenseFile)&&rule?.licenseSha256===sha256(fs.readFileSync(licenseFile));
 return {source:rule?.source??null,sourceUrl:rule?.sourceUrl??null,licenseEvidence:rule?.licenseEvidence??null,
  status:rule?.status==='documented'&&exact&&licensed?'documented':'needs-review',
  byteMatch:exact,licensePresent:licensed};
}
export function inventoryAssets(){
const rules=JSON.parse(fs.readFileSync(path.join(root,'config/asset-provenance.json')));
const assets=filesUnder(path.join(root,'public')).map(file=>{
 const name=path.relative(root,file).split(path.sep).join('/'),data=fs.readFileSync(file),rule=rules.find(r=>r.paths.includes(name))||null;
 const motion=name.match(/^public\/motions\/([^/]+)\.json$/)?.[1];
 return {path:name,bytes:data.length,sha256:sha256(data),sourceFile:motion&&motions.has(motion)?'public'+motions.get(motion):rule?.sourceFile??null,
  provenance:assetProvenance(name,data,rules)};
});
return {version:2,scope:'Evidence inventory only; documented files require matching bytes and an existing license file; not a legal clearance',assets,unresolved:assets.filter(a=>a.provenance.status!=='documented').map(a=>a.path),external:[
 {name:'Hong Kong terrain',source:'https://data.map.gov.hk/',status:'needs-review'},
 {name:'OpenStreetMap basemap',source:'https://www.openstreetmap.org/copyright',attribution:'WorldMap UI',status:'needs-review'},
 {name:'System fonts',source:'Operating system font stack; no font files bundled',status:'documented'}]};
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 const result=inventoryAssets(),output=process.argv[2]||'docs/asset-inventory.json';fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
 if(output==='docs/asset-inventory.json')fs.writeFileSync('docs/ASSET_REGISTER.md',[
 '# 공개 자산 출처 목록','',
 'documented는 원본 대조 해시와 라이선스 파일을 확인한 항목입니다. 상업 배포 전체의 권리 승인으로 확대하지 않습니다. needs-review는 미확인 상태이며 위반 판정이 아닙니다. 원본이 변경되면 해시 대조가 실패해 다시 미확인으로 분류됩니다.','',
 '| 파일 | 원본·출처 | 라이선스 증거 | 상태 |','|---|---|---|---|',
 ...result.assets.map(a=>`| [${a.path}](<../${a.path}>) | ${a.provenance.sourceUrl?`[원본](${a.provenance.sourceUrl})`:a.sourceFile||'미확인'} | ${a.provenance.licenseEvidence?`[문서](<../${a.provenance.licenseEvidence}>)`:'미확인'} | ${a.provenance.status} |`),
 '', '외부 홍콩 지형과 OpenStreetMap은 JSON의 external 항목으로 별도 관리합니다.',''].join('\n'));
 console.log(`Asset inventory: ${result.assets.length} files; ${result.unresolved.length} unresolved.`);
}
