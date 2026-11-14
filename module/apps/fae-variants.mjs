// module/apps/fae-variants.mjs
// Галлейны полными вариантами листа подменыша (C20, гл. 39–40); system.changeling.variant = "hsien" | "inanimae".
//
// Хсиен (Шинма) — малые боги Дальнего Востока, без Гламура и Банальности:
//   · Чи Инь и Ян 1–5; Ранг = Инь + Ян; Дао = среднее (с округлением вниз — правило системы); Югэн — до 2 × Ранг;
//   · Ву Тань: пять школ (Ди — земля, Хоу — огонь, Линь — дерево, Те — металл, Шуй — вода) и Ней Тань;
//     пул = уровень И Чих + Атрибут стихии + Чи (Инь или Ян), сложность = 10 − Чи; кубики на модификаторы вычитаются из пула,
//     бонусные кубики Удачи (цвет, направление) идут только на модификаторы; Югэн за эффект — книга оставляет Рассказчику
//     (по умолчанию 1 — правило системы), когорта — +1 Югэн за каждую школу сверх основной;
//   · Ней Тань: пул = Дао + Черта по решению Рассказчика; за каждое очко разницы Инь и Ян недоступен один верхний уровень;
//     сложности книга не называет — 10 − Дао (правило системы);
//   · Маска Шинтай: потратить Югэн, видящие бросают Волю (7; другие шэнь 6; Хсиен 5) и должны набрать не меньше успехов
//     (в драконьем гнезде — вдвое больше); пожертвовать 1 Чи — 1 Югэн и 1 губительное повреждение.
// Инанимае — стихийные фэ в неодушевлённом: Гламур, Банальность и Кошмар — как у китейнов, но
//   · вместо Искусств — Слайверы (Аквис, Петрос, Пирос, Стратус, Вердаж), только Высвобождение;
//   · Сбор: Восприятие + Кеннинг, сложность = Банальность + место (Якорь 0, почти та же субстанция +1, та же Империя +3, чужая +4),
//     успехи — сколько Гламура набрать; Жатва: Банальность (сл. 9), за успех — 1 Гламур и 1 Кошмар;
//   · Оболочка среди смертных: Манипуляция + Оболочка против наибольшей Банальности присутствующих (манники +2 кубика);
//     провал — +1 Банальность, ботч — +2;
//   · новая привязка Якоря: Гламур (сл. 7, при смене двора 8), затем 1 Воля.

import { C, say, spendGlamour, gainGlamour, gainNightmare, addBanality, afterRoll, kithOf, clGlyph } from "./changeling.mjs";
import { VTM20 } from "../config.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Fae.${k}`, d) : game.i18n.localize(`VTM20.Fae.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const loc = k => game.i18n.localize(k);
const roll = async o => (await import("../dice/roll.mjs")).rollPool({ kind: "check", ...o });
const opts = (list, cur, label = x => x.name) => list.map(x => ({ key: x.key, name: label(x), selected: x.key === cur }));

export const FAE_VARIANTS = ["", "lykeian", "hsien", "inanimae"];
export const isHsien = a => a?.type === "changeling" && a.system?.changeling?.variant === "hsien";
export const isInanimae = a => a?.type === "changeling" && a.system?.changeling?.variant === "inanimae";
/** Киты варианта: Хсиен — Кваннон-цзинь, инанимае — фила; прочим — как раньше. */
export const variantKiths = variant => (C().otherKiths ?? []).filter(k => k.group === variant);

/* ── Хсиен ─────────────────────────────────────────────────────────────── */

/** Школы Ву Тань: стихия и Атрибуты пятичастной души (дерево — Внешность, Сила; огонь — Обаяние, Смекалка; земля — Интеллект;
 *  металл — Ловкость, Восприятие; вода — Манипуляция, Выносливость). */
