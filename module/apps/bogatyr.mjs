// module/apps/bogatyr.mjs
// Хоумрул «Богатыри» (data/bogatyr.mjs): настройка мира, Плащ Старейшего (эффект на ночь — солнце загоняет симбионта
// обратно), регенерация взрослого Богатыря — 1 уровень за ход (и губительного): в бою сама в начале его хода (пишет
// активный рассказчик), вне боя — кнопкой на листе.

import { SYSTEM_ID, VTM20 } from "../config.mjs";
import { BOGATYR_MANTLE, bogatyrOn, isBogatyr, isMatureBogatyr } from "../data/bogatyr.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Bogatyr.${k}`, d) : game.i18n.localize(`VTM20.Bogatyr.${k}`);
const esc = x => foundry.utils.escapeHTML(String(x ?? ""));
const notice = (actor, icon, html) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="r-notice r-type-vampire"><i class="fa-solid ${icon}"></i> ${html}</div>` });

export function registerBogatyr() {
  game.settings.register(SYSTEM_ID, "bogatyri", {
    name: "VTM20.Settings.Bogatyri.Name", hint: "VTM20.Settings.Bogatyri.Hint",
    scope: "world", config: true, type: Boolean, default: false, requiresReload: true
  });
  // выключен — его записи в компендиях (силы, Путь Кошмаров, ритуалы, глава 12 правил; tools/build_packs.mjs → флаг homerule)
  // спрятаны вместе с опустевшими папками
  for (const doc of ["Item", "JournalEntry"]) {
    const f = CONFIG[doc].compendiumIndexFields ??= [], key = `flags.${SYSTEM_ID}.homerule`;
    if (!f.includes(key)) f.push(key);
  }
  Hooks.on("renderCompendium", (app, el) => hideHomerules(app, el instanceof HTMLElement ? el : el?.[0]));
  // регенерация в бою: в начале хода взрослого Богатыря — 1 уровень (сначала самый тяжёлый)
  Hooks.on("updateCombat", (combat, diff) => {
    if (!game.users.activeGM?.isSelf || !combat.started || !("turn" in diff || "round" in diff)) return;
    const actor = combat.combatant?.actor;
    if (isMatureBogatyr(actor) && actor.system.health.damage > 0) regenerate(actor, { quiet: false });
  });
}

/** Спрятать в окне компендия записи выключенного хоумрула и папки, где ничего не осталось. */
async function hideHomerules(app, el) {
  const pack = app.collection;
  if (!el || bogatyrOn() || !pack?.index || pack.metadata?.packageName !== SYSTEM_ID) return;
  // начальный индекс приходит без флагов — дочитать поле метки (один раз на компендий, дальше из кэша)
  const index = await pack.getIndex({ fields: [`flags.${SYSTEM_ID}.homerule`] });
  const off = index.filter(e => e.flags?.[SYSTEM_ID]?.homerule === "bogatyr");
  if (!off.length) return;
  for (const e of off) el.querySelector(`li.entry[data-entry-id="${e._id}"]`)?.classList.add("r-homerule-off");
  // папки — от самых глубоких: пустая, если в ней нет видимой записи
  const folders = [...el.querySelectorAll("li.folder")].reverse();
  for (const f of folders) if (!f.querySelector("li.entry:not(.r-homerule-off)")) f.classList.add("r-homerule-off");
}

/** Регенерация: 1 уровень урона — сначала губительный, затем летальный, затем ударный. */
export async function regenerate(actor, { quiet = false } = {}) {
  if (!isBogatyr(actor)) return null;
  if (!isMatureBogatyr(actor)) return ui.notifications.warn(t("LarvalNoRegen"));
  const h = actor.system.health, type = h.aggravated > 0 ? "aggravated" : h.lethal > 0 ? "lethal" : h.bashing > 0 ? "bashing" : null;
  if (!type) { if (!quiet) ui.notifications.info(t("NoDamage")); return null; }
  await actor.healDamage(type, 1);
  await notice(actor, "fa-heart-pulse", esc(t("Regen", { name: actor.name, type: game.i18n.localize(VTM20.damageTypes[type]?.label ?? type) })));
  return type;
}

/** Плащ Старейшего: включить (только ночью — подтверждает рассказчик) или снять. */
export async function toggleMantle(actor) {
  if (!isBogatyr(actor)) return null;
  const on = actor.powerEffects.find(x => x.power === BOGATYR_MANTLE);
  if (on) return actor.endPower(on.effect);
  if (!isMatureBogatyr(actor)) return ui.notifications.warn(t("LarvalNoMantle"));
  const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{ name: t("Mantle"), img: "icons/svg/skull.svg",
    description: `<p>${esc(t("MantleDesc"))}</p>`, flags: { [SYSTEM_ID]: { power: BOGATYR_MANTLE, mode: "night", ready: true,
      ...(await untilDawn()) } } }]);
  await actor.createPowerWeapons(effect);
  await notice(actor, "fa-skull", esc(t("MantleOn", { name: actor.name })));
  return effect;
}

/** Срок «до рассвета» по часам хроники (apps/timers.mjs). */
async function untilDawn() {
  const { untilFor } = await import("./timers.mjs"), { getClock } = await import("./calendar.mjs");
  const now = getClock(), until = untilFor("night", { now });
  return until ? { start: now, until } : {};
}
