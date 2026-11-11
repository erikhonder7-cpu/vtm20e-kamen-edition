// module/ui/city-people.mjs
// Карта города — персонажи на плане: кто стоит на карте, жетоны и их разведение, карточка персонажа и группы, перетаскивание.
// Вынесено из citymap.mjs; состояние карты — city-state.mjs.

import { L, esc, T, groundLabel, CHAR_TYPES, canManage, crewOf, ownerColor, statusText, NEAR_M } from "./city-util.mjs";
import { S } from "./city-state.mjs";
import { huntZoneOf } from "./city-domains.mjs";
import { city, pick } from "./citymap.mjs";
import { whereIs, cityFlag, placeActor, leaderOf, groupOf, mapVisible, isHiddenOnMap, meters } from "./citychars.mjs";

/** Персонажи на карте текущего города, которых видит этот пользователь. */
export function mapActors() {
  const id = city().id;
  return game.actors.filter(a => cityFlag(a)?.city === id && mapVisible(a));
}

/** НПС для ведущего: персонажи без игрока — ставятся на карту скрытыми. */
export function npcActors() {
  return game.user.isGM ? game.actors.filter(a => CHAR_TYPES.includes(a.type) && !a.isPlayerCharacter) : [];
}

/**
 * Персонажи деревом папок каталога актёров Foundry (вложенные папки, их цвет и порядок).
 * Раскрытые папки запоминаются у пользователя (view().open, ключ «actors:<id папки>»); при поиске всё раскрыто.
 */
export function actorTree(list, row, v) {
  const byName = (x, y) => x.name.localeCompare(y.name, "ru");
  const inFolder = new Map();
  for (const a of list) {
    const k = a.folder?.id ?? "";
    if (!inFolder.has(k)) inFolder.set(k, []);
    inFolder.get(k).push(a);
  }
  // папки, в которых (глубже тоже) есть кто-то из списка, и сколько их там
  const count = new Map();
  for (const [k, arr] of inFolder) for (let f = game.folders.get(k); f; f = f.folder) count.set(f.id, (count.get(f.id) ?? 0) + arr.length);
  const folders = game.folders.filter(f => f.type === "Actor" && count.has(f.id));
  const level = parent => folders.filter(f => (f.folder?.id ?? null) === parent)
    .sort((x, y) => (x.sort - y.sort) || byName(x, y))
    .map(f => {
      const open = !!S.search || !!v.open[`actors:${f.id}`];
      const color = f.color?.css ?? "";
      return `<details class="rc-afold" data-afold="${f.id}" ${open ? "open" : ""}${color ? ` style="--fc:${esc(color)}"` : ""}>
        <summary><i class="fa-solid fa-folder${open ? "-open" : ""}"></i><span>${esc(f.name)}</span><b>${count.get(f.id)}</b></summary>
        <div class="rc-afold-body">${level(f.id)}${(inFolder.get(f.id) ?? []).length ? `<ul class="rc-chars">${inFolder.get(f.id).sort(byName).map(row).join("")}</ul>` : ""}</div>
      </details>`;
    }).join("");
  const loose = (inFolder.get("") ?? []).sort(byName);
  return level(null) + (loose.length ? `<ul class="rc-chars">${loose.map(row).join("")}</ul>` : "");
}

