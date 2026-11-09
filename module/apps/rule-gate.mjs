// module/apps/rule-gate.mjs
// Запреты правил — не стена: окно с причиной и кнопкой «Всё равно». Последнее слово за рассказчиком,
// поэтому каждый обход виден ему в чате (шёпотом рассказчикам и самому игроку).

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const esc = x => foundry.utils.escapeHTML(String(x ?? ""));

/**
 * Спросить, обойти ли правило. true — обходим (и пишем об этом рассказчику), false — отказ.
 * @param {Actor|null} actor  кто действует
 * @param {string} reason     что запрещает правило
 * @param {object} o          yes — подпись кнопки согласия (по умолчанию «Всё равно»)
 */
export async function allowAnyway(actor, reason, { yes = null } = {}) {
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: t("Gate.Title"), icon: "fa-solid fa-scale-unbalanced" }, classes: ["vtm20", "r-dialog", "r-gate"],
    content: `<p>${esc(reason)}</p><p class="r-muted">${esc(t("Gate.Hint"))}</p>`,
    yes: { label: yes ?? t("Gate.Anyway"), icon: "fa-solid fa-check" },
    no: { label: t("Gate.Cancel"), icon: "fa-solid fa-xmark", default: true },
    rejectClose: false
  });
  if (!ok) return false;
  const whisper = [...new Set([game.user.id, ...game.users.filter(u => u.isGM).map(u => u.id)])];
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: actor ?? undefined }), whisper,
    content: `<div class="r-notice"><i class="fa-solid fa-scale-unbalanced"></i> ${esc(t("Gate.Done", { name: actor?.name ?? game.user.name, reason }))}</div>` });
  return true;
}
