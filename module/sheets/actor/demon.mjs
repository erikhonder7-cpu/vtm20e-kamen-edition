// module/sheets/actor/demon.mjs
// Действия листа персонажа — Падшие: Мука, форма, слуги и договоры, тело-носитель, ритуалы, культ.
// Вынесено из actor-sheet.mjs: обработчики кнопок (data-action); this — лист (ApplicationV2 зовёт их со своим this).

import { VTM20, SYSTEM_ID } from "../../config.mjs";
import { openThrallGifts } from "../../apps/thrall-gifts.mjs";
import { loseHost, holdOn, newHost, summonedBack } from "../../apps/host.mjs";
import { openCult } from "../../apps/cult.mjs";
import { openExorcist } from "../../apps/exorcist.mjs";
import { openEbServant, empower as empowerServant } from "../../apps/eb-servant.mjs";
import { useInvestment, pactDialog, pactDelete } from "../../apps/infernal.mjs";
import { possess, extend as possessExtend, leave as possessLeave, battleExpiry } from "../../apps/possession.mjs";
import { openHouses } from "../../apps/houses.mjs";
import { openTormentLog, virtuePrompt, thrallSin, thrallPact, thrallBreak, formUpkeep, atoneWithXp, assumeForm, sceneHighFeature, harvestFaith, pactFaith, innateRoll, ritualTurn, ritualEffect, suggestSin, revelation, thrallState, thrallCap, worshipRitual, reliquaryDraw } from "../../apps/torment.mjs";
import { t } from "../actor-context.mjs";

