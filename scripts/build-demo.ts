import {cpSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {build} from 'esbuild';
mkdirSync('site-dist',{recursive:true});cpSync('public','site-dist',{recursive:true});
await build({entryPoints:['src/browser-demo.ts'],outfile:'site-dist/browser-demo.js',bundle:true,minify:true,platform:'browser',target:'es2022'});
const html=readFileSync('site-dist/index.html','utf8').replace('<script src="/app.js" defer>','<script src="/browser-demo.js" defer></script><script src="/app.js" defer>');
writeFileSync('site-dist/index.html',html);
