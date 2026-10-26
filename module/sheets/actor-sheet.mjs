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
import { rollVirtueCheck } from "../dice/virtue-checks.mjs";
import { rollPool } from "../dice/roll.mjs";
import { openDamageDialog } from "../apps/damage.mjs";
import { WEAPON_PRESETS, ARMOR_PRESETS } from "../data/equipment.mjs";
import { openCreator } from "../apps/creator.mjs";
import { openHunt } from "../apps/night.mjs";
import { openDowntime } from "../apps/downtime.mjs";
import { openXp } from "../apps/xp.mjs";
import { openAttack } from "../combat/combat.mjs";
import { openHazard } from "../apps/hazard.mjs";
import { openDiablerie } from "../apps/diablerie.mjs";
import { openClans } from "../apps/clans.mjs";
import { REVENANT_FAMILIES, revenantFamily } from "../data/revenants.mjs";
import { BOON_LEVELS, boonLevelLabel, addBoon, toggleBoon, removeBoon, openBoons } from "../apps/boons.mjs";
import { clockBarData, longDate } from "../apps/calendar.mjs";
import { openLibrary, LibraryItems } from "../apps/library.mjs";
import { moneyView, openMoney } from "../data/money.mjs";
import { POWER_EFFECTS, MODE_LABEL } from "../data/effects.mjs";
import { effectTimer, readingRituals, toggleRitualReading, cancelRitual } from "../apps/timers.mjs";
import { torporView, deathOf, enterTorpor, wakeFromTorpor, undoDeath } from "../apps/torpor.mjs";
import { makeExtra } from "../apps/extras.mjs";
import { ritualHTML } from "../data/ritual-text.mjs";
import { openThrallGifts } from "../apps/thrall-gifts.mjs";
import { loseHost, holdOn, newHost, summonedBack } from "../apps/host.mjs";
import { openCult } from "../apps/cult.mjs";
import { possess, extend as possessExtend, leave as possessLeave, battleExpiry, possessionView } from "../apps/possession.mjs";
import { MERIT_MODS, describeMeritMod } from "../data/merit-mods.mjs";
import { weaponIcon as weaponImg, armorIcon as armorImg } from "../data/icons.mjs";
import { togglePowerEffect } from "../apps/power-effects.mjs";
import { lineUp, childrenOf, bloodCheck, actorByName } from "../data/lineage.mjs";
import { isSabbat, vinculumMeaning, rollPackVinculi, openVaulderie, loyaltyConflict } from "../apps/vaulderie.mjs";
import { coteriesOf, poolValue, openCoterie } from "../apps/coterie.mjs";
import { itemCardHTML } from "../chat/item-card.mjs";
import { themeClass } from "../ui/themes.mjs";
import { openHouses } from "../apps/houses.mjs";
import { formFeatures, mechLabel, needsPick, signed } from "../data/form.mjs";
import { ghoulify } from "../apps/embrace-ghoul.mjs";
import { openTormentLog, virtuePrompt, thrallSin, thrallPact, thrallBreak, formUpkeep, atoneWithXp, assumeForm, sceneHighFeature, harvestFaith, pactFaith, innateRoll, ritualTurn, ritualEffect, ritualNeed, suggestSin, revelation, gainTorment, thrallState, thrallCap, reliquaryInfo, worshipRitual, reliquaryDraw } from "../apps/torment.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const TextEditor = () => foundry.applications.ux.TextEditor.implementation;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const clockDate = ms => longDate(new Date(ms));

