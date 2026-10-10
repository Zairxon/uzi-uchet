// Шесть вкладок. Разметка перенесена из прототипа без изменений; тексты идут через t() (русский / узбекский).
// Состояние приходит в объекте S: { cfg, months, M, draft, armed, sync }.
import { sched, payCalc, blank, ytd, compareTax } from './calc.js';
import { addM, mName, ymOf, fmt, esc } from './util.js';
import { t, months, getLang } from './i18n.js';
import { fmtDate } from './datepicker.js';
import { APP_LINKS } from './config.js';

export const TABS = [['home', 'Обзор'], ['ops', 'Операции'], ['pay', 'Зарплата'], ['loan', 'Кредит и аренда'], ['rep', 'Отчёты'], ['set', 'Настройки']];
export const CATS = {
  income: [['usl', 'Услуги УЗИ'], ['other_inc', 'Прочий доход'], ['contrib', 'Взнос учредителя']],
  expense: [['supplies', 'Расходные материалы'], ['util', 'Коммунальные и связь'], ['ads', 'Реклама'], ['repair', 'Обслуживание техники'], ['repair_bld', 'Ремонт здания (поломки)'], ['bank', 'Банковские комиссии'], ['other', 'Прочие расходы'],
    ['pay_sal', 'Выплата зарплаты'], ['pay_ptax', 'Налоги с зарплаты'], ['pay_rent', 'Оплата аренды (с НДФЛ)'], ['pay_int', 'Проценты по кредиту'], ['pay_princ', 'Основной долг по кредиту'], ['pay_tax', 'Налог с оборота или прибыли'], ['dividend', 'Выплата учредителю']],
};
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
export function vHome(S, C) {
  var M = S.M, r = C.cur, B = C.B, exp = r.opexSum + r.payroll + r.rent + r.int + r.dep + r.tax;
  var h = '<section><div class="kpis">' +
    '<div class="kpi"><span>' + t('Выручка') + '</span><b>' + fmt(r.rev) + '</b></div>' +
    '<div class="kpi"><span>' + t('Расходы и налог') + '</span><b>' + fmt(exp) + '</b></div>' +
    '<div class="kpi"><span>' + t('Чистая прибыль') + '</span><b class="' + (r.net < 0 ? 'neg' : 'pos') + '">' + fmt(r.net) + '</b></div>' +
    '<div class="kpi"><span>' + t('Деньги на конец месяца') + '</span><b>' + fmt(B.cash + B.bank) + '</b></div></div>' +
    '<p class="small muted">' + t('Суммы в сумах за {m}. Касса: {c}, банк: {b}.', { m: lc(M), c: '<span class="num">' + fmt(B.cash) + '</span>', b: '<span class="num">' + fmt(B.bank) + '</span>' }) + '</p></section>';
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

export function vOps(S) {
  var months_ = S.months, M = S.M, draft = S.draft;
  var ops = ((months_[M] && months_[M].ops) || []).slice().sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : 0; });
  var cats = CATS[draft.type]; if (!cats.some(function (c) { return c[0] === draft.cat; })) draft.cat = cats[0][0];
  var h = '<section><h2>' + t('Новая операция') + '</h2><form class="panel" id="opform" novalidate>' +
    '<div class="seg"><button type="button" data-act="type" data-id="income" aria-pressed="' + (draft.type === 'income') + '">' + t('Поступление') + '</button><button type="button" data-act="type" data-id="expense" aria-pressed="' + (draft.type === 'expense') + '">' + t('Списание') + '</button></div>' +
    '<div class="grid">' +
    '<label class="fld"><span>' + t('Дата') + '</span>' + dateField('<input id="op-date" type="text" inputmode="numeric" maxlength="10" autocomplete="off" placeholder="' + esc(t('дд.мм.гггг')) + '" data-d="date" data-kind="date" value="' + esc(fmtDate(draft.date)) + '">', 'op-date') + '</label>' +
    '<label class="fld"><span>' + t('Сумма, сум') + '</span><input id="op-amount" type="text" inputmode="numeric" class="n" data-d="amount" data-kind="money" value="' + esc(draft.amount) + '" placeholder="0"></label>' +
    '<label class="fld"><span>' + t('Категория') + '</span>' + sel('op-cat', cats, draft.cat, 'data-d="cat"') + '</label>' +
    '<label class="fld"><span>' + t('Счёт') + '</span>' + sel('op-acct', [['cash', 'Касса (наличные)'], ['bank', 'Банк (карта, перечисление)']], draft.acct, 'data-d="acct"') + '</label>' +
    '</div><label class="fld"><span>' + t('Комментарий') + '</span><input id="op-note" type="text" data-d="note" value="' + esc(draft.note) + '" placeholder="' + esc(t('Например: выручка за день, 14 пациентов')) + '"></label>' +
    '<div class="row"><button class="btn" type="submit">' + t('Добавить') + '</button></div></form>' +
    '<p class="note">' + t('Зарплата, аренда, проценты и амортизация попадают в расходы автоматически из вкладок «Зарплата» и «Кредит и аренда». Здесь записывайте их оплату: она уменьшает деньги и долг, но второй раз расходом не считается.') + '</p></section>';
  h += '<section><h2>' + t('Операции за {m}', { m: lc(M) }) + '</h2>';
  if (!ops.length) h += '<p class="empty">' + t('Пока нет записей. Добавьте первое поступление или списание в форме выше.') + '</p>';
  else {
    h += '<ul class="list">'; var day = ''; ops.forEach(function (o) {
      if (o.d !== day) { day = o.d; h += '<li class="day" style="border-bottom:0;padding-bottom:0">' + esc(o.d.slice(8, 10) + '.' + o.d.slice(5, 7)) + '</li>'; }
      h += '<li><div class="li-main"><b>' + esc(CATNAME[o.c] ? t(CATNAME[o.c]) : o.c) + '</b><span class="small muted">' + (o.acct === 'bank' ? t('банк') : t('касса')) + (o.n ? ' · ' + esc(o.n) : '') + '</span></div><span class="num ' + (o.t === 'income' ? 'pos' : 'neg') + '">' + (o.t === 'income' ? '+' : '−') + fmt(o.a) + '</span>' + delBtn(S, 'del-op', o.id) + '</li>';
    }); h += '</ul>';
  }
  return h + '</section>';
}

