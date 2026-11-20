import test from 'node:test';
import assert from 'node:assert/strict';
import {createKeywordSuggestions} from './keyword-suggestions.mjs';

test('returns deduplicated autocomplete suggestions and caches them',async()=>{
 let calls=0;
 const source=createKeywordSuggestions({fetchImpl:async()=>{calls++;return new Response(JSON.stringify(['платье',['платье миди','платье миди','платье женское']]));}});
 const first=await source.suggest('платье');
 const second=await source.suggest('платье');
 assert.deepEqual(first.suggestions,['платье миди','платье женское']);
 assert.equal(first.volumeAvailable,false);
 assert.equal(second,first);
 assert.equal(calls,1);
});
test('rejects invalid query without network access',async()=>{
 const source=createKeywordSuggestions({fetchImpl:()=>{throw Error('unexpected network')}});
 await assert.rejects(source.suggest('a'),e=>e.status===400);
});
test('handles malformed provider response',async()=>{
 const source=createKeywordSuggestions({fetchImpl:async()=>new Response('bad json')});
 await assert.rejects(source.suggest('платье'),e=>e.status===502);
});
