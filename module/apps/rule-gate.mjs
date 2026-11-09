// module/apps/rule-gate.mjs
// Запреты правил — не стена: окно с причиной и кнопкой «Всё равно». Последнее слово за рассказчиком,
// поэтому каждый обход правила виден ему в чате (шёпотом рассказчикам и самому игроку).
// soft — не правило, а удобство (например, не отмечена цель): своё заглавие, без пометки в чат.

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const esc = x => foundry.utils.escapeHTML(String(x ?? ""));

/**
 * Спросить, обойти ли правило. true — обходим (и пишем об этом рассказчику), false — отказ.
 * @param {Actor|null} actor  кто действует
 * @param {string} reason     что запрещает правило (или чего не хватает)
 * @param {object} o          yes — подпись кнопки согласия; soft — не правило, а удобство
 */
export async function allowAnyway(actor, reason, { yes = null, soft = false } = {}) {
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: t(soft ? "Gate.SoftTitle" : "Gate.Title"), icon: `fa-solid ${soft ? "fa-crosshairs" : "fa-scale-unbalanced"}` },
    classes: ["vtm20", "r-dialog", "r-gate", soft ? "is-soft" : "is-rule"], position: { width: 440 },
    content: `<div class="r-gate-body">
      <i class="fa-solid ${soft ? "fa-crosshairs" : "fa-scale-unbalanced"} r-gate-ico"></i>
      <div class="r-gate-text"><p class="r-gate-why">${esc(reason)}</p>${soft ? "" : `<p class="r-gate-hint">${esc(t("Gate.Hint"))}</p>`}</div>
    </div>`,
    yes: { label: yes ?? t("Gate.Anyway"), icon: "fa-solid fa-check" },
    no: { label: t("Gate.Cancel"), icon: "fa-solid fa-xmark", default: true },
    rejectClose: false
  });
  if (!ok) return false;
  if (soft) return true;
  const whisper = [...new Set([game.user.id, ...game.users.filter(u => u.isGM).map(u => u.id)])];
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: actor ?? undefined }), whisper,
    content: `<div class="r-notice"><i class="fa-solid fa-scale-unbalanced"></i> ${esc(t("Gate.Done", { name: actor?.name ?? game.user.name, reason }))}</div>` });
  return true;
}
