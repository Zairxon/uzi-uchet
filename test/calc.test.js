import { describe, it, expect } from 'vitest';
import { sched, payCalc, compute, ytd, balance, generalTax } from '../src/calc.js';
import { DEF, merge, addM } from '../src/util.js';

const cfgOf = (o = {}) => merge(merge(DEF, { tax: { regime: 'turnover' } }), Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)));
const op = (d, t, c, a, acct = 'bank') => ({ id: d + c + a, d, t, c, a, acct, n: '' });

describe('sched: график кредита', () => {
  const l = { amount: 120000, rate: 12, term: 6, grace: 2, start: '2026-01' };
  const S = sched(l);
  it('строит term строк, первая со следующего месяца после даты', () => {
    expect(S).toHaveLength(6);
    expect(S[0].m).toBe('2026-02');
    expect(S[5].m).toBe('2026-07');
  });
  it('в льготный период гасятся только проценты', () => {
    expect(S[0].pr).toBe(0);
    expect(S[0].int).toBeCloseTo(1200, 6);
    expect(S[1].close).toBe(120000);
  });
  it('после льготы долг гасится равными долями и закрывается в ноль', () => {
    expect(S[2].pr).toBeCloseTo(30000, 6);
    expect(S[5].close).toBeCloseTo(0, 6);
    expect(S.reduce((s, x) => s + x.pr, 0)).toBeCloseTo(120000, 6);
  });
  it('пустой график без суммы, срока или даты', () => {
    expect(sched({ ...l, amount: 0 })).toEqual([]);
    expect(sched({ ...l, start: '' })).toEqual([]);
    expect(sched({ ...l, start: '' }, '2026-03')).toHaveLength(6);
  });
});

describe('payCalc: зарплата и налоги', () => {
  const tax = DEF.tax;
  const r = payCalc([{ name: 'А', role: 'врач', salary: 10000000 }, { name: 'Б', role: 'регистратор', salary: 4000000 }], tax);
  it('НДФЛ 12%, ИНПС 0,1% удерживается из НДФЛ, на руки = оклад − 12%', () => {
    expect(r.lines[0].net).toBeCloseTo(8800000, 4);
    expect(r.lines[0].inps).toBeCloseTo(10000, 4);
    expect(r.lines[0].ndfl).toBeCloseTo(1190000, 4);
    expect(r.lines[0].ndfl + r.lines[0].inps).toBeCloseTo(1200000, 4);
  });
  it('итоги и социальный налог 12% сверх зарплаты', () => {
    expect(r.gross).toBe(14000000);
    expect(r.net).toBeCloseTo(12320000, 4);
    expect(r.soc).toBeCloseTo(1680000, 4);
  });
  it('пустой список сотрудников', () => {
    expect(payCalc([], tax)).toMatchObject({ gross: 0, net: 0, soc: 0, lines: [] });
  });
});

