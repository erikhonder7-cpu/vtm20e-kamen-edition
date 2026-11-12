// module/apps/wraith.mjs
// Призрак (Wraith: The Oblivion 20th; данные — data/wraith.json из справочника books/…/Призраки/_справочник, tools/wraith_data.py).
// system.wraith: Легион, фракция, Гильдия, Пафос, Корпус, Арканои, Страсти, Оковы, Тень (Ангст, Тёмные Страсти, Шипы, Катарсис).
// Номера глав — основная книга Wraith 20: 3 — броски, 4 — создание, 5 — Арканои, 6 — Тень, 8 — Страсти, Оковы, Сон; 11 — Корпус.

import { Codex } from "../data/codex.mjs";
import { RollDialog } from "../dice/dialog.mjs";
import { VTM20, SYSTEM_PATH, SYSTEM_ID } from "../config.mjs";
import { registerEmblem, registerCardBlock } from "../ui/themes.mjs";

export const t = (k, d) => d ? game.i18n.format(`VTM20.Wraith.${k}`, d) : game.i18n.localize(`VTM20.Wraith.${k}`);
export const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
export const W = () => Codex.wraith ?? { arcanoi: [], legions: [], factions: [], archetypes: [], shadowArchetypes: [], thorns: [], backgrounds: [] };
export const arcanosOf = key => W().arcanoi.find(a => a.key === key) ?? null;
export const thornOf = key => (W().thorns ?? []).find(x => x.key === key) ?? null;
const byKey = (list, key) => (list ?? []).find(x => x.key === key) ?? null;
const attrLabel = k => game.i18n.localize(VTM20.attributes[k]?.label ?? k);
export const WRAITH_SIGIL = `${SYSTEM_PATH}/assets/ui/wraith-sigil.svg`;
/** Знаки Гильдий и Легионов (assets/wraith, tools/wraith_glyphs.mjs): маска «arcanos-<ключ>» / «legion-<ключ>»; путь от корня — для url() в CSS. */
export const wraithGlyphSrc = name => foundry.utils.getRoute(`${SYSTEM_PATH}/assets/wraith/${name}.png`);
export const arcSym = key => ({ src: wraithGlyphSrc(`arcanos-${key}`) });
export const legionSym = key => key ? { src: wraithGlyphSrc(`legion-${key}`) } : null;
/** Гильдии — по Арканосу: у каждой свой (гл. 1). */
export const guildsOf = () => W().arcanoi.map(a => ({ key: a.key, name: a.guild, en: a.guildEn, group: a.group, arcanos: a.name }));

