// module/apps/atlas.mjs
// Справочник линейки по щелчку на знаке листа — как справочник кланов у Сородичей и Домов у падших:
// слева группы и список со знаками, справа карточка. Разметка и стили — справочника кланов (r-cl-*).
//   маг      — Традиции, Технократия, Ремёсла (родовая Сфера, практики, Дома и течения), Сферы по рангам, Сущности, парадигмы, практики
//   охотник   — кредо (Добродетель, Убеждённость, Грани пути), Добродетели охоты
//   оборотень — племена, породы, аугурии, Фера (числа создания, начальные Дары, Дары по рангам)
//   призрак   — Арканои (Гильдия, союзники, уровни Общие и Посвящённые), Легионы, архетипы Тени и Психеи, Шипы, Фоны
//   гуль      — правила Ghouls & Revenants, семейства ревенантов (Дисциплины, изъян рода), Достоинства и Недостатки гулей
//   дампир    — правила, концепции, Права крови по уровням, ритуалы Каплемантии, кровь кланов, Фоны, Достоинства и Недостатки
// Данные — data/mage.json и data/werewolf.json (пересказ справочника), своей механики тут нет.

import { SYSTEM_PATH } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { M, mageGlyphSrc, subLabel, factionGlyph } from "./mage.mjs";
import { W, wwGlyphSrc } from "./werewolf.mjs";
import { H } from "./hunter.mjs";
import { W as WR, arcSym, legionSym } from "./wraith.mjs";
import { C as CL } from "./changeling.mjs";
import * as CLG from "./changeling.mjs";
import { REVENANT_FAMILIES } from "../data/revenants.mjs";
import { SOCIETIES, SHADOW_COURT } from "../data/changeling-societies.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const loc = k => game.i18n.localize(`VTM20.${k}`);
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI"];
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
// данные свои (пересказ книг): строка с разметкой внутри (<strong>, <em>) не экранируется
const p = s => s ? (/^\s*</.test(s) ? s : /<\/?(strong|em|b|i|br|span|a)\b/.test(s) ? `<p>${s}</p>` : `<p>${esc(s)}</p>`) : "";
const fact = (label, value) => value || value === 0 ? { label, value } : null;
// список правил («<ul><li>…») — плашками: ведущий <strong>…</strong> пункта становится его заголовком
const feats = html => String(html ?? "").replace(/^<ul>/, '<ul class="r-at-feats">')
  .replace(/<li><strong>([^<]{2,80}?)[.:]<\/strong>\s*/g, (m, k) => `<li><b class="r-at-feat-k">${k.replace(/[.:]\s*$/, "")}</b>`)
  .replace(/<li>([^<:.;]{2,40}):\s*/g, (m, k) => `<li><b class="r-at-feat-k">${k}</b>`);
// лор записи (data/line-lore.json, своими словами по книгам линейки): линейка → раздел → ключ
const lore = (line, kind, key) => Codex["line-lore"]?.[line]?.[kind]?.[String(key)] ?? "";

