// module/dice/contests.mjs
// Виды действий V20 (V20_Основные_правила/03, «Действия»):
//   · продолжительное — нужно набрать N успехов за несколько бросков; провал срывает работу;
//   · встречное — обе стороны бросают, успехи взаимно вычитаются, в зачёт идёт остаток;
//   · командное — каждый бросает свой пул, успехи складываются; провал одного портит всё.
//
// Режим выбирают в окне проверки; продолжение, ответ противника и помощь союзника —
// кнопки на карточке броска. Отвечает персонаж, чей токен выделен (или персонаж игрока).

import { SYSTEM_ID } from "../config.mjs";
import { rollPool, evaluate } from "./roll.mjs";
import { RollDialog } from "./dialog.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Ещё один бросок продолжительного действия тем же пулом. */
export async function continueExtended(message) {
  const st = message.getFlag(SYSTEM_ID, "roll");
  const ext = st?.extra?.extended;
  if (!ext || ext.done || ext.botched) return;
  const actor = st.actorUuid ? await foundry.utils.fromUuid(st.actorUuid) : null;
  if (actor && !actor.isOwner) return ui.notifications.warn(t("Notify.NotOwner", { name: actor.name }));
  return rollPool({
    actor, title: st.title, subtitle: st.subtitle, pool: st.pool, difficulty: st.difficulty + (st.extraNeeded ?? 0),
    specialty: st.specialty, specialtyName: st.specialtyName, breakdown: st.breakdown, kind: st.kind,
    extra: { ...st.extra, extended: { need: ext.need, prev: ext.total, step: ext.step } }
  });
}

/** Кто отвечает: выделенный свой токен, иначе персонаж игрока. */
function responder() {
  const tok = canvas?.tokens?.controlled?.find(x => x.actor?.isOwner);
  return tok?.actor ?? game.user.character ?? null;
}

/**
 * Ответить на встречное действие или помочь в командном.
 * source — карточка броска или карточка промежуточного итога командной работы.
 */
export async function respond(source, kind) {
  const actor = responder();
  if (!actor) return ui.notifications.warn(t("Contest.PickActor"));
  const base = baseOf(source);
  if (!base) return;
  return RollDialog.prompt(actor, {
    // в карточке: название броска — заголовком, «противодействие» / «помощь» — строкой под ним (длинное «Противодействие: …» в узком чате шло в три строки)
    title: base.title, subtitle: t(kind === "resisted" ? "Contest.ResistSub" : "Contest.AssistSub"),
    difficulty: base.difficulty,
    onRolled: res => kind === "resisted" ? resolveResisted(base, actor, res) : resolveTeam(source, base, actor, res)
  });
}

/** Исходный бросок: из карточки броска или из флага командной работы. */
function baseOf(message) {
  const team = message.getFlag(SYSTEM_ID, "team");
  if (team) return team.base;
  const st = message.getFlag(SYSTEM_ID, "roll");
  if (!st) return null;
  const ev = evaluate(st.values, st);
  return { title: st.title, difficulty: Math.min(10, st.difficulty), successes: ev.successes, botch: ev.outcome === "botch", actorName: message.speaker?.alias ?? "" };
}

/** Встречное: успехи вычитаются, побеждает тот, у кого остался перевес. Карточка — счёт двух сторон друг против друга. */
async function resolveResisted(base, actor, res) {
  const a = base.successes, b = res?.successes ?? 0;
  const net = a - b;
  const winner = net > 0 ? base.actorName : net < 0 ? actor.name : "";
  const line = net === 0 ? t("Contest.Tie") : t("Contest.Wins", { name: winner });
  const side = (name, n, win, cls) => `<div class="r-cc-side ${cls}${win ? " is-win" : ""}"><b>${esc(name)}</b><span>${n}</span></div>`;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="r-roll-card r-contest-card">
      <p class="r-cc-line">${esc(base.title)}</p>
      <div class="r-cc-duel">${side(base.actorName, a, net > 0, "is-a")}<i class="r-cc-vs">${esc(t("Contest.Vs"))}</i>${side(actor.name, b, net < 0, "is-b")}</div>
      <div class="r-outcome"><span class="r-outcome-ribbon"><i class="fa-solid fa-scale-balanced"></i> ${esc(t("Contest.Resisted"))}</span><span class="r-outcome-num"><b>${Math.abs(net)}</b> ${esc(t("Roll.Successes"))}</span></div>
      <div class="r-card-hint">${esc(line)}</div>
    </div>`
  });
}

/** Командное: успехи складываются; провал любого участника портит всё (03). Карточка — кто сколько внёс. */
async function resolveTeam(source, base, actor, res) {
  const prev = source.getFlag(SYSTEM_ID, "team");
  const own = res?.outcome === "botch" ? 0 : res?.successes ?? 0;
  const total = (prev?.total ?? (base.botch ? 0 : base.successes)) + own;
  const botch = !!(prev?.botch || base.botch || res?.outcome === "botch");
  // старые карточки хранили только имена помощников
  const helpers = [...(prev?.helpers ?? []).map(h => typeof h === "string" ? { name: h, n: null } : h), { name: actor.name, n: own, botch: res?.outcome === "botch" }];
  const row = (name, n, bad) => `<li${bad ? ` class="is-botch"` : ""}><b>${esc(name)}</b><span>${bad ? `<i class="fa-solid fa-skull"></i>` : n ?? "—"}</span></li>`;
  const btn = botch ? "" : `<div class="r-card-buttons"><button type="button" data-r-action="assist"><i class="fa-solid fa-handshake-angle"></i> ${esc(t("Contest.MoreHelp"))}</button></div>`;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: { [SYSTEM_ID]: { team: { base, total, botch, helpers } } },
    content: `<div class="r-roll-card r-contest-card">
      <p class="r-cc-line">${esc(base.title)}</p>
      <ul class="r-cc-team">${row(base.actorName, base.successes, base.botch)}${helpers.map(h => row(h.name, h.n, h.botch)).join("")}</ul>
      <div class="r-outcome"><span class="r-outcome-ribbon"><i class="fa-solid fa-people-group"></i> ${esc(t("Contest.Team"))}</span><span class="r-outcome-num"><b>${botch ? 0 : total}</b> ${esc(t("Roll.Successes"))}</span></div>
      ${botch ? `<div class="r-card-hint">${esc(t("Contest.TeamBotch"))}</div>` : ""}${btn}
    </div>`
  });
}
