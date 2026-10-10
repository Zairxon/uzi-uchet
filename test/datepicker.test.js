import { describe, it, expect } from 'vitest';
import { fmtDate, parseDate, maskDate } from '../src/datepicker.js';

describe('поле даты', () => {
  it('показывает ГГГГ-ММ-ДД как дд.мм.гггг', () => {
    expect(fmtDate('2026-10-02')).toBe('02.10.2026');
    expect(fmtDate('')).toBe('');
    expect(fmtDate(undefined)).toBe('');
  });
  it('разбирает только настоящие даты с годом 2000–2100', () => {
    expect(parseDate('02.10.2026')).toBe('2026-10-02');
    expect(parseDate('29.02.2028')).toBe('2028-02-29');
    for (const bad of ['', '2.10.2026', '31.02.2026', '29.02.2027', '32.01.2026', '10.13.2026', '01.01.1999', '01.01.2101', '01.01.0002', 'abc']) {
      expect(parseDate(bad), bad).toBe('');
    }
  });
  it('маска расставляет точки при наборе цифр', () => {
    expect(maskDate('0')).toBe('0');
    expect(maskDate('021')).toBe('02.1');
    expect(maskDate('02102')).toBe('02.10.2');
    expect(maskDate('02102026')).toBe('02.10.2026');
    expect(maskDate('02.10.2026789')).toBe('02.10.2026');
    expect(maskDate('02.')).toBe('02');
  });
});
