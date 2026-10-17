import { coordinates, directions } from './core.js';

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
  const positionLayer = L.layerGroup().addTo(map);
  let points = [];
  return {
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
