// module/apps/lykeian.mjs
// Ликийцы (C20 Players Guide, гл. 7) — сознательные химеры с земным Обликом; вариант листа подменыша
// (system.changeling.variant = "lykeian", черты — system.changeling.lykeian). Данные — data/changeling.json → lykeian, redes.
//   · Форма (аналог Ступени): гуманоид +1 Воля, животное +1 Воля или Гламур, мифический +1 Гламур (и +1 Гламур через Наследия);
//   · Облик (аналог кита): Благословения — +2 к Способности Облика (даже выше 5) и без провала по ней; Недуг;
//   · Тезис и два Наследия — основное (Благое или Неблагое) и Кошмар-Наследие;
//   · вместо Искусств и Царств — Реды на 5 химерических очков; кантрипов нет, Вирд не призывают;
//   · Кошмар 10 — Дисбаланс на точку Гламура (а не Воли), все точки Гламура в Дисбалансе — ликиец становится Кошмаром;
//     снять Банальность — ценой постоянной точки Гламура, снять Дисбаланс — ценой постоянной точки Воли;
//   · Жатва — путь таллейнов: бросок Гламура (сл. 5), успех наполняет запас, ботч — Банальность; всегда +1 Дисбаланс.
// Сколько Кошмара за Воле или Гламур через Кошмар-Наследие, книга не говорит — 1 (правило системы).

import { C, say, addBanality } from "./changeling.mjs";
import { VTM20 } from "../config.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Lykeian.${k}`, d) : game.i18n.localize(`VTM20.Lykeian.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const L = () => C().lykeian ?? { shapes: [], guises: [] };

export const isLykeian = a => a?.type === "changeling" && a.system?.changeling?.variant === "lykeian";
export const guiseOf = key => L().guises.find(g => g.key === key) ?? null;
export const shapeOf = key => L().shapes.find(s => s.key === key) ?? null;
const redeOf = key => (C().redes ?? []).find(r => r.key === key) ?? null;

/** Способность Облика: +2 (даже выше 5) и без провала. */
export const GUISE_ABILITY = { bucolic: "animalKen", maieutic: "academics", oppidan: "empathy", quixotic: "enigmas" };
/** Поправки Формы при создании. */
export const SHAPE_BONUS = { humanoid: { willpower: 1 }, animal: { choice: true }, mythic: { glamour: 1 } };
/** Цены ликийца (гл. 7): свободные — Способность 2, Атрибут 5, Фон 1, Гламур 3, Воля 2, Ред — химерические очки × 2; опыт — Ред × 5. */
export const LYKEIAN_COST = { rede: 2, will: 2, redeXp: 5, redes: 5 };

/** Не проваливают бросок: Облик ликийца (своя Способность), Лебединая дева (Этикет, Выступление), богган (Ремесло). */
export function noBotchFor(actor, traits = []) {
  if (actor?.type !== "changeling") return false;
  const ab = traits.filter(p => p?.startsWith("abilities.")).map(p => p.split(".")[1]), c = actor.system.changeling;
  if (isLykeian(actor) && ab.includes(GUISE_ABILITY[c.lykeian?.guise])) return true;
  if (c.kith === "swanMaiden" && ab.some(k => k === "etiquette" || k === "performance")) return true;
  if (c.kith === "boggan" && ab.includes("crafts")) return true;
  return false;
}

/** Недуги в окне броска: Тоска по людям при пустой Воле, Плохие проигравшие при сопернике — +2 ко всем сложностям. */
export function lykeianDiff(actor) {
  if (!isLykeian(actor)) return [];
  const g = actor.system.changeling.lykeian?.guise, out = [];
  if (g === "oppidan" && (actor.system.willpower?.temporary ?? 1) <= 0) out.push({ label: t("Panic"), value: 2 });
  if (g === "maieutic" && actor.system.changeling.lykeian?.rival) out.push({ label: t("Rival"), value: 2 });
  return out;
}

