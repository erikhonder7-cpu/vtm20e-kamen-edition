// module/apps/thaum-workshop.mjs
// Мастерская тауматурга: артефакты Тремер (data/thaum-artifacts.json).
//  · Изготовить — вещь ритуалом Тауматургии, который знает персонаж (Эгида, Кость лжи, Пылающий клинок, Кровавый кристалл…):
//    бросок ритуала (Интеллект + Оккультизм, сл. 3 + уровень), цена кровью; заряды или срок — по успехам или Тауматургии.
//  · Талисман — «Зачарование талисмана» (V20, ур. 5): лунный месяц по 6 часов в ночь, 1 кровь за ночь; раз в неделю
//    продолжительная Интеллект + Оккультизм, сл. 8; 20 успехов за 4 недели, иначе испорчен. Проект — флаг talismanWork.
//    «Кровавый филактерий» (Тёмные века) — тот же проект, в конце 1 постоянная Воля уходит в предмет.
//  · Находка — для рассказчика: случайный артефакт с создателем, капеллой, эпохой, знаками, приметой и зацепкой;
//    спонтанный талисман (Blood Sacrifice) — только из примеров книги: правил их создания нет намеренно.
// Бонусы талисмана в бросках — data/talisman.mjs. Вещь — оружие, броня или вещь с полем system.thaum (data/models.mjs).

import { SYSTEM_ID, SYSTEM_PATH } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { RollDialog } from "../dice/dialog.mjs";
import { ownTalisman } from "../data/talisman.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.Artifact.${k}`, d) : game.i18n.localize(`VTM20.Artifact.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const D = () => Codex["thaum-artifacts"] ?? {};
const pick = list => list?.length ? list[Math.floor(Math.random() * list.length)] : "";
const die = n => 1 + Math.floor(Math.random() * n);
const weighted = list => {
  const sum = list.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * sum;
  return list.find(x => (r -= x.w) < 0) ?? list.at(-1);
};

export const recipeOf = key => (D().recipes ?? []).find(r => r.key === key) ?? null;

/** Ритуал справочника по английскому названию: V20 впереди Тёмных веков и старых редакций. */
export function ritualOf(en) {
  const list = (Codex.rituals?.thaumaturgy?.rituals ?? []).filter(r => r.en === en);
  return list.find(r => /^V20/.test(r.source) && !r.era) ?? list.find(r => /^V20/.test(r.source)) ?? list[0] ?? null;
}

/** Знает ли персонаж ритуал рецепта: ритуал Тауматургии с одним из русских названий записи (у редакций они разные). */
function knows(actor, en) {
  const names = new Set((Codex.rituals?.thaumaturgy?.rituals ?? []).filter(r => r.en === en).map(r => r.name));
  return actor.items.some(i => i.type === "ritual" && i.system.discipline === "thaumaturgy" && names.has(i.name));
}

const fill = (s, n) => String(s ?? "").replaceAll("{n}", n);
function chargesFor(rec, succ, thaum) {
  if (rec.charges === "succ") return succ;
  if (rec.charges === "thaum") return thaum;
  return Number(rec.charges) || 0;
}

/** Оружие по форме: урон как у близкого по книге (V20, гл. 4): нож +1, меч +2, топор +3, дубина/посох +2 ударный, кол +1, ружьё 8. */
function weaponStats(form) {
  const f = String(form).toLowerCase();
  if (/ружь|винтов|мушкет/.test(f)) return { kind: "firearms", damage: 8, strength: false, damageType: "lethal", range: "200", rate: "1", clip: "5" };
  if (/посох|трость|кий|жезл|зонт/.test(f)) return { kind: "melee", damage: 2, strength: true, damageType: "bashing" };
  if (/топор|секир/.test(f)) return { kind: "melee", damage: 3, strength: true, damageType: "lethal" };
  if (/кол|стрел|кинжал|нож/.test(f)) return { kind: "melee", damage: 1, strength: true, damageType: "lethal" };
  return { kind: "melee", damage: 2, strength: true, damageType: "lethal" };
}

