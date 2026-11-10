// module/apps/mage.mjs
// Маг: Восхождение (M20, справочник — data/mage.json, tools/mage_data.py).
//   · Арете — кубики магии; постоянная Воля ниже Арете ограничивает и кубики, и предел Сфер (M20, гл. 6);
//   · чародейство: сложность = высшая Сфера эффекта + 3 (совпадение), + 4 (вульгарно), + 5 (вульгарно при Спящих);
//     не ниже 3 и не выше 10, поправки вместе — от −3 до +3; Квинтэссенция −1 за очко (до −3, за ход — не больше Аватара);
//   · успехи — урон и длительность по таблице; успешная вульгарная магия — 1 Парадокс;
//     провал: совпадение — Парадокс по высшей Сфере, вульгарно — 1 + Сфера, при свидетелях — 2 + 2 × Сфера;
//   · колесо: Квинтэссенция и Парадокс вместе не больше 20, Парадокс вытесняет Квинтэссенцию;
//   · откат Парадокса — бросок пула Парадокса (сл. 6): каждый успех разряжает очко, итог — по таблице (рассказчик).

import { SYSTEM_ID, VTM20 } from "../config.mjs";
import { Codex } from "../data/codex.mjs";

export const M = () => Codex.mage ?? {};
const t = (k, d) => d ? game.i18n.format(`VTM20.Mage.${k}`, d) : game.i18n.localize(`VTM20.Mage.${k}`);
const esc = x => foundry.utils.escapeHTML(String(x ?? ""));
const WHEEL = 20;

export const sphereOf = key => (M().spheres ?? []).find(s => s.key === key) ?? null;
export const factionOf = actor => (M().factions ?? []).find(f => f.key === actor?.system?.mage?.faction) ?? null;
/** Технократ называет Сферы по-своему (Данные, Пространственная наука, Первичная Полезность). */
const isTech = actor => factionOf(actor)?.group === "technocracy";
export const sphereName = (actor, key) => { const s = sphereOf(key); return (isTech(actor) && s?.tech?.name) || s?.name || key; };

/** Кубики магии и предел Сфер: Арете, но не выше постоянной Воли. */
export const aretePool = actor => Math.min(actor.system.mage?.arete ?? 0, actor.system.willpower?.permanent ?? 0);
/** Рейтинг Аватара (Гения) — Факт биографии: сколько Квинтэссенции можно потратить или вобрать за ход. */
export function avatarOf(actor) {
  const bg = actor.items.find(i => i.type === "background" && /^(Аватар|Avatar|Гений|Genius)/i.test(i.name));
  return bg?.system?.value ?? 0;
}

/** Колесо: Квинтэссенция слева, Парадокс справа (постоянный — у самого края). */
function wheelOf(m) {
  const q = Math.min(m.quintessence, WHEEL), p = Math.min(m.paradox, WHEEL - q), perm = Math.min(m.paradoxPerm, p);
  return Array.from({ length: WHEEL }, (_, i) => ({ n: i + 1, quint: i < q, paradox: i >= WHEEL - p, perm: i >= WHEEL - perm }));
}

/** Данные листа: шапка (фракция, Сущность, родовая Сфера) и карточка Арете с колесом. */
export function mageInfo(actor, dots) {
  const m = actor.system.mage, D = M(), f = factionOf(actor), pool = aretePool(actor);
  const groups = (D.groups ?? []).map(g => ({ name: g.name, list: (D.factions ?? []).filter(x => x.group === g.key).map(x => ({ key: x.key, name: x.name, selected: x.key === m.faction })) }));
  const allowed = f?.affinity?.length ? f.affinity : VTM20.mageSpheres;
  return {
    groups, faction: f, factionTip: f ? [f.en, f.affinityText && `${t("Affinity")}: ${f.affinityText}`, f.practices].filter(Boolean).join(" · ") : "",
    essences: (D.essences ?? []).map(e => ({ key: e.key, name: e.name, tip: e.text, selected: e.key === m.essence })),
    essence: (D.essences ?? []).find(e => e.key === m.essence) ?? null,
    affinities: VTM20.mageSpheres.map(k => ({ key: k, name: sphereName(actor, k), selected: k === m.affinity, off: !allowed.includes(k) })),
    arete: m.arete, areteName: D.arete?.[m.arete] ?? "", areteDots: dots(m.arete, 10, { path: "system.mage.arete" }),
    pool, capped: pool < m.arete, avatar: avatarOf(actor),
    quintessence: m.quintessence, paradox: m.paradox, paradoxPerm: m.paradoxPerm, wheel: wheelOf(m),
    backlash: m.paradox >= 5, isGM: game.user.isGM
  };
}

