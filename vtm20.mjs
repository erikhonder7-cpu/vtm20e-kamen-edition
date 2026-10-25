// vtm20.mjs — точка входа системы «Vampire: The Masquerade 20th — Kamen & Shamil Edition».
// Регистрирует модели данных, документы, листы, настройки и обработчики карточек чата.

import { VTM20, SYSTEM_ID, SYSTEM_PATH } from "./module/config.mjs";
import { registerDataModels } from "./module/data/models.mjs";
import { Codex } from "./module/data/codex.mjs";
import { VtMActor } from "./module/documents/actor.mjs";
import { VtMItem } from "./module/documents/item.mjs";
import { VtMActorSheet } from "./module/sheets/actor-sheet.mjs";
import { VtMItemSheet } from "./module/sheets/item-sheet.mjs";
import { RollDialog } from "./module/dice/dialog.mjs";
import { rollPool, evaluate, rollDamage, soakAndApply, onChatCardClick } from "./module/dice/roll.mjs";
import { openDamageDialog } from "./module/apps/damage.mjs";
import { openCreator, VtMCreator } from "./module/apps/creator.mjs";
import { openHunt, nightfall, endScene, endStory, registerNightTools } from "./module/apps/night.mjs";
import { openSceneNexus, refreshSceneNexus, execSceneTeleport, SceneNexus } from "./module/apps/scene-nexus.mjs";
import { NEXUS_SCOPE } from "./module/constants/scene-nexus.mjs";
import {
  NightCalendar, openCalendar, refreshCalendar, startNightClock, announceTime, registerNightExtras, checkDawn,
  getClock, getDate, stamp, clockBarData, nightPhase, moonPhase, republicanDate
} from "./module/apps/calendar.mjs";
import { initTopBar, removeTopBar, refreshTopBar, paintClockBar } from "./module/ui/topbar.mjs";
import { registerHud, renderHud } from "./module/ui/hud.mjs";
import { registerCombatTracker } from "./module/ui/combat-tracker.mjs";
import { openAttack, openDefense, AttackDialog } from "./module/combat/combat.mjs";
import { openHazard } from "./module/apps/hazard.mjs";
import { openDiablerie } from "./module/apps/diablerie.mjs";
import { openLibrary } from "./module/apps/library.mjs";
import { openNpcGenerator } from "./module/apps/npc-gen.mjs";
import { openClans } from "./module/apps/clans.mjs";
import { openBoons } from "./module/apps/boons.mjs";
import { openDowntime } from "./module/apps/downtime.mjs";
import { openSessionXp, registerSessionXp } from "./module/apps/session-xp.mjs";
import { openCourt, registerCourt } from "./module/apps/court.mjs";
import { openWeb, registerWeb } from "./module/apps/web.mjs";
import { registerTimers, tickTimers } from "./module/apps/timers.mjs";
import { registerTorpor, checkTorpor } from "./module/apps/torpor.mjs";
import { registerIncome, checkIncome } from "./module/apps/income.mjs";
import { registerCoterie, openCoterie } from "./module/apps/coterie.mjs";
import { registerChronicle, openChronicle } from "./module/apps/chronicle.mjs";
import { registerExtras } from "./module/apps/extras.mjs";
import { registerMasquerade } from "./module/ui/masquerade.mjs";
import { registerCityMap, openCity, closeCity, toggleCity, cityMap } from "./module/ui/citymap.mjs";
import { registerPause } from "./module/ui/pause.mjs";
import { registerSounds } from "./module/ui/sounds.mjs";
import * as Money from "./module/data/money.mjs";

/* ── init ──────────────────────────────────────────────────────────────── */

