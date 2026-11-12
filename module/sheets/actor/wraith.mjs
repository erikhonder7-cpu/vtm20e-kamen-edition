// module/sheets/actor/wraith.mjs
// Действия листа персонажа — призрак (apps/wraith.mjs): Арканои, Пафос, Страсти и Оковы, Тень, Катарсис, Испытания.
// this — лист (ApplicationV2 зовёт обработчики со своим this).

import { rollArt, toggleArt, addRow, removeRow, rollPassion, rollFetter, rollDarkPassion, rollMemoriam, shadowDice, catharsis, harrowing,
  pathosHeal, spendPathos, newSession, gainAngst } from "../../apps/wraith.mjs";
import { openAtlas } from "../../apps/atlas.mjs";

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
function onWrCatharsis() { return catharsis(this.actor); }
function onWrHarrowing(event, target) { return harrowing(this.actor, target.dataset.cause ?? "corpus"); }
function onWrHeal() { return pathosHeal(this.actor); }
function onWrPathos() { return spendPathos(this.actor, 1); }
function onWrSession() { return newSession(this.actor); }
function onWrAngst(event, target) { return gainAngst(this.actor, Number(target.dataset.d) || 1, { reason: game.i18n.localize("VTM20.Wraith.AngstManual") }); }
function onWrAtlas() { return openAtlas("wraith", this.actor.system.wraith.guild); }

/** Действия листа: ключ data-action → обработчик. */
export const WRAITH_ACTIONS = {
  wrArt: onWrArt, wrPick: onWrPick, wrFold: onWrFold, wrArtToggle: onWrArtToggle, wrArcAdd: onWrArcAdd, wrArcDel: onWrArcDel,
  wrRowAdd: onWrRowAdd, wrRowDel: onWrRowDel, wrPassion: onWrPassion, wrFetter: onWrFetter,
  wrDark: onWrDark, wrMemoriam: onWrMemoriam, wrShadowDice: onWrShadowDice, wrCatharsis: onWrCatharsis,
  wrHarrowing: onWrHarrowing, wrHeal: onWrHeal, wrPathos: onWrPathos, wrSession: onWrSession,
  wrAngst: onWrAngst, wrAtlas: onWrAtlas
};