/** Сообщение в чат в теме призрака. */
export const say = (actor, icon, html, cls = "") => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="r-notice r-type-wraith ${cls}"><i class="fa-solid ${icon}"></i> ${html}</div>` });

/** Рейтинг Фона по английскому имени (Мемориум, Эйдолон, Статус…). */
export function backgroundRating(actor, en) {
  const name = (W().backgrounds ?? []).find(b => b.en === en)?.name;
  return actor.items.filter(i => i.type === "background" && (i.name === name || i.name.startsWith(`${name} `) || i.system?.source === en))
    .reduce((n, i) => Math.max(n, Number(i.system.value) || 0), 0);
}

/* ── Покров ─────────────────────────────────────────────────────────── */

/**
 * Покров (гл. 8): рейтинг 4–10 — у сцены (флаг; пока рассказчик не задал — 7, «пустая парковка ночью», правило системы).
 * Истерия: каждый настоящий испуг смертных −1, всего до −3, до конца сцены. Сверхъестественные рядом (вампиры, оборотни,
 * маги, падшие) −2 — их жетоны на сцене. В Обиталище — минус рейтинг Обиталища, и Покров там не колеблется (Истерии нет).
 * Ниже 4 Покров не опускается.
 */
const SUPERNATURAL = ["vampire", "werewolf", "mage", "demon"];
export const SHROUD_DEFAULT = 7;
export function shroudOf(actor = null, scene = game.scenes?.viewed) {
  const f = scene?.getFlag(SYSTEM_ID, "shroud") ?? {}, base = Math.clamp(Number(f.base) || SHROUD_DEFAULT, 4, 10);
  const hysteria = Math.clamp(Number(f.hysteria) || 0, 0, 3);
  const near = !!scene?.tokens?.some(tk => SUPERNATURAL.includes(tk.actor?.type));
  const haunt = actor?.getFlag(SYSTEM_ID, "inHaunt") ? backgroundRating(actor, "Haunt") : 0;
  const value = Math.max(4, base - (haunt ? 0 : hysteria) - (near ? 2 : 0) - haunt);
  const parts = [t("Shroud.Base", { n: base, set: f.base != null ? "" : t("Shroud.Default") }),
    ...(hysteria && !haunt ? [t("Shroud.Hysteria", { n: hysteria })] : []), ...(near ? [t("Shroud.Near")] : []),
    ...(haunt ? [t("Shroud.Haunt", { n: haunt })] : [])];
  return { base, hysteria, near, haunt, value, set: f.base != null, scene: scene?.name ?? "", text: parts.join(", ") };
}

/** Рассказчик: рейтинг Покрова сцены (±1) или Истерия (+1, до 3; «сброс» — 0). */
export async function setShroud(what, d) {
  const scene = game.scenes?.viewed;
  if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("VTM20.Notify.GMOnly"));
  if (!scene) return ui.notifications.warn(t("Shroud.NoScene"));
  const f = { base: SHROUD_DEFAULT, hysteria: 0, ...(scene.getFlag(SYSTEM_ID, "shroud") ?? {}) };
  if (what === "base") f.base = Math.clamp(f.base + d, 4, 10);
  else f.hysteria = d === 0 ? 0 : Math.clamp(f.hysteria + d, 0, 3);
  await scene.setFlag(SYSTEM_ID, "shroud", f);
  if (what === "hysteria" && d > 0) await ChatMessage.create({ content: `<div class="r-notice r-type-wraith"><i class="fa-solid fa-ghost"></i> ${t("Shroud.HysteriaMsg", { n: f.hysteria, v: shroudOf().value })}</div>` });
  return f;
}

/** Призрак в своём Обиталище (Фон «Обиталище»): Покров ниже на его рейтинг. */
export async function toggleHaunt(actor) {
  if (!backgroundRating(actor, "Haunt") && !actor.getFlag(SYSTEM_ID, "inHaunt")) return ui.notifications.warn(t("Shroud.NoHaunt"));
  return actor.setFlag(SYSTEM_ID, "inHaunt", !actor.getFlag(SYSTEM_ID, "inHaunt"));
}

/** Сложность уровня: число из текста; сквозь Покров — рейтинг Покрова; «N или Покров, что выше»; никогда не ниже 4. */
export function artDifficulty(lv, actor) {
  const sh = shroudOf(actor);
  if (lv.shroudMax) return { diff: Math.max(4, lv.diff ?? 6, sh.value), shroud: sh, note: t("Shroud.MaxNote", { d: lv.diff ?? 6, n: sh.value, why: sh.text }) };
  if (lv.diff) return { diff: Math.max(4, lv.diff), shroud: null, note: lv.diffRule ? t("Shroud.Rule", { rule: lv.diffRule }) : "" };
  if (lv.shroud) return { diff: sh.value, shroud: sh, note: t("Shroud.Note", { n: sh.value, why: sh.text }) + (lv.diffRule && !/^Покров$/.test(lv.diffRule) ? ` — ${t("Shroud.Rule", { rule: lv.diffRule })}` : "") };
  return { diff: 6, shroud: null, note: lv.diffRule ? t("Shroud.Rule", { rule: lv.diffRule }) : "" };
}

/* ── Карточки листа ─────────────────────────────────────────────────── */

/** Шапка, шкалы и вкладка: Легион, фракция, Гильдия, Пафос, Тень. */
export function wraithInfo(actor, dots) {
  const w = actor.system.wraith, D = W(), sh = w.shadow;
  const legion = byKey(D.legions, w.legion), guild = guildsOf().find(g => g.key === w.guild) ?? null;
  const arch = (D.shadowArchetypes ?? []).find(a => a.name === sh.archetype) ?? null;
  return {
    legion, guild, faction: byKey(D.factions, w.faction), legionSym: legionSym(legion?.key), guildSym: guild ? arcSym(guild.key) : null,
    legions: (D.legions ?? []).map(l => ({ key: l.key, name: l.name, tip: `${l.death} · ${l.lord}`, selected: l.key === w.legion })),
    factions: (D.factions ?? []).map(f => ({ key: f.key, name: f.name, selected: f.key === w.faction })),
    guilds: ["high", "working", "criminal", "forbidden"].map(g => ({ name: t(`GuildGroup.${g}`),
      list: guildsOf().filter(x => x.group === g).map(x => ({ key: x.key, name: x.name, tip: x.arcanos, selected: x.key === w.guild })) })),
    legionTip: legion ? `${legion.en} — ${t("LegionDeath")}: ${legion.death}; ${legion.lord}, ${legion.seat}` : "",
    pathos: w.pathos.value, pathosBoxes: dots(w.pathos.value, 10, { path: "system.wraith.pathos.value" }),
    corpus: w.corpus, corpusDots: dots(w.corpus, 10, { path: "system.wraith.corpus" }),
    state: w.wavering ? "wavering" : actor.system.health.status === "harrowed" ? "harrowed" : w.state,
    stateLabel: t(`State.${w.wavering ? "wavering" : actor.system.health.status === "harrowed" ? "harrowed" : w.state}`),
    states: (D.states ?? ["corporeal", "incorporeal", "material"]).filter(s => !["wavering", "harrowed"].includes(s)).map(s => ({ key: s, label: t(`State.${s}`), selected: s === w.state })),
    harrowed: actor.system.health.status === "harrowed",
    angstPerm: sh.angst.permanent, angst: sh.angst.temporary,
    angstDots: dots(sh.angst.permanent, 10, { path: "system.wraith.shadow.angst.permanent" }),
    angstBoxes: dots(sh.angst.temporary, 10, { path: "system.wraith.shadow.angst.temporary" }),
    canCatharsis: sh.canCatharsis, catharsis: sh.catharsis,
    archetype: arch, archetypes: (D.shadowArchetypes ?? []).map(a => ({ value: a.name, label: a.name, selected: a.name === sh.archetype })),
    memoriam: backgroundRating(actor, "Memoriam"), eidolon: backgroundRating(actor, "Eidolon"),
    eidolonLeft: Math.max(0, backgroundRating(actor, "Eidolon") - w.session.eidolon), memoriamDone: w.session.memoriam,
    shroud: shroudOf(actor), haunt: backgroundRating(actor, "Haunt"), inHaunt: !!actor.getFlag(SYSTEM_ID, "inHaunt"), isGM: game.user.isGM
  };
}

/**
 * Арканои карточками: пять рангов — кружки, расколотые пополам (лист Wraith 20, гл. 5): слева Общий уровень, справа Посвящённый.
 * Ранги выше рейтинга — бледными (видно, что дальше); sel — открытая половинка { key: "уровень-вид" } (память листа).
 */
export function arcanoiView(actor, dots, sel = {}) {
  const w = actor.system.wraith, status = guildStatus(actor), ROM = ["I", "II", "III", "IV", "V"];
  const own = W().arcanoi.filter(a => (w.arcanoi[a.key]?.value ?? 0) > 0).map(a => {
    const r = w.arcanoi[a.key], value = r.value, home = a.key === w.guild;
    const art = l => {
      const common = l.kind === "common", n = l.level;
      return { ...l, known: n <= value && (common ? !r.skip.includes(n) : r.initiate.includes(n)), common, side: common ? "left" : "right",
        roman: ROM[n - 1], kindLabel: t(common ? "Common" : "Initiate"), attrLabel: l.attr ? attrLabel(l.attr) : "", cost: costText(l),
        pool: l.attr ? (actor.system.attributes[l.attr]?.total ?? 0) + value : null,
        ...(l => ({ diff: l.diff, diffNote: l.note, viaShroud: !!l.shroud }))(artDifficulty(l, actor)),
        // Посвящённый уровень открывает Статус в Гильдии не ниже уровня (гл. 4); член чужой Гильдии учит «вне закона»
        allowed: common || status[a.key] >= n, selected: sel[a.key] === `${n}-${l.kind}` };
    };
    const ranks = [1, 2, 3, 4, 5].map(n => ({ n, roman: ROM[n - 1], owned: n <= value,
      halves: ["common", "initiate"].map(k => a.levels.find(l => l.level === n && l.kind === k)).filter(Boolean).map(art) }));
    return { key: a.key, name: a.name, en: a.en, guild: a.guild, icon: a.icon, sym: arcSym(a.key), forbidden: a.forbidden, home, value, html: a.html,
      dots: dots(value, 5, { path: `system.wraith.arcanoi.${a.key}.value` }), xp: actor.xpCost("arcanos", value, { key: a.key }), ranks,
      sel: ranks.flatMap(x => x.halves).find(x => x.selected) ?? null, attrs: a.attrs.map(attrLabel).join(" · ") };
  });
  const avail = W().arcanoi.filter(a => !(w.arcanoi[a.key]?.value > 0)).map(a => ({ key: a.key, label: `${a.name} — ${a.guild}${a.forbidden ? ` · ${t("Forbidden")}` : ""}` }));
  return { own, avail };
}

/** Статус в Гильдии по Фону «Статус» (гл. 4): своя Гильдия — рейтинг, союзные — на 2 ниже. */
function guildStatus(actor) {
  const w = actor.system.wraith, rating = backgroundRating(actor, "Status"), out = {};
  for (const a of W().arcanoi) out[a.key] = 0;
  if (!w.guild) return out;
  out[w.guild] = rating;
  for (const k of arcanosOf(w.guild)?.allies ?? []) out[k] = Math.max(out[k], rating - 2);
  return out;
}

/** Цена уровня строкой: «1 Пафос, 1 Корпус · Тени +1 Ангст». */
function costText(l) {
  const parts = [["pathos", "Pathos"], ["corpus", "Corpus"], ["willpower", "Will"]].filter(([k]) => l[k]).map(([k, n]) => `${l[k]} ${t(`Cost.${n}`)}`);
  return [parts.join(", "), l.angst ? t("Cost.Angst", { n: l.angst }) : ""].filter(Boolean).join(" · ");
}

/** Страсти, Оковы, Тёмные Страсти и Шипы — строками для вкладки. */
export function passionsView(actor, dots) {
  const w = actor.system.wraith, sh = w.shadow;
  const row = (list, path) => list.map((x, i) => ({ ...x, i, dots: dots(x.value, 5, { path: `${path}.${i}.value`, list: true }) }));
  return {
    passions: row(w.passions, "system.wraith.passions"), fetters: row(w.fetters, "system.wraith.fetters"),
    dark: row(sh.darkPassions, "system.wraith.shadow.darkPassions"),
    passionSum: w.passions.reduce((n, x) => n + x.value, 0), fetterSum: w.fetters.reduce((n, x) => n + x.value, 0),
    darkSum: sh.darkPassions.reduce((n, x) => n + x.value, 0),
    thorns: sh.thorns.map((x, i) => { const d = thornOf(x.key); return { i, key: x.key, n: x.n, note: x.note, name: d?.name ?? x.key, en: d?.en ?? "", html: d?.html ?? "", cost: d?.costText ?? "" }; }),
    thornAvail: (W().thorns ?? []).map(x => ({ key: x.key, label: `${x.name} (${x.costText})` }))
  };
}

/* ── Списки на листе ────────────────────────────────────────────────── */

const LISTS = { passion: "system.wraith.passions", fetter: "system.wraith.fetters", dark: "system.wraith.shadow.darkPassions", thorn: "system.wraith.shadow.thorns" };
const listOf = (actor, kind) => foundry.utils.deepClone(foundry.utils.getProperty(actor._source, LISTS[kind].replace(/^system\./, "system.")) ?? []);

export async function addRow(actor, kind, data = {}) {
  const list = listOf(actor, kind);
  list.push(kind === "thorn" ? { key: data.key ?? "", n: 1, note: "" } : kind === "fetter" ? { text: data.text ?? "", value: 1, resolved: false } : { text: data.text ?? "", emotion: data.emotion ?? "", value: 1 });
  return actor.update({ [LISTS[kind]]: list });
}
export async function removeRow(actor, kind, i) {
  const list = listOf(actor, kind);
  list.splice(Number(i), 1);
  return actor.update({ [LISTS[kind]]: list });
}
/** Поле строки списка (текст, эмоция, рейтинг) — массив целиком: ArrayField не правится по индексу. */
export async function setRow(actor, kind, i, field, value) {
  const list = listOf(actor, kind), row = list[Number(i)];
  if (!row) return;
  row[field] = field === "value" || field === "n" ? Math.clamp(Number(value) || 0, 0, field === "n" ? 10 : 5) : field === "resolved" ? !!value : String(value ?? "");
  return actor.update({ [LISTS[kind]]: list });
}

/** Отметка Посвящённого или Общего уровня на рейтинге: initiate — знает Посвящённый, skip — Общий не взят. */
export async function toggleArt(actor, key, level, kind) {
  const r = actor._source.system.wraith.arcanoi[key];
  if (!r) return;
  const field = kind === "initiate" ? "initiate" : "skip", list = new Set(r[field]);
  list.has(level) ? list.delete(level) : list.add(level);
  // хоть один уровень на рейтинге должен остаться: снять Общий можно, только если взят Посвящённый
  if (field === "skip" && list.has(level) && !r.initiate.includes(level)) return ui.notifications.warn(t("NeedOneArt"));
  if (field === "initiate" && !list.has(level) && r.skip.includes(level)) return ui.notifications.warn(t("NeedOneArt"));
  return actor.update({ [`system.wraith.arcanoi.${key}.${field}`]: [...list].sort() });
}

/* ── Пафос, Корпус, Ангст ───────────────────────────────────────────── */

/** Потратить Пафос (в Катарсисе Тень не опустит его ниже 1, гл. 6). Спектр вместо Пафоса тратит Ангст (гл. 10). */
export async function spendPathos(actor, n = 1) {
  if (actor.system.wraith.spectre?.on) return (await import("./spectre.mjs")).spendSpectreAngst(actor, n);
  const p = actor.system.wraith.pathos.value, floor = actor.system.wraith.shadow.catharsis ? 1 : 0;
  if (p - n < floor) { ui.notifications.warn(t("NoPathos", { n })); return false; }
  await actor.update({ "system.wraith.pathos.value": p - n });
  return true;
}
export async function gainPathos(actor, n) {
  if (actor.system.wraith.spectre?.on) return (await import("./spectre.mjs")).gainSpectreAngst(actor, Math.max(0, n));
  // у проектора «Орфея» Пафос не выше временного Корпуса (Живучесть)
  const p = actor.system.wraith.pathos.value, now = Math.min(actor.system.wraith.pathos.max ?? 10, 10, p + Math.max(0, n));
  if (now !== p) await actor.update({ "system.wraith.pathos.value": now });
  return now - p;
}

/**
 * Ангст Тени (гл. 6): временный до 10; на 10 временных — обмен на +1 постоянный; постоянный 10 — призрак становится Спектром.
 * В Катарсисе (Тень владеет Корпусом) Арканои, что дали бы Ангст, его отнимают.
 */
export async function gainAngst(actor, n, { reason = "" } = {}) {
  if (!n) return 0;
  // у Спектра Тени нет: где Тень получила бы Ангст, Психея получает Пафос (гл. 10)
  if (actor.system.wraith.spectre?.on) return (await import("./spectre.mjs")).gainPsyche(actor, n, { reason });
  const a = actor._source.system.wraith.shadow.angst;
  let temp = Math.clamp(a.temporary + n, 0, 10), perm = a.permanent;
  const swap = temp >= 10 && perm < 10;
  if (swap) { temp = 0; perm += 1; }
  await actor.update({ "system.wraith.shadow.angst": { temporary: temp, permanent: perm } });
  // игрок Психеи точного счёта не знает — ведущему шёпотом (гл. 6, «Учёт Ангста ведёт проводник-Тень»)
  const gm = ChatMessage.getWhisperRecipients("GM");
  if (n > 0 || swap) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: gm,
    content: `<div class="r-notice r-type-wraith is-shadow"><i class="fa-solid fa-mask"></i> ${t(n > 0 ? "AngstGain" : "AngstLoss", { name: esc(actor.name), n: Math.abs(n), temp, perm })}${reason ? ` <small>(${esc(reason)})</small>` : ""}
      ${swap ? `<p><b>${t("AngstSwap", { perm })}</b></p>` : ""}${perm >= 10 ? `<p class="r-fate"><b>${t("SpectreFall")}</b></p>` : ""}</div>` });
  return n;
}

/**
 * Урон по Корпусу (гл. 11): ячейки заполняются по порядку; ударный на полной шкале утяжеляет ударную отметку в летальную;
 * шкала из одних ударных — «колебание»; летальный при колебании или полная шкала летального — Испытание;
 * губительный на последней ячейке (или при колебании) — Испытание Разрушения.
 */
export async function corpusDamage(actor, amount, type = "bashing") {
  const cap = Math.max(1, actor.system.wraith.corpus), src = actor._source.system.health;
  const h = { bashing: src.bashing, lethal: src.lethal, aggravated: src.aggravated };
  const wasWavering = actor.system.wraith.wavering;
  let harrow = "";
  for (let i = 0; i < amount; i++) {
    const full = h.bashing + h.lethal + h.aggravated >= cap;
    if (!full) { h[type]++; continue; }
    if (type === "aggravated") { harrow = "destruction"; if (h.bashing) { h.bashing--; h.aggravated++; } else if (h.lethal) { h.lethal--; h.aggravated++; } break; }
    if (h.bashing) { h.bashing--; h.lethal++; } else { harrow ||= "corpus"; break; }
  }
  const full = h.bashing + h.lethal + h.aggravated >= cap;
  if (!harrow && full && !h.bashing) harrow = type === "aggravated" ? "destruction" : "corpus";
  if (!harrow && wasWavering && type !== "bashing") harrow = type === "aggravated" ? "destruction" : "corpus";
  await actor.update({ "system.health": h });
  const dmg = game.i18n.localize(VTM20.damageTypes[type].label);
  const fate = harrow ? t(harrow === "destruction" ? "FateDestruction" : "FateHarrowing") : full && h.bashing ? t("FateWavering") : "";
  await say(actor, "fa-ghost", `${game.i18n.format("VTM20.Notify.Damaged", { n: amount, type: dmg })}${fate ? ` <b class="r-fate">${fate}</b>` : ""}`);
  if (harrow && actor.system.wraith.risen?.on && actor.system.wraith.risen.body && harrow !== "destruction") return (await import("./risen.mjs")).risenDown(actor);
  if (harrow) await harrowing(actor, harrow);
}

/** Лечение Пафосом (гл. 3): 1 Пафос — 2 ударных или 1 летальный; губительный — 3 Пафоса и 8 часов Сна или медитации. */
export async function pathosHeal(actor) {
  const h = actor._source.system.health;
  if (actor.system.wraith.risen?.on && actor.system.wraith.risen.body) {
    const type = h.bashing ? "bashing" : h.lethal ? "lethal" : null;
    if (!type) return h.aggravated ? (await import("./risen.mjs")).risenSlumber(actor) : ui.notifications.info(game.i18n.localize("VTM20.Notify.NothingToHeal"));
    if (!(await spendPathos(actor, 1))) return;
    await actor.update({ [`system.health.${type}`]: h[type] - 1 });
    return say(actor, "fa-hand-sparkles", t("Risen.Healed", { name: esc(actor.name) }));
  }
  const type = h.bashing ? "bashing" : h.lethal ? "lethal" : h.aggravated ? "aggravated" : null;
  if (!type) return ui.notifications.info(game.i18n.localize("VTM20.Notify.NothingToHeal"));
  const cost = type === "aggravated" ? 3 : 1;
  if (!(await spendPathos(actor, cost))) return;
  const n = type === "bashing" ? Math.min(2, h.bashing) : 1;
  await actor.update({ [`system.health.${type}`]: h[type] - n });
  return say(actor, "fa-hand-sparkles", t(`Healed.${type}`, { name: esc(actor.name), n, cost }));
}

/* ── Броски ─────────────────────────────────────────────────────────── */

/**
 * Уровень Арканоса (гл. 5): цена (Пафос, Корпус) — до броска, Воля — в окне броска; пул Атрибут + Арканос, сложность из текста
 * (сквозь Покров — рейтинг Покрова, не ниже 4). Ангст за уровень — Тени; в Катарсисе — наоборот, Тень его теряет.
 */
export async function rollArt(actor, key, level, kind = "common") {
  const a = arcanosOf(key), lv = a?.levels.find(l => l.level === Number(level) && l.kind === kind);
  if (!lv) return null;
  const w = actor.system.wraith, value = w.arcanoi[key]?.value ?? 0;
  if (value < lv.level) return ui.notifications.warn(t("ArtTooHigh", { n: lv.level }));
  if (lv.pathos && !(await spendPathos(actor, lv.pathos))) return null;
  // трата Корпуса — ударная отметка на шкале (правило системы: книга лечит её как обычный урон)
  if (lv.corpus) await corpusDamage(actor, lv.corpus, "bashing");
  const shadowRuns = w.spectre?.on ? false : w.shadow.catharsis;
  // Восставший в теле (гл. 11): каждый Арканос — ещё 1 Ангст Тени
  const risenExtra = w.risen?.on && w.risen.body ? 1 : 0, angstGain = (lv.angst ?? 0) + risenExtra;
  if (angstGain) await gainAngst(actor, shadowRuns ? -angstGain : angstGain, { reason: risenExtra ? `${lv.name} · ${t("Risen.ExtraAngst")}` : lv.name });
  const dc = artDifficulty(lv, actor);
  const extra = { wraith: { kind: "art", key, level: lv.level, art: kind, name: lv.name, cost: costText(lv), angst: lv.angst ?? 0, shadow: shadowRuns,
    ...(dc.shroud ? { shroud: dc.shroud.value } : {}) } };
  if (lv.noRoll || !lv.attr) {
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-wraith r-wr-art">
      <p><i class="fa-solid ${a.icon}"></i> <b>${esc(a.name)} ${"•".repeat(lv.level)} — ${esc(lv.name)}</b> <small>(${t(kind === "common" ? "Common" : "Initiate")})</small></p>
      ${extra.wraith.cost ? `<p><small>${esc(extra.wraith.cost)}</small></p>` : ""}${lv.html}</div>` });
    return true;
  }
  return RollDialog.prompt(actor, { title: `${a.name}: ${lv.name}`, trait1: `attributes.${lv.attr}`, trait2: `wraith.${key}`,
    difficulty: dc.diff, diffNote: dc.note, effect: lv.html, willpowerCost: lv.willpower ?? 0, extra,
    onRolled: async r => {
      // в Катарсисе провал или ботч Арканоса отнимает у Тени Ангст (гл. 6)
      if (shadowRuns && (r?.outcome === "failure" || r?.outcome === "botch")) await gainAngst(actor, -1, { reason: t("ShadowFail") });
    } });
}

