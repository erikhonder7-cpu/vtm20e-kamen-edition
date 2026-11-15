// module/apps/zulo.mjs
// Хоумрул «Образ ужаса / форма зуло» (data/zulo.mjs): настройка мира, выбор черт формы, смена черт за опыт
// (Внутренние эксперименты — бросок вместо опыта, Закостенелый образ — смена запрещена) и превращение
// (Стремительная адаптация — 1 Воля и бросок: замены на одно превращение).

import { SYSTEM_ID } from "../config.mjs";
import { RollDialog } from "../dice/dialog.mjs";
import { ZULO_TRAITS, ZULO_GROUPS, ZULO_FLAG, ZULO_POWER, ZULO_MERITS, zuloSlots, zuloTraits } from "../data/zulo.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Zulo.${k}`, d) : game.i18n.localize(`VTM20.Zulo.${k}`);
const esc = x => foundry.utils.escapeHTML(String(x ?? ""));

export function registerZulo() {
  game.settings.register(SYSTEM_ID, "horridForm", {
    name: "VTM20.Settings.HorridForm.Name", hint: "VTM20.Settings.HorridForm.Hint",
    scope: "world", config: true, type: String, default: "core",
    choices: { core: "VTM20.Settings.HorridForm.core", zulo: "VTM20.Settings.HorridForm.zulo" }
  });
}

/** Сколько черт старого набора убрано (замены): новые слоты (Проявление Зверя) заполняются даром. */
const swapsOf = (from, to, slots) => Math.max(0, from.filter(k => !to.includes(k)).length - Math.max(0, from.length - slots));

/**
 * Окно выбора черт. mode: "learn" — первый выбор (даром), "change" — смена за опыт, "adapt" — замены на одно превращение.
 * free — сколько замен без опыта (Внутренние эксперименты), maxSwaps — предел замен (Стремительная адаптация).
 */
