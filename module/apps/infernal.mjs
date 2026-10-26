// module/apps/infernal.mjs
// Инфернализм вампиров, гулей и смертных (справочник «Договоры, пакты и дары демонов вампирам»; глава правил 9):
//   · Вложение V20 (Rites of the Blood) — 3 опыта, отдельная сделка, не больше постоянной Воли; скрепляется
//     злодеянием по выбору демона и проверкой Человечности (деградация). Старые Вложения книг Шабаша — рейтинг 1–6,
//     цену назначает рассказчик.
//   · Применение — кровь, Воля или постоянная Воля по Вложению; бросок, если он есть; смертный платит за кровь
//     уровнями летальных повреждений (Коварный шёпот — 2).
//   · Договор: с кем, форма (обмен услугами, разовое наделение, истинный пакт), условия, плата, злодеяние, метка слуги
//     демона; рейтинг по Devil’s Due = обязательство + последствие − частота (больше нуля — сделка в силе).

import { rollPool } from "../dice/roll.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Infernal.${k}`, d) : game.i18n.localize(`VTM20.Infernal.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const FORMS = ["barter", "empowerment", "foedus"];

/** Рейтинг договора по Devil’s Due. */
export const pactValue = p => (p.obligation ?? 0) + (p.consequence ?? 0) - (p.frequency ?? 0);

/** Вложения V20 у персонажа и предел — постоянная Воля. */
export function investmentLimit(actor) {
  const v20 = actor.items.filter(i => i.type === "investment" && i.system.tier === "v20").length;
  return { v20, max: actor.system.willpower?.permanent ?? 0 };
}

/** Сделка за Вложение скреплена: злодеяние словами и проверка Человечности (деградация, Совесть). */
export async function sealInvestment(actor, item) {
  const deed = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("SealTitle", { name: item.name }) }, classes: ["vtm20", "r-dialog"], position: { width: 460 },
    content: `<p class="r-choice-hint">${t("SealHint")}</p><div class="r-fields">
      <label class="r-f is-span2"><span>${t("Demon")}</span><input type="text" name="pact" placeholder="${esc(t("DemonPh"))}"></label>
      <label class="r-f is-span2"><span>${t("Deed")}</span><input type="text" name="deed" placeholder="${esc(t("DeedPh"))}"></label></div>`,
    ok: { label: t("SealBtn"), callback: (ev, btn) => ({ pact: btn.form.elements.pact.value.trim(), deed: btn.form.elements.deed.value.trim() }) }
  }).catch(() => null);
  if (!deed) return null;
  await item.update({ "system.pact": deed.pact, "system.deed": deed.deed });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice is-sin"><i class="fa-solid fa-file-contract"></i> ${
    t("Sealed", { name: esc(actor.name), inv: esc(item.name), demon: esc(deed.pact || "—"), deed: esc(deed.deed || "—") })}</div>` });
  // злодеяние — проверка морали (у вампира и гуля — Совесть, сл. 6)
  if (actor.system.virtues?.conscience) {
    const { rollVirtueCheck } = await import("../dice/virtue-checks.mjs");
    return rollVirtueCheck(actor, "degeneration");
  }
  return true;
}

/** Применить Вложение: заплатить кровью, Волей, постоянной Волей; бросок, если есть; карточка в чат. */
export async function useInvestment(actor, item) {
  const c = item.system.cost ?? {}, s = actor.system;
  const parts = [c.blood ? t("CostBlood", { n: c.blood }) : "", c.willpower ? t("CostWill", { n: c.willpower }) : "",
    c.willpowerPerm ? t("CostWillPerm", { n: c.willpowerPerm }) : ""].filter(Boolean);
  if (parts.length) {
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: item.name },
      content: `<p>${t("PayConfirm", { cost: parts.join(", ") })}</p>${item.system.costNote ? `<p class="r-note">${esc(item.system.costNote)}</p>` : ""}` });
    if (!ok) return null;
    // кровь: у вампира и гуля — пункты крови, у смертного — уровни летальных повреждений
    if (c.blood) {
      if (actor.hasBlood) { if (!(await actor.spendBlood(c.blood))) return ui.notifications.warn(t("NoBlood", { n: c.blood })); }
      else await actor.update({ "system.health.lethal": Math.min(7, (s.health?.lethal ?? 0) + c.blood) });
    }
    if (c.willpower && !(await actor.spendWillpower(c.willpower))) return ui.notifications.warn(t("NoWill", { n: c.willpower }));
    if (c.willpowerPerm) {
      const w = s.willpower, perm = Math.max(0, w.permanent - c.willpowerPerm);
      await actor.update({ "system.willpower.permanent": perm, "system.willpower.temporary": Math.min(w.temporary, perm) });
    }
  }
  const T = foundry.applications.ux.TextEditor.implementation;
  const body = await T.enrichHTML(item.system.description ?? "", { relativeTo: item });
  if (item.system.roll?.trait1) {
    const r = item.system.roll, pool = actor.traitValue(r.trait1) + (r.trait2 ? actor.traitValue(r.trait2) : 0);
    return rollPool({ actor, title: item.name, subtitle: t("Kind"), pool, difficulty: r.difficulty || 6, kind: "investment", effect: body,
      breakdown: [{ label: actor.traitLabel(r.trait1), value: actor.traitValue(r.trait1) }, ...(r.trait2 ? [{ label: actor.traitLabel(r.trait2), value: actor.traitValue(r.trait2) }] : [])] });
  }
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice is-sin"><i class="fa-solid fa-hand-sparkles"></i> ${
    t("Used", { name: esc(actor.name), inv: esc(item.name), cost: esc(parts.join(", ") || t("Free")) })}</div><div class="r-card-effect">${body}</div>` });
}

