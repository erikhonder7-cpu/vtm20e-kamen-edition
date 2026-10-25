// module/apps/vaulderie.mjs
// Винкулум и Братание (Vaulderie) — братские узы Шабаша (V20_Основные_правила/05, «Братание и братские узы»):
//   · при создании персонажа Шабаша — к каждому из стаи 1d10 + 1, не выше 10 (Guide to the Sabbat 1999, гл. 3);
//   · при первом Братании с кем-то — d10: результат и есть сила уз к нему;
//   · при каждом следующем — d10 к каждому уже связанному: больше текущего — +1 (до 10), «1» — −1 (не ниже 1);
//   · братские узы со временем не слабеют; сила у каждого своя — к вам могут относиться иначе, чем вы к ним.
// Запись: system.vinculi = [{ name, rating 1–10 }]. Обряд проводит ведущий: он меняет листы всех участников.

import { SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { nameKey } from "../data/lineage.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const d10 = async () => (await new Roll("1d10").evaluate()).total;

/** Персонаж Шабаша — по полю «Секта» на листе. */
export const isSabbat = actor => Codex.sectKey(actor?.system?.details?.sect) === "sabbat";

/** Отношение по силе уз: «отдаст за него жизнь» … «нахрен его». */
export const vinculumMeaning = n => t(`Vinc.Means.${Math.clamp(Number(n) || 1, 1, 10)}`);

/** Вампиры мира, кроме этих: кандидаты в стаю (Шабаш — первыми). */
function candidates(exclude = []) {
  return game.actors.filter(a => a.type === "vampire" && !exclude.includes(a.id))
    .sort((x, y) => (isSabbat(y) - isSabbat(x)) || x.name.localeCompare(y.name, "ru"));
}

/** Диалог выбора: персонажи галочками и, по желанию, имена без листа через запятую. */
async function pickPeople({ title, icon, hint, exclude = [], checked = [], names = true, okLabel }) {
  const rows = candidates(exclude).map(a => `<label class="r-trait r-vinc-pick">
      <input type="checkbox" name="pick" value="${a.id}" ${checked.includes(a.id) ? "checked" : ""}>
      <span class="r-trait-main"><b>${esc(a.name)}</b><em>${esc([a.clanLabel, a.system.details?.sect].filter(Boolean).join(" · "))}</em></span></label>`).join("");
  return foundry.applications.api.DialogV2.prompt({
    window: { title, icon }, classes: ["vtm20", "r-dialog", "r-vinc-dialog"], position: { width: 460 },
    content: `<p class="r-hint">${hint}</p><div class="r-vinc-list">${rows || `<p class="r-empty">${t("Vinc.NoKindred")}</p>`}</div>
      ${names ? `<label class="r-field"><span>${t("Vinc.ExtraNames")}</span><input type="text" name="names" placeholder="${t("Vinc.ExtraNamesHint")}"></label>` : ""}`,
    ok: { label: okLabel, callback: (e, b) => ({
      ids: [...b.form.querySelectorAll("input[name=pick]:checked")].map(x => x.value),
      names: String(b.form.elements.names?.value ?? "").split(/[,;\n]/).map(s => s.trim()).filter(Boolean)
    }) },
    rejectClose: false
  });
}

/** Создание персонажа Шабаша: Винкулум к стае, 1d10 + 1 к каждому (не выше 10). */
export async function rollPackVinculi(actor) {
  const have = new Set((actor.system.vinculi ?? []).map(v => nameKey(v.name)));
  const res = await pickPeople({
    title: t("Vinc.PackTitle", { name: actor.name }), icon: "fa-solid fa-people-group", hint: t("Vinc.PackHint"),
    exclude: [actor.id], checked: candidates([actor.id]).filter(a => have.has(nameKey(a.name))).map(a => a.id), okLabel: t("Vinc.PackRoll")
  });
  if (!res) return;
  const people = [...res.ids.map(id => game.actors.get(id)?.name).filter(Boolean), ...res.names];
  if (!people.length) return;
  const list = foundry.utils.deepClone(actor._source.system.vinculi ?? []), lines = [];
  for (const name of people) {
    const roll = await d10(), rating = Math.min(10, roll + 1);
    const row = list.find(v => nameKey(v.name) === nameKey(name));
    if (row) row.rating = rating; else list.push({ name, rating });
    lines.push(`<li><b>${esc(name)}</b> — ${rating} <span class="r-muted">(${roll} + 1 · ${esc(vinculumMeaning(rating))})</span></li>`);
  }
  await actor.update({ "system.vinculi": list });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id).concat(game.user.id),
    content: `<div class="r-notice r-vinc-card"><i class="fa-solid fa-people-group"></i> <b>${t("Vinc.PackDone", { name: esc(actor.name) })}</b><ul>${lines.join("")}</ul></div>` });
}

