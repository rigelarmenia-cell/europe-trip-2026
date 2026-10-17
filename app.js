import { coordinates, directions, localDate, localClock, parseHomes, safeUrl, validateTrip } from './lib/core.js';
import { createMap } from './lib/map.js';

const $ = id => document.getElementById(id);
const base = new URL('./', location.href);
const storagePrefix = `champa:${base.pathname}:`;
const state = { trip: null, cityId: null, dayDate: null, homes: {}, pending: null, map: null, install: null, registration: null, loading: false };
const list = value => Array.isArray(value) ? value : [];
const text = value => value === null || value === undefined || value === '' ? 'Սպասվում է' : String(value);
const element = (tag, value, className) => { const el = document.createElement(tag); if (value !== undefined) el.textContent = value; if (className) el.className = className; return el; };

function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
function read(key) { try { return JSON.parse(localStorage.getItem(storagePrefix + key)); } catch { return null; } }
function save(key, value) {
  try { localStorage.setItem(storagePrefix + key, JSON.stringify(value)); return true; }
  catch { notice('Հեռախոսի պահոցը հասանելի չէ կամ լիքն է։ Այս բացման ընթացքում ծրագիրն աշխատում է, բայց փակելուց հետո տվյալները կարող են չպահվել։'); return false; }
}
function link(label, href, className = 'action-link') {
  const safe = safeUrl(href);
  if (!safe) return element('span', `${label}՝ հղումը սպասվում է`, 'muted');
  const anchor = element('a', label, className); anchor.href = safe; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; return anchor;
}
function field(dl, label, value) { dl.append(element('dt', label), element('dd', text(value))); }
function currentCity() { return state.trip?.cities.find(city => city.id === state.cityId); }
function currentDay() { return state.trip?.days.find(day => day.city === state.cityId && day.date === state.dayDate); }
function sortedStops(day) { return list(day?.stops).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); }
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
  $('demo-banner').hidden = !trip.days.some(item => item.notes_hy?.includes('ՓՈՐՁՆԱԿԱՆ ՏՎՅԱԼ'));
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
  if (!days.length) $('day').append(element('option', 'Օրերի տվյալները սպասվում են'));
  else $('day').value = state.dayDate;
  const stops = sortedStops(day);
  $('day-title').textContent = day?.title_hy || 'Օրվա պլանը սպասվում է';
  $('day-notes').textContent = day?.notes_hy || 'Ստուգված trip.json-ը ստանալուց հետո այստեղ կերևա օրվա ծրագիրը։';
  $('walk-total').textContent = day ? `Քայլք՝ ${day.total_walk_km == null ? 'չստուգված' : `${day.total_walk_km} կմ`}` : '';
  $('stop-count').textContent = `${stops.length} կանգառ`;
  $('stops').replaceChildren(...stops.map(renderStop));
  if (!stops.length) $('stops').append(element('p', 'Այս օրվա կանգառները դեռ չեն տրամադրվել։ Կարող եք ընտրել այլ քաղաք կամ ստուգել տվյալների թարմացումը։', 'empty'));
  renderHome(city);
  renderAirport(); renderTickets(city);
  state.map?.show(stops, city?.home_station);
  updateClock();
}

