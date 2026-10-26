// module/apps/eb-servant.mjs
// Слуга Привязанного (Earthbound, гл. 3 «Проклятые души: слуги Привязанных»).
//   · Ритуал наделения: доброволец проходит ритуал подчинения и касается реликвария (или хозяин в форме касается его);
//     Привязанный тратит пункт временной Веры (сначала из реликвария), слуга навсегда теряет пункт постоянной Воли.
//   · Каждое наделение — 15 пунктов на силы и 3 пункта стигматов (data/eb-servants.mjs).
//   · Урезанный призыв — один, не выше 3-го круга, только высокой Муки: бросок Воли, сл. 7, или пункт Воли; эффекты,
//     что зависят от Веры или Муки, считаются по постоянной Воле слуги.
//   · Три наделения — раб: приказ хозяина исполняет всегда, переманить нельзя; против чужого подчинения разума
//     сложность его бросков Воли на 3 ниже (не ниже 3).

import { SYSTEM_PATH } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { EB_POWERS, EB_STIGMATA, EB_EVOCATION_COST } from "../data/eb-servants.mjs";
import { rollPool } from "../dice/roll.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.EbServant.${k}`, d) : game.i18n.localize(`VTM20.EbServant.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const ROMAN = ["I", "II", "III"];
const notice = (actor, icon, html, cls = "") => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="r-notice r-type-demon r-earthbound ${cls}"><i class="fa-solid ${icon}"></i> ${html}</div>` });

/** Пункты: дано (15 за наделение) и потрачено; стигматы — нужно (3 за наделение) и выбрано. */
export function ebBudget(actor) {
  const s = actor.system.ebServant ?? {}, n = s.empowerments ?? 0;
  const boosts = (s.boosts ?? []).reduce((sum, b) => sum + b.dots * (b.key.startsWith("attributes.") ? 5 : 2), 0);
  const evo = s.evocation ? Number(s.evocation.split(":")[1]) * EB_EVOCATION_COST : 0;
  const powers = (s.powers ?? []).reduce((sum, p) => sum + (p.cost ?? 0), 0);
  return { total: 15 * n, used: boosts + evo + powers, stigmaNeed: 3 * n, stigmaUsed: (s.stigmata ?? []).reduce((sum, x) => sum + (x.cost ?? 0), 0), slave: n >= 3 };
}

/** Ритуал наделения силой: хозяин — Привязанный; −1 Вера хозяину, −1 постоянная Воля слуге, +15 пунктов и +3 стигмата. */
export async function empower(actor) {
  const s = actor.system.ebServant ?? {};
  const masters = game.actors.filter(a => a.type === "demon" && a.system.earthbound);
  if (!masters.length) return ui.notifications.warn(t("NoMasters"));
  const content = `<p class="r-choice-hint">${t("RitualHint")}</p><div class="r-fields">
    <label class="r-f is-span2"><span>${t("Master")}</span><select name="master">${masters.map(m =>
      `<option value="${m.uuid}" ${m.uuid === s.master ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></label>
    <label class="r-f is-span2"><span>${t("Sacrifice")}</span><input type="text" name="sacrifice" placeholder="${esc(t("SacrificePh"))}"></label></div>`;
  const v = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("Ritual") }, classes: ["vtm20", "r-dialog", "r-type-demon", "r-earthbound"], position: { width: 460 }, content,
    ok: { label: t("RitualDo"), callback: (ev, btn) => ({ master: btn.form.elements.master.value, sacrifice: btn.form.elements.sacrifice.value.trim() }) }
  }).catch(() => null);
  if (!v) return null;
  const master = await fromUuid(v.master);
  if (master?.isOwner) {
    const r = master.system.reliquary?.faith ?? 0, f = master.system.faith.temporary;
    if (r + f < 1) return ui.notifications.warn(t("MasterNoFaith", { name: master.name }));
    await master.update(r > 0 ? { "system.reliquary.faith": r - 1 } : { "system.faith.temporary": f - 1 });
  }
  const w = actor.system.willpower, perm = Math.max(0, w.permanent - 1);
  await actor.update({ "system.ebServant.master": v.master, "system.ebServant.empowerments": (s.empowerments ?? 0) + 1,
    "system.willpower.permanent": perm, "system.willpower.temporary": Math.min(w.temporary, perm) });
  const n = actor.system.ebServant.empowerments;
  await notice(actor, "fa-gem", t(n >= 3 ? "EmpoweredSlave" : "Empowered", { name: esc(actor.name), master: esc(master?.name ?? ""), n,
    sacrifice: esc(v.sacrifice || "—") }), n >= 3 ? "is-sin" : "");
  return openEbServant(actor);
}

