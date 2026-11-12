// module/apps/atlas.mjs
// Справочник линейки по щелчку на знаке листа — как справочник кланов у Сородичей и Домов у падших:
// слева группы и список со знаками, справа карточка. Разметка и стили — справочника кланов (r-cl-*).
//   маг      — Традиции, Технократия, Ремёсла (родовая Сфера, практики, Дома и течения), Сферы по рангам, Сущности, парадигмы, практики
//   охотник   — кредо (Добродетель, Убеждённость, Грани пути), Добродетели охоты
//   оборотень — племена, породы, аугурии, Фера (числа создания, начальные Дары, Дары по рангам)
//   призрак   — Арканои (Гильдия, союзники, уровни Общие и Посвящённые), Легионы, архетипы Тени и Психеи, Шипы, Фоны
// Данные — data/mage.json и data/werewolf.json (пересказ справочника), своей механики тут нет.

import { SYSTEM_PATH } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { M, mageGlyphSrc, subLabel, factionGlyph } from "./mage.mjs";
import { W, wwGlyphSrc } from "./werewolf.mjs";
import { H } from "./hunter.mjs";
import { W as WR, arcSym, legionSym } from "./wraith.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const loc = k => game.i18n.localize(`VTM20.${k}`);
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI"];
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const p = s => s ? (/^\s*</.test(s) ? s : `<p>${esc(s)}</p>`) : "";
const fact = (label, value) => value || value === 0 ? { label, value } : null;

/* ── Маг ─────────────────────────────────────────────────────────────── */
function mageGroups() {
  const D = M(), mg = n => ({ src: mageGlyphSrc(n) });
  const sphere = k => (D.spheres ?? []).find(s => s.key === k);
  const factions = g => (D.factions ?? []).filter(f => f.group === g.key).map(f => ({
    key: f.key, name: f.name, sub: f.en, sym: mg(factionGlyph(f)),
    card: () => ({
      kicker: g.name, facts: [fact(loc("Mage.Affinity"), f.affinityText), fact(loc("Mage.Practice"), f.practices)].filter(Boolean),
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
      card: () => ({ kicker: `${loc("Atlas.Qliph")} ${q.n}`, nick: q.title,
        facts: [fact(loc("Atlas.Sphere"), sphere(q.sphere)?.name), fact(loc("Atlas.Influence"), q.influence)].filter(Boolean) }) })) },
    // колдуны и консоры (M20 Sorcerer; Gods & Monsters)
    { key: "sorcPaths", label: loc("Sorcerer.Paths"), items: (D.sorcerer?.paths ?? []).map(x => ({ key: `path:${x.key}`, name: x.name, sub: x.en, icon: "fa-route", card: () => ({ kicker: loc("Sorcerer.Path"), text: x.html }) })) },
    { key: "sorcPsychic", label: loc("Sorcerer.PsychicShort"), items: (D.sorcerer?.psychic ?? []).map(x => ({ key: `psy:${x.key}`, name: x.name, sub: x.en, icon: "fa-brain", card: () => ({ kicker: loc("Sorcerer.Psychic"), text: x.html }) })) },
    { key: "sorcAff", label: loc("Sorcerer.Affiliations"), items: (D.sorcerer?.affiliations ?? []).map(x => ({ key: `aff:${x.key}`, name: x.name, sub: x.en, icon: "fa-people-group",
      card: () => ({ kicker: loc("Sorcerer.Affiliation"), text: p(x.text), facts: [fact(loc("Sorcerer.FavAttrs"), x.attrs), fact(loc("Sorcerer.FavPaths"), x.paths)].filter(Boolean) }) })) },
    { key: "consors", label: loc("Sorcerer.Consors"), items: (D.sorcerer?.consor?.roles ?? []).map(x => ({ key: `consor:${x.key}`, name: x.name, sub: x.en, icon: "fa-user-group", card: () => ({ kicker: loc("Sorcerer.Consor"), text: p(x.text) }) })) },
    { key: "essences", label: loc("Atlas.Essences"), items: (D.essences ?? []).map(e => ({
      key: `essence:${e.key}`, name: e.name, sub: e.en, icon: "fa-sun", card: () => ({ kicker: loc("Mage.Essence"), text: p(e.text) }) })) },
    { key: "paradigms", label: loc("Atlas.Paradigms"), items: (D.focus?.paradigms ?? []).map((x, i) => ({
      key: `paradigm:${i}`, name: x.name, sub: x.en, icon: "fa-eye", card: () => ({ kicker: loc("Mage.Paradigm"), text: p(x.text) }) })) },
    { key: "practices", label: loc("Atlas.Practices"), items: (D.focus?.practices ?? []).map((x, i) => ({
      key: `practice:${i}`, name: x.name, sub: x.en, icon: "fa-hand-sparkles",
      card: () => ({ kicker: loc("Mage.Practice"), text: p(x.text),
        facts: [fact(loc("Mage.Paradigm"), x.paradigms), fact(loc("Atlas.Abilities"), x.abilities), fact(loc("Atlas.Instruments"), x.instruments)].filter(Boolean) }) })) }
  ].filter(g => g.items.length);
}

