// Weather for our three cities from Open-Meteo (free, no key, CC BY 4.0).
// Shared by the app (live fetch from the phone) and tools/build-weather.mjs (hourly GitHub Actions → weather.json).
export const WEATHER_CITIES = [
  { id: 'paris', lat: 48.8566, lon: 2.3522 },
  { id: 'barcelona', lat: 41.3874, lon: 2.1686 },
  { id: 'rome', lat: 41.9028, lon: 12.4964 },
];
export const TRIP_LAST_DAY = '2026-10-28';
export const WEATHER_SOURCE = 'Open-Meteo (open-meteo.com), CC BY 4.0';

export function weatherUrl(cities = WEATHER_CITIES) {
  const q = new URLSearchParams({
    latitude: cities.map(c => c.lat).join(','),
    longitude: cities.map(c => c.lon).join(','),
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation',
    hourly: 'temperature_2m,weather_code,precipitation_probability',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,sunrise,sunset',
    timezone: 'auto',
    forecast_days: '10',
    wind_speed_unit: 'kmh',
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const arr = v => (Array.isArray(v) ? v : []);

// API response (array for several locations) → our compact weather.json shape.
export function normalizeWeather(api, { cities = WEATHER_CITIES, now = new Date(), lastDay = TRIP_LAST_DAY } = {}) {
  const list = Array.isArray(api) ? api : [api];
  if (list.length !== cities.length) throw Error('weather: location count mismatch');
  const out = { updated_at: now.toISOString(), source: WEATHER_SOURCE, cities: {} };
  cities.forEach((city, i) => {
    const r = list[i] || {};
    const d = r.daily || {}, h = r.hourly || {}, c = r.current || {};
    const daily = arr(d.time).map((date, k) => ({
      date, code: num(d.weather_code?.[k]), tmax: num(d.temperature_2m_max?.[k]), tmin: num(d.temperature_2m_min?.[k]),
      pprob: num(d.precipitation_probability_max?.[k]), psum: num(d.precipitation_sum?.[k]), wind: num(d.wind_speed_10m_max?.[k]),
      sunrise: typeof d.sunrise?.[k] === 'string' ? d.sunrise[k].slice(11, 16) : null, sunset: typeof d.sunset?.[k] === 'string' ? d.sunset[k].slice(11, 16) : null,
    })).filter(x => x.date <= lastDay);
    const hourly = arr(h.time).map((time, k) => ({ time, temp: num(h.temperature_2m?.[k]), code: num(h.weather_code?.[k]), pprob: num(h.precipitation_probability?.[k]) }))
      .filter(x => x.time.slice(0, 10) <= lastDay);
    if (!daily.length) throw Error(`weather: no daily data for ${city.id}`);
    out.cities[city.id] = {
      timezone: typeof r.timezone === 'string' ? r.timezone : null,
      current: typeof c.time === 'string' ? { time: c.time, temp: num(c.temperature_2m), feels: num(c.apparent_temperature), code: num(c.weather_code), wind: num(c.wind_speed_10m), precip: num(c.precipitation) } : null,
      daily, hourly,
    };
  });
  return out;
}

export function validateWeather(w) {
  if (!w || typeof w !== 'object' || !w.cities || typeof w.cities !== 'object' || !Number.isFinite(Date.parse(w.updated_at))) throw Error('weather: invalid');
  for (const [id, c] of Object.entries(w.cities)) if (!Array.isArray(c?.daily) || !Array.isArray(c?.hourly)) throw Error(`weather: invalid city ${id}`);
  return w;
}

// WMO weather codes (Open-Meteo) → emoji + Armenian.
const CODES = [
  [[0], '☀️', 'Արևոտ'], [[1], '🌤', 'Հիմնականում արևոտ'], [[2], '⛅', 'Մասամբ ամպամած'], [[3], '☁️', 'Ամպամած'],
  [[45, 48], '🌫', 'Մառախուղ'], [[51, 53, 55, 56, 57], '🌦', 'Մանրամաղ անձրև'], [[61, 80], '🌦', 'Թույլ անձրև'],
  [[63, 81], '🌧', 'Անձրև'], [[65, 82], '🌧', 'Ուժեղ անձրև'], [[66, 67], '🌧', 'Սառցե անձրև'],
  [[71, 73, 75, 77, 85, 86], '🌨', 'Ձյուն'], [[95], '⛈', 'Ամպրոպ'], [[96, 99], '⛈', 'Ամպրոպ կարկուտով'],
];
export function describeCode(code) {
  const hit = CODES.find(([codes]) => codes.includes(code));
  return hit ? { icon: hit[1], text: hit[2] } : { icon: '🌡', text: 'Անհայտ' };
}

const r0 = v => (v == null ? '–' : String(Math.round(v)));
// Short advice for walking days: umbrella, wind, cold evening.
export function adviceHy(day) {
  if (!day) return '';
  const tips = [];
  if ((day.pprob ?? 0) >= 50 || (day.psum ?? 0) >= 2) tips.push('☂ վերցրեք անձրևանոց');
  else if ((day.pprob ?? 0) >= 30) tips.push('☂ փոքր անձրևանոցը չի խանգարի');
  if ((day.wind ?? 0) >= 35) tips.push('💨 ուժեղ քամի');
  if ((day.tmin ?? 99) <= 8) tips.push('🧥 երեկոյան ցուրտ է');
  return tips.join(' · ');
}
export function dayLineHy(day) {
  if (!day) return '';
  const d = describeCode(day.code);
  return `${d.icon} ${d.text} · ${r0(day.tmin)}…${r0(day.tmax)}° · անձրև ${r0(day.pprob)}% · քամի մինչև ${r0(day.wind)} կմ/ժ`;
}
// Selected hours of one day (local city time) for a compact strip.
export function hoursOf(city, date, hours = [9, 12, 15, 18, 21]) {
  return arr(city?.hourly).filter(x => x.time.slice(0, 10) === date && hours.includes(Number(x.time.slice(11, 13))));
}
export { r0 as roundTemp };
