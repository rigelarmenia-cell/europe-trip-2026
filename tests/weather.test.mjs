import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeApi } from '../tools/weather-fake.mjs';
import { weatherUrl, normalizeWeather, validateWeather, describeCode, adviceHy, dayLineHy, hoursOf } from '../lib/weather.js';

test('weather url asks for three cities, no API key', () => {
  const u = new URL(weatherUrl());
  assert.equal(u.hostname, 'api.open-meteo.com');
  assert.equal(u.searchParams.get('latitude').split(',').length, 3);
  assert.ok(!u.search.includes('apikey'));
});
test('normalize keeps only trip days (≤ 28.10) and validates', () => {
  const w = validateWeather(normalizeWeather(fakeApi(), { now: new Date('2026-10-20T08:00:00Z') }));
  assert.deepEqual(Object.keys(w.cities), ['paris', 'barcelona', 'rome']);
  assert.equal(w.cities.paris.daily.length, 9);
  assert.equal(w.cities.rome.daily.at(-1).date, '2026-10-28');
  assert.ok(w.cities.paris.hourly.every(h => h.time <= '2026-10-28T23:59'));
  assert.equal(w.cities.barcelona.daily[0].sunset, '18:45');
  assert.equal(hoursOf(w.cities.paris, '2026-10-21').length, 5);
});
test('location count mismatch and garbage are rejected', () => {
  assert.throws(() => normalizeWeather(fakeApi().slice(0, 2)));
  assert.throws(() => validateWeather({ cities: {} }));
});
test('Armenian descriptions and advice', () => {
  assert.equal(describeCode(0).text, 'Արևոտ');
  assert.equal(describeCode(95).icon, '⛈');
  assert.equal(describeCode(1234).text, 'Անհայտ');
  const day = { code: 63, tmin: 7.2, tmax: 17.6, pprob: 70, psum: 3, wind: 38 };
  assert.match(adviceHy(day), /անձրևանոց/); assert.match(adviceHy(day), /քամի/); assert.match(adviceHy(day), /ցուրտ/);
  assert.equal(dayLineHy(day), '🌧 Անձրև · 7…18° · անձրև 70% · քամի մինչև 38 կմ/ժ');
  assert.equal(adviceHy({ pprob: 0, tmin: 14, wind: 10 }), '');
});