/** Очки Редов ликийца. */
export const redePoints = c => (c.lykeian?.redes ?? []).reduce((s, r) => s + (Number(r.pts) || 0), 0);

/** Шапка и вкладка «Облик» листа. */
export function lykeianInfo(actor) {
  if (!isLykeian(actor)) return null;
  const c = actor.system.changeling, ly = c.lykeian ?? {}, g = guiseOf(ly.guise), sh = shapeOf(ly.shape);
  const opts = (list, cur) => list.map(x => ({ key: x.key, name: x.name, selected: x.key === cur }));
  const pts = redePoints(c);
  return {
    guises: opts(L().guises, ly.guise), shapes: opts(L().shapes, ly.shape), guise: g, shape: sh,
    nightmareLegacies: opts(C().legacies ?? [], ly.nightmareLegacy), nightmareLegacy: (C().legacies ?? []).find(l => l.key === ly.nightmareLegacy) ?? null,
    ability: g ? game.i18n.localize(VTM20.abilities[GUISE_ABILITY[g.key]]?.label ?? GUISE_ABILITY[g.key]) : "",
    redes: (ly.redes ?? []).map((r, i) => ({ i, key: r.key, pts: r.pts, name: redeOf(r.key)?.name ?? r.key, en: redeOf(r.key)?.en ?? "", text: redeOf(r.key)?.text ?? "",
      variable: !!redeOf(r.key)?.variable })),
    avail: (C().redes ?? []).filter(r => !(ly.redes ?? []).some(x => x.key === r.key)).map(r => ({ key: r.key, label: `${r.name} (${r.cost})` })),
    pts, budget: LYKEIAN_COST.redes, over: pts > LYKEIAN_COST.redes,
    imbalance: c.imbalance, glamourPerm: c.glamour.permanent, lost: c.imbalance > 0 && c.imbalance >= c.glamour.permanent,
    rival: !!ly.rival, maieutic: ly.guise === "maieutic", oppidan: ly.guise === "oppidan",
    panic: ly.guise === "oppidan" && (actor.system.willpower?.temporary ?? 1) <= 0
  };
}

/** Добавить Ред (цена — по книге, у переменных — правится на листе). */
export function addRede(actor, key) {
  const r = redeOf(key);
  if (!r) return null;
  const list = foundry.utils.deepClone(actor._source.system.changeling.lykeian?.redes ?? []);
  if (list.some(x => x.key === key)) return null;
  list.push({ key, pts: r.cost || 1 });
  return actor.update({ "system.changeling.lykeian.redes": list });
}
export function dropRede(actor, i) {
  const list = foundry.utils.deepClone(actor._source.system.changeling.lykeian?.redes ?? []);
  list.splice(i, 1);
  return actor.update({ "system.changeling.lykeian.redes": list });
}

/** Жатва (путь таллейнов): убийство смертного страхом. Бросок Гламура (сл. 5): успех — полный запас, ботч — Банальность; +1 Дисбаланс. */
export async function reaping(actor) {
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("ReapTitle"), icon: "fa-solid fa-skull" }, classes: ["vtm20", "r-dialog"],
    content: `<p class="r-hint">${t("ReapHint")}</p><label class="r-check"><input type="checkbox" name="dreamer"> ${t("ReapDreamer")}</label>`,
    ok: { label: t("ReapDo"), callback: (e, b) => ({ dreamer: b.form.elements.dreamer.checked }) }, rejectClose: false
  });
  if (!res) return null;
  const { rollPool } = await import("../dice/roll.mjs"), c = actor.system.changeling, pool = c.glamour.permanent;
  const roll = await rollPool({ actor, title: t("ReapTitle"), pool, difficulty: 5, kind: "check", breakdown: [{ label: game.i18n.localize("VTM20.Changeling.Glamour"), value: pool }] });
  if (!roll) return null;
  const upd = { "system.changeling.imbalance": Math.min(c.glamour.permanent, c.imbalance + 1) };
  if (roll.successes > 0 && roll.outcome !== "botch") upd["system.changeling.glamour.temporary"] = c.glamour.permanent;
  await actor.update(upd);
  if (roll.outcome === "botch") await addBanality(actor, 1);
  if (res.dreamer) await addBanality(actor, 1);
  await say(actor, "fa-skull", t(roll.outcome === "botch" ? "ReapBotch" : roll.successes > 0 ? "ReapOk" : "ReapFail", { name: esc(actor.name), n: actor.system.changeling.imbalance }), "is-warn");
  return roll;
}

