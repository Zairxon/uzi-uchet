// Узбекская кириллица → латиница (алфавит 1995 года). Тексты интерфейса хранятся в кириллице,
// латинская версия получается автоматически. Теги <...> и подстановки {...} не трогаем.
const MAP = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x',
  ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: 'ʼ', ь: '', ы: 'i', э: 'e', ю: 'yu', я: 'ya', ў: 'oʻ', қ: 'q', ғ: 'gʻ', ҳ: 'h',
};
const VOWELS = 'аеёиоуўэюяъь';
const isLetter = (c) => !!c && c.toLowerCase() !== c.toUpperCase();

function word(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i], low = ch.toLowerCase();
    if (!(low in MAP)) { out += ch; continue; }
    const prev = i ? s[i - 1].toLowerCase() : '';
    let r = MAP[low];
    if (low === 'е' && (!isLetter(prev) || VOWELS.includes(prev))) r = 'ye'; // «ел», «аер»
    if (ch !== low && r) { // заглавная: «Ш» → «Sh», но в слове из заглавных → «SH»
      const next = s[i + 1], capsWord = isLetter(next) && next === next.toUpperCase() && (i > 0 ? isLetter(s[i - 1]) : true);
      r = capsWord ? r.toUpperCase() : r[0].toUpperCase() + r.slice(1);
    }
    out += r;
  }
  return out;
}

export function cyr2lat(text) {
  return String(text == null ? '' : text).split(/(<[^>]*>|\{\w+\})/).map((part, i) => (i % 2 ? part : word(part))).join('');
}
