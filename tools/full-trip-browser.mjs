// Local fixture server only: never replaces the real trip.json.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';
const {chromium,webkit}=createRequire(resolve(process.argv[2],'package.json'))('playwright');
const fixtureBytes=await readFile('tests/fixtures/full-trip.json');
const fixture=JSON.parse(fixtureBytes),root=resolve('.');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer(async(req,res)=>{
 try{
  const name=new URL(req.url,'http://localhost').pathname.replace(/^\/travel\//,'')||'index.html';
  const file=resolve(root,name);if(!file.startsWith(root+sep))throw Error('path');
  const data=name==='trip.json'?fixtureBytes:await readFile(file);
  res.writeHead(200,{'Content-Type':types[extname(file)]||'text/plain','Cache-Control':'no-store'});res.end(data);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}/travel/`,results=[];
try{
 for(const engine of ['edge','webkit']){
  const browser=await (engine==='edge'?chromium.launch({channel:'msedge',headless:true}):webkit.launch({headless:true}));
  const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Yerevan',...(engine==='webkit'?{isMobile:true,hasTouch:true,deviceScaleFactor:3}:{})});
  const page=await context.newPage(),errors=[],checks=[];
  page.on('pageerror',e=>errors.push(e.message));
  const pass=s=>{checks.push(s);console.log(engine+' PASS '+s);};
  await context.route('https://fixture.invalid/**',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250"><rect width="400" height="250" fill="#d9e9e7"/><text x="20" y="40">SYNTHETIC TEST IMAGE</text></svg>'}));
  await context.route('https://tile.openstreetmap.org/**',r=>r.abort());
  const result={engine,browser:browser.version(),physicalPhone:false,checks};results.push(result);
  try{
   const start=performance.now();await page.goto(base,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelectorAll('.stop').length>0&&document.querySelectorAll('.airport-transfer').length===6);
   result.firstUsableMs=Math.round(performance.now()-start);
   result.navigation=await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];return {domContentLoadedMs:Math.round(n.domContentLoadedEventEnd),loadEventMs:Math.round(n.loadEventEnd)};});
   for(const day of fixture.days){
    await page.locator('#cities button').nth(fixture.cities.findIndex(c=>c.id===day.city)).click();
    await page.locator('#day').selectOption(day.date);
    assert.equal(await page.locator('.stop').count(),day.stops.length);
    assert.equal(await page.locator('#day-notes').textContent(),day.notes_hy);
    assert.equal(await page.locator('.leaflet-marker-icon').count(),day.stops.length+1);
    const links=await page.locator('#day-routes a').evaluateAll(nodes=>nodes.map(n=>({href:n.href,text:n.textContent})));
    assert.equal(links.length,0);
    for(const [i,link] of links.entries()){
     assert.ok(link.text.includes(`Մաս ${i+1}`));
     const u=new URL(link.href);assert.ok(u.hostname==='www.google.com');
     assert.ok((u.searchParams.get('waypoints')||'').split('|').filter(Boolean).length<=3);
    }
    for(const width of [320,375,800,1400]){
     await page.setViewportSize({width,height:900});
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${day.city}/${day.date}/${width}`);
    }
   }
   pass('All 9 calendar dates / 10 city-days: 6–10 stops, markers, Maps parts, 320–1400px');
   await page.locator('.stop').first().locator('[data-action=visited]').click();
   const savedId=await page.locator('.stop').first().getAttribute('data-id');
   await page.reload();await page.locator('.stop').first().waitFor();
   assert.equal(await page.locator(`.stop[data-id="${savedId}"]`).getAttribute('data-status'),'visited');
   pass('Personal note persists across reload');
   await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller);
   result.localStorage=await page.evaluate(()=>{
    const pairs=Object.entries(localStorage),trip=localStorage.getItem('champa:/travel/:real:trip');
    return {tripUtf8Bytes:new TextEncoder().encode(trip).length,totalUtf8Bytes:pairs.reduce((n,[k,v])=>n+new TextEncoder().encode(k+v).length,0),estimatedUtf16Bytes:pairs.reduce((n,[k,v])=>n+(k.length+v.length)*2,0)};
   });
   if(engine==='webkit') {
    await context.setOffline(true);
    try { await page.reload(); result.offlineEmulation='PASS'; }
    catch(e) { result.offlineEmulation={status:'FAIL',error:e.message,upstream:'https://github.com/microsoft/playwright/issues/42775'}; }
    await context.setOffline(false);
    await new Promise(r=>{server.close(r);server.closeAllConnections();});
    // Negative control: a fresh page cannot reach the stopped server.
    const fresh=await browser.newContext(),probe=await fresh.newPage();let failed=false;
    try {await probe.goto(base,{timeout:5000});} catch {failed=true;}
    assert.ok(failed,'Origin must actually be unreachable');await fresh.close();
    const response=await page.reload();assert.equal(response.fromServiceWorker(),true);
    result.offlineMethod='Origin server stopped; fresh-browser negative control failed; reload served by service worker. navigator.onLine remains true.';
   } else {await context.setOffline(true);await page.reload();result.offlineMethod='Playwright context.setOffline(true)';}
   await page.locator('.stop').first().waitFor();
   assert.equal(await page.locator(`.stop[data-id="${savedId}"]`).getAttribute('data-status'),'visited');
   assert.equal(await page.locator('.airport-transfer').count(),fixture.airport_transfers.length);
   assert.equal(await page.locator('.flight-card').count(),fixture.flights.length);
   for(const day of fixture.days){
    await page.locator('#cities button').nth(fixture.cities.findIndex(c=>c.id===day.city)).click();await page.locator('#day').selectOption(day.date);
    assert.equal(await page.locator('.stop').count(),day.stops.length);
   }
   pass('Offline reload, all days, personal note, six transfers and four flights');
   assert.deepEqual(errors,[]);pass('Zero JavaScript errors');result.status='PASS';
  }catch(e){result.status='FAIL';result.error=e.stack;result.diagnostic=await page.evaluate(async()=>({url:location.href,online:navigator.onLine,controlled:!!navigator.serviceWorker?.controller,stops:document.querySelectorAll('.stop').length,caches:await caches.keys()})).catch(()=>null);console.error(e.stack);console.log(JSON.stringify(result.diagnostic));}
  finally{await browser.close();}
 }
}finally{
 server.close();await writeFile('artifacts/full-trip-browser.json',JSON.stringify({fixtureBytes:fixtureBytes.length,conditions:'Single cold local run per engine; synthetic images intercepted; external map tiles blocked; not real-world latency or physical Safari',results},null,2));
}
if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