function renderStop(stop, index) {
  const card = element('details', undefined, 'stop'); card.dataset.kind = stop.kind; card.open = index === 0;
  const summary = element('summary');
  const heading = element('span'); heading.append(element('strong', stop.name_hy || 'Անանուն կանգառ', 'stop-title'), element('span', stop.name_local || '', 'stop-local'));
  summary.append(element('span', `${index + 1}${stop.kind === 'food' ? ' ·' : ''}`, 'stop-number'), heading);
  const body = element('div', undefined, 'stop-body');
  const photos = list(stop.photos).filter(photo => photo && safeUrl(photo.url));
  if (!photos.length) body.append(element('div', 'Լուսանկար չկա', 'photo-placeholder'));
  for (const photo of photos) {
    const figure = element('figure'), img = document.createElement('img');
    img.src = photo.url; img.alt = stop.name_hy || stop.name_local || 'Կանգառ'; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer';
    img.onerror = () => img.replaceWith(element('div', 'Լուսանկարը չի բեռնվել։ Ստուգեք ինտերնետը։', 'photo-placeholder'));
    const caption = element('figcaption', `${text(photo.author)} · ${text(photo.license)} `);
    if (safeUrl(photo.source_page)) caption.append(link('Լուսանկարի աղբյուրը', photo.source_page, ''));
    figure.append(img, caption); body.append(figure);
  }
  body.append(element('span', stop.label || 'ՉՍՏՈՒԳՎԱԾ', 'badge'));
  body.append(element('p', stop.description_hy || 'Նկարագրությունը սպասվում է։'));
  if (stop.photo_spot_hy) body.append(element('p', `Լուսանկարվելու կետ՝ ${stop.photo_spot_hy}`));
  const dl = element('dl');
  field(dl, 'Տևողություն', list(stop.visit_min).length === 2 && stop.visit_min.every(n => typeof n === 'number') ? `${stop.visit_min.join('–')} րոպե` : null);
  field(dl, 'Ժամեր', stop.hours_hy); field(dl, 'Գին', stop.price_hy); body.append(dl);
  if (stop.to_next) {
    const next = stop.to_next;
    const modes = { walk: 'Քայլք', metro: 'Մետրո', bus: 'Ավտոբուս', train: 'Գնացք', tram: 'Տրամվայ', taxi: 'Տաքսի' };
    const details = element('details'); details.append(element('summary', 'Դեպի հաջորդ կանգառը'));
    const info = element('dl'); field(info, 'Տրանսպորտ', modes[next.mode] || 'Սպասվում է');
    field(info, 'Ճանապարհ', next.km == null || next.min == null ? 'Չստուգված' : `${next.km} կմ · ${next.min} րոպե`);
    for (const [label, key] of [['Գիծ', 'line'], ['Գույն', 'color'], ['Ուղղություն', 'direction'], ['Իջնել', 'get_off'], ['Փոխատեղում', 'transfers_hy'], ['Տոմս', 'ticket_hy']]) if (next[key]) field(info, label, next[key]);
    details.append(info); body.append(details);
  }
  if (stop.kind === 'food') {
    if (stop.menu_prices_hy) body.append(element('p', stop.menu_prices_hy));
    if (stop.menu_url) body.append(link('Բացել մենյուն ↗', stop.menu_url));
  }
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
    const show = element('button', 'Քարտեզին'); show.onclick = () => { setMapView(true); state.map?.show([stop], null); }; actions.append(show);
  } else actions.append(element('p', 'Կոորդինատները սպասվում են․ այս կանգառի նավիգացիան դեռ հասանելի չէ։', 'muted'));
  body.append(actions); card.append(summary, body); return card;
}

function renderHome(city) {
  $('home-actions').replaceChildren();
  const address = state.homes[city?.id];
  const station = city?.home_station;
  const destination = address || coordinates(station) || (station?.name_local && `${station.name_local}, ${city.name_local || city.name_hy}`);
  $('home-note').textContent = address ? 'Մասնավոր հասցեն պահված է այս դիտարկչում։ «Տուն»-ը բացելիս այն փոխանցվում է Google Maps-ին։' : 'Հասցեն մուտքագրված չէ. ցույց է տրված մոտակա կայարանը։';
  if (destination) {
    $('home-actions').append(link('Տուն · քայլքով ↗', directions(destination, 'walk')), link('Տուն · տրանսպորտով ↗', directions(destination, 'metro')));
  } else $('home-note').textContent = 'Մասնավոր հասցեն դեռ բացված չէ, իսկ մոտակա կայարանի տվյալները սպասվում են։ Իրական մասնավոր հղումը ստանալուց հետո բացեք այն այս հեռախոսում։';
}

function renderAirport() {
  const transfers = state.trip.airport_transfers;
  $('airports').replaceChildren();
  if (!transfers.length) { $('airports').append(element('p', 'Օդանավակայանային տեղափոխությունների տվյալները սպասվում են։ Ելքի ժամ կամ գին չենք ենթադրում։')); return; }
  for (const transfer of transfers) {
    if (!transfer) continue;
    const article = element('article'); article.append(element('h3', `${text(transfer.date)} · ${text(transfer.from_hy)} → ${text(transfer.to_hy)}`));
    article.append(element('p', `Տնից ելք՝ ${text(transfer.leave_home_at)} · Տերմինալում՝ ${text(transfer.target_at_terminal)}`));
    article.append(element('p', `Թռիչք՝ ${text(transfer.flight_time_local)} · Տերմինալ՝ ${text(transfer.terminal)}`));
    if (transfer.warning_hy) article.append(element('p', transfer.warning_hy, 'transfer-warning'));
    for (const option of list(transfer.options)) {
      if (!option) continue;
      article.append(element('strong', option.rank === 'backup' ? 'Պահուստային տարբերակ' : 'Հիմնական տարբերակ'));
      article.append(element('p', `${option.label || 'ՉՍՏՈՒԳՎԱԾ'} · ճանապարհ՝ ${text(option.total_min)} րոպե · հավելյալ պահուստ՝ ${text(option.buffer_min)} րոպե · խմբի գին՝ ${text(option.price_eur_group)} €`));
      const steps = element('ol');
      for (const step of list(option.steps)) {
        if (!step) continue;
        const item = element('li', `${text(step.from)} → ${text(step.to)} · ${text(step.mode)} ${step.line || ''} · ${text(step.depart)}–${text(step.arrive)} · անձի գին՝ ${text(step.price_eur_person)} €`);
        if (step.where_to_buy_hy) item.append(element('p', step.where_to_buy_hy));
        if (step.to) item.append(link('Բացել Google Maps-ում ↗', directions(step.to, step.mode || 'bus')));
        steps.append(item);
      }
      article.append(steps);
      list(option.sources).filter(safeUrl).forEach((source, i) => article.append(link(`Աղբյուր ${i + 1}`, source)));
    }
    $('airports').append(article);
  }
}

