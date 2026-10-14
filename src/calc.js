// Расчёты перенесены из прототипа без изменения формул.
// Единственное отличие: payCalc и compute получают cfg и months параметрами,
// а не читают глобальные переменные.
import { addM, idx, ymOf } from './util.js';

export function sched(l, startYm) {
  var out = []; var st = startYm || ymOf(l.start); if (!l.amount || !l.term || !st) return out;
  var bal = l.amount, n = Math.max(1, l.term - l.grace);
  for (var k = 1; k <= l.term; k++) {
    var it = bal * l.rate / 100 / 12, pr = k > l.grace ? Math.min(bal, l.amount / n) : 0;
    out.push({ k: k, m: addM(st, k), open: bal, pr: pr, int: it, close: bal - pr }); bal -= pr;
  }
  return out;
}

export function payCalc(staff, tax) {
  var t = tax, lines = staff.map(function (s) {
    var g = s.salary || 0, nd = g * t.ndfl / 100, ip = g * t.inps / 100;
    return { name: s.name, role: s.role, gross: g, ndfl: nd - ip, inps: ip, net: g - nd };
  });
  var r = { lines: lines, gross: 0, ndfl: 0, inps: 0, net: 0 };
  lines.forEach(function (x) { r.gross += x.gross; r.ndfl += x.ndfl; r.inps += x.inps; r.net += x.net; });
  r.soc = r.gross * t.soc / 100; return r;
}

// Налог на прибыль нарастающим итогом за год с переносом убытка прошлых лет.
// За месяц: налог на накопленную с начала года прибыль минус уже начисленное (в месяце после убыточного налог может уменьшиться).
// Убыток года, закончившегося убытком, можно учесть в следующие lossYears лет, но не более lossLimit % налоговой базы года.
export function ptState() { return { year: 0, cum: 0, taxed: 0, use: 0, usl: 0, oth: 0, losses: [] }; }
function ptAvail(S, y, yrs) { var a = 0; S.losses.forEach(function (l) { if (y > l.y && y - l.y <= yrs) a += l.left; }); return a; }
export function ptMonth(S, tax, m, pre, share) {
  var y = +m.slice(0, 4); if (S.year !== y) { S.year = y; S.cum = 0; S.taxed = 0; S.use = 0; S.usl = 0; S.oth = 0; }
  S.cum += pre;
  var yrs = tax.lossYears == null ? 100 : tax.lossYears, lim = (tax.lossLimit == null ? 100 : tax.lossLimit) / 100, base = Math.max(0, S.cum);
  var rate = tax.regime === 'general' && tax.social !== false && share != null && share >= 0.9 ? 0 : tax.profit; // социальная сфера: ≥90% дохода от медуслуг → 0%
  S.use = Math.min(ptAvail(S, y, yrs), base * lim);
  var due = (base - S.use) * rate / 100, out = due - S.taxed; S.taxed = due;
  if (m.slice(5, 7) === '12') ptClose(S, y, yrs);
  return out;
}
// конец года: убыток уходит в запас, прибыль гасит самые старые убытки
function ptClose(S, y, yrs) {
  if (S.cum < 0) S.losses.push({ y: y, left: -S.cum });
  else { var need = S.use; S.losses.slice().sort(function (a, b) { return a.y - b.y; }).forEach(function (l) { if (y > l.y && y - l.y <= yrs && need > 0) { var t = Math.min(l.left, need); l.left -= t; need -= t; } }); }
  S.use = 0;
}

export function blank(m) {
  return {
    m: m, rev: 0, revUsl: 0, revOth: 0, vatOut: 0, vatIn: 0, vat: 0, opex: {}, opexSum: 0, payroll: 0, rent: 0, int: 0, dep: 0, preTax: 0, tax: 0, net: 0, open: 0, close: 0,
    cf: { cust: 0, opex: 0, wage: 0, rent: 0, tax: 0, capex: 0, loanIn: 0, princ: 0, int: 0, contrib: 0, div: 0 },
  };
}

