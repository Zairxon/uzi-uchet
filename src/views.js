// Шесть вкладок. Разметка перенесена из прототипа без изменений; тексты идут через t() (русский / узбекский).
// Состояние приходит в объекте S: { cfg, months, M, draft, armed, sync }.
import { sched, payCalc, blank, ytd, compareTax } from './calc.js';
import { addM, mName, ymOf, fmt, fmtM, esc, today } from './util.js';
import { t, months, getLang } from './i18n.js';
import { fmtDate } from './datepicker.js';
import { APP_LINKS, BOT_URL } from './config.js';
import { fmtPhone } from './phone.js';
import { cyr2lat } from './translit.js';

export const TABS = [['home', 'Обзор'], ['ops', 'Операции'], ['pay', 'Зарплата'], ['loan', 'Кредит и аренда'], ['rep', 'Отчёты'], ['set', 'Настройки']];
export const CATS = {
  income: [['usl', 'Услуги УЗИ'], ['other_inc', 'Прочий доход'], ['contrib', 'Взнос учредителя']],
  expense: [['supplies', 'Расходные материалы'], ['util', 'Коммунальные и связь'], ['ads', 'Реклама'], ['equip', 'Покупка техники'], ['repair', 'Обслуживание техники'], ['repair_bld', 'Ремонт здания (поломки)'], ['bank', 'Банковские комиссии'], ['other', 'Прочие расходы'],
    ['pay_sal', 'Выплата зарплаты'], ['pay_ptax', 'Налоги с зарплаты'], ['pay_rent', 'Оплата аренды (с НДФЛ)'], ['pay_int', 'Проценты по кредиту'], ['pay_princ', 'Основной долг по кредиту'], ['pay_tax', 'Налог с оборота или прибыли'], ['dividend', 'Выплата учредителю']],
};
export const ACCTS = [['cash', 'Касса (наличные)'], ['card', 'Касса (карта)'], ['founder', 'Учредитель'], ['transfer', 'Перечисление']];
const ACCTNAME = { cash: 'касса (нал.)', card: 'касса (карта)', founder: 'учредитель', transfer: 'перечисление', bank: 'банк' };
const ROLES = ['Администратор', 'Медсестра', 'Кассир', 'Бухгалтер', 'Уборщица', 'Охранник', 'Другое'];
const OPEX = ['supplies', 'util', 'ads', 'repair', 'repair_bld', 'bank', 'other'];
const CATNAME = {}; CATS.income.concat(CATS.expense).forEach(function (c) { CATNAME[c[0]] = c[1]; });
const lc = function (M) { return mName(M).toLowerCase(); };

