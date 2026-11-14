// module/sheets/actor/thaum.mjs
// Действия листа — артефакты Тремер (apps/thaum-workshop.mjs): мастерская, неделя работы над талисманом,
// заряд артефакта, талисман «в руке». this — лист (ApplicationV2 зовёт обработчики со своим this).

import { openWorkshop, talismanWeek, useCharge, toggleHeld } from "../../apps/thaum-workshop.mjs";

function onThWorkshop(event, target) { return openWorkshop(this.actor, target.dataset.mode ?? ""); }
function onThWeek() { return talismanWeek(this.actor); }
function onThUse(event, target) { return useCharge(this.actor, target.closest("[data-item-id]")?.dataset.itemId); }
function onThHeld(event, target) { return toggleHeld(this.actor, target.closest("[data-item-id]")?.dataset.itemId); }

export const THAUM_ACTIONS = { thWorkshop: onThWorkshop, thWeek: onThWeek, thUse: onThUse, thHeld: onThHeld };
