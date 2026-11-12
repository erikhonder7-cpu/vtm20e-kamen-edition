// module/apps/tempest.mjs
// Буря (Wraith 20, Аргос; гл. «Движение»; Book of Oblivion, «Путешествия по Буре», «Анемологическое прогнозирование»).
//  • Путь через Бурю: без Аргоса — вдвое дольше (половина обычной ходьбы; смена курса — 1 Пафос). Око погоды (Аргос 1):
//    1 Пафос, Восприятие + Аргос, сл. 6; Читающий бурю (Аргос 4): 3 Пафоса, сл. 8, а успехи ещё и ослабляют каждый Мальстрём
//    на пути. Успехи: 1 — обычное время без происшествий, 2 — ¾, 3 — ½, 4 — ¼, 5 — ¼ и прибытие в нужный момент.
//    Каждый попутчик без Аргоса — +1 к сложности (до 10); путь к своим Оковам — минус их рейтинг (не ниже 4).
//  • Прогноз Мальстрёма: 2 часа наблюдений в день; раз в неделю Интеллект + Наука, сл. 8, −1 кубик за каждый пропущенный
//    за месяц день; успех — будет ли Мальстрём на неделе (5 успехов — и иные бедствия Подземного мира). Предсказан —
//    ежедневный продолжительный бросок, сл. 7: каждые 3 успеха — сведение по порядку: дата, Сила, длительность, путь
//    и размер, опасности.

import { SYSTEM_ID } from "../config.mjs";
import { RollDialog } from "../dice/dialog.mjs";
import { t, esc, say, spendPathos } from "./wraith.mjs";

const SHARE = [1, 1, .75, .5, .25, .25];
const METHODS = { eye: { level: 1, pathos: 1, diff: 6 }, reader: { level: 4, pathos: 3, diff: 8 } };
export const FORECAST_FACTS = ["start", "force", "days", "path", "hazards"];

/** Время пути строкой: часы или дни, дробные — до получаса. */
const fmtTime = (n, unit) => `${Math.round(n * 2) / 2} ${t(`Tempest.Unit.${unit}`)}`;

/** Путь через Бурю. */
export async function tempestJourney(actor) {
  const argos = actor.system.wraith.arcanoi?.argos?.value ?? 0;
  const fetters = actor.system.wraith.fetters.map((f, i) => ({ i, f })).filter(x => !x.f.resolved && x.f.value > 0);
  const methods = Object.entries(METHODS).filter(([, m]) => argos >= m.level);
  const r = await foundry.applications.api.DialogV2.prompt({ window: { title: t("Tempest.Title") }, classes: ["vtm20", "r-dialog"], position: { width: 440 },
    content: `<p class="r-note">${t("Tempest.Lead")}</p>
      <label class="r-f"><span>${t("Tempest.Base")}</span><input type="number" name="base" value="6" min="0.5" step="0.5"></label>
      <label class="r-f"><span>${t("Tempest.UnitLabel")}</span><select name="unit"><option value="hours">${t("Tempest.Unit.hours")}</option><option value="days">${t("Tempest.Unit.days")}</option></select></label>
      <label class="r-f"><span>${t("Tempest.Method")}</span><select name="method"><option value="none">${t("Tempest.M.none")}</option>
        ${methods.map(([k, m]) => `<option value="${k}" selected>${t(`Tempest.M.${k}`, { n: m.pathos, d: m.diff })}</option>`).join("")}</select></label>
      <label class="r-f"><span>${t("Tempest.Passengers")}</span><input type="number" name="pass" value="0" min="0" max="10"></label>
      <label class="r-f"><span>${t("Tempest.ToFetter")}</span><select name="fetter"><option value="">—</option>
        ${fetters.map(x => `<option value="${x.i}">${esc(x.f.text || "—")} (${x.f.value})</option>`).join("")}</select></label>`,
    ok: { label: t("Tempest.Go"), callback: (ev, btn) => Object.fromEntries(new FormData(btn.form)) }, rejectClose: false });
  if (!r) return null;
  const base = Math.max(0.5, Number(r.base) || 1), unit = r.unit === "days" ? "days" : "hours", m = METHODS[r.method];
  if (!m) return say(actor, "fa-wind", t("Tempest.NoArgos", { name: esc(actor.name), t: fmtTime(base * 2, unit) }));
  const fetter = r.fetter !== "" ? actor.system.wraith.fetters[Number(r.fetter)] : null;
  const diff = Math.max(fetter ? 4 : 2, Math.min(10, m.diff + Math.clamp(Number(r.pass) || 0, 0, 10) - (fetter?.value ?? 0)));
  if (!(await spendPathos(actor, m.pathos))) return null;
  return RollDialog.prompt(actor, { title: t("Tempest.Title"), trait1: "attributes.perception", trait2: "wraith.argos", difficulty: diff, lockTraits: true,
    diffNote: t("Tempest.DiffNote", { d: m.diff, p: Number(r.pass) || 0, f: fetter?.value ?? 0 }),
    extra: { wraith: { kind: "tempest", method: r.method } },
    onRolled: async res => {
      const n = res?.successes ?? 0, botch = res?.outcome === "botch";
      if (!n) return say(actor, "fa-wind", t(botch ? "Tempest.Botch" : "Tempest.Lost", { name: esc(actor.name), t: fmtTime(base, unit) }), "is-warn");
      const k = Math.min(5, n), lines = [t("Tempest.Time", { t: fmtTime(base * SHARE[k], unit), base: fmtTime(base, unit) })];
      if (k === 1) lines.push(t("Tempest.Calm"));
      if (k >= 5) lines.push(t("Tempest.Dramatic"));
      if (r.method === "reader") lines.push(t("Tempest.Calmed", { n }));
      return say(actor, "fa-wind", `<b>${t("Tempest.Arrived", { name: esc(actor.name) })}</b><br>${lines.join("<br>")}`);
    } });
}

