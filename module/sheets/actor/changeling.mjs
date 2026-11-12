// module/sheets/actor/changeling.mjs
// Действия листа — Подменыш (apps/changeling.mjs): кантрип, Высвобождение, Искусства, Гламур, Кошмар, триггер Банальности.
// this — лист (ApplicationV2 зовёт обработчики со своим this).

import { castCantrip, unleash, artRow, spendGlamour, gainGlamour, gainNightmare, banalityTrigger, invokeWyrd, invokeAutumn, epiphany,
  setSceneBanality, endBedlam, takeOath, breakOath, dropOath } from "../../apps/changeling.mjs";

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
function onOath(event, target) {
  const { op, i } = target.dataset;
  return op === "take" ? takeOath(this.actor) : op === "break" ? breakOath(this.actor, i) : dropOath(this.actor, i);
}

export const CHANGELING_ACTIONS = { clCast: onCast, clUnleash: onUnleash, clArtAdd: onArtAdd, clArtDel: onArtDel, clGlamour: onGlamour,
  clNightmare: onNightmare, clTrigger: onTrigger, clWyrd: onWyrd, clAutumn: onAutumn, clEpiphany: onEpiphany, clPlace: onPlace, clBedlamEnd: onBedlamEnd, clOath: onOath };
