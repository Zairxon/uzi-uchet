// Шесть вкладок. Разметка и тексты перенесены из прототипа без изменений.
// Состояние приходит в объекте S: { cfg, months, M, draft, armed }.
import heroUrl from './assets/hero.jpg';
import { sched, payCalc, blank, ytd, compareTax } from './calc.js';
import { MONTHS, addM, mName, ymOf, fmt, esc } from './util.js';

export const TABS = [['home', 'Обзор'], ['ops', 'Операции'], ['pay', 'Зарплата'], ['loan', 'Кредит и аренда'], ['rep', 'Отчёты'], ['set', 'Настройки']];
export const CATS = {
  income: [['usl', 'Услуги УЗИ'], ['other_inc', 'Прочий доход'], ['contrib', 'Взнос учредителя']],
  expense: [['supplies', 'Расходные материалы'], ['util', 'Коммунальные и связь'], ['ads', 'Реклама'], ['repair', 'Обслуживание техники'], ['repair_bld', 'Ремонт здания (поломки)'], ['bank', 'Банковские комиссии'], ['other', 'Прочие расходы'],
    ['pay_sal', 'Выплата зарплаты'], ['pay_ptax', 'Налоги с зарплаты'], ['pay_rent', 'Оплата аренды (с НДФЛ)'], ['pay_int', 'Проценты по кредиту'], ['pay_princ', 'Основной долг по кредиту'], ['pay_tax', 'Налог с оборота или прибыли'], ['dividend', 'Выплата учредителю']],
};
const OPEX = ['supplies', 'util', 'ads', 'repair', 'repair_bld', 'bank', 'other'];
const CATNAME = {}; CATS.income.concat(CATS.expense).forEach(function (c) { CATNAME[c[0]] = c[1]; });