describe('compute: месяцы и деньги', () => {
  it('без данных возвращает нули', () => {
    const C = compute(cfgOf(), {}, '2026-05');
    expect(C.cur.rev).toBe(0);
    expect(C.B.cash + C.B.bank).toBe(0);
  });
  it('выручка, расходы, налог с оборота и деньги', () => {
    const months = { '2026-05': { ops: [
      op('2026-05-02', 'income', 'usl', 10000000, 'cash'),
      op('2026-05-03', 'expense', 'supplies', 1000000, 'cash'),
    ] } };
    const C = compute(cfgOf(), months, '2026-05');
    expect(C.cur.rev).toBe(10000000);
    expect(C.cur.opexSum).toBe(1000000);
    expect(C.cur.tax).toBeCloseTo(400000, 6);
    expect(C.cur.net).toBeCloseTo(10000000 - 1000000 - 400000, 6);
    expect(C.B.cash).toBe(9000000);
    expect(C.B.pay.tax).toBeCloseTo(400000, 6);
  });
  it('режим налога на прибыль не берёт налог с убытка', () => {
    const cfg = cfgOf({ tax: { regime: 'profit' } });
    const months = { '2026-05': { ops: [op('2026-05-02', 'expense', 'other', 500000)] } };
    expect(compute(cfg, months, '2026-05').cur.tax).toBe(0);
  });
  it('взнос учредителя не выручка, но деньги и капитал', () => {
    const months = { '2026-05': { ops: [op('2026-05-02', 'income', 'contrib', 5000000)] } };
    const C = compute(cfgOf(), months, '2026-05');
    expect(C.cur.rev).toBe(0);
    expect(C.B.contrib).toBe(5000000);
    expect(C.B.bank).toBe(5000000);
  });
  it('кредит поступает на банк и растёт долг; погашение уменьшает его', () => {
    const cfg = cfgOf({ loan: { amount: 100000000, rate: 15, term: 84, grace: 24, start: '2026-03-10' } });
    const months = { '2026-04': { ops: [op('2026-04-05', 'expense', 'pay_princ', 1000000)] } };
    const C = compute(cfg, months, '2026-04');
    expect(C.B.loan).toBe(99000000);
    expect(C.rows[0].cf.loanIn).toBe(100000000);
  });
  it('амортизация начинается со следующего месяца и идёт ровно срок службы', () => {
    const cfg = cfgOf({ assets: [{ id: 'a', name: 'УЗИ', cost: 120000, date: '2026-01-15', life: 12, acct: 'bank' }] });
    const C = compute(cfg, {}, '2027-03');
    const byM = Object.fromEntries(C.rows.map((r) => [r.m, r]));
    expect(byM['2026-01'].dep).toBe(0);
    expect(byM['2026-01'].cf.capex).toBe(120000);
    expect(byM['2026-02'].dep).toBe(10000);
    expect(byM['2027-01'].dep).toBe(10000);
    expect(byM['2027-02'].dep).toBe(0);
    expect(C.B.fa - C.B.dep).toBe(0);
  });
  it('начисленная зарплата попадает в расходы и в долг', () => {
    const payroll = payCalc([{ name: 'А', role: '', salary: 1000000 }], DEF.tax);
    const C = compute(cfgOf(), { '2026-05': { ops: [], payroll } }, '2026-05');
    expect(C.cur.payroll).toBeCloseTo(1120000, 6);
    expect(C.B.pay.wage).toBeCloseTo(1120000, 6);
  });
});

describe('ytd: с начала года', () => {
  it('суммирует только месяцы того же года', () => {
    const months = {
      '2025-12': { ops: [op('2025-12-05', 'income', 'usl', 7000000)] },
      '2026-01': { ops: [op('2026-01-05', 'income', 'usl', 1000000)] },
      '2026-02': { ops: [op('2026-02-05', 'income', 'usl', 2000000), op('2026-02-06', 'expense', 'ads', 300000)] },
    };
    const C = compute(cfgOf(), months, '2026-02');
    const y = ytd(C.rows, '2026-02');
    expect(y.rev).toBe(3000000);
    expect(y.opex.ads).toBe(300000);
    expect(y.net).toBeCloseTo(C.rows.filter((r) => r.m.startsWith('2026')).reduce((s, r) => s + r.net, 0), 6);
  });
});

