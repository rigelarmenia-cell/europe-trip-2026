import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const {chromium,webkit}=createRequire(resolve(process.argv[2],'package.json'))('playwright');
const root=resolve('.'),results=[];
const cases=[['v12','trip.json'],['full','tests/fixtures/full-trip.json'],['empty','tests/fixtures/full-trip.json'],['v9',process.argv[3]]].filter(([,p])=>p);
const good=s=>s&&typeof s.lat==='number'&&typeof s.lon==='number';
const expected=(day,city)=>{
 const ss=day.stops.slice().sort((a,b)=>a.order-b.order);if(!ss.length)return 0;
 return ss.slice(1).filter((s,i)=>good(s)&&good(ss[i])).length+Number(good(city.home_station)&&good(ss[0]))+Number(good(city.home_station)&&good(ss.at(-1))&&!!ss.at(-1).to_next);
};
for(const engine of ['edge','webkit'])for(const [name,file] of cases){
 let bytes=await readFile(file);const trip=JSON.parse(bytes);
 if(name==='empty'){trip.days[0].stops=[];bytes=Buffer.from(JSON.stringify(trip));}
 if(name==='v9')assert.equal(createHash('sha256').update(bytes).digest('hex'),'03230e614d83b8fc6e2262f4e2e994acd38cc8b21874dc0f47c0c28d88d9803f');
 const paths=name==='v12'?JSON.parse(await readFile('paths.json','utf8')):{};
 // Deliberately synthetic >2-point street geometry, used only by this local test server.
 if(name!=='v12')for(const day of trip.days)for(let i=0;i<day.stops.length-1;i++){
  const a=day.stops[i],b=day.stops[i+1];if(good(a)&&good(b)&&!a.to_next?.line?.includes('+')&&['bus','tram','taxi'].includes(a.to_next?.mode))paths[`${a.id}>${b.id}:${a.to_next.mode}`]=[[a.lat,a.lon],[(a.lat+b.lat)/2+.0001,(a.lon+b.lon)/2],[b.lat,b.lon]];
 }
 let pathMode='valid';
 const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
 const server=createServer(async(req,res)=>{try{
  const rel=new URL(req.url,'http://localhost').pathname.replace(/^\/travel\//,'')||'index.html';
  const path=resolve(root,rel);if(!path.startsWith(root+sep))throw Error('path');
  if(rel==='paths.json'){res.writeHead(pathMode==='missing'?404:200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(pathMode==='bad'?'{"broken":42}':JSON.stringify(paths));return;}
  const data=rel==='trip.json'?bytes:await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'text/plain','Cache-Control':'no-store'});res.end(data);
 }catch{res.writeHead(404);res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}/travel/`;
 const browser=await(engine==='edge'?chromium.launch({channel:'msedge',headless:true}):webkit.launch({headless:true}));
 const context=await browser.newContext({viewport:{width:1400,height:1000}}),page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await context.route('https://**/*',r=>name==='v12'&&r.request().url().startsWith('https://tile.openstreetmap.org/')?r.continue():r.abort());
 const result={engine,browser:browser.version(),case:name,checks:[]};results.push(result);
 const pass=s=>{result.checks.push(s);console.log(`${engine}/${name} PASS ${s}`);};
 try{
  await page.goto(base);await page.locator('.airport-transfer').first().waitFor();
  await page.waitForFunction(()=>localStorage.getItem('champa:/travel/:real:paths')!==null);
  let photoCount=0,placeholders=0;
  for(const day of trip.days){
   const ci=trip.cities.findIndex(c=>c.id===day.city),city=trip.cities[ci];
   await page.locator('#cities button').nth(ci).click();await page.locator('#day').selectOption(day.date);
   await page.waitForFunction(title=>document.querySelector('#day-title').textContent===title,day.title_hy);
   assert.equal(await page.locator('.stop').count(),day.stops.length);
   assert.equal(await page.locator('#day-notes').textContent(),day.notes_hy);
   if(!day.stops.length){assert.match(await page.locator('#stops').textContent(),/Կանգառները դեռ պատրաստվում են/);assert.equal(await page.locator('.leaflet-marker-icon').count(),0);}
   const links=await page.locator('#day-routes a').evaluateAll(ns=>ns.map(n=>({href:n.href,text:n.textContent})));
   assert.equal(links.length,day.stops.every(good)?Math.ceil(day.stops.length/4):0);
   for(const [i,link] of links.entries()){assert.ok(link.text.includes(`Մաս ${i+1}`));assert.equal(new URL(link.href).hostname,'www.google.com');}
   for(const stop of day.stops){
    const card=page.locator(`.stop[data-id="${stop.id}"]`),photos=stop.photos||[];
    assert.equal(await card.locator('figure').count(),photos.length);
    for(const [i,photo] of photos.entries()){
     const caption=card.locator('figcaption').nth(i);assert.ok((await caption.textContent()).includes(photo.author));assert.ok((await caption.textContent()).includes(photo.license));
     assert.equal(await caption.locator('a').getAttribute('href'),photo.source_page);photoCount++;
    }
    if(!photos.length){assert.match(await card.textContent(),/Լուսանկար չկա/);placeholders++;}
    if(stop.to_next?.km!=null&&stop.to_next?.min!=null)assert.ok((await card.textContent()).includes(`${String(stop.to_next.km).replace('.',',')} կմ`));
   }
   assert.equal(await page.locator('.day-route').count(),expected(day,city),`${day.city} ${day.date}`);
   for(const node of await page.locator('.day-route').all()){
    const klass=await node.getAttribute('class'),dash=await node.getAttribute('stroke-dasharray');
    if(/route-walk|route-unknown/.test(klass))assert.ok(dash);else assert.equal(dash,null);
   }
   for(const [i,a] of day.stops.entries()){
    const b=day.stops[i+1];if(!b)continue;
    const selector=`.day-route[data-from="${a.id}"][data-to="${b.id}"]`;
    if(!good(a)||!good(b))assert.equal(await page.locator(selector).count(),0);
    else if(i>0&&!good(day.stops[i-1]))assert.match(await page.locator(selector).getAttribute('class'),/route-unknown/);
    else if(paths[`${a.id}>${b.id}:${a.to_next?.mode}`])assert.ok(Number(await page.locator(selector).getAttribute('data-points'))>2);
    if(good(a)&&good(b)&&a.to_next?.line?.includes('+')){
     assert.equal(await page.locator(selector).getAttribute('stroke'),'#64748b');
     assert.equal(await page.locator(selector).getAttribute('data-points'),'2');
     if(['bus','tram','taxi'].includes(a.to_next.mode))assert.match(await page.locator(selector).getAttribute('class'),/route-fallback/);
    }
   }
   for(const width of [320,375,800,1400]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
   if(name==='v12'&&['2026-10-25','2026-10-26'].includes(day.date)){
    await page.locator('#map-panel').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('.leaflet-tile')).filter(i=>i.complete&&i.naturalWidth>0).length>=4,{},{timeout:30000});
    await page.locator('#map-panel').screenshot({path:`artifacts/b5-regression-${engine}-${day.date}.png`});
   }
  }
  result.photos=photoCount;result.noPhotoStops=placeholders;
  if(name==='v12')assert.equal(photoCount,14);
  pass('All days: title/notes/stops, Maps parts, photo attribution/placeholders, decimal km, line counts/styles/gaps, road geometry, 320–1400px');
  const day=trip.days.find(d=>d.date==='2026-10-21'),city=trip.cities.find(c=>c.id===day.city);
  await page.locator('#cities button').nth(trip.cities.indexOf(city)).click();await page.locator('#day').selectOption(day.date);
  const count=await page.locator('.day-route').count();await page.locator('.stop').first().locator('[data-action=visited]').click();assert.equal(await page.locator('.day-route').count(),count-1);
  assert.equal(await page.locator(`.day-route[data-from="${day.stops[0].id}"],.day-route[data-to="${day.stops[0].id}"]`).count(),0);
  assert.ok(Number(await page.locator(`.stop-marker[data-stop-id="${day.stops[0].id}"]`).evaluate(n=>getComputedStyle(n).opacity))<.5);
  await page.locator('.stop').first().locator('[data-action=visited]').click();assert.equal(await page.locator('.day-route').count(),count);
  const markerCount=await page.locator('.leaflet-marker-icon').count();
  await page.locator('.stop').first().getByRole('button',{name:'Քարտեզին',exact:true}).click();
  assert.equal(await page.locator('.leaflet-marker-icon').count(),markerCount,'Focus must preserve all day markers');
  await page.locator('.stop').nth(2).locator('summary').first().click();await page.locator('.stop').nth(2).locator('[data-action=up]').click();
  assert.match(await page.locator(`.day-route[data-from="${day.stops[0].id}"][data-to="${day.stops[2].id}"]`).getAttribute('class'),/route-unknown/);
  pass('Visited marker retained/dimmed but route omitted; restored status restores lines; reordered edge grey; station public');
  for(const mode of ['bad','missing','valid']){
   pathMode=mode;await page.locator('#check-update').click();
   await page.waitForFunction(()=>!document.getElementById('check-update').disabled);
   await page.waitForFunction(expected=>{const v=localStorage.getItem('champa:/travel/:real:paths');return v!==null&&Object.keys(JSON.parse(v)).length===expected;},mode==='valid'?Object.keys(paths).length:0);
   assert.ok(await page.locator('.day-route').count()>0);
  }
  pass('Malformed/missing paths fall back without JS error; valid data restores');
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller);
  const before=await page.locator('.day-route').count();
  if(engine==='webkit')await new Promise(r=>{server.close(r);server.closeAllConnections();});else await context.setOffline(true);
  await page.reload();await page.locator('.day-route').first().waitFor({state:'attached'});assert.equal(await page.locator('.day-route').count(),before);
  for(const d of trip.days){
   const c=trip.cities.find(c=>c.id===d.city);await page.locator('#cities button').nth(trip.cities.indexOf(c)).click();await page.locator('#day').selectOption(d.date);
   assert.equal(await page.locator('.stop').count(),d.stops.length);
   assert.equal(await page.locator('.day-route').count(),expected(d,c));
  }
  assert.deepEqual(errors,[]);assert.equal(requests.some(u=>/project-osrm|openrouteservice|graphhopper/i.test(u)),false);
  pass('Offline lines retained; no runtime routing requests; zero JS errors');result.status='PASS';
 }catch(e){result.status='FAIL';result.error=e.stack;console.error(e.stack);}
 finally{await browser.close();server.close();}
}
await writeFile('artifacts/paths-browser.json',JSON.stringify(results,null,2));
if(results.some(r=>r.status!=='PASS'))process.exitCode=1;

