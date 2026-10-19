// Build-time only (GitHub Actions). Real OSM street walking times/distances between
// public stop, photo-spot and home-station coordinates (no private home address).
import {readFile,writeFile} from 'node:fs/promises';
const trip=JSON.parse(await readFile(process.argv[2]||'trip.json','utf8'));
const out={source:'https://routing.openstreetmap.de/routed-foot (OSRM foot profile, OpenStreetMap)',built:new Date().toISOString(),days:{}};
for(const day of trip.days){
 const city=trip.cities.find(c=>c.id===day.city),nodes=[];
 if(city?.home_station)nodes.push({id:'home',lat:city.home_station.lat,lon:city.home_station.lon});
 for(const s of day.stops){
  if(typeof s.lat==='number'&&typeof s.lon==='number')nodes.push({id:s.id,lat:s.lat,lon:s.lon});
  for(const p of s.photo_points||[])nodes.push({id:p.id,lat:p.lat,lon:p.lon,parent:s.id});
 }
 const seen=new Set(),uniq=nodes.filter(n=>!seen.has(n.id)&&seen.add(n.id));
 const coords=uniq.map(n=>`${n.lon},${n.lat}`).join(';');
 const url=`https://routing.openstreetmap.de/routed-foot/table/v1/driving/${coords}?annotations=duration,distance`;
 let entry={nodes:uniq};
 try{
  const r=await fetch(url,{signal:AbortSignal.timeout(60000),headers:{'User-Agent':'khelarner-trip-planner (github.com/rigelarmenia-cell/europe-trip-2026)'}});
  if(!r.ok)throw Error('HTTP '+r.status);
  const j=await r.json();if(j.code!=='Ok')throw Error(j.code);
  entry.durations=j.durations;entry.distances=j.distances;
 }catch(e){entry.error=String(e.message||e);}
 out.days[day.date]=entry;
 console.log(day.date,uniq.length,entry.error||'ok');
 await new Promise(r=>setTimeout(r,1500));
}
await writeFile(process.argv[3]||'street-matrix.json',JSON.stringify(out)+'\n');
