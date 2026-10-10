import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { init, loadAll, saveConfig, saveMonth, replaceAll, makeBackup, parseBackup } from '../src/storage.js';

describe('storage: IndexedDB', () => {
  it('пустая база отдаёт null и пустые месяцы', async () => {
    await init();
    expect(await loadAll()).toEqual({ cfg: null, months: {} });
  });
  it('сохраняет и читает настройки и месяцы', async () => {
    await saveConfig({ tax: { ndfl: 12 }, staff: [] });
    await saveMonth('2026-05', { ops: [{ id: 'a', a: 5 }], payroll: null });
    await saveMonth('2026-06', { ops: [] });
    const got = await loadAll();
    expect(got.cfg.tax.ndfl).toBe(12);
    expect(Object.keys(got.months).sort()).toEqual(['2026-05', '2026-06']);
    expect(got.months['2026-05'].ops[0].a).toBe(5);
  });
  it('копия: выгрузка и загрузка возвращают те же данные, старое стирается', async () => {
    const { cfg, months } = await loadAll();
    const text = JSON.stringify(makeBackup(cfg, months));
    await saveMonth('2026-09', { ops: [{ id: 'z', a: 1 }] });
    const b = parseBackup(text);
    await replaceAll(b.cfg, b.months);
    const after = await loadAll();
    expect(after.cfg).toEqual(cfg);
    expect(after.months).toEqual(months);
    expect(after.months['2026-09']).toBeUndefined();
  });
});

describe('parseBackup: проверка файла', () => {
  const ok = { app: 'uzi-uchet', version: 1, config: {}, months: { '2026-01': { ops: [] } } };
  it('принимает корректную копию', () => {
    expect(parseBackup(JSON.stringify(ok)).months['2026-01']).toBeTruthy();
  });
  it.each([
    ['не JSON', 'abc'],
    ['чужой файл', JSON.stringify({ ...ok, app: 'x' })],
    ['версия новее', JSON.stringify({ ...ok, version: 99 })],
    ['нет настроек', JSON.stringify({ ...ok, config: null })],
    ['плохой ключ месяца', JSON.stringify({ ...ok, months: { foo: { ops: [] } } })],
    ['месяц 13', JSON.stringify({ ...ok, months: { '2026-13': { ops: [] } } })],
    ['ops не массив', JSON.stringify({ ...ok, months: { '2026-01': { ops: 5 } } })],
  ])('отклоняет: %s', (_, text) => {
    expect(() => parseBackup(text)).toThrow();
  });
});