describe('баланс: активы − обязательства − капитал = 0', () => {
  const near0 = (x) => expect(Math.abs(x)).toBeLessThan(1e-4);

  it('на пустых данных и на простом примере', () => {
    near0(balance(compute(cfgOf(), {}, '2026-05').B).check);
    const months = { '2026-05': { ops: [op('2026-05-02', 'income', 'usl', 9e6, 'cash')] } };
    near0(balance(compute(cfgOf(), months, '2026-05').B).check);
  });

  // Детерминированный генератор, чтобы тест воспроизводился.
  const rng = (seed) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const INC = ['usl', 'other_inc', 'contrib'];
  const EXP = ['supplies', 'util', 'ads', 'repair', 'bank', 'other', 'pay_sal', 'pay_ptax', 'pay_rent', 'pay_int', 'pay_princ', 'pay_tax', 'dividend', 'equip'];

  it('сходится на 300 случайных сценариях по всем месяцам', () => {
    for (let s = 1; s <= 300; s++) {
      const R = rng(s), pick = (a) => a[Math.floor(R() * a.length)];
      const cfg = cfgOf({
        tax: { regime: R() < 0.5 ? 'profit' : 'turnover' },
        loan: R() < 0.6 ? { amount: Math.round(R() * 5e8), rate: 10 + R() * 10, term: 12 + Math.floor(R() * 84), grace: Math.floor(R() * 24), start: '2026-0' + (1 + Math.floor(R() * 6)) + '-10' } : undefined,
        rent: R() < 0.6 ? { amount: Math.round(R() * 1e7), start: '2026-0' + (1 + Math.floor(R() * 6)) + '-01' } : undefined,
        assets: Array.from({ length: Math.floor(R() * 4) }, (_, i) => ({ id: 'a' + i, name: 'x', cost: Math.round(R() * 3e8), date: '2026-0' + (1 + Math.floor(R() * 9)) + '-15', life: 1 + Math.floor(R() * 60), acct: pick(['bank', 'cash']) })),
      });
      const staff = Array.from({ length: 1 + Math.floor(R() * 8) }, (_, i) => ({ id: 's' + i, name: 'n', role: 'r', salary: Math.round(R() * 1e7) }));
      const months = {};
      for (let k = 0; k < 10; k++) {
        const m = addM('2026-01', k), ops = [];
        for (let j = 0, n = Math.floor(R() * 12); j < n; j++) {
          const t = R() < 0.5 ? 'income' : 'expense';
          ops.push(op(m + '-10', t, pick(t === 'income' ? INC : EXP), Math.round(R() * 2e7) + 1, pick(['cash', 'bank', 'card', 'transfer', 'founder'])));
        }
        months[m] = { ops, payroll: R() < 0.6 ? payCalc(staff, cfg.tax) : null };
      }
      for (let k = 0; k < 12; k++) {
        const C = compute(cfg, months, addM('2026-01', k));
        near0(balance(C.B).check);
      }
    }
  });
});

describe('compareTax: сравнение режимов', () => {
  const months = {
    '2026-01': { ops: [op('2026-01-05', 'income', 'usl', 100000000), op('2026-01-06', 'expense', 'supplies', 60000000)] },
    '2026-02': { ops: [op('2026-02-05', 'income', 'usl', 10000000), op('2026-02-06', 'expense', 'supplies', 30000000)] },
  };
  it('оборот = выручка × 4%, прибыль — нарастающим итогом за год × 15%', async () => {
    const { compareTax } = await import('../src/calc.js');
    const cfg = cfgOf();
    const C = compute(cfg, months, '2026-02');
    const K = compareTax(cfg, C.rows, '2026-02');
    expect(K.month.turnover).toBeCloseTo(400000, 6);
    expect(K.month.profit).toBeCloseTo(-3000000, 6); // убыточный февраль уменьшает налог, начисленный за январь
    expect(K.ytd.rev).toBe(110000000);
    expect(K.ytd.turnover).toBeCloseTo(4400000, 6);
    expect(K.ytd.profit).toBeCloseTo(3000000, 6); // (40 − 20) млн × 15%
  });
  it('согласуется с compute для выбранного режима', async () => {
    const { compareTax } = await import('../src/calc.js');
    for (const regime of ['turnover', 'profit']) {
      const cfg = cfgOf({ tax: { regime } });
      const C = compute(cfg, months, '2026-02');
      const K = compareTax(cfg, C.rows, '2026-02');
      expect(K.ytd[regime]).toBeCloseTo(ytd(C.rows, '2026-02').tax, 6);
    }
  });
});

