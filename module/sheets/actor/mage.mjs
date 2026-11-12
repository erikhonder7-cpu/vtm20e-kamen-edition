// module/sheets/actor/mage.mjs
// Действия листа персонажа — Маг, колдун и консор: чародейство, колесо, ротэ, нумины.
// Вынесено из actor-sheet.mjs: обработчики кнопок (data-action); this — лист (ApplicationV2 зовёт их со своим this).

import { addNumen as sorcAdd, removeNumen as sorcDel, numenDots as sorcDots, useNumen as sorcUse, addRitual as sorcRitualAdd, removeRitual as sorcRitualDel, useRitual as sorcRitualUse } from "../../apps/sorcerer.mjs";
import { castEffect, changeQuintessence, changeParadox, paradoxBacklash, addRote, removeRote, castRote, removeTool } from "../../apps/mage.mjs";
import { addResonance, setResonance, removeResonance, toggleResUsed, cloakResonance, quietExit, addFlaw, removeFlaw, seekingDialog, useWonder, wonderQuint, toggleGhoul, ghoulVitae, ghoulHeal, mindEnter, mindShorten, mindExit, armWonder, addPact, removePact, useMageInvestment, craftWonder } from "../../apps/mage-state.mjs";

// Маг (apps/mage.mjs): чародейство, колесо Квинтэссенции и Парадокса, ротэ, инструменты
function onMageCast(event, target) { return castEffect(this.actor, target.dataset.sphere ? { sphere: target.dataset.sphere } : {}); }
function onMageQuint(event, target) { return changeQuintessence(this.actor, Number(target.dataset.d) || 0); }
function onMageParadox(event, target) { return changeParadox(this.actor, Number(target.dataset.d) || 0); }
function onMageBacklash() { return paradoxBacklash(this.actor); }
/** Шаг в сторону, контрмагия, сертамен (apps/mage-duel.mjs). */
async function onMageDuel(event, target) {
  const D = await import("../../apps/mage-duel.mjs");
  return { mageStep: D.stepSideways, mageCounter: D.counterMagic, mageCertamen: D.certamen }[target.dataset.action]?.(this.actor);
}
function onMageRoteAdd() { return addRote(this.actor); }
function onMageRoteDel(event, target) { return removeRote(this.actor, Number(target.dataset.i)); }
// Shift — бросок сразу: Сферы и вид магии берутся из ротэ
function onMageRoteCast(event, target) { return castRote(this.actor, Number(target.dataset.i), { fast: event.shiftKey }); }
function onMageRoteEdit(event, target) { return addRote(this.actor, Number(target.dataset.i)); }
/** Резонанс, Безмолвие, Изъяны, Поиск, Чудеса (apps/mage-state.mjs) — по имени действия. */
function onMageState(event, target) {
  const a = this.actor, d = target.dataset, i = Number(d.i), id = target.closest("[data-item-id]")?.dataset.itemId;
  switch (d.action) {
    case "mageResAdd": return addResonance(a);
    case "mageResDot": return setResonance(a, i, Number(d.n));
    case "mageResDel": return removeResonance(a, i);
    case "mageResUsed": return toggleResUsed(a);
    case "mageResCloak": return cloakResonance(a);
    case "mageQuietExit": return quietExit(a);
    case "mageFlawAdd": return addFlaw(a);
    case "mageFlawDel": return removeFlaw(a, i);
    case "mageSeeking": return seekingDialog(a);
    case "mageWonderUse": return useWonder(a, id);
    case "mageInvest": return useMageInvestment(a, id, d.act);
    case "mageWonderCraft": return craftWonder(a);
    case "magePactAdd": return addPact(a);
    case "magePactDel": return removePact(a, i);
    case "mageWonderArm": return armWonder(a, id);
    case "mageMindEnter": return mindEnter(a);
    case "mageMindShorten": return mindShorten(a);
    case "mageMindExit": return mindExit(a);
    case "mageGhoul": return toggleGhoul(a);
    case "mageGhoulVitae": return ghoulVitae(a, Number(d.n));
    case "mageGhoulHeal": return ghoulHeal(a);
    case "mageWonderQuint": return wonderQuint(a, id, Number(d.d));
  }
  return null;
}
function onMageToolDel(event, target) { return removeTool(this.actor, Number(target.dataset.i)); }
/** Колдун: нумины и ритуалы (apps/sorcerer.mjs). */
function onSorc(event, target) {
  const a = this.actor, d = target.dataset;
  switch (d.action) {
    case "sorcAdd": { const k = target.closest(".r-sn-add")?.querySelector("select")?.value; return k ? sorcAdd(a, k) : null; }
    case "sorcDel": return sorcDel(a, d.key);
    case "sorcDots": return sorcDots(a, d.key, Number(d.n));
    case "sorcUse": return sorcUse(a, d.key);
    case "sorcRitualAdd": return sorcRitualAdd(a);
    case "sorcRitualDel": return sorcRitualDel(a, Number(d.i));
    case "sorcRitualUse": return sorcRitualUse(a, Number(d.i));
  }
}

/** Действия листа: ключ data-action → обработчик. */
export const MAGE_ACTIONS = {
  mageCast: onMageCast, mageQuint: onMageQuint, mageParadox: onMageParadox, mageBacklash: onMageBacklash,
  mageRoteEdit: onMageRoteEdit, mageMindEnter: onMageState, mageMindShorten: onMageState, mageMindExit: onMageState, mageWonderArm: onMageState, magePactAdd: onMageState, magePactDel: onMageState, mageGhoul: onMageState, mageGhoulVitae: onMageState, mageGhoulHeal: onMageState, mageInvest: onMageState, mageWonderCraft: onMageState, mageResAdd: onMageState,
  mageResDot: onMageState, mageResDel: onMageState, mageResUsed: onMageState, mageResCloak: onMageState,
  mageQuietExit: onMageState, mageFlawAdd: onMageState, mageFlawDel: onMageState, mageSeeking: onMageState,
  mageWonderUse: onMageState, mageWonderQuint: onMageState, mageStep: onMageDuel, mageCounter: onMageDuel,
  mageCertamen: onMageDuel, mageRoteAdd: onMageRoteAdd, mageRoteDel: onMageRoteDel, mageRoteCast: onMageRoteCast,
  mageToolDel: onMageToolDel, sorcAdd: onSorc, sorcDel: onSorc, sorcDots: onSorc,
  sorcUse: onSorc, sorcRitualAdd: onSorc, sorcRitualDel: onSorc, sorcRitualUse: onSorc
};
