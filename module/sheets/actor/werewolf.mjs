// module/sheets/actor/werewolf.mjs
// Действия листа персонажа — Оборотни и их мир: формы, Дары, ритуалы, фетиши, шрамы, Родня, Ками, фоморы, духи.
// Вынесено из actor-sheet.mjs: обработчики кнопок (data-action); this — лист (ApplicationV2 зовёт их со своим this).

import { openSept } from "../../apps/sept.mjs";
import { openUmbra } from "../../apps/umbra.mjs";
import { craftFetish, editStanding, changeForm, rollGift, rollRite, frenzyCheck, stepSideways, addScar, removeScar, addDeformity, removeDeformity, renownAward, kinAddGift, kinRemoveGift, kinUseGift, kinAddNumen, kinRemoveNumen, kinNumenDots, kinUseNumen, kamiAdd, kamiRemove, kamiUse, bindFetch, burnFetch, primalUses, fomorBreed, fomorAdd, fomorRemove, fomorUse, applySpiritTpl, addCharm, removeCharm, spiritEssenceReset, addFetish, removeFetish, attuneFetish, reconcileFetish, useFetish, delirium, stayUp, regainRage, regainGnosis, haranoCheck, regenerate, rageActions, spend as wwSpend, addGift, removeGift, addRite, removeRite } from "../../apps/werewolf.mjs";
import { t } from "../actor-context.mjs";

