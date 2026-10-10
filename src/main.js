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

import { registerSW } from 'virtual:pwa-register';
import { compute, payCalc } from './calc.js';
import * as store from './storage.js';
import * as sync from './sync.js';
import { TABS, CATS, vHome, vOps, vPay, vLoan, vRep, vSet, getP, setP } from './views.js';
import { DEF, addM, clone, merge, mName, num, today, uid, ymOf } from './util.js';

var S = {
  cfg: clone(DEF), months: {}, M: ymOf(today()), tab: 'home', armed: null,
  sync: { enabled: sync.enabled, user: null, state: 'idle', msg: '', last: '', email: '', pass: '', busy: false },
  draft: { date: today(), type: 'income', cat: 'usl', amount: '', acct: 'cash', note: '' },
};
var db = false, ready = false, rendering = false;
try { var t0 = localStorage.getItem('uzi-tab'); if (t0 && TABS.some(function (t) { return t[0] === t0; })) S.tab = t0; } catch (e) { /* без запоминания вкладки */ }

/* ---------- тема: как в системе → светлая → тёмная ---------- */
var THEMES = ['auto', 'light', 'dark'];
function getTheme() { try { var t = localStorage.getItem('uzi-theme'); return THEMES.indexOf(t) < 0 ? 'auto' : t; } catch (e) { return 'auto'; } }
function applyTheme(t) {
  var el = document.documentElement;
  if (t === 'auto') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', t);
  var dark = t === 'dark' || (t === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var b = document.getElementById('theme');
  if (b) {
    b.textContent = t === 'auto' ? '◐' : dark ? '☾' : '☀';
    b.title = 'Тема: ' + (t === 'auto' ? 'как в системе' : dark ? 'тёмная' : 'светлая') + '. Нажмите, чтобы сменить';
    b.setAttribute('aria-label', b.title);
  }
}
applyTheme(getTheme());

/* ---------- storage ---------- */
function fail(e) {
  console.error(e);
  var q = e && (e.name === 'QuotaExceededError' || e.code === 22);
  toast(q ? 'Хранилище заполнено. Удалите старые записи.' : 'Не удалось сохранить. Скачайте резервную копию и перезапустите приложение.');
}
function writeCfg() { if (db) store.saveConfig(S.cfg).then(queueSync).catch(fail); }
function writeMonth(m) { if (db) store.saveMonth(m, S.months[m]).then(queueSync).catch(fail); }
function saveCfg() { writeCfg(); render(); }
function saveMonth(m) { writeMonth(m); render(); }
function mdoc(m) { if (!S.months[m]) S.months[m] = { ops: [] }; if (!S.months[m].ops) S.months[m].ops = []; return S.months[m]; }
function toast(msg) { var el = document.getElementById('toast'); el.textContent = msg; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 3500); }
function setStatus() {
  var el = document.getElementById('status'), y = S.sync;
  if (!ready) { el.textContent = 'Подключение…'; el.className = 'chip'; }
  else if (!db) { el.textContent = 'Без сохранения: память браузера недоступна'; el.className = 'chip warn'; }
  else if (y.enabled && y.user && y.state === 'busy') { el.textContent = 'Синхронизация…'; el.className = 'chip'; }
  else if (y.enabled && y.user && y.state === 'error') { el.textContent = 'Не синхронизировано: ' + y.msg; el.className = 'chip warn'; }
  else if (y.enabled && y.user) { el.textContent = 'Синхронизировано' + (y.last ? ' в ' + y.last : ''); el.className = 'chip ok'; }
  else if (y.enabled) { el.textContent = 'Только на этом устройстве. Войдите в «Настройках» для синхронизации'; el.className = 'chip warn'; }
  else { el.textContent = 'Данные сохраняются на этом устройстве'; el.className = 'chip ok'; }
}