export function vPay(S) {
  var cfg = S.cfg, months_ = S.months, M = S.M;
  var p = months_[M] && months_[M].payroll, live = payCalc(cfg.staff, cfg.tax), show = p || live, tx = cfg.tax;
  var h = '<section><h2>' + t('Расчёт за {m}', { m: lc(M) }) + ' <span class="chip ' + (p ? 'ok' : '') + '">' + (p ? t('начислено') : t('не начислено')) + '</span></h2>';
  if (!show.lines.length) h += '<p class="empty">' + t('Добавьте сотрудников ниже, и здесь появится расчёт зарплаты и налогов.') + '</p>';
  else {
    h += '<div class="scroll"><table class="wide"><thead><tr><th>' + t('Сотрудник') + '</th><th>' + t('Начислено') + '</th><th>' + t('НДФЛ') + '</th><th>' + t('ИНПС') + '</th><th>' + t('На руки') + '</th></tr></thead><tbody>' +
      show.lines.map(function (l) { return '<tr><td class="lbl">' + esc(l.name) + '<br><span class="small muted">' + esc(l.role || '') + '</span></td><td class="num">' + fmt(l.gross) + '</td><td class="num">' + fmt(l.ndfl) + '</td><td class="num">' + fmt(l.inps) + '</td><td class="num">' + fmt(l.net) + '</td></tr>'; }).join('') +
      '<tr class="sum"><td>' + t('Итого') + '</td><td class="num">' + fmt(show.gross) + '</td><td class="num">' + fmt(show.ndfl) + '</td><td class="num">' + fmt(show.inps) + '</td><td class="num">' + fmt(show.net) + '</td></tr></tbody></table></div>' +
      '<ul class="list"><li><div class="li-main"><b>' + t('Социальный налог {n}%', { n: tx.soc }) + '</b><span class="small muted">' + t('платит фирма сверх зарплаты') + '</span></div><span class="num">' + fmt(show.soc) + '</span></li>' +
      '<li><div class="li-main"><b>' + t('Полная стоимость для фирмы') + '</b><span class="small muted">' + t('начислено + социальный налог') + '</span></div><span class="num">' + fmt(show.gross + show.soc) + '</span></li>' +
      '<li><div class="li-main"><b>' + t('В бюджет и ИНПС') + '</b><span class="small muted">' + t('НДФЛ + ИНПС + социальный налог') + '</span></div><span class="num">' + fmt(show.ndfl + show.inps + show.soc) + '</span></li></ul>' +
      '<div class="row">' + (p ? '<button class="btn ghost" data-act="unaccrue">' + t('Отменить начисление') + '</button>' : '<button class="btn" data-act="accrue">' + t('Начислить за {m}', { m: lc(M) }) + '</button>') + '</div>' +
      '<p class="note">' + (p ? t('Расчёт зафиксирован и попал в расходы месяца. Изменения в списке сотрудников на него не влияют.') : t('Пока это предварительный расчёт. После начисления сумма попадёт в расходы месяца и в долг по зарплате.')) + ' ' + t('ИНПС {n}% идёт на пенсионный счёт сотрудника из суммы НДФЛ, поэтому на руки он не влияет.', { n: String(tx.inps).replace('.', ',') }) + '</p>';
  }
  h += '</section><section><h2>' + t('Сотрудники') + '</h2>';
  if (cfg.staff.length) h += '<div class="panel">' + cfg.staff.map(function (s, i) { return '<div class="staff">' + inp(S, t('Имя') + (s.example ? ' <span class="chip">' + t('пример') + '</span>' : ''), 'staff.' + i + '.name', 'text') + inp(S, t('Должность'), 'staff.' + i + '.role', 'text') + inp(S, t('Оклад, сум'), 'staff.' + i + '.salary', 'money') + delBtn(S, 'del-staff', s.id) + '</div>'; }).join('') + '</div>';
  h += '<div class="row"><button class="btn ghost" data-act="add-staff">' + t('Добавить сотрудника') + '</button></div></section>';
  return h + shareBlock(S);
}

