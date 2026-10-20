import { coordinates, directions, localDate, localClock, parseHomes, safeUrl, validateTrip } from './lib/core.js';
import { createMap } from './lib/map.js';
import { orderedStops, dayRoutes, isSamsung, shortestOrder, applyShortest, undoShortest } from './lib/itinerary.js';
import { renderAirports } from './lib/airports.js';
import { money, distanceNumber } from './lib/format.js';
import {validatePaths, segments} from './lib/paths.js';
import {haversine} from './lib/itinerary.js';
import {validateAlerts, activeAlerts} from './lib/alerts.js';
import {renderRallies, renderSeats, nearestStations, renderWeather, weatherHoursText} from './lib/extras.js';
import {weatherUrl, normalizeWeather, validateWeather, dayLineHy, adviceHy} from './lib/weather.js';

const $ = id => document.getElementById(id);
const base = new URL('./', location.href);
const storagePrefix = `champa:${base.pathname}:`;
const demo = new URLSearchParams(location.search).get('demo') === '1';
const dataFile = demo ? 'demo-trip.json' : 'trip.json';
const storageKey = key => storagePrefix + (key === 'homes' && !demo ? '' : demo ? 'demo:' : 'real:') + key;
const state = { trip: null, cityId: null, dayDate: null, homes: {}, pending: null, map: null, install: null, registration: null, loading: false };
const list = value => Array.isArray(value) ? value : [];
const text = value => value === null || value === undefined || value === '' ? 'Սպասվում է' : String(value);
const element = (tag, value, className) => { const el = document.createElement(tag); if (value !== undefined) el.textContent = value; if (className) el.className = className; return el; };

