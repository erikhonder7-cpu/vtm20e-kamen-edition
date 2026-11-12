// module/ui/city-util.mjs
// Карта города — помощники без состояния: подписи, подсказка у курсора, геометрия зон, цвета и права владельцев,
// кто из актёров ставится на карту. Вынесено из citymap.mjs.

import { whereIs, leaderOf, followersOf, mapVisible } from "./citychars.mjs";


export const ID = "r-citymap";

export const L = (k, d) => d ? game.i18n.format(`VTM20.City.${k}`, d) : game.i18n.localize(`VTM20.City.${k}`);

export const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

export const uid = () => foundry.utils.randomID(10);

/** Записка над картой: что это за место, метка или пятно. x, y — в пикселях карты; null — спрятать. */
export function showTip(x, y, kicker, title, text, lines = []) {
  const tip = document.querySelector(`#${ID} .rc-stain-tip`);
  if (!tip) return;
  if (x == null || (!title && !text)) { tip.hidden = true; return; }
  tip.innerHTML = `${kicker ? `<small>${esc(kicker)}</small>` : ""}<b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ""}`
    + lines.map(l => `<span class="rc-tip-line"><i class="fa-solid ${l.icon}"></i>${esc(l.text)}</span>`).join("");
  const box = tip.parentElement.getBoundingClientRect();
  tip.hidden = false;
  // у правого и нижнего края — записка по другую сторону курсора
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = `${x + 16 + w > box.width ? x - w - 12 : x + 16}px`;
  tip.style.top = `${y + 12 + h > box.height ? Math.max(4, y - h - 8) : y + 12}px`;
}

/** Домен-актёр, привязанный к зоне или обведённому домену (system.zone — id зоны или домена). */
export const domainActorOn = id => id ? game.actors.find(a => a.type === "domain" && a.system.zone === id) ?? null : null;

/** Цвет домена на карте — цвет игрока, владеющего хозяином (у котерии — её игрока); без хозяина — нет. */
export function domainActorColor(da) {
  const o = da ? game.actors.get(da.system.owner) : null;
  return o ? ownerColor(o) : null;
}

export const T = (k, d) => L(`Travel.${k}`, d);

/** Цвет угодий на слое «Угодья»: от трущоб (кроваво-красный) к охраняемому кварталу (синий). */
export const GROUND_COLORS = { slums: "#9e1f24", poor: "#7a3a6e", business: "#c9a46a", industrial: "#7d6a45", suburb: "#4f6e55", guarded: "#2f3b55" };

export const groundLabel = k => game.i18n.localize(`VTM20.Hunt.Ground.${k}`);

/** Точка внутри многоугольника зоны (points — [широта, долгота]). */
export function inZone(z, lat, lng) {
  let inside = false;
  for (let i = 0, j = z.points.length - 1; i < z.points.length; j = i++) {
    const [ai, bi] = z.points[i], [aj, bj] = z.points[j];
    if ((bi > lng) !== (bj > lng) && lat < (aj - ai) * (lng - bi) / (bj - bi) + ai) inside = !inside;
  }
  return inside;
}

export const canEditDomain = d => game.user.isGM || d.user === game.user.id;

/** Чей домен можно обвести: свои Сородичи; ведущему — все. */
export const domainOwners = () => game.actors.filter(a => a.type === "vampire" && (game.user.isGM || a.isOwner));

/** Кто охотится из карточки зоны: свой персонаж игрока; ведущему — выделенный жетон. */
export function hunter() {
  const ok = a => a?.hasBlood && a.isOwner;
  if (game.user.isGM) return canvas?.tokens?.controlled?.map(t => t.actor).find(ok) ?? null;
  return [game.user.character, ...game.actors.filter(a => a.isOwner)].find(ok) ?? null;
}

export const canEdit = it => game.user.isGM || !!it?.mine;

export const CHAR_TYPES = ["vampire", "ghoul", "mortal", "demon", "hunter", "creature", "spirit"];

/** Кого можно поставить на карту: свои; ведущему — все персонажи игроков. */
export function placeableActors() {
  return game.actors.filter(a => CHAR_TYPES.includes(a.type) && (game.user.isGM ? a.isPlayerCharacter : a.isOwner));
}

/** Подпись под именем в списке: клан Сородича, иначе тип персонажа. */
export function kindOf(a) {
  return (a.type === "vampire" && a.clanLabel) || game.i18n.localize(CONFIG.Actor.typeLabels?.[a.type] ?? a.type);
}

/** Распоряжаться персонажем (поставить, вывести из группы): владелец или ведущий игры. */
export const canManage = a => !!a?.isOwner;

/** Видимые этому пользователю попутчики. */
export const crewOf = a => followersOf(a).filter(mapVisible);

export function ownerColor(a) {
  const u = game.users.find(u => !u.isGM && a.testUserPermission(u, "OWNER"));
  return u?.color?.css ?? "#b0404c";
}

export function statusText(a) {
  const lead = leaderOf(a);
  if (lead) return T("WithLeader", { name: lead.name, status: statusText(lead) });
  const w = whereIs(a);
  if (!w) return T("NotPlaced");
  return w.place || T("Standing");
}

/** «Рядом» для сбора группы — в пределах квартала. */
export const NEAR_M = 250;

export const centroid = pts => pts.reduce(([a, b], [x, y]) => [a + x / pts.length, b + y / pts.length], [0, 0]);

/** Чернила подписи булавки: на гравюре — тёмные с бумажным ореолом, ночью — кость с угольным. Прописаны в самой
 *  подписи, а не только в CSS: так ореол не теряется, если стили шторы ещё не подгрузились или их перебили. */
export const PIN_INK = {
  plan: "color:#22140a;text-shadow:0 0 2px #f4ead2,0 0 2px #f4ead2,0 0 3px #f4ead2,0 0 6px rgba(244,234,210,.95);-webkit-text-stroke:.25px rgba(244,234,210,.6)",
  night: "color:#f1e3c3;text-shadow:0 0 2px #0e0805,0 0 2px #0e0805,0 0 3px #0e0805,0 0 6px rgba(14,8,5,.95)"
};

export const RATES = [1, 10, 60, 300];

/** Инспектор — под часами и плашкой жара Маскарада: у ведущего часы с кнопками выше, плашка появляется не всегда. */
export function placeInspector() {
  const root = document.getElementById(ID), box = root?.querySelector(".rc-inspector");
  if (!box || box.hidden) return;
  const host = box.offsetParent ?? root, top0 = host.getBoundingClientRect().top;
  const above = [...root.querySelectorAll(".rc-clock, .rc-masq-plate:not([hidden])")].filter(el => el.offsetParent === host || el.parentElement === box.parentElement);
  const bottom = Math.max(0, ...above.map(el => el.getBoundingClientRect().bottom - top0));
  const top = Math.round(bottom ? bottom + 8 : 78);
  if (box.style.top !== `${top}px`) { box.style.top = `${top}px`; box.style.maxHeight = `calc(100% - ${top + 18}px)`; }
}
