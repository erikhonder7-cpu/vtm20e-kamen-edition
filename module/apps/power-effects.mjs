// module/apps/power-effects.mjs
// Включение и выключение сил, действующих во времени (data/effects.mjs): у Облика Зверя —
// выбор облика, у Облика Зверя и Тумана — сколько крови потратить (1–3: превращение за 3/2/1 хода),
// у сил «час за успех» — сколько часов.

import { POWER_EFFECTS } from "../data/effects.mjs";
import { RollDialog } from "../dice/dialog.mjs";
import { SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);

const REVISITED_SHAPE = "protean:Модифицированный Облик Зверя";
const SHAPE_FLAG = "proteanModifiedForms";
const senseOptions = selected => [
  ["vision", t("Fx.Sense.vision")], ["hearing", t("Fx.Sense.hearing")], ["smell", t("Fx.Sense.smell")]
].map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("");

/** Постоянная настройка двух форм из Clanbook: Gangrel (Revised). */
async function configureRevisitedForms(actor) {
  const attrRows = [
    ["strength", "Attr.strength", 1],
    ["dexterity", "Attr.dexterity", 2],
    ["stamina", "Attr.stamina", 2]
  ];
  const attrHtml = attrRows.map(([key, label, value]) => `
    <div class="r-prt-attr" data-attribute="${key}">
      <span class="r-prt-attr-label">${t(label)}</span>
      <div class="r-prt-stepper">
        <button type="button" data-step="${key}" data-delta="-1" aria-label="−">−</button>
        <input type="number" name="battle${key[0].toUpperCase()}${key.slice(1)}" value="${value}" min="0" max="5" inputmode="numeric">
        <button type="button" data-step="${key}" data-delta="1" aria-label="+">+</button>
      </div>
    </div>`).join("");
  const html = `<div class="r-prt">
    <header class="r-prt-hero">
      <span class="r-prt-sigil"><i class="fa-solid fa-paw"></i></span>
      <div><small>${t("Fx.RevisitedKicker")}</small><h2>${t("Fx.RevisitedSetupTitle")}</h2>
        <p>${t("Fx.RevisitedSetupHint")}</p></div>
    </header>

    <section class="r-prt-card is-battle">
      <header class="r-prt-card-head"><span class="r-prt-index">I</span><div><h3>${t("Fx.RevisitedBattle")}</h3><p>${t("Fx.RevisitedBattleHint")}</p></div></header>
      <label class="r-prt-field is-name"><span>${t("Fx.RevisitedAnimal")}</span><input name="battleAnimal" type="text" value="волк" maxlength="32"></label>
      <div class="r-prt-allocation" data-allocation>
        <div class="r-prt-allocation-head"><b>${t("Fx.RevisitedAllocationTitle")}</b><span>${t("Fx.RevisitedPointsLeft")} <strong data-points-left>0</strong> / 5</span></div>
        <div class="r-prt-attrs">${attrHtml}</div>
        <p class="r-prt-hint">${t("Fx.RevisitedFiveDots")}</p>
      </div>
      <label class="r-prt-field"><span>${t("Fx.RevisitedSense")}</span><select name="battleSense">${senseOptions("vision")}</select></label>
    </section>

    <section class="r-prt-card is-escape">
      <header class="r-prt-card-head"><span class="r-prt-index">II</span><div><h3>${t("Fx.RevisitedEscape")}</h3><p>${t("Fx.RevisitedEscapeHint")}</p></div></header>
      <label class="r-prt-field is-name"><span>${t("Fx.RevisitedAnimal")}</span><input name="escapeAnimal" type="text" value="летучая мышь" maxlength="32"></label>
      <div class="r-prt-two-col">
        <label class="r-prt-field"><span>${t("Fx.RevisitedMovement")}</span><select name="escapeFlying"><option value="yes" selected>${t("Fx.RevisitedFlying")}</option><option value="no">${t("Fx.RevisitedGround")}</option></select></label>
        <label class="r-prt-field"><span>${t("Fx.RevisitedSize")}</span><select name="escapeLarge"><option value="no" selected>${t("Fx.RevisitedSmall")}</option><option value="yes">${t("Fx.RevisitedLarge")}</option></select></label>
      </div>
      <label class="r-prt-field"><span>${t("Fx.RevisitedSense")}</span><select name="escapeSense">${senseOptions("hearing")}</select></label>
    </section>
    <p class="r-prt-footnote"><i class="fa-solid fa-lock"></i> ${t("Fx.RevisitedPermanentHint")}</p>
  </div>`;
  const raw = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("Fx.RevisitedSetupTitle"), icon: "fa-solid fa-paw" },
    classes: ["vtm20", "r-dialog", "r-protean-dialog", "has-foot"],
    position: { width: 660 }, content: html, rejectClose: false,
    render: (event, dialog) => {
      const root = dialog.element;
      const inputs = Object.fromEntries(attrRows.map(([key]) => [key,
        root.querySelector(`[data-attribute="${key}"] input`)]));
      const left = root.querySelector("[data-points-left]");
      const allocation = root.querySelector("[data-allocation]");
      const save = root.querySelector('.form-footer button[data-action="ok"], footer button[data-action="ok"], .form-footer button.default');
      const values = () => Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key,
        Math.max(0, Math.min(5, Math.floor(Number(input?.value) || 0)))]));
      const update = () => {
        const v = values(), total = Object.values(v).reduce((sum, n) => sum + n, 0);
        left.textContent = String(5 - total);
        allocation.classList.toggle("is-valid", total === 5);
        allocation.classList.toggle("is-invalid", total > 5);
        for (const [key, input] of Object.entries(inputs)) {
          const others = total - v[key];
          input.max = String(Math.max(0, 5 - others));
          const box = input.closest(".r-prt-attr");
          const minus = box.querySelector('[data-delta="-1"]');
          const plus = box.querySelector('[data-delta="1"]');
          minus.disabled = v[key] <= 0;
          plus.disabled = v[key] >= 5 - others;
        }
        if (save) save.disabled = total !== 5;
      };
      root.querySelectorAll("[data-step]").forEach(button => button.addEventListener("click", () => {
        const input = inputs[button.dataset.step];
        input.value = Math.max(0, Math.min(Number(input.max) || 5, (Number(input.value) || 0) + Number(button.dataset.delta)));
        update();
      }));
      Object.values(inputs).forEach(input => input.addEventListener("input", () => {
        const others = Object.entries(inputs).filter(([, x]) => x !== input).reduce((sum, [, x]) => sum + (Number(x.value) || 0), 0);
        input.value = Math.max(0, Math.min(5 - others, Math.floor(Number(input.value) || 0)));
        update();
      }));
      update();
    },
    ok: { label: t("Fx.RevisitedSave"), icon: "fa-solid fa-paw", callback: (event, button) => {
      const f = button.form.elements;
      return {
        battle: { animal: String(f.battleAnimal.value || "зверь").trim().slice(0,32),
          attr: { strength: Number(f.battleStrength.value), dexterity: Number(f.battleDexterity.value), stamina: Number(f.battleStamina.value) },
          sense: f.battleSense.value },
        escape: { animal: String(f.escapeAnimal.value || "зверь").trim().slice(0,32),
          flying: f.escapeFlying.value === "yes", large: f.escapeLarge.value === "yes", sense: f.escapeSense.value }
      };
    } }
  });
  if (!raw) return null;
  const stats = raw.battle.attr;
  const total = stats.strength + stats.dexterity + stats.stamina;
  if (total !== 5 || Object.values(stats).some(n => n < 0 || n > 5)) {
    ui.notifications.warn(t("Fx.RevisitedFiveDotsError"));
    return null;
  }
  await actor.setFlag(SYSTEM_ID, SHAPE_FLAG, raw);
  return raw;
}

