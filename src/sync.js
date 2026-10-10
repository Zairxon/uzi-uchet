// Синхронизация между устройствами через Supabase (таблица docs, у каждого пользователя только свои строки).
// Локальная копия в IndexedDB остаётся главной: приложение работает без сети, а при появлении сети
// отправляет изменения и забирает чужие. Для каждого документа побеждает более поздняя правка.
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import * as store from './storage.js';

export const enabled = !!(SUPABASE_URL && SUPABASE_KEY);
const sb = enabled ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }) : null;

const PAGE = 500;
let running = null, again = false;

export async function getUser() {
  if (!sb) return null;
  try { const { data } = await sb.auth.getSession(); return data.session ? data.session.user : null; } catch (e) { return null; }
}

export function onAuth(cb) {
  if (!sb) return;
  sb.auth.onAuthStateChange((_ev, session) => cb(session ? session.user : null));
}

function msg(e) {
  const t = String((e && e.message) || e || '');
  if (/Invalid login credentials/i.test(t)) return 'Неверная почта или пароль.';
  if (/Email not confirmed/i.test(t)) return 'Почта не подтверждена: откройте письмо от сервиса и перейдите по ссылке.';
  if (/already registered|already been registered/i.test(t)) return 'Такая почта уже зарегистрирована. Нажмите «Войти».';
  if (/Password should be/i.test(t)) return 'Пароль слишком простой: нужно не меньше 8 символов.';
  if (/rate limit/i.test(t)) return 'Слишком много попыток. Подождите немного.';
  if (/fetch|network|Failed/i.test(t)) return 'Нет связи с сервером.';
  return t || 'Ошибка';
}

export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(msg(error));
}

// Возвращает true, если вход выполнен сразу, false, если нужно подтвердить почту.
export async function signUp(email, password) {
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw new Error(msg(error));
  return !!data.session;
}

export async function signOut() {
  await sb.auth.signOut();
  await store.setMeta('_lastPull', null);
}

export function describeError(e) { return msg(e); }

function toRow(it) {
  return { path: it.path, data: it.deleted ? null : it.data, deleted: it.deleted, updated_at: new Date(it.updatedAt).toISOString() };
}

async function runOnce() {
  const user = await getUser();
  if (!user) return { changed: false, skipped: true };
  const owner = await store.getMeta('_owner');
  if (owner && owner !== user.id) { // на устройстве зашёл другой пользователь: начинаем с чистого листа синхронизации
    await store.setMeta('_lastPull', null);
  }
  await store.setMeta('_owner', user.id);

  // 1. забрать чужие изменения
  let since = await store.getMeta('_lastPull');
  let changed = false, newest = since;
  for (;;) {
    let q = sb.from('docs').select('path,data,deleted,updated_at,synced_at').order('synced_at', { ascending: true }).limit(PAGE);
    if (since) q = q.gt('synced_at', since);
    const { data, error } = await q;
    if (error) throw error;
    if (!data.length) break;
    const rows = data.map((r) => ({ path: r.path, data: r.data, deleted: r.deleted, updatedAt: Date.parse(r.updated_at) }));
    if (await store.applyRemote(rows)) changed = true;
    since = newest = data[data.length - 1].synced_at;
    if (data.length < PAGE) break;
  }
  if (newest) await store.setMeta('_lastPull', newest);

  // 2. локальные документы, о которых сервер ещё не знает (данные, набранные до входа)
  await store.markAllDirty();

  // 3. отправить свои изменения
  const dirty = await store.getDirty();
  for (let i = 0; i < dirty.length; i += 100) {
    const part = dirty.slice(i, i + 100);
    const { error } = await sb.from('docs').upsert(part.map(toRow), { onConflict: 'user_id,path' });
    if (error) throw error;
    await store.markClean(part);
  }
  return { changed, pushed: dirty.length };
}

// Один запуск за раз; если во время работы попросили ещё раз, повторяет после.
export function syncNow() {
  if (!enabled) return Promise.resolve({ changed: false, skipped: true });
  if (running) { again = true; return running; }
  running = runOnce().finally(() => { running = null; });
  return running.then((r) => {
    if (again) { again = false; return syncNow().then((r2) => ({ changed: r.changed || r2.changed, pushed: (r.pushed || 0) + (r2.pushed || 0) })); }
    return r;
  });
}
