// Usage: node tools/browser-smoke.mjs /absolute/path/to/node_modules
// Desktop Chromium checks; they are NOT physical Android/iPhone acceptance.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(resolve(process.argv[2], 'package.json'));
const { chromium } = require('playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, timezoneId: 'Asia/Yerevan' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const base = 'http://127.0.0.1:4173/travel/';
const output = { device: 'Desktop Microsoft Edge / Playwright', browser: browser.version(), platform: process.platform, checks: [] };
const pass = name => { output.checks.push({ name, status: 'PASS' }); console.log(`PASS ${name}`); };
try {
  await page.goto(base);
  await page.locator('.stop').first().waitFor();
  assert.equal(await page.locator('.stop').count(), 2);
  assert.equal(await page.locator('#demo-banner').isVisible(), true);
  const maps = new URL(await page.locator('.stop a.primary').first().getAttribute('href'));
  assert.equal(maps.searchParams.get('destination'), '48.85,2.35');
  assert.equal(maps.searchParams.get('travelmode'), 'walking');
  assert.equal(maps.searchParams.has('origin'), false);
  pass('Demo data renders; Google Maps uses the exact stop and current-position origin');
  assert.equal(await page.locator('.stop .navigation-mode').count(), 2);
  await page.locator('.stop .navigation-mode').first().selectOption('metro');
  assert.equal(new URL(await page.locator('.stop a.primary').first().getAttribute('href')).searchParams.get('travelmode'), 'transit');
  await page.locator('.stop .navigation-mode').first().selectOption('walk');
  assert.equal(new URL(await page.locator('.stop a.primary').first().getAttribute('href')).searchParams.get('travelmode'), 'walking');
  pass('Arrival navigation mode is visible and can be chosen independently of the outgoing leg');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  const manifest = await page.evaluate(async () => (await fetch('./manifest.webmanifest')).json());
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some(icon => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some(icon => icon.sizes === '512x512'));
  pass('Service worker controls /travel/ and install manifest uses a relative scope');
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/desktop.png', fullPage: true });

  for (const width of [320, 375, 800, 900, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `horizontal overflow at ${width}`);
  }
  await page.setViewportSize({ width: 375, height: 900 });
  await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
  await page.locator('#tab-map').click();
  assert.equal(await page.locator('#map-panel').isVisible(), true);
  await page.locator('#map-full').click();
  assert.equal(await page.locator('body').evaluate(el => el.classList.contains('map-full')), true);
  await page.goBack();
  assert.equal(await page.locator('body').evaluate(el => el.classList.contains('map-full')), false);
  assert.equal(await page.locator('#day').inputValue(), '2026-10-20');
  pass('320–1440px layouts do not overflow; full-map browser Back preserves the date');

  await page.locator('#tab-map').click();
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 48.851, longitude: 2.351, accuracy: 25 });
  await page.locator('#gps-open').click();
  await page.locator('#gps-confirm').click();
  await page.waitForFunction(() => document.getElementById('notice').textContent.includes('ճշտություն՝ մոտ 25 մ'));
  pass('Simulated GPS displays the provided accuracy, clearly as a single reading');

  const homes = { paris: 'Synthetic home for tests', barcelona: 'Synthetic home B', rome: 'Synthetic home C' };
  await page.goto(base + '#homes=' + encodeURIComponent(JSON.stringify(homes)));
  await page.locator('#home-actions a').first().waitFor();
  assert.equal(new URL(page.url()).hash, '');
  assert.equal(new URL(await page.locator('#home-actions a').first().getAttribute('href')).searchParams.get('destination'), homes.paris);
  await page.reload();
  await page.locator('#home-actions a').first().waitFor();
  pass('Synthetic private fragment is removed; home address persists after reload');

  const original = JSON.parse(await readFile('trip.json', 'utf8'));
  const next = structuredClone(original); next.version = '2026-10-17-2'; next.days[0].title_hy = 'Թարմացված փորձնական օր';
  const malformed = structuredClone(original); malformed.version = '2026-10-17-2'; malformed.days[0].notes_hy = 42;
  await context.route('**/trip.json', route => route.fulfill({ json: malformed }));
  await page.locator('#check-update').click();
  await page.waitForFunction(() => !document.getElementById('check-update').disabled);
  assert.equal(await page.locator('#update-banner').isVisible(), false);
  assert.equal(await page.locator('#day-title').textContent(), 'Փորձնական օր');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('champa:/travel/:trip')).version), original.version);
  await context.unroute('**/trip.json');
  pass('Malformed nested fields never become an update candidate or overwrite offline data');
  await context.route('**/trip.json', route => route.fulfill({ json: next }));
  await page.locator('#check-update').click();
  await page.locator('#update-banner').waitFor();
  assert.equal(await page.locator('#day-title').textContent(), 'Փորձնական օր');
  await page.locator('#apply-update').click();
  assert.equal(await page.locator('#day-title').textContent(), next.days[0].title_hy);
  assert.equal(new URL(await page.locator('#home-actions a').first().getAttribute('href')).searchParams.get('destination'), homes.paris);
  pass('New data waits for a click and preserves the saved private home');
  await context.unroute('**/trip.json');
  await context.route('**/trip.json', route => route.fulfill({ json: { version: 'bad', days: null } }));
  await page.locator('#check-update').click();
  await page.waitForFunction(() => document.getElementById('notice').textContent.includes('չհաջողվեց կարդալ'));
  assert.equal(await page.locator('#day-title').textContent(), next.days[0].title_hy);
  pass('Invalid new JSON keeps the last validated trip');
  await context.unroute('**/trip.json');

  await context.setOffline(true);
  await page.reload();
  await page.locator('.stop').first().waitFor();
  assert.equal(await page.locator('#day-title').textContent(), next.days[0].title_hy);
  await page.locator('.support-card').first().locator('summary').click();
  assert.match(await page.locator('#airports').textContent(), /սպասվում են/);
  assert.equal(await page.locator('#home-actions a').count(), 2);
  pass('Offline reload restores app shell, accepted text, airport empty state and home');
  await context.setOffline(false);

  const denied = await browser.newContext({ permissions: [], viewport: { width: 375, height: 850 } });
  const deniedPage = await denied.newPage();
  await deniedPage.goto(base);
  await deniedPage.locator('.stop').first().waitFor();
  await deniedPage.locator('#tab-map').click();
  await deniedPage.locator('#gps-open').click(); await deniedPage.locator('#gps-confirm').click();
  await deniedPage.waitForFunction(() => document.getElementById('notice').textContent.includes('մերժված'));
  assert.equal(await deniedPage.locator('.stop').count(), 2);
  assert.equal(await deniedPage.locator('#home-actions a').count(), 0);
  pass('GPS denial leaves the plan usable; a second browser has no first-browser home');
  await denied.close();

  const cacheRequests = await page.evaluate(async () => {
    const names = await caches.keys();
    return (await Promise.all(names.map(async name => (await (await caches.open(name)).keys()).map(r => r.url)))).flat();
  });
  assert.ok(cacheRequests.length > 10);
  assert.equal(cacheRequests.some(url => !url.startsWith(base)), false);
  assert.equal(cacheRequests.some(url => url.endsWith('trip.json')), false);
  assert.deepEqual(errors, []);
  pass('Cache contains only the local app shell; no tile/photo caching and no JS page errors');
  output.status = 'PASS';
} catch (error) {
  output.status = 'FAIL'; output.error = error.stack;
  output.diagnostic = await page.evaluate(() => ({ fragmentPresent: !!location.hash, homeLinkCount: document.querySelectorAll('#home-actions a').length, savedHomes: !!localStorage.getItem('champa:/travel/:homes'), notice: document.getElementById('notice')?.textContent, showMap: document.getElementById('workspace')?.classList.contains('show-map') })).catch(() => null);
  console.log(JSON.stringify(output.diagnostic)); throw error;
} finally {
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/browser-smoke.json', JSON.stringify(output, null, 2));
  await browser.close();
}
