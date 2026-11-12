// module/sheets/actor/wraith.mjs
// Действия листа персонажа — призрак (apps/wraith.mjs): Арканои, Пафос, Страсти и Оковы, Тень, Катарсис, Испытания.
// this — лист (ApplicationV2 зовёт обработчики со своим this).

import { rollArt, toggleArt, addRow, removeRow, rollPassion, rollFetter, rollDarkPassion, rollMemoriam, shadowDice, catharsis, harrowing,
  pathosHeal, spendPathos, newSession, gainAngst, setShroud, toggleHaunt } from "../../apps/wraith.mjs";
import { openAtlas } from "../../apps/atlas.mjs";
import { assignGuide, shadowWhisper } from "../../apps/shadowguide.mjs";
import { resolveRow, waneRow, linger } from "../../apps/resolution.mjs";
import { useThorn } from "../../apps/thorns.mjs";
import { addConsort, removeConsort, investWill } from "../../apps/consorts.mjs";
import { openHarrowing } from "../../apps/harrowing.mjs";
import { tempestJourney, forecast, forecastClear } from "../../apps/tempest.mjs";
import { wakeRelic, startForge, forgeStep, forgeFinishEffect, forgeComplete, forgeAbandon } from "../../apps/relics.mjs";
import { becomeSpectre, rollDark, rollPsychePassion, psycheCatharsis, rapacity, spectreRow } from "../../apps/spectre.mjs";
import { rise, toShadowlands, toBody, risenDisc, rollRisenArt, risenSlumber, risenDown } from "../../apps/risen.mjs";
import { project, stain, suppressStains, willToPathos, emblem, deadEyes, stainRow } from "../../apps/projector.mjs";
import { rollRealmArt, realmRow } from "../../apps/realms.mjs";
import { maelstrom, fog, slumber, yoke, sharePathos, pigment, hueStains } from "../../apps/underworld.mjs";

function onWrArt(event, target) { return rollArt(this.actor, target.dataset.key, Number(target.dataset.level), target.dataset.kind); }
/** Свёрнутые карточки Арканоев — у каждого игрока свои (память браузера); по умолчанию свёрнуты, как Дисциплины. */
export const arcFold = id => { try { return JSON.parse(localStorage.getItem(`vtm20.arcanoi.${id}`) ?? "{}"); } catch { return {}; } };
const arcFoldSave = (id, v) => { try { localStorage.setItem(`vtm20.arcanoi.${id}`, JSON.stringify(v)); } catch { /* память браузера недоступна — не запомним */ } };
/** Свернуть или развернуть карточку — классом, без перерисовки; «все» (data-to) — перерисовкой вкладки. */
function onWrFold(event, target) {
  const fold = arcFold(this.actor.id), k = target.dataset.key;
  if (k) {
    fold[k] = !(fold[k] ?? true);
    arcFoldSave(this.actor.id, fold);
    const card = target.closest(".r-wr-arc");
    card?.classList.toggle("is-shut", fold[k]); card?.classList.toggle("is-open", !fold[k]);
    return card;
  }
  const to = target.dataset.to === "1";
  for (const x of Object.keys(this.actor.system.wraith.arcanoi)) fold[x] = to;
  arcFoldSave(this.actor.id, fold);
  return this.render({ parts: ["disciplines"] });
}

