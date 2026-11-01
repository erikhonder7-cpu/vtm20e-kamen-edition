// module/apps/dhampir.mjs
// Дампир (Accursed Heirs: Dhampirs, Michael Vides, Storytellers Vault 2020; пересказ — data/dhampir.json).
// Гуль с ghoulType «dhampir»: Кровные права — system.dhampir.bloodrights (ключ → 1–3), ритуалы Дриримантии —
// system.dhampir.rituals. Право, развивающее Дисциплину, требует её первой точки; Дриримантия — любой точки магии крови.

import { Codex } from "../data/codex.mjs";
import { RollDialog } from "../dice/dialog.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Dhampir.${k}`, d) : game.i18n.localize(`VTM20.Dhampir.${k}`);
const D = () => Codex.dhampir ?? { bloodrights: [], rituals: [], concepts: [], clans: {} };
/** Дисциплины магии крови, открывающие Дриримантию. */
const BLOOD_MAGIC = ["thaumaturgy", "necromancy", "assamiteSorcery", "setiteSorcery", "koldunism", "darkThaumaturgy"];

export const rightOf = key => D().bloodrights.find(r => r.key === key) ?? null;

/** Есть ли у персонажа то, что требует Кровное право. */
export function meetsReq(actor, right) {
  if (!right?.req) return true;
  if (right.key === "dririmancy") return BLOOD_MAGIC.some(k => (actor.discipline?.(k) ?? 0) > 0);
  return (actor.discipline?.(right.req) ?? 0) > 0;
}

/** Подпись пула броска: «Восприятие + Бдительность, сл. 7». */
function poolLabel(roll) {
  if (!roll) return "";
  const name = path => {
    if (!path) return "";
    const [g, k] = path.split(".");
    if (g === "attributes") return game.i18n.localize(`VTM20.Attr.${k}`);
    if (g === "abilities") return game.i18n.localize(`VTM20.Abil.${k}`);
    if (g === "virtues") return game.i18n.localize(`VTM20.Virtue.${k}`);
    if (g === "willpower") return game.i18n.localize("VTM20.Willpower");
    return path;
  };
  const pool = [name(roll.trait1), name(roll.trait2)].filter(Boolean).join(" + ");
  return roll.difficulty ? `${pool}, ${t("Diff", { n: roll.difficulty })}` : `${pool}, ${t("DiffByTarget")}`;
}

/** Вкладка Дисциплин дампира: свои Кровные права с силами, доступные к добавлению, ритуалы Дриримантии. */
export function dhampirView(actor, dots) {
  const own = actor.system.dhampir?.bloodrights ?? {};
  const label = key => key ? (Codex.disciplineLabel?.(key) ?? key) : "";
  const rights = Object.entries(own).map(([key, lvl]) => {
    const r = rightOf(key);
    if (!r) return null;
    const level = Math.max(0, Math.min(3, Number(lvl) || 0));
    // у растущих прав (Крепь, Спешка, Сила жил) одна запись — свойство, сила которого — точки
    const powers = r.scaling ? [{ ...r.levels[0], level, on: level > 0 }] : r.levels.map(p => ({ ...p, on: p.level <= level }));
    return { key, name: r.name, en: r.en, text: r.text, rare: r.rare, req: r.key === "dririmancy" ? t("BloodMagic") : label(r.req),
      xp: actor.xpCost("bloodright", level),
      dots: dots(level, 3, { path: `system.dhampir.bloodrights.${key}` }),
      powers: powers.map(p => ({ ...p, pool: poolLabel(p.roll) })) };
  }).filter(Boolean).sort((a, b) => a.rare - b.rare || a.name.localeCompare(b.name, "ru"));
  const available = D().bloodrights.filter(r => !(r.key in own) && meetsReq(actor, r))
    .map(r => ({ key: r.key, name: r.name, rare: r.rare, req: r.key === "dririmancy" ? t("BloodMagic") : label(r.req) }))
    .sort((a, b) => a.rare - b.rare || a.name.localeCompare(b.name, "ru"));
  const dri = Number(own.dririmancy) || 0, known = new Set(actor.system.dhampir?.rituals ?? []);
  const rituals = dri ? D().rituals.filter(r => r.level <= dri || known.has(r.key))
    .map(r => ({ ...r, known: known.has(r.key), pool: poolLabel(r.roll) })) : [];
  return { rights, available, dririmancy: dri > 0, rituals };
}

/** Добавить Кровное право (1 точка) из выпадающего списка вкладки. */
export async function addBloodright(actor, key) {
  const r = rightOf(key);
  if (!r) return null;
  if (!meetsReq(actor, r) && !game.user.isGM) return ui.notifications.warn(t("NeedReq", { d: Codex.disciplineLabel?.(r.req) ?? r.req }));
  if (r.rare) ui.notifications.info(t("RareNote", { name: r.name }));
  // новое право — за опыт (7); рассказчик без опыта у персонажа может выдать даром
  const path = `system.dhampir.bloodrights.${key}`;
  if ((actor.system.experience?.available ?? 0) >= 7 || !game.user.isGM) return actor.buyWithXp({ path, kind: "bloodright", label: r.name });
  await actor.update({ [path]: 1 });
  return ui.notifications.info(t("GrantedFree", { name: r.name }));
}

export async function removeBloodright(actor, key) {
  const r = rightOf(key);
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: r?.name ?? key },
    content: `<p>${t("RemoveConfirm", { name: foundry.utils.escapeHTML(r?.name ?? key) })}</p>` }).catch(() => false);
  if (!ok) return null;
  return actor.update({ [`system.dhampir.bloodrights.-=${key}`]: null });
}

/** Бросок силы Кровного права: окно броска с пулом силы (сложность по цели — 6, поправить в окне). */
export function rollBloodright(actor, key, level) {
  const r = rightOf(key), p = r?.levels?.[r.scaling ? 0 : level - 1];
  if (!p?.roll) return null;
  return RollDialog.prompt(actor, { title: p.name, trait1: p.roll.trait1, trait2: p.roll.trait2 || undefined,
    difficulty: p.roll.difficulty || 6, diffNote: p.roll.difficulty ? "" : t("DiffByTargetNote") });
}

export async function toggleRitual(actor, key) {
  const have = new Set(actor.system.dhampir?.rituals ?? []);
  if (have.has(key)) have.delete(key); else have.add(key);
  return actor.update({ "system.dhampir.rituals": [...have] });
}

export function rollRitual(actor, key) {
  const r = D().rituals.find(x => x.key === key);
  if (!r) return null;
  return RollDialog.prompt(actor, { title: r.name, trait1: r.roll.trait1, trait2: r.roll.trait2, difficulty: r.roll.difficulty,
    diffNote: t("RitualCost") });
}