export const WU_TAN = {
  ditan: { element: "earth", attrs: ["intelligence"] }, houtan: { element: "fire", attrs: ["charisma", "wits"] },
  lintan: { element: "wood", attrs: ["appearance", "strength"] }, tietan: { element: "metal", attrs: ["dexterity", "perception"] },
  shuitan: { element: "water", attrs: ["manipulation", "stamina"] }
};
export const SCHOOLS = [...Object.keys(WU_TAN), "neitan"];
/** Стихия (Удача) Кваннон-цзинь — бесплатная точка школы при создании. */
export const HSIEN_ELEMENT = { "hsien-fuhsi": "lintan", "hsien-hanumen": "ditan", "hsien-hengpo": "shuitan", "hsien-nyan": "houtan", "hsien-tanuki": "tietan",
  "hsien-chuihyu": "tietan", "hsien-chujung": "houtan", "hsien-houchi": "lintan", "hsien-komuko": "ditan", "hsien-suijen": "shuitan" };
export const HSIEN_COURTS = ["liShen", "hsienMo", "yu", "hsienMun", "wuHsien", "tuShen", "shuShen", "yellowLotus", "mu"];

export function hsienDerived(h) {
  const yin = h?.yin ?? 1, yang = h?.yang ?? 1, rank = yin + yang;
  return { yin, yang, rank, tao: Math.floor(rank / 2), yugenMax: Math.min(20, rank * 2), neiCap: Math.max(0, 5 - Math.abs(yin - yang)) };
}

export function hsienView(actor, dots) {
  if (!isHsien(actor)) return null;
  const c = actor.system.changeling, h = c.hsien ?? {}, d = hsienDerived(h);
  const legacies = C().legacies ?? [];
  return {
    ...d, yugen: Math.min(h.yugen ?? 0, d.yugenMax),
    yinDots: dots(d.yin, 5, { path: "system.changeling.hsien.yin" }), yangDots: dots(d.yang, 5, { path: "system.changeling.hsien.yang" }),
    yugenBoxes: Array.from({ length: d.yugenMax }, (_, i) => ({ n: i + 1, filled: i < (h.yugen ?? 0), path: "system.changeling.hsien.yugen" })),
    dominant: d.yin > d.yang ? t("Hsien.Yin") : d.yang > d.yin ? t("Hsien.Yang") : t("Hsien.Balance"),
    schools: SCHOOLS.map(k => ({ key: k, name: t(`Hsien.School.${k}`), element: k === "neitan" ? t("Hsien.Inner") : t(`Hsien.Element.${WU_TAN[k].element}`),
      value: h.schools?.[k] ?? 0, dots: dots(h.schools?.[k] ?? 0, 5, { path: `system.changeling.hsien.schools.${k}` }),
      capped: k === "neitan" && (h.schools?.neitan ?? 0) > d.neiCap, sym: clGlyph("art", k === "tietan" ? "tiehtan" : k) })),
    kiths: opts(variantKiths("hsien"), c.kith), courts: HSIEN_COURTS.map(k => ({ key: k, name: t(`Hsien.Court.${k}`), selected: k === h.court })),
    legaciesYin: opts(legacies, h.legacyYin), legaciesYang: opts(legacies, h.legacyYang)
  };
}

async function spendYugen(actor, n) {
  const h = actor.system.changeling.hsien;
  if ((h.yugen ?? 0) < n) { ui.notifications.warn(t("Hsien.NoYugen", { n })); return false; }
  await actor.update({ "system.changeling.hsien.yugen": h.yugen - n });
  return true;
}

