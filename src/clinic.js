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
const SET_COLS = 'address,phones,map_url,lat,lng,slogan_ru,slogan_uz,about_ru,about_uz,perks_ru,perks_uz';
export async function loadInfo() {
  const a = await sb.from('clinic_settings').select(SET_COLS).eq('id', 1).single(); if (a.error) throw a.error;
  const b = await sb.from('doctors').select('id,name,specialty_ru,specialty_uz,bio_ru,bio_uz').order('sort'); if (b.error) throw b.error;
  return { s: a.data, d: b.data };
}
export async function saveInfo(s, docs) {
  const a = await sb.from('clinic_settings').update(s).eq('id', 1); if (a.error) throw a.error;
  for (const d of docs) {
    const r = await sb.from('doctors').update({ specialty_ru: d.specialty_ru, specialty_uz: d.specialty_uz, bio_ru: d.bio_ru, bio_uz: d.bio_uz }).eq('id', d.id); if (r.error) throw r.error;
  }
}