/** Описание вещи: ритуал, создатель, как пользоваться, знаки и примета. */
function describe({ rec, ritual, use, maker, origin, sigil, mark, hook, lasts }) {
  const meta = [ritual ? `<b>${t("Ritual")}:</b> ${esc(ritual.name)} (${ROMAN[(rec?.level ?? ritual.level) - 1] ?? ""})` : "",
    maker ? `<b>${t("Maker")}:</b> ${esc(maker)}` : "", origin ? esc(origin) : "", lasts ? `<b>${t("Lasts")}:</b> ${esc(lasts)}` : ""].filter(Boolean).join(" · ");
  return `<p class="r-art-meta">${meta}</p><p>${esc(use)}</p>`
    + (sigil || mark ? `<p><i>${[sigil ? `${t("Sigils")}: ${esc(sigil)}` : "", mark ? `${t("Mark")}: ${esc(mark)}` : ""].filter(Boolean).join(". ")}.</i></p>` : "")
    + (hook ? `<p class="r-art-hook"><i class="fa-solid fa-feather"></i> ${esc(hook)}</p>` : "");
}

/** Данные предмета Foundry из описания артефакта. */
function itemData(a) {
  const type = a.type ?? "gear";
  const system = { description: a.description, thaum: { kind: a.kind, recipe: a.recipe ?? "", level: a.level ?? 0, charges: a.charges ?? 0, chargesMax: a.chargesMax ?? 0,
    lasts: a.lasts ?? "", maker: a.maker ?? "", makerId: a.makerId ?? "", sigil: a.sigil ?? "", origin: a.origin ?? "", held: false } };
  if (type === "weapon") Object.assign(system, weaponStats(a.form));
  return { name: a.name, type, img: `systems/${SYSTEM_ID}/assets/icons/ritual.svg`, system };
}

async function say(actor, icon, html, cls = "") {
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-art-note ${cls}"><i class="fa-solid ${icon}"></i> ${html}</div>` });
}

/* ── Изготовить вещь ритуалом ─────────────────────────────────────────── */

export async function craftArtifact(actor, key, { form = "", name = "" } = {}) {
  await Codex.load();
  const rec = recipeOf(key), ritual = rec && ritualOf(rec.en);
  if (!rec) return null;
  const thaum = actor.discipline?.("thaumaturgy") ?? 0;
  if (thaum < rec.level) return ui.notifications.warn(t("TooLow", { n: rec.level, have: thaum }));
  form ||= rec.forms[0];
  const title = name.trim() || `${ritual?.name ?? rec.en}: ${form}`;
  const own = ritual?.roll ?? {};
  return RollDialog.prompt(actor, {
    title: t("CraftTitle", { item: title }), subtitle: `${ritual?.name ?? rec.en} · ${ROMAN[rec.level - 1]}`,
    trait1: own.trait1 || "attributes.intelligence", trait2: own.trait1 ? own.trait2 : "abilities.occult",
    difficulty: own.difficulty || Math.min(9, 3 + rec.level), bloodCost: rec.cost ?? 0, kind: "ritual", effect: ritual?.html ?? "",
    diffNote: t("CraftNote", { form }),
    extra: { magic: { disc: "thaumaturgy", level: rec.level, ritual: true } },
    onRolled: async res => {
      const n = res?.successes ?? 0;
      if (res?.outcome === "botch") return say(actor, "fa-skull", t("CraftBotch", { name: esc(actor.name), item: esc(title) }), "is-warn");
      if (!n) return say(actor, "fa-xmark", t("CraftFailed", { name: esc(actor.name), item: esc(title) }), "is-warn");
      const charges = chargesFor(rec, n, thaum), lasts = fill(rec.lasts, n);
      const [it] = await actor.createEmbeddedDocuments("Item", [itemData({ kind: "ritual", recipe: rec.key, level: rec.level, type: rec.type, form, name: title,
        charges, chargesMax: charges, lasts, maker: actor.name, makerId: actor.id,
        description: describe({ rec, ritual, use: fill(rec.use, n), maker: actor.name, lasts }) })]);
      await say(actor, "fa-wand-sparkles", t("Crafted", { name: esc(actor.name), item: esc(title), n })
        + (charges ? ` ${t("ChargesN", { n: charges, unit: esc(rec.unit ?? "") })}` : "") + (lasts ? ` ${t("LastsN", { s: esc(lasts) })}` : ""));
      return it;
    }
  });
}

/* ── Талисман: проект на лунный месяц ─────────────────────────────────── */