/** Сыгранная Страсть (гл. 8): рейтинг, сл. 6 (сам переживает) или 8 (видит у смертного); успех — Пафос. Раз за сцену. */
export async function rollPassion(actor, i) {
  const p = actor.system.wraith.passions[Number(i)];
  if (!p) return null;
  const how = await pick(t("PassionTitle", { text: p.text || "—" }), [
    { key: "6", icon: "fa-heart", title: t("PassionSelf"), sub: t("DiffN", { n: 6 }) },
    { key: "8", icon: "fa-people-arrows", title: t("PassionOther"), sub: t("DiffN", { n: 8 }) }]);
  if (!how) return null;
  return RollDialog.prompt(actor, { title: t("PassionTitle", { text: p.text || "—" }), pool: p.value, difficulty: Number(how), lockTraits: true,
    extra: { wraith: { kind: "passion", text: p.text, emotion: p.emotion } },
    onRolled: async r => { const n = await gainPathos(actor, r?.successes ?? 0); if (n) await say(actor, "fa-heart", t("PathosGain", { name: esc(actor.name), n })); } });
}

/** Оковы (гл. 8): в конце сцены с Оковами — рейтинг, сл. 6, успех — Воля; Сон в Оковах — сл. 4 за 8 часов. */
export async function rollFetter(actor, i) {
  const f = actor.system.wraith.fetters[Number(i)];
  if (!f) return null;
  const how = await pick(t("FetterTitle", { text: f.text || "—" }), [
    { key: "6", icon: "fa-link", title: t("FetterScene"), sub: t("DiffN", { n: 6 }) },
    { key: "4", icon: "fa-bed", title: t("FetterSlumber"), sub: t("DiffN", { n: 4 }) }]);
  if (!how) return null;
  return RollDialog.prompt(actor, { title: t("FetterTitle", { text: f.text || "—" }), pool: f.value, difficulty: Number(how), lockTraits: true,
    extra: { wraith: { kind: "fetter", text: f.text } },
    onRolled: async r => {
      const wp = actor.system.willpower, n = Math.min(wp.permanent - wp.temporary, r?.successes ?? 0);
      if (n > 0) { await actor.update({ "system.willpower.temporary": wp.temporary + n }); await say(actor, "fa-link", t("WillGain", { name: esc(actor.name), n })); }
    } });
}

