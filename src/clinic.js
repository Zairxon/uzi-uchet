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
