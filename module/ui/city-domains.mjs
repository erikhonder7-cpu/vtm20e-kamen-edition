// module/ui/city-domains.mjs
// Карта города — домены и места: домены на плане (чьи, где, сохранение), охота от карты, место сцены и «показать на карте».
// Вынесено из citymap.mjs; состояние карты — city-state.mjs.

import { SYSTEM_ID } from "../config.mjs";
import { masqueradeAt } from "./masquerade.mjs";
import { EXT } from "./city-ext.mjs";
import { L, esc, domainActorOn, domainActorColor, inZone, canEditDomain, domainOwners, centroid } from "./city-util.mjs";
import { S } from "./city-state.mjs";
import { city, poiView, poiIndex, openCity, drawOverlay, pick, fly, drawBody } from "./citymap.mjs";
import { whereIs } from "./citychars.mjs";

/** Метка хроники или готовое место текущего города, связанное со сценой. */
export function sceneSpot(sceneId) {
  const c = city();
  const m = c.markers.find(x => x.sceneId === sceneId && (game.user.isGM || !x.gmOnly));
  if (m) return { kind: "marker", id: m.id, lat: m.lat, lng: m.lng };
  for (const [id, x] of poiIndex()) {
    const p = poiView(x.base, x.folder);
    if (p.sceneId === sceneId && !p.deleted && (game.user.isGM || !p.gmOnly)) return { kind: "poi", id, lat: p.lat, lng: p.lng };
  }
  return null;
}

/** Есть ли у сцены место на карте — по данным мира, не открывая карту (для кнопки в нексусе). */
export function sceneHasSpot(sceneId) {
  if (!game.settings.get(SYSTEM_ID, "cityMapEnabled")) return false;
  const raw = game.settings.get(SYSTEM_ID, "cityMap") ?? {};
  const c = raw.cities?.[raw.current] ?? Object.values(raw.cities ?? {})[0] ?? raw;
  return (c.markers ?? []).some(m => m.sceneId === sceneId && (game.user.isGM || !m.gmOnly))
    || Object.values(c.overrides ?? {}).some(o => o?.sceneId === sceneId && !o.deleted);
}

/** Открыть город на месте сцены и выбрать его. */
export async function showSceneOnMap(sceneId) {
  await openCity();
  // штора могла уже открываться (busy) или карта ещё грузит стиль — ждём готовности, а не бросаем
  for (let i = 0; i < 60 && !(S.state && S.map?.loaded?.()); i++) await new Promise(r => setTimeout(r, 100));
  const spot = S.state && S.map ? sceneSpot(sceneId) : null;
  if (!spot) return ui.notifications.info(L("NoSpot"));
  fly(spot.lat, spot.lng, 17);
  pick(spot.kind, spot.id);
}

/** Зоны и метки хроники текущего города — по данным мира, не открывая карту (домены «Двора»). */
export function citySpots() {
  const raw = game.settings.get(SYSTEM_ID, "cityMap") ?? {};
  const c = raw.cities?.[raw.current] ?? Object.values(raw.cities ?? {})[0] ?? raw;
  const vis = x => game.user.isGM || !x.gmOnly;
  const cityId = raw.current ?? Object.keys(raw.cities ?? {})[0];
  return {
    city: c.name || L("DefaultCity"),
    zones: (c.zones ?? []).filter(vis).map(z => ({ kind: "zone", id: z.id, name: z.name || L("Zone"), color: z.color || "#b0404c" })),
    markers: (c.markers ?? []).filter(vis).map(m => ({ kind: "marker", id: m.id, name: m.name || "—" })),
    // обведённые игроками домены (флаг пользователя cityDomains) — к ним тоже можно привязать актёра «Домен»
    domains: game.users.contents.flatMap(u => ((u.getFlag(SYSTEM_ID, DOMAIN_FLAG) ?? {})[cityId] ?? []).map(d => ({ kind: "domain", id: d.id,
      name: L("DomainLabel", { name: game.actors.get(d.owner)?.name ?? L("DomainNobody") }) })))
  };
}