/** Мемориум (гл. 4): раз за сессию рейтинг, сл. 8 — Пафос за успех; провал с единицами — −1 Мемориум навсегда. */
export async function rollMemoriam(actor) {
  const n = backgroundRating(actor, "Memoriam");
  if (!n) return ui.notifications.warn(t("NoMemoriam"));
  if (actor.system.wraith.session.memoriam) return ui.notifications.warn(t("MemoriamDone"));
  return RollDialog.prompt(actor, { title: t("Memoriam"), pool: n, difficulty: 8, lockTraits: true, extra: { wraith: { kind: "memoriam" } },
    onRolled: async r => {
      await actor.update({ "system.wraith.session.memoriam": true });
      const got = await gainPathos(actor, r?.successes ?? 0);
      if (got) await say(actor, "fa-candle-holder", t("PathosGain", { name: esc(actor.name), n: got }));
      if (r?.outcome === "botch") await say(actor, "fa-heart-crack", t("MemoriamBotch", { name: esc(actor.name) }), "is-warn");
    } });
}

/** Тёмная Страсть (гл. 6): призрак сам испытывает чувство — сл. 7, Тень подбила — сл. 9; успех — временный Ангст. */
export async function rollDarkPassion(actor, i) {
  const p = actor.system.wraith.shadow.darkPassions[Number(i)];
  if (!p) return null;
  const how = await pick(t("DarkTitle", { text: p.text || "—" }), [
    { key: "7", icon: "fa-face-angry", title: t("DarkSelf"), sub: t("DiffN", { n: 7 }) },
    { key: "9", icon: "fa-mask", title: t("DarkShadow"), sub: t("DiffN", { n: 9 }) }]);
  if (!how) return null;
  const risen = actor.system.wraith.risen?.on && actor.system.wraith.risen.body;   // Восставшему Ангст даётся легче (гл. 11)
  return RollDialog.prompt(actor, { title: t("DarkTitle", { text: p.text || "—" }), pool: p.value, difficulty: Number(how) - (risen ? 1 : 0), lockTraits: true,
    ...(risen ? { diffNote: t("Risen.AngstEasier") } : {}),
    extra: { wraith: { kind: "dark", text: p.text, emotion: p.emotion } }, messageMode: "gm",
    onRolled: async r => { if (r?.successes) await gainAngst(actor, r.successes, { reason: p.text }); } });
}

