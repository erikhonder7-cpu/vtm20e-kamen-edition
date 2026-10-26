// module/apps/embrace-ghoul.mjs
// Готовый смертный становится гулем (V20, гл. «Гули»): выпил витэ — получает домитора, запас крови 1 из 2,
// Мощь 1 и первую ступень уз крови. Лист меняет тип на «гуль»; общие черты (Характеристики, Способности,
// Добродетели, Человечность, Воля, здоровье, опыт, биография, предметы) сохраняются, уходят только поля смертного.

import { SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Ghoulify.${k}`, d) : game.i18n.localize(`VTM20.Ghoulify.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
/** Поля, которых у гуля нет: сосуд, истинная вера, договор слуги падшего. */
const MORTAL_ONLY = ["vessel", "trueFaith", "thrall"];

export async function ghoulify(actor) {
  if (actor.type !== "mortal") return null;
  await Codex.load();
  const vampires = game.actors.filter(a => a.type === "vampire").sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const content = `<p class="r-choice-hint">${t("Hint")}</p><div class="r-form">
    <label class="r-field"><span>${t("Domitor")}</span><select name="domitor"><option value="">${t("DomitorFree")}</option>${vampires.map(v =>
      `<option value="${v.uuid}">${esc(v.name)}</option>`).join("")}</select></label>
    <label class="r-field"><span>${t("DomitorName")}</span><input type="text" name="name" placeholder="${esc(t("DomitorNamePh"))}"></label>
    <label class="r-field"><span>${game.i18n.localize("VTM20.Details.ghoulType")}</span><select name="kind">
      ${["vassal", "independent"].map(k => `<option value="${k}">${game.i18n.localize(`VTM20.GhoulType.${k}`)}</option>`).join("")}</select></label>
    ${actor.isThrall ? `<p class="r-note">${t("ThrallWarn")}</p>` : ""}
  </div>`;
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("Title") }, classes: ["vtm20", "r-dialog"], position: { width: 440 }, content,
    ok: { label: t("Ok"), callback: (ev, btn) => ({ uuid: btn.form.elements.domitor.value, name: btn.form.elements.name.value.trim(), kind: btn.form.elements.kind.value }) }
  }).catch(() => null);
  if (!res) return null;

  const dom = res.uuid ? await fromUuid(res.uuid) : null;
  // слуга падшего, ставший гулем, — договор рвётся: строка уходит из листа хозяина
  if (actor.isThrall && actor.system.thrall.master) {
    const m = await fromUuid(actor.system.thrall.master);
    if (m?.isOwner && m.type === "demon") await m.update({ "system.thralls": m.system.thralls.filter(x => x.uuid !== actor.uuid) });
  }
  const domitor = dom?.name ?? res.name;
  const sys = actor.toObject().system;
  for (const k of MORTAL_ONLY) delete sys[k];
  Object.assign(sys, {
    domitor, domitorClan: dom?.system.clan ?? "", domitorGeneration: dom?.system.generation ?? 13, ghoulType: res.kind,
    blood: { value: 1, max: 2 },
    // первый глоток — первая ступень уз крови к домитору
    bonds: domitor ? [{ name: domitor, rating: 1, role: "regnant", drinks: 1, last: "" }] : []
  });
  await actor.update({ type: "ghoul", system: sys }, { recursive: false });
  // Мощь 1 — у каждого гуля с первого глотка (V20)
  if (!actor.items.some(i => i.type === "discipline" && i.system.key === "potence")) {
    const d = Codex.discipline("potence");
    await actor.createEmbeddedDocuments("Item", [{ name: d?.name ?? "Мощь", type: "discipline", img: Codex.disciplineIcon("potence"),
      system: { key: "potence", value: 1, inClan: false } }]);
  }
  await actor.setFlag(SYSTEM_ID, "created", true);
  ui.notifications.info(t("Done", { name: actor.name, domitor: domitor || "—" }));
  actor.sheet?.render(true);
  return actor;
}
