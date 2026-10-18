// Isolated server and fictional data; published trip.json/alerts.json are never changed.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';
import {makeAlertsFixture} from './make-online-fixture.mjs';
const {chromium,webkit}=createRequire(resolve(process.argv[2],'package.json'))('playwright');
const root=resolve('.'),bytes=await readFile('tests/fixtures/online-trip.json'),trip=JSON.parse(bytes),results=[];
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
for(const engine of ['edge','webkit']) {
 let payload=makeAlertsFixture(),invalid=false,failFetch=false,alertRequests=0,tripRequests=0;
 const server=createServer(async(req,res)=>{try{
  const rel=new URL(req.url,'http://localhost').pathname.replace(/^\/travel\//,'')||'index.html',file=resolve(root,rel);
  if(!file.startsWith(root+sep))throw Error('path');
  if(rel==='alerts.json'){
   alertRequests++;
   if(failFetch){res.writeHead(503);res.end('fixture unavailable');return;}
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(invalid?'{invalid fixture JSON':JSON.stringify(payload));return;
  }
  if(rel==='trip.json')tripRequests++;
  const data=rel==='trip.json'?bytes:await readFile(file);
  res.writeHead(200,{'Content-Type':types[extname(file)]||'text/plain','Cache-Control':'no-store'});res.end(data);
 }catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/travel/`;
 const browser=await(engine==='edge'?chromium.launch({channel:'msedge',headless:true}):webkit.launch({headless:true}));
 const context=await browser.newContext({viewport:{width:390,height:900}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const result={engine,browser:browser.version(),checks:[]};results.push(result);
 const pass=s=>{result.checks.push(s);console.log(`${engine} PASS ${s}`);};
 const current=id=>page.locator(`#alerts-current .alert-card[data-alert-id="${id}"]`);
 const select=async date=>{const day=trip.days.find(d=>d.date===date);await page.locator('#cities button').nth(trip.cities.findIndex(c=>c.id===day.city)).click();await page.locator('#day').selectOption(date);};
 const visible=async id=>current(id).waitFor();
 const online=()=>page.evaluate(()=>window.dispatchEvent(new Event('online')));
 const visibility=state=>page.evaluate(state=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>state});Object.defineProperty(document,'hidden',{configurable:true,get:()=>state==='hidden'});document.dispatchEvent(new Event('visibilitychange'));},state);
 const waitRequests=async n=>{for(let i=0;i<100&&alertRequests<n;i++)await new Promise(r=>setTimeout(r,25));assert.ok(alertRequests>=n,`alerts requests ${alertRequests} < ${n}`);};
 try {
  await page.clock.install({time:new Date('2026-10-21T10:00:00+02:00')});
  await page.goto(base);await page.locator('.stop').first().waitFor();await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller);
  await page.reload();await page.locator('.stop').first().waitFor();await select('2026-10-21');await visible('paris-danger');await visible('literal-xss');
  assert.deepEqual((await page.locator('#alerts-current .alert-card').evaluateAll(ns=>ns.map(n=>n.dataset.alertId))).sort(),['all-cities','literal-xss','paris-danger']);
  assert.match(await page.locator('#alerts-count').textContent(),/5/);
  await page.locator('#alerts-count').click();await page.locator('#alerts-dialog').waitFor();
  assert.equal(await page.locator('#alerts-all .alert-card').count(),5);
  assert.equal(await page.locator('#alerts-all [data-alert-id="expired"]').count(),0);
  await page.evaluate(()=>document.querySelector('#alerts-dialog').close());
  await select('2026-10-25');assert.equal(await current('paris-danger').count(),0);await visible('barcelona-warning');await visible('all-cities');
  await select('2026-10-22');assert.equal(await current('paris-danger').count(),0);await visible('paris-other-day');
  await select('2026-10-21');
  assert.ok((await current('literal-xss').textContent()).includes('<img src=x onerror="window.fixtureInjected=true">'));
  assert.equal(await page.locator('#alerts-current img,#alerts-current script').count(),0);assert.equal(await page.evaluate(()=>window.fixtureInjected),undefined);
  assert.equal(await current('paris-danger').locator('a').getAttribute('href'),'https://example.org/fixture-only/alert');
  for(const width of [320,390,768,1400]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow at ${width}`);}
  await page.setViewportSize({width:390,height:900});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`artifacts/b6-${engine}-390-paris21-danger.png`,fullPage:false});
  pass('City/date/null/expiry filters, all-city/date count/dialog, literal XSS, source, 320–1400px and 390px danger screenshot');
  const links=await page.locator('#live-links a').evaluateAll(ns=>ns.map(n=>({href:n.href,target:n.target,rel:n.rel})));
  assert.deepEqual(links.map(n=>n.href),trip.cities.find(c=>c.id==='paris').live_links.map(n=>n.url));
  const flightLinks=await page.locator('.flight-status a').evaluateAll(ns=>ns.map(n=>({href:n.href,target:n.target,rel:n.rel})));
  assert.equal(flightLinks.length,trip.flights.length);assert.deepEqual(flightLinks.map(n=>n.href),trip.flights.map(n=>n.status_url));
  for(const link of [...links,...flightLinks]){assert.equal(link.target,'_blank');assert.ok(link.rel.split(/\s+/).includes('noopener'));}
  pass('Fixture-only city links and every flight status URL, new tab and noopener');
  const affected=trip.days.find(d=>d.date==='2026-10-21').stops.filter(s=>payload.alerts[0].stop_ids.includes(s.id));
  const affectedIds=affected.map(s=>s.id),order=()=>page.locator('.stop').evaluateAll(ns=>ns.map(n=>n.dataset.id));
  const originalOrder=await order();
  for(const stop of affected){
   assert.ok((await current('paris-danger').locator('.alert-affected').textContent()).includes(stop.name_hy));
   assert.equal(await page.locator(`.stop[data-id="${stop.id}"]`).getAttribute('data-status'),'pending');
   assert.match(await page.locator(`.stop[data-id="${stop.id}"] .stop-alert`).textContent(),/ՓՈՐՁԱՐԿՈՒՄ paris-danger/);
   assert.equal(await page.locator(`.stop-marker.alert-stop[data-stop-id="${stop.id}"]`).count(),1);
   assert.equal(await page.locator(`.stop-marker.alert-stop[data-stop-id="${stop.id}"] .number-pin`).evaluate(n=>getComputedStyle(n).borderColor),'rgb(197, 34, 31)');
  }
  assert.ok((await current('paris-danger').textContent()).includes(payload.alerts[0].suggestion_hy));
  assert.equal(await page.locator('.alert-area[data-alert-id="paris-danger"]').count(),1);
  assert.equal(await page.locator('.alert-area[data-alert-id="expired"]').count(),0);
  const safetyChecked=await page.locator('#safety-toggle').isChecked();await page.locator('#safety-toggle').uncheck();
  assert.equal(await page.locator('.alert-area[data-alert-id="paris-danger"]').count(),1,'alert area independent of static safety layer');
  if(safetyChecked)await page.locator('#safety-toggle').check();
  await page.locator('.alert-area[data-alert-id="paris-danger"]').evaluate(n=>n.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  assert.equal(await page.locator('.leaflet-popup-content strong').textContent(),payload.alerts[0].title_hy);
  assert.equal(await page.locator('.leaflet-popup-content a').getAttribute('href'),payload.alerts[0].source_url);
  await page.locator('.leaflet-popup-close-button').evaluate(n=>n.click());
  assert.equal(await page.locator('.stop-alert').count(),2,'unknown stop IDs and expired alerts must not create warnings');
  await current('paris-danger').getByRole('button',{name:'Բաց թողնել այս կանգառները',exact:true}).click();
  for(const id of affectedIds){
   assert.equal(await page.locator(`.stop[data-id="${id}"]`).getAttribute('data-status'),'skipped');
   assert.equal(await page.locator(`.day-route[data-from="${id}"],.day-route[data-to="${id}"]`).count(),0);
  }
  const routeCoordinates=await page.locator('#day-routes a').evaluateAll(ns=>ns.flatMap(n=>{const u=new URL(n.href);return ['origin','destination','waypoints'].flatMap(k=>(u.searchParams.get(k)||'').split('|'));}));
  assert.ok(routeCoordinates.length>0);
  for(const stop of affected)assert.equal(routeCoordinates.includes(`${stop.lat},${stop.lon}`),false,'skipped stop must not appear in Google Maps parts');
  assert.match(await page.locator('#notice').textContent(),/2 կանգառ բաց թողնվեց/);
  await page.locator('#shortest-order').click();
  const shortestOrder=await order();for(const id of affectedIds){assert.equal(shortestOrder.indexOf(id),originalOrder.indexOf(id));assert.equal(await page.locator(`.stop[data-id="${id}"]`).getAttribute('data-status'),'skipped');}
  await page.locator('#reset-day').click();assert.deepEqual(await order(),originalOrder);
  for(const id of affectedIds)assert.equal(await page.locator(`.stop[data-id="${id}"]`).getAttribute('data-status'),'pending');
  // Advance the device clock across an actual expiry, then use the normal visibility refresh.
  payload.alerts[0].until=await page.evaluate(()=>new Date(Date.now()+30000).toISOString());
  let expiryResponse=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/alerts.json'));await online();await(await expiryResponse).finished();await new Promise(r=>setTimeout(r,100));
  await page.clock.runFor(31000);await visibility('hidden');
  expiryResponse=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/alerts.json'));await visibility('visible');await(await expiryResponse).finished();await new Promise(r=>setTimeout(r,100));
  await page.waitForFunction(()=>!document.querySelector('#alerts-current [data-alert-id="paris-danger"]'));
  assert.equal(await page.locator('.alert-area[data-alert-id="paris-danger"],.stop-marker.alert-stop,.stop-alert').count(),0);
  payload.alerts[0].until=null;await online();await visible('paris-danger');
  assert.equal(await page.locator('.alert-area[data-alert-id="paris-danger"]').count(),1);
  pass('Plan suggestion never auto-skips; explicit two-stop skip, route/Google Maps omission, shortest preserves skipped slots, reset, unknown ID, clock expiry clears map/card warnings');
  const fresh={...payload.alerts[0],id:'visibility-new',title_hy:'Փորձնական թարմացում'};
  payload.alerts.push(fresh);await visibility('hidden');await visibility('visible');await visible(fresh.id);
  payload.alerts.push({...fresh,id:'timer-new'});let before=alertRequests;await page.clock.runFor(300001);await waitRequests(before+1);await visible('timer-new');
  await visibility('hidden');before=alertRequests;await page.clock.runFor(600001);assert.equal(alertRequests,before,'hidden pages must not poll');
  payload.alerts.push({...fresh,id:'hidden-return'});await visibility('visible');await waitRequests(before+1);await visible('hidden-return');
  pass('Automatic visible-event and fake five-minute refresh; hidden page does not poll');
  invalid=true;before=alertRequests;const invalidResponse=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/alerts.json'));
  await online();await (await invalidResponse).finished();await new Promise(r=>setTimeout(r,150));await waitRequests(before+1);await visible('timer-new');
  // A subsequent valid refresh proves the invalid request has settled and retained prior state.
  invalid=false;payload.alerts.push({...fresh,id:'after-invalid'});await online();await visible('after-invalid');assert.deepEqual(errors,[]);
  pass('Invalid JSON retains the last valid alerts, zero JavaScript errors');
  const countBeforeDismiss=Number((await page.locator('#alerts-count').textContent()).match(/\d+/)[0]);
  await current('paris-danger').locator('.alert-dismiss').click();assert.equal(await current('paris-danger').count(),0);
  assert.equal(Number((await page.locator('#alerts-count').textContent()).match(/\d+/)[0]),countBeforeDismiss-1);
  await page.reload();await page.locator('.stop').first().waitFor();await select('2026-10-21');await visible('after-invalid');assert.equal(await current('paris-danger').count(),0);
  payload.alerts.push({...fresh,id:'paris-danger-new-id'});await online();await visible('paris-danger-new-id');
  pass('Dismissal persists across reload; a changed ID appears');
  assert.equal(await page.evaluate(()=>navigator.onLine),true);failFetch=true;await online();
  await page.waitForFunction(()=>document.querySelector('#connection')?.textContent.includes('Առանց'));
  await page.locator('.alerts-offline:visible').first().waitFor();
  assert.equal(await page.locator('.alerts-offline:visible').first().textContent(),'Առանց ինտերնետի. ցույց է տրված վերջին հայտնի տարբերակը');
  assert.ok(await page.locator('.requires-internet:visible').count()>0);await visible('paris-danger-new-id');
  failFetch=false;await online();await page.waitForFunction(()=>!document.querySelector('#connection')?.textContent.includes('Առանց'));
  assert.equal(await page.locator('.requires-internet:visible').count(),0);
  pass('Fetch failure with navigator online automatically shows offline hints; online event recovers');
  const cached=await page.evaluate(async()=>{const urls=[];for(const name of await caches.keys())for(const request of await(await caches.open(name)).keys())urls.push(request.url);return urls;});
  assert.equal(cached.some(url=>/\/(?:trip|alerts)\.json(?:\?|$)/.test(url)),false,'SW must never cache live data');
  assert.ok(cached.some(url=>url.endsWith('/lib/alerts.js')),'SW shell must include alerts module');
  // Allow checkData's independent online-event fetch to settle before counting offline requests.
  await new Promise(r=>setTimeout(r,300));
  const offlineCounts={alerts:alertRequests,trip:tripRequests};
  if(engine==='webkit'){
   await context.addInitScript(()=>Object.defineProperty(Navigator.prototype,'onLine',{configurable:true,get:()=>false}));
   result.offlineMethod='origin server stopped + simulated navigator.onLine=false; server counters checked (WebKit native offline cannot reload SW shell; routes bypassed by SW)';
  }else{await context.setOffline(true);result.offlineMethod='origin server stopped + Playwright context offline; server counters checked (context offline alone did not block SW data requests)';}
  await new Promise(r=>{server.close(r);server.closeAllConnections();});
  const response=await page.reload();assert.equal(response.fromServiceWorker(),true);await page.locator('.stop').first().waitFor();await select('2026-10-21');await visible('paris-danger-new-id');
  assert.equal(await current('paris-danger').count(),0);await page.locator('.alerts-offline:visible').first().waitFor();
  assert.equal(await page.locator('.alerts-offline:visible').first().textContent(),'Առանց ինտերնետի. ցույց է տրված վերջին հայտնի տարբերակը');
  assert.ok(await page.locator('.requires-internet:visible').count()>0);assert.equal(await page.locator('#live-links a').count(),3);
  assert.equal(await page.locator('.alert-area[data-alert-id="paris-danger-new-id"]').count(),1,'cached offline alert area remains');
  for(const id of affectedIds){assert.equal(await page.locator(`.stop-marker.alert-stop[data-stop-id="${id}"]`).count(),1);assert.ok(await page.locator(`.stop[data-id="${id}"] .stop-alert`).count()>0);}
  assert.deepEqual({alerts:alertRequests,trip:tripRequests},offlineCounts,'offline reload must not reach origin data endpoints');
  result.pageErrors=[...errors];
  const expectedDiagnostics=['trip.json','alerts.json'].map(file=>`/${new URL(base).host}/travel/${file} due to access control checks.`);
  result.expectedOfflineNetworkDiagnostics=engine==='webkit'?errors.filter(error=>expectedDiagnostics.includes(error)):[];
  result.applicationJsErrors=errors.filter(error=>!result.expectedOfflineNetworkDiagnostics.includes(error));
  assert.deepEqual(result.applicationJsErrors,[]);
  pass('Offline SW reload retains latest alerts, dismissal, links and Armenian offline hints');
  if(result.expectedOfflineNetworkDiagnostics.length)console.log(`${engine} NOTE ${result.expectedOfflineNetworkDiagnostics.length} exact engine network diagnostics retained in report after origin shutdown`);
  result.status='PASS';
 }catch(e){result.status='FAIL';result.error=e.stack;console.error(e.stack);await page.screenshot({path:`artifacts/b6-${engine}-failure.png`}).catch(()=>{});}
 finally{await browser.close();server.close();}
}
await writeFile('artifacts/browser-b6.json',JSON.stringify(results,null,2));if(results.some(r=>r.status!=='PASS'))process.exitCode=1;
