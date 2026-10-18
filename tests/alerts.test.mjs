import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAlerts, activeAlerts } from '../lib/alerts.js';

const alert = (overrides = {}) => ({ id: 'demo', level: 'info', city: null, date: null, until: null, title_hy: 'Փորձ', text_hy: 'Սինթետիկ օրինակ', source_url: null, ...overrides });
const data = (...alerts) => ({ updated_at: '2026-10-20T09:00:00+02:00', alerts });

test('valid data is returned unchanged, including expired alerts and literal HTML text', () => {
  const input = data(alert({ until: '2020-01-01T00:00:00Z', title_hy: '<img src=x onerror=alert(1)>', source_url: 'https://example.org/reference' }));
  assert.equal(validateAlerts(input), input);
  assert.equal(validateAlerts(data()).alerts.length, 0);
});

test('invalid structures, missing fields, duplicates, and enum values are rejected', () => {
  for (const input of [null, [], {}, { ...data(), alerts: {} }, data(null), data([]), data(alert(), alert()), data(alert({ id: '  ' })), data(alert({ level: 'urgent' })), data(alert({ city: 'london' })), data(alert({ title_hy: 5 })), data(alert({ text_hy: null }))]) {
    assert.throws(() => validateAlerts(input));
  }
  for (const key of Object.keys(alert())) {
    const incomplete = alert(); delete incomplete[key];
    assert.throws(() => validateAlerts(data(incomplete)), key);
  }
});

test('dates must be real calendar dates and timestamps must include an explicit zone', () => {
  for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-1-01', '', 42]) {
    assert.throws(() => validateAlerts(data(alert({ date }))));
  }
  validateAlerts(data(alert({ date: '2028-02-29' })));
  for (const stamp of ['2026-10-20', '2026-10-20T09:00:00', '2026-02-30T09:00:00Z', '2026-10-20T24:00:00Z', '2026-10-20T09:00:00+25:00', 'garbage', null]) {
    assert.throws(() => validateAlerts({ ...data(), updated_at: stamp }));
    if (stamp !== null) assert.throws(() => validateAlerts(data(alert({ until: stamp }))));
  }
  for (const stamp of ['2026-10-20T09:00:00Z', '2026-10-20T09:00:00.123-04:00']) validateAlerts({ ...data(), updated_at: stamp });
});

test('source links require HTTPS and reject executable, malformed, and credential URLs', () => {
  for (const source_url of ['javascript:alert(1)', 'data:text/html,hello', 'file:///secret', 'http://example.org', '//example.org', 'https://', 'https://user:password@example.org', 'https://example.org\n/path', 'https:\\example.org', {}, 5]) {
    assert.throws(() => validateAlerts(data(alert({ source_url }))), String(source_url));
  }
});

test('active alerts match city and date independently, allowing null wildcards', () => {
  const input = data(alert({ id: 'global' }), alert({ id: 'city', city: 'paris' }), alert({ id: 'day', date: '2026-10-21' }), alert({ id: 'both', city: 'paris', date: '2026-10-21' }), alert({ id: 'other-city', city: 'rome' }), alert({ id: 'other-day', date: '2026-10-22' }));
  const original = structuredClone(input);
  assert.deepEqual(activeAlerts(input, { city: 'paris', date: '2026-10-21' }).map(a => a.id), ['global', 'city', 'day', 'both']);
  assert.deepEqual(input, original);
});

test('all view still excludes dismissed and expired alerts, including exact expiry boundary', () => {
  const input = data(alert({ id: 'expired', until: '2026-10-21T09:59:59+02:00' }), alert({ id: 'boundary', until: '2026-10-21T10:00:00+02:00' }), alert({ id: 'future', until: '2026-10-21T10:00:01+02:00', city: 'rome' }), alert({ id: 'dismissed' }), alert({ id: 'renewed' }));
  assert.deepEqual(activeAlerts(input, { all: true, city: 'paris', date: '2026-10-20', dismissed: ['dismissed'], now: Date.parse('2026-10-21T08:00:00Z') }).map(a => a.id), ['future', 'renewed']);
});

test('optional plan fields allow absence, null area, unknown stop IDs, and radius boundaries', () => {
  for (const extra of [{}, { area: null }, { stop_ids: [], suggestion_hy: '' }, { stop_ids: ['unknown-stop-id'], suggestion_hy: 'Սինթետիկ առաջարկ', area: { lat: 0, lon: 0, radius_m: 50 } }, { area: { lat: -90, lon: 180, radius_m: 5000 } }]) {
    const input = data(alert(extra));
    assert.equal(validateAlerts(input), input);
  }
});

test('optional plan fields reject wrong types and invalid area coordinates or radius', () => {
  const extras = [{ stop_ids: null }, { stop_ids: 'stop' }, { stop_ids: [42] }, { suggestion_hy: null }, { suggestion_hy: 42 }, { area: [] }, { area: 'zone' }, { area: {} }];
  const area = { lat: 48.8, lon: 2.3, radius_m: 800 };
  for (const [key, invalid] of [['lat', 90.01], ['lat', -90.01], ['lon', 180.01], ['lon', -180.01], ['lat', '48.8'], ['lon', null], ['radius_m', 49], ['radius_m', 5001], ['radius_m', '800'], ['radius_m', null], ['lat', Infinity], ['radius_m', NaN]]) extras.push({ area: { ...area, [key]: invalid } });
  for (const extra of extras) assert.throws(() => validateAlerts(data(alert(extra))));
});
