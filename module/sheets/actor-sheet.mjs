// module/sheets/actor-sheet.mjs
// Лист персонажа V20 на ApplicationV2. Точки и шкалы — действия (data-action),
// текстовые поля — обычная форма с submitOnChange.
//
// Раскладка: шапка-«патент» с медальоном, вкладки слева от «реестра»
// (правая колонка: мораль, воля, кровь, здоровье, быстрые действия).

import { allowAnyway } from "../apps/rule-gate.mjs";
import { sheetStrategy, openStrategy } from "../ui/strategy.mjs";
import { VTM20, SYSTEM_PATH, SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { attachCombos } from "../ui/combo.mjs";
import { choosePower } from "../apps/power-choice.mjs";
import { RollDialog } from "../dice/dialog.mjs";
import { rollVirtueCheck } from "../dice/virtue-checks.mjs";
import { openDamageDialog } from "../apps/damage.mjs";
import { WEAPON_PRESETS, ARMOR_PRESETS, GEAR_PRESETS } from "../data/equipment.mjs";
import { openCreator } from "../apps/creator.mjs";
import { openSept } from "../apps/sept.mjs";
import { openUmbra } from "../apps/umbra.mjs";
import { openHunt } from "../apps/night.mjs";
import { openDowntime } from "../apps/downtime.mjs";
import { openXp } from "../apps/xp.mjs";
import { targetPowerOf, rollTargetPower, subsumeBlocks } from "../apps/target-powers.mjs";
import { openAttack } from "../combat/combat.mjs";
import { openHazard } from "../apps/hazard.mjs";
import { openDiablerie } from "../apps/diablerie.mjs";
import { openClans } from "../apps/clans.mjs";
import { addBoon, toggleBoon, removeBoon, openBoons } from "../apps/boons.mjs";
import { clockBarData } from "../apps/calendar.mjs";
import { openLibrary, LibraryItems } from "../apps/library.mjs";
import { openMoney } from "../data/money.mjs";
import { toggleRitualReading, cancelRitual } from "../apps/timers.mjs";
import { enterTorpor, wakeFromTorpor, undoDeath } from "../apps/torpor.mjs";
import { makeExtra } from "../apps/extras.mjs";
import { refreshActor } from "../apps/codex-refresh.mjs";
import { openThrallGifts } from "../apps/thrall-gifts.mjs";
import { loseHost, holdOn, newHost, summonedBack } from "../apps/host.mjs";
import { openCult } from "../apps/cult.mjs";
import { openExorcist } from "../apps/exorcist.mjs";
import { diablerieMark } from "../apps/diablerie.mjs";
import { craftFetish, werewolfInfo, werewolfSigil, giftsView, editStanding, changeForm, rollGift, rollRite, frenzyCheck, stepSideways, scarView, addScar, removeScar, deformityView, addDeformity, removeDeformity, renownAward, kinfolkInfo, kinAddGift, kinRemoveGift, kinUseGift, kinAddNumen, kinRemoveNumen, kinNumenDots, kinUseNumen, kamiInfo, kamiAdd, kamiRemove, kamiUse, fetchInfo, bindFetch, burnFetch, primalUses, fomorInfo, fomorBreed, fomorAdd, fomorRemove, fomorUse, spiritTplGroups, applySpiritTpl, spiritInfo, addCharm, removeCharm, spiritEssenceReset, fetishView, addFetish, removeFetish, attuneFetish, reconcileFetish, useFetish, delirium, stayUp, regainRage, regainGnosis, haranoCheck, haranoProne, W as werewolfDataSheet, regenerate, rageActions, spend as wwSpend, addGift, removeGift, addRite, removeRite } from "../apps/werewolf.mjs";
import { hunterInfo, edgesView, useEdge, secondSight, virtueTest, tradeConviction, restoreConviction, awardDeed, shiftDeed, cashDeed, sacrifice, advanceVirtue, callEdge, swapCalled, unblockCall, callView, isLost, lostVirtue, lostTrade, lostHardened, lostOrdeal } from "../apps/hunter.mjs";
import { addBloodright, removeBloodright, rollBloodright, toggleRitual as toggleDririRitual, rollRitual as rollDririRitual } from "../apps/dhampir.mjs";
import { openEbServant, empower as empowerServant } from "../apps/eb-servant.mjs";
import { useInvestment, pactDialog, pactDelete } from "../apps/infernal.mjs";
import { possess, extend as possessExtend, leave as possessLeave, battleExpiry } from "../apps/possession.mjs";
import { weaponIcon as weaponImg, armorIcon as armorImg } from "../data/icons.mjs";
import { togglePowerEffect } from "../apps/power-effects.mjs";
import { usePower } from "../apps/use-power.mjs";
import { POWER_EFFECTS, fxKey } from "../data/effects.mjs";
import { rollPackVinculi, openVaulderie, loyaltyConflict } from "../apps/vaulderie.mjs";
import { openCoterie } from "../apps/coterie.mjs";
import { itemCardHTML } from "../chat/item-card.mjs";
import { themeClass } from "../ui/themes.mjs";
import { openHouses } from "../apps/houses.mjs";
import { signed } from "../data/form.mjs";
import { ghoulify } from "../apps/embrace-ghoul.mjs";
import { embrace } from "../apps/embrace.mjs";
import { openTormentLog, virtuePrompt, thrallSin, thrallPact, thrallBreak, formUpkeep, atoneWithXp, assumeForm, sceneHighFeature, harvestFaith, pactFaith, innateRoll, ritualTurn, ritualEffect, suggestSin, revelation, gainTorment, thrallState, thrallCap, worshipRitual, reliquaryDraw } from "../apps/torment.mjs";
import { TextEditor, t, ROMAN, dots, prepareHeader, prepareTraits, prepareRegistry, prepareDisciplines, prepareLores, prepareAdvantages, prepareLineage, prepareEffects, prepareGear } from "./actor-context.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

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
      refreshCodex: VtMActorSheet.#onRefreshCodex,
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
      tormentSin: VtMActorSheet.#onTormentSin, thrallSin: VtMActorSheet.#onThrallSin, thrallPact: VtMActorSheet.#onThrallPact, ghoulify: VtMActorSheet.#onGhoulify, embrace: VtMActorSheet.#onEmbrace, formUpkeep: VtMActorSheet.#onFormUpkeep, thrallGifts: VtMActorSheet.#onThrallGifts,
      tormentLog: VtMActorSheet.#onTormentLog, hostLose: VtMActorSheet.#onHostLose,
      investmentUse: VtMActorSheet.#onInvestmentUse, pactAdd: VtMActorSheet.#onPactAdd, pactEdit: VtMActorSheet.#onPactEdit, pactDel: VtMActorSheet.#onPactDel,
      ebServant: VtMActorSheet.#onEbServant, exorcist: VtMActorSheet.#onExorcist, cult: VtMActorSheet.#onCult, possess: VtMActorSheet.#onPossess, possessExtend: VtMActorSheet.#onPossessExtend, possessLeave: VtMActorSheet.#onPossessLeave, possessBattle: VtMActorSheet.#onPossessBattle, hostHold: VtMActorSheet.#onHostHold, hostNew: VtMActorSheet.#onHostNew, hostSummoned: VtMActorSheet.#onHostSummoned, formLookImg: VtMActorSheet.#onFormLookImg, formLookClear: VtMActorSheet.#onFormLookClear, thrallBreak: VtMActorSheet.#onThrallBreak, openUuid: VtMActorSheet.#onOpenUuid,
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
      openPath: VtMActorSheet.#onOpenPath, pathShift: VtMActorSheet.#onPathShift,
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
      openCreator: VtMActorSheet.#onOpenCreator,
      skipCreation: VtMActorSheet.#onSkipCreation,
      hunt: VtMActorSheet.#onHunt,
      downtime: VtMActorSheet.#onDowntime,
      attack: VtMActorSheet.#onAttack,
      hazard: VtMActorSheet.#onHazard,
      diablerie: VtMActorSheet.#onDiablerie,
      clanAtlas: VtMActorSheet.#onClanAtlas,
      linSire: VtMActorSheet.#onLinSire,
      edgeUse: VtMActorSheet.#onEdgeUse, edgeDel: VtMActorSheet.#onEdgeDel, hunterSight: VtMActorSheet.#onHunterSight,
      wwForm: VtMActorSheet.#onWwForm, wwGift: VtMActorSheet.#onWwGift, wwGiftAdd: VtMActorSheet.#onWwGiftAdd, wwGiftDel: VtMActorSheet.#onWwGiftDel,
      wwRite: VtMActorSheet.#onWwRite, wwRiteAdd: VtMActorSheet.#onWwRiteAdd, wwRiteDel: VtMActorSheet.#onWwRiteDel,
      wwStanding: VtMActorSheet.#onWwStanding, wwFrenzy: VtMActorSheet.#onWwFrenzy, wwStep: VtMActorSheet.#onWwStep, wwSpend: VtMActorSheet.#onWwSpend,
      wwRegen: VtMActorSheet.#onWwRegen, wwActions: VtMActorSheet.#onWwActions, wwDelirium: VtMActorSheet.#onWwDelirium, wwRenown: VtMActorSheet.#onWwRenown, wwSept: VtMActorSheet.#onWwSept, wwUmbra: VtMActorSheet.#onWwUmbra, wwScarAdd: VtMActorSheet.#onWwScarAdd, wwScarDel: VtMActorSheet.#onWwScarDel, wwDeformAdd: VtMActorSheet.#onWwDeformAdd, wwDeformDel: VtMActorSheet.#onWwDeformDel,
      kinAdd: VtMActorSheet.#onKinAdd, kinBuy: VtMActorSheet.#onKinBuy, kinDel: VtMActorSheet.#onKinDel, kinUse: VtMActorSheet.#onKinUse,
      kinNumAdd: VtMActorSheet.#onKinNumAdd, kinNumDel: VtMActorSheet.#onKinNumDel, kinNumDots: VtMActorSheet.#onKinNumDots, kinNumUse: VtMActorSheet.#onKinNumUse,
      kamiAdd: VtMActorSheet.#onKamiAdd, kamiBuy: VtMActorSheet.#onKamiBuy, kamiMore: VtMActorSheet.#onKamiMore, kamiDel: VtMActorSheet.#onKamiDel, kamiUse: VtMActorSheet.#onKamiUse,
      kinFetchBind: VtMActorSheet.#onKinFetchBind, kinFetchBurn: VtMActorSheet.#onKinFetchBurn, spTpl: VtMActorSheet.#onSpTpl, wwPrimal: VtMActorSheet.#onWwPrimal,
      fomorAdd: VtMActorSheet.#onFomorAdd, fomorMore: VtMActorSheet.#onFomorMore, fomorDel: VtMActorSheet.#onFomorDel, fomorUse: VtMActorSheet.#onFomorUse, fomorBreed: VtMActorSheet.#onFomorBreed,
      spCharmAdd: VtMActorSheet.#onSpCharmAdd, spCharmDel: VtMActorSheet.#onSpCharmDel, spEssence: VtMActorSheet.#onSpEssence, spStep: VtMActorSheet.#onSpStep,
      wwFetishAdd: VtMActorSheet.#onWwFetishAdd, wwFetishCraft: VtMActorSheet.#onWwFetishCraft, wwFetishAttune: VtMActorSheet.#onWwFetishAttune, wwFetishReconcile: VtMActorSheet.#onWwFetishReconcile,
      wwStayUp: VtMActorSheet.#onWwStayUp, wwRageRegain: VtMActorSheet.#onWwRageRegain, wwGnosisRegain: VtMActorSheet.#onWwGnosisRegain, wwHarano: VtMActorSheet.#onWwHarano, wwFetishUse: VtMActorSheet.#onWwFetishUse, wwFetishDel: VtMActorSheet.#onWwFetishDel, openStrategy: () => openStrategy(),
      drinkVitae: VtMActorSheet.#onDrinkVitae, setVitae: VtMActorSheet.#onSetVitae, bloodrightAdd: VtMActorSheet.#onBloodrightAdd, bloodrightRemove: VtMActorSheet.#onBloodrightRemove,
      bloodrightRoll: VtMActorSheet.#onBloodrightRoll, dririToggle: VtMActorSheet.#onDririToggle, dririRoll: VtMActorSheet.#onDririRoll,
      hunterTest: VtMActorSheet.#onHunterTest, hunterTrade: VtMActorSheet.#onHunterTrade, hunterRestore: VtMActorSheet.#onHunterRestore,
      hunterDeed: VtMActorSheet.#onHunterDeed, hunterShift: VtMActorSheet.#onHunterShift, hunterCash: VtMActorSheet.#onHunterCash,
      hunterSacrifice: VtMActorSheet.#onHunterSacrifice, hunterAdvance: VtMActorSheet.#onHunterAdvance,
      edgeCall: VtMActorSheet.#onEdgeCall, edgeSwap: VtMActorSheet.#onEdgeSwap, hunterUnblock: VtMActorSheet.#onHunterUnblock,
      lostVirtue: VtMActorSheet.#onLostVirtue, lostTrade: VtMActorSheet.#onLostTrade, lostHardened: VtMActorSheet.#onLostHardened, lostOrdeal: VtMActorSheet.#onLostOrdeal,
      linChild: VtMActorSheet.#onLinChild, linEdit: VtMActorSheet.#onLinEdit, linDel: VtMActorSheet.#onLinDel,
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
  /** Заголовок окна: у дампира и ревенанта — свой тип вместо «Гуль». */
  get title() {
    const g = this.actor.type === "ghoul" ? this.actor.system.ghoulType : "";
    return ["revenant", "dhampir"].includes(g) ? `${t(`GhoulType.${g}`)}: ${this.actor.name}` : super.title;
  }

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
    if (this.actor.type === "mortal" || isLost(this.actor)) delete parts.disciplines;    // у Свидетеля Граней нет
    // у охотника на месте Дисциплин — Грани
    if (this.actor.type === "hunter" && parts.disciplines) parts.disciplines = { ...parts.disciplines, template: `${SYSTEM_PATH}/templates/actor/edges.hbs` };
    // у оборотня — формы, Дары и ритуалы
    if (this.actor.type === "werewolf" && parts.disciplines) parts.disciplines = { ...parts.disciplines, template: `${SYSTEM_PATH}/templates/actor/gifts.hbs` };
    // у демона на месте Дисциплин — Знания и апокалиптическая форма
    if (this.actor.type === "demon" && parts.disciplines) parts.disciplines = { ...parts.disciplines, template: `${SYSTEM_PATH}/templates/actor/lores.hbs` };
    return parts;
  }

  _prepareTabs(group) {
    const tabs = super._prepareTabs(group);
    if (this.actor.type === "mortal" || isLost(this.actor)) delete tabs.disciplines;
    if (this.actor.type === "hunter" && tabs.disciplines) Object.assign(tabs.disciplines, { label: "VTM20.Hunter.Edges", icon: "fa-solid fa-eye" });
    if (this.actor.type === "werewolf" && tabs.disciplines) Object.assign(tabs.disciplines, { label: "VTM20.Werewolf.Gifts", icon: "fa-solid fa-paw" });
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
      // охотник — смертный с Гранями: где лист смертного и охотника совпадают, работает isMortal
      diablerie: actor.type === "vampire" ? diablerieMark(actor) : null,
      isVampire: actor.type === "vampire", isGhoul: actor.type === "ghoul", isDhampir: actor.isDhampir, isMortal: ["mortal", "hunter"].includes(actor.type), isHunter: actor.type === "hunter", isWerewolf: actor.type === "werewolf", stratInfo: sheetStrategy(actor),
      isCreature: actor.type === "creature", isDemon: actor.type === "demon",
      hasBlood: actor.hasBlood,
      typeLabel: actor.type === "ghoul" && ["revenant", "dhampir"].includes(actor.system.ghoulType) ? t(`GhoulType.${actor.system.ghoulType}`) : game.i18n.localize(`TYPES.Actor.${actor.type}`),
      needsCreation: this.needsCreation,
      tabs: this._prepareTabs("primary")
    });
    prepareHeader(this, ctx);
    prepareTraits(this, ctx);
    prepareRegistry(this, ctx);
    if (actor.type === "demon") prepareLores(this, ctx);
    else if (actor.type === "hunter") { ctx.hunterInfo = hunterInfo(actor, dots); ctx.edgePaths = edgesView(actor); ctx.hunterCall = callView(actor); }
    else if (actor.type === "werewolf") { ctx.werewolfInfo = werewolfInfo(actor, dots); ctx.ww = giftsView(actor);
      const sg = werewolfSigil(actor);
      ctx.sigil = { ...ctx.sigil, sym: sg.sym, label: sg.label };
      ctx.werewolfSeal = sg.seal;
      // ниже Обездвиженного — «Остаться в строю» за Ярость; с недостатком «Склонность к Харано» — проверка Харано
      const hp = actor.system.health;
      ctx.wwDown = hp.bashing + hp.lethal + hp.aggravated >= 7 && this.isEditable;
      ctx.haranoProne = haranoProne(actor) && this.isEditable;
      ctx.ww.fetishes = fetishView(this.actor);
      ctx.ww.scars = scarView(this.actor);
      ctx.ww.scarAvail = (werewolfDataSheet().scars ?? []).map(x => ({ key: x.key, label: `${x.name} (+${x.glory})` }));
      // уродства — у метиса (и у того, кому их уже записали)
      ctx.ww.deformities = deformityView(this.actor);
      ctx.ww.showDeform = actor.system.werewolf.breed === "metis" || ctx.ww.deformities.length > 0;
      ctx.ww.needDeform = actor.system.werewolf.breed === "metis" && !ctx.ww.deformities.length;
      ctx.ww.deformAvail = (werewolfDataSheet().deformities ?? []).filter(d => !actor.system.werewolf.deformities.includes(d.key)).map(d => ({ key: d.key, label: VTM20.label(d) }));
      ctx.ww.fetishAvail = (werewolfDataSheet().fetishes ?? []).map(f => ({ key: f.key, talen: f.kind === "talen",
        label: `${VTM20.label(f)} (${f.kind === "talen" ? "" : `ур. ${f.level}, `}${game.i18n.localize("VTM20.Werewolf.Gnosis")} ${f.gnosis})` })); }
    else if (actor.type !== "mortal") prepareDisciplines(this, ctx);
    prepareAdvantages(this, ctx);
    if (actor.type === "mortal") { ctx.kinInfo = kinfolkInfo(actor); ctx.kamiInfo = kamiInfo(actor); ctx.fomorInfo = fomorInfo(actor); if (actor.system.kinfolk?.on) ctx.kinInfo.fetch = fetchInfo(actor); }
    if (actor.type === "creature" && actor.system.spirit?.on) { ctx.spiritInfo = spiritInfo(actor, dots); ctx.spiritInfo.tpls = spiritTplGroups(); }
    prepareGear(this, ctx);
    prepareEffects(this, ctx);
    if (actor.type === "vampire") prepareLineage(this, ctx);
    ctx.biographyHTML = await TextEditor().enrichHTML(sys.biography ?? "", { relativeTo: actor, secrets: actor.isOwner });
    ctx.notesHTML = await TextEditor().enrichHTML(sys.notes ?? "", { relativeTo: actor, secrets: actor.isOwner });
    return ctx;
  }

  async _preparePartContext(partId, ctx) {
    ctx.tab = ctx.tabs?.[partId];
    return ctx;
  }

  /* ── Рендер ─────────────────────────────────────────────────────────── */

  /** Ведущему в шапке листа — «Сделать статистом» (план 4): короткий лист с готовыми пулами. */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    if (game.user.isGM) controls.push({ icon: "fa-solid fa-user-shield", label: "VTM20.Extra.MakeExtra", action: "makeExtra" });
    // тексты сил, ритуалов и черт на листе — заново из справочника (apps/codex-refresh.mjs)
    if (this.actor.isOwner) controls.push({ icon: "fa-solid fa-book-open-reader", label: "VTM20.Refresh.Button", action: "refreshCodex" });
    return controls;
  }
  static #onMakeExtra() { return makeExtra(this.actor); }
  static #onRefreshCodex() { return refreshActor(this.actor); }

  _onRender(context, options) {
    super._onRender(context, options);
    attachCombos(this.element);                         // Натура, Маска, Секта — свой список вместо <datalist>
    // имя не влезает рядом с амплуа — шрифт на ступень меньше, ещё не влезает — ещё на одну (по ширине, а не по числу букв)
    const nameEl = this.element.querySelector("input.r-name");
    if (nameEl) for (const cls of ["is-long", "is-xlong"]) { if (nameEl.scrollWidth <= nameEl.clientWidth + 1) break; nameEl.classList.remove("is-long"); nameEl.classList.add(cls); }
    // строки-списки (Дары, ритуалы, фетиши, шрамы, Грани, Кровные права): текст свёрнут, щелчок по имени раскрывает;
    // раскрытые переживают перерисовку, как Дисциплины (ключ — имя в списке)
    for (const row of this.element.querySelectorAll(".r-edge")) {
      const name = row.querySelector(":scope > .r-edge-main > b"), text = row.querySelector(".r-edge-text");
      if (!name || !text?.textContent.trim()) continue;
      const key = `edge:${row.parentElement?.className ?? ""}:${name.textContent.trim()}`;
      row.classList.add("has-text");
      row.classList.toggle("is-open", this._open.has(key));
      if (name.dataset.rEdge) continue;
      name.dataset.rEdge = "1";
      name.addEventListener("click", () => {
        if (this._open.has(key)) this._open.delete(key); else this._open.add(key);
        row.classList.toggle("is-open", this._open.has(key));
      });
    }
    this.element.classList.toggle("is-mortal", this.actor.type === "mortal");
    this.element.classList.toggle("is-ghoul", this.actor.type === "ghoul");
    this.element.classList.toggle("is-dhampir", !!this.actor.isDhampir);     // styles/types/dhampir.css
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
    requestAnimationFrame(() => this.#markTruncated());
  }

  /** Название, обрезанное многоточием, — целиком в подсказке (видимая вкладка; на скрытых ширины нет). */
  #markTruncated() {
    for (const el of this.element?.querySelectorAll(".r-trait-label:not([data-tooltip])") ?? [])
      if (el.clientWidth && el.scrollWidth > el.clientWidth + 1) el.dataset.tooltip = el.textContent.trim();
  }

  changeTab(tab, group, options) {
    super.changeTab(tab, group, options);
    requestAnimationFrame(() => this.#markTruncated());
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
    if (kind === "frenzy" || kind === "rotschreck" || kind === "rapture") return rollVirtueCheck(a, kind);
    // деградация — с выбором греха по иерархии Пути и итогом (−1 Путь; провал — и −1 Совесть/Убеждённость)
    if (kind === "degeneration") return rollVirtueCheck(a, "degeneration", { difficulty: 8 });
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
    const p = (kind === "weapon" ? WEAPON_PRESETS : kind === "gear" ? GEAR_PRESETS : ARMOR_PRESETS)[i];
    if (!p) return;
    if (kind === "gear") {
      const { name, group, source, description = "", quantity = 1 } = p;
      return this.actor.createEmbeddedDocuments("Item", [{ name, type: "gear", system: { quantity, description, source: source ?? "" } }]);
    }
    const { name, group, ...system } = p;
    await this.actor.createEmbeddedDocuments("Item", [{ name, type: kind, img: kind === "weapon" ? weaponImg(name, system.kind) : armorImg(system.rating), system }]);
  }

  /** Справочник правил V20 (компендий-журнал). */
  static #onOpenRules(event, target) {
    const name = target?.dataset?.rules === "dhampir" ? "dhampir-rules" : this.actor.type === "hunter" ? "hunter-rules" : this.actor.type === "werewolf" ? "werewolf-rules" : "rules";
    const pack = game.packs.get(`${SYSTEM_ID}.${name}`);
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
  static #onEmbrace() { return embrace(this.actor); }
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
  /** Слуга Привязанного: нет наделений — сразу ритуал, есть — окно сил (apps/eb-servant.mjs). */
  /** Охотник (apps/hunter.mjs): Грань — бросок с риском Убеждённостью; второе зрение; испытание Добродетели; 10 Убеждённости — в Добродетель. */
  static #onEdgeUse(event, target) { return useEdge(this.actor, target.dataset.key); }
  static async #onEdgeDel(event, target) {
    const k = target.dataset.key, list = this.actor.system.hunter?.edges ?? [];
    await this.actor.update({ "system.hunter.edges": list.filter(x => x !== k) });
  }
  static #onHunterSight() { return secondSight(this.actor); }

  /** Дампир (apps/dhampir.mjs): Кровные права — добавить из списка, убрать, бросок силы; ритуалы Дриримантии. */
  static #onBloodrightAdd(event, target) {
    const key = target.closest(".r-toolbar")?.querySelector(".r-dh-add")?.value;
    return key ? addBloodright(this.actor, key) : null;
  }
  static #onDrinkVitae() { return this.actor.drinkVitae(1); }

  /** Оборотень (apps/werewolf.mjs): смена формы, Дары и ритуалы, бешенство, шаг в Умбру, траты Ярости и Гнозиса. */
  static #onWwForm(event, target) { return changeForm(this.actor, target.dataset.form); }
  static #onWwGift(event, target) { return rollGift(this.actor, target.dataset.key); }
  static #onWwGiftAdd(event, target) { return addGift(this.actor, target.closest(".r-toolbar")?.querySelector(".r-ww-gift-add")?.value); }
  static #onWwGiftDel(event, target) { return removeGift(this.actor, target.dataset.key); }
  static #onWwRite(event, target) { return rollRite(this.actor, target.dataset.key); }
  static #onWwRiteAdd(event, target) { return addRite(this.actor, target.closest(".r-toolbar")?.querySelector(".r-ww-rite-add")?.value); }
  static #onWwRiteDel(event, target) { return removeRite(this.actor, target.dataset.key); }
  static #onWwStanding() { return editStanding(this.actor); }
  static #onWwFrenzy() { return frenzyCheck(this.actor); }
  static #onWwStep() { return stepSideways(this.actor); }
  static #onWwRegen() { return regenerate(this.actor); }
  static #onWwActions() { return rageActions(this.actor); }
  static #onWwDelirium() { return delirium(this.actor); }
  static #onWwRenown() { return renownAward(this.actor); }
  static #onWwSept() { return openSept(this.actor); }
  static #onWwUmbra() { return openUmbra(this.actor); }
  static #onWwScarAdd() { const k = this.element.querySelector(".r-ww-scar-add")?.value; if (k) return addScar(this.actor, k); }
  static #onWwScarDel(event, target) { return removeScar(this.actor, Number(target.dataset.i)); }
  static #onWwDeformAdd() { const k = this.element.querySelector(".r-ww-deform-add")?.value; if (k) return addDeformity(this.actor, k); }
  static #onWwDeformDel(event, target) { return removeDeformity(this.actor, target.dataset.key); }
  static #onKinAdd() { return kinAddGift(this.actor, this.element.querySelector(".r-kin-add")?.value, false); }
  static #onKinBuy() { return kinAddGift(this.actor, this.element.querySelector(".r-kin-add")?.value, true); }
  static #onKinDel(event, target) { return kinRemoveGift(this.actor, target.dataset.key); }
  static #onKinUse(event, target) { return kinUseGift(this.actor, target.dataset.key); }
  static #onKinNumAdd() { const k = this.element.querySelector(".r-kin-num-add")?.value; if (k) return kinAddNumen(this.actor, k); }
  static #onKinNumDel(event, target) { return kinRemoveNumen(this.actor, target.dataset.key); }
  static #onKinNumDots(event, target) { return kinNumenDots(this.actor, target.dataset.key, Number(target.dataset.n)); }
  static #onKinNumUse(event, target) { return kinUseNumen(this.actor, target.dataset.key); }
  static #onKamiAdd() { return kamiAdd(this.actor, this.element.querySelector(".r-kami-add")?.value, false); }
  static #onKamiBuy() { return kamiAdd(this.actor, this.element.querySelector(".r-kami-add")?.value, true); }
  static #onKamiMore(event, target) { return kamiAdd(this.actor, target.dataset.key, false); }
  static #onKamiDel(event, target) { return kamiRemove(this.actor, target.dataset.key); }
  static #onKamiUse(event, target) { return kamiUse(this.actor, target.dataset.key); }
  static #onKinFetchBind() { const k = this.element.querySelector(".r-kin-fetch-tpl")?.value; if (k) return bindFetch(this.actor, k); }
  static #onKinFetchBurn() { return burnFetch(this.actor); }
  static #onWwPrimal() { return primalUses(this.actor); }
  static #onFomorAdd() { const k = this.element.querySelector(".r-fomor-add")?.value; if (k) return fomorAdd(this.actor, k); }
  static #onFomorMore(event, target) { return fomorAdd(this.actor, target.dataset.key); }
  static #onFomorDel(event, target) { return fomorRemove(this.actor, target.dataset.key); }
  static #onFomorUse(event, target) { return fomorUse(this.actor, target.dataset.key); }
  static #onFomorBreed() { const k = this.element.querySelector(".r-fomor-breed")?.value; return fomorBreed(this.actor, k ?? ""); }
  static #onSpTpl() { const k = this.element.querySelector(".r-sp-tpl")?.value; if (k) return applySpiritTpl(this.actor, k); }
  static #onSpCharmAdd() { return addCharm(this.actor, this.element.querySelector(".r-sp-charm-add")?.value); }
  static #onSpCharmDel(event, target) { return removeCharm(this.actor, target.dataset.key); }
  static #onSpEssence() { return spiritEssenceReset(this.actor); }
  static #onSpStep() { return stepSideways(this.actor, "spirit.gnosis"); }
  static #onWwFetishAdd() { const k = this.element.querySelector(".r-ww-fetish-add")?.value; if (k) return addFetish(this.actor, k); }
  static #onWwFetishCraft() { return craftFetish(this.actor, this.element.querySelector(".r-ww-fetish-add")?.value); }
  static #onWwFetishAttune(event, target) { return attuneFetish(this.actor, Number(target.dataset.i)); }
  static #onWwFetishReconcile(event, target) { return reconcileFetish(this.actor, Number(target.dataset.i)); }
  static #onWwStayUp() { return stayUp(this.actor); }
  static #onWwRageRegain() { return regainRage(this.actor); }
  static #onWwGnosisRegain() { return regainGnosis(this.actor); }
  static #onWwHarano() { return haranoCheck(this.actor); }
  static #onWwFetishUse(event, target) { return useFetish(this.actor, Number(target.dataset.i)); }
  static #onWwFetishDel(event, target) { return removeFetish(this.actor, Number(target.dataset.i)); }
  static #onWwSpend(event, target) { return wwSpend(this.actor, target.dataset.what, 1); }
  static #onSetVitae(event, target) {
    const v = Math.max(0, (this.actor.system.dhampir?.vitae ?? 0) + Number(target.dataset.n));
    return this.actor.update({ "system.dhampir.vitae": v });
  }
  static #onBloodrightRemove(event, target) { return removeBloodright(this.actor, target.dataset.key); }
  static #onBloodrightRoll(event, target) { return rollBloodright(this.actor, target.dataset.key, Number(target.dataset.level)); }
  static #onDririToggle(event, target) { return toggleDririRitual(this.actor, target.dataset.key); }
  static #onDririRoll(event, target) { return rollDririRitual(this.actor, target.dataset.key); }
  static #onHunterTest() { return virtueTest(this.actor); }
  static #onHunterTrade() { return tradeConviction(this.actor); }
  static #onHunterRestore() { return restoreConviction(this.actor); }
  /** Players Guide, гл. 2: Деяния, Жертва, Грани «свыше». */
  static #onHunterDeed() { return awardDeed(this.actor); }
  static #onHunterShift() { return shiftDeed(this.actor); }
  static #onHunterCash() { return cashDeed(this.actor); }
  static #onHunterSacrifice() { return sacrifice(this.actor); }
  static #onHunterAdvance() { return advanceVirtue(this.actor); }
  static #onEdgeCall(event, target) { return callEdge(this.actor, target.dataset.key ?? ""); }
  static #onEdgeSwap() { return swapCalled(this.actor); }
  static #onHunterUnblock() { return unblockCall(this.actor); }
  /** Свидетель (Players Guide, гл. 1): бросок Добродетели, обмен Добродетели на рассудок, Закалённый дух, Общая беда. */
  static #onLostVirtue(event, target) { return lostVirtue(this.actor, target.dataset.key); }
  static #onLostTrade() { return lostTrade(this.actor); }
  static #onLostHardened() { return lostHardened(this.actor); }
  static #onLostOrdeal() { return lostOrdeal(this.actor); }
  /** Вера против падших: молитвы, экзорцизм, оружие веры (apps/exorcist.mjs). */
  static #onExorcist() { return openExorcist(this.actor); }
  static #onEbServant() { return this.actor.system.ebServant?.empowerments ? openEbServant(this.actor) : empowerServant(this.actor); }
  /** Инфернализм (apps/infernal.mjs): применить Вложение, договоры с демонами. */
  static #onInvestmentUse(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (item) return useInvestment(this.actor, item);
  }
  static #onPactAdd() { return pactDialog(this.actor); }
  static #onPactEdit(event, target) { return pactDialog(this.actor, Number(target.dataset.index)); }
  static #onPactDel(event, target) { return pactDelete(this.actor, Number(target.dataset.index)); }
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
  /** Переход с Человечности на Путь Просветления в игре (V20, гл. 7). */
  static async #onPathShift() { return (await import("../apps/path-shift.mjs")).openPathShift(this.actor); }

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
  /** Предок или потомок без листа: имя, клан, поколение (0 — по линии), когда обращён. */
  static async #linDialog(title, v = {}) {
    const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
    return foundry.applications.api.DialogV2.prompt({
      window: { title, icon: "fa-solid fa-sitemap" }, classes: ["vtm20", "r-dialog"], position: { width: 420 },
      content: `<div class="r-fields is-two">
        <label class="r-f is-span2"><span>${t("Lineage.Name")}</span><input type="text" name="name" value="${esc(v.name)}" autofocus></label>
        <label class="r-f"><span>${t("Lineage.Clan")}</span><input type="text" name="clan" value="${esc(v.clan)}" placeholder="${esc(t("Lineage.ClanPh"))}"></label>
        <label class="r-f"><span>${t("Lineage.Gen")}</span><input type="number" name="gen" value="${v.gen || ""}" min="1" max="15" placeholder="${esc(t("Lineage.GenPh"))}"></label>
        <label class="r-f is-span2"><span>${t("Lineage.Embrace")}</span><input type="text" name="embraced" value="${esc(v.embraced)}" placeholder="${esc(t("Lineage.EmbracedHint"))}"></label></div>`,
      ok: { label: t("Lineage.Write"), callback: (e, b) => { const f = b.form.elements;
        return { name: f.name.value.trim(), clan: f.clan.value.trim(), gen: Math.clamp(Number(f.gen.value) || 0, 0, 15), embraced: f.embraced.value.trim() }; } },
      rejectClose: false
    });
  }

  /** Вписанный список родословной у персонажа holder: ancestors или childer. */
  static #linList(holder, list) { return foundry.utils.deepClone(holder.system.lineage?.[list] ?? []); }

  /** «+ Вписать» над сиром без листа: ещё один предок в лист того, у кого этот сир. */
  static async #linAncestor(holder) {
    const v = await VtMActorSheet.#linDialog(t("Lineage.AncestorTitle"));
    if (!v?.name) return;
    const list = VtMActorSheet.#linList(holder, "ancestors");
    list.push(v);
    await holder.update({ "system.lineage.ancestors": list });
  }

  /** Потомок без листа — прямо в лист. */
  static async #onLinChild() {
    const v = await VtMActorSheet.#linDialog(t("Lineage.ChildTitle", { name: this.actor.name }));
    if (!v?.name) return;
    const list = VtMActorSheet.#linList(this.actor, "childer");
    list.push(v);
    await this.actor.update({ "system.lineage.childer": list });
  }

  static async #onLinEdit(event, target) {
    const holder = game.actors.get(target.dataset.holder) ?? this.actor, key = target.dataset.list, i = Number(target.dataset.index);
    if (!holder.isOwner) return ui.notifications.warn(t("Lineage.NoRights"));
    const list = VtMActorSheet.#linList(holder, key);
    if (!list[i]) return;
    const v = await VtMActorSheet.#linDialog(t(key === "childer" ? "Lineage.ChildTitle" : "Lineage.AncestorTitle", { name: holder.name }), list[i]);
    if (!v?.name) return;
    list[i] = v;
    await holder.update({ [`system.lineage.${key}`]: list });
  }

  static async #onLinDel(event, target) {
    const holder = game.actors.get(target.dataset.holder) ?? this.actor, key = target.dataset.list, i = Number(target.dataset.index);
    if (!holder.isOwner) return ui.notifications.warn(t("Lineage.NoRights"));
    // предка убираем вместе со всеми, кто вписан выше него: линия не рвётся посередине
    const list = VtMActorSheet.#linList(holder, key);
    await holder.update({ [`system.lineage.${key}`]: key === "ancestors" ? list.slice(0, i) : list.filter((_, j) => j !== i) });
  }

  static async #onLinSire(event, target) {
    const holder = game.actors.get(target.dataset.actorId) ?? this.actor;
    if (!holder.isOwner) return ui.notifications.warn(t("Lineage.NoRights"));
    if (target.dataset.mode === "ancestor") return VtMActorSheet.#linAncestor(holder);
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

  /**
   * Запись из компендиев оборотня (flags.ww) — не отдельным предметом, а ключом в списки листа: Дары, ритуалы, фетиши,
   * шрамы и уродства — оборотню; Чары и образец — духу; Дары и нумины — Родне; силы — Ками и фомору.
   * Тотем ложится на лист котерии (group-sheet.mjs), каэрн — справочная запись.
   */
  async _onDropItem(event, item) {
    const ww = item?.flags?.[SYSTEM_ID]?.ww;
    if (!ww) return super._onDropItem(event, item);
    if (!this.actor.isOwner) return null;
    const a = this.actor, s = a.system, garou = a.type === "werewolf";
    const add = {
      gift: garou && addGift, rite: garou && addRite, fetish: garou && addFetish, scar: garou && addScar, deformity: garou && addDeformity,
      charm: s.spirit?.on && addCharm, spirit: s.spirit && applySpiritTpl,
      kinGift: s.kinfolk?.on && kinAddGift, numen: s.kinfolk?.on && kinAddNumen,
      kami: s.kami?.on && kamiAdd, fomorPower: s.fomor?.on && fomorAdd, fomorBreed: s.fomor?.on && fomorBreed
    }[ww.kind];
    if (!add) {
      ui.notifications.warn(game.i18n.format(`VTM20.Werewolf.DropNo.${ww.kind === "totem" || ww.kind === "caern" ? ww.kind : "other"}`, { name: item.name }));
      return null;
    }
    return add(a, ww.key);
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
    await this.actor.shareXpWithRetainers(1);
  }
  static async #onRemoveXp(event, target) {
    const s = this.actor._source.system.experience;
    const log = foundry.utils.deepClone(s.log);
    const [row] = log.splice(Number(target.dataset.index), 1);
    const upd = { "system.experience.log": log };
    if (row?.amount > 0) upd["system.experience.total"] = Math.max(0, s.total - row.amount);
    await this.actor.update(upd);
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
function rollFromSpec(actor, r, { title, subtitle, effect, kind = "check", magic = null, power = null, torment = null, onRolled = null, more = null, contest = null, need = null }) {
  return RollDialog.prompt(actor, {
    title, subtitle, trait1: r.trait1 ?? "", trait2: r.trait2 ?? "",
    difficulty: r.difficulty || VTM20.defaultDifficulty, bloodCost: r.blood ?? 0, willpowerCost: !!r.willpower,
    diffNote: r.note ?? "", effect, kind, baseAttr: !!r.base,
    ...(r.dice ? { pool: r.dice, lockTraits: true, breakdown: [{ label: t("Magic.FixedPool"), value: r.dice }] } : {}),
    extra: { ...(magic ? { magic } : {}), ...(power ? { power } : {}), ...(torment != null ? { torment } : {}), ...(more ?? {}) },
    ...(onRolled ? { onRolled } : {}), ...(contest ? { contest, need } : {})
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
export async function rollPowerRef(actor, ref) {
  const x = powerByRef(ref);
  if (!x) return;
  const { disc, d, p, pathName } = x, magic = VTM20.pathDisciplines.includes(disc);
  if (actor.system.fx?.earthMeld && !(await allowAnyway(actor, t("Fx.EarthNoAction")))) return;
  if (subsumeBlocks(actor, disc) && !(await allowAnyway(actor, t("TP.SubsumeBlocked", { name: d.name })))) return;
  // В Облике Зверя нельзя использовать названные в V20 дисциплины, требующие человеческой формы.
  const animalFormBanned = new Set(["necromancy", "serpentis", "thaumaturgy", "vicissitude"]);
  if (actor.system.fx?.beastForm && actor.system.fx.beastForm !== "cobra" && animalFormBanned.has(disc) && !(await allowAnyway(actor, t("Fx.BeastDisciplineBan", { name: d.name })))) return;
  // Тёмные Знания (Earthbound): эффекта низкой Муки нет; падший платит 1 временной Мукой за каждое применение
  if (disc.startsWith("lore:") && actor.system.hostless) return ui.notifications.warn(game.i18n.localize("VTM20.Host.NoLore"));
  if (disc.startsWith("lore:")) return rollFromSpec(actor, p.roll ?? {}, { title: p.name, subtitle: `${d.name} · ${ROMAN[p.level - 1]}`, effect: p.html,
    torment: d.dark ? 10 : actor.system.torment?.permanent ?? 0, power: { disc, level: p.level, name: p.name },
    onRolled: d.dark && actor.type === "demon" && !actor.system.earthbound ? () => gainTorment(actor, 1, t("Demon.DarkReason")) : null });
  // Сила-эффект (data/effects.mjs): без броска — включить/выключить (HUD вёл в пустое окно броска);
  // rollStart — бросок запускает эффект: успех — эффект без второй оплаты, провал — botchDamage губительных
  const fk = fxKey(disc, p), fxDef = !pathName && POWER_EFFECTS[fk];
  if (fxDef && (fxDef.noRoll || !(p.roll?.trait1 || p.roll?.dice))) return togglePowerEffect(actor, fk, { gated: true });
  if (fxDef?.rollStart) {
    if (actor.powerEffects.some(x => x.power === fk)) return togglePowerEffect(actor, fk, { gated: true });
    return rollFromSpec(actor, p.roll ?? {}, { title: p.name, subtitle: `${d.name} · ${ROMAN[p.level - 1] ?? p.level}`, effect: p.html,
      power: { disc, level: p.level, name: p.name },
      onRolled: async res => {
        if ((res?.successes ?? 0) > 0) {
          const eff = await actor.startPower(fk, { blood: 0 });
          // качество по успехам (Маска тысячи лиц) — в описание эффекта и в чат
          if (eff && fxDef.tierKey) {
            const line = foundry.utils.escapeHTML(t(`${fxDef.tierKey}.${Math.min(5, res.successes)}`));
            await eff.update({ description: `<p><b>${line}</b></p>${eff.description ?? ""}` });
            await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice"><i class="fa-solid ${fxDef.icon}"></i> <b>${foundry.utils.escapeHTML(p.name)}</b>: ${line}</div>` });
          }
          return eff;
        }
        if (res?.outcome === "botch" && fxDef.botchDamage) return actor.applyDamage(fxDef.botchDamage, "aggravated");
      } });
  }
  // Силы против цели (apps/target-powers.mjs): сложность — черта отмеченной цели, итог — на цели
  const tp = targetPowerOf(disc, p);
  if (tp) return rollTargetPower(actor, disc, d, p, tp, { rollFromSpec, subtitle: `${pathName || d.name} · ${ROMAN[p.level - 1] ?? p.level}`,
    kind: magic ? "magic" : "check", magic: magic ? { disc, level: p.level, path: pathName } : null });
  const plain = () => rollFromSpec(actor, p.roll ?? {}, { title: p.name, subtitle: `${pathName || d.name} · ${ROMAN[p.level - 1] ?? p.level}`, effect: p.html,
    kind: magic ? "magic" : "check", magic: magic ? { disc, level: p.level, path: pathName } : null,
    power: { disc, level: p.level, path: pathName, name: p.name } });
  // сила без броска и без своей автоматики (кровные линии): «Применить» — цена кровью и Волей, карточка в чат; по желанию — бросок
  if (!magic && !(p.roll?.trait1 || p.roll?.dice)) return usePower(actor, p, `${d.name} · ${ROMAN[p.level - 1] ?? p.level}`, plain);
  return plain();
}
