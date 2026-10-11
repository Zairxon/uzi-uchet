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

export function blank(m) {
  return {
    m: m, rev: 0, opex: {}, opexSum: 0, payroll: 0, rent: 0, int: 0, dep: 0, preTax: 0, tax: 0, net: 0, open: 0, close: 0,
    cf: { cust: 0, opex: 0, wage: 0, rent: 0, tax: 0, capex: 0, loanIn: 0, princ: 0, int: 0, contrib: 0, div: 0 },
  };
}

export function compute(cfg, months, upto) {
  var starts = Object.keys(months).filter(function (m) { var x = months[m]; return (x.ops && x.ops.length) || x.payroll; });
  starts.push(ymOf(cfg.loan.start), ymOf(cfg.rent.start)); cfg.assets.forEach(function (a) { starts.push(ymOf(a.date)); });
  starts = starts.filter(Boolean).sort();
  var first = starts[0] || upto, rows = [], intBy = {}; sched(cfg.loan).forEach(function (r) { intBy[r.m] = r.int; });
  var B = { cash: 0, bank: 0, fa: 0, dep: 0, loan: 0, contrib: 0, div: 0, profit: 0, pay: { wage: 0, rent: 0, int: 0, tax: 0 } };
  var eq = []; Object.keys(months).forEach(function (mm) { ((months[mm] && months[mm].ops) || []).forEach(function (o) { if (o.t === 'expense' && o.c === 'equip') eq.push({ m: ymOf(o.d) || mm, cost: o.a || 0, life: 60 }); }); });
  var loanM = cfg.loan.amount ? ymOf(cfg.loan.start) : '', rentM = ymOf(cfg.rent.start), guard = 0;
  for (var m = first; m <= upto && guard < 720; m = addM(m, 1), guard++) {
    var r = blank(m); r.open = B.cash + B.bank;
    ((months[m] && months[m].ops) || []).forEach(function (o) {
      var a = o.a || 0, A = o.acct === 'cash' ? 'cash' : o.acct === 'founder' ? '' : 'bank'; // карта, перечисление и старый «банк» — на счёте; «учредитель» — свои деньги учредителя
      if (o.t === 'income') { if (A) B[A] += a; else { B.div += a; r.cf.div += a; } if (o.c === 'contrib') { B.contrib += a; r.cf.contrib += a; } else { r.rev += a; r.cf.cust += a; } }
      else {
        if (A) B[A] -= a; else { B.contrib += a; r.cf.contrib += a; } // оплатил учредитель: вклад учредителя
        if (o.c === 'pay_sal' || o.c === 'pay_ptax') { B.pay.wage -= a; r.cf.wage += a; }
        else if (o.c === 'pay_rent') { B.pay.rent -= a; r.cf.rent += a; }
        else if (o.c === 'pay_int') { B.pay.int -= a; r.cf.int += a; }
        else if (o.c === 'pay_tax') { B.pay.tax -= a; r.cf.tax += a; }
        else if (o.c === 'pay_princ') { B.loan -= a; r.cf.princ += a; }
        else if (o.c === 'dividend') { B.div += a; r.cf.div += a; }
        else if (o.c === 'equip') { B.fa += a; r.cf.capex += a; } // покупка техники: не расход, а имущество (амортизация идёт по частям)
        else { r.opex[o.c] = (r.opex[o.c] || 0) + a; r.opexSum += a; r.cf.opex += a; }
      }
    });
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
    r.tax = cfg.tax.regime === 'profit' ? Math.max(0, r.preTax) * cfg.tax.profit / 100 : r.rev * cfg.tax.turnover / 100;
    B.pay.tax += r.tax; r.net = r.preTax - r.tax; B.profit += r.net; B.dep += r.dep; r.close = B.cash + B.bank; rows.push(r);
  }
  var cur = rows.length && rows[rows.length - 1].m === upto ? rows[rows.length - 1] : blank(upto);
  if (!rows.length || rows[rows.length - 1].m !== upto) { cur.open = cur.close = B.cash + B.bank; }
  return { rows: rows, B: B, cur: cur };
}

export function ytd(rows, upto) {
  var y = upto.slice(0, 4), s = blank(upto); rows.forEach(function (r) {
    if (r.m.slice(0, 4) !== y) return;
    ['rev', 'opexSum', 'payroll', 'rent', 'int', 'dep', 'preTax', 'tax', 'net'].forEach(function (k) { s[k] += r[k]; });
    Object.keys(r.opex).forEach(function (k) { s.opex[k] = (s.opex[k] || 0) + r.opex[k]; });
  }); return s;
}

// Итоги баланса: те же формулы, что в строке «Проверка» на вкладке «Отчёты».
export function balance(B) {
  var fa = B.fa - B.dep, A = B.cash + B.bank + fa,
    L = B.loan + B.pay.wage + B.pay.rent + B.pay.int + B.pay.tax,
    E = B.contrib - B.div + B.profit;
  return { fa: fa, A: A, L: L, E: E, check: A - L - E };
}

// Сравнение режимов: тот же расчёт, что в compute (по месяцам), но по обоим режимам сразу.
// Налог с оборота = выручка × ставка, налог на прибыль = max(0, прибыль до налога) × ставка.
export var TURNOVER_LIMIT = 1000000000;
export function compareTax(cfg, rows, upto) {
  var y = upto.slice(0, 4);
  function sum(list) {
    var s = { rev: 0, preTax: 0, turnover: 0, profit: 0 };
    list.forEach(function (r) {
      s.rev += r.rev; s.preTax += r.preTax;
      s.turnover += r.rev * cfg.tax.turnover / 100;
      s.profit += Math.max(0, r.preTax) * cfg.tax.profit / 100;
    });
    return s;
  }
  var month = sum(rows.filter(function (r) { return r.m === upto; }));
  var year = sum(rows.filter(function (r) { return r.m.slice(0, 4) === y && r.m <= upto; }));
  return { month: month, ytd: year, limit: TURNOVER_LIMIT };
}
