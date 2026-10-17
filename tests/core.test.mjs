import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../lib/core.js';

test('unknown coordinates never become a fake location at zero', () => {
  assert.equal(core.coordinates({ lat: null, lon: null }), null);
  assert.equal(core.coordinates({ lat: '', lon: '' }), null);
  assert.equal(core.coordinates({ lat: 95, lon: 2 }), null);
  assert.equal(core.coordinates({ lat: 0, lon: 0 }), '0,0');
});

test('directions use current position and the documented encoded destination', () => {
  const url = new URL(core.directions('48.8,2.3', 'metro'));
  assert.equal(url.origin + url.pathname, 'https://www.google.com/maps/dir/');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(url.searchParams.get('destination'), '48.8,2.3');
  assert.equal(url.searchParams.get('travelmode'), 'transit');
  assert.equal(url.searchParams.has('origin'), false);
  assert.equal(new URL(core.directions('Փորձ & Demo', 'walk')).searchParams.get('destination'), 'Փորձ & Demo');
  assert.equal(new URL(core.directions('Demo', 'taxi')).searchParams.get('travelmode'), 'driving');
});

test('local date and clock follow DST in the city, regardless of device zone', () => {
  assert.equal(core.localDate('Europe/Paris', new Date('2026-10-24T22:30:00Z')), '2026-10-25');
  assert.equal(core.localClock('Europe/Paris', new Date('2026-10-25T00:30:00Z')), '02:30');
  assert.equal(core.localClock('Europe/Paris', new Date('2026-10-25T01:30:00Z')), '02:30');
  assert.equal(core.localClock('Europe/Paris', new Date('2026-10-25T02:30:00Z')), '03:30');
});

test('home fragment accepts only known cities and plain nonempty addresses', () => {
  const fragment = '#homes=' + encodeURIComponent(JSON.stringify({ paris: 'Demo address', rome: 'Փորձնական հասցե' }));
  assert.deepEqual(core.parseHomes(fragment), { paris: 'Demo address', rome: 'Փորձնական հասցե' });
  assert.equal(core.parseHomes('#map'), null);
  assert.throws(() => core.parseHomes('#homes=%oops'));
  assert.throws(() => core.parseHomes('#homes=' + encodeURIComponent('{"unknown":"x"}')));
  assert.throws(() => core.parseHomes('#homes=' + encodeURIComponent('{"paris":""}')));
});

test('invalid data cannot replace a valid trip; absent coordinates remain allowed', () => {
  const valid = { version: '2026-10-17-1', generated_at: '2026-10-17T00:00:00Z', cities: [{ id: 'paris', timezone: 'Europe/Paris' }], days: [{ date: '2026-10-20', city: 'paris', stops: [{ id: 'demo', lat: null, lon: null }] }], airport_transfers: [], flights: [], open_questions_hy: [] };
  assert.equal(core.validateTrip(valid), valid);
  assert.throws(() => core.validateTrip({ ...valid, days: null }));
  assert.throws(() => core.validateTrip({ ...valid, cities: [{ id: 'paris', timezone: 'Not/AZone' }] }));
  assert.throws(() => core.validateTrip({ ...valid, days: [{ date: '2026-10-20', city: 'missing', stops: [] }] }));
  assert.throws(() => core.validateTrip({ ...valid, days: [{ date: '2026-10-20', city: 'paris', stops: [{ id: 'same' }, { id: 'same' }] }] }));
});

test('untrusted source links cannot execute script or escape to local files', () => {
  assert.equal(core.safeUrl('javascript:alert(1)'), null);
  assert.equal(core.safeUrl('file:///secret'), null);
  assert.equal(core.safeUrl('https://example.org/reference'), 'https://example.org/reference');
});

test('malformed nested fields are rejected before they can replace the offline plan', () => {
  const valid = { version: '2026-10-17-1', generated_at: '2026-10-17T00:00:00Z', cities: [{ id: 'paris', timezone: 'Europe/Paris' }], days: [{ date: '2026-10-20', city: 'paris', notes_hy: '', stops: [{ id: 'demo', lat: null, lon: null, photos: [], to_next: null }] }], airport_transfers: [], flights: [], open_questions_hy: [] };
  const mutations = [
    trip => { trip.days[0].notes_hy = 42; },
    trip => { trip.days[0].stops[0].photos = { url: 'not an array' }; },
    trip => { trip.days[0].stops[0].to_next = 'walk'; },
    trip => { trip.days[0].stops[0].lat = '48.85'; },
    trip => { trip.cities[0].tickets = { options: [null] }; },
    trip => { trip.airport_transfers = [{ options: [{ steps: [null] }] }]; },
    trip => { trip.days[0].stops[0].visit_min = [30, 10]; },
    trip => { trip.open_questions_hy = [{}]; },
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(valid); mutate(candidate);
    assert.throws(() => core.validateTrip(candidate));
  }
  assert.equal(core.validateTrip(valid), valid);
});
