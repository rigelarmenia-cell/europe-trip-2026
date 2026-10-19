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

// Distances are kilometres on a sphere, not estimates of road or walking routes.
export function haversine(a, b) {
  const radians = Math.PI / 180;
  const deltaLat = (b.lat - a.lat) * radians, deltaLon = (b.lon - a.lon) * radians;
  const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}

const DISTANCE_EPSILON = 1e-9;
function earlierOrder(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}
function betterRoute(candidate, best) {
  return !best || candidate.cost < best.cost - DISTANCE_EPSILON
    || (Math.abs(candidate.cost - best.cost) <= DISTANCE_EPSILON && earlierOrder(candidate.path, best.path));
}

function optimizeGroup(points, start, end, dist = haversine) {
  const n = points.length, original = points.map((_, i) => i);
  const distances = points.map(a => points.map(b => dist(a, b)));
  const starts = points.map(p => start ? dist(start, p) : 0);
  const ends = points.map(p => end ? dist(p, end) : 0);
  const route = path => ({ path, cost: starts[path[0]] + ends[path.at(-1)]
    + path.slice(1).reduce((sum, node, i) => sum + distances[path[i]][node], 0) });
  const initial = route(original);
  let best = initial;
  if (n <= 10) {
    // Held–Karp: one best path per visited subset and final point.
    const states = Array.from({ length: 1 << n }, () => Array(n));
    for (let i = 0; i < n; i++) states[1 << i][i] = { cost: starts[i], path: [i] };
    for (let mask = 1; mask < (1 << n); mask++) {
      for (let last = 0; last < n; last++) {
        const state = states[mask][last];
        if (!state) continue;
        for (let next = 0; next < n; next++) {
          if (mask & (1 << next)) continue;
          const nextMask = mask | (1 << next);
          const candidate = { cost: state.cost + distances[last][next], path: [...state.path, next] };
          if (betterRoute(candidate, states[nextMask][next])) states[nextMask][next] = candidate;
        }
      }
    }
    for (let last = 0; last < n; last++) {
      const state = states[(1 << n) - 1][last];
      const candidate = { path: state.path, cost: state.cost + ends[last] };
      if (betterRoute(candidate, best)) best = candidate;
    }
  } else {
    // Try every nearest-neighbour seed, then improve each path with 2-opt.
    // Include the original path so the heuristic can never make it worse.
    const seeds = [original];
    for (let first = 0; first < n; first++) {
      const path = [first], remaining = new Set(original.filter(i => i !== first));
      while (remaining.size) {
        let nearest;
        for (const next of remaining) {
          if (nearest === undefined || distances[path.at(-1)][next] < distances[path.at(-1)][nearest] - DISTANCE_EPSILON) nearest = next;
        }
        path.push(nearest); remaining.delete(nearest);
      }
      seeds.push(path);
    }
    for (const seed of seeds) {
      let current = route(seed), changed = true;
      while (changed) {
        let nextBest = current;
        for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) {
          const path = [...current.path.slice(0, i), ...current.path.slice(i, j + 1).reverse(), ...current.path.slice(j + 1)];
          const candidate = route(path);
          if (betterRoute(candidate, nextBest)) nextBest = candidate;
        }
        changed = nextBest !== current;
        current = nextBest;
      }
      if (betterRoute(current, best)) best = current;
    }
  }
  return { path: best.path, beforeKm: initial.cost, afterKm: best.cost };
}

/** Optimize only pending movable slots; all inputs and statuses stay untouched. */
export function shortestOrder(stops, statuses = {}, dist = haversine) {
  const original = stops.map(stop => stop.id), order = original.slice();
  let group = [], previousFixed = null, lastVisited = null, start = null;
  let beforeKm = 0, afterKm = 0;
  function finish(end) {
    if (group.length) {
      const result = optimizeGroup(group.map(index => stops[index]), start, end, dist);
      beforeKm += result.beforeKm; afterKm += result.afterKm;
      group.forEach((slot, i) => { order[slot] = stops[group[result.path[i]]].id; });
    } else if (previousFixed && end) {
      const constant = dist(previousFixed, end);
      beforeKm += constant; afterKm += constant;
    }
    group = [];
  }
  stops.forEach((stop, index) => {
    const status = statuses?.[stop.id], valid = Boolean(coordinates(stop));
    if (status === 'visited' || status === 'skipped') {
      if (status === 'visited' && valid) lastVisited = stop;
      return;
    }
    if (valid && ['sight', 'food', 'shop'].includes(stop.kind)) {
      if (!group.length) start = previousFixed || lastVisited;
      group.push(index);
    } else {
      finish(valid ? stop : null);
      previousFixed = valid ? stop : null;
    }
  });
  finish(null);
  const improved = beforeKm - afterKm >= 0.01;
  if (!improved) return { order: original, beforeKm, afterKm: beforeKm, improved: false, foodMoves: [] };
  const foodMoves = stops.flatMap((stop, index) => {
    const to = order.indexOf(stop.id);
    return stop.kind === 'food' && to !== index
      ? [{ id: stop.id, name: stop.name_hy, from: index + 1, to: to + 1, hours: stop.hours_hy }]
      : [];
  });
  return { order, beforeKm, afterKm, improved, foodMoves };
}

export function applyShortest(item, result, currentOrder) {
  if (!result.improved) return { ...item };
  return { ...item, order_before_shortest: [...currentOrder], order: [...result.order],
    food_moves: result.foodMoves.map(move => ({ ...move })) };
}

export function undoShortest(item) {
  const restored = { ...item };
  if (!Array.isArray(item.order_before_shortest)) return restored;
  restored.order = [...item.order_before_shortest];
  delete restored.order_before_shortest;
  delete restored.food_moves;
  return restored;
}