/** Фишки персонажей: портрет в кольце цвета игрока. */
export function drawChars() {
  if (!S.map) return;
  // Попутчики своих фишек не имеют — их лица на фишке ведущего группы.
  const want = new Map(mapActors().filter(a => !leaderOf(a)).map(a => [a.id, a]));
  for (const [id, p] of S.charPins) if (!want.has(id)) { p.marker.remove(); S.charPins.delete(id); }
  for (const [id, a] of want) {
    const w = whereIs(a);
    const sel = S.picked?.kind === "char" && S.picked.id === id;
    // переставить фишку — перетаскиванием: свою — владелец, любую — ведущий
    const drag = canManage(a);
    const crew = crewOf(a);
    const hid = game.user.isGM && isHiddenOnMap(a);
    const sig = JSON.stringify([a.img, a.name, sel, ownerColor(a), drag, hid, crew.map(c => [c.id, c.img])]);
    let p = S.charPins.get(id);
    if (p?.sig !== sig) {
      p?.marker.remove();
      const el = document.createElement("div");
      el.className = `rc-char${sel ? " is-picked" : ""}${hid ? " is-hidden" : ""}`;
      el.style.setProperty("--c", ownerColor(a));
      el.innerHTML = `<span class="rc-char-face"><img src="${esc(a.img)}" alt=""></span>`
        + (hid ? `<i class="fa-solid fa-eye-slash rc-char-hid" data-tooltip="${esc(T("HiddenTip"))}"></i>` : "")
        + `<b>${esc(a.name)}</b>`
        + (crew.length ? `<span class="rc-crew">${crew.map(c => `<img src="${esc(c.img)}" alt="" data-crew="${c.id}" data-tooltip="${esc(c.name)}" style="--c:${ownerColor(c)}">`).join("")}</span>` : "");
      el.addEventListener("click", ev => { ev.stopPropagation(); pick("char", ev.target.closest("[data-crew]")?.dataset.crew ?? id); });
      const marker = new S.gl.Marker({ element: el, anchor: "top", offset: [0, -24], draggable: drag }).setLngLat([w.lng, w.lat]).addTo(S.map);
      marker.on("dragend", () => { const ll = marker.getLngLat(); placeActor(a, city().id, ll.lat, ll.lng); });
      p = { marker, sig };
      S.charPins.set(id, p);
    }
    p.marker.setLngLat([w.lng, w.lat]);
  }
  spreadChars(want);
}

/**
 * Фишки, что на экране легли друг на друга (вышли из группы, стоят у одного места), — веером вокруг
 * общей середины, чтобы каждую можно было выделить; подписи в стопке — по наведению. Координаты
 * не меняются, только сдвиг на экране; пересчитывается при каждом масштабе.
 */
export function spreadChars(want = null) {
  if (!S.map) return;
  want ??= new Map(mapActors().filter(a => !leaderOf(a)).map(a => [a.id, a]));
  const items = [...want.values()].map(a => {
    const w = whereIs(a), p = S.charPins.get(a.id);
    return w && p ? { id: a.id, p, xy: S.map.project([w.lng, w.lat]) } : null;
  }).filter(Boolean);
  const done = new Set(), R = 36, NEAR = 54;
  for (const x of items) {
    if (done.has(x.id)) continue;
    // все, кто ближе NEAR пикселей к кому-то из стопки
    const stack = [x]; done.add(x.id);
    for (let i = 0; i < stack.length; i++) for (const y of items) {
      if (!done.has(y.id) && Math.hypot(stack[i].xy.x - y.xy.x, stack[i].xy.y - y.xy.y) < NEAR) { stack.push(y); done.add(y.id); }
    }
    const cx = stack.reduce((s, y) => s + y.xy.x, 0) / stack.length, cy = stack.reduce((s, y) => s + y.xy.y, 0) / stack.length;
    stack.forEach((y, i) => {
      const r = stack.length > 1 ? R + (stack.length > 4 ? 8 : 0) : 0, ang = -Math.PI / 2 + (2 * Math.PI * i) / stack.length;
      const dx = stack.length > 1 ? cx + Math.cos(ang) * r - y.xy.x : 0, dy = stack.length > 1 ? cy + Math.sin(ang) * r - y.xy.y : 0;
      y.p.marker.setOffset([Math.round(dx), -24 + Math.round(dy)]);
      y.p.marker.getElement().classList.toggle("is-stacked", stack.length > 1);
    });
  }
}

export function clearChars() {
  for (const p of S.charPins.values()) p.marker.remove();
  S.charPins.clear();
}