/** Ву Тань: школа, уровень И Чих, сторона Чи, Атрибут, кубики модификаторов и Удачи, Югэн. */
export async function wuTan(actor, preset = {}) {
  const c = actor.system.changeling, h = c.hsien, d = hsienDerived(h);
  const own = Object.keys(WU_TAN).filter(k => (h.schools?.[k] ?? 0) > 0);
  if (!own.length) return ui.notifications.warn(t("Hsien.NoSchools"));
  const school0 = preset.school && own.includes(preset.school) ? preset.school : own[0];
  const attrOpts = k => WU_TAN[k].attrs.map(a => `<option value="${a}">${loc(VTM20.attributes[a]?.label ?? a)}</option>`).join("");
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("Hsien.WuTanTitle"), icon: "fa-solid fa-yin-yang" }, classes: ["vtm20", "r-dialog"], position: { width: 460 },
    content: `<p class="r-hint">${t("Hsien.WuTanHint")}</p>
      <label class="r-field"><span>${t("Hsien.SchoolLabel")}</span><select name="school">${own.map(k => `<option value="${k}" ${k === school0 ? "selected" : ""}>${t(`Hsien.School.${k}`)} (${h.schools[k]})</option>`).join("")}</select></label>
      <label class="r-field"><span>${t("Hsien.Level")}</span><input type="number" name="level" value="${Math.min(preset.level ?? 1, h.schools[school0])}" min="1" max="5"></label>
      <label class="r-field"><span>${t("Hsien.Side")}</span><select name="side"><option value="yang">${t("Hsien.Yang")} (${d.yang})</option><option value="yin">${t("Hsien.Yin")} (${d.yin})</option></select></label>
      <label class="r-field"><span>${t("Hsien.Attr")}</span><select name="attr">${attrOpts(school0)}</select></label>
      <label class="r-field"><span>${t("Hsien.ModDice")}</span><input type="number" name="mods" value="0" min="0" max="20"></label>
      <label class="r-field"><span>${t("Hsien.Fortune")}</span><input type="number" name="fortune" value="0" min="0" max="10"></label>
      <label class="r-field"><span>${t("Hsien.Cohort")}</span><input type="number" name="cohort" value="0" min="0" max="4"></label>
      <label class="r-field"><span>${t("Hsien.YugenCost")}</span><input type="number" name="yugen" value="1" min="0" max="20"></label>`,
    render: (e, dlg) => {
      const f = dlg.element.querySelector("form") ?? dlg.element;
      f.querySelector("[name=school]")?.addEventListener("change", ev => { f.querySelector("[name=attr]").innerHTML = attrOpts(ev.target.value); });
    },
    ok: { label: t("Hsien.Cast"), callback: (e, b) => { const F = b.form.elements; return { school: F.school.value, level: Number(F.level.value) || 1, side: F.side.value, attr: F.attr.value,
      mods: Number(F.mods.value) || 0, fortune: Number(F.fortune.value) || 0, cohort: Number(F.cohort.value) || 0, yugen: Number(F.yugen.value) || 0 }; } },
    rejectClose: false
  });
  if (!res) return null;
  const level = Math.min(Math.max(1, res.level), h.schools[res.school] ?? 0), chi = res.side === "yin" ? d.yin : d.yang;
  const cost = res.yugen + res.cohort;
  if (cost && !(await spendYugen(actor, cost))) return null;
  const attr = actor.system.attributes[res.attr]?.total ?? 0, spent = Math.max(0, res.mods - res.fortune);
  const pool = Math.max(1, level + attr + chi - spent);
  return roll({ actor, title: `${t(`Hsien.School.${res.school}`)} ${"•".repeat(level)}`, subtitle: t("Hsien.WuTanSub", { side: t(res.side === "yin" ? "Hsien.Yin" : "Hsien.Yang"), y: cost }),
    pool, difficulty: Math.clamp(10 - chi, 2, 10),
    breakdown: [{ label: t("Hsien.Level"), value: level }, { label: loc(VTM20.attributes[res.attr]?.label ?? res.attr), value: attr },
      { label: t(res.side === "yin" ? "Hsien.Yin" : "Hsien.Yang"), value: chi }, ...(spent ? [{ label: t("Hsien.ModDice"), value: -spent }] : [])] });
}

