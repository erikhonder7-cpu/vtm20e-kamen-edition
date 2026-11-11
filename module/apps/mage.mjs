// module/apps/mage.mjs
// Маг: Восхождение (M20, справочник — data/mage.json, tools/mage_data.py).
//   · Арете — кубики магии; постоянная Воля ниже Арете ограничивает и кубики, и предел Сфер (M20, гл. 6);
//   · чародейство: сложность = высшая Сфера эффекта + 3 (совпадение), + 4 (вульгарно), + 5 (вульгарно при Спящих);
//     не ниже 3 и не выше 10, поправки вместе — от −3 до +3; Квинтэссенция −1 за очко (до −3, за ход — не больше Аватара);
//   · успехи — урон и длительность по таблице; успешная вульгарная магия — 1 Парадокс;
//     провал: совпадение — Парадокс по высшей Сфере, вульгарно — 1 + Сфера, при свидетелях — 2 + 2 × Сфера;
//   · колесо: Квинтэссенция и Парадокс вместе не больше 20, Парадокс вытесняет Квинтэссенцию;
//   · откат Парадокса — бросок пула Парадокса (сл. 6): каждый успех разряжает очко, итог — по таблице (рассказчик).

import { SYSTEM_ID, SYSTEM_PATH, VTM20 } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { registerEmblem, registerCardBlock } from "../ui/themes.mjs";

export const M = () => Codex.mage ?? {};
const t = (k, d) => d ? game.i18n.format(`VTM20.Mage.${k}`, d) : game.i18n.localize(`VTM20.Mage.${k}`);
const esc = x => foundry.utils.escapeHTML(String(x ?? ""));
const WHEEL = 20;

const sphereOf = key => (M().spheres ?? []).find(s => s.key === key) ?? null;
export const factionOf = actor => (M().factions ?? []).find(f => f.key === actor?.system?.mage?.faction) ?? null;
/** Технократ называет Сферы по-своему (Данные, Пространственная наука, Первичная Полезность). */
const isTech = actor => factionOf(actor)?.group === "technocracy";
/** Нефанд (Book of the Fallen): Сферы те же, но каждая стоит под своей Квлифой Квиппота; своя гамма листа. */
export const isFallen = actor => factionOf(actor)?.group === "nephandi";
/** Мародёр (M20, гл. 5): совпадение не даёт Парадокса даже при провале, у вульгарной магии нет «автоматического» очка. */
export const isMarauder = actor => factionOf(actor)?.group === "marauders";
export const sphereName = (actor, key) => { const s = sphereOf(key); return (isTech(actor) && s?.tech?.name) || s?.name || key; };

/** Термины Технократии: Арете — Просвещение, Квинтэссенция — Первичная энергия, чародейство — Процедура, Аватар — Гений… */
const TECH_KEYS = ["Arete", "Quintessence", "Cast", "CastTitle", "Rotes", "RoteAdd", "NoRotes", "CastSave", "Instruments", "Pool", "Spheres", "Focus", "Avatar"];
export const mt = (actor, key, data) => t(isTech(actor) && TECH_KEYS.includes(key) ? `Tech.${key}` : key, data);
/** Все подписи разом — для шаблонов листа ({{@root.mageInfo.L.Arete}}). */
const labelsOf = actor => Object.fromEntries(TECH_KEYS.map(k => [k, mt(actor, k)]));

/* ── Официальные знаки M20 (assets/mage): фракции, группы, Сферы — маски, цвет задаёт CSS (.r-mg) ── */
// путь от корня: относительный url() в CSS-переменной считался бы от файла стилей
export const mageGlyphSrc = name => foundry.utils.getRoute(`${SYSTEM_PATH}/assets/mage/${name}.png`);
const mageGlyph = (name, cls = "") => `<span class="r-sym r-mg${cls ? ` ${cls}` : ""}" style="--sym: url('${mageGlyphSrc(name)}')" aria-hidden="true"></span>`;
/** Течение внутри фракции: Дом Гермеса, фракция Традиции, Методология Конвенции (названия книг — механики у них нет). */
const subOf = actor => factionOf(actor)?.subs?.find(x => x.key === actor?.system?.mage?.sub) ?? null;
/** Как зовётся течение у этой фракции: Дом, Методология, течение. */
export const subLabel = f => t(f?.key === "order-of-hermes" ? "SubHouse" : f?.group === "technocracy" ? "SubMethod" : "Sub");
// у гермета знак Дома — вместо знака Ордена
// у сект Падших своих знаков нет — общий знак Нефанди
export const factionGlyph = (f, sub = null) => f?.key === "order-of-hermes" && sub ? `house-${sub.key}` : f?.group === "nephandi" ? "group-nephandi" : f?.group === "marauders" ? "group-marauders" : f ? `faction-${f.key}` : "sphere-prime";
/** Знаки листа: на корешке и водяным знаком — фракция; на печати под портретом — родовая Сфера. */
export function mageSigil(actor) {
  const f = factionOf(actor), sb = subOf(actor), aff = actor.system.mage?.affinity;
  return { sym: { src: mageGlyphSrc(factionGlyph(f, sb)) }, label: [f?.name, sb?.name].filter(Boolean).join(" · "),
    seal: { sym: { src: mageGlyphSrc(aff ? `sphere-${aff}` : factionGlyph(f, sb)) }, label: aff ? sphereName(actor, aff) : f?.name ?? game.i18n.localize("TYPES.Actor.mage") } };
}