export function vLoan(S) {
  var cfg = S.cfg, M = S.M;
  var l = cfg.loan, r = cfg.rent, SC = sched(l, ymOf(l.start) || M), tot = 0; SC.forEach(function (x) { tot += x.int; });
  var h = '<section><h2>' + t('Кредит') + '</h2><div class="panel"><div class="grid">' + inp(S, t('Сумма, сум'), 'loan.amount', 'money') + inp(S, t('Ставка, % годовых'), 'loan.rate', 'num') + inp(S, t('Срок, месяцев'), 'loan.term', 'num') + inp(S, t('Льготный период, месяцев'), 'loan.grace', 'num') + inp(S, t('Дата получения'), 'loan.start', 'date') + '</div>' +
    (l.start ? '' : '<p class="alert">' + t('Дата получения не указана: график показан для примера и в отчёты не попадает.') + '</p>') + '</div>';
  if (SC.length) {
    var fp = SC[Math.min(SC.length - 1, l.grace)];
    h += '<ul class="list"><li><div class="li-main"><b>' + t('Платёж в льготный период') + '</b><span class="small muted">' + t('только проценты') + '</span></div><span class="num">' + fmt(SC[0].int) + '</span></li>' +
      '<li><div class="li-main"><b>' + t('Первый платёж после льготы') + '</b><span class="small muted">' + t('основной долг + проценты, дальше уменьшается') + '</span></div><span class="num">' + fmt(fp.pr + fp.int) + '</span></li>' +
      '<li><div class="li-main"><b>' + t('Всего процентов за срок') + '</b></div><span class="num">' + fmt(tot) + '</span></li></ul>' +
      '<div class="scroll tall"><table class="wide"><thead><tr><th>№</th><th>' + t('Месяц') + '</th><th>' + t('Остаток') + '</th><th>' + t('Основной долг') + '</th><th>' + t('Проценты') + '</th><th>' + t('Платёж') + '</th></tr></thead><tbody>' +
      SC.map(function (x) { return '<tr><td>' + x.k + '</td><td class="num">' + x.m.slice(5, 7) + '.' + x.m.slice(0, 4) + '</td><td class="num">' + fmt(x.open) + '</td><td class="num">' + fmt(x.pr) + '</td><td class="num">' + fmt(x.int) + '</td><td class="num">' + fmt(x.pr + x.int) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
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
    return '<div class="grid">' + inp(S, t('Название'), 'assets.' + i + '.name', 'text', 'full') + inp(S, t('Стоимость, сум'), 'assets.' + i + '.cost', 'money') + inp(S, t('Дата покупки'), 'assets.' + i + '.date', 'date') + inp(S, t('Срок службы, месяцев'), 'assets.' + i + '.life', 'num') +
      '<label class="fld"><span>' + t('Оплачено') + '</span>' + sel('f-assets-' + i + '-acct', [['bank', 'с банка'], ['cash', 'из кассы']], a.acct || 'bank', 'data-bind="assets.' + i + '.acct" data-kind="text"') + '</label>' +
      '<div class="fld"><span>' + t('В месяц в расходы') + '</span><div class="row"><span class="num">' + fmt((a.cost || 0) / Math.max(1, a.life || 1)) + '</span>' + delBtn(S, 'del-asset', a.id) + '</div></div></div>';
  }).join('<hr style="border:0;border-top:1px solid var(--line);width:100%;margin:0">') + '</div>';
  h += '<div class="row"><button class="btn ghost" data-act="add-asset">' + t('Добавить объект') + '</button></div>' +
    '<p class="note">' + t('Покупка сама уменьшает деньги на счёте в месяц покупки, отдельная операция не нужна. Амортизация начинается со следующего месяца.') + '</p></section>';
  return h;
}

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
  var blocks = { pl: plH, cash: cashH + cashN, bal: balH + balN, cmp: cmpH + cmpRest };
  var rv = blocks[S.repView] ? S.repView : 'pl';
  var nav = '<div class="seg four" role="tablist">' + [['pl', 'Прибыль'], ['cash', 'Деньги'], ['bal', 'Баланс'], ['cmp', 'Налоги']].map(function (x) {
    return '<button type="button" role="tab" data-act="rep-view" data-id="' + x[0] + '" aria-pressed="' + (rv === x[0]) + '">' + t(x[1]) + '</button>';
  }).join('') + '</div>';
  return nav + blocks[rv];
}

