// Свой выбор даты: поле «дд.мм.гггг» с маской и календарь в цветах приложения.
// Системный календарь браузера нельзя ни перекрасить, ни уменьшить, поэтому он не используется.
import { t, months, weekdays } from './i18n.js';

export function fmtDate(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.' + iso.slice(0, 4) : '';
}

// Показанный текст -> 'ГГГГ-ММ-ДД' или '' (не дата, год вне 2000–2100, 31 февраля)
export function parseDate(s) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec((s || '').trim());
  if (!m) return '';
  const d = +m[1], mo = +m[2], y = +m[3];
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1) return '';
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return '';
  return m[3] + '-' + m[2] + '-' + m[1];
}

// Набор цифр превращается в дд.мм.гггг
export function maskDate(s) {
  const d = String(s || '').replace(/\D/g, '').slice(0, 8);
  return d.slice(0, 2) + (d.length > 2 ? '.' + d.slice(2, 4) : '') + (d.length > 4 ? '.' + d.slice(4) : '');
}

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

let pop = null, target = null, vy = 0, vm = 0;

function ensure() {
  if (pop) return;
  pop = document.createElement('div');
  pop.className = 'cal'; pop.hidden = true;
  document.body.appendChild(pop);
  pop.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b || !target) return;
    const c = b.dataset.c;
    if (c === 'py') vy--; else if (c === 'ny') vy++;
    else if (c === 'pm') { vm--; if (vm < 0) { vm = 11; vy--; } }
    else if (c === 'nm') { vm++; if (vm > 11) { vm = 0; vy++; } }
    else if (c === 'day') { pick(b.dataset.d); return; }
    else if (c === 'today') { pick(iso(new Date())); return; }
    else if (c === 'clear') { pick(''); return; }
    vy = Math.min(2100, Math.max(2000, vy));
    draw();
  });
  document.addEventListener('pointerdown', (ev) => {
    if (pop.hidden) return;
    if (!pop.contains(ev.target) && !(ev.target.closest && ev.target.closest('[data-cal]'))) closeCal();
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeCal(); });
  window.addEventListener('resize', closeCal);
  window.addEventListener('scroll', () => { if (!pop.hidden) closeCal(); }, true);
}

function pick(value) {
  if (!target) return;
  const el = target;
  el.value = fmtDate(value);
  closeCal();
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function draw() {
  const sel = parseDate(target.value), today = iso(new Date());
  const first = new Date(vy, vm, 1), lead = (first.getDay() + 6) % 7; // неделя с понедельника
  let h = '<div class="cal-h"><button type="button" data-c="py" aria-label="−">«</button><button type="button" data-c="pm" aria-label="‹">‹</button>' +
    '<b>' + months()[vm] + ' ' + vy + '</b>' +
    '<button type="button" data-c="nm" aria-label="›">›</button><button type="button" data-c="ny" aria-label="+">»</button></div>' +
    '<div class="cal-g">' + weekdays().map((w) => '<i>' + w + '</i>').join('');
  for (let i = 0; i < 42; i++) {
    const d = new Date(vy, vm, 1 - lead + i), s = iso(d);
    h += '<button type="button" data-c="day" data-d="' + s + '" class="cal-d' + (d.getMonth() !== vm ? ' out' : '') + (s === today ? ' now' : '') + (s === sel ? ' on' : '') + '">' + d.getDate() + '</button>';
  }
  h += '</div><div class="cal-f"><button type="button" data-c="today">' + t('Сегодня') + '</button>' +
    (target.dataset.optional ? '<button type="button" data-c="clear">' + t('Очистить') + '</button>' : '') + '</div>';
  pop.innerHTML = h;
}

function place() {
  const r = target.getBoundingClientRect(), w = pop.offsetWidth, hh = pop.offsetHeight;
  let top = r.bottom + 4;
  if (top + hh > innerHeight - 8) top = Math.max(8, r.top - hh - 4);
  pop.style.left = Math.min(Math.max(8, r.left), Math.max(8, innerWidth - w - 8)) + 'px';
  pop.style.top = top + 'px';
}

export function openCal(input) {
  ensure();
  if (!pop.hidden && target === input) { closeCal(); return; }
  target = input;
  const base = parseDate(input.value) || iso(new Date());
  vy = +base.slice(0, 4); vm = +base.slice(5, 7) - 1;
  draw(); pop.hidden = false; place();
}

export function closeCal() {
  if (pop) pop.hidden = true;
  target = null;
}
