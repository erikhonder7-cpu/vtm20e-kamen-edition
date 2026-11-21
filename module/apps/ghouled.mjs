// module/apps/ghouled.mjs
// Гуль или ревенант среди смертных: смертный, маг, оборотень (Гару и Фера), подменыш; охотник — только Свидетель (наделённых
// Посланием кровь не берёт). Поле system.ghouled; блок на листе — у мага на вкладке Сфер, у оборотня на вкладке Даров,
// у прочих — на вкладке Преимуществ.
//   гуль (V20, гл. 9) — домитор и его клан, витэ вампира в теле (до 10), узы крови 0–3; с первым глотком — Могущество 1;
//   ревенант (Guide to the Sabbat; Ghouls & Revenants) — член рода: семья (module/data/revenants.mjs) с её Дисциплинами
//   и изъяном, своя витэ — запас 10 и +1 за каждое столетие («Возраст»), без домитора и уз.
// Дисциплины — предметами, как у любого гуля; лечение кровью — 1 витэ за лёгкое или тяжёлое повреждение.

import { SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { REVENANT_FAMILIES, familyRules } from "../data/revenants.mjs";
import { lifeState } from "./ghoul-life.mjs";
import { getClock, ymd } from "./calendar.mjs";
import { nameKey } from "../data/lineage.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Ghouled.${k}`, d) : game.i18n.localize(`VTM20.Ghouled.${k}`);
const esc = x => foundry.utils.escapeHTML(String(x ?? ""));
const say = (actor, icon, html) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="r-notice r-type-${actor.type}"><i class="fa-solid ${icon}"></i> ${html}</div>` });
const owner = actor => actor?.isOwner || (ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: actor?.name ?? "" })), false);

/** Может ли персонаж стать гулем или ревенантом: живой смертный тип; охотник — только Свидетель. */
export const canGhoul = actor => ["mortal", "mage", "werewolf", "changeling"].includes(actor?.type)
  || (actor?.type === "hunter" && actor.system?.hunter?.creed === "bystander");
/** Поле блока (system.ghouled) — или null, если этому персонажу нельзя. */
export const ghouledBase = actor => canGhoul(actor) ? "ghouled" : null;
const gOf = actor => actor.system?.ghouled ?? {};
const path = (actor, k) => `system.ghouled.${k}`;

/** Сколько витэ держит тело: гуль — 10, ревенант — 10 + 1 за столетие (по «Возрасту»). */
export function ghouledMax(actor) {
  const g = gOf(actor);
  if (g.kind !== "revenant") return 10;
  const age = parseInt(String(actor.system.details?.age ?? "").replace(/\D+/g, " ").trim().split(" ")[0]) || 0;
  return Math.min(20, 10 + Math.floor(age / 100));
}

/** Блок на листе: витэ клетками, узы (у гуля), семья с Дисциплинами и изъяном (у ревенанта), Дисциплины предметами. */
export function ghouledView(actor, dots) {
  const g = gOf(actor), revenant = g.kind === "revenant", max = ghouledMax(actor), fam = REVENANT_FAMILIES[g.family];
  // клан домитора — ключом из списка (старые листы — текстом: узнаём по названию)
  const clan = Codex.clan(g.clan) ?? Codex.clans.find(c => c.name === g.clan) ?? null;
  return { ...g, revenant, allowed: canGhoul(actor), max, many: max > 10, life: g.on ? lifeState(actor) : null,
    clans: Codex.clans.filter(c => Codex.visible(c) || c === clan).sort((x, y) => x.name.localeCompare(y.name, "ru"))
      .map(c => ({ value: c.key, label: c.name, selected: c === clan })),
    clanKnown: !!clan, clanRaw: clan ? "" : g.clan, sym: clan ? Codex.clanSymbol(clan.key) : null,
    steps: [1, 2, 3].map(n => ({ n, filled: n <= g.bond, label: t(`Steps.${n}`), tip: game.i18n.localize(`VTM20.Mage.Ghoul.Bond${n}`) })),
    title: t(revenant ? "TitleRevenant" : "TitleGhoul"),
    boxes: Array.from({ length: max }, (_, i) => ({ n: i + 1, filled: i < g.vitae })),
    bondDots: dots(g.bond, 3, { path: path(actor, "bond") }), bondText: g.bond ? game.i18n.localize(`VTM20.Mage.Ghoul.Bond${g.bond}`) : "",
    families: Object.entries(REVENANT_FAMILIES).map(([k, f]) => ({ value: k, label: f.name, selected: k === g.family })),
    family: fam ? { name: fam.name, flaw: fam.flaw, discs: (fam.disciplines ?? []).map(d => Codex.disciplineLabel(d)).join(", "),
      rules: familyRules(g.family), pride: g.family === "grimaldi" } : null,
    wounded: ["bashing", "lethal"].some(k => (actor._source.system.health[k] ?? 0) > 0),
    discs: actor.items.filter(i => i.type === "discipline").map(i => ({ id: i.id, name: i.name, value: i.system.value,
      dots: Array.from({ length: 5 }, (_, k) => ({ n: k + 1, filled: k < i.system.value })) })) };
}

/** Точка Дисциплины из компендия (если её ещё нет). */
async function grantDiscipline(actor, key, value = 1) {
  if (actor.items.some(i => i.type === "discipline" && i.system.key === key)) return;
  const pack = game.packs.get(`${SYSTEM_ID}.disciplines`), idx = await pack?.getIndex({ fields: ["system.key", "type"] });
  const hit = idx?.find(i => i.type === "discipline" && i.system?.key === key), doc = hit && await pack.getDocument(hit._id);
  if (doc) await actor.createEmbeddedDocuments("Item", [foundry.utils.mergeObject(doc.toObject(), { "system.value": value })]);
}

/**
 * Отметить гулем или ревенантом (kind), снять отметку (тот же kind ещё раз) или сменить вид.
 * Гуль: первый глоток — 1 витэ и Могущество 1. Ревенант: полный запас своей витэ.
 */
export async function toggleGhouled(actor, kind = "ghoul") {
  if (!owner(actor) || !ghouledBase(actor)) return null;
  const g = gOf(actor), off = g.on && g.kind === kind;
  if (off) {
    await actor.update({ [path(actor, "on")]: false });
    return say(actor, "fa-hand-holding-droplet", t(kind === "revenant" ? "RevenantOff" : "GhoulOff", { name: esc(actor.name), domitor: esc(g.domitor || t("Someone")) }));
  }
  await actor.update({ [path(actor, "on")]: true, [path(actor, "kind")]: kind, ...(kind === "ghoul" && !g.vitae ? { [path(actor, "vitae")]: 1 } : {}) });
  if (kind === "revenant") await actor.update({ [path(actor, "vitae")]: ghouledMax(actor) });
  if (kind === "ghoul") await grantDiscipline(actor, "potence", 1);
  return say(actor, kind === "revenant" ? "fa-people-roof" : "fa-hand-holding-droplet",
    t(kind === "revenant" ? "RevenantOn" : "GhoulOn", { name: esc(actor.name), domitor: esc(g.domitor || t("Someone")) }));
}

/** Семья ревенанта: изъян и Дисциплины рода — Дисциплины добавляются по точке, если их ещё нет. */
export async function setGhouledFamily(actor, family) {
  if (!owner(actor)) return null;
  await actor.update({ [path(actor, "family")]: family });
  for (const d of REVENANT_FAMILIES[family]?.disciplines ?? []) await grantDiscipline(actor, d, 1);
  return null;
}

/** Витэ в теле: клетка — столько и осталось (щелчок по той же — на одну меньше). */
export function ghouledVitae(actor, n) {
  const g = gOf(actor);
  return actor.update({ [path(actor, "vitae")]: Math.min(ghouledMax(actor), g.vitae === n ? n - 1 : n) });
}

/** Лечение кровью: 1 витэ — одно лёгкое или тяжёлое повреждение. */
export async function ghouledHeal(actor) {
  if (!owner(actor)) return null;
  const g = gOf(actor), h = actor._source.system.health, type = ["lethal", "bashing"].find(k => (h[k] ?? 0) > 0);
  if (g.vitae < 1) return ui.notifications.warn(t("NoVitae"));
  if (!type) return ui.notifications.info(t("NoWounds"));
  await actor.update({ [path(actor, "vitae")]: g.vitae - 1 });
  await actor.healDamage(type, 1);
  return say(actor, "fa-droplet", t("Healed", { name: esc(actor.name), type: game.i18n.localize(`VTM20.DamageOne.${type}`), n: g.vitae - 1 }));
}

const tonight = () => ymd(new Date(getClock()));

/**
 * Глоток витэ гулем среди смертных (с листа вампира — «Напоить», с вкладки «Витэ» — «Испить»): кровь уходит от вампира,
 * витэ прибавляется до предела; первый глоток делает гулем (Могущество 1), домитор и его клан — от донора, если не записаны;
 * узы растут на ступень, если в эту ночь ещё не пил (V20, гл. 5); у вампира — запись о вассале той же ступени.
 * preset — { donor (id), amount } без диалога.
 */
export async function drinkFromVampire(actor, preset = null) {
  if (!owner(actor)) return null;
  const g = gOf(actor);
  if (g.on && g.kind === "revenant") return ui.notifications.warn(t("RevenantNoDrink"));
  let donor = preset?.donor ? game.actors.get(preset.donor) : null, name = donor?.name ?? "", amount = Math.max(1, preset?.amount ?? 1);
  if (!preset) {
    const L = k => game.i18n.localize(`VTM20.BondX.${k}`);
    const vamps = game.actors.filter(a => a.type === "vampire").sort((x, y) => x.name.localeCompare(y.name, "ru"));
    const res = await foundry.applications.api.DialogV2.prompt({
      window: { title: t("DrinkTitle", { name: actor.name }), icon: "fa-solid fa-hand-holding-droplet" }, classes: ["vtm20", "r-dialog"],
      content: `<p class="r-hint">${t("DrinkHint")}</p>
        <label class="r-field"><span>${L("FeedDonor")}</span><select name="donor"><option value="">${L("FeedNoSheet")}</option>${vamps.map(a => `<option value="${a.id}" ${nameKey(a.name) === nameKey(g.domitor) ? "selected" : ""}>${esc(a.name)} · ${a.system.blood?.value ?? 0}</option>`).join("")}</select></label>
        <label class="r-field"><span>${L("FeedName")}</span><input type="text" name="name" value="${esc(g.domitor)}"></label>
        <label class="r-field"><span>${L("FeedAmount")}</span><input type="number" name="amount" value="1" min="1" max="10"></label>`,
      ok: { label: t("Drink"), callback: (e, b) => ({ donor: b.form.elements.donor.value, name: b.form.elements.name.value.trim(), amount: Math.max(1, Math.floor(Number(b.form.elements.amount.value) || 1)) }) },
      rejectClose: false
    });
    if (!res) return null;
    donor = res.donor ? game.actors.get(res.donor) : null; name = donor?.name ?? res.name; amount = res.amount;
  }
  if (!name) return ui.notifications.warn(game.i18n.localize("VTM20.BondX.FeedNoDonor"));
  if (donor) {
    amount = Math.min(amount, donor.system.blood?.value ?? 0);
    if (!amount) return ui.notifications.warn(game.i18n.format("VTM20.BondX.FeedEmpty", { name: donor.name }));
    if (donor.isOwner) await donor.update({ "system.blood.value": donor.system.blood.value - amount });
  }
  const night = tonight(), first = !g.on, newNight = g.lastNight !== night;
  const bond = newNight ? Math.min(3, (first ? 0 : g.bond ?? 0) + 1) : g.bond ?? 0;
  const max = 10, vitae = Math.min(max, (first ? 0 : g.vitae ?? 0) + amount);
  const upd = { [path(actor, "on")]: true, [path(actor, "kind")]: "ghoul", [path(actor, "vitae")]: vitae, [path(actor, "bond")]: bond, [path(actor, "lastNight")]: night };
  if (!g.domitor || first) upd[path(actor, "domitor")] = name;
  if ((!g.clan || first) && donor?.system.clan) upd[path(actor, "clan")] = donor.system.clan;
  await actor.update(upd);
  if (first) await grantDiscipline(actor, "potence", 1);
  // у вампира — вассал той же ступени
  if (donor?.isOwner) {
    const dl = foundry.utils.deepClone(donor._source.system.bonds ?? []);
    const row = dl.find(b => b.role === "thrall" && nameKey(b.name) === nameKey(actor.name));
    if (row) { row.rating = bond; row.last = night; row.drinks = (row.drinks ?? 0) + 1; }
    else dl.push({ name: actor.name, rating: bond, role: "thrall", drinks: 1, last: night });
    await donor.update({ "system.bonds": dl });
  }
  const lost = (first ? 0 : g.vitae ?? 0) + amount - vitae;
  return say(actor, "fa-hand-holding-droplet", t(first ? "DrankFirst" : "Drank", { name: esc(actor.name), donor: esc(name), n: amount,
    bond: bond ? game.i18n.localize(`VTM20.Mage.Ghoul.Bond${bond}`) : t("NoBond") }) + (lost > 0 ? ` ${t("DrankLost", { n: lost })}` : ""));
}

/** Домитор перетаскиванием: вампира из списка персонажей — на карточку «Домитор» вкладки «Витэ». */
export async function setDomitor(actor, vampire) {
  if (!owner(actor) || vampire?.type !== "vampire") return null;
  await actor.update({ [path(actor, "domitor")]: vampire.name, ...(vampire.system.clan ? { [path(actor, "clan")]: vampire.system.clan } : {}) });
  return ui.notifications.info(t("DomitorSet", { name: actor.name, domitor: vampire.name }));
}
