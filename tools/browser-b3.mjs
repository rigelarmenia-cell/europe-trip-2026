import { createRequire } from 'node:module';
import { resolve,extname,sep } from 'node:path';
import {createServer} from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium, webkit } = createRequire(resolve(process.argv[2], 'package.json'))('playwright');
const engine=process.argv[3]||'edge';
const browser = await (engine==='webkit'?webkit.launch({headless:true}):chromium.launch({channel:'msedge',headless:true}));
const context = await browser.newContext({viewport:{width:375,height:900},timezoneId:'America/Los_Angeles'});
const page = await context.newPage(), errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
const trip = JSON.parse(await readFile('trip.json','utf8'));
const root=resolve('.'),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{
 const rel=new URL(req.url,'http://localhost').pathname.replace(/^\/travel\//,'')||'index.html',file=resolve(root,rel);
 if(!file.startsWith(root+sep))throw Error('path');
 const body=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'text/plain','Cache-Control':'no-store'});res.end(body);
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base = `http://127.0.0.1:${server.address().port}/travel/`;
const pass = name => { checks.push(name); console.log('PASS '+name); };
try {
  await context.route('**/*', route => route.request().resourceType()==='image' && !route.request().url().startsWith(base) ? route.abort() : route.continue());
  await page.goto(base); await page.locator('.airport-transfer').first().waitFor();
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.waitForFunction(()=>navigator.serviceWorker.controller);
  await page.reload();
  await page.waitForFunction(title=>document.querySelector('#day-title').textContent===title,trip.days[0].title_hy);
  await page.waitForFunction(expected=>expected.every((count,i)=>document.querySelectorAll('.airport-transfer')[i]?.querySelectorAll('.transfer-option').length===count),trip.airport_transfers.map(t=>t.options.length));
  assert.equal(await page.locator('#day option').count(),trip.days.filter(d=>d.city===trip.days[0].city).length);
  assert.equal(await page.locator('#day-title').textContent(),trip.days[0].title_hy);
  assert.equal(await page.locator('#day-notes').textContent(),trip.days[0].notes_hy);
  assert.equal(await page.locator('.stop').count(),trip.days[0].stops.length);
  assert.equal(await page.locator('.leaflet-marker-icon').count(),trip.days[0].stops.length+1);
  pass('First supplied day preserves full title/notes and data-derived stop/marker counts');
  assert.equal(await page.locator('.airport-transfer').count(),trip.airport_transfers.length);
  assert.equal(await page.locator('.flight-card').count(),trip.flights.length);
  assert.deepEqual(await page.locator('.airport-transfer').evaluateAll(nodes=>nodes.map(n=>n.querySelectorAll('.transfer-option').length)),trip.airport_transfers.map(t=>t.options.length));
  assert.equal(await page.locator('#questions li').count(),trip.open_questions_hy.length);
  assert.equal(await page.locator('.online-checkin').count(),trip.flights.filter(f=>f.online_checkin_hy).length);
  const airport = await page.locator('#airports').textContent();
  assert.ok(!airport.includes('սպասվում է րոպե'));
  assert.match(airport,/ներառված է/); assert.match(airport,/0 €/);
  assert.match(airport,/23\.10 · 23:55/);
  assert.ok(!/2026-\d\d-\d\dT\d\d:\d\d/.test(airport));
  pass('All supplied transfers/options/questions, checkin blocks, literal times, null/zero prices');
  let taxiCount = 0;
  for (const [i, transfer] of trip.airport_transfers.entries()) {
    for (const [j, option] of transfer.options.entries()) {
      const block = page.locator('.airport-transfer').nth(i).locator('.transfer-option').nth(j);
      for (const [k, step] of option.steps.entries()) if (step.mode === 'taxi') {
        taxiCount++;
        await block.evaluate(node => { node.open = true; });
        const row = block.locator('li').nth(k);
        assert.match(await row.textContent(), /Տաքսի/);
        if (step.price_eur_person === null) assert.match(await row.textContent(), /անձի գին՝ սպասվում է/);
        if (option.price_eur_group === null) assert.match(await block.textContent(), /խմբի գին՝ սպասվում է/);
      }
    }
  }
  assert.ok(taxiCount > 0, 'Fixture must exercise taxi rendering');
  const checkin = page.locator('.online-checkin').first();
  const style = await checkin.evaluate(node => { const s=getComputedStyle(node); return {background:s.backgroundColor,color:s.color,padding:s.paddingLeft,border:s.borderLeftWidth}; });
  assert.equal(style.background,'rgb(237, 244, 243)'); assert.equal(style.color,'rgb(24, 62, 66)');
  assert.equal(style.padding,'16px'); assert.equal(style.border,'4px');
  await checkin.screenshot({path:'artifacts/b4-checkin.png'});
  pass('Taxi labels and null fares; checkin separate background/border/padding');
  for (const day of trip.days.slice(1)) {
    await page.locator('#cities button').nth(trip.cities.findIndex(c=>c.id===day.city)).click();
    await page.locator('#day').selectOption(day.date);
    assert.equal(await page.locator('.stop').count(),day.stops.length);
    assert.equal(await page.locator('#day-notes').textContent(),day.notes_hy);
  }
  await page.locator('#cities button').first().click();
  await page.locator('#day').selectOption('2026-10-21');
  await page.locator('.stop').first().scrollIntoViewIfNeeded();
  const photos = trip.days[1].stops[0].photos || [];
  for(const photo of photos) {
    assert.ok((await page.locator('.stop').first().textContent()).includes(photo.author));
    assert.ok((await page.locator('.stop').first().textContent()).includes(photo.license));
  }
  if(photos.length) {
    // A real local 404 exercises onerror even where WebKit routing interception differs.
    await page.locator('.stop').first().locator('img').evaluateAll((imgs,url)=>imgs.forEach(img=>{img.loading='eager';img.src=url;}),base+'missing-test-photo.png');
    await page.locator('.stop').first().getByText('Լուսանկարը չբեռնվեց',{exact:true}).first().waitFor();
  }
  await page.locator('.stop').first().locator('[data-action=visited]').click();
  pass('All supplied day notes/counts; photo attribution and simulated network failure; personal note');
  await page.locator('#tab-map').click(); await page.locator('#safety-toggle').check();
  assert.equal(await page.locator('.safety-zone').count(),trip.cities.find(c=>c.id===trip.days[0].city).safety_zones.length);
  for(const width of [320,375,800,1400]) {
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  pass('Three Paris safety polygons; responsive 320–1400px');
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.waitForFunction(()=>navigator.serviceWorker.controller);
  if(engine==='webkit')await new Promise(r=>{server.close(r);server.closeAllConnections();});else await context.setOffline(true);
  const offlineResponse=await page.reload();assert.equal(offlineResponse.fromServiceWorker(),true); await page.locator('.stop').first().waitFor();
  assert.equal(await page.locator('.stop').first().getAttribute('data-status'),'visited');
  assert.equal(await page.locator('.online-checkin').count(),trip.flights.filter(f=>f.online_checkin_hy).length);
  assert.equal(await page.locator('.airport-transfer').count(),trip.airport_transfers.length);
  assert.deepEqual(errors,[]);
  pass('Offline supplied trip, checkin and notes retained; zero JavaScript errors');
  await writeFile(`artifacts/b43-b3-${engine}.json`,JSON.stringify({status:'PASS',device:`Desktop Windows ${engine} / Playwright, not a physical phone`,browser:browser.version(),timezone:'America/Los_Angeles',checks},null,2));
} finally { await browser.close();server.close(); }