/** Выбор одной из двух заранее закреплённых форм и цены превращения. */
async function activateRevisitedShape(actor, config) {
  const bloodOptions = [1,2,3].map(n => `<label class="r-prt-blood-choice"><input type="radio" name="blood" value="${n}" ${n===2?"checked":""}><span class="r-prt-blood-drop"><i class="fa-solid fa-droplet"></i><b>${n}</b></span><span><b>${t("Fx.BloodTurns", { n, turns: 4-n })}</b><small>${t("Fx.RevisitedBloodHint", { turns: 4-n })}</small></span></label>`).join("");
  const formOptions = [
    `<label class="r-prt-form-choice"><input type="radio" name="variant" value="battle" checked><span class="r-prt-choice-mark"><i class="fa-solid fa-paw"></i></span><span><b>${t("Fx.RevisitedBattle")}</b><small>${foundry.utils.escapeHTML(config.battle.animal)}</small></span></label>`,
    `<label class="r-prt-form-choice"><input type="radio" name="variant" value="escape"><span class="r-prt-choice-mark"><i class="fa-solid fa-feather-pointed"></i></span><span><b>${t("Fx.RevisitedEscape")}</b><small>${foundry.utils.escapeHTML(config.escape.animal)}</small></span></label>`
  ].join("");
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("Fx.RevisitedActivateTitle"), icon: "fa-solid fa-paw" },
    classes: ["vtm20", "r-dialog", "r-protean-dialog", "has-foot"], position: { width: 540 }, rejectClose: false,
    content: `<div class="r-prt r-prt-activate">
      <header class="r-prt-hero"><span class="r-prt-sigil"><i class="fa-solid fa-paw"></i></span><div><small>${t("Fx.RevisitedKicker")}</small><h2>${t("Fx.RevisitedActivateTitle")}</h2><p>${t("Fx.RevisitedActivateHint")}</p></div></header>
      <section class="r-prt-card"><header class="r-prt-card-head"><span class="r-prt-index">I</span><div><h3>${t("Fx.Form")}</h3><p>${t("Fx.RevisitedPickFormHint")}</p></div></header><div class="r-prt-choice-grid">${formOptions}</div></section>
      <section class="r-prt-card"><header class="r-prt-card-head"><span class="r-prt-index">II</span><div><h3>${t("Fx.Blood")}</h3><p>${t("Fx.RevisitedBloodIntro")}</p></div></header><div class="r-prt-blood-grid">${bloodOptions}</div></section>
    </div>`,
    ok: { label: t("Fx.Toggle"), icon: "fa-solid fa-wand-sparkles", callback: (event, button) => ({
      variant: button.form.elements.variant.value, blood: Number(button.form.elements.blood.value)
    }) }
  });
  if (!res) return null;
  return actor.startPower(REVISITED_SHAPE, { ...res, shapeConfig: config });
}

