import test from 'node:test';
import assert from 'node:assert/strict';
import { auditTrip } from '../tools/check-trip.mjs';
import {readFileSync} from 'node:fs';
const fixture=()=>JSON.parse(readFileSync('tests/fixtures/full-trip.json','utf8'));
const smallTrip=()=>{
 const d=fixture(); d.days=d.days.slice(0,1);d.days[0].stops=d.days[0].stops.slice(0,3);return d;
};
test('empty itinerary cannot pass route readiness',()=>{const d=smallTrip();d.days=[];assert.equal(auditTrip(d).pass,false);});
test('v9-like coordinate gap reports exact IDs and fails daily routing audit',()=>{
 const d=smallTrip();const stop=d.days[0].stops[1];stop.lat=null;stop.lon=null;
 const r=auditTrip(d);assert.equal(r.pass,false);
 assert.deepEqual(r.days[0].missingCoordinateIds,[stop.id]);
 assert.equal(r.days[0].hasRoute,false);
});
test('pending names in either language fail even when coordinates and routes exist',()=>{
 for(const key of ['name_local','name_hy']) {
  const d=smallTrip();d.days[0].stops[0][key]='Restaurant PENDING';
  const r=auditTrip(d);assert.equal(r.pass,false);
  assert.deepEqual(r.days[0].pendingIds,[d.days[0].stops[0].id]);
  assert.equal(r.days[0].hasRoute,true);
 }
});
test('empty day has no Google Maps route and fails readiness audit',()=>{
 const d=smallTrip();d.days[0].stops=[];
 const r=auditTrip(d);assert.equal(r.pass,false);assert.equal(r.days[0].hasRoute,false);
 assert.deepEqual(r.days[0].missingCoordinateIds,[]);
});
test('audit rejects wrong group totals even with unrelated warning',()=>{
 const d=fixture();d.airport_transfers[0].options[0].price_eur_group=25;
 assert.equal(auditTrip(d).pass,false);
});
test('audit accepts unknown total and explicitly explained group fare',()=>{
 const d=fixture(),t=d.airport_transfers[0],o=t.options[0];
 o.price_eur_group=null;assert.equal(auditTrip(d).pass,true);
 o.price_eur_group=11.5;o.steps[0].price_eur_person=null;t.warning_hy='Խմբային տոմս՝ 11,50 € ընդհանուր գին՝ 8 ուղևորության համար';
 assert.equal(auditTrip(d).pass,true);
});
test('audit rejects impossible or unsupported times and validates HH:mm/full dates',()=>{
 const d=fixture();assert.equal(auditTrip(d).pass,true);
 d.airport_transfers[0].options[0].steps[0].depart='2026-02-30T25:90';
 assert.equal(auditTrip(d).pass,false);
});