/**
 * Теневые кубики (гл. 6): Тень предлагает до 5 кубиков к броску Психеи; бросаются отдельно, их успехи прибавляются,
 * а каждая единица на них — +1 временный Ангст.
 */
export async function shadowDice(actor) {
  const n = Number(await pick(t("ShadowDice"), [1, 2, 3, 4, 5].map(k => ({ key: String(k), icon: "fa-dice-d10", title: t("ShadowDiceN", { n: k }) })), { lead: t("ShadowDiceLead") }));
  if (!n) return null;
  const diff = Number(await foundry.applications.api.DialogV2.prompt({ window: { title: t("ShadowDice") }, classes: ["vtm20", "r-dialog"],
    content: `<label class="r-f"><span>${game.i18n.localize("VTM20.Roll.Difficulty")}</span><input type="number" name="d" value="6" min="2" max="10"></label>`,
    ok: { callback: (ev, btn) => btn.form.elements.d.value }, rejectClose: false })) || 6;
  const roll = await new Roll(`${n}d10`).evaluate(), vals = roll.dice[0].results.map(x => x.result);
  const ones = vals.filter(v => v === 1).length, hits = vals.filter(v => v >= diff).length;
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), rolls: [roll],
    content: `<div class="r-notice r-type-wraith is-shadow"><p><i class="fa-solid fa-mask"></i> <b>${t("ShadowDice")}</b>: ${vals.join(", ")} (${t("DiffN", { n: diff })})</p>
      <p>${t("ShadowDiceOut", { hits, ones })}</p></div>` });
  if (ones) await gainAngst(actor, ones, { reason: t("ShadowDice") });
  return { hits, ones };
}

