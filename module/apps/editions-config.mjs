// module/apps/editions-config.mjs
// Настройка мира «Редакции и источники» (module/data/editions.mjs): по разделам справочника — какие редакции видны сверх основы
// эпохи. Основа (V20 с дополнениями или V20 Dark Ages) отмечена всегда. Повторы одной записи из разных книг справочник
// показывает одной — из старшей редакции, так что включённая старая редакция добавляет только то, чего в основе нет.

import { SYSTEM_ID, SYSTEM_PATH } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { EDITIONS, EDITION_CATS, baseEdition, editionOrder, editionSettings } from "../data/editions.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);

/**
 * Перенос прежнего переключателя «Контент из Dark Ages» (показывал всё Тёмных веков и в V20): включённый — V20 Dark Ages и
 * старые Тёмные века во всех разделах «Редакций и источников», сам переключатель — выключить. Один раз, у рассказчика.
 */
export async function migrateEditions() {
  if (!game.user?.isGM) return;
  try {
    if (!game.settings.get(SYSTEM_ID, "darkAgesContent")) return;
    const cfg = foundry.utils.deepClone(editionSettings());
    for (const cat of EDITION_CATS) Object.assign(cfg[cat] ??= {}, { v20da: true, da: true });
    await game.settings.set(SYSTEM_ID, "editions", cfg);
    await game.settings.set(SYSTEM_ID, "darkAgesContent", false);
  } catch (e) { console.warn("vtm20 | перенос «Контент из Dark Ages»", e); }
}

export class EditionsConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "vtm20-editions",
    classes: ["vtm20", "r-dialog", "r-editions"],
    tag: "form",
    window: { title: "VTM20.Editions.Title", icon: "fa-solid fa-books" },
    position: { width: 640 },
    form: { handler: EditionsConfig.#onSubmit, closeOnSubmit: true, submitOnChange: false },
    actions: { row: EditionsConfig.#onRow }
  };

  static PARTS = { form: { template: `${SYSTEM_PATH}/templates/apps/editions.hbs` } };

  /** Сколько записей раздела даёт редакция (без повторов основы) — подсказкой у флажка. */
  #counts() {
    const out = {};
    for (const list of Codex._edGroups?.values() ?? []) for (const x of list) for (const e of x._eds) {
      const k = `${x._cat}.${e}`; out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  }

  async _prepareContext() {
    await Codex.load({ texts: false });
    const base = baseEdition(), cfg = editionSettings(), n = this.#counts();
    const order = editionOrder(base).filter(e => EDITIONS.includes(e));
    return {
      baseName: t(`Editions.Name.${base}`),
      eds: order.map(e => ({ key: e, short: t(`Editions.Short.${e}`), name: t(`Editions.Name.${e}`), base: e === base })),
      cats: EDITION_CATS.map(cat => ({
        key: cat, label: t(`Editions.Cat.${cat}`),
        eds: order.map(e => ({ key: e, short: t(`Editions.Short.${e}`), base: e === base, on: e === base || !!cfg?.[cat]?.[e],
          none: !n[`${cat}.${e}`], tip: t("Editions.Count", { n: n[`${cat}.${e}`] ?? 0, name: t(`Editions.Name.${e}`) }) }))
      }))
    };
  }

  /** «Везде» у редакции: отметить её во всех разделах (или снять, если уже везде отмечена). */
  static #onRow(event, target) {
    const e = target.dataset.ed, boxes = [...this.element.querySelectorAll(`input[data-ed="${e}"]:not(:disabled)`)];
    const all = boxes.every(b => b.checked);
    for (const b of boxes) b.checked = !all;
  }

  static async #onSubmit(event, form) {
    const base = baseEdition(), out = {};
    for (const cat of EDITION_CATS) for (const e of EDITIONS) {
      if (e === base) continue;
      if (form.querySelector(`input[name="${cat}.${e}"]`)?.checked) (out[cat] ??= {})[e] = true;
    }
    await game.settings.set(SYSTEM_ID, "editions", out);
    ui.notifications.info(t("Editions.Saved"));
  }
}