function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
function read(key) { try { return JSON.parse(localStorage.getItem(storageKey(key))); } catch { return null; } }
function save(key, value) {
  try { localStorage.setItem(storageKey(key), JSON.stringify(value)); return true; }
  catch { notice('Հեռախոսի պահոցը հասանելի չէ կամ լիքն է։ Այս բացման ընթացքում ծրագիրն աշխատում է, բայց փակելուց հետո տվյալները կարող են չպահվել։'); return false; }
}
function link(label, href, className = 'action-link') {
  const safe = safeUrl(href);
  if (!safe) return element('span', `${label}՝ հղումը սպասվում է`, 'muted');
  const anchor = element('a', label, className); anchor.href = safe; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; return anchor;
}
function field(dl, label, value) { dl.append(element('dt', label), element('dd', text(value))); }
// Alerts are independent of the explicit trip update/acceptance flow.
state.alerts = null; state.alertsOnline = null; state.alertsLoading = false;
try { const cached = read('alerts'); if (cached) state.alerts = validateAlerts(cached); } catch { /* Ignore invalid cached alerts. */ }
state.dismissedAlerts = list(read('alerts-dismissed')).filter(id => typeof id === 'string');
const liveOnline = () => navigator.onLine && state.alertsOnline !== false;
const currentAlerts = () => state.alerts ? activeAlerts(state.alerts, {city:state.cityId,date:state.dayDate,dismissed:state.dismissedAlerts}) : [];
function affectedStops(alert) {
  if (!currentAlerts().some(item => item.id === alert.id)) return [];
  const ids = new Set(list(alert.stop_ids));
  return sortedStops(currentDay()).map((stop,index) => ({...stop,number:index+1})).filter(stop => ids.has(stop.id));
}
function alertCard(alert) {
  const card = element('article', undefined, `alert-card alert-${alert.level}`); card.dataset.alertId = alert.id;
  const close = element('button', '×', 'alert-dismiss'); close.type = 'button'; close.setAttribute('aria-label', 'Փակել զգուշացումը');
  close.onclick = () => { state.dismissedAlerts = [...new Set([...state.dismissedAlerts, alert.id])]; save('alerts-dismissed', state.dismissedAlerts); renderAlerts(); };
  card.append(close, element('strong', alert.title_hy), element('p', alert.text_hy));
  if (alert.suggestion_hy) card.append(element('p', `💡 Առաջարկ՝ ${alert.suggestion_hy}`, 'alert-suggestion'));
  const affected = affectedStops(alert);
  if (['danger','warning'].includes(alert.level) && affected.length) {
    card.append(element('p', `Վտանգավոր գոտում են. ${affected.map(stop => `${stop.number}. ${stop.name_hy || stop.name_local}`).join(', ')}`, 'alert-affected'));
    const skip = element('button', 'Բաց թողնել այս կանգառները', 'alert-skip');
    skip.onclick = () => {
      const stops = affectedStops(alert); if (!stops.length) return renderAlerts();
      updatePersonal(item => { item.statuses = {...item.statuses}; for (const stop of stops) item.statuses[stop.id] = 'skipped'; });
      notice(`${stops.length} կանգառ բաց թողնվեց. վերականգնելու համար սեղմեք կանգառի «Բաց ենք թողնում»-ը կամ «Վերականգնել օրվա սկզբնական պլանը»`);
    };
    card.append(skip);
  }
  if (alert.source_url && safeUrl(alert.source_url)) card.append(link('Աղբյուր ↗', alert.source_url));
  card.append(element('p', `Թարմացված՝ ${state.alerts.updated_at}`, 'fine'));
  if (!liveOnline()) card.append(element('p', 'Առանց ինտերնետի. ցույց է տրված վերջին հայտնի տարբերակը', 'alerts-offline'));
  return card;
}
function renderAlerts() {
  const options = {city:state.cityId,date:state.dayDate,dismissed:state.dismissedAlerts};
  const current = state.alerts ? activeAlerts(state.alerts, options) : [];
  const all = state.alerts ? activeAlerts(state.alerts, {...options, all:true}) : [];
  $('alerts-current').replaceChildren(...current.map(alertCard)); $('alerts-current').hidden = !current.some(a => a.level === 'danger'); // top shows only real danger; everything else lives in the ⚠ list
  $('alerts-count').hidden = !all.length; $('alerts-count').textContent = `⚠ ${all.length} զգուշացում`;
  $('alerts-count').setAttribute('aria-label', `Բոլոր զգուշացումները՝ ${all.length}`);
  $('alerts-all').replaceChildren(...all.map(alertCard));
  if (!all.length) $('alerts-all').append(element('p', 'Ակտիվ զգուշացումներ չկան։'));
  state.map?.alerts(current);
  if (state.trip) renderRallies($('rallies'), state.alerts, state.trip);
  for (const card of document.querySelectorAll('.stop')) {
    card.querySelectorAll('.stop-alert').forEach(node => node.remove());
    const heading = card.querySelector('.stop-title')?.parentElement;
    if (heading) for (const alert of current.filter(item => list(item.stop_ids).includes(card.dataset.id))) {
      heading.prepend(element('span', `⚠ Զգուշացում. ${alert.title_hy}`, 'stop-alert'));
    }
  }
}
function renderLiveLinks() {
  const node = $('live-links'); node.replaceChildren();
  const icons = {transit:'🚇', protests:'🚨', other:'↗'};
  for (const item of list(currentCity()?.live_links)) {
    const url = safeUrl(item.url); if (!url || !url.startsWith('https:') || !Object.hasOwn(icons,item.kind)) continue;
    const row = element('span', undefined, 'live-link'); row.append(link(`${icons[item.kind]} ${item.label_hy} ↗`, url));
    const note = element('span', 'պահանջում է ինտերնետ', 'requires-internet'); note.hidden = liveOnline(); row.append(note); node.append(row);
  }
  if (node.childElementCount) node.append(element('p', 'Բացվում է օպերատորի պաշտոնական էջը։ Գտեք մեր գիծը. եթե գրված է «normal / normale / servei normal»՝ ամեն ինչ կարգին է, եթե կա խափանում՝ ընտրեք այլ տրանսպորտ կամ տաքսի։', 'fine'));
  node.hidden = !node.childElementCount;
}
async function checkAlerts() {
  if (state.alertsLoading) return;
  state.alertsLoading = true;
  let reached = false;
  const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 10000);
  try {
    const response = await fetch(new URL('alerts.json', base), {cache:'no-store',signal:abort.signal});
    if (!response.ok) throw Error('alerts network');
    reached = true;
    const alerts = validateAlerts(await response.json());
    state.alerts = alerts; state.alertsOnline = true; save('alerts', alerts);
  } catch { state.alertsOnline = reached; /* Invalid JSON keeps the last valid feed, not a false network-loss claim. */ }
  finally { clearTimeout(timeout); state.alertsLoading = false; connection(); }
}
$('alerts-count').onclick = () => { renderAlerts(); $('alerts-dialog').showModal(); };
// 🌤 Weather: live from Open-Meteo on the phone; fallback weather.json (hourly GitHub Actions); offline: last saved.
state.weather = null; state.weatherOnline = null; state.weatherLoading = false;
try { const cachedWeather = read('weather'); if (cachedWeather) state.weather = validateWeather(cachedWeather); } catch { /* Ignore invalid cached weather. */ }
async function fetchJson(url) {
  const response = await fetch(url, {cache:'no-store', signal:AbortSignal.timeout(10000)});
  if (!response.ok) throw Error('weather network');
  return response.json();
}
async function checkWeather() {
  if (state.weatherLoading) return;
  state.weatherLoading = true;
  let fresh = null;
  try { fresh = validateWeather(normalizeWeather(await fetchJson(weatherUrl()))); }
  catch { try { fresh = validateWeather(await fetchJson(new URL('weather.json', base))); } catch { fresh = null; } }
  if (fresh && (!state.weather || Date.parse(fresh.updated_at) >= Date.parse(state.weather.updated_at))) { state.weather = fresh; save('weather', fresh); }
  state.weatherOnline = !!fresh; state.weatherLoading = false;
  renderWeatherAll();
}
function renderDayWeather() {
  const node = $('day-weather'); if (!node) return;
  const city = state.weather?.cities?.[state.cityId], date = state.dayDate;
  const day = list(city?.daily).find(x => x.date === date);
  node.replaceChildren();
  if (!state.trip || !date) { node.hidden = true; return; }
  node.hidden = false;
  if (!day) { node.append(element('span', state.weather ? '🌤 Այս օրվա կանխատեսումը դեռ չկա։' : '🌤 Եղանակը բեռնվում է…', 'muted')); return; }
  node.append(element('strong', dayLineHy(day)));
  const hrs = weatherHoursText(city, date); if (hrs) node.append(element('span', hrs, 'weather-hours'));
  const tip = adviceHy(day); if (tip) node.append(element('span', tip, 'weather-tip'));
}
function renderWeatherAll() {
  renderDayWeather();
  if (state.trip) renderWeather($('weather'), state.weather, state.trip, {online: state.weatherOnline !== false && navigator.onLine});
}
function currentCity() { return state.trip?.cities.find(city => city.id === state.cityId); }
function currentDay() { return state.trip?.days.find(day => day.city === state.cityId && day.date === state.dayDate); }
function personalDay() {
  const key = `${state.cityId}:${state.dayDate}`;
  const item = state.personal?.[key];
  return item && typeof item === 'object' && !Array.isArray(item) ? item : {};
}
// 💡 Day suggestions (trip.json days[].suggestions): one tap adds the place to the plan at the cheapest position.
function suggestionAdded(sug) { return customStops().some(s => s.suggestion_id === sug.id); }
function addSuggestion(sug) {
  const stop = { ...sug, id: `custom-${sug.id}`, custom: true, suggestion_id: sug.id, name_hy: `💡 ${sug.name_hy}`, to_next: undefined };
  updatePersonal(item => {
    const stops = sortedStops(currentDay()), ids = stops.map(s => s.id);
    const home = currentCity()?.home_station, pt = s => s && coordinates(s) ? {lat:s.lat, lon:s.lon} : null;
    let best = ids.length, cost = Infinity;
    for (let i = 1; i <= stops.length; i++) {
      const prev = pt(stops[i - 1]), next = pt(stops[i]) || pt(home);
      if (!prev) continue;
      const c = haversine(prev, stop) + (next ? haversine(stop, next) - haversine(prev, next) : 0);
      if (c < cost) { cost = c; best = i; }
    }
    const after = ids.indexOf(sug.insert_after); if (after >= 0) best = after + 1; // data can pin a better time slot (e.g. after dinner)
    item.custom = [...list(item.custom).filter(s => s.suggestion_id !== sug.id), stop];
    ids.splice(best, 0, stop.id); item.order = ids; delete item.order_before_shortest; delete item.food_moves;
  });
  notice(`Ավելացվեց՝ ${sug.name_hy}։ Տեսեք օրվա ցանկում և քարտեզին։`);
}
function removeSuggestion(sug) {
  updatePersonal(item => { item.custom = list(item.custom).filter(s => s.suggestion_id !== sug.id); if (Array.isArray(item.order)) item.order = item.order.filter(id => id !== `custom-${sug.id}`); delete item.order_before_shortest; delete item.food_moves; });
}
function renderSuggestions(day) {
  const box = $('suggestions'), out = $('suggest-list'); if (!box) return;
  const items = list(day?.suggestions).filter(s => s && typeof s.id === 'string' && coordinates(s));
  box.hidden = !items.length; out.replaceChildren();
  for (const sug of items) {
    const added = suggestionAdded(sug);
    const card = element('div', undefined, 'suggest-card' + (added ? ' suggest-added' : ''));
    const more = element('details'); const sum = element('summary'); sum.append(element('strong', sug.name_hy), element('span', sug.name_local || '', 'stop-local'));
    if (added) sum.append(element('span', '✓ պլանում է', 'stop-status'));
    more.append(sum);
    const body = element('div', undefined, 'stop-body');
    const photo = list(sug.photos).find(p => p && safeUrl(p.url));
    if (photo) { const fig = element('figure'), img = document.createElement('img'); img.src = photo.url; img.alt = sug.name_hy; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.onerror = () => fig.remove();
      const cap = element('figcaption', `${text(photo.author)} · ${text(photo.license)} `); if (safeUrl(photo.source_page)) cap.append(link('Աղբյուր', photo.source_page, '')); fig.append(img, cap); body.append(fig); }
    if (sug.why_hy) body.append(element('p', '⭐ ' + sug.why_hy));
    if (sug.description_hy) body.append(element('p', sug.description_hy));
    if (sug.how_hy) body.append(element('p', '🚶 ' + sug.how_hy, 'fine'));
    const dl = element('dl'); field(dl, 'Ժամեր', sug.hours_hy); field(dl, 'Գին', sug.price_hy); body.append(dl);
    for (const point of list(sug.photo_points)) body.append(element('p', `📷 ${point.name_hy || point.name_local}${point.what_hy ? ' — ' + point.what_hy : ''}`, 'fine'));
    body.append(element('span', sug.label || 'ՉՍՏՈՒԳՎԱԾ', 'badge'));
    for (const src of list(sug.sources).filter(u => safeUrl(u))) body.append(link('Աղբյուր ↗', src, 'fine-link'));
    const btn = element('button', added ? 'Հանել պլանից' : '✓ Այցելում ենք', added ? 'quiet' : 'primary');
    btn.dataset.suggestion = sug.id; btn.onclick = () => added ? removeSuggestion(sug) : addSuggestion(sug);
    more.append(body); card.append(more, btn); out.append(card);
  }
}
function customStops() { return list(personalDay().custom).filter(s => s && typeof s.id === 'string' && coordinates(s)); }
function withCustom(day) { return day ? { ...day, stops: [...day.stops, ...customStops()] } : day; }
function sortedStops(day) { return orderedStops(withCustom(day), personalDay()); }
function currentPaths() { let built = {}; try { built = validatePaths(state.paths||{},state.trip); } catch { built = {}; } return {...built, ...(state.livePaths||{})}; }
function renderPaths() {state.map?.routes(currentDay(),sortedStops(currentDay()),currentCity(),currentPaths(),personalDay().statuses); fetchLivePaths();}
// Changed or added legs: real street walking line from the public OSM foot router (online only, cached on this phone).
async function fetchLivePaths() {
  if (!liveOnline() || state.liveLoading || !currentDay()) return;
  const segs = segments(currentDay(), sortedStops(currentDay()), currentCity(), currentPaths(), personalDay().statuses).filter(s => s.kind === 'unknown');
  const todo = segs.filter(s => { const [a, b] = [s.points[0], s.points.at(-1)]; return haversine({lat:a[0],lon:a[1]},{lat:b[0],lon:b[1]}) < 2.5 && !(state.livePaths||{})[`${s.from}>${s.to}:live`] && !state.liveFailed?.has(s.from+'>'+s.to); });
  if (!todo.length) return;
  state.liveLoading = true; state.livePaths = state.livePaths || {}; state.liveFailed = state.liveFailed || new Set();
  try {
    for (const s of todo.slice(0, 6)) {
      const [a, b] = [s.points[0], s.points.at(-1)];
      try {
        const r = await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${a[1]},${a[0]};${b[1]},${b[0]}?overview=full&geometries=geojson`, { signal: AbortSignal.timeout(10000) });
        const j = await r.json(); if (j.code !== 'Ok') throw Error('no route');
        let pts = j.routes[0].geometry.coordinates.map(([lon, lat]) => [lat, lon]);
        if (pts.length > 200) pts = Array.from({length:200}, (_, i) => pts[Math.round(i * (pts.length - 1) / 199)]);
        state.livePaths[`${s.from}>${s.to}:live`] = pts;
      } catch { state.liveFailed.add(s.from+'>'+s.to); }
      await new Promise(r => setTimeout(r, 1100));
    }
    save('live-paths', state.livePaths);
  } finally { state.liveLoading = false; }
  state.map?.routes(currentDay(),sortedStops(currentDay()),currentCity(),currentPaths(),personalDay().statuses);
}
function renderPhotoPoints() {
  const stops=sortedStops(currentDay());
  const count=stops.filter(s=>s.kind==='sight').reduce((n,s)=>n+(s.photo_points||[]).length,0);
  $('photo-toggle').disabled=!count;$('photo-note').textContent=count?'':'Այս օրվա համար լուսանկարվելու կետեր չկան';
  state.map?.photoPoints(stops,personalDay().statuses,$('photo-toggle').checked);
}
function updatePersonal(change) {
  const day = currentDay(); if (!day) return;
  const expanded = new Set([...document.querySelectorAll('.stop[open]')].map(el => el.dataset.id));
  const item = personalDay(); change(item);
  state.personal[`${state.cityId}:${state.dayDate}`] = item;
  save('personal', state.personal); render();
  document.querySelectorAll('.stop').forEach(el => { el.open = expanded.has(el.dataset.id); });
}
const storedPersonal = read('personal');
state.personal = storedPersonal && typeof storedPersonal === 'object' && !Array.isArray(storedPersonal) ? storedPersonal : {};
function selected() { save('selection', { city: state.cityId, date: state.dayDate }); }

// No private address exists in shipped files. Read and clear the fragment before requesting tiles.
function importHomes() {
  const stored = read('homes');
  try { state.homes = stored ? parseHomes('#homes=' + encodeURIComponent(JSON.stringify(stored))) : {}; } catch { state.homes = {}; }
  if (!location.hash.startsWith('#homes=')) return;
  try {
    const imported = parseHomes(location.hash);
    state.homes = { ...state.homes, ...imported };
    const persisted = save('homes', state.homes);
    if (persisted) notice('Մասնավոր հասցեները պահվել են այս դիտարկչում։ «Տուն»-ը ստուգեք նաև գլխավոր էկրանից բացված ծրագրում։');
  } catch { notice('Մասնավոր հղումը վնասված է։ Խնդրեք խմբի կազմակերպչին նորից ուղարկել ամբողջ հղումը։'); }
  finally { history.replaceState(history.state, '', location.pathname + location.search); }
}
importHomes();
addEventListener('hashchange', () => {
  if (!location.hash.startsWith('#homes=')) return;
  importHomes();
  if (state.trip) renderHome(currentCity());
});

function offerToday() {
  const match = state.trip.days.find(day => day.date === localDate(state.trip.cities.find(city => city.id === day.city).timezone));
  if (!match) return false;
  state.cityId = match.city; state.dayDate = match.date; return true;
}
function applyTrip(trip, initial = false) {
  validateTrip(trip);
  const previous = { trip: state.trip, cityId: state.cityId, dayDate: state.dayDate };
  state.trip = trip;
  const remembered = initial ? read('selection') : { city: state.cityId, date: state.dayDate };
  if (initial) {
    if (!offerToday()) { state.cityId = remembered?.city; state.dayDate = remembered?.date; }
  }
  if (!trip.cities.some(city => city.id === state.cityId)) state.cityId = trip.cities[0]?.id ?? null;
  if (!trip.days.some(day => day.city === state.cityId && day.date === state.dayDate)) state.dayDate = trip.days.find(day => day.city === state.cityId)?.date ?? null;
  try { render(); }
  catch (error) {
    Object.assign(state, previous);
    if (state.trip) render();
    throw error;
  }
  save('trip', trip);
  selected();
}

function render() {
  const trip = state.trip, city = currentCity(), day = currentDay();
  $('demo-banner').hidden = !demo;
  $('version').textContent = `Տվյալներ՝ ${trip.version} · ${trip.generated_at}`;
  $('cities').replaceChildren(...trip.cities.map(item => {
    const button = element('button'); button.append(element('span', item.name_hy || item.id), element('small', item.name_local || ''));
    button.setAttribute('aria-pressed', String(item.id === state.cityId));
    button.onclick = () => { state.cityId = item.id; state.dayDate = trip.days.find(d => d.city === item.id)?.date ?? null; selected(); render(); };
    return button;
  }));
  const days = trip.days.filter(item => item.city === state.cityId);
  $('day').replaceChildren(...days.map(item => { const option = element('option', item.date + ' · ' + (item.title_hy || 'Օրվա պլան')); option.value = item.date; return option; }));
  $('day').disabled = days.length === 0;
  if (!days.length) $('day').append(element('option', 'Օրերի պլանը դեռ պատրաստվում է'));
  else $('day').value = state.dayDate;
  const stops = sortedStops(day);
  $('day-title').textContent = day?.title_hy || 'Օրերի պլանը դեռ պատրաստվում է';
  $('day-notes').textContent = day?.notes_hy || 'Ստուգված trip.json-ը ստանալուց հետո այստեղ կերևա օրվա ծրագիրը։';
  $('walk-total').textContent = day ? `Քայլք՝ ${day.total_walk_km == null ? 'չստուգված' : `${distanceNumber(day.total_walk_km)} կմ`}` : '';
  $('stop-count').textContent = `${stops.length} կանգառ`;
  $('stops').replaceChildren(...stops.map(renderStop));
  renderSuggestions(day);
  if (!stops.length) $('stops').append(element('p', 'Կանգառները դեռ պատրաստվում են', 'empty'));
  renderHome(city);
  renderAirports($('airports'), $('flights'), trip); renderTickets(city);
  renderLiveLinks();
  document.querySelectorAll('.requires-internet').forEach(node => { node.hidden = liveOnline(); });
  renderDayRoutes();
  state.map?.show(stops, day && !stops.length ? null : city?.home_station,personalDay().statuses);
  renderPaths();
  renderPhotoPoints();
  renderSafety();
  renderRallies($('rallies'), state.alerts, trip); renderSeats($('seats'), trip);
  renderWeatherAll();
  updateClock();
}

function renderStop(stop, index) {
  const card = element('details', undefined, 'stop'); card.dataset.kind = stop.kind; card.dataset.id = stop.id; card.open = index === 0;
  const status = personalDay().statuses?.[stop.id] || 'pending';
  card.dataset.status = status;
  const summary = element('summary');
  const heading = element('span'); heading.append(element('strong', stop.name_hy || 'Անանուն կանգառ', 'stop-title'), element('span', stop.name_local || '', 'stop-local'));
  summary.append(element('span', `${index + 1}${stop.kind === 'food' ? ' ·' : ''}`, 'stop-number'), heading);
  const body = element('div', undefined, 'stop-body');
  const controls = element('div', undefined, 'stop-controls');
  for (const [value, label] of [['visited', 'Այցելել ենք'], ['skipped', 'Բաց ենք թողնում']]) {
    const button = element('button', label); button.dataset.action = value; button.setAttribute('aria-pressed', String(status === value));
    button.onclick = () => updatePersonal(item => { item.statuses = { ...item.statuses, [stop.id]: status === value ? 'pending' : value }; }); controls.append(button);
  }
  for (const [shift, label] of [[-1, '↑ Վեր'], [1, '↓ Վար']]) {
    const button = element('button', label); button.dataset.action = shift < 0 ? 'up' : 'down';
    button.disabled = index + shift < 0 || index + shift >= sortedStops(currentDay()).length;
    button.onclick = () => updatePersonal(item => { const ids = sortedStops(currentDay()).map(s => s.id); [ids[index], ids[index + shift]] = [ids[index + shift], ids[index]]; item.order = ids; delete item.order_before_shortest;delete item.food_moves; });
    controls.append(button);
  }
  if (stop.custom) { const del = element('button', '🗑 Ջնջել այս տեղը'); del.dataset.action = 'delete'; del.onclick = () => updatePersonal(item => { item.custom = list(item.custom).filter(s => s.id !== stop.id); if (Array.isArray(item.order)) item.order = item.order.filter(id => id !== stop.id); delete item.order_before_shortest; delete item.food_moves; }); controls.append(del); }
  body.append(controls);
  if (status === 'visited' || status === 'skipped') heading.append(element('span', status === 'visited' ? '✓ Այցելել ենք' : '↷ Բաց ենք թողնում', 'stop-status'));
  const photos = list(stop.photos).filter(photo => photo && safeUrl(photo.url));
  if (!photos.length) body.append(element('div', 'Լուսանկար չկա', 'photo-placeholder'));
  for (const photo of photos) {
    const figure = element('figure'), img = document.createElement('img');
    img.src = photo.url; img.alt = stop.name_hy || stop.name_local || 'Կանգառ'; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
    img.onerror = () => img.replaceWith(element('div', 'Լուսանկարը չբեռնվեց', 'photo-placeholder'));
    const caption = element('figcaption', `${text(photo.author)} · ${text(photo.license)} `);
    if (safeUrl(photo.source_page)) caption.append(link('Լուսանկարի աղբյուրը', photo.source_page, ''));
    figure.append(img, caption); body.append(figure);
  }
  body.append(element('span', stop.label || 'ՉՍՏՈՒԳՎԱԾ', 'badge'));
  body.append(element('p', stop.description_hy || 'Նկարագրությունը սպասվում է։'));
  if (stop.photo_spot_hy) body.append(element('p', `Լուսանկարվելու կետ՝ ${stop.photo_spot_hy}`));
  if(stop.kind==='sight')for(const point of list(stop.photo_points)) {
    const row=element('div',undefined,'photo-point-row');row.append(element('span',`📷 ${point.name_hy||point.name_local}`));
    const show=element('button','Քարտեզին');show.dataset.photoId=point.id;
    show.onclick=()=>{$('photo-toggle').checked=true;renderPhotoPoints();setMapView(true);requestAnimationFrame(()=>state.map?.focusPhoto(point));};
    row.append(show);body.append(row);
  }
  const dl = element('dl');
  field(dl, 'Տևողություն', list(stop.visit_min).length === 2 && stop.visit_min.every(n => typeof n === 'number') ? `${stop.visit_min.join('–')} րոպե` : null);
  field(dl, 'Ժամեր', stop.hours_hy); field(dl, 'Գին', stop.price_hy); body.append(dl);
  if (stop.to_next) {
    const next = stop.to_next;
    const modes = { walk: 'Քայլք', metro: 'Մետրո', bus: 'Ավտոբուս', train: 'Գնացք', tram: 'Տրամվայ', taxi: 'Տաքսի' };
    const originalStops = orderedStops(currentDay());
    const originalNext = originalStops[originalStops.findIndex(item => item.id === stop.id) + 1];
    const details = element('details'); details.append(element('summary', `Սկզբնական պլանի հատված՝ դեպի ${originalNext?.name_hy || 'հաջորդ կանգառը'}`));
    details.append(element('p', 'Այս նկարագրությունը սկզբնական պլանից է։ Հերթականությունը կամ նշումները փոխելուց հետո օգտագործեք օրվա նոր Google Maps հղումները։', 'fine'));
    const info = element('dl'); field(info, 'Տրանսպորտ', modes[next.mode] || 'Սպասվում է');
    field(info, 'Ճանապարհ', next.km == null || next.min == null ? 'Չստուգված' : `${distanceNumber(next.km)} կմ · ${next.min} րոպե`);
    for (const [label, key] of [['Գիծ', 'line'], ['Գույն', 'color'], ['Ուղղություն', 'direction'], ['Իջնել', 'get_off'], ['Փոխատեղում', 'transfers_hy'], ['Տոմս', 'ticket_hy']]) if (next[key]) field(info, label, next[key]);
    details.append(info); body.append(details);
  }
  if (stop.kind === 'food') {
    if (stop.menu_prices_hy) body.append(element('p', stop.menu_prices_hy));
    if (stop.menu_url) body.append(link('Բացել մենյուն ↗', stop.menu_url));
  }
  if (stop.tickets_url) { body.append(link('🎟 Տոմս՝ պաշտոնական կայք ↗', stop.tickets_url)); body.append(element('p', 'Պլանով ներս չենք մտնում. հղումը՝ եթե որոշենք մտնել։', 'fine')); }
  const sources = element('div', undefined, 'source-links');
  list(stop.sources).filter(safeUrl).forEach((source, i) => sources.append(link(`Աղբյուր ${i + 1} ↗`, source, '')));
  if (stop.reviews_source) sources.append(link('Կարծիքների աղբյուրը ↗', stop.reviews_source, ''));
  body.append(sources);
  const actions = element('div', undefined, 'actions');
  if (coordinates(stop)) {
    const initialMode = stop.to_next?.mode || 'walk';
    const go = link('Գնալ այստեղ ↗', directions(coordinates(stop), initialMode), 'action-link primary');
    const modeLabel = element('label', 'Գնալ այստեղ՝ ', 'mode-label');
    const mode = element('select', undefined, 'navigation-mode');
    for (const [value, name] of [['walk', 'Քայլքով'], ['metro', 'Հանրային տրանսպորտով'], ['taxi', 'Մեքենայով']]) {
      const option = element('option', name); option.value = value; mode.append(option);
    }
    // Keep B4's prescribed default, but expose the choice: to_next describes the outgoing leg.
    mode.value = initialMode === 'walk' ? 'walk' : initialMode === 'taxi' ? 'taxi' : 'metro';
    mode.onchange = () => { go.href = directions(coordinates(stop), mode.value); };
    modeLabel.append(mode); body.append(modeLabel); actions.append(go);
    const show = element('button', 'Քարտեզին'); show.onclick = () => { setMapView(true); state.map?.focus(stop); }; actions.append(show);
  } else actions.append(element('p', 'Կոորդինատները սպասվում են․ այս կանգառի նավիգացիան դեռ հասանելի չէ։', 'muted'));
  body.append(actions); card.append(summary, body); return card;
}

function renderHome(city) {
  $('home-actions').replaceChildren();
  const address = state.homes[city?.id];
  const station = city?.home_station;
  const destination = address || coordinates(station) || (station?.name_local && `${station.name_local}, ${city.name_local || city.name_hy}`);
  const lines = (station?.lines || []).join(', ');
  $('home-note').textContent = 'Սեղմեք կոճակը. Google Maps-ը կվերցնի ձեր ՆԵՐԿԱ դիրքը և կառաջարկի ամենահարմար տրանսպորտը (մետրո, ավտոբուս) կամ մեքենայով ճանապարհը մինչև տուն։ ' + (address ? 'Ուղղությունը՝ տան հասցեն (պահված է միայն այս հեռախոսում)։' : `Ուղղությունը՝ տան մոտակա կայարանը${station?.name_local ? ` ${station.name_local}` : ''}${lines ? ` (${lines})` : ''}${station?.walk_from_home_min ? `, այնտեղից տուն ~${station.walk_from_home_min} ր քայլք` : ''}։`) + (!coordinates(station) && station?.name_local && !address ? ' Կայարանը որոնված է անունով։' : '');
  if (destination) {
    $('home-actions').append(link('🏠 Տուն՝ իմ տեղից, տրանսպորտով ↗', directions(destination, 'metro')), link('🚕 Տուն՝ մեքենայով ↗', directions(destination, 'taxi')));
  } else $('home-note').textContent = 'Մասնավոր հասցեն դեռ բացված չէ, իսկ մոտակա կայարանի տվյալները սպասվում են։ Իրական մասնավոր հղումը ստանալուց հետո բացեք այն այս հեռախոսում։';
}

function renderTickets(city) {
  $('tickets').replaceChildren(element('p', city?.tickets?.summary_hy || 'Տոմսերի ստուգված տվյալները սպասվում են։', 'pre-line'));
  for (const option of list(city?.tickets?.options)) {
    if (!option) continue;
    const article = element('article'); article.append(element('h3', text(option.name)), element('p', `${money(option.price_eur)} · ${option.label || 'ՉՍՏՈՒԳՎԱԾ'}`), element('p', text(option.where_to_buy_hy)), element('p', text(option.how_to_use_hy)));
    if (option.source) article.append(link('Աղբյուրը', option.source)); $('tickets').append(article);
  }
  $('questions').replaceChildren(...state.trip.open_questions_hy.map(question => element('li', text(question))));
}

function renderDayRoutes() {
  const day = currentDay(); $('day-actions').hidden = !day; if (!day) return;
  $('undo-shortest').hidden=!Array.isArray(personalDay().order_before_shortest);
  $('food-warning').replaceChildren();
  for(const move of personalDay().food_moves||[])$('food-warning').append(element('p',`⚠ Սննդի կանգառի տեղը փոխվեց. ${move.name}՝ ${move.from} → ${move.to}։ Ստուգեք ճաշի ժամը և բացման ժամերը (${move.hours||'ժամերը նշված չեն'}). ծրագիրը ժամեր չի հաշվում`));
  $('food-warning').hidden=!$('food-warning').childElementCount;
}
function renderSafety() {
  const zones = currentCity()?.safety_zones || [];
  $('safety-note').textContent = zones.length ? `${zones.length} մոտավոր զգուշության գոտի․ անվտանգություն չի երաշխավորվում` : 'Զգուշության գոտիների տվյալները սպասվում են';
  state.map?.safety(zones, $('safety-toggle').checked);
}
$('safety-toggle').onchange = renderSafety;
$('photo-toggle').onchange = renderPhotoPoints;
const replacePersonal=(item,next)=>{for(const key of Object.keys(item))delete item[key];Object.assign(item,next);};
async function walkingDistance(stops) {
  // Real street walking distances (OSM foot router) for the pending stops; null when offline or unavailable.
  const pts = stops.filter(s => coordinates(s)); if (!liveOnline() || pts.length < 2 || pts.length > 60) return null;
  try {
    const r = await fetch(`https://routing.openstreetmap.de/routed-foot/table/v1/driving/${pts.map(s => `${s.lon},${s.lat}`).join(';')}?annotations=distance`, { signal: AbortSignal.timeout(12000) });
    const j = await r.json(); if (j.code !== 'Ok') return null;
    const idx = new Map(pts.map((s, i) => [`${s.lat},${s.lon}`, i]));
    return (a, b) => { const i = idx.get(`${a.lat},${a.lon}`), k = idx.get(`${b.lat},${b.lon}`); const v = i == null || k == null ? null : j.distances[i][k]; return v == null ? haversine(a, b) * 1.3 : v / 1000; };
  } catch { return null; }
}
$('shortest-order').onclick=async()=>{
  const stops=sortedStops(currentDay());$('shortest-order').disabled=true;
  const dist=await walkingDistance(stops);$('shortest-order').disabled=false;
  const result=shortestOrder(stops,personalDay().statuses,dist||((a,b)=>haversine(a,b)*1.3));
  if(!result.improved){notice('Ավելի կարճ հերթականություն չգտնվեց. ներկայիս հերթականությունն արդեն ամենակարճն է');return;}
  updatePersonal(item=>replacePersonal(item,applyShortest(item,result,stops.map(s=>s.id))));
  notice(`${dist?'Իրական քայլքով (OSM)':'Առանց ինտերնետի՝ մոտավոր'}՝ ${distanceNumber(result.beforeKm.toFixed(1))} կմ → ${distanceNumber(result.afterKm.toFixed(1))} կմ։ Գծերը քարտեզին թարմացվում են։`);
};
$('undo-shortest').onclick=()=>{
  updatePersonal(item=>replacePersonal(item,undoShortest(item)));
  notice('Նախորդ հերթականությունը վերականգնվել է։');
};
$('reset-day').onclick = () => {
  const day = currentDay(); if (!day) return;
  const keep = list(personalDay().custom); delete state.personal[`${state.cityId}:${state.dayDate}`];
  if (keep.length) state.personal[`${state.cityId}:${state.dayDate}`] = { custom: keep };
  save('personal', state.personal); render();
  notice('Օրվա սկզբնական հերթականությունն ու նշումները վերականգնվել են։');
};

function updateClock() {
  const city = currentCity();
  $('city-time').textContent = city ? `Քաղաքում հիմա՝ ${localDate(city.timezone)} · ${localClock(city.timezone)} (${city.timezone})` : '';
  renderAlerts();
}
function setMapView(show) {
  $('workspace').classList.toggle('show-map', show);
  $('tab-map').setAttribute('aria-pressed', String(show)); $('tab-plan').setAttribute('aria-pressed', String(!show));
  requestAnimationFrame(() => { state.map?.resize(); if (show) $('map-panel').scrollIntoView({ block: 'start' }); });
}
function closeFullMap() {
  document.body.classList.remove('map-full'); setMapView(false);
  requestAnimationFrame(() => state.map?.resize());
}
$('day').onchange = event => { state.dayDate = event.target.value; selected(); render(); };
$('today').onclick = () => {
  if (!state.trip) return notice('Տվյալները դեռ չեն բեռնվել։ Փորձեք նորից ինտերնետով։');
  if (!offerToday()) return notice('Քաղաքների տեղական այսօրվա ամսաթվի համար պլան չկա։ Ընտրեք հասանելի օրերից մեկը։');
  selected(); render();
};
$('tab-plan').onclick = () => setMapView(false);
$('tab-map').onclick = () => { setMapView(true); state.map?.fit(); };
$('map-full').onclick = () => {
  history.pushState({ travelMap: true }, '', location.href);
  document.body.classList.add('map-full'); setMapView(true); requestAnimationFrame(() => state.map?.resize());
};
$('map-back').onclick = () => { if (history.state?.travelMap) history.back(); else closeFullMap(); };
addEventListener('popstate', closeFullMap);
addEventListener('keydown', event => { if (event.key === 'Escape' && document.body.classList.contains('map-full')) $('map-back').click(); });
$('help-open').onclick = () => $('help-dialog').showModal();
document.querySelectorAll('a[href="#airport-page"]').forEach(a => a.addEventListener('click', () => { $('airport-page').open = true; }));
if (location.hash === '#airport-page') $('airport-page').open = true;
$('gps-open').onclick = () => $('gps-dialog').showModal();
$('gps-confirm').onclick = () => {
  if (!navigator.geolocation) { notice('Դիտարկիչը դիրքի որոշում չի տրամադրում։ Պլանը կարող եք օգտագործել առանց դիրքի։'); return; }
  $('gps-open').disabled = true; $('gps-open').textContent = 'Դիրքը որոշվում է…';
  navigator.geolocation.getCurrentPosition(position => {
    $('gps-open').disabled = false; $('gps-open').textContent = '◎ Թարմացնել դիրքը';
    state.map?.position(position); setMapView(true);
    notice(`Դիրքը ստացվել է ${new Date(position.timestamp).toLocaleTimeString('hy-AM')} · ճշտություն՝ մոտ ${Math.round(position.coords.accuracy)} մ։ Սա մեկ չափում է․ շարժվելուց հետո սեղմեք «Թարմացնել դիրքը»։`);
  }, error => {
    $('gps-open').disabled = false; $('gps-open').textContent = '◎ Իմ դիրքը'; state.map?.clearPosition();
    notice(error.code === 1 ? 'Դիրքի թույլտվությունը մերժված է։ Պլանն աշխատում է առանց դիրքի։ Կրկին թույլատրելու համար բացեք կայքի թույլտվությունները։' : 'Դիրքը չի որոշվել։ Փորձեք բաց տարածքում կամ շարունակեք առանց դիրքի։');
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
};

const cityBoxes = { paris: [2.22, 48.92, 2.47, 48.80], barcelona: [2.06, 41.47, 2.23, 41.32], rome: [12.40, 41.98, 12.62, 41.80] };
$('add-place-form').onsubmit = async event => {
  event.preventDefault();
  const q = $('add-place-q').value.trim(), out = $('add-place-results'); if (!q) return;
  if (!liveOnline()) { out.replaceChildren(element('p', 'Որոնումը պահանջում է ինտերնետ։', 'fine')); return; }
  out.replaceChildren(element('p', 'Որոնվում է…', 'muted'));
  try {
    const box = cityBoxes[state.cityId] || null;
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', q); url.searchParams.set('format', 'jsonv2'); url.searchParams.set('limit', '5'); url.searchParams.set('accept-language', 'hy,en');
    if (box) { url.searchParams.set('viewbox', box.join(',')); url.searchParams.set('bounded', '1'); }
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) }); const found = await r.json();
    if (!Array.isArray(found) || !found.length) { out.replaceChildren(element('p', 'Այս քաղաքում չգտնվեց. փորձեք այլ անուն կամ հասցե։')); return; }
    const ul = element('ul', undefined, 'place-results');
    for (const f of found) {
      const li = element('li'); li.append(element('span', f.display_name));
      const add = element('button', '＋ Ավելացնել', 'primary');
      add.onclick = () => {
        const name = (f.name || f.display_name.split(',')[0]).trim();
        const stop = { id: `custom-${Date.now()}`, kind: 'sight', custom: true, name_hy: `＋ ${name}`, name_local: f.display_name, lat: Number(f.lat), lon: Number(f.lon), description_hy: 'Այս տեղը ավելացրել ենք մենք (պահված է միայն այս հեռախոսում)։', label: 'ԱՂԲՅՈՒՐՈՎ ՀԱՂՈՐԴՎԱԾ', sources: [`https://www.openstreetmap.org/${f.osm_type}/${f.osm_id}`] };
        updatePersonal(item => {
          const ids = sortedStops(currentDay()).map(s => s.id); item.custom = [...list(item.custom), stop];
          const lastFixed = sortedStops(currentDay()).at(-1); const at = lastFixed && ['home','food','transport','airport'].includes(lastFixed.kind) ? ids.length - 1 : ids.length;
          ids.splice(at, 0, stop.id); item.order = ids; delete item.order_before_shortest; delete item.food_moves;
        });
        out.replaceChildren(element('p', `Ավելացվեց՝ ${name}։ Սեղմեք «Դասավորել ամենակարճ ճանապարհով»։`, 'fine')); $('add-place-q').value = '';
      };
      li.append(add); ul.append(li);
    }
    out.replaceChildren(element('p', 'Ընտրեք ճիշտ տեղը (աղբյուր՝ OpenStreetMap Nominatim)։', 'fine'), ul);
  } catch { out.replaceChildren(element('p', 'Որոնումը չհաջողվեց. փորձեք մի փոքր ուշ։')); }
};
$('lost-find').onclick = () => {
  const out = $('lost-result'); out.replaceChildren(element('p', 'Դիրքը որոշվում է…', 'muted'));
  if (!navigator.geolocation) { out.replaceChildren(element('p', 'Այս սարքում դիրքը հասանելի չէ։')); return; }
  navigator.geolocation.getCurrentPosition(async position => {
    const lat = position.coords.latitude, lon = position.coords.longitude, here = `${lat.toFixed(6)},${lon.toFixed(6)}`;
    const day = currentDay(), statuses = personalDay().statuses || {};
    const next = sortedStops(day).find(stop => !['visited', 'skipped'].includes(statuses[stop.id]) && coordinates(stop));
    out.replaceChildren(element('p', `Դիրքը՝ ճշտությամբ ~${Math.round(position.coords.accuracy)} մ։`, 'fine'));
    let stations = state.stations;
    if (!stations) { try { const r = await fetch(new URL('stations.json', base), { signal: AbortSignal.timeout(8000) }); if (r.ok) stations = state.stations = await r.json(); } catch { /* offline */ } }
    const near = nearestStations(stations, state.cityId, lat, lon);
    if (near.length) {
      const ul = element('ul', undefined, 'lost-stations');
      for (const s of near) ul.append(element('li', `🚇 ${s.name} — ${s.lines.map(l => state.cityId === 'paris' && /^\d/.test(l.ref) ? 'M' + l.ref : state.cityId === 'rome' && /^[A-C]1?$/.test(l.ref) ? 'Metro ' + l.ref : l.ref).join(', ')} · ~${s.walk_min} ր ոտքով (${Math.round(s.m)} մ ուղիղ գծով)`));
      out.append(element('p', 'Մոտակա կայարանները.'), ul);
    } else out.append(element('p', 'Կայարանների ցանկը հասանելի չէ (պահանջում է ինտերնետ). օգտվեք ստորևի հղումից։', 'fine'));
    const go = (mode) => { const url = new URL(directions(coordinates(next), mode)); url.searchParams.set('origin', here); return url.href; };
    const actions = element('div', undefined, 'actions');
    if (next) {
      const num = sortedStops(day).indexOf(next) + 1;
      actions.append(link(`🚇 Տրանսպորտով դեպի ${num}. ${next.name_hy || next.name_local} ↗`, go('metro'), 'action-link primary'), link('🚶 Ոտքով ↗', go('walk')), link('🚕 Մեքենայով ↗', go('taxi')));
    } else out.append(element('p', 'Այսօրվա բոլոր կանգառները նշված են որպես այցելած. տուն գնալու համար՝ «Վերադարձ դեպի տուն»։'));
    out.append(actions);
  }, () => out.replaceChildren(element('p', 'Դիրքը չորոշվեց կամ թույլտվությունը մերժված է։ Կարող եք բացել Google Maps-ը «Գնալ այստեղ» կոճակով կանգառի քարտից։')), { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
};

async function checkData(manual = false) {
  if (state.loading) return;
  state.loading = true; $('check-update').disabled = true;
  const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 10000);
  try {
    const response = await fetch(new URL(dataFile, base), { cache: 'no-store', signal: abort.signal });
    if (!response.ok) throw new Error('network');
    const trip = validateTrip(await response.json());
    if (!state.trip) {applyTrip(trip, true);checkPaths();}
    else if (JSON.stringify(trip) !== JSON.stringify(state.trip)) { state.pending = trip; $('update-banner').hidden = false; }
    else { state.pending = null; $('update-banner').hidden = true; checkPaths(); if (manual) notice('Ստուգվեց․ տվյալների նոր տարբերակ չկա։'); }
  } catch {
    if (!state.trip) { $('day-title').textContent = 'Տվյալները չեն բեռնվել'; $('day-notes').textContent = 'Ստուգեք ինտերնետը և սեղմեք «Ստուգել տվյալների թարմացումը»։ Առաջին բացումը պետք է լինի ինտերնետով։'; }
    if (manual || !state.trip) notice('Նոր trip.json-ը չհաջողվեց կարդալ․ կապը բացակայում է կամ ֆայլը վավեր չէ։ Պահված վավեր տվյալները չեն փոխարինվել։');
  } finally { clearTimeout(timeout); state.loading = false; $('check-update').disabled = false; }
}
$('check-update').onclick = () => checkData(true);
async function checkPaths() {
  if(!state.trip)return;
  const trip=state.trip;
  try {
    const response=await fetch(new URL('paths.json',base),{cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(state.trip!==trip)return;
    let paths={};
    if(response.ok){try{paths=validatePaths(await response.json(),trip);}catch{paths={};}}
    if(state.trip!==trip)return;
    state.paths=paths;save('paths',paths);renderPaths();
  }catch { /* Offline: keep previously validated local geometry. */ }
}
$('apply-update').onclick = () => {
  if (!state.pending) return;
  try { applyTrip(state.pending); state.pending = null; checkPaths(); $('update-banner').hidden = true; notice('Տվյալները թարմացվել են։ Մասնավոր հասցեները պահպանվել են։'); }
  catch { notice('Նոր տվյալների ցուցադրումը չհաջողվեց։ Վերջին վավեր տարբերակը պահպանվել է։'); }
};
function connection() {
  document.body.classList.toggle('offline', !liveOnline());
  $('connection').textContent = liveOnline() ? 'Ցանցը հասանելի է' : 'Առանց ինտերնետի';
  if (!liveOnline()) $('map-message').textContent = 'Առանց ինտերնետի․ քարտեզի նոր հատվածները չեն բեռնվի։';
  else if ($('map-message').textContent.startsWith('Առանց ինտերնետի')) $('map-message').textContent = '';
  renderAlerts(); renderLiveLinks();
  document.querySelectorAll('.requires-internet').forEach(node => { node.hidden = liveOnline(); });
}
addEventListener('online', () => { connection(); checkData(); checkAlerts(); checkWeather(); });
addEventListener('offline', connection);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkData(); checkAlerts(); renderAlerts(); if (!state.weather || Date.now() - Date.parse(state.weather.updated_at) > 30 * 60 * 1000) checkWeather(); state.registration?.update().catch(() => {}); } });
addEventListener('beforeinstallprompt', event => { event.preventDefault(); state.install = event; $('install').hidden = false; });
$('install').onclick = async () => { if (!state.install) return; await state.install.prompt(); state.install = null; $('install').hidden = true; };
addEventListener('appinstalled', () => { state.install = null; $('install').hidden = true; });

async function registerWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) { $('offline-state').textContent = 'Առանց ինտերնետի բացվելը հասանելի չէ․ բացեք HTTPS GitHub Pages հասցեն։'; return; }
  try {
    const registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
    state.registration = registration;
    // New app version: activate automatically so every phone gets fixes without pressing a button.
    const offer = () => { if (registration.waiting && navigator.serviceWorker.controller) { $('shell-update').hidden = false; registration.waiting.postMessage({ type: 'ACTIVATE' }); } };
    offer(); registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      installing?.addEventListener('statechange', () => { if (installing.state === 'installed') offer(); });
    });
    $('apply-shell').onclick = () => registration.waiting?.postMessage({ type: 'ACTIVATE' });
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!$('shell-update').hidden && !refreshing) { refreshing = true; location.reload(); }
    });
    await navigator.serviceWorker.ready;
    $('offline-state').textContent = 'Ծրագրի ֆայլերը պահված են։ Պլանի տեքստը հասանելի կլինի առանց ինտերնետի՝ տվյալների հաջող բեռնումից հետո։';
  } catch { $('offline-state').textContent = 'Ծրագրի ֆայլերի պահումը չհաջողվեց։ Վերաբացեք ինտերնետով և ստուգեք պահոցի հասանելիությունը։'; }
}

$('browser-note').hidden = !isSamsung(navigator.userAgent);
connection();
state.map = createMap($('map'), message => { $('map-message').textContent = message; });
new ResizeObserver(() => state.map?.resize()).observe($('map-panel'));
const cached = read('trip');
state.paths=read('paths')||{};
state.livePaths=read('live-paths')||{};
if (cached) { try { applyTrip(validateTrip(cached), true); } catch { notice('Պահված տվյալները վնասված են․ փորձում ենք նորից բեռնել։'); } }
checkData(); checkAlerts(); checkWeather(); registerWorker();
setInterval(updateClock, 30000);
setInterval(() => { if (!document.hidden) checkAlerts(); }, 5 * 60 * 1000);
setInterval(() => { if (!document.hidden) checkWeather(); }, 60 * 60 * 1000);