/** Кубики магии и предел Сфер: Арете, но не выше постоянной Воли. */
export const aretePool = actor => Math.min(actor.system.mage?.arete ?? 0, actor.system.willpower?.permanent ?? 0);
/** Рейтинг Аватара (Гения) — Факт биографии: сколько Квинтэссенции можно потратить или вобрать за ход. */
function avatarOf(actor) {
  const bg = actor.items.find(i => i.type === "background" && /^(Аватар|Avatar|Гений|Genius)/i.test(i.name));
  return bg?.system?.value ?? 0;
}

/** Постоянный Парадокс: свой и от Чудес, которые нельзя выключить, — пока они при владельце (M20, гл. 9). */
export const permOf = actor => Math.min(WHEEL, (actor.system.mage?.paradoxPerm ?? 0) + actor.items.reduce((n, i) => n + (i.type === "wonder" ? i.system.paradoxPerm ?? 0 : 0), 0));
/** Парадокс на колесе: накопленный, но не меньше постоянного. */
export const paradoxOf = actor => Math.max(actor.system.mage?.paradox ?? 0, permOf(actor));

/** Колесо: Квинтэссенция слева, Парадокс справа (постоянный — у самого края). */
function wheelOf(m, paradox = m.paradox, permAll = m.paradoxPerm) {
  const q = Math.min(m.quintessence, WHEEL - paradox), p = Math.min(paradox, WHEEL), perm = Math.min(permAll, p);
  return Array.from({ length: WHEEL }, (_, i) => ({ n: i + 1, quint: i < q, paradox: i >= WHEEL - p, perm: i >= WHEEL - perm }));
}

/** Данные листа: шапка (фракция, Сущность, родовая Сфера) и карточка Арете с колесом. */
export function mageInfo(actor, dots) {
  const m = actor.system.mage, D = M(), f = factionOf(actor), pool = aretePool(actor);
  const groups = (D.groups ?? []).map(g => ({ name: g.name, list: (D.factions ?? []).filter(x => x.group === g.key).map(x => ({ key: x.key, name: x.name, selected: x.key === m.faction })) }));
  const allowed = f?.affinity?.length ? f.affinity : VTM20.mageSpheres;
  return {
    L: labelsOf(actor), tech: isTech(actor), fallen: isFallen(actor), groups, faction: f,
    subs: (f?.subs ?? []).map(x => ({ key: x.key, name: x.name, selected: x.key === m.sub })), subLabel: subLabel(f),
    subTip: (x => x ? [x.en, x.note].filter(Boolean).join(" · ") : "")(subOf(actor)), factionTip: f ? [f.en, f.affinityText && `${t("Affinity")}: ${f.affinityText}`, f.practices].filter(Boolean).join(" · ") : "",
    essences: (D.essences ?? []).map(e => ({ key: e.key, name: e.name, tip: e.text, selected: e.key === m.essence })),
    essence: (D.essences ?? []).find(e => e.key === m.essence) ?? null,
    affinities: VTM20.mageSpheres.map(k => ({ key: k, name: sphereName(actor, k), selected: k === m.affinity, off: !allowed.includes(k) })),
    arete: m.arete, areteName: D.arete?.[m.arete] ?? "", areteDots: dots(m.arete, 10, { path: "system.mage.arete" }),
    pool, capped: pool < m.arete, avatar: avatarOf(actor),
    quintessence: Math.min(m.quintessence, WHEEL - paradoxOf(actor)), paradox: paradoxOf(actor), paradoxPerm: permOf(actor), wheel: wheelOf(m, paradoxOf(actor), permOf(actor)),
    backlash: paradoxOf(actor) >= 5, isGM: game.user.isGM, seeking: m.seeking
  };
}

/** Вкладка Сфер: девять карточек с рангами, фокус и ротэ. */
export function spheresView(actor, dots) {
  const m = actor.system.mage, cap = aretePool(actor), D = M(), tech = isTech(actor), fallen = isFallen(actor);
  // парадигмы, практики и «злые инструменты» Падших — только Нефанду, и первыми
  const own = list => [...list.filter(x => x.nephandi && fallen), ...list.filter(x => !x.nephandi)];
  const spheres = (D.spheres ?? []).map(s => {
    const v = m.spheres?.[s.key] ?? 0, alt = tech && s.tech ? s.tech : null;
    return { key: s.key, name: alt?.name ?? s.name, en: alt?.en ?? s.en, icon: s.icon, sym: { src: mageGlyphSrc(`sphere-${s.key}`) }, value: v, over: v > cap, affinity: s.key === m.affinity,
      altTip: !alt && s.tech ? t("TechName", { name: s.tech.name }) : alt ? t("MysticName", { name: s.name }) : "",
      qliph: fallen && s.qliph ? s.qliph : null,
      specialties: s.specialties, dots: dots(v, 5, { path: `system.mage.spheres.${s.key}` }),
      // на листе — свои ранги и следующий (к чему расти); полный список — в компендии
      ranks: (alt?.ranks ?? s.ranks).map((text, i) => ({ n: i + 1, name: D.ranks?.[i] ?? "", text, owned: i < v })).filter(r => r.n <= v + 1) };
  });
  const F = D.focus ?? {};
  return { L: labelsOf(actor), tech, fallen, inUmbra: !!actor.getFlag(SYSTEM_ID, "umbra"), spheres, cap, arete: m.arete, capped: cap < m.arete, total: spheres.reduce((s, x) => s + x.value, 0),
    paradigms: own(F.paradigms ?? []).map(p => p.name), practices: own(F.practices ?? []).map(p => p.name),
    practiceTip: (F.practices ?? []).find(p => p.name === m.practice)?.instruments ?? "",
    tools: m.instruments.map((name, i) => ({ i, name })), toolList: [...(fallen ? D.fallenTools ?? [] : []), ...(F.instruments ?? [])].filter(x => !m.instruments.includes(x)),
    toolsNeed: Math.max(0, (D.creation?.instruments ?? 7) - Math.max(0, m.arete - 2) - m.instruments.length),
    rotes: m.rotes.map((r, i) => roteView(actor, r, i)) };
}

