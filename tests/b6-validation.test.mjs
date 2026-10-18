import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateTrip} from '../lib/core.js';
import {auditTrip} from '../tools/check-trip.mjs';

const production = JSON.parse(readFileSync(new URL('../trip.json', import.meta.url), 'utf8'));
const fixture = () => structuredClone(production);
const link = () => ({kind:'transit',label_hy:'Տրանսպորտը հիմա',url:'https://example.org/transit'});

test('B6 optional fields may be absent without changing validation or audit', () => {
  const data = fixture();
  for (const city of data.cities) delete city.live_links;
  for (const flight of data.flights) delete flight.status_url;
  assert.equal(validateTrip(data), data);
  assert.equal(auditTrip(data).pass, true);
});

test('B6 accepts all live link kinds, an empty array and nullable flight status', () => {
  const data = fixture();
  data.cities[0].live_links = ['transit','protests','other'].map(kind => ({...link(),kind}));
  data.cities[1].live_links = [];
  data.flights[0].status_url = 'https://example.org/status';
  data.flights[1].status_url = null;
  assert.equal(validateTrip(data), data);
  assert.equal(auditTrip(data).pass, true);
});

test('B6 rejects null or non-array live_links and malformed entries', () => {
  for (const value of [null, {}, '', 12, true, [null], [[]], [{}]]) {
    const data = fixture();
    data.cities[0].live_links = value;
    assert.throws(() => validateTrip(data), `live_links=${JSON.stringify(value)}`);
    assert.equal(auditTrip(data).validation, 'FAIL');
  }
});

test('B6 live link fields are required strings', () => {
  for (const key of ['kind','label_hy','url']) for (const value of [undefined,null,0,false,{},[]]) {
    const data = fixture();
    data.cities[0].live_links = [{...link(),[key]:value}];
    assert.throws(() => validateTrip(data), `${key}=${JSON.stringify(value)}`);
  }
});

test('B6 rejects non-string non-null flight status URLs', () => {
  for (const value of [0,false,{},[]]) {
    const data = fixture();
    data.flights[0].status_url = value;
    assert.throws(() => validateTrip(data));
    assert.equal(auditTrip(data).validation, 'FAIL');
  }
});

test('B6 audit rejects unsafe, malformed and non-HTTPS URLs in both fields', () => {
  for (const url of ['javascript:alert(1)','data:text/html,<script>alert(1)</script>','file:///tmp/test','http://example.org','//example.org','https://','not a URL','']) {
    for (const target of ['city','flight']) {
      const data = fixture();
      if (target === 'city') data.cities[0].live_links = [{...link(),url}];
      else data.flights[0].status_url = url;
      assert.equal(validateTrip(data), data);
      const report = auditTrip(data);
      assert.equal(report.pass, false, `${target}: ${url}`);
      assert.equal(report.validation, 'PASS');
      assert.ok(report.liveLinks.invalid.some(path => path === (target === 'city' ? 'cities[0].live_links[0].url' : 'flights[0].status_url')));
    }
  }
});

test('B6 audit rejects unsupported link kinds with the field path', () => {
  for (const kind of ['','TRANSIT','flight','__proto__']) {
    const data = fixture();
    data.cities[0].live_links = [{...link(),kind}];
    assert.equal(validateTrip(data), data);
    const report = auditTrip(data);
    assert.equal(report.pass, false);
    assert.deepEqual(report.liveLinks.invalid, ['cities[0].live_links[0].kind']);
  }
});
