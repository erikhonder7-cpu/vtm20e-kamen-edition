// module/sheets/item-sheet.mjs
// Лист предмета. Ритуал, сила, Дисциплина и путь магии крови — свои окна: сверху то, что нужно в игре
// (уровень, школа, бросок, силы по уровням), поля для правки — в свёрнутом блоке «Настройки».
// Остальные типы (черты, снаряжение, факты биографии) — общее окно с полями и описанием.

import { VTM20, SYSTEM_PATH } from "../config.mjs";
import { Codex } from "../data/codex.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const TEMPLATES = { ritual: "ritual", power: "power", discipline: "discipline", thaumPath: "path" };

export class VtMItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-sheet", "r-item"],
    position: { width: 560, height: 640 },
    window: { resizable: true, contentClasses: ["r-sheet-content"] },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: { toChat: VtMItemSheet.#onToChat, setDots: VtMItemSheet.#onSetDots }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/item/item-sheet.hbs`, scrollable: [".r-item-body"] } };

  /** Свой шаблон для ритуала, силы, Дисциплины и пути; остальное — общий лист. */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    const own = TEMPLATES[this.item.type];
    if (own) parts.body = { ...parts.body, template: `${SYSTEM_PATH}/templates/item/${own}.hbs` };
    return parts;
  }

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    await Codex.load();
    const item = this.item, s = item.system, loc = k => game.i18n.localize(k);
    const opts = (map, cur) => Object.entries(map).map(([k, v]) => ({ value: k, label: loc(v.label ?? v), selected: k === cur }));
    const T = foundry.applications.ux.TextEditor.implementation;
    const enrich = h => T.enrichHTML(h ?? "", { relativeTo: item, secrets: item.isOwner });
    const discKey = s.key ?? s.discipline;
    Object.assign(ctx, {
      item, system: s, source: item._source.system, editable: this.isEditable,
      type: item.type, typeLabel: loc(`TYPES.Item.${item.type}`), kicker: item.kicker,
      is: Object.fromEntries(["discipline", "thaumPath", "ritual", "power", "background", "merit", "flaw", "derangement", "weapon", "armor", "gear"].map(k => [k, item.type === k])),
      hasRoll: ["ritual", "power"].includes(item.type),
      traitGroups: VtMItemSheet.traitGroups(s.roll ?? {}),
      disciplineOptions: [
        ...Object.values(Codex.disciplines).map(d => ({ value: d.key, label: d.name, selected: d.key === discKey })),
        // своя Дисциплина, которой нет в справочнике (Мистицизм Бездны и т. п.)
        ...(discKey && !Codex.disciplines[discKey] ? [{ value: discKey, label: discKey, selected: true }] : [])
      ].sort((a, b) => a.label.localeCompare(b.label, "ru")),
      categoryOptions: opts(VTM20.meritCategories, s.category),
      weaponKindOptions: opts(VTM20.weaponKinds, s.kind),
      damageTypeOptions: opts(VTM20.damageTypes, s.damageType),
      descriptionHTML: await enrich(s.description),
      disciplineName: discKey ? (discKey === "obtenebration" && item.type === "ritual" ? "Мистика Бездны" : Codex.disciplineLabel(discKey)) : "",
      roman: ROMAN[(s.level ?? s.value) - 1] ?? String(s.level ?? s.value ?? ""),
      // книга — из шапки описания справочника («… · Источник: V20 Rites of the Blood»), её в окне прячем
      book: /Источник:\s*([^<·]+)/.exec(s.description ?? "")?.[1]?.trim() ?? "",
      pool: VtMItemSheet.poolLabel(s.roll)
    });

    // Дисциплина и путь: точки и силы по уровням из справочника
    if (item.type === "discipline" || item.type === "thaumPath") {
      const max = item.type === "discipline" ? (s.value > 5 ? 10 : 5) : 5;
      ctx.dots = Array.from({ length: max }, (_, i) => ({ n: i + 1, filled: i < s.value, path: "system.value" }));
      const src = item.type === "discipline" ? Codex.discipline(s.key)?.powers : Codex.bloodPath(s.discipline, item.name)?.powers;
      // на уровне с выбором «изучена» только выбранная сила (system.choices), остальные — как не изученные
      const shown = (src ?? []).filter(p => Codex.visible(p) && (p.level <= Math.max(5, s.value + 1)));
      const many = lv => shown.filter(p => p.level === lv).length > 1;
      const owned = p => p.level <= s.value && (item.type !== "discipline" || !many(p.level) || s.choices?.[p.level] === p.name);
      ctx.powers = await Promise.all(shown
        .map(async p => ({ roman: ROMAN[p.level - 1] ?? p.level, name: p.name, en: p.en, owned: owned(p),
          next: p.level === s.value + 1, pool: VtMItemSheet.poolLabel(p.roll), html: await enrich(p.html) })));
      ctx.rules = item.type === "discipline"
        ? await enrich((Codex.discipline(s.key)?.rules ?? []).find(r => !r.title)?.html ?? "") : "";
    }
    // Сила: комбинированная — требования и опыт из справочника
    if (item.type === "power") {
      const combo = Codex.combos?.find(c => c.name === item.name);
      if (combo) ctx.combo = { requires: combo.requiresText, xp: combo.xp };
    }
    return ctx;
  }

  /** «Интеллект + Оккультизм» по ключам черт пула. */
  static poolLabel(roll) {
    if (!roll?.trait1) return "";
    const loc = k => game.i18n.localize(k);
    const name = key => {
      const [g, k] = String(key).split(".");
      if (g === "attributes") return loc(VTM20.attributes[k]?.label ?? k);
      if (g === "abilities") return loc(VTM20.abilities[k]?.label ?? k);
      if (g === "virtues") return loc(`VTM20.Virtue.${k}`);
      if (g === "willpower") return loc("VTM20.Willpower");
      if (g === "morality") return loc("VTM20.Humanity");
      if (g === "disciplines") return Codex.disciplineLabel(k);
      return key;
    };
    return [roll.trait1, roll.trait2].filter(Boolean).map(name).join(" + ");
  }

  /** Черты для пула силы: характеристики, способности, Добродетели, воля, Дисциплины. */
  static traitGroups(roll) {
    const loc = k => game.i18n.localize(k);
    const groups = [
      { label: loc("VTM20.Sheet.Attributes"), options: Object.entries(VTM20.attributes).map(([k, a]) => [`attributes.${k}`, loc(a.label)]) },
      { label: loc("VTM20.Sheet.Abilities"), options: Object.entries(VTM20.abilities).map(([k, a]) => [`abilities.${k}`, loc(a.label)]) },
      { label: loc("VTM20.Sheet.Virtues"), options: [["virtues.conscience", loc("VTM20.Virtue.conscience")], ["virtues.selfControl", loc("VTM20.Virtue.selfControl")], ["virtues.courage", loc("VTM20.Virtue.courage")]] },
      { label: loc("VTM20.Sheet.Other"), options: [["willpower.permanent", loc("VTM20.Willpower")], ["morality.value", loc("VTM20.Humanity")]] },
      { label: loc("VTM20.Sheet.Disciplines"), options: Object.values(Codex.disciplines).map(d => [`disciplines.${d.key}`, d.name]) }
    ];
    const mark = cur => groups.map(g => ({ label: g.label, options: g.options.map(([value, label]) => ({ value, label, selected: value === cur })) }));
    return { t1: mark(roll.trait1), t2: mark(roll.trait2) };
  }

  static #onToChat() { return this.item.toChat(); }

  /** Точки Дисциплины или пути: щелчок по последней закрашенной снимает её. */
  static #onSetDots(event, target) {
    if (!this.isEditable) return;
    const n = Number(target.dataset.n), cur = this.item.system.value;
    return this.item.update({ "system.value": n === cur ? n - 1 : n });
  }
}
