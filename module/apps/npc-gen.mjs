// module/apps/npc-gen.mjs
// Генератор НПС для рассказчика.
//
//   · Статблоки V20, гл. 9 «Иные» (data/npc.json, tools/build_npc.py): охотники, преступники,
//     оборотни, маги, феи, призраки, демоны, звери и рои. Люди — лист смертного, прочие —
//     лист существа: «аналоги Дисциплин» ложатся Дисциплинами, атаки зверей — оружием,
//     а всё, чего на листе нет (уровни здоровья зверя, гнозис, чары, пафос), — в заметки.
//     Навыки в [скобках] книги — только у дрессированных: отдельная галочка.
//     Зверя можно сделать гулем: воля, Мощь 1 и 2 пункта крови (гл. 9).
//   · Сородич и гуль «по правилам создания» (гл. 01 и 07): характеристики 7/5/3 (у гуля 6/4/3),
//     способности 13/9/5 (11/7/4) не выше 3, три точки клановых Дисциплин (у гуля Мощь 1 и
//     точка Дисциплины домитора), 5 точек фактов биографии, 7 точек Добродетелей; Человечность =
//     Совесть + Самоконтроль, воля = Смелость. Свободные пункты не тратятся — их добавит рассказчик.
//
// Снаряжение — оружие и броня из заготовок (data/equipment.mjs); список из книги — в заметках.
// Имена — наборы data/npc.json → names. Все созданные — в папку «НПС».

