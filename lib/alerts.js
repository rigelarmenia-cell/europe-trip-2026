const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function validTimestamp(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  return !!match && validDate(match[1]) && Number(match[2]) < 24 && Number(match[3]) < 60 && Number(match[4]) < 60
    && (match[5] === 'Z' || (Number(match[6]) < 24 && Number(match[7]) < 60)) && Number.isFinite(Date.parse(value));
}

function safeSource(value) {
  if (typeof value !== 'string' || !/^https:\/\//i.test(value) || /[\s\\\x00-\x1f\x7f]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}

// Validate before replacing the last known good feed. Expiry is a display rule.
export function validateAlerts(data) {
  const fail = () => { throw new Error('alerts.json-ի կառուցվածքը վավեր չէ'); };
  if (!object(data) || !validTimestamp(data.updated_at) || !Array.isArray(data.alerts)) fail();
  const ids = new Set();
  for (const alert of data.alerts) {
    if (!object(alert) || typeof alert.id !== 'string' || !alert.id.trim() || ids.has(alert.id)
      || !['danger', 'warning', 'info'].includes(alert.level)
      || !(alert.city === null || ['paris', 'barcelona', 'rome'].includes(alert.city))
      || !(alert.date === null || validDate(alert.date))
      || !(alert.until === null || validTimestamp(alert.until))
      || typeof alert.title_hy !== 'string' || typeof alert.text_hy !== 'string'
      || !(alert.source_url === null || safeSource(alert.source_url))) fail();
    if (Object.hasOwn(alert, 'stop_ids') && (!Array.isArray(alert.stop_ids) || alert.stop_ids.some(id => typeof id !== 'string'))) fail();
    if (Object.hasOwn(alert, 'suggestion_hy') && typeof alert.suggestion_hy !== 'string') fail();
    if (Object.hasOwn(alert, 'area') && alert.area !== null) {
      const area = alert.area;
      if (!object(area) || !Number.isFinite(area.lat) || Math.abs(area.lat) > 90
        || !Number.isFinite(area.lon) || Math.abs(area.lon) > 180
        || !Number.isFinite(area.radius_m) || area.radius_m < 50 || area.radius_m > 5000) fail();
    }
    ids.add(alert.id);
  }
  return data;
}

// Receives an already validated feed; never changes it or the dismissal list.
export function activeAlerts(data, { city, date, dismissed = [], now = Date.now(), all = false } = {}) {
  const hidden = new Set(dismissed);
  return data.alerts.filter(alert => !hidden.has(alert.id)
    && (alert.until === null || Date.parse(alert.until) > now)
    && (all || ((alert.city === null || alert.city === city) && (alert.date === null || alert.date === date))));
}