/** Договор с демоном: новый (можно по образцу из библиотеки — preset) или правка (index). */
export async function pactDialog(actor, index = null, preset = null) {
  const list = foundry.utils.deepClone(actor.system.pacts ?? []);
  const blank = { demon: "", form: "empowerment", terms: "", price: "", deed: "", thrall: false, obligation: 0, frequency: 0, consequence: 0, broken: false };
  const p = index != null ? list[index] : { ...blank, ...(preset ? { form: preset.form, terms: preset.terms, price: preset.price, thrall: !!preset.thrall,
    obligation: preset.obligation, frequency: preset.frequency, consequence: preset.consequence } : {}) };
  const sel = (name, n, max, hint) => `<label class="r-f"><span data-tooltip="${esc(hint)}">${t(name)}</span><input type="number" name="${name.toLowerCase()}" value="${n}" min="0" max="${max}"></label>`;
  const content = `<p class="r-choice-hint">${t("PactHint")}</p><div class="r-fields">
    <label class="r-f is-span2"><span>${t("Demon")}</span><input type="text" name="demon" value="${esc(p.demon)}" placeholder="${esc(t("DemonPh"))}"></label>
    <label class="r-f is-span2"><span>${t("Form")}</span><select name="form">${FORMS.map(f => `<option value="${f}" ${f === p.form ? "selected" : ""}>${t(`Forms.${f}`)}</option>`).join("")}</select></label>
    <label class="r-f is-span2"><span>${t("Terms")}</span><textarea name="terms" rows="2" placeholder="${esc(t("TermsPh"))}">${esc(p.terms)}</textarea></label>
    <label class="r-f is-span2"><span>${t("Price")}</span><input type="text" name="price" value="${esc(p.price)}" placeholder="${esc(t("PricePh"))}"></label>
    <label class="r-f is-span2"><span>${t("Deed")}</span><input type="text" name="deed" value="${esc(p.deed)}" placeholder="${esc(t("DeedPh"))}"></label>
    ${sel("Obligation", p.obligation, 5, t("ObligationHint"))}${sel("Frequency", p.frequency, 5, t("FrequencyHint"))}${sel("Consequence", p.consequence, 5, t("ConsequenceHint"))}
    <label class="r-check is-span2"><input type="checkbox" name="thrall" ${p.thrall ? "checked" : ""}> ${t("Thrall")}</label>
    <label class="r-check is-span2"><input type="checkbox" name="broken" ${p.broken ? "checked" : ""}> ${t("Broken")}</label></div>`;
  const v = await foundry.applications.api.DialogV2.prompt({
    window: { title: preset ? `${t("PactNew")}: ${preset.name}` : t(index != null ? "PactEdit" : "PactNew") }, classes: ["vtm20", "r-dialog"], position: { width: 500 }, content,
    ok: { label: t("PactSave"), callback: (ev, btn) => { const f = btn.form.elements, n = k => Math.max(0, Math.min(5, Number(f[k].value) || 0));
      return { demon: f.demon.value.trim(), form: f.form.value, terms: f.terms.value.trim(), price: f.price.value.trim(), deed: f.deed.value.trim(),
        thrall: f.thrall.checked, obligation: n("obligation"), frequency: n("frequency"), consequence: n("consequence"), broken: f.broken.checked }; } }
  }).catch(() => null);
  if (!v) return null;
  if (index != null) list[index] = v; else list.push(v);
  return actor.update({ "system.pacts": list });
}

export async function pactDelete(actor, index) {
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("PactDel") }, content: `<p>${t("PactDelConfirm")}</p>` });
  if (ok) return actor.update({ "system.pacts": (actor.system.pacts ?? []).filter((_, i) => i !== index) });
}
