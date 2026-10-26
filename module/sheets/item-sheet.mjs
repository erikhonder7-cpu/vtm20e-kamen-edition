// module/sheets/item-sheet.mjs
// Лист предмета. У каждого типа своё окно: сверху то, что нужно в игре (уровень, школа, бросок, силы по уровням;
// урон и атака у оружия; класс брони; цена-печать и механика черты; точки факта биографии), поля для правки —
// в свёрнутом блоке «Настройки». Общий шаблон item-sheet.hbs — запасной для неизвестных типов.

import { VTM20, SYSTEM_PATH } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { describeMeritMod } from "../data/merit-mods.mjs";
import { openAttack } from "../combat/combat.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
const TEMPLATES = { ritual: "ritual", power: "power", discipline: "discipline", thaumPath: "path", lore: "lore", lorePower: "lore-power",
  weapon: "weapon", armor: "armor", gear: "gear", merit: "trait", flaw: "trait", background: "background", derangement: "derangement",
  demonRitual: "demon-ritual", relic: "relic" };
const RELIC_KINDS = ["enhanced", "enchanted", "demonic", "ancient", "unique"];

export class VtMItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-sheet", "r-item"],
    // высота по содержимому: короткие предметы без пустого поля внизу; длинные упираются в max-height (r-sheet.css)
    position: { width: 560, height: "auto" },
    window: { resizable: true, contentClasses: ["r-sheet-content"] },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: { toChat: VtMItemSheet.#onToChat, setDots: VtMItemSheet.#onSetDots, attack: VtMItemSheet.#onAttack,
      toggleField: VtMItemSheet.#onToggleField, qty: VtMItemSheet.#onQty }
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
      hasRoll: ["ritual", "power", "lorePower"].includes(item.type),
      traitGroups: VtMItemSheet.traitGroups(s.roll ?? {}),
      disciplineOptions: [
        ...Object.values(Codex.disciplines).filter(d => Codex.visible(d) || d.key === discKey).map(d => ({ value: d.key, label: d.name, selected: d.key === discKey })),
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
      const owned = p => p.anyLevel ? Object.values(s.choices ?? {}).includes(p.name)       // «любой из 6–9»: выбрана на каком-то уровне
        : p.level <= s.value && (item.type !== "discipline" || !many(p.level) || s.choices?.[p.level] === p.name);
      ctx.powers = await Promise.all(shown
        .map(async p => ({ roman: p.anyLevel ? "VI–IX" : ROMAN[p.level - 1] ?? p.level, name: p.name, en: p.en, owned: owned(p),
          next: p.level === s.value + 1, pool: VtMItemSheet.poolLabel(p.roll), html: await enrich(p.html) })));
      ctx.rules = item.type === "discipline"
        ? await enrich((Codex.discipline(s.key)?.rules ?? []).find(r => !r.title)?.html ?? "") : "";
    }
    // Знание демона: точки и призывы по кругам из справочника, черты формы Облика
    if (item.type === "lore") {
      const lore = Codex.lore(s.key);
      ctx.dots = Array.from({ length: 5 }, (_, i) => ({ n: i + 1, filled: i < s.value, path: "system.value" }));
      ctx.powers = await Promise.all((lore?.powers ?? []).map(async p => ({ roman: ROMAN[p.level - 1], name: p.name, owned: p.level <= s.value,
        next: p.level === s.value + 1, pool: VtMItemSheet.poolLabel(p.roll), html: await enrich(p.html) })));
      ctx.loreOptions = Codex.lores.map(l => ({ value: l.key, label: l.name, selected: l.key === s.key }));
      ctx.loreHouse = lore?.house ? Codex.house(lore.house)?.name : game.i18n.localize("VTM20.Demon.Common");
      ctx.form = lore?.form ?? null;
    }
    // Ритуал и реликвия падших: Знания, Дом, слоты «Настроек» (вторичные Знания, Знания мастера)
    if (item.type === "demonRitual" || item.type === "relic") {
      const loreName = k => Codex.lore(k)?.name ?? k;
      const loreOpts = cur => Codex.lores.map(l => ({ value: l.key, label: l.name, selected: l.key === cur }));
      const houses = [...Codex.houses.map(h => [h.key, h.name]), ["bastion", loc("VTM20.DRitual.Bastion")], ["earthbound", loc("VTM20.DRitual.Earthbound")]];
      ctx.houseOptions = [{ value: "", label: "—", selected: !s.house }, ...houses.map(([value, label]) => ({ value, label, selected: value === s.house }))];
      ctx.houseName = houses.find(([k]) => k === s.house)?.[1] ?? "";
      ctx.book = [s.source, s.page ? `с. ${s.page}` : ""].filter(Boolean).join(", ");
      if (item.type === "demonRitual") {
        ctx.primaryName = s.primary?.key ? loreName(s.primary.key) : "—";
        ctx.primaryDots = "•".repeat(s.primary?.level ?? 0);
        ctx.primaryOptions = loreOpts(s.primary?.key);
        ctx.secondary = (s.secondary ?? []).filter(x => x.key).map(x => ({ name: loreName(x.key), dots: "•".repeat(x.level) }));
        ctx.secondarySlots = [0, 1, 2, 3].map(i => ({ i, n: i + 1, level: s.secondary?.[i]?.level ?? 1, options: loreOpts(s.secondary?.[i]?.key) }));
        ctx.loreChips = [s.primary?.key && { name: loreName(s.primary.key), dots: "•".repeat(s.primary.level), primary: true },
          ...(s.secondary ?? []).filter(x => x.key).map(x => ({ name: loreName(x.key), dots: "•".repeat(x.level) }))].filter(Boolean);
        ctx.totalDots = (s.primary?.key ? s.primary.level : 0) + (s.secondary ?? []).reduce((n, x) => n + (x.key ? x.level : 0), 0);
        ctx.traitGroups = VtMItemSheet.traitGroups(s.roll ?? {});
      } else {
        ctx.kindLabel = loc(`VTM20.Relic.Kind.${s.kind}`);
        ctx.kindOptions = RELIC_KINDS.map(k => ({ value: k, label: loc(`VTM20.Relic.Kind.${k}`), selected: k === s.kind }));
        ctx.loreNames = (s.lores ?? []).filter(Boolean).map(loreName).join(", ");
        ctx.loreChips = (s.lores ?? []).filter(Boolean).map(loreName);
        ctx.loreSlots = [0, 1, 2].map(i => ({ i, n: i + 1, options: loreOpts(s.lores?.[i]) }));
      }
    }
    // Оружие: вид, урон словами, атака с листа владельца
    if (item.type === "weapon") {
      const kind = VTM20.weaponKinds[s.kind] ?? VTM20.weaponKinds.melee;
      ctx.kindLabel = loc(kind.label);
      ctx.damageText = s.strength ? `${loc("VTM20.Attr.strength")} + ${s.damage}` : String(s.damage);
      ctx.damageTypeLabel = loc(VTM20.damageTypes[s.damageType]?.label ?? "");
      ctx.ranged = s.kind === "firearms" || s.kind === "thrown";
      ctx.canAttack = !!item.parent && item.parent.isOwner;
    }
    // Достоинство / недостаток: механика (data/merit-mods.mjs), клан или секта
    if (item.type === "merit" || item.type === "flaw") {
      ctx.mod = describeMeritMod(item.name);
      ctx.categoryLabel = loc(VTM20.meritCategories[s.category]?.label ?? s.category ?? "");
      ctx.clanLabel = s.clan ? Codex.clanName(s.clan) : "";
      ctx.sectLabel = s.sect ? loc(`VTM20.Sect.${s.sect}`) : "";
    }
    // Факт биографии: точки
    if (item.type === "background") ctx.dots = Array.from({ length: 5 }, (_, i) => ({ n: i + 1, filled: i < s.value, path: "system.value" }));

    // Призыв (lorePower): Знание и Дом по ключу
    if (item.type === "lorePower") {
      const lore = Codex.lore(s.lore);
      ctx.loreName = lore?.name ?? "";
      ctx.loreHouse = lore?.dark ? game.i18n.localize("VTM20.DRitual.Earthbound") : lore?.house ? Codex.house(lore.house)?.name : game.i18n.localize("VTM20.Demon.Common");
      ctx.loreOptions = Codex.lores.map(l => ({ value: l.key, label: l.name, selected: l.key === s.lore }));
      ctx.book = [s.source, s.page ? `с. ${s.page}` : ""].filter(Boolean).join(", ");
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
      { label: loc("VTM20.Sheet.Disciplines"), options: Object.values(Codex.disciplines).filter(d => Codex.visible(d)).map(d => [`disciplines.${d.key}`, d.name]) }
    ];
    const mark = cur => groups.map(g => ({ label: g.label, options: g.options.map(([value, label]) => ({ value, label, selected: value === cur })) }));
    return { t1: mark(roll.trait1), t2: mark(roll.trait2) };
  }

  /** Слоты «Настроек» ритуала и реликвии (secondary.N.key/level, lores.N) — в массивы system.secondary / system.lores. */
  _processFormData(event, form, formData) {
    const data = super._processFormData(event, form, formData);
    if (data.secondary) {
      data.system ??= {};
      data.system.secondary = Object.values(data.secondary).filter(x => x.key).map(x => ({ key: x.key, level: Number(x.level) || 1 }));
      delete data.secondary;
    }
    if (data.lores) {
      data.system ??= {};
      data.system.lores = Object.values(data.lores).filter(Boolean);
      delete data.lores;
    }
    return data;
  }

  static #onToChat() { return this.item.toChat(); }

  /** Атака этим оружием — окно атаки владельца. */
  static #onAttack() {
    if (this.item.parent) return openAttack(this.item.parent, { weapon: this.item.id });
  }

  /** Переключатель-галочка из плашки (надето, постоянное…). */
  static #onToggleField(event, target) {
    const f = target.dataset.field;
    return this.item.update({ [f]: !foundry.utils.getProperty(this.item, f) });
  }

  /** Количество вещей: ±1. */
  static #onQty(event, target) {
    const q = Math.max(0, (this.item.system.quantity ?? 0) + Number(target.dataset.d));
    return this.item.update({ "system.quantity": q });
  }

  /** Точки Дисциплины или пути: щелчок по последней закрашенной снимает её. */
  static #onSetDots(event, target) {
    if (!this.isEditable) return;
    const n = Number(target.dataset.n), cur = this.item.system.value;
    return this.item.update({ "system.value": n === cur ? n - 1 : n });
  }
}
