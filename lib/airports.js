import { directions, safeUrl } from './core.js';
import { bufferState } from './itinerary.js';
import { timeText, money, stepPrice, minutes } from './format.js';
const value = input => input == null || input === '' ? 'սպասվում է' : String(input);
const list = input => Array.isArray(input) ? input : [];
function el(tag, text, cls) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; }
function link(text, url) { const node = el('a', text, 'action-link'); node.href = url; node.target = '_blank'; node.rel = 'noopener noreferrer'; return node; }
const modes = { walk: 'Քայլք', metro: 'Մետրո', bus: 'Ավտոբուս', train: 'Գնացք', tram: 'Տրամվայ', taxi: 'Տաքսի' };

export function renderAirports(container, flightsNode, trip) {
  container.replaceChildren(); flightsNode.replaceChildren();
  if (!trip.airport_transfers.length) container.append(el('p', 'Օդանավակայանային տվյալները սպասվում են։'));
  for (const transfer of trip.airport_transfers) {
    const article = el('article', undefined, 'airport-transfer');
    article.dataset.id = transfer.id || '';
    article.append(el('h3', `${value(transfer.date)} · ${value(transfer.from_hy)} → ${value(transfer.to_hy)}`));
    const city = trip.cities.find(city => city.id === transfer.city);
    article.append(el('p', city ? `Տեղական ժամ · ${city.name_hy} · ${city.timezone}` : 'Տեղական ժամ, քաղաքը նշված չէ', 'timezone-note'));
    article.append(el('p', `Տնից ելք՝ ${timeText(transfer.leave_home_at)} · Տերմինալում լինել՝ ${timeText(transfer.target_at_terminal)}`));
    article.append(el('p', `Թռիչքի նշված ժամ՝ ${timeText(transfer.flight_time_local)} · Տերմինալ՝ ${value(transfer.terminal)}`));
    if (transfer.warning_hy) article.append(el('p', transfer.warning_hy, 'transfer-warning'));
    for (const option of list(transfer.options)) {
      const details = el('details', undefined, 'transfer-option'); details.open = option.rank === 'primary';
      const summary = el('summary', `${option.rank === 'primary' ? 'Հիմնական տարբերակ' : option.rank === 'backup' ? 'Պահուստային տարբերակ' : value(option.rank)} · ${option.label || 'ՉՍՏՈՒԳՎԱԾ'}`);
      const buffer = bufferState(option.buffer_min);
      const bufferText = buffer === 'unknown' ? 'Պահուստը դեռ հաշվարկված չէ' : `Տվյալներում նշված պահուստ՝ ${option.buffer_min} րոպե${buffer === 'short' ? '․ ԶԳՈՒՇԱՑՈՒՄ՝ 120 րոպեից պակաս' : ''}`;
      summary.append(el('span', bufferText, buffer === 'short' ? 'buffer-short' : 'buffer-note'));
      details.append(summary);
      details.append(el('p', `Ամբողջ ճանապարհը՝ ${minutes(option.total_min)} · խմբի գին՝ ${money(option.price_eur_group)}`));
      const steps = el('ol');
      for (const step of list(option.steps)) {
        const item = el('li');
        item.append(el('strong', `${value(step.from)} → ${value(step.to)}`));
        item.append(el('p', `${modes[step.mode] || value(step.mode)} · ${value(step.line)}`));
        item.append(el('p', `Մեկնում՝ ${timeText(step.depart)} · ժամանում՝ ${timeText(step.arrive)} · անձի գին՝ ${stepPrice(step)}`));
        item.append(el('p', `Տոմսը՝ ${value(step.where_to_buy_hy)}`));
        if (step.to) {
          const url = new URL(directions(step.to, step.mode));
          if (step.from) url.searchParams.set('origin', step.from);
          if (!modes[step.mode]) { url.searchParams.delete('travelmode'); item.append(el('p', 'Տրանսպորտի ռեժիմը ընտրեք Google Maps-ում։', 'fine')); }
          item.append(link('Բացել Google Maps-ում ↗', url.href));
        } else item.append(el('p', 'Նպատակակետը սպասվում է․ նավիգացիան դեռ հասանելի չէ։'));
        steps.append(item);
      }
      details.append(steps);
      const sources = el('div', undefined, 'source-links');
      list(option.sources).filter(safeUrl).forEach((source, i) => sources.append(link(`Աղբյուր ${i + 1} ↗`, safeUrl(source))));
      if (!sources.childElementCount) sources.append(el('span', 'Աղբյուրը սպասվում է։'));
      details.append(sources); article.append(details);
    }
    container.append(article);
  }
  for (const flight of trip.flights) {
    const article = el('article', undefined, 'flight-card');
    article.append(el('h3', `${value(flight.date)} · ${value(flight.from)} → ${value(flight.to)}`));
    article.append(el('p', `${value(flight.airline)} · ${flight.label || 'ՉՍՏՈՒԳՎԱԾ'}`));
    article.append(el('p', `Մեկնում՝ ${timeText(flight.depart_local)} (մեկնման վայրի տեղական ժամ)`));
    article.append(el('p', `Ժամանում՝ ${timeText(flight.arrive_local)} (ժամանման վայրի տեղական ժամ)`));
    if (flight.online_checkin_hy) {
      const block = el('section', undefined, 'online-checkin');
      block.append(el('h4', 'Առցանց գրանցում'), el('p', flight.online_checkin_hy)); article.append(block);
    }
    article.append(el('p', `Տերմինալ՝ ${value(flight.terminal)}`)); flightsNode.append(article);
  }
  if (!trip.flights.length) flightsNode.append(el('p', 'Չվերթների տվյալները սպասվում են։'));
}