Hooks.once("init", () => {
  console.log("VTM20 | Liberté · Égalité · Éternité — инициализация системы V20");

  CONFIG.VTM20 = VTM20;
  game.vtm20 = {
    config: VTM20, codex: Codex,
    rollPool, evaluate, rollDamage, soakAndApply, openDamageDialog, RollDialog, openCreator, VtMCreator,
    openHunt, nightfall, endScene, endStory, openAttack, openDefense, openHazard, openDiablerie, renderHud,
    openLibrary, openNpcGenerator, openClans, openBoons, openDowntime, openSessionXp, openCourt, openWeb, openCoterie, openChronicle, money: Money, openCity, closeCity, toggleCity, cityMap,
    openSceneNexus, openCalendar, announceTime, getClock, getDate, stamp, clockBarData, nightPhase, moonPhase, republicanDate,
    apps: { SceneNexus, NightCalendar }
  };

  CONFIG.Actor.documentClass = VtMActor;
  CONFIG.Item.documentClass = VtMItem;
  registerDataModels();

  CONFIG.Actor.trackableAttributes = {
    vampire: { bar: ["health", "blood", "willpower"], value: ["morality.value", "generation"] },
    ghoul:   { bar: ["health", "blood", "willpower"], value: ["morality.value"] },
    mortal:  { bar: ["health", "willpower"], value: ["morality.value"] },
    creature: { bar: ["health", "blood", "willpower"], value: [] }
  };
  CONFIG.Actor.typeIcons = { vampire: "fa-solid fa-droplet", ghoul: "fa-solid fa-hand-holding-droplet", mortal: "fa-solid fa-user", creature: "fa-solid fa-paw" };
  CONFIG.Item.typeIcons = {
    discipline: "fa-solid fa-eye", thaumPath: "fa-solid fa-book-skull", ritual: "fa-solid fa-pentagram", power: "fa-solid fa-hand-sparkles",
    background: "fa-solid fa-landmark", merit: "fa-solid fa-plus", flaw: "fa-solid fa-minus",
    derangement: "fa-solid fa-brain", weapon: "fa-solid fa-khanda", armor: "fa-solid fa-shield-halved", gear: "fa-solid fa-briefcase"
  };

  // Инициатива V20: 1d10 + Ловкость + Смекалка − штраф за раны (04)
  CONFIG.Combat.initiative = { formula: "1d10 + @initiative", decimals: 0 };

  // Состояния V20 на токенах (04, 05) — впереди стандартных
  const S = id => `VTM20.Status.${id}`;
  CONFIG.statusEffects = [
    { id: "r-stunned", name: S("stunned"), img: "icons/svg/daze.svg" },
    { id: "r-prone", name: S("prone"), img: "icons/svg/falling.svg" },
    { id: "r-held", name: S("held"), img: "icons/svg/net.svg" },
    { id: "r-staked", name: S("staked"), img: "icons/svg/thrust.svg" },
    { id: "r-frenzy", name: S("frenzy"), img: "icons/svg/blood.svg" },
    { id: "r-rotschreck", name: S("rotschreck"), img: "icons/svg/terror.svg" },
    { id: "r-torpor", name: S("torpor"), img: "icons/svg/sleep.svg" },
    ...CONFIG.statusEffects.filter(e => !["stun", "prone", "restrain", "sleep", "fear"].includes(e.id))
  ];

  // Шрифты эпохи: в редакторах и рисунках на сцене
  const F = `${SYSTEM_PATH}/fonts`;
  Object.assign(CONFIG.fontDefinitions, {
    Prata: { editor: true, fonts: [{ urls: [`${F}/Prata-Regular.ttf`] }] },
    Forum: { editor: true, fonts: [{ urls: [`${F}/Forum.ttf`] }] },
    "Old Standard": { editor: true, fonts: [
      { urls: [`${F}/OldStandard-Regular.ttf`] },
      { urls: [`${F}/OldStandard-Italic.ttf`], style: "italic" },
      { urls: [`${F}/OldStandard-Bold.ttf`], weight: 700 }
    ] },
    "IM Fell": { editor: true, fonts: [{ urls: [`${F}/IM_FELL_DW_PICA_RU.woff2`] }] },
    "Marck Script": { editor: true, fonts: [{ urls: [`${F}/MarckScript.woff2`] }] }
  });

  const { Actors, Items } = foundry.documents.collections;
  Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  Actors.registerSheet(SYSTEM_ID, VtMActorSheet, { makeDefault: true, label: "VTM20.Sheets.Actor" });
  Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
  Items.registerSheet(SYSTEM_ID, VtMItemSheet, { makeDefault: true, label: "VTM20.Sheets.Item" });
  registerExtras();

  registerSettings();
  registerNightExtras();
  registerTimers();
  registerTorpor();
  registerIncome();
  registerCoterie();
  registerChronicle();
  registerSessionXp();
  registerCourt();
  registerWeb();
  registerHelpers();
  registerNightTools();
  registerHud();
  registerCombatTracker();
  registerCityMap();
  registerMasquerade();
  registerPause();
  registerSounds();
  foundry.applications.handlebars.loadTemplates({
    rDots: `${SYSTEM_PATH}/templates/actor/parts/dots.hbs`,
    rPower: `${SYSTEM_PATH}/templates/actor/parts/power.hbs`,
    rItemHead: `${SYSTEM_PATH}/templates/item/parts/head.hbs`,
    rItemRoll: `${SYSTEM_PATH}/templates/item/parts/roll.hbs`
  });
  foundry.applications.handlebars.loadTemplates([
    `${SYSTEM_PATH}/templates/apps/nexus.hbs`, `${SYSTEM_PATH}/templates/apps/nexus-card.hbs`,
    `${SYSTEM_PATH}/templates/apps/calendar.hbs`, `${SYSTEM_PATH}/templates/chat/time-card.hbs`
  ]);
});

