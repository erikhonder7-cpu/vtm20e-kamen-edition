// module/apps/library-picks.mjs
// Виды записей библиотеки (apps/library.mjs) для всех линий, кроме вампирских: фетиши, шрамы и уродства Гару,
// Дары и нумины Родни, силы Ками и фоморов, Чары духов; Арканои, Шипы, Пятна, Ветви и Шейдкрафт призраков;
// Искусства, Реды и кантрипы подменышей; Кровные права дампиров; Пути и феномены колдунов; Знания падших;
// ротэ магов; готовое оружие, броня и снаряжение.
//
// Каждый вид — объект:
//   entries(actor, o) → записи карточек: { id, name, en, text, group, groupName, groupOrder, level, has, reasons, tags, xp,
//                       ranks: [{ level, name, en, html, mark }] — уровни силы строками (щелчок — текст уровня),
//                       acts: [{ op, icon, label }] — свои кнопки карточки }
//   take(actor, id)   → взять (даром)
//   buy               → true — списать опыт записи и взять; функция (actor, id) — купить своим способом (опыт списывает сама)
//   act[op](actor, id) → свои кнопки карточки
//   title(o)          → заголовок окна (иначе «VTM20.Library.Kinds.<вид>»)
//   levelChips        → фильтр по уровню
// Правила доступности — те же, что у прежних списков на листе (функции *View/*Info соответствующих модулей).