export function talismanView(actor) {
  const p = actor.getFlag(SYSTEM_ID, "talismanWork"), T = D().talisman ?? {};
  if (!p) return null;
  return { ...p, weeks: T.weeks ?? 4, need: T.need ?? 20, pct: Math.min(100, Math.round(p.hits / (T.need ?? 20) * 100)),
    kindLabel: t(`Kind.${p.kind}`), left: (T.weeks ?? 4) - p.week };
}

export async function startTalisman(actor, { kind = "talisman", form = "", name = "" } = {}) {
  await Codex.load();
  const T = D().talisman ?? {};
  if (actor.getFlag(SYSTEM_ID, "talismanWork")) return ui.notifications.warn(t("Talisman.Busy"));
  if (kind === "talisman" && ownTalisman(actor)) return ui.notifications.warn(t("Talisman.OnlyOne"));
  if ((actor.discipline?.("thaumaturgy") ?? 0) < 5) return ui.notifications.warn(t("TooLow", { n: 5, have: actor.discipline?.("thaumaturgy") ?? 0 }));
  form ||= (kind === "phylactery" ? D().phylactery?.forms : T.forms)?.[0] ?? "";
  const p = { kind, form, name: name.trim() || t(`Talisman.Default.${kind}`, { form }), week: 0, hits: 0 };
  await actor.setFlag(SYSTEM_ID, "talismanWork", p);
  return say(actor, "fa-moon", t("Talisman.Started", { name: esc(actor.name), item: esc(p.name), need: T.need ?? 20 }));
}

/** Неделя работы: 7 ночей по 1 крови и продолжительная Интеллект + Оккультизм, сл. 8. */
export async function talismanWeek(actor) {
  const p = actor.getFlag(SYSTEM_ID, "talismanWork"), T = D().talisman ?? {};
  if (!p) return null;
  const nights = 7;
  if ((actor.system.blood?.value ?? 0) < nights) return ui.notifications.warn(t("Talisman.NoBlood", { n: nights }));
  return RollDialog.prompt(actor, {
    title: t("Talisman.WeekTitle", { item: p.name, n: p.week + 1 }), trait1: "attributes.intelligence", trait2: "abilities.occult",
    difficulty: T.diff ?? 8, lockTraits: true, kind: "ritual", diffNote: t("Talisman.WeekNote", { hits: p.hits, need: T.need ?? 20, n: p.week + 1 }),
    onRolled: async res => {
      const q = foundry.utils.deepClone(actor.getFlag(SYSTEM_ID, "talismanWork"));
      if (!q) return;
      await actor.spendBlood(nights, { reason: q.name, limit: false });
      const n = res?.successes ?? 0;
      if (res?.outcome === "botch") {
        await actor.unsetFlag(SYSTEM_ID, "talismanWork");
        return say(actor, "fa-fire", t("Talisman.Ruined", { item: esc(q.name) }), "is-warn");
      }
      q.week += 1; q.hits += n;
      if (q.week < (T.weeks ?? 4)) {
        await actor.setFlag(SYSTEM_ID, "talismanWork", q);
        return say(actor, "fa-moon", t("Talisman.Progress", { item: esc(q.name), n: q.week, hits: q.hits, need: T.need ?? 20 }));
      }
      await actor.unsetFlag(SYSTEM_ID, "talismanWork");
      if (q.hits < (T.need ?? 20)) return say(actor, "fa-fire", t("Talisman.Short", { item: esc(q.name), hits: q.hits, need: T.need ?? 20 }), "is-warn");
      return finishTalisman(actor, q);
    }
  });
}

async function finishTalisman(actor, q) {
  const phyl = q.kind === "phylactery", T = D().talisman ?? {};
  const type = (T.weapons ?? []).some(w => q.form.includes(w)) ? "weapon" : "gear";
  const ritual = ritualOf(phyl ? D().phylactery?.en : T.en);
  if (phyl) {
    const perm = actor.system.willpower?.permanent ?? 0;
    await actor.update({ "system.willpower.permanent": Math.max(0, perm - 1), "system.willpower.temporary": Math.min(actor.system.willpower.temporary, Math.max(0, perm - 1)) });
  }
  const [it] = await actor.createEmbeddedDocuments("Item", [itemData({ kind: q.kind, recipe: q.kind, level: 5, type, form: q.form, name: q.name,
    maker: actor.name, makerId: actor.id,
    description: describe({ ritual, rec: { level: 5 }, use: phyl ? D().phylactery?.text : T.bonuses, maker: actor.name }) })]);
  await say(actor, "fa-staff-snake", t(phyl ? "Talisman.DonePhyl" : "Talisman.Done", { name: esc(actor.name), item: esc(q.name) }));
  return it;
}

