// module/apps/homerules.mjs
// Хоумрулы, которые выключаются в мире: «Богатыри» (настройка bogatyri, data/bogatyr.mjs) и форма зуло (horridForm = "zulo",
// data/zulo.mjs). Их записи в компендиях помечены флагом homerule (tools/build_packs.mjs): силы, Путь Кошмаров, ритуалы,
// черты зуло, главы 11 и 12 правил. Пока хоумрул выключен — записи и опустевшие папки в окне компендия спрятаны.

import { SYSTEM_ID } from "../config.mjs";
import { bogatyrOn } from "../data/bogatyr.mjs";
import { zuloOn } from "../data/zulo.mjs";

/** Включён ли хоумрул по его метке. */
const ON = { bogatyr: bogatyrOn, zulo: zuloOn };
export const homeruleOn = key => ON[key]?.() ?? true;

export function registerHomerulePacks() {
  const key = `flags.${SYSTEM_ID}.homerule`;
  for (const doc of ["Item", "JournalEntry"]) {
    const f = CONFIG[doc].compendiumIndexFields ??= [];
    if (!f.includes(key)) f.push(key);
  }
  Hooks.on("renderCompendium", (app, el) => hideHomerules(app, el instanceof HTMLElement ? el : el?.[0]));
}

/** Спрятать в окне компендия записи выключенных хоумрулов и папки, где ничего не осталось. */
async function hideHomerules(app, el) {
  const pack = app.collection;
  if (!el || !pack?.index || pack.metadata?.packageName !== SYSTEM_ID || Object.values(ON).every(f => f())) return;
  // начальный индекс приходит без флагов — дочитать поле метки (один раз на компендий, дальше из кэша)
  const index = await pack.getIndex({ fields: [`flags.${SYSTEM_ID}.homerule`] });
  const off = index.filter(e => { const k = e.flags?.[SYSTEM_ID]?.homerule; return k && !homeruleOn(k); });
  if (!off.length) return;
  for (const e of off) el.querySelector(`li.entry[data-entry-id="${e._id}"]`)?.classList.add("r-homerule-off");
  // папки — от самых глубоких: пустая, если в ней нет видимой записи
  for (const f of [...el.querySelectorAll("li.folder")].reverse())
    if (!f.querySelector("li.entry:not(.r-homerule-off)")) f.classList.add("r-homerule-off");
}
