export function timeText(value) {
  if (value == null || value === '') return 'սպասվում է';
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})(?::\d{2})?$/.exec(value);
  return match ? `${match[3]}.${match[2]} · ${match[4]}` : String(value);
}
export function money(value) {
  return value == null ? 'սպասվում է' : `${value.toFixed(2).replace('.', ',')} €`;
}
export function stepPrice(step) {
  if (step.price_eur_person === 0) return /նույն[^։.]*տոմս/i.test(step.where_to_buy_hy || '') ? 'ներառված է' : '0 €';
  return money(step.price_eur_person);
}
export const minutes = value => value == null ? 'սպասվում է' : `${value} րոպե`;
// Localize the decimal separator without introducing rounding or grouping.
export const distanceNumber = value => String(value).replace('.', ',');