/** Строка о домене-актёре для карточки зоны: хозяин, размер, кнопка листа; без актёра — «Создать домен» (кто может создавать актёров). */
export function domainLinkHtml(id) {
  const da = domainActorOn(id);
  if (da) {
    const o = game.actors.get(da.system.owner), seen = da.testUserPermission(game.user, "LIMITED");
    return `<div class="rc-domain-link" style="--dc:${esc(domainActorColor(da) ?? "#b0404c")}"><i class="fa-solid fa-chess-rook"></i>
      <span><b>${esc(da.name)}</b><small>${esc(L("DomainActorLine", { owner: o?.name ?? L("DomainNobody"), n: da.system.rating ?? 0 }))}</small></span>
      ${seen ? `<a class="r-btn" data-act="openDomain" data-id="${da.id}"><i class="fa-solid fa-book-open"></i> ${esc(L("DomainSheet"))}</a>` : ""}</div>`;
  }
  return game.user.can("ACTOR_CREATE") ? `<div class="rc-edit-acts"><a class="r-btn" data-act="makeDomain" data-tooltip="${esc(L("MakeDomainHint"))}"><i class="fa-solid fa-chess-rook"></i> ${esc(L("MakeDomain"))}</a></div>` : "";
}

/** Создать актёра «Домен» по зоне или обведённому домену: имя, привязка, угодья и хозяин — сразу. Экспорт — для автотестов. */
export async function makeDomainFor(kind, it) {
  if (domainActorOn(it.id)) return;
  let owner = null, ground = "", name = "";
  if (kind === "zone") {
    const nm = String(it.owner ?? "").trim().toLowerCase();
    owner = nm ? game.actors.find(a => a.name.trim().toLowerCase() === nm) ?? null : null;
    ground = it.grounds || "";
    name = it.name || (owner ? L("DomainOf", { name: owner.name }) : L("Zone"));
  } else {
    owner = game.actors.get(it.owner) ?? null;
    // угодья — у зоны рассказчика, в которую попадает середина обведённого домена (карта может быть закрыта — зоны из настроек мира)
    const [la, ln] = centroid(it.points);
    const raw = game.settings.get(SYSTEM_ID, "cityMap") ?? {}, zones = S.state ? city().zones : (raw.cities?.[raw.current] ?? Object.values(raw.cities ?? {})[0] ?? {}).zones ?? [];
    ground = zones.find(z => z.grounds && inZone(z, la, ln))?.grounds ?? "";
    name = L("DomainOf", { name: owner?.name ?? L("DomainNobody") });
  }
  const da = await Actor.create({ name, type: "domain", img: owner?.img,
    system: { zone: it.id, owner: owner?.id ?? "", ...(ground ? { ground } : {}) },
    ownership: owner ? Object.fromEntries(Object.entries(owner.ownership ?? {}).filter(([k]) => k !== "default")) : {} });
  if (!da) return;
  ui.notifications.info(L("DomainMade", { name: da.name }));
  if (S.map) { drawBody(); drawOverlay(); }
  da.sheet.render(true);
}

/** Открыть город на зоне или метке и выбрать её (домен из «Двора»). */
export async function showSpotOnMap(kind, id) {
  await openCity();
  for (let i = 0; i < 60 && !(S.state && S.map?.loaded?.()); i++) await new Promise(r => setTimeout(r, 100));
  if (!S.state || !S.map) return;
  const c = city();
  const it = kind === "zone" ? c.zones.find(z => z.id === id) : kind === "domain" ? domainById(id) : c.markers.find(m => m.id === id);
  if (!it) return ui.notifications.info(L("NoSpotFound"));
  const area = kind === "zone" || kind === "domain";
  const [lat, lng] = area ? centroid(it.points) : [it.lat, it.lng];
  fly(lat, lng, area ? 15 : 17);
  pick(kind, id);
}

/** Зона с угодьями, в которой стоит персонаж (самая маленькая из подходящих не нужна — первая по списку). */
export const huntZoneOf = a => { const w = whereIs(a); return w ? city().zones.find(z => z.grounds && (game.user.isGM || !z.gmOnly) && inZone(z, w.lat, w.lng)) : null; };