/* ---------- small html helpers ---------- */
export function getP(o, path) { return path.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
export function setP(o, path, v) { var ks = path.split('.'), l = ks.pop(); ks.reduce(function (a, k) { return a[k]; }, o)[l] = v; }
function inp(S, label, path, kind, cls) {
  var v = getP(S.cfg, path), id = 'f-' + path.replace(/\./g, '-'), a = '';
  if (kind === 'money') a = 'type="text" inputmode="numeric" class="n" value="' + (v ? fmt(v) : '') + '"';
  else if (kind === 'num') a = 'type="text" inputmode="decimal" class="n" value="' + esc(String(v == null ? '' : v).replace('.', ',')) + '"';
  else if (kind === 'date') a = 'type="date" min="2000-01-01" max="2100-12-31" value="' + esc(v || '') + '"';
  else a = 'type="text" value="' + esc(v || '') + '"';
  return '<label class="fld' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><input id="' + id + '" data-bind="' + path + '" data-kind="' + kind + '" ' + a + '></label>';
}
function sel(id, opts, val, attr) { return '<select id="' + id + '" ' + (attr || '') + '>' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === val ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
function tr(label, vals, cls) { return '<tr class="' + (cls || '') + '"><td class="lbl">' + label + '</td>' + vals.map(function (v) { return '<td class="num">' + (v === '' ? '' : fmt(v)) + '</td>'; }).join('') + '</tr>'; }
function delBtn(S, act, id) { var on = S.armed === act + id; return '<button class="btn del' + (on ? ' armed' : '') + '" data-act="' + act + '" data-id="' + esc(id) + '" aria-label="Удалить">' + (on ? 'Удалить?' : '×') + '</button>'; }

/* ---------- views ---------- */
export function vHome(S, C) {
  var M = S.M, r = C.cur, B = C.B, exp = r.opexSum + r.payroll + r.rent + r.int + r.dep + r.tax;
  var h = '<div class="hero-wrap"><img class="hero" src="' + heroUrl + '" alt=""><div class="hero-cap">УЗИ-скрининг клиника</div></div>' +
    '<section><div class="kpis">' +
    '<div class="kpi"><span>Выручка</span><b>' + fmt(r.rev) + '</b></div>' +
    '<div class="kpi"><span>Расходы и налог</span><b>' + fmt(exp) + '</b></div>' +
    '<div class="kpi"><span>Чистая прибыль</span><b class="' + (r.net < 0 ? 'neg' : 'pos') + '">' + fmt(r.net) + '</b></div>' +
    '<div class="kpi"><span>Деньги на конец месяца</span><b>' + fmt(B.cash + B.bank) + '</b></div></div>' +
    '<p class="small muted">Суммы в сумах за ' + mName(M).toLowerCase() + '. Касса: <span class="num">' + fmt(B.cash) + '</span>, банк: <span class="num">' + fmt(B.bank) + '</span>.</p></section>';
  var due = [['Кредит, остаток основного долга', B.loan], ['Зарплата и налоги с неё', B.pay.wage], ['Аренда', B.pay.rent], ['Проценты по кредиту', B.pay.int], ['Налог с оборота или прибыли', B.pay.tax]];
  h += '<section><h2>Долги на конец месяца</h2><ul class="list">' + due.map(function (d) { return '<li><div class="li-main"><b>' + d[0] + '</b></div><span class="num">' + fmt(d[1]) + '</span></li>'; }).join('') + '</ul>' +
    '<p class="note">Начислено, но ещё не оплачено. Отрицательная сумма означает переплату.</p></section>';
  var last = []; for (var k = 5; k >= 0; k--) { var m = addM(M, -k), x = C.rows.filter(function (q) { return q.m === m; })[0] || blank(m); last.push(x); }
  var mx = Math.max.apply(null, last.map(function (x) { return x.rev; }).concat([1]));
  h += '<section><h2>Выручка и прибыль за полгода</h2><div class="panel"><div class="trend">' + last.map(function (x) {
    return '<span class="small muted">' + MONTHS[+x.m.slice(5, 7) - 1].slice(0, 3) + '</span><div><div class="bar" style="width:' + Math.max(0, x.rev / mx * 100).toFixed(1) + '%"></div></div><span class="num small">' + fmt(x.rev) + ' / <span class="' + (x.net < 0 ? 'neg' : 'pos') + '">' + fmt(x.net) + '</span></span>';
  }).join('') +
    '</div><p class="small muted">Полоса показывает выручку. Справа: выручка / чистая прибыль.</p></div></section>';
  return h;
}

export function vOps(S) {
  var months = S.months, M = S.M, draft = S.draft;
  var ops = ((months[M] && months[M].ops) || []).slice().sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : 0; });
  var cats = CATS[draft.type]; if (!cats.some(function (c) { return c[0] === draft.cat; })) draft.cat = cats[0][0];
  var h = '<section><h2>Новая операция</h2><form class="panel" id="opform" novalidate>' +
    '<div class="seg"><button type="button" data-act="type" data-id="income" aria-pressed="' + (draft.type === 'income') + '">Поступление</button><button type="button" data-act="type" data-id="expense" aria-pressed="' + (draft.type === 'expense') + '">Списание</button></div>' +
    '<div class="grid">' +
    '<label class="fld"><span>Дата</span><input id="op-date" type="date" min="2000-01-01" max="2100-12-31" data-d="date" value="' + esc(draft.date) + '"></label>' +
    '<label class="fld"><span>Сумма, сум</span><input id="op-amount" type="text" inputmode="numeric" class="n" data-d="amount" data-kind="money" value="' + esc(draft.amount) + '" placeholder="0"></label>' +
    '<label class="fld"><span>Категория</span>' + sel('op-cat', cats, draft.cat, 'data-d="cat"') + '</label>' +
    '<label class="fld"><span>Счёт</span>' + sel('op-acct', [['cash', 'Касса (наличные)'], ['bank', 'Банк (карта, перечисление)']], draft.acct, 'data-d="acct"') + '</label>' +
    '</div><label class="fld"><span>Комментарий</span><input id="op-note" type="text" data-d="note" value="' + esc(draft.note) + '" placeholder="Например: выручка за день, 14 пациентов"></label>' +
    '<div class="row"><button class="btn" type="submit">Добавить</button></div></form>' +
    '<p class="note">Зарплата, аренда, проценты и амортизация попадают в расходы автоматически из вкладок «Зарплата» и «Кредит и аренда». Здесь записывайте их оплату: она уменьшает деньги и долг, но второй раз расходом не считается.</p></section>';
  h += '<section><h2>Операции за ' + mName(M).toLowerCase() + '</h2>';
  if (!ops.length) h += '<p class="empty">Пока нет записей. Добавьте первое поступление или списание в форме выше.</p>';
  else {
    h += '<ul class="list">'; var day = ''; ops.forEach(function (o) {
      if (o.d !== day) { day = o.d; h += '<li class="day" style="border-bottom:0;padding-bottom:0">' + esc(o.d.slice(8, 10) + '.' + o.d.slice(5, 7)) + '</li>'; }
      h += '<li><div class="li-main"><b>' + esc(CATNAME[o.c] || o.c) + '</b><span class="small muted">' + (o.acct === 'bank' ? 'банк' : 'касса') + (o.n ? ' · ' + esc(o.n) : '') + '</span></div><span class="num ' + (o.t === 'income' ? 'pos' : 'neg') + '">' + (o.t === 'income' ? '+' : '−') + fmt(o.a) + '</span>' + delBtn(S, 'del-op', o.id) + '</li>';
    }); h += '</ul>';
  }
  return h + '</section>';
}