describe('налог на прибыль: нарастающий итог и перенос убытка', () => {
  const cfgP = (extra) => cfgOf({ tax: { regime: 'profit', ...(extra || {}) } });
  const mo = (m, inc, exp) => ({ ops: [op(m + '-05', 'income', 'usl', inc), op(m + '-06', 'expense', 'supplies', exp)] });
  it('убыток внутри года гасит прибыль того же года', () => {
    const months = { '2026-01': mo('2026-01', 100e6, 60e6), '2026-02': mo('2026-02', 10e6, 30e6) };
    expect(compute(cfgP(), months, '2026-01').cur.tax).toBeCloseTo(6e6, 6);
    expect(compute(cfgP(), months, '2026-02').cur.tax).toBeCloseTo(-3e6, 6);
    expect(ytd(compute(cfgP(), months, '2026-02').rows, '2026-02').tax).toBeCloseTo(3e6, 6);
  });
  it('убыток прошлого года уменьшает налог, но не больше заданной доли прибыли (если доля задана)', () => {
    const months = { '2025-06': mo('2025-06', 0, 100e6), '2026-03': mo('2026-03', 100e6, 60e6) };
    // прибыль 40 млн, убыток 100 млн покрывает не более 50% = 20 млн → база 20 млн
    expect(compute(cfgP({ lossLimit: 50 }), months, '2026-03').cur.tax).toBeCloseTo(3e6, 6);
    expect(compute(cfgP({ lossLimit: 100 }), months, '2026-03').cur.tax).toBeCloseTo(0, 6);
    expect(compute(cfgP({ lossLimit: 0 }), months, '2026-03').cur.tax).toBeCloseTo(6e6, 6);
  });
  it('убыток действует только заданное число лет', () => {
    const months = { '2024-06': mo('2024-06', 0, 100e6), '2026-03': mo('2026-03', 100e6, 60e6) };
    expect(compute(cfgP({ lossYears: 2, lossLimit: 100 }), months, '2026-03').cur.tax).toBeCloseTo(0, 6);
    expect(compute(cfgP({ lossYears: 1, lossLimit: 100 }), months, '2026-03').cur.tax).toBeCloseTo(6e6, 6);
  });
  it('использованный убыток не учитывается повторно в следующем году', () => {
    const months = { '2025-06': mo('2025-06', 0, 30e6), '2026-03': mo('2026-03', 100e6, 60e6), '2027-03': mo('2027-03', 100e6, 60e6) };
    const cfg = cfgP({ lossLimit: 100 });
    expect(compute(cfg, months, '2026-03').cur.tax).toBeCloseTo(1.5e6, 6); // (40 − 30) × 15%
    expect(compute(cfg, months, '2027-03').cur.tax).toBeCloseTo(6e6, 6); // убыток уже израсходован
  });
  it('compareTax показывает остаток убытка прошлых лет', async () => {
    const { compareTax } = await import('../src/calc.js');
    const months = { '2025-06': mo('2025-06', 0, 100e6), '2026-03': mo('2026-03', 100e6, 60e6) };
    const cfg = cfgP({ lossLimit: 50 }), C = compute(cfg, months, '2026-03');
    expect(compareTax(cfg, C.rows, '2026-03').loss).toBeCloseTo(100e6, 0);
  });
});

