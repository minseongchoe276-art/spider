import {releaseIdentity} from './lib/release-identity.mjs';
import {softwareNotices} from './software-notices.mjs';

export function releasePlugin(){
 const identity=releaseIdentity();
 return {name:'release-identity',config(){return {define:{__RELEASE_SOURCE__:JSON.stringify(identity.sourceId)}};},
  configureServer(server){server.middlewares.use((req,res,next)=>{
    if(req.url?.split('?')[0]!=='/THIRD_PARTY_NOTICES.txt')return next();
    res.setHeader('Content-Type','text/plain; charset=utf-8');res.end(softwareNotices().text);
  });},
  generateBundle(){this.emitFile({type:'asset',fileName:'THIRD_PARTY_NOTICES.txt',source:softwareNotices().text});}};
}