/**
 * Гламур через Наследие: человек выполнил Квест или Влечение — ликиец получает столько Гламура, сколько Воли получил человек.
 * Мифический +1. Через основное Наследие можно вместо этого стирать Кошмар (1 за пункт); через Кошмар-Наследие — +1 Кошмар.
 */
export async function legacyGlamour(actor) {
  const ly = actor.system.changeling.lykeian ?? {};
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("LegacyTitle"), icon: "fa-solid fa-star" }, classes: ["vtm20", "r-dialog"],
    content: `<p class="r-hint">${t("LegacyHint")}</p>
      <label class="r-field"><span>${t("LegacyN")}</span><input type="number" name="n" value="1" min="1" max="10"></label>
      <label class="r-field"><span>${t("LegacyVia")}</span><select name="via"><option value="primary">${t("LegacyPrimary")}</option><option value="nightmare">${t("LegacyNightmare")}</option></select></label>
      <label class="r-check"><input type="checkbox" name="erase"> ${t("LegacyErase")}</label>`,
    ok: { label: t("LegacyDo"), callback: (e, b) => ({ n: Math.max(1, Number(b.form.elements.n.value) || 1), via: b.form.elements.via.value, erase: b.form.elements.erase.checked }) },
    rejectClose: false
  });
  if (!res) return null;
  const { gainGlamour, gainNightmare } = await import("./changeling.mjs");
  const c = actor.system.changeling, n = res.n + (ly.shape === "mythic" ? 1 : 0);
  if (res.via === "primary" && res.erase) {
    const k = Math.min(n, c.nightmare);
    await actor.update({ "system.changeling.nightmare": c.nightmare - k });
    return say(actor, "fa-star", t("LegacyErased", { name: esc(actor.name), n: k }));
  }
  const got = await gainGlamour(actor, n);
  await say(actor, "fa-star", t("LegacyGot", { name: esc(actor.name), n: got }));
  if (res.via === "nightmare") await gainNightmare(actor, 1, { reason: t("LegacyNightmare") });
  return got;
}

/** Снять точку Банальности ценой постоянной точки Гламура. */
export async function shedBanality(actor) {
  const c = actor.system.changeling;
  if (c.glamour.permanent <= 1 || c.banality.permanent <= 0) return ui.notifications.warn(t("ShedNo"));
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("ShedTitle") }, content: `<p>${t("ShedHint")}</p>`, rejectClose: false });
  if (!ok) return null;
  await actor.update({ "system.changeling.glamour.permanent": c.glamour.permanent - 1, "system.changeling.banality.permanent": c.banality.permanent - 1 });
  return say(actor, "fa-snowflake", t("ShedDone", { name: esc(actor.name) }));
}

/** Снять Дисбаланс ценой постоянной точки Воли. */
export async function shedImbalance(actor) {
  const c = actor.system.changeling, w = actor.system.willpower.permanent;
  if (!c.imbalance || w <= 1) return ui.notifications.warn(t("CureNo"));
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("CureTitle") }, content: `<p>${t("CureHint")}</p>`, rejectClose: false });
  if (!ok) return null;
  await actor.update({ "system.changeling.imbalance": c.imbalance - 1, "system.willpower.permanent": w - 1, "system.willpower.temporary": Math.min(actor.system.willpower.temporary, w - 1) });
  return say(actor, "fa-scale-balanced", t("CureDone", { name: esc(actor.name) }));
}
