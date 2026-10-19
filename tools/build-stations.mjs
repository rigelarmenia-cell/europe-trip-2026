// Build-time only (GitHub Actions). Metro/rail stations per city from OpenStreetMap (Overpass API).
import {writeFile} from 'node:fs/promises';
const cities={paris:[48.80,2.22,48.92,2.47],barcelona:[41.32,2.06,41.47,2.23],rome:[41.80,12.40,41.98,12.62]};
const routeTypes={paris:'subway',barcelona:'subway',rome:'subway'};
const endpoints=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
async function overpass(q){
 let last;
 for(const url of endpoints){
  try{const r=await fetch(url,{method:'POST',body:'data='+encodeURIComponent(q),headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'khelarner-trip-planner (github.com/rigelarmenia-cell/europe-trip-2026)'},signal:AbortSignal.timeout(180000)});
   if(!r.ok)throw Error(url+' HTTP '+r.status);return await r.json();}catch(e){last=e;}
 }
 throw last;
}
const out={source:'OpenStreetMap contributors (ODbL), Overpass API',built:new Date().toISOString(),cities:{}};
for(const [city,[s,w,n,e]] of Object.entries(cities)){
 const q=`[out:json][timeout:170];rel["route"="${routeTypes[city]}"](${s},${w},${n},${e})->.r;(.r;node(r.r:"stop");node(r.r:"stop_entry_only");node(r.r:"stop_exit_only");)->.all;.all out body;`;
 const data=await overpass(q);
 const nodes=new Map(data.elements.filter(x=>x.type==='node').map(x=>[x.id,x]));
 const byName=new Map();
 for(const rel of data.elements.filter(x=>x.type==='relation')){
  const ref=(rel.tags.ref||rel.tags.name||'').trim();if(!ref)continue;
  const colour=rel.tags.colour||'';
  for(const m of rel.members.filter(m=>m.type==='node'&&/^stop/.test(m.role))){
   const node=nodes.get(m.ref);if(!node)continue;
   const name=(node.tags?.name||'').trim();if(!name)continue;
   const key=name.toLowerCase();
   const st=byName.get(key)||{name,points:[],lines:new Map()};
   st.points.push([node.lat,node.lon]);st.lines.set(ref,colour);byName.set(key,st);
  }
 }
 out.cities[city]=[...byName.values()].map(st=>({name:st.name,lat:+(st.points.reduce((a,p)=>a+p[0],0)/st.points.length).toFixed(6),lon:+(st.points.reduce((a,p)=>a+p[1],0)/st.points.length).toFixed(6),lines:[...st.lines].map(([ref,colour])=>({ref,colour})).sort((a,b)=>a.ref.localeCompare(b.ref,'en',{numeric:true}))})).sort((a,b)=>a.name.localeCompare(b.name));
 console.log(city,out.cities[city].length,'stations');
 await new Promise(r=>setTimeout(r,5000));
}
await writeFile(process.argv[2]||'stations.json',JSON.stringify(out)+'\n');