/** Ней Тань: Дао + Атрибут; уровни выше 5 − |Инь − Ян| недоступны. */
export async function neiTan(actor) {
  const h = actor.system.changeling.hsien, d = hsienDerived(h), rating = h.schools?.neitan ?? 0, top = Math.min(rating, d.neiCap);
  if (!top) return ui.notifications.warn(t(rating ? "Hsien.NeiBlocked" : "Hsien.NoNei"));
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("Hsien.School.neitan"), icon: "fa-solid fa-yin-yang" }, classes: ["vtm20", "r-dialog"],
    content: `<p class="r-hint">${t("Hsien.NeiHint", { cap: d.neiCap })}</p>
      <label class="r-field"><span>${t("Hsien.Level")}</span><input type="number" name="level" value="1" min="1" max="${top}"></label>
      <label class="r-field"><span>${t("Hsien.Attr")}</span><select name="attr">${Object.keys(VTM20.attributes).map(a => `<option value="${a}">${loc(VTM20.attributes[a].label)}</option>`).join("")}</select></label>
      <label class="r-field"><span>${t("Hsien.YugenCost")}</span><input type="number" name="yugen" value="1" min="0" max="20"></label>`,
    ok: { label: t("Hsien.Cast"), callback: (e, b) => ({ level: Math.clamp(Number(b.form.elements.level.value) || 1, 1, top), attr: b.form.elements.attr.value, yugen: Number(b.form.elements.yugen.value) || 0 }) },
    rejectClose: false
  });
  if (!res) return null;
  if (res.yugen && !(await spendYugen(actor, res.yugen))) return null;
  const attr = actor.system.attributes[res.attr]?.total ?? 0;
  return roll({ actor, title: `${t("Hsien.School.neitan")} ${"•".repeat(res.level)}`, subtitle: t("Hsien.NeiSub"), pool: Math.max(1, d.tao + attr), difficulty: Math.clamp(10 - d.tao, 2, 10),
    breakdown: [{ label: t("Hsien.Tao"), value: d.tao }, { label: loc(VTM20.attributes[res.attr]?.label ?? res.attr), value: attr }] });
}

/** Маска Шинтай: потратить Югэн — видящие бросают Волю против числа успехов. */
export async function maskOfShintai(actor) {
  const h = actor.system.changeling.hsien;
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("Hsien.MaskTitle"), icon: "fa-solid fa-dragon" }, classes: ["vtm20", "r-dialog"],
    content: `<p class="r-hint">${t("Hsien.MaskHint")}</p>
      <label class="r-field"><span>${t("Hsien.YugenCost")}</span><input type="number" name="n" value="1" min="1" max="${Math.max(1, h.yugen ?? 0)}"></label>
      <label class="r-check"><input type="checkbox" name="nest"> ${t("Hsien.InNest")}</label>`,
    ok: { label: t("Hsien.MaskDo"), callback: (e, b) => ({ n: Math.max(1, Number(b.form.elements.n.value) || 1), nest: b.form.elements.nest.checked }) }, rejectClose: false
  });
  if (!res || !(await spendYugen(actor, res.n))) return null;
  return say(actor, "fa-dragon", t("Hsien.MaskDone", { name: esc(actor.name), n: res.n * (res.nest ? 2 : 1) }), "is-warn");
}

/** Пожертвовать 1 Чи ради 1 Югэна: 1 губительное повреждение (Чи не вернётся, пока рана не заживёт). */
export async function sacrificeChi(actor) {
  const h = actor.system.changeling.hsien, d = hsienDerived(h), hp = actor._source.system.health ?? {};
  if ((h.yugen ?? 0) >= d.yugenMax) return ui.notifications.warn(t("Hsien.YugenFull"));
  await actor.update({ "system.changeling.hsien.yugen": (h.yugen ?? 0) + 1, "system.health.aggravated": (hp.aggravated ?? 0) + 1 });
  return say(actor, "fa-yin-yang", t("Hsien.SacrificeDone", { name: esc(actor.name) }), "is-warn");
}

/* ── Инанимае ───────────────────────────────────────────────────────────── */

export const SLIVERS = ["aquis", "petros", "pyros", "stratus", "verdage"];
const phylum = key => (C().inanimae?.phyla ?? []).find(p => p.key === key) ?? null;

