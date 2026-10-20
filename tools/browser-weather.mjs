// Weather UI check (Chromium). Usage: node tools/browser-weather.mjs <dir with playwright> [outDir]
import { createRequire } from 'node:module';
import { resolve, extname, sep } from 'node:path';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { fakeApi } from './weather-fake.mjs';
import { normalizeWeather } from '../lib/weather.js';
const { chromium } = createRequire(resolve(process.argv[2], 'package.json'))('playwright');
const out = process.argv[3] || '.';
const root = resolve('.');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = createServer(async (req, res) => { try {
  const rel = new URL(req.url, 'http://x').pathname.replace(/^\//, '') || 'index.html', file = resolve(root, rel);
  if (!file.startsWith(root + sep)) throw Error('path');
  res.writeHead(200, { 'Content-Type': types[extname(file)] || 'text/plain', 'Cache-Control': 'no-store' }); res.end(await readFile(file));
} catch { res.writeHead(404); res.end(); } });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ headless: true });
const errors = [];
async function run(name, { live, fallback }, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Yerevan', serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  await page.clock.install({ time: new Date('2026-10-20T08:30:00Z') });
  await page.route('**/*.tile.openstreetmap.org/**', r => r.abort());
  await page.route('https://api.open-meteo.com/**', r => live ? r.fulfill({ contentType: 'application/json', body: JSON.stringify(fakeApi()) }) : r.abort());
  await page.route('**/weather.json', r => fallback ? r.fulfill({ contentType: 'application/json', body: JSON.stringify(normalizeWeather(fakeApi(), { now: new Date('2026-10-20T07:07:00Z') })) }) : r.fulfill({ status: 404, body: '' }));
  await page.goto(base);
  await page.waitForFunction(() => document.querySelectorAll('#weather .weather-city').length > 0, null, { timeout: 15000 });
  const r = await page.evaluate(() => ({
    cities: [...document.querySelectorAll('#weather .weather-city h3')].map(h => h.textContent),
    rows: document.querySelectorAll('#weather .weather-days li').length,
    now: document.querySelector('#weather .weather-now')?.textContent || null,
    day: document.getElementById('day-weather').textContent,
    updated: [...document.querySelectorAll('#weather p')].map(p => p.textContent).find(t => t.startsWith('Վերջին')),
    scroll: document.documentElement.scrollWidth - innerWidth,
  }));
  assert.deepEqual(r.cities, ['Փարիզ', 'Բարսելոնա', 'Հռոմ']);
  assert.equal(r.rows, 9);
  assert.match(r.now, /Հիմա՝ ⛅ 12°/);
  assert.match(r.day, /Անձրև · 7…18° · անձրև 70%/);
  assert.match(r.day, /09:00/);
  assert.ok(r.scroll <= 0, 'horizontal scroll');
  console.log('PASS', name, width, r.updated);
  if (width < 500) {
    await page.locator('#day-weather').screenshot({ path: `${out}/weather-day-${name}.png` });
    await page.locator('#weather-section').screenshot({ path: `${out}/weather-section-${name}.png` });
  }
  await ctx.close();
}
try {
  await run('live', { live: true, fallback: false }, 390);
  await run('fallback', { live: false, fallback: true }, 390);
  await run('live', { live: true, fallback: false }, 1400);
  assert.deepEqual(errors, []);
  console.log('PASS no JS errors');
} finally { await browser.close(); server.close(); }