/** Вкладка Сфер: девять карточек с рангами, фокус и ротэ. */
export function spheresView(actor, dots) {
  const m = actor.system.mage, cap = aretePool(actor), D = M(), tech = isTech(actor);
  const spheres = (D.spheres ?? []).map(s => {
    const v = m.spheres?.[s.key] ?? 0, alt = tech && s.tech ? s.tech : null;
    return { key: s.key, name: alt?.name ?? s.name, en: alt?.en ?? s.en, icon: s.icon, value: v, over: v > cap, affinity: s.key === m.affinity,
      altTip: !alt && s.tech ? t("TechName", { name: s.tech.name }) : alt ? t("MysticName", { name: s.name }) : "",
      specialties: s.specialties, dots: dots(v, 5, { path: `system.mage.spheres.${s.key}` }),
      // на листе — свои ранги и следующий (к чему расти); полный список — в компендии
      ranks: (alt?.ranks ?? s.ranks).map((text, i) => ({ n: i + 1, name: D.ranks?.[i] ?? "", text, owned: i < v })).filter(r => r.n <= v + 1) };
  });
  const F = D.focus ?? {};
  return { spheres, cap, arete: m.arete, capped: cap < m.arete, total: spheres.reduce((s, x) => s + x.value, 0),
    paradigms: (F.paradigms ?? []).map(p => p.name), practices: (F.practices ?? []).map(p => p.name),
    practiceTip: (F.practices ?? []).find(p => p.name === m.practice)?.instruments ?? "",
    tools: m.instruments.map((name, i) => ({ i, name })), toolList: (F.instruments ?? []).filter(x => !m.instruments.includes(x)),
    toolsNeed: Math.max(0, (D.creation?.instruments ?? 7) - Math.max(0, m.arete - 2) - m.instruments.length),
    rotes: m.rotes.map((r, i) => ({ i, ...r })) };
}

/* ── Колесо ───────────────────────────────────────────────────────────── */

/** Квинтэссенция: не больше свободного места на колесе. */
export async function changeQuintessence(actor, d) {
  const m = actor.system.mage, next = Math.clamp(m.quintessence + d, 0, WHEEL - m.paradox);
  if (next !== m.quintessence) await actor.update({ "system.mage.quintessence": next });
  return next;
}
/** Парадокс: вытесняет Квинтэссенцию; постоянный не убывает. */
export async function changeParadox(actor, d) {
  const m = actor.system.mage, next = Math.clamp(m.paradox + d, m.paradoxPerm, WHEEL);
  if (next === m.paradox) return next;
  await actor.update({ "system.mage.paradox": next, "system.mage.quintessence": Math.min(m.quintessence, WHEEL - next) });
  return next;
}

/* ── Чародейство ──────────────────────────────────────────────────────── */

const KINDS = [["coincidental", "fa-leaf"], ["vulgar", "fa-bolt"], ["witnessed", "fa-eye"]];

/** Строка итога по числу успехов: урон и длительность (M20, базовая таблица). */
function effectLine(n) {
  const rows = M().effect ?? [], row = rows.find(r => r.n === n) ?? null;
  const damage = n >= 6 ? n * 2 : row?.damage ?? 0, duration = n >= 6 ? t("DurationST") : row?.duration ?? "";
  return t("EffectLine", { n, damage, duration });
}

/**
 * Окно чародейства: какие Сферы и на каком ранге, совпадение или вульгарно, Квинтэссенция, поправки, Воля.
 * @param {object} [preset]  { sphere, name, spheres: { key: rank } } — с листа (карточка Сферы, ротэ)
 */