function onWorship() { return worshipRitual(this.actor); }
function onReliquaryDraw() { return reliquaryDraw(this.actor); }
/** Способность для черты формы с выбором («Улучшенная способность», «Увеличенная способность»). */
async function onFormPick(event, target) {
  const a = this.actor, name = target.dataset.name, picks = foundry.utils.deepClone(a.getFlag(SYSTEM_ID, "formPick") ?? {});
  const opts = Object.keys(VTM20.abilities).map(k => [k, a.traitLabel(`abilities.${k}`)]).sort((x, y) => x[1].localeCompare(y[1], "ru"))
    .map(([k, l]) => `<option value="${k}" ${picks[name] === k ? "selected" : ""}>${foundry.utils.escapeHTML(l)}</option>`).join("");
  const key = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("Demon.FormPickTitle", { name }) }, classes: ["vtm20", "r-dialog"], position: { width: 380 },
    content: `<p class="r-choice-hint">${t("Demon.FormPickHint")}</p><label class="r-f"><span>${t("Demon.FormPickAbility")}</span><select name="ability">${opts}</select></label>`,
    ok: { label: game.i18n.localize("VTM20.Common.Save"), callback: (ev, btn) => btn.form.elements.ability.value }
  }).catch(() => null);
  if (!key) return;
  picks[name] = key;
  return a.setFlag(SYSTEM_ID, "formPick", picks);
}
/** Слуга по договору: новый или правка (гл. 9; «Проклятые и обманутые», гл. 4–5). */
async function onThrallEdit(event, target) {
  const a = this.actor, list = foundry.utils.deepClone(a.system.thralls ?? []);
  const i = target.closest("[data-index]")?.dataset.index, x = i != null ? list[Number(i)] : { name: "", uuid: "", faith: 2, share: 1, will: 3, wounds: 0, lost: 0, terms: "", gifts: "" };
  const e = s => foundry.utils.escapeHTML(String(s ?? ""));
  const actors = game.actors.filter(o => o.id !== a.id && o.type !== "demon").sort((p, q) => p.name.localeCompare(q.name, "ru"));
  const opts = [`<option value="">${t("Demon.ThrallNoSheet")}</option>`, ...actors.map(o => `<option value="${o.uuid}" ${o.uuid === x.uuid ? "selected" : ""}>${e(o.name)}</option>`)].join("");
  const num = (n, v, lo, hi) => `<input type="number" name="${n}" value="${v}" min="${lo}" max="${hi}">`;
  const v = await foundry.applications.api.DialogV2.prompt({
    window: { title: t(i != null ? "Demon.ThrallEdit" : "Demon.ThrallAdd") }, classes: ["vtm20", "r-dialog"], position: { width: 480 },
    content: `<div class="r-fields">
      <label class="r-f is-span2"><span>${t("Demon.ThrallName")}</span><input type="text" name="name" value="${e(x.name)}"></label>
      <label class="r-f is-span2"><span>${t("Demon.ThrallSheet")}</span><select name="uuid">${opts}</select></label>
      <label class="r-f"><span>${t("Demon.ThrallFaith")}</span>${num("faith", x.faith, 0, 5)}</label>
      <label class="r-f"><span>${t("Demon.ThrallShare")}</span>${num("share", x.share, 0, 3)}</label>
      <label class="r-f"><span>${t("Demon.ThrallWill")}</span>${num("will", x.will, 0, 10)}</label>
      <label class="r-f"><span>${t("Demon.ThrallWounds")}</span>${num("wounds", x.wounds, 0, 7)}</label>
      <label class="r-f is-span2"><span>${t("Demon.ThrallTerms")}</span><textarea name="terms" rows="2">${e(x.terms)}</textarea></label>
      <label class="r-f is-span2"><span>${t("Demon.ThrallGifts")}</span><textarea name="gifts" rows="2">${e(x.gifts)}</textarea></label></div>
      <p class="r-choice-hint">${t("Demon.ThrallHint")}</p>`,
    ok: { label: game.i18n.localize("VTM20.Common.Save"), callback: (ev, btn) => new foundry.applications.ux.FormDataExtended(btn.form).object }
  }).catch(() => null);
  if (!v) return;
  const faith = Math.clamp(Number(v.faith) || 0, 0, 5);
  const row = { ...x, name: String(v.name ?? "").trim() || (v.uuid ? foundry.utils.fromUuidSync(v.uuid)?.name ?? "" : ""), uuid: v.uuid ?? "", faith,
    share: Math.clamp(Number(v.share) || 0, 0, thrallCap(faith)), will: Math.clamp(Number(v.will) || 0, 0, 10), wounds: Math.clamp(Number(v.wounds) || 0, 0, 7),
    terms: v.terms ?? "", gifts: v.gifts ?? "" };
  if (i != null) list[Number(i)] = row; else list.push(row);
  return a.update({ "system.thralls": list });
}
async function onThrallDelete(event, target) {
  const i = Number(target.closest("[data-index]")?.dataset.index), list = foundry.utils.deepClone(this.actor.system.thralls ?? []);
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("Demon.ThrallDelete") }, content: `<p>${t("Demon.ThrallDeleteAsk", { name: foundry.utils.escapeHTML(list[i]?.name ?? "") })}</p>` }).catch(() => false);
  if (!ok) return;
  list.splice(i, 1);
  return this.actor.update({ "system.thralls": list });
}
function onThrallOpen(event, target) {
  const x = this.actor.system.thralls?.[Number(target.closest("[data-index]")?.dataset.index)];
  return thrallState(x ?? {}).actor?.sheet.render({ force: true });
}
/** Привязанный к Земле (Earthbound): Тёмные Знания и ритуалы Привязанных без Муки, свой опыт. */
function onToggleEarthbound() { return this.actor.update({ "system.earthbound": !this.actor.system.earthbound }); }
function onHouseAtlas() { return openHouses(this.actor.system.house); }
function onTormentSin() { return virtuePrompt(this.actor, "sin"); }
function onThrallSin() { return thrallSin(this.actor); }
function onThrallPact() { return thrallPact(this.actor); }
function onFormUpkeep() { return formUpkeep(this.actor); }
function onThrallGifts() { return openThrallGifts(this.actor); }
/** Тело-носитель (apps/host.mjs): гибель тела, ход без тела, новое тело, призван из Бездны. */
async function onHostLose() {
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: game.i18n.localize("VTM20.Host.Btn") }, content: `<p>${game.i18n.localize("VTM20.Host.BtnHint")}</p>` });
  if (ok) return loseHost(this.actor, "death");
}
function onHostHold() { return holdOn(this.actor); }
function onTormentLog() { return openTormentLog(this.actor); }
/** Завладение Привязанного (apps/possession.mjs). */
function onPossess() { return possess(this.actor); }
function onCult() { return openCult(this.actor); }
/** Вера против падших: молитвы, экзорцизм, оружие веры (apps/exorcist.mjs). */
function onExorcist() { return openExorcist(this.actor); }
function onEbServant() { return this.actor.system.ebServant?.empowerments ? openEbServant(this.actor) : empowerServant(this.actor); }
/** Инфернализм (apps/infernal.mjs): применить Вложение, договоры с демонами. */
function onInvestmentUse(event, target) {
  const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
  if (item) return useInvestment(this.actor, item);
}
function onPactAdd() { return pactDialog(this.actor); }
function onPactEdit(event, target) { return pactDialog(this.actor, Number(target.dataset.index)); }
function onPactDel(event, target) { return pactDelete(this.actor, Number(target.dataset.index)); }
function onPossessExtend() { return possessExtend(this.actor); }
async function onPossessLeave() {
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: game.i18n.localize("VTM20.Possess.Leave") }, content: `<p>${game.i18n.localize("VTM20.Possess.LeaveConfirm")}</p>` });
  if (ok) return possessLeave(this.actor);
}
function onPossessBattle() { return battleExpiry(this.actor); }
function onHostNew() { return newHost(this.actor); }
function onHostSummoned() { return summonedBack(this.actor); }
/** Картинка жетона в форме — выбирает игрок (своих картинок система не даёт). */
function onFormLookImg() {
  const fp = new foundry.applications.apps.FilePicker.implementation({ type: "image", current: this.actor.system.formLook?.img || "",
    callback: path => this.actor.update({ "system.formLook.img": path }) });
  return fp.browse();
}
function onFormLookClear() { return this.actor.update({ "system.formLook.img": "" }); }
function onThrallBreak() { return thrallBreak(this.actor); }
function onSinSuggest() { return suggestSin(this.actor); }
function onTormentKind() { return virtuePrompt(this.actor, "kind"); }
function onTormentAtone() { return atoneWithXp(this.actor); }
/** Принять апокалиптическую форму — 1 пункт временной Веры (гл. 7); сбросить — даром. */
function onApocalyptic() { return assumeForm(this.actor); }
function onSceneHigh(event, target) { return sceneHighFeature(this.actor, Number(target.dataset.index)); }
function onRevelation() { return revelation(this.actor); }
/** Выбрать черту высокой Муки в свободный слот или снять уже выбранную (снимается и всё, что выбрано после неё). */
async function onFormHighPick(event, target) {
  const i = Number(target.dataset.index), list = [...(this.actor.getFlag(SYSTEM_ID, "formHigh") ?? [])];
  const at = list.indexOf(i);
  return this.actor.setFlag(SYSTEM_ID, "formHigh", at >= 0 ? list.slice(0, at) : [...list, i]);
}
function onFaithHeal() { return this.actor.faithHeal(); }
function onHarvest() { return harvestFaith(this.actor); }
function onInnate(event, target) { return innateRoll(this.actor, target.dataset.kind); }
function onRitualTurn(event, target) { const it = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId); return it && ritualTurn(this.actor, it); }
function onRitualEffect(event, target) { const it = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId); return it && ritualEffect(this.actor, it); }
function onPactFaith() { return pactFaith(this.actor); }
function onSpendFaith() {
  const s = this.actor.system;
  if (s.faith.temporary < 1) return ui.notifications.warn(t("Demon.NoFaith"));
  return this.actor.update({ "system.faith.temporary": s.faith.temporary - 1 });
}

