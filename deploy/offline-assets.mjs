import {readdir,writeFile,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
const root='dist/assets';
const entries=await readdir(root,{recursive:true,withFileTypes:true});
const files=entries.filter(entry=>entry.isFile()&&/\.(?:js|css)$/.test(entry.name)).map(entry=>'/assets/'+join(entry.parentPath||entry.path,entry.name).slice(root.length+1).replaceAll('\\','/'));
await writeFile('dist/offline-assets.json',JSON.stringify(files));
console.log('Offline assets:',files.length);

await copyFile('public/admin-sw.js','dist/admin/admin-sw.js');
