// Хранилище на IndexedDB. Состав данных как в прототипе:
//   config / ключ "main"      -> документ настроек (cfg)
//   months / ключ "ГГГГ-ММ"   -> документ месяца { ops: [...], payroll }
// Для синхронизации рядом лежит служебное хранилище meta: путь документа -> { updatedAt, dirty, deleted }.
const DB_NAME = 'uzi-uchet';
const DB_VERSION = 2;
const APP_ID = 'uzi-uchet';
const BACKUP_VERSION = 1;
const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;
const CFG_PATH = 'config/main';

let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB недоступна')); return; }
    const rq = indexedDB.open(DB_NAME, DB_VERSION);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains('config')) db.createObjectStore('config');
      if (!db.objectStoreNames.contains('months')) db.createObjectStore('months');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
    rq.onblocked = () => reject(new Error('База заблокирована другой вкладкой'));
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Транзакция отменена'));
  });
}

function req(r) {
  return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}

// Записи идут строго по очереди, чтобы быстрые правки не перегоняли друг друга.
let chain = Promise.resolve();
function enqueue(fn) {
  const p = chain.then(fn);
  chain = p.catch(() => {});
  return p;
}

const clone = (x) => JSON.parse(JSON.stringify(x));
let lastStamp = 0;
function stamp() { lastStamp = Math.max(Date.now(), lastStamp + 1); return lastStamp; }

export async function init() {
  await open();
}

export async function loadAll() {
  const db = await open();
  const tx = db.transaction(['config', 'months'], 'readonly');
  const [cfg, keys, vals] = await Promise.all([
    req(tx.objectStore('config').get('main')),
    req(tx.objectStore('months').getAllKeys()),
    req(tx.objectStore('months').getAll()),
  ]);
  const months = {};
  keys.forEach((k, i) => { const x = vals[i] || {}; if (!x.ops) x.ops = []; months[k] = x; });
  return { cfg: cfg || null, months };
}

export function saveConfig(cfg) {
  const body = clone(cfg);
  return enqueue(async () => {
    const db = await open();
    const tx = db.transaction(['config', 'meta'], 'readwrite');
    tx.objectStore('config').put(body, 'main');
    tx.objectStore('meta').put({ updatedAt: stamp(), dirty: true, deleted: false }, CFG_PATH);
    await done(tx);
  });
}

export function saveMonth(ym, doc) {
  const body = clone(doc);
  return enqueue(async () => {
    const db = await open();
    const tx = db.transaction(['months', 'meta'], 'readwrite');
    tx.objectStore('months').put(body, ym);
    tx.objectStore('meta').put({ updatedAt: stamp(), dirty: true, deleted: false }, 'months/' + ym);
    await done(tx);
  });
}

/* ---------- резервная копия ---------- */

export function makeBackup(cfg, months) {
  return {
    app: APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    config: cfg,
    months,
  };
}

// Возвращает { cfg, months } или бросает Error с понятным текстом.
export function parseBackup(text) {
  let o;
  try { o = JSON.parse(text); } catch (e) { throw new Error('Файл не похож на резервную копию: это не JSON.'); }
  if (!o || o.app !== APP_ID) throw new Error('Это не копия «Учёта УЗИ-центра».');
  if (!Number.isInteger(o.version) || o.version > BACKUP_VERSION) throw new Error('Копия сделана более новой версией приложения.');
  if (!o.config || typeof o.config !== 'object' || Array.isArray(o.config)) throw new Error('В копии нет настроек.');
  if (!o.months || typeof o.months !== 'object' || Array.isArray(o.months)) throw new Error('В копии нет данных по месяцам.');
  const months = {};
  for (const k of Object.keys(o.months)) {
    if (!MONTH_KEY.test(k)) throw new Error('В копии неверный ключ месяца: ' + k);
    const m = o.months[k];
    if (!m || typeof m !== 'object' || (m.ops != null && !Array.isArray(m.ops))) throw new Error('Повреждены данные за ' + k);
    months[k] = m;
  }
  return { cfg: o.config, months };
}