Hooks.once("setup", () => {
  ensureStyles(["styles/r-foundry.css", "styles/r-hud.css", "styles/r-city.css", "styles/r-pause.css"]);
  document.body.classList.toggle("r-skin", game.settings.get(SYSTEM_ID, "uiSkin"));
  document.body.classList.toggle("r-theme-light", game.settings.get(SYSTEM_ID, "sheetTheme") === "light");
});

// Список игроков: «[Ведущий]» или «[персонаж]» из имени — отдельной подписью, без скобок
Hooks.on("renderPlayers", (app, html) => {
  if (!document.body.classList.contains("r-skin")) return;
  for (const el of html.querySelectorAll(".player-name")) {
    const m = el.textContent.match(/^(.*\S)\s\[(.+)\]$/);
    if (!m) continue;
    const tag = document.createElement("span");
    tag.className = "r-pl-tag";
    tag.textContent = m[2];
    el.textContent = m[1];
    el.append(tag);
  }
});

Hooks.once("ready", async () => {
  await Codex.load();
  // до миграции: она запишет новую версию, а старый мир узнаём по старой
  if (await keepParis()) return;
  await migrateWorld();
  // Нексус вместо ленты сцен и ночные часы (порт из vtm5e-kamen-edition)
  const mountPanels = () => { if (game.settings.get(SYSTEM_ID, "nexusNav")) initTopBar(); };
  mountPanels();
  Hooks.on("canvasReady", mountPanels);
  startNightClock(() => { foundry.applications.instances.get("r-calendar")?._paintClock?.(); paintClockBar(); checkDawn(); tickTimers(); checkTorpor(); checkIncome(); });
});

/* ── Нексус: перенос токенов через флаги User ──────────────────────────── */

Hooks.on("updateUser", async (user, changes) => {
  try { refreshSceneNexus(); } catch (e) {}
  try {
    const req = foundry.utils.getProperty(changes, `flags.${NEXUS_SCOPE}.nexusReq`);
    if (req && game.user === game.users.activeGM) {
      await user.unsetFlag(NEXUS_SCOPE, "nexusReq");
      await execSceneTeleport({ fromSceneId: req.fromSceneId, toSceneId: req.toSceneId, tokenIds: req.tokenIds }, user);
    }
    const goto = foundry.utils.getProperty(changes, `flags.${NEXUS_SCOPE}.nexusGoto`);
    if (goto && user.id === game.user.id) {
      await game.user.unsetFlag(NEXUS_SCOPE, "nexusGoto");
      if (goto.toSceneId) { try { await game.scenes.get(goto.toSceneId)?.view(); } catch (e) {} }
      if (goto.msg) ui.notifications?.[goto.msg.kind === "error" ? "error" : goto.msg.kind === "info" ? "info" : "warn"](goto.msg.text);
    }
  } catch (e) { console.error("VTM20 | Нексус updateUser:", e); }
});
Hooks.on("controlToken", () => refreshSceneNexus());
Hooks.on("updateScene", () => refreshSceneNexus());
Hooks.on("canvasReady", () => refreshSceneNexus());
Hooks.on("renderPlayerList", () => refreshSceneNexus());

