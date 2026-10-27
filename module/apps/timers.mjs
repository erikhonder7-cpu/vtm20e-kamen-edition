// module/apps/timers.mjs
// Длительности по часам хроники (план 7): силы «на час» и «до рассвета», чтение ритуалов и действие ритуала
// (успешный бросок ритуала, в тексте эффекта которого сказано «до рассвета», «на час» или «до конца сцены»)
// гаснут по часам календаря, а не по кнопке. Срок — флаги start/until (мс хроники) на эффекте.
// Следит один активный ведущий: на каждом шаге часов и сразу после промотки всё, чьё время вышло,
// гаснет, и в чат идёт одна карточка на всех. Остаток на листе и в HUD подкрашивается сам.

import { SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { getClock, sunTimes, hhmm, MS_MIN, MS_HOUR, MS_DAY } from "./calendar.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** V20, гл. 4: ритуал читается 5 минут за уровень, если в тексте не сказано иное. */
export const RITUAL_MINUTES = 5;

/** Ближайший рассвет после ms. */
export function nextSunrise(ms = getClock()) {
  const sr = sunTimes(ms).sunrise;
  return sr > ms ? sr : sunTimes(ms + MS_DAY).sunrise;
}

/** Срок силы: hour — через hours часов, night — на рассвете; у остальных срока нет. */
export function untilFor(mode, { hours = 1, now = getClock() } = {}) {
  if (mode === "hour") return now + Math.max(1, Number(hours) || 1) * MS_HOUR;
  if (mode === "night") return nextSunrise(now);
  return null;
}

/** Срок ритуала из текста его эффекта: night | hour | scene | null — что упомянуто раньше. */
export function ritualDuration(text) {
  const s = String(text ?? "").replace(/<[^>]+>/g, " ");
  const found = [["night", /до рассвета|до восхода|до конца ночи|на (?:всю )?ночь/i], ["hour", /на (?:один )?час(?![а-яё])|в течение (?:одного )?часа/i],
    ["scene", /до конца сцены|на (?:одну |всю )?сцену|всю сцену/i]]
    .map(([mode, re]) => ({ mode, i: s.search(re) })).filter(x => x.i >= 0).sort((a, b) => a.i - b.i);
  return found[0]?.mode ?? null;
}

/** Ритуал сработал: если у него есть срок, на персонаже появляется «Действует: …» с таймером (гаснет как силы). */
async function startRitualEffect(message) {
  const st = message.flags?.[SYSTEM_ID]?.roll;
  if (st?.kind !== "ritual" || message.author?.id !== game.user.id) return;
  const { evaluate } = await import("../dice/roll.mjs");
  if (evaluate(st.values ?? [], st).successes <= 0) return;
  const actor = st.actorUuid ? await fromUuid(st.actorUuid) : null;
  const item = actor?.items.find(i => i.type === "ritual" && i.name === st.title);
  if (!actor?.isOwner || !item) return;
  const data = (Codex.rituals[item.system.discipline]?.rituals ?? []).find(r => r.name === item.name);
  const mode = ritualDuration(data?.parts?.effect ?? item.system.effect ?? item.system.description);
  if (!mode) return;
  const now = getClock(), until = untilFor(mode, { now });
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: t("Timer.RitualOnName", { name: item.name }), img: item.img, description: item.system.description ?? "",
    flags: { [SYSTEM_ID]: { ritualOn: item.id, mode, start: now, ...(until ? { until } : {}) } }
  }]);
}

/** Остаток: { left: "0:42", pct } — pct от 1 (только началось) до 0 (вышло). */
export function timeLeft(start, until, now = getClock()) {
  if (!until) return null;
  const ms = Math.max(0, until - now), min = Math.ceil(ms / MS_MIN);
  const pct = start && until > start ? Math.clamp(ms / (until - start), 0, 1) : 1;
  return { left: `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`, pct, pctW: (pct * 100).toFixed(1), at: hhmm(new Date(until)) };
}

/** Срок эффекта для листа и HUD: { kind, start, until, left, pct, at } или null. */
export function effectTimer(effect) {
  const f = effect?.flags?.[SYSTEM_ID];
  if (!f?.until) return null;
  return { kind: f.ritual ? "ritual" : f.mode, start: f.start ?? 0, until: f.until, ...timeLeft(f.start, f.until) };
}

/** Ритуалы, которые сейчас читаются: ActiveEffect с флагом ritual (id предмета). */
export const readingRituals = actor => (actor?.effects ?? []).filter(e => e.flags?.[SYSTEM_ID]?.ritual);

/** Начать чтение ритуала (или прервать, если уже читается). */
export async function toggleRitualReading(actor, item) {
  const on = readingRituals(actor).find(e => e.flags[SYSTEM_ID].ritual === item.id);
  if (on) return cancelRitual(actor, on);
  const lvl = Number(item.system.level) || 1, have = actor.discipline?.(item.system.discipline) ?? 0;
  if (have < lvl) return ui.notifications.warn(t("Magic.RitualTooHigh", { name: item.name, d: Codex.disciplineLabel(item.system.discipline), n: have, l: lvl }));
  const min = RITUAL_MINUTES * lvl, now = getClock(), until = now + min * MS_MIN;
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: item.name, img: item.img, description: item.system.description ?? "",
    flags: { [SYSTEM_ID]: { ritual: item.id, level: lvl, start: now, until } }
  }]);
  notice(actor, `<i class="fa-solid fa-hourglass-start"></i> ${t("Timer.RitualStart", { name: esc(item.name), n: min, at: hhmm(new Date(until)) })}`);
}

