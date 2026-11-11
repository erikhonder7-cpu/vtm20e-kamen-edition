// module/apps/werewolf/fomori.mjs
// Оборотень — фоморы (W20, гл. 13; Book of the Wyrm, гл. 2): породы и силы одержимых Вирмом.

import { RollDialog } from "../../dice/dialog.mjs";
import { VTM20 } from "../../config.mjs";
import { t, esc, W } from "../werewolf.mjs";

const FOMORI = () => W().fomori ?? { powers: [], breeds: [] };

export const fomorBreedOf = key => FOMORI().breeds.find(b => b.key === key) ?? null;

/** Сила фомори: из общей таблицы или особая сила породы («~порода:Название»). */
export const fomorPowerOf = key => {
  if (key?.startsWith("~")) {
    const [b, name] = key.slice(1).split(/:(.*)/s), br = fomorBreedOf(b);
    return { key, name, en: "", text: br?.specials?.[name] || t("Fomor.specialOf", { name: br?.name ?? b }), roll: null, repeat: false, max: 1 };
  }
  return FOMORI().powers.find(p => p.key === key) ?? null;
};

export function fomorInfo(actor) {
  const f = actor.system.fomor;
  if (!f) return null;
  const br = fomorBreedOf(f.breed);
  const powers = f.powers.map(p => ({ ...p, data: fomorPowerOf(p.key) })).filter(p => p.data).map(p => ({ key: p.key, n: p.n, name: p.data.name, en: p.data.en,
    text: p.data.text, more: p.data.repeat && p.n < p.data.max, roll: !!p.data.roll }));
  return { on: f.on, rage: f.rage, breed: br, powers,
    breeds: [{ key: "", label: "—", selected: !f.breed }, ...FOMORI().breeds.map(b => ({ key: b.key, label: `${VTM20.label(b)} — ${t("Fomor.wp", { n: b.willpower })}`, selected: b.key === f.breed }))],
    avail: FOMORI().powers.filter(p => !f.powers.some(x => x.key === p.key)).map(p => ({ key: p.key, label: VTM20.label(p) })) };
}

/** Порода фомори: её силы (особые — с текстом породы) и Воля; прежние силы остаются. */
export async function fomorBreed(actor, key) {
  const br = fomorBreedOf(key), f = actor.system.fomor;
  const list = f.powers.map(x => ({ ...x }));
  for (const k of br?.powers ?? []) if (!list.some(x => x.key === k)) list.push({ key: k, n: 1 });
  return actor.update({ "system.fomor.breed": key, "system.fomor.powers": list,
    ...(br ? { "system.willpower.permanent": br.willpower, "system.willpower.temporary": br.willpower } : {}),
    ...(list.some(x => fomorPowerOf(x.key)?.rage) && f.rage < 5 ? { "system.fomor.rage": 5 } : {}) });
}

export function fomorAdd(actor, key) {
  const p = fomorPowerOf(key), f = actor.system.fomor;
  if (!p) return;
  const list = f.powers.map(x => ({ ...x })), have = list.find(x => x.key === key);
  if (have && (!p.repeat || have.n >= p.max)) return;
  if (have) have.n += 1; else list.push({ key, n: 1 });
  // «Берсерк»: 5 Ярости, тратятся как у Гару
  return actor.update({ "system.fomor.powers": list, ...(p.rage && f.rage < 5 ? { "system.fomor.rage": 5 } : {}) });
}

export function fomorRemove(actor, key) {
  const list = actor.system.fomor.powers.map(x => ({ ...x })), have = list.find(x => x.key === key);
  if (!have) return;
  return actor.update({ "system.fomor.powers": have.n > 1 ? list.map(x => x.key === key ? { ...x, n: x.n - 1 } : x) : list.filter(x => x.key !== key) });
}

export function fomorUse(actor, key) {
  const p = fomorPowerOf(key);
  if (!p) return;
  if (p.roll) return RollDialog.prompt(actor, { title: p.name, trait1: p.roll.trait1, trait2: p.roll.trait2, difficulty: p.roll.difficulty ?? 6 });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-werewolf"><b>${esc(p.name)}</b><p>${p.text}</p></div>` });
}