/* ── Инструменты сцены: нексус и ночные часы ───────────────────────────── */

Hooks.on("getSceneControlButtons", controls => {
  const isGM = !!game.user?.isGM;
  const tools = {
    "r-nexus": { name: "r-nexus", title: "VTM20.Nexus.Title", icon: "fa-solid fa-diagram-project", order: 1, visible: true, button: true, onChange: () => openSceneNexus() },
    "r-calendar": { name: "r-calendar", title: "VTM20.Calendar.Title", icon: "fa-solid fa-moon", order: 2, visible: isGM, button: true, onChange: () => openCalendar() },
    "r-npc": { name: "r-npc", title: "VTM20.NpcGen.Title", icon: "fa-solid fa-users-viewfinder", order: 3, visible: isGM, button: true, onChange: () => openNpcGenerator() },
    "r-court": { name: "r-court", title: "VTM20.Court.Title", icon: "fa-solid fa-crown", order: 4, visible: true, button: true, onChange: () => openCourt() },
    "r-web": { name: "r-web", title: "VTM20.Web.Title", icon: "fa-solid fa-circle-nodes", order: 5, visible: true, button: true, onChange: () => openWeb() },
    "r-chronicle": { name: "r-chronicle", title: "VTM20.Chronicle.Tool", icon: "fa-solid fa-book-open", order: 7, visible: isGM, button: true, onChange: () => openChronicle() },
    "r-coterie": { name: "r-coterie", title: "VTM20.Coterie.Title", icon: "fa-solid fa-people-roof", order: 5, visible: true, button: true, onChange: () => openCoterie() },
    "r-xp": { name: "r-xp", title: "VTM20.SessionXp.Title", icon: "fa-solid fa-star", order: 6, visible: isGM, button: true, onChange: () => openSessionXp() }
  };
  const group = { name: "vtm20", title: "VTM20.Controls.Title", icon: "fa-solid fa-landmark-flag", order: 99, visible: true, tools, onChange: () => {} };
  if (Array.isArray(controls)) controls.push({ ...group, tools: Object.values(tools).map(t => ({ ...t, onClick: t.onChange, onChange: undefined })) });
  else controls[group.name] = group;
});

/**
 * Разовые миграции данных мира (только рассказчик).
 * 0.2.0 — «клановость» Дисциплин считается по клану на лету: старые автоматические
 * отметки inClan снимаются, иначе после смены клана лишние Дисциплины оставались клановыми.
 */
/**
 * Париж 1789 года (план, места, секции, пятна крови, свеча, влияние, Собрание, катакомбы) с 0.8.0 живёт в модуле
 * vtm20e-kamen-city. В мирах, созданных раньше, всё должно остаться как было: рассказчику модуль включается сам,
 * один раз. Новый мир получает пустой «Город». Нет модуля — предупреждение, данные мира целы и вернутся с модулем.
 * @returns {Promise<boolean>} true — включили модуль и перезагружаем мир
 */
const CITY_MODULE = "vtm20e-kamen-city";
async function keepParis() {
  if (!game.user.isGM) return false;
  let state = game.settings.get(SYSTEM_ID, "cityParis");
  if (!state) {
    const done = game.settings.get(SYSTEM_ID, "migrated") || "0.0.0";
    state = done !== "0.0.0" && foundry.utils.isNewerVersion("0.8.0", done) ? "pending" : "new";
    await game.settings.set(SYSTEM_ID, "cityParis", state);
  }
  if (state !== "pending") return false;
  const mod = game.modules.get(CITY_MODULE);
  if (mod?.active) { await game.settings.set(SYSTEM_ID, "cityParis", "on"); return false; }
  if (!mod) {
    ui.notifications.warn(game.i18n.localize("VTM20.City.ParisMissing"));
    return false;
  }
  const cfg = foundry.utils.deepClone(game.settings.get("core", "moduleConfiguration"));
  cfg[CITY_MODULE] = true;
  await game.settings.set("core", "moduleConfiguration", cfg);
  await game.settings.set(SYSTEM_ID, "cityParis", "on");
  ui.notifications.info(game.i18n.localize("VTM20.City.ParisEnabled"));
  game.socket.emit("reload");
  foundry.utils.debouncedReload();
  return true;
}