export async function castEffect(actor, preset = {}) {
  if (!actor?.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: actor?.name ?? "" }));
  const m = actor.system.mage, pool = aretePool(actor), C = M().casting ?? { coincidental: 3, vulgar: 4, witnessed: 5, min: 3, max: 10, modCap: 3 };
  const mine = VTM20.mageSpheres.filter(k => (m.spheres[k] ?? 0) > 0);
  if (pool < 1) return ui.notifications.warn(t("NoArete"));
  if (!mine.length) return ui.notifications.warn(t("NoSpheres"));
  const start = preset.spheres ?? (preset.sphere && m.spheres[preset.sphere] ? { [preset.sphere]: m.spheres[preset.sphere] } : {});
  const quintMax = Math.min(3, avatarOf(actor), m.quintessence);
  let res = null, readNow = null;
  await foundry.applications.api.DialogV2.wait({
    window: { title: t("CastTitle"), icon: "fa-solid fa-hat-wizard" }, classes: ["vtm20", "r-dialog", "r-declare-dialog", "r-cast-dialog", "r-type-mage"], position: { width: 520 },
    content: `<div class="r-cel">
      <div class="r-cel-head"><span class="r-cel-kicker">${esc(t("CastKicker", { n: pool }))}</span><b class="r-cel-name">${esc(actor.name)}</b>
        <span class="r-cel-left">${esc(t("CastHint"))}</span></div>
      <input class="r-use-say" type="text" name="name" value="${esc(preset.name ?? "")}" placeholder="${esc(t("CastName"))}">
      <div class="r-cast-spheres">${mine.map(k => `<div class="r-decl-multi r-cast-sphere"><span><i class="fa-solid ${sphereOf(k)?.icon ?? "fa-circle"}"></i> ${esc(sphereName(actor, k))}</span>
        <span class="r-bw-step" data-min="0" data-max="${m.spheres[k]}"><button type="button" data-d="-1"><i class="fa-solid fa-minus"></i></button><b>${start[k] ?? 0}</b><button type="button" data-d="1"><i class="fa-solid fa-plus"></i></button><input type="hidden" name="s_${k}" value="${start[k] ?? 0}"></span>
        <em>${esc(t("RankOf", { n: m.spheres[k] }))}</em></div>`).join("")}</div>
      <div class="r-decl-kinds">${KINDS.map(([k, icon], i) => `<label class="r-decl-kind${i === 0 ? " is-active" : ""}"><input type="radio" name="kind" value="${k}"${i === 0 ? " checked" : ""}>
        <i class="fa-solid ${icon}"></i><span><b>${esc(t(`Kind.${k}`))}</b><em>${esc(t(`KindSub.${k}`, { n: C[k] }))}</em></span></label>`).join("")}</div>
      <div class="r-decl-multi"><span>${esc(t("Quint"))}</span>
        <span class="r-bw-step" data-min="0" data-max="${quintMax}"><button type="button" data-d="-1"><i class="fa-solid fa-minus"></i></button><b>0</b><button type="button" data-d="1"><i class="fa-solid fa-plus"></i></button><input type="hidden" name="quint" value="0"></span>
        <em>${esc(quintMax ? t("QuintHint", { n: m.quintessence, max: quintMax }) : t("QuintNone"))}</em></div>
      <div class="r-decl-multi" data-tooltip="${esc(t("ModTip"))}"><span>${esc(t("Mod"))}</span>
        <span class="r-bw-step" data-min="-3" data-max="3"><button type="button" data-d="-1"><i class="fa-solid fa-minus"></i></button><b>0</b><button type="button" data-d="1"><i class="fa-solid fa-plus"></i></button><input type="hidden" name="mod" value="0"></span>
        <em>${esc(t("ModHint"))}</em></div>
      <label class="r-check"><input type="checkbox" name="will"><span>${esc(t("CastWill"))}</span></label>
      <div class="r-cast-total"><span data-cast-line></span></div>
    </div>`,
    render: (ev, dlg) => {
      const el = dlg.element;
      const read = () => {
        const f = el.querySelector("form").elements;
        const ranks = Object.fromEntries(mine.map(k => [k, Number(f[`s_${k}`].value) || 0]).filter(([, v]) => v > 0));
        const high = Math.max(0, ...Object.values(ranks)), kind = el.querySelector('[name="kind"]:checked')?.value ?? "coincidental";
        const quint = Number(f.quint.value) || 0, mod = Math.clamp((Number(f.mod.value) || 0) - quint, -C.modCap, C.modCap);
        return { ranks, high, kind, quint, mod, difficulty: Math.clamp(high + C[kind] + mod, C.min, C.max), will: !!f.will.checked, name: f.name.value.trim() };
      };
      const sync = () => {
        for (const l of el.querySelectorAll(".r-decl-kind")) l.classList.toggle("is-active", l.querySelector("input").checked);
        const v = read();
        el.querySelector("[data-cast-line]").textContent = v.high ? t("CastLine", { pool, d: v.difficulty, n: v.high }) : t("CastPick");
      };
      el.addEventListener("change", sync);
      for (const b of el.querySelectorAll(".r-bw-step button")) b.addEventListener("click", () => {
        const s = b.closest(".r-bw-step"), inp = s.querySelector("input");
        inp.value = Math.clamp((Number(inp.value) || 0) + Number(b.dataset.d), Number(s.dataset.min), Number(s.dataset.max)); s.querySelector("b").textContent = inp.value;
        sync();
      });
      readNow = read;
      sync();
    },
    buttons: [{ action: "ok", icon: "fa-solid fa-hat-wizard", label: t("Cast"), default: true, callback: () => { res = readNow?.() ?? null; } }],
    rejectClose: false
  });
  if (!res) return null;
  if (!res.high) { ui.notifications.info(t("CastPick")); return null; }
  if (res.quint) await changeQuintessence(actor, -res.quint);
  const used = Object.entries(res.ranks).map(([k, v]) => `${sphereName(actor, k)} ${v}`).join(", ");
  const { rollPool } = await import("../dice/roll.mjs");
  const roll = await rollPool({ actor, title: res.name || t("CastTitle"), subtitle: `${used} · ${t(`Kind.${res.kind}`)}`, pool, difficulty: res.difficulty,
    willpower: res.will, kind: "check", breakdown: [{ label: t("Arete"), value: pool }],
    notes: [res.quint ? `<i class="fa-solid fa-sun"></i> ${esc(t("QuintSpent", { n: res.quint }))}` : ""].filter(Boolean),
    extra: { mage: { kind: res.kind, high: res.high } } });
  if (!roll) return null;
  // итог: успехи — по таблице; Парадокс — за вульгарность и за провал
  const botch = roll.outcome === "botch", n = roll.successes ?? 0, vulgar = res.kind !== "coincidental";
  const paradox = botch ? (res.kind === "coincidental" ? res.high : res.kind === "vulgar" ? 1 + res.high : 2 + 2 * res.high) : n > 0 && vulgar ? 1 : 0;
  const now = paradox ? await changeParadox(actor, paradox) : m.paradox;
  const lines = [botch ? t("ResBotch") : n > 0 ? effectLine(n) : t("ResFail"),
    paradox ? t("ParadoxGain", { n: paradox, now }) : "", now >= 5 && paradox ? t("BacklashDue") : ""].filter(Boolean);
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flags: { [SYSTEM_ID]: { mageCast: { actor: actor.uuid } } },
    content: `<div class="r-notice r-type-mage${botch ? " is-warn" : ""}"><i class="fa-solid fa-hat-wizard"></i> <b>${esc(res.name || t("CastTitle"))}</b> (${esc(used)}): ${lines.map(esc).join(" ")}
      ${now >= 5 && paradox ? `<div class="r-card-buttons"><button type="button" data-r-action="mageBacklash"><i class="fa-solid fa-burst"></i> ${esc(t("Backlash"))}</button></div>` : ""}</div>` });
  return roll;
}

