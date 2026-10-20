// Walking distance from the (secret) home address to public shop addresses. The home address is read from env and NEVER printed.
import { writeFileSync } from 'node:fs';
const home = process.env.HOME_ADDR, shops = JSON.parse(process.argv[2] || '[]');
if (!home) throw Error('HOME_ADDR secret missing');
const ua = { 'user-agent': 'khelarner-trip-pwa/0.8 (github.com/rigelarmenia-cell/europe-trip-2026)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function geo(q) {
  const r = await fetch('https://api-adresse.data.gouv.fr/search/?limit=1&q=' + encodeURIComponent(q), { headers: ua });
  const f = (await r.json()).features?.[0]; if (!f) return null;
  return { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], score: f.properties.score, label: f.properties.label };
}
const h = await geo(home); if (!h) throw Error('home not geocoded');
const out = { home_score: Math.round(h.score * 100) / 100, shops: [] };
for (const s of shops) {
  const g = await geo(s); await sleep(300);
  if (!g) { out.shops.push({ shop: s, error: 'not geocoded' }); continue; }
  let m = null, min = null;
  try {
    const j = await (await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${h.lon},${h.lat};${g.lon},${g.lat}?overview=false`, { headers: ua })).json();
    m = Math.round(j.routes[0].distance); min = Math.round(j.routes[0].duration / 60);
  } catch { /* routing failed */ }
  out.shops.push({ shop: s, matched: g.label, score: Math.round(g.score * 100) / 100, walk_m: m, walk_min: min });
  await sleep(1100);
}
out.shops.sort((a, b) => (a.walk_m ?? 1e9) - (b.walk_m ?? 1e9));
writeFileSync(process.argv[3] || 'near-home.json', JSON.stringify(out, null, 1));
