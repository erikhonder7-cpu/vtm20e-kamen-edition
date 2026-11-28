// module/apps/martial.mjs
// Окно «Воинская выучка» (V20 Dark Ages: Tome of Secrets, гл. 3): какие особые приёмы знает персонаж. По Способности — столько
// приёмов, сколько точек в Факте «Воинская выучка (…)»; приёмы Верховой езды с порогом (Конная борьба — Верховая езда 3,
// Россфехтен — 2) без нужных точек закрыты. Выбор — флаг martial (module/data/martial.mjs); приёмы атаки потом в окне атаки.

import { SYSTEM_ID, SYSTEM_PATH, VTM20 } from "../config.mjs";
import { MARTIAL, MARTIAL_ABILITIES, martialDots } from "../data/martial.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.Martial.${k}`, d) : game.i18n.localize(`VTM20.Martial.${k}`);
const abilLabel = k => game.i18n.localize(VTM20.abilities[k]?.label ?? `VTM20.Abil.${k}`);
const attrLabel = k => game.i18n.localize(VTM20.attributes[k]?.label ?? k);

/** Строка броска приёма: «Сила + Драка · сложность +1 · урон Сила + 3». */
export function martialRollLine(m) {
  if (m.kind !== "attack") return "";
  const ability = m.use === "weaponOrBrawl" ? `${abilLabel("melee")} / ${abilLabel("brawl")}` : abilLabel(m.use === "ride" ? "ride" : m.use === "brawl" ? "brawl" : "melee");
  const diff = m.diff ? t("DiffMod", { n: m.diff > 0 ? `+${m.diff}` : m.diff }) : t("DiffStd");
  const dmg = m.dmg == null ? (m.use === "weapon" || m.use === "weaponOrBrawl" ? t("DmgWeapon") : t("DmgNone"))
    : t("Dmg", { n: m.dmg ? `${attrLabel("strength")} + ${m.dmg}` : attrLabel("strength") });
  return `${attrLabel(m.attr)} + ${ability} · ${diff} · ${dmg}`;
}

export class MartialDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-dialog", "r-martial"],
    tag: "form",
    window: { title: "VTM20.Martial.Title", icon: "fa-solid fa-chess-knight" },
    position: { width: 720 },
    form: { handler: MartialDialog.#onSubmit, closeOnSubmit: true, submitOnChange: false }
  };

  static PARTS = { form: { template: `${SYSTEM_PATH}/templates/apps/martial.hbs` } };

  constructor(actor, { onSave = null } = {}) {
    super({ id: `vtm20-martial-${actor.id}`, window: { title: `${game.i18n.localize("VTM20.Martial.Title")}: ${actor.name}` } });
    this.actor = actor;
    this.onSave = onSave;
  }

  async _prepareContext() {
    const a = this.actor, picked = new Set(a.getFlag(SYSTEM_ID, "martial") ?? []);
    const groups = MARTIAL_ABILITIES.map(ab => {
      const dots = martialDots(a, ab), have = a.system.abilities?.[ab]?.value ?? 0;
      const list = MARTIAL.filter(m => m.ability === ab);
      const on = list.filter(m => picked.has(m.key)).length;
      return {
        key: ab, label: abilLabel(ab), dots, have, on, over: dots > have,
        dotRow: Array.from({ length: 5 }, (_, i) => ({ filled: i < dots })),
        count: t("Count", { n: Math.min(on, dots), max: dots }),
        none: !list.length,
        items: list.map(m => {
          const ride = a.system.abilities?.ride?.value ?? 0, needRide = m.min && ride < m.min;
          return { key: m.key, icon: m.icon, name: t(`M.${m.key}`), text: t(`D.${m.key}`), kind: m.kind, kindLabel: t(`Kind.${m.kind}`),
            roll: martialRollLine(m), on: picked.has(m.key), locked: !!needRide,
            need: needRide ? t("NeedRide", { n: m.min }) : "" };
        })
      };
    }).filter(g => g.dots > 0);
    return { groups, empty: !groups.length };
  }

  _onRender(ctx, opts) {
    super._onRender?.(ctx, opts);
    // не больше приёмов, чем точек Факта: лишние флажки гаснут
    const sync = () => {
      for (const g of this.element.querySelectorAll(".r-mt-group")) {
        const max = Number(g.dataset.max), boxes = [...g.querySelectorAll("input[type=checkbox]:not([data-locked])")];
        const n = boxes.filter(b => b.checked).length;
        for (const b of boxes) { b.disabled = !b.checked && n >= max; b.closest(".r-mt-card")?.classList.toggle("is-on", b.checked); }
        const c = g.querySelector(".r-mt-count"); if (c) c.textContent = t("Count", { n, max });
      }
    };
    if (!this._mtBound) { this.element.addEventListener("change", sync); this._mtBound = true; }
    sync();
  }

  static async #onSubmit(event, form) {
    const keys = [...form.querySelectorAll("input[type=checkbox]:checked")].map(b => b.name);
    await this.actor.setFlag(SYSTEM_ID, "martial", keys);
    ui.notifications.info(t("Saved", { name: this.actor.name }));
    this.onSave?.();
  }
}

export function openMartial(actor, o) {
  const app = new MartialDialog(actor, o);
  const existing = foundry.applications.instances.get(app.id);
  if (existing) { existing.render({ force: true }); return existing; }
  app.render({ force: true });
  return app;
}