export function compute(cfg, months, upto) {
  var starts = Object.keys(months).filter(function (m) { var x = months[m]; return (x.ops && x.ops.length) || x.payroll; });
  starts.push(ymOf(cfg.loan.start), ymOf(cfg.rent.start)); cfg.assets.forEach(function (a) { starts.push(ymOf(a.date)); });
  starts = starts.filter(Boolean).sort();
  var first = starts[0] || upto, rows = [], intBy = {}; sched(cfg.loan).forEach(function (r) { intBy[r.m] = r.int; });
  var B = { cash: 0, bank: 0, fa: 0, dep: 0, loan: 0, contrib: 0, div: 0, profit: 0, pay: { wage: 0, rent: 0, int: 0, tax: 0, vat: 0 } };
  var gen = cfg.tax.regime === 'general', vr = cfg.tax.vat == null ? 12 : cfg.tax.vat, vatOf = function (o) { return gen && o.vat === true ? (o.a || 0) * vr / (100 + vr) : 0; };
  var eq = []; Object.keys(months).forEach(function (mm) { ((months[mm] && months[mm].ops) || []).forEach(function (o) { if (o.t === 'expense' && o.c === 'equip') eq.push({ m: ymOf(o.d) || mm, cost: (o.a || 0) - vatOf(o), life: 60 }); }); });
  var loanM = cfg.loan.amount ? ymOf(cfg.loan.start) : '', rentM = ymOf(cfg.rent.start), guard = 0, PT = ptState();
  for (var m = first; m <= upto && guard < 720; m = addM(m, 1), guard++) {
    var r = blank(m); r.open = B.cash + B.bank;
    ((months[m] && months[m].ops) || []).forEach(function (o) {
      var a = o.a || 0, A = o.acct === 'cash' ? 'cash' : o.acct === 'founder' ? '' : 'bank'; // карта, перечисление и старый «банк» — на счёте; «учредитель» — свои деньги учредителя
      if (o.t === 'income') { if (A) B[A] += a; else { B.div += a; r.cf.div += a; } if (o.c === 'contrib') { B.contrib += a; r.cf.contrib += a; } else { r.rev += a; r.cf.cust += a; if (o.c === 'usl') r.revUsl += a; else r.revOth += a; } }
      else {
        if (A) B[A] -= a; else { B.contrib += a; r.cf.contrib += a; } // оплатил учредитель: вклад учредителя
        if (o.c === 'pay_sal' || o.c === 'pay_ptax') { B.pay.wage -= a; r.cf.wage += a; }
        else if (o.c === 'pay_rent') { B.pay.rent -= a; r.cf.rent += a; }
        else if (o.c === 'pay_int') { B.pay.int -= a; r.cf.int += a; }
        else if (o.c === 'pay_tax') { B.pay.tax -= a; r.cf.tax += a; }
        else if (o.c === 'pay_vat') { B.pay.vat -= a; r.cf.tax += a; }
        else if (o.c === 'pay_princ') { B.loan -= a; r.cf.princ += a; }
        else if (o.c === 'dividend') { B.div += a; r.cf.div += a; }
        else if (o.c === 'equip') { var ev = vatOf(o); B.fa += a - ev; r.cf.capex += a; r.vatIn += ev; } // покупка техники: не расход, а имущество (амортизация идёт по частям)
        else { var ov = o.c === 'bank' ? 0 : vatOf(o); r.opex[o.c] = (r.opex[o.c] || 0) + a - ov; r.opexSum += a - ov; r.cf.opex += a; r.vatIn += ov; }
      }
    });
    if (gen) { r.vatOut = r.rev * vr / (100 + vr); r.rev -= r.vatOut; r.revUsl -= r.revUsl * vr / (100 + vr); r.revOth -= r.revOth * vr / (100 + vr); r.vat = r.vatOut - r.vatIn; B.pay.vat += r.vat; } // цены с НДС: выручка без НДС, налог — обязательство
    if (loanM === m) { B.bank += cfg.loan.amount; B.loan += cfg.loan.amount; r.cf.loanIn += cfg.loan.amount; }
    cfg.assets.forEach(function (a) {
      var am = ymOf(a.date); if (!am || !a.cost) return;
      if (am === m) { if (a.acct === 'founder') { B.contrib += a.cost; r.cf.contrib += a.cost; } else B[a.acct === 'cash' ? 'cash' : 'bank'] -= a.cost; B.fa += a.cost; r.cf.capex += a.cost; }
      var k = idx(m) - idx(am), life = Math.max(1, a.life || 1); if (k >= 1 && k <= life) r.dep += a.cost / life;
    });
    eq.forEach(function (q) { var k = idx(m) - idx(q.m); if (k >= 1 && k <= q.life) r.dep += q.cost / q.life; });
    var p = months[m] && months[m].payroll; if (p) { r.payroll = (p.gross || 0) + (p.soc || 0); B.pay.wage += r.payroll; }
    if (rentM && m >= rentM && cfg.rent.amount) { r.rent = cfg.rent.amount; B.pay.rent += r.rent; }
    if (intBy[m]) { r.int = intBy[m]; B.pay.int += r.int; }
    r.preTax = r.rev - r.opexSum - r.payroll - r.rent - r.int - r.dep;
    if (gen) { if (PT.year !== +m.slice(0, 4)) { PT.usl = 0; PT.oth = 0; } PT.usl += r.revUsl; PT.oth += r.revOth; }
    r.tax = gen ? ptMonth(PT, cfg.tax, m, r.preTax, PT.usl + PT.oth > 0 ? PT.usl / (PT.usl + PT.oth) : 1) : cfg.tax.regime === 'profit' ? ptMonth(PT, cfg.tax, m, r.preTax) : r.rev * cfg.tax.turnover / 100;
    B.pay.tax += r.tax; r.net = r.preTax - r.tax; B.profit += r.net; B.dep += r.dep; r.close = B.cash + B.bank; rows.push(r);
  }
  var cur = rows.length && rows[rows.length - 1].m === upto ? rows[rows.length - 1] : blank(upto);
  if (!rows.length || rows[rows.length - 1].m !== upto) { cur.open = cur.close = B.cash + B.bank; }
  return { rows: rows, B: B, cur: cur };
}

