// module/ui/themes.mjs
// Цветовая тема окна — по типу персонажа (просьба 26.10: дальше будут оборотни, маги, феи).
// Любое окно системы (класс vtm20), открытое для персонажа — лист, бросок, опыт, охота, лист его предмета, —
// получает класс r-type-<тип>; подтверждения без персонажа (DialogV2) — тип того, в чьём окне только что щёлкнули.
// Палитра типа — в styles/types/<тип>.css (переменные --r-* и немногие точечные правила); вампир — основа, без файла.
// Карточки чата берут тип из своего шаблона (r-type-{{actorType}}), см. dice/roll.mjs и chat/item-card.mjs.

let recent = { type: null, at: 0 };

/* Знак линейки на карточке чата (клан, племя, фракция) и свой блок карточки броска — регистрируют модули линеек:
   themes.mjs их не импортирует, чтобы не завязывать броски на окна линеек. */
const EMBLEMS = {}, CARD_BLOCKS = {};
/** fn(actor) → { src, lum? } | null */
export const registerEmblem = (type, fn) => { EMBLEMS[type] = fn; };
/** fn(state, ev, actor) → данные блока для templates/chat/roll-card.hbs (ключ — имя в state.extra) */
export const registerCardBlock = (key, fn) => { CARD_BLOCKS[key] = fn; };
export function lineEmblem(actor) {
  try {
    if (!actor) return null;
    if (EMBLEMS[actor.type]) return EMBLEMS[actor.type](actor) ?? null;
    // Сородич — герб клана, гуль — клана домитора
    const C = globalThis.game?.vtm20Codex, clan = actor.type === "vampire" ? actor.system.clan : actor.type === "ghoul" ? actor.system.domitorClan : "";
    if (clan && C?.clanSymbol?.(clan)) return C.clanSymbol(clan);
    // прочим — печать вида (падший, охотник, смертный, гуль)
    const V = globalThis.CONFIG?.VTM20 ?? globalThis.game?.vtm20?.config;
    return V?.typeSigil ? { src: foundry.utils.getRoute(V.typeSigil(actor.type)) } : null;
  } catch { return null; }
}
/** Маг Технократического Союза: свои термины и холодная гамма (styles/types/mage.css, .r-mage-tech). */
/** Подменыш Dark Ages: Fae — своя гамма «Вайда и серебро» (styles/types/changeling.css, .r-cl-dark). */
export const isDarkFae = actor => actor?.type === "changeling" && actor.system?.changeling?.variant === "daf";
export const isTechnocrat = actor => actor?.type === "mage"
  && (globalThis.game?.vtm20Codex?.mage?.factions ?? []).find(f => f.key === actor.system?.mage?.faction)?.group === "technocracy";
/** Нефанд — маг секты Падших: гамма Бездны (styles/types/mage.css, .r-mage-fallen). */
export const isNephandus = actor => actor?.type === "mage"
  && (globalThis.game?.vtm20Codex?.mage?.factions ?? []).find(f => f.key === actor.system?.mage?.faction)?.group === "nephandi";
export function cardBlocks(state, ev, actor) {
  const out = {};
  for (const [k, fn] of Object.entries(CARD_BLOCKS)) if (state.extra?.[k]) { try { out[k] = fn(state, ev, actor); } catch (e) { console.error(e); } }
  // общий вид блока (чипы и строка итога) — у оборотня, охотника…; у мага свой шаблон (mage, backlash)
  out.any = Object.entries(out).find(([k, b]) => !["mage", "backlash"].includes(k) && (b?.chips?.length || b?.text))?.[1] ?? null;
  return out;
}
const FRESH_MS = 3000;

/** Предметы линии без владельца (лист из компендиума) — тема их линии. */
const ITEM_THEMES = { lore: "demon", lorePower: "demon", demonRitual: "demon", relic: "demon" };

