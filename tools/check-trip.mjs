import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {validateTrip,coordinates,safeUrl} from '../lib/core.js';
import {dayRoutes,orderedStops} from '../lib/itinerary.js';
import {validatePaths,pathCandidates} from '../lib/paths.js';
// Allowed image hosts for photo points: Wikimedia, our own /photos/ and the official/press pages checked 18.10.2026.
const PHOTO_HOSTS=new Set(["upload.wikimedia.org", "rigelarmenia-cell.github.io", "api.questoapp.com", "barcelonalowdown.com", "barcelonanavigator.com", "cdn.paris.fr", "delivery-p147609-e1510548.adobeaemcloud.com", "firebasestorage.googleapis.com", "images.squarespace-cdn.com", "img.atlasobscura.com", "img1.digsty.com", "img3.digsty.com", "img5.digsty.com", "img7.digsty.com", "img9.digsty.com", "parisjetaime.com", "s7g10.scene7.com", "thisisbarcelona.com", "turismoroma.it", "www.turismoroma.it", "www.hmdb.org", "canalplan.co.uk", "fichier0.cirkwi.com", "i0.wp.com", "img2.digsty.com", "mamalovesrome.com", "media-cdn.sygictraveldata.com", "media-cdn.tripadvisor.com", "live.staticflickr.com", "images.pexels.com"]);