async function pickTraits(actor, { mode, current = [], slots, free = 0, maxSwaps = null }) {
  const name = k => esc(t(`T.${k}.name`));
  const card = x => `<label class="r-prt-form-choice r-zulo-choice${x.auto ? " is-auto" : ""}" data-key="${x.key}" data-excl="${x.excl ?? ""}"
      ${x.excl ? `data-tooltip="${esc(t("Excl", { name: t(`T.${x.excl}.name`) }))}"` : ""}>
      <input type="checkbox" name="t" value="${x.key}" ${current.includes(x.key) ? "checked" : ""}>
      <span class="r-prt-choice-mark"><i class="fa-solid ${x.icon}"></i></span>
      <span class="r-zulo-body"><span class="r-zulo-title"><b>${name(x.key)}</b><em class="r-zulo-tag" data-tooltip="${esc(t(x.auto ? "AutoTip" : "StoryTip"))}">${esc(t(`T.${x.key}.tag`))}</em></span>
        <small>${esc(t(`T.${x.key}.text`))}</small><i class="r-zulo-mark" data-mark></i></span></label>`;
  const groups = ZULO_GROUPS.map(g => `<section class="r-zulo-group"><h4 class="r-zulo-group-head"><span>${t(`G.${g}`)}</span></h4>
      <div class="r-prt-choice-grid">${ZULO_TRAITS.filter(x => x.group === g).map(card).join("")}</div></section>`).join("");
  const html = `<div class="r-prt r-zulo">
    <header class="r-prt-hero"><span class="r-prt-sigil"><i class="fa-solid fa-dragon"></i></span>
      <div><small>${t("Kicker")}</small><h2>${t(`Title.${mode}`)}</h2><p>${t(`Hint.${mode}`, { n: slots, free, max: maxSwaps ?? 0 })}</p></div></header>
    <div class="r-prt-allocation r-zulo-form" data-allocation>
      <div class="r-prt-allocation-head"><b>${t("Chosen")}</b><span>${mode === "learn" ? "" : `<span class="r-zulo-swaps" data-swaps></span>`}<strong data-count>0</strong> / ${slots}</span></div>
      <div class="r-zulo-slots" data-slots></div>
    </div>
    <div class="r-zulo-grid">${groups}</div>
    <p class="r-prt-footnote"><i class="fa-solid fa-book-skull"></i> ${t("Source")}</p>
  </div>`;
  return foundry.applications.api.DialogV2.prompt({
    window: { title: t(`Title.${mode}`), icon: "fa-solid fa-dragon" },
    classes: ["vtm20", "r-dialog", "r-protean-dialog", "r-zulo-dialog", "has-foot"], position: { width: 780 }, content: html, rejectClose: false,
    render: (event, dialog) => {
      const root = dialog.element, boxes = [...root.querySelectorAll('input[name="t"]')];
      const save = root.querySelector('footer button[data-action="ok"], .form-footer button[data-action="ok"]');
      const box = k => boxes.find(b => b.value === k);
      const update = () => {
        // порядок мест: черты, что были, — на своих местах, новые — следом
        const on = boxes.filter(b => b.checked).map(b => b.value);
        const order = [...current.filter(k => on.includes(k)), ...on.filter(k => !current.includes(k))];
        root.querySelector("[data-count]").textContent = String(on.length);
        root.querySelector("[data-slots]").innerHTML = Array.from({ length: slots }, (_, i) => {
          const k = order[i], x = k && ZULO_TRAITS.find(y => y.key === k);
          return x ? `<button type="button" class="r-zulo-slot is-on${current.length && !current.includes(k) ? " is-new" : ""}" data-unpick="${k}" data-tooltip="${esc(t("Unpick"))}">
              <span><i class="fa-solid ${x.icon}"></i></span><b>${name(k)}</b></button>`
            : `<span class="r-zulo-slot"><span>${["I", "II", "III", "IV", "V", "VI"][i] ?? i + 1}</span><b>${t("Empty")}</b></span>`;
        }).join("");
        const swaps = swapsOf(current, on, slots);
        const sw = root.querySelector("[data-swaps]");
        if (sw) sw.textContent = mode === "adapt" ? t("SwapsAdapt", { n: swaps, max: maxSwaps })
          : t("SwapsXp", { n: swaps, xp: Math.max(0, swaps - free) });
        for (const b of boxes) {
          const excl = b.closest("[data-excl]").dataset.excl, label = b.closest("label");
          b.disabled = !b.checked && (on.length >= slots || (excl && on.includes(excl)));
          label.classList.toggle("is-disabled", b.disabled);
          label.classList.toggle("is-excluded", !b.checked && !!excl && on.includes(excl));
          // смена: была и снята — «убрана», не было и взята — «новая»
          const was = current.includes(b.value), mark = label.querySelector("[data-mark]");
          const state = current.length && was && !b.checked ? "removed" : current.length && !was && b.checked ? "new" : "";
          label.classList.toggle("is-removed", state === "removed");
          label.classList.toggle("is-new", state === "new");
          mark.textContent = state ? t(state === "new" ? "MarkNew" : "MarkRemoved") : "";
        }
        const ok = on.length === slots && !(maxSwaps != null && swaps > maxSwaps);
        root.querySelector("[data-allocation]").classList.toggle("is-valid", ok);
        root.querySelector("[data-allocation]").classList.toggle("is-invalid", maxSwaps != null && swaps > maxSwaps);
        if (save) save.disabled = !ok;
      };
      boxes.forEach(b => b.addEventListener("change", update));
      root.querySelector("[data-slots]").addEventListener("click", ev => {
        const k = ev.target.closest("[data-unpick]")?.dataset.unpick;
        if (k) { box(k).checked = false; update(); }
      });
      update();
    },
    ok: { label: t(`Save.${mode}`), icon: "fa-solid fa-dragon",
      callback: (event, button) => [...button.form.querySelectorAll('input[name="t"]:checked')].map(b => b.value) }
  });
}