export function charCard(a) {
  const btn = (act, icon, label, tip = "", cls = "") => `<a class="rc-ibtn ${cls}" data-act="${act}" data-tooltip="${esc(tip || label)}"><i class="fa-solid ${icon}"></i><span>${esc(label)}</span></a>`;
  const lead = leaderOf(a);
  return `<section class="rc-card rc-charcard" style="--c:${ownerColor(a)}">
    <header class="rc-card-head">
      <img src="${esc(a.img)}" alt="">
      <div><b>${esc(a.name)}</b><small data-eta="${a.id}">${esc(statusText(a))}</small></div>
      <a class="rc-x" data-act="unpick" data-tooltip="${esc(L("Close"))}"><i class="fa-solid fa-xmark"></i></a>
    </header>
    <div class="rc-ibtns">
      ${btn("flyChar", "fa-crosshairs", T("Find"))}
      ${a.hasBlood && a.isOwner && huntZoneOf(a) ? btn("huntHere", "fa-moon", T("HuntHere"), T("HuntHereHint", { zone: huntZoneOf(a).name || groundLabel(huntZoneOf(a).grounds) })) : ""}
      ${a.testUserPermission(game.user, "OBSERVER") ? btn("sheet", "fa-id-card", T("Sheet")) : ""}
      ${game.user.isGM ? (isHiddenOnMap(a) ? btn("toggleHidden", "fa-eye", T("Show"), T("ShowHint"), "is-warn") : btn("toggleHidden", "fa-eye-slash", T("Hide"), T("HideHint"))) : ""}
      ${canManage(a) ? btn("unplace", "fa-trash", T("Unplace"), "", "rc-danger") : ""}
    </div>
    ${groupBlock(a, lead)}
    ${canManage(a) ? `<p class="rc-callout"><i class="fa-solid fa-hand-pointer"></i> ${esc(T("DragHint"))}</p>` : ""}
  </section>`;
}

/**
 * Группа в карточке: кто едет вместе, «отделиться», «взять с собой тех, кто рядом» и
 * «присоединить» — своего персонажа (ведущему игры — любого на карте) к этой группе.
 */
export function groupBlock(a, lead) {
  const root = lead ?? a;
  const crew = [root, ...crewOf(root)].filter(x => mapVisible(x));
  const inGroup = new Set(groupOf(root).map(x => x.id));
  const here = whereIs(root);
  const cands = mapActors().filter(x => !inGroup.has(x.id) && canManage(x));
  const near = here ? cands.filter(x => { const w = whereIs(x); return w && meters([w.lng, w.lat], [here.lng, here.lat]) <= NEAR_M; }) : [];
  const chip = x => `<span class="rc-gchip ${x === root ? "is-lead" : ""}" style="--c:${ownerColor(x)}"><img src="${esc(x.img)}" alt=""><span>${esc(x.name)}</span>`
    + (x !== root && canManage(x) ? `<a data-act="leaveGroup" data-actor="${x.id}" data-tooltip="${esc(T("LeaveGroup"))}"><i class="fa-solid fa-person-walking-arrow-right"></i></a>` : "")
    + (x === root ? `<i class="fa-solid fa-crown" data-tooltip="${esc(T("GroupLead"))}"></i>` : "") + `</span>`;
  const add = cands.length ? `<div class="rc-row rc-gadd"><select data-gpick>${cands.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select>
      <a class="r-btn" data-act="joinGroup" data-tooltip="${esc(T("JoinHint", { name: root.name }))}"><i class="fa-solid fa-user-plus"></i> ${esc(T("Join"))}</a></div>` : "";
  if (crew.length < 2 && !cands.length) return "";
  return `<div class="rc-group">
    <h4><i class="fa-solid fa-people-group"></i> ${esc(crew.length > 1 ? T("GroupTitle", { n: crew.length }) : T("GroupNone"))}</h4>
    ${crew.length > 1 ? `<div class="rc-gchips">${crew.map(chip).join("")}</div>` : `<p class="rc-note">${esc(T("GroupHint"))}</p>`}
    ${near.length ? `<a class="r-btn rc-gnear" data-act="groupNear"><i class="fa-solid fa-people-arrows"></i> ${esc(T("GroupNear", { n: near.length }))}</a>` : ""}
    ${add}
  </div>`;
}

/** Бросили актёра из списка Foundry на карту — поставить туда. */
export async function onDrop(ev) {
  let data;
  try { data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev); } catch (e) { return; }
  if (data?.type !== "Actor" || !S.map) return;
  ev.preventDefault();
  const a = await fromUuid(data.uuid);
  if (!a?.isOwner) return ui.notifications.warn(T("NotYours"));
  const r = S.map.getCanvas().getBoundingClientRect();
  const ll = S.map.unproject([ev.clientX - r.left, ev.clientY - r.top]);
  await placeActor(a, city().id, ll.lat, ll.lng, "", npcHidden(a));
  pick("char", a.id);
}

/** НПС, впервые поставленный на карту, — скрыт от игроков (ведущий покажет кнопкой «Показать»). */
export function npcHidden(a) {
  if (a.hasPlayerOwner || cityFlag(a)?.hidden !== undefined) return {};
  ui.notifications.info(T("NpcPlacedHidden", { name: a.name }));
  return { hidden: true };
}
