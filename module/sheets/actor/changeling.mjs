// module/sheets/actor/changeling.mjs
// Действия листа — Подменыш (apps/changeling.mjs): кантрип, Высвобождение, Искусства, Гламур, Кошмар, триггер Банальности.
// this — лист (ApplicationV2 зовёт обработчики со своим this).

import { castCantrip, unleash, artRow, spendGlamour, gainGlamour, gainNightmare, banalityTrigger, invokeWyrd, invokeAutumn, epiphany,
  setSceneBanality, endBedlam, takeOath, breakOath, dropOath, chimericalDamage, coldIron,
  addTreasure, treasureStore, useTreasure, destroyTreasure, mistsTable, questOutcome,
  editChimera, dropChimera, chimeraActor, addCraft, craftRoll, dropCraft } from "../../apps/changeling.mjs";
import { addRede, dropRede, reaping, legacyGlamour, shedBanality, shedImbalance } from "../../apps/lykeian.mjs";
import { wuTan, neiTan, maskOfShintai, sacrificeChi, unleashSliver, harvest, reapInanimae, huskRoll, rebind } from "../../apps/fae-variants.mjs";

import { castDaf, unleashDaf, echoRoll, dafColdIron, learnCantrip, forgetCantrip, originDefaults } from "../../apps/dark-fae.mjs";

/** Dark Ages: Fae (apps/dark-fae.mjs): кантрип, Высвобождение Домена, Эхо, холодное железо, выучить и забыть кантрип, старт Происхождения. */
function onDaf(event, target) {
  const { op, key } = target.dataset, a = this.actor;
  if (op === "cast") return castDaf(a, key);
  if (op === "unleash") return unleashDaf(a, key);
  if (op === "learn") return learnCantrip(a, target.closest(".r-cl-add")?.querySelector("select")?.value);
  if (op === "forget") return forgetCantrip(a, key);
  if (op === "origin") return a.update(originDefaults(a.system.changeling.daf.origin));
  return { echo: echoRoll, iron: dafColdIron }[op]?.(a);
}

/** Хсиен и инанимае (apps/fae-variants.mjs): Ву Тань, Ней Тань, Маска Шинтай, жертва Чи; Высвобождение Слайвера, Сбор, Жатва, Оболочка, Якорь. */
function onFae(event, target) {
  const { op, key } = target.dataset, a = this.actor;
  if (op === "wutan") return wuTan(a, { school: key });
  if (op === "sliver") return unleashSliver(a, key);
  return { neitan: neiTan, mask: maskOfShintai, chi: sacrificeChi, harvest, reap: reapInanimae, husk: huskRoll, rebind }[op]?.(a);
}
import { addAgenda, dropAgenda, focusAgenda, resetAgenda, rollAgenda, rollRival, bumpAgenda } from "../../apps/agenda.mjs";

/** Агенды (apps/agenda.mjs): добавить, бросок, ход соперника, помощь ±, продвигать эту, начать заново, убрать. */
function onAgenda(event, target) {
  const { op } = target.dataset, i = Number(target.dataset.i), a = this.actor;
  if (op === "add") return addAgenda(a);
  return { roll: rollAgenda, rival: rollRival, focus: focusAgenda, reset: resetAgenda, del: dropAgenda,
    plus: (x, j) => bumpAgenda(x, j, 1), minus: (x, j) => bumpAgenda(x, j, -1) }[op]?.(a, i);
}

/** Ликиец (apps/lykeian.mjs): Реды, Жатва, Гламур через Наследие, снять Банальность или Дисбаланс. */
function onLykeian(event, target) {
  const op = target.dataset.op, a = this.actor;
  if (op === "add") return addRede(a, target.closest(".r-cl-add")?.querySelector("select")?.value);
  if (op === "del") return dropRede(a, Number(target.dataset.i));
  return { reap: reaping, legacy: legacyGlamour, shed: shedBanality, cure: shedImbalance }[op]?.(a);
}

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
function onCraft(event, target) {
  const { op, i } = target.dataset;
  return op === "add" ? addCraft(this.actor) : op === "del" ? dropCraft(this.actor, i) : craftRoll(this.actor, i, op);
}
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
  clChim: { handler: onChim, buttons: [0, 2] }, clColdIron: onColdIron, clTreasure: onTreasure, clDross: onDross, clMists: onMists, clQuest: onQuest, clChimera: onChimera, clCraft: onCraft, lyAct: onLykeian, clAgenda: onAgenda, clFae: onFae, clDaf: onDaf };
