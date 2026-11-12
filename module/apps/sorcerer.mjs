// module/apps/sorcerer.mjs
// Колдуны и консоры — смертные рядом с магами (справочник — data/mage.json → sorcerer; tools/mage_data.py).
//   · Колдун (M20 Sorcerer): нумины — Пути линейной магии и психические феномены, 1–5 точек; Объединение, Атрибут-проводник.
//     Бросок Пути: 1 Воля, Атрибут-проводник + Способность Пути, сложность — уровень Пути + 4; рейтинг Пути не выше её Способности.
//     Феномен: 1 Воля, пул — Воля, сложность — уровень + 3; рейтинг — не выше половины Воли. Парадокса нет.
//   · Консор (Gods & Monsters, гл. 3): спутник мага — роль, чья он сторона; своей магии нет.
// Отметка на листе смертного — как Родня Гару, Ками и фомор (блок «Сверхъестественное» на вкладке преимуществ).

import { VTM20 } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { RollDialog } from "../dice/dialog.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Sorcerer.${k}`, d) : game.i18n.localize(`VTM20.Sorcerer.${k}`);
const esc = x => foundry.utils.escapeHTML(String(x ?? ""));
export const S = () => Codex.mage?.sorcerer ?? { paths: [], psychic: [], aspects: [], affiliations: [], creation: {}, consor: { roles: [], creation: {} } };
export const numenOf = key => S().paths.find(x => x.key === key) ?? S().psychic.find(x => x.key === key) ?? null;
const isPsychic = key => S().psychic.some(x => x.key === key);
const abilityLabel = k => k ? game.i18n.localize(VTM20.abilities?.[k]?.label ?? `VTM20.Abil.${k}`) : "";

/** Данные блока «Колдун» на листе смертного. */
export function sorcererInfo(actor, dots) {
  const s = actor.system.sorcerer, D = S(), will = actor.system.willpower?.permanent ?? 0;
  const abil = actor.system.abilities ?? {};
  const row = n => {
    const d = numenOf(n.key), psy = isPsychic(n.key), cap = psy ? Math.floor(will / 2) : n.ability ? abil[n.ability]?.value ?? 0 : 5;
    return { key: n.key, name: d?.name ?? n.key, en: d?.en ?? "", html: d?.html ?? "", psy, dotsN: n.dots, ability: n.ability, abilityLabel: abilityLabel(n.ability),
      over: n.dots > cap, cap, difficulty: n.dots + (psy ? D.creation.psychicBase ?? 3 : D.creation.pathBase ?? 4),
      dots: dots(n.dots, 5).map(x => ({ ...x, key: n.key })),
      abilities: psy ? null : Object.keys(abil).map(k => ({ key: k, label: abilityLabel(k), selected: k === n.ability })).sort((a, b) => a.label.localeCompare(b.label, "ru")) };
  };
  const have = new Set(s.numina.map(n => n.key));
  const aff = D.affiliations.find(a => a.key === s.affiliation) ?? null;
  return { on: s.on, affiliation: s.affiliation, attr: s.attr,
    affiliations: D.affiliations.map(a => ({ key: a.key, label: a.name, selected: a.key === s.affiliation })),
    aff, affTip: aff ? [aff.en, aff.attrs && `${t("FavAttrs")}: ${aff.attrs}`, aff.paths && `${t("FavPaths")}: ${aff.paths}`, aff.text].filter(Boolean).join(" · ") : "",
    attrs: Object.keys(VTM20.attributes).map(k => ({ key: k, label: game.i18n.localize(`VTM20.Attr.${k}`), selected: k === s.attr })),
    paths: s.numina.filter(n => !isPsychic(n.key)).map(row), psychic: s.numina.filter(n => isPsychic(n.key)).map(row),
    availPaths: D.paths.filter(x => !have.has(x.key)).map(x => ({ key: x.key, label: x.name })),
    availPsychic: D.psychic.filter(x => !have.has(x.key)).map(x => ({ key: x.key, label: x.name })),
    rituals: s.rituals.map((r, i) => ({ i, ...r, pathName: numenOf(r.path)?.name ?? "" })), will, psyCap: Math.floor(will / 2) };
}