/** Оборотень (apps/werewolf.mjs): смена формы, Дары и ритуалы, бешенство, шаг в Умбру, траты Ярости и Гнозиса. */
function onWwForm(event, target) { return changeForm(this.actor, target.dataset.form); }
function onWwGift(event, target) { return rollGift(this.actor, target.dataset.key); }
function onWwGiftAdd(event, target) { return addGift(this.actor, target.closest(".r-toolbar")?.querySelector(".r-ww-gift-add")?.value); }
function onWwGiftDel(event, target) { return removeGift(this.actor, target.dataset.key); }
function onWwRite(event, target) { return rollRite(this.actor, target.dataset.key); }
function onWwRiteAdd(event, target) { return addRite(this.actor, target.closest(".r-toolbar")?.querySelector(".r-ww-rite-add")?.value); }
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
function onWwScarAdd() { const k = this.element.querySelector(".r-ww-scar-add")?.value; if (k) return addScar(this.actor, k); }
function onWwScarDel(event, target) { return removeScar(this.actor, Number(target.dataset.i)); }
function onWwDeformAdd() { const k = this.element.querySelector(".r-ww-deform-add")?.value; if (k) return addDeformity(this.actor, k); }
function onWwDeformDel(event, target) { return removeDeformity(this.actor, target.dataset.key); }
function onKinAdd() { return kinAddGift(this.actor, this.element.querySelector(".r-kin-add")?.value, false); }
function onKinBuy() { return kinAddGift(this.actor, this.element.querySelector(".r-kin-add")?.value, true); }
function onKinDel(event, target) { return kinRemoveGift(this.actor, target.dataset.key); }
function onKinUse(event, target) { return kinUseGift(this.actor, target.dataset.key); }
function onKinNumAdd() { const k = this.element.querySelector(".r-kin-num-add")?.value; if (k) return kinAddNumen(this.actor, k); }
function onKinNumDel(event, target) { return kinRemoveNumen(this.actor, target.dataset.key); }
function onKinNumDots(event, target) { return kinNumenDots(this.actor, target.dataset.key, Number(target.dataset.n)); }
function onKinNumUse(event, target) { return kinUseNumen(this.actor, target.dataset.key); }
function onKamiAdd() { return kamiAdd(this.actor, this.element.querySelector(".r-kami-add")?.value, false); }
function onKamiBuy() { return kamiAdd(this.actor, this.element.querySelector(".r-kami-add")?.value, true); }
function onKamiMore(event, target) { return kamiAdd(this.actor, target.dataset.key, false); }
function onKamiDel(event, target) { return kamiRemove(this.actor, target.dataset.key); }
function onKamiUse(event, target) { return kamiUse(this.actor, target.dataset.key); }
function onKinFetchBind() { const k = this.element.querySelector(".r-kin-fetch-tpl")?.value; if (k) return bindFetch(this.actor, k); }
function onKinFetchBurn() { return burnFetch(this.actor); }
function onWwPrimal() { return primalUses(this.actor); }
function onFomorAdd() { const k = this.element.querySelector(".r-fomor-add")?.value; if (k) return fomorAdd(this.actor, k); }
function onFomorMore(event, target) { return fomorAdd(this.actor, target.dataset.key); }
function onFomorDel(event, target) { return fomorRemove(this.actor, target.dataset.key); }
function onFomorUse(event, target) { return fomorUse(this.actor, target.dataset.key); }
function onFomorBreed() { const k = this.element.querySelector(".r-fomor-breed")?.value; return fomorBreed(this.actor, k ?? ""); }
function onSpTpl() { const k = this.element.querySelector(".r-sp-tpl")?.value; if (k) return applySpiritTpl(this.actor, k); }
function onSpCharmAdd() { return addCharm(this.actor, this.element.querySelector(".r-sp-charm-add")?.value); }
function onSpCharmDel(event, target) { return removeCharm(this.actor, target.dataset.key); }
function onSpEssence() { return spiritEssenceReset(this.actor); }
function onSpStep() { return stepSideways(this.actor, "spirit.gnosis"); }
function onWwFetishAdd() { const k = this.element.querySelector(".r-ww-fetish-find")?.dataset.key; if (k) return addFetish(this.actor, k); ui.notifications.info(t("Werewolf.FindFetish")); }
function onWwFetishCraft() { return craftFetish(this.actor, this.element.querySelector(".r-ww-fetish-find")?.dataset.key); }
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
  wwForm: onWwForm, wwGift: onWwGift, wwGiftAdd: onWwGiftAdd, wwGiftDel: onWwGiftDel,
  wwRite: onWwRite, wwRiteAdd: onWwRiteAdd, wwRiteDel: onWwRiteDel, wwStanding: onWwStanding,
  wwFrenzy: onWwFrenzy, wwStep: onWwStep, wwSpend: onWwSpend, wwRegen: onWwRegen,
  wwActions: onWwActions, wwDelirium: onWwDelirium, wwRenown: onWwRenown, wwSept: onWwSept,
  wwUmbra: onWwUmbra, wwScarAdd: onWwScarAdd, wwScarDel: onWwScarDel, wwDeformAdd: onWwDeformAdd,
  wwDeformDel: onWwDeformDel, kinAdd: onKinAdd, kinBuy: onKinBuy, kinDel: onKinDel,
  kinUse: onKinUse, kinNumAdd: onKinNumAdd, kinNumDel: onKinNumDel, kinNumDots: onKinNumDots,
  kinNumUse: onKinNumUse, kamiAdd: onKamiAdd, kamiBuy: onKamiBuy, kamiMore: onKamiMore,
  kamiDel: onKamiDel, kamiUse: onKamiUse, kinFetchBind: onKinFetchBind, kinFetchBurn: onKinFetchBurn,
  spTpl: onSpTpl, wwPrimal: onWwPrimal, fomorAdd: onFomorAdd, fomorMore: onFomorMore,
  fomorDel: onFomorDel, fomorUse: onFomorUse, fomorBreed: onFomorBreed, spCharmAdd: onSpCharmAdd,
  spCharmDel: onSpCharmDel, spEssence: onSpEssence, spStep: onSpStep, wwFetishAdd: onWwFetishAdd,
  wwFetishCraft: onWwFetishCraft, wwFetishAttune: onWwFetishAttune, wwFetishReconcile: onWwFetishReconcile, wwStayUp: onWwStayUp,
  wwRageRegain: onWwRageRegain, wwGnosisRegain: onWwGnosisRegain, wwHarano: onWwHarano, wwFetishUse: onWwFetishUse,
  wwFetishDel: onWwFetishDel
};