/** Описание вторичной способности из data/abilities.json — простым текстом для подсказки. */
const abilityTip = name => {
  const x = name && (Codex.abilities ?? []).find(y => y.name.toLowerCase() === String(name).trim().toLowerCase());
  // без строки «Источник: …» — подсказка начинается с сути
  return x ? x.html.replace(/^<p><em>[\s\S]*?<\/em><\/p>/, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 420) : "";
};

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
      readRitual: VtMActorSheet.#onReadRitual,
      makeExtra: VtMActorSheet.#onMakeExtra,
      torporEnter: VtMActorSheet.#onTorporEnter,
      torporWake: VtMActorSheet.#onTorporWake,
      torporWakeBlood: VtMActorSheet.#onTorporWakeBlood,
      undoDeath: VtMActorSheet.#onUndoDeath,
      cancelRitual: VtMActorSheet.#onCancelRitual,
      toggleRow: VtMActorSheet.#onToggleRow,
      toggleAll: VtMActorSheet.#onToggleAll,
      toggleVitals: VtMActorSheet.#onToggleVitals,
      clearStatus: VtMActorSheet.#onClearStatus,
      effectToggle: VtMActorSheet.#onEffectToggle,
      openRules: VtMActorSheet.#onOpenRules,
      effectDelete: VtMActorSheet.#onEffectDelete,
      powerToChat: VtMActorSheet.#onPowerToChat,
      rollPower: VtMActorSheet.#onRollPower,
      addLore: VtMActorSheet.#onAddLore,
      toggleEarthbound: VtMActorSheet.#onToggleEarthbound,
      thrallAdd: VtMActorSheet.#onThrallEdit,
      thrallEdit: VtMActorSheet.#onThrallEdit,
      thrallDelete: VtMActorSheet.#onThrallDelete,
      thrallOpen: VtMActorSheet.#onThrallOpen,
      formPick: VtMActorSheet.#onFormPick,
      worship: VtMActorSheet.#onWorship,
      reliquaryDraw: VtMActorSheet.#onReliquaryDraw,
      houseAtlas: VtMActorSheet.#onHouseAtlas,
      tormentSin: VtMActorSheet.#onTormentSin, thrallSin: VtMActorSheet.#onThrallSin, thrallPact: VtMActorSheet.#onThrallPact, ghoulify: VtMActorSheet.#onGhoulify, formUpkeep: VtMActorSheet.#onFormUpkeep, thrallGifts: VtMActorSheet.#onThrallGifts,
      tormentLog: VtMActorSheet.#onTormentLog, hostLose: VtMActorSheet.#onHostLose,
      cult: VtMActorSheet.#onCult, possess: VtMActorSheet.#onPossess, possessExtend: VtMActorSheet.#onPossessExtend, possessLeave: VtMActorSheet.#onPossessLeave, possessBattle: VtMActorSheet.#onPossessBattle, hostHold: VtMActorSheet.#onHostHold, hostNew: VtMActorSheet.#onHostNew, hostSummoned: VtMActorSheet.#onHostSummoned, formLookImg: VtMActorSheet.#onFormLookImg, formLookClear: VtMActorSheet.#onFormLookClear, thrallBreak: VtMActorSheet.#onThrallBreak, openUuid: VtMActorSheet.#onOpenUuid,
      sinSuggest: VtMActorSheet.#onSinSuggest,
      tormentKind: VtMActorSheet.#onTormentKind,
      tormentAtone: VtMActorSheet.#onTormentAtone,
      addHouseLores: VtMActorSheet.#onAddHouseLores,
      apocalyptic: VtMActorSheet.#onApocalyptic,
      sceneHigh: VtMActorSheet.#onSceneHigh,
      formHighPick: VtMActorSheet.#onFormHighPick,
      revelation: VtMActorSheet.#onRevelation,
      faithHeal: VtMActorSheet.#onFaithHeal,
      harvestFaith: VtMActorSheet.#onHarvest,
      innate: VtMActorSheet.#onInnate,
      ritualTurn: VtMActorSheet.#onRitualTurn,
      ritualEffect: VtMActorSheet.#onRitualEffect,
      pactFaith: VtMActorSheet.#onPactFaith,
      spendFaith: VtMActorSheet.#onSpendFaith,
      pinPower: VtMActorSheet.#onPinPower,
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
      feedFrom: VtMActorSheet.#onFeedFrom,
      openPath: VtMActorSheet.#onOpenPath,
      openCoterie: VtMActorSheet.#onOpenCoterie,
      resistBond: VtMActorSheet.#onResistBond,
      removeBond: VtMActorSheet.#onRemoveBond,
      addVinc: VtMActorSheet.#onAddVinc,
      removeVinc: VtMActorSheet.#onRemoveVinc,
      packVinc: VtMActorSheet.#onPackVinc,
      vaulderie: VtMActorSheet.#onVaulderie,
      vincConflict: VtMActorSheet.#onVincConflict,
      addBoon: VtMActorSheet.#onAddBoon,
      toggleBoon: VtMActorSheet.#onToggleBoon,
      removeBoon: VtMActorSheet.#onRemoveBoon,
      openBoons: () => openBoons(),
      addXp: VtMActorSheet.#onAddXp,
      openXp: VtMActorSheet.#onOpenXp,
      addEvent: VtMActorSheet.#onAddEvent,
      removeEvent: VtMActorSheet.#onRemoveEvent,
      removeXp: VtMActorSheet.#onRemoveXp,
      buy: { handler: VtMActorSheet.#onBuy, buttons: [0] },
      openCreator: VtMActorSheet.#onOpenCreator,
      skipCreation: VtMActorSheet.#onSkipCreation,
      hunt: VtMActorSheet.#onHunt,
      downtime: VtMActorSheet.#onDowntime,
      attack: VtMActorSheet.#onAttack,
      hazard: VtMActorSheet.#onHazard,
      diablerie: VtMActorSheet.#onDiablerie,
      clanAtlas: VtMActorSheet.#onClanAtlas,
      linSire: VtMActorSheet.#onLinSire,
      linSheet: VtMActorSheet.#onLinSheet,
      linOpen: VtMActorSheet.#onLinOpen,
      linWeb: VtMActorSheet.#onLinWeb
    }
  };

  static PARTS = {
    tabs: { template: `${SYSTEM_PATH}/templates/actor/tabs.hbs` },
    header: { template: `${SYSTEM_PATH}/templates/actor/header.hbs` },
    gate: { template: `${SYSTEM_PATH}/templates/actor/gate.hbs` },
    vitals: { template: `${SYSTEM_PATH}/templates/actor/vitals.hbs` },
    traits: { template: `${SYSTEM_PATH}/templates/actor/traits.hbs`, scrollable: [""] },
    disciplines: { template: `${SYSTEM_PATH}/templates/actor/disciplines.hbs`, scrollable: [""] },
    effects: { template: `${SYSTEM_PATH}/templates/actor/effects.hbs`, scrollable: [""] },
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
        { id: "effects", icon: "fa-solid fa-wand-sparkles" },
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
  /** Шкалы (здоровье, воля, мораль) свёрнуты — общий выбор пользователя для всех листов, хранится в браузере. */
  _vitalsClosed = (() => { try { return localStorage.getItem("vtm20.vitalsClosed") === "1"; } catch { return false; } })();

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
    // у демона на месте Дисциплин — Знания и апокалиптическая форма
    if (this.actor.type === "demon" && parts.disciplines) parts.disciplines = { ...parts.disciplines, template: `${SYSTEM_PATH}/templates/actor/lores.hbs` };
    return parts;
  }

  _prepareTabs(group) {
    const tabs = super._prepareTabs(group);
    if (this.actor.type === "mortal") delete tabs.disciplines;
    if (this.actor.type === "demon" && tabs.disciplines) Object.assign(tabs.disciplines, { label: "VTM20.Demon.Lores", icon: "fa-solid fa-fire-flame-curved" });
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
      // длинное имя не обрезается в шапке: шрифт мельче
      nameSize: actor.name.length > 26 ? "is-xlong" : actor.name.length > 18 ? "is-long" : "",
      isVampire: actor.type === "vampire", isGhoul: actor.type === "ghoul", isMortal: actor.type === "mortal",
      isCreature: actor.type === "creature", isDemon: actor.type === "demon",
      hasBlood: actor.hasBlood,
      typeLabel: actor.type === "ghoul" && actor.system.ghoulType === "revenant" ? t("GhoulType.revenant") : game.i18n.localize(`TYPES.Actor.${actor.type}`),
      needsCreation: this.needsCreation,
      tabs: this._prepareTabs("primary")
    });
    this.#prepareHeader(ctx);
    this.#prepareTraits(ctx);
    this.#prepareRegistry(ctx);
    if (actor.type === "demon") this.#prepareLores(ctx);
    else if (actor.type !== "mortal") this.#prepareDisciplines(ctx);
    this.#prepareAdvantages(ctx);
    this.#prepareGear(ctx);
    this.#prepareEffects(ctx);
    if (actor.type === "vampire") this.#prepareLineage(ctx);
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
      ctx.isRevenant = s.ghoulType === "revenant";
      ctx.families = Object.entries(REVENANT_FAMILIES).map(([k, f]) => ({ value: k, label: f.name, selected: k === s.family }));
      if (s.family && !REVENANT_FAMILIES[s.family]) ctx.families.push({ value: s.family, label: s.family, selected: true });
      ctx.domitorClans = Codex.clans.filter(c => Codex.visible(c)).map(c => ({ value: c.key, label: c.name, selected: c.key === s.domitorClan || c.name === s.domitorClan }));
      ctx.ghoulTypes = ["vassal", "independent", "revenant"].map(k => ({ value: k, label: t(`GhoulType.${k}`), selected: k === s.ghoulType }));
      ctx.donorGenerations = Object.keys(VTM20.generations).map(Number).sort((x, y) => x - y)
        .map(g => ({ value: g, label: t("GenerationN", { n: g }), selected: g === s.domitorGeneration }));
    }
    if (ctx.isDemon) {
      const house = Codex.house(s.house);
      ctx.house = house;
      ctx.houses = Codex.houses.map(h => ({ value: h.key, label: h.name, selected: h.key === s.house }));   // аккадское имя — в строке над именем
      ctx.factions = Codex.factions.map(f => ({ value: f.key, label: f.name, selected: f.key === s.faction, tip: f.text }));
      ctx.visages = Object.entries(house?.visages ?? {}).map(([k, name]) => ({ value: k, label: name, lore: Codex.lore(k)?.name ?? k, selected: k === s.visage }));
      ctx.visageLore = ctx.visages.find(v => v.selected)?.lore ?? "";
    }
    // Герб на рельсе и водяной знак: клан, иначе секта; у гуля — герб клана домитора или сердце в цепях; у прочих — кокарда
    const sym = actor => actor.type === "vampire" ? Codex.clanSymbol(actor.system.clan)
      : actor.type === "ghoul" ? (Codex.clanSymbol(actor.system.domitorClan) ?? Codex._sym(Codex.assets?.sects?.ghoul)) : null;
    ctx.sigil = { sym: sym(a) ?? Codex.sectSymbol(s.details.sect), label: ctx.house?.name || a.clanLabel || s.details.sect || "", clan: a.type === "vampire" && !!Codex.clan(s.clan),
      img: VTM20.typeSigil(a.type) };
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
    // Способности эпох и сект (data/abilities.json) — подсказки для вторичных способностей по группам;
    // Тёмные века — с настройкой, Способности секты — персонажам этой секты
    const mySect = Codex.sectKey(s.details.sect);
    const extra = (Codex.abilities ?? []).filter(x => Codex.visible(x) && (!x.sect || x.sect === mySect));
    ctx.extraAbilities = Object.fromEntries(["talents", "skills", "knowledges"].map(g => [g, extra.filter(x => (x.group ?? "knowledges") === g).map(x => x.name)]));
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
    const abil = VTM20.abilitiesForEra(era, a.type);
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
      secondary: s.secondary.map((x, i) => ({ ...x, index: i, dots: dots(x.value, cap, { path: `system.secondary.${i}.value` }), tip: abilityTip(x.name) }))
        .filter(x => x.group === gk),
      combo: ctx.extraAbilities?.[gk]?.length ? `r-abil-${a.id}-${gk}` : ""
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
    // Слуга падшего: вместо Человечности — Вера слуги, хозяин и грех по порогу Воли
    if (a.isThrall) {
      const master = s.thrall.master ? fromUuidSync(s.thrall.master) : null;
      ctx.thrallInfo = { faith: s.thrall.faith, faithDots: dots(s.thrall.faith, 5, { path: "system.thrall.faith" }),
        master: master?.name ?? "", masterUuid: master ? s.thrall.master : "",
        sin: game.i18n.localize(`VTM20.Demon.ThrallSinRow.${Math.max(1, Math.min(10, s.willpower.permanent))}`),
        gifts: (s.thrall.gifts ?? []).length };
    }
    // Привязанный: в карточке Муки — Потребности вместо Добродетелей
    if (ctx.isDemon && s.earthbound) ctx.urges = ["flesh", "thought", "emotion"].map(k => {
      const v = s.urges?.[k] ?? 1;
      return { key: k, label: game.i18n.localize(`VTM20.Demon.Urge.${k}`), tip: game.i18n.localize(`VTM20.Demon.UrgeTip.${k}`), value: v,
        dots: dots(v, 5, { path: `system.urges.${k}` }), xp: a.xpCost("urge", v) };
    });
    if (ctx.isDemon) {
      ctx.hostMiles = (s.willpower?.permanent ?? 0) + 5;
      ctx.faithPerm = dots(s.faith.permanent, 10, { path: "system.faith.permanent" });
      ctx.faithBoxes = dots(s.faith.temporary, 10, { path: "system.faith.temporary" });
      ctx.tormentPerm = dots(s.torment.permanent, 10, { path: "system.torment.permanent" });
      ctx.tormentTemp = dots(s.torment.temporary, 10, { path: "system.torment.temporary" });
      ctx.tormentHigh = s.torment.permanent >= 7;
      ctx.faithXp = a.xpCost("faith", s.faith.permanent);
    }
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
    // Шкала здоровья: штраф под клеткой (0, −1 … −5), у последней — «выбыл»; тяжесть штрафа — цветом
    const lastHurt = s.health.levels.reduce((n, l, i) => l.state && l.state !== "none" ? i : n, -1);
    ctx.health = s.health.levels.map((l, i) => ({
      ...l, label: game.i18n.localize(l.label),
      penaltyLabel: l.penalty == null ? "" : l.penalty === 0 ? "0" : `−${Math.abs(l.penalty)}`,
      out: l.penalty == null, sev: l.penalty == null ? 4 : Math.min(3, Math.abs(l.penalty ?? 0) > 2 ? 3 : Math.abs(l.penalty ?? 0)),
      current: i === lastHurt,
      mark: VTM20.damageTypes[l.state]?.mark ?? ""
    }));
    ctx.healthStatus = s.health.status === "healthy" ? t("Health.healthy") : t(`Health.${s.health.status}`);
    ctx.healthHurt = s.health.damage > 0;
    ctx.clock = clockBarData();
    ctx.woundPenalty = s.health.penalty;
    ctx.vitalsClosed = this._vitalsClosed;
    ctx.torpor = VTM20.torporDuration[s.morality.value];
    ctx.torporState = torporView(a);
    const dead = deathOf(a);
    ctx.death = dead ? { at: clockDate(dead.at), cause: t(`Torpor.Death.Cause.${dead.cause ?? "aggravated"}`) } : null;
    ctx.canSleep = this.isEditable && !ctx.torporState && !ctx.death;
    ctx.soak = { bashing: a.soakPool("bashing"), lethal: a.soakPool("lethal"), aggravated: a.soakPool("aggravated") };
    ctx.xp = s.experience;
    if (ctx.isGhoul) {
      // изъян: у ревенанта — семейный (всегда), у гуля — слабость клана домитора (после пяти кормлений от клана)
      const fam = ctx.isRevenant ? revenantFamily(s.family) : null;
      const dc = fam ? null : Codex.clan(s.domitorClan) ?? Codex.clans.find(c => c.name === s.domitorClan);
      if (fam) {
        ctx.weakness = `<p>${foundry.utils.escapeHTML(fam.flaw)}</p><p><em>${t("Revenant.FamilyDisciplines")}: ${fam.disciplines.map(k => Codex.disciplineLabel(k)).join(", ")}</em></p>`;
        ctx.weaknessTitle = `${fam.name} — «${fam.nick}»`;
        ctx.weaknessLabel = t("Revenant.FamilyFlaw");
      } else if (dc?.weakness) {
        ctx.weakness = `${dc.weakness}<p><em>${t("Revenant.ClanWeaknessGhoul")}</em></p>`;
        ctx.weaknessTitle = dc.name;
      }
      ctx.weaknessOpen = this._open.has("weakness");
    }
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
    // силы, вынесенные в HUD (флаг hudPowers)
    const pins = new Set(this.actor.getFlag(SYSTEM_ID, "hudPowers") ?? []);
    const rollInfo = r => r && (r.trait1 || r.blood || r.willpower || r.dice) ? {
      label: r.dice ? `${r.dice}d10` : [r.trait1 && a.traitLabel(r.trait1), r.trait2 && a.traitLabel(r.trait2)].filter(Boolean).join(" + ") + (r.base ? ` (${t("Magic.BaseAttr")})` : ""),
      diff: r.difficulty || "", note: r.note ?? "", blood: r.blood ?? 0, willpower: !!r.willpower, canRoll: !!(r.trait1 || r.dice)
    } : null;
    const reading = new Set(readingRituals(a).map(e => e.flags[SYSTEM_ID].ritual));
    const mapRitual = r => ({
      id: r.id, name: r.name, level: r.system.level, roman: ROMAN[r.system.level - 1], html: ritualHTML(r.system), ritual: true, reading: reading.has(r.id),
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
          roll: rollInfo(x.roll), codexRef: `${k}|path|${pi}|${i}`, pinned: pins.has(`${k}|path|${pi}|${i}`)
        })),
        ownPowers: ownPowers.filter(o => o.system.discipline === k && o.system.path === p.name).sort((x, y) => x.system.level - y.system.level).map(mapOwn)
      };
    };
    const discKeys = new Set(items.map(i => i.system.key));
    const fxOn = new Set(a.powerEffects.map(x => x.power));
    const fxOf = (k, level) => {
      const key = `${k}:${level}`, def = POWER_EFFECTS[key];
      return def ? { key, on: fxOn.has(key), icon: def.icon ?? "fa-wand-sparkles",
        tip: `${t("Fx.Toggle")} · ${t(MODE_LABEL[def.mode] ?? "Fx.Toggleable")}` } : null;
    };
    ctx.activeFx = a.powerEffects.map(x => ({ id: x.effect.id, name: x.effect.name, img: x.effect.img,
      mode: t(MODE_LABEL[x.def.mode] ?? "Fx.Toggleable"), hit: !!x.def.diff?.hit }));
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
          roll: rollInfo(p.roll), codexRef: `${k}|${i}`, pinned: pins.has(`${k}|${i}`), fx: p.source ? null : fxOf(k, p.level),
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

  #prepareLores(ctx) {
    const a = this.actor, s = a.system;
    const pins = new Set(a.getFlag(SYSTEM_ID, "hudPowers") ?? []);
    const own = Codex.house(s.house)?.lores ?? [];
    const rollInfo = r => r?.trait1 ? { label: [a.traitLabel(r.trait1), r.trait2 && a.traitLabel(r.trait2)].filter(Boolean).join(" + "),
      diff: r.difficulty || "", canRoll: true } : null;
    // Призывы предметами (свои или из компендия): под своим Знанием, на месте своего круга, заменяя тот же призыв справочника
    const lorePowers = a.items.filter(i => i.type === "lorePower");
    const mapOwnLore = p => ({ id: p.id, name: p.name, level: p.system.level, roman: ROMAN[p.system.level - 1] ?? "—", html: p.system.description,
      open: this._open.has(p.id), roll: rollInfo(p.system.roll), cls: "is-own" });
    ctx.lores = a.items.filter(i => i.type === "lore").map(it => {
      const k = it.system.key, data = Codex.lore(k), v = it.system.value;
      const mine = lorePowers.filter(p => p.system.lore === k), taken = new Set(mine.map(p => `${p.system.level}|${p.name}`));
      const powers = (data?.powers ?? []).map((p, i) => [p, i]).filter(([p]) => p.level <= v && !taken.has(`${p.level}|${p.name}`)).map(([p, i]) => ({
        ...p, id: `${it.id}-p${i}`, roman: ROMAN[p.level - 1], open: this._open.has(`${it.id}-p${i}`),
        roll: rollInfo(p.roll), codexRef: `lore:${k}|${i}`, pinned: pins.has(`lore:${k}|${i}`)
      }));
      const next = data?.powers?.find(p => p.level === v + 1);
      const house = data?.house ? Codex.house(data.house) : null;
      return {
        id: it.id, key: k, name: data?.name ?? it.name, en: data?.en ?? "", value: v, own: own.includes(k), common: !data?.house && !data?.dark, dark: !!data?.dark,
        houseName: data?.dark ? t("Demon.DarkLore") : house?.name ?? t("Demon.Common"), dots: dots(v, 5, { path: "system.value", itemId: it.id }),
        powers: [...powers, ...mine.map(mapOwnLore)].sort((x, y) => x.level - y.level), nextPower: next ? { name: next.name, level: next.level } : null,
        xp: a.xpCost("lore", v, { key: k }), open: this._open.has(it.id)
      };
    }).sort((x, y) => (y.own - x.own) || (y.common - x.common) || x.name.localeCompare(y.name, "ru"));
    ctx.allOpen = ctx.lores.length > 0 && ctx.lores.every(l => l.open);
    ctx.earthbound = !!s.earthbound;
    if (s.earthbound) {
      const R = reliquaryInfo(a);
      ctx.possession = possessionView(a);
      ctx.reliquary = { ...R, kinds: ["ideal", "improvised", "natural"].map(k => ({ value: k, label: t(`Demon.ReliquaryKind.${k}`), selected: k === R.kind })),
        hint: t(`Demon.ReliquaryHint.${R.kind}`),
        urges: ["flesh", "thought", "emotion"].map(k => ({ key: k, label: t(`Demon.Urge.${k}`), tip: t(`Demon.UrgeTip.${k}`), value: s.urges?.[k] ?? 1 })) };
    }
    // Слуги по договорам (вкладка «Преимущества»)
    ctx.thralls = (s.thralls ?? []).map((x, i) => {
      const st = thrallState(x);
      return { ...x, name: st.name, index: i, rowId: `thrall-${i}`, open: this._open.has(`thrall-${i}`), linked: !!st.actor, will: st.will,
        wounds: st.actor ? st.actor.system.health?.lethal ?? 0 : x.wounds, share: Math.min(x.share, thrallCap(x.faith)), cap: thrallCap(x.faith) };
    });
    ctx.thrallFaith = ctx.thralls.reduce((n, x) => n + x.share, 0);
    const have = new Set(ctx.lores.map(l => l.key));
    ctx.missingHouse = own.some(k => !have.has(k));
    // Апокалиптическая форма (гл. 7): черты Облика; при Муке 7+ — по черте высокой Муки за каждый пункт сверх 6
    const lore = Codex.lore(s.visage), form = lore?.form;
    const highN = Math.max(0, Math.min(4, s.torment.permanent - 6));
    // Ритуалы и реликвии падших — предметы на персонаже (перетащить из компендиев «Ритуалы падших», «Реликвии падших»)
    const run = a.getFlag(SYSTEM_ID, "ritualRun");
    const dname = x => x?.key ? `${Codex.lore(x.key)?.name ?? x.key} ${"•".repeat(x.level)}` : "";
    // чип Знания: короткое имя без «Знание», точки; есть ли оно у персонажа на нужном уровне
    const myLore = Object.fromEntries(a.items.filter(i => i.type === "lore").map(i => [i.system.key, i.system.value]));
    const chip = (x, primary = false) => x?.key ? { name: (Codex.lore(x.key)?.name ?? x.key), dots: "•".repeat(x.level ?? 0),
      primary, has: (myLore[x.key] ?? 0) >= (x.level ?? 0) } : null;
    ctx.demonRituals = a.items.filter(i => i.type === "demonRitual").map(it => {
      const r = it.system, live = run?.id === it.id ? run : null;
      return { id: it.id, name: it.name, chips: [chip(r.primary, true), ...(r.secondary ?? []).map(x => chip(x))].filter(Boolean),
        need: ritualNeed(r), time: r.time, limits: r.limits, cost: r.cost, html: r.description, high: r.high, variants: r.variants,
        roll: r.roll?.trait1 ? [a.traitLabel(r.roll.trait1), r.roll.trait2 && a.traitLabel(r.roll.trait2)].filter(Boolean).join(" + ") : r.rollText,
        canEffect: !!r.roll?.trait1, run: live, total: live?.total ?? 0,
        turns: [1, 2, 3, 4, 5].map(n => ({ n, done: !!live && n <= live.turn, next: (live?.turn ?? 0) + 1 === n })),
        pct: live ? Math.min(100, Math.round(live.total / Math.max(1, ritualNeed(r)) * 100)) : 0, open: this._open.has(it.id) };
    }).sort((x, y) => x.name.localeCompare(y.name, "ru"));
    ctx.relics = a.items.filter(i => i.type === "relic").map(it => ({ id: it.id, name: it.name, kind: game.i18n.localize(`VTM20.Relic.Kind.${it.system.kind}`),
      kindKey: it.system.kind, chips: (it.system.lores ?? []).filter(Boolean).map(k => ({ name: (Codex.lore(k)?.name ?? k) })),
      use: it.system.use, html: it.system.description, mechanics: it.system.mechanics, open: this._open.has(it.id) }))
      .sort((x, y) => x.name.localeCompare(y.name, "ru"));
    // механика черт по каталогу Players Guide (data/form.mjs); у «Улучшенной способности» Способность выбирает игрок
    const feats = formFeatures(a), picks = a.getFlag(SYSTEM_ID, "formPick") ?? {};
    const featOf = (high, i) => feats.find(x => x.high === high && x.index === i);
    const mech = (high, i) => { const x = featOf(high, i); return { mech: mechLabel(x?.entry?.mech, picks[x?.name]), tip: x?.entry?.text ?? "",
      pickable: needsPick(x?.entry), picked: picks[x?.name] ? a.traitLabel(`abilities.${picks[x?.name]}`) : "" }; };
    ctx.form = form ? {
      visage: Codex.house(s.house)?.visages?.[s.visage] ?? "", lore: lore.name, on: !!s.apocalyptic, highN,
      look: { img: s.formLook?.img ?? "", sizes: [0, 1, 2, 3, 4].map(v => ({ v, label: v ? String(v) : game.i18n.localize("VTM20.Demon.FormLookSizeKeep"),
        sel: (s.formLook?.size ?? 0) === v })) },
      fx: s.apocalyptic ? s.formFx : null, fxSummary: s.apocalyptic ? formSummary(s.formFx, a) : "",
      low: form.low.map((name, i) => ({ name, index: i, ...mech(false, i) })),
      // черты высокой Муки игрок выбирает сам (гл. 7): флаг formHigh — индексы в порядке выбора; действуют первые highN,
      // при падении Муки уходит выбранная последней; свободный слот — щелчок по черте
      ...(() => {
        const picked = (a.getFlag(SYSTEM_ID, "formHigh") ?? []).filter(i => i < form.high.length), active = picked.slice(0, highN);
        const scene = a.getFlag(SYSTEM_ID, "formScene") ?? [], free = highN - active.length;
        return { free, high: form.high.map((name, i) => ({ name, index: i, ...mech(true, i), on: active.includes(i), order: active.indexOf(i) + 1,
          scene: scene.includes(i) && !active.includes(i), pick: free > 0 && !active.includes(i) })) };
      })()
    } : null;
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
    // Винкулум — у вампиров Шабаша и у всех, у кого он уже записан
    // котерии персонажа: общие факты и свой вклад (apps/coterie.mjs)
    ctx.coteries = coteriesOf(a).map(c => ({ name: c.name, pools: Object.keys(c.pools ?? {}).map(bg => ({ bg, value: poolValue(c, bg),
      primary: bg === c.primary, mine: c.pools[bg]?.[a.id] ?? 0 })) }));
    ctx.hasVinc = a.type === "vampire" && (isSabbat(a) || (a.system.vinculi ?? []).length > 0);
    if (ctx.hasVinc)
      ctx.vinculi = (a.system.vinculi ?? []).map((v, i) => ({ ...v, index: i, meaning: vinculumMeaning(v.rating),
        dots: dots(v.rating, 10, { path: `system.vinculi.${i}.rating` }) }));
    // Престация: две колонки — кто должен мне и кому должен я
    const boons = (a.system.boons ?? []).map((b, i) => ({ ...b, index: i,
      levels: BOON_LEVELS.map(k => ({ key: k, label: boonLevelLabel(k), selected: k === b.level })) }));
    ctx.boonCols = ["owed", "owe"].map(dir => ({ dir, label: `VTM20.Boon.Dir.${dir}`, list: boons.filter(b => (b.dir === "owe" ? "owe" : "owed") === dir),
      open: boons.filter(b => b.dir === dir && !b.done).length }));
  }

  /** Родословная (план 6): линия сиров вверх по полям «Сир», потомки, проверка крови, братья и сёстры по сиру. */
  #prepareLineage(ctx) {
    const a = this.actor;
    const clan = a.clanLabel;
    const embraced = a.system.details.embraced;
    const line = lineUp(a).map(x => {
      const who = x.actor;
      return {
        gen: x.gen, name: x.name, self: !!x.self, actorId: who?.id ?? "",
        kind: x.self ? "self" : who ? "sheet" : x.name ? "named" : "unknown",
        clan: who?.isVampire ? who.clanLabel : clan,
        embraced: who?.system?.details?.embraced ?? "",
        byBlood: !who
      };
    });
    // «Вписать» у неизвестного звена пишет сира тому, кто стоит под ним (у него поле «Сир» пустое);
    // клан звена без листа — «по крови» ближайшего Сородича под ним
    let below = clan, belowKey = a.system.clan;
    for (let i = line.length - 1; i >= 0; i--) {
      const x = line[i];
      if (x.kind === "unknown") x.holderId = line[i + 1]?.actorId || a.id;
      if (x.byBlood) { x.clan = below; x.clanKey = belowKey; }
      else { below = x.clan; belowKey = game.actors.get(x.actorId)?.system?.clan ?? belowKey; }
    }
    const kids = childrenOf(a).map(k => ({ id: k.id, name: k.name, gen: k.isVampire ? k.system.generation : null,
      clan: k.isVampire ? k.clanLabel : game.i18n.localize(`TYPES.Actor.${k.type}`), embraced: k.system.details?.embraced ?? "" }));
    const sire = actorByName(a.system.details.sire);
    const sibs = sire ? childrenOf(sire).filter(k => k.id !== a.id).map(k => ({ id: k.id, name: k.name, clan: k.isVampire ? k.clanLabel : "" })) : [];
    ctx.lineage = { line, kids, kidGen: (a.system.generation ?? 13) + 1, sire: a.system.details.sire, embraced,
      gen: a.system.generation, check: bloodCheck(a), sibs, count: kids.length };
  }

  /** Вкладка «Эффекты»: всё, что сейчас действует на персонажа, — силы, состояния, кровь, постоянные модификаторы, черты. */
  #prepareEffects(ctx) {
    const a = this.actor, s = a.system;
    const attrL = k => game.i18n.localize(VTM20.attributes[k]?.label ?? k);
    const signed = n => n > 0 ? `+${n}` : `${n}`;
    const numOf = v => typeof v === "number" ? v : (String(v).startsWith("-") ? -1 : 1) * (a.discipline(String(v).replace(/^-/, "")) ?? 0);

    // Включённые силы — с расшифровкой того, что они меняют
    ctx.fxPowers = a.powerEffects.map(({ effect, def }) => {
      const lines = [];
      for (const [k, v] of Object.entries(def.attr ?? {})) lines.push(`${attrL(k)} ${signed(v)}`);
      for (const [k, v] of Object.entries(def.set ?? {})) lines.push(`${attrL(k)} = ${v}`);
      for (const [k, v] of Object.entries(def.diff ?? {})) lines.push(t("FxTab.Diff", { what: t(`FxTab.DiffKind.${k}`), n: signed(numOf(v)) }));
      if (def.claws) lines.push(t("FxTab.Claws"));
      if (def.brawlDamage) lines.push(t("FxTab.BrawlDamage", { n: def.brawlDamage }));
      if (def.biteDamage) lines.push(t("FxTab.BiteDamage", { n: def.biteDamage }));
      if (def.soakDiff) lines.push(t("FxTab.SoakDiff", { n: signed(def.soakDiff) }));
      if (def.staminaVsFangs) lines.push(t("FxTab.StaminaVsFangs"));
      if (def.venom) lines.push(t("FxTab.Venom", { n: effect.flags?.[SYSTEM_ID]?.charges ?? 1 }));
      if (def.weapon) lines.push(t("FxTab.Weapon", { name: def.weapon.name }));
      return { id: effect.id, name: effect.name, img: effect.img, kind: def.mode,
        mode: t(MODE_LABEL[def.mode] ?? "Fx.Toggleable"), lines, timer: effectTimer(effect), toDawn: def.mode === "night" };
    });
    // Ритуалы, которые сейчас читаются: остаток по часам хроники
    ctx.fxRituals = readingRituals(a).map(e => ({ id: e.id, name: e.name, img: e.img, level: ROMAN[(e.flags[SYSTEM_ID].level ?? 1) - 1],
      minutes: 5 * (e.flags[SYSTEM_ID].level ?? 1), timer: effectTimer(e) }));

    // Состояния (ярость, торпор…) и прочие эффекты на актёре
    const st = a.statuses ?? new Set();
    ctx.fxStatuses = PORTRAIT_STATES.filter(x => st.has(x.id)).map(x => ({ id: x.id, icon: x.icon, hot: x.hot,
      label: t(`Status.${x.key}`), text: t(`FxTab.StatusText.${x.key}`) }));
    ctx.fxOther = a.effects.filter(e => !e.flags?.[SYSTEM_ID]?.power && !e.flags?.[SYSTEM_ID]?.ritual && !(e.statuses?.size && PORTRAIT_STATES.some(x => e.statuses.has(x.id))))
      .map(e => ({ id: e.id, name: e.name, img: e.img, disabled: e.disabled }));

    // Усиление кровью
    ctx.fxBoosts = Object.entries(s.boosts ?? {}).filter(([, v]) => v > 0).map(([k, v]) => ({ label: `${attrL(k)} +${v}` }));

    // Постоянные модификаторы: раны, броня, физические Дисциплины, прочность, кровь
    const mods = [];
    if (s.health?.penalty) mods.push({ icon: "fa-heart-crack", hot: true, label: t("FxTab.Wounds"), value: signed(s.health.penalty), text: t("FxTab.WoundsText") });
    const arm = a.armor;
    if (arm.rating || arm.penalty) mods.push({ icon: "fa-shield-halved", label: t("FxTab.Armor"), value: `${arm.rating}`, text: arm.penalty ? t("FxTab.ArmorPenalty", { n: arm.penalty }) : t("FxTab.ArmorText") });
    const pot = a.discipline?.("potence") ?? 0, cel = a.discipline?.("celerity") ?? 0, fort = a.discipline?.("fortitude") ?? 0;
    if (pot) mods.push({ icon: "fa-hand-fist", label: Codex.disciplineLabel("potence"), value: `+${pot}`,
      text: a.potenceActive ? t("FxTab.PotenceAuto", { n: pot }) : t("FxTab.Potence", { n: pot }) });
    if (cel) mods.push({ icon: "fa-forward", label: Codex.disciplineLabel("celerity"), value: `+${a.physicalDisciplineBonus("dexterity")}`,
      text: a.celerityActions ? t("FxTab.CelerityActions", { n: a.celerityActions }) : t("FxTab.Celerity", { n: cel }) });
    if (fort) mods.push({ icon: "fa-shield", label: Codex.disciplineLabel("fortitude"), value: `+${fort}`, text: t("FxTab.Fortitude", { n: fort }) });
    mods.push({ icon: "fa-shield-heart", label: t("FxTab.Soak"), value: `${a.soakPool("bashing")}/${a.soakPool("lethal")}/${a.soakPool("aggravated")}`, text: t("FxTab.SoakText") });
    if (ctx.hasBlood) mods.push({ icon: "fa-droplet", label: t("FxTab.PerTurn"), value: game.combat?.started ? `${this.document.bloodSpentThisTurn}/${s.blood.perTurn}` : `${s.blood.perTurn}`, text: t("FxTab.PerTurnText", { max: s.traitMax ?? 5 }) });
    if (ctx.bearing?.name) mods.push({ icon: "fa-scale-balanced", label: t("Sheet.Bearing"), value: ctx.bearing.mod, text: ctx.bearing.name });
    ctx.fxMods = mods;

    // Черты с механикой (data/merit-mods.mjs): что, к чему, сами или по обстоятельствам
    const have = a.items.filter(i => i.type === "merit" || i.type === "flaw");
    ctx.fxTraits = have.filter(i => MERIT_MODS[i.name]).map(i => ({ id: i.id, name: i.name, flaw: i.type === "flaw", ...describeMeritMod(i.name) }));
    ctx.fxEmpty = !ctx.fxPowers.length && !ctx.fxRituals.length && !ctx.fxStatuses.length && !ctx.fxOther.length && !ctx.fxBoosts.length;
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

  /** Ведущему в шапке листа — «Сделать статистом» (план 4): короткий лист с готовыми пулами. */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    if (game.user.isGM) controls.push({ icon: "fa-solid fa-user-shield", label: "VTM20.Extra.MakeExtra", action: "makeExtra" });
    return controls;
  }
  static #onMakeExtra() { return makeExtra(this.actor); }

  _onRender(context, options) {
    super._onRender(context, options);
    attachCombos(this.element);                         // Натура, Маска, Секта — свой список вместо <datalist>
    this.element.classList.toggle("is-mortal", this.actor.type === "mortal");
    this.element.classList.toggle("is-ghoul", this.actor.type === "ghoul");
    this.element.classList.toggle("is-torpor", !!context.torporState);
    this.element.classList.toggle("is-dead", !!context.death);
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
    // Щелчок по пустому месту строки Дисциплины раскрывает её (кнопки, точки и поля работают как прежде)
    for (const head of this.element.querySelectorAll(".r-disc-head")) {
      head.addEventListener("click", ev => {
        if (ev.target.closest("a, button, input, select, .r-dots")) return;
        head.querySelector("[data-action=toggleRow]")?.click();
      });
    }
    // «Потомки» в родословной подсвечиваются, когда над ними несут персонажа
    const drop = this.element.querySelector("[data-lin-drop]");
    if (drop) {
      drop.addEventListener("dragover", () => drop.classList.add("is-over"));
      for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, () => drop.classList.remove("is-over"));
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
    for (const key of ["secondary", "bonds", "vinculi", "boons", "timeline"]) {
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
    if (kind === "frenzy" || kind === "rotschreck") return rollVirtueCheck(a, kind);
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
  static #onClanAtlas() { return openClans(this.actor.system.clan); }

  static #onTakeDamage() { return openDamageDialog(this.actor); }
  static #onOpenCreator() { return openCreator(this.actor); }

  /** Заполнить лист вручную, без мастера. */
  static async #onSkipCreation() {
    await this.actor.setFlag(SYSTEM_ID, "created", true);
    this.render({ force: true });
  }
  static #onHunt() { return openHunt(this.actor); }
  /** Ночь простоя: факты биографии между сессиями — module/apps/downtime.mjs. */
  static #onDowntime() { return openDowntime(this.actor); }

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
  /** Ритуал читается временем (план 7): 5 минут × уровень по часам хроники, бросок — когда время выйдет. */
  static #onReadRitual(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (item) return toggleRitualReading(this.actor, item);
  }
  /** Торпор (план 9): уйти по своей воле, проснуться за 1 кровь по сроку, разбудить кровью раньше. */
  static async #onTorporEnter() {
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("Torpor.Enter") },
      content: `<p>${t("Torpor.EnterConfirm", { span: VTM20.torporDuration[this.actor.system.morality?.value] ?? "" })}</p>`, rejectClose: false });
    if (ok) return enterTorpor(this.actor, "will");
  }
  static #onTorporWake() { return wakeFromTorpor(this.actor); }
  static #onTorporWakeBlood() { return wakeFromTorpor(this.actor, { byBlood: true }); }
  static #onUndoDeath() { return undoDeath(this.actor); }
  static #onCancelRitual(event, target) {
    const e = this.actor.effects.get(target.dataset.effectId);
    if (e) return cancelRitual(this.actor, e);
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
    await this.actor.createEmbeddedDocuments("Item", [{ name, type: kind, img: kind === "weapon" ? weaponImg(name, system.kind) : armorImg(system.rating), system }]);
  }

  /** Справочник правил V20 (компендий-журнал). */
  static #onOpenRules() {
    const pack = game.packs.get(`${SYSTEM_ID}.rules`);
    if (pack) pack.render(true);
    else ui.notifications.warn(t("Sheet.RulesMissing"));
  }

  /** Прочий эффект на актёре: включить/выключить, удалить. */
  static async #onEffectToggle(event, target) {
    const e = this.actor.effects.get(target.dataset.effectId);
    if (e) await e.update({ disabled: !e.disabled });
  }
  static async #onEffectDelete(event, target) {
    await this.actor.effects.get(target.dataset.effectId)?.delete();
  }

  /** Снять состояние со значка на портрете. */
  static async #onClearStatus(event, target) {
    if (target.dataset.status) await this.actor.toggleStatusEffect(target.dataset.status, { active: false });
  }

  /** Раскрыть все Дисциплины, а если все уже раскрыты — свернуть. */
  static #onToggleAll() {
    const ids = this.actor.items.filter(i => i.type === (this.actor.type === "demon" ? "lore" : "discipline")).map(i => i.id);
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
  static #onRollPower(event, target) { return rollPowerRef(this.actor, target.dataset.ref); }

  /** Новое Знание: Знания своего Дома и общие — первыми, чужие — ниже (стоят дороже). */
  static async #onAddLore() {
    const a = this.actor, have = new Set(a.items.filter(i => i.type === "lore").map(i => i.system.key));
    const own = Codex.house(a.system.house)?.lores ?? [];
    const opt = l => `<option value="${l.key}">${foundry.utils.escapeHTML(l.name)}</option>`;
    const free = Codex.lores.filter(l => !have.has(l.key)), dark = free.filter(l => l.dark);
    const mine = free.filter(l => !l.dark && (!l.house || own.includes(l.key))), other = free.filter(l => !l.dark && !mine.includes(l));
    if (!free.length) return;
    const key = await foundry.applications.api.DialogV2.prompt({
      window: { title: t("Demon.AddLore") }, position: { width: 380 }, classes: ["vtm20", "r-dialog"],
      content: `<label class="r-f"><span>${t("Demon.Lore")}</span><select name="lore">
        ${mine.length ? `<optgroup label="${t("Demon.OwnLores")}">${mine.map(opt).join("")}</optgroup>` : ""}
        ${other.length ? `<optgroup label="${t("Demon.OtherLores")}">${other.map(opt).join("")}</optgroup>` : ""}
        ${dark.length ? `<optgroup label="${t(a.system.earthbound ? "Demon.DarkLoresOwn" : "Demon.DarkLores")}">${dark.map(opt).join("")}</optgroup>` : ""}</select></label>`,
      ok: { label: t("Demon.AddLore"), callback: (ev, btn) => btn.form.elements.lore.value }
    }).catch(() => null);
    if (key) return createLore(a, [key]);
  }

  static #onWorship() { return worshipRitual(this.actor); }
  static #onReliquaryDraw() { return reliquaryDraw(this.actor); }

  /** Способность для черты формы с выбором («Улучшенная способность», «Увеличенная способность»). */
  static async #onFormPick(event, target) {
    const a = this.actor, name = target.dataset.name, picks = foundry.utils.deepClone(a.getFlag(SYSTEM_ID, "formPick") ?? {});
    const opts = Object.keys(VTM20.abilities).map(k => [k, a.traitLabel(`abilities.${k}`)]).sort((x, y) => x[1].localeCompare(y[1], "ru"))
      .map(([k, l]) => `<option value="${k}" ${picks[name] === k ? "selected" : ""}>${foundry.utils.escapeHTML(l)}</option>`).join("");
    const key = await foundry.applications.api.DialogV2.prompt({
      window: { title: t("Demon.FormPickTitle", { name }) }, classes: ["vtm20", "r-dialog"], position: { width: 380 },
      content: `<p class="r-choice-hint">${t("Demon.FormPickHint")}</p><label class="r-f"><span>${t("Demon.FormPickAbility")}</span><select name="ability">${opts}</select></label>`,
      ok: { label: game.i18n.localize("VTM20.Common.Save"), callback: (ev, btn) => btn.form.elements.ability.value }
    }).catch(() => null);
    if (!key) return;
    picks[name] = key;
    return a.setFlag(SYSTEM_ID, "formPick", picks);
  }

  /** Слуга по договору: новый или правка (гл. 9; «Проклятые и обманутые», гл. 4–5). */
  static async #onThrallEdit(event, target) {
    const a = this.actor, list = foundry.utils.deepClone(a.system.thralls ?? []);
    const i = target.closest("[data-index]")?.dataset.index, x = i != null ? list[Number(i)] : { name: "", uuid: "", faith: 2, share: 1, will: 3, wounds: 0, lost: 0, terms: "", gifts: "" };
    const e = s => foundry.utils.escapeHTML(String(s ?? ""));
    const actors = game.actors.filter(o => o.id !== a.id && o.type !== "demon").sort((p, q) => p.name.localeCompare(q.name, "ru"));
    const opts = [`<option value="">${t("Demon.ThrallNoSheet")}</option>`, ...actors.map(o => `<option value="${o.uuid}" ${o.uuid === x.uuid ? "selected" : ""}>${e(o.name)}</option>`)].join("");
    const num = (n, v, lo, hi) => `<input type="number" name="${n}" value="${v}" min="${lo}" max="${hi}">`;
    const v = await foundry.applications.api.DialogV2.prompt({
      window: { title: t(i != null ? "Demon.ThrallEdit" : "Demon.ThrallAdd") }, classes: ["vtm20", "r-dialog"], position: { width: 480 },
      content: `<div class="r-fields">
        <label class="r-f is-span2"><span>${t("Demon.ThrallName")}</span><input type="text" name="name" value="${e(x.name)}"></label>
        <label class="r-f is-span2"><span>${t("Demon.ThrallSheet")}</span><select name="uuid">${opts}</select></label>
        <label class="r-f"><span>${t("Demon.ThrallFaith")}</span>${num("faith", x.faith, 0, 5)}</label>
        <label class="r-f"><span>${t("Demon.ThrallShare")}</span>${num("share", x.share, 0, 3)}</label>
        <label class="r-f"><span>${t("Demon.ThrallWill")}</span>${num("will", x.will, 0, 10)}</label>
        <label class="r-f"><span>${t("Demon.ThrallWounds")}</span>${num("wounds", x.wounds, 0, 7)}</label>
        <label class="r-f is-span2"><span>${t("Demon.ThrallTerms")}</span><textarea name="terms" rows="2">${e(x.terms)}</textarea></label>
        <label class="r-f is-span2"><span>${t("Demon.ThrallGifts")}</span><textarea name="gifts" rows="2">${e(x.gifts)}</textarea></label></div>
        <p class="r-choice-hint">${t("Demon.ThrallHint")}</p>`,
      ok: { label: game.i18n.localize("VTM20.Common.Save"), callback: (ev, btn) => new foundry.applications.ux.FormDataExtended(btn.form).object }
    }).catch(() => null);
    if (!v) return;
    const faith = Math.clamp(Number(v.faith) || 0, 0, 5);
    const row = { ...x, name: String(v.name ?? "").trim() || (v.uuid ? foundry.utils.fromUuidSync(v.uuid)?.name ?? "" : ""), uuid: v.uuid ?? "", faith,
      share: Math.clamp(Number(v.share) || 0, 0, thrallCap(faith)), will: Math.clamp(Number(v.will) || 0, 0, 10), wounds: Math.clamp(Number(v.wounds) || 0, 0, 7),
      terms: v.terms ?? "", gifts: v.gifts ?? "" };
    if (i != null) list[Number(i)] = row; else list.push(row);
    return a.update({ "system.thralls": list });
  }
  static async #onThrallDelete(event, target) {
    const i = Number(target.closest("[data-index]")?.dataset.index), list = foundry.utils.deepClone(this.actor.system.thralls ?? []);
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("Demon.ThrallDelete") }, content: `<p>${t("Demon.ThrallDeleteAsk", { name: foundry.utils.escapeHTML(list[i]?.name ?? "") })}</p>` }).catch(() => false);
    if (!ok) return;
    list.splice(i, 1);
    return this.actor.update({ "system.thralls": list });
  }
  static #onThrallOpen(event, target) {
    const x = this.actor.system.thralls?.[Number(target.closest("[data-index]")?.dataset.index)];
    return thrallState(x ?? {}).actor?.sheet.render({ force: true });
  }

  /** Привязанный к Земле (Earthbound): Тёмные Знания и ритуалы Привязанных без Муки, свой опыт. */
  static #onToggleEarthbound() { return this.actor.update({ "system.earthbound": !this.actor.system.earthbound }); }
  static #onHouseAtlas() { return openHouses(this.actor.system.house); }
  static #onTormentSin() { return virtuePrompt(this.actor, "sin"); }
  static #onThrallSin() { return thrallSin(this.actor); }
  static #onThrallPact() { return thrallPact(this.actor); }
  static #onGhoulify() { return ghoulify(this.actor); }
  static #onFormUpkeep() { return formUpkeep(this.actor); }
  static #onThrallGifts() { return openThrallGifts(this.actor); }
  /** Тело-носитель (apps/host.mjs): гибель тела, ход без тела, новое тело, призван из Бездны. */
  static async #onHostLose() {
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: game.i18n.localize("VTM20.Host.Btn") }, content: `<p>${game.i18n.localize("VTM20.Host.BtnHint")}</p>` });
    if (ok) return loseHost(this.actor, "death");
  }
  static #onHostHold() { return holdOn(this.actor); }
  static #onTormentLog() { return openTormentLog(this.actor); }
  /** Завладение Привязанного (apps/possession.mjs). */
  static #onPossess() { return possess(this.actor); }
  static #onCult() { return openCult(this.actor); }
  static #onPossessExtend() { return possessExtend(this.actor); }
  static async #onPossessLeave() {
    const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: game.i18n.localize("VTM20.Possess.Leave") }, content: `<p>${game.i18n.localize("VTM20.Possess.LeaveConfirm")}</p>` });
    if (ok) return possessLeave(this.actor);
  }
  static #onPossessBattle() { return battleExpiry(this.actor); }
  static #onHostNew() { return newHost(this.actor); }
  static #onHostSummoned() { return summonedBack(this.actor); }
  /** Картинка жетона в форме — выбирает игрок (своих картинок система не даёт). */
  static #onFormLookImg() {
    const fp = new foundry.applications.apps.FilePicker.implementation({ type: "image", current: this.actor.system.formLook?.img || "",
      callback: path => this.actor.update({ "system.formLook.img": path }) });
    return fp.browse();
  }
  static #onFormLookClear() { return this.actor.update({ "system.formLook.img": "" }); }
  static #onThrallBreak() { return thrallBreak(this.actor); }
  /** Открыть лист по uuid (хозяин слуги и т. п.). */
  static async #onOpenUuid(event, target) { (await fromUuid(target.dataset.uuid))?.sheet?.render(true); }
  static #onSinSuggest() { return suggestSin(this.actor); }
  static #onTormentKind() { return virtuePrompt(this.actor, "kind"); }
  static #onTormentAtone() { return atoneWithXp(this.actor); }

  static #onAddHouseLores() {
    const a = this.actor, have = new Set(a.items.filter(i => i.type === "lore").map(i => i.system.key));
    return createLore(a, (Codex.house(a.system.house)?.lores ?? []).filter(k => !have.has(k)));
  }

  /** Принять апокалиптическую форму — 1 пункт временной Веры (гл. 7); сбросить — даром. */
  static #onApocalyptic() { return assumeForm(this.actor); }
  static #onSceneHigh(event, target) { return sceneHighFeature(this.actor, Number(target.dataset.index)); }
  static #onRevelation() { return revelation(this.actor); }
  /** Выбрать черту высокой Муки в свободный слот или снять уже выбранную (снимается и всё, что выбрано после неё). */
  static async #onFormHighPick(event, target) {
    const i = Number(target.dataset.index), list = [...(this.actor.getFlag(SYSTEM_ID, "formHigh") ?? [])];
    const at = list.indexOf(i);
    return this.actor.setFlag(SYSTEM_ID, "formHigh", at >= 0 ? list.slice(0, at) : [...list, i]);
  }
  static #onFaithHeal() { return this.actor.faithHeal(); }
  static #onHarvest() { return harvestFaith(this.actor); }
  static #onInnate(event, target) { return innateRoll(this.actor, target.dataset.kind); }
  static #onRitualTurn(event, target) { const it = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId); return it && ritualTurn(this.actor, it); }
  static #onRitualEffect(event, target) { const it = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId); return it && ritualEffect(this.actor, it); }
  static #onPactFaith() { return pactFaith(this.actor); }

  static #onSpendFaith() {
    const s = this.actor.system;
    if (s.faith.temporary < 1) return ui.notifications.warn(t("Demon.NoFaith"));
    return this.actor.update({ "system.faith.temporary": s.faith.temporary - 1 });
  }

  /** Сила в HUD и обратно (до шести — флаг hudPowers персонажа). */
  static async #onPinPower(event, target) {
    const ref = target.dataset.ref, pins = [...(this.actor.getFlag(SYSTEM_ID, "hudPowers") ?? [])];
    const i = pins.indexOf(ref);
    if (i >= 0) pins.splice(i, 1);
    else if (pins.length >= 6) return ui.notifications.warn(t("Hud.PinsFull"));
    else pins.push(ref);
    await this.actor.setFlag(SYSTEM_ID, "hudPowers", pins);
  }

  /** Бросок записанной силы или ритуала (предмета). */
  static #onRollItemPower(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    if (item.type === "ritual") return rollRitual(this.actor, item);
    if (item.type === "lorePower") return rollLorePower(this.actor, item);
    const sub = item.system.path || Codex.disciplineLabel(item.system.discipline) || "";
    const magic = VTM20.pathDisciplines.includes(item.system.discipline);
    return VtMActorSheet.#rollFromSpec(this.actor, item.system.roll ?? {}, { title: item.name, subtitle: sub, effect: item.system.description,
      kind: magic ? "magic" : "check", magic: magic ? { disc: item.system.discipline, level: item.system.level, path: item.system.path } : null,
      power: { disc: item.system.discipline, level: item.system.level, path: item.system.path, name: item.name } });
  }

  /** Бросок по описанию силы: черты, сложность, цена; фиксированный пул (Тауматургическая защита); «чистая» характеристика (Колдовство). */
  static #rollFromSpec(actor, r, opts) { return rollFromSpec(actor, r, opts); }

  /** Описание силы — в чат. */
  static async #onPowerToChat(event, target) {
    const { disc, level, name, pathId } = target.dataset;
    let p;
    if (pathId) {
      const it = this.actor.items.get(pathId);
      p = Codex.bloodPath(it.system.discipline, it.name)?.powers.find(x => x.name === name);
    } else if (disc?.startsWith("lore:")) p = Codex.lore(disc.slice(5))?.powers.find(x => x.name === name);
    else p = Codex.discipline(disc)?.powers.find(x => x.name === name && (String(x.level) === level || x.anyLevel));   // anyLevel — взята на 6–9
    if (!p) return;
    const dname = pathId ? this.actor.items.get(pathId).name : disc.startsWith("lore:") ? Codex.lore(disc.slice(5))?.name : Codex.disciplineLabel(disc);
    const r = p.roll ?? {};
    const pool = r.trait1 ? [r.trait1, r.trait2].filter(Boolean).map(x => this.actor.traitLabel(x)).join(" + ") : (r.dice ? `${r.dice}d10` : "");
    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: await itemCardHTML({ kind: "power", typeClass: themeClass(this.actor),
        img: disc?.startsWith("lore:") ? `systems/${SYSTEM_ID}/assets/ui/fallen-sigil.svg` : Codex.disciplineIcon(pathId ? this.actor.items.get(pathId).system.discipline : disc),
        kicker: dname, name: p.name, en: p.en, body: p.html, facts: [
          { label: t("Item.level"), value: ROMAN[(p.anyLevel ? Number(level) : p.level) - 1] ?? p.level },
          { label: t("ItemSheet.Roll"), value: pool },
          r.difficulty && { label: t("Roll.Difficulty"), value: r.difficulty },
          r.blood && { label: t("ItemSheet.Cost"), value: `${r.blood} <i class="fa-solid fa-droplet"></i>`, hot: true },
          r.willpower && { label: t("Willpower"), value: "1", hot: true },
          p.source && { label: t("Item.source"), value: p.source }] })
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
  static #onOpenCoterie() { return openCoterie(this.actor); }
  /** Лист Пути: запись компендиума «Пути Просветления» (шапка, иерархия грехов, описание); нет — текст справочника. */
  static async #onOpenPath() {
    const p = Codex.path(this.actor.system.morality?.path);
    if (!p) return;
    const pack = game.packs.get(`${SYSTEM_ID}.enlightenment-paths`);
    const entry = pack?.index.find(e => e.name === p.name);
    if (entry) return (await pack.getDocument(entry._id))?.sheet.render(true);
    return foundry.applications.api.DialogV2.prompt({ window: { title: p.name, icon: "fa-solid fa-book-open" }, classes: ["vtm20", "r-dialog"],
      position: { width: 560 }, content: `<div class="r-path-text">${p.html ?? ""}</div>`, ok: { label: t("Common.Close") }, rejectClose: false });
  }
  static async #onFeedFrom() {
    const { feedFrom } = await import("../apps/bonds.mjs");
    return feedFrom(this.actor);
  }
  static async #onResistBond(event, target) {
    const { resistBond } = await import("../apps/bonds.mjs");
    return resistBond(this.actor, Number(target.dataset.index));
  }
  /** Винкулум (module/apps/vaulderie.mjs): строка вручную, бросок к стае при создании, Братание, конфликт верностей. */
  static async #onAddVinc() {
    const list = foundry.utils.deepClone(this.actor._source.system.vinculi ?? []);
    list.push({ name: "", rating: 1 });
    await this.actor.update({ "system.vinculi": list });
  }
  static async #onRemoveVinc(event, target) {
    const list = foundry.utils.deepClone(this.actor._source.system.vinculi ?? []);
    list.splice(Number(target.dataset.index), 1);
    await this.actor.update({ "system.vinculi": list });
  }
  static #onPackVinc() { return rollPackVinculi(this.actor); }
  static #onVaulderie() { return openVaulderie(this.actor); }
  static #onVincConflict(event, target) { return loyaltyConflict(this.actor, Number(target.dataset.index)); }
  static async #onRemoveBond(event, target) {
    const list = foundry.utils.deepClone(this.actor._source.system.bonds ?? []);
    list.splice(Number(target.dataset.index), 1);
    await this.actor.update({ "system.bonds": list });
  }
  /** Свернуть или развернуть шкалы — классом, без перерисовки, чтобы сыграла анимация. */
  static #onToggleVitals(event, target) {
    this._vitalsClosed = !this._vitalsClosed;
    try { localStorage.setItem("vtm20.vitalsClosed", this._vitalsClosed ? "1" : "0"); } catch { /* приватный режим */ }
    const wrap = this.element.querySelector(".r-vitals-wrap");
    wrap?.classList.toggle("is-closed", this._vitalsClosed);
    target.dataset.tooltip = t(this._vitalsClosed ? "Sheet.VitalsOpen" : "Sheet.VitalsClose");
  }
  /* ── Родословная (план 6) ───────────────────────────────────────────── */

  /** «Вписать»: имя сира тому, у кого его ещё нет (самое старшее звено линии). */
  static async #onLinSire(event, target) {
    const holder = game.actors.get(target.dataset.actorId) ?? this.actor;
    if (!holder.isOwner) return ui.notifications.warn(t("Lineage.NoRights"));
    const name = await foundry.applications.api.DialogV2.prompt({
      window: { title: t("Lineage.SireOf", { name: holder.name }), icon: "fa-solid fa-sitemap" },
      classes: ["vtm20", "r-dialog"],
      content: `<div class="r-form"><label class="r-field"><span>${t("Lineage.SireName")}</span><input type="text" name="sire" autofocus></label></div>`,
      ok: { label: t("Lineage.Write"), callback: (e, b) => b.form.elements.sire.value.trim() },
      rejectClose: false
    });
    if (name) await holder.update({ "system.details.sire": name });
  }

  /** «+ Лист»: завести НПС-сира по имени из поля «Сир» — того же клана, на поколение старше. */
  static async #onLinSheet(event, target) {
    if (!game.user.isGM && !game.user.can("ACTOR_CREATE")) return ui.notifications.warn(t("Lineage.NoRights"));
    const a = this.actor, gen = Number(target.dataset.gen) || Math.max(3, (a.system.generation ?? 13) - 1);
    const npc = await Actor.create({ name: target.dataset.name, type: "vampire",
      system: { clan: target.dataset.clan || a.system.clan, generation: Math.clamp(gen, 3, 15) } });
    npc?.sheet.render(true);
  }

  static #onLinOpen(event, target) { game.actors.get(target.dataset.actorId)?.sheet.render(true); }

  static async #onLinWeb() {
    const m = await import("../apps/web.mjs").catch(() => null);
    m?.openWeb?.(this.actor);
  }

  /** Перетащили персонажа на «потомки» — он становится потомком этого Сородича. */
  async _onDropActor(event, actor) {
    if (event.target?.closest?.("[data-lin-drop]") && actor && actor.id !== this.actor.id) {
      if (!actor.isOwner) return ui.notifications.warn(t("Lineage.NoRights"));
      await actor.update({ "system.details.sire": this.actor.name });
      ui.notifications.info(t("Lineage.ChildSet", { child: actor.name, sire: this.actor.name }));
      this.render();                                   // поменялся чужой лист — свой перерисовываем сами
      return true;
    }
    return super._onDropActor(event, actor);
  }

  /** Престация (module/apps/boons.mjs): новая услуга в колонку, погасить или вернуть, вычеркнуть. */
  static async #onAddBoon(event, target) { return addBoon(this.actor, target.dataset.dir); }
  static async #onToggleBoon(event, target) { return toggleBoon(this.actor, Number(target.dataset.index)); }
  static async #onRemoveBoon(event, target) { return removeBoon(this.actor, Number(target.dataset.index)); }
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

  static #onOpenXp() { return openXp(this.actor); }
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
    return this.actor.buyWithXp({ doc, path, kind, label: itemId ? doc.name : target.dataset.label });
  }
}