/* ── Маг ─────────────────────────────────────────────────────────────── */
function mageGroups() {
  const D = M(), mg = n => ({ src: mageGlyphSrc(n) });
  const sphere = k => (D.spheres ?? []).find(s => s.key === k);
  const factions = g => (D.factions ?? []).filter(f => f.group === g.key).map(f => ({
    key: f.key, name: f.name, sub: f.en, sym: mg(factionGlyph(f)),
    card: () => ({
      kicker: g.name, lore: lore("mage", "faction", f.key), facts: [fact(loc("Mage.Affinity"), f.affinityText), fact(loc("Mage.Practice"), f.practices)].filter(Boolean),
      chips: (f.affinity ?? []).map(k => ({ sym: mg(`sphere-${k}`), label: g.key === "technocracy" && sphere(k)?.tech ? sphere(k).tech.name : sphere(k)?.name ?? k })),
      sections: f.subs?.length ? [{ title: subLabel(f), n: f.subs.length, plain: true,
        rows: f.subs.map(x => ({ name: x.name, em: x.en, sym: f.key === "order-of-hermes" ? mg(`house-${x.key}`) : null, html: p(x.note) })) }] : []
    })
  }));
  const ranks = list => (list ?? []).map((text, i) => ({ lvl: ROMAN[i + 1], name: D.ranks?.[i] ?? "", html: p(text), open: true }));
  return [
    ...(D.groups ?? []).map(g => ({ key: g.key, label: loc(`Atlas.Group.${g.key}`), items: factions(g) })),
    { key: "spheres", label: loc("Mage.Spheres"), items: (D.spheres ?? []).map(s => ({
      key: `sphere:${s.key}`, name: s.name, sub: s.tech ? `${s.en} · ${s.tech.name}` : s.en, sym: mg(`sphere-${s.key}`),
      card: () => ({ kicker: loc("Atlas.Sphere"), facts: [fact(loc("Atlas.Specialties"), s.specialties), fact(loc("Atlas.Qliph"), s.qliph && `${s.qliph.name} — «${s.qliph.title}»`)].filter(Boolean),
        sections: [{ title: loc("Atlas.Ranks"), rows: ranks(s.ranks) },
          ...(s.tech ? [{ title: `${loc("Atlas.Technocracy")}: ${s.tech.name}`, sub: s.tech.en, rows: ranks(s.tech.ranks).map(r => ({ ...r, open: false })) }] : [])] })
    })) },
    // Квиппот Падших (Book of the Fallen): десять Квлиф от 10 к 1 — прозвание, влияние, Сфера
    { key: "qliphoth", label: loc("Atlas.Qliphoth"), items: (D.qliphoth ?? []).map(q => ({
      key: `qliph:${q.n}`, name: q.name, sub: `«${q.title}»`, sym: q.sphere ? mg(`sphere-${q.sphere}`) : mg("group-nephandi"),
      card: () => ({ kicker: `${loc("Atlas.Qliph")} ${q.n}`, lore: lore("mage", "qliph", q.n),
        facts: [fact(loc("Atlas.Sphere"), sphere(q.sphere)?.name), fact(loc("Atlas.Influence"), q.influence)].filter(Boolean) }) })) },
    // колдуны и консоры (M20 Sorcerer; Gods & Monsters)
    { key: "sorcPaths", label: loc("Sorcerer.Paths"), items: (D.sorcerer?.paths ?? []).map(x => ({ key: `path:${x.key}`, name: x.name, sub: x.en, icon: "fa-route", card: () => ({ kicker: loc("Sorcerer.Path"), text: x.html }) })) },
    { key: "sorcPsychic", label: loc("Sorcerer.PsychicShort"), items: (D.sorcerer?.psychic ?? []).map(x => ({ key: `psy:${x.key}`, name: x.name, sub: x.en, icon: "fa-brain", card: () => ({ kicker: loc("Sorcerer.Psychic"), text: x.html }) })) },
    { key: "sorcAff", label: loc("Sorcerer.Affiliations"), items: (D.sorcerer?.affiliations ?? []).map(x => ({ key: `aff:${x.key}`, name: x.name, sub: x.en, icon: "fa-people-group",
      card: () => ({ kicker: loc("Sorcerer.Affiliation"), lore: lore("mage", "aff", x.key), text: p(x.text), facts: [fact(loc("Sorcerer.FavAttrs"), x.attrs), fact(loc("Sorcerer.FavPaths"), x.paths)].filter(Boolean) }) })) },
    { key: "consors", label: loc("Sorcerer.Consors"), items: (D.sorcerer?.consor?.roles ?? []).map(x => ({ key: `consor:${x.key}`, name: x.name, sub: x.en, icon: "fa-user-group", card: () => ({ kicker: loc("Sorcerer.Consor"), text: p(x.text) }) })) },
    { key: "essences", label: loc("Atlas.Essences"), items: (D.essences ?? []).map(e => ({
      key: `essence:${e.key}`, name: e.name, sub: e.en, icon: "fa-sun", card: () => ({ kicker: loc("Mage.Essence"), lore: lore("mage", "essence", e.key), text: lore("mage", "essence", e.key) ? "" : p(e.text) }) })) },
    { key: "paradigms", label: loc("Atlas.Paradigms"), items: (D.focus?.paradigms ?? []).map((x, i) => ({
      key: `paradigm:${i}`, name: x.name, sub: x.en, icon: "fa-eye", card: () => ({ kicker: loc("Mage.Paradigm"), lore: lore("mage", "paradigm", i), text: /^Практики/.test(x.text ?? "") || !lore("mage", "paradigm", i) ? p(x.text) : "" }) })) },
    { key: "practices", label: loc("Atlas.Practices"), items: (D.focus?.practices ?? []).map((x, i) => ({
      key: `practice:${i}`, name: x.name, sub: x.en, icon: "fa-hand-sparkles",
      card: () => ({ kicker: loc("Mage.Practice"), lore: lore("mage", "practice", i), text: lore("mage", "practice", i) ? "" : p(x.text),
        facts: [fact(loc("Mage.Paradigm"), x.paradigms), fact(loc("Atlas.Abilities"), x.abilities), fact(loc("Atlas.Instruments"), x.instruments)].filter(Boolean) }) })) }
  ].filter(g => g.items.length);
}

