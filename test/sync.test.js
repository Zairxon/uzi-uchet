import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';

// Общий «сервер»: таблица docs с серверным временем synced_at.
let server, tick;
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'a@b.c' } } } }),
      onAuthStateChange: () => {},
    },
    from: () => {
      const q = { filters: [] };
      const b = {
        select: () => b,
        order: () => b,
        limit: (n) => { q.n = n; return b; },
        gt: (_c, v) => { q.gt = v; return b; },
        then: (res) => {
          const rows = server.filter((r) => !q.gt || r.synced_at > q.gt).sort((a, b2) => (a.synced_at < b2.synced_at ? -1 : 1)).slice(0, q.n);
          return Promise.resolve({ data: JSON.parse(JSON.stringify(rows)), error: null }).then(res);
        },
        upsert: async (rows) => {
          rows.forEach((r) => {
            const i = server.findIndex((x) => x.path === r.path);
            const row = { ...JSON.parse(JSON.stringify(r)), synced_at: new Date(Date.UTC(2026, 0, 1, 0, 0, ++tick)).toISOString() };
            if (i >= 0) server[i] = row; else server.push(row);
          });
          return { error: null };
        },
      };
      return b;
    },
  }),
}));

// Новое «устройство»: чистая IndexedDB и свежие экземпляры модулей.
async function device() {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  const store = await import('../src/storage.js');
  const sync = await import('../src/sync.js');
  await store.init();
  return { store, sync };
}

beforeEach(() => { server = []; tick = 0; });

describe('синхронизация двух устройств', () => {
  it('данные первого устройства попадают на второе', async () => {
    const A = await device();
    await A.store.saveConfig({ tax: { ndfl: 12 }, staff: [] });
    await A.store.saveMonth('2026-05', { ops: [{ id: 'a', a: 5 }] });
    await A.sync.syncNow();
    expect(server.map((r) => r.path).sort()).toEqual(['config/main', 'months/2026-05']);

    const B = await device();
    const r = await B.sync.syncNow();
    expect(r.changed).toBe(true);
    const got = await B.store.loadAll();
    expect(got.cfg.tax.ndfl).toBe(12);
    expect(got.months['2026-05'].ops[0].a).toBe(5);
  });

  it('правка на втором устройстве доходит до первого', async () => {
    const A = await device();
    await A.store.saveMonth('2026-05', { ops: [{ id: 'a', a: 5 }] });
    await A.sync.syncNow();
    const aIdb = globalThis.indexedDB;

    const B = await device();
    await B.sync.syncNow();
    await new Promise((r) => setTimeout(r, 5));
    await B.store.saveMonth('2026-05', { ops: [{ id: 'a', a: 5 }, { id: 'b', a: 7 }] });
    await B.sync.syncNow();
    const bIdb = globalThis.indexedDB;

    globalThis.indexedDB = aIdb;
    // возвращаемся на устройство A: его модули привязаны к своей базе через indexedDB при открытии
    vi.resetModules();
    const store = await import('../src/storage.js');
    const sync = await import('../src/sync.js');
    await store.init();
    const r = await sync.syncNow();
    expect(r.changed).toBe(true);
    expect((await store.loadAll()).months['2026-05'].ops).toHaveLength(2);
    globalThis.indexedDB = bIdb;
  });

  it('более поздняя правка побеждает, более ранняя не затирает', async () => {
    const A = await device();
    await A.store.saveMonth('2026-05', { ops: [{ id: 'new', a: 1 }] });
    await A.sync.syncNow();
    // сервер уже хранит более новую запись для другого пути; старая локальная правка её не затрёт
    server.push({ path: 'months/2026-06', data: { ops: [{ id: 'srv', a: 9 }] }, deleted: false, updated_at: new Date(Date.now() + 1000).toISOString(), synced_at: '2026-01-02T00:00:00.000Z' });
    await A.sync.syncNow();
    const got = await A.store.loadAll();
    expect(got.months['2026-06'].ops[0].id).toBe('srv');
    expect(got.months['2026-05'].ops[0].id).toBe('new');
  });

  it('после синхронизации ничего не остаётся неотправленным', async () => {
    const A = await device();
    await A.store.saveMonth('2026-05', { ops: [] });
    expect((await A.store.getDirty()).length).toBe(1);
    await A.sync.syncNow();
    expect((await A.store.getDirty()).length).toBe(0);
  });

  it('загрузка из копии удаляет лишние месяцы и на втором устройстве', async () => {
    const A = await device();
    await A.store.saveConfig({ x: 1 });
    await A.store.saveMonth('2026-04', { ops: [{ id: 'old', a: 1 }] });
    await A.store.saveMonth('2026-05', { ops: [{ id: 'keep', a: 2 }] });
    await A.sync.syncNow();
    const aIdb = globalThis.indexedDB;

    const B = await device();
    await B.sync.syncNow();
    await new Promise((r) => setTimeout(r, 5));
    await B.store.replaceAll({ x: 2 }, { '2026-05': { ops: [{ id: 'keep', a: 2 }] } });
    await B.sync.syncNow();
    expect(server.find((r) => r.path === 'months/2026-04').deleted).toBe(true);

    globalThis.indexedDB = aIdb;
    vi.resetModules();
    const store = await import('../src/storage.js');
    const sync = await import('../src/sync.js');
    await store.init();
    await sync.syncNow();
    const got = await store.loadAll();
    expect(got.months['2026-04']).toBeUndefined();
    expect(got.cfg.x).toBe(2);
  });
});