// Повтор той же Дисциплины, факта биографии, достоинства или недостатка у персонажа — не добавлять, а предупредить
// (библиотека, перетаскивание из компендия, «Своё» с тем же именем).
const UNIQUE_TYPES = ["discipline", "lore", "background", "merit", "flaw", "derangement", "thaumPath", "ritual", "demonRitual"];
Hooks.on("preCreateItem", (item, data, options, userId) => {
  const actor = item.parent;
  if (!(actor instanceof Actor) || !UNIQUE_TYPES.includes(item.type) || options.allowDuplicate) return;
  const same = actor.items.find(i => i.type === item.type     // новый предмет ещё не в коллекции (а его _id может совпасть при копировании)
    &&(["discipline", "lore"].includes(item.type) ? i.system.key && i.system.key === item.system.key : i.name === item.name)
    && (!["thaumPath", "ritual"].includes(item.type) || i.system.discipline === item.system.discipline));   // один путь бывает в разных школах
  if (!same) return;
  if (userId === game.user.id) ui.notifications.warn(game.i18n.format("VTM20.Sheet.DuplicateItem", { name: same.name }));
  return false;
});

/** Знания демона предметами: имя и ключ из справочника, одна точка. */
function createLore(actor, keys) {
  const data = keys.map(k => Codex.lore(k)).filter(Boolean).map(l => ({ name: l.name, type: "lore", img: `systems/${SYSTEM_ID}/assets/icons/${l.dark ? "darkLore" : "lore"}.svg`,
    system: { key: l.key, value: 1, description: `<p><em>${l.en}</em> · ${Codex.house(l.house)?.name ?? t("Demon.Common")}</p>` } }));
  return data.length ? actor.createEmbeddedDocuments("Item", data) : null;
}