/* ── Оборотень ───────────────────────────────────────────────────────── */
function wolfGroups() {
  const D = W(), wg = n => ({ src: wwGlyphSrc(n) });
  const gift = k => (D.gifts ?? []).find(g => g.key === k);
  // кто учит — отдельной подписью над механикой (поле teacher, tools/werewolf_data.py: split_teacher)
  const teach = g => (g.teacher ? `<p class="r-at-teach"><i class="fa-solid fa-feather-pointed" inert></i>${loc("Atlas.Teaches")}: ${esc(g.teacher)}</p>` : "") + (g.text ?? "");
  const giftRow = g => ({ lvl: ROMAN[g.level] ?? g.level, name: g.name, em: g.en, html: teach(g) });
  const start = keys => ({ start: true, title: loc("Atlas.StartGifts"), rows: (keys ?? []).map(gift).filter(Boolean).map(giftRow) });
  const own = (kind, key) => {
    const list = (D.gifts ?? []).filter(g => g.groups?.some(x => x.kind === kind && x.key === key)).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
    return { title: loc("Atlas.Gifts"), n: list.length, rows: list.map(giftRow) };
  };
  const secs = list => {
    const [first, ...rest] = list.filter(s => s.rows.length), all = new Set(rest.flatMap(s => s.rows.map(r => r.name)));
    return first?.start && first.rows.every(r => all.has(r.name)) ? rest : [first, ...rest].filter(Boolean);
  };
  return [
    { key: "tribes", label: loc("Atlas.Tribes"), items: (D.tribes ?? []).map(x => ({
      key: `tribe:${x.key}`, name: x.name, sub: x.en, sym: wg(`tribe-${x.key}`),
      card: () => ({ kicker: loc("Werewolf.Tribe"), lore: lore("werewolf", "tribe", x.key),
        facts: [fact(loc("Willpower"), x.willpower), fact(loc("Atlas.Totem"), x.totem), fact(loc("Atlas.Backgrounds"), x.backgrounds)].filter(Boolean),
        sections: secs([start(x.startGifts), own("tribe", x.key)]) }) })) },
    { key: "breeds", label: loc("Atlas.Breeds"), items: (D.breeds ?? []).map(x => ({
      key: `breed:${x.key}`, name: x.name, sub: x.en, sym: wg(`breed-${x.key}`),
      card: () => ({ kicker: loc("Werewolf.Breed"), nick: x.nick, lore: lore("werewolf", "breed", x.key), text: p(x.notes), facts: [fact(loc("Werewolf.Gnosis"), x.gnosis)].filter(Boolean),
        sections: secs([start(x.startGifts), own("breed", x.key)]) }) })) },
    { key: "auspices", label: loc("Atlas.Auspices"), items: (D.auspices ?? []).map(x => ({
      key: `auspice:${x.key}`, name: x.name, sub: x.en, sym: wg(`auspice-${x.key}`),
      card: () => ({ kicker: loc("Werewolf.Auspice"), tag: x.role, lore: lore("werewolf", "auspice", x.key), facts: [fact(loc("Werewolf.Rage"), x.rage), fact(loc("Atlas.Renown"), x.renownText)].filter(Boolean),
        sections: secs([start(x.startGifts), own("auspice", x.key)]) }) })) },
    { key: "fera", label: loc("Atlas.Fera"), items: (D.fera ?? []).map(x => ({
      key: `fera:${x.key}`, name: x.name, sub: x.en, sym: wg(`fera-${x.key}`),
      card: () => ({ kicker: loc("Atlas.FeraKind"), lore: lore("werewolf", "fera", x.key), text: feats(x.traits),
        facts: Object.entries(x.facts ?? {}).map(([k, v]) => fact(k, v)).filter(Boolean),
        sections: secs([
          ...(x.dims ?? []).map(d => ({ title: d.label, plain: true, rows: d.options.map(o => ({ name: o.name, em: o.en, html: p(o.text) })) })),
          { title: loc("Atlas.Forms"), plain: true, rows: (x.forms ?? []).map(f => ({ name: f.name, em: f.en,
            html: p(Object.entries(f.mods ?? {}).map(([k, v]) => `${game.i18n.localize(`VTM20.Attr.${k}`)} ${v > 0 ? "+" : "−"}${Math.abs(v)}`).join(", ")) })) },
          own("fera", x.key)]) }) })) }
  ].filter(g => g.items.length);
}