/* ── Колесо ───────────────────────────────────────────────────────────── */

/** Квинтэссенция: не больше свободного места на колесе. */
export async function changeQuintessence(actor, d) {
  const m = actor.system.mage, next = Math.clamp(m.quintessence + d, 0, WHEEL - paradoxOf(actor));
  if (next !== m.quintessence) await actor.update({ "system.mage.quintessence": next });
  return next;
}
/** Парадокс: вытесняет Квинтэссенцию; постоянный не убывает. */
export async function changeParadox(actor, d) {
  const m = actor.system.mage, next = Math.clamp(paradoxOf(actor) + d, permOf(actor), WHEEL);
  if (next === m.paradox) return next;
  await actor.update({ "system.mage.paradox": next, "system.mage.quintessence": Math.min(m.quintessence, WHEEL - next) });
  return next;
}

/* ── Чародейство ──────────────────────────────────────────────────────── */

const KINDS = [["coincidental", "fa-leaf"], ["vulgar", "fa-bolt"], ["witnessed", "fa-eye"]];
/** Частые поправки сложности (M20, гл. 10): щелчок включает, сумма — в общий счёт (все вместе — от −3 до +3). */
const MODS = [["tool", -1], ["resonance", -1], ["prep", -1], ["node", -1], ["fast", 1], ["far", 1], ["distracted", 1], ["noTools", 3]];

/** Строка итога по числу успехов: урон и длительность (M20, базовая таблица). */
function effectLine(n) {
  const rows = M().effect ?? [], row = rows.find(r => r.n === n) ?? null;
  const damage = n >= 6 ? n * 2 : row?.damage ?? 0, duration = n >= 6 ? t("DurationST") : row?.duration ?? "";
  return t("EffectLine", { n, damage, duration });
}
/** Парадокс за чародейство: при провале с единицами — по высшей Сфере и вульгарности; успешная вульгарная магия — 1. */
// Мародёр: совпадение — без Парадокса, у вульгарной магии остаётся только часть «по Сфере» (без прибавки 1 или 2)
const botchParadox = (kind, high, mar = false) => kind === "coincidental" ? (mar ? 0 : high) : kind === "vulgar" ? (mar ? 0 : 1) + high : (mar ? 0 : 2) + 2 * high;
/** Кубики Резонанса к Арете — раз за историю, по старшей подписи (Book of Secrets): 1–3 точки — 1 кубик, 4–5 — 2. */
export const RES_DICE = [0, 1, 1, 1, 2, 2];
export const topResonance = actor => (actor.system.mage?.resonances ?? []).reduce((a, r) => (r.value ?? 0) > (a?.value ?? 0) ? r : a, null);

/**
 * Окно чародейства: Сферы эффекта плитками (ранг — точками), совпадение или вульгарно, Квинтэссенция и поправки,
 * внизу — счёт сложности по слагаемым, шансы и чем грозит Парадокс.
 * @param {object} [preset]  { sphere, name, spheres: { key: rank }, kind, fast } — с листа (карточка Сферы, ротэ);
 *                           fast — без окна: Сферы и вид магии берутся из ротэ как есть
 */