/** Итог действующей формы строкой для листа. */
function formSummary(f, a) {
  if (!f) return "";
  const out = Object.entries(f.attr).map(([k, v]) => `${a.traitLabel(`attributes.${k}`)} +${v}`);
  if (f.soak) out.push(t("Demon.FormMech.Soak", { n: f.soak }));
  if (f.init) out.push(t("Demon.FormMech.Init", { n: f.init }));
  if (f.health) out.push(t("Demon.FormMech.Health", { n: f.health }));
  if (f.noWoundPenalty) out.push(t("Demon.FormMech.NoWound"));
  for (const [k, list] of Object.entries(f.diff)) out.push(t("Demon.FormMech.Diff", { t: a.traitLabel(k in a.system.attributes ? `attributes.${k}` : `abilities.${k}`), n: signed(list.reduce((s, d) => s + d.value, 0)) }));
  for (const [k, list] of Object.entries(f.dice)) out.push(t("Demon.FormMech.Dice", { t: a.traitLabel(`abilities.${k}`), n: list.reduce((s, d) => s + d.value, 0) }));
  for (const w of f.weapons) out.push(`${w.name} (${t(w.agg ? "Demon.FormMech.WeaponAgg" : "Demon.FormMech.Weapon", { n: w.dmg >= 0 ? `+${w.dmg}` : w.dmg })})`);
  return out.join(" · ");
}

