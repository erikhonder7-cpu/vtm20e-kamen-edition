// module/apps/dark-fae.mjs
// Dark Ages: Fae — вариант листа подменыша (system.changeling.variant = "daf", черты — system.changeling.daf).
// Данные — data/changeling.json → daf (tools/changeling_data.py): Происхождения, Дворы, 162 кантрипа, провалы Высвобождения.
//   · Происхождение (подменыш / инанимае / перворождённый) — стартовые Мгла, Плетение, Домены; кубиков Высвобождения 5 или 3;
//     Эхо у подменыша считается на ступень ниже, у перворождённого — выше;
//   · Двор — любимый Домен (Весна — Рассвет, Лето — День, Осень — Сумерки, Зима — Ночь; у Солнцестояния нет);
//   · кантрип: Домен + Черта (сл. по книге, обычно 6); −1 за любимый Домен, «час» Домена, солнцестояние или равноденствие;
//     не ниже 4; Дисбаланс (Мгла на 3 выше Плетения) — +1; известно по кантрипу в каждом Домене за точку Плетения, уровень ≤ Домена;
//   · Высвобождение: базовый пул Мгла + Домен (сл. 6 с теми же поправками) и кубики Высвобождения (5 или 3), Плетение снимает
//     их 1 к 1; базовых успехов не меньше — под контролем, меньше — сработало без контроля, ноль — провал Домена;
//     Дисбаланс (Плетение на 3 выше Мглы) — +1 к сложности;
//   · Эхо (бросает Рассказчик): 10 кубиков, сл. 7, минус поправки; успехи Клятв и Плетение (2 очка — −1 успех) вычитаются;
//   · холодное железо: губительное повреждение и −1 временная Мгла.

import { C, say } from "./changeling.mjs";
import { VTM20 } from "../config.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Fae.Daf.${k}`, d) : game.i18n.localize(`VTM20.Fae.Daf.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const D = () => C().daf ?? { origins: [], courts: [], cantrips: [], unleashFails: {} };
const rollPool = async o => (await import("../dice/roll.mjs")).rollPool({ kind: "check", ...o });
export const DOMINIONS = ["dawn", "day", "dusk", "night"];

export const isDaf = a => a?.type === "changeling" && a.system?.changeling?.variant === "daf";
export const dafOrigin = key => D().origins.find(o => o.key === key) ?? null;
export const dafCourt = key => D().courts.find(c => c.key === key) ?? null;
const cantripOf = (domain, key) => D().cantrips.find(c => c.key === key && (c.domain === domain || c.domain === "common")) ?? null;

/** Дисбаланс: одно из значений на 3 выше другого. mists — Мгла выше (кантрипы +1), weaving — Плетение выше (Высвобождение +1). */
export function dafImbalance(d) {
  const m = d?.mists?.permanent ?? 0, w = d?.weaving?.permanent ?? 0;
  return m - w >= 3 ? "mists" : w - m >= 3 ? "weaving" : "";
}

/** Знак двора или происхождения (контурные маски assets/changeling/daf-*). */
const glyph = name => (C().glyphs ?? []).includes(name) ? { src: foundry.utils.getRoute(`systems/vtm20e-kamen-edition/assets/changeling/${name}.png`) } : null;

export function dafView(actor, dots) {
  if (!isDaf(actor)) return null;
  const d = actor.system.changeling.daf ?? {}, origin = dafOrigin(d.origin), court = dafCourt(d.court);
  const boxes = (n, max, path) => Array.from({ length: max }, (_, i) => ({ n: i + 1, filled: i < n, path }));
  const known = new Set(d.cantrips ?? []), perDomain = d.weaving?.permanent ?? 0;
  const loc = k => game.i18n.localize(k);
  return {
    origins: D().origins.map(o => ({ key: o.key, name: o.name, selected: o.key === d.origin })), origin,
    courts: D().courts.map(c => ({ key: c.key, name: c.name, selected: c.key === d.court })), court,
    courtSym: glyph(`daf-court-${d.court}`), originSym: glyph(`daf-origin-${d.origin}`),
    mists: d.mists?.temporary ?? 0, mistsPerm: d.mists?.permanent ?? 0, weaving: d.weaving?.temporary ?? 0, weavingPerm: d.weaving?.permanent ?? 0,
    mistsDots: dots(d.mists?.permanent ?? 0, 10, { path: "system.changeling.daf.mists.permanent" }),
    mistsBoxes: boxes(d.mists?.temporary ?? 0, 10, "system.changeling.daf.mists.temporary"),
    weavingDots: dots(d.weaving?.permanent ?? 0, 10, { path: "system.changeling.daf.weaving.permanent" }),
    weavingBoxes: boxes(d.weaving?.temporary ?? 0, 10, "system.changeling.daf.weaving.temporary"),
    echoes: d.echoes ?? 0, imbalance: dafImbalance(d), unleashDice: origin?.unleash ?? 5,
    dominions: DOMINIONS.map(k => {
      const value = d.dominions?.[k] ?? 0;
      const mine = D().cantrips.filter(c => (c.domain === k || c.domain === "common") && known.has(`${k}:${c.key}`));
      return { key: k, name: t(`Dom.${k}`), value, favorite: court?.favorite === k, dots: dots(value, 5, { path: `system.changeling.daf.dominions.${k}` }),
        cantrips: mine.map(c => ({ ...c, id: `${k}:${c.key}`, trait: c.trait ? loc(traitLabel(c.trait)) : c.traitName })).sort((a, b) => a.level - b.level),
        count: mine.length, limit: perDomain, over: mine.length > perDomain,
        avail: value ? D().cantrips.filter(c => (c.domain === k || c.domain === "common") && c.level <= value && !known.has(`${k}:${c.key}`))
          .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)).map(c => ({ id: `${k}:${c.key}`, label: `${"•".repeat(c.level)} ${c.name}${c.domain === "common" ? ` (${t("Common")})` : ""}` })) : [] };
    })
  };
}
const traitLabel = path => { const [g, k] = path.split("."); return (g === "attributes" ? VTM20.attributes[k]?.label : VTM20.abilities[k]?.label) ?? k; };

