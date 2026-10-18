// Synthetic UI data only. Never modifies trip.json; exclude output from release ZIPs.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export function makeOnlineFixture(base) {
 const data=structuredClone(base);
 data.fixture_notice='ՓՈՐՁԱՐԿՄԱՆ ՏՎՅԱԼ — fictional live links, not verified services; not for release';
 for(const city of data.cities)city.live_links=[
  {kind:'transit',label_hy:'Փորձնական տրանսպորտ',url:`https://example.org/fixture-only/${city.id}/transit`},
  {kind:'protests',label_hy:'Փորձնական տեղեկություններ',url:`https://example.org/fixture-only/${city.id}/protests`},
  {kind:'other',label_hy:'Փորձնական այլ հղում',url:`https://example.org/fixture-only/${city.id}/other`}
 ];
 for(const [index,flight] of data.flights.entries())flight.status_url=`https://example.org/fixture-only/flight-${index+1}`;
 return data;
}
export function makeAlertsFixture() {
 const alert=(id,level,city,date,until=null)=>({id,level,city,date,until,title_hy:`ՓՈՐՁԱՐԿՈՒՄ ${id}`,text_hy:'Հորինված զգուշացում՝ միայն ծրագրի փորձարկման համար։',source_url:'https://example.org/fixture-only/alert'});
 return {updated_at:'2026-10-21T09:00:00+02:00',alerts:[
  {...alert('paris-danger','danger','paris','2026-10-21'),stop_ids:['paris-21-04','paris-21-02','fixture-unknown-stop'],area:{lat:48.8606,lon:2.2891,radius_m:800},suggestion_hy:'Հորինված փորձնական առաջարկ․ բաց թողեք նշված երկու կանգառները։'},
  alert('barcelona-warning','warning','barcelona',null),
  alert('all-cities','info',null,null),
  alert('paris-other-day','warning','paris','2026-10-22'),
  {...alert('expired','danger',null,null,'2026-10-20T20:00:00+02:00'),stop_ids:['paris-21-05'],area:{lat:48.8594,lon:2.2927,radius_m:500}},
  {...alert('literal-xss','info','paris','2026-10-21'),title_hy:'<img src=x onerror="window.fixtureInjected=true">',text_hy:'<script>window.fixtureInjected=true</script>'}
 ]};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const base=JSON.parse(await readFile(new URL('../trip.json',import.meta.url),'utf8'));
 await writeFile(new URL('../tests/fixtures/online-trip.json',import.meta.url),JSON.stringify(makeOnlineFixture(base),null,2)+'\n');
}