export async function castEffect(actor, preset = {}) {
  if (!actor?.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: actor?.name ?? "" }));
  const m = actor.system.mage, C = M().casting ?? { coincidental: 3, vulgar: 4, witnessed: 5, min: 3, max: 10, modCap: 3 };
  // Чудо (Талисман, Устройство): пул — его Арете, Сферы — вложенные в него (не указаны — ранг эффекта выбирают вручную)
  const W = preset.wonder ?? null, ws = W ? parseSpheres(W.system.spheres) : null, wAny = W && !Object.keys(ws).length;
  const pool = W ? W.system.arete : aretePool(actor);
  const own = k => W ? (wAny ? 5 : ws[k] ?? 0) : m.spheres[k] ?? 0;
  const mine = VTM20.mageSpheres.filter(k => own(k) > 0);
  if (pool < 1) return ui.notifications.warn(t("NoArete"));
  if (!mine.length) return ui.notifications.warn(t("NoSpheres"));
  const { odds, chancesView, rollPool } = await import("../dice/roll.mjs");
  // ранг в эффекте — не выше своей Сферы и предела (Арете и Воля); у Чуда — как вложено
  const maxOf = k => W ? own(k) : Math.min(own(k), pool);
  const start = preset.spheres ?? (W && !wAny ? ws : preset.sphere && own(preset.sphere) ? { [preset.sphere]: maxOf(preset.sphere) } : {});
  const st = { ranks: Object.fromEntries(mine.map(k => [k, Math.min(start[k] ?? 0, maxOf(k))])), kind: C[preset.kind] ? preset.kind : "coincidental", quint: 0, mod: 0, mods: new Set(), will: false, res: false, save: false };
  const quintHave = W ? W.system.quintessence : m.quintessence;
  const quintMax = Math.min(3, W ? quintHave : Math.min(avatarOf(actor), quintHave)), f = factionOf(actor), mar = isMarauder(actor);
  const top = W ? null : topResonance(actor), resDice = top && !m.resUsed ? RES_DICE[Math.clamp(top.value, 0, 5)] : 0;
  const calc = () => {
    const ranks = Object.fromEntries(Object.entries(st.ranks).filter(([, v]) => v > 0)), high = Math.max(0, ...Object.values(ranks));
    const quick = [...st.mods].reduce((n, k) => n + (MODS.find(x => x[0] === k)?.[1] ?? 0), 0);
    const raw = st.mod + quick - st.quint, mod = Math.clamp(raw, -C.modCap, C.modCap);
    return { ranks, high, kind: st.kind, quint: st.quint, raw, mod, capped: raw !== mod, base: high + C[st.kind], difficulty: Math.clamp(high + C[st.kind] + mod, C.min, C.max), will: st.will,
      dice: pool + (st.res ? resDice : 0), res: st.res, save: st.save };
  };
  const pips = (k, own, max, cur) => Array.from({ length: own }, (_, i) =>
    `<a class="r-dot${i < cur ? " is-filled" : ""}${i >= max ? " is-locked" : ""}" data-rank="${k}" data-n="${i + 1}"></a>`).join("");
  let res = null, nameNow = () => "";
  if (preset.fast && calc().high) res = { ...calc(), name: preset.name ?? "" };
  else await foundry.applications.api.DialogV2.wait({
    window: { title: `${mt(actor, "CastTitle")}: ${actor.name}`, icon: "fa-solid fa-hat-wizard" }, classes: ["vtm20", "r-dialog", "r-cast-dialog", "r-type-mage", ...(isTech(actor) ? ["r-mage-tech"] : []), ...(isFallen(actor) ? ["r-mage-fallen"] : [])], position: { width: 600 },
    content: `<div class="r-cast">
      <header class="r-cast-head"><span class="r-cast-sigil">${mageGlyph(factionGlyph(f, subOf(actor)))}</span>
        <span class="r-cast-who"><small>${esc(W ? `${t("Wonder")} · ${actor.name}` : f?.name ?? mt(actor, "CastTitle"))}</small><b>${esc(W ? W.name : actor.name)}</b></span>
        <span class="r-cast-pool" data-tooltip="${esc(t(W ? "WonderPool" : pool < m.arete ? "CappedHint" : "CapHint"))}"><b>${pool}</b><small>${esc(mt(actor, "Pool"))}</small></span></header>
      <input class="r-cast-name" type="text" name="name" value="${esc(preset.name ?? "")}" placeholder="${esc(t("CastName"))}">

      <h4 class="r-banner r-cast-cap"><span>${esc(mt(actor, "Spheres"))}</span><em>${esc(t("CastHint"))}</em></h4>
      <div class="r-cast-spheres">${mine.map(k => `<div class="r-cast-sphere${st.ranks[k] ? " is-on" : ""}" data-sphere="${k}" data-tooltip="${esc(t("SphereTip", { n: own(k) }))}">
          <span class="r-cast-sym">${mageGlyph(`sphere-${k}`)}</span><b>${esc(sphereName(actor, k))}</b>
          <span class="r-dots">${pips(k, own(k), maxOf(k), st.ranks[k])}</span></div>`).join("")}</div>

      <h4 class="r-banner r-cast-cap"><span>${esc(t("KindCap"))}</span></h4>
      <div class="r-cast-kinds">${KINDS.map(([k, icon]) => `<a class="r-cast-kind${k === st.kind ? " is-on" : ""}" data-kind="${k}">
          <i class="fa-solid ${icon}"></i><b>${esc(t(`Kind.${k}`))}</b><span class="r-cast-kn">+${C[k]}</span><em>${esc(t(`KindRisk.${k}`))}</em></a>`).join("")}</div>

      <h4 class="r-banner r-cast-cap" data-tooltip="${esc(t("ModTip"))}"><span>${esc(t("ModCap"))}</span><em>${esc(t("ModHint"))}</em></h4>
      <div class="r-cast-row"><span class="r-cast-lbl"><i class="fa-solid fa-sun"></i> ${esc(mt(actor, "Quintessence"))}</span>
        <span class="r-boxes r-cast-quint">${quintMax ? Array.from({ length: quintMax }, (_, i) => `<a class="r-box" data-quint="${i + 1}"></a>`).join("") : ""}</span>
        <em>${esc(quintMax ? t("QuintHint", { n: quintHave, max: quintMax }) : t("QuintNone"))}</em></div>
      <div class="r-cast-mods">${MODS.map(([k, n]) => `<a class="r-cast-mod${n > 0 ? " is-bad" : ""}" data-mod="${k}"><b>${n > 0 ? "+" : "−"}${Math.abs(n)}</b> ${esc(t(`ModQuick.${k}`))}</a>`).join("")}
        <span class="r-cast-step" data-tooltip="${esc(t("ModTip"))}"><a data-step="-1">−</a><b data-mod-own>0</b><a data-step="1">+</a><small>${esc(t("ModOwn"))}</small></span></div>
      <label class="r-check r-cast-will"><input type="checkbox" name="will"><span>${esc(t("CastWill"))}</span></label>
      ${resDice ? `<label class="r-check r-cast-will" data-tooltip="${esc(t("CastResTip"))}"><input type="checkbox" name="res"><span>${esc(t("CastRes", { name: top.name, n: resDice }))}</span></label>` : ""}
      ${W ? "" : `<label class="r-check r-cast-will" data-tooltip="${esc(t("CastSaveTip"))}"><input type="checkbox" name="save"><span>${esc(mt(actor, "CastSave"))}</span></label>`}

      <div class="r-cast-total">
        <div class="r-cast-sum" data-sum></div>
        <div class="r-cast-big"><span><b data-pool>${pool}</b><small>${esc(t("DiceShort"))}</small></span><i>${esc(game.i18n.localize("VTM20.Roll.Vs"))}</i><span><b data-diff>—</b><small>${esc(t("DiffShort"))}</small></span></div>
        <div class="r-odds" data-odds hidden><div class="r-odds-bar"><i class="is-success"></i><i class="is-failure"></i><i class="is-botch"></i></div>
          <div class="r-odds-legend"><span class="is-success">${esc(t("Odds.success"))} <b data-o="success"></b></span><span class="is-failure">${esc(t("Odds.failure"))} <b data-o="failure"></b></span><span class="is-botch">${esc(t("Odds.botch"))} <b data-o="botch"></b></span></div></div>
        <p class="r-cast-risk" data-risk></p>
      </div>
    </div>`,
    render: (ev, dlg) => {
      const el = dlg.element, q = s => el.querySelector(s), ok = el.querySelector('button[data-action="ok"]');
      nameNow = () => q('[name="name"]').value.trim();
      const sync = () => {
        const v = calc();
        for (const box of el.querySelectorAll(".r-cast-sphere")) {
          const k = box.dataset.sphere, cur = st.ranks[k];
          box.classList.toggle("is-on", cur > 0);
          box.querySelectorAll(".r-dot").forEach((d, i) => d.classList.toggle("is-filled", i < cur));
        }
        for (const a of el.querySelectorAll(".r-cast-kind")) a.classList.toggle("is-on", a.dataset.kind === st.kind);
        el.querySelectorAll("[data-quint]").forEach((b, i) => b.classList.toggle("is-filled", i < st.quint));
        for (const a of el.querySelectorAll("[data-mod]")) a.classList.toggle("is-on", st.mods.has(a.dataset.mod));
        q("[data-mod-own]").textContent = `${st.mod > 0 ? "+" : st.mod < 0 ? "−" : ""}${Math.abs(st.mod)}`;
        // счёт сложности по слагаемым: высшая Сфера + вид магии ± поправки
        const part = (n, label, cls = "") => `<span class="${cls}"><b>${n}</b> ${esc(label)}</span>`;
        q("[data-sum]").innerHTML = v.high ? [part(v.high, t("SumHigh")), part(`+${C[v.kind]}`, t(`Kind.${v.kind}`)),
          v.raw ? part(`${v.mod > 0 ? "+" : "−"}${Math.abs(v.mod)}`, t(v.capped ? "SumModCapped" : "SumMod"), v.mod > 0 ? "is-bad" : "is-good") : ""].join("") : `<em>${esc(t("CastPick"))}</em>`;
        q("[data-diff]").textContent = v.high ? v.difficulty : "—";
        q("[data-pool]").textContent = v.dice;
        const o = v.high ? chancesView(odds({ pool: v.dice, difficulty: v.difficulty, willpower: v.will })) : null;
        q("[data-odds]").hidden = !o;
        if (o) { for (const k of ["success", "failure", "botch"]) { q(`.r-odds-bar .is-${k}`).style.width = `${o[k]}%`; q(`[data-o="${k}"]`).textContent = `${o[k]}%`; } }
        q("[data-risk]").innerHTML = v.high ? `<i class="fa-solid fa-burst"></i> ${esc(t(v.kind === "coincidental" ? "RiskCoinc" : "RiskVulgar", { n: botchParadox(v.kind, v.high, mar), now: m.paradox }))}` : "";
        if (ok) ok.disabled = !v.high;
      };
      el.addEventListener("click", e => {
        const d = e.target.closest("[data-rank]"), box = e.target.closest(".r-cast-sphere");
        if (d && !d.classList.contains("is-locked")) { const k = d.dataset.rank, n = Number(d.dataset.n); st.ranks[k] = st.ranks[k] === n ? n - 1 : n; return sync(); }
        // щелчок по плитке мимо точек: включить на полном ранге или выключить
        if (box && !d) { const k = box.dataset.sphere; st.ranks[k] = st.ranks[k] ? 0 : maxOf(k); return sync(); }
        const kd = e.target.closest("[data-kind]"); if (kd) { st.kind = kd.dataset.kind; return sync(); }
        const qb = e.target.closest("[data-quint]"); if (qb) { const n = Number(qb.dataset.quint); st.quint = st.quint === n ? n - 1 : n; return sync(); }
        const md = e.target.closest("[data-mod]"); if (md) { st.mods.has(md.dataset.mod) ? st.mods.delete(md.dataset.mod) : st.mods.add(md.dataset.mod); return sync(); }
        const sp = e.target.closest("[data-step]"); if (sp) { st.mod = Math.clamp(st.mod + Number(sp.dataset.step), -3, 3); return sync(); }
      });
      q('[name="will"]').addEventListener("change", e => { st.will = e.target.checked; sync(); });
      q('[name="res"]')?.addEventListener("change", e => { st.res = e.target.checked; sync(); });
      q('[name="save"]')?.addEventListener("change", e => { st.save = e.target.checked; });
      sync();
    },
    buttons: [{ action: "ok", icon: "fa-solid fa-hat-wizard", label: mt(actor, "Cast"), default: true, callback: () => { res = { ...calc(), name: nameNow() }; } }],
    rejectClose: false
  });
  if (!res) return null;
  if (!res.high) { ui.notifications.info(t("CastPick")); return null; }
  if (res.quint) await (W ? W.update({ "system.quintessence": Math.max(0, quintHave - res.quint) }) : changeQuintessence(actor, -res.quint));
  const used = Object.entries(res.ranks).map(([k, v]) => `${sphereName(actor, k)} ${v}`).join(", ");
  // «запомнить как ротэ»: название, Сферы и вид магии — в список ротэ (если такого названия ещё нет)
  if (res.save && res.name && !m.rotes.some(r => r.name === res.name))
    await actor.update({ "system.mage.rotes": [...m.rotes.map(r => ({ ...r })), { name: res.name, spheres: used, text: "", kind: res.kind }] });
  const breakdown = [{ label: W ? `${mt(actor, "Arete")} · ${W.name}` : mt(actor, "Arete"), value: pool }];
  if (res.res) { breakdown.push({ label: `${t("Resonance")}: ${top.name}`, value: resDice }); await actor.update({ "system.mage.resUsed": true }); }
  const roll = await rollPool({ actor, title: res.name || mt(actor, "CastTitle"), subtitle: t("CastSub", { n: res.high }), pool: res.dice, difficulty: res.difficulty,
    willpower: res.will, kind: "check", breakdown,
    extra: { mage: { kind: res.kind, high: res.high, ranks: res.ranks, quint: res.quint, used, mar } } });
  if (!roll) return null;
  if (!W) import("./calendar.mjs").then(c => actor.setFlag(SYSTEM_ID, "castWeek", Math.floor((c.nightNumber() - 1) / 7))).catch(() => {});   // неделя, когда колдовал (mage-state.mjs, mageWeekTick)
  // Парадокс — за вульгарность и за провал; итог и кнопка отката — в самой карточке броска (блок «mage»)
  const paradox = castParadox(res.kind, res.high, roll, mar);
  if (paradox) {
    const now = await changeParadox(actor, paradox);
    await refreshCard(roll.message, "mage", { now });
  }
  return roll;
}

