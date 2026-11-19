import {Reader} from 'mmdb-lib';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {isIP} from 'node:net';
const require=createRequire(import.meta.url);
export function createGeoLookup(){try{
 const ipv4=new Reader(readFileSync(require.resolve('@ip-location-db/dbip-city-mmdb/dbip-city-ipv4.mmdb'))),ipv6=new Reader(readFileSync(require.resolve('@ip-location-db/dbip-city-mmdb/dbip-city-ipv6.mmdb')));
 const date=ipv4.metadata.buildEpoch.toISOString().slice(0,10);
 return{provider:'DB-IP Lite · '+date,lookup:raw=>{const ip=String(raw||'').replace(/^::ffff:/,'');const version=isIP(ip);if(!version)return null;const value=(version===4?ipv4:ipv6).get(ip);if(!value?.country_code)return null;return{country:value.country_code,city:value.city||null}}};
 }catch{return{provider:null,lookup:null}}
}