/** Половинка ранга: открыть её уровень в карточке; повторный щелчок — закрыть. */
function onWrPick(event, target) {
  const { key, level, kind } = target.dataset, v = `${level}-${kind}`;
  if (this._wrSel[key] === v) delete this._wrSel[key]; else this._wrSel[key] = v;
  return this.render({ parts: ["disciplines"] });
}
function onWrArtToggle(event, target) { return toggleArt(this.actor, target.dataset.key, Number(target.dataset.level), target.dataset.kind); }
function onWrArcAdd() {
  const k = this.element.querySelector(".r-wr-arc-add")?.value;
  if (k) return this.actor.update({ [`system.wraith.arcanoi.${k}.value`]: 1 });
}
function onWrArcDel(event, target) {
  return this.actor.update({ [`system.wraith.arcanoi.${target.dataset.key}`]: { value: 0, initiate: [], skip: [] } });
}
function onWrRowAdd(event, target) {
  const kind = target.dataset.kind;
  if (kind === "thorn") { const k = this.element.querySelector(".r-wr-thorn-add")?.value; return k ? addRow(this.actor, "thorn", { key: k }) : null; }
  return addRow(this.actor, kind);
}
function onWrRowDel(event, target) { return removeRow(this.actor, target.dataset.kind, Number(target.dataset.i)); }
function onWrPassion(event, target) { return rollPassion(this.actor, Number(target.dataset.i)); }
function onWrFetter(event, target) { return rollFetter(this.actor, Number(target.dataset.i)); }
function onWrDark(event, target) { return rollDarkPassion(this.actor, Number(target.dataset.i)); }
function onWrMemoriam() { return rollMemoriam(this.actor); }
function onWrShadowDice() { return shadowDice(this.actor); }
// проводник-Тень (apps/shadowguide.mjs): назначает ведущий; шепчет Психее проводник
function onWrGuide() { return assignGuide(this.actor); }
// Разрешение Страстей и Оков, угасание (рассказчик), Воля за срок в Землях Теней без Оков (apps/resolution.mjs)
function onWrResolve(event, target) { return resolveRow(this.actor, target.dataset.kind, target.dataset.i); }
function onWrWane(event, target) { return waneRow(this.actor, target.dataset.kind, target.dataset.i); }
function onWrLinger() { return linger(this.actor); }
// Шип Тени в игре (apps/thorns.mjs): проводник или рассказчик
function onWrThorn(event, target) { return useThorn(this.actor, target.dataset.i); }
// Консорты (apps/consorts.mjs): настройка Волей
function onWrConsortAdd() { return addConsort(this.actor); }
function onWrConsortDel(event, target) { return removeConsort(this.actor, target.dataset.i); }
function onWrConsort(event, target) { return investWill(this.actor, target.dataset.i); }
// Реликвии, Артефакты и душековка (apps/relics.mjs)
function onWrRelicWake(event, target) { return wakeRelic(this.actor, target.dataset.id); }
function onWrForge() { return startForge(this.actor); }
function onWrForgeStep() { return forgeStep(this.actor); }
function onWrForgeFx(event, target) { return forgeFinishEffect(this.actor, target.dataset.key); }
function onWrForgeDone() { return forgeComplete(this.actor); }
function onWrForgeDrop() { return forgeAbandon(this.actor); }
// Буря (apps/tempest.mjs): путь через Бурю, прогноз Мальстрёма
function onWrTempest() { return tempestJourney(this.actor); }
function onWrForecast() { return forecast(this.actor); }
function onWrForecastClear() { return forecastClear(this.actor); }
function onWrWhisper() { return shadowWhisper(this.actor); }
function onWrCatharsis() { return catharsis(this.actor); }
// рассказчику — окно Испытания (apps/harrowing.mjs), игроку — быстрый бросок
function onWrHarrowing(event, target) {
  return game.user.isGM ? openHarrowing(this.actor, target.dataset.cause === "destruction" ? "destruction" : "will") : harrowing(this.actor, target.dataset.cause ?? "corpus");
}
function onWrHeal() { return pathosHeal(this.actor); }
function onWrPathos() { return spendPathos(this.actor, 1); }
function onWrSession() { return newSession(this.actor); }
function onWrAngst(event, target) { return gainAngst(this.actor, Number(target.dataset.d) || 1, { reason: game.i18n.localize("VTM20.Wraith.AngstManual") }); }
function onWrShroud(event, target) { return setShroud(target.dataset.what, Number(target.dataset.d)); }
function onWrHaunt() { return toggleHaunt(this.actor); }
// Спектр (apps/spectre.mjs)
function onSpBecome() { return becomeSpectre(this.actor); }
function onSpDark(event, target) { return rollDark(this.actor, target.dataset.key, Number(target.dataset.level)); }
function onSpPassion(event, target) { return rollPsychePassion(this.actor, Number(target.dataset.i)); }
function onSpCatharsis() { return psycheCatharsis(this.actor); }
function onSpRapacity() { return rapacity(this.actor); }
/** Строки Спектра: Тёмный Арканос, умение Шейдкрафта, Страсть и Ветвь Психеи — добавить (из списка) или убрать. */
function onSpRow(event, target) {
  const { kind, op } = target.dataset, sel = target.closest(".r-toolbar")?.querySelector("select");
  return spectreRow(this.actor, kind, op, { i: Number(target.dataset.i), key: target.dataset.key ?? sel?.value });
}
// Восставший (apps/risen.mjs)
function onRsOn() { const r = this.actor.system.wraith.risen; return this.actor.update({ "system.wraith.risen.on": !r.on, ...(r.on ? { "system.wraith.risen.body": false } : {}) }); }
function onRsRise() { return rise(this.actor); }
function onRsLeave() { return toShadowlands(this.actor); }
function onRsBody() { return toBody(this.actor); }
function onRsDisc(event, target) { return risenDisc(this.actor, target.dataset.key); }
function onRsArt(event, target) { return rollRisenArt(this.actor, target.dataset.key, Number(target.dataset.level)); }
function onRsSlumber() { return risenSlumber(this.actor); }
function onRsDown() { return risenDown(this.actor); }
function onRsArtRow(event, target) {
  const key = target.dataset.key ?? target.closest(".r-toolbar")?.querySelector("select")?.value;
  if (key) return this.actor.update({ [`system.wraith.risen.arcanoi.${key}`]: target.dataset.op === "del" ? 0 : Math.max(1, this.actor.system.wraith.risen.arcanoi[key] ?? 0) });
}
// проектор «Орфея» (apps/projector.mjs)
function onPjOn() { return this.actor.update({ "system.wraith.projector.on": !this.actor.system.wraith.projector.on }); }
function onPjProject() { return project(this.actor); }
function onPjStain(event, target) { return stain(this.actor, Number(target.dataset.i)); }
function onPjSuppress() { return suppressStains(this.actor); }
function onPjWill() { return willToPathos(this.actor); }
function onPjEmblem() { return emblem(this.actor); }
function onPjEyes() { return deadEyes(this.actor); }
function onPjRow(event, target) { return stainRow(this.actor, target.dataset.op, { i: Number(target.dataset.i), key: target.closest(".r-toolbar")?.querySelector("select")?.value }); }
// другое Тёмное Царство (apps/realms.mjs)
function onRlArt(event, target) { return rollRealmArt(this.actor, target.dataset.key, Number(target.dataset.i)); }
function onRlRow(event, target) { return realmRow(this.actor, target.dataset.op, target.dataset.key ?? target.closest(".r-toolbar")?.querySelector("select")?.value); }
// Подземный мир (apps/underworld.mjs): Мальстрём и Туман — рассказчику; Сон в Оковах; «Орфей»; Оттенок цвета
function onUwStorm() { return maelstrom(); }
function onUwFog() { return fog(); }
function onUwSlumber() { return this.actor.system.wraith.risen?.on && this.actor.system.wraith.risen.body ? risenSlumber(this.actor) : slumber(this.actor); }
function onUwYoke() { return yoke(this.actor); }
function onUwShare() { return sharePathos(this.actor); }
function onUwPigment() { return pigment(this.actor); }
function onUwHue() { return this.actor.update({ "system.wraith.hue": !this.actor.system.wraith.hue }); }
function onUwHueAll() { return hueStains(this.actor); }
function onWrAtlas() { return openAtlas("wraith", this.actor.system.wraith.guild); }

