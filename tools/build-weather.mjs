// Hourly (GitHub Actions): Open-Meteo → weather.json. Usage: node tools/build-weather.mjs weather.json
import { writeFileSync } from 'node:fs';
import { weatherUrl, normalizeWeather, validateWeather } from '../lib/weather.js';
const out = process.argv[2] || 'weather.json';
const res = await fetch(weatherUrl(), { headers: { 'user-agent': 'khelarner-trip-pwa (github.com/rigelarmenia-cell/europe-trip-2026)' } });
if (!res.ok) throw Error(`Open-Meteo HTTP ${res.status}`);
const weather = validateWeather(normalizeWeather(await res.json()));
writeFileSync(out, JSON.stringify(weather, null, 1) + '\n');
for (const [id, c] of Object.entries(weather.cities)) console.log(id, c.daily.length, 'days', c.current?.temp, '°C');