/** Данные блока «Консор». */
export function consorInfo(actor) {
  const c = actor.system.consor, D = S().consor, M = Codex.mage ?? {};
  const role = D.roles.find(r => r.key === c.role) ?? null;
  return { on: c.on, role, roles: D.roles.map(r => ({ key: r.key, label: r.name, selected: r.key === c.role })),
    kinds: ["consor", "acolyte"].map(k => ({ key: k, label: t(`ConsorKind.${k}`), selected: k === c.kind })),
    groups: (M.groups ?? []).map(g => ({ name: g.name, list: (M.factions ?? []).filter(f => f.group === g.key).map(f => ({ key: f.key, name: f.name, selected: f.key === c.faction })) })),
    faction: (M.factions ?? []).find(f => f.key === c.faction) ?? null };
}

const list = actor => actor.system.sorcerer.numina.map(x => ({ ...x }));
/** Нумина второго вида (Путь у того, кто владеет феноменами, и наоборот) — дороже: 21 за первую точку. */
export function numenXpExtra(actor, key) {
  const own = actor.system.sorcerer.numina.filter(n => n.dots > 0 && n.key !== key), psy = isPsychic(key);
  return { key, secondary: own.length > 0 && own.every(n => isPsychic(n.key) !== psy) };
}

export function addNumen(actor, key) {
  const d = numenOf(key);
  if (!d || actor.system.sorcerer.numina.some(x => x.key === key)) return null;
  return actor.update({ "system.sorcerer.numina": [...list(actor), { key, dots: 1, ability: "" }] });
}
export const removeNumen = (actor, key) => actor.update({ "system.sorcerer.numina": list(actor).filter(x => x.key !== key) });
/** Точки нумины; щелчок по последней закрашенной — на точку меньше. */
export function numenDots(actor, key, n) {
  const l = list(actor), x = l.find(y => y.key === key);
  if (!x) return null;
  x.dots = Math.clamp(x.dots === n ? n - 1 : n, 0, 5);
  return actor.update({ "system.sorcerer.numina": l });
}
export function numenAbility(actor, key, ability) {
  const l = list(actor), x = l.find(y => y.key === key);
  if (!x) return null;
  x.ability = ability;
  return actor.update({ "system.sorcerer.numina": l });
}

/** Бросок нумины: Путь — Атрибут-проводник + Способность Пути, сл. уровень + 4; Феномен — Воля, сл. уровень + 3. В обоих случаях 1 Воля. */
export function useNumen(actor, key) {
  const n = actor.system.sorcerer.numina.find(x => x.key === key), d = numenOf(key), D = S();
  if (!n || !d) return null;
  if (n.dots < 1) return ui.notifications.warn(t("NoDots", { name: d.name }));
  if ((actor.system.willpower?.temporary ?? 0) < 1) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NoWillpower", { name: actor.name }));
  const psy = isPsychic(key), title = `${d.name} ${"•".repeat(n.dots)}`;
  if (psy) return RollDialog.prompt(actor, { title, subtitle: t("Psychic"), trait1: "willpower.permanent", difficulty: n.dots + (D.creation.psychicBase ?? 3), willpowerCost: true,
    lockTraits: true, diffNote: t("PsychicNote"), effect: d.html, kind: "check" });
  if (!n.ability) return ui.notifications.warn(t("NeedAbility", { name: d.name }));
  return RollDialog.prompt(actor, { title, subtitle: t("Path"), trait1: `attributes.${actor.system.sorcerer.attr || "intelligence"}`, trait2: `abilities.${n.ability}`,
    difficulty: n.dots + (D.creation.pathBase ?? 4), willpowerCost: true, diffNote: t("PathNote"), effect: d.html, kind: "check" });
}