/** Действия листа: ключ data-action → обработчик. */
export const WRAITH_ACTIONS = {
  wrArt: onWrArt, wrPick: onWrPick, wrFold: onWrFold, wrArtToggle: onWrArtToggle, wrArcAdd: onWrArcAdd, wrArcDel: onWrArcDel,
  wrRowAdd: onWrRowAdd, wrRowDel: onWrRowDel, wrPassion: onWrPassion, wrFetter: onWrFetter,
  wrDark: onWrDark, wrMemoriam: onWrMemoriam, wrShadowDice: onWrShadowDice, wrCatharsis: onWrCatharsis,
  wrHarrowing: onWrHarrowing, wrHeal: onWrHeal, wrPathos: onWrPathos, wrSession: onWrSession,
  wrAngst: onWrAngst, wrGuide: onWrGuide, wrWhisper: onWrWhisper, wrResolve: onWrResolve, wrWane: onWrWane, wrLinger: onWrLinger, wrThorn: onWrThorn, wrConsortAdd: onWrConsortAdd, wrConsortDel: onWrConsortDel, wrConsort: onWrConsort, wrRelicWake: onWrRelicWake, wrForge: onWrForge, wrForgeStep: onWrForgeStep, wrForgeFx: onWrForgeFx,
  wrForgeDone: onWrForgeDone, wrForgeDrop: onWrForgeDrop, wrTempest: onWrTempest, wrForecast: onWrForecast, wrForecastClear: onWrForecastClear, wrAtlas: onWrAtlas, wrShroud: onWrShroud, wrHaunt: onWrHaunt,
  spBecome: onSpBecome, spDark: onSpDark, spPassion: onSpPassion, spCatharsis: onSpCatharsis, spRapacity: onSpRapacity, spRow: onSpRow,
  rsOn: onRsOn, rsRise: onRsRise, rsLeave: onRsLeave, rsBody: onRsBody, rsDisc: onRsDisc, rsArt: onRsArt, rsSlumber: onRsSlumber, rsDown: onRsDown, rsArtRow: onRsArtRow,
  pjOn: onPjOn, pjProject: onPjProject, pjStain: onPjStain, pjSuppress: onPjSuppress, pjWill: onPjWill, pjEmblem: onPjEmblem, pjEyes: onPjEyes, pjRow: onPjRow, rlArt: onRlArt, rlRow: onRlRow,
  uwStorm: onUwStorm, uwFog: onUwFog, uwSlumber: onUwSlumber, uwYoke: onUwYoke, uwShare: onUwShare, uwPigment: onUwPigment, uwHue: onUwHue, uwHueAll: onUwHueAll
};
