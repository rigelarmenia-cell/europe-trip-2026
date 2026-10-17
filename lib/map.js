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
  map.createPane('dayPaths'); map.getPane('dayPaths').style.zIndex='350';
  const routeLayer = L.layerGroup().addTo(map);
  const positionLayer = L.layerGroup().addTo(map);
  const safetyLayer = L.layerGroup().addTo(map);
  let points = [];
  return {
    routes(day,stops,city,paths) {
      routeLayer.clearLayers();
      const names={walk:'Քայլք',metro:'Մետրո',train:'Գնացք',bus:'Ավտոբուս',tram:'Տրամվայ',taxi:'Տաքսի',unknown:'Անհայտ/փոփոխված հատված'};
      for(const s of segments(day,stops,city,paths)) {
        const popup=document.createElement('div');
        const note=s.kind==='unknown'?'Տեսակը և ճանապարհը չհաստատված են':s.fallback?'ուղիղ գիծ, ոչ իրական ճանապարհ':s.roadGeometry?'Ճանապարհային մոտարկում (OSRM), ոչ երթի հաստատված ուղի':s.kind==='walk'?'Կետագծով կապ, ոչ հաստատված քայլուղի':'Ուղիղ գիծ կետից կետ';
        for(const text of [names[s.kind],s.line?`Գիծ՝ ${s.line}`:'Գիծ՝ անհայտ',`Կմ՝ ${s.km==null?'սպասվում է':distanceNumber(s.km)} · րոպե՝ ${s.min??'սպասվում է'}`,note]) {const p=document.createElement('p');p.textContent=text;popup.append(p);}
        const line=L.polyline(s.points,{pane:'dayPaths',color:s.color,weight:s.weight,dashArray:s.dashArray,className:`day-route route-${s.kind}${s.fallback?' route-fallback':''}`}).bindPopup(popup).addTo(routeLayer);
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
        L.polygon(zone.polygon, { color: '#a84a24', fillOpacity: 0.18, weight: 2, className: 'safety-zone' }).bindTooltip(document.createTextNode(`Զգուշություն · ${zone.name || ''}`), { permanent: true }).bindPopup(popup).addTo(safetyLayer);
      }
    },
    show(stops, station) {
      stopsLayer.clearLayers();
      points = [];
      stops.forEach((stop, index) => {
        if (!coordinates(stop)) return;
        const point = [stop.lat, stop.lon];
        points.push(point);
        const icon = L.divIcon({ className: '', html: `<span class="number-pin ${stop.kind === 'food' ? 'food' : ''}">${index + 1}${stop.kind === 'food' ? '·' : ''}</span>`, iconSize: [34, 34], iconAnchor: [17, 17] });
        const popup = document.createElement('div');
        const name = document.createElement('strong');
        name.textContent = `${index + 1}. ${stop.name_hy || stop.name_local || 'Կանգառ'}`;
        popup.append(name);
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
        L.marker(point, { icon, title: name.textContent }).bindPopup(popup).addTo(stopsLayer);
      });
      if (coordinates(station)) {
        const point = [station.lat, station.lon]; points.push(point);
        const popup = document.createElement('span');
        popup.textContent = `Տան մոտակա կայարան՝ ${station.name_local || 'անունը սպասվում է'}`;
        L.marker(point, { icon: L.divIcon({ className: '', html: '<span class="number-pin">⌂</span>', iconSize: [34, 34], iconAnchor: [17, 17] }), title: popup.textContent }).bindPopup(popup).addTo(stopsLayer);
      }
      this.fit();
    },
    fit() {
      map.invalidateSize();
      if (points.length) map.fitBounds(points, { padding: [65, 65], maxZoom: 14 });
      else map.setView([20, 0], 2);
    },
    resize() { map.invalidateSize({ pan: false }); },
    focus(stop) { if(coordinates(stop))map.setView([stop.lat,stop.lon],16); },
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