function renderTickets(city) {
  $('tickets').replaceChildren(element('p', city?.tickets?.summary_hy || 'Տոմսերի ստուգված տվյալները սպասվում են։'));
  for (const option of list(city?.tickets?.options)) {
    if (!option) continue;
    const article = element('article'); article.append(element('h3', text(option.name)), element('p', `${text(option.price_eur)} € · ${option.label || 'ՉՍՏՈՒԳՎԱԾ'}`), element('p', text(option.where_to_buy_hy)), element('p', text(option.how_to_use_hy)));
    if (option.source) article.append(link('Աղբյուրը', option.source)); $('tickets').append(article);
  }
  $('questions').replaceChildren(...state.trip.open_questions_hy.map(question => element('li', text(question))));
}

function updateClock() {
  const city = currentCity();
  $('city-time').textContent = city ? `Քաղաքում հիմա՝ ${localDate(city.timezone)} · ${localClock(city.timezone)} (${city.timezone})` : '';
}
function setMapView(show) {
  $('workspace').classList.toggle('show-map', show);
  $('tab-map').setAttribute('aria-pressed', String(show)); $('tab-plan').setAttribute('aria-pressed', String(!show));
  requestAnimationFrame(() => state.map?.resize());
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

async function checkData(manual = false) {
  if (state.loading) return;
  state.loading = true; $('check-update').disabled = true;
  const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 10000);
  try {
    const response = await fetch(new URL('trip.json', base), { cache: 'no-store', signal: abort.signal });
    if (!response.ok) throw new Error('network');
    const trip = validateTrip(await response.json());
    if (!state.trip) applyTrip(trip, true);
    else if (JSON.stringify(trip) !== JSON.stringify(state.trip)) { state.pending = trip; $('update-banner').hidden = false; }
    else if (manual) notice('Ստուգվեց․ տվյալների նոր տարբերակ չկա։');
  } catch {
    if (!state.trip) { $('day-title').textContent = 'Տվյալները չեն բեռնվել'; $('day-notes').textContent = 'Ստուգեք ինտերնետը և սեղմեք «Ստուգել տվյալների թարմացումը»։ Առաջին բացումը պետք է լինի ինտերնետով։'; }
    if (manual || !state.trip) notice('Նոր trip.json-ը չհաջողվեց կարդալ․ կապը բացակայում է կամ ֆայլը վավեր չէ։ Պահված վավեր տվյալները չեն փոխարինվել։');
  } finally { clearTimeout(timeout); state.loading = false; $('check-update').disabled = false; }
}
$('check-update').onclick = () => checkData(true);
$('apply-update').onclick = () => {
  if (!state.pending) return;
  try { applyTrip(state.pending); state.pending = null; $('update-banner').hidden = true; notice('Տվյալները թարմացվել են։ Մասնավոր հասցեները պահպանվել են։'); }
  catch { notice('Նոր տվյալների ցուցադրումը չհաջողվեց։ Վերջին վավեր տարբերակը պահպանվել է։'); }
};
function connection() {
  document.body.classList.toggle('offline', !navigator.onLine);
  $('connection').textContent = navigator.onLine ? 'Ցանցը հասանելի է' : 'Առանց ինտերնետի';
  if (!navigator.onLine) $('map-message').textContent = 'Առանց ինտերնետի․ քարտեզի նոր հատվածները չեն բեռնվի։';
}
addEventListener('online', () => { connection(); $('map-message').textContent = ''; checkData(); });
addEventListener('offline', connection);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkData(); state.registration?.update().catch(() => {}); } });
addEventListener('beforeinstallprompt', event => { event.preventDefault(); state.install = event; $('install').hidden = false; });
$('install').onclick = async () => { if (!state.install) return; await state.install.prompt(); state.install = null; $('install').hidden = true; };
addEventListener('appinstalled', () => { state.install = null; $('install').hidden = true; });

async function registerWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) { $('offline-state').textContent = 'Առանց ինտերնետի բացվելը հասանելի չէ․ բացեք HTTPS GitHub Pages հասցեն։'; return; }
  try {
    const registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
    state.registration = registration;
    const offer = () => { if (registration.waiting) $('shell-update').hidden = false; };
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

connection();
state.map = createMap($('map'), message => { $('map-message').textContent = message; });
new ResizeObserver(() => state.map?.resize()).observe($('map-panel'));
const cached = read('trip');
if (cached) { try { applyTrip(validateTrip(cached), true); } catch { notice('Պահված տվյալները վնասված են․ փորձում ենք նորից բեռնել։'); } }
checkData(); registerWorker();
setInterval(updateClock, 30000);