async function migrateWorld() {
  if (!game.user.isGM) return;
  const done = game.settings.get(SYSTEM_ID, "migrated") || "0.0.0";
  let changed = false;
  // 0.2.0: «клановость» Дисциплин считается на лету — снять сохранённые флаги
  if (foundry.utils.isNewerVersion("0.2.0", done)) {
    for (const a of game.actors) {
      const upd = a.items.filter(i => i.type === "discipline" && i.system.inClan).map(i => ({ _id: i.id, "system.inClan": false }));
      if (upd.length) { await a.updateEmbeddedDocuments("Item", upd); changed = true; }
    }
  }
  // 0.3.0: Дисциплины, пути и ритуалы — жетон со знаком своей Дисциплины вместо общего значка
  if (foundry.utils.isNewerVersion("0.3.0", done)) {
    const generic = ["discipline", "path", "ritual"].map(n => `${SYSTEM_PATH}/assets/icons/${n}.svg`);
    const iconFor = i => {
      const key = i.type === "discipline" ? i.system.key : ["thaumPath", "ritual"].includes(i.type) ? i.system.discipline : null;
      if (!key || !generic.includes(i.img)) return null;
      const img = Codex.disciplineIcon(key);
      return img === i.img ? null : img;
    };
    for (const a of game.actors) {
      const upd = a.items.map(i => ({ i, img: iconFor(i) })).filter(x => x.img).map(x => ({ _id: x.i.id, img: x.img }));
      if (upd.length) { await a.updateEmbeddedDocuments("Item", upd); changed = true; }
    }
    const world = game.items.map(i => ({ i, img: iconFor(i) })).filter(x => x.img).map(x => ({ _id: x.i.id, img: x.img }));
    if (world.length) { await Item.updateDocuments(world); changed = true; }
    // Компендиумы системы, собранные до жетонов: поправить значки через Foundry
    // (файлы открытого компендиума скрипт сборки не трогает)
    for (const pack of game.packs.filter(p => p.metadata.packageType === "system" && p.metadata.packageName === SYSTEM_ID && p.documentName === "Item")) {
      try {
        const docs = await pack.getDocuments();
        const upd = docs.map(i => ({ i, img: iconFor(i) })).filter(x => x.img).map(x => ({ _id: x.i.id, img: x.img }));
        if (!upd.length) continue;
        const wasLocked = pack.locked;
        if (wasLocked) await pack.configure({ locked: false });
        await Item.updateDocuments(upd, { pack: pack.collection });
        if (wasLocked) await pack.configure({ locked: true });
        changed = true;
      } catch (e) { console.warn(`VTM20 | Не удалось обновить значки в ${pack.collection}`, e); }
    }
  }
  // 0.6.1: вместо картинок из библиотеки Foundry (их ставила 0.6.0) — свои значки системы
  if (foundry.utils.isNewerVersion("0.6.1", done)) {
    const { restoreSystemIcons } = await import("./module/data/icons.mjs");
    if (await restoreSystemIcons()) changed = true;
  }
  if (foundry.utils.isNewerVersion(game.system.version, done) || changed) {
    await game.settings.set(SYSTEM_ID, "migrated", game.system.version);
    console.log("VTM20 | Миграция данных мира до", game.system.version);
  }
}

/* ── Карточки чата ─────────────────────────────────────────────────────── */

