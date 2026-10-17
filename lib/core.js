export function coordinates(point) {
  if (!point || typeof point.lat !== 'number' || typeof point.lon !== 'number') return null;
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon) || Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) return null;
  return `${point.lat},${point.lon}`;
}

export function directions(destination, mode = 'walk') {
  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('destination', destination);
  url.searchParams.set('travelmode', mode === 'walk' ? 'walking' : mode === 'taxi' ? 'driving' : 'transit');
  url.searchParams.set('dir_action', 'navigate');
  return url.href;
}

export function localDate(timeZone, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = type => parts.find(part => part.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function localClock(timeZone, date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

export function parseHomes(hash) {
  if (!hash.startsWith('#homes=')) return null;
  if (hash.length > 6000) throw new Error('homes length');
  const data = JSON.parse(decodeURIComponent(hash.slice(7)));
  if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('homes object');
  const entries = Object.entries(data);
  if (!entries.length || entries.some(([key, value]) => !['paris', 'barcelona', 'rome'].includes(key) || typeof value !== 'string' || !value.trim() || value.length > 400 || /[\x00-\x1f]/.test(value))) throw new Error('homes fields');
  return Object.fromEntries(entries.map(([key, value]) => [key, value.trim()]));
}

export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function validateTrip(data) {
  const fail = () => { throw new Error('trip.json-ի կառուցվածքը վավեր չէ'); };
  const shape = (value, strings = [], numbers = []) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
    for (const key of strings) if (value[key] != null && typeof value[key] !== 'string') fail();
    for (const key of numbers) if (value[key] != null && (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || value[key] < 0)) fail();
  };
  const items = (value, key, check) => {
    if (value[key] == null) return;
    if (!Array.isArray(value[key])) fail();
    value[key].forEach(check);
  };
  const string = value => { if (typeof value !== 'string') fail(); };
  const geo = value => {
    for (const [key, limit] of [['lat', 90], ['lon', 180]]) if (value[key] != null && (typeof value[key] !== 'number' || !Number.isFinite(value[key]) || Math.abs(value[key]) > limit)) fail();
  };
  if (!data || typeof data.version !== 'string' || !data.version || typeof data.generated_at !== 'string' || !Number.isFinite(Date.parse(data.generated_at))) fail();
  for (const key of ['cities', 'days', 'airport_transfers', 'flights', 'open_questions_hy']) if (!Array.isArray(data[key])) fail();
  const cities = new Set();
  for (const city of data.cities) {
    shape(city, ['id', 'name_hy', 'name_local', 'timezone']);
    if (!city || typeof city.id !== 'string' || !city.id || cities.has(city.id) || typeof city.timezone !== 'string') fail();
    localDate(city.timezone);
    cities.add(city.id);
    if (city.home_station != null) {
      shape(city.home_station, ['name_local'], ['walk_from_home_min']); geo(city.home_station); items(city.home_station, 'lines', string);
    }
    if (city.tickets != null) {
      shape(city.tickets, ['summary_hy']);
      items(city.tickets, 'options', item => shape(item, ['name', 'where_to_buy_hy', 'how_to_use_hy', 'label', 'source'], ['price_eur']));
    }
    items(city, 'safety_zones', zone => {
      shape(zone, ['id', 'name', 'day_night_hy', 'explanation_hy', 'source']); items(zone, 'risk_types', string);
      items(zone, 'polygon', point => { if (!Array.isArray(point) || point.length !== 2 || point.some(number => typeof number !== 'number' || !Number.isFinite(number))) fail(); });
    });
  }
  const days = new Set();
  const stops = new Set();
  for (const day of data.days) {
    shape(day, ['date', 'city', 'title_hy', 'notes_hy'], ['total_walk_km']);
    if (!day || !cities.has(day.city) || !/^\d{4}-\d{2}-\d{2}$/.test(day.date) || !Array.isArray(day.stops)) fail();
    if (!Number.isFinite(Date.parse(`${day.date}T12:00:00Z`)) || new Date(`${day.date}T12:00:00Z`).toISOString().slice(0, 10) !== day.date) fail();
    const dayKey = `${day.city}:${day.date}`;
    if (days.has(dayKey)) fail();
    days.add(dayKey);
    for (const stop of day.stops) {
      shape(stop, ['id', 'kind', 'name_hy', 'name_local', 'description_hy', 'photo_spot_hy', 'hours_hy', 'price_hy', 'menu_url', 'menu_prices_hy', 'reviews_source', 'label'], ['order']); geo(stop);
      if (!stop || typeof stop.id !== 'string' || !stop.id || stops.has(stop.id)) fail();
      stops.add(stop.id);
      items(stop, 'sources', string);
      items(stop, 'photos', photo => shape(photo, ['url', 'author', 'license', 'source_page']));
      if (stop.visit_min != null && (!Array.isArray(stop.visit_min) || stop.visit_min.length !== 2 || stop.visit_min.some(number => typeof number !== 'number' || !Number.isFinite(number) || number < 0) || stop.visit_min[0] > stop.visit_min[1])) fail();
      if (stop.to_next != null) shape(stop.to_next, ['mode', 'line', 'color', 'direction', 'get_off', 'transfers_hy', 'ticket_hy'], ['km', 'min']);
    }
  }
  for (const transfer of data.airport_transfers) {
    shape(transfer, ['id', 'city', 'date', 'from_hy', 'to_hy', 'flight_time_local', 'terminal', 'target_at_terminal', 'leave_home_at', 'warning_hy']);
    if (transfer.city && !cities.has(transfer.city)) fail();
    items(transfer, 'options', option => {
      shape(option, ['rank', 'label'], ['total_min', 'buffer_min', 'price_eur_group']); items(option, 'sources', string);
      items(option, 'steps', step => shape(step, ['mode', 'line', 'from', 'to', 'depart', 'arrive', 'where_to_buy_hy'], ['price_eur_person']));
    });
  }
  for (const flight of data.flights) shape(flight, ['date', 'from', 'to', 'depart_local', 'arrive_local', 'airline', 'terminal', 'label', 'online_checkin_hy']);
  data.open_questions_hy.forEach(string);
  return data;
}