function validTime(s) {
 if(s==null) return true;
 if(typeof s!=='string') return false;
 const m=/^(?:(\d{4}-\d{2}-\d{2})T)?([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(s);
 if(!m) return false;
 if(!m[1]) return true;
 const d=new Date(m[1]+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===m[1];
}
function auditPhotoPoints(data) {
 const result={count:0,withPhoto:0,invalid:[]},ids=new Map();
 const collect=value=>{
  if(!value||typeof value!=='object')return;
  if(typeof value.id==='string')ids.set(value.id,(ids.get(value.id)||0)+1);
  for(const item of Object.values(value))collect(item);
 };
 collect(data);
 const https=value=>{try {return typeof value==='string'&&new URL(value).protocol==='https:';}catch{return false;}};
 const nonempty=value=>typeof value==='string'&&!!value.trim();
 const distance=(a,b)=>{
  const rad=Math.PI/180,dLat=(b.lat-a.lat)*rad,dLon=(b.lon-a.lon)*rad;
  const h=Math.sin(dLat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dLon/2)**2;
  return 6371*2*Math.asin(Math.sqrt(Math.min(1,h)));
 };
 for(const day of Array.isArray(data?.days)?data.days:[])for(const stop of Array.isArray(day?.stops)?day.stops:[]) {
  if(!Array.isArray(stop?.photo_points))continue;
  for(const [index,point] of stop.photo_points.entries()) {
   result.count++;
   const reasons=[];
   if(!coordinates(point))reasons.push('coordinates');
   if(!['ՀԱՍՏԱՏՎԱԾ','ԱՂԲՅՈՒՐՈՎ ՀԱՂՈՐԴՎԱԾ'].includes(point?.label))reasons.push('label');
   if(!Array.isArray(point?.sources)||!point.sources.some(https))reasons.push('sources');
   if(!nonempty(point?.id)||ids.get(point.id)>1)reasons.push('id');
   if(coordinates(point)&&coordinates(stop)&&distance(stop,point)>1.5)reasons.push('distance');
   if(stop.kind!=='sight')reasons.push('parent');
   if(point?.photo!==null) {
    result.withPhoto++;
    const photo=point?.photo;
    if(!https(photo?.url)||!PHOTO_HOSTS.has(new URL(photo.url).hostname)||!['author','license','source_page'].every(key=>nonempty(photo?.[key])))reasons.push('photo');
   }
   if(reasons.length)result.invalid.push({id:point?.id??null,parentId:stop.id,index,reasons});
  }
 }
 return result;
}
export function auditTrip(data) {
 const photoPoints=auditPhotoPoints(data);
 const result={pass:photoPoints.invalid.length===0,validation:'PASS',cities:[],days:[],prices:[],times:{checked:0,invalid:[]},photoPoints};
 try {validateTrip(data);} catch {return {...result,pass:false,validation:'FAIL'};}
 result.liveLinks={checked:0,invalid:[]};
 const invalidLink=path=>{result.liveLinks.invalid.push(path);result.pass=false;};
 const httpsLink=(value,path)=>{
  result.liveLinks.checked++;
  const url=safeUrl(value);
  if(!url||new URL(url).protocol!=='https:')invalidLink(path);
 };
 for(const [ci,city] of data.cities.entries())for(const [li,link] of (city.live_links||[]).entries()) {
  const path=`cities[${ci}].live_links[${li}]`;
  if(!['transit','protests','other'].includes(link.kind))invalidLink(`${path}.kind`);
  httpsLink(link.url,`${path}.url`);
 }
 for(const [fi,flight] of data.flights.entries())if(flight.status_url!=null)httpsLink(flight.status_url,`flights[${fi}].status_url`);
 result.cities=data.cities.map(c=>({city:c.id,days:data.days.filter(d=>d.city===c.id).length,stops:data.days.filter(d=>d.city===c.id).reduce((n,d)=>n+d.stops.length,0)}));
 result.calendarDays=new Set(data.days.map(d=>d.date)).size;
 if(!data.days.length){result.pass=false;result.itinerary='FAIL: no days';}
 result.days=data.days.map(day=>{
  const stops=orderedStops(day);
  const missingCoordinateIds=stops.filter(s=>!coordinates(s)).map(s=>s.id);
  const pendingIds=stops.filter(s=>/\bpending\b/i.test(`${s.name_local||''} ${s.name_hy||''}`)).map(s=>s.id);
  const routeCount=dayRoutes(stops,{},'walk').links.length;
  const pass=missingCoordinateIds.length===0&&pendingIds.length===0&&routeCount>0;
  if(!pass)result.pass=false;
  return {city:day.city,date:day.date,stopCount:stops.length,missingCoordinateIds,pendingIds,routeCount,hasRoute:routeCount>0,pass};
 });
 const time=(value,path)=>{result.times.checked++;if(!validTime(value)){result.times.invalid.push(path);result.pass=false;}};
 for(const [ti,t] of data.airport_transfers.entries()) {
  for(const key of ['leave_home_at','flight_time_local','target_at_terminal']) time(t[key],`airport_transfers[${ti}].${key}`);
  for(const [oi,o] of (t.options||[]).entries()) {
   const steps=o.steps||[],known=steps.length>0&&steps.every(s=>typeof s.price_eur_person==='number');
   const sum=known?Math.round(steps.reduce((n,s)=>n+s.price_eur_person,0)*800)/100:null;
   const group=o.price_eur_group;
   const warning=t.warning_hy||'';
   const amount=group==null?'':String(group).replace('.', '[.,]');
   const explained=group!=null && new RegExp(`(?:^|[^\\d])${amount}(?:0)?\\s*€`).test(warning) && /ընդհանուր|խմբային|խմբի/.test(warning);
   const status=group==null?'UNKNOWN':known&&Math.abs(sum-group)<.005?'SUM_X8':explained?'EXPLAINED_GROUP':'FAIL';
   result.prices.push({transfer:ti,option:oi,status,calculated:sum,group});
   if(status==='FAIL')result.pass=false;
   for(const [si,s] of steps.entries())for(const key of ['depart','arrive'])time(s[key],`airport_transfers[${ti}].options[${oi}].steps[${si}].${key}`);
  }
 }
 for(const [i,f] of data.flights.entries())for(const key of ['depart_local','arrive_local'])time(f[key],`flights[${i}].${key}`);
 return result;
}

async function main() {
 const filename=process.argv[2];if(!filename)throw Error('Usage: node tools/check-trip.mjs <file>');
 const bytes=await readFile(filename),data=JSON.parse(bytes.toString('utf8'));
 const report={sha256:createHash('sha256').update(bytes).digest('hex'),version:data.version,generated_at:data.generated_at,...auditTrip(data)};
 const pathsFile=process.argv[3]||resolve('paths.json');
 try {
  const paths=validatePaths(JSON.parse(await readFile(pathsFile,'utf8')),data);
  report.paths={status:'PASS',count:Object.keys(paths).length,straightFallbacks:[...pathCandidates(data).values()].filter(s=>['bus','tram','taxi'].includes(s.kind)&&!paths[s.key]).length};
 }catch(error){
  if(error.code==='ENOENT')report.paths={status:'MISSING',note:'Straight-line fallback; no geometry supplied'};
  else {report.paths={status:'FAIL',note:'Malformed or inconsistent geometry'};report.pass=false;}
 }
 const sourcePath=process.env.TRAVEL_PRIVACY_SOURCE || join(homedir(),'Downloads','02_PROMPT_B_APP_Codex_HY_v1.0.txt');
 try {
  const source=await readFile(sourcePath,'utf8');
  const line=source.split('\n').find(s=>s.includes('Հասցեները ֆիքսված են'));
  if(!line)throw Error('source unavailable');
  const addresses=line.split('(')[1].split(')')[0].split(';').map(s=>s.split('՝')[1].trim());
  if(addresses.length!==3)throw Error('source invalid');
  const body=bytes.toString('utf8');
  const targetPass=!addresses.flatMap(a=>[a,a.split(',')[0]]).some(a=>body.includes(a)||body.includes(encodeURIComponent(a)))&&!/gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/.test(body);
  const run=spawnSync(process.execPath,[fileURLToPath(new URL('./privacy-check.mjs',import.meta.url)),sourcePath],{encoding:'utf8'});
  report.privacy={target:targetPass?'PASS':'FAIL',workspace:run.status===0?'PASS':'FAIL',scope:'Supplied private addresses/encoded variants and token-like strings; not universal PII detection'};
  if(!targetPass||run.status!==0)report.pass=false;
 }catch {report.privacy={status:'FAIL',reason:'Privacy source missing or unreadable; set TRAVEL_PRIVACY_SOURCE'};report.pass=false;}
 console.log(JSON.stringify(report,null,2));
 console.log(report.pass?'PASS':'FAIL');process.exitCode=report.pass?0:1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('FAIL: input unreadable or invalid JSON');process.exitCode=1;});