/** Действия листа: ключ data-action → обработчик. */
export const DEMON_ACTIONS = {
  toggleEarthbound: onToggleEarthbound, thrallAdd: onThrallEdit, thrallEdit: onThrallEdit, thrallDelete: onThrallDelete,
  thrallOpen: onThrallOpen, formPick: onFormPick, worship: onWorship, reliquaryDraw: onReliquaryDraw,
  houseAtlas: onHouseAtlas, tormentSin: onTormentSin, thrallSin: onThrallSin, thrallPact: onThrallPact,
  formUpkeep: onFormUpkeep, thrallGifts: onThrallGifts, tormentLog: onTormentLog, hostLose: onHostLose,
  investmentUse: onInvestmentUse, pactAdd: onPactAdd, pactEdit: onPactEdit, pactDel: onPactDel,
  ebServant: onEbServant, exorcist: onExorcist, cult: onCult, possess: onPossess,
  possessExtend: onPossessExtend, possessLeave: onPossessLeave, possessBattle: onPossessBattle, hostHold: onHostHold,
  hostNew: onHostNew, hostSummoned: onHostSummoned, formLookImg: onFormLookImg, formLookClear: onFormLookClear,
  thrallBreak: onThrallBreak, sinSuggest: onSinSuggest, tormentKind: onTormentKind, tormentAtone: onTormentAtone,
  apocalyptic: onApocalyptic, sceneHigh: onSceneHigh, formHighPick: onFormHighPick, revelation: onRevelation,
  faithHeal: onFaithHeal, harvestFaith: onHarvest, innate: onInnate, ritualTurn: onRitualTurn,
  ritualEffect: onRitualEffect, pactFaith: onPactFaith, spendFaith: onSpendFaith
};
