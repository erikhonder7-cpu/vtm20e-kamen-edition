// module/data/text-split.mjs
// Тексты справочника Дисциплин и ритуалов — отдельным файлом (tools/build_data.py: data/<имя>.json — оглавление:
// имена, уровни, броски; data/<имя>-text.json — html и разделы ритуалов). Оглавление нужно сразу (кланы, лист, мастер
// создания), тексты — только когда их показывают, поэтому мир при старте не ждёт ~2,5 млн знаков описаний.
// Раскладка id совпадает с split_texts() в tools/build_data.py; без браузера — им пользуются build_packs.mjs и check.mjs.

/** Поля с текстом, которые лежат в <имя>-text.json. */
export const TEXT_FIELDS = ["html", "parts"];

/** Каждая запись с текстом и её id: «ключ|rN» — правило, «ключ|pN» — сила, «ключ|PN» и «ключ|PN|M» — путь и его сила,
 *  «ключ|N» — ритуал. */
export function eachTextual(name, data, fn) {
  for (const [key, d] of Object.entries(data ?? {})) {
    (d.rules ?? []).forEach((r, i) => fn(`${key}|r${i}`, r));
    if (name === "disciplines") {
      (d.powers ?? []).forEach((p, i) => fn(`${key}|p${i}`, p));
      (d.paths ?? []).forEach((pa, j) => {
        fn(`${key}|P${j}`, pa);
        (pa.powers ?? []).forEach((p, i) => fn(`${key}|P${j}|${i}`, p));
      });
    } else (d.rituals ?? []).forEach((r, i) => fn(`${key}|${i}`, r));
  }
}

/** Вернуть тексты в оглавление (на месте). */
export function mergeTexts(name, data, texts) {
  eachTextual(name, data, (id, o) => Object.assign(o, texts?.[id] ?? {}));
  return data;
}
