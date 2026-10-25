// module/apps/power-effects.mjs
// Включение и выключение сил, действующих во времени (data/effects.mjs): у Облика Зверя —
// выбор облика, у Облика Зверя и Тумана — сколько крови потратить (1–3: превращение за 3/2/1 хода),
// у сил «час за успех» — сколько часов.

import { POWER_EFFECTS } from "../data/effects.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);

/** Включить силу (или выключить, если уже действует). */
export async function togglePowerEffect(actor, power) {
  const on = actor.powerEffects.find(x => x.power === power);
  if (on) return actor.endPower(on.effect);
  const base = POWER_EFFECTS[power];
  if (!base) return null;
  const range = Array.isArray(base.cost?.blood) ? base.cost.blood : null;
  const ask = base.hours === "successes" || base.hours === "ask";
  if (!base.variants && !range && !ask) return actor.startPower(power);

  const forms = base.variants ? Object.keys(base.variants)
    .map((k, i) => `<option value="${k}" ${i === 0 ? "selected" : ""}>${t(`Fx.Variant.${k}`)}</option>`).join("") : "";
  const bloods = range ? Array.from({ length: range[1] - range[0] + 1 }, (_, i) => range[0] + i)
    .map(n => `<option value="${n}">${t(base.charges ? "Fx.BloodCharges" : "Fx.BloodTurns", { n, turns: 4 - n })}</option>`).join("") : "";
  const res = await foundry.applications.api.DialogV2.prompt({
    window: ask && !forms && !bloods ? { title: t(base.hours === "ask" ? "Fx.HoursTitleAsk" : "Fx.HoursTitle"), icon: "fa-solid fa-hourglass-half" } : { title: t("Fx.ChooseTitle"), icon: "fa-solid fa-paw" },
    classes: ["vtm20", "r-dialog"],
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
