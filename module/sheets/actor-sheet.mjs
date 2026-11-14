// module/sheets/actor-sheet.mjs
// Лист персонажа V20 на ApplicationV2. Точки и шкалы — действия (data-action),
// текстовые поля — обычная форма с submitOnChange.
//
// Раскладка: шапка-«патент» с медальоном, вкладки слева от «реестра»
// (правая колонка: мораль, воля, кровь, здоровье, быстрые действия).

import { MAGE_ACTIONS } from "./actor/mage.mjs";
import { WRAITH_ACTIONS, arcFold } from "./actor/wraith.mjs";
import { CHANGELING_ACTIONS } from "./actor/changeling.mjs";
import { THAUM_ACTIONS } from "./actor/thaum.mjs";
import { SABBAT_ACTIONS } from "./actor/sabbat.mjs";
import { artifactsView } from "../apps/thaum-workshop.mjs";
import { changelingInfo, artsView, CHANGELING_SIGIL, kithGlyph, clGlyph } from "../apps/changeling.mjs";
import { lykeianInfo } from "../apps/lykeian.mjs";
import { agendasView } from "../apps/agenda.mjs";
import { hsienView, inanimaeView } from "../apps/fae-variants.mjs";
import { dafView } from "../apps/dark-fae.mjs";
import { wraithInfo, arcanoiView, passionsView, setNecropolis, setPlace } from "../apps/wraith.mjs";
import * as Resolution from "../apps/resolution.mjs";
import * as Thorns from "../apps/thorns.mjs";
import { consortsView } from "../apps/consorts.mjs";
import { relicsView } from "../apps/relics.mjs";
import { spectreView } from "../apps/spectre.mjs";
import { risenView } from "../apps/risen.mjs";
import { projectorView } from "../apps/projector.mjs";
import { realmView } from "../apps/realms.mjs";
import { WEREWOLF_ACTIONS } from "./actor/werewolf.mjs";
import { HUNTER_ACTIONS } from "./actor/hunter.mjs";
import { DEMON_ACTIONS } from "./actor/demon.mjs";
import { allowAnyway } from "../apps/rule-gate.mjs";
import { sheetStrategy, openStrategy } from "../ui/strategy.mjs";
import { VTM20, SYSTEM_PATH, SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { attachCombos } from "../ui/combo.mjs";
import { choosePower } from "../apps/power-choice.mjs";
import { RollDialog } from "../dice/dialog.mjs";
import { rollVirtueCheck } from "../dice/virtue-checks.mjs";
import { golcondaView, seekTeaching, suspire } from "../apps/golconda.mjs";
import { openDamageDialog } from "../apps/damage.mjs";
import { openCreator } from "../apps/creator.mjs";

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
import { createLore, PICKS } from "../apps/library-picks.mjs";
import { openMoney } from "../data/money.mjs";
import { toggleRitualReading, cancelRitual } from "../apps/timers.mjs";
import { enterTorpor, wakeFromTorpor, undoDeath } from "../apps/torpor.mjs";
import { makeExtra } from "../apps/extras.mjs";
import { refreshActor } from "../apps/codex-refresh.mjs";

import { diablerieMark } from "../apps/diablerie.mjs";
import { werewolfInfo, werewolfSigil, giftsView, scarView, addScar, deformityView, addDeformity, kinfolkInfo, kinAddGift, kinAddNumen, kamiInfo, kamiAdd, fetchInfo, fomorInfo, fomorBreed, fomorAdd, applySpiritTpl, spiritInfo, addCharm, fetishView, addFetish, haranoProne, addGift, addRite } from "../apps/werewolf.mjs";
import { hunterInfo, edgesView, callView, isLost } from "../apps/hunter.mjs";
import { removeBloodright, rollBloodright, toggleRitual as toggleDririRitual, rollRitual as rollDririRitual } from "../apps/dhampir.mjs";

import { togglePowerEffect } from "../apps/power-effects.mjs";
import { usePower } from "../apps/use-power.mjs";
import { isTechnocrat } from "../ui/themes.mjs";
import { sorcererInfo, consorInfo, numenAbility as sorcAbility } from "../apps/sorcerer.mjs";
import { mageInfo, mageSigil, spheresView, addTool } from "../apps/mage.mjs";
import { stateView, mindView } from "../apps/mage-state.mjs";
import { POWER_EFFECTS, fxKey } from "../data/effects.mjs";
import { rollPackVinculi, openVaulderie, loyaltyConflict } from "../apps/vaulderie.mjs";
import { openCoterie } from "../apps/coterie.mjs";
import { itemCardHTML } from "../chat/item-card.mjs";
import { themeClass } from "../ui/themes.mjs";

import { ghoulify } from "../apps/embrace-ghoul.mjs";
import { embrace } from "../apps/embrace.mjs";
import { gainTorment } from "../apps/torment.mjs";
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
      ...MAGE_ACTIONS, ...WEREWOLF_ACTIONS, ...HUNTER_ACTIONS, ...DEMON_ACTIONS, ...WRAITH_ACTIONS, ...CHANGELING_ACTIONS, ...THAUM_ACTIONS, ...SABBAT_ACTIONS,
      setDots: { handler: VtMActorSheet.#onSetDots, buttons: [0, 2] },
      choosePower: VtMActorSheet.#onChoosePower,
      setHealth: { handler: VtMActorSheet.#onSetHealth, buttons: [0, 2] },
      rollTrait: VtMActorSheet.#onRollTrait,
      rollFree: VtMActorSheet.#onRollFree,
      rollInitiative: VtMActorSheet.#onRollInitiative,
      rollVirtue: VtMActorSheet.#onRollVirtue,
      golcondaSeek: VtMActorSheet.#onGolconda, golcondaSuspire: VtMActorSheet.#onGolconda,
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
ghoulify: VtMActorSheet.#onGhoulify, embrace: VtMActorSheet.#onEmbrace,
openUuid: VtMActorSheet.#onOpenUuid,
      addHouseLores: VtMActorSheet.#onAddHouseLores,
      pinPower: VtMActorSheet.#onPinPower,
      rollItemPower: VtMActorSheet.#onRollItemPower,
      itemCreate: VtMActorSheet.#onItemCreate, openPack: VtMActorSheet.#onOpenPack,
      itemEdit: VtMActorSheet.#onItemEdit,
      itemDelete: VtMActorSheet.#onItemDelete,
      itemToggle: VtMActorSheet.#onItemToggle,
      itemChat: VtMActorSheet.#onItemChat,
      addSecondary: VtMActorSheet.#onAddSecondary,
      removeSecondary: VtMActorSheet.#onRemoveSecondary,
      addBond: VtMActorSheet.#onAddBond,
      drinkBond: VtMActorSheet.#onDrinkBond,
      feedFrom: VtMActorSheet.#onFeedFrom,
      ghoulLife: VtMActorSheet.#onGhoulLife,
      openPath: VtMActorSheet.#onOpenPath, pathShift: VtMActorSheet.#onPathShift, pickPath: VtMActorSheet.#onPickPath,
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
      lineAtlas: VtMActorSheet.#onLineAtlas,
      linSire: VtMActorSheet.#onLinSire,
      mageFold: VtMActorSheet.#onMageFold,
openStrategy: () => openStrategy(),
      drinkVitae: VtMActorSheet.#onDrinkVitae, setVitae: VtMActorSheet.#onSetVitae, bloodrightRemove: VtMActorSheet.#onBloodrightRemove,
      bloodrightRoll: VtMActorSheet.#onBloodrightRoll, dririToggle: VtMActorSheet.#onDririToggle, dririRoll: VtMActorSheet.#onDririRoll,
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
  /** Призрак: открытая половинка ранга в карточке Арканоса — { ключ: "уровень-вид" } (sheets/actor/wraith.mjs, wrPick). */
  _wrSel = {};
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
    return !["creature", "spirit"].includes(a.type) && !a.getFlag(SYSTEM_ID, "created")
      && Object.values(s.attributes).every(x => x.value === 1) && Object.values(s.abilities).every(x => x.value === 0);
  }

  /** Вкладки, которые устарели: правка персонажа перерисовывает только открытую, остальные — при переходе на них. */
  _staleTabs = new Set();
  _full = false;

  /**
   * До создания рисуем только шапку и ворота. Дальше: первый показ — весь лист; правка персонажа — шапка, шкалы, подвал
   * и открытая вкладка (скрытые пять вкладок — это две трети разметки листа, а их никто не видит).
   */
  _configureRenderOptions(options) {
    const asked = !!options.parts;                       // части названы явно — рисуем их как просили
    super._configureRenderOptions(options);
    if (this.needsCreation) { options.parts = ["header", "gate"]; this._full = false; return; }
    options.parts = options.parts.filter(p => p !== "gate");
    if (asked) { for (const p of options.parts) this._staleTabs.delete(p); return; }
    if (!this.rendered || !this._full || options.force) { this._full = true; this._staleTabs.clear(); return; }   // render(true) — весь лист
    const tabs = this.constructor.TABS.primary.tabs.map(x => x.id), active = this.tabGroups.primary;
    if (!tabs.includes(active)) return;
    options.parts = options.parts.filter(p => !tabs.includes(p) || p === active);
    for (const p of tabs) if (p !== active) this._staleTabs.add(p);
  }

  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    if (this.actor.type === "mortal" || isLost(this.actor)) delete parts.disciplines;    // у Свидетеля Граней нет
    // у охотника на месте Дисциплин — Грани
    if (this.actor.type === "hunter" && parts.disciplines) parts.disciplines = { ...parts.disciplines, template: `${SYSTEM_PATH}/templates/actor/edges.hbs` };
    // маг — вкладка «Сферы»: Сферы с рангами, фокус, ротэ
    if (this.actor.type === "mage" && parts.disciplines) parts.disciplines = { ...parts.disciplines, template: `${SYSTEM_PATH}/templates/actor/spheres.hbs` };
    // у призрака — Арканои, Страсти, Оковы и Тень
    if (this.actor.type === "wraith" && parts.disciplines) parts.disciplines = { ...parts.disciplines, template: `${SYSTEM_PATH}/templates/actor/arcanoi.hbs` };
    // у подменыша — Искусства и Царства
    if (this.actor.type === "changeling" && parts.disciplines) parts.disciplines = { ...parts.disciplines, template: `${SYSTEM_PATH}/templates/actor/arts.hbs` };
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
    if (this.actor.type === "mage" && tabs.disciplines) Object.assign(tabs.disciplines, { label: "VTM20.Mage.Spheres", icon: isTechnocrat(this.actor) ? "fa-solid fa-atom" : "fa-solid fa-hat-wizard" });
    if (this.actor.type === "werewolf" && tabs.disciplines) Object.assign(tabs.disciplines, { label: "VTM20.Werewolf.Gifts", icon: "fa-solid fa-paw" });
    if (this.actor.type === "wraith" && tabs.disciplines) Object.assign(tabs.disciplines, { label: "VTM20.Wraith.Arcanoi", icon: "fa-solid fa-ghost" });
    if (this.actor.type === "changeling" && tabs.disciplines) Object.assign(tabs.disciplines, { label: "VTM20.Changeling.Arts", icon: "fa-solid fa-wand-sparkles" });
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
      isVampire: actor.type === "vampire", isGhoul: actor.type === "ghoul", isDhampir: actor.isDhampir, isMortal: ["mortal", "hunter", "mage"].includes(actor.type), isHunter: actor.type === "hunter", isMage: actor.type === "mage", isWerewolf: actor.type === "werewolf", isWraith: actor.type === "wraith", isChangeling: actor.type === "changeling", stratInfo: sheetStrategy(actor),
      isCreature: actor.type === "creature", isSpiritType: actor.type === "spirit", isDemon: actor.type === "demon",
      hasBlood: actor.hasBlood,
      typeLabel: actor.type === "ghoul" && ["revenant", "dhampir"].includes(actor.system.ghoulType) ? t(`GhoulType.${actor.system.ghoulType}`) : game.i18n.localize(`TYPES.Actor.${actor.type}`),
      needsCreation: this.needsCreation,
      tabs: this._prepareTabs("primary")
    });
    prepareHeader(this, ctx);
    prepareTraits(this, ctx);
    prepareRegistry(this, ctx);
    if (actor.type === "vampire") ctx.golconda = golcondaView(actor);   // Голконда (apps/golconda.mjs)
    ctx.thArt = artifactsView(actor);                                    // артефакты Тремер (apps/thaum-workshop.mjs)
    if (actor.type === "demon") prepareLores(this, ctx);
    else if (actor.type === "hunter") { ctx.hunterInfo = hunterInfo(actor, dots); ctx.lineAtlas = true; ctx.edgePaths = edgesView(actor); ctx.hunterCall = callView(actor); }
    else if (actor.type === "mage") { ctx.mageInfo = mageInfo(actor, dots); ctx.mageView = spheresView(actor, dots); ctx.mageState = stateView(actor, dots); ctx.mageState.mind = await mindView(actor);
      const sg = mageSigil(actor);
      ctx.sigil = { ...ctx.sigil, sym: sg.sym, label: sg.label };
      ctx.lineAtlas = true;
      ctx.mageSeal = sg.seal;
      // свёрнутые карточки Сфер — у каждого игрока свои (память браузера); по умолчанию свёрнуты Сферы без точек
      const fold = this.#sphereFold();
      for (const sp of ctx.mageView.spheres) sp.folded = fold[sp.key] ?? true;      // как Дисциплины: свёрнуты, пока не раскроют
      ctx.mageView.allFolded = ctx.mageView.spheres.every(sp => sp.folded); }
    else if (actor.type === "werewolf") { ctx.werewolfInfo = werewolfInfo(actor, dots); ctx.ww = giftsView(actor);
      const sg = werewolfSigil(actor);
      ctx.sigil = { ...ctx.sigil, sym: sg.sym, label: sg.label };
      ctx.lineAtlas = true;
      ctx.werewolfSeal = sg.seal;
      // ниже Обездвиженного — «Остаться в строю» за Ярость; с недостатком «Склонность к Харано» — проверка Харано
      const hp = actor.system.health;
      ctx.wwDown = hp.bashing + hp.lethal + hp.aggravated >= 7 && this.isEditable;
      ctx.haranoProne = haranoProne(actor) && this.isEditable;
      ctx.ww.fetishes = fetishView(this.actor);
      ctx.ww.scars = scarView(this.actor);
      // уродства — у метиса (и у того, кому их уже записали)
      ctx.ww.deformities = deformityView(this.actor);
      ctx.ww.showDeform = actor.system.werewolf.breed === "metis" || ctx.ww.deformities.length > 0;
      ctx.ww.needDeform = actor.system.werewolf.breed === "metis" && !ctx.ww.deformities.length;
    }
    else if (actor.type === "wraith") { ctx.wraithInfo = wraithInfo(actor, dots); ctx.arc = arcanoiView(actor, dots, this._wrSel); ctx.wp = passionsView(actor, dots, Resolution, Thorns); ctx.consorts = consortsView(actor); ctx.wrRelics = relicsView(actor);
      if (actor.system.wraith.spectre.on) { ctx.spectre = spectreView(actor, dots); ctx.typeLabel = t("Wraith.Spectre.Title"); }   // Спектр (apps/spectre.mjs): Ангст, Тёмные Арканои, Психея
      else if (actor.system.wraith.risen.on) ctx.risen = risenView(actor, dots);    // Восставший (apps/risen.mjs): тело, Проводник, свои Арканои
      else if (actor.system.wraith.projector.on || actor.system.wraith.hue) ctx.projector = projectorView(actor);   // проектор «Орфея» (apps/projector.mjs): Оттенок, Пятна
      ctx.realm = realmView(actor, dots);                                                // другое Тёмное Царство (apps/realms.mjs)
      const fold = arcFold(actor.id);
      for (const x of ctx.arc.own) x.folded = (fold[x.key] ?? true) && !x.sel;     // открытый уровень держит карточку раскрытой
      ctx.arc.allFolded = ctx.arc.own.every(x => x.folded);
      ctx.sigil = { ...ctx.sigil, img: VTM20.typeSigil("wraith"), sym: ctx.wraithInfo.legionSym ?? ctx.sigil.sym, label: ctx.wraithInfo.legion?.name ?? "" }; ctx.lineAtlas = true; }
    else if (actor.type === "changeling") { ctx.changelingInfo = changelingInfo(actor, dots); ctx.cl = artsView(actor, dots); ctx.lykeian = lykeianInfo(actor); ctx.agendas = agendasView(actor);
      // Искусства сворачиваются, как Дисциплины: карточка и правила каждого кантрипа — строки _open (art-<ключ>, art-<ключ>-<уровень>)
      for (const a of ctx.cl.own) {
        a.rowId = `art-${a.key}`; a.open = this._open.has(a.rowId);
        for (const l of a.levels) { l.rowId = `art-${a.key}-${l.level}`; l.open = this._open.has(l.rowId); }
      }
      ctx.cl.allOpen = ctx.cl.own.length > 0 && ctx.cl.own.every(a => a.open);
      ctx.hsien = hsienView(actor, dots); ctx.inan = inanimaeView(actor, dots); ctx.daf = dafView(actor, dots);
      if (ctx.daf?.courtSym) ctx.sigil.sym = ctx.daf.courtSym;
      ctx.sigil = { ...ctx.sigil, img: CHANGELING_SIGIL, label: ctx.changelingInfo.kith?.name ?? ctx.lykeian?.guise?.name ?? "",
        sym: ctx.lykeian ? clGlyph("guise", actor.system.changeling.lykeian?.guise) : kithGlyph(actor.system.changeling.kith) }; ctx.lineAtlas = true; }
    else if (actor.type !== "mortal") prepareDisciplines(this, ctx);
    prepareAdvantages(this, ctx);
    if (actor.type === "mortal") { ctx.sorcInfo = sorcererInfo(actor, dots); ctx.consorInfo = consorInfo(actor);
      ctx.kinInfo = kinfolkInfo(actor); ctx.kamiInfo = kamiInfo(actor); ctx.fomorInfo = fomorInfo(actor); if (actor.system.kinfolk?.on) ctx.kinInfo.fetch = fetchInfo(actor);
      // Ками, фомор, Родня, колдун — смертный особого рода: подпись в шапке, знак на печати и их шкалы рядом с Человечностью
      const s2 = actor.system, W = "VTM20.Werewolf";
      ctx.mortalKind = s2.kami?.on ? { key: "kami", icon: "fa-seedling", label: t("Werewolf.Kami.kicker"), sub: game.i18n.localize(`${W}.Kami.form.${s2.kami.kind}`),
          bars: [{ label: game.i18n.localize(`${W}.Gnosis`), dots: dots(s2.kami.gnosis, 10, { path: "system.kami.gnosis" }) },
            ...(s2.kami.rage ? [{ label: game.i18n.localize(`${W}.Rage`), dots: dots(s2.kami.rage, 10, { path: "system.kami.rage" }) }] : [])] }
        : s2.fomor?.on ? { key: "fomor", icon: "fa-biohazard", label: t("Werewolf.Fomor.kicker"), sub: ctx.fomorInfo?.breed?.name ?? "",
          bars: s2.fomor.rage ? [{ label: game.i18n.localize(`${W}.Rage`), dots: dots(s2.fomor.rage, 10, { path: "system.fomor.rage" }) }] : [] }
        : s2.kinfolk?.on ? { key: "kin", icon: "fa-paw", label: t("Werewolf.Kin.kicker"), sub: ctx.kinInfo?.tribes?.find(x => x.selected)?.label ?? "",
          bars: s2.kinfolk.gnosis ? [{ label: game.i18n.localize(`${W}.Gnosis`), dots: dots(s2.kinfolk.gnosis, 10, { path: "system.kinfolk.gnosis" }) }] : [] }
        : s2.sorcerer?.on ? { key: "sorc", icon: "fa-book-skull", label: t("Sorcerer.kicker"), sub: "", bars: [] } : null;
      if (ctx.mortalKind) { ctx.typeLabel = ctx.mortalKind.label; ctx.sigil = { ...ctx.sigil, icon: ctx.mortalKind.icon, kind: ctx.mortalKind.key, label: ctx.mortalKind.sub || ctx.mortalKind.label }; } }
    if (actor.isSpirit) ctx.spiritInfo = spiritInfo(actor, dots);
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
    // перерисованы не все части: слушатели вешаем только на свежие, иначе на нетронутых вкладках они удвоятся
    const fresh = (options.parts ?? []).map(p => this.element.querySelector(`[data-application-part="${p}"]`)).filter(Boolean);
    const all = sel => fresh.flatMap(root => [...root.querySelectorAll(sel)]);
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
    // пустой раздел вкладки (заголовок без строк) — подсказка: чем его наполнить (кнопки в заголовке) или просто «пусто»
    for (const h of this.element.querySelectorAll(".tab .r-h2")) {
      const n = h.nextElementSibling;
      if (n?.classList.contains("r-empty-auto")) continue;
      const empty = !n || n.classList.contains("r-h2") || (n.matches("ul, ol, .r-edge-list") && !n.children.length && !n.textContent.trim());
      if (!empty) continue;
      const add = h.querySelector(".r-h2-tools a, .r-h2-tools button");
      const p = document.createElement("p");
      p.className = "r-empty r-empty-auto";
      p.textContent = game.i18n.localize(add ? "VTM20.Sheet.EmptyAdd" : "VTM20.Sheet.EmptyNone");
      h.after(p);
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
    // Маг: инструмент фокуса — выбрать из списка или вписать свой (Enter)
    for (const el of all("input[data-mage-tool]")) {
      el.addEventListener("change", ev => { ev.stopPropagation(); const v = el.value.trim(); el.value = ""; if (v) return addTool(this.actor, v); });
    }
    // Щелчок по пустому месту строки Дисциплины раскрывает её (кнопки, точки и поля работают как прежде)
    for (const head of all(".r-disc-head")) {
      head.addEventListener("click", ev => {
        if (ev.target.closest("a, button, input, select, .r-dots")) return;
        head.querySelector("[data-action=toggleRow]")?.click();
      });
    }
    // Колдун: Способность Пути — выбор в строке нумины (поле без name — в форму листа не попадает)
    for (const el of all("select[data-sorc-ability]")) el.addEventListener("change", ev => { ev.stopPropagation(); sorcAbility(this.actor, el.dataset.sorcAbility, el.value); });
    // Призрак: Некрополь сцены — у рассказчика (apps/wraith.mjs, setNecropolis)
    for (const el of all("select.r-wr-necro")) el.addEventListener("change", async ev => { ev.stopPropagation(); await setNecropolis(el.value); this.render(); });
    for (const el of all("select.r-wr-place")) el.addEventListener("change", async ev => { ev.stopPropagation(); await setPlace(el.value); this.render(); });
    // Щелчок по шапке карточки Арканоса сворачивает и разворачивает её — как строку Дисциплины
    for (const head of all(".r-wr-arc-head")) {
      head.addEventListener("click", ev => {
        if (ev.target.closest("a, button, input, select, .r-dots")) return;
        head.querySelector("[data-action=wrFold]")?.click();
      });
    }
    // Щелчок по шапке карточки Сферы раскрывает её — как строку Дисциплины
    for (const head of all(".r-sphere-head")) {
      head.addEventListener("click", ev => {
        if (ev.target.closest("a, button, input, select, .r-dots")) return;
        head.querySelector("[data-action=mageFold]")?.click();
      });
    }
    // «Потомки» в родословной подсвечиваются, когда над ними несут персонажа
    const drop = all("[data-lin-drop]")[0];
    if (drop) {
      drop.addEventListener("dragover", () => drop.classList.add("is-over"));
      for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, () => drop.classList.remove("is-over"));
    }
    // Поля предметов прямо на листе (имя пути, уровень ритуала…)
    for (const el of all("[data-item-field]")) {
      el.addEventListener("change", ev => {
        ev.stopPropagation();
        const item = this.actor.items.get(el.dataset.itemId);
        if (!item) return;
        const val = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) : el.value;
        item.update({ [el.dataset.itemField]: val });
      });
    }
    // Название, обрезанное многоточием, — целиком в подсказке: меряем одну строку под курсором
    if (!this.element.dataset.rTrunc) {
      this.element.dataset.rTrunc = "1";
      this.element.addEventListener("pointerenter", ev => {
        const el = ev.target?.closest?.(".r-trait-label");
        if (!el || el.dataset.tooltip || el.scrollWidth <= el.clientWidth + 1) return;
        el.dataset.tooltip = el.textContent.trim();
        game.tooltip.activate(el);
      }, true);
    }
  }

  changeTab(tab, group, options) {
    super.changeTab(tab, group, options);
    // вкладка устарела, пока была скрыта, — рисуем её сейчас
    if (group === "primary" && this._staleTabs.has(tab)) this.render({ parts: [tab] });
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
    // Одно поле в двух местах листа (Убежище и Возраст — в шапке и в биографии): форма отдаёт массив, и он записался бы
    // строкой «,,,». Берём то поле, которое правили, иначе первое; накопленные запятые прежних сохранений — чистим.
    const seen = new Map();
    for (const el of form.elements) if (el.name && el.type !== "radio" && el.type !== "checkbox") seen.set(el.name, [...(seen.get(el.name) ?? []), el]);
    for (const [name, els] of seen) {
      if (els.length < 2 || !Array.isArray(foundry.utils.getProperty(data, name))) continue;
      const pick = els.includes(event?.target) ? event.target : els[0];
      foundry.utils.setProperty(data, name, /^,+$/.test(pick.value) ? "" : pick.value);
    }
    for (const key of ["secondary", "bonds", "vinculi", "boons", "timeline"]) {
      const v = data.system?.[key];
      if (v && !Array.isArray(v)) {
        const arr = foundry.utils.deepClone(src[key]);
        for (const [i, row] of Object.entries(v)) arr[Number(i)] = foundry.utils.mergeObject(arr[Number(i)] ?? {}, row);
        data.system[key] = arr;
      }
    }
    // призрак: Страсти, Оковы, Тёмные Страсти и Шипы — списки строк с полями ввода
    const wr = data.system?.wraith;
    for (const path of ["passions", "fetters", "consorts", "shadow.darkPassions", "shadow.thorns"]) {
      const v = wr ? foundry.utils.getProperty(wr, path) : null;
      if (v && !Array.isArray(v)) {
        const arr = foundry.utils.deepClone(foundry.utils.getProperty(src.wraith, path));
        for (const [i, row] of Object.entries(v)) arr[Number(i)] = foundry.utils.mergeObject(arr[Number(i)] ?? {}, row);
        foundry.utils.setProperty(wr, path, arr);
      }
    }
    // подменыш: Агенды и Реды ликийца — строки с полями ввода
    const cl = data.system?.changeling;
    for (const path of ["agendas", "lykeian.redes"]) {
      const v = cl ? foundry.utils.getProperty(cl, path) : null;
      if (v && !Array.isArray(v)) {
        const arr = foundry.utils.deepClone(foundry.utils.getProperty(src.changeling, path) ?? []);
        for (const [i, row] of Object.entries(v)) arr[Number(i)] = foundry.utils.mergeObject(arr[Number(i)] ?? {}, row);
        foundry.utils.setProperty(cl, path, arr);
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
    // точка внутри списка («system.wraith.passions.2.value»): список правится целиком — ArrayField по индексу не обновляется
    const parts = path.split("."), at = parts.findIndex(p => /^\d+$/.test(p));
    if (at > 0) {
      const head = parts.slice(0, at).join("."), list = foundry.utils.deepClone(foundry.utils.getProperty(doc._source, head));
      if (Array.isArray(list)) {
        foundry.utils.setProperty(list[Number(parts[at])] ?? {}, parts.slice(at + 1).join("."), next);
        return doc.update({ [head]: list });
      }
    }
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
  /** Голконда: поиск учения и Отдохновение (apps/golconda.mjs). */
  static #onGolconda(event, target) { return target.dataset.action === "golcondaSuspire" ? suspire(this.actor) : seekTeaching(this.actor); }
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
  /** Справочник мага и оборотня — на своей фракции, роде или племени (apps/atlas.mjs). */
  static async #onLineAtlas() {
    const s = this.actor.system, { openAtlas } = await import("../apps/atlas.mjs");
    if (this.actor.type === "hunter") return openAtlas("hunter", s.hunter?.creed);
    if (this.actor.type === "wraith") return openAtlas("wraith", s.wraith?.guild);
    if (this.actor.type === "changeling") return openAtlas("changeling", s.changeling?.kith);
    return this.actor.type === "mage" ? openAtlas("mage", s.mage?.faction) : openAtlas("werewolf", s.werewolf?.fera || s.werewolf?.tribe);
  }

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

  /** Смена Пути на листе — библиотека Путей (этика, Столп, иерархия грехов). */
  static #onPickPath() { return openLibrary({ actor: this.actor, kind: "moralPath" }); }

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

  /** Справочник правил V20 (компендий-журнал). */
  static #onOpenRules(event, target) {
    const name = target?.dataset?.rules === "dhampir" ? "dhampir-rules" : this.actor.type === "hunter" ? "hunter-rules" : this.actor.type === "mage" ? "mage-books" : this.actor.type === "wraith" ? "wraith-books" : this.actor.type === "changeling" ? "changeling-books" : this.actor.type === "werewolf" ? "werewolf-rules" : "rules";
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

  /** Раскрыть все Дисциплины (Знания демона, Искусства подменыша), а если все уже раскрыты — свернуть. */
  static #onToggleAll() {
    const ids = this.actor.type === "changeling"
      ? Object.entries(this.actor.system.changeling?.arts ?? {}).filter(([, v]) => v > 0).map(([k]) => `art-${k}`)
      : this.actor.items.filter(i => i.type === (this.actor.type === "demon" ? "lore" : "discipline")).map(i => i.id);
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

  static #onGhoulify() { return ghoulify(this.actor); }
  static #onEmbrace() { return embrace(this.actor); }
  #sphereFold() { try { return JSON.parse(localStorage.getItem(`vtm20.spheres.${this.actor.id}`) ?? "{}"); } catch { return {}; } }
  #sphereFoldSave(v) { try { localStorage.setItem(`vtm20.spheres.${this.actor.id}`, JSON.stringify(v)); } catch { /* память браузера недоступна — просто не запомним */ } }
  /** Свернуть или развернуть карточку Сферы (ранги и специализации); «все» — разом. */
  static #onMageFold(event, target) {
    const fold = this.#sphereFold(), k = target.dataset.key;
    if (k) {                                             // одна строка — сразу классом, без перерисовки листа
      fold[k] = !(fold[k] ?? true);
      this.#sphereFoldSave(fold);
      const card = target.closest(".r-sphere");
      card?.classList.toggle("is-shut", fold[k]); card?.classList.toggle("is-open", !fold[k]);
      return card;
    }
    const to = target.dataset.to === "1"; for (const x of VTM20.mageSpheres) fold[x] = to;
    this.#sphereFoldSave(fold);
    return this.render();
  }

  /** Дампир (apps/dhampir.mjs): Кровные права — добавить в библиотеке (library-picks.mjs), убрать, бросок силы; ритуалы Дриримантии. */
  static #onDrinkVitae() { return this.actor.drinkVitae(1); }

  static #onSetVitae(event, target) {
    const v = Math.max(0, (this.actor.system.dhampir?.vitae ?? 0) + Number(target.dataset.n));
    return this.actor.update({ "system.dhampir.vitae": v });
  }
  static #onBloodrightRemove(event, target) { return removeBloodright(this.actor, target.dataset.key); }
  static #onBloodrightRoll(event, target) { return rollBloodright(this.actor, target.dataset.key, Number(target.dataset.level)); }
  static #onDririToggle(event, target) { return toggleDririRitual(this.actor, target.dataset.key); }
  static #onDririRoll(event, target) { return rollDririRitual(this.actor, target.dataset.key); }
  /** Открыть лист по uuid (хозяин слуги и т. п.). */
  static async #onOpenUuid(event, target) { (await fromUuid(target.dataset.uuid))?.sheet?.render(true); }

  static #onAddHouseLores() {
    const a = this.actor, have = new Set(a.items.filter(i => i.type === "lore").map(i => i.system.key));
    return createLore(a, (Codex.house(a.system.house)?.lores ?? []).filter(k => !have.has(k)));
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

  /** Компендий системы (ритуалы и реликвии падших): перетащить нужное на лист. */
  static #onOpenPack(event, target) {
    const pack = game.packs.get(`${SYSTEM_ID}.${target.dataset.pack}`);
    if (!pack) return ui.notifications.warn(t("Sheet.PackMissing"));
    pack.render(true);
    ui.notifications.info(t("Sheet.PackDrag"));
  }

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
  /** Жизнь гуля на витэ: неделя ломки, отказ от витэ, галлюцинации, извержение, потеря Дисциплины. */
  static async #onGhoulLife(event, target) {
    const L = await import("../apps/ghoul-life.mjs");
    const fn = { week: L.withdrawalWeek, refuse: L.refuseVitae, hall: L.hallucinations, purge: L.purge, lose: L.loseDiscipline }[target.dataset.op];
    return fn?.(this.actor);
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
    // Силы призраков и подменышей (компендии wraith-powers, changeling-powers): flags.pick — вид библиотеки и запись
    const pick = item?.flags?.[SYSTEM_ID]?.pick;
    if (pick && PICKS[pick.kind]) {
      if (!this.actor.isOwner) return null;
      const res = await PICKS[pick.kind].take(this.actor, pick.id);
      if (res === null) return ui.notifications.warn(game.i18n.format("VTM20.Library.Pick.WrongSheet", { name: item.name }));
      return ui.notifications.info(game.i18n.format("VTM20.Library.Added", { name: item.name }));
    }
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
  // Проклятие разума (Огам 3): каждая сила, кроме Мощи, Стойкости и Стремительности, — 1 Воля
  if (!["potence", "fortitude", "celerity"].includes(disc) && actor.effects.some(e => !e.disabled && e.flags?.[SYSTEM_ID]?.curseMind)
    && !(await actor.spendWillpower(1)) && !(await allowAnyway(actor, t("BL.CurseMindWill")))) return;
  // Сила-эффект (data/effects.mjs): без броска — включить/выключить (HUD вёл в пустое окно броска);
  // rollStart — бросок запускает эффект: успех — эффект без второй оплаты, провал — botchDamage губительных
  const fk = fxKey(disc, p), fxDef = !pathName && POWER_EFFECTS[fk];
  // viaRoll — эффект кладёт сама сила (apps/target-powers.mjs), даже если броска у неё нет (Кровное единство)
  if (fxDef && !(fxDef.viaRoll && targetPowerOf(disc, p)) && (fxDef.noRoll || !(p.roll?.trait1 || p.roll?.dice))) return togglePowerEffect(actor, fk, { gated: true });
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
