// Кнопка «Установить как приложение» вверху страницы: показывается, пока приложение открыто в браузере, а не установлено на телефон.
import { t } from './i18n.js';

let ev = null, closed = false;
const standalone = () => !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
try { closed = Date.now() < Number(localStorage.getItem('inst-hide') || 0); } catch (e) { /* без хранилища */ }

export function drawInstall() {
  let el = document.getElementById('instbar');
  const show = !standalone() && !closed && (ev || ios());
  if (!show) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div'); el.id = 'instbar'; document.body.insertBefore(el, document.body.firstChild);
    el.addEventListener('click', async (e) => {
      if (e.target.closest('#instx')) { closed = true; try { localStorage.setItem('inst-hide', String(Date.now() + 7 * 864e5)); } catch (x) { /* без хранилища */ } drawInstall(); return; }
      if (e.target.closest('#instgo') && ev) { const p = ev; ev = null; p.prompt(); try { await p.userChoice; } catch (x) { /* закрыли окно */ } drawInstall(); }
    });
  }
  el.innerHTML = ev
    ? '<button type="button" id="instgo" class="instgo">📲 ' + t('Установить как приложение') + '</button><button type="button" id="instx" class="instx" aria-label="' + t('Закрыть') + '">×</button>'
    : '<span class="insthint">📲 ' + t('Safari: «Поделиться» → «На экран Домой»') + '</span><button type="button" id="instx" class="instx" aria-label="' + t('Закрыть') + '">×</button>';
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); ev = e; drawInstall(); });
window.addEventListener('appinstalled', () => { ev = null; drawInstall(); });
