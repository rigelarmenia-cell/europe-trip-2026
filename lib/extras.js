// Bottom-of-page extras: rallies/strikes board (from alerts.json) and flight seat map (from trip.json).
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const list = value => Array.isArray(value) ? value : [];
const cityNames = { paris: 'Փարիզ', barcelona: 'Բարսելոնա', rome: 'Հռոմ' };

// Local trip date (all three cities share Central European time).
export function tripToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
function formatTime(iso) {
  const t = Date.parse(iso); if (!Number.isFinite(t)) return iso || '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(t)).map(x => [x.type, x.value]));
  return `${parts.day}.${parts.month} ${parts.hour}:${parts.minute}`;
}
// Cities whose trip days have not ended yet (a city disappears automatically once we have left it).
export function activeCities(trip, today = tripToday()) {
  const last = {};
  for (const day of list(trip?.days)) if (!last[day.city] || day.date > last[day.city]) last[day.city] = day.date;
  return list(trip?.cities).map(c => c.id).filter(id => last[id] && last[id] >= today);
}

export function renderRallies(node, alerts, trip, { now = Date.now(), today = tripToday(new Date(now)) } = {}) {
  node.replaceChildren();
  node.append(el('h2', '📣 Միտինգներ, գործադուլներ և մեծ միջոցառումներ'));
  node.append(el('p', 'Ստուգվում է ավտոմատ՝ ամեն ժամ 06:00–23:00 (Փարիզի ժամով)։ Այն քաղաքը, որտեղից արդեն մեկնել ենք, այստեղից ինքն է անհետանում։', 'fine'));
  if (!alerts) { node.append(el('p', 'Տվյալները դեռ չեն բեռնվել (պահանջում է ինտերնետ)։', 'muted')); return; }
  node.append(el('p', `Վերջին ստուգում՝ ${formatTime(alerts.updated_at)}`, 'muted'));
  const cities = activeCities(trip, today);
  const status = alerts.city_status && typeof alerts.city_status === 'object' ? alerts.city_status : {};
  for (const city of cities) {
    const box = el('div', undefined, 'rally-city');
    box.append(el('h3', cityNames[city] || city));
    const st = status[city];
    if (st && typeof st.summary_hy === 'string') box.append(el('p', st.summary_hy + (st.checked_at ? ` (${formatTime(st.checked_at)})` : '')));
    const items = list(alerts.alerts).filter(a => a.city === city && (a.until === null || Date.parse(a.until) > now) && (a.date === null || a.date >= today));
    if (!items.length) box.append(el('p', 'Մեր օրերի համար հայտարարված միտինգ կամ գործադուլ չի գտնվել։', 'muted'));
    const ul = el('ul', undefined, 'rally-list');
    for (const a of items) {
      const li = el('li', undefined, `rally-${a.level}`);
      const dm = a.date ? a.date.slice(8, 10) + '.' + a.date.slice(5, 7) : '';
      li.append(el('strong', (dm && !a.title_hy.includes(dm) ? dm + ' · ' : '') + a.title_hy));
      li.append(el('p', a.text_hy));
      if (a.suggestion_hy) li.append(el('p', '💡 ' + a.suggestion_hy, 'fine'));
      if (typeof a.source_url === 'string' && a.source_url.startsWith('https://')) {
        const link = el('a', 'Աղբյուր ↗'); link.href = a.source_url; link.target = '_blank'; link.rel = 'noopener noreferrer'; li.append(link);
      }
      ul.append(li);
    }
    if (items.length) box.append(ul);
    node.append(box);
  }
  if (!cities.length) node.append(el('p', 'Ճամփորդությունն ավարտված է։', 'muted'));
}

// Schematic cabin: 3+3 seats, aisle in the middle; our passengers highlighted with their names.
export function renderSeats(node, trip) {
  node.replaceChildren();
  const maps = list(trip?.seat_maps);
  if (!maps.length) { node.hidden = true; return; }
  node.hidden = false;
  node.append(el('h2', '💺 Ով որտեղ է նստած'));
  for (const m of maps) {
    const box = el('div', undefined, 'seat-flight');
    box.append(el('h3', `✈ ${m.flight} · ${m.route_hy} · ${m.date_hy}`));
    if (m.note_hy) box.append(el('p', m.note_hy, 'seat-note'));
    const seated = list(m.passengers).filter(p => /^\d{1,2}[A-F]$/.test(p.seat || ''));
    const bySeat = new Map(seated.map(p => [p.seat, p]));
    const rows = seated.map(p => parseInt(p.seat, 10));
    const from = Math.max(1, Math.min(...rows) - 2), to = Math.max(...rows) + 2;
    const cabin = el('div', undefined, 'cabin');
    cabin.append(el('div', '▲ Ինքնաթիռի քիթը', 'cabin-nose'));
    const head = el('div', undefined, 'seat-row seat-head');
    for (const c of ['A', 'B', 'C', '', 'D', 'E', 'F']) head.append(el('span', c, c ? 'seat-letter' : 'aisle'));
    cabin.append(head);
    for (let r = from; r <= to; r++) {
      const row = el('div', undefined, 'seat-row');
      for (const c of ['A', 'B', 'C', '', 'D', 'E', 'F']) {
        if (!c) { row.append(el('span', String(r), 'aisle')); continue; }
        const p = bySeat.get(`${r}${c}`);
        const seat = el('span', p ? p.name.split(' ').map(w => w[0]).join('') : '', p ? 'seat seat-ours' : 'seat');
        if (p) seat.title = `${p.name} · ${r}${c}`;
        row.append(seat);
      }
      cabin.append(row);
    }
    box.append(cabin);
    const ul = el('ul', undefined, 'seat-list');
    for (const p of list(m.passengers)) {
      const li = el('li'); li.append(el('strong', p.name), el('span', p.seat ? ` — ${p.seat}` : ` — ${p.seat_hy || 'նստատեղը՝ գրանցման սեղանում'}`));
      ul.append(li);
    }
    box.append(ul);
    if (m.aircraft_hy) box.append(el('p', m.aircraft_hy, 'fine'));
    node.append(box);
  }
}

// Nearest metro stations from an optional stations.json (OSM). Straight-line distance × 1.3 ≈ walking.
export function nearestStations(stations, city, lat, lon, count = 3) {
  const rad = Math.PI / 180;
  const dist = (a, b, c, d) => { const h = Math.sin((c - a) * rad / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin((d - b) * rad / 2) ** 2; return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h))); };
  return list(stations?.cities?.[city]).map(s => ({ ...s, m: dist(lat, lon, s.lat, s.lon) })).sort((a, b) => a.m - b.m).slice(0, count)
    .map(s => ({ ...s, walk_min: Math.max(1, Math.round(s.m * 1.3 / 80)) }));
}
