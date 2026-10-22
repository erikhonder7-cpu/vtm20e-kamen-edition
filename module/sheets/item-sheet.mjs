// module/sheets/item-sheet.mjs
// Лист предмета: шапка с картинкой, поля по типу и описание.

import { VTM20, SYSTEM_PATH } from "../config.mjs";
import { Codex } from "../data/codex.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class VtMItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-sheet", "r-item"],
    position: { width: 560, height: 600 },
    window: { resizable: true, contentClasses: ["r-sheet-content"] },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: { toChat: VtMItemSheet.#onToChat }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/item/item-sheet.hbs`, scrollable: [".r-item-body"] } };

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    await Codex.load();
    const item = this.item, s = item.system, loc = k => game.i18n.localize(k);
    const opts = (map, cur) => Object.entries(map).map(([k, v]) => ({ value: k, label: loc(v.label ?? v), selected: k === cur }));
    const T = foundry.applications.ux.TextEditor.implementation;
    Object.assign(ctx, {
      item, system: s, source: item._source.system, editable: this.isEditable,
      type: item.type, typeLabel: loc(`TYPES.Item.${item.type}`), kicker: item.kicker,
      is: Object.fromEntries(["discipline", "thaumPath", "ritual", "power", "background", "merit", "flaw", "derangement", "weapon", "armor", "gear"].map(k => [k, item.type === k])),
      hasRoll: ["ritual", "power"].includes(item.type),
      traitGroups: VtMItemSheet.traitGroups(s.roll ?? {}),
      disciplineOptions: [
        ...Object.values(Codex.disciplines).map(d => ({ value: d.key, label: d.name, selected: d.key === (s.key ?? s.discipline) })),
        // своя Дисциплина, которой нет в справочнике (Мистицизм Бездны и т. п.)
        ...((s.key ?? s.discipline) && !Codex.disciplines[s.key ?? s.discipline] ? [{ value: s.key ?? s.discipline, label: s.key ?? s.discipline, selected: true }] : [])
      ].sort((a, b) => a.label.localeCompare(b.label, "ru")),
      categoryOptions: opts(VTM20.meritCategories, s.category),
      weaponKindOptions: opts(VTM20.weaponKinds, s.kind),
      damageTypeOptions: opts(VTM20.damageTypes, s.damageType),
      descriptionHTML: await T.enrichHTML(s.description ?? "", { relativeTo: item, secrets: item.isOwner })
    });
    return ctx;
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
}
