// module/data/lineage.mjs
// Родословная (план 6) и паутина хроники (план 5) — из того, что уже вписано в листы:
// поле «Сир» (system.details.sire), поколение, «Обращён» (system.details.embraced — год и место).
// Сир ищется среди персонажей мира по имени; не нашёлся — звено «листа нет», а выше идут предки, вписанные
// в лист того, у кого он сир (system.lineage.ancestors), — без листов.

/** Сравнение имён: без регистра, лишних пробелов и ё/е. */
export const nameKey = s => String(s ?? "").trim().toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\s+/g, " ");

/** Персонаж мира по имени (только те, кого пользователь видит). */
export function actorByName(name) {
  const k = nameKey(name);
  if (!k) return null;
  return game.actors.find(a => nameKey(a.name) === k && a.testUserPermission(game.user, "LIMITED")) ?? null;
}

/** Потомки: персонажи, у которых в поле «Сир» — это имя. */
export function childrenOf(actorOrName) {
  const k = nameKey(typeof actorOrName === "string" ? actorOrName : actorOrName?.name);
  if (!k) return [];
  return game.actors.filter(a => nameKey(a.system?.details?.sire) === k && a.testUserPermission(game.user, "LIMITED"))
    .sort((x, y) => x.name.localeCompare(y.name, "ru"));
}

/**
 * Линия вверх от персонажа: [{ gen, name, actor, known }] — старшие сверху, сам персонаж последним.
 * Звенья без листа берут поколение «на одно меньше»; выше последнего известного — одно звено «неизвестен».
 */
export function lineUp(actor, max = 12) {
  const out = [];
  const seen = new Set([actor.id]);
  let cur = actor, gen = actor.system.generation ?? null;
  out.unshift({ gen, name: actor.name, actor, known: true, self: true });
  for (let i = 0; i < max; i++) {
    const sireName = String(cur?.system?.details?.sire ?? "").trim();
    gen = gen != null ? gen - 1 : null;
    if (!sireName) { out.unshift({ gen, name: "", actor: null, known: false }); break; }
    const sire = actorByName(sireName);
    if (sire && seen.has(sire.id)) break;                 // петля в полях «Сир»
    out.unshift({ gen: sire?.isVampire ? sire.system.generation : gen, name: sireName, actor: sire, known: true, holder: cur });
    if (!sire) {
      // сир без листа: выше — предки, вписанные в лист cur; поколение — своё или на одно меньше нижнего
      (cur.system.lineage?.ancestors ?? []).forEach((w, index) => {
        gen = w.gen || (gen != null ? gen - 1 : null);
        out.unshift({ gen, name: w.name, clan: w.clan, embraced: w.embraced, actor: null, known: true, written: index, holder: cur });
      });
      out.unshift({ gen: gen != null ? gen - 1 : null, name: "", actor: null, known: false, holder: cur });
      break;
    }
    seen.add(sire.id); cur = sire; gen = sire.isVampire ? sire.system.generation : gen;
  }
  return out;
}

/** Проверка крови: поколение сира должно быть на одно меньше. Не сходится — подсказка, без запрета. */
export function bloodCheck(actor) {
  const sire = actorByName(actor.system?.details?.sire);
  if (!sire?.isVampire || !actor.isVampire) return null;
  const s = sire.system.generation, g = actor.system.generation;
  return { sire: sire.name, sireGen: s, gen: g, ok: s === g - 1 };
}