/* ── Охотник ─────────────────────────────────────────────────────────── */
function hunterGroups() {
  const D = H(), V = D.virtues ?? {}, VICON = { mercy: "fa-hand-holding-heart", vision: "fa-eye", zeal: "fa-fire-flame-simple" };
  const edges = path => (D.edges ?? []).filter(e => e.path === path).sort((a, b) => a.level - b.level);
  const edgeRow = e => ({ lvl: ROMAN[e.level] ?? e.level, name: e.name, em: e.conviction ? `${loc("Hunter.Conviction")} ${e.conviction}` : "", html: p(e.text) });
  const creedCard = c => () => ({ kicker: `${loc("Hunter.Creed")} · ${V[c.virtue] ?? c.virtue}`, lore: lore("hunter", "creed", c.key), text: lore("hunter", "creed", c.key) ? "" : p(c.text),
    facts: [fact(loc("Atlas.Virtue"), V[c.virtue]), fact(loc("Hunter.Conviction"), c.conviction), fact(loc("Atlas.Advice"), c.tips)].filter(Boolean),
    sections: edges(c.key).length ? [{ title: loc("Hunter.Edges"), n: edges(c.key).length, rows: edges(c.key).map(edgeRow) }] : [] });
  const B = D.bystander;
  return [
    { key: "creeds", label: loc("Atlas.Creeds"), items: [
      ...(D.creeds ?? []).filter(c => c.key !== "bystander").map(c => ({ key: `creed:${c.key}`, name: c.name, sub: c.who, icon: VICON[c.virtue] ?? "fa-eye", card: creedCard(c) })),
      ...(B ? [{ key: "creed:bystander", name: B.name, sub: B.who, icon: "fa-user", card: () => ({ kicker: loc("Hunter.Creed"), text: p(B.text),
        facts: [fact(loc("Hunter.Conviction"), B.conviction), fact(loc("Atlas.Virtues"), Object.values(B.virtues ?? {}).join(", "))].filter(Boolean) }) }] : [])] },
    // Добродетели охоты: чьи кредо и какие пути Граней на ней стоят
    { key: "virtues", label: loc("Atlas.Virtues"), items: Object.entries(V).map(([k, name]) => ({ key: `virtue:${k}`, name, icon: VICON[k] ?? "fa-eye",
      card: () => ({ kicker: loc("Atlas.Virtue"), lore: lore("hunter", "virtue", k), chips: (D.creeds ?? []).filter(c => c.virtue === k).map(c => ({ label: c.name })),
        sections: [...new Set((D.edges ?? []).filter(e => e.virtue === k).map(e => e.path))].map(path => ({ title: (D.creeds ?? []).find(c => c.key === path)?.name ?? path, rows: edges(path).map(edgeRow) })) }) })) }
  ].filter(g => g.items.length);
}

/* ── Призрак ─────────────────────────────────────────────────────────── */
function wraithGroups() {
  const D = WR(), A = k => (D.arcanoi ?? []).find(a => a.key === k);
  const attr = k => game.i18n.localize(`VTM20.Attr.${k}`);
  return [
    { key: "arcanoi", label: loc("Wraith.Arcanoi"), items: (D.arcanoi ?? []).map(a => ({ key: `arc:${a.key}`, name: a.name, sub: `${a.guild || loc(`Wraith.GuildGroup.${a.group}`)} · ${a.en}`, sym: arcSym(a.key),
      card: () => ({ kicker: `${loc(`Wraith.GuildGroup.${a.group}`)}${a.forbidden ? ` · ${loc("Wraith.Forbidden")}` : ""}`, text: a.html,
        facts: [a.guild && fact(loc("Wraith.Guild"), `${a.guild} (${a.guildEn})`), fact(loc("Atlas.Attributes"), a.attrs.map(attr).join(", ")),
          fact(loc("Atlas.Allies"), (a.allies ?? []).map(k => A(k)?.guild).filter(Boolean).join(", "))].filter(Boolean),
        sections: [{ title: loc("Wraith.Arcanoi"), n: a.levels.length, rows: a.levels.map(l => ({ lvl: ROMAN[l.level], name: l.name,
          em: `${loc(l.kind === "common" ? "Wraith.Common" : "Wraith.Initiate")}${l.en ? ` · ${l.en}` : ""}`, html: l.html })) }] }) })) },
    { key: "legions", label: loc("Wraith.Legions"), items: (D.legions ?? []).map(l => ({ key: `legion:${l.key}`, name: l.name, sub: l.en, sym: legionSym(l.key),
      card: () => ({ kicker: loc("Wraith.Legion"), lore: lore("wraith", "legion", l.key), facts: [fact(loc("Wraith.LegionDeath"), l.death), fact(loc("Atlas.Lord"), l.lord), fact(loc("Atlas.Seat"), l.seat)].filter(Boolean) }) })) },
    { key: "shadow", label: loc("Wraith.ShadowArchetype"), items: (D.shadowArchetypes ?? []).map((x, i) => ({ key: `shadow:${i}`, name: x.name, sub: x.en, icon: "fa-mask",
      card: () => ({ kicker: loc("Wraith.Shadow"), text: p(x.text), facts: [fact(loc("Wraith.Catharsis"), x.catharsis !== "—" && x.catharsis)].filter(Boolean) }) })) },
    { key: "thorns", label: loc("Wraith.Thorns"), items: (D.thorns ?? []).map(x => ({ key: `thorn:${x.key}`, name: x.name, sub: x.en, icon: "fa-spa",
      card: () => ({ kicker: loc("Wraith.Thorns"), text: x.html, facts: [fact(loc("Atlas.Cost"), x.costText)].filter(Boolean) }) })) },
    { key: "archetypes", label: loc("Atlas.Archetypes"), items: (D.archetypes ?? []).map((x, i) => ({ key: `arch:${i}`, name: x.name, sub: x.en, icon: "fa-user",
      card: () => ({ kicker: loc("Atlas.Archetype"), facts: [fact(loc("Atlas.WillRegain"), x.will)].filter(Boolean) }) })) },
    { key: "backgrounds", label: loc("Wraith.Backgrounds"), items: (D.backgrounds ?? []).map((x, i) => ({ key: `bg:${i}`, name: x.name, sub: x.en, icon: "fa-book",
      card: () => ({ kicker: loc("Atlas.Background"), text: x.html }) })) }
  ].filter(g => g.items.length);
}

