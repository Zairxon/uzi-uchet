// Свои элементы вместо системных: выпадающий список и окно подтверждения, в цветах приложения.
import { esc } from './util.js';

/* ---------- выпадающий список ---------- */
// Кнопка <button class="sel-btn" value="…" data-opts='[["значение","подпись"],…]'> открывает список.
let lp = null, lt = null, openedAt = 0;

function ensure() {
  if (lp) return;
  lp = document.createElement('div');
  lp.className = 'opt-pop'; lp.hidden = true; lp.setAttribute('role', 'listbox');
  document.body.appendChild(lp);
  lp.addEventListener('click', (ev) => {
    const o = ev.target.closest('.opt'); if (!o || !lt) return;
    const btn = lt;
    btn.value = o.dataset.v;
    const lab = btn.querySelector('span'); if (lab) lab.textContent = o.textContent;
    closeSelect();
    btn.focus({ preventScroll: true });
    btn.dispatchEvent(new Event('input', { bubbles: true }));
    btn.dispatchEvent(new Event('change', { bubbles: true }));
  });
  lp.addEventListener('keydown', (ev) => {
    const items = [...lp.querySelectorAll('.opt')], i = items.indexOf(document.activeElement);
    if (ev.key === 'ArrowDown') { ev.preventDefault(); (items[i + 1] || items[0]).focus(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
    else if (ev.key === 'Escape' || ev.key === 'Tab') { const b = lt; closeSelect(); if (b) b.focus({ preventScroll: true }); }
  });
  document.addEventListener('pointerdown', (ev) => {
    if (lp.hidden) return;
    if (!lp.contains(ev.target) && !(ev.target.closest && ev.target.closest('.sel-btn'))) closeSelect();
  });
  let w0 = innerWidth;
  // высота экрана на телефоне «прыгает» вместе с адресной строкой и клавиатурой: закрываем только при смене ширины
  window.addEventListener('resize', () => { if (innerWidth !== w0) { w0 = innerWidth; closeSelect(); } });
  window.addEventListener('scroll', (ev) => { if (!lp.hidden && Date.now() - openedAt > 250 && !(ev.target.nodeType === 1 && lp.contains(ev.target))) closeSelect(); }, true);
  document.addEventListener('ui:popup', (ev) => { if (ev.detail !== 'sel') closeSelect(); });
}

export function openSelect(btn) {
  ensure();
  if (!lp.hidden && lt === btn) { closeSelect(); return; }
  document.dispatchEvent(new CustomEvent('ui:popup', { detail: 'sel' }));
  let opts = [];
  try { opts = JSON.parse(btn.dataset.opts || '[]'); } catch (e) { /* пустой список */ }
  lt = btn; openedAt = Date.now();
  lp.innerHTML = opts.map((o) => '<button type="button" role="option" class="opt' + (o[0] === btn.value ? ' on' : '') + '" data-v="' + esc(o[0]) + '">' + esc(o[1]) + '</button>').join('');
  lp.style.minWidth = btn.offsetWidth + 'px';
  lp.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  const r = btn.getBoundingClientRect(), w = lp.offsetWidth, h = lp.offsetHeight;
  let top = r.bottom + 4;
  if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 4);
  lp.style.left = Math.min(Math.max(8, r.left), Math.max(8, innerWidth - w - 8)) + 'px';
  lp.style.top = top + 'px';
  const on = lp.querySelector('.opt.on') || lp.querySelector('.opt');
  if (on) on.focus({ preventScroll: true });
  if (on) on.scrollIntoView({ block: 'nearest' });
}

export function closeSelect() {
  if (lp) lp.hidden = true;
  if (lt) lt.removeAttribute('aria-expanded');
  lt = null;
}

/* ---------- окно подтверждения ---------- */
export function askConfirm(message, okLabel, cancelLabel) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'modal';
    ov.innerHTML = '<div class="modal-card" role="dialog" aria-modal="true"><p>' + esc(message) + '</p>' +
      '<div class="row"><button type="button" class="btn" data-k="ok">' + esc(okLabel) + '</button><button type="button" class="btn ghost" data-k="no">' + esc(cancelLabel) + '</button></div></div>';
    document.body.appendChild(ov);
    const done = (v) => { ov.remove(); document.removeEventListener('keydown', kd); resolve(v); };
    const kd = (e) => { if (e.key === 'Escape') done(false); };
    document.addEventListener('keydown', kd);
    ov.addEventListener('click', (e) => {
      const k = e.target.closest('[data-k]');
      if (k) done(k.dataset.k === 'ok'); else if (e.target === ov) done(false);
    });
    ov.querySelector('[data-k="no"]').focus();
  });
}