/** Сила справочника по ссылке «дисциплина|номер» или «дисциплина|path|путь|номер» (лист и HUD). */
export function powerByRef(ref) {
  const [k, a, b, c] = String(ref ?? "").split("|");
  if (k.startsWith("lore:")) {
    const d = Codex.lore(k.slice(5)), p = d?.powers?.[Number(a)];
    return p ? { disc: k, d, p, pathName: "" } : null;
  }
  const d = Codex.discipline(k);
  if (!d) return null;
  if (a === "path") { const pth = d.paths?.[Number(b)]; const p = pth?.powers?.[Number(c)]; return p ? { disc: k, d, p, pathName: pth.name ?? "" } : null; }
  const p = d.powers?.[Number(a)];
  return p ? { disc: k, d, p, pathName: "" } : null;
}

/** Бросок ритуала: с листа и из карточки «время вышло» (apps/timers.mjs). */
export function rollRitual(actor, item) {
  // Ритуал (V20, гл. 4): Интеллект + Оккультизм, сл. 3 + уровень (≤ 9); 5 минут × уровень; уровень Дисциплины не ниже уровня ритуала
  const lvl = item.system.level, disc = item.system.discipline, have = actor.discipline(disc);
  if (have < lvl) return ui.notifications.warn(t("Magic.RitualTooHigh", { name: item.name, d: Codex.disciplineLabel(disc), n: have, l: lvl }));
  // своё в ритуале берём только заполненное: пустые поля схемы (сложность 0) правило не затирают
  const own = item.system.roll ?? {};
  const r = { ...own, trait1: own.trait1 || "attributes.intelligence", trait2: own.trait1 ? own.trait2 : "abilities.occult",
    difficulty: own.difficulty || Math.min(9, 3 + lvl) };
  const time = t("Magic.RitualTime", { n: 5 * lvl });
  return rollFromSpec(actor, { ...r, note: [r.note, time].filter(Boolean).join(" · ") },
    { title: item.name, subtitle: `${t("Sheet.Ritual")} · ${Codex.disciplineLabel(disc)} · ${ROMAN[lvl - 1]}`, effect: item.system.description,
      kind: "ritual", magic: { disc, level: lvl, ritual: true } });
}

