// module/apps/new-session.mjs
// «Новая сессия» у рассказчика — для всех линеек сразу: сбрасывает всё «раз за сессию» у персонажей мира, по желанию сначала
// открывает «Опыт за сессию» и «Хронику» прошлой сессии, нумерует сессию и объявляет её в чате.
// Сбросы — в RESETS (линия: что вернуть); другие части системы и модули могут добавить свои через хук «vtm20NewSession».
//  • Призрак (Wraith 20, гл. 4, 6): бросок Мемориума, кубики Эйдолона в Катарсисе, бросок Эйдолона в Испытании.
//  • Охотник (Hunter: The Reckoning): запрет воззваний на сессию и на сцену.
//  • Подменыш (C20): угасают Вирд и Порог Бедлама.

import { SYSTEM_ID } from "../config.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.NewSession.${k}`, d) : game.i18n.localize(`VTM20.NewSession.${k}`);

/** Что сбрасывать: проверка, что у персонажа есть что вернуть, и само обновление. */
export const RESETS = [
  { key: "wraith", match: a => a.type === "wraith" && !!a.system.wraith?.session,
    dirty: a => { const s = a.system.wraith.session; return s.memoriam || s.eidolon > 0 || s.harrow; },
    update: () => ({ "system.wraith.session": { memoriam: false, eidolon: 0, harrow: false } }) },
  { key: "hunter", match: a => !!a.system.hunter && "sessionBlock" in a.system.hunter,
    dirty: a => a.system.hunter.sessionBlock || a.system.hunter.sceneBlock,
    update: () => ({ "system.hunter.sessionBlock": false, "system.hunter.sceneBlock": false }) },
  // подменыш (C20, гл. 6): Вирд держится сцену, Порог Бедлама — несколько сцен; между сессиями они угасают (правило системы)
  { key: "changeling", match: a => a.type === "changeling",
    dirty: a => !!(a.getFlag(SYSTEM_ID, "wyrd") || a.getFlag(SYSTEM_ID, "bedlam")),
    update: () => ({ [`flags.${SYSTEM_ID}.-=wyrd`]: null, [`flags.${SYSTEM_ID}.-=bedlam`]: null }) }
];

export function registerNewSession() {
  game.settings.register(SYSTEM_ID, "sessionNo", { scope: "world", config: false, type: Number, default: 0 });
}

/** Сбросить «раз за сессию» у всех персонажей мира; вернуть, сколько у кого. */
export async function resetSession() {
  const counts = {}, updates = [];
  for (const a of game.actors) for (const r of RESETS) {
    if (!r.match(a)) continue;
    counts[r.key] ??= 0;
    if (r.dirty(a)) { updates.push({ _id: a.id, ...r.update(a) }); counts[r.key]++; }
  }
  // обновления одного персонажа по разным линиям — в одну запись
  const merged = Object.values(updates.reduce((m, u) => { m[u._id] = { ...(m[u._id] ?? {}), ...u }; return m; }, {}));
  if (merged.length) await Actor.updateDocuments(merged);
  return counts;
}

/** Окно рассказчика: что сделать перед началом и — начать. */
export async function newSessionAll() {
  if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("VTM20.Notify.GMOnly"));
  const n = (game.settings.get(SYSTEM_ID, "sessionNo") ?? 0) + 1;
  const f = await foundry.applications.api.DialogV2.prompt({ window: { title: t("Title"), icon: "fa-solid fa-hourglass-start" }, classes: ["vtm20", "r-dialog"], position: { width: 440 },
    content: `<p class="r-note">${t("Lead", { n })}</p>
      <label class="r-check"><input type="checkbox" name="xp"> ${t("OpenXp")}</label>
      <label class="r-check"><input type="checkbox" name="chronicle"> ${t("OpenChronicle")}</label>
      <label class="r-f"><span>${t("Label")}</span><input type="text" name="label" placeholder="${foundry.utils.escapeHTML(t("LabelPh", { n }))}"></label>`,
    ok: { label: t("Start"), icon: "fa-solid fa-hourglass-start", callback: (ev, btn) => ({ xp: btn.form.elements.xp.checked, chronicle: btn.form.elements.chronicle.checked, label: btn.form.elements.label.value.trim() }) },
    rejectClose: false });
  if (!f) return null;
  // окна прошлой сессии — до сброса: опыт и хроника считают её события
  if (f.xp) (await import("./session-xp.mjs")).openSessionXp();
  if (f.chronicle) (await import("./chronicle.mjs")).openChronicle();
  return startSession(f.label, n);
}

/** Начать сессию: сброс, номер, хук, сообщение в чат. */
export async function startSession(label = "", n = (game.settings.get(SYSTEM_ID, "sessionNo") ?? 0) + 1) {
  const counts = await resetSession();
  await game.settings.set(SYSTEM_ID, "sessionNo", n);
  Hooks.callAll("vtm20NewSession", { n, label, counts });
  const lines = Object.entries(counts).filter(([, c]) => c > 0).map(([k, c]) => t(`Reset.${k}`, { n: c }));
  await ChatMessage.create({ speaker: { alias: game.i18n.localize("VTM20.NewSession.Title") },
    content: `<div class="r-notice r-new-session"><i class="fa-solid fa-hourglass-start"></i> <b>${foundry.utils.escapeHTML(label || t("LabelPh", { n }))}</b>
      ${lines.length ? `<br><small>${t("ResetDone")}: ${lines.join("; ")}</small>` : ""}</div>` });
  return { n, counts };
}