/* ── Оборотень ───────────────────────────────────────────────────────── */
function wolfGroups() {
  const D = W(), wg = n => ({ src: wwGlyphSrc(n) });
  const gift = k => (D.gifts ?? []).find(g => g.key === k);
  const giftRow = g => ({ lvl: ROMAN[g.level] ?? g.level, name: g.name, em: g.en, html: g.text ?? "" });
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
      card: () => ({ kicker: loc("Werewolf.Tribe"),
        facts: [fact(loc("Willpower"), x.willpower), fact(loc("Atlas.Totem"), x.totem), fact(loc("Atlas.Backgrounds"), x.backgrounds)].filter(Boolean),
        sections: secs([start(x.startGifts), own("tribe", x.key)]) }) })) },
    { key: "breeds", label: loc("Atlas.Breeds"), items: (D.breeds ?? []).map(x => ({
      key: `breed:${x.key}`, name: x.name, sub: x.en, sym: wg(`breed-${x.key}`),
      card: () => ({ kicker: loc("Werewolf.Breed"), nick: x.nick, text: p(x.notes), facts: [fact(loc("Werewolf.Gnosis"), x.gnosis)].filter(Boolean),
        sections: secs([start(x.startGifts), own("breed", x.key)]) }) })) },
    { key: "auspices", label: loc("Atlas.Auspices"), items: (D.auspices ?? []).map(x => ({
      key: `auspice:${x.key}`, name: x.name, sub: x.en, sym: wg(`auspice-${x.key}`),
      card: () => ({ kicker: loc("Werewolf.Auspice"), text: p(x.role), facts: [fact(loc("Werewolf.Rage"), x.rage), fact(loc("Atlas.Renown"), x.renownText)].filter(Boolean),
        sections: secs([start(x.startGifts), own("auspice", x.key)]) }) })) },
    { key: "fera", label: loc("Atlas.Fera"), items: (D.fera ?? []).map(x => ({
      key: `fera:${x.key}`, name: x.name, sub: x.en, sym: wg(`fera-${x.key}`),
      card: () => ({ kicker: loc("Atlas.FeraKind"), text: x.traits ?? "",
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
  const creedCard = c => () => ({ kicker: `${loc("Hunter.Creed")} · ${V[c.virtue] ?? c.virtue}`, text: p(c.text),
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
      card: () => ({ kicker: loc("Atlas.Virtue"), chips: (D.creeds ?? []).filter(c => c.virtue === k).map(c => ({ label: c.name })),
        sections: [...new Set((D.edges ?? []).filter(e => e.virtue === k).map(e => e.path))].map(path => ({ title: (D.creeds ?? []).find(c => c.key === path)?.name ?? path, rows: edges(path).map(edgeRow) })) }) })) }
  ].filter(g => g.items.length);
}

/* ── Призрак ─────────────────────────────────────────────────────────── */
function wraithGroups() {
  const D = WR(), A = k => (D.arcanoi ?? []).find(a => a.key === k);
  const attr = k => game.i18n.localize(`VTM20.Attr.${k}`);
  return [
    { key: "arcanoi", label: loc("Wraith.Arcanoi"), items: (D.arcanoi ?? []).map(a => ({ key: `arc:${a.key}`, name: a.name, sub: `${a.guild} · ${a.en}`, sym: arcSym(a.key),
      card: () => ({ kicker: `${loc(`Wraith.GuildGroup.${a.group}`)}${a.forbidden ? ` · ${loc("Wraith.Forbidden")}` : ""}`, text: a.html,
        facts: [fact(loc("Wraith.Guild"), `${a.guild} (${a.guildEn})`), fact(loc("Atlas.Attributes"), a.attrs.map(attr).join(", ")),
          fact(loc("Atlas.Allies"), (a.allies ?? []).map(k => A(k)?.guild).filter(Boolean).join(", "))].filter(Boolean),
        sections: [{ title: loc("Wraith.Arcanoi"), n: a.levels.length, rows: a.levels.map(l => ({ lvl: ROMAN[l.level], name: l.name,
          em: `${loc(l.kind === "common" ? "Wraith.Common" : "Wraith.Initiate")}${l.en ? ` · ${l.en}` : ""}`, html: l.html })) }] }) })) },
    { key: "legions", label: loc("Wraith.Legions"), items: (D.legions ?? []).map(l => ({ key: `legion:${l.key}`, name: l.name, sub: l.en, sym: legionSym(l.key),
      card: () => ({ kicker: loc("Wraith.Legion"), facts: [fact(loc("Wraith.LegionDeath"), l.death), fact(loc("Atlas.Lord"), l.lord), fact(loc("Atlas.Seat"), l.seat)].filter(Boolean) }) })) },
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

const LINES = {
  mage: { groups: mageGroups, title: "VTM20.Atlas.MageTitle", icon: "fa-solid fa-hat-wizard", theme: "r-type-mage" },
  werewolf: { groups: wolfGroups, title: "VTM20.Atlas.WolfTitle", icon: "fa-solid fa-paw", theme: "r-type-werewolf" },
  hunter: { groups: hunterGroups, title: "VTM20.Atlas.HunterTitle", icon: "fa-solid fa-crosshairs", theme: "r-type-hunter" },
  wraith: { groups: wraithGroups, title: "VTM20.Atlas.WraithTitle", icon: "fa-solid fa-ghost", theme: "r-type-wraith" }
};

/** Открыть справочник линейки («mage», «werewolf») на записи key; открытое окно переключается. */
export async function openAtlas(line, key = "") {
  if (!LINES[line]) return null;
  await Codex.load();
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
