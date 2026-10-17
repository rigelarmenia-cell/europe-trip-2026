// Synthetic test fixture only. No real locations or private addresses.
import {mkdir,writeFile} from 'node:fs/promises';
const fixture={version:'2099-01-01-1',generated_at:'2026-10-17T12:05:00+04:00',cities:[],days:[],airport_transfers:[],flights:[],open_questions_hy:['ՀՈՐԻՆՎԱԾ փորձարկում, ոչ իրական երթուղի']};
for(const [ci,id,dates] of [[0,'paris',[20,21,22,23]],[1,'barcelona',[24,25,26]],[2,'rome',[26,27,28]]]) {
  fixture.cities.push({id,name_hy:`ՀՈՐԻՆՎԱԾ քաղաք ${ci+1}`,name_local:`SYNTHETIC ${id}`,timezone:['Europe/Paris','Europe/Madrid','Europe/Rome'][ci],home_station:{name_local:'SYNTHETIC station',lat:1+ci,lon:1},tickets:{summary_hy:'ՀՈՐԻՆՎԱԾ',options:[]},safety_zones:[]});
  for(const n of dates) {
    const count=6+(n%5),date=`2026-10-${n}`;
    fixture.days.push({date,city:id,title_hy:`ՀՈՐԻՆՎԱԾ ${id} ${date}`,notes_hy:'Միայն ավտոմատ փորձի համար։ Իրական վայր կամ այցելության առաջարկ չէ։',total_walk_km:4,stops:Array.from({length:count},(_,i)=>({id:`synthetic-${id}-${n}-${i}`,order:i+1,kind:i===2?'food':'sight',name_hy:`ՀՈՐԻՆՎԱԾ կանգառ ${i+1}`,name_local:`Synthetic ${i+1}`,lat:1+ci+i*.001,lon:1+i*.001,description_hy:'Հորինված փորձնական նկարագրություն։',label:'ԵՆԹԱԴՐՈՒԹՅՈՒՆ',photos:i%2?[{url:'https://fixture.invalid/synthetic.svg',author:'Synthetic test author',license:'Synthetic fixture only',source_page:'https://fixture.invalid/'}]:[],sources:[],visit_min:[10,20],hours_hy:'Փորձնական',price_hy:'Փորձնական',to_next:i===count-1?null:{mode:['walk','metro','bus','tram'][i%4],km:.5,min:10,line:'SYNTHETIC',direction:'SYNTHETIC',get_off:'SYNTHETIC',ticket_hy:'Փորձնական'}}))});
  }
  for(let i=0;i<2;i++) fixture.airport_transfers.push({id:`synthetic-transfer-${ci}-${i}`,city:id,date:`2026-10-${dates[i]}`,from_hy:'ՀՈՐԻՆՎԱԾ A',to_hy:'ՀՈՐԻՆՎԱԾ B',leave_home_at:null,flight_time_local:'10:00',target_at_terminal:'07:30',terminal:null,warning_hy:'Հորինված փորձնական տվյալ',options:[{rank:'primary',label:'ԵՆԹԱԴՐՈՒԹՅՈՒՆ',total_min:30,buffer_min:i?null:90,price_eur_group:24,steps:[{mode:'bus',from:'Synthetic A',to:'Synthetic B',depart:`2026-10-${dates[i]}T07:00`,arrive:`2026-10-${dates[i]}T07:30`,price_eur_person:3,where_to_buy_hy:'ՀՈՐԻՆՎԱԾ'}],sources:[]}]});
}
for(let i=0;i<4;i++) fixture.flights.push({date:`2026-10-${20+i}`,from:'SYNTHETIC A',to:'SYNTHETIC B',depart_local:'10:00',arrive_local:'12:00',airline:'SYNTHETIC',online_checkin_hy:'ՀՈՐԻՆՎԱԾ հիշեցում'});
await mkdir('tests/fixtures',{recursive:true});
await writeFile('tests/fixtures/full-trip.json',JSON.stringify(fixture,null,2)+'\n');