describe('общий режим клиники: НДС 12% и налог на прибыль 0% / 15%', () => {
  const cfgG = (extra) => cfgOf({ tax: { regime: 'general', ...(extra || {}) } });
  const incOp = (d, a, c = 'usl') => ({ id: d + c + a, d, t: 'income', c, a, acct: 'cash', n: '' });
  const expOp = (d, a, vat, c = 'supplies') => ({ id: d + c + a + vat, d, t: 'expense', c, a, acct: 'bank', n: '', vat });
  it('цены с НДС: выручка без НДС, НДС начисляется как обязательство', () => {
    const C = compute(cfgG(), { '2026-05': { ops: [incOp('2026-05-02', 11200000)] } }, '2026-05');
    expect(C.cur.vatOut).toBeCloseTo(1200000, 6);
    expect(C.cur.rev).toBeCloseTo(10000000, 6);
    expect(C.cur.vat).toBeCloseTo(1200000, 6);
    expect(C.B.pay.vat).toBeCloseTo(1200000, 6);
    expect(C.B.cash).toBe(11200000);
  });
  it('входной НДС со счёта-фактуры уменьшает НДС к уплате и расходы, без счёта-фактуры не зачитывается', () => {
    const ops = [incOp('2026-05-02', 11200000), expOp('2026-05-03', 1120000, true), expOp('2026-05-04', 560000, false)];
    const C = compute(cfgG(), { '2026-05': { ops } }, '2026-05');
    expect(C.cur.vatIn).toBeCloseTo(120000, 6);
    expect(C.cur.vat).toBeCloseTo(1080000, 6);
    expect(C.cur.opexSum).toBeCloseTo(1000000 + 560000, 6);
  });
  it('оплата НДС (pay_vat) гасит обязательство и не является расходом', () => {
    const ops = [incOp('2026-05-02', 11200000), { id: 'p', d: '2026-06-10', t: 'expense', c: 'pay_vat', a: 1200000, acct: 'bank', n: '' }];
    const C = compute(cfgG(), { '2026-05': { ops: [ops[0]] }, '2026-06': { ops: [ops[1]] } }, '2026-06');
    expect(C.B.pay.vat).toBeCloseTo(0, 6);
    expect(C.cur.opexSum).toBe(0);
  });
  it('налог на прибыль 0%, если не менее 90% дохода — медуслуги; иначе 15% со всей прибыли года', () => {
    const base = [incOp('2026-03-05', 112000000), expOp('2026-03-06', 20000000, false)];
    const ok = compute(cfgG(), { '2026-03': { ops: base } }, '2026-03');
    expect(ok.cur.tax).toBe(0);
    const bad = compute(cfgG(), { '2026-03': { ops: [...base, incOp('2026-03-07', 22400000, 'other_inc')] } }, '2026-03'); // 16,7% не от медуслуг
    expect(bad.cur.tax).toBeGreaterThan(0);
    expect(bad.cur.tax).toBeCloseTo(bad.cur.preTax * 0.15, 6);
    expect(generalTax(cfgG(), ok.rows, '2026-03').zero).toBe(true);
    expect(generalTax(cfgG(), bad.rows, '2026-03').zero).toBe(false);
  });
  it('убыток переносится без ограничений по сроку и доле', () => {
    const cfg = cfgG({ social: false });
    const months = { '2015-06': { ops: [expOp('2015-06-05', 100000000, false)] }, '2026-03': { ops: [incOp('2026-03-05', 112000000), expOp('2026-03-06', 20000000, false)] } };
    // прибыль 2026: 100 − 20 = 80 млн, убыток 2015 (100 млн) гасит всё
    expect(compute(cfg, months, '2026-03').cur.tax).toBeCloseTo(0, 6);
  });
  it('баланс сходится на случайных сценариях общего режима', () => {
    const rng = (seed) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let s = 1; s <= 150; s++) {
      const R = rng(s), pickv = () => R() < 0.5;
      const months = {};
      for (let k = 0; k < 8; k++) {
        const m = addM('2026-01', k), ops = [];
        for (let j = 0, n = Math.floor(R() * 8); j < n; j++) {
          const inc = R() < 0.5, amt = Math.round(R() * 2e7) + 1;
          ops.push(inc ? incOp(m + '-10', amt, R() < 0.8 ? 'usl' : 'other_inc') : expOp(m + '-11', amt, pickv(), ['supplies', 'util', 'equip', 'repair'][Math.floor(R() * 4)]));
        }
        if (R() < 0.3) ops.push({ id: 'pv' + m, d: m + '-15', t: 'expense', c: 'pay_vat', a: Math.round(R() * 3e6), acct: 'bank', n: '' });
        months[m] = { ops };
      }
      for (let k = 0; k < 8; k++) { const C = compute(cfgG(), months, addM('2026-01', k)); expect(Math.abs(balance(C.B).check)).toBeLessThan(1e-3); }
    }
  });
});