/** Прогноз Мальстрёма: недельный бросок или ежедневное уточнение (если Мальстрём уже предсказан). */
export async function forecast(actor) {
  const f = actor.getFlag(SYSTEM_ID, "forecast");
  if (f?.on) {
    return RollDialog.prompt(actor, { title: t("Forecast.DailyTitle"), trait1: "attributes.intelligence", trait2: "abilities.science", difficulty: 7, lockTraits: true,
      diffNote: t("Forecast.DailyNote", { hits: f.hits }), extra: { wraith: { kind: "forecast", step: "daily" } },
      onRolled: async res => {
        const hits = f.hits + (res?.successes ?? 0), known = Math.min(FORECAST_FACTS.length, Math.floor(hits / 3));
        await actor.setFlag(SYSTEM_ID, "forecast", { on: true, hits });
        const facts = FORECAST_FACTS.slice(0, known).map(k => t(`Forecast.Fact.${k}`));
        return say(actor, "fa-tornado", `${t("Forecast.Progress", { name: esc(actor.name), hits })}${facts.length ? `<br>${t("Forecast.Known")}: <b>${facts.join(", ")}</b>` : ""}
          ${known >= FORECAST_FACTS.length ? `<br>${t("Forecast.All")}` : ""}`);
      } });
  }
  const missed = Number(await foundry.applications.api.DialogV2.prompt({ window: { title: t("Forecast.Title") }, classes: ["vtm20", "r-dialog"],
    content: `<p class="r-note">${t("Forecast.Lead")}</p><label class="r-f"><span>${t("Forecast.Missed")}</span><input type="number" name="m" value="0" min="0" max="31"></label>`,
    ok: { label: t("Forecast.Watch"), callback: (ev, btn) => btn.form.elements.m.value }, rejectClose: false }));
  if (Number.isNaN(missed)) return null;
  return RollDialog.prompt(actor, { title: t("Forecast.Title"), trait1: "attributes.intelligence", trait2: "abilities.science", difficulty: 8, lockTraits: true,
    bonus: -Math.clamp(missed, 0, 31), bonusLabel: t("Forecast.MissedShort"), extra: { wraith: { kind: "forecast", step: "weekly" } },
    onRolled: async res => {
      const n = res?.successes ?? 0;
      if (!n) return say(actor, "fa-tornado", t("Forecast.Unclear", { name: esc(actor.name) }));
      await actor.setFlag(SYSTEM_ID, "forecast", { on: true, hits: 0 });
      return say(actor, "fa-tornado", t("Forecast.Seen", { name: esc(actor.name) }) + (n >= 5 ? ` ${t("Forecast.Other")}` : ""));
    } });
}

/** Прогноз закрыт (Мальстрём прошёл или его не будет). */
export async function forecastClear(actor) { return actor.unsetFlag(SYSTEM_ID, "forecast"); }