/* ── Подменыш ──────────────────────────────────────────────────────────── */
function changelingGroups() {
  const D = CL(), realm = k => (D.realms ?? []).find(r => r.key === k)?.name ?? k;
  const g = (kind, key) => CLG.clGlyph(kind, key) ?? undefined;
  const TYPE = { chimerical: "Changeling.Type.chimerical", wyrd: "Changeling.Type.wyrd", choice: "Changeling.Type.choice" };
  return [
    { key: "kiths", label: loc("Changeling.Atlas.Kiths"), items: (D.kiths ?? []).map(k => ({ key: `kith:${k.key}`, name: k.name, sub: k.en, icon: "fa-wand-sparkles", sym: CLG.kithGlyph(k.key) ?? undefined,
      card: () => ({ kicker: loc("Changeling.Kith"), text: k.html }) })) },
    { key: "other", label: loc("Changeling.Atlas.Other"), items: (D.otherKiths ?? []).map(k => ({ key: `ofae:${k.key}`, name: k.name, sub: `${k.en} · ${loc(`Changeling.OtherFae.${k.group}`)}`, icon: "fa-masks-theater", sym: CLG.kithGlyph(k.key) ?? undefined,
      card: () => ({ kicker: loc(`Changeling.OtherFae.${k.group}`), text: k.html, facts: [fact(loc("ClCr.Affinity"), k.affinity ? realm(k.affinity) : "")].filter(Boolean) }) })) },
    { key: "houses", label: loc("Changeling.Atlas.Houses"), items: (D.houses ?? []).map(h => ({ key: `house:${h.key}`, name: h.name, sub: `${h.en} · ${h.courtText ?? ""}`, icon: "fa-crown", sym: g("house", h.key),
      card: () => ({ kicker: loc("Changeling.House"), text: h.html || p(h.short),
        facts: [fact(loc("Changeling.CourtLabel"), h.courtText), fact(loc("Changeling.Atlas.Nick"), h.nick), fact(loc("ClCr.Boon"), h.boon), fact(loc("ClCr.HouseFlaw"), h.flaw)].filter(Boolean) }) })) },
    { key: "legacies", label: loc("Changeling.Atlas.Legacies"), items: (D.legacies ?? []).map(l => ({ key: `legacy:${l.key}`, name: l.name, sub: `${l.en} · ${loc(`Changeling.Court.${l.court}`)}`, icon: l.court === "seelie" ? "fa-sun" : "fa-moon", sym: g("court", l.court),
      card: () => ({ kicker: loc(l.court === "seelie" ? "Changeling.LegacySeelie" : "Changeling.LegacyUnseelie"), tag: l.text, lore: lore("changeling", "legacy", l.key), text: lore("changeling", "legacy", l.key) ? Codex["line-lore"]?.changeling?.rules ?? "" : p(l.text),
        facts: [fact(loc("ClCr.Quest"), l.quest), fact(loc("ClCr.Ban"), l.ban)].filter(Boolean) }) })) },
    { key: "arts", label: loc("Changeling.Arts"), items: (D.arts ?? []).map(a => ({ key: `art:${a.key}`, name: a.name, sub: a.en, icon: "fa-wand-sparkles", sym: g("art", a.key),
      card: () => ({ kicker: loc("Changeling.Art"), text: a.html,
        facts: [fact(loc("Changeling.Atlas.Unleashing"), a.unleashing), fact(loc("Changeling.Bunk"), a.bunks)].filter(Boolean),
        sections: [{ title: loc("Changeling.Arts"), n: a.levels.length, rows: a.levels.map(l => ({ lvl: ROMAN[l.level], name: l.name, em: [l.en, TYPE[l.type] ? loc(TYPE[l.type]) : ""].filter(Boolean).join(" · "), html: l.html })) }] }) })) },
    { key: "realms", label: loc("Changeling.Realms"), items: (D.realms ?? []).map(r => ({ key: `realm:${r.key}`, name: r.name, sub: r.en, icon: "fa-compass", sym: g("realm", r.key),
      card: () => ({ kicker: loc(r.modifier ? "Changeling.Modifiers" : "Changeling.Realms"), text: r.html,
        sections: [{ title: realm(r.key), n: r.levels.length, rows: r.levels.map(l => ({ lvl: ROMAN[l.level], name: l.name, em: l.en ?? "", html: l.html ?? p(l.text) })) }] }) })) },
    { key: "backgrounds", label: loc("Wraith.Backgrounds"), items: (D.backgrounds ?? []).map((x, i) => ({ key: `bg:${i}`, name: x.name, sub: x.en, icon: "fa-book",
      card: () => ({ kicker: loc("Atlas.Background"), text: x.html }) })) },
    // C20 Players Guide: тайные общества и Теневой Двор
    { key: "societies", label: loc("Changeling.Societies"), items: SOCIETIES.map(x => ({ key: `society:${x.key}`, name: x.name, sub: x.en, icon: "fa-user-secret",
      card: () => ({ kicker: loc("Changeling.Society"), text: p(x.text),
        facts: [fact(loc("Changeling.SocietyBoon"), x.boon), fact(loc("Changeling.SocietyBan"), x.ban), fact(loc("Changeling.SocietyReq"), x.req)].filter(Boolean) }) })) },
    { key: "shadow", label: loc("Changeling.ShadowCourt"), items: SHADOW_COURT.map(x => ({ key: `shadow:${x.key}`, name: x.name, sub: x.en,
      icon: x.kind === "background" ? "fa-book" : x.kind === "flaw" ? "fa-circle-minus" : "fa-circle-plus",
      card: () => ({ kicker: loc(x.kind === "background" ? "Atlas.Background" : x.kind === "flaw" ? "Atlas.Flaw" : "Atlas.Merit"), text: p(x.text),
        facts: [fact(loc("Atlas.Cost"), x.cost)].filter(Boolean),
        sections: x.levels ? [{ title: x.name, n: x.levels.length, rows: x.levels.map((l, i) => ({ lvl: ROMAN[i + 1], name: l.split(":")[0], html: p(l.split(":").slice(1).join(":").trim()) })) }] : [] }) })) }
  ].filter(g => g.items.length);
}