/* ---------- синхронизация между устройствами ---------- */
var syncTimer = null;
function hhmm() { var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); }; return p(d.getHours()) + ':' + p(d.getMinutes()); }
function queueSync() { if (!S.sync.user) return; clearTimeout(syncTimer); syncTimer = setTimeout(function () { doSync(false); }, 1500); }
function doSync(manual) {
  var y = S.sync; if (!y.enabled || !y.user || !db) return Promise.resolve();
  y.state = 'busy'; y.msg = ''; setStatus(); if (manual) render();
  return sync.syncNow().then(function (r) {
    y.state = 'ok'; y.last = hhmm();
    if (r && r.changed) return store.loadAll().then(function (got) { S.cfg = merge(DEF, got.cfg); S.months = got.months; });
  }).catch(function (e) {
    console.error(e); y.state = 'error'; y.msg = navigator.onLine ? sync.describeError(e) : 'нет сети';
  }).then(function () { render(); });
}
function authAction(kind) {
  var y = S.sync, email = (y.email || '').trim(), pass = y.pass || '';
  if (!email || !pass) { toast('Введите почту и пароль'); return; }
  if (pass.length < 8 && kind === 'up') { toast('Пароль: не меньше 8 символов'); return; }
  y.busy = true; render();
  (kind === 'up' ? sync.signUp(email, pass) : sync.signIn(email, pass).then(function () { return true; })).then(function (signedIn) {
    y.busy = false; y.pass = '';
    if (!signedIn) { toast('Мы отправили письмо. Подтвердите почту и нажмите «Войти»'); render(); return; }
    toast('Вход выполнен'); // пользователя выставит onAuth
  }).catch(function (e) { y.busy = false; render(); toast(e && e.message ? e.message : 'Не удалось войти'); });
}

/* ---------- резервная копия ---------- */
function backupSave() {
  var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
  var name = 'uzi-uchet-' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '.json';
  store.downloadText(name, JSON.stringify(store.makeBackup(S.cfg, S.months), null, 2));
  toast('Копия скачана: ' + name);
}
function backupLoad(file) {
  if (!file) return;
  file.text().then(function (text) {
    var b = store.parseBackup(text);
    var n = Object.keys(b.months).length;
    if (!window.confirm('Заменить все текущие данные данными из копии (месяцев: ' + n + ')? Текущие данные будут стёрты.')) return null;
    return (db ? store.replaceAll(b.cfg, b.months) : Promise.resolve()).then(function () {
      S.cfg = merge(DEF, b.cfg); S.months = {};
      Object.keys(b.months).forEach(function (k) { var x = clone(b.months[k]); if (!x.ops) x.ops = []; S.months[k] = x; });
      render(); toast('Данные загружены из копии'); queueSync();
    });
  }).catch(function (e) { toast(e && e.message ? e.message : 'Не удалось загрузить копию'); });
}

/* ---------- render ---------- */
function render() {
  document.getElementById('mlabel').textContent = mName(S.M); setStatus();
  document.getElementById('tabs').innerHTML = TABS.map(function (t) { return '<button class="tab" role="tab" data-act="tab" data-id="' + t[0] + '" aria-selected="' + (S.tab === t[0]) + '">' + t[1] + '</button>'; }).join('');
  if (!ready) return;
  var ae = document.activeElement, keep = null, view = document.getElementById('view');
  if (ae && ae.id && view.contains(ae)) keep = { id: ae.id, v: ae.value, s: ae.selectionStart, e: ae.selectionEnd, tag: ae.tagName };
  var tab = S.tab, C = (tab === 'home' || tab === 'rep') ? compute(S.cfg, S.months, S.M) : null;
  rendering = true;
  view.innerHTML = tab === 'home' ? vHome(S, C) : tab === 'ops' ? vOps(S) : tab === 'pay' ? vPay(S) : tab === 'loan' ? vLoan(S) : tab === 'rep' ? vRep(S, C) : vSet(S);
  rendering = false;
  if (keep) {
    var el = document.getElementById(keep.id); if (el) {
      el.focus({ preventScroll: true });
      if (keep.tag === 'INPUT' && el.type === 'text') { el.value = keep.v; try { el.setSelectionRange(keep.s, keep.e); } catch (e) { /* не у всех типов */ } }
    }
  }
}