/** Откат Парадокса (рассказчик): пул Парадокса, сл. 6; успех разряжает очко; итог — по таблице. */
export async function paradoxBacklash(actor) {
  if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("VTM20.Notify.GMOnly"));
  const m = actor.system.mage, pool = m.paradox;
  if (pool < 1) return ui.notifications.info(t("NoParadox"));
  const { rollPool } = await import("../dice/roll.mjs");
  const roll = await rollPool({ actor, title: t("Backlash"), subtitle: t("BacklashSub", { n: pool }), pool, difficulty: 6, kind: "check", breakdown: [{ label: t("Paradox"), value: pool }] });
  if (!roll) return null;
  const botch = roll.outcome === "botch", n = roll.successes ?? 0, free = m.paradox - m.paradoxPerm;
  // провал — весь непостоянный Парадокс уходит безвредно; успехи — столько очков разряжается
  const gone = botch ? free : Math.min(n, free);
  if (gone) await actor.update({ "system.mage.paradox": m.paradox - gone });
  const row = (M().backlash ?? []).find(r => n >= r.min && n <= r.max);
  // Ожог: 1–10 — лёгкие, 11–20 — тяжёлые, 21+ — губительные (уровень за 2 успеха); броня не спасает
  const burn = n >= 21 ? [Math.floor(n / 2), "aggravated"] : n >= 11 ? [n, "lethal"] : n >= 1 ? [n, "bashing"] : null;
  const text = botch ? t("BackBotch", { n: gone }) : n < 1 ? t("BackNone") : `${t("BackGone", { n: gone })} ${row?.text ?? ""}`;
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flags: burn && !botch ? { [SYSTEM_ID]: { mageBurn: { actor: actor.uuid, n: burn[0], type: burn[1] } } } : {},
    content: `<div class="r-notice r-type-mage is-warn"><i class="fa-solid fa-burst"></i> <b>${esc(t("Backlash"))}</b>: ${esc(text)}
      ${burn && !botch ? `<div class="r-card-buttons"><button type="button" data-r-action="mageBurn"><i class="fa-solid fa-fire"></i> ${esc(t("Burn", { n: burn[0], type: game.i18n.localize(VTM20.damageTypes[burn[1]]?.label ?? burn[1]) }))}</button></div>` : ""}</div>` });
}

