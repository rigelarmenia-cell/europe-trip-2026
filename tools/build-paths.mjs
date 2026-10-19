// Build-time only. Sends public stop/station coordinates, never saved homes.
import {readFile,writeFile} from 'node:fs/promises';
import {validateTrip} from '../lib/core.js';
import {pathCandidates,validatePaths} from '../lib/paths.js';
const file=process.argv[2],output=process.argv[3]||'paths.json';
if(!file)throw Error('Usage: node tools/build-paths.mjs <trip.json> [output.json]');
const trip=validateTrip(JSON.parse(await readFile(file,'utf8'))),paths={},failures=[],meta={};
const candidates=[...pathCandidates(trip)].filter(([,s])=>['bus','tram','taxi','walk'].includes(s.kind));
for(const [key,s] of candidates) {
 if(s.line.includes('+')) {failures.push({key,reason:'Mixed transport (+): straight fallback, not a complete road route'});continue;}
 try {
  // Walking legs pass the origin stop's photo spots in their stored visiting order (real streets via OSM).
  const origin=trip.days.flatMap(d=>d.stops).find(x=>x.id===s.from);
  const via=s.kind==='walk'&&origin?.kind==='sight'?(origin.photo_points||[]).map(p=>[p.lat,p.lon]):[];
  const waypoints=[s.points[0],...via,s.points.at(-1)];
  const coords=waypoints.map(([lat,lon])=>`${lon},${lat}`).join(';');
  // Walking uses the public OSM foot profile; road modes keep the OSRM driving approximation.
  const url=s.kind==='walk'?`https://routing.openstreetmap.de/routed-foot/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`:`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
  const response=await fetch(url,{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(`HTTP ${response.status}`);
  const data=await response.json();if(data.code!=='Ok')throw Error('No route');
  let points=data.routes[0].geometry.coordinates.map(([lon,lat])=>[lat,lon]);
  // Bound mobile payload; sampled geometry remains an explicitly approximate road path.
  if(points.length>200)points=Array.from({length:200},(_,i)=>points[Math.round(i*(points.length-1)/199)]);
  // Real street length/time of the whole walked leg (including photo spots) for the report.
  meta[key]={km:Math.round(data.routes[0].distance/10)/100,min:Math.round(data.routes[0].duration/60),via:via.length};
  validatePaths({[key]:points},trip);paths[key]=points;
 }catch(error){failures.push({key,reason:error.message});}
 if(candidates.length>1)await new Promise(r=>setTimeout(r,1100));
}
await writeFile(output,JSON.stringify(paths,null,2)+'\n');
console.log(JSON.stringify({output,meta,candidates:candidates.length,built:Object.keys(paths).length,fallbacks:failures,source:'https://router.project-osrm.org (road), https://routing.openstreetmap.de/routed-foot (walk)',profile:'driving road approximation + OSM foot walking approximation; not verified routes'},null,2));
