// module/chat/item-card.mjs
// Карточка предмета или силы для чата (templates/chat/item-card.hbs): шапка, строка фактов
// (уровень, бросок, урон, цена…), описание — короткое раскрыто, длинное свёрнуто.

import { SYSTEM_PATH } from "../config.mjs";

/**
 * @param {object} d { kind, img, kicker, name, en, facts: [{label, value, hot}], body }
 * @returns {Promise<string>} HTML карточки
 */
export async function itemCardHTML(d) {
  const plain = String(d.body ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return foundry.applications.handlebars.renderTemplate(`${SYSTEM_PATH}/templates/chat/item-card.hbs`, {
    ...d, facts: (d.facts ?? []).filter(f => f && f.value !== "" && f.value != null),
    // силы и черты с разделами (tools/text_structure.py) — свёрнутый блок называется по ним
    short: plain.length < 500,
    summary: game.i18n.localize(/class="r-sec"/.test(d.body ?? "") ? "VTM20.Item.descSystem" : "VTM20.Item.description")
  });
}
