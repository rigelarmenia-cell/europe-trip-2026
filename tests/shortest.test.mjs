import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as itinerary from '../lib/itinerary.js';

const stop = (id, lon, kind = 'sight', lat = 0) => ({ id, lon, lat, kind, name_hy: id, hours_hy: 'check hours' });
const ids = stops => stops.map(s => s.id);
const solve = (...args) => { assert.equal(typeof itinerary.shortestOrder, 'function'); return itinerary.shortestOrder(...args); };

test('shortest: pure single-step apply and undo preserve statuses and clear warning state', () => {
  assert.equal(typeof itinerary.applyShortest, 'function');
  assert.equal(typeof itinerary.undoShortest, 'function');
  const original = { statuses: { visited: 'visited' }, notes: 'keep' };
  const first = { order: ['b', 'a'], improved: true, foodMoves: [{ id: 'b', from: 2, to: 1 }] };
  const applied = itinerary.applyShortest(original, first, ['a', 'b']);
  assert.deepEqual(applied.order_before_shortest, ['a', 'b']);
  assert.deepEqual(applied.order, ['b', 'a']);
  assert.deepEqual(applied.food_moves, first.foodMoves);
  assert.deepEqual(original, { statuses: { visited: 'visited' }, notes: 'keep' });
  const next = itinerary.applyShortest(applied, { order: ['a', 'b'], improved: true, foodMoves: [] }, applied.order);
  const undone = itinerary.undoShortest(next);
  assert.deepEqual(undone.order, ['b', 'a']);
  assert.deepEqual(undone.statuses, original.statuses);
  assert.equal(undone.notes, 'keep');
  assert.equal('order_before_shortest' in undone, false);
  assert.equal('food_moves' in undone, false);
  assert.deepEqual(itinerary.undoShortest(undone), undone);
  assert.deepEqual(itinerary.applyShortest(applied, { improved: false }, applied.order), applied);
});

test('shortest: fixed home in fifth position splits independently optimized groups', () => {
  const stops = [stop('a', 4), stop('b', 1), stop('c', 3), stop('d', 2), stop('home', 0, 'home'), stop('e', 4), stop('f', 1)];
  const result = solve(stops);
  assert.deepEqual(result.order, ['a', 'c', 'd', 'b', 'home', 'f', 'e']);
  assert.ok(result.improved);
  assert.ok(result.afterKm < result.beforeKm);
});

test('shortest: visited and skipped keep their list slots while pending slots can cross them', () => {
  const stops = [stop('home', 0, 'home'), stop('a', 3), stop('v', 8), stop('b', 1), stop('s', 9), stop('c', 2)];
  const statuses = { v: 'visited', s: 'skipped' };
  const before = JSON.stringify({ stops, statuses });
  const result = solve(stops, statuses);
  assert.deepEqual(result.order, ['home', 'b', 'v', 'c', 's', 'a']);
  assert.equal(JSON.stringify({ stops, statuses }), before);
});

test('shortest: preceding visited coordinate anchors a free group; skipped never anchors', () => {
  const stops = [stop('v', 0), stop('s', 8), stop('a', 3), stop('b', 1), stop('c', 2)];
  assert.deepEqual(solve(stops, { v: 'visited', s: 'skipped' }).order, ['v', 's', 'b', 'c', 'a']);
});

test('shortest: transport, airport and missing coordinates stay fixed and split groups', () => {
  const stops = [stop('t', 0, 'transport'), stop('a', 3), stop('b', 1), stop('air', 4, 'airport'),
    stop('c', 7), stop('d', 5), { ...stop('bad', 0), lat: null }, stop('e', 9), stop('f', 8)];
  const result = solve(stops);
  for (const index of [0, 3, 6]) assert.equal(result.order[index], stops[index].id);
  assert.deepEqual(new Set(result.order.slice(4, 6)), new Set(['c', 'd']));
  assert.deepEqual(new Set(result.order.slice(7)), new Set(['e', 'f']));
});

