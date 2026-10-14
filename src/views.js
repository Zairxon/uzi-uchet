// Шесть вкладок. Разметка перенесена из прототипа без изменений; тексты идут через t() (русский / узбекский).
// Состояние приходит в объекте S: { cfg, months, M, draft, armed, sync }.
import { sched, payCalc, blank, ytd, compareTax, generalTax, compute } from './calc.js';
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
    ['pay_sal', 'Выплата зарплаты'], ['pay_ptax', 'Налоги с зарплаты'], ['pay_rent', 'Оплата аренды (с НДФЛ)'], ['pay_int', 'Проценты по кредиту'], ['pay_princ', 'Основной долг по кредиту'], ['pay_tax', 'Налог с оборота или прибыли'], ['pay_vat', 'Оплата НДС'], ['dividend', 'Выплата учредителю']],
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

// Советы по налогам, экономике и праву: по цифрам клиники плюс справочный юридический минимум (ориентиры, не заменяют бухгалтера и юриста)
var LEGAL = [
  ['Лицензия на медицинскую деятельность', 'Работать с УЗИ нужно по лицензии на медицинскую деятельность с нужными видами услуг. Следите за сроком действия и за тем, чтобы у врачей были действующие сертификаты.'],
  ['Чек на каждую оплату', 'Каждую оплату от клиента, в том числе предоплату, оформляйте фискальным чеком через онлайн-кассу или виртуальную кассу. Без чека налоговая считает доход неучтённым.'],
  ['Предоплата только на счёт фирмы', 'Номер карты, который видят клиенты в «Навбате», лучше привязать к счёту фирмы, а не к личной карте. Деньги на личной карте налоговая может считать неучтённым доходом.'],
  ['Персональные данные клиентов', 'Имя, телефон и данные о приёмах — персональные данные. Нужно согласие клиента на обработку, защита базы и ограниченный доступ сотрудников. Данные о здоровье защищает ещё и врачебная тайна.'],
  ['Условия предоплаты и возврата', 'Правила предоплаты, переноса и возврата денег должны быть написаны понятно (оферта на сайте) и совпадать с тем, что вы делаете на практике. Возврат клиенту оформляйте записью в «Ресепшене», чтобы он попал в учёт.'],
  ['Налоги медицинской организации', 'Юрлицо с медицинской лицензией: налог с оборота недоступен, НДС 12% платится с каждой услуги (отчёт и оплата до 20-го числа). Налог на прибыль 0%, если не менее 90% дохода — лицензированные медуслуги (косметология не входит); отчёт сдаётся раз в квартал даже при нуле.'],
  ['Зарплатные налоги по срокам', 'НДФЛ, ИНПС и социальный налог (12%) считаются и платятся ежемесячно до 15-го числа следующего месяца. За год социальный налог сдаётся до 15 февраля.'],
  ['Зарплата и взносы', 'Платите зарплату официально: с НДФЛ, ИНПС и социальным налогом в срок. Ставки в разделе «Настройки → Налоги» проверяйте раз в год, при смене законодательства.'],
  ['Аренда у учредителя', 'Аренда здания у учредителя должна быть не ниже минимальной ставки, с договором и удержанием НДФЛ. Расчёт вы видите на вкладке «Кредит и аренда».'],
  ['Хранение документов', 'Договоры, чеки, акты и ведомости храните в порядке и в течение срока, который требует закон. Резервную копию данных «Главного» скачивайте каждый месяц.']
];
function tipsView(S, C) {
  var r = C.cur, B = C.B, cfg = S.cfg, K = compareTax(cfg, C.rows, S.M), Y = K.ytd, tips = [];
  var add = function (lv, txt) { tips.push('<li class="tip ' + lv + '"><span class="tip-ic" aria-hidden="true">' + ({ bad: '⚠️', warn: '💡', ok: '✅' })[lv] + '</span><span>' + txt + '</span></li>'); };
  var pc = function (x) { return Math.round(x * 100); };
  var exp = r.opexSum + r.payroll + r.rent + r.int + r.dep;
  var gen = cfg.tax.regime === 'general', G = gen ? generalTax(cfg, C.rows, S.M) : null;
  if (cfg.tax.regime === 'turnover' && Y.rev > 0) add('warn', t('По тексту Налогового кодекса организации, оказывающие медицинские услуги, не могут применять налог с оборота (ст. 461 ч.2 п.14, закон ЗРУ-1104 от 25.12.2025, действует и с 1 апреля 2025). Если налоговая переведёт клинику на общий режим, налогов за этот год было бы примерно на {n} сум больше (НДС 12% вместо 4%, без учёта входного НДС). Уточните в налоговой, как это применяется к вам.', { n: fmt(Math.max(0, Y.rev * 12 / 112 - Y.rev * cfg.tax.turnover / 100)) }));
  if (gen && G.ytd.rev > 0) {
    if (cfg.tax.social !== false && G.share < 0.9) add('bad', t('Доля доходов от медуслуг {p}% — меньше 90%. Тогда налог на прибыль 15% со всей прибыли года вместо 0%. Не записывайте как «Услуги УЗИ» то, что не относится к медуслугам, и держите прочие доходы ниже 10%.', { p: Math.round(G.share * 100) }));
    else if (cfg.tax.social !== false && G.share < 0.93) add('warn', t('Доля доходов от медуслуг {p}% — близко к границе 90% для нулевой ставки налога на прибыль.', { p: Math.round(G.share * 100) }));
    if (G.ytd.vat > 0) add('ok', t('НДС с начала года: начислено {a} сум, к зачёту {b} сум. Платится и отчёт сдаётся до 20-го числа следующего месяца.', { a: fmt(G.ytd.vatOut), b: fmt(G.ytd.vatIn) }));
  }
  if (!Y.rev && !r.rev) add('warn', t('Пока мало данных для советов. Вносите операции и закрывайте месяцы зарплатой, и здесь появятся выводы.'));
  if (!gen && Y.rev >= K.limit) add('bad', t('Выручка с начала года {n} сум превысила порог режима налога с оборота ({l} сум). Срочно уточните у бухгалтера, как это меняет налоги и отчётность.', { n: fmt(Y.rev), l: fmt(K.limit) }));
  else if (!gen && Y.rev >= K.limit * 0.8) add('warn', t('Выручка с начала года {n} сум, это {p}% порога режима налога с оборота. Заранее обсудите с бухгалтером, что будет при превышении.', { n: fmt(Y.rev), p: pc(Y.rev / K.limit) }));
  if (!gen && Y.rev > 0) {
    var cur = cfg.tax.regime === 'profit' ? Y.profit : Y.turnover, oth = cfg.tax.regime === 'profit' ? Y.turnover : Y.profit;
    if (oth < cur && cur - oth > Y.rev * 0.005) add('warn', t('По вашим цифрам другой режим выгоднее: налог меньше примерно на {n} сум с начала года. Это упрощённый расчёт, решение принимайте с бухгалтером.', { n: fmt(cur - oth) }));
  }
  if (r.rev > 0) {
    if (r.net < 0) add('bad', t('Месяц в убытке: расходы больше выручки на {n} сум. Проверьте крупные статьи и график записи врачей.', { n: fmt(-r.net) }));
    else if (r.net / r.rev < 0.1) add('warn', t('Чистая прибыль всего {p}% от выручки. Посмотрите, нет ли лишних расходов и можно ли поднять загрузку врачей.', { p: pc(r.net / r.rev) }));
    else add('ok', t('Чистая прибыль {p}% от выручки, это хороший запас.', { p: pc(r.net / r.rev) }));
    if (r.payroll / r.rev > 0.45) add('warn', t('Зарплата с налогами съедает {p}% выручки. Обычно для клиники комфортно до 40–45%.', { p: pc(r.payroll / r.rev) }));
    if (r.int / r.rev > 0.1) add('warn', t('Проценты по кредиту — {p}% выручки месяца. Если нагрузка растёт, обсудите с банком график или досрочное погашение.', { p: pc(r.int / r.rev) }));
    if (r.opex.ads && r.opex.ads / r.rev > 0.15) add('warn', t('На рекламу ушло {p}% выручки. Сверьте с отчётом «Откуда клиенты»: какие источники реально приводят людей.', { p: pc(r.opex.ads / r.rev) }));
  }
  if (S.missing && S.missing.n > 0) add('bad', t('В «Ресепшене» за этот месяц {n} оплат ({s} сум) без номера фискального чека. Укажите номера чеков в окне оплаты.', { n: S.missing.n, s: fmt(S.missing.sum) }));
  var noChk = 0, noChkSum = 0; (((S.months[S.M] || {}).ops) || []).forEach(function (o) { if (o.t === 'income' && o.c !== 'contrib' && o.chk === false) { noChk++; noChkSum += o.a || 0; } });
  if (noChk) add('bad', t('В этом месяце {n} поступлений без чека на {s} сум. Каждую оплату нужно оформлять фискальным чеком.', { n: noChk, s: fmt(noChkSum) }));
  if (S.pp && S.pp.s && S.pp.s.card_number && !cfg.cardFirm) add('bad', t('Предоплата принимается на карту, которая не отмечена как карта фирмы. Уточните, на кого она оформлена: деньги на личной карте могут считаться неучтённым доходом.'));
  var pm = addM(S.M, -1), pmOps = ((S.months[pm] || {}).ops || []).length;
  if (pmOps && !(cfg.locked && cfg.locked[pm]) && +today().slice(8, 10) > 10 && S.M === today().slice(0, 7)) add('warn', t('Прошлый месяц ({m}) ещё не закрыт. Сверьте цифры и закройте его на вкладке «Операции», чтобы записи нельзя было случайно изменить.', { m: lc(pm) }));
  if (exp > 0 && B.cash + B.bank < exp) add('warn', t('Денег на счетах и в кассе меньше, чем расходов за месяц ({n} сум). Держите запас хотя бы на один-два месяца работы.', { n: fmt(exp) }));
  if (B.pay.tax > Math.max(1, r.rev * 0.5)) add('warn', t('Накопился неуплаченный налог: {n} сум. Налог платится в срок, иначе начисляются пени, а деньги нужно держать отдельно.', { n: fmt(B.pay.tax) }));
  if (B.pay.wage > Math.max(1, r.payroll * 1.5)) add('warn', t('Зарплата и налоги с неё начислены, но не выплачены на {n} сум. Проверьте, что выплаты внесены в «Операции».', { n: fmt(B.pay.wage) }));
  return '<section><h2>' + t('Советы') + '</h2><div class="panel"><ul class="list tips">' + tips.join('') + '</ul>' +
    '<details class="legal"><summary>' + t('Юридический минимум для клиники') + '</summary><ul class="list">' + LEGAL.map(function (x) { return '<li><div class="li-main"><b>' + t(x[0]) + '</b><span class="small muted">' + t(x[1]) + '</span></div></li>'; }).join('') + '</ul></details>' +
    '<p class="note">' + t('Советы построены по цифрам этого приложения и общим правилам. Они не заменяют бухгалтера и юриста: ставки, пороги и сроки меняются, сверяйте их с действующим законодательством.') + '</p></div></section>';
}
// Что и когда нужно сделать: сроки по Налоговому кодексу (lex.uz, редакция на 14.10.2026), суммы берутся из учёта
function todoView(S) {
  var cfg = S.cfg, gen = cfg.tax.regime === 'general', td = today(), cur = td.slice(0, 7), nx = addM(cur, 1), C2 = compute(cfg, S.months, nx), items = [];
  var rowOf = function (ym) { return C2.rows.filter(function (q) { return q.m === ym; })[0]; };
  var paidIn = function (ym, cats) { var s = 0; (((S.months[ym] || {}).ops) || []).forEach(function (o) { if (cats.indexOf(o.c) >= 0) s += o.a || 0; }); return s; };
  var shift = function (d, n) { var x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  [cur, nx].forEach(function (dm) {
    var per = addM(dm, -1), pay = (S.months[per] || {}).payroll, pr = rowOf(per), mo = +dm.slice(5, 7);
    items.push({ d: dm + '-15', title: t('Зарплатные налоги за {m}: НДФЛ, ИНПС, социальный налог (отчёт и оплата)', { m: lc(per) }), a: pay ? (pay.ndfl || 0) + (pay.inps || 0) + (pay.soc || 0) : 0, paid: paidIn(dm, ['pay_ptax']), pay: true });
    if (cfg.tax.regime === 'turnover') items.push({ d: dm + '-15', title: t('Налог с оборота за {m}: расчёт и оплата', { m: lc(per) }), a: Math.max(0, pr ? pr.tax : 0), paid: paidIn(dm, ['pay_tax']), pay: true });
    if (gen) items.push({ d: dm + '-20', title: t('НДС за {m}: отчёт и оплата', { m: lc(per) }), a: Math.max(0, pr ? pr.vat : 0), paid: paidIn(dm, ['pay_vat']), pay: true });
    if ([1, 4, 7, 10].indexOf(mo) >= 0) items.push({ d: dm + '-20', title: t('Отчёт по налогу на прибыль за квартал (даже при ставке 0%)') });
    if (mo === 2) items.push({ d: dm + '-15', title: t('Годовой расчёт по социальному налогу') });
    if (mo === 3) items.push({ d: dm + '-01', title: t('Годовые отчёты: налог на прибыль и налог на имущество') });
  });
  var win = items.filter(function (x) { return x.d >= shift(td, -10) && x.d <= shift(td, 40); }).sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
  if (!win.length) return '';
  return '<section class="todo"><h2>' + t('Что делать сейчас') + '</h2><div class="panel"><ul class="list">' + win.map(function (x) {
    var done = x.pay && x.a > 0 && x.paid >= x.a * 0.99, late = x.d < td && !done && x.pay && x.a > 0, chip = done ? '<span class="chip ok">✓ ' + t('оплачено') + '</span>' : late ? '<span class="chip bad">⚠ ' + t('просрочено') + '</span>' : '<span class="chip">' + fmtDate(x.d).slice(0, 5) + '</span>';
    var sub = t('до {d}', { d: fmtDate(x.d) }) + (x.pay ? ' · ' + (x.a > 0 ? t('начислено {a} сум, внесено {p}', { a: fmt(x.a), p: fmt(x.paid) }) : t('начислений за период нет')) : '');
    return '<li><div class="li-main"><b>' + x.title + '</b><span class="small muted">' + sub + '</span></div>' + chip + '</li>';
  }).join('') + '</ul><p class="note">' + t('Суммы берутся из ваших операций и зарплаты. Платёж отметьте в «Операциях» (НДС — «Оплата НДС», зарплатные налоги — «Налоги с зарплаты»), тогда пункт станет зелёным.') + '</p></div></section>';
}
export function vHome(S, C) {
  var M = S.M, r = C.cur, B = C.B, exp = r.opexSum + r.payroll + r.rent + r.int + r.dep + r.tax;
  var h = todayBlock(S) + todoView(S) + '<section><h2>' + t('За {m}', { m: lc(M) }) + '</h2><div class="kpis">' +
    '<div class="kpi"><span>' + t('Выручка') + '</span><b>' + fmt(r.rev) + '</b></div>' +
    '<div class="kpi"><span>' + t('Расходы и налог') + '</span><b>' + fmt(exp) + '</b></div>' +
    '<div class="kpi"><span>' + t('Чистая прибыль') + '</span><b class="' + (r.net < 0 ? 'neg' : 'pos') + '">' + fmt(r.net) + '</b></div>' +
    '<div class="kpi"><span>' + t('Деньги на конец месяца') + '</span><b>' + fmt(B.cash + B.bank) + '</b></div></div>' +
    '<p class="small muted">' + t('Суммы в сумах за {m}. Касса: {c}, банк: {b}.', { m: lc(M), c: '<span class="num">' + fmt(B.cash) + '</span>', b: '<span class="num">' + fmt(B.bank) + '</span>' }) + '</p>' +
    '<h3 class="subh">' + t('Из чего складываются расходы за месяц') + '</h3><ul class="list">' + [['Расходы по внесённым операциям', r.opexSum], ['Зарплата с социальным налогом', r.payroll], ['Аренда', r.rent], ['Проценты по кредиту', r.int], ['Амортизация', r.dep], ['Налог с оборота или прибыли', r.tax]].filter(function (x) { return x[1] > 0; }).map(function (x) { return '<li><div class="li-main"><b>' + t(x[0]) + '</b></div><span class="num">' + fmt(x[1]) + '</span></li>'; }).join('') + '</ul>' +
    (r.net < 0 ? '<p class="note">' + t('Прибыль отрицательная: выручка месяца меньше расходов. Аренда, зарплата, проценты и амортизация начисляются за месяц целиком, даже если по операциям расходов нет.') + '</p>' : '') + '</section>';
  var due = [['Кредит, остаток основного долга', B.loan], ['Зарплата и налоги с неё', B.pay.wage], ['Аренда', B.pay.rent], ['Проценты по кредиту', B.pay.int], ['Налог с оборота или прибыли', B.pay.tax], ['НДС к уплате', B.pay.vat]];
  h += '<section><h2>' + t('Долги на конец месяца') + '</h2><ul class="list">' + due.map(function (d) { return '<li><div class="li-main"><b>' + t(d[0]) + '</b></div><span class="num">' + fmt(d[1]) + '</span></li>'; }).join('') + '</ul>' +
    '<p class="note">' + t('Начислено, но ещё не оплачено. Отрицательная сумма означает переплату.') + '</p></section>';
  var last = []; for (var k = 5; k >= 0; k--) { var m = addM(M, -k), x = C.rows.filter(function (q) { return q.m === m; })[0] || blank(m); last.push(x); }
  var mx = Math.max.apply(null, last.map(function (x) { return x.rev; }).concat([1]));
  h += '<section><h2>' + t('Выручка и прибыль за полгода') + '</h2><div class="panel"><div class="trend">' + last.map(function (x) {
    return '<span class="small muted">' + months()[+x.m.slice(5, 7) - 1].slice(0, 3) + '</span><div><div class="bar" style="width:' + Math.max(0, x.rev / mx * 100).toFixed(1) + '%"></div></div><span class="num small">' + fmt(x.rev) + ' / <span class="' + (x.net < 0 ? 'neg' : 'pos') + '">' + fmt(x.net) + '</span></span>';
  }).join('') +
    '</div><p class="small muted">' + t('Полоса показывает выручку. Справа: выручка / чистая прибыль.') + '</p></div></section>';
  return h + tipsView(S, C);
}

// Время создания операции берём из её номера (начало номера — миллисекунды в 36-ричной записи)
function opTs(o) { var n = parseInt(String(o.id || '').slice(0, 8), 36); return n > 1.5e12 && n < 4e12 ? n : 0; }
function opTime(o) {
  var n = opTs(o); if (!n) return '';
  try { return new Date(n).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' }); } catch (e) { return ''; }
}

function opRow(S, o, canDel) {
  var rc = String(o.id).indexOf('rc:') === 0, name = rc ? (o.id.split(':')[3] === 'deposit' ? t('Ресепшен: предоплаты ({n})', { n: o.cnt || '' }) : o.id.split(':')[3] === 'refund' ? t('Ресепшен: возвраты ({n})', { n: o.cnt || '' }) : t('Ресепшен: приём ({n})', { n: o.cnt || '' })) : (CATNAME[o.c] ? t(CATNAME[o.c]) : o.c);
  return '<li><div class="li-main"><b>' + esc(name) + (rc ? ' <span class="chip">' + t('авто') + '</span>' : '') + (!rc && o.t === 'expense' && o.vat ? ' <span class="chip">' + t('НДС') + '</span>' : '') + (!rc && o.t === 'income' && o.chk === false ? ' <span class="chip warn">' + t('без чека') + '</span>' : '') + '</b><span class="small muted">' + (opTime(o) ? opTime(o) + ' · ' : '') + t(ACCTNAME[o.acct] || 'касса') + (o.n ? ' · ' + esc(o.n) : '') + '</span></div><span class="num ' + ((o.t === 'income') === ((o.a || 0) >= 0) ? 'pos' : 'neg') + '">' + ((o.t === 'income') === ((o.a || 0) >= 0) ? '+' : '−') + fmt(Math.abs(o.a || 0)) + '</span>' + (canDel && !rc ? delBtn(S, 'del-op', o.id) : '') + '</li>';
}
var METHNAME = { cash: 'наличные', card: 'карта', transfer: 'перечисление' };
// Пациенты из «Ресепшена» за выбранный день
function rcBlock(S, day) {
  var R = S.dayRc, h = '<h2>' + t('Из «Ресепшена»: пациенты дня') + '</h2>';
  if (!S.sync.enabled || !S.sync.user) return h + '<p class="small muted">' + t('Войдите в «Настройки → Данные» (синхронизация), чтобы видеть пациентов из «Ресепшена».') + '</p>';
  if (R.state === 'loading' || R.state === 'idle') return h + '<p class="empty">' + t('Загрузка…') + '</p>';
  if (R.state === 'error') return h + '<p class="small muted">' + t('Не удалось получить данные клиники: {m}', { m: esc(R.msg) }) + '</p>';
  if (!R.rows.length) return h + '<p class="empty">' + t('В этот день оплат из «Ресепшена» не было.') + '</p>';
  var sum = 0, vis = 0;
  R.rows.forEach(function (x) { var a = x.kind === 'refund' ? -x.amount : +x.amount; sum += a; if (x.kind === 'visit') vis++; });
  h += '<div class="panel"><div class="scroll"><table class="rct grid srct"><thead><tr><th>' + t('Время') + '</th><th>' + t('Пациент') + '</th><th>' + t('Врач / услуга') + '</th><th class="r">' + t('Оплата') + ' / ' + t('Сумма') + '</th></tr></thead><tbody>' + R.rows.map(function (x) {
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
    '</div>' + (draft.type === 'expense' && S.cfg.tax.regime === 'general' && ['supplies', 'util', 'ads', 'equip', 'repair', 'repair_bld', 'other'].indexOf(draft.cat) >= 0 ? '<label class="chkrow"><input type="checkbox" data-d="vat"' + (draft.vat ? ' checked' : '') + '><span>' + t('Есть счёт-фактура с НДС (НДС пойдёт к зачёту)') + '</span></label>' : '') + (draft.type === 'income' && draft.cat !== 'contrib' ? '<label class="chkrow"><input type="checkbox" data-d="chk"' + (draft.chk !== false ? ' checked' : '') + '><span>' + t('Чек выдан клиенту') + '</span></label>' : '') + '<label class="fld"><span>' + t('Комментарий') + '</span><input id="op-note" type="text" data-d="note" value="' + esc(draft.note) + '" placeholder="' + esc(t(draft.cat === 'equip' ? 'Название и модель, например: УЗИ-аппарат Миндрей ДС-70' : 'Например: закупка расходников')) + '"></label>' +
    (draft.cat === 'equip' ? '<p class="note">' + t('Купленная техника записывается как имущество и списывается в расходы по частям (60 месяцев). В «Кредит и аренда» её можно выбрать как цель кредита.') + '</p>' : '') +
    (draft.acct === 'founder' ? '<p class="note">' + t('«Учредитель»: оплата из личных денег учредителя. Деньги клиники не меняются, сумма записывается как вклад учредителя.') + '</p>' : '') +
    '<div class="row gaptop"><button class="btn" type="submit">' + t('Добавить') + '</button></div></form>' +
    '<p class="note">' + t('Выручка с приёма вносится из «Ресепшена» автоматически: вручную записывайте только прочие поступления и все расходы. Зарплата, аренда, проценты и амортизация попадают в расходы из вкладок «Зарплата» и «Кредит и аренда»; здесь записывайте их оплату.') + '</p></section>';
  // день
  var f = dayFigures(S, day), dops = f.ops.filter(function (o) { return String(o.id).indexOf('rc:') !== 0; }).sort(sorter), isToday = day === today();
  h += '<section class="opsday"><h2>' + t('Операции за день') + '</h2>' +
    '<div class="daynav2"><button type="button" class="navbtn" data-act="ops-prev" aria-label="' + esc(t('Предыдущий день')) + '">‹</button><button type="button" class="daylabel2" data-act="ops-today">' + (isToday ? t('Сегодня') + ' · ' : '') + esc(fmtDate(day)) + '</button><button type="button" class="navbtn" data-act="ops-next" aria-label="' + esc(t('Следующий день')) + '">›</button></div>' +
    kpi3(f) + rcBlock(S, day) +
    '<h2>' + t('Остальные операции дня') + '</h2>' + (dops.length ? '<ul class="list">' + dops.map(function (o) { return opRow(S, o, !(S.cfg.locked && S.cfg.locked[o.d.slice(0, 7)])); }).join('') + '</ul>' : '<p class="empty">' + t('Других операций в этот день нет.') + '</p>') + '</section>';
  // месяц
  var mops = ((months_[M] && months_[M].ops) || []).slice().sort(sorter), mi = 0, me = 0;
  mops.forEach(function (o) { if (o.t === 'income') { if (o.c !== 'contrib') mi += o.a || 0; } else me += o.a || 0; });
  var lk = !!(S.cfg.locked && S.cfg.locked[M]);
  h += '<section class="opsmonth"><h2>' + t('Операции за {m}', { m: lc(M) }) + (lk ? ' <span class="chip">🔒 ' + t('закрыт') + '</span>' : '') + '</h2>' + kpi3({ inc: mi, exp: me, net: mi - me }) +
    '<div class="row"><button type="button" class="btn ghost" data-act="lock-toggle">' + t(lk ? 'Открыть месяц' : 'Закрыть месяц') + '</button><button type="button" class="btn ghost" data-act="export-ops">' + t('Скачать для бухгалтера') + '</button></div>' + (lk ? '<p class="note">' + t('Месяц закрыт: операции и зарплату за него менять нельзя. Откройте месяц, если нужно что-то исправить.') + '</p>' : '');
  if (!mops.length) h += '<p class="empty">' + t('Пока нет записей. Добавьте первое поступление или списание в форме выше.') + '</p>';
  else {
    h += '<ul class="list">'; var dd = ''; mops.forEach(function (o) {
      if (o.d !== dd) { dd = o.d; h += '<li class="day" style="border-bottom:0;padding-bottom:0">' + esc(o.d.slice(8, 10) + '.' + o.d.slice(5, 7)) + '</li>'; }
      h += opRow(S, o, !lk);
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
export function srcSlug(s) { return cyr2lat(String(s || '')).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40); }
// «УТМ-отдел»: свои метки. Приложение само создаёт ссылку и QR-код, считает записи и выручку по каждой метке.
var UTM_TYPES = [['social', 'Соцсеть'], ['site', 'Сайт'], ['person', 'Человек'], ['print', 'Листовка или QR'], ['other', 'Другое']];
export function utmSlug(name) { return cyr2lat(String(name || '')).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30); }
export function utmLinks(l) {
  return { web: APP_LINKS.queue + '?utm_source=' + encodeURIComponent(l.slug) + '&utm_medium=' + encodeURIComponent(l.type), bot: BOT_URL + '?start=u_' + l.slug + '-' + l.type };
}
function utmView(S) {
  var list = S.cfg.utm || [], D = S.utmD || { name: '', type: 'social', note: '' }, X = S.src || { state: 'idle', rows: [] };
  var typeName = function (k) { var x = UTM_TYPES.filter(function (q) { return q[0] === k; })[0]; return x ? t(x[1]) : k; };
  var stat = function (l) {
    if (X.state !== 'ok') return '';
    var s = { total: 0, visited: 0, revenue: 0 }; X.rows.forEach(function (x) { if (x.src === l.slug) { s.total += +x.total; s.visited += +x.visited; s.revenue += +x.revenue; } });
    return '<p class="small">' + t('За {m}: записей {a}, пришли {b}, выручка {c} сум', { m: lc(S.M), a: s.total, b: s.visited, c: fmt(s.revenue) }) + '</p>';
  };
  var row = function (label, url, id) { return '<div class="fld"><span>' + t(label) + '</span><div class="row"><input type="text" readonly value="' + esc(url) + '" id="' + id + '" style="font-size:12px"><button type="button" class="btn ghost" data-act="src-copy" data-id="' + id + '">' + t('Копировать') + '</button></div></div>'; };
  var h = '<section><h2>' + t('Метки (УТМ)') + '</h2><p class="small muted">' + t('Создайте метку для каждого места или человека, где будет стоять ваша ссылка: страница в соцсети, сайт, блогер, листовка. Приложение само сделает ссылку (Кю-Ар код для печати можно сделать из неё в любом сервисе), а здесь будет видно, сколько раз по ней входили, сколько записалось и сколько денег принесла каждая метка.') + '</p></section>';
  h += '<section><h2>' + t('Новая метка') + '</h2><div class="panel">' +
    '<label class="fld"><span>' + t('Название метки') + '</span><input type="text" data-utm="name" value="' + esc(D.name) + '" autocomplete="off" placeholder="' + esc(t('например: Мадина Каримова или Инстаграм клиники')) + '"></label>' +
    '<div class="fld"><span>' + t('Что это') + '</span><div class="seg four">' + UTM_TYPES.map(function (x) { return '<button type="button" data-act="utm-type" data-id="' + x[0] + '" aria-pressed="' + (D.type === x[0]) + '">' + t(x[1]) + '</button>'; }).join('') + '</div></div>' +
    '<label class="fld"><span>' + t('Заметка (необязательно)') + '</span><input type="text" data-utm="note" value="' + esc(D.note) + '" autocomplete="off" placeholder="' + esc(t('например: ссылка на страницу, телефон человека')) + '"></label>' +
    '<div class="row gaptop"><button type="button" class="btn" data-act="utm-add">' + t('Создать метку') + '</button></div></div></section>';
  h += '<section><h2>' + t('Мои метки') + ' <span class="chip">' + list.length + '</span></h2>';
  if (!list.length) return h + '<p class="empty">' + t('Меток пока нет. Создайте первую выше: ссылка появится здесь.') + '</p></section>';
  var vis = function (l) { var n = 0; (((X.vis || {}).rows) || []).forEach(function (q) { if (q.src === l.slug) n += +q.visits; }); return n; };
  var bk = function (l) { var s = { total: 0, visited: 0, revenue: 0 }; (X.rows || []).forEach(function (x) { if (x.src === l.slug) { s.total += +x.total; s.visited += +x.visited; s.revenue += +x.revenue; } }); return s; };
  var ready = X.state === 'ok';
  h += '<div class="panel"><div class="scroll"><table class="rct grid srct"><thead><tr><th>' + t('Метка') + '</th><th class="r">' + t('Входов') + '</th><th class="r">' + t('Записей') + '</th><th class="r">' + t('Пришли') + '</th><th class="r">' + t('Выручка') + '</th><th></th></tr></thead><tbody>' + list.map(function (l) {
    var lk = utmLinks(l), s = bk(l), nv = X.vis ? vis(l) : null;
    return '<tr><td><b>' + esc(l.name) + '</b><div class="small muted"><span class="chip">' + typeName(l.type) + '</span> ' + esc(l.slug) + (l.note ? ' · ' + esc(l.note) : '') + '</div>' +
      '<div class="row gaptop"><button type="button" class="btn ghost small" data-act="utm-copy" data-url="' + esc(lk.web) + '">' + t('Копировать ссылку «Навбата»') + '</button><button type="button" class="btn ghost small" data-act="utm-copy" data-url="' + esc(lk.bot) + '">' + t('Копировать ссылку бота') + '</button></div></td>' +
      '<td class="r num"><b>' + (nv == null ? '–' : nv) + '</b></td><td class="r num">' + (ready ? s.total : '–') + '</td><td class="r num">' + (ready ? s.visited : '–') + '</td><td class="r num">' + (ready ? fmt(s.revenue) : '–') + '</td><td>' + delBtn(S, 'del-utm', l.id) + '</td></tr>';
  }).join('') + '</tbody></table></div><p class="small muted">' + t('Входов — сколько раз открыли «Навбат» или бота по ссылке метки, остальное — за выбранный месяц. Подробности по источникам смотрите ниже в отчёте «Откуда клиенты».') + '</p></div>';
  return h + '</section>';
}
// Воронка записи: сколько посетителей сайта дошло до каждого шага
var FUN = [['open', 'Открыли сайт'], ['day', 'Выбрали день'], ['doctor', 'Выбрали врача'], ['time', 'Выбрали время'], ['service', 'Выбрали услугу'], ['form', 'Начали вводить имя и телефон'], ['book_click', 'Нажали «Записаться»'], ['held', 'Время удержано (ждём чек)'], ['pay_view', 'Открыли экран оплаты'], ['receipt_pick', 'Выбрали фото чека'], ['receipt_sent', 'Отправили чек']];
var FUN_ERR = { bad_name: 'Не ввели имя', bad_phone: 'Неверный телефон', no_service: 'Не выбрали услугу', no_agree: 'Не подтвердили условия', slot_taken: 'Время уже занято', slot_unavailable: 'Время недоступно', net: 'Нет связи' };
function funnelView(S) {
  var f = S.src && S.src.fun; if (!f) return '';
  var R = f.reached || {}, ST = f.stopped || {}, n = +f.sessions || 0;
  var h = '<section><h2>' + t('Где клиенты останавливаются при записи') + '</h2><div class="panel">';
  if (!n) return h + '<p class="empty">' + t('Пока нет данных: показатели появятся, когда клиенты начнут заходить на сайт.') + '</p></div></section>';
  var done = (+R.receipt_sent || 0) + (+R.done || 0), top = 0;
  h += '<p class="small muted">' + t('Посетителей сайта: {n}, завершили запись: {d}', { n: n, d: done }) + '</p><div class="scroll"><table class="rct grid srct"><thead><tr><th>' + t('Шаг') + '</th><th class="r">' + t('Дошли') + '</th><th class="r">' + t('Остановились') + '</th></tr></thead><tbody>';
  FUN.forEach(function (s) { var r = s[0] === 'receipt_sent' ? (+R.receipt_sent || 0) + (+R.done || 0) : (+R[s[0]] || 0); var st = s[0] === 'receipt_sent' ? (+ST.finished || 0) : (+ST[s[0]] || 0);
    h += '<tr><td>' + t(s[1]) + '<div class="bar" style="width:' + Math.round(r / n * 100) + '%;height:5px;margin-top:5px"></div></td><td class="r num">' + r + '</td><td class="r num">' + (st ? '<b>' + st + '</b>' : '–') + '</td></tr>'; });
  h += '</tbody></table></div><p class="small muted">' + t('Для записи без предоплаты последний шаг — «Нажали «Записаться»» с успешным итогом.') + '</p>';
  var er = Object.keys(f.errors || {}).sort(function (a, b) { return f.errors[b] - f.errors[a]; });
  if (er.length) h += '<p class="small"><b>' + t('Чаще всего мешает:') + '</b> ' + er.map(function (k) { return esc(t(FUN_ERR[k] || 'Другая ошибка')) + ' — ' + f.errors[k]; }).join(', ') + '</p>';
  var tr = (+R.tour_start || 0); if (tr) h += '<p class="small muted">' + t('Подсказка при первом входе: началась {a}, пропустили {b}, дошли до конца {c}', { a: tr, b: +R.tour_skip || 0, c: +R.tour_done || 0 }) + '</p>';
  return h + '</div></section>';
}
// Строки отчёта «Откуда клиенты»: записи по источникам плюс входы по ссылкам меток (метка без записей тоже видна)
function srcRows(S) {
  var X = S.src || {}, V = (X.vis && X.vis.rows) || [], map = {}, out = [];
  (X.rows || []).forEach(function (x) { var r = { src: x.src, campaign: x.campaign, channel: x.channel, total: +x.total, visited: +x.visited, noshow: +x.noshow, revenue: +x.revenue, visits: 0 }; map[x.src] = map[x.src] || []; map[x.src].push(r); out.push(r); });
  V.forEach(function (q) { var a = map[q.src]; if (a && a.length) a[0].visits += +q.visits; else { var r = { src: q.src, campaign: q.camp, channel: 'site', total: 0, visited: 0, noshow: 0, revenue: 0, visits: +q.visits }; map[q.src] = [r]; out.push(r); } });
  return out;
}
function srcView(S) {
  var X = S.src || { state: 'idle', rows: [], msg: '' };
  var h = '<section><h2>' + t('Откуда клиенты за {m}', { m: lc(S.M) }) + '</h2>';
  if (!S.sync.enabled || !S.sync.user) h += '<p class="empty">' + t('Войдите в «Настройки» (синхронизация), чтобы видеть данные Ресепшена.') + '</p>';
  else if (X.state === 'loading' || X.state === 'idle') h += '<p class="empty">' + t('Загрузка…') + '</p>';
  else if (X.state === 'error') h += '<p class="alert">' + esc(X.msg) + '</p>';
  else if (!srcRows(S).length) h += '<p class="empty">' + t('Нет записей и входов за этот месяц.') + '</p>';
  else {
    var rows = srcRows(S), CH = { call: 'По звонку', walkin: 'Живая очередь', site: 'Сайт без метки', bot: 'Бот без метки' }, T = { total: 0, visited: 0, noshow: 0, revenue: 0, vis: 0 }, maxV = 1;
    rows.forEach(function (x) { T.total += +x.total; T.vis += +x.visits; T.visited += +x.visited; T.noshow += +x.noshow; T.revenue += +x.revenue; if (+x.visited > maxV) maxV = +x.visited; });
    var mine = {}; (S.cfg.utm || []).forEach(function (l) { mine[l.slug] = l; });
    var lbl = function (x) { if (CH[x.src]) return t(CH[x.src]); if (mine[x.src]) return esc(mine[x.src].name) + ' <span class="chip">' + t((UTM_TYPES.filter(function (q) { return q[0] === mine[x.src].type; })[0] || ['', 'Другое'])[1]) + '</span>'; var k = SRC_SOURCES.filter(function (s) { return s[0] === x.src; })[0]; return esc(k ? t(k[1]) : x.src) + (x.campaign ? ' <span class="small muted">· ' + esc(x.campaign) + '</span>' : '') + ' <span class="chip">' + t(x.channel === 'bot' ? 'Бот' : 'Сайт') + '</span>'; };
    var top = rows.filter(function (x) { return +x.visited > 0; })[0];
    if (top) h += '<p class="small"><b>' + t('Больше всего клиентов пришло из: {s}', { s: lbl(top) }) + '</b></p>';
    h += '<div class="scroll"><table class="rct grid srct"><thead><tr><th>' + t('Источник') + '</th><th class="r">' + t('Входов') + '</th><th class="r">' + t('Записей') + '</th><th class="r">' + t('Пришли') + '</th><th class="r">' + t('Не пришли') + '</th><th class="r">' + t('Выручка') + '</th></tr></thead><tbody>' + rows.map(function (x) {
      return '<tr><td>' + lbl(x) + '<div class="bar" style="width:' + Math.round(+x.visited / maxV * 100) + '%;height:5px;margin-top:5px"></div></td><td class="r num">' + (+x.visits || '–') + '</td><td class="r num">' + x.total + '</td><td class="r num"><b>' + x.visited + '</b></td><td class="r num">' + x.noshow + '</td><td class="r num">' + fmt(+x.revenue) + '</td></tr>';
    }).join('') + '</tbody><tfoot><tr><td><b>' + t('Итого') + '</b></td><td class="r num"><b>' + T.vis + '</b></td><td class="r num"><b>' + T.total + '</b></td><td class="r num"><b>' + T.visited + '</b></td><td class="r num"><b>' + T.noshow + '</b></td><td class="r num"><b>' + fmt(T.revenue) + '</b></td></tr></tfoot></table></div>';
  }
  h += '</section>' + funnelView(S);
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
  var taxL = cfg.tax.regime === 'general' ? t('Налог на прибыль') : cfg.tax.regime === 'profit' ? t('Налог на прибыль {n}%', { n: cfg.tax.profit }) : t('Налог с оборота {n}%', { n: cfg.tax.turnover });
  var plH = '<section><h2>' + t('Прибыль и убытки') + '</h2><div class="scroll"><table><thead><tr><th></th><th>' + mn + '</th><th>' + t('С начала года') + '</th></tr></thead><tbody>' +
    tr(cfg.tax.regime === 'general' ? 'Выручка без НДС' : 'Выручка', [r.rev, y.rev], 'sum') + OPEX.map(function (k) { return tr(CATNAME[k], [r.opex[k] || 0, y.opex[k] || 0]); }).join('') +
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
  var G = generalTax(cfg, C.rows, M), GM = G.month || blank(M), GY = G.ytd, shp = Math.round(G.share * 100);
  var genH = '<section><h2>' + t('Налоги клиники: НДС и прибыль') + '</h2><div class="scroll"><table><thead><tr><th></th><th>' + mn + '</th><th>' + t('С начала года') + '</th></tr></thead><tbody>' +
    tr('Выручка без НДС', [GM.rev, GY.rev]) + tr('НДС начислен с выручки', [GM.vatOut, GY.vatOut]) + tr('НДС к зачёту по счетам-фактурам', [-GM.vatIn, -GY.vatIn]) + tr('НДС к уплате', [GM.vat, GY.vat], 'sum') +
    tr('Прибыль до налога', [GM.preTax, GY.preTax]) + tr('Налог на прибыль', [GM.tax, GY.tax], 'sum') + '</tbody></table></div></section>' +
    '<section><div class="panel"><p class="small"><b>' + t('Доля доходов от медицинских услуг с начала года: {p}%', { p: shp }) + '</b></p><div class="bar" style="width:' + Math.min(100, shp) + '%;height:6px"></div>' +
    (cfg.tax.social === false ? '<p class="small muted">' + t('Льгота социальной сферы выключена в настройках: налог на прибыль по ставке {n}%.', { n: cfg.tax.profit }) + '</p>' : G.zero ? '<p class="small muted">' + t('Не меньше 90%: налог на прибыль 0% (социальная сфера, ст. 59 и 337 НК). Отчёт всё равно сдаётся.') + '</p>' : '<p class="alert">' + t('Меньше 90%: налог на прибыль считается по ставке {n}% со всей прибыли года. Доходы не от медуслуг не должны превышать 10%.', { n: cfg.tax.profit }) + '</p>') +
    (G.loss > 0 ? '<p class="small">' + t('Убыток прошлых лет, который ещё можно учесть: {n} сум', { n: fmt(G.loss) }) + '</p>' : '') + '</div>' +
    '<p class="note">' + t('НДС 12% включён в цены услуг. Налоговая строит отчёт по НДС из ваших фискальных чеков и счетов-фактур, поэтому в чеках нужны верные коды ИКПУ. Входной НДС зачитывается только по счёту-фактуре: отмечайте её в расходе. По сообщениям СМИ (апрель 2026) клиникам разрешён возврат части уплаченного НДС (20%) при доле доходов от медуслуг не менее 70%: порядок уточните в налоговой.') + '</p></section>';
  var cmpRest = '<section><p class="' + (cmp(K.ytd) === cur ? 'small muted' : 'alert') + '">' + (K.ytd.rev === 0 ? t('Пока нет выручки за год, сравнивать нечего.') :
      t('С начала года выгоднее {r}: он меньше на {n} сум.', { r: cmp(K.ytd) === 'turnover' ? t('налог с оборота') : t('налог на прибыль'), n: fmt(Math.abs(K.ytd.turnover - K.ytd.profit)) }) +
      (cmp(K.ytd) === cur ? t(' Сейчас выбран именно он.') : t(' Сейчас выбран другой режим (вкладка «Настройки»).'))) + '</p>' +
    '<div class="panel"><div class="row" style="justify-content:space-between"><span class="small muted">' + t('Выручка за год к пределу налога с оборота') + '</span><span class="num small">' + t('{a} из {b}', { a: fmt(K.ytd.rev), b: fmt(K.limit) }) + '</span></div><div class="bar" style="width:' + pct.toFixed(1) + '%"></div></div>' +
    (K.loss > 0 ? '<p class="small"><b>' + t('Убыток прошлых лет, который ещё можно учесть: {n} сум', { n: fmt(K.loss) }) + '</b></p>' : '') +
    '<p class="note">' + t('Налог месяца может быть отрицательным: убыточный месяц уменьшает налог, начисленный с начала года.') + '</p>' +
    '<p class="note">' + t('Сравнение упрощённое: налог на прибыль считается нарастающим итогом за год с переносом убытка прошлых лет по настройкам, без квартальных авансов и вычетов. Налог с оборота возможен только при выручке до 1 млрд сум в год. Какой режим применять, решает бухгалтер: программа ведёт внутренний учёт.') + '</p></section>';
  var fa = B.fa - B.dep, A = B.cash + B.bank + fa, L = B.loan + B.pay.wage + B.pay.rent + B.pay.int + B.pay.tax + B.pay.vat, E = B.contrib - B.div + B.profit;
  var balH = '<section><h2>' + t('Баланс на конец месяца') + '</h2><div class="scroll"><table><tbody>' +
    tr('Активы', [''], 'head') + tr('Касса', [B.cash]) + tr('Банк', [B.bank]) + tr('Оборудование и ремонт за вычетом амортизации', [fa]) + tr('Итого активы', [A], 'sum') +
    tr('Обязательства', [''], 'head') + tr('Кредит', [B.loan]) + tr('Зарплата и налоги с неё', [B.pay.wage]) + tr('Аренда', [B.pay.rent]) + tr('Проценты', [B.pay.int]) + tr('Налог с оборота или прибыли', [B.pay.tax]) + tr('НДС к уплате', [B.pay.vat]) + tr('Итого обязательства', [L], 'sum') +
    tr('Капитал', [''], 'head') + tr('Взносы учредителя', [B.contrib]) + tr('Выплаты учредителю', [-B.div]) + tr('Накопленная прибыль', [B.profit]) + tr('Итого капитал', [E], 'sum') +
    tr('Проверка: активы − обязательства − капитал', [A - L - E], 'sum') + '</tbody></table></div></section>';
  var balN = '<p class="note">' + t('Активы = Обязательства + Капитал. Если в строке проверки ноль, учёт сходится.') + '</p>';
  // один отчёт на экране: таблицы на всю ширину, переключатель сверху
  var blocks = { pl: plH, cash: cashH + cashN, bal: balH + balN, loan: loanRep(S, C), src: srcView(S), utm: utmView(S), cmp: cfg.tax.regime === 'general' ? genH : cmpH + cmpRest };
  var rv = blocks[S.repView] ? S.repView : 'pl';
  var nav = '<div class="seg four" role="tablist">' + [['pl', 'Прибыль'], ['cash', 'Деньги'], ['bal', 'Баланс'], ['loan', 'Кредит'], ['src', 'Источники'], ['utm', 'Метки'], ['cmp', 'Налоги']].map(function (x) {
    return '<button type="button" role="tab" data-act="rep-view" data-id="' + x[0] + '" aria-pressed="' + (rv === x[0]) + '">' + t(x[1]) + '</button>';
  }).join('') + '</div>';
  var tools = '<div class="row repTools"><button type="button" class="btn ghost" data-act="export-year">' + t('Скачать отчёт за год') + '</button><button type="button" class="btn ghost" data-act="print">' + t('Печать') + '</button></div>';
  return nav + tools + blocks[rv];
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
    '<label class="chkrow"><input type="checkbox" data-bind="cardFirm"' + (S.cfg.cardFirm ? ' checked' : '') + '><span>' + t('Карта оформлена на фирму, а не на частное лицо') + '</span></label>' + (S.cfg.cardFirm ? '' : '<p class="note">' + t('Если карта личная, налоговая может считать поступления на неё неучтённым доходом. Лучше принимать предоплату на счёт или карту фирмы.') + '</p>') +
    '<p class="note">' + t('Предоплата включается, когда указана карта и есть хотя бы одна услуга ниже. Клиент видит карту, сумму и время на оплату, затем отправляет фото чека.') + '</p>';
  h += '<h2>' + t('Услуги для очереди') + '</h2>' + (P.svc.length ? P.svc.map(function (x, i) {
    var dep = x.fixed !== '' && x.fixed != null ? +x.fixed : Math.round((+x.price || 0) * (+x.percent || 0) / 100);
    var g = function (label, key, kind) { return '<label class="fld"><span>' + t(label) + '</span><input type="text" data-psvc="' + i + ':' + key + '" data-pk="' + kind + '"' + (kind === 'text' ? '' : ' inputmode="decimal" class="n"') + ' value="' + esc(kind === 'money' ? (x[key] === '' || x[key] == null ? '' : fmt(x[key])) : (x[key] == null ? '' : String(x[key]).replace('.', ','))) + '"></label>'; };
    return '<div class="panel"><div class="grid">' + g('Название (русский)', 'name_ru', 'text') + g('Название (узбекский)', 'name_uz', 'text') + g('Полная сумма, сум', 'price', 'money') + g('Предоплата, % от суммы', 'percent', 'num') + g('Или фиксированная предоплата, сум', 'fixed', 'money') + '</div>' +
      (x.isNew ? '<p class="alert">' + t('Услуга ещё не сохранена: заполните поля и нажмите «Сохранить» внизу, тогда она появится в «Навбате» и в боте.') + '</p>' : '') + '<div class="row"><span class="chip ok">' + t('Клиент внесёт вперёд') + ': ' + fmt(dep) + ' ' + t('сум') + '</span><button class="btn ghost danger small" data-act="pp-del" data-id="' + i + '">' + t('Удалить услугу') + '</button></div></div>';
  }).join('') : '<p class="empty">' + t('Пока нет услуг: предоплата выключена.') + '</p>') +
    '<div class="row gaptop"><button class="btn ghost" data-act="pp-add">' + t('Добавить услугу очереди') + '</button>' + (P.svc.some(function (x) { return x.isNew; }) ? '<button class="btn" data-act="pp-save"' + (P.busy ? ' disabled' : '') + '>' + t('Сохранить') + '</button>' : '') + '</div>';
  if (P.setup) h += '<div class="panel"><b>' + t('Чеки в Telegram для сотрудников') + '</b><p class="small">' + t('Нажмите, чтобы чеки приходили вам в Telegram:') + '</p><div class="row"><a class="btn" href="https://t.me/mittiyurakcha_bot?start=staff_' + esc(P.setup.code) + '" target="_blank" rel="noopener">' + t('Подключить Telegram') + '</a></div><p class="small muted">' + t('Или отправьте боту команду: {c}', { c: '<code>/staff ' + esc(P.setup.code) + '</code>' }) + '</p><p class="small muted">' + t('Подключено чатов: {n}', { n: P.setup.chats }) + '</p></div>';
  return h + '<div class="row"><button class="btn" data-act="pp-save"' + (P.busy ? ' disabled' : '') + '>' + t('Сохранить') + '</button></div></section>';
}

export function vSet(S) {
  var tx = S.cfg.tax;
  var tab = S.setTab || 'clinic';
  var tabs = '<div class="seg four settabs" role="tablist">' + [['clinic', 'Клиника'], ['prepay', 'Предоплата'], ['tax', 'Налоги'], ['data', 'Данные']].map(function (x) { return '<button type="button" data-act="set-tab" data-id="' + x[0] + '" aria-pressed="' + (tab === x[0]) + '">' + t(x[1]) + '</button>'; }).join('') + '</div>';
  var taxHtml = '<section><h2>' + t('Налоговый режим') + '</h2><div class="panel"><label class="fld"><span>' + t('Как фирма платит налог') + '</span>' +
    sel('f-tax-regime', [['general', 'Общий: НДС 12% + налог на прибыль (для клиники)'], ['turnover', 'Налог с оборота 4% (по ст. 461 для клиники недоступен, но так платят многие)'], ['profit', 'Только налог на прибыль, без НДС']], tx.regime, 'data-bind="tax.regime" data-kind="text"') + '</label>' +
    '<div class="grid">' + inp(S, t('НДС, %'), 'tax.vat', 'num') + inp(S, t('Налог с оборота, %'), 'tax.turnover', 'num') + inp(S, t('Налог на прибыль, %'), 'tax.profit', 'num') + inp(S, t('Перенос убытка, лет'), 'tax.lossYears', 'num') + inp(S, t('Убыток покрывает не более, % прибыли'), 'tax.lossLimit', 'num') + '</div><label class="chkrow"><input type="checkbox" data-bind="tax.social"' + (tx.social !== false ? ' checked' : '') + '><span>' + t('Медицинская организация в социальной сфере (не менее 90% дохода — медуслуги): налог на прибыль 0%') + '</span></label>' +
    '<p class="note">' + t('Налог на прибыль считается нарастающим итогом с начала года. Убыток прошлых лет по ст. 333 НК переносится без ограничения срока и доли, поэтому по умолчанию 100 лет и 100%.') + '</p></div></section>' +
    '<section><h2>' + t('Ставки с зарплаты') + '</h2><div class="panel"><div class="grid">' + inp(S, t('НДФЛ, %'), 'tax.ndfl', 'num') + inp(S, t('ИНПС, %'), 'tax.inps', 'num') + inp(S, t('Социальный налог, %'), 'tax.soc', 'num') + '</div></div>' +
    '<p class="note">' + t('Ставки по умолчанию сверены с Налоговым кодексом (lex.uz) 14.10.2026. Перед сдачей отчётности сверяйте суммы с бухгалтером и my.soliq.uz: программа ведёт внутренний учёт и официальную отчётность не заменяет.') + '</p></section>' +
    '';
  var wipeRow = function (id, title, desc) { return '<li><div class="li-main"><b>' + t(title) + '</b><span class="small muted">' + t(desc) + '</span></div><button type="button" class="btn ghost danger" data-act="wipe" data-id="' + id + '"' + (S.wipeBusy ? ' disabled' : '') + '>' + t('Удалить') + '</button></li>'; };
  var wipeHtml = '<section><h2>' + t('Очистка данных') + '</h2><div class="panel"><p class="small muted">' + t('Удаляйте данные по отдельности или всё сразу, чтобы начать с чистого листа. Удалённое не вернуть, поэтому сначала скачайте резервную копию. Врачи, услуги, цены предоплаты, карта, адрес и сотрудники не удаляются.') + '</p><ul class="list">' +
    wipeRow('appointments', 'Записи и приёмы', 'Все записи «Ресепшена»: оплаты, возвраты, неявки и фото чеков.') + wipeRow('clients', 'Клиенты', 'База клиентов «Ресепшена» с историей.') + wipeRow('receipts', 'Фото чеков', 'Только фотографии чеков в хранилище.') + wipeRow('bot', 'Состояния бота', 'Выбранный язык и незаконченные записи в Telegram-боте.') +
    wipeRow('ops', 'Операции и зарплата', 'Доходы, расходы и зарплата по всем месяцам в «Главном».') + wipeRow('loan', 'Кредит и аренда', 'Суммы, сроки и цель кредита, аренда.') + wipeRow('assets', 'Техника и оборудование', 'Список техники с амортизацией.') + wipeRow('staff', 'Сотрудники клиники', 'Список сотрудников и ставки в «Главном».') +
    '</ul><div class="row gaptop"><button type="button" class="btn danger solid" data-act="wipe" data-id="all"' + (S.wipeBusy ? ' disabled' : '') + '>' + t('Удалить всё и начать с нуля') + '</button></div></div></section>';
  var LOGK = { add: 'Добавлена операция', del: 'Удалена операция', lock: 'Месяц закрыт', unlock: 'Месяц открыт', unaccrue: 'Отменено начисление зарплаты', taxmode: 'Режим налогов переключён на общий (НДС + налог на прибыль)', utmadd: 'Создана метка', utmdel: 'Удалена метка' };
  var logs = (S.cfg.log || []).slice(0, 40);
  var logHtml = '<section><h2>' + t('Журнал действий') + '</h2><div class="panel">' + (logs.length ? '<ul class="list">' + logs.map(function (e) {
    var when = ''; try { when = new Date(e.ts).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (x) { /* без времени */ }
    return '<li><div class="li-main"><b>' + t(LOGK[e.k] || e.k) + (e.c && CATNAME[e.c] ? ': ' + t(CATNAME[e.c]) : '') + '</b><span class="small muted">' + esc(when) + (e.who ? ' · ' + esc(e.who) : '') + (e.d ? ' · ' + esc(fmtDate(e.d)) : '') + '</span></div>' + (e.a ? '<span class="num">' + fmt(e.a) + '</span>' : '') + '</li>';
  }).join('') + '</ul>' : '<p class="empty">' + t('Пока записей нет. Здесь видно, кто и когда добавил или удалил операцию и закрыл месяц.') + '</p>') + '</div></section>';
  var AU = S.audit || { state: 'idle', rows: [], msg: '' };
  var AUC = { status: 'статус', amount: 'сумма', pay_method: 'способ оплаты', pay_status: 'состояние оплаты', deposit: 'предоплата', refund_amount: 'возврат', finished_at: 'завершён', room_at: 'у врача', starts_at: 'время', doctor_id: 'врач', client_name: 'имя', client_phone: 'телефон', check_no: 'номер чека' };
  var AUS = { booked: 'Записан', came: 'Пришёл', done: 'Оплачено', cancelled: 'Отменён', no_show: 'Не пришёл', blocked: 'Время закрыто' };
  var auv = function (k, x) { if (x == null || x === '') return '—'; if (k === 'status') return t(AUS[x] || x); if (k === 'finished_at' || k === 'room_at') return t('да'); if (k === 'starts_at') { try { return new Date(x).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { return String(x); } } if (k === 'doctor_id') return t('другой врач'); return esc(String(x)); };
  var auHtml = '<section><h2>' + t('Журнал Ресепшена') + '</h2><div class="panel"><p class="small muted">' + t('Кто и что менял в записях: статусы, оплаты, возвраты, переносы, удаления. Виден только владельцу.') + '</p>' +
    (AU.state === 'ok' ? (AU.rows.length ? '<ul class="list">' + AU.rows.map(function (e) {
      var when = ''; try { when = new Date(e.at).toLocaleString('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (x) { /* без времени */ }
      var what = e.act === 'insert' ? t('Создана запись') : e.act === 'delete' ? t('Удалена запись') : Object.keys(e.changes || {}).map(function (k) { var p = e.changes[k]; return t(AUC[k] || k) + ': ' + auv(k, p[0]) + ' → ' + auv(k, p[1]); }).join('; ');
      return '<li><div class="li-main"><b>' + esc(e.client || '—') + '</b><span class="small muted">' + esc(when) + ' · ' + esc(e.who || '') + '</span><span class="small">' + what + '</span></div></li>';
    }).join('') + '</ul>' : '<p class="empty">' + t('Изменений пока нет.') + '</p>') : AU.state === 'loading' ? '<p class="empty">' + t('Загрузка…') + '</p>' : AU.state === 'error' ? '<p class="alert">' + esc(AU.msg) + '</p>' : '') +
    '<div class="row gaptop"><button type="button" class="btn ghost" data-act="audit-load">' + t(AU.state === 'ok' ? 'Обновить' : 'Показать журнал') + '</button></div></div></section>';
  var dataHtml = syncBlock(S) + appsBlock() + logHtml + auHtml + wipeHtml +
    '<section><h2>' + t('Резервная копия') + '</h2><div class="panel">' +
    '<div class="row"><button class="btn" data-act="backup-save">' + t('Скачать резервную копию') + '</button><button class="btn ghost" data-act="backup-load">' + t('Загрузить из копии') + '</button></div>' +
    '<input id="backup-file" type="file" accept="application/json,.json" hidden></div>' +
    '<p class="note">' + t('Данные хранятся только на этом устройстве, в памяти браузера. Скачивайте копию регулярно и перед очисткой данных браузера. Загрузка из копии полностью заменяет текущие данные.') + '</p></section>' + lookBlock(S);
  return tabs + (tab === 'clinic' ? infoBlock(S) : tab === 'prepay' ? prepayBlock(S) : tab === 'tax' ? taxHtml : dataHtml);
}
