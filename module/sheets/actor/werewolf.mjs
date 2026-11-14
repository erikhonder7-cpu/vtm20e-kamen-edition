// module/sheets/actor/werewolf.mjs
// Действия листа персонажа — Оборотни и их мир: формы, Дары, ритуалы, фетиши, шрамы, Родня, Ками, фоморы, духи.
// Вынесено из actor-sheet.mjs: обработчики кнопок (data-action); this — лист (ApplicationV2 зовёт их со своим this).

import { openSept } from "../../apps/sept.mjs";
import { useCharm } from "../../apps/werewolf/spirits.mjs";
import { openUmbra } from "../../apps/umbra.mjs";
import { editStanding, changeForm, rollGift, rollRite, frenzyCheck, stepSideways, removeScar, removeDeformity, renownAward, kinRemoveGift, kinUseGift, kinRemoveNumen, kinNumenDots, kinUseNumen, kamiAdd, kamiRemove, kamiUse, bindFetch, burnFetch, primalUses, fomorBreed, fomorAdd, fomorRemove, fomorUse, removeCharm, spiritEssenceReset, removeFetish, attuneFetish, reconcileFetish, useFetish, delirium, stayUp, regainRage, regainGnosis, haranoCheck, regenerate, rageActions, spend as wwSpend, removeGift, removeRite } from "../../apps/werewolf.mjs";


/** Оборотень (apps/werewolf.mjs): смена формы, Дары и ритуалы, бешенство, шаг в Умбру, траты Ярости и Гнозиса. */
function onWwForm(event, target) { return changeForm(this.actor, target.dataset.form); }
function onWwGift(event, target) { return rollGift(this.actor, target.dataset.key); }
function onWwGiftDel(event, target) { return removeGift(this.actor, target.dataset.key); }
function onWwRite(event, target) { return rollRite(this.actor, target.dataset.key); }
function onWwRiteDel(event, target) { return removeRite(this.actor, target.dataset.key); }
function onWwStanding() { return editStanding(this.actor); }
function onWwFrenzy() { return frenzyCheck(this.actor); }
function onWwStep() { return stepSideways(this.actor); }
function onWwRegen() { return regenerate(this.actor); }
function onWwActions() { return rageActions(this.actor); }
function onWwDelirium() { return delirium(this.actor); }
function onWwRenown() { return renownAward(this.actor); }
function onWwSept() { return openSept(this.actor); }
function onWwUmbra() { return openUmbra(this.actor); }
function onWwScarDel(event, target) { return removeScar(this.actor, Number(target.dataset.i)); }
function onWwDeformDel(event, target) { return removeDeformity(this.actor, target.dataset.key); }
function onKinDel(event, target) { return kinRemoveGift(this.actor, target.dataset.key); }
function onKinUse(event, target) { return kinUseGift(this.actor, target.dataset.key); }
function onKinNumDel(event, target) { return kinRemoveNumen(this.actor, target.dataset.key); }
function onKinNumDots(event, target) { return kinNumenDots(this.actor, target.dataset.key, Number(target.dataset.n)); }
function onKinNumUse(event, target) { return kinUseNumen(this.actor, target.dataset.key); }
function onKamiMore(event, target) { return kamiAdd(this.actor, target.dataset.key, false); }
function onKamiDel(event, target) { return kamiRemove(this.actor, target.dataset.key); }
function onKamiUse(event, target) { return kamiUse(this.actor, target.dataset.key); }
function onKinFetchBind() { const k = this.element.querySelector(".r-kin-fetch-tpl")?.value; if (k) return bindFetch(this.actor, k); }
function onKinFetchBurn() { return burnFetch(this.actor); }
function onWwPrimal() { return primalUses(this.actor); }
function onFomorMore(event, target) { return fomorAdd(this.actor, target.dataset.key); }
function onFomorDel(event, target) { return fomorRemove(this.actor, target.dataset.key); }
function onFomorUse(event, target) { return fomorUse(this.actor, target.dataset.key); }
function onFomorBreed() { const k = this.element.querySelector(".r-fomor-breed")?.value; return fomorBreed(this.actor, k ?? ""); }
function onSpCharmUse(event, target) { return useCharm(this.actor, target.dataset.key); }
function onSpCharmDel(event, target) { return removeCharm(this.actor, target.dataset.key); }
function onSpEssence() { return spiritEssenceReset(this.actor); }
function onSpStep() { return stepSideways(this.actor, "spirit.gnosis"); }
function onWwFetishAttune(event, target) { return attuneFetish(this.actor, Number(target.dataset.i)); }
function onWwFetishReconcile(event, target) { return reconcileFetish(this.actor, Number(target.dataset.i)); }
function onWwStayUp() { return stayUp(this.actor); }
function onWwRageRegain() { return regainRage(this.actor); }
function onWwGnosisRegain() { return regainGnosis(this.actor); }
function onWwHarano() { return haranoCheck(this.actor); }
function onWwFetishUse(event, target) { return useFetish(this.actor, Number(target.dataset.i)); }
function onWwFetishDel(event, target) { return removeFetish(this.actor, Number(target.dataset.i)); }
function onWwSpend(event, target) { return wwSpend(this.actor, target.dataset.what, 1); }

/** Действия листа: ключ data-action → обработчик. */
export const WEREWOLF_ACTIONS = {
  wwForm: onWwForm, wwGift: onWwGift, wwGiftDel: onWwGiftDel,
  wwRite: onWwRite, wwRiteDel: onWwRiteDel, wwStanding: onWwStanding,
  wwFrenzy: onWwFrenzy, wwStep: onWwStep, wwSpend: onWwSpend, wwRegen: onWwRegen,
  wwActions: onWwActions, wwDelirium: onWwDelirium, wwRenown: onWwRenown, wwSept: onWwSept,
  wwUmbra: onWwUmbra, wwScarDel: onWwScarDel,
  wwDeformDel: onWwDeformDel, kinDel: onKinDel,
  kinUse: onKinUse, kinNumDel: onKinNumDel, kinNumDots: onKinNumDots,
  kinNumUse: onKinNumUse, kamiMore: onKamiMore,
  kamiDel: onKamiDel, kamiUse: onKamiUse, kinFetchBind: onKinFetchBind, kinFetchBurn: onKinFetchBurn, spCharmUse: onSpCharmUse, wwPrimal: onWwPrimal, fomorMore: onFomorMore,
  fomorDel: onFomorDel, fomorUse: onFomorUse, fomorBreed: onFomorBreed,
  spCharmDel: onSpCharmDel, spEssence: onSpEssence, spStep: onSpStep, wwFetishAttune: onWwFetishAttune, wwFetishReconcile: onWwFetishReconcile, wwStayUp: onWwStayUp,
  wwRageRegain: onWwRageRegain, wwGnosisRegain: onWwGnosisRegain, wwHarano: onWwHarano, wwFetishUse: onWwFetishUse,
  wwFetishDel: onWwFetishDel
};
