import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';
const {chromium,webkit}=createRequire(resolve(process.argv[2],'package.json'))('playwright');
const root=resolve('.'),trip=JSON.parse(await readFile('trip.json','utf8')),results=[];
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
// Expose the real Leaflet instance only in this test server, to select an exact zoom.
const server=createServer(async(req,res)=>{try{const rel=new URL(req.url,'http://localhost').pathname.replace(/^\/travel\//,'')||'index.html',file=resolve(root,rel);if(!file.startsWith(root+sep))throw Error('path');let bytes=await readFile(file);if(rel==='lib/map.js')bytes=bytes.toString().replace('L.control.zoom(', 'window.__testMap=map; L.control.zoom(');res.writeHead(200,{'Content-Type':types[extname(file)]||'text/plain','Cache-Control':'no-store'});res.end(bytes);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/travel/`;
try{for(const engine of ['edge','webkit']){
 const browser=await(engine==='edge'?chromium.launch({channel:'msedge',headless:true}):webkit.launch({headless:true}));
 const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[],result={engine,version:trip.version,checks:[]};results.push(result);page.on('pageerror',e=>errors.push(e.message));
 // Cleanup only: popup opening below uses real pointer clicks; close-button placement is outside this fix.
 const close=async()=>{await page.locator('.leaflet-popup-close-button').last().evaluate(n=>n.click());await page.waitForFunction(()=>!document.querySelector('.leaflet-popup'));await page.waitForFunction(()=>!document.querySelector('.leaflet-pan-anim'));};
 try{
  await page.goto(base);await page.locator('.stop').first().waitFor();await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.reload();await page.locator('.stop').first().waitFor();
  for(const id of ['paris-21-01','rome-26-05']){
   const day=trip.days.find(d=>d.stops.some(s=>s.id===id)),stop=day.stops.find(s=>s.id===id),point=stop.photo_points.find(p=>p.lat===stop.lat&&p.lon===stop.lon);
   assert.ok(point,'real v13 must exercise exact coordinate overlap');
   await page.locator('#cities button').nth(trip.cities.findIndex(c=>c.id===day.city)).click();await page.locator('#day').selectOption(day.date);
   for(const view of ['fit','zoom16']){
    await page.locator('#tab-map').click();
    await page.locator('#map').scrollIntoViewIfNeeded();
    for(const [kind,target] of [['stop',id],['photo',point.id]]){
     if(view==='fit')await page.locator('#tab-map').click();
     else await page.evaluate(s=>window.__testMap.setView([s.lat,s.lon],16,{animate:false}),stop);
     await page.waitForFunction(()=>!document.querySelector('.leaflet-pan-anim'));
     assert.equal(await page.evaluate(()=>Number(getComputedStyle(window.__testMap.getPane('markerPane')).zIndex)>Number(getComputedStyle(window.__testMap.getPane('photoPoints')).zIndex)),true);
     if(view==='zoom16')assert.equal(await page.evaluate(()=>window.__testMap.getZoom()),16);
     const marker=page.locator(`.${kind}-marker[data-${kind}-id="${target}"]`);
     const hit=await marker.evaluate(n=>{const r=n.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,top=document.elementFromPoint(x,y),owner=top?.closest('.leaflet-marker-icon');return {x,y,hit:owner?.dataset.stopId||owner?.dataset.photoId,className:owner?.className};});
     assert.equal(hit.hit,target,`${engine} ${id} ${view} ${kind}: ${JSON.stringify(hit)}`);
     await page.mouse.click(hit.x,hit.y);
     await page.locator('.leaflet-popup-content').waitFor();
     if(kind==='photo')assert.ok((await page.locator('.photo-point-popup').textContent()).includes(point.name_hy));
     else assert.ok((await page.locator('.leaflet-popup-content strong').textContent()).includes(stop.name_hy));
     await close();
    }
    result.checks.push(`${id}/${view}: stop and photo centre hit-tests + real clicks/popups PASS`);
    if(id==='paris-21-01'){
     if(view==='fit')await page.locator('#tab-map').click();
     else await page.evaluate(s=>window.__testMap.setView([s.lat,s.lon],16,{animate:false}),stop);
     await page.waitForFunction(()=>[...document.querySelectorAll('.leaflet-tile')].filter(n=>n.complete&&n.naturalWidth>0).length>=4,null,{timeout:30000});
     await page.locator('#map-panel').screenshot({path:`artifacts/b51-${engine}-21-${view}.png`,animations:'disabled'});
    }
   }
  }
  assert.deepEqual(errors,[]);result.jsErrors=errors;result.status='PASS';console.log(engine+' PASS '+result.checks.length+' views; JS 0');
 }catch(e){await page.screenshot({path:`artifacts/b51-${engine}-failure.png`});console.log(await page.locator('.leaflet-marker-icon').evaluateAll(ns=>ns.map(n=>({id:n.dataset.stopId||n.dataset.photoId||'home',rect:n.getBoundingClientRect().toJSON()}))));result.status='FAIL';result.error=e.stack;console.error(e.stack);}
 finally{await browser.close();}
}}finally{server.close();await writeFile('artifacts/browser-b51.json',JSON.stringify(results,null,2));}
if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