export async function abandonTalisman(actor) {
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("Talisman.Title") }, content: `<p>${t("Talisman.AbandonAsk")}</p>`, rejectClose: false });
  return ok ? actor.unsetFlag(SYSTEM_ID, "talismanWork") : null;
}

/* ── Заряды и «в руке» на листе ───────────────────────────────────────── */

/** Варианты для листа предмета (templates/item/parts/thaum.hbs): вид артефакта и создатель-талисмана из персонажей мира. */
export function thaumOptions(item) {
  const a = item.system.thaum ?? {}, owner = item.parent;
  const show = !!a.kind || (owner?.discipline?.("thaumaturgy") ?? 0) > 0;
  const kinds = ["", "talisman", "phylactery", "ritual", "spontaneous"].map(k => ({ value: k, label: k ? t(`Kind.${k}`) : "—", selected: k === a.kind }));
  const actors = [...(game.actors ?? [])].filter(x => x.type === "vampire" || x.id === a.makerId);
  const makers = [{ value: "", label: "—", selected: !a.makerId }, ...actors.map(x => ({ value: x.id, label: x.name, selected: x.id === a.makerId }))];
  return { show, kinds, makers };
}

/** Артефакты персонажа для вкладки «Снаряжение». */
export function artifactsView(actor) {
  const list = actor.items.filter(i => ["weapon", "armor", "gear"].includes(i.type) && i.system.thaum?.kind).map(i => {
    const a = i.system.thaum, rec = recipeOf(a.recipe);
    return { id: i.id, name: i.name, kind: a.kind, kindLabel: t(`Kind.${a.kind}`), level: a.level ? ROMAN[a.level - 1] : "",
      charges: a.charges, chargesMax: a.chargesMax, hasCharges: a.chargesMax > 0, unit: rec?.unit ?? "",
      pips: a.chargesMax > 0 && a.chargesMax <= 12 ? Array.from({ length: a.chargesMax }, (_, k) => ({ on: k < a.charges })) : null,
      lasts: a.lasts, maker: a.maker, held: a.held, talisman: a.kind === "talisman" || a.kind === "phylactery",
      own: a.makerId === actor.id, foreign: a.kind === "talisman" && a.makerId && a.makerId !== actor.id };
  });
  const work = talismanView(actor);
  const thaum = actor.discipline?.("thaumaturgy") ?? 0;
  return list.length || work || thaum ? { list, work, canWork: thaum > 0 } : null;
}

/** Потратить заряд: −1 и карточка с описанием в чат. */
export async function useCharge(actor, id) {
  const it = actor.items.get(id), a = it?.system.thaum;
  if (!a?.kind) return null;
  if (a.chargesMax && a.charges <= 0) return ui.notifications.warn(t("NoCharges", { item: it.name }));
  if (a.chargesMax) await it.update({ "system.thaum.charges": a.charges - 1 });
  const left = a.chargesMax ? a.charges - 1 : null;
  return say(actor, "fa-wand-sparkles", `<b>${esc(it.name)}</b>${left != null ? ` <small>(${t("ChargesLeft", { n: left })})</small>` : ""}
    <div class="r-art-text">${it.system.description ?? ""}</div>`);
}

export async function toggleHeld(actor, id) {
  const it = actor.items.get(id);
  if (!it?.system.thaum?.kind) return null;
  return it.update({ "system.thaum.held": !it.system.thaum.held });
}

/* ── Находка для рассказчика ──────────────────────────────────────────── */

/**
 * Случайный артефакт: рецепт (уровни пониже чаще; легенды — редко или по выбору), потерянный талисман, спонтанный талисман.
 * opts: level — "any" | "1".."5" | "legend"; type — "any" | "weapon" | "gear"; era — ключ эпохи или "any"; spont — спонтанный талисман.
 */
