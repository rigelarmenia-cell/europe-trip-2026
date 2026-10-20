// 💡 Suggestions UI check (Chromium). Usage: node tools/browser-suggest.mjs <dir with playwright> [outDir]
import { createRequire } from 'node:module';
import { resolve, extname, sep } from 'node:path';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = createRequire(resolve(process.argv[2], 'package.json'))('playwright');
const out = process.argv[3] || '.', root = resolve('.');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = createServer(async (req, res) => { try {
  const rel = new URL(req.url, 'http://x').pathname.replace(/^\//, '') || 'index.html', file = resolve(root, rel);
  if (!file.startsWith(root + sep)) throw Error('path');
  res.writeHead(200, { 'Content-Type': types[extname(file)] || 'text/plain', 'Cache-Control': 'no-store' }); res.end(await readFile(file));
} catch { res.writeHead(404); res.end(); } });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ headless: true }), errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, timezoneId: 'Asia/Yerevan', serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-10-20T17:30:00Z') });
  await page.route(/^https:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => document.querySelectorAll('#stops .stop').length > 0);
  const names = () => page.$$eval('#stops .stop .stop-title', n => n.map(x => x.textContent));
  assert.equal(await page.$eval('#day', s => s.value), '2026-10-20');
  assert.deepEqual(await names(), ['Պորտ Մայոյի կանգառ', 'Ընթրիք՝ Le Grand Banquet (bouillon, մատչելի)', 'Եռակամար (Հաղթական կամար)']);
  assert.equal(await page.locator('#suggest-list .suggest-card').count(), 3);
  await page.locator('#suggest-list .suggest-card').first().screenshot({ path: `${out}/suggest-card.png` });
  await page.click('button[data-suggestion="sug-paris-20-1"]');
  const after = await names();
  assert.equal(after.length, 4); assert.ok(after.some(n => n.startsWith('💡 Տրոկադերո')));
  console.log('PASS add →', after.join(' | '));
  assert.match(await page.locator('#suggest-list .suggest-card').first().textContent(), /պլանում է/);
  await page.click('button[data-suggestion="sug-paris-20-2"]');
  console.log('PASS add 2 →', (await names()).join(' | '));
  await page.reload(); await page.waitForFunction(() => document.querySelectorAll('#stops .stop').length > 0);
  assert.equal((await names()).length, 5); console.log('PASS kept after reload');
  await page.locator('#suggestions').screenshot({ path: `${out}/suggestions.png` });
  await page.click('button[data-suggestion="sug-paris-20-1"]');
  assert.equal((await names()).length, 4); console.log('PASS remove');
  await page.click('#tab-map'); await page.waitForTimeout(500);
  assert.ok(await page.locator('.leaflet-marker-icon').count() > 0); console.log('PASS map markers');
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(scroll <= 0, 'h-scroll');
  assert.deepEqual(errors, []); console.log('PASS no JS errors');
} finally { await browser.close(); server.close(); }