export function learnCantrip(actor, id) {
  if (!id) return null;
  const list = [...new Set([...(actor._source.system.changeling.daf?.cantrips ?? []), id])];
  return actor.update({ "system.changeling.daf.cantrips": list });
}
export function forgetCantrip(actor, id) {
  return actor.update({ "system.changeling.daf.cantrips": (actor._source.system.changeling.daf?.cantrips ?? []).filter(x => x !== id) });
}

/** Поправки сложности по Двору и времени: любимый Домен, «час» Домена, солнцестояние или равноденствие; Дисбаланс. */
async function timing(title, hint) {
  return foundry.applications.api.DialogV2.prompt({
    window: { title, icon: "fa-solid fa-sun-plant-wilt" }, classes: ["vtm20", "r-dialog"],
    content: `<p class="r-hint">${hint}</p>
      <label class="r-check"><input type="checkbox" name="juncture"> ${t("Juncture")}</label>
      <label class="r-check"><input type="checkbox" name="season"> ${t("Season")}</label>
      <label class="r-check"><input type="checkbox" name="hide"> ${t("HideMists")}</label>
      <label class="r-field"><span>${t("WeaveSpend")}</span><input type="number" name="weave" value="0" min="0" max="10"></label>`,
    ok: { label: t("Roll"), callback: (e, b) => ({ juncture: b.form.elements.juncture.checked, season: b.form.elements.season.checked,
      hide: b.form.elements.hide.checked, weave: Math.max(0, Number(b.form.elements.weave.value) || 0) }) },
    rejectClose: false
  });
}

/** Кантрип: Домен + Черта; поправки −1 (не ниже 4), Дисбаланс Мглы +1; скрыть от Узрения — 1 Мгла. */
export async function castDaf(actor, id) {
  const [domain, key] = String(id).split(":"), c = cantripOf(domain, key), d = actor.system.changeling.daf;
  if (!c) return null;
  const opt = await timing(`${c.name} ${"•".repeat(c.level)}`, `${esc(c.params)} — ${esc(c.text)}`);
  if (!opt) return null;
  if (opt.hide) {
    if ((d.mists?.temporary ?? 0) < 1) return ui.notifications.warn(t("NoMists"));
    await actor.update({ "system.changeling.daf.mists.temporary": d.mists.temporary - 1 });
  }
  const dom = d.dominions?.[domain] ?? 0, trait = c.trait ? actor.traitValue(c.trait) : 0;
  const ease = (dafCourt(d.court)?.favorite === domain ? 1 : 0) + (opt.juncture ? 1 : 0) + (opt.season ? 1 : 0);
  const imb = dafImbalance(d) === "mists" ? 1 : 0;
  return rollPool({ actor, title: c.name, subtitle: `${t(`Dom.${domain}`)} ${"•".repeat(c.level)}${opt.hide ? ` · ${t("Hidden")}` : ""}`,
    pool: Math.max(1, dom + trait), difficulty: Math.max(4, Math.min(10, c.diff - ease + imb)),
    breakdown: [{ label: t(`Dom.${domain}`), value: dom }, ...(c.trait ? [{ label: game.i18n.localize(traitLabel(c.trait)), value: trait }] : [])],
    notes: [esc(c.text), ...(imb ? [t("ImbalanceMists")] : [])] });
}

