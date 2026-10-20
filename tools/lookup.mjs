// Build-time research helper (GitHub Actions): Commons photo search + Nominatim geocoding. Output JSON to argv[3].
import { writeFileSync } from 'node:fs';
const input = JSON.parse(process.argv[2] || '{}'), out = {};
const ua = { 'user-agent': 'khelarner-trip-pwa/0.8 (github.com/rigelarmenia-cell/europe-trip-2026)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const strip = s => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
for (const q of input.commons || []) {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  Object.entries({ action: 'query', generator: 'search', gsrsearch: q, gsrnamespace: '6', gsrlimit: '8', prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiextmetadatafilter: 'Artist|LicenseShortName', iiurlwidth: '1280', format: 'json' }).forEach(([k, v]) => u.searchParams.set(k, v));
  try { const j = await (await fetch(u, { headers: ua })).json();
    out['commons:' + q] = Object.values(j.query?.pages || {}).map(p => { const i = p.imageinfo?.[0] || {}; return { title: p.title, url: i.thumburl || i.url, orig: i.url, w: i.width, h: i.height, page: i.descriptionurl, author: strip(i.extmetadata?.Artist?.value), license: i.extmetadata?.LicenseShortName?.value }; });
  } catch (e) { out['commons:' + q] = String(e); }
  await sleep(3000);
}
for (const q of input.geocode || []) {
  const u = new URL('https://nominatim.openstreetmap.org/search'); u.searchParams.set('q', q); u.searchParams.set('format', 'jsonv2'); u.searchParams.set('limit', '3');
  try { out['geo:' + q] = (await (await fetch(u, { headers: ua })).json()).map(f => ({ name: f.display_name, lat: +f.lat, lon: +f.lon, osm: `${f.osm_type}/${f.osm_id}` })); } catch (e) { out['geo:' + q] = String(e); }
  await sleep(1100);
}
for (const u of input.head || []) { try { const r = await fetch(u, { headers: ua }); out['head:' + u] = [r.status, r.headers.get('content-type')]; } catch (e) { out['head:' + u] = String(e); } await sleep(4000); }
for (const q of input.overpass || []) { try { const r = await fetch('https://overpass.kumi.systems/api/interpreter', { method: 'POST', headers: { ...ua, 'content-type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) }); out['overpass:' + q.slice(0, 60)] = (await r.json()).elements.map(e => ({ name: e.tags?.name, brand: e.tags?.brand, shop: e.tags?.shop, hours: e.tags?.opening_hours, street: e.tags?.['addr:street'], num: e.tags?.['addr:housenumber'], lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon, osm: e.type + '/' + e.id })); } catch (e) { out['overpass:' + q.slice(0, 60)] = String(e); } }
writeFileSync(process.argv[3] || 'lookup.json', JSON.stringify(out, null, 1));