export function inanimaeView(actor, dots) {
  if (!isInanimae(actor)) return null;
  const c = actor.system.changeling, n = c.inanimae ?? {}, ph = phylum(c.kith), D = C().inanimae ?? { slivers: [] };
  return {
    phylum: ph, kith: kithOf(c.kith), kiths: opts(variantKiths("inanimae"), c.kith),
    courts: ["gladeling", "krofted"].map(k => ({ key: k, name: t(`Inan.Court.${k}`), selected: k === (n.court || "gladeling") })),
    slivers: D.slivers.map(s => ({ ...s, value: n.slivers?.[s.key] ?? 0, affinity: ph?.affinity === s.key,
      dots: dots(n.slivers?.[s.key] ?? 0, 5, { path: `system.changeling.inanimae.slivers.${s.key}` }) })),
    anchorLost: !!n.anchorLost, mannikin: c.kith === "inanimae-mannikins"
  };
}

/** Высвобождение Слайвера: как у китейна — 2 Гламура, +1 Кошмар, Гламур + Кошмар кубиков (сл. 7). */
export async function unleashSliver(actor, key) {
  const c = actor.system.changeling, rating = c.inanimae?.slivers?.[key] ?? 0, U = C().cantrip?.unleash ?? { diff: 7, glamour: 2, nightmare: 1 };
  const s = (C().inanimae?.slivers ?? []).find(x => x.key === key);
  if (!s || !rating) return ui.notifications.warn(t("Inan.NoSliver"));
  if (!(await spendGlamour(actor, U.glamour))) return null;
  await gainNightmare(actor, U.nightmare);
  const now = actor.system.changeling, pool = now.glamour.permanent + now.nightmare;
  const r = await roll({ actor, title: `${loc("VTM20.Changeling.Unleash")}: ${s.name}`, subtitle: t("Inan.UnleashSub"), pool, difficulty: U.diff,
    breakdown: [{ label: loc("VTM20.Changeling.Glamour"), value: now.glamour.permanent }, { label: loc("VTM20.Changeling.Nightmare"), value: now.nightmare }],
    extra: { changeling: { kind: "unleash", art: key, rating } } });
  if (!r) return null;
  await afterRoll(actor, r, Math.min(pool, now.nightmare), s.name);
  if (r.successes > rating) await gainNightmare(actor, 1, { reason: loc("VTM20.Changeling.UnleashWild") });
  return r;
}

/** Сбор: Восприятие + Кеннинг против Банальности + поправки места; успехи — Гламур (не выше рейтинга). */
export async function harvest(actor) {
  const c = actor.system.changeling;
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("Inan.HarvestTitle"), icon: "fa-solid fa-seedling" }, classes: ["vtm20", "r-dialog"],
    content: `<p class="r-hint">${t("Inan.HarvestHint")}</p>
      <label class="r-field"><span>${t("Inan.Place")}</span><select name="mod">${[0, 1, 3, 4].map(m => `<option value="${m}">${t(`Inan.PlaceMod.${m}`)} (+${m})</option>`).join("")}</select></label>`,
    ok: { label: t("Inan.HarvestDo"), callback: (e, b) => Number(b.form.elements.mod.value) || 0 }, rejectClose: false
  });
  if (res == null) return null;
  const per = actor.system.attributes.perception?.total ?? 0, ken = actor.system.abilities.kenning?.value ?? 0;
  const r = await roll({ actor, title: t("Inan.HarvestTitle"), pool: Math.max(1, per + ken), difficulty: Math.clamp(c.banality.permanent + res, 2, 10),
    breakdown: [{ label: loc(VTM20.attributes.perception.label), value: per }, { label: loc(VTM20.abilities.kenning?.label ?? "kenning"), value: ken }] });
  if (!r) return null;
  const got = r.successes > 0 && r.outcome !== "botch" ? await gainGlamour(actor, r.successes) : 0;
  await say(actor, "fa-seedling", t("Inan.HarvestDone", { name: esc(actor.name), n: got }));
  return r;
}

