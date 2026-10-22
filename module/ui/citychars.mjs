// module/ui/citychars.mjs
// Персонажи на карте «Город»: где стоят, группы, видимость.
//
// Положение персонажа — флаг актёра `city`: { city, lat, lng, place, follow, hidden }. Переставляют
// фишку перетаскиванием (владелец и ведущий). Группа: у попутчика во флаге `follow` — id ведущего
// группы; своего места у попутчика нет, он всегда там же, где ведущий. `hidden` — фишку видят только
// ведущий игры и владельцы: НПС ставятся на карту скрытыми, пока ведущий не покажет их игрокам.

import { SYSTEM_ID } from "../config.mjs";

const RAD = Math.PI / 180;
/** Расстояние в метрах между [lng, lat]. */
export function meters(a, b) {
  const dLat = (b[1] - a[1]) * RAD, dLng = (b[0] - a[0]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

export const cityFlag = actor => actor?.getFlag(SYSTEM_ID, "city") ?? null;

/** Где персонаж: { lat, lng, place }; попутчик — там же, где ведущий группы. */
export function whereIs(actor) {
  const f = cityFlag(actor);
  if (!f) return null;
  const lead = leaderOf(actor);
  if (lead) { const w = whereIs(lead); if (w) return { ...w, follow: lead.id }; }
  return { lat: f.lat, lng: f.lng, place: f.place ?? "" };
}

/** Ведущий группы, с которым ходит персонаж (null — сам по себе). */
export function leaderOf(actor) {
  const f = cityFlag(actor);
  if (!f?.follow || f.follow === actor.id) return null;
  const lead = game.actors.get(f.follow);
  const lf = cityFlag(lead);
  return lead && lf?.city === f.city && !lf.follow ? lead : null;
}
/** Попутчики ведущего (в том же городе). */
export function followersOf(actor) {
  const city = cityFlag(actor)?.city;
  return city ? game.actors.filter(a => a !== actor && cityFlag(a)?.follow === actor.id && cityFlag(a)?.city === city) : [];
}
/** Вся группа: ведущий и попутчики. */
export function groupOf(actor) {
  const lead = leaderOf(actor) ?? actor;
  return [lead, ...followersOf(lead)];
}
/** Скрыта ли фишка от игроков. Без отметки — видны персонажи игроков и те, кого можно смотреть. */
export function isHiddenOnMap(actor) {
  const h = cityFlag(actor)?.hidden;
  return h === true || (h === undefined && !actor.hasPlayerOwner);
}
/** Видит ли этот пользователь персонажа на карте. */
export function mapVisible(actor) {
  if (game.user.isGM || actor.isOwner) return true;
  const h = cityFlag(actor)?.hidden;
  if (h === true) return false;
  if (h === false) return true;
  return actor.hasPlayerOwner || actor.testUserPermission(game.user, "OBSERVER");
}

/** Поставить персонажа в точку (из группы он при этом выходит). */
export function placeActor(actor, cityId, lat, lng, place = "", extra = {}) {
  const old = cityFlag(actor);
  return actor.setFlag(SYSTEM_ID, "city", { city: cityId, lat, lng, place, follow: null, hidden: old?.hidden, ...extra });
}

/** Присоединить к группе того, к кому идут (или к его ведущему). */
export async function joinGroup(actor, to) {
  const lead = leaderOf(to) ?? to;
  if (lead === actor) return;
  const w = whereIs(lead);
  if (!w) return;
  // Свою группу ведущий приводит с собой — если может распоряжаться попутчиками.
  for (const f of followersOf(actor)) if (f.isOwner) await f.setFlag(SYSTEM_ID, "city", { ...cityFlag(f), follow: lead.id });
  await actor.setFlag(SYSTEM_ID, "city", { ...cityFlag(actor), city: cityFlag(lead).city, lat: w.lat, lng: w.lng, place: w.place ?? "", follow: lead.id });
}
/** Выйти из группы там, где группа сейчас. */
export function leaveGroup(actor) {
  const w = whereIs(actor);
  if (!w) return;
  return actor.setFlag(SYSTEM_ID, "city", { ...cityFlag(actor), lat: w.lat, lng: w.lng, place: w.place ?? "", follow: null });
}
