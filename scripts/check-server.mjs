import assert from 'node:assert/strict';
import http from 'node:http';

const base=new URL(process.argv[2]||'http://127.0.0.1:4173/');
function request(path,method='GET') {
  return new Promise((resolve,reject)=>{
    const req=http.request({hostname:base.hostname,port:base.port,method,path},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
    });
    req.setTimeout(25000,()=>req.destroy(new Error('HTTP timeout')));req.on('error',reject);req.end();
  });
}
const results=[];
async function check(name,path,status,method='GET',inspect=()=>{}) {
  const response=await request(path,method);assert([status].flat().includes(response.status),`${name}: HTTP ${response.status}`);
  inspect(response);results.push({name,path,method,status:response.status,bytes:response.body.length});
  return response;
}
const page=await check('Production entry','/',200,'GET',r=>assert.match(r.headers['content-type'],/text\/html/));
await check('HEAD preserves length without a body','/',200,'HEAD',r=>{
  assert.equal(r.body.length,0);assert.equal(Number(r.headers['content-length']),page.body.length);
});
const js=page.body.toString().match(/src="([^"]+\.js)"/)[1];
await check('Hashed JS is immutable',js,200,'GET',r=>{
  assert.match(r.headers['content-type'],/javascript/);assert.match(r.headers['cache-control'],/immutable/);
});
await check('Writes are rejected','/',405,'POST',r=>assert.equal(r.headers.allow,'GET, HEAD'));
await check('Hidden path is private','/.git/config',403);
await check('Encoded traversal cannot escape dist','/..%2fpackage.json',[403,404]);
await check('Malformed URL is rejected','/%ZZ',400);
await check('Proxy denies non-tile upstream paths','/urban-tiles/not-allowed',403);
await check('Missing assets return 404','/definitely-missing-qa-file.glb',404);
await check('Current Hong Kong root loads through production proxy','/urban-tiles/api/3d-data/3dtiles/f2/tileset.json',200,'GET',r=>{
  assert(JSON.parse(r.body.toString()).root);assert.equal(r.headers['x-content-type-options'],'nosniff');
});
console.log(JSON.stringify({base:base.href,passed:results.length,results},null,2));
