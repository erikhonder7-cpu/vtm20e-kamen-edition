// module/apps/torpor.mjs
// Торпор и Окончательная смерть (план 9). Урон ниже «При смерти» — не приговор, а карточка ведущему:
// торпор (обычный урон) или Окончательная смерть (губительный, V20, гл. 4). Торпор — флаг torpor на актёре:
// когда уснул, когда выйдет срок по Человечности или Пути (VTM20.torporDuration), причина. Срок считается
// по часам хроники; когда он вышел — карточка в чат, и персонаж просыпается за 1 кровь. Раньше — «разбудить
// кровью». Окончательная смерть — флаг finalDeath (его читают паутина и списки) и статус «мёртв».

import { SYSTEM_ID, VTM20 } from "../config.mjs";
import { getClock, longDate, MS_DAY } from "./calendar.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Срок торпора по морали (V20, гл. 4): [лет, месяцев, дней]. */
const SPAN = {
  10: [0, 0, 1], 9: [0, 0, 3], 8: [0, 0, 7], 7: [0, 0, 14], 6: [0, 1, 0], 5: [1, 0, 0],
  4: [10, 0, 0], 3: [50, 0, 0], 2: [100, 0, 0], 1: [500, 0, 0], 0: [1000, 0, 0]
};

const moralityOf = actor => Math.clamp(Number(actor?.system?.morality?.value) || 0, 0, 10);

/** Когда выйдет срок, если уснуть в since с такой моралью. */
export function torporUntil(since, morality) {
  const [y, m, d] = SPAN[Math.clamp(Number(morality) || 0, 0, 10)];
  const dt = new Date(since);
  dt.setFullYear(dt.getFullYear() + y, dt.getMonth() + m, dt.getDate() + d);
  return dt.getTime();
}

export const torporOf = actor => actor?.getFlag?.(SYSTEM_ID, "torpor") ?? null;
export const deathOf = actor => actor?.getFlag?.(SYSTEM_ID, "finalDeath") ?? null;

/** Для листа: даты, ночи, полоска, можно ли уже проснуться. */
export function torporView(actor, now = getClock()) {
  const tp = torporOf(actor);
  if (!tp) return null;
  const total = Math.max(1, Math.round((tp.until - tp.since) / MS_DAY));
  const passed = Math.clamp(Math.floor((now - tp.since) / MS_DAY), 0, total);
  return {
    cause: t(`Torpor.Cause.${tp.cause ?? "wounds"}`), span: VTM20.torporDuration[tp.morality] ?? "",
    morality: tp.morality, since: longDate(new Date(tp.since)), until: longDate(new Date(tp.until)),
    passed, left: total - passed, pct: ((passed / total) * 100).toFixed(1), ready: now >= tp.until
  };
}

function notice(actor, html, { gm = false } = {}) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice">${html}</div>`, style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    ...(gm ? { whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id) } : {})
  });
}

/** Уснуть: от ран, по своей воле или от голода. Срок — по морали на момент сна. */
export async function enterTorpor(actor, cause = "wounds") {
  if (!actor || deathOf(actor)) return;
  const since = getClock(), morality = moralityOf(actor), until = torporUntil(since, morality);
  await actor.setFlag(SYSTEM_ID, "torpor", { since, until, cause, morality });
  if (!actor.statuses?.has("r-torpor")) await actor.toggleStatusEffect("r-torpor", { active: true });
  await notice(actor, `<i class="fa-solid fa-bed"></i> ${t("Torpor.Entered", { name: esc(actor.name), date: longDate(new Date(until)), span: VTM20.torporDuration[morality] })}`);
}

/**
 * Проснуться. Сам — когда срок вышел, за 1 кровь; byBlood — раньше срока, его напоили кровью
 * (ведущий или хозяин персонажа отмечают это кнопкой).
 */