/** Сколько Парадокса приносит бросок чародейства: провал с единицами — по Сфере и вульгарности, успешная вульгарная магия — 1. */
const castParadox = (kind, high, ev, mar = false) => ev.outcome === "botch" ? botchParadox(kind, high, mar) : (ev.successes ?? 0) > 0 && kind !== "coincidental" && !mar ? 1 : 0;

/** Дописать данные в блок карточки броска и перерисовать её (после того, как Парадокс или Ожог уже применены). */
async function refreshCard(message, key, patch) {
  const state = foundry.utils.deepClone(message?.getFlag(SYSTEM_ID, "roll"));
  if (!state?.extra?.[key] || !message.isOwner) return;
  Object.assign(state.extra[key], patch);
  const { renderCard } = await import("../dice/roll.mjs");
  await message.update({ content: await renderCard(state), [`flags.${SYSTEM_ID}.roll`]: state });
}

/** Блок карточки чародейства: Сферы со знаками, вид магии, итог по таблице успехов, Парадокс и кнопка отката. */
registerCardBlock("mage", (state, ev, actor) => {
  const x = state.extra.mage, n = ev.successes ?? 0, botch = ev.outcome === "botch", gain = castParadox(x.kind, x.high, ev, x.mar);
  return {
    spheres: Object.entries(x.ranks ?? {}).map(([k, rank]) => ({ name: actor ? sphereName(actor, k) : sphereOf(k)?.name ?? k, rank, sym: { src: mageGlyphSrc(`sphere-${k}`) } })),
    kind: x.kind, kindLabel: t(`Kind.${x.kind}`), kindIcon: KINDS.find(k => k[0] === x.kind)?.[1] ?? "fa-leaf", quint: x.quint ?? 0,
    text: botch ? t("ResBotch") : n > 0 ? effectLine(n) : t("ResFail"),
    paradox: gain, paradoxText: gain ? (x.now != null ? t("ParadoxGain", { n: gain, now: x.now }) : t("ParadoxGainShort", { n: gain })) : "",
    backlash: gain > 0 && (x.now ?? 0) >= 5, backlashLabel: t("Backlash")
  };
});
/** Блок карточки отката: сколько разряжено, что случилось по таблице, сколько осталось и кнопка Ожога. */
registerCardBlock("backlash", (state, ev) => {
  const x = state.extra.backlash, n = ev.successes ?? 0, botch = ev.outcome === "botch";
  const gone = botch ? x.free : Math.min(n, x.free), row = (M().backlash ?? []).find(r => n >= r.min && n <= r.max);
  const burn = botch ? null : burnOf(n);
  const grade = botch ? null : (M().pflaws ?? []).find(g => n >= g.min && n <= g.max), quiet = n >= 11 ? (M().quiet?.levels ?? []).find(l => n >= l.min && n <= l.max)?.n ?? 0 : 0;
  const perm = n >= 21 ? 2 : n >= 16 ? 1 : 0;
  return { spirit: n >= 11 && !x.spirited ? t("BackSpirit") : "", realm: n >= 16 && !x.realmed ? t("BackRealm") : "",
    flaw: grade && !x.flawed ? t("BackFlaw", { grade: grade.name }) : "", quiet: quiet && !x.quieted ? t("BackQuiet", { n: quiet }) : "", perm: perm && !x.permed ? t("BackPerm", { n: perm }) : "",
    insulate: x.insulate ? t("BackInsulate", { n: x.insulate }) : "",
    text: botch ? t("BackBotch", { n: gone }) : n < 1 ? t("BackNone") : `${t("BackGone", { n: gone })} ${row?.text ?? ""}`,
    left: x.left != null ? t("ParadoxLeft", { n: x.left }) : "",
    burn: burn && !x.burned ? t("Burn", { n: burn[0], type: game.i18n.localize(VTM20.damageTypes[burn[1]]?.label ?? burn[1]) }) : "" };
});
/** Ожог: 1–10 успехов — лёгкие, 11–20 — тяжёлые, 21+ — губительные (уровень за 2 успеха); броня не спасает. */
const burnOf = n => n >= 21 ? [Math.floor(n / 2), "aggravated"] : n >= 11 ? [n, "lethal"] : n >= 1 ? [n, "bashing"] : null;

