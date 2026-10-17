import test from 'node:test';
import assert from 'node:assert/strict';
import { timeText, money, stepPrice, minutes } from '../lib/format.js';
import { validateTrip } from '../lib/core.js';
import { readFileSync } from 'node:fs';
test('B3 literal time formatting never applies timezone arithmetic', () => {
  assert.equal(timeText('2026-10-23T23:55:00'), '23.10 · 23:55');
  assert.equal(timeText('2026-10-24T00:15'), '24.10 · 00:15');
  assert.equal(timeText('00:15'), '00:15');
  assert.equal(timeText('unknown'), 'unknown');
  assert.equal(timeText(null), 'սպասվում է');
});
test('B3 prices and unknown minutes preserve meaning', () => {
  assert.equal(money(47.2), '47,20 €'); assert.equal(money(124), '124,00 €');
  assert.equal(minutes(null), 'սպասվում է');
  assert.equal(stepPrice({price_eur_person:0, where_to_buy_hy:'Նույն մետրոյի տոմսի ներքին փոխատեղում'}), 'ներառված է');
  assert.equal(stepPrice({price_eur_person:0, where_to_buy_hy:'Քայլք'}), '0 €');
});
test('B3 v5 accepts optional checkin text and rejects wrong type', () => {
  const trip = JSON.parse(readFileSync('trip.json', 'utf8'));
  assert.equal(validateTrip(trip).version, '2026-10-17-5');
  trip.flights[0].online_checkin_hy = 42;
  assert.throws(() => validateTrip(trip));
});