Hooks.on("renderChatMessageHTML", (message, html) => {
  // Бросок инициативы трекера — карточкой системы: имя, итог, кость и прибавка (вместо «rolls for initiative!» и формулы)
  if (message.flags?.core?.initiativeRoll && message.rolls?.[0] && message.isContentVisible) {
    const r = message.rolls[0], die = r.dice?.[0]?.results?.[0]?.result ?? "", mod = r.total - (Number(die) || 0);
    const actor = ChatMessage.getSpeakerActor(message.speaker);
    const box = html.querySelector(".message-content");
    if (box) box.innerHTML = `<div class="r-roll-card r-init-card"><header class="r-card-head">${actor?.img ? `<img class="r-card-img" src="${actor.img}" alt="">` : ""}<div class="r-card-titles"><span class="r-card-title">${game.i18n.localize("VTM20.Sheet.Initiative")}</span><span class="r-card-sub">${foundry.utils.escapeHTML(message.speaker.alias ?? actor?.name ?? "")}</span></div><span class="r-card-pool"><b>${r.total}</b></span></header><div class="r-dice-tray"><span class="r-die is-hit"><span>${die}</span></span><span>+ ${mod}</span></div></div>`;
    html.querySelector(".flavor-text")?.remove();
  }
  // Броски, карточки атаки и итога, урон силы без броска, командная работа — у всех есть кнопки
  const f = message.flags?.[SYSTEM_ID] ?? {};
  if (!(f.roll || f.combat || f.combatResult || f.fixedDamage || f.team || f.checkPrompt)) return;
  html.addEventListener("click", onChatCardClick);
});

/* ── Настройки ─────────────────────────────────────────────────────────── */

function registerSettings() {
  game.settings.register(SYSTEM_ID, "era", {
    name: "VTM20.Settings.Era.Name", hint: "VTM20.Settings.Era.Hint",
    scope: "world", config: true, type: String, default: "revolution",
    choices: Object.fromEntries(Object.entries(VTM20.eras).map(([k, v]) => [k, v.label])),
    onChange: () => {
      for (const app of foundry.applications.instances.values()) if (app.document?.documentName === "Actor") app.render();
    }
  });
  // Пути, ритуалы и черты Тёмных веков (era = "darkAges" в data/*.json) — отдельный переключатель, не зависит от эпохи
  game.settings.register(SYSTEM_ID, "darkAgesContent", {
    name: "VTM20.Settings.DarkAges.Name", hint: "VTM20.Settings.DarkAges.Hint",
    scope: "world", config: true, type: Boolean, default: false,
    onChange: () => {
      for (const app of foundry.applications.instances.values()) if (app.rendered) app.render();
    }
  });
  // Деньги: валюта хроники и курс ассигната (% номинала, задаёт рассказчик)
  game.settings.register(SYSTEM_ID, "currency", {
    name: "VTM20.Settings.Currency.Name", hint: "VTM20.Settings.Currency.Hint",
    scope: "world", config: true, type: String, default: "auto",
    choices: { auto: "VTM20.Settings.Currency.auto", ...Object.fromEntries(Object.entries(VTM20.currencies).map(([k, v]) => [k, v.label])) }
  });
  game.settings.register(SYSTEM_ID, "assignatRate", {
    name: "VTM20.Settings.AssignatRate.Name", hint: "VTM20.Settings.AssignatRate.Hint",
    scope: "world", config: true, type: Number, default: 100, range: { min: 1, max: 100, step: 1 }
  });
  game.settings.register(SYSTEM_ID, "migrated", { scope: "world", config: false, type: String, default: "0.0.0" });
  // Париж в модуле (0.8.0): "" — ещё не решено, new — новый мир, pending — старый мир ждёт модуль, on — включён
  game.settings.register(SYSTEM_ID, "cityParis", { scope: "world", config: false, type: String, default: "" });
  // Нексус сцен и ночные часы
  game.settings.register(SYSTEM_ID, "nexusNav", {
    name: "VTM20.Settings.NexusNav.Name", hint: "VTM20.Settings.NexusNav.Hint",
    scope: "client", config: true, type: Boolean, default: true,
    onChange: v => { if (v) initTopBar(); else removeTopBar(); }
  });
  game.settings.register(SYSTEM_ID, "sceneGroups", {
    scope: "world", config: false, type: Array, default: [],
    onChange: () => { try { refreshSceneNexus(); } catch (e) {} }
  });
  for (const [key, def] of [["latitude", 48.86], ["longitude", 2.35], ["utcOffset", 1]]) {
    const K = key[0].toUpperCase() + key.slice(1);
    game.settings.register(SYSTEM_ID, key, {
      name: `VTM20.Settings.${K}.Name`, hint: `VTM20.Settings.${K}.Hint`,
      scope: "world", config: true, type: Number, default: def,
      onChange: () => { refreshCalendar(); refreshTopBar(); }
    });
  }
  game.settings.register(SYSTEM_ID, "clock", { scope: "world", config: false, type: Object, default: {}, onChange: () => { refreshCalendar(); paintClockBar(); } });
  game.settings.register(SYSTEM_ID, "chronicleStart", { scope: "world", config: false, type: Number, default: 0, onChange: () => { refreshCalendar(); refreshTopBar(); } });
  game.settings.register(SYSTEM_ID, "sceneStart", { scope: "world", config: false, type: Number, default: 0, onChange: () => { refreshCalendar(); refreshTopBar(); } });
  game.settings.register(SYSTEM_ID, "nightlyWillpower", {
    name: "VTM20.Settings.NightlyWillpower.Name", hint: "VTM20.Settings.NightlyWillpower.Hint",
    scope: "world", config: true, type: Boolean, default: false
  });
  game.settings.register(SYSTEM_ID, "sheetTheme", {
    name: "VTM20.Settings.SheetTheme.Name", hint: "VTM20.Settings.SheetTheme.Hint",
    scope: "client", config: true, type: String, default: "dark",
    choices: { dark: "VTM20.Settings.SheetTheme.dark", light: "VTM20.Settings.SheetTheme.light" },
    onChange: v => document.body.classList.toggle("r-theme-light", v === "light")
  });
  game.settings.register(SYSTEM_ID, "uiSkin", {
    name: "VTM20.Settings.UiSkin.Name", hint: "VTM20.Settings.UiSkin.Hint",
    scope: "client", config: true, type: Boolean, default: true,
    onChange: v => document.body.classList.toggle("r-skin", !!v)
  });
}

