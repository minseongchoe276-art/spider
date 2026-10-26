import assert from 'node:assert/strict';
import fs from 'node:fs';
import {softwareNotices} from './software-notices.mjs';
import {assetProvenance,inventoryAssets} from './inventory-assets.mjs';
import {assessDeviceReport} from './assess-device-report.mjs';

const rules=JSON.parse(fs.readFileSync('config/asset-provenance.json'));
for(const rule of rules.filter(r=>r.status==='documented'))for(const name of rule.paths){
 const bytes=fs.readFileSync(name);
 assert.equal(assetProvenance(name,bytes,rules).status,'documented');
 assert.equal(assetProvenance(name,Buffer.concat([bytes,Buffer.from('changed')]),rules).status,'needs-review');
 assert.equal(assetProvenance(name,bytes,[{...rule,licenseEvidence:'missing-license-document'}]).status,'needs-review');
 assert.equal(assetProvenance(name,bytes,[{...rule,licenseSha256:'wrong-license-hash'}]).status,'needs-review');
}
const inventory=inventoryAssets();assert(inventory.unresolved.includes('public/models/appearance-web.glb'));
assert(inventory.unresolved.includes('public/models/Running.fbx'));
console.log('PASS source evidence: changed bytes/missing licenses invalidate documented assets; unknown supplied models remain unresolved');
const notices=softwareNotices();assert(notices.packages>=20);
for(const needle of ['Three.js','Copyright 2021 Protomaps LLC','Binomial LLC','Kenney','Apache License','Permission is hereby granted'])assert(notices.text.includes(needle),needle);
console.log('PASS distribution notices include full installed software licenses, missing-from-npm PMTiles text, Basis and Kenney notices');

const good={sourceId:'current',measuredActiveSeconds:1800,summary:{frames:108000,p95Ms:17,worstMs:50}};
const assess=r=>assessDeviceReport(r,{sourceId:'current'}).status;
assert.equal(assess(good),'PASS');
for(const seconds of [Infinity,NaN,-1,'1800',0])assert.equal(assess({...good,measuredActiveSeconds:seconds}),'FAIL');
for(const frames of [1,Infinity,NaN,-1,'108000',.5])assert.equal(assess({...good,summary:{...good.summary,frames}}),'FAIL');
for(const worstMs of [null,Infinity,NaN,0,16,2000])assert.equal(assess({...good,summary:{...good.summary,worstMs}}),'FAIL');
assert.equal(assess({...good,sourceId:'old'}),'FAIL');assert.equal(assess(null),'FAIL');
assert.equal(assess({...good,summary:{frames:1800*20,p95Ms:17,worstMs:900}}),'FAIL');
console.log('PASS device gates reject malformed/stale evidence, unrepresentative frame counts and long stalls despite good P95');
