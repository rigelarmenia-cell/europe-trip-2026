import {coordinates} from './core.js';
import {orderedStops} from './itinerary.js';
const neutral='#64748b';
export function lineColor(city,line='') {
 const s=line.toUpperCase();
 if(s.includes('+'))return neutral;
 if(city==='paris') {if(/\bM\s*11\b/.test(s))return '#8d5e2a';if(/\bM\s*1\b/.test(s))return '#ffcd00';}
 if(city==='barcelona') {if(/\bL\s*3\b/.test(s))return '#00923f';if(/\bL\s*4\b/.test(s))return '#f8b818';if(/\bL\s*9\b/.test(s))return '#f29100';}
 if(city==='rome'&&/\b(?:METRO\s*)?B(?:1)?\b/.test(s))return '#0072bc';
 return neutral;
}
const point=s=>coordinates(s)?[s.lat,s.lon]:null;
export const homeId=city=>`home:${city.id}`;
export function segments(day,stops,city,paths={},statuses={}) {
 stops=stops.filter(s=>!['visited','skipped'].includes(statuses?.[s.id]));
 if(!day||!stops.length)return [];
 const original=orderedStops(day),result=[],home={...city?.home_station,id:homeId(city)};
 function add(a,b,changed=false) {
  if(!point(a)||!point(b))return;
  const live=changed?paths[`${a.id}>${b.id}:live`]:null;
  if(Array.isArray(live)&&live.length>1){result.push({from:a.id,to:b.id,key:`${a.id}>${b.id}:live`,kind:'walk',line:'',km:null,min:null,points:live,fallback:false,roadGeometry:false,live:true,color:'#0a8f6f',weight:5,dashArray:'1 9'});return;}
  const data=changed?null:a.to_next;
  const mode=data?.mode;
  const kind=['walk','metro','train','bus','tram','taxi'].includes(mode)?mode:'unknown';
  const key=`${a.id}>${b.id}:${kind}`;
  const road=['bus','tram','taxi'].includes(kind);
  const geometry=!changed&&!data?.line?.includes('+')&&(road||kind==='walk')?paths[key]:null;
  result.push({from:a.id,to:b.id,key,kind,line:data?.line||'',km:data?.km,min:data?.min,points:geometry||[point(a),point(b)],fallback:road&&!geometry,roadGeometry:road&&!!geometry,color:kind==='unknown'?'#858b91':kind==='walk'?'#0a8f6f':lineColor(city.id,data?.line||''),weight:kind==='unknown'?1.5:kind==='walk'?5:4,dashArray:kind==='unknown'?'3 6':kind==='walk'?'1 9':undefined});
 }
 add(home,stops[0],true);
 for(let i=0;i<stops.length-1;i++) {
  const a=stops[i],b=stops[i+1];
  const initialNext=original[original.findIndex(s=>s.id===a.id)+1];
  const afterGap=i>0&&!point(stops[i-1]);
  add(a,b,afterGap||initialNext?.id!==b.id);
 }
 const last=stops.at(-1);
 if(last.to_next)add(last,home,last.id!==original.at(-1)?.id||(stops.length>1&&!point(stops.at(-2))));
 return result;
}
export function pathCandidates(trip) {
 const all=new Map();
 for(const day of trip.days){const city=trip.cities.find(c=>c.id===day.city);for(const s of segments(day,orderedStops(day),city,{}))if(['bus','tram','taxi','walk'].includes(s.kind))all.set(s.key,s);}
 return all;
}
export function validatePaths(paths,trip) {
 if(!paths||typeof paths!=='object'||Array.isArray(paths))throw Error('paths object');
 const allowed=pathCandidates(trip);
 for(const [key,value] of Object.entries(paths)) {
  const segment=allowed.get(key);
  if(segment?.line.includes('+'))throw Error('paths mixed transport');
  if(!segment||!Array.isArray(value)||value.length<2||value.length>200||value.some(p=>!Array.isArray(p)||p.length!==2||!coordinates({lat:p[0],lon:p[1]})))throw Error('paths key/geometry');
  // Routing services snap to public roads; reject far-away or stale endpoints.
  for(const [a,b] of [[value[0],segment.points[0]],[value.at(-1),segment.points.at(-1)]])if(Math.hypot(a[0]-b[0],a[1]-b[1])>.003)throw Error('paths stale endpoints');
 }
 return paths;
}
