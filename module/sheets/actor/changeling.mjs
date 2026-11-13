// module/sheets/actor/changeling.mjs
// Действия листа — Подменыш (apps/changeling.mjs): кантрип, Высвобождение, Искусства, Гламур, Кошмар, триггер Банальности.
// this — лист (ApplicationV2 зовёт обработчики со своим this).

import { castCantrip, unleash, artRow, spendGlamour, gainGlamour, gainNightmare, banalityTrigger, invokeWyrd, invokeAutumn, epiphany,
  setSceneBanality, endBedlam, takeOath, breakOath, dropOath, chimericalDamage, coldIron,
  addTreasure, treasureStore, useTreasure, destroyTreasure, mistsTable, questOutcome,
  editChimera, dropChimera, chimeraActor } from "../../apps/changeling.mjs";

function onCast(event, target) {
  const d = target.dataset;
  return castCantrip(this.actor, d.art ? { art: d.art, level: Number(d.level) || undefined } : {});
}
function onUnleash(event, target) { return unleash(this.actor, target.dataset.art); }
function onArtAdd(event, target) {
  const key = target.closest(".r-cl-add")?.querySelector("select")?.value;
  return artRow(this.actor, "add", key);
}
function onArtDel(event, target) { return artRow(this.actor, "del", target.dataset.art); }
function onGlamour(event, target) { return Number(target.dataset.d) < 0 ? spendGlamour(this.actor, 1) : gainGlamour(this.actor, 1); }
function onNightmare(event, target) {
  const d = Number(target.dataset.d) || 1;
  if (d > 0) return gainNightmare(this.actor, 1);
  return this.actor.update({ "system.changeling.nightmare": Math.max(0, this.actor.system.changeling.nightmare - 1) });
}
function onTrigger() { return banalityTrigger(this.actor); }

function onWyrd() { return invokeWyrd(this.actor); }
function onAutumn() { return invokeAutumn(this.actor); }
function onEpiphany() { return epiphany(this.actor); }
function onPlace() { return setSceneBanality(); }
function onBedlamEnd() { return endBedlam(this.actor); }
/** Химерические раны: щелчок — +1 уровень вида, правый — −1. */
function onChim(event, target) {
  const type = target.dataset.type, ch = this.actor._source.system.changeling.chimerical;
  if (event.button === 2) return ch[type] > 0 ? this.actor.update({ [`system.changeling.chimerical.${type}`]: ch[type] - 1 }) : null;
  return chimericalDamage(this.actor, 1, type);
}
async function onColdIron() {
  const n = await foundry.applications.api.DialogV2.prompt({ window: { title: game.i18n.localize("VTM20.Changeling.ColdIron"), icon: "fa-solid fa-khanda" },
    classes: ["vtm20", "r-dialog", "r-type-changeling"], rejectClose: false,
    content: `<div class="r-form"><label class="r-field"><span>${game.i18n.localize("VTM20.Changeling.ColdIronLevels")}</span><input type="number" name="n" min="1" max="10" value="1"></label>
      <p class="r-note">${game.i18n.localize("VTM20.Changeling.ColdIronHint")}</p></div>`,
    ok: { label: game.i18n.localize("VTM20.Changeling.ColdIron"), callback: (e, b) => Number(b.form.elements.n.value) || 0 } });
  return n ? coldIron(this.actor, n) : null;
}
function onTreasure(event, target) {
  const { op, i } = target.dataset;
  if (op === "add") return addTreasure(this.actor);
  if (op === "use") return useTreasure(this.actor, i, { gremayre: event.shiftKey });
  if (op === "del") return destroyTreasure(this.actor, i);
  return treasureStore(this.actor, i, Number(target.dataset.d) || 0);
}
function onMists() { return mistsTable(); }
function onChimera(event, target) {
  const { op, i } = target.dataset;
  return op === "add" ? editChimera(this.actor) : op === "edit" ? editChimera(this.actor, i) : op === "actor" ? chimeraActor(this.actor, i) : dropChimera(this.actor, i);
}
async function onQuest() {
  const ok = await foundry.applications.api.DialogV2.wait({ window: { title: game.i18n.localize("VTM20.Changeling.Quest.Title"), icon: "fa-solid fa-flag" },
    classes: ["vtm20", "r-dialog", "r-type-changeling"], rejectClose: false, content: `<p>${game.i18n.localize("VTM20.Changeling.Quest.Ask")}</p>`,
    buttons: [{ action: "done", label: game.i18n.localize("VTM20.Changeling.Quest.Success"), icon: "fa-solid fa-flag-checkered", callback: () => true },
      { action: "fail", label: game.i18n.localize("VTM20.Changeling.Quest.Fail"), icon: "fa-solid fa-flag", callback: () => false }] });
  return ok == null ? null : questOutcome(this.actor, ok);
}
function onDross(event, target) {
  const d = Number(target.dataset.d) || 0, n = this.actor.system.changeling.dross ?? 0;
  return this.actor.update({ "system.changeling.dross": Math.clamp(n + d, 0, 99) });
}
function onOath(event, target) {
  const { op, i } = target.dataset;
  return op === "take" ? takeOath(this.actor) : op === "break" ? breakOath(this.actor, i) : dropOath(this.actor, i);
}

export const CHANGELING_ACTIONS = { clCast: onCast, clUnleash: onUnleash, clArtAdd: onArtAdd, clArtDel: onArtDel, clGlamour: onGlamour,
  clNightmare: onNightmare, clTrigger: onTrigger, clWyrd: onWyrd, clAutumn: onAutumn, clEpiphany: onEpiphany, clPlace: onPlace, clBedlamEnd: onBedlamEnd, clOath: onOath,
  clChim: { handler: onChim, buttons: [0, 2] }, clColdIron: onColdIron, clTreasure: onTreasure, clDross: onDross, clMists: onMists, clQuest: onQuest, clChimera: onChimera };