/**
 * Катарсис (гл. 6): когда временный Ангст выше Воли. Тень тратит 1 Ангст и бросает временный Ангст, Психея — постоянную
 * Волю и кубики Эйдолона; сложность 6. Больше успехов у Тени — она владеет Корпусом всю следующую сцену.
 */
export async function catharsis(actor) {
  const w = actor.system.wraith, sh = w.shadow;
  if (sh.catharsis) {
    await actor.update({ "system.wraith.shadow.catharsis": false });
    return say(actor, "fa-sun", t("CatharsisEnd", { name: esc(actor.name) }));
  }
  if (!sh.canCatharsis && !game.user.isGM) return ui.notifications.warn(t("NoCatharsis"));
  await gainAngst(actor, -1, { reason: t("Catharsis") });
  const pool = actor.system.wraith.shadow.angst.temporary;
  const sr = await new Roll(`${Math.max(0, pool)}d10`).evaluate(), sv = pool ? sr.dice[0].results.map(x => x.result) : [];
  const shadowHits = Math.max(0, sv.filter(v => v >= 6).length - sv.filter(v => v === 1).length);
  const eid = Math.max(0, backgroundRating(actor, "Eidolon") - w.session.eidolon);
  return RollDialog.prompt(actor, { title: t("Catharsis"), trait1: "willpower.permanent", bonus: eid, bonusLabel: t("Eidolon"), difficulty: 6, lockTraits: true,
    extra: { wraith: { kind: "catharsis", shadow: shadowHits, shadowVals: sv.join(", ") } },
    onRolled: async r => {
      if (eid) await actor.update({ "system.wraith.session.eidolon": w.session.eidolon + eid });
      if ((r?.successes ?? 0) < shadowHits) {
        await actor.update({ "system.wraith.shadow.catharsis": true });
        await say(actor, "fa-mask", t("CatharsisOn", { name: esc(actor.name) }), "is-shadow");
      }
    } });
}

