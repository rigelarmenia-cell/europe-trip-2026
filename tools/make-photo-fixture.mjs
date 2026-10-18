// Synthetic UI fixture only. Never include its output in the release ZIP.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export function makePhotoFixture(base) {
 const data=structuredClone(base);
 const stop=data.days.find(day=>day.date==='2026-10-21').stops.find(stop=>stop.kind==='sight');
 data.fixture_notice='ՓՈՐՁԱՐԿՄԱՆ ՏՎՅԱԼ — synthetic points, not verified places; not for release';
 stop.photo_points=[0,1].map(index=>({
  id:`fixture-photo-${index+1}`,
  name_hy:`Փորձնական կետ ${index+1}`,
  name_local:index===0?'<img src=x onerror="window.fixtureInjected=true">':'Fixture point with photo',
  what_hy:'ՓՈՐՁԱՐԿՄԱՆ ՏՎՅԱԼ — հորինված կետ, իրական վայրի պնդում չէ։ <script>window.fixtureInjected=true</script>',
  label:'ԱՂԲՅՈՒՐՈՎ ՀԱՂՈՐԴՎԱԾ',checked:'2026-10-18',
  lat:stop.lat+(index+1)*.0003,lon:stop.lon+(index+1)*.0003,
  sources:['https://example.org/fixture-only'],photo:index===0?null:structuredClone(stop.photos[0])
 }));
 return data;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const base=JSON.parse(await readFile(new URL('../trip.json',import.meta.url),'utf8'));
 await writeFile(new URL('../tests/fixtures/photo-points.json',import.meta.url),JSON.stringify(makePhotoFixture(base),null,2)+'\n');
}
