// module/apps/npc-gen.mjs
// Генератор НПС для рассказчика.
//
//   · Слева — кто: Сородич, гуль, ревенант, дампир; смертный, праведник, охотник; Гару, Фера, Родня, Ками, фомор, дух;
//     падший, Привязанный, слуга; статблоки книги (охотники, преступники, звери, рои — V20, гл. 9).
//   · В середине — какой: выбор подвида (клан, поколение, секта; порода, аугурия, племя; кредо; Дом…; «случайно» — сам),
//     роль и её специализация (во что вложены точки и какие силы предпочтены — module/apps/npc-roles.mjs), уровень силы.
//   · Справа — досье черновика: ровно этот НПС и будет создан; «Перебросить» — другой с теми же условиями.
// Сборка по правилам создания линеек — module/apps/npc-build.mjs. Имена — наборы data/npc.json → names. Всё — в папку «НПС».

import { W as WR } from "./wraith.mjs";
import { VTM20, SYSTEM_PATH, SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { WEAPON_PRESETS, ARMOR_PRESETS } from "../data/equipment.mjs";
import { LibraryItems } from "./library.mjs";
import { weaponIcon, armorIcon } from "../data/icons.mjs";
import { makeExtra } from "./extras.mjs";
import { REVENANT_FAMILIES } from "../data/revenants.mjs";
import { W as WW } from "./werewolf.mjs";
import { H as HH } from "./hunter.mjs";
import { M as MM } from "./mage.mjs";
import { ROLES, ROLE_GROUPS, POWERS, roleOf, lab, subsForEra } from "./npc-roles.mjs";
import { KINDS, KIND_GROUPS, kindOf, buildNpc, npcView, createNpc, GROUPS, groupOf, buildGroup } from "./npc-build.mjs";

/** Заготовки рассказчика (настройка мира): имя и всё, что выбрано в окне. */
export function registerNpcPresets() {
  game.settings.register(SYSTEM_ID, "npcPresets", { scope: "world", config: false, type: Array, default: [] });
}
const presets = () => foundry.utils.deepClone(game.settings.get(SYSTEM_ID, "npcPresets") ?? []);

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const L = (k, d) => t(`NpcGen.${k}`, d);
const loc = k => game.i18n.localize(k);
const pick = list => list[Math.floor(Math.random() * list.length)];
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const ICON = type => `systems/${SYSTEM_ID}/assets/icons/${type}.svg`;
const norm = x => String(x ?? "").toLowerCase().replace(/ё/g, "е");

let DATA = null;
async function data() {
  DATA ??= await fetch(`${SYSTEM_PATH}/data/npc.json`).then(r => r.json());
  return DATA;
}
/** Звери справочника (Анимализм, Зов) и создание по статблоку (apps/target-powers.mjs). */
export async function animalTemplates() { return (await data()).templates.filter(x => x.group === "animals"); }
export const spawnFromTemplate = (tpl, o) => createFromTemplate(tpl, o);

/** Статблоки книги, которые остаются в генераторе: люди и звери; оборотни и падшие — полноценными листами, магов, фей и призраков пока нет. */
const BOOK_GROUPS = ["hunters", "criminals", "animals", "swarms"];

/** Случайное имя из набора: «Имя Фамилия»; у русских женская фамилия согласуется. */
function randomName(set, gender = "") {
  const g = gender || (Math.random() < .5 ? "m" : "f");
  let last = pick(set.last);
  if (set.femLast && g === "f") last = last.endsWith("ий") ? last.replace(/ий$/, "ая") : `${last}а`;
  return `${pick(set[g])} ${last}`;
}

/* ── Статблоки книги ───────────────────────────────────────────────────── */

/** Статблок текстом — в заметки НПС. */
function statText(tpl, { trained = false, ghoul = false } = {}) {
  const D = DATA;
  const p = (label, text) => text ? `<p><strong>${esc(label)}:</strong> ${esc(text)}</p>` : "";
  const lines = [];
  if (tpl.swarm) {
    lines.push(p(L("SwarmDamage"), String(tpl.swarm.damage)), p(L("SwarmHealth"), String(tpl.swarm.health)),
      p(L("SwarmInit"), String(tpl.swarm.initiative)), `<p>${esc(tpl.note)}</p>`);
  } else {
    if (tpl.humanityText && tpl.humanityText !== String(tpl.humanity)) lines.push(p(t("Humanity"), tpl.humanityText));
    if (tpl.pool) lines.push(p(tpl.pool.name[0].toUpperCase() + tpl.pool.name.slice(1), String(tpl.pool.value ?? "")));
    if (tpl.health) lines.push(p(L("HealthLevels"), tpl.health));
    if (tpl.attackText) lines.push(p(L("Attack"), tpl.attackText));
    if (tpl.bloodText) lines.push(p(L("BloodPool"), tpl.bloodText));
    if (tpl.equipment) lines.push(p(L("Equipment"), tpl.equipment));
    for (const n of tpl.notes ?? []) lines.push(`<p>${esc(n)}</p>`);
    if (tpl.note) lines.push(p(L("Note"), tpl.note));
    if (trained && Object.keys(tpl.trained ?? {}).length) lines.push(`<p><em>${esc(L("TrainedApplied"))}</em></p>`);
    if (ghoul) lines.push(`<p><em>${esc(D.animalRule)}</em></p>`);
  }
  lines.push(`<p class="r-muted">${esc(D.source)}${tpl.page ? `, ${esc(L("Page", { n: tpl.page }))}` : ""}</p>`);
  return lines.join("");
}

/** Один НПС по статблоку книги. */
async function createFromTemplate(tpl, { name, folder, trained = false, ghoul = false, gear = [] }) {
  const abil = { ...(tpl.abilities ?? {}) };
  if (trained) for (const [k, v] of Object.entries(tpl.trained ?? {})) if ((abil[k]?.value ?? 0) < v.value) abil[k] = v;
  const system = {
    attributes: Object.fromEntries(Object.keys(VTM20.attributes).map(k => [k, { value: tpl.attributes?.[k] ?? (tpl.swarm ? 1 : 0) }])),
    abilities: Object.fromEntries(Object.entries(abil).map(([k, v]) => [k, { value: v.value, specialty: v.specialty ?? "" }])),
    willpower: { permanent: tpl.willpower ?? 1, temporary: tpl.willpower ?? 1 },
    details: { concept: tpl.name },
    notes: statText(tpl, { trained, ghoul })
  };
  if (tpl.humanity != null) system.morality = { path: "humanity", value: tpl.humanity };
  const items = [];
  for (const [k, v] of Object.entries(tpl.disciplines ?? {})) items.push(LibraryItems.discipline(k, v));
  for (const at of tpl.attacks ?? []) items.push({ name: at.name, type: "weapon", img: weaponIcon(at.name, "brawl"),
    system: { kind: "brawl", damage: at.dice, strength: false, damageType: at.damageType, difficulty: 6 } });
  if (tpl.swarm) items.push({ name: L("SwarmAttack"), type: "weapon", img: ICON("weapon"),
    system: { kind: "brawl", damage: tpl.swarm.damage, strength: false, damageType: "lethal", difficulty: 6 } });
  items.push(...gear);
  let type = tpl.kind;
  if (ghoul) {
    // Зверь-гуль: воля, Мощь 1, 2 пункта крови (гл. 9)
    type = "ghoul";
    Object.assign(system, { ghoulType: "vassal", blood: { value: 2, max: 2 } });
    system.willpower = { permanent: Math.max(1, tpl.willpower ?? 1), temporary: Math.max(1, tpl.willpower ?? 1) };
    if (!items.some(i => i.type === "discipline" && i.system.key === "potence")) items.push(LibraryItems.discipline("potence", 1));
  } else if (type === "creature") {
    const blood = tpl.blood ?? 0;
    Object.assign(system, { kind: tpl.name, supernatural: tpl.supernatural ?? true, blood: { value: blood, max: blood } });
  }
  const a = await Actor.create({ name, type, folder, img: ICON(type === "creature" ? "creature" : type), system, flags: { [SYSTEM_ID]: { created: true } } });
  if (items.length) await a.createEmbeddedDocuments("Item", items);
  return a;
}

/* ── Выбор подвида: поля «случайно / …» ─────────────────────────────────── */

const opt = (value, label, cur) => ({ value, label, selected: String(value) === String(cur ?? "") });
const any = cur => opt("", L("AnyPick"), cur);

/** Поля выбора для подвида: [{ name, label, options | groups }]. */
function paramFields(kind, p) {
  const F = [];
  const D = WW(), Dh = Codex.dhampir ?? { clans: {}, concepts: [] };
  const clanField = label => ({ name: "clan", label, groups: Codex.clanGroups().map(g => ({ label: g.label,
    options: g.clans.filter(c => Codex.visible(c)).map(c => opt(c.key, c.name, p.clan)) })).filter(g => g.options.length), lead: [any(p.clan)] });
  switch (kind) {
    case "vampire":
      F.push(clanField(L("Clan")));
      F.push({ name: "generation", label: L("Generation"), options: [opt("", L("GenByPower"), p.generation),
        ...Object.keys(VTM20.generations).map(Number).filter(g => g >= 4).sort((a, b) => a - b).map(g => opt(g, t("GenerationN", { n: g }), p.generation))] });
      F.push({ name: "sect", label: L("Sect"), options: [any(p.sect), ...["camarilla", "sabbat", "anarchs", "independent", "autarkis"].map(s => opt(s, loc(`VTM20.Sect.${s}`), p.sect))] });
      break;
    case "ghoul":
      F.push({ name: "ghoulType", label: L("GhoulKind"), options: [any(p.ghoulType), ...["vassal", "independent"].map(k => opt(k, loc(`VTM20.GhoulType.${k}`), p.ghoulType))] });
      F.push(clanField(L("DomitorClan")));
      break;
    case "revenant":
      F.push({ name: "family", label: L("Family"), options: [any(p.family), ...Object.entries(REVENANT_FAMILIES).map(([k, f]) => opt(k, `${f.name} — ${f.nick}`, p.family))] });
      break;
    case "dhampir":
      F.push({ name: "clan", label: L("Antecedent"), options: [any(p.clan), ...Object.keys(Dh.clans ?? {}).map(k => opt(k, Codex.clanName(k), p.clan))] });
      F.push({ name: "concept", label: L("DhConcept"), options: [any(p.concept), ...(Dh.concepts ?? []).map(c => opt(c.key, c.name, p.concept))] });
      break;
    case "hunter":
      F.push({ name: "creed", label: L("Creed"), options: [any(p.creed), ...HH().creeds.filter(c => c.key !== "bystander").map(c => opt(c.key, c.name, p.creed))] });
      break;
    case "mage": case "technocrat": case "nephandus": {
      const groups = { mage: ["traditions", "disparates"], technocrat: ["technocracy"], nephandus: ["nephandi"] }[kind];
      const M = MM(), list = (M.factions ?? []).filter(f => groups.includes(f.group)), f = list.find(x => x.key === p.faction);
      F.push({ name: "faction", label: loc("VTM20.Mage.Faction"), options: [any(p.faction), ...list.map(x => opt(x.key, x.name, p.faction))] });
      F.push({ name: "affinity", label: loc("VTM20.Mage.Affinity"), options: [any(p.affinity), ...(M.spheres ?? []).filter(x => !f?.affinity?.length || f.affinity.includes(x.key))
        .map(x => opt(x.key, (kind === "technocrat" && x.tech?.name) || x.name, p.affinity))] });
      break;
    }
    case "sorcerer":
      F.push({ name: "affiliation", label: loc("VTM20.Sorcerer.Affiliation"), options: [any(p.affiliation), ...(MM().sorcerer?.affiliations ?? []).map(x => opt(x.key, x.name, p.affiliation))] });
      break;
    case "consor":
      F.push({ name: "role", label: loc("VTM20.Sorcerer.Role"), options: [any(p.role), ...(MM().sorcerer?.consor?.roles ?? []).map(x => opt(x.key, x.name, p.role))] });
      F.push({ name: "faction", label: loc("VTM20.Sorcerer.Side"), options: [any(p.faction), ...(MM().factions ?? []).map(x => opt(x.key, x.name, p.faction))] });
      break;
    case "garou":
      F.push({ name: "breed", label: L("Breed"), options: [any(p.breed), ...D.breeds.map(x => opt(x.key, x.name, p.breed))] });
      F.push({ name: "auspice", label: L("Auspice"), options: [any(p.auspice), ...D.auspices.map(x => opt(x.key, x.name, p.auspice))] });
      F.push({ name: "tribe", label: L("Tribe"), options: [any(p.tribe), ...D.tribes.map(x => opt(x.key, x.name, p.tribe))] });
      break;
    case "fera": {
      F.push({ name: "fera", label: L("FeraKind"), options: [any(p.fera), ...(D.fera ?? []).map(b => opt(b.key, VTM20.label(b), p.fera))] });
      const fera = (D.fera ?? []).find(b => b.key === p.fera);
      for (const d of (fera?.dims ?? []).filter(d => d.options.length))
        F.push({ name: `sub.${d.key}`, label: d.label, options: [any(p.sub?.[d.key]), ...d.options.map(o => opt(o.key, VTM20.label(o), p.sub?.[d.key]))] });
      break;
    }
    case "kinfolk":
      F.push({ name: "tribe", label: L("Tribe"), options: [any(p.tribe), ...D.tribes.map(x => opt(x.key, x.name, p.tribe))] });
      break;
    case "kami":
      F.push({ name: "kami", label: L("KamiForm"), options: [any(p.kami), ...["human", "animal", "plant"].map(k => opt(k, loc(`VTM20.Werewolf.Kami.form.${k}`), p.kami))] });
      break;
    case "fomor":
      F.push({ name: "fomor", label: L("FomorBreed"), options: [any(p.fomor), ...(D.fomori?.breeds ?? []).map(b => opt(b.key, b.name, p.fomor))] });
      break;
    case "spirit": {
      const kinds = [...new Set((D.spirits ?? []).map(s => s.kind))];
      F.push({ name: "spiritKind", label: L("SpiritKind"), options: [any(p.spiritKind), ...kinds.map(k => opt(k, loc(`VTM20.Werewolf.Spirit.kind.${k}`), p.spiritKind))] });
      F.push({ name: "spirit", label: L("SpiritTpl"), options: [any(p.spirit), ...(D.spirits ?? []).filter(s => !p.spiritKind || s.kind === p.spiritKind).map(s => opt(s.key, s.name, p.spirit))] });
      break;
    }
    case "doomslayer":
      F.push({ name: "order", label: loc("VTM20.Wraith.Doom.Order"), options: [any(p.order), ...["thorn", "division", "helldivers", "darksiders", "solos"].map(k => opt(k, loc(`VTM20.Wraith.Doom.${k}`), p.order))] });
      break;
    case "plasmic": {
      const Dw = WR();
      F.push({ name: "plasmic", label: loc("VTM20.Wraith.Plasmic"), options: [any(p.plasmic), ...(Dw.plasmics ?? []).map(x => opt(x.key, `${x.name} (${x.en})`, p.plasmic))] });
      break;
    }
    case "wraith": case "spectre": case "risen": case "projector": {
      const Dw = WR();
      F.push({ name: "legion", label: loc("VTM20.Wraith.Legion"), options: [any(p.legion), ...(Dw.legions ?? []).map(l => opt(l.key, l.name, p.legion))] });
      if (kind === "spectre") F.push({ name: "caste", label: loc("VTM20.Wraith.Spectre.Caste"), options: [any(p.caste), ...(Dw.castes ?? []).map(c => opt(c.key, c.name, p.caste))] });
      else if (kind === "projector") F.push({ name: "shade", label: loc("VTM20.Wraith.Proj.ShadeLabel"), options: [any(p.shade), ...(Dw.shades ?? []).map(x => opt(x.key, `${x.name} (${x.en})`, p.shade))] });
      else F.push({ name: "guild", label: loc("VTM20.Wraith.Guild"), options: [any(p.guild), ...(Dw.arcanoi ?? []).filter(a => a.guild).map(a => opt(a.key, `${a.guild} — ${a.name}`, p.guild))] });
      break;
    }
    case "group":
      F.push({ name: "group", label: L("GroupKind"), options: GROUPS.map(g => opt(g.key, lab(`Group.${g.key}`, g.label), p.group || GROUPS[0].key)) });
      break;
    case "demon": case "earthbound":
      F.push({ name: "house", label: L("House"), options: [any(p.house), ...Codex.houses.map(h => opt(h.key, h.name, p.house))] });
      F.push({ name: "faction", label: L("Faction"), options: [any(p.faction), ...Codex.factions.map(f => opt(f.key, f.name, p.faction))] });
      break;
  }
  return F;
}

/**
 * Оружие по боевым навыкам (2+ точки): стрелковое — по Огнестрельному оружию, холодное — по Фехтованию; эпоха — из настроек.
 * Духам, оборотням и зверям — ничего (у них свои атаки). Ссылки — как у ручного выбора («w:индекс»).
 */
const KIT = {
  revolution: { gun: [["Кремнёвый пистолет", 2], ["Мушкет «Шарлевиль»", 4]], blade: [["Кинжал", 2], ["Шпага", 3]] },
  modern: { gun: [["Лёгкий пистолет", 2], ["Тяжёлый пистолет", 4]], blade: [["Нож", 2], ["Бита", 3]] }
};
const ARMED = new Set(["vampire", "ghoul", "mortal", "hunter", "demon"]);
function autoKit(d) {
  if (!d || d.spirit || d.plasmic || !ARMED.has(d.actor)) return [];
  const ab = k => Number(d.system?.abilities?.[k]?.value ?? 0);
  const kit = KIT[game.settings.get(SYSTEM_ID, "era")] ?? KIT.revolution;
  const ref = name => { const i = WEAPON_PRESETS.findIndex(w => w.name === name && !w.era); return i < 0 ? null : `w:${i}`; };
  const best = (list, n) => list.filter(([, min]) => n >= min).at(-1)?.[0];
  return [best(kit.gun, ab("firearms")), best(kit.blade, ab("melee"))].filter(Boolean).map(ref).filter(Boolean);
}

/* ── Окно ──────────────────────────────────────────────────────────────── */

export class NpcGenerator extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.ng = { kind: "vampire", role: "", sub: "", power: "normal", params: {}, count: 1, as: "sheet", names: "fr", gender: "", name: "", open: true,
      template: "", trained: false, ghoul: false, search: "", extra: [], auto: [] };
    this.draft = null;
    this.draftName = "";
  }

  static DEFAULT_OPTIONS = {
    id: "r-npc-gen",
    classes: ["vtm20", "r-npc-gen"],
    tag: "form",
    window: { title: "VTM20.NpcGen.Title", icon: "fa-solid fa-users-viewfinder", resizable: true },
    position: { width: 1180, height: 820 },
    form: { handler: NpcGenerator.#onForm, submitOnChange: true, closeOnSubmit: false },
    actions: {
      kind: NpcGenerator.#onKind, role: NpcGenerator.#onRole, sub: NpcGenerator.#onSub, power: NpcGenerator.#onPower,
      reroll: NpcGenerator.#onReroll, surprise: NpcGenerator.#onSurprise, pick: NpcGenerator.#onPick, rollName: NpcGenerator.#onRollName,
      create: NpcGenerator.#onCreate, gearAdd: NpcGenerator.#onGearAdd, gearDrop: NpcGenerator.#onGearDrop,
      presetSave: NpcGenerator.#onPresetSave, presetLoad: NpcGenerator.#onPresetLoad, presetDrop: NpcGenerator.#onPresetDrop
    }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/apps/npc-gen.hbs`, scrollable: [".r-ng-rail", ".r-ng-build", ".r-ng-dossier"] } };

  get isBook() { return this.ng.kind === "book"; }
  get template() { return this.isBook ? DATA?.templates.find(x => x.key === this.ng.template) ?? null : null; }

  /** Черновик по текущим условиям (пересобирается, когда условия меняются). */
  get isGroup() { return this.ng.kind === "group"; }

  #ensureDraft() {
    if (this.isBook || this.draft) return;
    const s = this.ng;
    if (this.isGroup) {
      try {
        const list = buildGroup(s.params.group || GROUPS[0].key, s.power);
        this.draft = { group: true, list, names: list.map(d => d.spirit || d.plasmic ? d.name : randomName(DATA.names[s.names], s.gender)) };
      } catch (err) { console.error(err); this.draft = null; ui.notifications.error(L("BuildFailed")); }
      return;
    }
    try {
      this.draft = buildNpc({ kind: s.kind, role: s.role, sub: s.sub, power: s.power, params: s.params });
    } catch (err) {
      console.error(err);
      this.draft = null;
      ui.notifications.error(L("BuildFailed"));
      return;
    }
    this.draftName = this.draft.spirit || this.draft.plasmic ? this.draft.name : randomName(DATA.names[s.names], s.gender);
    s.auto = autoKit(this.draft);
  }
  #reset() { this.draft = null; }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const input = this.element.querySelector("[data-ng-search]");
    if (!input) return;
    const apply = () => {
      const q = norm(input.value.trim());
      this.ng.search = input.value;
      for (const g of this.element.querySelectorAll(".r-ng-bgroup")) {
        let any = false;
        for (const a of g.querySelectorAll(".r-ng-bitem")) { const hit = !q || a.dataset.s.includes(q); a.hidden = !hit; any ||= hit; }
        g.hidden = !any;
      }
    };
    input.addEventListener("input", apply);
    input.addEventListener("keydown", ev => { if (ev.key === "Enter") ev.preventDefault(); });
    apply();
  }

  async _prepareContext() {
    const D = await data();
    await Codex.load();
    this.#ensureDraft();
    const s = this.ng, kind = kindOf(s.kind), role = roleOf(s.role);
    const kinds = KIND_GROUPS.map(g => ({ ...g, label: lab(`KindGroup.${g.key}`, g.label),
      items: KINDS.filter(k => k.group === g.key).map(k => ({ ...k, label: lab(`Kind.${k.key}`, k.label), active: k.key === s.kind })) }));
    const roleGroups = ROLE_GROUPS.map(g => ({ ...g, label: lab(`RoleGroup.${g.key}`, g.label),
      roles: ROLES.filter(r => r.group === g.key).map(r => ({ key: r.key, icon: r.icon, label: lab(`Role.${r.key}`, r.label), active: r.key === s.role })) }));
    const subs = role ? subsForEra(role, game.settings.get(SYSTEM_ID, "era")).map(x => ({ key: x.key, label: lab(`Sub.${x.key}`, x.label), active: x.key === s.sub })) : [];
    const powers = POWERS.map(p => ({ key: p.key, icon: p.icon, label: lab(`Power.${p.key}`, p.label), active: p.key === s.power }));

    // статблоки книги
    let book = null;
    if (this.isBook) {
      const tpl = this.template;
      const attrLabel = k => loc(VTM20.attributes[k].label), abilLabel = k => loc(VTM20.abilities[k]?.label ?? k);
      let preview = null;
      if (tpl) {
        const abil = { ...(tpl.abilities ?? {}) };
        if (s.trained) for (const [k, v] of Object.entries(tpl.trained ?? {})) if ((abil[k]?.value ?? 0) < v.value) abil[k] = v;
        preview = {
          ...tpl, groupLabel: D.groups.find(g => g.key === tpl.group)?.label ?? "",
          attrs: tpl.attributes ? Object.entries(VTM20.attributeGroups).map(([g, grp]) => ({ label: loc(grp.label),
            list: grp.attributes.filter(k => k in tpl.attributes).map(k => `${attrLabel(k)} ${tpl.attributes[k]}`).join(", ") })).filter(x => x.list) : null,
          abilText: Object.entries(abil).map(([k, v]) => `${abilLabel(k)}${v.specialty ? ` (${v.specialty})` : ""} ${v.value}`).join(", "),
          trainedText: Object.entries(tpl.trained ?? {}).map(([k, v]) => `${abilLabel(k)} ${v.value}`).join(", "),
          discText: Object.entries(tpl.disciplines ?? {}).map(([k, v]) => `${Codex.disciplineLabel(k)} ${v}`).join(", "),
          poolText: tpl.pool ? `${tpl.pool.name} ${tpl.pool.value ?? "—"}` : "",
          isAnimal: tpl.group === "animals", typeLabel: loc(`TYPES.Actor.${tpl.kind}`)
        };
      }
      book = { preview, total: D.templates.filter(x => BOOK_GROUPS.includes(x.group)).length, source: D.source,
        groups: D.groups.filter(g => BOOK_GROUPS.includes(g.key)).map(g => ({ ...g, items: D.templates.filter(x => x.group === g.key).map(x => ({
          key: x.key, name: x.name, active: x.key === s.template, s: norm(`${g.label} ${x.name}`) })) })) };
    }

    const d = this.draft?.group ? null : this.draft;
    const grp = this.draft?.group ? this.draft : null;
    const presetOpts = (list, cat) => [...new Set(list.filter(p => Codex.visible(p)).map(p => p.group))].map(g => ({
      label: g, options: list.map((p, i) => ({ value: `${cat}:${i}`, label: p.name, group: p.group, show: Codex.visible(p) })).filter(p => p.group === g && p.show)
    }));
    return {
      s, kinds, kind: { ...kind, label: lab(`Kind.${kind.key}`, kind.label) }, roleGroups, subs, role: role ? { key: role.key, label: lab(`Role.${role.key}`, role.label) } : null,
      powers, isBook: this.isBook, isSpirit: s.kind === "spirit" || s.kind === "plasmic",   // готовый образец: без ролей и снаряжения (дух, плазмик)
      isGroup: this.isGroup, book,
      group: grp ? { title: lab(`Group.${groupOf(s.params.group || GROUPS[0].key).key}`, groupOf(s.params.group || GROUPS[0].key).label),
        coterie: groupOf(s.params.group || GROUPS[0].key).coterie, members: grp.list.map((x, i) => ({ name: grp.names[i], kind: x.kindLabel, icon: x.kindIcon, role: x.roleLabel,
          concept: x.concept, power: x.powerLabel, tags: (x.tags ?? []).filter(Boolean).slice(0, 3).join(" · "), traits: (x.traits ?? []).slice(0, 3).map(([l, v]) => `${l} ${v}`).join(" · ") })) } : null,
      presets: presets().map((p, i) => ({ i, name: p.name })), fields: this.isBook ? [] : paramFields(s.kind, s.params),
      draft: d ? { ...npcView(d), name: s.name.trim() || this.draftName, kindLabel: d.kindLabel, kindIcon: d.kindIcon, roleLabel: d.roleLabel, roleIcon: d.roleIcon,
        subLabel: d.subLabel, powerLabel: d.powerLabel, concept: d.concept } : null,
      nameSets: Object.entries(D.names).map(([k, n]) => ({ value: k, label: n.label, selected: k === s.names })),
      genders: [{ value: "", label: L("GenderAny") }, { value: "m", label: L("GenderM") }, { value: "f", label: L("GenderF") }].map(o => ({ ...o, selected: o.value === s.gender })),
      weaponGroups: presetOpts(WEAPON_PRESETS, "w"), armorGroups: presetOpts(ARMOR_PRESETS, "a"),
      extra: [...(this.draft && !this.isGroup && !this.isBook ? s.auto : []).map((k, i) => ({ i, auto: true, label: this.#preset(k)?.name ?? "" })),
        ...s.extra.map((k, i) => ({ i, label: this.#preset(k)?.name ?? "" }))],
      canCreate: this.isBook ? !!this.template : !!this.draft, multi: s.count > 1 && !this.isGroup
    };
  }

  #preset(ref) {
    const [cat, i] = ref.split(":");
    return (cat === "w" ? WEAPON_PRESETS : ARMOR_PRESETS)[Number(i)] ?? null;
  }

  static #onForm(event, form, formData) {
    const o = formData.object, s = this.ng;
    let rebuild = false, rerender = false;
    for (const [k, v] of Object.entries(o)) {
      if (!k.startsWith("p.")) continue;
      const key = k.slice(2), val = String(v ?? "");
      if (key.startsWith("sub.")) { s.params.sub ??= {}; if ((s.params.sub[key.slice(4)] ?? "") !== val) { s.params.sub[key.slice(4)] = val; rebuild = true; } }
      else if ((s.params[key] ?? "") !== val) {
        s.params[key] = val; rebuild = true;
        if (key === "fera") s.params.sub = {};
        if (key === "spiritKind") s.params.spirit = "";
      }
    }
    if (o.names !== undefined && o.names !== s.names) { s.names = String(o.names); rerender = true; if (this.draft && !this.draft.spirit && !this.draft.plasmic) this.draftName = randomName(DATA.names[s.names], s.gender); }
    if (o.gender !== undefined && o.gender !== s.gender) { s.gender = String(o.gender); rerender = true; if (this.draft && !this.draft.spirit && !this.draft.plasmic) this.draftName = randomName(DATA.names[s.names], s.gender); }
    if (o.name !== undefined) s.name = String(o.name);
    if (o.as !== undefined) s.as = String(o.as);
    if (o.count !== undefined) s.count = Math.clamp(Number(o.count) || 1, 1, 20);
    if (o.open !== undefined) s.open = !!o.open;
    for (const k of ["trained", "ghoul"]) if (o[k] !== undefined && !!o[k] !== s[k]) { s[k] = !!o[k]; rerender = true; }
    if (rebuild) this.#reset();
    if (rebuild || rerender) this.render();
  }
  static #onKind(event, target) {
    const k = target.dataset.kind;
    if (k === this.ng.kind) return;
    Object.assign(this.ng, { kind: k, params: {}, template: "", trained: false, ghoul: false });
    this.#reset(); this.render();
  }
  static #onRole(event, target) { const r = target.dataset.role ?? ""; this.ng.role = this.ng.role === r ? "" : r; this.ng.sub = ""; this.#reset(); this.render(); }
  static #onSub(event, target) { const x = target.dataset.sub ?? ""; this.ng.sub = this.ng.sub === x ? "" : x; this.#reset(); this.render(); }
  static #onPower(event, target) { this.ng.power = target.dataset.power; this.#reset(); this.render(); }
  static #onReroll() { this.#reset(); this.render(); }
  /** «Удиви меня»: случайный подвид, роль и сила (статблоки — случайный). */
  static #onSurprise() {
    const s = this.ng;
    if (this.isBook) { s.template = pick(DATA.templates.filter(x => BOOK_GROUPS.includes(x.group))).key; this.render(); return; }
    s.role = pick(ROLES).key; s.sub = ""; s.power = pick(POWERS.slice(1, 4)).key;
    this.#reset(); this.render();
  }
  static #onPick(event, target) {
    if (this.ng.template !== target.dataset.key) { this.ng.trained = false; this.ng.ghoul = false; }
    this.ng.template = target.dataset.key;
    this.render();
  }
  static #onRollName() {
    if (this.isBook) { this.ng.name = randomName(DATA.names[this.ng.names], this.ng.gender); this.render(); return; }
    this.ng.name = "";
    this.draftName = randomName(DATA.names[this.ng.names], this.ng.gender);
    this.render();
  }
  static #onGearAdd(event, target) {
    const sel = this.element.querySelector(`select[data-gear="${target.dataset.cat}"]`);
    if (sel?.value) { this.ng.extra.push(sel.value); this.render(); }
  }
  static #onGearDrop(event, target) { this.ng[target.dataset.auto ? "auto" : "extra"].splice(Number(target.dataset.i), 1); this.render(); }

  /** Заготовка: сохранить всё, что выбрано (имя спросить). */
  static async #onPresetSave() {
    const name = await foundry.applications.api.DialogV2.prompt({ window: { title: L("PresetSave") }, classes: ["vtm20", "r-dialog"], rejectClose: false,
      content: `<label class="r-field"><span>${L("PresetName")}</span><input type="text" name="name" autofocus value="${esc(this.draft?.concept ?? "")}"></label>`,
      ok: { label: L("PresetSave"), callback: (e, b) => b.form.elements.name.value.trim() } });
    if (!name) return;
    const s = this.ng, keep = ["kind", "role", "sub", "power", "params", "names", "gender", "extra", "as", "count", "template", "trained", "ghoul"];
    const list = presets();
    list.push({ name, ...foundry.utils.deepClone(Object.fromEntries(keep.map(k => [k, s[k]]))) });
    await game.settings.set(SYSTEM_ID, "npcPresets", list);
    ui.notifications.info(L("PresetSaved", { name }));
    this.render();
  }
  static #onPresetLoad(event, target) {
    const p = presets()[Number(target.dataset.i)];
    if (!p) return;
    const { name: _name, ...rest } = p;
    Object.assign(this.ng, foundry.utils.deepClone(rest), { name: "" });
    this.draft = null; this.render();
  }
  static async #onPresetDrop(event, target) {
    const list = presets(); list.splice(Number(target.dataset.i), 1);
    await game.settings.set(SYSTEM_ID, "npcPresets", list); this.render();
  }

  /** Группа целиком: все участники — по показанным черновикам; котерия нужного вида с ними. */
  async #createGroup(folder, gear) {
    const s = this.ng, g = groupOf(s.params.group || GROUPS[0].key), made = [];
    const sub = await Folder.create({ name: lab(`Group.${g.key}`, g.label), type: "Actor", folder: folder.id, color: "#4a0d11" });
    for (const [i, d] of this.draft.list.entries()) {
      const a = await createNpc(d, { name: this.draft.names[i], folder: sub.id });
      if (!a) continue;
      const kit = d.spirit || d.plasmic ? [] : [...this.gearOf(autoKit(d)), ...gear];
      if (kit.length) await a.createEmbeddedDocuments("Item", kit);
      made.push(a);
    }
    if (g.coterie) {
      const c = await Actor.create({ name: lab(`Group.${g.key}`, g.label), type: "coterie", folder: sub.id, system: { kind: g.coterie, members: made.map(a => a.id), ...(g.system ?? {}) } });
      made.unshift(c);
    }
    return made;
  }

  /** Создать: первый — ровно показанный черновик, остальные — новые с теми же условиями. */
  static async #onCreate() {
    const s = this.ng, tpl = this.template;
    if (this.isBook ? !tpl : !this.draft) return ui.notifications.warn(L("PickFirst"));
    const folder = game.folders.find(f => f.type === "Actor" && f.name === L("Folder"))
      ?? await Folder.create({ name: L("Folder"), type: "Actor", color: "#4a0d11" });
    const gearOf = refs => refs.map(ref => {
      const p = this.#preset(ref);
      if (!p) return null;
      const { name, group: _group, ...system } = p;
      const type = ref.startsWith("w:") ? "weapon" : "armor";
      return { name, type, img: type === "weapon" ? weaponIcon(name, system.kind) : armorIcon(system.rating), system };
    }).filter(Boolean);
    const gear = gearOf(s.extra);
    this.gearOf = gearOf;
    if (this.isGroup) {
      const made = await this.#createGroup(folder, gear);
      ui.notifications.info(L("GroupDone", { n: made.length }));
      this.#reset(); this.render();
      if (s.open && made[0]) made[0].sheet.render({ force: true });
      return;
    }
    const beast = tpl && ["animals", "swarms"].includes(tpl.group);
    const made = [];
    // толпа: один актёр на всех, численность — «Сколько»; статист — короткий лист у каждого
    const mob = s.as === "mob" && s.count > 1, times = mob ? 1 : s.count;
    for (let i = 0; i < times; i++) {
      const typed = i === 0 && s.name.trim();
      let actor;
      if (this.isBook) {
        const name = typed || (beast ? (s.count > 1 ? `${tpl.name} ${i + 1}` : tpl.name) : randomName(DATA.names[s.names], s.gender));
        actor = await createFromTemplate(tpl, { name, folder: folder.id, trained: s.trained, ghoul: s.ghoul && tpl.group === "animals", gear });
      } else {
        const d = i === 0 ? this.draft : buildNpc({ kind: s.kind, role: s.role, sub: s.sub, power: s.power, params: s.params });
        const name = typed || (i === 0 ? this.draftName : d.spirit || d.plasmic ? `${d.name} ${i + 1}` : randomName(DATA.names[s.names], s.gender));
        actor = await createNpc(d, { name, folder: folder.id });
        // первый — с показанным (и поправленным) комплектом, следующие — со своим по их навыкам
        const kit = [...gearOf(i === 0 ? s.auto : autoKit(d)), ...gear];
        if (actor && kit.length) await actor.createEmbeddedDocuments("Item", kit);
      }
      if (!actor) continue;
      if (mob) await actor.update({ name: typed || tpl?.name || this.draft?.concept || actor.name });
      if (mob || s.as === "extra") await makeExtra(actor, { mob: mob ? s.count : 0 });
      made.push(actor);
    }
    ui.notifications.info(L("Done", { n: made.length, name: tpl?.name ?? this.draft?.concept ?? "" }));
    s.name = "";
    this.#reset();
    this.render();
    if (s.open && made.length === 1) made[0].sheet.render({ force: true });
  }
}

export function openNpcGenerator() {
  if (!game.user.isGM) return ui.notifications.warn(L("GmOnly"));
  const app = foundry.applications.instances.get("r-npc-gen") ?? new NpcGenerator();
  app.render({ force: true });
  return app;
}