/* ── Гули и ревенанты (V20 Ghouls & Revenants) ─────────────────────────── */
const meritRow = m => ({ key: `merit:${m.en || m.name}`, name: m.name, sub: [m.en, loc(m.kind === "flaw" ? "Atlas.Flaw" : "Atlas.Merit")].filter(Boolean).join(" · "),
  icon: m.kind === "flaw" ? "fa-circle-minus" : "fa-circle-plus",
  card: () => ({ kicker: loc(m.kind === "flaw" ? "Atlas.Flaw" : "Atlas.Merit"), text: m.html ?? p(m.text),
    facts: [fact(loc("Atlas.Cost"), m.cost), fact(loc("Atlas.Category"), m.category ? loc(`Atlas.Cat.${m.category}`) : "")].filter(Boolean) }) });
// страница правил; вступление без абзаца («<strong>Источник:</strong> …» до первого <p>) — сноской сверху
const srcNote = html => String(html ?? "").replace(/^\s*(<(?:strong|em|b)>[\s\S]*?)(?=<(?:p|h\d|ul|table)[\s>])/, '<p class="r-at-src">$1</p>');
const pages = (key, src) => (src?.pages ?? []).filter(x => x.html).map((x, i) => ({ key: `${key}:${i}`, name: x.name, icon: "fa-book-open",
  card: () => ({ kicker: src.name, text: srcNote(x.html) }) }));

function ghoulGroups() {
  const rules = (Codex.ghoulRules ?? [])[0];
  const disc = k => Codex.discipline(k)?.name ?? k;
  return [
    { key: "families", label: loc("Atlas.Ghoul.Families"), items: Object.entries(REVENANT_FAMILIES).map(([k, f]) => ({ key: `family:${k}`, name: f.name, sub: [f.en, f.nick].filter(Boolean).join(" · "), icon: "fa-people-roof",
      card: () => ({ kicker: loc("Atlas.Ghoul.Family"), lore: f.html ?? p(f.text),
        chips: (f.disciplines ?? []).map(d => ({ label: disc(d), sym: Codex.disciplineSymbol(d) })),
        facts: [fact(loc("Atlas.Ghoul.Flaw"), f.flaw)].filter(Boolean) }) })) },
    { key: "rules", label: loc("Atlas.Ghoul.Rules"), items: pages("rule", rules) },
    { key: "merits", label: loc("Atlas.Ghoul.Merits"), items: (Codex["merits-ghouls"] ?? []).map(meritRow) }
  ].filter(g => g.items.length);
}