export function rollFind({ level = "any", type = "any", era = "any", spont = false } = {}) {
  const d = D();
  if (spont) {
    const s = pick(d.spontaneous?.list ?? []);
    return s ? { spont: true, kind: "spontaneous", type: "gear", name: s.name, form: s.form, en: s.en, boon: s.boon, price: s.price, note: d.spontaneous.note,
      description: `<p><b>${t("Boon")}:</b> ${esc(s.boon)}</p><p><b>${t("Price")}:</b> ${esc(s.price)}</p><p><i>${esc(d.spontaneous.note)}</i></p>` } : null;
  }
  const E = d.eras ?? [], e = E.find(x => x.key === era) ?? pick(E);
  const year = e ? e.years[0] + Math.floor(Math.random() * (e.years[1] - e.years[0] + 1)) : "";
  // капелла, которая в этот год уже (и ещё) стоит: Нью-Йорк — с XVII века, Цеорис — до 1476
  const chantry = pick((d.chantries ?? []).filter(c => !year || (year >= (c.from ?? 0) && year <= (c.to ?? 9999))))?.name ?? "";
  const who = pick(d.names), rank = weighted(d.makers?.length ? d.makers : [{ rank: "", w: 1 }]).rank;
  const maker = [who, rank].filter(Boolean).join(", ");
  const origin = [chantry, year && `${year}`].filter(Boolean).join(", ") + (e ? ` (${e.label})` : "");
  const sigil = pick(d.sigils), mark = pick(d.marks), hook = pick(d.hooks);

  // потерянный талисман (≈1 из 12, если не задан уровень ниже 5 и тип не мешает)
  const T = d.talisman ?? {};
  if ((level === "any" || level === "5") && Math.random() < 1 / 12) {
    const form = pick(T.forms);
    const wtype = (T.weapons ?? []).some(w => form.includes(w)) ? "weapon" : "gear";
    if (type === "any" || type === wtype) {
      const ritual = ritualOf(T.en);
      return { kind: "talisman", recipe: "talisman", level: 5, roman: ROMAN[4], type: wtype, form, name: t("Find.LostTalisman", { form, maker: who }),
        maker, origin, sigil, mark, hook, ritualName: ritual?.name ?? T.en,
        description: describe({ ritual, rec: { level: 5 }, use: `${T.bonuses} ${t("Find.TalismanForeign")}`, maker, origin, sigil, mark, hook }) };
    }
  }
  let pool = (d.recipes ?? []).filter(r => (type === "any" || r.type === type));
  if (level === "legend") pool = pool.filter(r => r.legend);
  else if (level !== "any") pool = pool.filter(r => r.level === Number(level) && !r.legend);
  else pool = pool.filter(r => !r.legend || Math.random() < 0.15);
  if (!pool.length) return null;
  const rec = weighted(pool.map(r => ({ ...r, w: r.legend ? 0.4 : Math.max(1, 6 - r.level) })));
  const ritual = ritualOf(rec.en), succ = die(4), thaum = Math.max(rec.level, die(5));
  const max = chargesFor(rec, succ, thaum), charges = max ? die(max) : 0;
  const form = pick(rec.forms), lasts = fill(rec.lasts, succ);
  return { kind: "ritual", recipe: rec.key, level: rec.level, roman: ROMAN[rec.level - 1], type: rec.type, form, name: `${ritual?.name ?? rec.en}: ${form}`, maker, origin, sigil, mark, hook,
    charges, chargesMax: max, lasts, unit: rec.unit ?? "", ritualName: ritual?.name ?? rec.en, legend: !!rec.legend, secret: !!rec.secret,
    description: describe({ rec, ritual, use: fill(rec.use, succ), maker, origin, sigil, mark, hook, lasts }) };
}

/* ── Окно мастерской ─────────────────────────────────────────────────── */

/** Открыть мастерскую персонажа (или рассказчика — без персонажа, только находки). */
export async function openWorkshop(actor = null, mode = "") {
  await Codex.load();
  const id = `r-thaum-${actor?.id ?? "gm"}`;
  const open = foundry.applications.instances.get(id);
  if (open) { if (mode) open.v.mode = mode; open.render(); open.bringToFront(); return open; }
  return new Workshop(actor, mode).render({ force: true });
}