// Полностью заменяет данные в базе содержимым копии, одной транзакцией.
// Месяцы, которых нет в копии, помечаются удалёнными, чтобы удаление дошло до других устройств.
export function replaceAll(cfg, months) {
  const c = clone(cfg);
  const m = clone(months);
  return enqueue(async () => {
    const db = await open();
    const tx = db.transaction(['config', 'months', 'meta'], 'readwrite');
    const cs = tx.objectStore('config'), ms = tx.objectStore('months'), mt = tx.objectStore('meta');
    const old = await req(ms.getAllKeys());
    cs.clear(); ms.clear();
    cs.put(c, 'main');
    mt.put({ updatedAt: stamp(), dirty: true, deleted: false }, CFG_PATH);
    Object.keys(m).forEach((k) => { ms.put(m[k], k); mt.put({ updatedAt: stamp(), dirty: true, deleted: false }, 'months/' + k); });
    old.filter((k) => !(k in m)).forEach((k) => mt.put({ updatedAt: stamp(), dirty: true, deleted: true }, 'months/' + k));
    await done(tx);
  });
}

/* ---------- синхронизация ---------- */

function docStore(path) { return path === CFG_PATH ? 'config' : 'months'; }
function docKey(path) { return path === CFG_PATH ? 'main' : path.slice(7); }

// Всё, что изменено на этом устройстве и ещё не отправлено.
export async function getDirty() {
  const db = await open();
  const tx = db.transaction(['config', 'months', 'meta'], 'readonly');
  const mt = tx.objectStore('meta');
  const [keys, vals] = await Promise.all([req(mt.getAllKeys()), req(mt.getAll())]);
  const out = [];
  for (let i = 0; i < keys.length; i++) {
    const path = keys[i], meta = vals[i];
    if (path.startsWith('_') || !meta || !meta.dirty) continue;
    const data = meta.deleted ? null : await req(tx.objectStore(docStore(path)).get(docKey(path)));
    out.push({ path, data: data == null ? null : clone(data), deleted: !!meta.deleted || data == null, updatedAt: meta.updatedAt });
  }
  return out;
}

// Помечает отправленное чистым, только если документ не менялся с момента отправки.
export function markClean(items) {
  return enqueue(async () => {
    const db = await open();
    const tx = db.transaction('meta', 'readwrite');
    const mt = tx.objectStore('meta');
    for (const it of items) {
      const cur = await req(mt.get(it.path));
      if (cur && cur.updatedAt === it.updatedAt) mt.put({ ...cur, dirty: false }, it.path);
    }
    await done(tx);
  });
}

// Применяет строки с сервера: побеждает более поздняя правка. Возвращает true, если что-то изменилось.
export function applyRemote(rows) {
  return enqueue(async () => {
    const db = await open();
    const tx = db.transaction(['config', 'months', 'meta'], 'readwrite');
    const mt = tx.objectStore('meta');
    let changed = false;
    for (const r of rows) {
      const cur = await req(mt.get(r.path));
      if (cur && cur.updatedAt >= r.updatedAt) continue;
      const store = tx.objectStore(docStore(r.path)), key = docKey(r.path);
      if (r.deleted) store.delete(key); else store.put(clone(r.data), key);
      mt.put({ updatedAt: r.updatedAt, dirty: false, deleted: !!r.deleted }, r.path);
      changed = true;
    }
    await done(tx);
    return changed;
  });
}

export async function getMeta(key) {
  const db = await open();
  return req(db.transaction('meta', 'readonly').objectStore('meta').get(key));
}

export function setMeta(key, value) {
  return enqueue(async () => {
    const db = await open();
    const tx = db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put(value, key);
    await done(tx);
  });
}

// Помечает все локальные документы как неотправленные (первый вход на устройстве, где уже есть данные).
export function markAllDirty() {
  return enqueue(async () => {
    const db = await open();
    const tx = db.transaction(['config', 'months', 'meta'], 'readwrite');
    const mt = tx.objectStore('meta');
    const keys = await req(tx.objectStore('months').getAllKeys());
    const hasCfg = await req(tx.objectStore('config').get('main'));
    const paths = keys.map((k) => 'months/' + k).concat(hasCfg ? [CFG_PATH] : []);
    for (const p of paths) {
      const cur = await req(mt.get(p));
      if (!cur) mt.put({ updatedAt: stamp(), dirty: true, deleted: false }, p);
    }
    await done(tx);
  });
}

export function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