/** Место для окна охоты: название, угодья и хозяин домена (поле «Владелец» зоны — имя персонажа). Экспорт — для автотестов. */
export function huntPlace(z, at = centroid(z.points)) {
  // жар Маскарада в этой точке (ui/masquerade.mjs) — надбавка к сложности охоты
  const masq = masqueradeAt(city(), at[0], at[1]).diff;
  // домен-актёр на этой зоне или на обведённом домене в этой точке (V20, факт «Домен»): хозяин, гости, размер и защищённость
  const da = domainActorOn(z.id) ?? domainActorOn(domainAt(at[0], at[1])?.id);
  if (da) {
    const own = game.actors.get(da.system.owner);
    return { name: da.name, ground: da.system.ground || z.grounds, masq, owner: { id: own?.id ?? null, name: own?.name ?? da.name },
      domain: { id: da.id, size: da.system.rating ?? 0, security: da.system.security ?? 0, guests: [...(da.system.guests ?? [])] } };
  }
  // хозяин: обведённый домен в этой точке, иначе поле «Владелец» зоны (имя персонажа)
  const dom = domainAt(at[0], at[1]);
  if (dom) return { name: z.name || L("Zone"), ground: z.grounds, masq, owner: { id: dom.owner ?? null, name: dom.name } };
  const owner = String(z.owner ?? "").trim(), who = owner ? game.actors.find(x => x.name.trim().toLowerCase() === owner.toLowerCase()) : null;
  return { name: z.name || L("Zone"), ground: z.grounds, masq, owner: owner ? { id: who?.id ?? null, name: who?.name ?? owner } : null };
}

export const DOMAIN_FLAG = "cityDomains";

export const domainsOf = u => (u.getFlag(SYSTEM_ID, DOMAIN_FLAG) ?? {})[city().id] ?? [];

/** Все домены города от всех пользователей: цвет — цвет игрока, имя — хозяин. */
export function allDomains() {
  return game.users.contents.flatMap(u => domainsOf(u).map(d => ({ ...d, user: u.id, color: u.color?.css ?? "#c4474c",
    name: game.actors.get(d.owner)?.name ?? L("DomainNobody") })));
}

export const domainById = id => allDomains().find(d => d.id === id);

export const domainAt = (lat, lng) => allDomains().find(d => inZone(d, lat, lng));

export async function saveDomains(user, list) {
  const all = foundry.utils.deepClone(user.getFlag(SYSTEM_ID, DOMAIN_FLAG) ?? {});
  all[city().id] = list;
  await user.setFlag(SYSTEM_ID, DOMAIN_FLAG, all);
}

/** Площадь многоугольника — при щелчке выбирается меньшая из перекрытых областей (домен внутри зоны и наоборот). */
export const areaOf = pts => Math.abs(pts.reduce((s, [a, b], i) => { const [c, d] = pts[(i + 1) % pts.length]; return s + a * d - c * b; }, 0)) / 2;

EXT.kinds.domain = {
  find: id => domainById(id),
  editor: d => {
    const edit = canEditDomain(d), opts = domainOwners().map(a => `<option value="${a.id}" ${a.id === d.owner ? "selected" : ""}>${esc(a.name)}</option>`).join("");
    return `<section class="rc-edit">
      <div class="rc-edit-head"><i class="fa-solid fa-crown" style="color:${esc(d.color)}"></i><b>${esc(L("DomainOf", { name: d.name }))}</b>
        <a data-act="unpick" data-tooltip="${esc(L("Close"))}"><i class="fa-solid fa-xmark"></i></a></div>
      <label>${esc(L("DomainOwner"))}<select data-field="owner" ${edit ? "" : "disabled"}>${opts || `<option>${esc(d.name)}</option>`}</select></label>
      ${edit ? `<textarea data-field="text" rows="3" placeholder="${esc(L("DomainTextHint"))}">${esc(d.text ?? "")}</textarea>` : d.text ? `<p class="rc-text">${esc(d.text)}</p>` : ""}
      <p class="rc-facts">${esc(L("DomainHint"))}</p>
      ${domainLinkHtml(d.id)}
      ${edit ? `<div class="rc-edit-acts"><a class="r-btn rc-danger" data-act="remove" data-tooltip="${esc(L("Delete"))}"><i class="fa-solid fa-trash"></i></a></div>` : ""}
    </section>`;
  },
  edit: async (d, field, value) => {
    if (!canEditDomain(d)) return;
    const u = game.users.get(d.user), list = foundry.utils.deepClone(domainsOf(u));
    const x = list.find(y => y.id === d.id);
    if (x) { x[field] = value; await saveDomains(u, list); }
  },
  remove: async d => {
    if (!canEditDomain(d)) return;
    const u = game.users.get(d.user);
    await saveDomains(u, domainsOf(u).filter(y => y.id !== d.id));
    S.picked = null; drawBody(); drawOverlay();
  }
};