/** Бросок персонажа; resolve — число успехов (null — окно закрыли без броска). */
const rollFor = (actor, cfg) => new Promise(resolve => {
  let done = false;
  RollDialog.prompt(actor, { ...cfg, reflexive: true, lockTraits: true,
    onRolled: res => { done = true; resolve(Math.max(0, res?.successes ?? 0)); } })
    .then(app => app?.addEventListener?.("close", () => { if (!done) resolve(null); }, { once: true }));
});

/** Первый выбор черт (даром) или смена за опыт: Закостенелый образ — нельзя, Внутренние эксперименты — бросок. */
export async function configureZulo(actor) {
  if (!actor?.isOwner) return null;
  const current = zuloTraits(actor), slots = zuloSlots(actor);
  if (!current?.length) {
    const traits = await pickTraits(actor, { mode: "learn", slots });
    if (!traits) return null;
    await actor.setFlag(SYSTEM_ID, ZULO_FLAG, { traits });
    return traits;
  }
  if (actor.hasTrait(ZULO_MERITS.ossified)) { ui.notifications.warn(t("Ossified")); return null; }
  let free = 0;
  if (actor.hasTrait(ZULO_MERITS.experiments)) {
    const n = await rollFor(actor, { title: t("ExperimentsRoll"), trait1: "attributes.wits", trait2: "abilities.empathy", difficulty: 6 });
    if (n === null) return null;
    free = n;
  }
  const traits = await pickTraits(actor, { mode: "change", current, slots, free });
  if (!traits) return null;
  const swaps = swapsOf(current, traits, slots), cost = Math.max(0, swaps - free);
  const xp = actor.system.experience;
  if (cost && (xp?.available ?? 0) < cost) { ui.notifications.warn(game.i18n.format("VTM20.Notify.NoXp", { cost, have: xp?.available ?? 0 })); return null; }
  const upd = { [`flags.${SYSTEM_ID}.${ZULO_FLAG}`]: { traits } };
  if (cost) {
    const log = foundry.utils.deepClone(actor._source.system.experience.log);
    log.unshift({ amount: -cost, reason: t("XpReason", { n: swaps, free: Math.min(free, swaps) }), date: new Date().toLocaleDateString("ru-RU") });
    Object.assign(upd, { "system.experience.spent": actor._source.system.experience.spent + cost, "system.experience.log": log });
  }
  await actor.update(upd);
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice"><i class="fa-solid fa-dragon"></i> ${esc(t("Changed", {
    name: actor.name, list: traits.map(k => t(`T.${k}.name`)).join(", ") }))}${cost ? ` <span class="r-muted">−${cost} XP</span>` : ""}</div>` });
  return traits;
}

/** Принять Чудовищный облик: набор персонажа (если нет — выбрать), Стремительная адаптация — замены на это превращение. */
export async function activateZulo(actor) {
  let traits = zuloTraits(actor);
  if (!traits?.length) traits = await configureZulo(actor);
  if (!traits?.length) return null;
  if (actor.hasTrait(ZULO_MERITS.adaptation) && (actor.system.willpower?.temporary ?? 0) > 0) {
    const adapt = await foundry.applications.api.DialogV2.confirm({ window: { title: t("AdaptTitle"), icon: "fa-solid fa-dragon" },
      classes: ["vtm20", "r-dialog"], content: `<p>${esc(t("AdaptAsk"))}</p>`, rejectClose: false });
    if (adapt) {
      if (!(await actor.spendWillpower(1))) return null;
      const n = await rollFor(actor, { title: t("AdaptRoll"), trait1: "attributes.wits", trait2: "abilities.survival", difficulty: 7 });
      if (n) {
        const picked = await pickTraits(actor, { mode: "adapt", current: traits, slots: zuloSlots(actor), maxSwaps: n });
        if (picked) traits = picked;
      }
    }
  }
  return actor.startPower(ZULO_POWER, { shapeConfig: { zulo: traits } });
}
