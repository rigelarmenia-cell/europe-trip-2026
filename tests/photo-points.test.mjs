import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateTrip} from '../lib/core.js';
import {auditTrip} from '../tools/check-trip.mjs';
import {makePhotoFixture} from '../tools/make-photo-fixture.mjs';

const current=()=>JSON.parse(readFileSync('trip.json','utf8'));
const base=()=>{
 const data=current();
 for(const day of data.days)for(const stop of day.stops)delete stop.photo_points;
 return data;
};
function sample() {
 const data=base(), stop=data.days.find(d=>d.date==='2026-10-21').stops.find(s=>s.kind==='sight');
 const point={id:'fixture-unit-point',name_hy:'Փորձ',name_local:'Fixture',what_hy:'ՓՈՐՁԱՐԿՄԱՆ ՏՎՅԱԼ',label:'ՀԱՍՏԱՏՎԱԾ',checked:'2026-10-18',lat:stop.lat,lon:stop.lon,sources:['https://example.org/fixture'],photo:null};
 stop.photo_points=[point];return {data,stop,point};
}
test('legacy v12 shape without photo points remains valid and audits zero points',()=>{
 const data=base();assert.equal(validateTrip(data),data);
 const report=auditTrip(data);assert.equal(report.pass,true);assert.deepEqual(report.photoPoints,{count:0,withPhoto:0,invalid:[]});
});
test('current v13 validates and audits all 33 real photo points',()=>{
 const data=current();assert.equal(validateTrip(data),data);
 const report=auditTrip(data);assert.equal(report.pass,true);
 assert.deepEqual(report.photoPoints,{count:203,withPhoto:161,invalid:[]});
});
test('valid points count and nullable or Wikimedia photos pass',()=>{
 const {data,stop,point}=sample();stop.photo_points.push({...point,id:'fixture-second',photo:{...stop.photos[0]},label:'ԱՂԲՅՈՒՐՈՎ ՀԱՂՈՐԴՎԱԾ'});
 assert.equal(validateTrip(data),data);assert.deepEqual(auditTrip(data).photoPoints,{count:2,withPhoto:1,invalid:[]});assert.equal(auditTrip(data).pass,true);
 stop.photo_points=[];assert.equal(validateTrip(data),data);
});
for(const [name,change,reason] of [
 ['missing coordinates',({point})=>{delete point.lat;},'coordinates'],
 ['invalid coordinates',({point})=>{point.lat=91;},'coordinates'],
 ['unaccepted label',({point})=>{point.label='ՉՍՏՈՒԳՎԱԾ';},'label'],
 ['no HTTPS source',({point})=>{point.sources=['http://example.org'];},'sources'],
 ['malformed HTTPS source',({point})=>{point.sources=['https://'];},'sources'],
 ['duplicate point id',({point,stop})=>{stop.photo_points.push({...point});},'id'],
 ['id collides with a stop',({point,data})=>{point.id=data.days.at(-1).stops.at(-1).id;},'id'],
 ['id collides with a city',({point,data})=>{point.id=data.cities[0].id;},'id'],
 ['over 1.5 km away',({point})=>{point.lat+=.02;},'distance'],
 ['parent is not sight',({stop})=>{stop.kind='food';},'parent'],
 ['photo wrong host',({point,stop})=>{point.photo={...stop.photos[0],url:'https://example.org/a.jpg'};},'photo'],
 ['photo host suffix trick',({point,stop})=>{point.photo={...stop.photos[0],url:'https://upload.wikimedia.org.example.org/a.jpg'};},'photo'],
 ...['author','license','source_page'].map(key=>[`empty photo ${key}`,({point,stop})=>{point.photo={...stop.photos[0],[key]:'  '};},'photo'])
]) test(`audit fails: ${name}`,()=>{
 const input=sample();change(input);const report=auditTrip(input.data);assert.equal(report.pass,false);
 assert.ok(report.photoPoints.invalid.some(item=>item.reasons.includes(reason)),JSON.stringify(report));
});
for(const key of ['id','name_hy','name_local','what_hy','label','checked','lat','lon','sources','photo']) {
 test(`schema rejects missing required photo-point ${key}`,()=>{const {data,point}=sample();delete point[key];assert.throws(()=>validateTrip(data));});
 test(`schema rejects incorrect photo-point ${key} type`,()=>{const {data,point}=sample();point[key]=true;assert.throws(()=>validateTrip(data));});
}
test('schema rejects null/non-array/oversized point lists and non-object entries',()=>{
 for(const value of [null,{},[null],[{}, {}, {}]]) {const {data,stop}=sample();stop.photo_points=value;assert.throws(()=>validateTrip(data));}
});
test('schema rejects non-string sources and invalid photo field types',()=>{
 const {data,point,stop}=sample();point.sources=[123];assert.throws(()=>validateTrip(data));point.sources=[];
 for(const key of ['url','author','license','source_page']) {point.photo={...stop.photos[0],[key]:123};assert.throws(()=>validateTrip(data));}
});
test('synthetic fixture is reproducible, audited, and leaves production input untouched',()=>{
 const input=current(),before=structuredClone(input),fixture=makePhotoFixture(input);
 assert.deepEqual(input,before);
 assert.deepEqual(fixture,JSON.parse(readFileSync('tests/fixtures/photo-points.json','utf8')));
 assert.equal(auditTrip(fixture).pass,true);
 assert.deepEqual(auditTrip(fixture).photoPoints,{count:2,withPhoto:1,invalid:[]});
 for(const point of fixture.days.flatMap(day=>day.stops.flatMap(stop=>stop.photo_points||[]))) {
  assert.ok(point.id.startsWith('fixture-'));assert.match(point.what_hy,/ՓՈՐՁԱՐԿՄԱՆ ՏՎՅԱԼ/);
 }
});