/* ── Дампиры (Accursed Heirs: Dhampirs — фанатское дополнение к V20) ───── */
function dhampirGroups() {
  const D = Codex.dhampir ?? {};
  const right = k => (D.bloodrights ?? []).find(b => b.key === k);
  const disc = k => Codex.discipline(k)?.name ?? k;
  return [
    { key: "rules", label: loc("Atlas.Ghoul.Rules"), items: pages("rule", D.rules) },
    { key: "concepts", label: loc("Atlas.Dh.Concepts"), items: (D.concepts ?? []).map(c => ({ key: `concept:${c.key}`, name: c.name, sub: [c.en, c.nick].filter(Boolean).join(" · "), icon: "fa-user",
      card: () => ({ kicker: loc("Atlas.Dh.Concept"), lore: c.html ?? p(c.text),
        facts: [fact(loc("Atlas.Advice"), c.tips)].filter(Boolean) }) })) },
    { key: "rights", label: loc("Atlas.Dh.Rights"), items: (D.bloodrights ?? []).map(b => ({ key: `right:${b.key}`, name: b.name, sub: b.en, icon: b.rare ? "fa-star" : "fa-droplet",
      card: () => ({ kicker: loc(b.rare ? "Atlas.Dh.RightRare" : "Atlas.Dh.Right"), lore: p(b.text),
        chips: b.req ? [{ label: `${loc("Atlas.Dh.Req")}: ${disc(b.req)}`, sym: Codex.disciplineSymbol(b.req) }] : [],
        sections: b.levels?.length ? [{ title: b.name, n: b.levels.length, rows: b.levels.map(l => ({ lvl: ROMAN[l.level] ?? l.level, name: l.name, em: [l.en, l.cost].filter(Boolean).join(" · "), html: p(l.text) })) }] : [] }) })) },
    { key: "rituals", label: loc("Atlas.Dh.Rituals"), items: (D.rituals ?? []).map(r => ({ key: `ritual:${r.key}`, name: r.name, sub: [r.en, r.level ? ROMAN[r.level] : ""].filter(Boolean).join(" · "), icon: "fa-hand-holding-droplet",
      card: () => ({ kicker: loc("Atlas.Dh.Ritual"), text: p(r.text), facts: [fact(loc("Atlas.Dh.Level"), r.level)].filter(Boolean) }) })) },
    { key: "clans", label: loc("Atlas.Dh.Clans"), items: Object.entries(D.clans ?? {}).map(([k, c]) => ({ key: `clan:${k}`, name: Codex.clanName(k), sub: c.nick, icon: "fa-shield-halved", sym: Codex.clanSymbol(k) ?? undefined,
      // клан Предка: его лор (data/clan-lore.json) — кто они, от чьей крови дампир
      card: () => ({ kicker: loc("Atlas.Dh.Clan"), lore: Codex["clan-lore"]?.[Codex.traitClan(k)] ?? Codex["clan-lore"]?.[k] ?? "", chips: (c.rights ?? []).map(r => ({ label: right(r)?.name ?? r })),
        facts: [fact(loc("Atlas.Dh.Weakness"), c.weakness)].filter(Boolean) }) })) },
    { key: "backgrounds", label: loc("Wraith.Backgrounds"), items: (D.backgrounds ?? []).map((x, i) => ({ key: `bg:${i}`, name: x.name, sub: x.en, icon: "fa-book",
      card: () => ({ kicker: loc("Atlas.Background"), text: x.html }) })) },
    { key: "merits", label: loc("Atlas.Ghoul.Merits"), items: (D.merits ?? []).map(meritRow) }
  ].filter(g => g.items.length);
}

const LINES = {
  mage: { groups: mageGroups, title: "VTM20.Atlas.MageTitle", icon: "fa-solid fa-hat-wizard", theme: "r-type-mage" },
  werewolf: { groups: wolfGroups, title: "VTM20.Atlas.WolfTitle", icon: "fa-solid fa-paw", theme: "r-type-werewolf" },
  hunter: { groups: hunterGroups, title: "VTM20.Atlas.HunterTitle", icon: "fa-solid fa-crosshairs", theme: "r-type-hunter" },
  wraith: { groups: wraithGroups, title: "VTM20.Atlas.WraithTitle", icon: "fa-solid fa-ghost", theme: "r-type-wraith" },
  changeling: { groups: changelingGroups, title: "VTM20.Atlas.ChangelingTitle", icon: "fa-solid fa-wand-sparkles", theme: "r-type-changeling" },
  ghoul: { groups: ghoulGroups, title: "VTM20.Atlas.GhoulTitle", icon: "fa-solid fa-droplet", theme: "r-type-vampire" },
  dhampir: { groups: dhampirGroups, title: "VTM20.Atlas.DhampirTitle", icon: "fa-solid fa-moon", theme: "r-type-vampire" }
};

/** Справочники линеек для общего окна «Справочники» (module/apps/lore-search.mjs): ключ, заголовок, значок. */
export const ATLAS_LINES = Object.entries(LINES).map(([line, L]) => ({ line, title: L.title, icon: L.icon }));

/**
 * Все записи справочников линеек для общего поиска: линейка, группа, ключ, имя и текст карточки
 * (предание, правила, факты, имена Даров/Граней/уровней) — разметка снимается в поиске.
 */