/** Высвобождение: базовый пул Мгла + Домен и кубики Высвобождения (5 / 3) минус потраченное Плетение. */
export async function unleashDaf(actor, domain) {
  const d = actor.system.changeling.daf, dom = d.dominions?.[domain] ?? 0;
  if (!dom) return ui.notifications.warn(t("NoDominion"));
  const opt = await timing(t("UnleashTitle", { dom: t(`Dom.${domain}`) }), t("UnleashHint"));
  if (!opt) return null;
  const weave = Math.min(opt.weave, d.weaving?.temporary ?? 0), dice = Math.max(0, (dafOrigin(d.origin)?.unleash ?? 5) - weave);
  if (weave) await actor.update({ "system.changeling.daf.weaving.temporary": d.weaving.temporary - weave });
  const ease = (dafCourt(d.court)?.favorite === domain ? 1 : 0) + (opt.juncture ? 1 : 0) + (opt.season ? 1 : 0);
  const diff = Math.max(4, Math.min(10, 6 - ease + (dafImbalance(d) === "weaving" ? 1 : 0)));
  const mists = d.mists?.permanent ?? 0;
  const base = await rollPool({ actor, title: t("UnleashTitle", { dom: t(`Dom.${domain}`) }), subtitle: t("BasePool"), pool: Math.max(1, mists + dom), difficulty: diff,
    breakdown: [{ label: t("Mists"), value: mists }, { label: t(`Dom.${domain}`), value: dom }] });
  if (!base) return null;
  const wild = dice ? await rollPool({ actor, title: t("UnleashTitle", { dom: t(`Dom.${domain}`) }), subtitle: t("WildPool"), pool: dice, difficulty: diff,
    breakdown: [{ label: t("WildDice"), value: dice }] }) : { successes: 0 };
  const b = Math.max(0, base.outcome === "botch" ? 0 : base.successes), w = Math.max(0, wild?.successes ?? 0);
  const res = b === 0 ? "fail" : b >= w ? "control" : "wild";
  await say(actor, "fa-burst", `${t(`Unleash.${res}`, { name: esc(actor.name), b, w })}${res !== "control" && D().unleashFails?.[domain] ? `<br><span class="r-muted">${esc(D().unleashFails[domain])}</span>` : ""}`, res === "control" ? "" : "is-warn");
  return { base, wild, res };
}

/** Эхо (Рассказчик): 10 кубиков, сл. 7, минус поправки; успехи Клятв и Плетение (2 очка — −1) вычитаются; Происхождение сдвигает. */
export async function echoRoll(actor) {
  const d = actor.system.changeling.daf;
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("EchoTitle"), icon: "fa-solid fa-bell" }, classes: ["vtm20", "r-dialog"],
    content: `<p class="r-hint">${t("EchoHint")}</p>
      <label class="r-field"><span>${t("EchoMods")}</span><input type="number" name="mods" value="0" min="0" max="10"></label>
      <label class="r-field"><span>${t("EchoOath")}</span><input type="number" name="oath" value="0" min="0" max="5"></label>
      <label class="r-field"><span>${t("WeaveSpend")}</span><input type="number" name="weave" value="0" min="0" max="10"></label>`,
    ok: { label: t("Roll"), callback: (e, b) => ({ mods: Number(b.form.elements.mods.value) || 0, oath: Number(b.form.elements.oath.value) || 0, weave: Number(b.form.elements.weave.value) || 0 }) },
    rejectClose: false
  });
  if (!res) return null;
  const r = await rollPool({ actor, title: t("EchoTitle"), pool: Math.max(1, 10 - res.mods), difficulty: 7, breakdown: [{ label: t("EchoBase"), value: 10 }, { label: t("EchoMods"), value: -res.mods }], messageMode: "gm" });
  if (!r) return null;
  const oath = res.oath ? await rollPool({ actor, title: t("EchoOath"), pool: res.oath, difficulty: 7, breakdown: [{ label: t("EchoOath"), value: res.oath }] }) : { successes: 0 };
  const weave = Math.min(res.weave, d.weaving?.temporary ?? 0);
  if (weave) await actor.update({ "system.changeling.daf.weaving.temporary": d.weaving.temporary - weave });
  const shift = d.origin === "changeling" ? -1 : d.origin === "firstborn" ? 1 : 0;
  const n = Math.max(0, Math.min(5, Math.max(0, r.successes) - Math.max(0, oath?.successes ?? 0) - Math.floor(weave / 2) + (r.successes > 0 ? shift : 0)));
  await say(actor, "fa-bell", `${t("EchoDone", { name: esc(actor.name), n })}${n ? `<br>${t(`EchoLevel.${n}`)}` : ""}`, n >= 3 ? "is-warn" : "");
  return n;
}

/** Холодное железо: губительное повреждение и −1 временная Мгла. */
export async function dafColdIron(actor) {
  const d = actor.system.changeling.daf, h = actor._source.system.health ?? {};
  await actor.update({ "system.health.aggravated": (h.aggravated ?? 0) + 1, "system.changeling.daf.mists.temporary": Math.max(0, (d.mists?.temporary ?? 0) - 1) });
  return say(actor, "fa-khanda", t("IronDone", { name: esc(actor.name) }), "is-warn");
}

/** Выбор Происхождения задаёт стартовые Мглу и Плетение (если ещё не трогали). */
export function originDefaults(originKey) {
  const o = dafOrigin(originKey);
  return o ? { "system.changeling.daf.mists": { permanent: o.mists, temporary: o.mists }, "system.changeling.daf.weaving": { permanent: o.weaving, temporary: o.weaving } } : {};
}