/**
 * Подключить таблицы стилей, которых нет на странице. Новые файлы из system.json Foundry
 * подхватывает только после перезапуска сервера, а код системы — уже после F5.
 */
function ensureStyles(files) {
  for (const f of files) {
    if (document.querySelector(`link[href*="${f}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = foundry.utils.getRoute(`${SYSTEM_PATH}/${f}`);
    document.head.appendChild(link);
  }
}

/** Римские цифры — для поколений, уровней сил и глав листа. */
export function toRoman(n) {
  n = Number(n);
  if (!Number.isInteger(n) || n <= 0) return String(n ?? "");
  const map = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, r] of map) while (n >= v) { out += r; n -= v; }
  return out;
}

/* ── Помощники шаблонов ───────────────────────────────────────────────── */

function registerHelpers() {
  Handlebars.registerHelper("rSigned", n => (Number(n) > 0 ? `+${n}` : Number(n) < 0 ? `−${Math.abs(Number(n))}` : `${n}`));
  Handlebars.registerHelper("rEq", (a, b) => a === b);
  Handlebars.registerHelper("rRoman", n => toRoman(n));
  // Знак (герб, секта, Дисциплина) золотой маской: {{rSym sym "доп-класс"}}
  // Кому видно бросок: ряд значков вместо выпадающего списка; у выбранного — подпись. {{rModes messageModes}}
  Handlebars.registerHelper("rModes", list => {
    const esc = Handlebars.escapeExpression;
    const items = (list ?? []).map(m => {
      const icon = m.value === "ic" ? "fa-solid fa-masks-theater" : CONFIG.ChatMessage?.modes?.[m.value]?.icon ?? "fa-solid fa-comment";
      const key = `VTM20.Mode.${m.value}`, label = game.i18n.has(key) ? game.i18n.localize(key) : m.label;
      return `<label class="r-mode-opt${m.selected ? " is-active" : ""}" data-tooltip="${esc(label)}"><input type="radio" name="messageMode" value="${esc(m.value)}"${m.selected ? " checked" : ""}><i class="${esc(icon)}"></i><span>${esc(label)}</span></label>`;
    }).join("");
    return new Handlebars.SafeString(`<div class="r-mode r-modes" role="radiogroup">${items}</div>`);
  });
  Handlebars.registerHelper("rSym", (sym, cls) => {
    if (!sym?.src) return "";
    const extra = typeof cls === "string" ? ` ${cls}` : "";
    const src = Handlebars.escapeExpression(sym.src);
    return new Handlebars.SafeString(`<span class="r-sym${sym.lum ? " is-lum" : ""}${extra}" style="--sym: url('${src}')" aria-hidden="true"></span>`);
  });
}