/** Персонаж окна: свой, документ-персонаж или владелец предмета. */
function actorOf(app) {
  if (app.actor instanceof Actor) return app.actor;
  const doc = app.document;
  if (doc instanceof Actor) return doc;
  if (doc?.parent instanceof Actor) return doc.parent;
  return null;
}

/** Тема персонажа: тип актёра, у духа Умбры (существо с отметкой «Дух») — своя палитра «Пенумбра» (styles/types/spirit.css). */
export const themeOf = actor => !actor?.type ? null : actor.type === "spirit" || (actor.type === "creature" && actor.system?.spirit?.on) ? "spirit"
  : actor.type === "coterie" && actor.system?.kind === "cabal" ? "mage"   // кабал магов — в гамме магов
  : actor.type === "coterie" && actor.system?.kind === "circle" ? "wraith"   // Круг призраков — в «Пепле и Плёнке»
  : actor.type === "coterie" && actor.system?.kind === "motley" ? "changeling"   // мотли подменышей — в гамме Грёзы
  : actor.type === "coterie" && actor.system?.kind === "pack" ? "werewolf"   // стая Гару — в «лунном лесе»
  : actor.type === "coterie" && actor.system?.kind === "cell" ? "hunter" : actor.type;   // ячейка охотников — в гамме охотников

/** Класс темы для своих HTML-кусков (карточки, уведомления). */
export const themeClass = actor => actor?.type ? `r-type-${themeOf(actor)}${isTechnocrat(actor) ? " r-mage-tech" : ""}${isNephandus(actor) ? " r-mage-fallen" : ""}${isDarkFae(actor) ? " r-cl-dark" : ""}` : "";

const quiet = new WeakMap();
export function registerThemes() {
  Hooks.on("renderApplicationV2", (app, element, context, options) => {
    // перерисовка открытого окна: анимации раскрытия строк не проигрываются заново (styles/r-core.css, .r-quiet)
    if (element?.classList?.contains("vtm20") && options && !options.isFirstRender) {
      element.classList.add("r-quiet");
      clearTimeout(quiet.get(element));
      quiet.set(element, setTimeout(() => element.classList.remove("r-quiet"), 260));
    }
    // окна системы и стандартные подтверждения Foundry (их цвета — переменные Foundry, переопределены в теме типа)
    const isDialog = app instanceof foundry.applications.api.DialogV2;
    if (!element?.classList?.contains("vtm20") && !isDialog) return;
    const type = themeOf(actorOf(app)) ?? ITEM_THEMES[app.document?.type] ?? (Date.now() - recent.at < FRESH_MS && isDialog ? recent.type : null);
    if (!type) return;                                   // окно без персонажа — его тема задана им самим (справочник Домов)
    for (const c of [...element.classList]) if (c.startsWith("r-type-") && c !== `r-type-${type}`) element.classList.remove(c);
    element.classList.add(`r-type-${type}`);
    // Привязанный к Земле — своя, огненная палитра поверх темы падшего
    const owner = actorOf(app);
    element.classList.toggle("r-mage-tech", "mageTech" in app ? !!app.mageTech : isTechnocrat(owner));   // мастер создания решает сам
    element.classList.toggle("r-mage-fallen", "mageFallen" in app ? !!app.mageFallen : isNephandus(owner));
    element.classList.toggle("r-cl-dark", "isDafCr" in app ? !!app.isDafCr : isDarkFae(owner));   // мастер Тёмных веков — тоже в «Вайде и серебре»
    if (owner) element.classList.toggle("r-earthbound", "isEarthbound" in app ? !!app.isEarthbound : !!owner.system?.earthbound);   // мастер решает сам
    // щелчок в окне персонажа — его тему получит и подтверждение, которое откроется следом
    if (!element.dataset.rTheme) {
      element.dataset.rTheme = "1";
      element.addEventListener("pointerdown", () => { const a = actorOf(app); if (a) recent = { type: themeOf(a), at: Date.now() }; }, true);
    }
  });
}