class Workshop extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-dialog", "r-thaum", "r-type-vampire"],
    window: { title: "VTM20.Artifact.Title", icon: "fa-solid fa-staff-snake", resizable: true },
    position: { width: 860, height: 680 },
    actions: { mode: Workshop.#onMode, recipe: Workshop.#onRecipe, craft: Workshop.#onCraft, start: Workshop.#onStart,
      week: Workshop.#onWeek, abandon: Workshop.#onAbandon, roll: Workshop.#onRoll, give: Workshop.#onGive, toWorld: Workshop.#onToWorld, toChat: Workshop.#onToChat }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/apps/thaum-workshop.hbs`, scrollable: [".r-th-list", ".r-th-card"] } };

  constructor(actor, mode) {
    super({ id: `r-thaum-${actor?.id ?? "gm"}` });
    this.actor = actor;
    this.v = { mode: mode || (actor ? "craft" : "find"), recipe: D().recipes?.[0]?.key ?? "", form: "", name: "", tkind: "talisman",
      find: { level: "any", type: "any", era: "any", spont: false }, found: null };
  }

  get title() { return this.actor ? `${game.i18n.localize("VTM20.Artifact.Title")}: ${this.actor.name}` : game.i18n.localize("VTM20.Artifact.Title"); }

  async _prepareContext() {
    const v = this.v, a = this.actor, d = D(), gm = game.user.isGM;
    const thaum = a?.discipline?.("thaumaturgy") ?? 0;
    const modes = [...(a ? ["craft", "talisman"] : []), ...(gm || !a ? ["find"] : [])]
      .map(k => ({ key: k, label: t(`Mode.${k}`), icon: { craft: "fa-flask", talisman: "fa-staff-snake", find: "fa-dice" }[k], active: v.mode === k }));
    const ctx = { v, modes, actor: a, gm, thaum, isCraft: v.mode === "craft", isTalisman: v.mode === "talisman", isFind: v.mode === "find" };

    if (ctx.isCraft) {
      const recipes = (d.recipes ?? []).map(r => {
        const rit = ritualOf(r.en), known = knows(a, r.en);
        return { key: r.key, name: rit?.name ?? r.en, en: r.en, level: r.level, roman: ROMAN[r.level - 1], known, low: thaum < r.level,
          active: r.key === v.recipe, legend: !!r.legend, typeIcon: r.type === "weapon" ? "fa-khanda" : "fa-gem" };
      });
      ctx.groups = [...new Set(recipes.map(r => r.level))].sort((x, y) => x - y)
        .map(l => ({ roman: ROMAN[l - 1], list: recipes.filter(r => r.level === l) }));
      const rec = recipeOf(v.recipe), rit = rec && ritualOf(rec.en);
      if (rec) {
        const known = knows(a, rec.en);
        ctx.card = { ...rec, name: rit?.name ?? rec.en, roman: ROMAN[rec.level - 1], html: rit?.html ?? "", source: rit?.source ?? "",
          forms: rec.forms.map(f => ({ value: f, selected: f === v.form })), known, low: thaum < rec.level, canCraft: (known || gm) && thaum >= rec.level,
          chargesText: rec.charges === "succ" ? t("ChargesSucc", { unit: rec.unit ?? "" }) : rec.charges === "thaum" ? t("ChargesThaum", { unit: rec.unit ?? "" })
            : rec.charges ? t("ChargesFixed", { n: rec.charges, unit: rec.unit ?? "" }) : "",
          lastsText: rec.lasts ? fill(rec.lasts, t("PerSuccess")) : "", use: fill(rec.use, t("PerSuccessN")),
          diff: Math.min(9, 3 + rec.level), typeLabel: game.i18n.localize(`TYPES.Item.${rec.type}`) };
      }
    }

    if (ctx.isTalisman) {
      const T = d.talisman ?? {}, rit = ritualOf(T.en), phyl = ritualOf(d.phylactery?.en);
      ctx.work = talismanView(a);
      ctx.own = ownTalisman(a)?.name ?? "";
      ctx.talisman = { html: rit?.html ?? "", bonuses: T.bonuses, phylText: d.phylactery?.text ?? "", known: knows(a, T.en), knownPhyl: knows(a, d.phylactery?.en),
        kinds: ["talisman", "phylactery"].map(k => ({ value: k, label: t(`Kind.${k}`), selected: k === v.tkind })),
        forms: ((v.tkind === "phylactery" ? d.phylactery?.forms : T.forms) ?? []).map(f => ({ value: f, selected: f === v.form })),
        canStart: thaum >= 5 && (gm || knows(a, v.tkind === "phylactery" ? d.phylactery?.en : T.en)) && !(v.tkind === "talisman" && ctx.own),
        nights: T.nights ?? 28, need: T.need ?? 20, diff: T.diff ?? 8, phylName: phyl?.name ?? "", low: thaum < 5 };
    }

    if (ctx.isFind) {
      const f = v.find;
      ctx.find = {
        levels: ["any", "1", "2", "3", "4", "5", "legend"].map(k => ({ value: k, label: k === "any" ? t("Find.Any") : k === "legend" ? t("Find.Legend") : ROMAN[Number(k) - 1], selected: k === f.level })),
        types: ["any", "gear", "weapon"].map(k => ({ value: k, label: k === "any" ? t("Find.Any") : game.i18n.localize(`TYPES.Item.${k}`), selected: k === f.type })),
        eras: [{ value: "any", label: t("Find.Any"), selected: f.era === "any" }, ...(d.eras ?? []).map(e => ({ value: e.key, label: e.label, selected: e.key === f.era }))],
        spont: f.spont, found: v.found, target: this.#target()?.name ?? ""
      };
    }
    return ctx;
  }

  /** Кому отдать находку: персонаж окна, иначе выбранный токен. */
  #target() { return this.actor ?? canvas?.tokens?.controlled?.[0]?.actor ?? null; }

  /** Поля окна (вид, имя, настройки находки) — в состояние до действия. */
  #read() {
    const val = n => this.element?.querySelector(`[name="${n}"]`);
    if (val("form")) this.v.form = val("form").value;
    if (val("name")) this.v.name = val("name").value;
    if (val("tkind")) this.v.tkind = val("tkind").value;
    for (const k of ["level", "type", "era"]) if (val(`find.${k}`)) this.v.find[k] = val(`find.${k}`).value;
    if (val("find.spont")) this.v.find.spont = val("find.spont").checked;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    // смена вида проекта — перерисовка: у талисмана и филактерия свои формы
    this.element.querySelector('[name="tkind"]')?.addEventListener("change", () => { this.#read(); this.v.form = ""; this.render(); });
  }

  static #onMode(event, target) { this.#read(); this.v.mode = target.dataset.mode; this.render(); }
  static #onRecipe(event, target) { this.#read(); Object.assign(this.v, { recipe: target.dataset.key, form: "", name: "" }); this.render(); }
  static async #onCraft() { this.#read(); await craftArtifact(this.actor, this.v.recipe, { form: this.v.form, name: this.v.name }); }
  static async #onStart() { this.#read(); await startTalisman(this.actor, { kind: this.v.tkind, form: this.v.form, name: this.v.name }); this.render(); }
  static async #onWeek() { await talismanWeek(this.actor); }
  static async #onAbandon() { await abandonTalisman(this.actor); this.render(); }
  static #onRoll() { this.#read(); this.v.found = rollFind(this.v.find); if (!this.v.found) ui.notifications.warn(t("Find.Nothing")); this.render(); }
  static async #onGive() {
    const who = this.#target(), f = this.v.found;
    if (!f) return;
    if (!who) return ui.notifications.warn(t("Find.NoTarget"));
    if (!who.isOwner) return ui.notifications.warn(t("Find.NoRights", { name: who.name }));
    await who.createEmbeddedDocuments("Item", [itemData(f)]);
    ui.notifications.info(t("Find.Given", { item: f.name, name: who.name }));
  }
  static async #onToWorld() {
    const f = this.v.found;
    if (!f || !game.user.isGM) return;
    await Item.create(itemData(f));
    ui.notifications.info(t("Find.ToWorldDone", { item: f.name }));
  }
  static async #onToChat() {
    const f = this.v.found;
    if (!f) return;
    return ChatMessage.create({ content: `<div class="r-notice r-art-note"><i class="fa-solid fa-staff-snake"></i> <b>${esc(f.name)}</b>${f.charges ? ` <small>(${t("ChargesN", { n: f.charges, unit: esc(f.unit ?? "") })})</small>` : ""}<div class="r-art-text">${f.description}</div></div>`,
      whisper: game.user.isGM ? [game.user.id] : [] });
  }
}