/** Бросок по записи силы или ритуала: пул из книги, сложность, цена кровью или волей. */
function rollFromSpec(actor, r, { title, subtitle, effect, kind = "check", magic = null, power = null, torment = null, onRolled = null }) {
  return RollDialog.prompt(actor, {
    title, subtitle, trait1: r.trait1 ?? "", trait2: r.trait2 ?? "",
    difficulty: r.difficulty || VTM20.defaultDifficulty, bloodCost: r.blood ?? 0, willpowerCost: !!r.willpower,
    diffNote: r.note ?? "", effect, kind, baseAttr: !!r.base,
    ...(r.dice ? { pool: r.dice, lockTraits: true, breakdown: [{ label: t("Magic.FixedPool"), value: r.dice }] } : {}),
    extra: { ...(magic ? { magic } : {}), ...(power ? { power } : {}), ...(torment != null ? { torment } : {}) },
    ...(onRolled ? { onRolled } : {})
  });
}

/** Бросок силы Знания-предмета: как призыв из справочника — кость Муки, Тёмное Знание падшему стоит Муки. */
function rollLorePower(actor, item) {
  if (actor.system.hostless) return ui.notifications.warn(game.i18n.localize("VTM20.Host.NoLore"));
  const d = Codex.lore(item.system.lore), lv = item.system.level;
  return rollFromSpec(actor, item.system.roll ?? {}, { title: item.name, subtitle: `${d?.name ?? ""} · ${ROMAN[lv - 1] ?? lv}`, effect: item.system.description,
    torment: d?.dark ? 10 : actor.system.torment?.permanent ?? 0, power: { disc: `lore:${item.system.lore}`, level: lv, name: item.name },
    onRolled: d?.dark && actor.type === "demon" && !actor.system.earthbound ? () => gainTorment(actor, 1, t("Demon.DarkReason")) : null });
}