import { VTM20, SYSTEM_PATH, SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { WEAPON_PRESETS, ARMOR_PRESETS } from "../data/equipment.mjs";
import { LibraryItems } from "./library.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const L = (k, d) => t(`NpcGen.${k}`, d);
const loc = k => game.i18n.localize(k);
const pick = list => list[Math.floor(Math.random() * list.length)];
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const shuffle = list => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const ICON = type => `systems/${SYSTEM_ID}/assets/icons/${type}.svg`;
import { weaponIcon, armorIcon, traitIcon, backgroundIcon } from "../data/icons.mjs";
import { makeExtra } from "./extras.mjs";
const COMMON_DISCIPLINES = ["animalism", "auspex", "celerity", "dominate", "fortitude", "obfuscate", "potence", "presence"];

let DATA = null;
async function data() {
  DATA ??= await fetch(`${SYSTEM_PATH}/data/npc.json`).then(r => r.json());
  return DATA;
}

/** Случайное имя из набора: «Имя Фамилия»; у русских женская фамилия согласуется. */
export function randomName(set, gender = "") {
  const g = gender || (Math.random() < .5 ? "m" : "f");
  let last = pick(set.last);
  if (set.femLast && g === "f") last = last.endsWith("ий") ? last.replace(/ий$/, "ая") : `${last}а`;
  return `${pick(set[g])} ${last}`;
}

/** Разложить n точек по ключам: к базе base, не выше cap. */
function spread(keys, n, base, cap) {
  const out = Object.fromEntries(keys.map(k => [k, base]));
  let left = n, guard = 500;
  while (left > 0 && guard--) {
    const k = pick(keys);
    if (out[k] < cap) { out[k]++; left--; }
  }
  return out;
}

/* ── Генерация по правилам создания ───────────────────────────────────── */

/** Характеристики, способности, Добродетели, факты биографии по приоритетам книги. */
function rollTraits({ attrs, abils, ugly = false, type = "vampire" }) {
  const era = game.settings.get(SYSTEM_ID, "era");
  const attributes = {};
  shuffle(Object.keys(VTM20.attributeGroups)).forEach((g, i) => {
    const keys = VTM20.attributeGroups[g].attributes.filter(k => !(ugly && k === "appearance"));
    Object.assign(attributes, spread(keys, attrs[i], 1, 5));
  });
  if (ugly) attributes.appearance = 0;
  const groups = VTM20.abilitiesForEra(era);
  const abilities = {};
  shuffle(Object.keys(groups)).forEach((g, i) => Object.assign(abilities, spread(groups[g], abils[i], 0, 3)));
  // Добродетели: у каждой изначально 1, ещё 7 точек (01)
  const virtues = spread(["conscience", "selfControl", "courage"], 7, 1, 5);
  // Факты биографии: 5 точек на 2–3 факта
  // «Поколение» не разыгрываем: его задаёт рассказчик в окне
  const pool = shuffle(Codex.backgrounds.filter(b => !b.sabbat && b.en !== "Generation" && Codex.visible(b) && VTM20.backgroundAllowed(b, type))).slice(0, 2 + Math.floor(Math.random() * 2));
  const backgrounds = spread(pool.map(b => b.name), 5 - pool.length, 1, 5);
  return { attributes, abilities, virtues, backgrounds };
}

function systemFromTraits(tr) {
  return {
    attributes: Object.fromEntries(Object.entries(tr.attributes).map(([k, v]) => [k, { value: v }])),
    abilities: Object.fromEntries(Object.entries(tr.abilities).map(([k, v]) => [k, { value: v }])),
    virtues: Object.fromEntries(Object.entries(tr.virtues).map(([k, v]) => [k, { value: v }])),
    morality: { path: "humanity", value: tr.virtues.conscience + tr.virtues.selfControl },
    willpower: { permanent: tr.virtues.courage, temporary: tr.virtues.courage },
    details: { nature: pick(Codex.archetypes).name, demeanor: pick(Codex.archetypes).name }
  };
}

function backgroundItems(tr) {
  return Object.entries(tr.backgrounds).map(([name, v]) => LibraryItems.background(Codex.backgrounds.find(b => b.name === name), v));
}

/** Дисциплины клана; у каитифов и без списка — восемь общих (02). */
function clanDisciplines(clanKey, choice = "") {
  const c = Codex.clan(clanKey);
  const list = [...(c?.disciplines ?? [])];
  if (c?.choice?.length) list.push(choice || pick(c.choice));
  return list.length ? list : COMMON_DISCIPLINES;
}

async function createRuleVampire({ name, folder, clan, generation }) {
  const tr = rollTraits({ attrs: [7, 5, 3], abils: [13, 9, 5], ugly: VTM20.uglyClans.includes(clan) });
  const disc = spread(clanDisciplines(clan), 3, 0, 3);
  const pool = VTM20.generationOf(generation).pool;
  const system = { ...systemFromTraits(tr), clan, generation, blood: { value: Math.min(pool, Math.ceil(Math.random() * 10)) } };
  system.details.concept = L("RuleVampireConcept", { clan: Codex.clan(clan)?.name ?? clan });
  const a = await Actor.create({ name, type: "vampire", folder, img: ICON("vampire"), system, flags: { [SYSTEM_ID]: { created: true } } });
  await a.createEmbeddedDocuments("Item", [
    ...Object.entries(disc).filter(([, v]) => v > 0).map(([k, v]) => LibraryItems.discipline(k, v)),
    ...backgroundItems(tr)
  ]);
  return a;
}

async function createRuleGhoul({ name, folder, clan }) {
  const tr = rollTraits({ attrs: [6, 4, 3], abils: [11, 7, 4], type: "ghoul" });
  // Мощь 1 бесплатно + точка Дисциплины домитора (вассал, гл. 07)
  const second = pick(clanDisciplines(clan));
  const disc = { potence: 1 };
  disc[second] = (disc[second] ?? 0) + 1;
  const system = { ...systemFromTraits(tr), ghoulType: "vassal", domitorClan: Codex.clan(clan)?.name ?? "", blood: { value: 1, max: 2 } };
  system.details.concept = L("RuleGhoulConcept", { clan: Codex.clan(clan)?.name ?? clan });
  const a = await Actor.create({ name, type: "ghoul", folder, img: ICON("ghoul"), system, flags: { [SYSTEM_ID]: { created: true } } });
  await a.createEmbeddedDocuments("Item", [...Object.entries(disc).map(([k, v]) => LibraryItems.discipline(k, v)), ...backgroundItems(tr)]);
  return a;
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

/* ── Окно ──────────────────────────────────────────────────────────────── */

const RULE_TEMPLATES = [
  { key: "rule:vampire", name: "RuleVampire", icon: "fa-droplet" },
  { key: "rule:ghoul", name: "RuleGhoul", icon: "fa-hand-holding-droplet" }
];

export class NpcGenerator extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.ng = { template: "", count: 1, as: "sheet", names: "fr", gender: "", name: "", open: true, trained: false, ghoul: false,
      clan: "brujah", generation: 13, extra: [], search: "" };
  }

  static DEFAULT_OPTIONS = {
    id: "r-npc-gen",
    classes: ["vtm20", "r-npc-gen"],
    tag: "form",
    window: { title: "VTM20.NpcGen.Title", icon: "fa-solid fa-users-viewfinder", resizable: true },
    position: { width: 940, height: 760 },
    form: { handler: NpcGenerator.#onForm, submitOnChange: true, closeOnSubmit: false },
    actions: {
      pick: NpcGenerator.#onPick, random: NpcGenerator.#onRandom, rollName: NpcGenerator.#onRollName,
      create: NpcGenerator.#onCreate, gearAdd: NpcGenerator.#onGearAdd, gearDrop: NpcGenerator.#onGearDrop
    }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/apps/npc-gen.hbs`, scrollable: [".r-ng-list", ".r-ng-preview"] } };

  get template() { return DATA?.templates.find(x => x.key === this.ng.template) ?? null; }
  get rule() { return this.ng.template.startsWith("rule:") ? this.ng.template.slice(5) : null; }

  _onRender(context, options) {
    super._onRender?.(context, options);
    // Поиск по шаблонам — без перерисовки
    const input = this.element.querySelector("[data-ng-search]");
    if (!input) return;
    const apply = () => {
      const q = input.value.trim().toLowerCase().replace(/ё/g, "е");
      this.ng.search = input.value;
      for (const g of this.element.querySelectorAll(".r-ng-group")) {
        let any = false;
        for (const a of g.querySelectorAll(".r-ng-item")) { const hit = !q || a.dataset.s.includes(q); a.hidden = !hit; any ||= hit; }
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
    const s = this.ng, tpl = this.template, rule = this.rule;
    const attrLabel = k => loc(VTM20.attributes[k].label);
    const abilLabel = k => loc(VTM20.abilities[k]?.label ?? k);
    let preview = null;
    if (tpl) {
      const abil = { ...(tpl.abilities ?? {}) };
      if (s.trained) for (const [k, v] of Object.entries(tpl.trained ?? {})) if ((abil[k]?.value ?? 0) < v.value) abil[k] = v;
      preview = {
        ...tpl, groupLabel: D.groups.find(g => g.key === tpl.group)?.label ?? "",
        attrs: tpl.attributes ? Object.entries(VTM20.attributeGroups).map(([g, grp]) => ({
          label: loc(grp.label),
          list: grp.attributes.filter(k => k in tpl.attributes).map(k => `${attrLabel(k)} ${tpl.attributes[k]}`).join(", ")
        })).filter(x => x.list) : null,
        abilText: Object.entries(abil).map(([k, v]) => `${abilLabel(k)}${v.specialty ? ` (${v.specialty})` : ""} ${v.value}`).join(", "),
        trainedText: Object.entries(tpl.trained ?? {}).map(([k, v]) => `${abilLabel(k)} ${v.value}`).join(", "),
        discText: Object.entries(tpl.disciplines ?? {}).map(([k, v]) => `${Codex.disciplineLabel(k)} ${v}`).join(", "),
        poolText: tpl.pool ? `${tpl.pool.name} ${tpl.pool.value ?? "—"}` : "",
        isAnimal: tpl.group === "animals",
        typeLabel: loc(`TYPES.Actor.${tpl.kind}`)
      };
    } else if (rule) {
      const vamp = rule === "vampire";
      preview = {
        rule, name: L(vamp ? "RuleVampire" : "RuleGhoul"), groupLabel: L("ByRules"),
        ruleText: L(vamp ? "RuleVampireText" : "RuleGhoulText"),
        clanDiscs: clanDisciplines(s.clan).map(k => Codex.disciplineLabel(k)).join(", "),
        typeLabel: loc(`TYPES.Actor.${vamp ? "vampire" : "ghoul"}`)
      };
    }
    // value — номер в полном списке; снаряжение Тёмных веков — только с настройкой «Контент из Dark Ages»
    const presetOpts = (list, cat) => [...new Set(list.filter(p => Codex.visible(p)).map(p => p.group))].map(g => ({
      label: g, options: list.map((p, i) => ({ value: `${cat}:${i}`, label: p.name, group: p.group, show: Codex.visible(p) })).filter(p => p.group === g && p.show)
    }));
    const norm = x => x.toLowerCase().replace(/ё/g, "е");
    return {
      s, preview,
      rules: RULE_TEMPLATES.map(r => ({ ...r, label: L(r.name), active: r.key === s.template })),
      groups: D.groups.map(g => ({ ...g, items: D.templates.filter(x => x.group === g.key).map(x => ({
        key: x.key, name: x.name, active: x.key === s.template, s: norm(`${g.label} ${x.name}`) })) })),
      nameSets: Object.entries(D.names).map(([k, n]) => ({ value: k, label: n.label, selected: k === s.names })),
      genders: [{ value: "", label: L("GenderAny") }, { value: "m", label: L("GenderM") }, { value: "f", label: L("GenderF") }]
        .map(o => ({ ...o, selected: o.value === s.gender })),
      clanGroups: Codex.clanGroups().map(g => ({ ...g, clans: g.clans.map(c => ({ key: c.key, name: c.name, selected: c.key === s.clan })) })),
      generations: Object.keys(VTM20.generations).map(Number).filter(g => g >= 8).sort((a, b) => a - b)
        .map(g => ({ value: g, label: t("GenerationN", { n: g }), selected: g === s.generation })),
      weaponGroups: presetOpts(WEAPON_PRESETS, "w"), armorGroups: presetOpts(ARMOR_PRESETS, "a"),
      extra: s.extra.map((k, i) => ({ i, label: this.#preset(k)?.name ?? "" })),
      total: D.templates.length, source: D.source
    };
  }

  #preset(ref) {
    const [cat, i] = ref.split(":");
    return (cat === "w" ? WEAPON_PRESETS : ARMOR_PRESETS)[Number(i)] ?? null;
  }

  static #onForm(event, form, formData) {
    const o = formData.object;
    for (const k of ["names", "gender", "name", "clan", "as"]) if (o[k] !== undefined) this.ng[k] = String(o[k]);
    if (o.generation !== undefined) this.ng.generation = Number(o.generation) || 13;
    if (o.count !== undefined) this.ng.count = Math.clamp(Number(o.count) || 1, 1, 10);
    if (o.open !== undefined) this.ng.open = !!o.open;
    let rerender = o.clan !== undefined;
    for (const k of ["trained", "ghoul"]) if (o[k] !== undefined && !!o[k] !== this.ng[k]) { this.ng[k] = !!o[k]; rerender = true; }
    if (rerender) this.render();
  }
  static #onPick(event, target) {
    if (this.ng.template !== target.dataset.key) { this.ng.trained = false; this.ng.ghoul = false; }
    this.ng.template = target.dataset.key;
    this.render();
  }
  static #onRandom() { this.ng.template = pick(DATA.templates).key; this.ng.trained = false; this.ng.ghoul = false; this.render(); }
  static #onRollName() { this.ng.name = randomName(DATA.names[this.ng.names], this.ng.gender); this.render(); }
  static #onGearAdd(event, target) {
    const sel = this.element.querySelector(`select[data-gear="${target.dataset.cat}"]`);
    if (sel?.value) { this.ng.extra.push(sel.value); this.render(); }
  }
  static #onGearDrop(event, target) { this.ng.extra.splice(Number(target.dataset.i), 1); this.render(); }

  /** Создать столько НПС, сколько просили; имя — введённое (для первого) или случайное. */
  static async #onCreate() {
    const tpl = this.template, rule = this.rule;
    if (!tpl && !rule) return ui.notifications.warn(L("PickFirst"));
    const folder = game.folders.find(f => f.type === "Actor" && f.name === L("Folder"))
      ?? await Folder.create({ name: L("Folder"), type: "Actor", color: "#4a0d11" });
    const gear = this.ng.extra.map(ref => {
      const p = this.#preset(ref);
      if (!p) return null;
      const { name, group, ...system } = p;
      const type = ref.startsWith("w:") ? "weapon" : "armor";
      return { name, type, img: type === "weapon" ? weaponIcon(name, system.kind) : armorIcon(system.rating), system };
    }).filter(Boolean);
    const beast = tpl && ["animals", "swarms"].includes(tpl.group);
    const made = [];
    // толпа (план 4): один актёр на всех, численность — «Сколько»; статист — короткий лист у каждого
    const mob = this.ng.as === "mob" && this.ng.count > 1, times = mob ? 1 : this.ng.count;
    for (let i = 0; i < times; i++) {
      const typed = i === 0 && this.ng.name.trim();
      const name = typed || (beast ? (this.ng.count > 1 ? `${tpl.name} ${i + 1}` : tpl.name) : randomName(DATA.names[this.ng.names], this.ng.gender));
      const o = { name, folder: folder.id };
      let actor;
      if (rule === "vampire") actor = await createRuleVampire({ ...o, clan: this.ng.clan, generation: this.ng.generation });
      else if (rule === "ghoul") actor = await createRuleGhoul({ ...o, clan: this.ng.clan });
      else actor = await createFromTemplate(tpl, { ...o, trained: this.ng.trained, ghoul: this.ng.ghoul && tpl.group === "animals", gear });
      if (rule && gear.length) await actor.createEmbeddedDocuments("Item", gear);
      if (mob) await actor.update({ name: typed || tpl?.name || actor.name });
      if (mob || this.ng.as === "extra") await makeExtra(actor, { mob: mob ? this.ng.count : 0 });
      made.push(actor);
    }
    ui.notifications.info(L("Done", { n: made.length, name: tpl?.name ?? L(rule === "vampire" ? "RuleVampire" : "RuleGhoul") }));
    this.ng.name = "";
    this.render();
    if (this.ng.open && made.length === 1) made[0].sheet.render({ force: true });
  }
}

export function openNpcGenerator() {
  if (!game.user.isGM) return ui.notifications.warn(L("GmOnly"));
  const app = foundry.applications.instances.get("r-npc-gen") ?? new NpcGenerator();
  app.render({ force: true });
  return app;
}