export function ytd(rows, upto) {
  var y = upto.slice(0, 4), s = blank(upto); rows.forEach(function (r) {
    if (r.m.slice(0, 4) !== y) return;
    ['rev', 'vatOut', 'vatIn', 'vat', 'opexSum', 'payroll', 'rent', 'int', 'dep', 'preTax', 'tax', 'net'].forEach(function (k) { s[k] += r[k]; });
    Object.keys(r.opex).forEach(function (k) { s.opex[k] = (s.opex[k] || 0) + r.opex[k]; });
  }); return s;
}

// Итоги баланса: те же формулы, что в строке «Проверка» на вкладке «Отчёты».
export function balance(B) {
  var fa = B.fa - B.dep, A = B.cash + B.bank + fa,
    L = B.loan + B.pay.wage + B.pay.rent + B.pay.int + B.pay.tax + B.pay.vat,
    E = B.contrib - B.div + B.profit;
  return { fa: fa, A: A, L: L, E: E, check: A - L - E };
}

// Сравнение режимов: тот же расчёт, что в compute (по месяцам), но по обоим режимам сразу.
// Налог с оборота = выручка × ставка, налог на прибыль = max(0, прибыль до налога) × ставка.
export var TURNOVER_LIMIT = 1000000000;
export function compareTax(cfg, rows, upto) {
  var y = upto.slice(0, 4), PT = ptState(), pm = {};
  rows.slice().sort(function (a, b) { return a.m < b.m ? -1 : a.m > b.m ? 1 : 0; }).forEach(function (r) { if (r.m <= upto) pm[r.m] = ptMonth(PT, cfg.tax, r.m, r.preTax); });
  function sum(list) {
    var s = { rev: 0, preTax: 0, turnover: 0, profit: 0 };
    list.forEach(function (r) { s.rev += r.rev; s.preTax += r.preTax; s.turnover += r.rev * cfg.tax.turnover / 100; s.profit += pm[r.m] || 0; });
    return s;
  }
  var month = sum(rows.filter(function (r) { return r.m === upto; }));
  var year = sum(rows.filter(function (r) { return r.m.slice(0, 4) === y && r.m <= upto; }));
  var yrs = cfg.tax.lossYears == null ? 5 : cfg.tax.lossYears;
  return { month: month, ytd: year, limit: TURNOVER_LIMIT, loss: ptAvail(PT, +y, yrs) };
}

// Общий режим клиники: сводка за год до выбранного месяца (НДС, налог на прибыль, доля медуслуг, убыток прошлых лет)
export function generalTax(cfg, rows, upto) {
  var y = upto.slice(0, 4), PT = ptState(), usl = 0, oth = 0, out = { vatOut: 0, vatIn: 0, vat: 0, tax: 0, rev: 0, preTax: 0 }, month = null;
  rows.slice().sort(function (a, b) { return a.m < b.m ? -1 : a.m > b.m ? 1 : 0; }).forEach(function (r) {
    if (r.m > upto) return;
    if (r.m.slice(0, 4) === y) { usl += r.revUsl; oth += r.revOth; ['vatOut', 'vatIn', 'vat', 'tax', 'rev', 'preTax'].forEach(function (k) { out[k] += r[k]; }); }
    if (r.m === upto) month = r;
    if (PT.year !== +r.m.slice(0, 4)) { PT.usl = 0; PT.oth = 0; }
    PT.usl += r.revUsl; PT.oth += r.revOth;
    ptMonth(PT, cfg.tax, r.m, r.preTax, PT.usl + PT.oth > 0 ? PT.usl / (PT.usl + PT.oth) : 1);
  });
  var yrs = cfg.tax.lossYears == null ? 100 : cfg.tax.lossYears;
  return { ytd: out, month: month, share: usl + oth > 0 ? usl / (usl + oth) : 1, loss: ptAvail(PT, +y, yrs), zero: cfg.tax.social !== false && (usl + oth <= 0 || usl / (usl + oth) >= 0.9) };
}