export function vPay(S) {
  var cfg = S.cfg, months = S.months, M = S.M;
  var p = months[M] && months[M].payroll, live = payCalc(cfg.staff, cfg.tax), show = p || live, t = cfg.tax;
  var h = '<section><h2>Расчёт за ' + mName(M).toLowerCase() + ' <span class="chip ' + (p ? 'ok' : '') + '">' + (p ? 'начислено' : 'не начислено') + '</span></h2>';
  if (!show.lines.length) h += '<p class="empty">Добавьте сотрудников ниже, и здесь появится расчёт зарплаты и налогов.</p>';
  else {
    h += '<div class="scroll"><table class="wide"><thead><tr><th>Сотрудник</th><th>Начислено</th><th>НДФЛ</th><th>ИНПС</th><th>На руки</th></tr></thead><tbody>' +
      show.lines.map(function (l) { return '<tr><td class="lbl">' + esc(l.name) + '<br><span class="small muted">' + esc(l.role || '') + '</span></td><td class="num">' + fmt(l.gross) + '</td><td class="num">' + fmt(l.ndfl) + '</td><td class="num">' + fmt(l.inps) + '</td><td class="num">' + fmt(l.net) + '</td></tr>'; }).join('') +
      '<tr class="sum"><td>Итого</td><td class="num">' + fmt(show.gross) + '</td><td class="num">' + fmt(show.ndfl) + '</td><td class="num">' + fmt(show.inps) + '</td><td class="num">' + fmt(show.net) + '</td></tr></tbody></table></div>' +
      '<ul class="list"><li><div class="li-main"><b>Социальный налог ' + t.soc + '%</b><span class="small muted">платит фирма сверх зарплаты</span></div><span class="num">' + fmt(show.soc) + '</span></li>' +
      '<li><div class="li-main"><b>Полная стоимость для фирмы</b><span class="small muted">начислено + социальный налог</span></div><span class="num">' + fmt(show.gross + show.soc) + '</span></li>' +
      '<li><div class="li-main"><b>В бюджет и ИНПС</b><span class="small muted">НДФЛ + ИНПС + социальный налог</span></div><span class="num">' + fmt(show.ndfl + show.inps + show.soc) + '</span></li></ul>' +
      '<div class="row">' + (p ? '<button class="btn ghost" data-act="unaccrue">Отменить начисление</button>' : '<button class="btn" data-act="accrue">Начислить за ' + mName(M).toLowerCase() + '</button>') + '</div>' +
      '<p class="note">' + (p ? 'Расчёт зафиксирован и попал в расходы месяца. Изменения в списке сотрудников на него не влияют.' : 'Пока это предварительный расчёт. После начисления сумма попадёт в расходы месяца и в долг по зарплате.') + ' ИНПС ' + String(t.inps).replace('.', ',') + '% идёт на пенсионный счёт сотрудника из суммы НДФЛ, поэтому на руки он не влияет.</p>';
  }
  h += '</section><section><h2>Сотрудники</h2>';
  if (cfg.staff.length) h += '<div class="panel">' + cfg.staff.map(function (s, i) { return '<div class="staff">' + inp(S, 'Имя' + (s.example ? ' <span class="chip">пример</span>' : ''), 'staff.' + i + '.name', 'text') + inp(S, 'Должность', 'staff.' + i + '.role', 'text') + inp(S, 'Оклад, сум', 'staff.' + i + '.salary', 'money') + delBtn(S, 'del-staff', s.id) + '</div>'; }).join('') + '</div>';
  h += '<div class="row"><button class="btn ghost" data-act="add-staff">Добавить сотрудника</button></div></section>';
  return h;
}

