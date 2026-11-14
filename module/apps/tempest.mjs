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
import { t, esc, say, spendPathos, necropolisOf } from "./wraith.mjs";

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
  const best = methods.at(-1)?.[0] ?? "none", necroD = necropolisOf()?.argos ?? 0;
  const tile = (k, title, sub, on, locked) => `<label class="r-wr-dlg-tile ${locked ? "is-locked" : ""}"><input type="radio" name="method" value="${k}" ${on ? "checked" : ""} ${locked ? "disabled" : ""}>
    <b>${title}</b><span>${sub}</span></label>`;
  const stepper = (name, v, min, max, step = 1) => `<span class="r-wr-dlg-step" data-min="${min}" data-max="${max}" data-step="${step}"><a data-d="-1"><i class="fa-solid fa-minus"></i></a>
    <input type="number" name="${name}" value="${v}" min="${min}" max="${max}" step="${step}"><a data-d="1"><i class="fa-solid fa-plus"></i></a></span>`;
  const r = await foundry.applications.api.DialogV2.prompt({ window: { title: t("Tempest.Title"), icon: "fa-solid fa-wind" }, rType: "wraith", classes: ["vtm20", "r-dialog", "r-wr-dlg", "r-type-wraith"], position: { width: 500 },
    content: `<p class="r-wr-dlg-lead"><i class="fa-solid fa-wind"></i> ${t("Tempest.Lead")}</p>
      <div class="r-wr-dlg-sec">${t("Tempest.Method")}</div>
      <div class="r-wr-dlg-tiles">
        ${tile("none", t("Tempest.Tile.none"), t("Tempest.Tile.noneSub"), best === "none", false)}
        ${Object.entries(METHODS).map(([k, m]) => tile(k, t(`Tempest.Chip.${k}`), t("Tempest.Tile.sub", { n: m.pathos, d: m.diff, l: m.level }), best === k, argos < m.level)).join("")}
      </div>
      <div class="r-wr-dlg-grid">
        <label class="r-wr-dlg-f"><span>${t("Tempest.Base")}</span><span class="r-wr-dlg-row">${stepper("base", 6, 0.5, 999, 0.5)}
          <span class="r-wr-dlg-seg"><label><input type="radio" name="unit" value="hours" checked><span>${t("Tempest.UnitLong.hours")}</span></label><label><input type="radio" name="unit" value="days"><span>${t("Tempest.UnitLong.days")}</span></label></span></span></label>
        <label class="r-wr-dlg-f"><span>${t("Tempest.Passengers")}</span>${stepper("pass", 0, 0, 10)}</label>
        <label class="r-wr-dlg-f"><span>${t("Tempest.ToFetter")}</span><select name="fetter"><option value="">—</option>
          ${fetters.map(x => `<option value="${x.i}" data-v="${x.f.value}">${esc(x.f.text || "—")} (${x.f.value})</option>`).join("")}</select></label>
        <label class="r-wr-dlg-toggle" data-tooltip="${esc(t("Tempest.FistulaHint"))}"><input type="checkbox" name="fistula"><span><i class="fa-solid fa-virus"></i> ${t("Tempest.Fistula")} −2</span></label>
      </div>
      <div class="r-wr-dlg-sum" data-sum></div>`,
    render: (ev, dlg) => {
      const f = dlg.element.querySelector("form") ?? dlg.element, sum = f.querySelector("[data-sum]");
      const upd = () => {
        const v = Object.fromEntries(new FormData(f)), m = METHODS[v.method], base = Math.max(0.5, Number(v.base) || 1), unit = v.unit === "days" ? "days" : "hours";
        if (!m) return sum.innerHTML = `<span><i class="fa-solid fa-clock"></i> ${t("Tempest.Sum.time")} <b>${fmtTime(base * 2, unit)}</b></span><span class="is-muted">${t("Tempest.Sum.noRoll")}</span>`;
        const fv = Number(f.querySelector("[name=fetter] option:checked")?.dataset.v) || 0;
        const d = Math.max(fv ? 4 : 2, Math.min(10, m.diff + necroD - (v.fistula ? 2 : 0) + (Number(v.pass) || 0) - fv));
        sum.innerHTML = `<span><i class="fa-solid fa-bullseye"></i> ${t("Tempest.Sum.diff")} <b>${d}</b></span><span><i class="fa-solid fa-droplet"></i> ${t("Tempest.Sum.pathos")} <b>${m.pathos}</b></span>
          <span><i class="fa-solid fa-clock"></i> ${t("Tempest.Sum.time")} <b>${fmtTime(base * .25, unit)} – ${fmtTime(base, unit)}</b></span>`;
      };
      f.querySelectorAll(".r-wr-dlg-step a").forEach(a => a.addEventListener("click", () => {
        const s = a.closest(".r-wr-dlg-step"), inp = s.querySelector("input"), st = Number(s.dataset.step) || 1;
        inp.value = Math.clamp((Number(inp.value) || 0) + Number(a.dataset.d) * st, Number(s.dataset.min), Number(s.dataset.max)); upd();
      }));
      f.addEventListener("input", upd); f.addEventListener("change", upd); upd();
    },
    ok: { label: t("Tempest.Go"), icon: "fa-solid fa-person-walking", callback: (ev, btn) => Object.fromEntries(new FormData(btn.form)) }, rejectClose: false });
  if (!r) return null;
  const base = Math.max(0.5, Number(r.base) || 1), unit = r.unit === "days" ? "days" : "hours", m = METHODS[r.method];
  if (!m) return say(actor, "fa-wind", t("Tempest.NoArgos", { name: esc(actor.name), t: fmtTime(base * 2, unit) }));
  const fetter = r.fetter !== "" ? actor.system.wraith.fetters[Number(r.fetter)] : null;
  // Сиэтл (Book of Oblivion): Аргос в Пьюджет-Саунде +1 к сложности
  const necro = necropolisOf()?.argos ?? 0;
  // через фистулу — шрам Покрова между Нарывом Лабиринта и Нихилом (Book of Oblivion): −2
  const fist = r.fistula ? 2 : 0;
  const diff = Math.max(fetter ? 4 : 2, Math.min(10, m.diff + necro - fist + Math.clamp(Number(r.pass) || 0, 0, 10) - (fetter?.value ?? 0)));
  if (!(await spendPathos(actor, m.pathos))) return null;
  return RollDialog.prompt(actor, { title: t("Tempest.Title"), trait1: "attributes.perception", trait2: "wraith.argos", difficulty: diff, lockTraits: true,
    diffNote: t("Tempest.DiffNote", { d: m.diff, p: Number(r.pass) || 0, f: fetter?.value ?? 0 }) + (necro ? ` · ${t("Necro.ArgosNote", { name: necropolisOf().name })}` : "") + (fist ? ` · ${t("Tempest.Fistula")} −2` : ""),
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
  const pool = (actor.system.attributes?.intelligence?.total ?? 0) + (actor.system.abilities?.science?.value ?? 0);
  const missed = Number(await foundry.applications.api.DialogV2.prompt({ window: { title: t("Forecast.Title"), icon: "fa-solid fa-tornado" }, rType: "wraith", classes: ["vtm20", "r-dialog", "r-wr-dlg", "r-type-wraith"], position: { width: 420 },
    content: `<p class="r-wr-dlg-lead"><i class="fa-solid fa-tornado"></i> ${t("Forecast.Lead")}</p>
      <div class="r-wr-dlg-grid is-one">
        <label class="r-wr-dlg-f"><span>${t("Forecast.Missed")}</span><span class="r-wr-dlg-step" data-min="0" data-max="31" data-step="1"><a data-d="-1"><i class="fa-solid fa-minus"></i></a>
          <input type="number" name="m" value="0" min="0" max="31"><a data-d="1"><i class="fa-solid fa-plus"></i></a></span></label>
      </div>
      <div class="r-wr-dlg-sum" data-sum></div>`,
    render: (ev, dlg) => {
      const f = dlg.element.querySelector("form") ?? dlg.element, sum = f.querySelector("[data-sum]"), inp = f.querySelector("[name=m]");
      const upd = () => { const n = Math.max(0, pool - (Number(inp.value) || 0));
        sum.innerHTML = `<span><i class="fa-solid fa-dice-d10"></i> ${t("Forecast.Sum.pool")} <b>${n}</b></span><span><i class="fa-solid fa-bullseye"></i> ${t("Tempest.Sum.diff")} <b>8</b></span>`; };
      f.querySelectorAll(".r-wr-dlg-step a").forEach(a => a.addEventListener("click", () => { inp.value = Math.clamp((Number(inp.value) || 0) + Number(a.dataset.d), 0, 31); upd(); }));
      inp.addEventListener("input", upd); upd();
    },
    ok: { label: t("Forecast.Watch"), icon: "fa-solid fa-eye", callback: (ev, btn) => btn.form.elements.m.value }, rejectClose: false }));
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
