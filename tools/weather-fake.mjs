// Synthetic Open-Meteo response for tests only (not real weather).
import { WEATHER_CITIES } from '../lib/weather.js';
export function fakeApi() {
  return WEATHER_CITIES.map((c, i) => {
    const days = Array.from({ length: 10 }, (_, k) => `2026-10-${String(20 + k).padStart(2, '0')}`);
    const hours = days.flatMap(d => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`));
    return {
      timezone: ['Europe/Paris', 'Europe/Madrid', 'Europe/Rome'][i],
      current: { time: '2026-10-20T10:00', temperature_2m: 12.4 + i, apparent_temperature: 10.1, weather_code: 2, wind_speed_10m: 14, precipitation: 0 },
      hourly: { time: hours, temperature_2m: hours.map((_, k) => 10 + (k % 24) / 3), weather_code: hours.map(() => 61), precipitation_probability: hours.map(() => 40) },
      daily: { time: days, weather_code: days.map(() => 63), temperature_2m_max: days.map(() => 17.6), temperature_2m_min: days.map(() => 7.2), precipitation_probability_max: days.map(() => 70), precipitation_sum: days.map(() => 3.1), wind_speed_10m_max: days.map(() => 38), sunrise: days.map(d => `${d}T08:10`), sunset: days.map(d => `${d}T18:45`) },
    };
  });
}