export function vLoan(S) {
  var cfg = S.cfg, M = S.M;
  var l = cfg.loan, r = cfg.rent, SC = sched(l, ymOf(l.start) || M), tot = 0; SC.forEach(function (x) { tot += x.int; });
  var h = '<section><h2>Кредит</h2><div class="panel"><div class="grid">' + inp(S, 'Сумма, сум', 'loan.amount', 'money') + inp(S, 'Ставка, % годовых', 'loan.rate', 'num') + inp(S, 'Срок, месяцев', 'loan.term', 'num') + inp(S, 'Льготный период, месяцев', 'loan.grace', 'num') + inp(S, 'Дата получения', 'loan.start', 'date') + '</div>' +
    (l.start ? '' : '<p class="alert">Дата получения не указана: график показан для примера и в отчёты не попадает.</p>') + '</div>';
  if (SC.length) {
    var fp = SC[Math.min(SC.length - 1, l.grace)];
    h += '<ul class="list"><li><div class="li-main"><b>Платёж в льготный период</b><span class="small muted">только проценты</span></div><span class="num">' + fmt(SC[0].int) + '</span></li>' +
      '<li><div class="li-main"><b>Первый платёж после льготы</b><span class="small muted">основной долг + проценты, дальше уменьшается</span></div><span class="num">' + fmt(fp.pr + fp.int) + '</span></li>' +
      '<li><div class="li-main"><b>Всего процентов за срок</b></div><span class="num">' + fmt(tot) + '</span></li></ul>' +
      '<div class="scroll tall"><table class="wide"><thead><tr><th>№</th><th>Месяц</th><th>Остаток</th><th>Основной долг</th><th>Проценты</th><th>Платёж</th></tr></thead><tbody>' +
      SC.map(function (x) { return '<tr><td>' + x.k + '</td><td class="num">' + x.m.slice(5, 7) + '.' + x.m.slice(0, 4) + '</td><td class="num">' + fmt(x.open) + '</td><td class="num">' + fmt(x.pr) + '</td><td class="num">' + fmt(x.int) + '</td><td class="num">' + fmt(x.pr + x.int) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="note">Основной долг гасится равными долями после льготного периода, проценты считаются на остаток как ставка ÷ 12. Банк считает по дням, поэтому его график будет отличаться на небольшие суммы.</p>';
  }
  h += '</section>';
  var minR = (r.area || 0) * (r.minRate || 0), nd = (r.amount || 0) * cfg.tax.ndfl / 100;
  h += '<section><h2>Аренда здания у учредителя</h2><div class="panel"><div class="grid">' + inp(S, 'Аренда в месяц, сум', 'rent.amount', 'money') + inp(S, 'Дата начала', 'rent.start', 'date') + inp(S, 'Площадь, м²', 'rent.area', 'num') + inp(S, 'Минимальная ставка за м², сум', 'rent.minRate', 'money') + '</div></div>' +
    '<ul class="list"><li><div class="li-main"><b>Минимальная аренда для налога</b><span class="small muted">площадь × минимальная ставка</span></div><span class="num">' + fmt(minR) + '</span></li>' +
    '<li><div class="li-main"><b>НДФЛ ' + cfg.tax.ndfl + '%</b><span class="small muted">фирма удерживает и платит в бюджет</span></div><span class="num">' + fmt(nd) + '</span></li>' +
    '<li><div class="li-main"><b>Учредителю на руки</b></div><span class="num">' + fmt((r.amount || 0) - nd) + '</span></li></ul>' +
    (r.amount && r.amount < minR ? '<p class="alert">Аренда ниже минимальной. Налоговая посчитает НДФЛ от ' + fmt(minR) + ' сум.</p>' : '') +
    '<p class="note">Минимальная ставка 28 400 сум за м² действует в 2026 году для нежилых помещений в областных центрах. Уточните у бухгалтера, нет ли повышающего коэффициента.</p></section>';
  h += '<section><h2>Оборудование и ремонт</h2>';
  if (!cfg.assets.length) h += '<p class="empty">Добавьте аппараты УЗИ, мебель и ремонт помещения. Их стоимость будет списываться в расходы по частям каждый месяц.</p>';
  else h += '<div class="panel">' + cfg.assets.map(function (a, i) {
    return '<div class="grid">' + inp(S, 'Название', 'assets.' + i + '.name', 'text', 'full') + inp(S, 'Стоимость, сум', 'assets.' + i + '.cost', 'money') + inp(S, 'Дата покупки', 'assets.' + i + '.date', 'date') + inp(S, 'Срок службы, месяцев', 'assets.' + i + '.life', 'num') +
      '<label class="fld"><span>Оплачено</span>' + sel('f-assets-' + i + '-acct', [['bank', 'с банка'], ['cash', 'из кассы']], a.acct || 'bank', 'data-bind="assets.' + i + '.acct" data-kind="text"') + '</label>' +
      '<div class="fld"><span>В месяц в расходы</span><div class="row"><span class="num">' + fmt((a.cost || 0) / Math.max(1, a.life || 1)) + '</span>' + delBtn(S, 'del-asset', a.id) + '</div></div></div>';
  }).join('<hr style="border:0;border-top:1px solid var(--line);width:100%;margin:0">') + '</div>';
  h += '<div class="row"><button class="btn ghost" data-act="add-asset">Добавить объект</button></div>' +
    '<p class="note">Покупка сама уменьшает деньги на счёте в месяц покупки, отдельная операция не нужна. Амортизация начинается со следующего месяца.</p></section>';
  return h;
}

export function vRep(S, C) {
  var cfg = S.cfg, M = S.M;
  var r = C.cur, y = ytd(C.rows, M), B = C.B, c = r.cf;
  var taxL = cfg.tax.regime === 'profit' ? 'Налог на прибыль ' + cfg.tax.profit + '%' : 'Налог с оборота ' + cfg.tax.turnover + '%';
  var h = '<section><h2>Прибыль и убытки</h2><div class="scroll"><table><thead><tr><th></th><th>' + MONTHS[+M.slice(5, 7) - 1] + '</th><th>С начала года</th></tr></thead><tbody>' +
    tr('Выручка', [r.rev, y.rev], 'sum') + OPEX.map(function (k) { return tr(CATNAME[k], [r.opex[k] || 0, y.opex[k] || 0]); }).join('') +
    tr('Зарплата с социальным налогом', [r.payroll, y.payroll]) + tr('Аренда', [r.rent, y.rent]) + tr('Проценты по кредиту', [r.int, y.int]) + tr('Амортизация', [r.dep, y.dep]) +
    tr('Прибыль до налога', [r.preTax, y.preTax], 'sum') + tr(taxL, [r.tax, y.tax]) + tr('Чистая прибыль', [r.net, y.net], 'sum') + '</tbody></table></div></section>';
  h += '<section><h2>Движение денег за ' + mName(M).toLowerCase() + '</h2><div class="scroll"><table><tbody>' +
    tr('Деньги на начало месяца', [r.open], 'sum') + tr('Получено от клиентов', [c.cust]) + tr('Текущие расходы', [-c.opex]) + tr('Зарплата и налоги с неё', [-c.wage]) + tr('Аренда', [-c.rent]) + tr('Налог с оборота или прибыли', [-c.tax]) +
    tr('Покупка оборудования и ремонт', [-c.capex]) + tr('Получен кредит', [c.loanIn]) + tr('Основной долг по кредиту', [-c.princ]) + tr('Проценты по кредиту', [-c.int]) + tr('Взнос учредителя', [c.contrib]) + tr('Выплата учредителю', [-c.div]) +
    tr('Деньги на конец месяца', [r.close], 'sum') + '</tbody></table></div>' +
    '<p class="note">Прибыль и деньги не совпадают: покупка аппарата и возврат кредита уменьшают деньги, но не прибыль, а амортизация уменьшает прибыль, но не деньги.</p></section>';
  var K = compareTax(cfg, C.rows, M), cur = cfg.tax.regime === 'profit' ? 'profit' : 'turnover';
  var cmp = function (s) { return s.turnover <= s.profit ? 'turnover' : 'profit'; };
  var pct = Math.min(100, K.ytd.rev / K.limit * 100);
  h += '<section><h2>Сравнение налоговых режимов</h2><div class="scroll"><table><thead><tr><th></th><th>' + MONTHS[+M.slice(5, 7) - 1] + '</th><th>С начала года</th></tr></thead><tbody>' +
    tr('Выручка', [K.month.rev, K.ytd.rev]) + tr('Прибыль до налога', [K.month.preTax, K.ytd.preTax]) +
    tr('Налог с оборота ' + String(cfg.tax.turnover).replace('.', ',') + '%', [K.month.turnover, K.ytd.turnover], cur === 'turnover' ? 'sum' : '') +
    tr('Налог на прибыль ' + String(cfg.tax.profit).replace('.', ',') + '%', [K.month.profit, K.ytd.profit], cur === 'profit' ? 'sum' : '') +
    tr('Разница (оборот − прибыль)', [K.month.turnover - K.month.profit, K.ytd.turnover - K.ytd.profit]) + '</tbody></table></div>' +
    '<p class="' + (cmp(K.ytd) === cur ? 'small muted' : 'alert') + '">' + (K.ytd.rev === 0 ? 'Пока нет выручки за год, сравнивать нечего.' :
      'С начала года выгоднее ' + (cmp(K.ytd) === 'turnover' ? 'налог с оборота' : 'налог на прибыль') + ': он меньше на ' + fmt(Math.abs(K.ytd.turnover - K.ytd.profit)) + ' сум.' +
      (cmp(K.ytd) === cur ? ' Сейчас выбран именно он.' : ' Сейчас выбран другой режим (вкладка «Настройки»).')) + '</p>' +
    '<div class="panel"><div class="row" style="justify-content:space-between"><span class="small muted">Выручка за год к пределу налога с оборота</span><span class="num small">' + fmt(K.ytd.rev) + ' из ' + fmt(K.limit) + '</span></div><div class="bar" style="width:' + pct.toFixed(1) + '%"></div></div>' +
    '<p class="note">Сравнение упрощённое: налог на прибыль считается от прибыли каждого месяца отдельно, убыток одного месяца не уменьшает налог другого. Налог с оборота возможен только при выручке до 1 млрд сум в год. Какой режим применять, решает бухгалтер: программа ведёт внутренний учёт.</p></section>';
  var fa = B.fa - B.dep, A = B.cash + B.bank + fa, L = B.loan + B.pay.wage + B.pay.rent + B.pay.int + B.pay.tax, E = B.contrib - B.div + B.profit;
  h += '<section><h2>Баланс на конец месяца</h2><div class="scroll"><table><tbody>' +
    tr('Активы', [''], 'head') + tr('Касса', [B.cash]) + tr('Банк', [B.bank]) + tr('Оборудование и ремонт за вычетом амортизации', [fa]) + tr('Итого активы', [A], 'sum') +
    tr('Обязательства', [''], 'head') + tr('Кредит', [B.loan]) + tr('Зарплата и налоги с неё', [B.pay.wage]) + tr('Аренда', [B.pay.rent]) + tr('Проценты', [B.pay.int]) + tr('Налог с оборота или прибыли', [B.pay.tax]) + tr('Итого обязательства', [L], 'sum') +
    tr('Капитал', [''], 'head') + tr('Взносы учредителя', [B.contrib]) + tr('Выплаты учредителю', [-B.div]) + tr('Накопленная прибыль', [B.profit]) + tr('Итого капитал', [E], 'sum') +
    tr('Проверка: активы − обязательства − капитал', [A - L - E], 'sum') + '</tbody></table></div>' +
    '<p class="note">Активы = Обязательства + Капитал. Если в строке проверки ноль, учёт сходится.</p></section>';
  return h;
}


function syncBlock(S) {
  var y = S.sync; if (!y.enabled) return '';
  var h = '<section><h2>Синхронизация между устройствами</h2><div class="panel">';
  if (y.user) {
    h += '<p>Вы вошли как <b>' + esc(y.user.email || '') + '</b>.</p>' +
      '<p class="small ' + (y.state === 'error' ? 'alert' : 'muted') + '">' + (y.state === 'busy' ? 'Синхронизация…' : y.state === 'error' ? 'Не удалось: ' + esc(y.msg) : 'Последняя синхронизация: ' + (y.last || 'ещё не было')) + '</p>' +
      '<div class="row"><button class="btn" data-act="sync-now"' + (y.state === 'busy' ? ' disabled' : '') + '>Синхронизировать сейчас</button><button class="btn ghost" data-act="sync-logout">Выйти</button></div>';
  } else {
    h += '<label class="fld"><span>Почта</span><input id="sync-email" type="email" autocomplete="username" inputmode="email" value="' + esc(y.email) + '"></label>' +
      '<label class="fld"><span>Пароль (не меньше 8 символов)</span><input id="sync-pass" type="password" autocomplete="current-password" value="' + esc(y.pass) + '"></label>' +
      '<div class="row"><button class="btn" data-act="sync-login"' + (y.busy ? ' disabled' : '') + '>Войти</button><button class="btn ghost" data-act="sync-signup"' + (y.busy ? ' disabled' : '') + '>Создать аккаунт</button></div>';
  }
  return h + '</div><p class="note">Войдите с одной и той же почтой на компьютере и на телефоне, и данные будут общими. Приложение работает и без сети: правки отправятся, когда связь появится. Если один и тот же месяц изменили на двух устройствах без связи, останется более поздняя правка.</p></section>';
}

export function vSet(S) {
  var t = S.cfg.tax;
  return '<section><h2>Налоговый режим</h2><div class="panel"><label class="fld"><span>Как фирма платит налог</span>' +
    sel('f-tax-regime', [['turnover', 'Налог с оборота (выручка до 1 млрд сум в год)'], ['profit', 'Налог на прибыль (выручка выше 1 млрд сум)']], t.regime, 'data-bind="tax.regime" data-kind="text"') + '</label>' +
    '<div class="grid">' + inp(S, 'Налог с оборота, %', 'tax.turnover', 'num') + inp(S, 'Налог на прибыль, %', 'tax.profit', 'num') + '</div></div></section>' +
    '<section><h2>Ставки с зарплаты</h2><div class="panel"><div class="grid">' + inp(S, 'НДФЛ, %', 'tax.ndfl', 'num') + inp(S, 'ИНПС, %', 'tax.inps', 'num') + inp(S, 'Социальный налог, %', 'tax.soc', 'num') + '</div></div>' +
    '<p class="note">Ставки по умолчанию взяты на 2026 год и сверены 10.10.2026. Налог на прибыль считается упрощённо, от прибыли каждого месяца. Перед сдачей отчётности сверяйте суммы с бухгалтером и my.soliq.uz: программа ведёт внутренний учёт и официальную отчётность не заменяет.</p></section>' +
    syncBlock(S) +
    '<section><h2>Резервная копия</h2><div class="panel">' +
    '<div class="row"><button class="btn" data-act="backup-save">Скачать резервную копию</button><button class="btn ghost" data-act="backup-load">Загрузить из копии</button></div>' +
    '<input id="backup-file" type="file" accept="application/json,.json" hidden></div>' +
    '<p class="note">Данные хранятся только на этом устройстве, в памяти браузера. Скачивайте копию регулярно и перед очисткой данных браузера. Загрузка из копии полностью заменяет текущие данные.</p></section>';
}
