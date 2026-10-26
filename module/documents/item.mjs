// module/documents/item.mjs
// Предмет V20: карточка в чат.

import { VTM20, SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { itemCardHTML } from "../chat/item-card.mjs";
import { ritualHTML } from "../data/ritual-text.mjs";

export class VtMItem extends Item {

  async _preCreate(data, options, user) {
    if ((await super._preCreate(data, options, user)) === false) return false;
    // Дисциплины, пути и ритуалы — жетон со знаком своей Дисциплины (и вместо общего значка)
    const discKey = this.type === "discipline" ? this.system.key : ["thaumPath", "ritual"].includes(this.type) ? this.system.discipline : null;
    const generic = [`systems/${SYSTEM_ID}/assets/icons/discipline.svg`, `systems/${SYSTEM_ID}/assets/icons/path.svg`, `systems/${SYSTEM_ID}/assets/icons/ritual.svg`];
    if (discKey && (!data.img || data.img === Item.DEFAULT_ICON || generic.includes(data.img))) {
      this.updateSource({ img: Codex.disciplineIcon(discKey) });
    } else if (!data.img || data.img === Item.DEFAULT_ICON) {
      this.updateSource({ img: `systems/${SYSTEM_ID}/assets/icons/${this.type === "flaw" ? "flaw" : this.type}.svg` });
    }
  }

  /** Недостатки «Четырнадцатое/Пятнадцатое поколение» сразу выставляют поколение персонажа (V20, Appendix). */
  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if (userId !== game.user.id || this.type !== "flaw" || !this.actor?.isVampire) return;
    const gen = { "Четырнадцатое поколение": 14, "Пятнадцатое поколение": 15 }[this.name];
    if (gen && this.actor.system.generation < gen) this.actor.update({ "system.generation": gen });
  }

  /**
   * Пути магии крови (V20, гл. 4; Колдовство — гл. 10): основной путь растёт вместе с Дисциплиной (до 5);
   * вторичный всегда ниже основного и достигает 5 лишь после основного. Тауматургическая защита основной не бывает.
   */
  async _preUpdate(changes, options, user) {
    if ((await super._preUpdate(changes, options, user)) === false) return false;
    if (this.type !== "thaumPath" || !this.actor) return;
    const primary = foundry.utils.getProperty(changes, "system.primary") ?? this.system.primary;
    if (primary && /Тауматургическая Защита|Countermagic/i.test(this.name)) {
      foundry.utils.setProperty(changes, "system.primary", false);
      ui.notifications.warn(game.i18n.localize("VTM20.Magic.CounterNotPrimary"));
      return;
    }
    const v = foundry.utils.getProperty(changes, "system.value");
    if (v == null || primary) return;
    const main = this.#primaryOf(this.system.discipline);
    if (!main) return;
    const cap = main.system.value >= 5 ? 5 : Math.max(0, main.system.value - 1);
    if (v > cap) {
      foundry.utils.setProperty(changes, "system.value", cap);
      ui.notifications.warn(game.i18n.format("VTM20.Magic.SecondaryCap", { name: this.name, main: main.name, n: cap }));
    }
  }

  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);
    if (game.user.id !== userId || !this.actor) return;
    const pathed = VTM20.pathDisciplines;
    // Дисциплина выросла — основной путь за ней (до 5)
    if (this.type === "discipline" && pathed.includes(this.system.key) && foundry.utils.hasProperty(changed, "system.value")) {
      const main = this.#primaryOf(this.system.key), want = Math.min(5, this.system.value);
      if (main && main.system.value !== want) main.update({ "system.value": want });
    }
    if (this.type !== "thaumPath") return;
    // основной путь у Дисциплины один
    if (changed.system?.primary === true) {
      for (const o of this.actor.items.filter(i => i.type === "thaumPath" && i.id !== this.id && i.system.discipline === this.system.discipline && i.system.primary))
        o.update({ "system.primary": false });
    }
    // основной путь подняли сами — Дисциплина за ним (пока путь не достиг 5)
    if (this.system.primary && foundry.utils.hasProperty(changed, "system.value")) {
      const disc = this.actor.items.find(i => i.type === "discipline" && i.system.key === this.system.discipline);
      if (disc && this.system.value < 5 && disc.system.value !== this.system.value) disc.update({ "system.value": this.system.value });
    }
  }

  #primaryOf(key) {
    return this.actor?.items.find(i => i.type === "thaumPath" && i.id !== this.id && i.system.discipline === key && i.system.primary) ?? null;
  }

  /** Подзаголовок карточки: уровень, цена, тип урона. */
  get kicker() {
    const s = this.system, loc = k => game.i18n.localize(k);
    const typeL = loc(`TYPES.Item.${this.type}`);
    switch (this.type) {
      case "discipline": case "lore": return `${typeL} · ${s.value}`;
      case "thaumPath": return `${Codex.disciplineLabel(s.discipline)} · ${s.value}`;
      case "ritual": return `${Codex.disciplineLabel(s.discipline)} · ${s.level}`;
      case "power": return [s.path || (s.discipline && Codex.disciplineLabel(s.discipline)), s.level].filter(Boolean).join(" · ") || typeL;
      case "background": return `${typeL} · ${s.value}`;
      case "merit": case "flaw": return `${typeL} · ${s.cost}`;
      case "weapon": return `${loc(VTM20.weaponKinds[s.kind]?.label ?? "")} · ${s.strength ? loc("VTM20.Attr.strength") + " + " : ""}${s.damage} ${loc(VTM20.damageTypes[s.damageType]?.short ?? "")}`;
      case "armor": return `${typeL} · ${s.rating} / −${s.penalty}`;
      case "demonRitual": return [Codex.lore(s.primary?.key)?.name, s.primary?.level ? "•".repeat(s.primary.level) : ""].filter(Boolean).join(" ") || typeL;
      case "relic": return `${typeL} · ${loc(`VTM20.Relic.Kind.${s.kind}`)}`;
      default: return typeL;
    }
  }

  async toChat() {
    const T = foundry.applications.ux.TextEditor.implementation;
    const body = await T.enrichHTML(this.type === "ritual" ? ritualHTML(this.system) : this.system.description ?? "", { relativeTo: this });
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: await itemCardHTML({ kind: this.type, img: this.img, kicker: game.i18n.localize(`TYPES.Item.${this.type}`), name: this.name, facts: this.chatFacts, body })
    });
  }

  /** Строка фактов для карточки в чате: то, что нужно за столом с одного взгляда. */
  get chatFacts() {
    const s = this.system, loc = k => game.i18n.localize(k), L = k => loc(`VTM20.${k}`);
    const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
    const pool = r => r?.trait1 ? [r.trait1, r.trait2].filter(Boolean).map(p => this.actor?.traitLabel?.(p) ?? p).join(" + ") : "";
    switch (this.type) {
      case "discipline": return [{ label: L("Item.value"), value: "●".repeat(s.value) || "0" }];
      case "thaumPath": return [{ label: Codex.disciplineLabel(s.discipline), value: "●".repeat(s.value) || "0" }];
      case "ritual": case "power": return [
        { label: L("Item.level"), value: ROMAN[s.level - 1] ?? s.level },
        s.discipline && { label: this.type === "ritual" ? L("ItemSheet.School") : L("Item.discipline"), value: s.path || Codex.disciplineLabel(s.discipline) },
        { label: L("ItemSheet.Roll"), value: pool(s.roll) },
        s.roll?.difficulty && { label: L("Roll.Difficulty"), value: s.roll.difficulty },
        s.roll?.blood && { label: L("ItemSheet.Cost"), value: `${s.roll.blood} <i class="fa-solid fa-droplet"></i>`, hot: true }];
      case "weapon": return [
        { label: L("Weapon.damage"), value: `${s.strength ? L("Attr.strength") + " + " : ""}${s.damage} ${loc(VTM20.damageTypes[s.damageType]?.short ?? "")}`, hot: true },
        { label: L("Weapon.diff"), value: s.difficulty },
        s.range && { label: L("Weapon.range"), value: s.range },
        s.clip && { label: L("Weapon.clip"), value: s.clip }];
      case "armor": return [{ label: L("Armor.rating"), value: s.rating }, s.penalty && { label: L("Armor.penalty"), value: `−${s.penalty}`, hot: true }];
      case "merit": case "flaw": return [{ label: L("Item.cost"), value: s.cost, hot: this.type === "flaw" },
        { label: L("Item.category"), value: loc(VTM20.meritCategories[s.category]?.label ?? "") }];
      case "background": return [{ label: L("Item.value"), value: "●".repeat(s.value) || "0" }];
      case "derangement": return s.permanent ? [{ label: L("Sheet.Permanent"), value: "✓", hot: true }] : [];
      case "gear": return [{ label: L("Item.quantity"), value: s.quantity }];
      default: return [];
    }
  }
}
