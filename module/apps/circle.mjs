// module/apps/circle.mjs
// Круг призраков (Wraith 20) — актёр-группа «coterie» вида «circle»:
//   · общее Обиталище (гл. 4, Предыстория «Обиталище»: с согласия рассказчика игроки складывают точки в общее Обиталище) —
//     общий факт «Обиталище» в окне общих фактов; в Обиталище Покров ниже на рейтинг — участнику берётся большее из своего и общего;
//   · крусибл «Орфея» (приложение «Orpheus»): ритуал скрепления — по пункту Воли с каждого участника; в крусибле делятся Пафосом
//     касанием и сопрягаются (apps/underworld.mjs) — с участниками своего крусибла; чужой лист правит ведущий (сокет).

import { SYSTEM_ID } from "../config.mjs";
import { coterieFromActor, poolValue } from "./coterie.mjs";

const CHANNEL = `system.${SYSTEM_ID}`;
const t = (k, d) => d ? game.i18n.format(`VTM20.Wraith.Circle.${k}`, d) : game.i18n.localize(`VTM20.Wraith.Circle.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
/** Имя общего факта — как у Предыстории призрака (data/wraith.json). */
export const HAUNT_POOL = "Обиталище";

/** Круги, где состоит призрак. */
export const circlesOf = actor => game.actors?.filter(g => g.type === "coterie" && g.system.kind === "circle" && (g.system.members ?? []).includes(actor?.id)) ?? [];

/** Рейтинг общего Обиталища (наибольший среди Кругов призрака). */
export function circleHaunt(actor) {
  return Math.max(0, ...circlesOf(actor).filter(g => HAUNT_POOL in (g.system.pools ?? {})).map(g => poolValue(coterieFromActor(g), HAUNT_POOL)));
}

/** Крусибл призрака: Круг, скреплённый ритуалом «Орфея». */
export const crucibleOf = actor => circlesOf(actor).find(g => g.system.circle?.crucible) ?? null;

/** Участники крусибла, кроме самого призрака. */
export function crucibleMates(actor) {
  const c = crucibleOf(actor);
  return c ? c.system.members.map(id => game.actors.get(id)).filter(a => a?.type === "wraith" && a.id !== actor.id) : null;
}

/** Строка участника Круга на листе группы: Пафос, Корпус, Воля (Ангст — только ведущему). */
export function circleCard(a) {
  if (a?.type !== "wraith") return null;
  const w = a.system.wraith, h = a.system.health, gm = game.user.isGM;
  return { pathos: w.pathos.value, pathosMax: w.pathos.max, corpus: h.value ?? 0, corpusMax: h.max ?? 0, will: a.system.willpower.temporary, angst: gm ? w.shadow?.angst?.temporary ?? 0 : null,
    projector: !!w.projector?.on };
}

/**
 * Ритуал скрепления крусибла: по пункту Воли с каждого призрака Круга. У кого Воли нет — ритуал срывается
 * (книга: «малейшее колебание может сорвать»). Только ведущий: Воля пишется в чужие листы.
 */
export async function bondCrucible(group) {
  if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("VTM20.Notify.GMOnly"));
  const members = group.system.members.map(id => game.actors.get(id)).filter(a => a?.type === "wraith");
  if (members.length < 2) return ui.notifications.warn(t("NeedTwo"));
  const empty = members.filter(a => (a.system.willpower.temporary ?? 0) < 1);
  if (empty.length) {
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: group }),
      content: `<div class="r-notice r-type-wraith is-warn"><i class="fa-solid fa-link-slash"></i> ${t("BondFailed", { name: esc(group.name), who: esc(empty.map(a => a.name).join(", ")) })}</div>` });
  }
  for (const a of members) await a.update({ "system.willpower.temporary": a.system.willpower.temporary - 1 });
  await group.update({ "system.circle.crucible": true });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: group }),
    content: `<div class="r-notice r-type-wraith"><i class="fa-solid fa-link"></i> ${t("Bonded", { name: esc(group.name), n: members.length })}</div>` });
}

/** Распустить крусибл (ведущий). */
export async function breakCrucible(group) {
  if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("VTM20.Notify.GMOnly"));
  return group.update({ "system.circle.crucible": false });
}

/**
 * Передать Пафос касанием: свой лист — сразу; чужой — просьбой ведущему (он проверит, что оба в одном крусибле).
 * @returns {Promise<number|boolean|null>} сколько передано (или true, если ушло ведущему)
 */
export async function givePathos(from, to, n) {
  if (to.isOwner && from.isOwner) return movePathos(from, to, n);
  if (!game.users.activeGM) { ui.notifications.warn(game.i18n.localize("VTM20.Wraith.Guide.NoGM")); return null; }
  game.socket.emit(CHANNEL, { op: "circlePathos", user: game.user.id, from: from.uuid, to: to.uuid, n });
  return true;
}

async function movePathos(from, to, want) {
  const room = Math.max(0, (to.system.wraith.pathos.max ?? 10) - to.system.wraith.pathos.value);
  const n = Math.min(from.system.wraith.pathos.value, room, want);
  if (n <= 0) return 0;
  await from.update({ "system.wraith.pathos.value": from.system.wraith.pathos.value - n });
  await to.update({ "system.wraith.pathos.value": to.system.wraith.pathos.value + n });
  return n;
}

/** Ведущий исполняет передачу Пафоса между участниками одного крусибла и пишет итог в чат. */
Hooks.once("ready", () => game.socket.on(CHANNEL, async d => {
  if (d?.op !== "circlePathos" || !game.users.activeGM?.isSelf) return;
  const user = game.users.get(d.user), from = fromUuidSync(d.from), to = fromUuidSync(d.to);
  if (!user || from?.type !== "wraith" || to?.type !== "wraith" || !from.testUserPermission(user, "OWNER")) return;
  if (!(crucibleMates(from) ?? []).some(a => a.id === to.id)) return;
  const n = await movePathos(from, to, Math.clamp(Math.round(Number(d.n) || 0), 0, 10));
  const { say } = await import("./wraith.mjs");
  if (n) await say(from, "fa-hand-holding-heart", game.i18n.format("VTM20.Wraith.Orph.Shared", { name: esc(from.name), to: esc(to.name), n }));
  else ui.notifications.warn(game.i18n.localize("VTM20.Wraith.Orph.NoRoom"));
}));
