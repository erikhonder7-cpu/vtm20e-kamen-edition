// module/ui/strategy-domain.mjs
// Стратегия города ↔ домены: квартал домена, влияние сторон, Защищённость, события домена и тренды.
// Вынесено из strategy.mjs.

import { SYSTEM_ID } from "../config.mjs";
import { EXT } from "./city-ext.mjs";
import { S, uid, sectorName, strat, save, owner } from "./strategy-rules.mjs";

/** Середина места домена на карте: зона рассказчика или обведённый игроком домен (system.zone) — из настроек, без открытой карты. */
export function domainSpot(da) {
  const id = da?.system.zone;
  if (!id) return null;
  const raw = game.settings.get(SYSTEM_ID, "cityMap") ?? {}, cid = raw.current ?? Object.keys(raw.cities ?? {})[0], c = raw.cities?.[cid] ?? {};
  const pts = (c.zones ?? []).find(z => z.id === id)?.points
    ?? game.users.contents.flatMap(u => (u.getFlag(SYSTEM_ID, "cityDomains") ?? {})[cid] ?? []).find(d => d.id === id)?.points;
  return pts?.length ? pts.reduce(([a, b], [x, y]) => [a + x / pts.length, b + y / pts.length], [0, 0]) : null;
}

/** Квартал домена — ближайший к середине его места квартал стратегии (кварталы дают модули города). */
export function domainDistrict(da) {
  const at = domainSpot(da), list = EXT.strategy.districts.flatMap(f => f());
  if (!at || !list.length) return null;
  const far = d => (d.lat - at[0]) ** 2 + ((d.lng - at[1]) * Math.cos(at[0] * Math.PI / 180)) ** 2;
  return list.reduce((best, d) => !best || far(d) < far(best) ? d : best, null);
}

export const domainSectors = (da, s = strat()) => { const d = domainDistrict(da); return d ? s.sectors.filter(x => x.district === d.key) : []; };

/** Сторона хозяина домена: сам хозяин, у котерии — она и её участники. */
export function ownerSide(da) {
  const o = game.actors.get(da.system.owner);
  return new Set(o ? [o.id, ...(o.type === "coterie" ? o.system.members ?? [] : [])] : []);
}

/** Сдвиг Защищённости по фишкам в секторах квартала: у хозяина больше всех — +1, у кого-то из чужих больше — −1, ничья — 0. */
export function domainSway(da, s = strat()) {
  const secs = domainSectors(da, s);
  if (!secs.length) return null;
  const side = ownerSide(da), sum = {};
  for (const x of secs) for (const [k, n] of Object.entries(s.tokens[x.key] ?? {})) if (n > 0) sum[k] = (sum[k] ?? 0) + n;
  const mine = [...side].reduce((n, k) => n + (sum[k] ?? 0), 0);
  const rival = Object.entries(sum).filter(([k]) => !side.has(k)).sort((p, q) => q[1] - p[1])[0];
  const best = rival?.[1] ?? 0;
  return { d: mine > best ? 1 : best > mine ? -1 : 0, mine, best, rival: rival ? owner(rival[0], s).name : "",
    district: domainDistrict(da)?.name ?? "", sectors: secs.map(sectorName) };
}

/** Дата хроники для журнала домена. */
export async function chronicleDate() {
  const { getClock } = await import("../apps/calendar.mjs");
  return new Date(getClock()).toLocaleDateString(game.i18n.lang, { day: "numeric", month: "long", year: "numeric" });
}

/** Конец хода: Защищённость доменов по фишкам в их кварталах; запись в журнал домена; строки для отчёта. Экспорт — для автотестов. */
export async function domainSecurity(s) {
  const out = [], date = await chronicleDate();
  for (const da of game.actors.filter(a => a.type === "domain")) {
    const w = domainSway(da, s);
    if (!w?.d) continue;
    const sec = Math.clamp((da.system.security ?? 0) + w.d, 0, 5);
    if (sec === (da.system.security ?? 0)) continue;
    await da.update({ "system.security": sec, "system.events": [...(da.system.events ?? []),
      { key: "strategy", note: S(w.d > 0 ? "DomainHeld" : "DomainLost", { n: s.turn.n, who: w.rival, sec }), date }] });
    out.push(S(w.d > 0 ? "Out.domainUp" : "Out.domainDown", { name: da.name, n: sec }));
  }
  return out;
}

/** Событие домена (DA Companion) — трендом 1-го уровня в секторе его квартала; ставит только ведущий. */
export async function domainEventTrend(da, key, note = "") {
  if (!game.user.isGM) return null;
  const s = strat(), sec = domainSectors(da, s)[0];
  if (!sec) return null;
  const t = { id: uid(), sector: sec.key, level: 1, grow: 1, domain: da.id,
    name: `${game.i18n.localize(`VTM20.Group.Event.${key}.name`)} — ${da.name}${note ? ` (${note})` : ""}` };
  await save({ trends: [...(s.trends ?? []), t] });
  return t;
}

/** Новый тренд ведущего — событием в журналы доменов этого квартала (тренд из события домена обратно не пишется). Экспорт — для автотестов. */
export async function trendToDomains(t, s) {
  const x = s.sectors.find(y => y.key === t.sector);
  if (t.domain || !x?.district) return;
  const date = await chronicleDate();
  for (const da of game.actors.filter(a => a.type === "domain" && domainDistrict(a)?.key === x.district))
    await da.update({ "system.events": [...(da.system.events ?? []), { key: "trend", note: `${t.name} — ${sectorName(x)}`, date }] });
}
