import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as itinerary from '../lib/itinerary.js';
import { validateTrip } from '../lib/core.js';
const stops = Array.from({ length: 10 }, (_, i) => ({ id: `test-${i}`, order: i + 1, lat: 40 + i / 100, lon: 3, to_next: { mode: 'walk' } }));
test('personal order reconciles stable ids, ignores removed ids, appends new stops', () => {
  assert.deepEqual(itinerary.orderedStops({ stops }, { order: ['test-2', 'gone', 'test-0', 'test-2'] }).map(s => s.id), ['test-2','test-0','test-1','test-3','test-4','test-5','test-6','test-7','test-8','test-9']);
});
test('full-day routes preserve order with no more than three mobile waypoints and chained origins', () => {
  const routes = itinerary.dayRoutes(stops, {}, 'walk');
  assert.equal(routes.links.length, 3);
  const a = new URL(routes.links[0]), b = new URL(routes.links[1]), c = new URL(routes.links[2]);
  assert.equal(a.searchParams.has('origin'), false);
  assert.equal(a.searchParams.get('waypoints'), '40,3|40.01,3|40.02,3');
  assert.equal(a.searchParams.get('destination'), '40.03,3');
  assert.equal(b.searchParams.get('origin'), '40.03,3');
  assert.equal(c.searchParams.get('destination'), '40.09,3');
});
test('visited and skipped stops leave routes; unknown coordinate blocks an incomplete route', () => {
  const status = { 'test-0': 'visited', 'test-1': 'skipped' };
  assert.equal(new URL(itinerary.dayRoutes(stops, status, 'walk').links[0]).searchParams.get('waypoints'), '40.02,3|40.03,3|40.04,3');
  assert.equal(itinerary.dayRoutes([{ ...stops[0], lat: null }], {}, 'walk').links.length, 0);
  assert.deepEqual(itinerary.dayRoutes([{ ...stops[0], lat: null }], {}, 'walk').missing, ['test-0']);
  assert.equal(itinerary.dayRoutes([stops[0]], { 'test-0': 'visited' }, 'walk').links.length, 0);
});
test('transit uses individual legs, not possibly ignored waypoints', () => {
  const routes = itinerary.dayRoutes(stops.slice(0, 3), {}, 'metro');
  assert.equal(routes.links.length, 3);
  assert.equal(new URL(routes.links[1]).searchParams.get('waypoints'), null);
  assert.equal(new URL(routes.links[1]).searchParams.get('origin'), '40,3');
});
test('buffer unknown is never zero or green; boundary uses supplied number only', () => {
  assert.equal(itinerary.bufferState(null), 'unknown');
  assert.equal(itinerary.bufferState(0), 'short');
  assert.equal(itinerary.bufferState(119), 'short');
  assert.equal(itinerary.bufferState(120), 'known');
});
test('Samsung detection uses SamsungBrowser token, including desktop mode', () => {
  assert.equal(itinerary.isSamsung('Mozilla/5.0 (X11; Linux x86_64) SamsungBrowser/24.0 Chrome/117.0.0.0 Safari/537.36'), true);
  assert.equal(itinerary.isSamsung('Mozilla/5.0 Android SAMSUNG Chrome/120.0.0.0'), false);
});
test('the provided intermediate trip is accepted with nulls, conflict label and private_van', () => {
  const trip = JSON.parse(readFileSync('trip.json', 'utf8'));
  assert.equal(validateTrip(trip), trip);
  assert.equal(trip.days.length, 0);
  assert.equal(trip.airport_transfers.length, 6);
  assert.equal(trip.flights.length, 4);
});
