import '@fontsource/onest/cyrillic-400.css';
import '@fontsource/onest/latin-400.css';
import '@fontsource/onest/cyrillic-500.css';
import '@fontsource/onest/latin-500.css';
import '@fontsource/onest/cyrillic-600.css';
import '@fontsource/onest/latin-600.css';
import '@fontsource/onest/cyrillic-700.css';
import '@fontsource/onest/latin-700.css';
import '@fontsource/jetbrains-mono/cyrillic-400.css';
import '@fontsource/jetbrains-mono/cyrillic-600.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import './style.css';
import heroUrl from './assets/hero.jpg';

import { registerSW } from 'virtual:pwa-register';
import { compute, payCalc } from './calc.js';
import * as store from './storage.js';
import * as sync from './sync.js';
import * as clinic from './clinic.js';
import { fmtPhoneInput, cleanPhone } from './phone.js';
import { t as T, getLang, setLang, brand } from './i18n.js';
import { mountFooter } from './footer.js';
import { parseDate, maskDate, openCal, closeCal } from './datepicker.js';
import { openSelect, closeSelect, askConfirm } from './ui.js';
import { TABS, CATS, vHome, vOps, vPay, vLoan, vRep, vSet, getP, setP, staffEff } from './views.js';
import { DEF, addM, clone, merge, mName, num, today, uid, ymOf } from './util.js';

var S = {
  cfg: clone(DEF), months: {}, M: ymOf(today()), tab: 'home', armed: null,
  theme: 'auto', repView: 'pl', clinic: { state: 'idle', rows: [], msg: '' }, info: { state: 'idle', s: null, d: [], msg: '', busy: false }, setTab: (function () { try { return localStorage.getItem('uzi-settab') || 'clinic'; } catch (e) { return 'clinic'; } })(), pp: { state: 'idle', s: null, svc: [], removed: [], setup: null, msg: '', busy: false }, sync: { enabled: sync.enabled, user: null, state: 'idle', msg: '', last: '', email: '', pass: '', busy: false },
  draft: { date: today(), type: 'income', cat: 'usl', amount: '', acct: 'cash', note: '' },
};
var db = false, ready = false, rendering = false;
try { var rv0 = localStorage.getItem('uzi-rep'); if (['pl', 'cash', 'bal', 'cmp'].indexOf(rv0) >= 0) S.repView = rv0; } catch (e) { /* без запоминания */ }
try { var t0 = localStorage.getItem('uzi-tab'); if (t0 && TABS.some(function (t) { return t[0] === t0; })) S.tab = t0; } catch (e) { /* без запоминания вкладки */ }

/* ---------- тема: как в системе → светлая → тёмная ---------- */
var THEMES = ['auto', 'light', 'dark'];
function getTheme() { try { var t = localStorage.getItem('uzi-theme'); return THEMES.indexOf(t) < 0 ? 'auto' : t; } catch (e) { return 'auto'; } }
function applyTheme(t) {
  var el = document.documentElement;
  if (t === 'auto') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', t);
  S.theme = t;
}
applyTheme(getTheme());

