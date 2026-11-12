// module/apps/realms.mjs
// Другие Тёмные Царства (Wraith 20, гл. 13): призрак Нефритовой Империи, Сварги или Куста Призраков — свои Арканои
// (system.wraith.realm). Нефритовая Империя: пять Путей (Книжник, Ремесленник, Земледелец, Торговец, Душа) и Цепи Императора —
// только Бессмертной гвардии; там известны все стигийские Арканои, кроме Порицания. Сварга: Смещение (Тваштрии). Куст Призраков:
// Повеление абамбо (вне Куста не работает). Пул и сложность — из текста; «сложность — Воля цели» и т. п. — подсказкой в окне броска.
// Зеркальные земли (Book of Oblivion): Коннесанс — основа (передать Тени контроль: сл. — постоянный Ангст, успех снимает Тени
// пункт Ангста) и искусства Общие (Рада) и Посвящённые (Петро, Лоа); часть искусств даёт Ангст самому Слуге (angst).

import { RollDialog } from "../dice/dialog.mjs";
import { W, t, esc, say, spendPathos, corpusDamage, arcSym, gainAngst } from "./wraith.mjs";

const realmOf = key => (W().realms ?? []).find(r => r.key === key) ?? null;
export const realmArtOf = key => (W().realmArcanoi ?? []).find(a => a.key === key) ?? null;

export function realmView(actor, dots) {
  const r = actor.system.wraith.realm, realm = realmOf(r.kingdom);
  const label = p => p.startsWith("realm.") ? (realmArtOf(p.slice(6))?.name ?? p) : actor.traitLabel(p);
  const arts = (W().realmArcanoi ?? []).filter(a => (r.arcanoi[a.key] ?? 0) > 0).map(a => {
    const value = r.arcanoi[a.key];
    return { key: a.key, name: a.name, en: a.en, sym: arcSym(a.glyph), value, html: a.html, dots: dots(value, 5, { path: `system.wraith.realm.arcanoi.${a.key}` }),
      xp: actor.xpCost("arcanos", value, { key: a.key }),
      levels: a.levels.map((l, i) => {
        const pool = l.pool ?? ["attributes.wits", `realm.${a.key}`];
        return { ...l, i, known: l.level <= value, poolLabel: pool.map(label).join(" + "), poolN: pool.reduce((n, p) => n + actor.traitValue(p), 0),
          diff: l.host ? hostDiff(actor) : l.diff ?? 6, diffNote: l.diffRule ? t("Shroud.Rule", { rule: l.diffRule }) : "",
          kindLabel: l.kind ? t(`Realm.Kind.${l.kind}`) : "",
          cost: [l.pathos ? `${l.pathos} ${t("Cost.Pathos")}` : "", l.corpus ? `${l.corpus} ${t("Cost.Corpus")}` : "", l.willpower ? `${l.willpower} ${t("Cost.Will")}` : "",
            l.angst ? t("Realm.SelfAngst", { n: l.angst }) : "", l.costText ?? ""].filter(Boolean).join(", ") };
      }) };
  });
  return { realm, kingdoms: (W().realms ?? []).map(k => ({ key: k.key, name: k.name, selected: k.key === r.kingdom })), arts,
    avail: (W().realmArcanoi ?? []).filter(a => (!r.kingdom || a.realm === r.kingdom) && !(r.arcanoi[a.key] > 0)).map(a => ({ key: a.key, label: a.name })) };
}

/** Передача контроля Тени (Коннесанс): сложность — постоянный Ангст Тени (не ниже 2 — правило системы). */
const hostDiff = actor => Math.clamp(actor.system.wraith.shadow?.angst?.permanent ?? 6, 2, 10);

/** Уровень Арканоса Царства (по номеру в списке: у Повеления два уровня 3 — правая и левая рука). */
export async function rollRealmArt(actor, key, i) {
  const a = realmArtOf(key), lv = a?.levels[Number(i)];
  if (!lv) return null;
  if ((actor.system.wraith.realm.arcanoi[key] ?? 0) < lv.level) return ui.notifications.warn(t("ArtTooHigh", { n: lv.level }));
  if (lv.pathos && !(await spendPathos(actor, lv.pathos))) return null;
  if (lv.corpus) await corpusDamage(actor, lv.corpus, "bashing");
  if (lv.angst) await gainAngst(actor, lv.angst, { reason: lv.name });
  const [t1, t2] = lv.pool ?? ["attributes.wits", `realm.${key}`];
  // основа Коннесанса: успехи — срок, на который Тень получает контроль; успешное применение снимает Тени пункт Ангста
  if (lv.host) return RollDialog.prompt(actor, { title: `${a.name}: ${lv.name}`, trait1: t1, trait2: t2, difficulty: hostDiff(actor), lockTraits: true,
    diffNote: t("Shroud.Rule", { rule: lv.diffRule }), effect: lv.html, extra: { wraith: { kind: "realmArt", key, level: lv.level, name: lv.name } },
    onRolled: async r => { if ((r?.successes ?? 0) > 0) { await gainAngst(actor, -1, { reason: lv.name }); await say(actor, "fa-user-group", t("Realm.Hosted", { name: esc(actor.name), n: r.successes })); } } });
  if (!lv.pool && !lv.diff) return say(actor, "fa-yin-yang", `<b>${esc(a.name)} ${"•".repeat(lv.level)} — ${esc(lv.name)}</b>${lv.html}`);
  return RollDialog.prompt(actor, { title: `${a.name}: ${lv.name}`, trait1: t1, ...(t2 ? { trait2: t2 } : {}), difficulty: lv.diff ?? 6, lockTraits: true,
    diffNote: lv.diffRule ? t("Shroud.Rule", { rule: lv.diffRule }) : "", effect: lv.html, willpowerCost: lv.willpower ?? 0,
    extra: { wraith: { kind: "realmArt", key, level: lv.level, name: lv.name } } });
}

export async function realmRow(actor, op, key) {
  if (!key) return null;
  return actor.update({ [`system.wraith.realm.arcanoi.${key}`]: op === "del" ? 0 : Math.max(1, actor.system.wraith.realm.arcanoi[key] ?? 0) });
}