/* ---------- small html helpers ---------- */
export function getP(o, path) { return path.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
export function setP(o, path, v) { var ks = path.split('.'), l = ks.pop(); ks.reduce(function (a, k) { return a[k]; }, o)[l] = v; }
// label — готовый (уже переведённый) HTML
function inp(S, label, path, kind, cls) {
  var v = getP(S.cfg, path), id = 'f-' + path.replace(/\./g, '-'), a = '';
  if (kind === 'money') a = 'type="text" inputmode="numeric" class="n" value="' + (v ? fmt(v) : '') + '"';
  else if (kind === 'num') a = 'type="text" inputmode="decimal" class="n" value="' + esc(String(v == null ? '' : v).replace('.', ',')) + '"';
  else if (kind === 'date') a = 'type="text" inputmode="numeric" maxlength="10" autocomplete="off" placeholder="' + esc(t('дд.мм.гггг')) + '"' + (/^(loan|rent)\./.test(path) ? ' data-optional="1"' : '') + ' value="' + esc(fmtDate(v)) + '"';
  else a = 'type="text" value="' + esc(v || '') + '"';
  return '<label class="fld' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span>' + (kind === 'date' ? dateField('<input id="' + id + '" data-bind="' + path + '" data-kind="date" ' + a + '>', id) : '<input id="' + id + '" data-bind="' + path + '" data-kind="' + kind + '" ' + a + '>') + '</label>';
}
function dateField(inner, id) { return '<span class="dt">' + inner + '<button type="button" class="dt-btn" data-cal="' + id + '" aria-label="' + esc(t('Календарь')) + '">' + '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>' + '</button></span>'; }
// Выпадающий список: своя кнопка + свой список (см. ui.js), значение лежит в value кнопки
function sel(id, opts, val, attr) {
  var cur = opts.filter(function (o) { return o[0] === val; })[0] || opts[0];
  return '<button type="button" class="sel-btn" id="' + id + '" value="' + esc(cur[0]) + '" aria-haspopup="listbox" ' + (attr || '') + ' data-opts="' + esc(JSON.stringify(opts.map(function (o) { return [o[0], t(o[1])]; }))) + '"><span>' + esc(t(cur[1])) + '</span>' + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>' + '</button>';
}
function tr(label, vals, cls) { return '<tr class="' + (cls || '') + '"><td class="lbl">' + t(label) + '</td>' + vals.map(function (v) { return '<td class="num">' + (v === '' ? '' : fmt(v)) + '</td>'; }).join('') + '</tr>'; }
function delBtn(S, act, id) { var on = S.armed === act + id; return '<button class="btn del' + (on ? ' armed' : '') + '" data-act="' + act + '" data-id="' + esc(id) + '" aria-label="' + t('Удалить') + '">' + (on ? t('Удалить?') : '×') + '</button>'; }

/* ---------- views ---------- */
// Итоги дня по внесённым операциям (приём из «Ресепшена» вносится в учёт автоматически)
function dayFigures(S, d) {
  var ops = ((S.months[ymOf(d)] && S.months[ymOf(d)].ops) || []).filter(function (o) { return o.d === d; }), inc = 0, exp = 0;
  ops.forEach(function (o) { if (o.t === 'income') { if (o.c !== 'contrib') inc += o.a || 0; } else exp += o.a || 0; });
  return { inc: inc, exp: exp, net: inc - exp, ops: ops };
}
function kpi3(f) {
  return '<div class="kpis three"><div class="kpi"><span>' + t('Выручка') + '</span><b class="pos">' + fmt(f.inc) + '</b></div><div class="kpi"><span>' + t('Расход') + '</span><b class="neg">' + fmt(f.exp) + '</b></div><div class="kpi"><span>' + t('Чистая прибыль') + '</span><b class="' + (f.net < 0 ? 'neg' : 'pos') + '">' + fmt(f.net) + '</b></div></div>';
}
function todayBlock(S) {
  var d = today(), f = dayFigures(S, d);
  return '<section class="todaybox"><h2>' + t('Сегодня, {d}', { d: fmtDate(d) }) + '</h2>' + kpi3(f) + '<p class="small muted">' + t('Выручка включает приём из «Ресепшена». Прибыль дня = выручка минус расходы по внесённым операциям; зарплата и налоги считаются за месяц.') + '</p></section>';
}

export function vHome(S, C) {
  var M = S.M, r = C.cur, B = C.B, exp = r.opexSum + r.payroll + r.rent + r.int + r.dep + r.tax;
  var h = todayBlock(S) + '<section><h2>' + t('За {m}', { m: lc(M) }) + '</h2><div class="kpis">' +
    '<div class="kpi"><span>' + t('Выручка') + '</span><b>' + fmt(r.rev) + '</b></div>' +
    '<div class="kpi"><span>' + t('Расходы и налог') + '</span><b>' + fmt(exp) + '</b></div>' +
    '<div class="kpi"><span>' + t('Чистая прибыль') + '</span><b class="' + (r.net < 0 ? 'neg' : 'pos') + '">' + fmt(r.net) + '</b></div>' +
    '<div class="kpi"><span>' + t('Деньги на конец месяца') + '</span><b>' + fmt(B.cash + B.bank) + '</b></div></div>' +
    '<p class="small muted">' + t('Суммы в сумах за {m}. Касса: {c}, банк: {b}.', { m: lc(M), c: '<span class="num">' + fmt(B.cash) + '</span>', b: '<span class="num">' + fmt(B.bank) + '</span>' }) + '</p>' +
    '<h3 class="subh">' + t('Из чего складываются расходы за месяц') + '</h3><ul class="list">' + [['Расходы по внесённым операциям', r.opexSum], ['Зарплата с социальным налогом', r.payroll], ['Аренда', r.rent], ['Проценты по кредиту', r.int], ['Амортизация', r.dep], ['Налог с оборота или прибыли', r.tax]].filter(function (x) { return x[1] > 0; }).map(function (x) { return '<li><div class="li-main"><b>' + t(x[0]) + '</b></div><span class="num">' + fmt(x[1]) + '</span></li>'; }).join('') + '</ul>' +
    (r.net < 0 ? '<p class="note">' + t('Прибыль отрицательная: выручка месяца меньше расходов. Аренда, зарплата, проценты и амортизация начисляются за месяц целиком, даже если по операциям расходов нет.') + '</p>' : '') + '</section>';
  var due = [['Кредит, остаток основного долга', B.loan], ['Зарплата и налоги с неё', B.pay.wage], ['Аренда', B.pay.rent], ['Проценты по кредиту', B.pay.int], ['Налог с оборота или прибыли', B.pay.tax]];
  h += '<section><h2>' + t('Долги на конец месяца') + '</h2><ul class="list">' + due.map(function (d) { return '<li><div class="li-main"><b>' + t(d[0]) + '</b></div><span class="num">' + fmt(d[1]) + '</span></li>'; }).join('') + '</ul>' +
    '<p class="note">' + t('Начислено, но ещё не оплачено. Отрицательная сумма означает переплату.') + '</p></section>';
  var last = []; for (var k = 5; k >= 0; k--) { var m = addM(M, -k), x = C.rows.filter(function (q) { return q.m === m; })[0] || blank(m); last.push(x); }
  var mx = Math.max.apply(null, last.map(function (x) { return x.rev; }).concat([1]));
  h += '<section><h2>' + t('Выручка и прибыль за полгода') + '</h2><div class="panel"><div class="trend">' + last.map(function (x) {
    return '<span class="small muted">' + months()[+x.m.slice(5, 7) - 1].slice(0, 3) + '</span><div><div class="bar" style="width:' + Math.max(0, x.rev / mx * 100).toFixed(1) + '%"></div></div><span class="num small">' + fmt(x.rev) + ' / <span class="' + (x.net < 0 ? 'neg' : 'pos') + '">' + fmt(x.net) + '</span></span>';
  }).join('') +
    '</div><p class="small muted">' + t('Полоса показывает выручку. Справа: выручка / чистая прибыль.') + '</p></div></section>';
  return h;
}

// Время создания операции берём из её номера (начало номера — миллисекунды в 36-ричной записи)
function opTs(o) { var n = parseInt(String(o.id || '').slice(0, 8), 36); return n > 1.5e12 && n < 4e12 ? n : 0; }
function opTime(o) {
  var n = opTs(o); if (!n) return '';
  try { return new Date(n).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' }); } catch (e) { return ''; }
}

function opRow(S, o, canDel) {
  var rc = String(o.id).indexOf('rc:') === 0, name = rc ? (o.id.split(':')[3] === 'deposit' ? t('Ресепшен: предоплаты ({n})', { n: o.cnt || '' }) : o.id.split(':')[3] === 'refund' ? t('Ресепшен: возвраты ({n})', { n: o.cnt || '' }) : t('Ресепшен: приём ({n})', { n: o.cnt || '' })) : (CATNAME[o.c] ? t(CATNAME[o.c]) : o.c);
  return '<li><div class="li-main"><b>' + esc(name) + (rc ? ' <span class="chip">' + t('авто') + '</span>' : '') + '</b><span class="small muted">' + (opTime(o) ? opTime(o) + ' · ' : '') + t(ACCTNAME[o.acct] || 'касса') + (o.n ? ' · ' + esc(o.n) : '') + '</span></div><span class="num ' + ((o.t === 'income') === ((o.a || 0) >= 0) ? 'pos' : 'neg') + '">' + ((o.t === 'income') === ((o.a || 0) >= 0) ? '+' : '−') + fmt(Math.abs(o.a || 0)) + '</span>' + (canDel && !rc ? delBtn(S, 'del-op', o.id) : '') + '</li>';
}
var METHNAME = { cash: 'наличные', card: 'карта', transfer: 'перечисление' };
// Пациенты из «Ресепшена» за выбранный день
function rcBlock(S, day) {
  var R = S.dayRc, h = '<div class="rcbox"><h3>🏥 ' + t('Из «Ресепшена»: пациенты дня') + '</h3>';
  if (!S.sync.enabled || !S.sync.user) return h + '<p class="small muted">' + t('Войдите в «Настройки → Данные» (синхронизация), чтобы видеть пациентов из «Ресепшена».') + '</p></div>';
  if (R.state === 'loading' || R.state === 'idle') return h + '<p class="small muted">' + t('Загрузка…') + '</p></div>';
  if (R.state === 'error') return h + '<p class="small muted">' + t('Не удалось получить данные клиники: {m}', { m: esc(R.msg) }) + '</p></div>';
  if (!R.rows.length) return h + '<p class="small muted">' + t('В этот день оплат из «Ресепшена» не было.') + '</p></div>';
  var sum = 0, vis = 0;
  R.rows.forEach(function (x) { var a = x.kind === 'refund' ? -x.amount : +x.amount; sum += a; if (x.kind === 'visit') vis++; });
  h += '<div class="scroll"><table class="rct grid"><thead><tr><th>' + t('Время') + '</th><th>' + t('Пациент') + '</th><th>' + t('Врач / услуга') + '</th><th class="r">' + t('Оплата') + ' / ' + t('Сумма') + '</th></tr></thead><tbody>' + R.rows.map(function (x) {
    var ref = x.kind === 'refund', a = ref ? -x.amount : +x.amount, how = ref ? '↩ ' + t('возврат') + ' · ' + t(METHNAME[x.method] || 'наличные') : x.kind === 'deposit' ? '💳 ' + t('предоплата') : t(METHNAME[x.method] || 'наличные');
    return '<tr' + (ref ? ' class="rrefund"' : '') + '><td class="num">' + esc(x.at) + '</td><td><b>' + esc(x.client_name || '—') + '</b>' + (x.finished ? '<br><span class="small muted">✔ ' + t('прошёл') + '</span>' : '') + '</td><td>' + esc(x.doctor_name || '') + (x.service ? '<br><span class="small muted">' + esc(x.service) + '</span>' : '') + '</td><td class="r"><span class="num ' + (a < 0 ? 'neg' : 'pos') + '"><b>' + (a < 0 ? '−' : '+') + fmt(Math.abs(a)) + '</b></span><br><span class="small muted">' + how + '</span></td></tr>';
  }).join('') + '</tbody><tfoot><tr><td colspan="3"><b>' + t('Пациентов: {n}', { n: vis }) + '</b></td><td class="r num"><b>' + fmt(sum) + '</b></td></tr></tfoot></table></div></div>';
  return h;
}

export function vOps(S) {
  var months_ = S.months, M = S.M, draft = S.draft, day = S.opsDay || today();
  var cats = CATS[draft.type]; if (!cats.some(function (c) { return c[0] === draft.cat; })) draft.cat = cats[0][0];
  var sorter = function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : opTs(b) - opTs(a); };
  var h = '<section><h2>' + t('Новая операция') + '</h2><form class="panel" id="opform" novalidate>' +
    '<div class="seg"><button type="button" data-act="type" data-id="income" aria-pressed="' + (draft.type === 'income') + '">' + t('Поступление') + '</button><button type="button" data-act="type" data-id="expense" aria-pressed="' + (draft.type === 'expense') + '">' + t('Списание') + '</button></div>' +
    '<div class="grid">' +
    '<label class="fld"><span>' + t('Дата') + '</span>' + dateField('<input id="op-date" type="text" inputmode="numeric" maxlength="10" autocomplete="off" placeholder="' + esc(t('дд.мм.гггг')) + '" data-d="date" data-kind="date" value="' + esc(fmtDate(draft.date)) + '">', 'op-date') + '</label>' +
    '<label class="fld"><span>' + t('Сумма, сум') + '</span><input id="op-amount" type="text" inputmode="numeric" class="n" data-d="amount" data-kind="money" value="' + esc(draft.amount) + '" placeholder="0"></label>' +
    '<label class="fld"><span>' + t('Категория') + '</span>' + sel('op-cat', cats, draft.cat, 'data-d="cat"') + '</label>' +
    '<label class="fld"><span>' + t('Счёт') + '</span>' + sel('op-acct', ACCTS, draft.acct, 'data-d="acct"') + '</label>' +
    '</div><label class="fld"><span>' + t('Комментарий') + '</span><input id="op-note" type="text" data-d="note" value="' + esc(draft.note) + '" placeholder="' + esc(t(draft.cat === 'equip' ? 'Название и модель, например: УЗИ-аппарат Миндрей ДС-70' : 'Например: закупка расходников')) + '"></label>' +
    (draft.cat === 'equip' ? '<p class="note">' + t('Купленная техника записывается как имущество и списывается в расходы по частям (60 месяцев). В «Кредит и аренда» её можно выбрать как цель кредита.') + '</p>' : '') +
    (draft.acct === 'founder' ? '<p class="note">' + t('«Учредитель»: оплата из личных денег учредителя. Деньги клиники не меняются, сумма записывается как вклад учредителя.') + '</p>' : '') +
    '<div class="row gaptop"><button class="btn" type="submit">' + t('Добавить') + '</button></div></form>' +
    '<p class="note">' + t('Выручка с приёма вносится из «Ресепшена» автоматически: вручную записывайте только прочие поступления и все расходы. Зарплата, аренда, проценты и амортизация попадают в расходы из вкладок «Зарплата» и «Кредит и аренда»; здесь записывайте их оплату.') + '</p></section>';
  // день
  var f = dayFigures(S, day), dops = f.ops.filter(function (o) { return String(o.id).indexOf('rc:') !== 0; }).sort(sorter), isToday = day === today();
  h += '<section class="opsday"><h2>' + t('Операции за день') + '</h2>' +
    '<div class="daynav2"><button type="button" class="navbtn" data-act="ops-prev" aria-label="' + esc(t('Предыдущий день')) + '">‹</button><button type="button" class="daylabel2" data-act="ops-today">' + (isToday ? t('Сегодня') + ' · ' : '') + esc(fmtDate(day)) + '</button><button type="button" class="navbtn" data-act="ops-next" aria-label="' + esc(t('Следующий день')) + '">›</button></div>' +
    kpi3(f) + rcBlock(S, day) +
    '<h3 class="subh">' + t('Остальные операции дня') + '</h3>' + (dops.length ? '<ul class="list">' + dops.map(function (o) { return opRow(S, o, true); }).join('') + '</ul>' : '<p class="empty">' + t('Других операций в этот день нет.') + '</p>') + '</section>';
  // месяц
  var mops = ((months_[M] && months_[M].ops) || []).slice().sort(sorter), mi = 0, me = 0;
  mops.forEach(function (o) { if (o.t === 'income') { if (o.c !== 'contrib') mi += o.a || 0; } else me += o.a || 0; });
  h += '<section class="opsmonth"><h2>' + t('Операции за {m}', { m: lc(M) }) + '</h2>' + kpi3({ inc: mi, exp: me, net: mi - me });
  if (!mops.length) h += '<p class="empty">' + t('Пока нет записей. Добавьте первое поступление или списание в форме выше.') + '</p>';
  else {
    h += '<ul class="list">'; var dd = ''; mops.forEach(function (o) {
      if (o.d !== dd) { dd = o.d; h += '<li class="day" style="border-bottom:0;padding-bottom:0">' + esc(o.d.slice(8, 10) + '.' + o.d.slice(5, 7)) + '</li>'; }
      h += opRow(S, o, true);
    }); h += '</ul>';
  }
  return h + '</section>';
}

function dmapOf(S) { return (S.months[S.M] && S.months[S.M].days) || {}; }
function staffScheme(s) {
  var p = []; if (s.salary) p.push(t('оклад') + ' ' + fmt(s.salary)); if (s.daily) p.push(fmt(s.daily) + ' / ' + t('день')); if (s.pct) p.push(String(s.pct).replace('.', ',') + '%');
  return p.length ? p.join(' + ') : t('оплата не задана');
}
// Ячейка «Сотрудники клиники»: нажмите, чтобы увидеть всех (врачи из «Ресепшена» и персонал), добавить и изменить
function staffCell(S, dmap) {
  var cfg = S.cfg, open = !!S.staffOpen, docs = S.clinic && S.clinic.state === 'ok' ? S.clinic.rows : [];
  var h = '<button type="button" class="cell" data-act="staff-toggle" aria-expanded="' + open + '"><span class="ci">👥</span><span class="cb"><b>' + t('Сотрудники клиники') + '</b><span class="small muted">' + t('Врачей: {a} · персонала: {b}', { a: docs.length, b: cfg.staff.length }) + '</span></span><svg class="chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>';
  if (!open) return h;
  h += '<div class="panel stafflist"><h3 class="subh">' + t('Врачи (из «Ресепшена»)') + '</h3>' + (docs.length ? '<ul class="list">' + docs.map(function (d) { return '<li><div class="li-main"><b>' + esc(d.doctor_name) + '</b><span class="small muted">' + t('врач') + ' · ' + t('доля {n}%', { n: String(+d.percent || 0).replace('.', ',') }) + '</span></div></li>'; }).join('') + '</ul>' : '<p class="small muted">' + t('Список врачей появится после входа в «Настройки → Данные» и загрузки данных клиники. Процент врачей задаётся ниже, в «Доле врачей».') + '</p>') +
    '<h3 class="subh">' + t('Персонал') + '</h3>';
  if (!cfg.staff.length) h += '<p class="small muted">' + t('Пока никого нет. Добавьте медсестёр, администратора и других сотрудников: от них считается зарплата.') + '</p>';
  cfg.staff.forEach(function (s, i) {
    var edit = S.editStaff === s.id;
    h += '<div class="srow"><div class="li-main"><b>' + esc(s.name || t('Без имени')) + '</b><span class="small muted">' + esc(t(s.role || 'Другое')) + ' · ' + staffScheme(s) + '</span></div><button type="button" class="btn ghost small" data-act="staff-edit" data-id="' + esc(s.id) + '">' + t(edit ? 'Готово' : 'Изменить') + '</button></div>';
    if (edit) {
      var ro = ROLES.map(function (x) { return [x, x]; }); if (s.role && ROLES.indexOf(s.role) < 0) ro.push([s.role, s.role]);
      h += '<div class="staff2"><div class="grid">' + inp(S, t('Имя'), 'staff.' + i + '.name', 'text') + '<label class="fld"><span>' + t('Должность') + '</span>' + sel('f-staff-' + i + '-role', ro, s.role || ROLES[0], 'data-bind="staff.' + i + '.role" data-kind="text"') + '</label>' +
        inp(S, t('Оклад, сум'), 'staff.' + i + '.salary', 'money') + inp(S, t('Оплата за день, сум'), 'staff.' + i + '.daily', 'money') + inp(S, t('Процент от оплат клиники, %'), 'staff.' + i + '.pct', 'num') +
        '<label class="fld"><span>' + t('Дней в этом месяце') + '</span><input id="f-days-' + esc(s.id) + '" data-days="' + esc(s.id) + '" type="text" inputmode="decimal" class="n" value="' + esc(String(dmap[s.id] || '').replace('.', ',')) + '" placeholder="0"></label></div>' +
        '<div class="row">' + delBtn(S, 'del-staff', s.id) + '</div></div>';
    }
  });
  return h + '<div class="row gaptop"><button class="btn ghost" data-act="add-staff">' + t('Добавить сотрудника') + '</button></div>' +
    '<p class="note">' + t('Итог сотрудника = оклад + оплата за день × число дней + процент от оплат клиники за {m} ({s} сум, данные «Ресепшена»). Для медсестёр и других сотрудников без оклада заполните только нужные поля.', { m: lc(S.M), s: fmt(clinicBase(S)) }) + '</p></div>';
}

// Сумма оплат клиники за месяц (данные Ресепшена) — основа для процента сотрудников
export function clinicBase(S) {
  if (!S.clinic || S.clinic.state !== 'ok') return 0;
  return S.clinic.rows.reduce(function (a, r) { return a + (+r.total || 0); }, 0);
}
// Сотрудники с итоговой суммой за месяц: оклад + оплата за день × дни + процент от оплат клиники
export function staffEff(S) {
  var days = (S.months[S.M] && S.months[S.M].days) || {}, base = clinicBase(S);
  return S.cfg.staff.map(function (s) {
    var o = {}; for (var k in s) o[k] = s[k];
    o.salary = Math.round((s.salary || 0) + (s.daily || 0) * (days[s.id] || 0) + (s.pct || 0) * base / 100);
    return o;
  });
}
function payCards(show) {
  var cell = function (lbl, val, cls) { return '<div class="pc-c ' + (cls || '') + '"><span class="small muted">' + t(lbl) + '</span><span class="num">' + fmtM(val) + '</span></div>'; };
  return '<div class="pcards">' + show.lines.map(function (l) {
    return '<div class="pcard"><div class="pc-h"><b>' + esc(l.name || '—') + '</b>' + (l.role ? '<span class="small muted">' + esc(l.role) + '</span>' : '') + '</div><div class="pc-g">' +
      cell('Начислено', l.gross) + cell('На руки', l.net, 'strong') + cell('НДФЛ', l.ndfl) + cell('ИНПС', l.inps) + '</div></div>';
  }).join('') + '<div class="pcard sum"><div class="pc-h"><b>' + t('Итого') + '</b></div><div class="pc-g">' +
    cell('Начислено', show.gross) + cell('На руки', show.net, 'strong') + cell('НДФЛ', show.ndfl) + cell('ИНПС', show.inps) + '</div></div></div>';
}

export function vPay(S) {
  var cfg = S.cfg, months_ = S.months, M = S.M;
  var p = months_[M] && months_[M].payroll, live = payCalc(staffEff(S), cfg.tax), show = p || live, tx = cfg.tax;
  var h = '<section><h2>' + t('Расчёт за {m}', { m: lc(M) }) + ' <span class="chip ' + (p ? 'ok' : '') + '">' + (p ? t('начислено') : t('не начислено')) + '</span></h2>';
  if (!show.lines.length) h += '<p class="empty">' + t('Добавьте сотрудников ниже, и здесь появится расчёт зарплаты и налогов.') + '</p>';
  else {
    h += payCards(show) +
      '<ul class="list"><li><div class="li-main"><b>' + t('Социальный налог {n}%', { n: tx.soc }) + '</b><span class="small muted">' + t('платит фирма сверх зарплаты') + '</span></div><span class="num">' + fmt(show.soc) + '</span></li>' +
      '<li><div class="li-main"><b>' + t('Полная стоимость для фирмы') + '</b><span class="small muted">' + t('начислено + социальный налог') + '</span></div><span class="num">' + fmt(show.gross + show.soc) + '</span></li>' +
      '<li><div class="li-main"><b>' + t('В бюджет и ИНПС') + '</b><span class="small muted">' + t('НДФЛ + ИНПС + социальный налог') + '</span></div><span class="num">' + fmt(show.ndfl + show.inps + show.soc) + '</span></li></ul>' +
      '<div class="row">' + (p ? '<button class="btn ghost" data-act="unaccrue">' + t('Отменить начисление') + '</button>' : '<button class="btn" data-act="accrue">' + t('Начислить за {m}', { m: lc(M) }) + '</button>') + '</div>' +
      '<p class="note">' + (p ? t('Расчёт зафиксирован и попал в расходы месяца. Изменения в списке сотрудников на него не влияют.') : t('Пока это предварительный расчёт. После начисления сумма попадёт в расходы месяца и в долг по зарплате.')) + ' ' + t('ИНПС {n}% идёт на пенсионный счёт сотрудника из суммы НДФЛ, поэтому на руки он не влияет.', { n: String(tx.inps).replace('.', ',') }) + '</p>';
  }
  h += '</section><section><h2>' + t('Сотрудники') + '</h2>' + staffCell(S, dmapOf(S)) + '</section>';
  return h + shareBlock(S);
}

// Статус платежа графика: оплаты из «Операций» (проценты и основной долг) закрывают платежи по порядку
function loanStates(S, SC) {
  var paid = 0, cur = today().slice(0, 7), nxt = addM(cur, 1);
  Object.keys(S.months).forEach(function (m) { ((S.months[m] && S.months[m].ops) || []).forEach(function (o) { if (o.t === 'expense' && (o.c === 'pay_int' || o.c === 'pay_princ')) paid += o.a || 0; }); });
  var st = SC.map(function (x) {
    var amt = x.pr + x.int;
    if (paid >= amt - 1) { paid -= amt; return 'paid'; }
    paid = 0; return x.m < cur ? 'late' : x.m <= nxt ? 'soon' : '';
  });
  var f = st.indexOf('late'); if (f < 0) f = st.indexOf('soon');
  if (f < 0) { f = SC.findIndex(function (x, i) { return !st[i] && x.m >= cur; }); }
  if (f < 0) f = st.indexOf('') >= 0 ? st.indexOf('') : SC.length - 1;
  return { st: st, focus: f };
}
function loanSched(S, SC, l) {
  var ls = loanStates(S, SC), n = { paid: 0, soon: 0, late: 0 }; ls.st.forEach(function (s) { if (s) n[s]++; });
  var label = { paid: 'Оплачено', soon: 'Скоро срок', late: 'Просрочено', '': '' };
  var open = !!S.loanOpen;
  var fx = SC[ls.focus], h = '<div class="panel loansum"><div class="li-main"><b>' + t('График платежей') + '</b><span class="small muted">' +
    (l.start ? t('Оплачено {a} из {b}', { a: n.paid, b: SC.length }) + (fx && ls.st[ls.focus] !== 'paid' ? ' · ' + t('Ближайший: {m}', { m: fx.m.slice(5, 7) + '.' + fx.m.slice(0, 4) }) + ' — ' + fmtM(fx.pr + fx.int) : '') : t('Укажите дату получения')) +
    '</span><span class="lchips">' + (n.late ? '<span class="chip st-late">' + t('Просрочено') + ': ' + n.late + '</span>' : '') + (n.soon ? '<span class="chip st-soon">' + t('Скоро срок') + ': ' + n.soon + '</span>' : '') + (n.paid ? '<span class="chip st-paid">' + t('Оплачено') + ': ' + n.paid + '</span>' : '') + '</span></div>' +
    '<button class="btn ghost" data-act="loan-toggle" aria-expanded="' + open + '">' + t(open ? 'Скрыть график' : 'Показать график') + '</button></div>';
  if (!open) return h;
  h += '<div class="scroll tall"><table class="wide"><thead><tr><th>№</th><th>' + t('Месяц') + '</th><th>' + t('Остаток') + '</th><th>' + t('Основной долг') + '</th><th>' + t('Проценты') + '</th><th>' + t('Платёж') + '</th><th>' + t('Статус') + '</th></tr></thead><tbody>' +
    SC.map(function (x, i) { var s = l.start ? ls.st[i] : ''; return '<tr class="' + (s ? 'st-' + s : '') + '"' + (i === ls.focus && l.start ? ' data-focus="1"' : '') + '><td>' + x.k + '</td><td class="num">' + x.m.slice(5, 7) + '.' + x.m.slice(0, 4) + '</td><td class="num">' + fmt(x.open) + '</td><td class="num">' + fmt(x.pr) + '</td><td class="num">' + fmt(x.int) + '</td><td class="num">' + fmt(x.pr + x.int) + '</td><td class="stc">' + t(label[s]) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
    '<p class="note">' + t('Оплаты берутся из «Операций» (проценты и основной долг по кредиту) и закрывают платежи по порядку. Жёлтым отмечены платежи этого и следующего месяца, красным — просроченные.') + '</p>';
  return h;
}

// На что взят кредит: оборудование из списка, техника из «Операций» или другое (с моделью)
function loanPurpose(S, l) {
  var opts = [['', '— не указано —']], info = {};
  S.cfg.assets.forEach(function (a) { var lbl = 'Оборудование: ' + (a.name || 'без названия') + (a.model ? ' (' + a.model + ')' : ''); opts.push(['asset:' + a.id, lbl]); info['asset:' + a.id] = { name: (a.name || '') + (a.model ? ' (' + a.model + ')' : ''), cost: a.cost, date: a.date }; });
  Object.keys(S.months).sort().forEach(function (m) { ((S.months[m] && S.months[m].ops) || []).forEach(function (o) { if (o.t === 'expense' && o.c === 'equip') { opts.push(['op:' + o.id, 'Покупка техники: ' + (o.n || 'без названия') + ' · ' + fmtDate(o.d)]); info['op:' + o.id] = { name: o.n || '', cost: o.a, date: o.d }; } }); });
  opts.push(['other', 'Другое']);
  var cur = info[l.purpose];
  return '<div class="panel"><b>' + t('На что взят кредит') + '</b><div class="fld"><span>' + t('Цель кредита') + '</span>' + sel('f-loan-purpose', opts, l.purpose || '', 'data-bind="loan.purpose" data-kind="text"') + '</div>' +
    inp(S, t('Что именно, модель'), 'loan.purposeNote', 'text') +
    (cur ? '<p class="small muted">' + t('Связано с операцией или оборудованием: {n}, {c} сум ({d}).', { n: esc(cur.name), c: fmt(cur.cost), d: fmtDate(cur.date) }) + '</p>' : '') +
    '<p class="note">' + t('Список берётся из «Оборудование и ремонт» ниже и из операций «Покупка техники»: так кредит связан с купленной вещью.') + '</p></div>';
}

export function vLoan(S) {
  var cfg = S.cfg, M = S.M;
  var l = cfg.loan, r = cfg.rent, SC = sched(l, ymOf(l.start) || M), tot = 0; SC.forEach(function (x) { tot += x.int; });
  var h = '<section><h2>' + t('Кредит') + '</h2><div class="panel"><div class="grid">' + inp(S, t('Сумма, сум'), 'loan.amount', 'money') + inp(S, t('Ставка, % годовых'), 'loan.rate', 'num') + inp(S, t('Срок, месяцев'), 'loan.term', 'num') + inp(S, t('Льготный период, месяцев'), 'loan.grace', 'num') + inp(S, t('Дата получения'), 'loan.start', 'date') + '</div>' +
    (l.start ? '' : '<p class="alert">' + t('Дата получения не указана: график показан для примера и в отчёты не попадает.') + '</p>') + '</div>';
  h += loanPurpose(S, l);
  if (SC.length) {
    var fp = SC[Math.min(SC.length - 1, l.grace)];
    h += '<ul class="list"><li><div class="li-main"><b>' + t('Платёж в льготный период') + '</b><span class="small muted">' + t('только проценты') + '</span></div><span class="num">' + fmt(SC[0].int) + '</span></li>' +
      '<li><div class="li-main"><b>' + t('Первый платёж после льготы') + '</b><span class="small muted">' + t('основной долг + проценты, дальше уменьшается') + '</span></div><span class="num">' + fmt(fp.pr + fp.int) + '</span></li>' +
      '<li><div class="li-main"><b>' + t('Всего процентов за срок') + '</b></div><span class="num">' + fmt(tot) + '</span></li></ul>' +
      loanSched(S, SC, l) +
      '<p class="note">' + t('Основной долг гасится равными долями после льготного периода, проценты считаются на остаток как ставка ÷ 12. Банк считает по дням, поэтому его график будет отличаться на небольшие суммы.') + '</p>';
  }
  h += '</section>';
  var minR = (r.area || 0) * (r.minRate || 0), nd = (r.amount || 0) * cfg.tax.ndfl / 100;
  h += '<section><h2>' + t('Аренда здания у учредителя') + '</h2><div class="panel"><div class="grid">' + inp(S, t('Аренда в месяц, сум'), 'rent.amount', 'money') + inp(S, t('Дата начала'), 'rent.start', 'date') + inp(S, t('Площадь, м²'), 'rent.area', 'num') + inp(S, t('Минимальная ставка за м², сум'), 'rent.minRate', 'money') + '</div></div>' +
    '<ul class="list"><li><div class="li-main"><b>' + t('Минимальная аренда для налога') + '</b><span class="small muted">' + t('площадь × минимальная ставка') + '</span></div><span class="num">' + fmt(minR) + '</span></li>' +
    '<li><div class="li-main"><b>' + t('НДФЛ {n}%', { n: cfg.tax.ndfl }) + '</b><span class="small muted">' + t('фирма удерживает и платит в бюджет') + '</span></div><span class="num">' + fmt(nd) + '</span></li>' +
    '<li><div class="li-main"><b>' + t('Учредителю на руки') + '</b></div><span class="num">' + fmt((r.amount || 0) - nd) + '</span></li></ul>' +
    (r.amount && r.amount < minR ? '<p class="alert">' + t('Аренда ниже минимальной. Налоговая посчитает НДФЛ от {n} сум.', { n: fmt(minR) }) + '</p>' : '') +
    '<p class="note">' + t('Минимальная ставка 28 400 сум за м² действует в 2026 году для нежилых помещений в областных центрах. Уточните у бухгалтера, нет ли повышающего коэффициента.') + '</p></section>';
  h += '<section><h2>' + t('Оборудование и ремонт') + '</h2>';
  if (!cfg.assets.length) h += '<p class="empty">' + t('Добавьте аппараты УЗИ, мебель и ремонт помещения. Их стоимость будет списываться в расходы по частям каждый месяц.') + '</p>';
  else h += '<div class="panel">' + cfg.assets.map(function (a, i) {
    return '<div class="grid">' + inp(S, t('Название'), 'assets.' + i + '.name', 'text', 'full') + inp(S, t('Модель'), 'assets.' + i + '.model', 'text', 'full') + inp(S, t('Стоимость, сум'), 'assets.' + i + '.cost', 'money') + inp(S, t('Дата покупки'), 'assets.' + i + '.date', 'date') + inp(S, t('Срок службы, месяцев'), 'assets.' + i + '.life', 'num') +
      '<label class="fld"><span>' + t('Оплачено') + '</span>' + sel('f-assets-' + i + '-acct', [['transfer', 'Перечисление'], ['card', 'Касса (карта)'], ['cash', 'Касса (наличные)'], ['founder', 'Учредитель']], a.acct || 'transfer', 'data-bind="assets.' + i + '.acct" data-kind="text"') + '</label>' +
      '<div class="fld"><span>' + t('В месяц в расходы') + '</span><div class="row"><span class="num">' + fmt((a.cost || 0) / Math.max(1, a.life || 1)) + '</span>' + delBtn(S, 'del-asset', a.id) + '</div></div></div>';
  }).join('<hr style="border:0;border-top:1px solid var(--line);width:100%;margin:0">') + '</div>';
  h += '<div class="row"><button class="btn ghost" data-act="add-asset">' + t('Добавить объект') + '</button></div>' +
    '<p class="note">' + t('Покупка сама уменьшает деньги на счёте в месяц покупки: отдельную операцию не вносите. Если техника куплена сразу, можно вместо этого внести операцию «Покупка техники» в «Операциях». Амортизация начинается со следующего месяца.') + '</p></section>';
  return h;
}

// Источники клиентов: таблица за месяц и создание рекламных ссылок с меткой
var SRC_SOURCES = [['instagram', 'Инстаграм'], ['telegram', 'Телеграм'], ['facebook', 'Фейсбук'], ['google', 'Гугл'], ['yandex', 'Яндекс'], ['2gis', '2ГИС'], ['flyer', 'Листовка'], ['barcode', 'Штрих-код'], ['other', 'Другое']];
var SRC_MEDIA = [['bio', 'Профиль'], ['post', 'Публикация'], ['stories', 'Истории'], ['ads', 'Реклама'], ['barcode', 'Штрих-код'], ['sms', 'СМС']];
export function srcSlug(s) { return cyr2lat(String(s || '')).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40); }
export function srcLinks(u) {
  var src = u.source === 'other' ? srcSlug(u.custom) : u.source, med = u.medium || '', cmp = srcSlug(u.campaign);
  if (!src) return null;
  var q = 'utm_source=' + encodeURIComponent(src) + (med ? '&utm_medium=' + encodeURIComponent(med) : '') + (cmp ? '&utm_campaign=' + encodeURIComponent(cmp) : '');
  return { web: APP_LINKS.queue + '?' + q, bot: BOT_URL + '?start=u_' + [src, med, cmp].join('-').replace(/-+$/, '') };
}
function srcLinksHtml(u) {
  var l = srcLinks(u); if (!l) return '<p class="small muted">' + t('Введите название источника.') + '</p>';
  var row = function (label, url, id) { return '<div class="fld"><span>' + t(label) + '</span><div class="row"><input type="text" readonly value="' + esc(url) + '" id="' + id + '" style="font-size:12px"><button type="button" class="btn ghost" data-act="src-copy" data-id="' + id + '">' + t('Копировать') + '</button></div></div>'; };
  return row('Ссылка на «Навбат»', l.web, 'src-web') + row('Ссылка на бота', l.bot, 'src-bot');
}
export { srcLinksHtml };
function srcView(S) {
  var X = S.src || { state: 'idle', rows: [], msg: '', u: { source: 'instagram', custom: '', medium: 'bio', campaign: '' } }, u = X.u;
  var h = '<section><h2>' + t('Откуда клиенты за {m}', { m: lc(S.M) }) + '</h2>';
  if (!S.sync.enabled || !S.sync.user) h += '<p class="empty">' + t('Войдите в «Настройки» (синхронизация), чтобы видеть данные Ресепшена.') + '</p>';
  else if (X.state === 'loading' || X.state === 'idle') h += '<p class="empty">' + t('Загрузка…') + '</p>';
  else if (X.state === 'error') h += '<p class="alert">' + esc(X.msg) + '</p>';
  else if (!X.rows.length) h += '<p class="empty">' + t('Нет записей за этот месяц.') + '</p>';
  else {
    var CH = { call: 'По звонку', walkin: 'Живая очередь', site: 'Сайт без метки', bot: 'Бот без метки' }, T = { total: 0, visited: 0, noshow: 0, revenue: 0 }, maxV = 1;
    X.rows.forEach(function (x) { T.total += +x.total; T.visited += +x.visited; T.noshow += +x.noshow; T.revenue += +x.revenue; if (+x.visited > maxV) maxV = +x.visited; });
    var lbl = function (x) { if (CH[x.src]) return t(CH[x.src]); var k = SRC_SOURCES.filter(function (s) { return s[0] === x.src; })[0]; return esc(k ? t(k[1]) : x.src) + (x.campaign ? ' <span class="small muted">· ' + esc(x.campaign) + '</span>' : '') + ' <span class="chip">' + t(x.channel === 'bot' ? 'Бот' : 'Сайт') + '</span>'; };
    var top = X.rows.filter(function (x) { return +x.visited > 0; })[0];
    if (top) h += '<p class="small"><b>' + t('Больше всего клиентов пришло из: {s}', { s: lbl(top) }) + '</b></p>';
    h += '<div class="scroll"><table class="rct grid srct"><thead><tr><th>' + t('Источник') + '</th><th class="r">' + t('Записей') + '</th><th class="r">' + t('Пришли') + '</th><th class="r">' + t('Не пришли') + '</th><th class="r">' + t('Выручка') + '</th></tr></thead><tbody>' + X.rows.map(function (x) {
      return '<tr><td>' + lbl(x) + '<div class="bar" style="width:' + Math.round(+x.visited / maxV * 100) + '%;height:5px;margin-top:5px"></div></td><td class="r num">' + x.total + '</td><td class="r num"><b>' + x.visited + '</b></td><td class="r num">' + x.noshow + '</td><td class="r num">' + fmt(+x.revenue) + '</td></tr>';
    }).join('') + '</tbody><tfoot><tr><td><b>' + t('Итого') + '</b></td><td class="r num"><b>' + T.total + '</b></td><td class="r num"><b>' + T.visited + '</b></td><td class="r num"><b>' + T.noshow + '</b></td><td class="r num"><b>' + fmt(T.revenue) + '</b></td></tr></tfoot></table></div>';
  }
  h += '</section><section><h2>' + t('Ссылки для рекламы') + '</h2><div class="panel"><p class="small muted">' + t('Выберите, где будет стоять ссылка. Приложение создаст адрес с меткой, и клиенты с него будут видны в таблице выше. Записи по звонку и из живой очереди отмечает ресепшен.') + '</p>' +
    '<div class="fld"><span>' + t('Где размещаем') + '</span><div class="seg four">' + SRC_SOURCES.map(function (s) { return '<button type="button" data-act="src-pick" data-id="' + s[0] + '" aria-pressed="' + (u.source === s[0]) + '">' + t(s[1]) + '</button>'; }).join('') + '</div></div>' +
    (u.source === 'other' ? '<div class="fld"><span>' + t('Своё название') + '</span><input type="text" data-src="custom" value="' + esc(u.custom) + '" autocomplete="off"></div>' : '') +
    '<div class="fld"><span>' + t('Формат') + '</span><div class="seg four">' + SRC_MEDIA.map(function (s) { return '<button type="button" data-act="src-medium" data-id="' + s[0] + '" aria-pressed="' + (u.medium === s[0]) + '">' + t(s[1]) + '</button>'; }).join('') + '</div></div>' +
    '<div class="fld"><span>' + t('Название кампании (необязательно)') + '</span><input type="text" data-src="campaign" value="' + esc(u.campaign) + '" autocomplete="off" placeholder="' + esc(t('например: октябрь')) + '"></div>' +
    '<div id="src-links">' + srcLinksHtml(u) + '</div>' +
    '<p class="note">' + t('Штрих-код для входа по ссылке добавим позже: он будет вести на этот же адрес с меткой.') + '</p></div></section>';
  return h;
}
function loanRep(S, C) {
  var cfg = S.cfg, M = S.M, l = cfg.loan, B = C.B, started = !!(l.amount && ymOf(l.start) && ymOf(l.start) <= M), SC = sched(l, ymOf(l.start) || M), h = '';
  var acc = 0, nextPay = null; SC.forEach(function (x) { if (x.m <= M) acc += x.int; if (x.m === addM(M, 1)) nextPay = x; });
  var info = {}; cfg.assets.forEach(function (a) { info['asset:' + a.id] = (a.name || '') + (a.model ? ' (' + a.model + ')' : ''); });
  Object.keys(S.months).forEach(function (m) { ((S.months[m] && S.months[m].ops) || []).forEach(function (o) { if (o.t === 'expense' && o.c === 'equip') info['op:' + o.id] = o.n || ''; }); });
  var why = l.purpose === 'other' ? '' : (info[l.purpose] || ''); if (l.purposeNote) why = (why ? why + ' · ' : '') + l.purposeNote;
  h += '<section><h2>' + t('Кредит') + '</h2>';
  if (!l.amount) h += '<p class="empty">' + t('Кредит не указан. Заполните его на вкладке «Кредит и аренда».') + '</p></section>';
  else {
    h += '<div class="scroll"><table><tbody>' +
      tr('Сумма кредита', [l.amount]) + (why ? '<tr><td>' + t('На что взят кредит') + '</td><td class="r">' + esc(why) + '</td></tr>' : '') +
      '<tr><td>' + t('Получен') + '</td><td class="r">' + esc(fmtDate(l.start) || '—') + '</td></tr>' +
      '<tr><td>' + t('Ставка в год') + '</td><td class="r">' + String(l.rate).replace('.', ',') + '%</td></tr>' +
      '<tr><td>' + t('Срок, месяцев') + '</td><td class="r">' + l.term + '</td></tr>' +
      tr('Выплачено основного долга', [started ? l.amount - B.loan : 0]) + tr('Остаток долга', [started ? B.loan : 0], 'sum') +
      tr('Проценты, начислено к месяцу', [started ? acc : 0]) + tr('Платёж в следующем месяце', [started && nextPay ? nextPay.pr + nextPay.int : 0]) + '</tbody></table></div></section>';
  }
  h += '<section><h2>' + t('Техника и оборудование') + '</h2>';
  var items = []; cfg.assets.forEach(function (a) { items.push({ id: 'asset:' + a.id, name: (a.name || t('без названия')) + (a.model ? ' (' + a.model + ')' : ''), cost: a.cost || 0, ym: ymOf(a.date), life: Math.max(1, a.life || 1) }); });
  Object.keys(S.months).sort().forEach(function (m) { ((S.months[m] && S.months[m].ops) || []).forEach(function (o) { if (o.t === 'expense' && o.c === 'equip') items.push({ id: 'op:' + o.id, name: o.n || t('Покупка техники'), cost: o.a || 0, ym: ymOf(o.d) || m, life: 60 }); }); });
  if (!items.length) h += '<p class="empty">' + t('Техника не добавлена.') + '</p>';
  else {
    h += '<div class="scroll"><table><thead><tr><th>' + t('Название') + '</th><th class="r">' + t('Стоимость') + '</th><th class="r">' + t('Амортизация в месяц') + '</th><th class="r">' + t('Остаточная стоимость') + '</th></tr></thead><tbody>' + items.map(function (x) {
      var k = x.ym ? idx2(M) - idx2(x.ym) : 0, dep = k >= 1 ? Math.min(k, x.life) * x.cost / x.life : 0;
      return '<tr><td>' + esc(x.name) + (x.ym ? '<br><span class="small muted">' + esc(fmtM ? x.ym : x.ym) + '</span>' : '') + (l.purpose === x.id ? ' <span class="chip">' + t('Куплено в кредит') + '</span>' : '') + '</td><td class="r num">' + fmt(x.cost) + '</td><td class="r num">' + fmt(x.cost / x.life) + '</td><td class="r num">' + fmt(Math.max(0, x.cost - dep)) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  return h + '</section>';
}
function idx2(ym) { return (+ym.slice(0, 4)) * 12 + (+ym.slice(5, 7)) - 1; }

export function vRep(S, C) {
  var cfg = S.cfg, M = S.M, mn = months()[+M.slice(5, 7) - 1];
  var r = C.cur, y = ytd(C.rows, M), B = C.B, c = r.cf;
  var taxL = cfg.tax.regime === 'profit' ? t('Налог на прибыль {n}%', { n: cfg.tax.profit }) : t('Налог с оборота {n}%', { n: cfg.tax.turnover });
  var plH = '<section><h2>' + t('Прибыль и убытки') + '</h2><div class="scroll"><table><thead><tr><th></th><th>' + mn + '</th><th>' + t('С начала года') + '</th></tr></thead><tbody>' +
    tr('Выручка', [r.rev, y.rev], 'sum') + OPEX.map(function (k) { return tr(CATNAME[k], [r.opex[k] || 0, y.opex[k] || 0]); }).join('') +
    tr('Зарплата с социальным налогом', [r.payroll, y.payroll]) + tr('Аренда', [r.rent, y.rent]) + tr('Проценты по кредиту', [r.int, y.int]) + tr('Амортизация', [r.dep, y.dep]) +
    tr('Прибыль до налога', [r.preTax, y.preTax], 'sum') + tr(taxL, [r.tax, y.tax]) + tr('Чистая прибыль', [r.net, y.net], 'sum') + '</tbody></table></div></section>';
  var h = '';
  var cashH = '<section><h2>' + t('Движение денег за {m}', { m: lc(M) }) + '</h2><div class="scroll"><table><tbody>' +
    tr('Деньги на начало месяца', [r.open], 'sum') + tr('Получено от клиентов', [c.cust]) + tr('Текущие расходы', [-c.opex]) + tr('Зарплата и налоги с неё', [-c.wage]) + tr('Аренда', [-c.rent]) + tr('Налог с оборота или прибыли', [-c.tax]) +
    tr('Покупка оборудования и ремонт', [-c.capex]) + tr('Получен кредит', [c.loanIn]) + tr('Основной долг по кредиту', [-c.princ]) + tr('Проценты по кредиту', [-c.int]) + tr('Взнос учредителя', [c.contrib]) + tr('Выплата учредителю', [-c.div]) +
    tr('Деньги на конец месяца', [r.close], 'sum') + '</tbody></table></div></section>';
  var cashN = '<p class="note">' + t('Прибыль и деньги не совпадают: покупка аппарата и возврат кредита уменьшают деньги, но не прибыль, а амортизация уменьшает прибыль, но не деньги.') + '</p>';
  var K = compareTax(cfg, C.rows, M), cur = cfg.tax.regime === 'profit' ? 'profit' : 'turnover';
  var cmp = function (s) { return s.turnover <= s.profit ? 'turnover' : 'profit'; };
  var pct = Math.min(100, K.ytd.rev / K.limit * 100);
  var cmpH = '<section><h2>' + t('Сравнение налоговых режимов') + '</h2><div class="scroll"><table><thead><tr><th></th><th>' + mn + '</th><th>' + t('С начала года') + '</th></tr></thead><tbody>' +
    tr('Выручка', [K.month.rev, K.ytd.rev]) + tr('Прибыль до налога', [K.month.preTax, K.ytd.preTax]) +
    tr(t('Налог с оборота {n}%', { n: String(cfg.tax.turnover).replace('.', ',') }), [K.month.turnover, K.ytd.turnover], cur === 'turnover' ? 'sum' : '') +
    tr(t('Налог на прибыль {n}%', { n: String(cfg.tax.profit).replace('.', ',') }), [K.month.profit, K.ytd.profit], cur === 'profit' ? 'sum' : '') +
    tr('Разница (оборот − прибыль)', [K.month.turnover - K.month.profit, K.ytd.turnover - K.ytd.profit]) + '</tbody></table></div></section>';
  var cmpRest = '<section><p class="' + (cmp(K.ytd) === cur ? 'small muted' : 'alert') + '">' + (K.ytd.rev === 0 ? t('Пока нет выручки за год, сравнивать нечего.') :
      t('С начала года выгоднее {r}: он меньше на {n} сум.', { r: cmp(K.ytd) === 'turnover' ? t('налог с оборота') : t('налог на прибыль'), n: fmt(Math.abs(K.ytd.turnover - K.ytd.profit)) }) +
      (cmp(K.ytd) === cur ? t(' Сейчас выбран именно он.') : t(' Сейчас выбран другой режим (вкладка «Настройки»).'))) + '</p>' +
    '<div class="panel"><div class="row" style="justify-content:space-between"><span class="small muted">' + t('Выручка за год к пределу налога с оборота') + '</span><span class="num small">' + t('{a} из {b}', { a: fmt(K.ytd.rev), b: fmt(K.limit) }) + '</span></div><div class="bar" style="width:' + pct.toFixed(1) + '%"></div></div>' +
    '<p class="note">' + t('Сравнение упрощённое: налог на прибыль считается от прибыли каждого месяца отдельно, убыток одного месяца не уменьшает налог другого. Налог с оборота возможен только при выручке до 1 млрд сум в год. Какой режим применять, решает бухгалтер: программа ведёт внутренний учёт.') + '</p></section>';
  var fa = B.fa - B.dep, A = B.cash + B.bank + fa, L = B.loan + B.pay.wage + B.pay.rent + B.pay.int + B.pay.tax, E = B.contrib - B.div + B.profit;
  var balH = '<section><h2>' + t('Баланс на конец месяца') + '</h2><div class="scroll"><table><tbody>' +
    tr('Активы', [''], 'head') + tr('Касса', [B.cash]) + tr('Банк', [B.bank]) + tr('Оборудование и ремонт за вычетом амортизации', [fa]) + tr('Итого активы', [A], 'sum') +
    tr('Обязательства', [''], 'head') + tr('Кредит', [B.loan]) + tr('Зарплата и налоги с неё', [B.pay.wage]) + tr('Аренда', [B.pay.rent]) + tr('Проценты', [B.pay.int]) + tr('Налог с оборота или прибыли', [B.pay.tax]) + tr('Итого обязательства', [L], 'sum') +
    tr('Капитал', [''], 'head') + tr('Взносы учредителя', [B.contrib]) + tr('Выплаты учредителю', [-B.div]) + tr('Накопленная прибыль', [B.profit]) + tr('Итого капитал', [E], 'sum') +
    tr('Проверка: активы − обязательства − капитал', [A - L - E], 'sum') + '</tbody></table></div></section>';
  var balN = '<p class="note">' + t('Активы = Обязательства + Капитал. Если в строке проверки ноль, учёт сходится.') + '</p>';
  // один отчёт на экране: таблицы на всю ширину, переключатель сверху
  var blocks = { pl: plH, cash: cashH + cashN, bal: balH + balN, loan: loanRep(S, C), src: srcView(S), cmp: cmpH + cmpRest };
  var rv = blocks[S.repView] ? S.repView : 'pl';
  var nav = '<div class="seg four" role="tablist">' + [['pl', 'Прибыль'], ['cash', 'Деньги'], ['bal', 'Баланс'], ['loan', 'Кредит'], ['src', 'Источники'], ['cmp', 'Налоги']].map(function (x) {
    return '<button type="button" role="tab" data-act="rep-view" data-id="' + x[0] + '" aria-pressed="' + (rv === x[0]) + '">' + t(x[1]) + '</button>';
  }).join('') + '</div>';
  return nav + blocks[rv];
}

function lookBlock(S) { return ''; }
function _lookOld(S) {
  var lang = getLang(), th = S.theme || 'auto';
  var btn = function (act, id, on, label) { return '<button type="button" data-act="' + act + '" data-id="' + id + '" aria-pressed="' + on + '">' + label + '</button>'; };
  return '<section><h2>' + t('Язык и тема') + '</h2><div class="panel">' +
    '<div class="fld"><span>' + t('Язык') + '</span><div class="seg">' + btn('lang-set', 'ru', lang === 'ru', 'Русский') + btn('lang-set', 'uz', lang === 'uz', 'Ўзбекча') + '</div></div>' +
    '<div class="fld"><span>' + t('Тема') + '</span><div class="seg three">' + btn('theme-set', 'auto', th === 'auto', t('Как в системе')) + btn('theme-set', 'light', th === 'light', t('Светлая')) + btn('theme-set', 'dark', th === 'dark', t('Тёмная')) + '</div></div>' +
    '</div></section>';
}

// Доля врачей от оплаченных приёмов (данные приложения «Ресепшен»), процент задаётся здесь
function shareBlock(S) {
  var c = S.clinic, h = '<section><h2>' + t('Доля врачей от приёмов') + '</h2>';
  if (!S.sync.enabled || !S.sync.user) return h + '<p class="empty">' + t('Войдите в «Настройки» (синхронизация), чтобы видеть данные Ресепшена.') + '</p></section>';
  if (c.state === 'loading' || c.state === 'idle') return h + '<p class="empty">' + t('Загрузка…') + '</p></section>';
  if (c.state === 'norole') return h + '<p class="alert">' + t('У этой почты нет доступа к данным клиники. Откройте приложение «Ресепшен» и войдите владельцем.') + '</p></section>';
  if (c.state === 'error') return h + '<p class="alert">' + t('Не удалось получить данные клиники: {m}', { m: esc(c.msg) }) + '</p></section>';
  var tot = 0, sum = 0, cl = 0;
  h += '<ul class="list">' + c.rows.map(function (r) {
    tot += +r.share; sum += +r.total; cl += +r.clients;
    return '<li class="docshare"><div class="li-main"><b>' + esc(r.doctor_name) + '</b><span class="small muted">' + t('клиентов {n} · оплачено {s}', { n: r.clients, s: fmt(r.total) }) + '</span></div>' +
      '<input type="text" inputmode="decimal" class="n pct" data-pct="' + esc(r.doctor_id) + '" aria-label="' + esc(t('Процент врача, %')) + '" value="' + esc(String(+r.percent || '').replace('.', ',')) + '" placeholder="0"><span class="pctsign">%</span>' +
      '<span class="num share">' + fmt(r.share) + '</span></li>';
  }).join('') + '<li class="docshare sum"><div class="li-main"><b>' + t('Итого к выплате врачам') + '</b><span class="small muted">' + t('клиентов {n} · оплачено {s}', { n: cl, s: fmt(sum) }) + '</span></div><span class="num share">' + fmt(tot) + '</span></li></ul>' +
    '<p class="note">' + t('Считаются приёмы со статусом «Оплачено» из приложения «Ресепшен» за {m}. Доля = сумма оплат × процент. Проценты видите только вы.', { m: mName(S.M).toLowerCase() }) + '</p></section>';
  return h;
}

// Ссылки на другие приложения клиники
function appsBlock() {
  var row = function (name, desc, url) { return '<li><div class="li-main"><b>' + t(name) + '</b><span class="small muted">' + t(desc) + '</span></div><a class="btn ghost" href="' + url + '" target="_blank" rel="noopener">' + t('Открыть') + '</a></li>'; };
  return '<section><h2>' + t('Приложения клиники') + '</h2><ul class="list">' + row('Ресепшен', 'приём клиентов и касса', APP_LINKS.reception) + row('Очередь', 'запись для клиентов: ссылка для Instagram и бота', APP_LINKS.queue) + '</ul></section>';
}

function syncBlock(S) {
  var y = S.sync; if (!y.enabled) return '';
  var h = '<section><h2>' + t('Синхронизация между устройствами') + '</h2><div class="panel">';
  if (y.user) {
    h += '<p>' + t('Вы вошли как {e}.', { e: '<b>' + esc(y.user.email || '') + '</b>' }) + '</p>' +
      '<p><span id="status" class="chip"></span></p>' +
      '<div class="row"><button class="btn" data-act="sync-now"' + (y.state === 'busy' ? ' disabled' : '') + '>' + t('Синхронизировать сейчас') + '</button><button class="btn ghost" data-act="sync-logout">' + t('Выйти') + '</button></div>';
  } else {
    h += '<p><span id="status" class="chip"></span></p>' +
      '<label class="fld"><span>' + t('Почта') + '</span><input id="sync-email" type="email" autocomplete="username" inputmode="email" value="' + esc(y.email) + '"></label>' +
      '<label class="fld"><span>' + t('Пароль (не меньше 8 символов)') + '</span><input id="sync-pass" type="password" autocomplete="current-password" value="' + esc(y.pass) + '"></label>' +
      '<div class="row"><button class="btn" data-act="sync-login"' + (y.busy ? ' disabled' : '') + '>' + t('Войти') + '</button><button class="btn ghost" data-act="sync-signup"' + (y.busy ? ' disabled' : '') + '>' + t('Создать аккаунт') + '</button></div>';
  }
  return h + '</div><p class="note">' + t('Войдите с одной и той же почтой на компьютере и на телефоне, и данные будут общими. Приложение работает и без сети: правки отправятся, когда связь появится. Если один и тот же месяц изменили на двух устройствах без связи, останется более поздняя правка. Свои правки приложение отправляет сразу, а чужие подтягивает каждые 30 минут (или по кнопке «Синхронизировать сейчас»).') + '</p></section>';
}

// «О клинике»: то, что видят клиенты на сайте «Навбат» и в боте
function infoBlock(S) {
  var h = '<section><h2>' + t('О клинике') + '</h2>', I = S.info;
  if (!S.sync.enabled || !S.sync.user) return h + '<p class="empty">' + t('Войдите в «Настройки» (синхронизация), чтобы менять данные клиники.') + '</p></section>';
  if (I.state === 'loading' || I.state === 'idle') return h + '<p class="empty">' + t('Загрузка…') + '</p></section>';
  if (I.state === 'norole') return h + '<p class="alert">' + t('У этой почты нет доступа к данным клиники. Откройте приложение «Ресепшен» и войдите владельцем.') + '</p></section>';
  if (I.state === 'error') return h + '<p class="alert">' + t('Не удалось получить данные клиники: {m}', { m: esc(I.msg) }) + '</p></section>';
  var s = I.s, f = function (label, key, ph, mode) { return '<label class="fld"><span>' + t(label) + '</span><input type="text" data-info="' + key + '"' + (mode ? ' inputmode="' + mode + '"' : '') + ' value="' + esc(s[key] || '') + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + '></label>'; };
  var ta = function (label, key, rows) { return '<label class="fld"><span>' + t(label) + '</span><textarea rows="' + (rows || 3) + '" data-info="' + key + '">' + esc(s[key] || '') + '</textarea></label>'; };
  h += '<div class="panel">' + f('Адрес', 'address') + f('Ориентир (русский)', 'landmark_ru') + f('Ориентир (узбекский)', 'landmark_uz') +
    '<div class="fld"><span>' + t('Телефоны') + '</span>' + [0, 1, 2].map(function (i) { return '<input type="text" inputmode="tel" data-iph="' + i + '" placeholder="+998 90 123 45 67" value="' + esc(fmtPhone(s.ph[i] || '')) + '">'; }).join('') + '</div>' +
    f('Ссылка на карту', 'map_url', 'https://yandex.com/maps/…') +
    '<div class="grid">' + f('Широта', 'lat', '41.311', 'decimal') + f('Долгота', 'lng', '69.279', 'decimal') + '</div>' +
    '<p class="note">' + t('При нажатии на адрес на сайте и в боте открывается карта. Вставьте ссылку из Яндекс или Google карт: широта и долгота подставятся сами. Если ссылки нет, укажите широту и долготу.') + '</p>' +
    f('Слоган (русский)', 'slogan_ru') + f('Слоган (узбекский)', 'slogan_uz') +
    ta('О клинике (русский)', 'about_ru', 4) + ta('О клинике (узбекский)', 'about_uz', 4) +
    ta('Преимущества, по одному в строке (русский)', 'perks_ru_t', 6) + ta('Преимущества, по одному в строке (узбекский)', 'perks_uz_t', 6) + '</div>';
  h += '<div class="row gaptop"><button class="btn" data-act="info-save"' + (I.busy ? ' disabled' : '') + '>' + t('Сохранить') + '</button></div></section>';
  return h;
}

// Предоплата за бронь: карта, время удержания, услуги очереди с суммой или процентом
function prepayBlock(S) {
  var P = S.pp, h = '<section><h2>' + t('Предоплата за бронь') + '</h2>';
  if (!S.sync.enabled || !S.sync.user || P.state === 'idle' || P.state === 'loading') return h + '<p class="empty">' + (S.sync.user ? t('Загрузка…') : t('Войдите в «Настройки» (синхронизация), чтобы менять данные клиники.')) + '</p></section>';
  if (P.state === 'error') return h + '<p class="alert">' + t('Не удалось получить данные клиники: {m}', { m: esc(P.msg) }) + '</p></section>';
  var s = P.s, f = function (label, key, ph, mode, extra) { return '<label class="fld"><span>' + t(label) + '</span><input type="text" data-pp="' + key + '"' + (mode ? ' inputmode="' + mode + '"' : '') + (extra || '') + ' value="' + esc(s[key] == null ? '' : s[key]) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + '></label>'; };
  h += '<div class="panel">' + f('Номер карты', 'card_number', '8600 0000 0000 0000', 'numeric', ' maxlength="19"') + f('Владелец карты', 'card_holder') + f('Telegram для чека (кому отправить)', 'receipt_contact', '@username') + f('Время удержания брони, минут', 'hold_minutes', '30', 'numeric') + '</div>' +
    '<p class="note">' + t('Предоплата включается, когда указана карта и есть хотя бы одна услуга ниже. Клиент видит карту, сумму и время на оплату, затем отправляет фото чека.') + '</p>';
  h += '<h2>' + t('Услуги для очереди') + '</h2>' + (P.svc.length ? P.svc.map(function (x, i) {
    var dep = x.fixed !== '' && x.fixed != null ? +x.fixed : Math.round((+x.price || 0) * (+x.percent || 0) / 100);
    var g = function (label, key, kind) { return '<label class="fld"><span>' + t(label) + '</span><input type="text" data-psvc="' + i + ':' + key + '" data-pk="' + kind + '"' + (kind === 'text' ? '' : ' inputmode="decimal" class="n"') + ' value="' + esc(kind === 'money' ? (x[key] === '' || x[key] == null ? '' : fmt(x[key])) : (x[key] == null ? '' : String(x[key]).replace('.', ','))) + '"></label>'; };
    return '<div class="panel"><div class="grid">' + g('Название (русский)', 'name_ru', 'text') + g('Название (узбекский)', 'name_uz', 'text') + g('Полная сумма, сум', 'price', 'money') + g('Предоплата, % от суммы', 'percent', 'num') + g('Или фиксированная предоплата, сум', 'fixed', 'money') + '</div>' +
      '<div class="row"><span class="chip ok">' + t('Клиент внесёт вперёд') + ': ' + fmt(dep) + ' ' + t('сум') + '</span><button class="btn ghost danger small" data-act="pp-del" data-id="' + i + '">' + t('Удалить услугу') + '</button></div></div>';
  }).join('') : '<p class="empty">' + t('Пока нет услуг: предоплата выключена.') + '</p>') +
    '<div class="row gaptop"><button class="btn ghost" data-act="pp-add">' + t('Добавить услугу очереди') + '</button></div>';
  if (P.setup) h += '<div class="panel"><b>' + t('Чеки в Telegram для сотрудников') + '</b><p class="small">' + t('Нажмите, чтобы чеки приходили вам в Telegram:') + '</p><div class="row"><a class="btn" href="https://t.me/mittiyurakcha_bot?start=staff_' + esc(P.setup.code) + '" target="_blank" rel="noopener">' + t('Подключить Telegram') + '</a></div><p class="small muted">' + t('Или отправьте боту команду: {c}', { c: '<code>/staff ' + esc(P.setup.code) + '</code>' }) + '</p><p class="small muted">' + t('Подключено чатов: {n}', { n: P.setup.chats }) + '</p></div>';
  return h + '<div class="row"><button class="btn" data-act="pp-save"' + (P.busy ? ' disabled' : '') + '>' + t('Сохранить') + '</button></div></section>';
}

export function vSet(S) {
  var tx = S.cfg.tax;
  var tab = S.setTab || 'clinic';
  var tabs = '<div class="seg four settabs" role="tablist">' + [['clinic', 'Клиника'], ['prepay', 'Предоплата'], ['tax', 'Налоги'], ['data', 'Данные']].map(function (x) { return '<button type="button" data-act="set-tab" data-id="' + x[0] + '" aria-pressed="' + (tab === x[0]) + '">' + t(x[1]) + '</button>'; }).join('') + '</div>';
  var taxHtml = '<section><h2>' + t('Налоговый режим') + '</h2><div class="panel"><label class="fld"><span>' + t('Как фирма платит налог') + '</span>' +
    sel('f-tax-regime', [['turnover', 'Налог с оборота (выручка до 1 млрд сум в год)'], ['profit', 'Налог на прибыль (выручка выше 1 млрд сум)']], tx.regime, 'data-bind="tax.regime" data-kind="text"') + '</label>' +
    '<div class="grid">' + inp(S, t('Налог с оборота, %'), 'tax.turnover', 'num') + inp(S, t('Налог на прибыль, %'), 'tax.profit', 'num') + '</div></div></section>' +
    '<section><h2>' + t('Ставки с зарплаты') + '</h2><div class="panel"><div class="grid">' + inp(S, t('НДФЛ, %'), 'tax.ndfl', 'num') + inp(S, t('ИНПС, %'), 'tax.inps', 'num') + inp(S, t('Социальный налог, %'), 'tax.soc', 'num') + '</div></div>' +
    '<p class="note">' + t('Ставки по умолчанию взяты на 2026 год и сверены 10.10.2026. Налог на прибыль считается упрощённо, от прибыли каждого месяца. Перед сдачей отчётности сверяйте суммы с бухгалтером и my.soliq.uz: программа ведёт внутренний учёт и официальную отчётность не заменяет.') + '</p></section>' +
    '';
  var dataHtml = syncBlock(S) + appsBlock() +
    '<section><h2>' + t('Резервная копия') + '</h2><div class="panel">' +
    '<div class="row"><button class="btn" data-act="backup-save">' + t('Скачать резервную копию') + '</button><button class="btn ghost" data-act="backup-load">' + t('Загрузить из копии') + '</button></div>' +
    '<input id="backup-file" type="file" accept="application/json,.json" hidden></div>' +
    '<p class="note">' + t('Данные хранятся только на этом устройстве, в памяти браузера. Скачивайте копию регулярно и перед очисткой данных браузера. Загрузка из копии полностью заменяет текущие данные.') + '</p></section>' + lookBlock(S);
  return tabs + (tab === 'clinic' ? infoBlock(S) : tab === 'prepay' ? prepayBlock(S) : tab === 'tax' ? taxHtml : dataHtml);
}
