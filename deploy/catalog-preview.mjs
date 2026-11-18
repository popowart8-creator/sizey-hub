import{readFile,writeFile}from'node:fs/promises';
const catalog=JSON.parse(await readFile('src/catalog.json','utf8'));
await writeFile('src/catalog-preview.json',JSON.stringify(catalog.map(item=>({...item,gallery:[item.img],description:''}))));