function lookBlock(S) {
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

export function vSet(S) {
  var tx = S.cfg.tax;
  return lookBlock(S) + '<section><h2>' + t('Налоговый режим') + '</h2><div class="panel"><label class="fld"><span>' + t('Как фирма платит налог') + '</span>' +
    sel('f-tax-regime', [['turnover', 'Налог с оборота (выручка до 1 млрд сум в год)'], ['profit', 'Налог на прибыль (выручка выше 1 млрд сум)']], tx.regime, 'data-bind="tax.regime" data-kind="text"') + '</label>' +
    '<div class="grid">' + inp(S, t('Налог с оборота, %'), 'tax.turnover', 'num') + inp(S, t('Налог на прибыль, %'), 'tax.profit', 'num') + '</div></div></section>' +
    '<section><h2>' + t('Ставки с зарплаты') + '</h2><div class="panel"><div class="grid">' + inp(S, t('НДФЛ, %'), 'tax.ndfl', 'num') + inp(S, t('ИНПС, %'), 'tax.inps', 'num') + inp(S, t('Социальный налог, %'), 'tax.soc', 'num') + '</div></div>' +
    '<p class="note">' + t('Ставки по умолчанию взяты на 2026 год и сверены 10.10.2026. Налог на прибыль считается упрощённо, от прибыли каждого месяца. Перед сдачей отчётности сверяйте суммы с бухгалтером и my.soliq.uz: программа ведёт внутренний учёт и официальную отчётность не заменяет.') + '</p></section>' +
    syncBlock(S) + appsBlock() +
    '<section><h2>' + t('Резервная копия') + '</h2><div class="panel">' +
    '<div class="row"><button class="btn" data-act="backup-save">' + t('Скачать резервную копию') + '</button><button class="btn ghost" data-act="backup-load">' + t('Загрузить из копии') + '</button></div>' +
    '<input id="backup-file" type="file" accept="application/json,.json" hidden></div>' +
    '<p class="note">' + t('Данные хранятся только на этом устройстве, в памяти браузера. Скачивайте копию регулярно и перед очисткой данных браузера. Загрузка из копии полностью заменяет текущие данные.') + '</p></section>';
}