/** Бросок силы справочника по ссылке (лист и HUD). */
export function rollPowerRef(actor, ref) {
  const x = powerByRef(ref);
  if (!x) return;
  const { disc, d, p, pathName } = x, magic = VTM20.pathDisciplines.includes(disc);
  // Тёмные Знания (Earthbound): эффекта низкой Муки нет; падший платит 1 временной Мукой за каждое применение
  if (disc.startsWith("lore:") && actor.system.hostless) return ui.notifications.warn(game.i18n.localize("VTM20.Host.NoLore"));
  if (disc.startsWith("lore:")) return rollFromSpec(actor, p.roll ?? {}, { title: p.name, subtitle: `${d.name} · ${ROMAN[p.level - 1]}`, effect: p.html,
    torment: d.dark ? 10 : actor.system.torment?.permanent ?? 0, power: { disc, level: p.level, name: p.name },
    onRolled: d.dark && actor.type === "demon" && !actor.system.earthbound ? () => gainTorment(actor, 1, t("Demon.DarkReason")) : null });
  return rollFromSpec(actor, p.roll ?? {}, { title: p.name, subtitle: `${pathName || d.name} · ${ROMAN[p.level - 1] ?? p.level}`, effect: p.html,
    kind: magic ? "magic" : "check", magic: magic ? { disc, level: p.level, path: pathName } : null,
    power: { disc, level: p.level, path: pathName, name: p.name } });
}
