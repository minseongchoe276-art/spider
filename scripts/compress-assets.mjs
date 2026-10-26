import {readdir,readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {gzipSync,brotliCompressSync,constants} from 'node:zlib';
import {pathToFileURL} from 'node:url';

export async function compressAssets(root=resolve('dist')){
  const totals={files:0,originalBytes:0,gzipBytes:0,brotliBytes:0};
  async function walk(folder){
    for(const entry of await readdir(folder,{withFileTypes:true})){
      const path=join(folder,entry.name);if(entry.isDirectory()){await walk(path);continue;}
      if(!/\.(?:js|css|json|svg|wasm|glb|fbx)$/i.test(entry.name)||(await stat(path)).size<1024)continue;
      const original=await readFile(path),gzip=gzipSync(original,{level:6}),br=brotliCompressSync(original,{params:{[constants.BROTLI_PARAM_QUALITY]:5}});
      await writeFile(path+'.gz',gzip);await writeFile(path+'.br',br);
      totals.files++;totals.originalBytes+=original.length;totals.gzipBytes+=gzip.length;totals.brotliBytes+=br.length;
    }
  }
  await walk(root);return totals;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)console.log('Precompressed static assets:',JSON.stringify(await compressAssets(process.argv[2])));