/** Включить силу (или выключить, если уже действует). */
export async function togglePowerEffect(actor, power) {
  const discipline = String(power).split(":", 1)[0];
  const animalFormBanned = new Set(["necromancy", "serpentis", "thaumaturgy", "vicissitude"]);
  const on = actor.powerEffects.find(x => x.power === power);
  // Выключение уже действующей силы всегда доступно, даже если персонаж позже получил состояние.
  if (!on && actor.system.fx?.earthMeld) return ui.notifications.warn(t("Fx.EarthNoAction"));
  if (!on && actor.system.fx?.beastForm && animalFormBanned.has(discipline)) {
    const label = actor.items.find(i => i.type === "discipline" && i.system.key === discipline)?.name ?? discipline;
    return ui.notifications.warn(t("Fx.BeastDisciplineBan", { name: label }));
  }
  // В торпоре силы нельзя активировать вообще; пронзённый колом вампир не может менять тело.
  if (!on && power.startsWith("protean:") && (actor.statuses?.has("r-torpor") || ((/^protean:[2-5]$/.test(power) || power === REVISITED_SHAPE) && actor.statuses?.has("r-staked"))))
    return ui.notifications.warn(t("Fx.ProteanStaked"));
  // Когти, Слияние с землёй, Облик Зверя и Туманная форма — взаимоисключающие телесные формы.
  const bodyForms = new Set(["protean:2", "protean:3", "protean:4", "protean:5", REVISITED_SHAPE]);
  if (!on && bodyForms.has(power)) {
    const existing = actor.powerEffects.find(x => x.power !== power && bodyForms.has(x.power));
    if (existing) return ui.notifications.warn(t("Fx.ProteanFormConflict", { name: existing.effect.name }));
  }
  if (on) {
    // Слияние с землёй нельзя снять простым повторным щелчком: нужно преодолеть оцепенение.
    if (power === "protean:3" && on.effect.flags?.[SYSTEM_ID]?.ready !== false) return RollDialog.prompt(actor, {
      title: t("Fx.EarthWakeTitle"), trait1: "morality.value", difficulty: 6, kind: "check", reflexive: true, lockTraits: true,
      diffNote: t("Fx.EarthWakeDiff"),
      onRolled: async result => {
        if ((result?.successes ?? 0) > 0) await actor.endPower(on.effect);
        else ui.notifications.info(t("Fx.EarthWakeFail"));
      }
    });
    return actor.endPower(on.effect);
  }
  if (power === REVISITED_SHAPE) {
    // Гангрелы и их ветви (Городские, Дикие, антитрибу) — Clanbook: Gangrel (Revised)
    if (Codex.traitClan(actor.system.clan) !== "gangrel") return ui.notifications.warn(t("Fx.RevisitedGangrelOnly"));
    let config = actor.getFlag(SYSTEM_ID, SHAPE_FLAG);
    if (!config) {
      config = await configureRevisitedForms(actor);
      if (!config) return null;
    }
    return activateRevisitedShape(actor, config);
  }
  const base = POWER_EFFECTS[power];
  if (!base) return null;
  if (base.requiresSoil) {
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("Fx.SoilTitle") },
      content: `<p>${t("Fx.SoilConfirm")}</p>`, rejectClose: false });
    if (!ok) return null;
  }
  const range = Array.isArray(base.cost?.blood) ? base.cost.blood : null;
  const ask = base.hours === "successes" || base.hours === "ask";
  if (!base.variants && !range && !ask) return actor.startPower(power);

  const forms = base.variants ? Object.keys(base.variants)
    .map((k, i) => `<option value="${k}" ${i === 0 ? "selected" : ""}>${t(`Fx.Variant.${k}`)}</option>`).join("") : "";
  const bloods = range ? Array.from({ length: range[1] - range[0] + 1 }, (_, i) => range[0] + i)
    .map(n => `<option value="${n}">${t(base.charges ? "Fx.BloodCharges" : "Fx.BloodTurns", { n, turns: 4 - n })}</option>`).join("") : "";
  const res = await foundry.applications.api.DialogV2.prompt({
    window: ask && !forms && !bloods ? { title: t(base.hours === "ask" ? "Fx.HoursTitleAsk" : "Fx.HoursTitle"), icon: "fa-solid fa-hourglass-half" } : { title: t("Fx.ChooseTitle"), icon: "fa-solid fa-paw" },
    classes: ["vtm20", "r-dialog", ...(power.startsWith("protean:") ? ["r-protean-dialog"] : [])], position: power.startsWith("protean:") ? { width: 480 } : undefined,
    content: `<div class="r-form">
      ${forms ? `<label class="r-field"><span>${t("Fx.Form")}</span><select name="variant">${forms}</select></label>` : ""}
      ${bloods ? `<label class="r-field"><span>${t("Fx.Blood")}</span><select name="blood">${bloods}</select></label>` : ""}
      ${ask ? `<label class="r-field"><span>${t("Fx.Hours")}</span><select name="hours">${Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${t("Fx.HoursN", { n: i + 1 })}</option>`).join("")}</select></label>` : ""}
    </div>`,
    ok: { label: t("Fx.Toggle"), callback: (e, b) => ({ variant: b.form.elements.variant?.value ?? "", blood: Number(b.form.elements.blood?.value) || null,
      hours: Number(b.form.elements.hours?.value) || null }) },
    rejectClose: false
  });
  if (!res) return null;
  return actor.startPower(power, res);
}


/** Внешняя угроза немедленно выбрасывает вампира из Слияния с землёй. */
export async function wakeEarthMeld(actor, reason = "") {
  const on = actor?.powerEffects?.find(x => x.power === "protean:3" && x.def.earthMeld);
  if (!on) return false;
  await actor.endPower(on.effect, { quiet: true });
  const note = reason ? `<p>${reason}</p>` : "";
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="r-notice is-warn"><i class="fa-solid fa-mound"></i> ${t("Fx.EarthWakeThreat", { name: actor.name })}${note}<p>${t("Fx.EarthWakeBurst")}</p></div>` });
  return true;
}