/** Жатва: Банальность (сл. 9) — за успех 1 Гламур и 1 Кошмар. */
export async function reapInanimae(actor) {
  const c = actor.system.changeling, pool = c.banality.permanent;
  const r = await roll({ actor, title: t("Inan.ReapTitle"), pool: Math.max(1, pool), difficulty: 9, breakdown: [{ label: loc("VTM20.Changeling.Banality"), value: pool }] });
  if (!r) return null;
  const n = r.outcome === "botch" ? 0 : Math.max(0, r.successes);
  if (n) { await gainGlamour(actor, n); await gainNightmare(actor, n, { reason: t("Inan.ReapTitle") }); }
  await say(actor, "fa-hand-fist", t("Inan.ReapDone", { name: esc(actor.name), n }), n ? "is-warn" : "");
  return r;
}

/** Оболочка среди смертных: Манипуляция + Оболочка (Фон) против наибольшей Банальности присутствующих; манники +2. */
export async function huskRoll(actor) {
  const bg = actor.items.find(i => i.type === "background" && /husk|оболоч/i.test(`${i.system.source ?? ""} ${i.name}`))?.system.value ?? 0;
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("Inan.HuskTitle"), icon: "fa-solid fa-person" }, classes: ["vtm20", "r-dialog"],
    content: `<p class="r-hint">${t("Inan.HuskHint")}</p><label class="r-field"><span>${t("Inan.HighestBanality")}</span><input type="number" name="b" value="6" min="2" max="10"></label>`,
    ok: { label: t("Inan.HuskDo"), callback: (e, b) => Math.clamp(Number(b.form.elements.b.value) || 6, 2, 10) }, rejectClose: false
  });
  if (!res) return null;
  const man = actor.system.attributes.manipulation?.total ?? 0, mimic = actor.system.changeling.kith === "inanimae-mannikins" ? 2 : 0;
  const r = await roll({ actor, title: t("Inan.HuskTitle"), pool: Math.max(1, man + bg + mimic), difficulty: res,
    breakdown: [{ label: loc(VTM20.attributes.manipulation.label), value: man }, { label: t("Inan.Husk"), value: bg }, ...(mimic ? [{ label: t("Inan.Mimicry"), value: 2 }] : [])] });
  if (!r) return null;
  if (r.outcome === "botch") await addBanality(actor, 2);
  else if (!(r.successes > 0)) await addBanality(actor, 1);
  if (!(r.successes > 0)) await say(actor, "fa-person", t(r.outcome === "botch" ? "Inan.HuskBotch" : "Inan.HuskFail", { name: esc(actor.name) }), "is-warn");
  return r;
}

/** Новая привязка Якоря: Гламур (сл. 7, при смене двора 8), успех — 1 Воля, Якорь снова есть. */
export async function rebind(actor) {
  const c = actor.system.changeling;
  const change = await foundry.applications.api.DialogV2.confirm({ window: { title: t("Inan.RebindTitle") }, content: `<p>${t("Inan.RebindAsk")}</p>`,
    yes: { label: t("Inan.RebindCourt") }, no: { label: t("Inan.RebindSame") }, rejectClose: false });
  if (change === null) return null;
  const r = await roll({ actor, title: t("Inan.RebindTitle"), pool: c.glamour.permanent, difficulty: change ? 8 : 7, breakdown: [{ label: loc("VTM20.Changeling.Glamour"), value: c.glamour.permanent }] });
  if (!r || !(r.successes > 0)) return r;
  const w = actor.system.willpower;
  if (w.temporary < 1) { ui.notifications.warn(t("Inan.NoWill")); return r; }
  await actor.update({ "system.changeling.inanimae.anchorLost": false, "system.willpower.temporary": w.temporary - 1 });
  await say(actor, "fa-anchor", t("Inan.RebindDone", { name: esc(actor.name) }));
  return r;
}