/** Прервать чтение: ритуал не сработал, бросать нечего. */
export async function cancelRitual(actor, effect) {
  const name = effect.name;
  await effect.delete();
  notice(actor, `<i class="fa-solid fa-xmark"></i> ${t("Timer.RitualCancel", { name: esc(name) })}`);
}

function notice(actor, html) {
  ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice">${html}</div>`, style: CONST.CHAT_MESSAGE_STYLES.OTHER });
}

/** Все персонажи, на которых могут висеть сроки: мир и несвязанные жетоны сцены. */
function timedActors() {
  const out = [...game.actors];
  for (const tk of canvas?.scene?.tokens ?? []) if (!tk.actorLink && tk.actor) out.push(tk.actor);
  return out;
}

let busy = false;

/** Погасить всё, чьё время вышло, — одной карточкой. Пишет только активный ведущий. */
export async function expireTimers(now = getClock()) {
  if (busy || !game.users.activeGM?.isSelf) return;
  busy = true;
  try {
    const off = [], read = [];
    for (const a of timedActors()) {
      const names = [];
      for (const e of [...a.effects]) {
        const f = e.flags?.[SYSTEM_ID];
        if (!f?.until || f.until > now || e.disabled) continue;
        if (f.ritual) { read.push({ actor: a, item: a.items.get(f.ritual), name: e.name, at: hhmm(new Date(f.until)) }); await e.delete(); }
        else if (f.ritualOn) { names.push(e.name); await e.delete(); }
        else if (f.power) { names.push(e.name); await a.endPower(e, { quiet: true }); }
      }
      if (names.length) off.push({ actor: a, names });
    }
    if (!off.length && !read.length) return;
    const lines = [
      ...off.map(x => `<li>${t("Timer.Off", { who: esc(x.actor.name), what: x.names.map(n => `«${esc(n)}»`).join(", ") })}</li>`),
      ...read.map(x => `<li>${t("Timer.RitualDone", { who: esc(x.actor.name), name: esc(x.name), at: x.at })}</li>`)
    ];
    const buttons = read.filter(x => x.item).map(x => `<button type="button" data-r-ritual data-actor-uuid="${x.actor.uuid}" data-item-id="${x.item.id}">
      <i class="fa-solid fa-dice-d10"></i> ${t("Timer.RitualRoll", { name: esc(x.name) })}</button>`).join("");
    await ChatMessage.create({
      speaker: { alias: t("Calendar.Title") }, flags: { [SYSTEM_ID]: { timers: true } },
      content: `<div class="r-notice r-timer-card"><header><i class="fa-solid fa-hourglass-end"></i> <b>${t("Timer.Ended", { at: hhmm(new Date(now)) })}</b></header>
        <ul>${lines.join("")}</ul>${buttons ? `<div class="r-card-buttons">${buttons}</div>` : ""}</div>`
    });
  } finally { busy = false; }
}

/** Подкрасить остатки на открытых листах и в HUD: [data-fx-until] → текст [data-left] и полоска. */
export function paintTimers() {
  const now = getClock();
  for (const el of document.querySelectorAll("[data-fx-until]")) {
    const x = timeLeft(Number(el.dataset.fxStart) || 0, Number(el.dataset.fxUntil), now);
    if (!x) continue;
    const left = el.querySelector("[data-left]");
    if (left && left.textContent !== x.left) left.textContent = x.left;
    const bar = el.querySelector(".r-fx-bar > i, .rh-fx-bar");
    if (bar) bar.style.width = `${(x.pct * 100).toFixed(1)}%`;
  }
}

let lastExpire = 0;

/** Шаг ночных часов (vtm20.mjs, startNightClock): остатки — каждый шаг, сроки — не чаще раза в 3 секунды. */
export function tickTimers() {
  paintTimers();
  const now = Date.now();
  if (now - lastExpire < 3000) return;
  lastExpire = now;
  expireTimers();
}

export function registerTimers() {
  // промотка часов (+10 минут, +час, к рассвету) — гасим сразу, не дожидаясь шага часов
  const onClock = s => { if (s.key === `${SYSTEM_ID}.clock`) { paintTimers(); expireTimers(); } };
  Hooks.on("updateSetting", onClock);
  Hooks.on("createChatMessage", m => { startRitualEffect(m); });
  Hooks.on("createSetting", onClock);
  // остатки на листах и в HUD идут и у игроков: у них часов-сердцебиения нет
  Hooks.once("ready", () => setInterval(paintTimers, 5000));
  // кнопка «Бросок ритуала» в карточке — у хозяина персонажа
  Hooks.on("renderChatMessageHTML", (message, html) => {
    if (!message.flags?.[SYSTEM_ID]?.timers) return;
    html.addEventListener("click", async ev => {
      const b = ev.target.closest("[data-r-ritual]");
      if (!b) return;
      const actor = await fromUuid(b.dataset.actorUuid), item = actor?.items.get(b.dataset.itemId);
      if (!item) return;
      if (!actor.isOwner) return ui.notifications.warn(t("Timer.NotYours"));
      const { rollRitual } = await import("../sheets/actor-sheet.mjs");
      rollRitual(actor, item);
    });
  });
}
