// Нижняя панель: когда собрана эта версия и кнопка «Обновить». Если на сервере уже лежит более новая сборка, кнопка выделяется.
import { t } from './i18n.js';
import { drawInstall } from './install.js';

const BUILD = typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev';
let name = '', newer = false, started = false, busy = false;
const stamp = (iso) => { const d = new Date(Date.parse(iso) + 5 * 3600e3); return Number.isFinite(+d) ? d.toISOString().slice(8, 10) + '.' + d.toISOString().slice(5, 7) + ' ' + d.toISOString().slice(11, 16) : iso; };

export async function hardRefresh() {
  newer = false; busy = true; drawFooter(); // надпись «есть новая версия» исчезает сразу
  try { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map((r) => r.unregister())); } catch (e) { /* без service worker */ }
  try { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); } catch (e) { /* без кэша */ }
  const u = new URL(location.href); u.searchParams.set('u', Date.now()); location.replace(u.toString()); // новый адрес: обходим кэш браузера
}
export function drawFooter() {
  drawInstall();
  let el = document.getElementById('appfoot');
  if (!el) { el = document.createElement('footer'); el.id = 'appfoot'; document.body.appendChild(el); el.addEventListener('click', (ev) => { if (ev.target.closest('#fup')) hardRefresh(); }); }
  el.innerHTML = '<span class="fv">' + name + ' · ' + t('Версия') + ' ' + stamp(BUILD) + '</span>' + (newer || busy ? '<button type="button" id="fup" class="fup' + (newer ? ' new' : '') + '"' + (busy ? ' disabled' : '') + '>' + t(busy ? 'Обновляю…' : newer ? 'Обновить: есть новая версия' : 'Обновить') + '</button>' : '');
}
async function check() {
  try {
    const r = await fetch('./version.json?' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
    const j = await r.json(); const n = !!j.build && BUILD !== 'dev' && j.build !== BUILD;
    if (n !== newer) { newer = n; drawFooter(); }
  } catch (e) { /* нет сети */ }
}
export function mountFooter(appName) {
  name = appName; drawFooter();
  if (started) return; started = true;
  check(); setInterval(check, 5 * 60e3);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
}
