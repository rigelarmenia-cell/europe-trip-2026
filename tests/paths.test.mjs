import test from 'node:test';
import assert from 'node:assert/strict';
import {segments,validatePaths,lineColor} from '../lib/paths.js';
import * as format from '../lib/format.js';
const stop=(id,mode='walk')=>({id,order:id.charCodeAt(0),lat:48+id.charCodeAt(0)/1000,lon:2,to_next:{mode,line:'M11',km:1,min:10}});
const day={city:'paris',stops:['a','b','c','d','e'].map(id=>stop(id))};
const city={id:'paris',home_station:{lat:48,lon:2}};
const trip={cities:[city],days:[day]};
test('mixed line identifiers use neutral color',()=>{
 assert.equal(lineColor('rome','FL1 + Metro B'),lineColor('rome','unknown'));
 assert.equal(lineColor('paris','M1 + M11'),lineColor('paris','unknown'));
});
test('Armenian distance display preserves decimal precision',()=>{
 assert.equal(format.distanceNumber?.(2.7),'2,7');
 assert.equal(format.distanceNumber?.(9.05),'9,05');
 assert.equal(format.distanceNumber?.(1.23456789),'1,23456789');
 assert.equal(format.distanceNumber?.(0),'0');
});
test('mixed bus and metro cannot reuse road geometry',()=>{
 const d={city:'paris',stops:[stop('a','bus'),stop('b')]};d.stops[0].to_next.line='Shuttle + Metro B';
 const p={'a>b:bus':[[48.097,2],[48.0975,2.001],[48.098,2]]};
 assert.equal(segments(d,d.stops,city,p)[1].fallback,true);
 assert.throws(()=>validatePaths(p,{cities:[city],days:[d]}));
});
test('segments include station endpoints and preserve visited stops; metro is solid, walk dashed',()=>{
 const d=structuredClone(day);d.stops[0].to_next.mode='metro';
 const s=segments(d,d.stops,city,{});assert.equal(s.length,6);
 assert.equal(s[0].kind,'unknown');assert.equal(s[1].kind,'metro');assert.equal(s[1].dashArray,undefined);assert.ok(s[2].dashArray);
});
test('gap is not bridged; next valid outgoing segment is unknown',()=>{
 const d=structuredClone(day);d.stops[1].lat=null;
 const s=segments(d,d.stops,city,{});
 assert.equal(s.some(x=>x.from==='a'&&x.to==='c'),false);
 assert.equal(s.some(x=>x.from==='a'&&x.to==='b'),false);
 assert.equal(s.find(x=>x.from==='c'&&x.to==='d').kind,'unknown');
 assert.equal(s.find(x=>x.from==='d'&&x.to==='e').kind,'walk');
});
test('reordered adjacency and moved last stop do not reuse old mode or path',()=>{
 const order=[day.stops[0],day.stops[2],day.stops[3],day.stops[4],day.stops[1]];
 const s=segments(day,order,city,{});
 assert.equal(s.find(x=>x.from==='a'&&x.to==='c').kind,'unknown');
 assert.equal(s.at(-1).kind,'unknown');
});
test('validated street geometry supports >2 points; malformed/stale paths rejected',()=>{
 const d={city:'paris',stops:[stop('a','bus'),stop('b')]},t={cities:[city],days:[d]};
 const path=[[48.097,2],[48.0975,2.001],[48.098,2]];
 const p={'a>b:bus':path};assert.deepEqual(validatePaths(p,t),p);
 assert.equal(segments(d,d.stops,city,p)[1].points.length,3);
 assert.throws(()=>validatePaths({'a>b:bus':[[0,0],[1,1]]},t));
 assert.throws(()=>validatePaths({'wrong>id:bus':path},t));
 assert.throws(()=>validatePaths({'a>b:bus':Array(201).fill(path[0])},t));
 assert.equal(segments(d,d.stops,city,{})[1].fallback,true);
});
test('line recognition uses city and full line identifier, never arbitrary CSS',()=>{
 assert.notEqual(lineColor('paris','M1'),lineColor('paris','M11'));
 assert.equal(lineColor('paris','M12'),lineColor('paris','unknown'));
 assert.notEqual(lineColor('barcelona','L9 Sud'),lineColor('barcelona','unknown'));
 assert.notEqual(lineColor('rome','Metro B/B1'),lineColor('rome','unknown'));
});
