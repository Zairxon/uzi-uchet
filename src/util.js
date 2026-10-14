import { months } from './i18n.js';

export const DEF = {
  // Медицинская организация (юрлицо): налог с оборота недоступен (ст. 461 ч.2 п.14 НК), общий режим: НДС 12% + налог на прибыль (0% в социальной сфере, если ≥90% дохода от лицензированных медуслуг, ст. 59 и 337 НК).
  // Убыток прошлых лет переносится без ограничения срока и доли (ст. 333 НК, ЗРУ-741).
  tax: { regime: 'general', turnover: 4, profit: 15, vat: 12, social: true, ndfl: 12, inps: 0.1, soc: 12, lossYears: 100, lossLimit: 100 },
  staff: [],
  locked: {},
  log: [],
  cardFirm: false,
  assets: [],
  loan: { amount: 0, rate: 15, term: 84, grace: 24, start: '', purpose: '', purposeNote: '' },
  rent: { amount: 0, start: '', area: 117.37, minRate: 28400 },
};

export function clone(x) { return JSON.parse(JSON.stringify(x)); }
export function pad(n) { return String(n).padStart(2, '0'); }
export function today() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
export function idx(ym) { return +ym.slice(0, 4) * 12 + (+ym.slice(5, 7)) - 1; }
export function addM(ym, k) { const t = idx(ym) + k; return Math.floor(t / 12) + '-' + pad(t % 12 + 1); }
export function mName(ym) { return months()[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4); }
export function ymOf(d) { return (d || '').slice(0, 7); }
export function num(s) { const v = parseFloat(String(s == null ? '' : s).replace(/[\s  ]/g, '').replace(',', '.')); return isFinite(v) ? v : 0; }
export function fmt(n) { return Math.round(n || 0).toLocaleString('ru-RU'); }
export function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
export function merge(def, src) {
  const o = clone(def);
  if (!src) return o;
  Object.keys(src).forEach((k) => {
    if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) && src[k] && typeof src[k] === 'object') o[k] = merge(o[k], src[k]);
    else o[k] = clone(src[k]);
  });
  return o;
}

// Крупные суммы короче: 12 500 000 → «12,5 млн»
export function fmtM(n) {
  const a = Math.abs(n || 0);
  if (a < 1e6) return fmt(n);
  return (Math.round(n / 1e4) / 100).toString().replace('.', ',') + ' млн';
}
