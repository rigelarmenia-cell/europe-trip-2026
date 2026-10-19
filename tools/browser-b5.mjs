// Local-only synthetic photo-point fixture. Never writes the published trip.json.
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import assert from 'node:assert/strict';
const {chromium,webkit}=createRequire(resolve(process.argv[2],'package.json'))('playwright');
const root=resolve('.'),bytes=await readFile('tests/fixtures/photo-points.json'),trip=JSON.parse(bytes),results=[];
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
for(const engine of ['edge','webkit']) {
 const server=createServer(async(req,res)=>{try{
  const rel=new URL(req.url,'http://localhost').pathname.replace(/^\/travel\//,'')||'index.html',file=resolve(root,rel);
  if(!file.startsWith(root+sep))throw Error('path');const data=rel==='trip.json'?bytes:await readFile(file);
  res.writeHead(200,{'Content-Type':types[extname(file)]||'text/plain','Cache-Control':'no-store'});res.end(data);
 }catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/travel/`;
 const browser=await(engine==='edge'?chromium.launch({channel:'msedge',headless:true}):webkit.launch({headless:true}));
 const context=await browser.newContext({viewport:{width:1400,height:1000}}),page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 const result={engine,browser:browser.version(),checks:[]};results.push(result);
 const pass=s=>{result.checks.push(s);console.log(`${engine} PASS ${s}`);};
 const select=async date=>{const day=trip.days.find(d=>d.date===date);await page.locator('#cities button').nth(trip.cities.findIndex(c=>c.id===day.city)).click();await page.locator('#day').selectOption(date);await page.waitForFunction(t=>document.querySelector('#day-title').textContent===t,day.title_hy);return day;};
 const closePopup=async()=>{await page.locator('.leaflet-popup-close-button').last().click();await page.waitForFunction(()=>!document.querySelector('.leaflet-popup'));};
 const order=()=>page.locator('.stop').evaluateAll(ns=>ns.map(n=>n.dataset.id));
 const tiles=()=>page.waitForFunction(()=>[...document.querySelectorAll('.leaflet-tile')].filter(n=>n.complete&&n.naturalWidth>0).length>=4,null,{timeout:30000});
 const snap=async name=>{
  await page.locator('#map-panel').scrollIntoViewIfNeeded();
  if(name!=='21-photo-popup')await page.waitForFunction(()=>{
   const map=document.querySelector('#map'),b=map.getBoundingClientRect();
   return !map.classList.contains('leaflet-zoom-anim')&&[...document.querySelectorAll('.stop-marker')].every(n=>{const r=n.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return x>=b.x&&x<=b.right&&y>=b.y&&y<=b.bottom;});
  });
  await tiles();await page.locator('#map-panel').screenshot({path:`artifacts/b5-${engine}-${name}.png`});
 };
 const openStop=async id=>{const card=page.locator(`.stop[data-id="${id}"]`);if(!await card.evaluate(n=>n.open))await card.locator('summary').first().click();return card;};
 try {
  await page.goto(base);await page.locator('.stop').first().waitFor();await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller);await page.reload();await page.locator('.stop').first().waitFor();
  const day=await select('2026-10-21'),parent=day.stops.find(s=>s.photo_points?.length),points=parent.photo_points;
  assert.equal(await page.locator('.photo-marker').count(),2);
  assert.equal(await page.locator('.stop-marker').count(),day.stops.length);
  const lines=await page.locator('.day-route').count(),routes=await page.locator('#day-routes a').evaluateAll(ns=>ns.map(n=>n.href));
  const positions=await page.locator('.stop-marker').evaluateAll(ns=>ns.map(n=>n.style.transform));
  await page.locator('#photo-toggle').uncheck();assert.equal(await page.locator('.photo-marker').count(),0);
  assert.equal(await page.locator('.day-route').count(),lines);assert.deepEqual(await page.locator('#day-routes a').evaluateAll(ns=>ns.map(n=>n.href)),routes);
  await page.locator('#photo-toggle').check();assert.deepEqual(await page.locator('.stop-marker').evaluateAll(ns=>ns.map(n=>n.style.transform)),positions);
  let card=await openStop(parent.id);await card.locator(`[data-photo-id="${points[0].id}"]`).click();
  await page.locator('.photo-point-popup').waitFor();
  const popup=page.locator('.photo-point-popup');assert.ok((await popup.textContent()).includes(points[0].name_local));assert.ok((await popup.textContent()).includes(points[0].what_hy));
  assert.equal(await popup.locator('script,img[src="x"]').count(),0);assert.equal(await page.evaluate(()=>window.fixtureInjected),undefined);
  const walk=new URL(await popup.getByText('Գնալ այստեղ · քայլքով ↗',{exact:true}).getAttribute('href'));assert.equal(walk.searchParams.get('travelmode'),'walking');assert.equal(walk.searchParams.get('destination'),`${points[0].lat},${points[0].lon}`);
  assert.equal(await popup.getByText('Աղբյուր 1 ↗',{exact:true}).getAttribute('href'),points[0].sources[0]);
  await snap('21-photo-popup');
  await closePopup();
  for(const width of [320,1400]){
   await page.setViewportSize({width,height:1000});if(await page.locator('#tab-plan').isVisible())await page.locator('#tab-plan').click();card=await openStop(parent.id);await card.locator(`[data-photo-id="${points[1].id}"]`).click();await popup.waitFor();
   assert.match(await popup.locator('figcaption').textContent(),new RegExp(points[1].photo.author.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
   assert.ok((await popup.locator('figcaption').textContent()).includes(points[1].photo.license));
   const box=await page.locator('.leaflet-popup').boundingBox();assert.ok(box.x>=-1&&box.x+box.width<=width+1,JSON.stringify(box));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(await popup.locator('img').count()){await popup.locator('img').evaluate((img,url)=>{img.loading='eager';img.src=url;},base+'missing-photo.png');}
   await popup.getByText('Լուսանկարը չբեռնվեց',{exact:true}).waitFor();await closePopup();
  }
  pass('Photo layer toggle, separate routes/bounds, literal injection text, walk/source links, photo credit/error, 320–1400px');
  // Focus the parent after popup autoPan; its marker can otherwise lie outside the map.
  card=await openStop(parent.id);await card.locator('.actions').getByRole('button',{name:'Քարտեզին',exact:true}).click();
  await page.locator(`.stop-marker[data-stop-id="${parent.id}"]`).click();
  const numbered=page.locator('.leaflet-popup-content');await numbered.locator('figure').waitFor();
  assert.ok((await numbered.locator('figcaption').textContent()).includes(parent.photos[0].author));assert.ok((await numbered.locator('figcaption').textContent()).includes(parent.photos[0].license));
  assert.equal(await numbered.getByText('Լուսանկարի աղբյուրը ↗',{exact:true}).getAttribute('href'),parent.photos[0].source_page);await closePopup();
  await page.setViewportSize({width:320,height:1000});await page.locator('#tab-plan').click();
  card=await openStop(parent.id);await card.locator('.actions').getByRole('button',{name:'Քարտեզին',exact:true}).click();await page.locator(`.stop-marker[data-stop-id="${parent.id}"]`).click();
  await numbered.locator('figure').waitFor();
  await page.waitForFunction(()=>{const r=document.querySelector('.leaflet-popup')?.getBoundingClientRect();return r&&r.x>=-1&&r.right<=321;},null,{timeout:5000});
  await closePopup();await page.setViewportSize({width:1400,height:1000});
  card=await openStop(parent.id);await card.locator('[data-action=visited]').click();
  for(const p of points)assert.ok(Number(await page.locator(`.photo-marker[data-photo-id="${p.id}"]`).evaluate(n=>getComputedStyle(n).opacity))<.5);
  assert.match(await page.locator(`.stop-marker[data-stop-id="${parent.id}"]`).textContent(),/✓/);
  assert.equal(await page.locator(`.day-route[data-from="${parent.id}"],.day-route[data-to="${parent.id}"]`).count(),0);
  pass('Numbered popup photo/source; completed markers and camera points remain dimmed; completed route omitted');
  const barcelona=await select('2026-10-25');await page.locator('#reset-day').click();const original=await order(),middle=barcelona.stops[2];
  const beforeLines=await page.locator('.day-route').count();card=await openStop(middle.id);await card.locator('[data-action=skipped]').click();
  assert.equal(await page.locator('.day-route').count(),beforeLines-1);
  const edge=page.locator(`.day-route[data-from="${barcelona.stops[1].id}"][data-to="${barcelona.stops[3].id}"]`);assert.match(await edge.getAttribute('class'),/route-unknown/);assert.ok(await edge.getAttribute('stroke-dasharray'));
  assert.match(await page.locator(`.stop-marker[data-stop-id="${middle.id}"]`).textContent(),/↷/);
  await snap('25-skipped');
  assert.equal(await page.locator('#photo-toggle').isDisabled(),true);assert.match(await page.locator('#photo-note').textContent(),/կետեր չկան/);
  await page.locator('#reset-day').click();await snap('shortest-before');
  await page.locator('#shortest-order').click();await page.locator('#undo-shortest').waitFor();assert.notDeepEqual(await order(),original);assert.match(await page.locator('#notice').textContent(),/\d+,\d կմ → \d+,\d կմ/);
  await page.locator('#undo-shortest').waitFor();await page.locator('#food-warning').waitFor();assert.match(await page.locator('#food-warning').textContent(),/ծրագիրը ժամեր չի հաշվում/);
  const shortened=await order(),warning=await page.locator('#food-warning').textContent();await snap('shortest-after');
  await page.reload();await page.locator('.stop').first().waitFor();assert.deepEqual(await order(),shortened);assert.equal(await page.locator('#food-warning').textContent(),warning);
  await page.locator('#undo-shortest').click();assert.deepEqual(await order(),original);assert.equal(await page.locator('#food-warning').isVisible(),false);assert.equal(await page.locator('#undo-shortest').isVisible(),false);
  await page.locator('#shortest-order').click();await page.locator('.stop').first().locator('[data-action=down]').click();assert.equal(await page.locator('#undo-shortest').isVisible(),false);assert.equal(await page.locator('#food-warning').isVisible(),false);
  pass('Skipped middle grey adjacency, shortest explicit action, decimal notice, persistent food warning, undo, manual move clears undo');
  await page.locator('#reset-day').click();
  if(engine==='webkit')await new Promise(r=>{server.close(r);server.closeAllConnections();});else await context.setOffline(true);
  const response=await page.reload();assert.equal(response.fromServiceWorker(),true);await page.locator('.stop').first().waitFor();
  await page.locator('#shortest-order').click();await page.locator('#undo-shortest').waitFor();assert.notDeepEqual(await order(),original);await page.locator('#undo-shortest').click();assert.deepEqual(await order(),original);
  await select('2026-10-21');await page.locator('#reset-day').click();assert.equal(await page.locator('.photo-marker').count(),2);
  // All completed: no routes, but every numbered marker remains.
  for(const id of day.stops.map(s=>s.id)){card=await openStop(id);await card.locator('[data-action=visited]').click();}
  assert.equal(await page.locator('.day-route').count(),0);assert.equal(await page.locator('.stop-marker').count(),day.stops.length);assert.equal(await page.locator('.photo-marker').count(),2);
  assert.deepEqual(errors,[]);assert.equal(requests.some(u=>/project-osrm|openrouteservice|graphhopper/i.test(u)),false);
  pass('Offline SW reload, shortest/undo and camera markers, all completed zero lines, no routing calls, zero JS errors');result.status='PASS';
 }catch(e){result.status='FAIL';result.error=e.stack;console.error(e.stack);await page.screenshot({path:`artifacts/b5-${engine}-failure.png`}).catch(()=>{});}
 finally{await browser.close();server.close();}
}
await writeFile('artifacts/browser-b5.json',JSON.stringify(results,null,2));if(results.some(r=>r.status!=='PASS'))process.exitCode=1;