let hooksRegistered = false;
const transformingEffects = new Map();

/** В бою отсчитываем превращение на концах собственных ходов; вне боя эффект готов сразу. */
export function registerPowerEffectHooks() {
  if (hooksRegistered) return;
  hooksRegistered = true;
  Hooks.on("preUpdateCombat", (combat, changes) => {
    if (!game.user.isGM || !("turn" in changes || "round" in changes) || !combat.started) return;
    transformingEffects.set(combat.id, combat.combatant?.actor ?? null);
  });
  Hooks.on("updateCombat", async combat => {
    if (!game.user.isGM) return;
    const actor = transformingEffects.get(combat.id);
    transformingEffects.delete(combat.id);
    if (!actor) return;
    for (const effect of actor.effects) {
      const flags = effect.flags?.[SYSTEM_ID];
      if (!flags?.power || flags.ready !== false) continue;
      const left = Math.max(0, (Number(flags.transformTurnsLeft) || 1) - 1);
      if (left > 0) {
        await effect.setFlag(SYSTEM_ID, "transformTurnsLeft", left);
        continue;
      }
      await effect.setFlag(SYSTEM_ID, "transformTurnsLeft", 0);
      await effect.setFlag(SYSTEM_ID, "ready", true);
      // Природное оружие появляется только после завершения превращения.
      await actor.createPowerWeapons?.(effect);
      ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="r-notice"><i class="fa-solid fa-wand-sparkles"></i> ${t("Fx.TransformReady", { name: effect.name })}</div>` });
    }
  });

  // Глаза Зверя меняют зрение самих токенов, а не только карточку персонажа.
  // Пишет один клиент: активный рассказчик (может править любой жетон), без него — владелец персонажа;
  // иначе рассказчик и игрок одновременно меняют зрение и флаг одного жетона.
  const syncEyes = async actor => {
    if (!actor?.getActiveTokens) return;
    const writer = game.users.activeGM ? game.users.activeGM.isSelf : actor.isOwner;
    if (!writer) return;
    const active = !!actor.system?.fx?.darkvision;
    for (const token of actor.getActiveTokens(true, true)) {
      const doc = token.document ?? token;
      if (!doc.isOwner && !game.user.isGM) continue;
      const saved = doc.getFlag?.(SYSTEM_ID, "proteanVisionOriginal");
      if (active && !saved) {
        const original = { enabled: !!doc.sight?.enabled, visionMode: doc.sight?.visionMode ?? "basic", range: doc.sight?.range ?? null };
        await doc.setFlag(SYSTEM_ID, "proteanVisionOriginal", original);
        // В Foundry V14 range=null означает неограниченное зрение без источника света;
        // darkvision меняет только картинку, поэтому одного visionMode недостаточно.
        await doc.update({ "sight.enabled": true, "sight.visionMode": "darkvision", "sight.range": null });
      } else if (!active && saved) {
        await doc.update({ "sight.enabled": saved.enabled, "sight.visionMode": saved.visionMode, "sight.range": saved.range ?? doc.sight?.range ?? null });
        await doc.unsetFlag(SYSTEM_ID, "proteanVisionOriginal");
      }
    }
  };
  const effectActor = effect => effect?.parent?.documentName === "Actor" ? effect.parent : null;
  for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
    Hooks.on(hook, effect => { const actor = effectActor(effect); if (actor) syncEyes(actor); });
  }
  Hooks.on("createToken", token => { const actor = token.actor; if (actor) syncEyes(actor); });
  // Слияние с землёй: нельзя вручную сдвинуть жетон, пока персонаж не пробуждён.
  Hooks.on("preUpdateToken", (token, changes) => {
    if (!token.actor?.system?.fx?.earthMeld || (!Object.hasOwn(changes, "x") && !Object.hasOwn(changes, "y"))) return;
    ui.notifications.warn(t("Fx.EarthMoveBlock", { name: token.actor.name }));
    return false;
  });
  Hooks.on("canvasReady", () => { for (const actor of game.actors) if (actor.system?.fx?.darkvision || actor.getActiveTokens?.(true, true).some(tk => (tk.document ?? tk).getFlag?.(SYSTEM_ID, "proteanVisionOriginal"))) syncEyes(actor); });
}