/** Откат Парадокса (рассказчик): пул Парадокса, сл. 6; успех разряжает очко; итог — по таблице, в карточке броска. */
export async function paradoxBacklash(actor) {
  if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("VTM20.Notify.GMOnly"));
  const m = actor.system.mage, pool = paradoxOf(actor);
  if (pool < 1) return ui.notifications.info(t("NoParadox"));
  const { rollPool } = await import("../dice/roll.mjs");
  const free = pool - permOf(actor);
  const roll = await rollPool({ actor, title: t("Backlash"), subtitle: t("BacklashSub", { n: pool }), pool, difficulty: 6, kind: "check",
    breakdown: [{ label: t("Paradox"), value: pool }], extra: { backlash: { free, insulate: isMarauder(actor) ? m.quiet.level * (M().quiet?.insulate ?? 5) : 0 } } });
  if (!roll) return null;
  // провал — весь непостоянный Парадокс уходит безвредно; успехи — столько очков разряжается
  const gone = roll.outcome === "botch" ? free : Math.min(roll.successes ?? 0, free);
  if (gone) await actor.update({ "system.mage.paradox": pool - gone });
  await refreshCard(roll.message, "backlash", { left: pool - gone });
  return roll;
}

/** Кнопки карточек чародейства: откат и Ожог. */
export async function mageCardAction(message, action) {
  const state = message.getFlag(SYSTEM_ID, "roll");
  const a = await foundry.utils.fromUuid(state?.actorUuid ?? message.getFlag(SYSTEM_ID, "mageCast")?.actor ?? "");
  if (!a) return null;
  if (action === "mageBacklash") return paradoxBacklash(a);
  const x = state?.extra?.backlash;
  if (!x) return null;
  const { evaluate: ev0 } = await import("../dice/roll.mjs");
  const n = ev0(state.values, state).successes ?? 0;
  // последствия отката записывает рассказчик: Изъян по степени, Безмолвие по уровню, постоянный Парадокс
  if (["mageFlaw", "mageQuiet", "magePerm", "mageSpirit", "mageRealm"].includes(action)) {
    if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("VTM20.Notify.GMOnly"));
    const S = await import("./mage-state.mjs"), m = a.system.mage;
    if (action === "mageSpirit" && !x.spirited) { if (!(await S.paradoxSpirit(a))) return null; return refreshCard(message, "backlash", { spirited: true }); }
    if (action === "mageRealm" && !x.realmed) { if (!(await S.paradoxRealm(a))) return null; return refreshCard(message, "backlash", { realmed: true }); }
    if (action === "mageFlaw" && !x.flawed) { if (!(await S.addFlaw(a, { grade: S.flawGradeFor(n)?.key }))) return null; return refreshCard(message, "backlash", { flawed: true }); }
    if (action === "mageQuiet" && !x.quieted) { await a.update({ "system.mage.quiet.level": Math.max(m.quiet.level, S.quietLevelFor(n)) }); return refreshCard(message, "backlash", { quieted: true }); }
    if (action === "magePerm" && !x.permed) { const k = n >= 21 ? 2 : 1, perm = Math.min(WHEEL, m.paradoxPerm + k);
      await a.update({ "system.mage.paradoxPerm": perm, "system.mage.paradox": Math.max(m.paradox, perm), "system.mage.quintessence": Math.min(m.quintessence, WHEEL - Math.max(m.paradox, perm)) });
      return refreshCard(message, "backlash", { permed: true }); }
    return null;
  }
  if (x.burned) return null;
  if (!a.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: a.name }));
  const { evaluate } = await import("../dice/roll.mjs");
  const burn = burnOf(evaluate(state.values, state).successes ?? 0);
  if (!burn) return null;
  await a.applyDamage(burn[0], burn[1]);
  await refreshCard(message, "backlash", { burned: true });
  return true;
}