/* ---------- events ---------- */
document.addEventListener('click', function (ev) {
  var b = ev.target.closest('[data-act]'); if (!b) return; var act = b.dataset.act, id = b.dataset.id;
  if (act.indexOf('del-') === 0) {
    if (S.armed !== act + id) { S.armed = act + id; render(); return; } S.armed = null;
    if (act === 'del-op') { var d = mdoc(S.M); d.ops = d.ops.filter(function (o) { return o.id !== id; }); saveMonth(S.M); }
    else if (act === 'del-staff') { S.cfg.staff = S.cfg.staff.filter(function (s) { return s.id !== id; }); saveCfg(); }
    else if (act === 'del-asset') { S.cfg.assets = S.cfg.assets.filter(function (a) { return a.id !== id; }); saveCfg(); }
    return;
  }
  S.armed = null;
  if (act === 'theme') { var nt = THEMES[(THEMES.indexOf(getTheme()) + 1) % 3]; try { localStorage.setItem('uzi-theme', nt); } catch (e) { /* не страшно */ } applyTheme(nt); }
  else if (act === 'prev') { S.M = addM(S.M, -1); render(); }
  else if (act === 'next') { S.M = addM(S.M, 1); render(); }
  else if (act === 'tab') { S.tab = id; try { localStorage.setItem('uzi-tab', S.tab); } catch (e) { /* не страшно */ } render(); window.scrollTo(0, 0); }
  else if (act === 'type') { S.draft.type = id; S.draft.cat = CATS[id][0][0]; render(); }
  else if (act === 'accrue') { if (!S.cfg.staff.length) return; mdoc(S.M).payroll = payCalc(S.cfg.staff, S.cfg.tax); saveMonth(S.M); toast('Зарплата за ' + mName(S.M).toLowerCase() + ' начислена'); }
  else if (act === 'unaccrue') { mdoc(S.M).payroll = null; saveMonth(S.M); }
  else if (act === 'add-staff') { S.cfg.staff.push({ id: uid(), name: '', role: '', salary: 0 }); saveCfg(); }
  else if (act === 'add-asset') { S.cfg.assets.push({ id: uid(), name: '', cost: 0, date: today(), life: 60, acct: 'bank' }); saveCfg(); }
  else if (act === 'sync-login') authAction('in');
  else if (act === 'sync-signup') authAction('up');
  else if (act === 'sync-now') doSync(true);
  else if (act === 'sync-logout') { sync.signOut().then(function () { S.sync.user = null; S.sync.state = 'idle'; render(); toast('Вы вышли. Данные остались на этом устройстве'); }); }
  else if (act === 'backup-save') backupSave();
  else if (act === 'backup-load') { var fi = document.getElementById('backup-file'); if (fi) fi.click(); }
});
document.addEventListener('input', function (ev) {
  var el = ev.target;
  if (el.dataset.kind === 'money') { var dg = el.value.replace(/\D/g, ''); el.value = dg ? Number(dg).toLocaleString('ru-RU') : ''; }
  if (el.dataset.d) S.draft[el.dataset.d] = el.value;
  if (el.id === 'sync-email') S.sync.email = el.value;
  if (el.id === 'sync-pass') S.sync.pass = el.value;
});
function validDate(s) { return /^(20\d\d|2100)-\d{2}-\d{2}$/.test(s); }
// Перерисовка после ввода даты откладывается, чтобы не сбивать набор: по паузе или когда поле потеряло фокус.
function dateRender() { clearTimeout(dateRender.t); render(); }
document.addEventListener('focusout', function (ev) { if (!rendering && ev.target.type === 'date' && ev.target.dataset.bind) { clearTimeout(dateRender.t); setTimeout(render, 0); } });
document.addEventListener('change', function (ev) {
  var el = ev.target;
  if (el.id === 'backup-file') { var f = el.files && el.files[0]; el.value = ''; backupLoad(f); return; }
  var p = el.dataset.bind; if (!p) return;
  var k = el.dataset.kind, v = (k === 'money' || k === 'num') ? num(el.value) : el.value;
  if (el.type === 'date') {
    // При наборе года поле даты шлёт промежуточные значения (0002, 0020, 0202). Их не сохраняем.
    if (v && !validDate(v)) return;
    if (getP(S.cfg, p) === v) return; setP(S.cfg, p, v); writeCfg();
    clearTimeout(dateRender.t); dateRender.t = setTimeout(dateRender, 1500);
    return;
  }
  if (getP(S.cfg, p) === v) return; setP(S.cfg, p, v);
  var m = p.match(/^staff\.(\d+)\./); if (m && S.cfg.staff[m[1]]) delete S.cfg.staff[m[1]].example;
  writeCfg(); setTimeout(render, 0);
});
document.addEventListener('submit', function (ev) {
  if (ev.target.id !== 'opform') return; ev.preventDefault();
  var dr = S.draft, a = num(dr.amount); if (!a || a < 0) { toast('Введите сумму больше нуля'); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dr.date)) { toast('Укажите дату'); return; }
  if (!validDate(dr.date)) { toast('Проверьте год в дате'); return; }
  var m = ymOf(dr.date); mdoc(m).ops.push({ id: uid(), d: dr.date, t: dr.type, c: dr.cat, a: a, acct: dr.acct, n: dr.note.trim() });
  dr.amount = ''; dr.note = ''; var moved = m !== S.M; S.M = m; saveMonth(m);
  toast(moved ? 'Добавлено. Открыт ' + mName(m).toLowerCase() : 'Добавлено');
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
      S.sync.user = u; render();
      if (u && (!was || was !== u.id)) doSync(false);
    });
    if (S.sync.user) doSync(false); else render();
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') doSync(false); });
    window.addEventListener('online', function () { doSync(false); });
    setInterval(function () { if (document.visibilityState === 'visible' && navigator.onLine) doSync(false); }, 30000);
  }
})();