test('shortest: deterministic equal distances retain original relative ordering', () => {
  const stops = [stop('h', 0, 'home'), stop('z', 3), stop('b', 1), stop('a', 1)];
  assert.deepEqual(solve(stops).order, ['h', 'b', 'a', 'z']);
  assert.deepEqual(solve(stops), solve(stops));
  const equal = [stop('z', 1), stop('a', 1), stop('b', 1)];
  assert.deepEqual(solve(equal).order, ids(equal));
  assert.equal(solve(equal).improved, false);
});

test('shortest: unchanged for optimal, empty, all completed, and less than 10m gain', () => {
  for (const stops of [[], [stop('a', 0)], [stop('a', 0), stop('b', 1), stop('c', 2)],
    [stop('h', 0, 'home'), stop('a', 0.00002), stop('b', 0.00001)]]) {
    const result = solve(stops);
    assert.equal(result.improved, false);
    assert.deepEqual(result.order, ids(stops));
    assert.equal(result.beforeKm, result.afterKm);
    assert.deepEqual(result.foodMoves, []);
  }
  const stops = [stop('a', 0), stop('b', 1)];
  assert.deepEqual(solve(stops, { a: 'visited', b: 'skipped' }).order, ids(stops));
});

test('shortest: food warnings describe only food stops whose actual list position changes', () => {
  const stops = [stop('h', 0, 'home'), stop('meal', 3, 'food'), stop('v', 8), stop('b', 1), stop('c', 2)];
  assert.deepEqual(solve(stops, { v: 'visited' }).foodMoves,
    [{ id: 'meal', name: 'meal', from: 2, to: 5, hours: 'check hours' }]);
  assert.deepEqual(solve(stops, { meal: 'visited' }).foodMoves, []);
});

// Independent spherical-law-of-cosines distance and exhaustive oracle.
function distance(a, b) {
  const rad = Math.PI / 180;
  return 6371 * Math.acos(Math.max(-1, Math.min(1, Math.sin(a.lat * rad) * Math.sin(b.lat * rad)
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((a.lon - b.lon) * rad))));
}
function length(points) { return points.slice(1).reduce((sum, point, i) => sum + distance(points[i], point), 0); }
function permutations(items) {
  if (!items.length) return [[]];
  return items.flatMap((item, i) => permutations(items.filter((_, j) => i !== j)).map(rest => [item, ...rest]));
}

test('shortest: exact small groups match brute-force optimum for every endpoint configuration', () => {
  const movable = [stop('a', 1, 'sight', 2), stop('b', 4, 'shop', 1), stop('c', 2, 'food', 4),
    stop('d', 3, 'sight', 3), stop('e', 0, 'sight', 1), stop('f', 5, 'sight', 2)];
  for (const start of [[], [stop('start', 0, 'home')]]) for (const end of [[], [stop('end', 6, 'airport')]]) {
    const stops = [...start, ...movable, ...end];
    const optimum = Math.min(...permutations(movable).map(p => length([...start, ...p, ...end])));
    const result = solve(stops);
    const actual = length(result.order.map(id => stops.find(s => s.id === id)));
    assert.ok(Math.abs(actual - optimum) < 0.0001, `${actual} versus ${optimum}`);
    assert.ok(Math.abs(result.afterKm - optimum) < 0.0001);
    assert.ok(Math.abs(result.beforeKm - length(stops)) < 0.0001);
  }
});

test('shortest: 13-stop heuristic and actual 25 October never increase distance and finish under 200ms', () => {
  const trip = JSON.parse(readFileSync(new URL('../trip.json', import.meta.url)));
  const actual = trip.days.find(day => day.date === '2026-10-25');
  assert.ok(actual);
  const synthetic = Array.from({ length: 13 }, (_, i) => stop(String(i), (i * 7) % 13, 'sight', (i * 3) % 7));
  for (const stops of [synthetic, actual.stops.slice().sort((a, b) => a.order - b.order)]) {
    const start = performance.now();
    const result = solve(stops);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 200, `elapsed ${elapsed}ms`);
    assert.ok(result.afterKm <= result.beforeKm);
    assert.deepEqual(new Set(result.order), new Set(ids(stops)));
    assert.deepEqual(result, solve(stops));
  }
});