/**
 * Братание: каждый участник бросает d10 к каждому из остальных. Уже связан — больше текущего +1, «1» −1;
 * не связан — бросок и есть сила. Ведущий — он меняет листы всех участников; карточка в чат — ему (узы тайны).
 */
export async function openVaulderie(initiator = null) {
  if (!game.user.isGM) return ui.notifications.warn(t("Vinc.GMOnly"));
  const known = new Set((initiator?.system.vinculi ?? []).map(v => nameKey(v.name)));
  const res = await pickPeople({
    title: t("Vinc.RiteTitle"), icon: "fa-solid fa-wine-glass", hint: t("Vinc.RiteHint"), names: false, okLabel: t("Vinc.RiteDo"),
    checked: candidates().filter(a => a.id === initiator?.id || known.has(nameKey(a.name))).map(a => a.id)
  });
  const pack = (res?.ids ?? []).map(id => game.actors.get(id)).filter(Boolean);
  if (pack.length < 2) return res && ui.notifications.warn(t("Vinc.NeedTwo"));
  const blocks = [];
  for (const a of pack) {
    const list = foundry.utils.deepClone(a._source.system.vinculi ?? []), lines = [];
    for (const b of pack) {
      if (b === a) continue;
      const roll = await d10(), row = list.find(v => nameKey(v.name) === nameKey(b.name));
      if (!row) { list.push({ name: b.name, rating: roll }); lines.push(t("Vinc.New", { to: esc(b.name), n: roll })); continue; }
      const was = row.rating;
      if (roll === 1) row.rating = Math.max(1, was - 1);
      else if (roll > was) row.rating = Math.min(10, was + 1);
      lines.push(t(row.rating > was ? "Vinc.Up" : row.rating < was ? "Vinc.Down" : "Vinc.Same", { to: esc(b.name), from: was, n: row.rating, roll }));
    }
    await a.update({ "system.vinculi": list });
    blocks.push(`<li><b>${esc(a.name)}</b><ul>${lines.map(l => `<li>${l}</li>`).join("")}</ul></li>`);
  }
  await ChatMessage.create({ speaker: { alias: t("Vinc.RiteTitle") }, whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
    flags: { [SYSTEM_ID]: { vaulderie: pack.map(a => a.id) } },
    content: `<div class="r-notice r-vinc-card"><i class="fa-solid fa-wine-glass"></i> <b>${t("Vinc.RiteDone", { n: pack.length })}</b><ul class="r-vinc-rite">${blocks.join("")}</ul></div>` });
}

/** Конфликт верностей: встречная проверка, пул — сила уз к каждой стороне; сл. 5 своей стороне, 7 — другой. */
export async function loyaltyConflict(actor, index) {
  const own = actor.system.vinculi?.[index];
  if (!own) return;
  const others = (actor.system.vinculi ?? []).filter((v, i) => i !== index);
  if (!others.length) return ui.notifications.warn(t("Vinc.NoOther"));
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("Vinc.ConflictTitle"), icon: "fa-solid fa-scale-unbalanced" }, classes: ["vtm20", "r-dialog"],
    content: `<p class="r-hint">${t("Vinc.ConflictHint", { name: esc(own.name) })}</p>
      <label class="r-field"><span>${t("Vinc.ConflictOther")}</span><select name="other">${others.map(v => `<option value="${esc(v.name)}">${esc(v.name)} · ${v.rating}</option>`).join("")}</select></label>`,
    ok: { label: t("Vinc.ConflictRoll"), callback: (e, b) => b.form.elements.other.value }, rejectClose: false
  });
  const other = res && others.find(v => v.name === res);
  if (!other) return;
  const roll = async (n, diff) => { const r = await new Roll(`${Math.max(1, n)}d10`).evaluate(); const vals = r.dice[0].results.map(x => x.result);
    return { vals, net: Math.max(0, vals.filter(v => v >= diff).length - vals.filter(v => v === 1).length) }; };
  const a = await roll(own.rating, 5), b = await roll(other.rating, 7);
  const win = a.net === b.net ? null : a.net > b.net ? own.name : other.name;
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="r-notice r-vinc-card"><i class="fa-solid fa-scale-unbalanced"></i> <b>${t("Vinc.ConflictTitle")}</b><ul>
      <li>${esc(own.name)} · ${own.rating} ${t("Vinc.Dice")} ${t("Roll.Vs")} 5: [${a.vals.join(", ")}] — <b>${a.net}</b></li>
      <li>${esc(other.name)} · ${other.rating} ${t("Vinc.Dice")} ${t("Roll.Vs")} 7: [${b.vals.join(", ")}] — <b>${b.net}</b></li></ul>
      <b class="r-fate">${win ? t("Vinc.ConflictWin", { name: esc(win) }) : t("Vinc.ConflictTie")}</b></div>` });
}
