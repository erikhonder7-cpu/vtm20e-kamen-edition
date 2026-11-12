// module/sheets/spirit-sheet.mjs
// Лист духа Умбры (W20, гл. 11; W20 Umbra, гл. 4) — на каркасе листа персонажа (рейка, шапка, полоса действий, шкалы,
// вкладки), но без Атрибутов, Способностей, здоровья и крови: у духа их нет. Черты — Воля, Ярость, Гнозис (1–10, точками),
// Эссенция — и «здоровье», и запас для Чар (любой неотражённый урон снимает её, documents/actor.mjs → applyDamage);
// Ранг — на печати портрета; вид, выводок, Запрет — сведениями. Бой: атака и уклонение — Волей, урон — Яростью,
// поглощение — Волей. Существо с отметкой «Дух» открывается этим листом (flags.core.sheetClass), сняли — листом существа.
// Тема «Пенумбра» (styles/types/spirit.css, ui/themes.mjs → themeOf).

import { SYSTEM_ID, SYSTEM_PATH } from "../config.mjs";
import { RollDialog } from "../dice/dialog.mjs";
import { VtMActorSheet } from "./actor-sheet.mjs";
import { wwGlyph, wwGlyphSrc } from "../apps/werewolf.mjs";
import { charmCost } from "../apps/werewolf/spirits.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Werewolf.${k}`, d) : game.i18n.localize(`VTM20.Werewolf.${k}`);
const SPIRIT_SHEET = `${SYSTEM_ID}.SpiritSheet`;

/** Цена Чары подписью: «3», «1 за ход». */
const costLabel = c => { const x = charmCost(c); return x ? `${x.n}${x.per ? ` ${x.per}` : ""}` : ""; };

/** Броски боя духа (W20, гл. 11): что бросаем и чем. */
const FIGHT = [
  { key: "attack", trait: "spirit.willpower", icon: "fa-hand-fist" },
  { key: "damage", trait: "spirit.rage", icon: "fa-burst" },
  { key: "dodge", trait: "spirit.willpower", icon: "fa-person-running" },
  { key: "soak", trait: "spirit.willpower", icon: "fa-shield-halved" }
];

export class SpiritSheet extends VtMActorSheet {
  static DEFAULT_OPTIONS = {
    classes: ["r-spirit-sheet"],
    actions: { spRoll: SpiritSheet.#onRoll, spEssenceStep: SpiritSheet.#onEssenceStep, spCharmOpen: SpiritSheet.#onCharmOpen }
  };

  static PARTS = {
    tabs: { template: `${SYSTEM_PATH}/templates/actor/tabs.hbs` },
    header: { template: `${SYSTEM_PATH}/templates/actor/spirit-header.hbs` },
    vitals: { template: `${SYSTEM_PATH}/templates/actor/spirit-vitals.hbs` },
    traits: { template: `${SYSTEM_PATH}/templates/actor/spirit-traits.hbs`, scrollable: [""] },
    bio: { template: `${SYSTEM_PATH}/templates/actor/bio.hbs`, scrollable: [""] },
    foot: { template: `${SYSTEM_PATH}/templates/actor/foot.hbs` }
  };

  static TABS = {
    primary: {
      tabs: [{ id: "traits", icon: "fa-solid fa-wind", label: "VTM20.Werewolf.Spirit.charms" }, { id: "bio", icon: "fa-solid fa-book-open" }],
      initial: "traits",
      labelPrefix: "VTM20.Tabs"
    }
  };

  get title() { return `${t("Spirit.title")}: ${this.actor.name}`; }

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options), s = this.actor.system;
    const info = ctx.spiritInfo;
    return Object.assign(ctx, {
      // на рейке — знак духа, а не знак существа
      sigil: { ...ctx.sigil, sym: { src: wwGlyphSrc("glyph-spirit") }, label: s.kind || t("Spirit.title"), clan: false },
      spiritGlyph: wwGlyph("glyph-spirit"), spiritGlyphMark: wwGlyph("glyph-spirit", "r-head-watermark"),
      spiritRank: info?.ranks.find(r => r.selected)?.label ?? "",
      spiritFight: FIGHT.map(f => ({ ...f, label: t(`Spirit.fight.${f.key}`), trait: this.actor.traitLabel(f.trait), n: foundry.utils.getProperty(s, f.trait) ?? 0 })),
      spiritCharms: (info?.charms ?? []).map(c => ({ ...c, open: this._open.has(`charm:${c.key}`) })),
      // свои Чары — карточками, общие — строкой; цена в Сущности — из текста Чары
      spiritOwn: (info?.charms ?? []).filter(c => !c.general).map(c => ({ ...c, special: String(c.key).startsWith("~"), cost: costLabel(c), open: this._open.has(`charm:${c.key}`) })),
      spiritGeneral: (info?.charms ?? []).filter(c => c.general).map(c => ({ ...c, cost: costLabel(c), plain: String(c.text ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300) })),
      spiritTpls: info?.tpls ?? [],
      essenceLow: info ? info.essence <= Math.ceil(info.essenceMax / 4) : false
    });
  }

  static #onRoll(event, target) {
    const f = FIGHT.find(x => x.key === target.dataset.key);
    if (f) return RollDialog.prompt(this.actor, { title: t(`Spirit.fight.${f.key}`), trait1: f.trait, difficulty: 6 });
  }
  /** Эссенция ±1: трата на Чары, Дремота. */
  static #onEssenceStep(event, target) {
    const e = this.actor.system.spirit.essence, d = Number(target.dataset.d) || 0;
    return this.actor.update({ "system.spirit.essence.value": Math.clamp(e.value + d, 0, e.max) });
  }
  static #onCharmOpen(event, target) {
    const k = `charm:${target.dataset.key}`;
    if (this._open.has(k)) this._open.delete(k); else this._open.add(k);
    this.render({ parts: ["traits"] });
  }
}

/**
 * Регистрация листа и переключение: отметка «Дух» у существа — лист духа, снята — лист существа.
 * Старые духи (до этого листа) переводятся на него при запуске мира.
 */
export function registerSpiritSheet() {
  // Foundry V13+: коллекция Actors доступна только через namespaced API.
  foundry.documents.collections.Actors.registerSheet(SYSTEM_ID, SpiritSheet, { makeDefault: false, label: "VTM20.Sheets.Spirit", types: ["creature"] });
  // свой тип «Дух» — этим листом по умолчанию
  foundry.documents.collections.Actors.registerSheet(SYSTEM_ID, SpiritSheet, { makeDefault: true, label: "VTM20.Sheets.Spirit", types: ["spirit"] });
  const want = a => a.type === "creature" && a.system.spirit?.on;
  Hooks.on("preCreateActor", a => { if (want(a) && !a.getFlag("core", "sheetClass")) a.updateSource({ "flags.core.sheetClass": SPIRIT_SHEET }); });
  Hooks.on("updateActor", (a, diff, opts, userId) => {
    if (userId !== game.user.id || a.type !== "creature" || foundry.utils.getProperty(diff, "system.spirit.on") === undefined) return;
    const cls = a.getFlag("core", "sheetClass") ?? "";
    if (want(a) && cls !== SPIRIT_SHEET) a.setFlag("core", "sheetClass", SPIRIT_SHEET);
    else if (!want(a) && cls === SPIRIT_SHEET) a.setFlag("core", "sheetClass", "");
  });
  Hooks.once("ready", async () => {
    if (!game.users.activeGM?.isSelf) return;
    for (const a of game.actors.filter(x => want(x) && !x.getFlag("core", "sheetClass"))) await a.setFlag("core", "sheetClass", SPIRIT_SHEET);
  });
}
