import { coordinates, directions, safeUrl } from './core.js';
import {segments} from './paths.js';
import {distanceNumber} from './format.js';

export function createMap(node, message) {
  if (!window.L) { message('Քարտեզի ֆայլը չի բեռնվել։ Վերաբացեք ծրագիրը ինտերնետով։'); return null; }
  const L = window.L;
  const map = L.map(node, { zoomControl: false }).setView([20, 0], 2);
  L.control.zoom({ position: 'topleft', zoomInTitle: 'Մոտեցնել', zoomOutTitle: 'Հեռացնել' }).addTo(map);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> մասնակիցներ',
  }).addTo(map);
  tiles.on('tileerror', () => message('Քարտեզի որոշ հատվածներ չեն բեռնվել։ Ստուգեք ինտերնետը։ Կանգառների ցանկը հասանելի է։'));
  const stopsLayer = L.layerGroup().addTo(map);
  // Keep every numbered/home marker above camera icons, independent of latitude.
  map.createPane('photoPoints'); map.getPane('photoPoints').style.zIndex='550';
  const photoLayer = L.layerGroup().addTo(map), photoMarkers = new Map();
  const popupOptions=()=>({maxWidth:Math.max(150,Math.min(260,node.clientWidth-60)),maxHeight:Math.max(140,Math.min(260,Math.round(node.clientHeight*0.45))),autoPan:true,keepInView:true,closeButton:true,autoPanPaddingTopLeft:[56,84],autoPanPaddingBottomRight:[12,12],className:'compact-popup'});
  const appendLink=(parent,label,url)=>{const href=safeUrl(url);if(!href)return;const a=document.createElement('a');a.textContent=label;a.href=href;a.target='_blank';a.rel='noopener noreferrer';parent.append(a);};
  function appendPhoto(parent,photo,name) {
    if(!photo||!safeUrl(photo.url))return;
    const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');
    figure.className='map-photo';img.src=safeUrl(photo.url);img.alt=name||'';img.loading='lazy';img.referrerPolicy='no-referrer';
    img.onerror=()=>{const p=document.createElement('p');p.textContent='Լուսանկարը չբեռնվեց';img.replaceWith(p);};
    caption.textContent=`${photo.author||'Սպասվում է'} · ${photo.license||'Սպասվում է'}`;
    appendLink(caption,'Լուսանկարի աղբյուրը ↗',photo.source_page);figure.append(img,caption);parent.append(figure);
  }
  map.createPane('dayPaths'); map.getPane('dayPaths').style.zIndex='350';
  const routeLayer = L.layerGroup().addTo(map);
  const positionLayer = L.layerGroup().addTo(map);
  const safetyLayer = L.layerGroup().addTo(map);
  const alertsLayer = L.layerGroup().addTo(map);
  let points = [];
  return {
    alerts(alerts) {
      alertsLayer.clearLayers();
      const affected = new Set(alerts.flatMap(alert => Array.isArray(alert.stop_ids) ? alert.stop_ids : []));
      stopsLayer.eachLayer(marker => {
        const element = marker.getElement();
        if (element) element.classList.toggle('alert-stop', affected.has(element.dataset.stopId));
      });
      for (const alert of alerts) {
        const area = alert.area;
        if (!coordinates(area) || !Number.isFinite(area.radius_m) || area.radius_m < 50 || area.radius_m > 5000) continue;
        const popup = document.createElement('div');
        const title = document.createElement('strong'); title.textContent = alert.title_hy; popup.append(title);
        appendLink(popup, 'Աղբյուր ↗', alert.source_url);
        const circle = L.circle([area.lat, area.lon], {radius:area.radius_m,color:'#ad3028',fillColor:'#ad3028',fillOpacity:0.18,weight:2,className:'alert-area'}).bindPopup(popup,popupOptions()).addTo(alertsLayer);
        const element = circle.getElement(); if (element) element.dataset.alertId = alert.id;
      }
    },
    routes(day,stops,city,paths,statuses={}) {
      routeLayer.clearLayers();
      const names={walk:'Քայլք',metro:'Մետրո',train:'Գնացք',bus:'Ավտոբուս',tram:'Տրամվայ',taxi:'Տաքսի',unknown:'Անհայտ/փոփոխված հատված'};
      for(const s of segments(day,stops,city,paths,statuses)) {
        const popup=document.createElement('div');
        const note=s.kind==='unknown'?'Նոր հարևանություն (բաց թողնված կամ փոխված հերթականություն)․ տեսակը և ճանապարհը չհաստատված են։ Ճանապարհի համար՝ «Բացել ամբողջ օրը»':s.fallback?'ուղիղ գիծ, ոչ իրական ճանապարհ':s.roadGeometry?'Ճանապարհային մոտարկում (OSRM), ոչ երթի հաստատված ուղի':s.kind==='walk'?(s.points.length>2?'Քայլքի ուղի փողոցներով (OpenStreetMap, մոտավոր)':'Կետագծով կապ, ոչ հաստատված քայլուղի'):'Ուղիղ գիծ կետից կետ';
        for(const text of [names[s.kind],s.line?`Գիծ՝ ${s.line}`:'Գիծ՝ անհայտ',`Կմ՝ ${s.km==null?'սպասվում է':distanceNumber(s.km)} · րոպե՝ ${s.min??'սպասվում է'}`,note]) {const p=document.createElement('p');p.textContent=text;popup.append(p);}
        // White casing keeps lines readable over busy map tiles (not interactive, not a route itself).
        if(s.kind!=='unknown')L.polyline(s.points,{pane:'dayPaths',color:'#ffffff',opacity:.85,weight:s.weight+4,interactive:false,className:'route-casing'}).addTo(routeLayer);
        const line=L.polyline(s.points,{pane:'dayPaths',color:s.color,weight:s.weight,dashArray:s.dashArray,lineCap:'round',className:`day-route route-${s.kind}${s.fallback?' route-fallback':''}`}).bindPopup(popup,popupOptions()).addTo(routeLayer);
        const node=line.getElement();if(node){node.dataset.from=s.from;node.dataset.to=s.to;node.dataset.points=String(s.points.length);}
      }
    },
    safety(zones, enabled) {
      safetyLayer.clearLayers();
      if (!enabled) return;
      for (const zone of zones) {
        if (!Array.isArray(zone.polygon) || zone.polygon.length < 3 || zone.polygon.some(p => !coordinates({ lat: p[0], lon: p[1] }))) continue;
        const popup = document.createElement('div');
        for (const value of [zone.name, (zone.risk_types || []).join(' · '), zone.day_night_hy, zone.explanation_hy]) {
          const p = document.createElement('p'); p.textContent = value || 'Սպասվում է'; popup.append(p);
        }
        if (safeUrl(zone.source)) { const a = document.createElement('a'); a.href = safeUrl(zone.source); a.textContent = 'Աղբյուրը ↗'; a.target = '_blank'; a.rel = 'noopener noreferrer'; popup.append(a); }
        else { const p = document.createElement('p'); p.textContent = 'Աղբյուրը սպասվում է'; popup.append(p); }
        L.polygon(zone.polygon, { color: '#a84a24', fillOpacity: 0.18, weight: 2, className: 'safety-zone' }).bindTooltip(document.createTextNode('⚠'), { permanent: true, direction: 'center', className: 'safety-label' }).bindPopup(popup,popupOptions()).addTo(safetyLayer);
      }
    },
    photoPoints(stops,statuses={},enabled=true) {
      photoLayer.clearLayers();photoMarkers.clear();if(!enabled)return;
      for(const stop of stops)if(stop.kind==='sight')for(const point of stop.photo_points||[]) {
        if(!coordinates(point))continue;
        const popup=document.createElement('div');popup.className='photo-point-popup';
        for(const [tag,value] of [['strong',point.name_hy],['p',point.name_local],['p',point.on_route===false?`↪ Ճանապարհից մի փոքր դուրս՝ գնալ-գալ ~${point.detour_min||'?'} ր (ըստ ցանկության)`:'📍 Մեր քայլքի ճանապարհին'],['p',point.what_hy],['span',point.label]]){const el=document.createElement(tag);el.textContent=value||'';if(tag==='span')el.className='badge';popup.append(el);}
        appendPhoto(popup,point.photo,point.name_hy);
        (point.sources||[]).forEach((url,i)=>appendLink(popup,`Աղբյուր ${i+1} ↗`,url));
        appendLink(popup,'Գնալ այստեղ · քայլքով ↗',directions(coordinates(point),'walk'));
        const icon=document.createElement('span');icon.className='photo-pin';icon.textContent='📷';
        const marker=L.marker([point.lat,point.lon],{pane:'photoPoints',zIndexOffset:point.lat===stop.lat&&point.lon===stop.lon?10000:0,icon:L.divIcon({className:'photo-marker',html:icon,iconSize:[26,26],iconAnchor:[-8,46]}),title:point.name_hy,opacity:['visited','skipped'].includes(statuses[stop.id])?.45:1}).bindPopup(popup,popupOptions()).addTo(photoLayer);
        marker.getElement().dataset.photoId=point.id;photoMarkers.set(point.id,marker);
      }
    },
    focusPhoto(point) {const marker=photoMarkers.get(point.id);if(marker){map.stop();map.setView([point.lat,point.lon],17,{animate:false});marker.openPopup();}},
    show(stops, station, statuses={}) {
      stopsLayer.clearLayers();
      points = [];
      stops.forEach((stop, index) => {
        if (!coordinates(stop)) return;
        const point = [stop.lat, stop.lon];
        points.push(point);
        const status=statuses[stop.id],done=['visited','skipped'].includes(status);
        const pin=document.createElement('span');pin.className=`number-pin ${stop.kind==='food'?'food':''}`;pin.textContent=`${index+1}${stop.kind==='food'?'·':''}${status==='visited'?'✓':status==='skipped'?'↷':''}`;
        const icon = L.divIcon({ className: 'stop-marker', html:pin, iconSize: [34, 34], iconAnchor: [17, 17] });
        const popup = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = `${index + 1}. ${stop.name_hy || stop.name_local || 'Կանգառ'}`;
        popup.append(name);
        appendPhoto(popup,stop.photos?.[0],stop.name_hy||stop.name_local);
        const initial = stop.to_next?.mode || 'walk';
        const preferred = initial === 'walk' ? 'walk' : initial === 'taxi' ? 'taxi' : 'metro';
        const modes = [['walk', 'քայլքով'], ['metro', 'տրանսպորտով'], ['taxi', 'մեքենայով']];
        modes.sort((a, b) => Number(b[0] === preferred) - Number(a[0] === preferred));
        for (const [mode, label] of modes) {
          const link = document.createElement('a');
          link.textContent = `Գնալ այստեղ · ${label} ↗`;
          link.href = directions(coordinates(stop), mode);
          link.target = '_blank'; link.rel = 'noopener noreferrer';
          popup.append(link);
        }
        const marker=L.marker(point, { icon, zIndexOffset:(stop.photo_points||[]).some(p=>p.lat===stop.lat&&p.lon===stop.lon)?10000:0, title: name.textContent,opacity:done?.45:1 }).bindPopup(popup,popupOptions()).addTo(stopsLayer);
        marker.getElement().dataset.stopId=stop.id;
      });
      if (coordinates(station)) {
        const point = [station.lat, station.lon]; points.push(point);
        const popup = document.createElement('span');
        popup.textContent = `Տան մոտակա կայարան՝ ${station.name_local || 'անունը սպասվում է'}`;
        L.marker(point, { icon: L.divIcon({ className: '', html: '<span class="number-pin">⌂</span>', iconSize: [34, 34], iconAnchor: [17, 17] }), title: popup.textContent }).bindPopup(popup,popupOptions()).addTo(stopsLayer);
      }
      this.fit();
    },
    fit() {
      map.stop();
      map.invalidateSize();
      if (points.length) map.fitBounds(points, { padding: [65, 65], maxZoom: 14,animate:false });
      else map.setView([20, 0], 2,{animate:false});
    },
    resize() { map.invalidateSize({ pan: false }); },
    focus(stop) { if(coordinates(stop)){map.stop();map.setView([stop.lat,stop.lon],16,{animate:false});} },
    position(position) {
      positionLayer.clearLayers();
      const { latitude, longitude, accuracy } = position.coords;
      if (!coordinates({ lat: latitude, lon: longitude }) || !Number.isFinite(accuracy) || accuracy < 0) return;
      L.circle([latitude, longitude], { radius: accuracy, color: '#207ab5', weight: 1, fillOpacity: 0.12 }).addTo(positionLayer);
      L.circleMarker([latitude, longitude], { radius: 7, color: 'white', weight: 3, fillColor: '#207ab5', fillOpacity: 1 }).bindPopup(`Ձեր դիրքը · ճշտություն՝ մոտ ${Math.round(accuracy)} մ`).addTo(positionLayer);
      map.setView([latitude, longitude], 15);
    },
    clearPosition() { positionLayer.clearLayers(); },
  };
}
