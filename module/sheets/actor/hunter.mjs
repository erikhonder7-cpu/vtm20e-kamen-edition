// module/sheets/actor/hunter.mjs
// Действия листа персонажа — Охотники и Свидетели: Грани, Убеждённость, рост наделённых.
// Вынесено из actor-sheet.mjs: обработчики кнопок (data-action); this — лист (ApplicationV2 зовёт их со своим this).

import { useEdge, secondSight, virtueTest, tradeConviction, restoreConviction, awardDeed, shiftDeed, cashDeed, sacrifice, advanceVirtue, callEdge, swapCalled, unblockCall, lostVirtue, lostTrade, lostHardened, lostOrdeal } from "../../apps/hunter.mjs";

/** Слуга Привязанного: нет наделений — сразу ритуал, есть — окно сил (apps/eb-servant.mjs). */
/** Охотник (apps/hunter.mjs): Грань — бросок с риском Убеждённостью; второе зрение; испытание Добродетели; 10 Убеждённости — в Добродетель. */
function onEdgeUse(event, target) { return useEdge(this.actor, target.dataset.key); }
async function onEdgeDel(event, target) {
  const k = target.dataset.key, list = this.actor.system.hunter?.edges ?? [];
  await this.actor.update({ "system.hunter.edges": list.filter(x => x !== k) });
}
function onHunterSight() { return secondSight(this.actor); }
function onHunterTest() { return virtueTest(this.actor); }
function onHunterTrade() { return tradeConviction(this.actor); }
function onHunterRestore() { return restoreConviction(this.actor); }
/** Players Guide, гл. 2: Деяния, Жертва, Грани «свыше». */
function onHunterDeed() { return awardDeed(this.actor); }
function onHunterShift() { return shiftDeed(this.actor); }
function onHunterCash() { return cashDeed(this.actor); }
function onHunterSacrifice() { return sacrifice(this.actor); }
function onHunterAdvance() { return advanceVirtue(this.actor); }
function onEdgeCall(event, target) { return callEdge(this.actor, target.dataset.key ?? ""); }
function onEdgeSwap() { return swapCalled(this.actor); }
function onHunterUnblock() { return unblockCall(this.actor); }
/** Свидетель (Players Guide, гл. 1): бросок Добродетели, обмен Добродетели на рассудок, Закалённый дух, Общая беда. */
function onLostVirtue(event, target) { return lostVirtue(this.actor, target.dataset.key); }
function onLostTrade() { return lostTrade(this.actor); }
function onLostHardened() { return lostHardened(this.actor); }
function onLostOrdeal() { return lostOrdeal(this.actor); }

/** Действия листа: ключ data-action → обработчик. */
export const HUNTER_ACTIONS = {
  edgeUse: onEdgeUse, edgeDel: onEdgeDel, hunterSight: onHunterSight, hunterTest: onHunterTest,
  hunterTrade: onHunterTrade, hunterRestore: onHunterRestore, hunterDeed: onHunterDeed, hunterShift: onHunterShift,
  hunterCash: onHunterCash, hunterSacrifice: onHunterSacrifice, hunterAdvance: onHunterAdvance, edgeCall: onEdgeCall,
  edgeSwap: onEdgeSwap, hunterUnblock: onHunterUnblock, lostVirtue: onLostVirtue, lostTrade: onLostTrade,
  lostHardened: onLostHardened, lostOrdeal: onLostOrdeal
};
