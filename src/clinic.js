// Данные клиники из приложения «Ресепшен»: доля врачей от оплаченных приёмов.
// Проценты хранятся в таблице doctor_pay, которую видит только владелец.
import { sb } from './sync.js';

export async function role() {
  const a = await sb.rpc('my_role'); if (a.error) throw a.error;
  if (a.data) return a.data;
  const b = await sb.rpc('claim_owner'); if (b.error) throw b.error; // первый вход владельца
  return b.data || null;
}
export async function share(from, to) {
  const r = await sb.rpc('doctor_share', { p_from: from, p_to: to }); if (r.error) throw r.error;
  return r.data;
}
export async function setPercent(doctorId, percent) {
  const r = await sb.from('doctor_pay').upsert({ doctor_id: doctorId, percent }, { onConflict: 'doctor_id' }); if (r.error) throw r.error;
}
export function monthRange(ym) {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
  return { from: ym + '-01', to: ym + '-' + String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0') };
}

// Данные клиники для «Навбата» и бота: адрес, телефоны, карта, слоган, описание, врачи
const SET_COLS = 'address,landmark_ru,landmark_uz,phones,map_url,lat,lng,slogan_ru,slogan_uz,about_ru,about_uz,perks_ru,perks_uz';
export async function loadInfo() {
  const a = await sb.from('clinic_settings').select(SET_COLS).eq('id', 1).single(); if (a.error) throw a.error;
  const b = await sb.from('doctors').select('id,name,specialty_ru,specialty_uz,bio_ru,bio_uz').order('sort'); if (b.error) throw b.error;
  return { s: a.data, d: b.data };
}
export async function saveInfo(s, docs) {
  const a = await sb.from('clinic_settings').update(s).eq('id', 1); if (a.error) throw a.error;
  for (const d of []) { // данные врачей для клиентов больше не показываются
    const r = await sb.from('doctors').update({ specialty_ru: d.specialty_ru, specialty_uz: d.specialty_uz, bio_ru: d.bio_ru, bio_uz: d.bio_uz }).eq('id', d.id); if (r.error) throw r.error;
  }
}

// Предоплата за онлайн-бронь: карта, время удержания, услуги очереди и код для сотрудников в Telegram
export async function loadPrepay() {
  const a = await sb.from('clinic_settings').select('card_number,card_holder,receipt_contact,hold_minutes').eq('id', 1).single(); if (a.error) throw a.error;
  const b = await sb.from('booking_services').select('id,name_ru,name_uz,price,percent,fixed,active,sort').order('sort').order('name_ru'); if (b.error) throw b.error;
  const c = await sb.rpc('receipt_setup'); // только владелец
  return { s: a.data, svc: b.data, setup: c.error ? null : c.data };
}
export async function savePrepay(s, svcs, removed) {
  const a = await sb.from('clinic_settings').update(s).eq('id', 1); if (a.error) throw a.error;
  for (const id of removed) { const d = await sb.from('booking_services').delete().eq('id', id); if (d.error) throw d.error; }
  if (svcs.length) { const u = await sb.from('booking_services').upsert(svcs, { onConflict: 'id' }); if (u.error) throw u.error; }
}

// Поступления из «Ресепшена»: по дням и способам оплаты (для учёта) и список пациентов дня (для отчёта)
export async function incomeByDay(from, to) { const r = await sb.rpc('income_by_day', { p_from: from, p_to: to }); if (r.error) throw r.error; return r.data || []; }
export async function dayReceipts(day) { const r = await sb.rpc('day_receipts', { p_date: day }); if (r.error) throw r.error; return r.data || []; }

// Откуда пришли клиенты за период (по меткам рекламных ссылок, звонкам и живой очереди)
export async function sourceStats(from, to) { const r = await sb.rpc('source_stats', { p_from: from, p_to: to }); if (r.error) throw r.error; return r.data || []; }

// Очистка данных клиники на сервере (только владелец): записи, клиенты, чеки, состояния бота
export async function purgeData(what) { const r = await sb.functions.invoke('purge-data', { body: { what } }); if (r.error) { let m = r.error.message; try { const j = await r.error.context.json(); m = j.message || j.error || m; } catch (e) { /* без подробностей */ } throw new Error(m); } return r.data; }

// Воронка записи на сайте: сколько клиентов дошло до каждого шага и где остановилось (только владелец)
export async function funnelStats(from, to) { const r = await sb.rpc('funnel_stats', { p_from: from, p_to: to }); if (r.error) throw r.error; return r.data || {}; }
