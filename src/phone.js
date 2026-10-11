// Телефон всегда в виде +998 12 123 12 12: +998 ставится сам, цифры группируются при наборе.
export function localDigits(s) {
  let d = String(s || '').replace(/\D/g, '');
  if (d.startsWith('998')) d = d.slice(3);
  return d.slice(0, 9);
}
// Для поля ввода. deleting = пользователь стирает (иначе «+998 » вернулся бы навсегда).
export function fmtPhoneInput(raw, deleting) {
  const d = localDigits(raw);
  if (!d) return deleting || !raw ? '' : '+998 ';
  const g = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return '+998 ' + g.join(' ');
}
// Для показа в списках; чужой формат оставляем как есть
export function fmtPhone(p) {
  const s = String(p || '');
  return localDigits(s).length === 9 ? fmtPhoneInput(s, false) : s;
}
// Что хранить: +998901234567 или пусто, если номер не введён
export function cleanPhone(p) { const d = localDigits(p); return d ? '+998' + d : ''; }
