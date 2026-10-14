import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { UZ_DICT, t, setLang, getLang } from '../src/i18n.js';

// Все русские строки интерфейса: литералы в одинарных кавычках без разметки.
const files = ['src/views.js', 'src/main.js', 'src/sync.js', 'src/storage.js', 'src/datepicker.js', 'src/ui.js', 'src/clinic.js'];
const strings = new Set();
for (const f of files) {
  const src = readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\/\*)/.test(l)).join('\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  for (const m of src.matchAll(/'((?:[^'\\n]|\.)*)'/g)) {
    const s = m[1];
    if (/[А-Яа-яЁё]/.test(s) && !s.includes('<') && !s.includes('"')) strings.add(s);
  }
}
// Не показываются пользователю или оставлены намеренно.
const SKIP = new Set(['Митти юрак', 'Митти юрак: ', '«Митти юрак»: ', 'Русский', 'Ўзбекча', 'Митти юрак: ҳисоб', 'Митти юрак: учёт', 'РУ', 'ЎЗ', '. Нажмите, чтобы сменить', 'База заблокирована другой вкладкой', 'Транзакция отменена', 'Это не копия «Учёта УЗИ-центра».', 'тёмная', 'светлая', 'как в системе']);

describe('перевод на узбекский (кириллица)', () => {
  it('у каждой русской строки интерфейса есть перевод', () => {
    const missing = [...strings].filter((s) => !SKIP.has(s) && !(s in UZ_DICT) && !/^(Тема: |Заменить|\s*\+)/.test(s));
    expect(missing).toEqual([]);
  });
  it('в переводах нет латиницы (кроме сайта, JSON и единиц) и пустых значений', () => {
    for (const [k, v] of Object.entries(UZ_DICT)) {
      expect(v.trim(), k).not.toBe('');
      const lat = v.replace(/\{\w+\}|my\.soliq\.uz|JSON|Instagram|Telegram/g, '').match(/[A-Za-z]+/g);
      expect(lat, k + ' → ' + v).toBeNull();
    }
  });
  it('плейсхолдеры в переводе те же, что в русском ключе', () => {
    for (const [k, v] of Object.entries(UZ_DICT)) {
      const a = (k.match(/\{\w+\}/g) || []).sort().join();
      const b = (v.match(/\{\w+\}/g) || []).sort().join();
      expect(b, k).toBe(a);
    }
  });
  it('t() подставляет значения и переключает язык', () => {
    const prev = getLang();
    setLang('uz');
    expect(t('Операции за {m}', { m: 'октябр 2026' })).toBe('Октябр 2026 учун амаллар');
    setLang('ru');
    expect(t('Операции за {m}', { m: 'октябрь 2026' })).toBe('Операции за октябрь 2026');
    setLang(prev);
  });
});