/** Кнопки карточек чародейства: откат и Ожог. */
export async function mageCardAction(message, action) {
  if (action === "mageBacklash") {
    const a = await foundry.utils.fromUuid(message.getFlag(SYSTEM_ID, "mageCast")?.actor ?? "");
    return a ? paradoxBacklash(a) : null;
  }
  const b = message.getFlag(SYSTEM_ID, "mageBurn");
  if (!b || b.done) return null;
  const a = await foundry.utils.fromUuid(b.actor);
  if (!a?.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: a?.name ?? "" }));
  await a.applyDamage(b.n, b.type);
  if (message.isOwner) {
    await message.setFlag(SYSTEM_ID, "mageBurn", { ...b, done: true });
    await message.update({ content: String(message.content).replace(/<div class="r-card-buttons">[\s\S]*?<\/div>/, "") });
  }
  return true;
}

/* ── Ротэ и инструменты ───────────────────────────────────────────────── */

/** Ротэ — выученный эффект: название, Сферы («Силы 3, Первоначало 2»), заметка. */
export async function addRote(actor) {
  const res = await foundry.applications.api.DialogV2.prompt({ window: { title: t("RoteAdd"), icon: "fa-solid fa-scroll" }, classes: ["vtm20", "r-dialog", "r-type-mage"], rejectClose: false, position: { width: 460 },
    content: `<div class="r-form"><label class="r-field"><span>${esc(t("RoteName"))}</span><input type="text" name="name" autofocus></label>
      <label class="r-field"><span>${esc(t("RoteSpheres"))}</span><input type="text" name="spheres" placeholder="${esc(t("RoteSpheresHint"))}"></label>
      <label class="r-field"><span>${esc(t("RoteText"))}</span><textarea name="text" rows="3"></textarea></label></div>`,
    ok: { label: game.i18n.localize("VTM20.Common.Add"), callback: (e, b) => ({ name: b.form.elements.name.value.trim(), spheres: b.form.elements.spheres.value.trim(), text: b.form.elements.text.value.trim() }) } });
  if (!res?.name) return null;
  return actor.update({ "system.mage.rotes": [...actor.system.mage.rotes.map(r => ({ ...r })), res] });
}
export async function removeRote(actor, i) {
  const list = actor.system.mage.rotes.map(r => ({ ...r }));
  list.splice(i, 1);
  return actor.update({ "system.mage.rotes": list });
}
/** Сферы ротэ из строки: «Силы 3, Первоначало 2» → { forces: 3, prime: 2 } (ранг не выше своего). */
export function roteSpheres(actor, text) {
  const out = {}, m = actor.system.mage;
  for (const s of M().spheres ?? []) {
    const names = [s.name, s.en, s.tech?.name, s.tech?.en].filter(Boolean).map(x => x.toLowerCase());
    const hit = String(text ?? "").toLowerCase().split(/[,;+]/).map(x => x.trim()).find(x => names.some(nm => x.startsWith(nm)));
    if (hit) out[s.key] = Math.min(m.spheres[s.key] ?? 0, Number(hit.match(/\d+/)?.[0]) || 1);
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v > 0));
}
export const castRote = (actor, i) => { const r = actor.system.mage.rotes[i]; return r ? castEffect(actor, { name: r.name, spheres: roteSpheres(actor, r.spheres) }) : null; };

export async function addTool(actor, name) {
  name = String(name ?? "").trim();
  if (!name || actor.system.mage.instruments.includes(name)) return null;
  return actor.update({ "system.mage.instruments": [...actor.system.mage.instruments, name] });
}
export async function removeTool(actor, i) {
  const list = [...actor.system.mage.instruments];
  list.splice(i, 1);
  return actor.update({ "system.mage.instruments": list });
}

/** Цена опыта мага (M20): Сфера — новая 10, родовая × 7, прочая × 8; Арете × 8. */
export function mageXpCost(actor, kind, current, key = "") {
  const X = M().xp ?? {};
  if (kind === "mageArete") return current * (X.arete ?? 8);
  if (kind === "mageSphere") return current < 1 ? X.newSphere ?? 10 : current * (key === actor.system.mage?.affinity ? X.affinitySphere ?? 7 : X.sphere ?? 8);
  return 0;
}
