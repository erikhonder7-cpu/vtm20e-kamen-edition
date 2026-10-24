// module/apps/damage.mjs
// «Получить урон» (04) в стиле окна броска: число повреждений ступеньками, тип плитками,
// пули, клыки и броня, сложность прочности; разбор пула прочности и шансы поглотить.

import { VTM20, SYSTEM_PATH } from "../config.mjs";
import { soakAndApply, odds, chancesView } from "../dice/roll.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const TYPE_ICONS = { bashing: "fa-hand-fist", lethal: "fa-khanda", aggravated: "fa-fire-flame-curved" };

export function openDamageDialog(actor) {
  return new DamageDialog(actor).render({ force: true });
}

class DamageDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-dialog", "r-roll-dialog", "r-damage"],
    tag: "form",
    window: { title: "VTM20.DamageDlg.Title", icon: "fa-solid fa-heart-crack" },
    position: { width: 440 },
    form: { handler: DamageDialog.#onSubmit, closeOnSubmit: true, submitOnChange: false },
    actions: { type: DamageDialog.#onType, bump: DamageDialog.#onBump }
  };

  static PARTS = { form: { template: `${SYSTEM_PATH}/templates/apps/damage.hbs` } };

  constructor(actor) {
    super({ window: { title: t("DamageDlg.Title", { name: actor.name }) } });
    this.actor = actor;
    this.v = { amount: 1, type: "lethal", soak: true, armor: true, fangs: false, bullet: false, head: false, modDiff: 0,
      messageMode: game.settings.get("core", "messageMode") };
  }

  get tough() { const a = this.actor; return a.isVampire || (a.type === "creature" && a.system.supernatural); }

  /** Итоговый тип (как в soakAndApply), пул прочности с разбором, сложность и пояснения. */
  preview() {
    const a = this.actor, v = this.v, notes = [];
    let type = v.type;
    if (v.bullet && a.isVampire && !v.head && type === "lethal") { type = "bashing"; notes.push(t("Combat.BulletBashing")); }
    if (type === "aggravated" && !this.tough) { type = "lethal"; notes.push(t("Combat.MortalAggravated")); }
    const sta = a.system.attributes.stamina.total, fort = a.discipline("fortitude"), arm = v.armor ? a.armor.rating : 0;
    const STA = { label: a.traitLabel("attributes.stamina"), value: sta };
    const FORT = { label: a.traitLabel("disciplines.fortitude"), value: fort };
    const ARM = { label: t("Sheet.Armor"), value: arm };
    const parts = type === "bashing" ? [STA, FORT, ARM]
      : type === "lethal" ? [...(this.tough ? [STA] : []), FORT, ARM]
      : [FORT, ...(v.fangs ? [ARM] : [])];
    let bd = parts.filter(x => x.value);
    const pool = a.soakPool(type, { armor: v.armor, fangs: v.fangs });
    // особые силы (Шкура гадюки и т. п.) — разбор не сходится, показываем итог одной строкой
    if (bd.reduce((n, x) => n + x.value, 0) !== pool) bd = [{ label: t("Roll.Soak"), value: pool }];
    const difficulty = Math.clamp(6 + v.modDiff + (a.system.fx?.soakDiff ?? 0), 2, 10);
    if (type === "bashing" && a.isVampire) notes.push(t("DamageDlg.Halved"));
    return { type, bd, pool: v.soak ? pool : 0, difficulty, notes };
  }

  async _prepareContext() {
    const a = this.actor, v = this.v, p = this.preview();
    const modes = CONFIG.ChatMessage?.modes ?? {};
    return {
      v, p,
      types: Object.entries(VTM20.damageTypes).map(([k, d]) => ({ key: k, icon: TYPE_ICONS[k], label: game.i18n.localize(d.label), active: k === v.type })),
      typeLabel: game.i18n.localize(VTM20.damageTypes[p.type].label),
      showFangs: v.type === "aggravated", showBullet: v.type === "lethal" && a.isVampire,
      chances: v.soak && p.pool ? chancesView(odds({ pool: p.pool, difficulty: p.difficulty, noBotch: true })) : null,
      messageModes: Object.entries(modes).map(([k, m]) => ({ value: k, label: game.i18n.localize(m.label ?? k), selected: k === v.messageMode }))
    };
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.element.addEventListener("change", () => {
      const f = new foundry.applications.ux.FormDataExtended(this.element).object;
      Object.assign(this.v, {
        amount: Math.clamp(Math.trunc(Number(f.amount) || 0), 0, 30), modDiff: Math.trunc(Number(f.modDiff) || 0),
        soak: !!f.soak, armor: !!f.armor, fangs: !!f.fangs, bullet: !!f.bullet, head: !!f.head, messageMode: f.messageMode ?? this.v.messageMode
      });
      this.render();
    });
  }

  static #onType(event, target) { this.v.type = target.dataset.key; this.render(); }
  static #onBump(event, target) {
    const k = target.dataset.field, d = Number(target.dataset.d);
    this.v[k] = k === "amount" ? Math.clamp(this.v.amount + d, 0, 30) : Math.clamp(this.v[k] + d, -5, 5);
    this.render();
  }

  static async #onSubmit() {
    const v = this.v;
    if (v.amount <= 0) return;
    return soakAndApply(this.actor, v.amount, v.type, {
      soak: v.soak, armor: v.armor, fangs: v.fangs, bullet: v.bullet, head: v.head, difficulty: 6 + v.modDiff, messageMode: v.messageMode
    });
  }
}
