// module/sheets/actor-sheet.mjs
// Лист персонажа V20 на ApplicationV2. Точки и шкалы — действия (data-action),
// текстовые поля — обычная форма с submitOnChange.
//
// Раскладка: шапка-«патент» с медальоном, вкладки слева от «реестра»
// (правая колонка: мораль, воля, кровь, здоровье, быстрые действия).

import { VTM20, SYSTEM_PATH, SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { attachCombos } from "../ui/combo.mjs";
import { choosePower, fitsLevel } from "../apps/power-choice.mjs";
import { RollDialog } from "../dice/dialog.mjs";
import { rollPool } from "../dice/roll.mjs";
import { openDamageDialog } from "../apps/damage.mjs";
import { WEAPON_PRESETS, ARMOR_PRESETS } from "../data/equipment.mjs";
import { openCreator } from "../apps/creator.mjs";
import { openHunt } from "../apps/night.mjs";
import { openAttack } from "../combat/combat.mjs";
import { openHazard } from "../apps/hazard.mjs";
import { openDiablerie } from "../apps/diablerie.mjs";
import { clockBarData } from "../apps/calendar.mjs";
import { openLibrary, LibraryItems } from "../apps/library.mjs";
import { moneyView, openMoney } from "../data/money.mjs";
import { POWER_EFFECTS } from "../data/effects.mjs";
import { togglePowerEffect } from "../apps/power-effects.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const TextEditor = () => foundry.applications.ux.TextEditor.implementation;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

const dots = (value, max = 5, extra = {}) =>
  Array.from({ length: max }, (_, i) => ({ n: i + 1, filled: i < value, ...extra }));

/** Состояния персонажа, которые видны на портрете: значок, оттенок портрета (cls), тревожные — красным. */
const PORTRAIT_STATES = [
  { id: "r-frenzy", key: "frenzy", icon: "fa-face-angry", cls: "is-frenzy", hot: true },
  { id: "r-rotschreck", key: "rotschreck", icon: "fa-fire", cls: "is-rotschreck", hot: true },
  { id: "r-torpor", key: "torpor", icon: "fa-bed", cls: "is-torpor" },
  { id: "r-staked", key: "staked", icon: "fa-thumbtack", cls: "is-torpor", hot: true },
  { id: "r-stunned", key: "stunned", icon: "fa-face-dizzy" },
  { id: "r-prone", key: "prone", icon: "fa-person-falling" },
  { id: "r-held", key: "held", icon: "fa-hands-bound" }
];

/** Значок строки оружия по виду: рукопашное, холодное, огнестрельное (луки и арбалеты — мишень), метательное. */
const weaponIcon = (kind, name) => kind === "brawl" ? "fa-hand-fist" : kind === "thrown" ? "fa-location-arrow"
  : kind === "firearms" ? (/лук|арбалет|праща/i.test(name) ? "fa-bullseye" : "fa-gun") : "fa-khanda";

export class VtMActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-sheet", "r-actor"],
    position: { width: 1120, height: 940 },
    window: { resizable: true, contentClasses: ["r-sheet-content"] },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      setDots: { handler: VtMActorSheet.#onSetDots, buttons: [0, 2] },
      choosePower: VtMActorSheet.#onChoosePower,
      setHealth: { handler: VtMActorSheet.#onSetHealth, buttons: [0, 2] },
      rollTrait: VtMActorSheet.#onRollTrait,
      rollFree: VtMActorSheet.#onRollFree,
      rollInitiative: VtMActorSheet.#onRollInitiative,
      rollVirtue: VtMActorSheet.#onRollVirtue,
      rollWeapon: VtMActorSheet.#onRollWeapon,
      takeDamage: VtMActorSheet.#onTakeDamage,
      bloodHeal: VtMActorSheet.#onBloodHeal,
      boost: VtMActorSheet.#onBoost,
      clearBoosts: VtMActorSheet.#onClearBoosts,
      awaken: VtMActorSheet.#onAwaken,
      spendBlood: VtMActorSheet.#onSpendBlood,
      spendWill: VtMActorSheet.#onSpendWill,
      addClanDisciplines: VtMActorSheet.#onAddClanDisciplines,
      library: VtMActorSheet.#onLibrary,
      money: VtMActorSheet.#onMoney,
      togglePower: VtMActorSheet.#onTogglePower,
      endPower: VtMActorSheet.#onEndPower,
      toggleRow: VtMActorSheet.#onToggleRow,
      toggleAll: VtMActorSheet.#onToggleAll,
      clearStatus: VtMActorSheet.#onClearStatus,
      powerToChat: VtMActorSheet.#onPowerToChat,
      rollPower: VtMActorSheet.#onRollPower,
      rollItemPower: VtMActorSheet.#onRollItemPower,
      itemCreate: VtMActorSheet.#onItemCreate,
      itemEdit: VtMActorSheet.#onItemEdit,
      itemDelete: VtMActorSheet.#onItemDelete,
      itemToggle: VtMActorSheet.#onItemToggle,
      itemChat: VtMActorSheet.#onItemChat,
      addSecondary: VtMActorSheet.#onAddSecondary,
      removeSecondary: VtMActorSheet.#onRemoveSecondary,
      addBond: VtMActorSheet.#onAddBond,
      drinkBond: VtMActorSheet.#onDrinkBond,
      resistBond: VtMActorSheet.#onResistBond,
      removeBond: VtMActorSheet.#onRemoveBond,
      addXp: VtMActorSheet.#onAddXp,
      addEvent: VtMActorSheet.#onAddEvent,
      removeEvent: VtMActorSheet.#onRemoveEvent,
      removeXp: VtMActorSheet.#onRemoveXp,
      buy: { handler: VtMActorSheet.#onBuy, buttons: [0] },
      openCreator: VtMActorSheet.#onOpenCreator,
      skipCreation: VtMActorSheet.#onSkipCreation,
      hunt: VtMActorSheet.#onHunt,
      attack: VtMActorSheet.#onAttack,
      hazard: VtMActorSheet.#onHazard,
      diablerie: VtMActorSheet.#onDiablerie
    }
  };

  static PARTS = {
    tabs: { template: `${SYSTEM_PATH}/templates/actor/tabs.hbs` },
    header: { template: `${SYSTEM_PATH}/templates/actor/header.hbs` },
    gate: { template: `${SYSTEM_PATH}/templates/actor/gate.hbs` },
    vitals: { template: `${SYSTEM_PATH}/templates/actor/vitals.hbs` },
    traits: { template: `${SYSTEM_PATH}/templates/actor/traits.hbs`, scrollable: [""] },
    disciplines: { template: `${SYSTEM_PATH}/templates/actor/disciplines.hbs`, scrollable: [""] },
    advantages: { template: `${SYSTEM_PATH}/templates/actor/advantages.hbs`, scrollable: [""] },
    gear: { template: `${SYSTEM_PATH}/templates/actor/gear.hbs`, scrollable: [""] },
    bio: { template: `${SYSTEM_PATH}/templates/actor/bio.hbs`, scrollable: [""] },
    foot: { template: `${SYSTEM_PATH}/templates/actor/foot.hbs` }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: "traits", icon: "fa-solid fa-feather-pointed" },
        { id: "disciplines", icon: "fa-solid fa-droplet" },
        { id: "advantages", icon: "fa-solid fa-scroll" },
        { id: "gear", icon: "fa-solid fa-khanda" },
        { id: "bio", icon: "fa-solid fa-book-open" }
      ],
      initial: "traits",
      labelPrefix: "VTM20.Tabs"
    }
  };

  /** Раскрытые строки (силы, ритуалы) — переживают перерисовку. */
  _open = new Set();

  /** Персонаж ещё не создан (все характеристики 1, способностей нет, мастер не пройден) — вместо листа ворота. */
  get needsCreation() {
    const a = this.actor, s = a.system;
    return a.type !== "creature" && !a.getFlag(SYSTEM_ID, "created")
      && Object.values(s.attributes).every(x => x.value === 1) && Object.values(s.abilities).every(x => x.value === 0);
  }

  /** До создания рисуем только шапку и ворота. */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    options.parts = this.needsCreation ? ["header", "gate"] : options.parts.filter(p => p !== "gate");
  }

  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    if (this.actor.type === "mortal") delete parts.disciplines;
    return parts;
  }

  _prepareTabs(group) {
    const tabs = super._prepareTabs(group);
    if (this.actor.type === "mortal") delete tabs.disciplines;
    let i = 0;
    for (const tab of Object.values(tabs)) tab.roman = ROMAN[i++];
    return tabs;
  }

  /* ── Контекст ───────────────────────────────────────────────────────── */

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    await Codex.load();
    const actor = this.actor, sys = actor.system;
    Object.assign(ctx, {
      actor, system: sys, source: actor._source.system, config: VTM20,
      editable: this.isEditable, isGM: game.user.isGM,
      isVampire: actor.type === "vampire", isGhoul: actor.type === "ghoul", isMortal: actor.type === "mortal",
      isCreature: actor.type === "creature",
      hasBlood: actor.hasBlood,
      typeLabel: game.i18n.localize(`TYPES.Actor.${actor.type}`),
      needsCreation: this.needsCreation,
      tabs: this._prepareTabs("primary")
    });
    this.#prepareHeader(ctx);
    this.#prepareTraits(ctx);
    this.#prepareRegistry(ctx);
    if (actor.type !== "mortal") this.#prepareDisciplines(ctx);
    this.#prepareAdvantages(ctx);
    this.#prepareGear(ctx);
    ctx.biographyHTML = await TextEditor().enrichHTML(sys.biography ?? "", { relativeTo: actor, secrets: actor.isOwner });
    ctx.notesHTML = await TextEditor().enrichHTML(sys.notes ?? "", { relativeTo: actor, secrets: actor.isOwner });
    return ctx;
  }

  async _preparePartContext(partId, ctx) {
    ctx.tab = ctx.tabs?.[partId];
    return ctx;
  }

  #prepareHeader(ctx) {
    const a = this.actor, s = a.system;
    if (ctx.isVampire) {
      ctx.clanGroups = Codex.clanGroups().map(g => ({ ...g, clans: g.clans.map(c => ({ key: c.key, name: c.name, selected: c.key === s.clan })) }));
      const clan = Codex.clan(s.clan);
      ctx.clan = clan;
      ctx.clanChoices = clan?.choice?.length ? clan.choice.map(k => ({ value: k, label: Codex.disciplineLabel(k), selected: k === s.clanChoice })) : null;
      ctx.generations = Object.keys(VTM20.generations).map(Number).sort((x, y) => x - y)
        .map(g => ({ value: g, label: t("GenerationN", { n: g }), selected: g === s.generation }));
    }
    if (ctx.isGhoul) {
      ctx.ghoulTypes = ["vassal", "independent", "revenant"].map(k => ({ value: k, label: t(`GhoulType.${k}`), selected: k === s.ghoulType }));
      ctx.donorGenerations = Object.keys(VTM20.generations).map(Number).sort((x, y) => x - y)
        .map(g => ({ value: g, label: t("GenerationN", { n: g }), selected: g === s.domitorGeneration }));
    }
    // Герб на рельсе и водяной знак: клан, иначе секта; у прочих — кокарда
    const sym = actor => actor.type === "vampire" ? Codex.clanSymbol(actor.system.clan) : null;
    ctx.sigil = { sym: sym(a) ?? Codex.sectSymbol(s.details.sect), label: a.clanLabel || s.details.sect || "" };
    // Состояние на портрете: раны — кровавая дымка по краям, состояния (ярость, торпор…) — оттенок и значки
    const st = a.statuses ?? new Set();
    const wound = Math.min(7, s.health?.damage ?? 0);
    ctx.portraitState = {
      wound, cls: [wound >= 7 && "is-down", ...PORTRAIT_STATES.filter(x => x.cls && st.has(x.id)).map(x => x.cls)].filter(Boolean).join(" "),
      badges: [
        ...(wound >= 7 ? [{ icon: "fa-skull-crossbones", label: t("Health.incapacitated"), hot: true }] : []),
        ...PORTRAIT_STATES.filter(x => st.has(x.id)).map(x => ({ id: x.id, icon: x.icon, label: t(`Status.${x.key}`), hot: x.hot }))
      ]
    };
    ctx.sectSym = Codex.sectSymbol(s.details.sect);
    ctx.archetypes = Codex.archetypes.map(x => x.name);
    // Способности эпох (data/abilities.json) — подсказки для вторичных способностей; Тёмные века — с настройкой
    ctx.extraAbilities = (Codex.abilities ?? []).filter(x => Codex.visible(x)).map(x => x.name);
    const nature = Codex.archetypes.find(x => x.name === s.details.nature);
    ctx.natureRegain = nature?.regain ?? "";
    // Дороги Тёмных веков — только при включённой настройке; уже выбранный путь не прячем
    ctx.paths = Codex.paths.filter(p => Codex.visible(p) || p.key === s.morality.path)
      .map(p => ({ key: p.key, name: p.era ? `${p.name} · ${t("Library.Filter.DarkAges")}` : p.name, selected: p.key === s.morality.path }));
    ctx.sects = ["camarilla", "sabbat", "anarchs", "independent", "autarkis"].map(k => ({ value: t(`Sect.${k}`), label: t(`Sect.${k}`) }));
  }

  #prepareTraits(ctx) {
    const a = this.actor, s = a.system;
    const cap = Math.max(5, s.traitMax ?? 5);
    ctx.attributeGroups = Object.entries(VTM20.attributeGroups).map(([gk, g]) => ({
      key: gk, label: game.i18n.localize(g.label),
      list: g.attributes.map(k => {
        const at = s.attributes[k];
        return {
          key: k, label: game.i18n.localize(VTM20.attributes[k].label), value: at.value, total: at.total, boost: at.boost, ugly: !!at.ugly,
          fx: at.fxSet ? `=${at.total}` : at.fx ? `+${at.fx}` : "",
          dots: dots(at.value, cap, { path: `system.attributes.${k}.value` }), specialty: at.specialty, canSpec: at.value >= 4,
          boostable: ctx.hasBlood && VTM20.bloodBoostable.includes(k),
          xp: a.xpCost("attribute", at.value)
        };
      })
    }));
    const era = game.settings.get(SYSTEM_ID, "era");
    const abil = VTM20.abilitiesForEra(era);
    ctx.abilityGroups = Object.entries(abil).map(([gk, keys]) => ({
      key: gk, label: game.i18n.localize(VTM20.abilityGroups[gk].label),
      list: keys.map(k => {
        const ab = s.abilities[k];
        return {
          key: k, label: game.i18n.localize(VTM20.abilities[k].label), value: ab.value,
          dots: dots(ab.value, cap, { path: `system.abilities.${k}.value` }), specialty: ab.specialty, canSpec: ab.value >= 4,
          xp: a.xpCost("ability", ab.value)
        };
      }),
      secondary: s.secondary.map((x, i) => ({ ...x, index: i, dots: dots(x.value, cap, { path: `system.secondary.${i}.value` }) }))
        .filter(x => x.group === gk)
    }));
  }

  #prepareRegistry(ctx) {
    const a = this.actor, s = a.system;
    const path = Codex.path(s.morality.path);
    ctx.path = path;
    ctx.moralityDots = dots(s.morality.value, 10, { path: "system.morality.value" });
    const bm = VTM20.bearingMod(s.morality.value);
    ctx.bearing = { name: path?.bearing ?? "", mod: bm > 0 ? `+${bm}` : bm < 0 ? `${bm}` : "±0" };
    ctx.virtues = ["conscience", "selfControl", "courage"].map(slot => {
      const key = a.virtueKey(slot);
      const v = s.virtues[slot].value;
      return { slot, key, label: game.i18n.localize(VTM20.virtues[key].label), value: v, dots: dots(v, 5, { path: `system.virtues.${slot}.value` }), xp: a.xpCost("virtue", v) };
    });
    ctx.willPerm = dots(s.willpower.permanent, 10, { path: "system.willpower.permanent" });
    ctx.willTemp = dots(s.willpower.temporary, 10, { path: "system.willpower.temporary" })
      .map((d, i) => ({ ...d, locked: i >= s.willpower.permanent }));
    if (ctx.hasBlood) {
      const max = s.blood.max;
      ctx.bloodBoxes = dots(s.blood.value, max, { path: "system.blood.value" });
      ctx.bloodRows = [];
      for (let i = 0; i < ctx.bloodBoxes.length; i += 10) ctx.bloodRows.push(ctx.bloodBoxes.slice(i, i + 10));
      ctx.boosts = VTM20.bloodBoostable.map(k => ({ key: k, label: game.i18n.localize(VTM20.attributes[k].label),
        short: game.i18n.localize(VTM20.attributes[k].label).slice(0, 4) + ".", value: s.boosts[k] }));
      ctx.anyBoost = Object.values(s.boosts).some(v => v > 0);
    }
    ctx.health = s.health.levels.map(l => ({
      ...l, label: game.i18n.localize(l.label),
      penaltyLabel: l.penalty == null ? "" : l.penalty === 0 ? "" : String(l.penalty),
      mark: VTM20.damageTypes[l.state]?.mark ?? ""
    }));
    ctx.healthStatus = s.health.status === "healthy" ? t("Health.healthy") : t(`Health.${s.health.status}`);
    ctx.healthHurt = s.health.damage > 0;
    ctx.clock = clockBarData();
    ctx.woundPenalty = s.health.penalty;
    ctx.torpor = VTM20.torporDuration[s.morality.value];
    ctx.soak = { bashing: a.soakPool("bashing"), lethal: a.soakPool("lethal"), aggravated: a.soakPool("aggravated") };
    ctx.xp = s.experience;
    if (ctx.isVampire) {
      const clan = Codex.clan(s.clan);
      ctx.weakness = clan?.weakness ?? "";
      ctx.weaknessTitle = clan?.name ?? "";
      ctx.weaknessOpen = this._open.has("weakness");
      const w = VTM20.weaknessChecks[s.clan];
      ctx.weaknessCheck = w ? t(`Weakness.${w}`) : "";
      ctx.soilClan = VTM20.soilClans.includes(s.clan);
      ctx.lightClan = VTM20.lightBane.includes(s.clan);
    }
  }

  #prepareDisciplines(ctx) {
    const a = this.actor;
    const clanD = a.clanDisciplines;
    const items = a.items.filter(i => i.type === "discipline");
    const paths = a.items.filter(i => i.type === "thaumPath");
    const rituals = a.items.filter(i => i.type === "ritual");
    const ownPowers = a.items.filter(i => i.type === "power");
    const cap = Math.max(5, a.system.traitMax ?? 5);
    const rollInfo = r => r && (r.trait1 || r.blood || r.willpower || r.dice) ? {
      label: r.dice ? `${r.dice}d10` : [r.trait1 && a.traitLabel(r.trait1), r.trait2 && a.traitLabel(r.trait2)].filter(Boolean).join(" + ") + (r.base ? ` (${t("Magic.BaseAttr")})` : ""),
      diff: r.difficulty || "", note: r.note ?? "", blood: r.blood ?? 0, willpower: !!r.willpower, canRoll: !!(r.trait1 || r.dice)
    } : null;
    const mapRitual = r => ({
      id: r.id, name: r.name, level: r.system.level, roman: ROMAN[r.system.level - 1], html: r.system.description,
      open: this._open.has(r.id),
      roll: rollInfo({ ...(r.system.roll ?? {}), trait1: r.system.roll?.trait1 || "attributes.intelligence",
        trait2: r.system.roll?.trait1 ? r.system.roll.trait2 : "abilities.occult", difficulty: r.system.roll?.difficulty || Math.min(9, 3 + r.system.level) })
    });
    const mapOwn = p => ({
      id: p.id, name: p.name, level: p.system.level, roman: ROMAN[p.system.level - 1] ?? "—", html: p.system.description,
      open: this._open.has(p.id), roll: rollInfo(p.system.roll)
    });
    // Путь магии крови: силы справочника до текущего уровня и записанные вручную
    const mapPath = p => {
      const k = p.system.discipline, data = Codex.discipline(k);
      const pd = Codex.bloodPath(k, p.name);
      const pi = (data?.paths ?? []).indexOf(pd);
      return {
        id: p.id, name: p.name, value: p.system.value, primary: p.system.primary,
        dots: dots(p.system.value, 5, { path: "system.value", itemId: p.id }),
        html: pd?.html ?? p.system.description ?? "",
        powers: (pd?.powers ?? []).filter(x => x.level <= p.system.value).map((x, i) => ({
          ...x, id: `${p.id}-p${i}`, roman: ROMAN[x.level - 1], open: this._open.has(`${p.id}-p${i}`),
          roll: rollInfo(x.roll), codexRef: `${k}|path|${pi}|${i}`
        })),
        ownPowers: ownPowers.filter(o => o.system.discipline === k && o.system.path === p.name).sort((x, y) => x.system.level - y.system.level).map(mapOwn)
      };
    };
    const discKeys = new Set(items.map(i => i.system.key));
    const fxOn = new Set(a.powerEffects.map(x => x.power));
    const fxOf = (k, level) => {
      const key = `${k}:${level}`, def = POWER_EFFECTS[key];
      return def ? { key, on: fxOn.has(key), icon: def.icon ?? "fa-wand-sparkles",
        tip: `${t("Fx.Toggle")} · ${t(def.mode === "scene" ? "Fx.Scene" : "Fx.Toggleable")}` } : null;
    };
    ctx.activeFx = a.powerEffects.map(x => ({ id: x.effect.id, name: x.effect.name, img: x.effect.img,
      mode: t(x.def.mode === "scene" ? "Fx.Scene" : "Fx.Toggleable"), hit: !!x.def.diff?.hit }));
    ctx.disciplines = items.map(it => {
      const k = it.system.key;
      const data = Codex.discipline(k);
      const v = it.system.value;
      const inClan = it.system.inClan || clanD.includes(k);
      const myPaths = paths.filter(p => p.system.discipline === k).sort((x, y) => (y.system.primary - x.system.primary) || x.name.localeCompare(y.name));
      const isPathed = VTM20.pathDisciplines.includes(k) || myPaths.length > 0;
      // i — номер в полном списке сил (по нему codexRef), поэтому силы Тёмных веков отсекаем после нумерации
      // На уровне несколько сил (высокие уровни, альтернативы кланбуков) — показываем выбранную в system.choices,
      // а пока не выбрана — строку «выбрать». Эффекты (fx) описаны для сил основной книги, у альтернатив их нет.
      const choices = it.system.choices ?? {};
      const vis = (data?.powers ?? []).map((p, i) => [p, i]).filter(([p]) => Codex.visible(p));
      const powers = [];
      for (let lv = 1; lv <= v; lv++) {
        const opts = vis.filter(([p]) => fitsLevel(p, lv, choices));       // и «любой из 6–9» (Guide to the Camarilla)
        const pick = opts.length > 1 ? opts.find(([p]) => p.name === choices[lv]) : opts[0];
        if (!pick) {
          if (opts.length) powers.push({ choose: true, level: lv, roman: ROMAN[lv - 1] ?? lv, count: opts.length, itemId: it.id });
          continue;
        }
        const [p, i] = pick;
        powers.push({ ...p, level: lv, id: `${it.id}-p${i}`, roman: ROMAN[lv - 1] ?? lv, open: this._open.has(`${it.id}-p${i}`),
          roll: rollInfo(p.roll), codexRef: `${k}|${i}`, fx: p.source ? null : fxOf(k, p.level),
          alts: opts.length > 1 ? opts.length : 0, itemId: it.id });
      }
      const nextOpts = vis.filter(([p]) => fitsLevel(p, v + 1, choices));
      const nextPower = nextOpts.length ? { ...nextOpts[0][0], count: nextOpts.length } : null;
      const myRituals = rituals.filter(r => r.system.discipline === k);
      return {
        id: it.id, key: k, name: data?.name ?? it.name, en: data?.en ?? "", value: v,
        icon: VTM20.disciplineIcons[k] ?? "fa-droplet", sym: Codex.disciplineSymbol(k), inClan,
        dots: dots(v, cap, { path: "system.value", itemId: it.id }),
        powers, nextPower: nextPower ? { name: nextPower.count > 1 ? `выбор из ${nextPower.count} сил` : nextPower.name, level: nextPower.level } : null,
        ownPowers: ownPowers.filter(p => p.system.discipline === k && !p.system.path).sort((x, y) => x.system.level - y.system.level).map(mapOwn),
        physical: VTM20.physicalDisciplines[k] ? game.i18n.localize(VTM20.attributes[VTM20.physicalDisciplines[k]].label) : "",
        rules: (data?.rules ?? []).filter(r => r.title).map((r, i) => ({ ...r, id: `${it.id}-r${i}`, open: this._open.has(`${it.id}-r${i}`) })),
        isPathed,
        paths: myPaths.map(mapPath),
        pathChoices: VTM20.pathDisciplines.includes(k) ? (data?.paths ?? []).filter(pp => Codex.visible(pp) && !myPaths.some(m => m.name === pp.name)).map(pp => pp.name) : [],
        hasRituals: !!Codex.rituals[k]?.rituals?.some(r => Codex.visible(r)) || myRituals.length > 0,
        rituals: myRituals.sort((x, y) => x.system.level - y.system.level || x.name.localeCompare(y.name)).map(mapRitual),
        ritualChoices: (Codex.rituals[k]?.rituals ?? []).some(r => Codex.visible(r) && r.level <= v && !rituals.some(m => m.name === r.name)),
        xp: a.xpCost("discipline", v, { key: k, inClan }),
        open: this._open.has(it.id)
      };
    }).sort((x, y) => (y.inClan - x.inClan) || x.name.localeCompare(y.name, "ru"));
    // Пути, ритуалы и силы, чьей Дисциплины у персонажа нет, — по школам; без школы — общим списком в конце
    const orphan = [...paths, ...rituals, ...ownPowers].filter(i => !discKeys.has(i.system.discipline));
    const byKey = Map.groupBy(orphan, i => Codex.discipline(i.system.discipline) ? i.system.discipline : "");
    ctx.otherMagic = [...byKey].map(([k, list]) => ({
      key: k, name: Codex.discipline(k)?.name ?? "", sym: k ? Codex.disciplineSymbol(k) : null,
      icon: VTM20.disciplineIcons[k] ?? "fa-droplet",
      paths: list.filter(i => i.type === "thaumPath").sort((x, y) => x.name.localeCompare(y.name, "ru")).map(mapPath),
      rituals: list.filter(i => i.type === "ritual").sort((x, y) => x.system.level - y.system.level || x.name.localeCompare(y.name, "ru")).map(mapRitual),
      powers: list.filter(i => i.type === "power" && !(i.system.path && paths.some(p => p.name === i.system.path))).sort((x, y) => x.system.level - y.system.level).map(mapOwn)
    })).sort((x, y) => !x.key - !y.key || x.name.localeCompare(y.name, "ru"));
    ctx.allOpen = ctx.disciplines.length > 0 && ctx.disciplines.every(d => d.open);
    const owned = new Set(items.map(i => i.system.key));
    ctx.missingClan = clanD.filter(k => !owned.has(k)).length > 0;
    if (ctx.isGhoul) ctx.ghoulCap = a.system.disciplineMax;
  }

  #prepareAdvantages(ctx) {
    const a = this.actor;
    const byType = type => a.items.filter(i => i.type === type).sort((x, y) => x.name.localeCompare(y.name, "ru"));
    ctx.backgrounds = byType("background").map(i => ({
      id: i.id, name: i.name, value: i.system.value, html: i.system.description, open: this._open.has(i.id),
      dots: dots(i.system.value, Math.max(5, i.system.value), { path: "system.value", itemId: i.id })
    }));
    const mf = type => byType(type).map(i => ({
      id: i.id, name: i.name, cost: i.system.cost, html: i.system.description, open: this._open.has(i.id),
      category: game.i18n.localize(VTM20.meritCategories[i.system.category]?.label ?? "")
    }));
    ctx.merits = mf("merit");
    ctx.flaws = mf("flaw");
    ctx.meritTotal = ctx.merits.reduce((s, m) => s + m.cost, 0);
    ctx.flawTotal = ctx.flaws.reduce((s, m) => s + m.cost, 0);
    ctx.mfColumns = [
      { key: "merit", label: "VTM20.Sheet.Merits", list: ctx.merits, total: ctx.meritTotal },
      { key: "flaw", label: "VTM20.Sheet.Flaws", list: ctx.flaws, total: ctx.flawTotal }
    ];
    ctx.derangements = byType("derangement").map(i => ({ id: i.id, name: i.name, html: i.system.description, permanent: i.system.permanent, open: this._open.has(i.id) }));
    ctx.bonds = (a.system.bonds ?? []).map((b, i) => ({ ...b, index: i, dots: dots(b.rating, 3, { path: `system.bonds.${i}.rating` }),
      isRegnant: b.role === "regnant", tip: t("BondX.Tip", { n: b.drinks ?? 0, last: b.last || "—" }) }));
  }

  #prepareGear(ctx) {
    const a = this.actor, s = a.system;
    ctx.weapons = a.items.filter(i => i.type === "weapon").map(i => {
      const w = i.system;
      const kind = VTM20.weaponKinds[w.kind] ?? VTM20.weaponKinds.melee;
      const str = w.strength ? s.attributes.strength.total : 0;
      return {
        id: i.id, name: i.name, img: i.img, equipped: w.equipped,
        kindLabel: game.i18n.localize(kind.label), icon: weaponIcon(w.kind, i.name),
        pool: s.attributes[kind.attribute].total + s.abilities[kind.ability].value,
        damage: w.strength ? `${t("Attr.strength")} + ${w.damage}` : String(w.damage),
        damageDice: str + w.damage + (w.strength ? a.physicalDisciplineBonus("strength") : 0),
        damageType: game.i18n.localize(VTM20.damageTypes[w.damageType]?.short ?? ""),
        damageTypeKey: w.damageType, difficulty: w.difficulty,
        range: w.range, rate: w.rate, clip: w.clip, concealment: w.concealment
      };
    });
    ctx.armors = a.items.filter(i => i.type === "armor").map(i => ({ id: i.id, name: i.name, rating: i.system.rating, penalty: i.system.penalty, equipped: i.system.equipped }));
    ctx.money = moneyView(a);
    const res = a.items.find(i => i.type === "background" && /^ресурс/i.test(i.name));
    ctx.resources = res ? { dots: "●".repeat(res.system.value), html: (res.system.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400) } : null;
    ctx.gear = a.items.filter(i => i.type === "gear").map(i => ({ id: i.id, name: i.name, img: i.img, quantity: i.system.quantity }));
    // value — номер в полном списке заготовок; снаряжение Тёмных веков — только с настройкой «Контент из Dark Ages»
    const presetGroups = list => [...new Set(list.filter(p => Codex.visible(p)).map(p => p.group))].map(g => ({
      label: g, options: list.map((p, i) => ({ value: i, label: p.name, group: p.group, show: Codex.visible(p) })).filter(p => p.group === g && p.show)
    }));
    ctx.weaponPresets = WEAPON_PRESETS.map((p, i) => ({ value: i, label: p.name, group: p.group })).filter((_, i) => Codex.visible(WEAPON_PRESETS[i]));
    ctx.weaponPresetGroups = presetGroups(WEAPON_PRESETS);
    ctx.armorPresetGroups = presetGroups(ARMOR_PRESETS);
  }

  /* ── Рендер ─────────────────────────────────────────────────────────── */

  _onRender(context, options) {
    super._onRender(context, options);
    attachCombos(this.element);                         // Натура, Маска, Секта — свой список вместо <datalist>
    this.element.classList.toggle("is-mortal", this.actor.type === "mortal");
    this.element.classList.toggle("is-ghoul", this.actor.type === "ghoul");
    // AppV2 заменяет только перерисованные части: убираем ворота после создания и лист — до него
    const gated = this.needsCreation;
    const stale = gated ? Object.keys(this.constructor.PARTS).filter(p => !["header", "gate"].includes(p)) : ["gate"];
    for (const part of stale) this.element.querySelector(`[data-application-part="${part}"]`)?.remove();
    this.element.classList.toggle("is-gated", gated);
    // Подвал: ночные часы обновляются раз в 20 секунд, без перерисовки листа
    if (this._footTick) clearInterval(this._footTick);
    this._footTick = setInterval(() => {
      const foot = this.element?.querySelector("[data-r-foot]");
      if (!foot) return;
      const c = clockBarData();
      const set = (sel, v) => { const n = foot.querySelector(sel); if (n && n.textContent !== v) n.textContent = v; };
      set("[data-foot-time]", c.time); set("[data-foot-date]", c.longDate);
      set("[data-foot-rep]", c.republic); set("[data-foot-until]", c.phase.untilLabel);
    }, 20000);
    // Готовое оружие и броня: выбор в списке сразу добавляет предмет (поле без name — в форму листа не попадает)
    for (const el of this.element.querySelectorAll("input[data-preset]")) {
      el.addEventListener("change", ev => {
        ev.stopPropagation();
        const key = el.dataset.key;
        if (key === undefined || key === "") return;
        delete el.dataset.key;
        el.value = "";
        this.#addPreset(el.dataset.preset, Number(key));
      });
    }
    // Поля предметов прямо на листе (имя пути, уровень ритуала…)
    for (const el of this.element.querySelectorAll("[data-item-field]")) {
      el.addEventListener("change", ev => {
        ev.stopPropagation();
        const item = this.actor.items.get(el.dataset.itemId);
        if (!item) return;
        const val = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) : el.value;
        item.update({ [el.dataset.itemField]: val });
      });
    }
  }

  changeTab(tab, group, options) {
    super.changeTab(tab, group, options);
    const pane = this.element?.querySelector(`.r-pane[data-tab="${tab}"]`);
    if (!pane) return;
    pane.classList.remove("is-entering");
    void pane.offsetWidth;                                   // перезапуск анимации
    pane.classList.add("is-entering");
    setTimeout(() => pane.classList.remove("is-entering"), 260);
  }

  async close(options) {
    if (this._footTick) { clearInterval(this._footTick); this._footTick = null; }
    return super.close(options);
  }

  /** Массивы (вторичные способности, узы, журнал опыта) из формы приходят объектами — собираем обратно. */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    const src = this.actor._source.system;
    for (const key of ["secondary", "bonds", "timeline"]) {
      const v = data.system?.[key];
      if (v && !Array.isArray(v)) {
        const arr = foundry.utils.deepClone(src[key]);
        for (const [i, row] of Object.entries(v)) arr[Number(i)] = foundry.utils.mergeObject(arr[Number(i)] ?? {}, row);
        data.system[key] = arr;
      }
    }
    const log = data.system?.experience?.log;
    if (log && !Array.isArray(log)) {
      const arr = foundry.utils.deepClone(src.experience.log);
      for (const [i, row] of Object.entries(log)) arr[Number(i)] = foundry.utils.mergeObject(arr[Number(i)] ?? {}, row);
      data.system.experience.log = arr;
    }
    return data;
  }

  /* ── Действия: точки и шкалы ────────────────────────────────────────── */

  /** Выбрать (или сменить) силу уровня, где их несколько. */
  static async #onChoosePower(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (item && this.isEditable) await choosePower(item, Number(target.dataset.level));
  }

  static async #onSetDots(event, target) {
    if (!this.isEditable) return;
    const path = target.dataset.path;
    const n = Number(target.dataset.n);
    const doc = target.dataset.itemId ? this.actor.items.get(target.dataset.itemId) : this.actor;
    if (!doc) return;
    const cur = Number(foundry.utils.getProperty(doc._source, path) ?? foundry.utils.getProperty(doc, path) ?? 0);
    const min = Number(target.dataset.min ?? 0);
    // правый клик или клик по последней точке — снять одну
    const next = (event.button === 2 || n === cur) ? Math.max(min, n - 1) : n;
    await doc.update({ [path]: next });
  }

  /** Здоровье: клик по клетке — цикл «пусто → / → X → ✱ → пусто» для нижней отмеченной. */
  static async #onSetHealth(event, target) {
    if (!this.isEditable) return;
    const h = this.actor._source.system.health;
    const type = target.dataset.type;
    if (event.button === 2) {
      if (h[type] > 0) await this.actor.update({ [`system.health.${type}`]: h[type] - 1 });
      return;
    }
    await this.actor.applyDamage(1, type);
  }

  /* ── Действия: броски ───────────────────────────────────────────────── */

  static #onRollTrait(event, target) {
    const p = target.dataset.trait;
    const cfg = {};
    if (p.startsWith("abilities.") || p.startsWith("secondary.") || p.startsWith("disciplines.")) {
      cfg.trait2 = p;
      cfg.trait1 = this._lastAttr ?? (p.startsWith("disciplines.") ? "attributes.wits" : "attributes.dexterity");
    } else {
      cfg.trait1 = p;
      if (p.startsWith("attributes.")) this._lastAttr = p;
    }
    if (p.startsWith("virtues.") || p.startsWith("willpower") || p.startsWith("morality")) cfg.reflexive = true;
    return RollDialog.prompt(this.actor, cfg);
  }

  static #onRollFree() { return RollDialog.prompt(this.actor, {}); }

  static async #onRollInitiative() {
    const combat = game.combat;
    if (combat) {
      const c = combat.combatants.find(x => x.actor?.id === this.actor.id) ?? null;
      if (c) return combat.rollInitiative([c.id]);
    }
    // вне боя — просто бросок в чат (04)
    const r = await new Roll("1d10 + @initiative", this.actor.getRollData()).evaluate();
    return r.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: t("Roll.Initiative") });
  }

  /** Ярость, Ротшрек, деградация — проверки Добродетелей (05, 06). */
  static #onRollVirtue(event, target) {
    const kind = target.dataset.kind;
    const a = this.actor;
    if (kind === "frenzy") {
      // Бруха: +2 к сложности, воля не помогает предотвратить (02)
      const brujah = a.system.clan === "brujah" || a.system.clan === "bruhaAntitribu";
      return RollDialog.prompt(a, {
        title: t("Roll.frenzy.title"), trait1: "virtues.selfControl", reflexive: true, kind: "frenzy",
        extra: { atavism: VTM20.atavismClans.includes(a.system.clan) },
        difficulty: 6 + (brujah ? 2 : 0) - (a.type === "ghoul" ? 3 : 0), noWillpower: brujah, lockTraits: true
      });
    }
    if (kind === "rotschreck") return RollDialog.prompt(a, { title: t("Roll.rotschreck.title"), trait1: "virtues.courage", reflexive: true, kind: "rotschreck", difficulty: 6, lockTraits: true });
    if (kind === "degeneration") return RollDialog.prompt(a, { title: t("Roll.degeneration.title"), trait1: "virtues.conscience", reflexive: true, kind: "degeneration", difficulty: 8, noWillpower: true, lockTraits: true });
    if (kind === "awakening") return RollDialog.prompt(a, { title: t("Roll.Awakening"), trait1: "morality.value", reflexive: true, difficulty: 8, lockTraits: true });
    if (kind === "willpower") return RollDialog.prompt(a, { title: t("Willpower"), trait1: "willpower.permanent", reflexive: true, difficulty: 6 });
    if (kind === "weakness") {
      const w = VTM20.weaknessChecks[a.system.clan];
      return RollDialog.prompt(a, { title: t(`Weakness.${w}`), trait1: "virtues.selfControl", reflexive: true, difficulty: 6, kind: "weakness", lockTraits: true });
    }
  }

  /** Атака оружием — окно боя с манёврами и модификаторами (04). */
  static #onRollWeapon(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    return openAttack(this.actor, { weapon: id ?? null });
  }
  static #onAttack() { return openAttack(this.actor); }
  static #onHazard() { return openHazard(this.actor); }
  static #onDiablerie() { return openDiablerie(this.actor); }

  static #onTakeDamage() { return openDamageDialog(this.actor); }
  static #onOpenCreator() { return openCreator(this.actor); }

  /** Заполнить лист вручную, без мастера. */
  static async #onSkipCreation() {
    await this.actor.setFlag(SYSTEM_ID, "created", true);
    this.render({ force: true });
  }
  static #onHunt() { return openHunt(this.actor); }

  /* ── Действия: кровь и воля ─────────────────────────────────────────── */

  static #onBloodHeal(event, target) { return this.actor.bloodHeal(target.dataset.type || null); }
  static #onBoost(event, target) { return this.actor.boostAttribute(target.dataset.attr); }
  static #onClearBoosts() { return this.actor.clearBoosts(); }
  static #onAwaken() { return this.actor.awaken({ willpower: game.settings.get(SYSTEM_ID, "nightlyWillpower") }); }
  static #onSpendBlood() { return this.actor.spendBlood(1, { reason: t("Notify.ReasonManual") }); }
  static #onSpendWill() { return this.actor.spendWillpower(1); }

  /* ── Действия: Дисциплины ───────────────────────────────────────────── */

  /** Библиотека справочника: Дисциплины, пути, ритуалы, черты, факты биографии, психозы. */
  static #onMoney() { return openMoney(this.actor); }
  static #onTogglePower(event, target) { return togglePowerEffect(this.actor, target.dataset.power); }
  static #onEndPower(event, target) {
    const e = this.actor.effects.get(target.dataset.effectId);
    if (e) return this.actor.endPower(e);
  }

  static #onLibrary(event, target) {
    return openLibrary({ actor: this.actor, kind: target.dataset.kind, discipline: target.dataset.discipline });
  }

  async #createDiscipline(key, value = 1) {
    if (!Codex.discipline(key)) return;
    const [item] = await this.actor.createEmbeddedDocuments("Item", [LibraryItems.discipline(key, value)]);
    this._open.add(item.id);
    return item;
  }

  static async #onAddClanDisciplines() {
    const owned = new Set(this.actor.items.filter(i => i.type === "discipline").map(i => i.system.key));
    for (const k of this.actor.clanDisciplines) if (!owned.has(k)) await this.#createDiscipline(k, 0);
  }

  /** Заготовка оружия или брони по номеру в полном списке (выбор в списке с поиском на вкладке «Снаряжение»). */
  async #addPreset(kind, i) {
    const p = (kind === "weapon" ? WEAPON_PRESETS : ARMOR_PRESETS)[i];
    if (!p) return;
    const { name, group, ...system } = p;
    await this.actor.createEmbeddedDocuments("Item", [{ name, type: kind, img: `systems/${SYSTEM_ID}/assets/icons/${kind}.svg`, system }]);
  }

  /** Снять состояние со значка на портрете. */
  static async #onClearStatus(event, target) {
    if (target.dataset.status) await this.actor.toggleStatusEffect(target.dataset.status, { active: false });
  }

  /** Раскрыть все Дисциплины, а если все уже раскрыты — свернуть. */
  static #onToggleAll() {
    const ids = this.actor.items.filter(i => i.type === "discipline").map(i => i.id);
    const open = ids.every(id => this._open.has(id));
    for (const id of ids) open ? this._open.delete(id) : this._open.add(id);
    this.render();
  }

  static #onToggleRow(event, target) {
    const id = target.dataset.rowId;
    if (this._open.has(id)) this._open.delete(id); else this._open.add(id);
    target.closest(".r-row-wrap")?.classList.toggle("is-open", this._open.has(id));
  }

  /** Бросок силы из справочника: пул и сложность разобраны из текста книги. */
  static #onRollPower(event, target) {
    const ref = target.dataset.ref.split("|");
    const d = Codex.discipline(ref[0]);
    let p, pathName = "";
    if (ref[1] === "path") { const pth = d?.paths[Number(ref[2])]; p = pth?.powers[Number(ref[3])]; pathName = pth?.name ?? ""; }
    else p = d?.powers[Number(ref[1])];
    if (!p) return;
    const magic = VTM20.pathDisciplines.includes(ref[0]);
    return VtMActorSheet.#rollFromSpec(this.actor, p.roll ?? {}, { title: p.name, subtitle: `${pathName || d.name} · ${ROMAN[p.level - 1] ?? p.level}`, effect: p.html,
      kind: magic ? "magic" : "check", magic: magic ? { disc: ref[0], level: p.level, path: pathName } : null,
      power: { disc: ref[0], level: p.level, path: pathName, name: p.name } });
  }

  /** Бросок записанной силы или ритуала (предмета). */
  static #onRollItemPower(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    if (item.type === "ritual") {
      // Ритуал (V20, гл. 4): Интеллект + Оккультизм, сл. 3 + уровень (≤ 9); 5 минут × уровень; уровень Дисциплины не ниже уровня ритуала
      const lvl = item.system.level, disc = item.system.discipline, have = this.actor.discipline(disc);
      if (have < lvl) return ui.notifications.warn(t("Magic.RitualTooHigh", { name: item.name, d: Codex.disciplineLabel(disc), n: have, l: lvl }));
      // своё в ритуале берём только заполненное: пустые поля схемы (сложность 0) правило не затирают
      const own = item.system.roll ?? {};
      const r = { ...own, trait1: own.trait1 || "attributes.intelligence", trait2: own.trait1 ? own.trait2 : "abilities.occult",
        difficulty: own.difficulty || Math.min(9, 3 + lvl) };
      const time = t("Magic.RitualTime", { n: 5 * lvl });
      return VtMActorSheet.#rollFromSpec(this.actor, { ...r, note: [r.note, time].filter(Boolean).join(" · ") },
        { title: item.name, subtitle: `${t("Sheet.Ritual")} · ${Codex.disciplineLabel(disc)} · ${ROMAN[lvl - 1]}`, effect: item.system.description,
          kind: "ritual", magic: { disc, level: lvl, ritual: true } });
    }
    const sub = item.system.path || Codex.disciplineLabel(item.system.discipline) || "";
    const magic = VTM20.pathDisciplines.includes(item.system.discipline);
    return VtMActorSheet.#rollFromSpec(this.actor, item.system.roll ?? {}, { title: item.name, subtitle: sub, effect: item.system.description,
      kind: magic ? "magic" : "check", magic: magic ? { disc: item.system.discipline, level: item.system.level, path: item.system.path } : null,
      power: { disc: item.system.discipline, level: item.system.level, path: item.system.path, name: item.name } });
  }

  /** Бросок по описанию силы: черты, сложность, цена; фиксированный пул (Тауматургическая защита); «чистая» характеристика (Колдовство). */
  static #rollFromSpec(actor, r, { title, subtitle, effect, kind = "check", magic = null, power = null }) {
    return RollDialog.prompt(actor, {
      title, subtitle, trait1: r.trait1 ?? "", trait2: r.trait2 ?? "",
      difficulty: r.difficulty || VTM20.defaultDifficulty, bloodCost: r.blood ?? 0, willpowerCost: !!r.willpower,
      diffNote: r.note ?? "", effect, kind, baseAttr: !!r.base,
      ...(r.dice ? { pool: r.dice, lockTraits: true, breakdown: [{ label: t("Magic.FixedPool"), value: r.dice }] } : {}),
      extra: { ...(magic ? { magic } : {}), ...(power ? { power } : {}) }
    });
  }

  /** Описание силы — в чат. */
  static async #onPowerToChat(event, target) {
    const { disc, level, name, pathId } = target.dataset;
    let p;
    if (pathId) {
      const it = this.actor.items.get(pathId);
      p = Codex.bloodPath(it.system.discipline, it.name)?.powers.find(x => x.name === name);
    } else p = Codex.discipline(disc)?.powers.find(x => x.name === name && (String(x.level) === level || x.anyLevel));   // anyLevel — взята на 6–9
    if (!p) return;
    const dname = pathId ? this.actor.items.get(pathId).name : Codex.disciplineLabel(disc);
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<div class="r-item-card"><header><span class="r-card-kicker">${dname} · ${ROMAN[(p.anyLevel ? Number(level) : p.level) - 1] ?? p.level}</span><h3>${p.name}</h3>${p.en ? `<em>${p.en}</em>` : ""}</header><div class="r-card-body">${p.html}</div></div>`
    });
  }

  /* ── Действия: предметы ─────────────────────────────────────────────── */

  static async #onItemCreate(event, target) {
    const type = target.dataset.type;
    const [item] = await this.actor.createEmbeddedDocuments("Item", [{
      name: game.i18n.format("DOCUMENT.New", { type: game.i18n.localize(`TYPES.Item.${type}`) }), type,
      img: `systems/${SYSTEM_ID}/assets/icons/${type}.svg`
    }]);
    item?.sheet.render(true);
  }

  static #itemOf(target) { return this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId); }

  static #onItemEdit(event, target) { VtMActorSheet.#itemOf.call(this, target)?.sheet.render(true); }

  static async #onItemDelete(event, target) {
    const item = VtMActorSheet.#itemOf.call(this, target);
    if (!item) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("Confirm.DeleteTitle") }, content: `<p>${t("Confirm.Delete", { name: item.name })}</p>`
    });
    if (ok) await item.delete();
  }

  static async #onItemToggle(event, target) {
    const item = VtMActorSheet.#itemOf.call(this, target);
    const field = target.dataset.field;
    if (item && field) await item.update({ [field]: !foundry.utils.getProperty(item, field) });
  }

  static #onItemChat(event, target) { VtMActorSheet.#itemOf.call(this, target)?.toChat(); }

  /* ── Действия: списки ───────────────────────────────────────────────── */

  static async #onAddSecondary(event, target) {
    const list = foundry.utils.deepClone(this.actor._source.system.secondary);
    list.push({ name: "", group: target.dataset.group ?? "talents", value: 1, specialty: "" });
    await this.actor.update({ "system.secondary": list });
  }
  static async #onRemoveSecondary(event, target) {
    const list = foundry.utils.deepClone(this.actor._source.system.secondary);
    list.splice(Number(target.dataset.index), 1);
    await this.actor.update({ "system.secondary": list });
  }
  static async #onAddBond() {
    const list = foundry.utils.deepClone(this.actor._source.system.bonds ?? []);
    list.push({ name: "", rating: 1, role: "regnant", drinks: 1, last: "" });
    await this.actor.update({ "system.bonds": list });
  }
  /** Узы крови (05): глоток витэ сюзерена и попытка сопротивляться — module/apps/bonds.mjs. */
  static async #onDrinkBond(event, target) {
    const { drinkVitae } = await import("../apps/bonds.mjs");
    return drinkVitae(this.actor, Number(target.dataset.index));
  }
  static async #onResistBond(event, target) {
    const { resistBond } = await import("../apps/bonds.mjs");
    return resistBond(this.actor, Number(target.dataset.index));
  }
  static async #onRemoveBond(event, target) {
    const list = foundry.utils.deepClone(this.actor._source.system.bonds ?? []);
    list.splice(Number(target.dataset.index), 1);
    await this.actor.update({ "system.bonds": list });
  }
  /** Хроника: новое событие в конец списка (по порядку дат). */
  static async #onAddEvent() {
    const list = foundry.utils.deepClone(this.actor._source.system.timeline ?? []);
    list.push({ date: "", text: "" });
    await this.actor.update({ "system.timeline": list });
    this.element.querySelector(".r-tl-row:last-child .r-tl-date")?.focus();
  }
  static async #onRemoveEvent(event, target) {
    const list = foundry.utils.deepClone(this.actor._source.system.timeline ?? []);
    list.splice(Number(target.dataset.index), 1);
    await this.actor.update({ "system.timeline": list });
  }

  static async #onAddXp() {
    const s = this.actor._source.system.experience;
    const log = foundry.utils.deepClone(s.log);
    log.unshift({ amount: 1, reason: "", date: new Date().toLocaleDateString("ru-RU") });
    await this.actor.update({ "system.experience.log": log, "system.experience.total": s.total + 1 });
  }
  static async #onRemoveXp(event, target) {
    const s = this.actor._source.system.experience;
    const log = foundry.utils.deepClone(s.log);
    const [row] = log.splice(Number(target.dataset.index), 1);
    const upd = { "system.experience.log": log };
    if (row?.amount > 0) upd["system.experience.total"] = Math.max(0, s.total - row.amount);
    await this.actor.update(upd);
  }

  /** Купить следующую точку за опыт (01). */
  static async #onBuy(event, target) {
    const { path, kind, itemId } = target.dataset;
    const doc = itemId ? this.actor.items.get(itemId) : this.actor;
    const cur = Number(foundry.utils.getProperty(doc._source, path) ?? 0);
    const extra = itemId && doc.type === "discipline" ? { key: doc.system.key, inClan: doc.system.inClan || this.actor.clanDisciplines.includes(doc.system.key) } : {};
    const cost = this.actor.xpCost(kind, cur, extra);
    if (cost == null) return;
    const xp = this.actor.system.experience;
    if (xp.available < cost) { ui.notifications.warn(t("Notify.NoXp", { cost, have: xp.available })); return; }
    const label = itemId ? doc.name : target.dataset.label;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("Xp.BuyTitle") }, content: `<p>${t("Xp.BuyConfirm", { label, from: cur, to: cur + 1, cost })}</p>`
    });
    if (!ok) return;
    await doc.update({ [path]: cur + 1 });
    const log = foundry.utils.deepClone(this.actor._source.system.experience.log);
    log.unshift({ amount: -cost, reason: `${label}: ${cur} → ${cur + 1}`, date: new Date().toLocaleDateString("ru-RU") });
    await this.actor.update({ "system.experience.spent": this.actor._source.system.experience.spent + cost, "system.experience.log": log });
  }
}

// Повтор той же Дисциплины, факта биографии, достоинства или недостатка у персонажа — не добавлять, а предупредить
// (библиотека, перетаскивание из компендия, «Своё» с тем же именем).
const UNIQUE_TYPES = ["discipline", "background", "merit", "flaw", "derangement", "thaumPath", "ritual"];
Hooks.on("preCreateItem", (item, data, options, userId) => {
  const actor = item.parent;
  if (!(actor instanceof Actor) || !UNIQUE_TYPES.includes(item.type) || options.allowDuplicate) return;
  const same = actor.items.find(i => i.type === item.type     // новый предмет ещё не в коллекции (а его _id может совпасть при копировании)
    &&(item.type === "discipline" ? i.system.key && i.system.key === item.system.key : i.name === item.name)
    && (!["thaumPath", "ritual"].includes(item.type) || i.system.discipline === item.system.discipline));   // один путь бывает в разных школах
  if (!same) return;
  if (userId === game.user.id) ui.notifications.warn(game.i18n.format("VTM20.Sheet.DuplicateItem", { name: same.name }));
  return false;
});