/**
 * Испытание (гл. 6): выход — постоянная Воля, сл. 9, хватит одного успеха; Испытание Разрушения — постоянная Воля против
 * постоянного Ангста, сл. 6. Испытание за потерю Корпуса: успех — временный Корпус = Выносливости, провал — −1 постоянный.
 */
export async function harrowing(actor, cause = "corpus") {
  // живому Испытание не грозит: проектора «Орфея» выбрасывает в тело с губительной раной
  if (actor.system.wraith.projector?.on) return (await import("./projector.mjs")).projectorHarrowed(actor);
  const destruction = cause === "destruction";
  await actor.toggleStatusEffect?.("r-harrowing", { active: true });
  const angst = actor.system.wraith.shadow.angst.permanent;
  let shadowHits = 0, sv = [];
  if (destruction) {
    const sr = await new Roll(`${Math.max(1, angst)}d10`).evaluate(); sv = sr.dice[0].results.map(x => x.result);
    shadowHits = Math.max(0, sv.filter(v => v >= 6).length - sv.filter(v => v === 1).length);
  }
  return RollDialog.prompt(actor, { title: t(destruction ? "HarrowDestruction" : "Harrowing"), trait1: "willpower.permanent", difficulty: destruction ? 6 : 9, lockTraits: true,
    effect: `<p>${t(destruction ? "HarrowDestructionText" : "HarrowingText")}</p>`,
    extra: { wraith: { kind: "harrowing", cause, shadow: destruction ? shadowHits : null, shadowVals: sv.join(", ") } },
    onRolled: async r => {
      const won = destruction ? (r?.successes ?? 0) > shadowHits : (r?.successes ?? 0) >= 1;
      await actor.toggleStatusEffect?.("r-harrowing", { active: false });
      const wr = actor.system.wraith, sta = actor.system.attributes.stamina.total;
      if (cause === "corpus" || cause === "destruction") {
        if (won) {
          // выход к Оковам: временный Корпус = Выносливости (не выше постоянного); Разрушение — ещё +1 к постоянному
          const corpus = Math.min(10, wr.corpus + (destruction && wr.corpus < 10 ? 1 : 0)), keep = Math.min(corpus, Math.max(1, sta));
          await actor.update({ "system.wraith.corpus": corpus, "system.health": { bashing: 0, lethal: corpus - keep, aggravated: 0 } });
        } else if (!destruction) {
          const corpus = Math.max(0, wr.corpus - 1);
          await actor.update({ "system.wraith.corpus": corpus, "system.health": { bashing: 0, lethal: Math.max(0, corpus - Math.min(corpus, sta)), aggravated: 0 } });
          if (!corpus) return harrowing(actor, "destruction");
        }
      }
      await say(actor, won ? "fa-door-open" : "fa-skull", t(won ? (destruction ? "HarrowDestructionWon" : "HarrowingWon") : (destruction ? "HarrowDestructionLost" : "HarrowingLost"),
        { name: esc(actor.name) }), won ? "" : "is-warn");
    } });
}

/** Новая сессия (гл. 4): снова можно бросить Мемориум, кубики Эйдолона — заново. */
export async function newSession(actor) {
  await actor.update({ "system.wraith.session": { memoriam: false, eidolon: 0 } });
  return say(actor, "fa-hourglass-start", t("SessionReset", { name: esc(actor.name) }));
}

/** Окно выбора карточками (как у оборотней): возвращает key или null. */
export async function pick(title, cards, { lead = "" } = {}) {
  let picked = null;
  const card = c => `<button type="button" class="r-wc-card" data-pick="${esc(c.key)}"${c.disabled ? " disabled" : ""}>
      <span class="r-wc-mark"><i class="fa-solid ${c.icon ?? "fa-ghost"}"></i></span>
      <span class="r-wc-body"><b>${esc(c.title)}</b>${c.sub ? `<small>${esc(c.sub)}</small>` : ""}</span></button>`;
  await foundry.applications.api.DialogV2.wait({
    window: { title, icon: "fa-solid fa-ghost" }, classes: ["vtm20", "r-dialog", "r-type-wraith", "r-wc-dlg"], position: { width: 460 }, rejectClose: false,
    content: `<div class="r-wc">${lead ? `<p class="r-wc-lead">${esc(lead)}</p>` : ""}<div class="r-wc-cards">${cards.map(card).join("")}</div></div>`,
    buttons: [{ action: "cancel", label: game.i18n.localize("VTM20.Common.Cancel") }],
    render: (ev, dlg) => dlg.element.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", () => { picked = b.dataset.pick; dlg.close(); }))
  });
  return picked;
}

/** Покров сцены или жетоны на ней поменялись — открытые листы призраков перерисовывают вкладку Арканоев. */
const redrawWraiths = () => { for (const app of foundry.applications.instances.values()) if (app.actor?.type === "wraith" && app.rendered && app.tabGroups) app.render({ parts: ["disciplines"] }); };
Hooks.on("updateScene", (scene, diff) => { if (foundry.utils.hasProperty(diff, `flags.${SYSTEM_ID}.shroud`)) redrawWraiths(); });
Hooks.on("createToken", redrawWraiths); Hooks.on("deleteToken", redrawWraiths); Hooks.on("canvasReady", redrawWraiths);

/* ── Знак и блок карточки броска ───────────────────────────────────── */

// знак на карточках чата — Легион призрака (без Легиона — общая печать линейки)
registerEmblem("wraith", actor => legionSym(actor?.system?.wraith?.legion) ?? { src: foundry.utils.getRoute(WRAITH_SIGIL) });

