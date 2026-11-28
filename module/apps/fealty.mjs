// module/apps/fealty.mjs
// Сюзерены и вассалы Тёмных веков (V20 Dark Ages: Tome of Secrets, гл. 3 «Бремя знатности», с. 77–81) — блок на вкладке
// преимуществ. Сюзерен даёт вассалу один свой Факт как опорный (Anchor, V20 DA с. 182) рейтинга R: вассалу — половина, вверх;
// вассал должен 2R точек своих Фактов, каждый не выше R. Часть долга закрывают недостатки-условия (Social Flaw) и — у Каинита-
// рыцаря — служба (мелкая … до окончательной смерти = 1–5 точек, с. 87). Условия клятвы: помощь, феод, оммаж, право, должность,
// служба. Один и тот же Факт сюзерен может дать опорным не больше раз, чем его рейтинг.
// Связь — с персонажем мира (uuid; запись зеркалится на его листе, если есть права) или просто по имени (НПС без листа —
// решение системы). Хранение — флаг fealty: { liege: rel | null, vassals: [rel] }, rel = { uuid, name, bg, dots, owed: [{ bg, dots }],
// flaws, service, terms: [] }.

import { VTM20, SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Fealty.${k}`, d) : game.i18n.localize(`VTM20.Fealty.${k}`);
/** Что сюзерен может дать опорным и чем вассал платит (Tome of Secrets, с. 78); * — только Каиниту. */
export const LIEGE_BG = ["Allies", "Contacts", "Domain", "Fame", "Influence", "Mentor", "Resources", "Status"];
export const VASSAL_BG = ["Allies", "Alternate Identity", "Contacts", "Fame", "Herd", "Influence", "Resources", "Retainers"];
const CAINITE_ONLY = new Set(["Domain", "Mentor", "Status", "Alternate Identity", "Herd"]);
export const TERMS = [["aid", "mutual"], ["fiefdom", "liege"], ["homage", "vassal"], ["leave", "liege"], ["office", "liege"], ["service", "vassal"]];
export const SERVICE = ["", "trivial", "minor", "major", "blood", "death"];

const bgName = en => (Codex.backgrounds ?? []).find(b => b.en === en)?.name ?? en;
const blank = () => ({ liege: null, vassals: [] });
const stateOf = actor => foundry.utils.mergeObject(blank(), foundry.utils.deepClone(actor.getFlag(SYSTEM_ID, "fealty") ?? {}), { inplace: false });
const newRel = (o = {}) => ({ uuid: "", name: "", bg: "Resources", dots: 1, owed: [], flaws: 0, service: "", terms: ["homage", "fiefdom"], ...o });

/** Сколько получает вассал, сколько должен и чем уже заплачено. */
export function fealtyMath(rel) {
  const r = Math.clamp(Number(rel.dots) || 0, 0, 5), got = Math.ceil(r / 2), owe = 2 * r;
  const service = Math.max(0, SERVICE.indexOf(rel.service ?? ""));
  const paid = (rel.owed ?? []).reduce((s, o) => s + Math.min(r, Number(o.dots) || 0), 0) + (Number(rel.flaws) || 0) + service;
  const over = (rel.owed ?? []).some(o => (Number(o.dots) || 0) > r);
  return { r, got, owe, paid, service, short: Math.max(0, owe - paid), over };
}

/** Карточка отношения для шаблона: side — «liege» (у вассала: его сюзерен) или «vassal» (у сюзерена: его вассал). */
function relView(actor, rel, side, i, dots) {
  const m = fealtyMath(rel), other = rel.uuid ? fromUuidSync(rel.uuid) : null;
  const cainite = side === "liege" ? actor.type === "vampire" : other?.type === "vampire";
  return {
    side, i, uuid: rel.uuid, name: other?.name ?? rel.name, linked: !!other, img: other?.img ?? "",
    bg: rel.bg, bgName: bgName(rel.bg), dots: dots(m.r, 5).map(x => ({ ...x, side, i })),
    math: m, ok: m.short === 0 && !m.over,
    bgOptions: LIEGE_BG.map(en => ({ value: en, label: bgName(en) + (CAINITE_ONLY.has(en) ? " *" : ""), selected: en === rel.bg })),
    owed: (rel.owed ?? []).map((o, j) => ({ j, bg: o.bg, dots: Number(o.dots) || 0, over: (Number(o.dots) || 0) > m.r,
      options: VASSAL_BG.map(en => ({ value: en, label: bgName(en) + (CAINITE_ONLY.has(en) ? " *" : ""), selected: en === o.bg })) })),
    flaws: Number(rel.flaws) || 0, cainite,
    services: SERVICE.map((k, n) => ({ value: k, label: k ? `${t(`Service.${k}`)} (${n})` : t("ServiceNone"), selected: k === (rel.service ?? "") })),
    terms: TERMS.map(([k, who]) => ({ key: k, who: t(`Who.${who}`), label: t(`Term.${k}`), tip: t(`TermHint.${k}`), on: (rel.terms ?? []).includes(k) }))
  };
}

/** Данные блока на листе; null — не Тёмные века или не тот тип. */
export function fealtyInfo(actor, dots) {
  if (!VTM20.isDarkAges() || !["vampire", "mortal", "ghoul"].includes(actor.type)) return null;
  const f = stateOf(actor);
  // сколько раз каждый Факт уже отдан опорным (не больше его рейтинга у сюзерена)
  const own = en => actor.items.filter(i => i.type === "background" && (i.system?.source === en || i.name === bgName(en))).reduce((n, i) => Math.max(n, Number(i.system.value) || 0), 0);
  const uses = {};
  for (const v of f.vassals) uses[v.bg] = (uses[v.bg] ?? 0) + 1;
  const vassals = f.vassals.map((v, i) => ({ ...relView(actor, v, "vassal", i, dots), overUse: (uses[v.bg] ?? 0) > own(v.bg), have: own(v.bg) }));
  const actors = game.actors.filter(a => a !== actor && ["vampire", "mortal", "ghoul"].includes(a.type)).sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .map(a => ({ value: a.uuid, label: a.name }));
  return { liege: f.liege ? relView(actor, f.liege, "liege", 0, dots) : null, vassals, actors, empty: !f.liege && !f.vassals.length };
}

/* ── Правка и зеркало на листе второй стороны ───────────────────────────── */

const relOf = (f, side, i) => side === "liege" ? f.liege : f.vassals[Number(i)];

/** Записать флаг и, если вторая сторона — персонаж мира и права есть, обновить её запись. */
async function commit(actor, f, side, i, { unlinkOld = null } = {}) {
  await actor.setFlag(SYSTEM_ID, "fealty", f);
  const rel = relOf(f, side, i);
  if (unlinkOld) await mirrorRemove(actor, unlinkOld, side);
  if (rel?.uuid) await mirror(actor, rel, side);
}
async function mirror(actor, rel, side) {
  const other = await fromUuid(rel.uuid);
  if (!other || other === actor) return;
  if (!other.isOwner) return ui.notifications.info(t("NoMirror", { name: other.name }));
  const g = stateOf(other), copy = { ...foundry.utils.deepClone(rel), uuid: actor.uuid, name: actor.name };
  if (side === "liege") {           // я — вассал: у сюзерена я в списке вассалов
    const k = g.vassals.findIndex(v => v.uuid === actor.uuid);
    if (k < 0) g.vassals.push(copy); else g.vassals[k] = copy;
  } else g.liege = copy;            // я — сюзерен: у вассала я сюзерен
  await other.setFlag(SYSTEM_ID, "fealty", g);
}
async function mirrorRemove(actor, uuid, side) {
  const other = uuid ? await fromUuid(uuid) : null;
  if (!other?.isOwner) return;
  const g = stateOf(other);
  if (side === "liege") g.vassals = g.vassals.filter(v => v.uuid !== actor.uuid);
  else if (g.liege?.uuid === actor.uuid) g.liege = null;
  await other.setFlag(SYSTEM_ID, "fealty", g);
}

export async function fealtyAct(actor, d) {
  const f = stateOf(actor), side = d.side, i = d.i;
  switch (d.op) {
    case "addLiege": if (!f.liege) f.liege = newRel(); return commit(actor, f, "liege", 0);
    case "addVassal": f.vassals.push(newRel()); return commit(actor, f, "vassal", f.vassals.length - 1);
    case "drop": {
      const rel = relOf(f, side, i), uuid = rel?.uuid;
      if (side === "liege") f.liege = null; else f.vassals.splice(Number(i), 1);
      await actor.setFlag(SYSTEM_ID, "fealty", f);
      return mirrorRemove(actor, uuid, side);
    }
    case "dots": { const rel = relOf(f, side, i); if (!rel) return; const n = Number(d.n); rel.dots = rel.dots === n ? n - 1 : n; break; }
    case "term": { const rel = relOf(f, side, i); if (!rel) return; const s = new Set(rel.terms ?? []); s.has(d.key) ? s.delete(d.key) : s.add(d.key); rel.terms = [...s]; break; }
    case "owedAdd": { const rel = relOf(f, side, i); if (!rel) return; (rel.owed ??= []).push({ bg: "Resources", dots: 1 }); break; }
    case "owedDel": { const rel = relOf(f, side, i); if (!rel) return; rel.owed.splice(Number(d.j), 1); break; }
    case "open": { const other = d.uuid ? await fromUuid(d.uuid) : null; return other?.sheet?.render(true); }
    default: return null;
  }
  return commit(actor, f, side, i);
}

/** Поля блока (кто, Факт, точки долга, недостатки, служба) — data-fealty="side|i|поле[|j]". */
export async function fealtyField(actor, key, value) {
  const [side, i, field, j] = key.split("|"), f = stateOf(actor), rel = relOf(f, side, i);
  if (!rel) return;
  let unlinkOld = null;
  if (field === "who") {
    if (value.startsWith("Actor.") || value.includes(".Actor.") || value.startsWith("Compendium")) { unlinkOld = rel.uuid !== value ? rel.uuid : null; rel.uuid = value; rel.name = fromUuidSync(value)?.name ?? ""; }
    else { unlinkOld = rel.uuid || null; rel.uuid = ""; }
  } else if (field === "name") { rel.name = String(value).slice(0, 60); }
  else if (field === "bg") rel.bg = value;
  else if (field === "flaws") rel.flaws = Math.clamp(Number(value) || 0, 0, 10);
  else if (field === "service") rel.service = SERVICE.includes(value) ? value : "";
  else if (field === "owedBg") { if (rel.owed?.[j]) rel.owed[j].bg = value; }
  else if (field === "owedDots") { if (rel.owed?.[j]) rel.owed[j].dots = Math.clamp(Number(value) || 0, 0, 5); }
  else return;
  return commit(actor, f, side, i, { unlinkOld });
}

export const FEALTY_ACTIONS = { fealty(event, target) { return fealtyAct(this.actor, target.dataset); } };