export async function wakeFromTorpor(actor, { byBlood = false } = {}) {
  const tp = torporOf(actor);
  if (!tp) return;
  if (!byBlood) {
    if (getClock() < tp.until) return ui.notifications.warn(t("Torpor.NotYet"));
    if ((actor.system.blood?.value ?? 0) < 1) return ui.notifications.warn(t("Torpor.NoBlood", { name: actor.name }));
  }
  await actor.unsetFlag(SYSTEM_ID, "torpor");
  if (actor.statuses?.has("r-torpor")) await actor.toggleStatusEffect("r-torpor", { active: false });
  if (!byBlood) await actor.update({ "system.blood.value": actor.system.blood.value - 1 });
  await notice(actor, `<i class="fa-solid fa-sun"></i> ${t(byBlood ? "Torpor.WokeBlood" : "Torpor.Woke", { name: esc(actor.name) })}`);
}

/** Окончательная смерть: флаг с датой хроники, статус «мёртв» поверх жетона, торпор снят. */
export async function finalDeath(actor, cause = "aggravated") {
  if (!actor || deathOf(actor)) return;
  await actor.update({ [`flags.${SYSTEM_ID}.finalDeath`]: { at: getClock(), cause }, [`flags.${SYSTEM_ID}.-=torpor`]: null });
  if (actor.statuses?.has("r-torpor")) await actor.toggleStatusEffect("r-torpor", { active: false });
  if (!actor.statuses?.has("dead")) await actor.toggleStatusEffect("dead", { active: true, overlay: true });
  await notice(actor, `<i class="fa-solid fa-skull"></i> ${t("Torpor.Death.Done", { name: esc(actor.name) })}`);
}

/** Вернуть из мёртвых — на случай ошибки, только ведущему. */
export async function undoDeath(actor) {
  if (!game.user.isGM || !deathOf(actor)) return;
  await actor.unsetFlag(SYSTEM_ID, "finalDeath");
  if (actor.statuses?.has("dead")) await actor.toggleStatusEffect("dead", { active: false });
  await notice(actor, `<i class="fa-solid fa-rotate-left"></i> ${t("Torpor.Death.Undone", { name: esc(actor.name) })}`, { gm: true });
}

/** Урон ушёл ниже «При смерти»: карточка ведущему с выбором; suggest — что по правилам (torpor | death). */
export async function proposeFate(actor, suggest) {
  const btn = (k, label) => `<button type="button" data-r-fate="${k}" class="${k === suggest ? "is-suggest" : ""}">${label}</button>`;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id),
    flags: { [SYSTEM_ID]: { fate: { actor: actor.uuid, suggest } } },
    content: `<div class="r-notice r-fate-card"><b>${t("Torpor.Fate.Title", { name: esc(actor.name) })}</b>
      <p>${t(`Torpor.Fate.Text.${suggest}`)}</p>
      <div class="r-card-buttons">${btn("torpor", t("Torpor.Fate.Torpor"))}${btn("death", t("Torpor.Fate.Death"))}</div></div>`
  });
}

/** Срок торпора вышел — одна карточка на персонажа (пишет активный ведущий, с шага ночных часов). */
export async function checkTorpor(now = getClock()) {
  if (!game.users.activeGM?.isSelf) return;
  for (const a of game.actors) {
    const tp = torporOf(a);
    if (!tp || tp.told || now < tp.until) continue;
    await a.setFlag(SYSTEM_ID, "torpor", { ...tp, told: true });
    await notice(a, `<i class="fa-solid fa-hourglass-end"></i> ${t("Torpor.Ready", { name: esc(a.name) })}`);
  }
}

export function registerTorpor() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const f = message.flags?.[SYSTEM_ID]?.fate;
    if (!f) return;
    html.addEventListener("click", async ev => {
      const b = ev.target.closest("[data-r-fate]");
      if (!b) return;
      if (!game.user.isGM) return ui.notifications.warn(t("Torpor.Fate.OnlyGM"));
      const actor = await fromUuid(f.actor);
      if (!actor) return;
      if (b.dataset.rFate === "death") await finalDeath(actor);
      else if (!torporOf(actor)) await enterTorpor(actor, "wounds");
      for (const x of html.querySelectorAll("[data-r-fate]")) x.disabled = true;
    });
  });
}