registerCardBlock("wraith", (state, ev) => {
  const x = state.extra.wraith, n = ev.successes ?? 0, botch = ev.outcome === "botch";
  const chips = [];
  if (x.kind === "art") {
    chips.push({ icon: arcanosOf(x.key)?.icon ?? "fa-ghost", label: `${arcanosOf(x.key)?.name ?? x.key} ${"•".repeat(x.level)}` },
      { icon: x.art === "initiate" ? "fa-key" : "fa-circle", label: t(x.art === "initiate" ? "Initiate" : "Common") });
    if (x.cost) chips.push({ icon: "fa-coins", label: x.cost });
    if (x.shadow) chips.push({ icon: "fa-mask", label: t("ShadowAtWheel"), cls: "is-warn" });
    if (x.shroud) chips.push({ icon: "fa-cloud", label: t("Shroud.Chip", { n: x.shroud }) });
    return { chips, text: botch ? t("ArtBotch") : n ? t("ArtOk", { n }) : t("ArtFail") };
  }
  if (x.kind === "passion" || x.kind === "dark") {
    // текст Страсти — в заголовке карточки; чипом — чувство
    if (x.emotion) chips.push({ icon: x.kind === "dark" ? "fa-mask" : "fa-heart", label: x.emotion, cls: x.kind === "dark" ? "is-warn" : "" });
    return { chips, text: x.kind === "dark" ? (n ? t("AngstOut", { n }) : t("AngstNone")) : (n ? t("PathosOut", { n }) : t("PathosNone")) };
  }
  if (x.kind === "fetter") return { chips: [], text: n ? t("WillOut", { n }) : t("WillNone") };
  if (x.kind === "memoriam") return { chips: [{ icon: "fa-candle-holder", label: t("Memoriam") }], text: botch ? t("MemoriamBotchShort") : n ? t("PathosOut", { n }) : t("PathosNone") };
  if (x.kind === "catharsis" && x.psyche) {   // Катарсис Психеи: Воля Спектра против запаса Пафоса Психеи
    const held = n >= x.shadow;
    return { chips: [{ icon: "fa-dove", label: t("Spectre.PsycheRolled", { n: x.shadow, vals: x.shadowVals || "—" }) }],
      text: held ? t("Spectre.SpectreHolds", { n, s: x.shadow }) : t("Spectre.PsycheWins", { n, s: x.shadow }), cls: held ? "is-warn" : "" };
  }
  if (x.kind === "darkArt") {
    const d = (Codex.wraith?.darkArcanoi ?? []).find(a => a.key === x.key);
    chips.push({ icon: d?.icon ?? "fa-skull", label: `${d?.name ?? x.key} ${"•".repeat(x.level)}`, cls: "is-warn" });
    if (x.cost) chips.push({ icon: "fa-coins", label: x.cost });
    if (x.shroud) chips.push({ icon: "fa-cloud", label: t("Shroud.Chip", { n: x.shroud }) });
    return { chips, text: botch ? t("Spectre.DarkBotch") : n ? t("ArtOk", { n }) : t("ArtFail") };
  }
  // Восставший (гл. 11): шаги Восстания и переходов, свои Арканои, обморок, Сон
  if (x.kind === "risen") return { chips: [{ icon: "fa-person-rays", label: x.step }], text: n ? t("Risen.StepOk", { n }) : botch ? t("Risen.StepBotch") : t("Risen.StepFail"), cls: n ? "" : "is-warn" };
  if (x.kind === "risenArt") {
    const d = (Codex.wraith?.risenArcanoi ?? []).find(a => a.key === x.key);
    return { chips: [{ icon: d?.icon ?? "fa-eye", label: `${d?.name ?? x.key} ${"•".repeat(x.level)}` }], text: botch ? t("ArtBotch") : n ? t("ArtOk", { n }) : t("ArtFail") };
  }
  if (x.kind === "risenDown") {
    const time = (W().risen?.unconscious ?? []).find(([k]) => (botch ? -1 : n) >= k)?.[1] ?? "";
    return { chips: [{ icon: "fa-bed", label: t("Risen.Down") }], text: t("Risen.DownFor", { time }), cls: "is-warn" };
  }
  if (x.kind === "risenSlumber") return { chips: [{ icon: "fa-bed", label: t("Risen.Slumber") }], text: n ? t("Risen.SlumberOk", { n }) : t("Risen.NoSleepShort") };
  if (x.kind === "deadEyes") return { chips: [{ icon: "fa-eye", label: t("Proj.DeadEyes") }], text: n ? t("Proj.DeadEyesOk") : t("Proj.DeadEyesFail") };
  if (x.kind === "psyche") return { chips: x.emotion ? [{ icon: "fa-dove", label: x.emotion }] : [], text: n ? t("Spectre.PsycheOut", { n }) : t("PathosNone") };
  if (x.kind === "rapacity") return { chips: [{ icon: "fa-teeth", label: t("Spectre.Rapacity") }], text: n ? t("Spectre.RapacityHeld") : t("Spectre.RapacityLost"), cls: n ? "" : "is-warn" };
  if (x.kind === "catharsis") {
    const won = n >= x.shadow;
    return { chips: [{ icon: "fa-mask", label: t("ShadowRolled", { n: x.shadow, vals: x.shadowVals || "—" }), cls: "is-warn" }],
      text: won ? t("PsycheHolds", { n, s: x.shadow }) : t("ShadowWins", { n, s: x.shadow }), cls: won ? "" : "is-warn" };
  }
  if (x.kind === "harrowing") {
    const destr = x.cause === "destruction", won = destr ? n > (x.shadow ?? 0) : n >= 1;
    return { chips: [{ icon: "fa-dungeon", label: t(destr ? "HarrowDestruction" : "Harrowing") },
      ...(destr ? [{ icon: "fa-mask", label: t("ShadowRolled", { n: x.shadow, vals: x.shadowVals || "—" }), cls: "is-warn" }] : [])],
      text: t(won ? (destr ? "HarrowDestructionWonShort" : "HarrowingWonShort") : (destr ? "HarrowDestructionLostShort" : "HarrowingLostShort")), cls: won ? "" : "is-warn" };
  }
  return null;
});

export { SYSTEM_ID };