export async function atlasEntries() {
  await Codex.load();
  if (!Codex.ghoulRules) Codex.ghoulRules = await fetch(`${SYSTEM_PATH}/data/rules-ghouls.json`).then(r => r.json()).catch(() => []);
  const out = [];
  for (const [line, L] of Object.entries(LINES)) {
    let groups = [];
    try { groups = L.groups(); } catch (e) { console.warn(`VTM20 | справочник ${line}:`, e); }
    for (const g of groups) for (const x of g.items) {
      let c = {};
      try { c = x.card(); } catch { /* карточка без данных — ищем по имени */ }
      const rows = (c.sections ?? []).flatMap(s => s.rows ?? []).map(r => [r.name, r.em].filter(Boolean).join(" ")).join(" · ");
      out.push({ line, title: L.title, group: g.label, key: x.key, name: x.name, sub: x.sub ?? "", sym: x.sym, icon: x.icon,
        text: [c.nick, c.tag, c.lore, c.text, ...(c.facts ?? []).map(f => `${f.label}: ${f.value}`), (c.chips ?? []).map(ch => ch.label).join(", "), rows].filter(Boolean).join(" \n ") });
      // строки карточки (Дары, Грани, уровни Арканои и Искусств) — отдельными записями: «где» — раздел и карточка
      for (const s of c.sections ?? []) for (const r of s.rows ?? []) if (r.name && r.html)
        out.push({ line, title: L.title, row: true, group: `${s.title} · ${x.name}`, parent: x.name, key: x.key, name: r.name, sub: r.em ?? "", sym: r.sym ?? x.sym, icon: x.icon, lvl: r.lvl, text: r.html });
    }
  }
  return out;
}

/** Открыть справочник линейки («mage», «werewolf») на записи key; открытое окно переключается. */
export async function openAtlas(line, key = "") {
  if (!LINES[line]) return null;
  await Codex.load();
  // правила книги Ghouls & Revenants — только для справочника (в Codex не грузятся)
  if (line === "ghoul" && !Codex.ghoulRules) Codex.ghoulRules = await fetch(`${SYSTEM_PATH}/data/rules-ghouls.json`).then(r => r.json()).catch(() => []);
  const id = `r-atlas-${line}`, open = foundry.applications.instances.get(id);
  if (open) { if (key) open.show(key); open.bringToFront(); return open; }
  return new LineAtlas(line, key).render({ force: true });
}

class LineAtlas extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-dialog", "r-clans", "r-atlas"],
    window: { resizable: true },
    position: { width: 920, height: 700 },
    actions: { pick: LineAtlas.#onPick, group: LineAtlas.#onGroup }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/apps/atlas.hbs`, scrollable: [".r-cl-list", ".r-cl-card"] } };

  constructor(line, key) {
    const L = LINES[line];
    super({ id: `r-atlas-${line}`, classes: [L.theme], window: { title: L.title, icon: L.icon } });
    this.line = line;
    this.groups = L.groups();
    this.v = { group: this.groups[0]?.key ?? "", key: "", q: "" };
    this.show(key, false);
  }

  /** Перейти на запись: её группа открывается сама; ключ без приставки — фракция, племя или род. */
  show(key, render = true) {
    const hit = this.groups.flatMap(g => g.items.map(x => [g, x])).find(([, x]) => x.key === key || x.key.endsWith(`:${key}`));
    if (hit) Object.assign(this.v, { group: hit[0].key, key: hit[1].key });
    else if (!this.v.key) this.v.key = this.groups[0]?.items[0]?.key ?? "";
    if (render) this.render();
  }

  async _prepareContext() {
    const v = this.v, g = this.groups.find(x => x.key === v.group) ?? this.groups[0];
    const item = g?.items.find(x => x.key === v.key) ?? g?.items[0];
    return {
      v, groups: this.groups.map(x => ({ key: x.key, label: x.label, n: x.items.length, active: x === g })),
      list: (g?.items ?? []).map(x => ({ key: x.key, name: x.name, sub: x.sub, sym: x.sym, icon: x.icon, active: x === item, text: `${x.name} ${x.sub ?? ""}`.toLowerCase() })),
      card: item ? { name: item.name, en: item.sub, sym: item.sym, icon: item.icon, ...item.card() } : null
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    // поиск по списку — без перерисовки окна
    const input = this.element.querySelector(".r-cl-search");
    const filter = () => {
      const q = (this.v.q = input.value.trim().toLowerCase());
      let n = 0;
      for (const li of this.element.querySelectorAll(".r-cl-item")) { const on = !q || li.dataset.text.includes(q); li.hidden = !on; n += on; }
      const empty = this.element.querySelector(".r-cl-empty"); if (empty) empty.hidden = n > 0;
    };
    input?.addEventListener("input", filter);
    if (this.v.q) filter();
  }

  static #onPick(event, target) { this.v.key = target.dataset.key; this.render(); }
  static #onGroup(event, target) {
    const g = this.groups.find(x => x.key === target.dataset.group);
    if (g) Object.assign(this.v, { group: g.key, key: g.items[0]?.key ?? "", q: "" });
    this.render();
  }
}