var SUN = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
var MOON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
function effDark() { var th = getTheme(); return th === 'dark' || (th === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }
function setChrome() {
  var l = getLang(), lb = document.getElementById('langbtn'), tb = document.getElementById('themebtn'); if (!lb || !tb) return;
  lb.textContent = l === 'ru' ? 'РУ' : l === 'uz' ? 'ЎЗ' : 'UZ';
  document.querySelectorAll('#langmenu button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.id === l)); });
  tb.innerHTML = effDark() ? SUN : MOON; tb.setAttribute('aria-label', T('Тема'));
}
document.addEventListener('click', function (ev) { var m = document.getElementById('langmenu'); if (m && !m.hidden && !ev.target.closest('#langmenu') && !ev.target.closest('#langbtn')) m.hidden = true; });
document.getElementById('hero').src = heroUrl;

/* ---------- storage ---------- */
function fail(e) {
  console.error(e);
  var q = e && (e.name === 'QuotaExceededError' || e.code === 22);
  toast(q ? T('Хранилище заполнено. Удалите старые записи.') : T('Не удалось сохранить. Скачайте резервную копию и перезапустите приложение.'));
}
function writeCfg() { if (db) store.saveConfig(S.cfg).then(queueSync).catch(fail); }
function writeMonth(m) { if (db) store.saveMonth(m, S.months[m]).then(queueSync).catch(fail); }
function saveCfg() { writeCfg(); render(); }
function saveMonth(m) { writeMonth(m); render(); }
function mdoc(m) { if (!S.months[m]) S.months[m] = { ops: [] }; if (!S.months[m].ops) S.months[m].ops = []; return S.months[m]; }
function toast(msg) { var el = document.getElementById('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 3500); }
function setStatus() {
  var el = document.getElementById('status'), y = S.sync;
  if (!el) return;
  if (!ready) { el.textContent = T('Подключение…'); el.className = 'chip'; }
  else if (!db) { el.textContent = T('Без сохранения: память браузера недоступна'); el.className = 'chip warn'; }
  else if (y.enabled && y.user && y.state === 'busy') { el.textContent = T('Синхронизация…'); el.className = 'chip'; }
  else if (y.enabled && y.user && y.state === 'error') { el.textContent = T('Не синхронизировано: {m}', { m: y.msg }); el.className = 'chip warn'; }
  else if (y.enabled && y.user) { el.textContent = y.last ? T('Синхронизировано в {t}', { t: y.last }) : T('Синхронизировано'); el.className = 'chip ok'; }
  else if (y.enabled) { el.textContent = T('Только на этом устройстве. Войдите для синхронизации'); el.className = 'chip warn'; }
  else { el.textContent = T('Данные сохраняются на этом устройстве'); el.className = 'chip ok'; }
}

/* ---------- синхронизация между устройствами ---------- */
var syncTimer = null, SYNC_EVERY = 30 * 60 * 1000; // чужие правки подтягиваются раз в полчаса
function hhmm() { var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); }; return p(d.getHours()) + ':' + p(d.getMinutes()); }
function queueSync() { if (!S.sync.user) return; clearTimeout(syncTimer); syncTimer = setTimeout(function () { doSync(false); }, 1500); }
function doSync(manual) {
  var y = S.sync; if (!y.enabled || !y.user || !db) return Promise.resolve();
  y.state = 'busy'; y.msg = ''; setStatus(); if (manual) render();
  return sync.syncNow().then(function (r) {
    y.state = 'ok'; y.last = hhmm(); y.at = Date.now();
    if (r && r.changed) return store.loadAll().then(function (got) { S.cfg = merge(DEF, got.cfg); S.months = got.months; });
  }).catch(function (e) {
    console.error(e); y.state = 'error'; y.msg = navigator.onLine ? sync.describeError(e) : T('нет сети');
  }).then(function () { render(); });
}
function authAction(kind) {
  var y = S.sync, email = (y.email || '').trim(), pass = y.pass || '';
  if (!email || !pass) { toast(T('Введите почту и пароль')); return; }
  if (pass.length < 8 && kind === 'up') { toast(T('Пароль: не меньше 8 символов')); return; }
  y.busy = true; render();
  (kind === 'up' ? sync.signUp(email, pass) : sync.signIn(email, pass).then(function () { return true; })).then(function (signedIn) {
    y.busy = false; y.pass = '';
    if (!signedIn) { toast(T('Мы отправили письмо. Подтвердите почту и нажмите «Войти»')); render(); return; }
    toast(T('Вход выполнен')); // пользователя выставит onAuth
  }).catch(function (e) { y.busy = false; render(); toast(e && e.message ? e.message : T('Не удалось войти')); });
}

/* ---------- доля врачей (данные Ресепшена) ---------- */
function loadClinic() {
  var c = S.clinic;
  if (!sync.enabled || !S.sync.user) { c.state = 'idle'; render(); return Promise.resolve(); }
  c.state = 'loading'; render();
  var r = clinic.monthRange(S.M);
  return clinic.role().then(function (role) {
    if (!role) { c.state = 'norole'; return null; }
    return clinic.share(r.from, r.to).then(function (rows) { c.rows = rows; c.state = 'ok'; });
  }).catch(function (e) { c.state = 'error'; c.msg = e && e.message ? e.message : String(e); }).then(function () { render(); });
}

/* ---------- данные клиники для Навбата и бота ---------- */
function mapCoords(url) {
  var a = /@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(url) || /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(url);
  if (a) return { lat: a[1], lng: a[2] };
  var b = /[?&](?:ll|pt)=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/.exec(url); // Яндекс: сначала долгота
  if (b) return { lat: b[2], lng: b[1] };
  var c = /[?&]q=(-?\d+\.\d+)(?:%2C|,)(-?\d+\.\d+)/.exec(url);
  return c ? { lat: c[1], lng: c[2] } : null;
}
function loadInfo() {
  var I = S.info;
  if (!sync.enabled || !S.sync.user) { I.state = 'idle'; render(); return Promise.resolve(); }
  I.state = 'loading'; render();
  return clinic.role().then(function (role) {
    if (!role) { I.state = 'norole'; return null; }
    return clinic.loadInfo().then(function (r) {
      var s = r.s; s.ph = (s.phones || []).slice(0, 3);
      s.lat = s.lat == null ? '' : String(s.lat).replace('.', ','); s.lng = s.lng == null ? '' : String(s.lng).replace('.', ',');
      s.perks_ru_t = (s.perks_ru || []).join('\n'); s.perks_uz_t = (s.perks_uz || []).join('\n');
      I.s = s; I.d = r.d; I.state = 'ok'; loadPrepay();
    });
  }).catch(function (e) { I.state = 'error'; I.msg = e && e.message ? e.message : String(e); }).then(function () { render(); });
}
function loadPrepay() {
  var P = S.pp; P.state = 'loading'; render();
  return clinic.loadPrepay().then(function (r) {
    P.s = r.s; P.svc = r.svc.map(function (x) { return { id: x.id, name_ru: x.name_ru, name_uz: x.name_uz || '', price: +x.price, percent: +x.percent, fixed: x.fixed == null ? '' : +x.fixed, active: x.active, sort: x.sort }; }); P.removed = []; P.setup = r.setup; P.state = 'ok';
  }).catch(function (e) { P.state = 'error'; P.msg = e && e.message ? e.message : String(e); }).then(function () { render(); });
}
function savePrepay() {
  var P = S.pp, s = P.s, digits = String(s.card_number || '').replace(/\D/g, ''), hold = parseInt(s.hold_minutes, 10);
  if (digits && digits.length !== 16) { toast(T('Номер карты: 16 цифр')); return; }
  if (!(hold >= 5 && hold <= 240)) { toast(T('Время удержания от 5 до 240 минут')); return; }
  for (var i = 0; i < P.svc.length; i++) { var x = P.svc[i]; if (!(x.name_ru || '').trim()) { toast(T('У каждой услуги нужно название')); return; } if (!(x.percent >= 0 && x.percent <= 100)) { toast(T('Процент от 0 до 100')); return; } }
  P.busy = true; render();
  clinic.savePrepay({ card_number: digits ? digits.replace(/(\d{4})(?=\d)/g, '$1 ') : null, card_holder: (s.card_holder || '').trim() || null, receipt_contact: (s.receipt_contact || '').trim() || null, hold_minutes: hold },
    P.svc.map(function (x, k) { return { id: x.id, name_ru: x.name_ru.trim(), name_uz: (x.name_uz || '').trim() || null, price: +x.price || 0, percent: +x.percent || 0, fixed: x.fixed === '' || x.fixed == null ? null : +x.fixed, active: true, sort: k + 1 }; }), P.removed)
    .then(function () { P.busy = false; toast(T('Сохранено: сайт и бот покажут новые данные')); return loadPrepay(); })
    .catch(function (e) { P.busy = false; render(); fail(e); });
}

function saveInfo() {
  var I = S.info, s = I.s, nz = function (x) { x = (x || '').trim(); return x ? x : null; }, lines = function (x) { return (x || '').split('\n').map(function (l) { return l.trim(); }).filter(Boolean); };
  var ll = function (x) { var n = parseFloat(String(x || '').replace(',', '.')); return isFinite(n) ? n : null; };
  var row = { address: nz(s.address), landmark_ru: nz(s.landmark_ru), landmark_uz: nz(s.landmark_uz), phones: s.ph.map(cleanPhone).filter(Boolean), map_url: nz(s.map_url), lat: ll(s.lat), lng: ll(s.lng), slogan_ru: nz(s.slogan_ru), slogan_uz: nz(s.slogan_uz), about_ru: nz(s.about_ru), about_uz: nz(s.about_uz), perks_ru: lines(s.perks_ru_t), perks_uz: lines(s.perks_uz_t) };
  if ((row.lat != null && Math.abs(row.lat) > 90) || (row.lng != null && Math.abs(row.lng) > 180)) { toast(T('Проверьте широту и долготу')); return; }
  I.busy = true; render();
  clinic.saveInfo(row, I.d.map(function (d) { return { id: d.id, specialty_ru: nz(d.specialty_ru), specialty_uz: nz(d.specialty_uz), bio_ru: nz(d.bio_ru), bio_uz: nz(d.bio_uz) }; }))
    .then(function () { I.busy = false; toast(T('Сохранено: сайт и бот покажут новые данные')); render(); })
    .catch(function (e) { I.busy = false; render(); fail(e); });
}

/* ---------- резервная копия ---------- */
function backupSave() {
  var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
  var name = 'uzi-uchet-' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '.json';
  store.downloadText(name, JSON.stringify(store.makeBackup(S.cfg, S.months), null, 2));
  toast(T('Копия скачана: {n}', { n: name }));
}
function backupLoad(file) {
  if (!file) return;
  file.text().then(function (text) {
    var b = store.parseBackup(text);
    var n = Object.keys(b.months).length;
    return askConfirm(T('Заменить все текущие данные данными из копии (месяцев: {n})? Текущие данные будут стёрты.', { n: n }), T('Заменить'), T('Отмена')).then(function (ok) {
      if (!ok) return null;
      return (db ? store.replaceAll(b.cfg, b.months) : Promise.resolve()).then(function () {
        S.cfg = merge(DEF, b.cfg); S.months = {};
        Object.keys(b.months).forEach(function (k) { var x = clone(b.months[k]); if (!x.ops) x.ops = []; S.months[k] = x; });
        render(); toast(T('Данные загружены из копии')); queueSync();
      });
    });
  }).catch(function (e) { toast(e && e.message ? e.message : T('Не удалось загрузить копию')); });
}

/* ---------- render ---------- */
function applyStatic() {
  var uz = getLang() !== 'ru';
  document.title = brand() + ': ' + T('Главный'); document.querySelector('.hero-title').textContent = brand();
  document.getElementById('hero-sub').textContent = T('Главный'); setChrome(); mountFooter(T('Главный'));
  document.querySelector('[data-act=prev]').setAttribute('aria-label', T('Предыдущий месяц'));
  document.querySelector('[data-act=next]').setAttribute('aria-label', T('Следующий месяц'));
  applyTheme(getTheme());
  if (!ready) document.getElementById('view').innerHTML = '<p class="empty">' + T('Загружаю данные. Здесь появятся выручка, расходы, зарплата, кредит и отчёты за выбранный месяц.') + '</p>';
}
function render() {
  closeCal(); closeSelect();
  applyStatic();
  document.getElementById('mlabel').textContent = mName(S.M); setStatus();
  document.getElementById('tabs').innerHTML = TABS.map(function (t) { return '<button class="tab" role="tab" data-act="tab" data-id="' + t[0] + '" aria-selected="' + (S.tab === t[0]) + '">' + T(t[1]) + '</button>'; }).join('');
  if (!ready) return;
  var ae = document.activeElement, keep = null, view = document.getElementById('view');
  if (ae && ae.id && view.contains(ae)) keep = { id: ae.id, v: ae.value, s: ae.selectionStart, e: ae.selectionEnd, tag: ae.tagName };
  var tab = S.tab, C = (tab === 'home' || tab === 'rep') ? compute(S.cfg, S.months, S.M) : null;
  rendering = true;
  view.innerHTML = tab === 'home' ? vHome(S, C) : tab === 'ops' ? vOps(S) : tab === 'pay' ? vPay(S) : tab === 'loan' ? vLoan(S) : tab === 'rep' ? vRep(S, C) : vSet(S);
  setStatus();
  rendering = false;
  var fr = view.querySelector('[data-focus]');
  if (fr) { var sc = fr.closest('.scroll'); if (sc) sc.scrollTop += fr.getBoundingClientRect().top - sc.getBoundingClientRect().top - 78; }
  if (keep) {
    var el = document.getElementById(keep.id); if (el) {
      el.focus({ preventScroll: true });
      if (keep.tag === 'INPUT' && el.type === 'text') { el.value = keep.v; try { el.setSelectionRange(keep.s, keep.e); } catch (e) { /* не у всех типов */ } }
    }
  }
}

/* ---------- events ---------- */
document.addEventListener('click', function (ev) {
  var sb = ev.target.closest('.sel-btn');
  if (sb) { openSelect(sb); return; }
  var cb = ev.target.closest('[data-cal]');
  if (cb) { var ci = document.getElementById(cb.dataset.cal); if (ci) openCal(ci); return; }
  var b = ev.target.closest('[data-act]'); if (!b) return; var act = b.dataset.act, id = b.dataset.id;
  if (act.indexOf('del-') === 0) {
    if (S.armed !== act + id) { S.armed = act + id; render(); return; } S.armed = null;
    if (act === 'del-op') { var d = mdoc(S.M); d.ops = d.ops.filter(function (o) { return o.id !== id; }); saveMonth(S.M); }
    else if (act === 'del-staff') { S.cfg.staff = S.cfg.staff.filter(function (s) { return s.id !== id; }); saveCfg(); }
    else if (act === 'del-asset') { S.cfg.assets = S.cfg.assets.filter(function (a) { return a.id !== id; }); saveCfg(); }
    return;
  }
  S.armed = null;
  if (act === 'rep-view') { S.repView = id; try { localStorage.setItem('uzi-rep', id); } catch (e) { /* не страшно */ } render(); }
  else if (act === 'lang-set') { setLang(id); document.getElementById('langmenu').hidden = true; render(); }
  else if (act === 'lang-menu') { var lm = document.getElementById('langmenu'); lm.hidden = !lm.hidden; }
  else if (act === 'theme-flip') { var nx = effDark() ? 'light' : 'dark'; try { localStorage.setItem('uzi-theme', nx); } catch (e) { /* не страшно */ } applyTheme(nx); render(); }
  else if (act === 'theme-set') { try { localStorage.setItem('uzi-theme', id); } catch (e) { /* не страшно */ } applyTheme(id); render(); }
  else if (act === 'prev') { S.M = addM(S.M, -1); render(); if (S.tab === 'pay') loadClinic(); }
  else if (act === 'next') { S.M = addM(S.M, 1); render(); if (S.tab === 'pay') loadClinic(); }
  else if (act === 'tab') { S.tab = id; try { localStorage.setItem('uzi-tab', S.tab); } catch (e) { /* не страшно */ } render(); window.scrollTo(0, 0); if (id === 'pay') loadClinic(); if (id === 'set' && S.info.state !== 'ok') loadInfo(); }
  else if (act === 'type') { S.draft.type = id; S.draft.cat = CATS[id][0][0]; render(); }
  else if (act === 'set-tab') { S.setTab = id; try { localStorage.setItem('uzi-settab', id); } catch (e) { /* не страшно */ } render(); window.scrollTo(0, 0); }
  else if (act === 'info-save') saveInfo();
  else if (act === 'pp-save') savePrepay();
  else if (act === 'pp-add') { S.pp.svc.push({ id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : uid() + uid() + uid(), name_ru: '', name_uz: '', price: 0, percent: 30, fixed: '', active: true, sort: S.pp.svc.length + 1 }); render(); }
  else if (act === 'pp-del') { var dx = S.pp.svc.splice(+id, 1)[0]; if (dx) S.pp.removed.push(dx.id); render(); }
  else if (act === 'loan-toggle') { S.loanOpen = !S.loanOpen; render(); }
  else if (act === 'accrue') { if (!S.cfg.staff.length) return; if (S.cfg.staff.some(function (s) { return s.pct > 0; }) && S.clinic.state !== 'ok') { toast(T('Данные Ресепшена ещё не загружены: от них считается процент сотрудников')); return; } mdoc(S.M).payroll = payCalc(staffEff(S), S.cfg.tax); saveMonth(S.M); toast(T('Зарплата за {m} начислена', { m: mName(S.M).toLowerCase() })); }
  else if (act === 'unaccrue') { mdoc(S.M).payroll = null; saveMonth(S.M); }
  else if (act === 'add-staff') { S.cfg.staff.push({ id: uid(), name: '', role: '', salary: 0 }); saveCfg(); }
  else if (act === 'add-asset') { S.cfg.assets.push({ id: uid(), name: '', cost: 0, date: today(), life: 60, acct: 'bank' }); saveCfg(); }
  else if (act === 'sync-login') authAction('in');
  else if (act === 'sync-signup') authAction('up');
  else if (act === 'sync-now') doSync(true);
  else if (act === 'sync-logout') { sync.signOut().then(function () { S.sync.user = null; S.sync.state = 'idle'; render(); toast(T('Вы вышли. Данные остались на этом устройстве')); }); }
  else if (act === 'backup-save') backupSave();
  else if (act === 'backup-load') { var fi = document.getElementById('backup-file'); if (fi) fi.click(); }
});
document.addEventListener('input', function (ev) {
  var el = ev.target;
  if (el.dataset.kind === 'money') { var dg = el.value.replace(/\D/g, ''); el.value = dg ? Number(dg).toLocaleString('ru-RU') : ''; }
  if (el.dataset.kind === 'date') el.value = maskDate(el.value);
  if (el.dataset.d) S.draft[el.dataset.d] = el.dataset.kind === 'date' ? parseDate(el.value) : el.value;
  if (el.dataset.info && S.info.s) S.info.s[el.dataset.info] = el.value;
  if (el.dataset.pp && S.pp.s) { if (el.dataset.pp === 'card_number') { var cd = el.value.replace(/\D/g, '').slice(0, 16); el.value = cd.replace(/(\d{4})(?=\d)/g, '$1 '); } S.pp.s[el.dataset.pp] = el.value; }
  if (el.dataset.psvc && S.pp.svc.length) {
    var pq = el.dataset.psvc.split(':'), row = S.pp.svc[+pq[0]], pk = el.dataset.pk;
    if (row) { if (pk === 'money') { var md = el.value.replace(/\D/g, ''); el.value = md ? Number(md).toLocaleString('ru-RU') : ''; row[pq[1]] = md ? +md : (pq[1] === 'fixed' ? '' : 0); } else if (pk === 'num') row[pq[1]] = num(el.value); else row[pq[1]] = el.value; }
  }
  if (el.dataset.iph !== undefined && S.info.s) { var pd = ev.inputType && ev.inputType.indexOf('delete') === 0; el.value = fmtPhoneInput(el.value, pd); S.info.s.ph[+el.dataset.iph] = el.value; }
  if (el.dataset.idoc && S.info.d.length) { var pr = el.dataset.idoc.split(':'); S.info.d[+pr[0]][pr[1]] = el.value; }
  if (el.id === 'sync-email') S.sync.email = el.value;
  if (el.id === 'sync-pass') S.sync.pass = el.value;
});
function validDate(s) { return /^(20\d\d|2100)-\d{2}-\d{2}$/.test(s); }
document.addEventListener('change', function (ev) {
  var el = ev.target;
  if (el.id === 'backup-file') { var f = el.files && el.files[0]; el.value = ''; backupLoad(f); return; }
  if (el.dataset.pct) {
    var pv = num(el.value);
    if (!(pv >= 0 && pv <= 100)) { toast(T('Процент от 0 до 100')); render(); return; }
    clinic.setPercent(el.dataset.pct, pv).then(loadClinic).catch(fail);
    return;
  }
  if (el.dataset.days) { var dd = mdoc(S.M); dd.days = dd.days || {}; dd.days[el.dataset.days] = num(el.value); saveMonth(S.M); return; }
  if (el.dataset.info === 'map_url' && S.info.s) { var mc = mapCoords(el.value); if (mc) { S.info.s.lat = mc.lat.replace('.', ','); S.info.s.lng = mc.lng.replace('.', ','); render(); } return; }
  var p = el.dataset.bind; if (!p) return;
  var k = el.dataset.kind, v = (k === 'money' || k === 'num') ? num(el.value) : el.value;
  if (k === 'date') {
    var iso = parseDate(el.value);
    if (el.value.trim() && !iso) { toast(T('Введите дату в формате дд.мм.гггг, год от 2000 до 2100')); render(); return; }
    v = iso;
  }
  if (getP(S.cfg, p) === v) return; setP(S.cfg, p, v);
  var m = p.match(/^staff\.(\d+)\./); if (m && S.cfg.staff[m[1]]) delete S.cfg.staff[m[1]].example;
  writeCfg(); setTimeout(render, 0);
});
document.addEventListener('focusin', function (ev) { var el = ev.target; if (el.dataset && el.dataset.iph !== undefined && !el.value) { el.value = '+998 '; S.info.s.ph[+el.dataset.iph] = el.value; } });
document.addEventListener('focusout', function (ev) { var el = ev.target; if (el.dataset && el.dataset.iph !== undefined && el.value.replace(/\D/g, '') === '998') { el.value = ''; S.info.s.ph[+el.dataset.iph] = ''; } });
document.addEventListener('submit', function (ev) {
  if (ev.target.id !== 'opform') return; ev.preventDefault();
  var dr = S.draft, a = num(dr.amount); if (!a || a < 0) { toast(T('Введите сумму больше нуля')); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dr.date)) { toast(T('Укажите дату')); return; }
  if (!validDate(dr.date)) { toast(T('Проверьте год в дате')); return; }
  var m = ymOf(dr.date); mdoc(m).ops.push({ id: uid(), d: dr.date, t: dr.type, c: dr.cat, a: a, acct: dr.acct, n: dr.note.trim() });
  dr.amount = ''; dr.note = ''; var moved = m !== S.M; S.M = m; saveMonth(m);
  toast(moved ? T('Добавлено. Открыт {m}', { m: mName(m).toLowerCase() }) : T('Добавлено'));
});

/* ---------- boot ---------- */
function start() { ready = true; render(); }
render();
registerSW({ immediate: true });
(async function () {
  try {
    await store.init();
    var got = await store.loadAll();
    S.cfg = merge(DEF, got.cfg); S.months = got.months; db = true;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () { /* необязательно */ });
  } catch (e) { console.error(e); db = false; }
  start();
  if (sync.enabled && db) {
    S.sync.user = await sync.getUser();
    sync.onAuth(function (u) {
      var was = S.sync.user && S.sync.user.id;
      S.sync.user = u; if (!u) S.info.state = 'idle'; render(); if (u && S.tab === 'set') loadInfo();
      if (u && (!was || was !== u.id)) { doSync(false); if (S.tab === 'pay') loadClinic(); }
    });
    if (S.sync.user) { doSync(false); if (S.tab === 'pay') loadClinic(); if (S.tab === 'set') loadInfo(); } else render();
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && Date.now() - (S.sync.at || 0) > SYNC_EVERY) doSync(false); });
    window.addEventListener('online', function () { doSync(false); });
    setInterval(function () { if (document.visibilityState === 'visible' && navigator.onLine) doSync(false); }, SYNC_EVERY);
  }
})();

