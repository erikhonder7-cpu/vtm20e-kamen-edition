// module/apps/derangements.mjs
// Расстройства на листе (V20, гл. 7 «Расстройства»; тексты — data/derangements.json): правки бросков — в data/merit-mods.mjs
// (подбор видит и расстройства); здесь — сцена: «Сдержать» — потратить 1 пункт Воли, и расстройство не проявляется до конца
// сцены; «Проявилось» — расстройство взяло верх, напоминание с его текстом. Оба — эффектом на сцену (снимается концом сцены).

import { SYSTEM_ID } from "../config.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Derange.${k}`, d) : game.i18n.localize(`VTM20.Derange.${k}`);
const esc = x => foundry.utils.escapeHTML(String(x ?? ""));

export async function derangementScene(actor, item, hold) {
  if (!actor.isOwner) return null;
  if (hold) {
    const wp = actor.system.willpower?.temporary ?? 0;
    if (wp < 1) return ui.notifications.warn(t("NoWill"));
    await actor.update({ "system.willpower.temporary": wp - 1 });
  }
  const name = `${item.name} · ${t(hold ? "Held" : "Shown")}`;
  await actor.createEmbeddedDocuments("ActiveEffect", [{ name, img: item.img, description: item.system.description ?? "",
    flags: { [SYSTEM_ID]: { power: `derangement:${hold ? "hold" : "show"}`, mode: "scene", ready: true } } }]);
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="r-notice"><i class="fa-solid ${hold ? "fa-hand" : "fa-brain"}"></i> ${esc(t(hold ? "HeldMsg" : "ShownMsg", { name: actor.name, what: item.name }))}</div>` });
}