/** Ритуал колдуна — запись: название, Путь и уровень (ритуал не выше рейтинга Пути). */
export async function addRitual(actor) {
  const paths = actor.system.sorcerer.numina.filter(n => !isPsychic(n.key));
  if (!paths.length) return ui.notifications.warn(t("NoPaths"));
  const res = await foundry.applications.api.DialogV2.prompt({ window: { title: t("RitualAdd"), icon: "fa-solid fa-book-skull" }, classes: ["vtm20", "r-dialog", "r-type-mage"], rejectClose: false, position: { width: 460 },
    content: `<div class="r-form"><label class="r-field"><span>${esc(t("RitualName"))}</span><input type="text" name="name" autofocus></label>
      <label class="r-field"><span>${esc(t("Path"))}</span><select name="path">${paths.map(n => `<option value="${n.key}">${esc(numenOf(n.key)?.name ?? n.key)} ${"•".repeat(n.dots)}</option>`).join("")}</select></label>
      <label class="r-field"><span>${esc(t("RitualLevel"))}</span><input type="number" name="level" min="1" max="5" value="1"></label>
      <label class="r-field"><span>${esc(t("RitualText"))}</span><textarea name="text" rows="3"></textarea></label>
      <label class="r-check"><input type="checkbox" name="xp"><span>${esc(t("RitualXp"))}</span></label></div>`,
    ok: { label: t("RitualAdd"), callback: (ev, b) => ({ name: b.form.elements.name.value.trim(), path: b.form.elements.path.value, level: Math.clamp(Number(b.form.elements.level.value) || 1, 1, 5), xp: b.form.elements.xp.checked, text: b.form.elements.text.value.trim() }) } });
  if (!res?.name) return null;
  const have = paths.find(n => n.key === res.path)?.dots ?? 0;
  if (res.level > have) return ui.notifications.warn(t("RitualTooHigh", { n: have }));
  const { xp, ...ritual } = res, upd = { "system.sorcerer.rituals": [...actor.system.sorcerer.rituals.map(r => ({ ...r })), ritual] };
  // новый ритуал за опыт стоит его уровень (M20 Sorcerer, гл. 3)
  if (xp) {
    const left = actor.system.experience.available;
    if (left < ritual.level) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NoXp", { cost: ritual.level, have: left }));
    const log = foundry.utils.deepClone(actor._source.system.experience.log);
    log.unshift({ amount: -ritual.level, reason: t("RitualXpLog", { name: ritual.name, n: ritual.level }), date: new Date().toLocaleDateString("ru-RU") });
    Object.assign(upd, { "system.experience.spent": actor._source.system.experience.spent + ritual.level, "system.experience.log": log });
  }
  return actor.update(upd);
}
export function removeRitual(actor, i) {
  const l = actor.system.sorcerer.rituals.map(r => ({ ...r })); l.splice(i, 1);
  return actor.update({ "system.sorcerer.rituals": l });
}
/** Ритуал: тот же Бросок Пути, 10 минут на уровень; сложность — уровень ритуала + 4. */
export function useRitual(actor, i) {
  const r = actor.system.sorcerer.rituals[i], n = actor.system.sorcerer.numina.find(x => x.key === r?.path);
  if (!r || !n) return null;
  if (!n.ability) return ui.notifications.warn(t("NeedAbility", { name: numenOf(n.key)?.name ?? "" }));
  if ((actor.system.willpower?.temporary ?? 0) < 1) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NoWillpower", { name: actor.name }));
  return RollDialog.prompt(actor, { title: r.name, subtitle: `${t("Ritual")} · ${numenOf(n.key)?.name ?? ""} ${"•".repeat(r.level)}`, trait1: `attributes.${actor.system.sorcerer.attr || "intelligence"}`,
    trait2: `abilities.${n.ability}`, difficulty: r.level + (S().creation.pathBase ?? 4), willpowerCost: true, diffNote: t("RitualNote", { n: r.level * 10 }), effect: r.text ? `<p>${esc(r.text)}</p>` : "", kind: "check" });
}
