import { coordinates, directions } from './core.js';

export function orderedStops(day, saved = {}) {
  const initial = (day?.stops || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const ids = Array.isArray(saved?.order) ? saved.order : [];
  const map = new Map(initial.map(stop => [stop.id, stop]));
  return [...new Set([...ids, ...initial.map(stop => stop.id)])].filter(id => map.has(id)).map(id => map.get(id));
}

export function dayRoutes(stops, statuses = {}, mode = 'walk') {
  const pending = stops.filter(stop => !['visited', 'skipped'].includes(statuses?.[stop.id]));
  const missing = pending.filter(stop => !coordinates(stop)).map(stop => stop.id);
  if (missing.length) return { links: [], missing };
  const targets = pending.map(coordinates), links = [];
  // Mobile browsers allow 3 intermediate waypoints, plus a destination.
  // Transit is offered leg-by-leg rather than relying on waypoint support.
  const size = mode === 'walk' || mode === 'taxi' ? 4 : 1;
  for (let i = 0; i < targets.length; i += size) {
    const part = targets.slice(i, i + size);
    const url = new URL(directions(part.at(-1), mode));
    if (i) url.searchParams.set('origin', targets[i - 1]);
    if (part.length > 1) url.searchParams.set('waypoints', part.slice(0, -1).join('|'));
    links.push(url.href);
  }
  return { links, missing };
}
export function bufferState(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'unknown';
  return value < 120 ? 'short' : 'known';
}
export function isSamsung(userAgent) { return /\bSamsungBrowser\/\d/i.test(userAgent); }