/* ── Ротэ и инструменты ───────────────────────────────────────────────── */

/** Ротэ — выученный эффект: название, Сферы («Силы 3, Первоначало 2»), вид магии, заметка. i — править запись, без i — новая. */
export async function addRote(actor, i = null) {
  const old = i != null ? actor.system.mage.rotes[i] : null;
  const res = await foundry.applications.api.DialogV2.prompt({ window: { title: mt(actor, "RoteAdd"), icon: "fa-solid fa-scroll" }, classes: ["vtm20", "r-dialog", "r-type-mage"], rejectClose: false, position: { width: 460 },
    // ротэ из книг (data/mage.json → rotes): выбор в списке заполняет поля; ротэ Падших — только Нефанду
    render: (ev, dlg) => {
      const f = dlg.element.querySelector("form"), pick = f?.elements.book;
      pick?.addEventListener("change", () => {
        const r = (M().rotes ?? []).find(x => x.name === pick.value);
        if (!r) return;
        f.elements.name.value = r.name; f.elements.spheres.value = r.spheres; f.elements.text.value = `${r.text}${r.source ? ` (${r.source})` : ""}`;
      });
    },
    content: `<div class="r-form">${old ? "" : `<label class="r-field"><span>${esc(t("RoteBook"))}</span><input type="text" name="book" list="r-rote-book" placeholder="${esc(t("RoteBookHint", { n: (M().rotes ?? []).length }))}"></label>
      <datalist id="r-rote-book">${(M().rotes ?? []).filter(r => !r.nephandi || isFallen(actor)).map(r => `<option value="${esc(r.name)}">${esc(r.spheres)}</option>`).join("")}</datalist>`}
      <label class="r-field"><span>${esc(t("RoteName"))}</span><input type="text" name="name" value="${esc(old?.name ?? "")}" autofocus></label>
      <label class="r-field"><span>${esc(t("RoteSpheres"))}</span><input type="text" name="spheres" value="${esc(old?.spheres ?? "")}" placeholder="${esc(t("RoteSpheresHint"))}"></label>
      <label class="r-field"><span>${esc(t("KindCap"))}</span><select name="kind">${KINDS.map(([k]) => `<option value="${k}"${(old?.kind || "coincidental") === k ? " selected" : ""}>${esc(t(`Kind.${k}`))}</option>`).join("")}</select></label>
      <label class="r-field"><span>${esc(t("RoteText"))}</span><textarea name="text" rows="3">${esc(old?.text ?? "")}</textarea></label></div>`,
    ok: { label: game.i18n.localize(old ? "VTM20.Common.Save" : "VTM20.Common.Add"), callback: (e, b) => Object.fromEntries(["name", "spheres", "kind", "text"].map(k => [k, b.form.elements[k].value.trim()])) } });
  if (!res?.name) return null;
  const list = actor.system.mage.rotes.map(r => ({ ...r }));
  if (old) list[i] = res; else list.push(res);
  return actor.update({ "system.mage.rotes": list });
}
export async function removeRote(actor, i) {
  const list = actor.system.mage.rotes.map(r => ({ ...r }));
  list.splice(i, 1);
  return actor.update({ "system.mage.rotes": list });
}
/** Сферы ротэ из строки: «Силы 3, Первоначало 2» → { forces: 3, prime: 2 } (ранг не выше своего). */
function roteSpheres(actor, text) {
  const m = actor.system.mage;
  return Object.fromEntries(Object.entries(parseSpheres(text)).map(([k, v]) => [k, Math.min(m.spheres[k] ?? 0, v)]).filter(([, v]) => v > 0));
}
/** «Силы 3, Первоначало 2» → { forces: 3, prime: 2 } — как записано, без оглядки на чьи-то Сферы. */
export function parseSpheres(text) {
  const out = {};
  for (const s of M().spheres ?? []) {
    const names = [s.name, s.en, s.tech?.name, s.tech?.en].filter(Boolean).map(x => x.toLowerCase());
    const hit = String(text ?? "").toLowerCase().split(/[,;+]/).map(x => x.trim()).find(x => names.some(nm => x.startsWith(nm)));
    if (hit) out[s.key] = Math.clamp(Number(hit.match(/\d+/)?.[0]) || 1, 1, 5);
  }
  return out;
}
/** Чародейство по ротэ: Сферы и вид магии подставлены; fast (Shift) — бросок сразу, без окна. */
export function castRote(actor, i, { fast = false } = {}) {
  const r = actor.system.mage.rotes[i];
  if (!r) return null;
  const spheres = roteSpheres(actor, r.spheres);
  if (fast && !Object.keys(spheres).length) ui.notifications.info(t("RoteNoSpheres", { name: r.name }));
  return castEffect(actor, { name: r.name, spheres, kind: r.kind, fast });
}
/** Вид для листа и худа: Сферы ротэ со знаками, вид магии, сложность при своих Сферах. */
export function roteView(actor, r, i) {
  const ranks = roteSpheres(actor, r.spheres), high = Math.max(0, ...Object.values(ranks)), C = M().casting ?? {}, kind = C[r.kind] ? r.kind : "coincidental";
  return { i, ...r, kind, kindLabel: t(`Kind.${kind}`), kindIcon: KINDS.find(k => k[0] === kind)?.[1] ?? "fa-leaf",
    chips: Object.entries(ranks).map(([k, rank]) => ({ name: sphereName(actor, k), rank, sym: { src: mageGlyphSrc(`sphere-${k}`) } })),
    difficulty: high ? Math.clamp(high + (C[kind] ?? 3), C.min ?? 3, C.max ?? 10) : 0 };
}

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

/* Знак на карточках чата — фракция мага */
registerEmblem("mage", actor => mageSigil(actor).sym);