import { Codex } from "../data/codex.mjs";
import { WEAPON_PRESETS, ARMOR_PRESETS, GEAR_PRESETS } from "../data/equipment.mjs";
import { weaponIcon, armorIcon } from "../data/icons.mjs";
import { W as WW, addScar, addDeformity } from "./werewolf.mjs";
import { addFetish, craftFetish } from "./werewolf/fetishes.mjs";
import { kinAddGift, kinAddNumen, kinCost, kamiInfo, kamiAdd } from "./werewolf/kin.mjs";
import { fomorAdd } from "./werewolf/fomori.mjs";
import { addCharm, applySpiritTpl, charmOf } from "./werewolf/spirits.mjs";
import { W as WR, arcSym, addRow } from "./wraith.mjs";
import { spectreRow } from "./spectre.mjs";
import { stainRow } from "./projector.mjs";
import { realmRow } from "./realms.mjs";
import { C, artRow, clGlyph } from "./changeling.mjs";
import { addRede } from "./lykeian.mjs";
import { dafView, learnCantrip } from "./dark-fae.mjs";
import { dhampirView, addBloodright } from "./dhampir.mjs";
import { S as SORC, addNumen, numenXpExtra } from "./sorcerer.mjs";
import { M as MAGE, isFallen } from "./mage.mjs";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const loc = k => game.i18n.localize(k);
const fmt = (k, d) => game.i18n.format(k, d);
const P = (k, d) => d ? fmt(`VTM20.Library.Pick.${k}`, d) : loc(`VTM20.Library.Pick.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
/** Текст справочника: HTML как есть, простая строка — абзацем. */
const para = s => !s ? "" : /^\s*</.test(String(s)) ? String(s) : `<p>${s}</p>`;
const roman = n => ROMAN[n - 1] ?? String(n ?? "");
const lvl = n => Number(n) || 0;
/** Число уровня для карточки и фильтра. */
const levelOf = n => ({ level: lvl(n), levels: String(lvl(n)), order: lvl(n), roman: lvl(n) ? roman(lvl(n)) : "" });
/** Пул броска из книги строкой: «Восприятие + Бдительность». */
const poolText = (actor, roll) => !roll ? "" : [roll.trait1, roll.trait2].filter(Boolean).map(p => actor?.traitLabel?.(p) ?? p.split(".").pop()).join(" + ");
const withPool = (actor, roll, html) => { const p = poolText(actor, roll); return p ? `<p><em>${esc(p)}</em></p>${html}` : html; };
const kindOf = (a, ...types) => !!a && types.includes(a.type);

/* ── Оборотни ─────────────────────────────────────────────────────────── */

const ww = a => a?.system?.werewolf ?? null;

const fetish = {
  levelChips: true,
  entries(a) {
    const own = new Map((ww(a)?.fetishes ?? []).map(x => [x.key, x]));
    return (WW().fetishes ?? []).map(f => {
      const talen = f.kind === "talen", have = own.get(f.key);
      return {
        id: f.key, name: f.name, en: f.en, text: para(f.text), long: true,
        group: talen ? "talen" : "fetish", groupName: loc(talen ? "VTM20.Werewolf.TalenGroup" : "VTM20.Werewolf.FetishGroup"), groupOrder: talen ? 1 : 0,
        ...(talen ? { level: 0, levels: "0", order: 0, roman: "" } : levelOf(f.level)),
        has: !talen && !!have,
        tags: [{ label: `${loc("VTM20.Werewolf.Gnosis")} ${f.gnosis}` }, talen && have ? { label: `×${have.n}` } : null].filter(Boolean),
        acts: [{ op: "craft", icon: "fa-hand-sparkles", label: loc("VTM20.Werewolf.Craft"), tip: loc("VTM20.Werewolf.CraftHint") }]
      };
    });
  },
  take: (a, id) => kindOf(a, "werewolf") ? addFetish(a, id) : null,
  act: { craft: (a, id) => kindOf(a, "werewolf") ? craftFetish(a, id) : null }
};

const scar = {
  entries(a) {
    const own = ww(a)?.scars ?? [];
    return (WW().scars ?? []).map((s, i) => {
      const n = own.filter(k => k === s.key).length;
      return { id: s.key, name: s.name, en: s.en, text: para(s.effect), order: i,
        tags: [{ label: `+${s.glory} ${loc("VTM20.Werewolf.RenownShort.glory")}`, red: true }, n ? { label: `×${n}` } : null].filter(Boolean) };
    });
  },
  take: (a, id) => kindOf(a, "werewolf") ? addScar(a, id) : null
};

const deform = {
  entries(a) {
    const own = new Set(ww(a)?.deformities ?? []);
    return (WW().deformities ?? []).map(d => ({ id: d.key, name: d.name, en: d.en, text: para(d.text), has: own.has(d.key),
      tags: d.source && d.source !== "W20" ? [{ label: d.source }] : [] }));
  },
  take: (a, id) => kindOf(a, "werewolf") ? addDeformity(a, id) : null
};

/** Дары Родни (W20 Kinfolk): свои — Дары Родни племени и Дары Гару 1-го уровня своего племени и породы; чужие — Дары Родни других племён. */
const kinGift = {
  entries(a) {
    const k = a?.system?.kinfolk, D = WW(), tribeName = key => D.tribes.find(t => t.key === key)?.name ?? "—";
    const mine = new Set(k?.gifts ?? []);
    const rows = [];
    const push = (g, group, groupName, groupOrder) => rows.push({
      id: g.key, name: g.name, en: g.en, text: withPool(a, g.roll, para(g.text)), long: true, group, groupName, groupOrder, has: mine.has(g.key),
      ...levelOf(g.level || 1), xp: k ? kinCost(k, g) : 0
    });
    for (const g of D.kinGifts ?? []) {
      const own = g.tribe === k?.tribe;
      push(g, `kin:${g.tribe}`, `${P("KinGifts")}: ${tribeName(g.tribe)}`, own ? 0 : 10 + D.tribes.findIndex(t => t.key === g.tribe));
    }
    if (k) for (const g of D.gifts.filter(g => g.level === 1 && g.groups.some(x => x.key === k.tribe || x.key === k.breed)))
      push(g, "garou", P("GarouGifts"), 1);
    return rows;
  },
  take: (a, id) => a?.system?.kinfolk ? kinAddGift(a, id, false) : null,
  buy: (a, id) => a?.system?.kinfolk ? kinAddGift(a, id, true) : null
};

const numen = {
  entries(a) {
    const mine = new Set((a?.system?.kinfolk?.numina ?? []).map(x => x.key));
    return (WW().numina ?? []).map(n => ({
      id: n.key, name: n.name, en: n.en, long: true, has: mine.has(n.key),
      text: `${n.pool || n.cost ? `<p><em>${esc([n.pool, n.cost].filter(Boolean).join(" · "))}</em></p>` : ""}${para(n.text)}`,
      group: n.kind, groupName: loc(`VTM20.Werewolf.Numen.${n.kind}`), groupOrder: n.kind === "hedge" ? 0 : 1,
      tags: n.source ? [{ label: n.source }] : [],
      ranks: (n.levels ?? []).map(l => ({ level: l.n, name: l.name || `${roman(l.n)}`, html: para(l.text),
        mark: l.difficulty ? `${loc("VTM20.Roll.Vs")} ${l.difficulty}` : "" }))
    }));
  },
  take: (a, id) => a?.system?.kinfolk ? kinAddNumen(a, id) : null
};

/** Силы Ками (W20 Umbra, гл. 4): силы неподвижных — растениям и земле; повторяемые — до предела покупок. */
const kamiPower = {
  entries(a) {
    const k = a?.system?.kami, info = a?.system?.kami ? kamiInfo(a) : null;
    const own = new Map((k?.powers ?? []).map(x => [x.key, x])), order = ["kami", "borrowed", "immobile"];
    return (WW().kami?.powers ?? []).map(p => {
      const have = own.get(p.key), more = !!have && p.repeat && have.n < p.max;
      return {
        id: p.key, name: p.name, en: p.en, text: withPool(a, p.roll, para(p.text)), long: true,
        group: p.kind, groupName: loc(`VTM20.Werewolf.Kami.kind.${p.kind}`), groupOrder: order.indexOf(p.kind),
        has: !!have && !more, xp: info?.xp ?? 0,
        tags: [p.repeat ? { label: P("Repeat", { n: p.max }) } : null, have ? { label: `×${have.n}` } : null, p.source ? { label: p.source } : null].filter(Boolean),
        reasons: k && p.kind === "immobile" && k.kind !== "plant" ? [P("KamiPlant")] : []
      };
    });
  },
  take: (a, id) => a?.system?.kami ? kamiAdd(a, id, false) : null,
  buy: (a, id) => a?.system?.kami ? kamiAdd(a, id, true) : null
};

const fomorPower = {
  entries(a) {
    const own = new Map((a?.system?.fomor?.powers ?? []).map(x => [x.key, x]));
    return (WW().fomori?.powers ?? []).map(p => {
      const have = own.get(p.key), more = !!have && p.repeat && have.n < p.max;
      return { id: p.key, name: p.name, en: p.en, text: withPool(a, p.roll, para(p.text)), long: true, has: !!have && !more,
        tags: [p.rage ? { label: loc("VTM20.Werewolf.Rage"), red: true } : null, p.repeat ? { label: P("Repeat", { n: p.max }) } : null,
          have ? { label: `×${have.n}` } : null, p.source && p.source !== "W20" ? { label: p.source } : null].filter(Boolean) };
    });
  },
  take: (a, id) => a?.system?.fomor ? fomorAdd(a, id) : null
};

/** Чары духа: общие есть у всех духов (W20, гл. 9), остальные — по выбору. */
const charm = {
  entries(a) {
    const own = new Set(a?.system?.spirit?.charms ?? []);
    return (WW().charms ?? []).map(c => ({ id: c.key, name: c.name, en: c.en, text: para(c.text), has: c.general || own.has(c.key),
      group: c.general ? "general" : "special", groupName: P(c.general ? "CharmGeneral" : "CharmSpecial"), groupOrder: c.general ? 1 : 0 }));
  },
  take: (a, id) => a?.system?.spirit ? addCharm(a, id) : null
};

/** Образцы духов (бестиарии W20, Умбра, Книга Червя, кин-фетчи): «Взять» ставит черты, Эссенцию и Чары образца. */
const SPIRIT_KINDS = ["gaia", "wyld", "weaver", "fetch", "bane"];
const spiritTpl = {
  entries(a) {
    const cur = a?.system?.spirit;
    return (WW().spirits ?? []).map(x => {
      const charms = (x.charms ?? []).map(k => charmOf(k)?.name ?? k).join(", ");
      return {
        id: x.key, name: x.name, en: x.en, long: true,
        group: x.kind, groupName: loc(`VTM20.Werewolf.Spirit.kind.${x.kind}`), groupOrder: SPIRIT_KINDS.indexOf(x.kind),
        has: !!cur && a.system.kind === `${loc(`VTM20.Werewolf.Spirit.kind.${x.kind}`)}: ${x.name}`,
        text: `<p><em>${esc([`${loc("VTM20.Werewolf.Spirit.rage")} ${x.rage}`, `${loc("VTM20.Werewolf.Spirit.gnosis")} ${x.gnosis}`,
          `${loc("VTM20.Werewolf.Spirit.willpower")} ${x.willpower}`, `${loc("VTM20.Werewolf.Spirit.essence")} ${x.essence}`].join(" · "))}</em></p>${para(x.text)}${charms ? `<p><b>${esc(loc("VTM20.Werewolf.Spirit.charms"))}:</b> ${esc(charms)}</p>` : ""}`,
        tags: [x.rank ? { label: loc(`VTM20.Werewolf.SpiritRank.${x.rank}`) } : null, x.source ? { label: x.source } : null].filter(Boolean)
      };
    });
  },
  take: (a, id) => a?.system?.spirit ? applySpiritTpl(a, id) : null
};

/* ── Призраки ─────────────────────────────────────────────────────────── */

const wr = a => a?.system?.wraith ?? null;
const GUILD_ORDER = ["working", "high", "criminal", "forbidden", "labyrinth"];
/** Уровни Арканоса строками: у Гильдейских по два на ранг — Общий и Посвящённый. */
const arcLevels = levels => (levels ?? []).map(l => ({ level: l.level, name: l.name, en: l.en, html: l.html ?? para(l.text),
  mark: l.kind === "initiate" ? loc("VTM20.Wraith.Initiate") : "" }));

const arcanos = {
  entries(a) {
    const w = wr(a);
    return WR().arcanoi.map(x => ({
      id: x.key, name: x.name, en: x.en, sym: arcSym(x.key), text: x.html ?? "", long: true,
      group: x.group, groupName: loc(`VTM20.Wraith.GuildGroup.${x.group}`), groupOrder: GUILD_ORDER.indexOf(x.group),
      has: (w?.arcanoi?.[x.key]?.value ?? 0) > 0, xp: w ? a.xpCost("arcanos", 0, { key: x.key }) ?? 0 : 0,
      tags: [x.guild ? { label: x.guild } : null, x.forbidden ? { label: loc("VTM20.Wraith.Forbidden"), red: true } : null].filter(Boolean),
      ranks: arcLevels(x.levels)
    }));
  },
  take: (a, id) => wr(a) ? a.update({ [`system.wraith.arcanoi.${id}.value`]: 1 }) : null,
  buy: true
};

const darkArcanos = {
  entries(a) {
    const dark = wr(a)?.spectre?.dark ?? {};
    return (WR().darkArcanoi ?? []).map(x => ({ id: x.key, name: x.name, en: x.en, text: x.html ?? "", long: true, has: (dark[x.key] ?? 0) > 0,
      ranks: arcLevels(x.levels) }));
  },
  take: (a, id) => wr(a) ? spectreRow(a, "dark", "add", { key: id }) : null
};

const risenArt = {
  entries(a) {
    const own = wr(a)?.risen?.arcanoi ?? {};
    return (WR().risenArcanoi ?? []).map(x => ({ id: x.key, name: x.name, en: x.en, text: x.html ?? "", long: true, has: (own[x.key] ?? 0) > 0,
      ranks: arcLevels(x.levels) }));
  },
  take: (a, id) => wr(a) ? a.update({ [`system.wraith.risen.arcanoi.${id}`]: Math.max(1, a.system.wraith.risen.arcanoi[id] ?? 0) }) : null
};

/** Арканои других Тёмных Царств (Book of Oblivion): только своего Царства, если оно выбрано. */
const realmArt = {
  entries(a) {
    const r = wr(a)?.realm, realms = WR().realms ?? [];
    return (WR().realmArcanoi ?? []).filter(x => !r?.kingdom || x.realm === r.kingdom).map(x => ({
      id: x.key, name: x.name, en: x.en, sym: x.key === "connaissance" || !x.glyph ? null : arcSym(x.glyph), text: x.html ?? "", long: true,
      group: x.realm, groupName: realms.find(k => k.key === x.realm)?.name ?? x.realm, groupOrder: realms.findIndex(k => k.key === x.realm),
      has: (r?.arcanoi?.[x.key] ?? 0) > 0, xp: r ? a.xpCost("arcanos", 0, { key: x.key }) ?? 0 : 0,
      ranks: arcLevels(x.levels)
    }));
  },
  take: (a, id) => wr(a) ? realmRow(a, "add", id) : null,
  buy: true
};

/** Шипы Тени (гл. 7): можно брать несколько раз — у каждого своя заметка. */
const thorn = {
  entries(a) {
    const own = wr(a)?.shadow?.thorns ?? [];
    return (WR().thorns ?? []).map(x => {
      const n = own.filter(t => t.key === x.key).length;
      return { id: x.key, name: x.name, en: x.en, text: x.html ?? "", tags: [{ label: x.costText }, n ? { label: `×${n}` } : null].filter(Boolean) };
    });
  },
  take: (a, id) => wr(a) ? addRow(a, "thorn", { key: id }) : null
};

const frond = {
  entries(a) {
    const own = new Set((wr(a)?.spectre?.psyche?.fronds ?? []).map(f => f.key));
    return (WR().psyche?.fronds ?? []).map(x => ({ id: x.key, name: x.name, en: x.en, text: x.html ?? "", has: own.has(x.key), tags: [{ label: x.costText }] }));
  },
  take: (a, id) => wr(a) ? spectreRow(a, "frond", "add", { key: id }) : null
};

const shade = {
  entries(a) {
    const own = new Set(wr(a)?.spectre?.shadecraft ?? []);
    return (WR().shadecraft ?? []).map(x => ({ id: x.key, name: x.name, en: x.en, text: x.html ?? "", has: own.has(x.key), long: true,
      tags: x.angst ? [{ label: P("Angst", { n: x.angst }), red: true }] : [] }));
  },
  take: (a, id) => wr(a) ? spectreRow(a, "shade", "add", { key: id }) : null
};

/** Пятна проектора «Орфея»: польза и вред. */
const stain = {
  entries(a) {
    const own = new Set((wr(a)?.projector?.stains ?? []).map(s => s.key));
    return (WR().stains ?? []).map(x => ({ id: x.key, name: x.name, en: x.en, has: own.has(x.key),
      text: `<p><b>${esc(P("Adv"))}:</b> ${x.adv ?? ""}</p><p><b>${esc(P("Dis"))}:</b> ${x.dis ?? ""}</p>` }));
  },
  take: (a, id) => wr(a) ? stainRow(a, "add", { key: id }) : null
};

/* ── Подменыши ────────────────────────────────────────────────────────── */

const art = {
  entries(a) {
    const own = a?.system?.changeling?.arts ?? {};
    return C().arts.map(x => ({
      id: x.key, name: x.name, en: x.en, sym: clGlyph("art", x.key), text: x.html ?? "", long: true,
      has: (own[x.key] ?? 0) > 0, xp: kindOf(a, "changeling") ? a.xpCost("art", 0) ?? 0 : 0,
      ranks: (x.levels ?? []).map(l => ({ level: l.level, name: l.name, en: l.en, html: l.html ?? "",
        mark: l.type ? loc(`VTM20.Changeling.Type.${l.type}`) : "" }))
    }));
  },
  take: (a, id) => kindOf(a, "changeling") ? artRow(a, "add", id) : null,
  buy: true
};

/** Реды ликийцев (Players Guide): цена в очках Ред — из книги, у переменных — рассказчику. */
const rede = {
  entries(a) {
    const own = new Set((a?.system?.changeling?.lykeian?.redes ?? []).map(r => r.key));
    return (C().redes ?? []).map(r => ({ id: r.key, name: r.name, en: r.en, text: para(r.text), has: own.has(r.key), order: Number(r.cost) || 0,
      tags: [{ label: r.costText ?? String(r.cost), red: true }] }));
  },
  take: (a, id) => kindOf(a, "changeling") ? addRede(a, id) : null
};

/** Кантрипы Тёмных веков: Фэ (o.discipline — Домен): своего Домена и общие, не выше точек Домена. */
const cantrip = {
  levelChips: true,
  title: o => `${loc("VTM20.Library.Kinds.cantrip")} · ${loc(`VTM20.Fae.Daf.Dom.${o.discipline}`)}`,
  entries(a, o) {
    const k = o.discipline, view = a ? dafView(a, () => []) : null;
    const dom = view?.dominions.find(d => d.key === k), known = new Set(a?.system?.changeling?.daf?.cantrips ?? []), value = dom?.value ?? 0;
    return (C().daf?.cantrips ?? []).filter(c => c.domain === k || c.domain === "common").map(c => {
      const id = `${k}:${c.key}`;
      return { id, name: c.name, en: c.en, ...levelOf(c.level), has: known.has(id),
        text: `${c.params ? `<p><em>${esc(c.params)}</em></p>` : ""}${para(c.text)}`,
        group: c.domain === "common" ? "common" : "own", groupName: c.domain === "common" ? loc("VTM20.Fae.Daf.Common") : loc(`VTM20.Fae.Daf.Dom.${k}`),
        groupOrder: c.domain === "common" ? 1 : 0,
        reasons: a && c.level > value ? [P("NeedDominion", { name: loc(`VTM20.Fae.Daf.Dom.${k}`), n: c.level })] : [] };
    });
  },
  take(a, id) {
    if (!kindOf(a, "changeling")) return null;
    // общий кантрип из компендия («common:ключ») — в Домен персонажа с наибольшими точками
    if (id.startsWith("common:")) {
      const doms = a.system.changeling.daf?.dominions ?? {}, best = Object.keys(doms).sort((x, y) => (doms[y] ?? 0) - (doms[x] ?? 0))[0] ?? "dawn";
      id = `${best}:${id.slice(7)}`;
    }
    return learnCantrip(a, id);
  }
};

/* ── Дампиры ──────────────────────────────────────────────────────────── */

/** Кровные права (Accursed Heirs: Dhampirs): нужна Дисциплина-основа; новое право — 7 опыта (опыт списывает addBloodright). */
const bloodright = {
  entries(a) {
    const own = a?.system?.dhampir?.bloodrights ?? {}, ok = new Set(a ? dhampirView(a, () => []).available.map(r => r.key) : []);
    const reqName = r => r.key === "dririmancy" ? loc("VTM20.Dhampir.BloodMagic") : Codex.disciplineLabel?.(r.req) ?? r.req;
    return (Codex.dhampir?.bloodrights ?? []).map(r => ({
      id: r.key, name: r.name, en: r.en, text: para(r.text), long: true, has: r.key in own,
      group: r.rare ? "rare" : "common", groupName: r.rare ? loc("VTM20.Dhampir.Rare") : P("Usual"), groupOrder: r.rare ? 1 : 0,
      tags: r.req ? [{ label: reqName(r) }] : [],
      reasons: a && !(r.key in own) && !ok.has(r.key) ? [fmt("VTM20.Library.NeedDiscipline", { name: reqName(r) })] : [],
      ranks: (r.levels ?? []).map(l => ({ level: l.level, name: l.name, en: l.en, html: `${l.cost ? `<p><em>${esc(l.cost)}</em></p>` : ""}${para(l.text)}` }))
    }));
  },
  take: (a, id) => a?.isDhampir ? addBloodright(a, id) : null
};

/* ── Колдуны (Sorcerer, M20) ──────────────────────────────────────────── */

const sorcNumen = list => ({
  entries(a) {
    const own = new Set((a?.system?.sorcerer?.numina ?? []).map(n => n.key));
    return (SORC()[list] ?? []).map(x => ({ id: x.key, name: x.name, en: x.en, text: x.html ?? "", long: true, has: own.has(x.key),
      xp: a?.system?.sorcerer ? a.xpCost("sorcNumen", 0, numenXpExtra(a, x.key)) ?? 0 : 0 }));
  },
  take: (a, id) => a?.system?.sorcerer ? addNumen(a, id) : null,
  buy: true
});

/* ── Падшие: Знания (Demon: The Fallen, гл. 6) ────────────────────────── */

/** Знание предметом: имя и ключ из справочника, одна точка. */
export function createLore(actor, keys) {
  const data = keys.map(k => Codex.lore(k)).filter(Boolean).map(l => ({ name: l.name, type: "lore", img: `systems/${game.system.id}/assets/icons/${l.dark ? "darkLore" : "lore"}.svg`,
    system: { key: l.key, value: 1, description: `<p><em>${l.en}</em> · ${Codex.house(l.house)?.name ?? loc("VTM20.Demon.Common")}</p>` } }));
  return data.length ? actor.createEmbeddedDocuments("Item", data) : null;
}

const lore = {
  entries(a) {
    const have = new Set((a?.items ?? []).filter(i => i.type === "lore").map(i => i.system.key));
    const ownHouse = Codex.house(a?.system?.house)?.lores ?? [];
    return Codex.lores.map(l => {
      const place = l.dark ? ["dark", loc(a?.system?.earthbound ? "VTM20.Demon.DarkLoresOwn" : "VTM20.Demon.DarkLores"), 2]
        : !l.house || ownHouse.includes(l.key) ? ["own", loc("VTM20.Demon.OwnLores"), 0] : ["other", loc("VTM20.Demon.OtherLores"), 1];
      return {
        id: l.key, name: l.name, en: l.en, long: true, has: have.has(l.key),
        text: `<p><em>${esc(Codex.house(l.house)?.name ?? loc("VTM20.Demon.Common"))}</em></p>`,
        group: place[0], groupName: place[1], groupOrder: place[2],
        xp: kindOf(a, "demon") ? a.xpCost("lore", 0, { key: l.key }) ?? 0 : 0,
        ranks: (l.powers ?? []).map(p => ({ level: p.level, name: p.name, html: withPool(a, p.roll, p.html ?? "") }))
      };
    });
  },
  take: (a, id) => kindOf(a, "demon") ? createLore(a, [id]) : null,
  buy: true
};

/* ── Маги: ротэ из книг ───────────────────────────────────────────────── */

/** Первая Сфера ротэ — группа, высший ранг — уровень: «Разум 4, Силы 2» → «Разум», IV. */
const roteSphere = r => String(r.spheres ?? "").split(/[,;+]/)[0].replace(/\d+/g, "").trim() || "—";
const roteRank = r => Math.max(0, ...(String(r.spheres ?? "").match(/\d+/g) ?? []).map(Number));
const rote = {
  levelChips: true,
  entries(a) {
    const mine = new Set((a?.system?.mage?.rotes ?? []).map(r => r.name)), all = (MAGE().rotes ?? []).map((r, i) => [r, i]).filter(([r]) => !r.nephandi || isFallen(a));
    const spheres = [...new Set(all.map(([r]) => roteSphere(r)))].sort((x, y) => x.localeCompare(y, "ru"));
    return all.map(([r, i]) => ({ id: String(i), name: r.name, en: r.en !== r.name ? r.en : "", has: mine.has(r.name), ...levelOf(roteRank(r)),
      text: `<p><b>${esc(r.spheres)}</b></p>${para(r.text)}`, group: roteSphere(r), groupName: roteSphere(r), groupOrder: spheres.indexOf(roteSphere(r)),
      tags: r.source ? [{ label: r.source }] : [] }));
  },
  take(a, id) {
    const r = MAGE().rotes?.[Number(id)];
    if (!r || !a?.system?.mage) return null;
    const list = a.system.mage.rotes.map(x => ({ ...x }));
    list.push({ name: r.name, spheres: r.spheres, kind: "coincidental", text: `${r.text}${r.source ? ` (${r.source})` : ""}` });
    return a.update({ "system.mage.rotes": list });
  }
};

/* ── Снаряжение ───────────────────────────────────────────────────────── */

function gearLine(kind, p) {
  if (kind === "weapon") {
    const dmg = `${p.damage ?? 0}${p.strength ? ` ${loc("VTM20.Weapon.plusStrength")}` : ""} · ${loc(`VTM20.Damage.${p.damageType ?? "bashing"}`)}`;
    return [`${loc("VTM20.Weapon.damage")}: ${dmg}`, p.difficulty ? `${loc("VTM20.Weapon.diff")} ${p.difficulty}` : "",
      p.range ? `${loc("VTM20.Weapon.range")} ${p.range} ${loc("VTM20.Weapon.meters")}` : "", p.rate ? `${loc("VTM20.Weapon.rate")} ${p.rate}` : "",
      p.clip ? `${loc("VTM20.Weapon.clip")} ${p.clip}` : "", p.pierce ? `${loc("VTM20.Weapon.pierce")} ${p.pierce}` : "",
      p.concealment ? `${loc("VTM20.Weapon.conceal")}: ${p.concealment}` : ""].filter(Boolean).join(" · ");
  }
  if (kind === "armor") return `${loc("VTM20.Armor.rating")} ${p.rating}${p.penalty ? ` · ${loc("VTM20.Armor.penalty")} −${p.penalty}` : ""}`;
  return p.quantity > 1 ? `×${p.quantity}` : "";
}
const equip = (kind, list) => ({
  entries() {
    const groups = [...new Set(list.filter(p => Codex.visible(p)).map(p => p.group))];
    return list.map((p, i) => [p, i]).filter(([p]) => Codex.visible(p)).map(([p, i]) => ({
      id: String(i), name: p.name, order: i, group: p.group, groupName: p.group, groupOrder: groups.indexOf(p.group),
      text: `<p><em>${esc(gearLine(kind, p))}</em></p>${p.description ?? ""}`, tags: p.source ? [{ label: p.source }] : []
    }));
  },
  async take(a, id) {
    const p = list[Number(id)];
    if (!p || !a) return null;
    if (kind === "gear") {
      const { name, source, description = "", quantity = 1 } = p;
      return a.createEmbeddedDocuments("Item", [{ name, type: "gear", system: { quantity, description, source: source ?? "" } }]);
    }
    const { name, group: _group, ...system } = p;
    return a.createEmbeddedDocuments("Item", [{ name, type: kind, img: kind === "weapon" ? weaponIcon(name, system.kind) : armorIcon(system.rating), system }]);
  }
});

/** Виды записей по ключу (data-kind кнопки библиотеки на листе). */
export const PICKS = {
  fetish, scar, deform, kinGift, numen, kamiPower, fomorPower, charm, spiritTpl,
  arcanos, darkArcanos, risenArt, realmArt, thorn, frond, shade, stain,
  art, rede, cantrip,
  bloodright,
  sorcPath: sorcNumen("paths"), sorcPsychic: sorcNumen("psychic"),
  lore, rote,
  weapon: equip("weapon", WEAPON_PRESETS), armor: equip("armor", ARMOR_PRESETS), gear: equip("gear", GEAR_PRESETS)
};