/** Применить силу: Воля и бросок, если есть; карточка с пересказом. */
export async function usePower(actor, key) {
  const p = EB_POWERS.find(x => x.key === key);
  if (!p) return null;
  if (p.will && !(await actor.spendWillpower(p.will))) return ui.notifications.warn(t("NoWill"));
  if (p.roll) {
    const [t1, t2, diff] = p.roll, pool = actor.traitValue(t1) + (t2 ? actor.traitValue(t2) : 0);
    return rollPool({ actor, title: p.name, subtitle: t("Kind"), pool, difficulty: diff, kind: "ebPower",
      effect: `<p>${esc(p.text)}</p>${p.vs ? `<p><em>${t("Vs")}: ${esc(p.vs)}</em></p>` : ""}`,
      breakdown: [{ label: actor.traitLabel(t1), value: actor.traitValue(t1) }, ...(t2 ? [{ label: actor.traitLabel(t2), value: actor.traitValue(t2) }] : [])] });
  }
  return notice(actor, "fa-hand-sparkles", `<b>${esc(p.name)}</b>${p.will ? ` (−${p.will} ${t("WillShort")})` : ""}: ${esc(p.text)}`);
}

/** Урезанный призыв: бросок Воли, сл. 7, или пункт Воли; эффект — высокой Муки. */
export async function useEvocation(actor) {
  const s = actor.system.ebServant, [lore, lv] = (s?.evocation ?? "").split(":"), d = Codex.lore(lore), p = d?.powers?.find(x => x.level === Number(lv));
  if (!p) return null;
  const how = await foundry.applications.api.DialogV2.wait({ window: { title: p.name }, classes: ["vtm20", "r-dialog"], position: { width: 400 },
    content: `<p>${t("EvoHow")}</p>`, buttons: [{ action: "roll", label: t("EvoRoll"), icon: "fa-solid fa-dice-d10", default: true }, { action: "spend", label: t("EvoSpend"), icon: "fa-solid fa-sun" }]
  }).catch(() => null);
  if (!how) return null;
  if (how === "spend") {
    if (!(await actor.spendWillpower(1))) return ui.notifications.warn(t("NoWill"));
    const T = foundry.applications.ux.TextEditor.implementation;
    const m = /<p>\s*<strong>\s*Высокая Мука:\s*<\/strong>\s*/i.exec(p.html ?? ""), high = m ? `<p>${p.html.slice(m.index + m[0].length)}` : p.html;
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-demon r-earthbound"><i class="fa-solid fa-fire"></i> <b>${esc(p.name)}</b> — ${t("EvoSpent")}</div><div class="r-card-effect">${await T.enrichHTML(high ?? "")}</div>` });
  }
  const will = actor.system.willpower.permanent;
  // Мука 10 — карточка покажет эффект высокой Муки (у слуги другого нет)
  return rollPool({ actor, title: p.name, subtitle: `${d.name} · ${ROMAN[p.level - 1]}`, pool: will, difficulty: 7, kind: "ebEvocation", effect: p.html,
    breakdown: [{ label: game.i18n.localize("VTM20.Willpower"), value: will }], extra: { torment: 10 } });
}

class EbServantWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(actor) {
    super({ id: `r-ebs-${actor.id}`, window: { title: `${t("Title")}: ${actor.name}` } });
    this.actor = actor;
    this.hook = Hooks.on("updateActor", a => { if (a === this.actor) this.render(); });
  }

  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-dialog", "r-gifts", "r-ebs", "r-type-demon", "r-earthbound"],
    window: { icon: "fa-solid fa-gem", resizable: true },
    position: { width: 600, height: "auto" },
    actions: { empower: EbServantWindow.#onEmpower, addPower: EbServantWindow.#onAddPower, addStigma: EbServantWindow.#onAddStigma,
      addBoost: EbServantWindow.#onAddBoost, setEvo: EbServantWindow.#onSetEvo, del: EbServantWindow.#onDel,
      use: EbServantWindow.#onUse, useEvo: EbServantWindow.#onUseEvo, open: EbServantWindow.#onOpen }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/apps/eb-servant.hbs` } };

  get isEarthbound() { return true; }
  async close(o) { Hooks.off("updateActor", this.hook); return super.close(o); }

  async _prepareContext() {
    await Codex.load();
    const a = this.actor, s = a.system.ebServant ?? {}, b = ebBudget(a);
    const master = s.master ? await fromUuid(s.master) : null;
    const lores = master ? master.items.filter(i => i.type === "lore").map(i => ({ d: Codex.lore(i.system.key), v: i.system.value })).filter(x => x.d) : [];
    const [eLore, eLv] = (s.evocation ?? "").split(":"), evo = eLore ? Codex.lore(eLore)?.powers?.find(x => x.level === Number(eLv)) : null;
    return {
      editable: a.isOwner, master: master?.name ?? "", masterUuid: s.master, n: s.empowerments ?? 0, budget: b,
      over: b.used > b.total, stigmaShort: b.stigmaUsed < b.stigmaNeed,
      powers: (s.powers ?? []).map((p, i) => { const d = EB_POWERS.find(x => x.key === p.key); return { i, key: p.key, name: d?.name ?? p.key, cost: p.cost, text: d?.text ?? "",
        usable: !!(d?.roll || d?.will), will: d?.will ?? 0, note: p.note }; }),
      stigmata: (s.stigmata ?? []).map((x, i) => { const d = EB_STIGMATA.find(y => y.key === x.key); return { i, name: d?.name ?? x.key, cost: x.cost, text: d?.text ?? "", note: x.note }; }),
      boosts: (s.boosts ?? []).map((x, i) => ({ i, label: `${a.traitLabel(x.key)} +${x.dots}`, cost: x.dots * (x.key.startsWith("attributes.") ? 5 : 2) })),
      evocation: evo ? { name: evo.name, level: ROMAN[evo.level - 1], cost: evo.level * EB_EVOCATION_COST, lore: Codex.lore(eLore)?.name } : null,
      powerOptions: EB_POWERS.map(p => ({ value: p.key, label: `${p.name} · ${p.cost}` })),
      stigmaOptions: EB_STIGMATA.map(x => ({ value: x.key, label: `${x.name} · ${x.cost}` })),
      traitOptions: [...Object.keys(a.system.attributes).map(k => ({ value: `attributes.${k}`, label: `${a.traitLabel(`attributes.${k}`)} · 5` })),
        ...Object.keys(a.system.abilities).map(k => ({ value: `abilities.${k}`, label: `${a.traitLabel(`abilities.${k}`)} · 2` }))],
      evoOptions: lores.flatMap(({ d, v }) => (d.powers ?? []).filter(p => p.level <= Math.min(3, v))
        .map(p => ({ value: `${d.key}:${p.level}`, label: `${d.name} ${ROMAN[p.level - 1]} — ${p.name} · ${p.level * EB_EVOCATION_COST}` })))
    };
  }

  #val(name) { return this.element.querySelector(`[name="${name}"]`)?.value ?? ""; }
  async #save(patch, cost = 0) {
    const b = ebBudget(this.actor);
    if (cost && b.used + cost > b.total) return ui.notifications.warn(t("Over", { need: b.used + cost, total: b.total }));
    return this.actor.update(patch);
  }

  static #onEmpower() { return empower(this.actor); }
  static #onAddPower() {
    const p = EB_POWERS.find(x => x.key === this.#val("power")), s = this.actor.system.ebServant;
    if (p) return this.#save({ "system.ebServant.powers": [...(s.powers ?? []), { key: p.key, cost: p.cost, note: this.#val("powerNote") }] }, p.cost);
  }
  static #onAddStigma() {
    const x = EB_STIGMATA.find(y => y.key === this.#val("stigma")), s = this.actor.system.ebServant;
    const cost = x?.key === "senses" && this.#val("stigmaNote").match(/слеп|глух/i) ? 2 : x?.cost;
    if (x) return this.actor.update({ "system.ebServant.stigmata": [...(s.stigmata ?? []), { key: x.key, cost, note: this.#val("stigmaNote") }] });
  }
  static async #onAddBoost() {
    const key = this.#val("trait"), dots = Math.max(1, Number(this.#val("dots")) || 1), a = this.actor, s = a.system.ebServant;
    const cur = foundry.utils.getProperty(a.system, `${key}.value`) ?? 0, add = Math.min(dots, 5 - cur);
    if (add <= 0) return ui.notifications.warn(t("Max5"));
    const cost = add * (key.startsWith("attributes.") ? 5 : 2);
    return this.#save({ "system.ebServant.boosts": [...(s.boosts ?? []), { key, dots: add }], [`system.${key}.value`]: cur + add }, cost);
  }
  static #onSetEvo() {
    const v = this.#val("evo"), s = this.actor.system.ebServant;
    const old = s.evocation ? Number(s.evocation.split(":")[1]) * EB_EVOCATION_COST : 0, cost = Number(v.split(":")[1]) * EB_EVOCATION_COST;
    if (v) return this.#save({ "system.ebServant.evocation": v }, cost - old);
  }
  static async #onDel(event, target) {
    const kind = target.dataset.kind, i = Number(target.dataset.index), a = this.actor, s = a.system.ebServant;
    if (kind === "evocation") return a.update({ "system.ebServant.evocation": "" });
    const list = (s[kind] ?? []).filter((_, j) => j !== i), upd = { [`system.ebServant.${kind}`]: list };
    if (kind === "boosts") { const b = s.boosts[i]; upd[`system.${b.key}.value`] = Math.max(b.key.startsWith("attributes.") ? 1 : 0, (foundry.utils.getProperty(a.system, `${b.key}.value`) ?? 0) - b.dots); }
    return a.update(upd);
  }
  static #onUse(event, target) { return usePower(this.actor, target.dataset.key); }
  static #onUseEvo() { return useEvocation(this.actor); }
  static async #onOpen(event, target) { (await fromUuid(target.dataset.uuid))?.sheet?.render(true); }
}

export function openEbServant(actor) {
  const app = foundry.applications.instances.get(`r-ebs-${actor.id}`) ?? new EbServantWindow(actor);
  return app.render({ force: true });
}
