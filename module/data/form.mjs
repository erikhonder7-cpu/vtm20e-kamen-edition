// module/data/form.mjs
// Апокалиптическая форма падшего (Demon: The Fallen, гл. 7; каталог способностей — Demon Players Guide, data/demon-form.json):
// какие черты сейчас действуют и что они дают в числах. Черты Облика при низкой Муке действуют всегда, черты высокой Муки —
// выбранные (флаг formHigh, первые Мука − 6) и взятые на эпизод (флаг formScene). Механика — поле mech у способности каталога:
//   attr {черта: n} · soak n · init n · health n · noWoundPenalty · diff {черта: n} · ability {черта: n} · weapon {name, dmg, agg, diff}
// «$pick» в diff/ability — Способность, которую игрок выбирает сам (флаг formPick: имя черты → ключ Способности).

import { SYSTEM_ID } from "../config.mjs";
import { Codex } from "./codex.mjs";

const norm = s => String(s ?? "").toLowerCase().replace(/ё/g, "е").replace(/\s*\/\s*/g, " и ").replace(/[^а-яa-z ]/g, "").replace(/\s+/g, " ").trim();

/** Названия черт основной книги, которых в каталоге Players Guide нет под тем же именем. */
const ALIAS = {
  "улучшенное восприятие": "обостренные чувства", "повышенная чувствительность": "обостренные чувства",
  "увеличение размеров": "увеличенный размер", "когти": "когти и зубы", "зубы": "когти и зубы",
  "увеличенные социальные характеристики": "улучшенные социальные характеристики",
  "аура неудачи": "аура невезения", "аура страха": "аура ужаса"
};
/** Ключи каталога, которых нет в листе V20: уклонение в V20 — Атлетика. */
const TRAIT = { dodge: "athletics" };

/** Способность каталога по названию: сначала Дома Облика, затем общие, затем любые. */
export function formEntry(name, house) {
  const cat = Codex["demon-form"];
  if (!cat) return null;
  const n = ALIAS[norm(name)] ?? norm(name);
  const find = list => (list ?? []).find(x => norm(x.name) === n) ?? null;
  return find(cat.houses?.[house]?.abilities) ?? find(cat.common)
    ?? Object.values(cat.houses ?? {}).map(h => find(h.abilities)).find(Boolean) ?? null;
}

/** Черты формы персонажа: [{ name, high, index, active, entry }]. active — действует ли сейчас (в форме). */
export function formFeatures(actor) {
  const s = actor?.system, lore = Codex.lore?.(s?.visage), form = lore?.form;
  if (!form) return [];
  const house = lore.house ?? s.house;
  const highN = Math.max(0, Math.min(4, (s.torment?.permanent ?? 0) - 6));
  const picked = (actor.getFlag?.(SYSTEM_ID, "formHigh") ?? []).filter(i => i < form.high.length).slice(0, highN);
  const scene = actor.getFlag?.(SYSTEM_ID, "formScene") ?? [];
  return [
    ...form.low.map((name, index) => ({ name, high: false, index, active: true, entry: formEntry(name, house) })),
    ...form.high.map((name, index) => ({ name, high: true, index, active: picked.includes(index) || scene.includes(index), entry: formEntry(name, house) }))
  ];
}

/** Число со знаком для подписи: «−2», «+1». */
export const signed = n => n < 0 ? `−${-n}` : `+${n}`;

/** Подпись механики черты коротко: «Сила +2 · Выносливость +1», «+4 к поглощению»… */
export function mechLabel(mech, pick = "") {
  if (!mech) return "";
  const L = k => game.i18n.localize(`VTM20.Attr.${k}`) !== `VTM20.Attr.${k}` ? game.i18n.localize(`VTM20.Attr.${k}`)
    : game.i18n.localize(`VTM20.Abil.${TRAIT[k] ?? k}`);
  const f = (k, d) => game.i18n.format(`VTM20.Demon.FormMech.${k}`, d);
  const who = k => k === "$pick" ? (pick ? L(pick) : game.i18n.localize("VTM20.Demon.FormMech.PickAny")) : L(k);
  const out = [];
  for (const [k, v] of Object.entries(mech.attr ?? {})) out.push(`${L(k)} +${v}`);
  if (mech.soak) out.push(f("Soak", { n: mech.soak }));
  if (mech.init) out.push(f("Init", { n: mech.init }));
  if (mech.health) out.push(f("Health", { n: mech.health }));
  if (mech.noWoundPenalty) out.push(f("NoWound", {}));
  for (const [k, v] of Object.entries(mech.diff ?? {})) out.push(f("Diff", { t: who(k), n: signed(v) }));
  for (const [k, v] of Object.entries(mech.ability ?? {})) out.push(f("Dice", { t: who(k), n: v }));
  if (mech.weapon) out.push(f(mech.weapon.agg ? "WeaponAgg" : "Weapon", { n: mech.weapon.dmg >= 0 ? `+${mech.weapon.dmg}` : mech.weapon.dmg }));
  return out.join(" · ");
}

/**
 * Что даёт форма сейчас: { attr, soak, init, health, noWoundPenalty, diff: {черта: [{label, value}]}, dice: {черта: [{label, value}]},
 * weapons: [{ name, dmg, agg, diff }], list: [{ name, label }] }. Вне формы — пусто.
 */
export function formMods(actor) {
  const m = { attr: {}, soak: 0, init: 0, health: 0, noWoundPenalty: false, diff: {}, dice: {}, weapons: [], list: [] };
  if (actor?.type !== "demon" || !actor.system.apocalyptic) return m;
  const picks = actor.getFlag?.(SYSTEM_ID, "formPick") ?? {};
  for (const x of formFeatures(actor)) {
    if (!x.active) continue;
    const mech = x.entry?.mech, pick = picks[x.name] ?? "";
    m.list.push({ name: x.name, label: mechLabel(mech, pick) });
    if (!mech) continue;
    for (const [k, v] of Object.entries(mech.attr ?? {})) m.attr[k] = (m.attr[k] ?? 0) + v;
    m.soak += mech.soak ?? 0;
    m.init += mech.init ?? 0;
    m.health += mech.health ?? 0;
    m.noWoundPenalty ||= !!mech.noWoundPenalty;
    const add = (bucket, k, v) => { const key = k === "$pick" ? pick : TRAIT[k] ?? k; if (key) (bucket[key] ??= []).push({ label: x.name, value: v }); };
    for (const [k, v] of Object.entries(mech.diff ?? {})) add(m.diff, k, v);
    for (const [k, v] of Object.entries(mech.ability ?? {})) add(m.dice, k, v);
    if (mech.weapon) m.weapons.push({ ...mech.weapon, name: mech.weapon.name || x.name });
  }
  return m;
}

/** Черты, где игрок выбирает Способность («Улучшенная способность», «Увеличенная способность»). */
export const needsPick = entry => !!entry?.mech && ["diff", "ability"].some(k => "$pick" in (entry.mech[k] ?? {}));
