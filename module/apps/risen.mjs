// module/apps/risen.mjs
// Восставший (Wraith 20, гл. 11): призрак, вернувшийся в собственное тело ради незаконченного дела — режим листа призрака
// (system.wraith.risen.on). Тень согласилась (Пакт) и живёт в Проводнике — одних из Оков.
//   · Восстание: 1 Пафос, Ловкость + Кукловодство (сл. 6); затем 1 Воля и Воля (сл. 8). Провал Кукловодства — остаётся призраком;
//     провал Воли — телом правит Тень (Психея в Проводнике); ботч Воли — ещё и постоянный Ангст за каждую лишнюю единицу.
//   · В Земли Теней: 1 Воля + 1 Пафос, Воля (сл. 7): успех — +1 временный Ангст; ботч — Ангст есть, а тело не отпускает.
//     Обратно: 1 Воля, Ловкость + Кукловодство (сл. 5) и Воля (сл. 8); провал Воли — Психея и Тень меняются местами;
//     ботч — попытка сорвалась, Тени +1 Ангст.
//   · В теле: боль не мешает, кроме губительного урона (−1 кубик за уровень); 1 Пафос — 1 уровень Корпуса; каждый Арканос,
//     кроме Очарования и Случайности, — ещё 1 Ангст Тени; броски на получение Ангста — сложность −1.
//   · Корпус кончился, а Пафос есть — без сознания (Выносливость + Стойкость, сл. 10 − Пафос); нет и Пафоса — дух изгнан из тела.
//   · «Дисциплины» тела: Мощь, Стойкость, Быстрота — 1 Пафос (у Тени — Ангст) на ход.

import { RollDialog } from "../dice/dialog.mjs";
import { VTM20, SYSTEM_ID } from "../config.mjs";
import { W, t, esc, say, spendPathos, gainAngst } from "./wraith.mjs";

export const isRisen = actor => !!actor?.system?.wraith?.risen?.on;
export const inBody = actor => isRisen(actor) && !!actor.system.wraith.risen.body;
const risenArtOf = key => (W().risenArcanoi ?? []).find(a => a.key === key) ?? null;
const DISC = ["potence", "fortitude", "celerity"];

/* ── Вид для листа ──────────────────────────────────────────────────── */

export function risenView(actor, dots) {
  const r = actor.system.wraith.risen;
  const label = path => path.startsWith("risen.") ? (risenArtOf(path.slice(6))?.name ?? path) : actor.traitLabel(path);
  const arts = (W().risenArcanoi ?? []).filter(a => (r.arcanoi[a.key] ?? 0) > 0).map(a => {
    const value = r.arcanoi[a.key];
    return { key: a.key, name: a.name, en: a.en, icon: a.icon, value, dots: dots(value, 5, { path: `system.wraith.risen.arcanoi.${a.key}` }),
      levels: a.levels.map(l => {
        const pool = l.pool ?? ["attributes.manipulation", `risen.${a.key}`];
        return { ...l, known: l.level <= value, poolLabel: pool.map(label).join(" + "), poolN: pool.reduce((n, p) => n + actor.traitValue(p), 0),
          diff: l.diff ?? 6, diffNote: l.diffRule ? t("Shroud.Rule", { rule: l.diffRule }) : "",
          cost: [l.pathos ? `${l.pathos} ${t("Cost.Pathos")}` : "", l.willpower ? `${l.willpower} ${t("Cost.Will")}` : "", l.angst ? t("Cost.Angst", { n: l.angst }) : ""].filter(Boolean).join(" · ") };
      }) };
  });
  return { body: r.body, conduit: r.conduit, arts, artAvail: (W().risenArcanoi ?? []).filter(a => !(r.arcanoi[a.key] > 0)).map(a => ({ key: a.key, label: a.name })),
    disc: DISC.map(k => ({ key: k, label: t(`Risen.Disc.${k}`), hint: t(`Risen.DiscHint.${k}`), value: r.disc[k], dots: dots(r.disc[k], 5, { path: `system.wraith.risen.disc.${k}` }) })),
    shadowRules: actor.system.wraith.shadow.catharsis };
}

/* ── Восстание и переходы ───────────────────────────────────────────── */

const willRoll = (actor, title, difficulty, note, onRolled) => RollDialog.prompt(actor, { title, trait1: "willpower.permanent", difficulty, lockTraits: true,
  diffNote: note, extra: { wraith: { kind: "risen", step: title } }, onRolled });
const spendWill = async actor => actor.spendWillpower ? actor.spendWillpower(1) : true;
const ones = r => (r?.values ?? r?.state?.values ?? []).filter(v => v === 1).length;

/** Восстание (гл. 11, шаг 4): Кукловодство, потом Воля. */
export async function rise(actor) {
  if (!(await spendPathos(actor, 1))) return null;
  return RollDialog.prompt(actor, { title: t("Risen.Rise"), trait1: "attributes.dexterity", trait2: "wraith.puppetry", difficulty: 6, lockTraits: true,
    diffNote: t("Risen.RiseNote"), extra: { wraith: { kind: "risen", step: t("Risen.Rise") } },
    onRolled: async r => {
      if (!((r?.successes ?? 0) > 0)) return say(actor, "fa-ghost", t("Risen.RiseFail", { name: esc(actor.name) }));
      if (!(await spendWill(actor))) return null;
      return willRoll(actor, t("Risen.RiseWill"), 8, t("Risen.RiseWillNote"), async w => {
        const ok = (w?.successes ?? 0) > 0, botch = w?.outcome === "botch";
        await actor.update({ "system.wraith.risen.on": true, "system.wraith.risen.body": true, "system.wraith.shadow.catharsis": !ok });
        if (botch) {
          const extra = Math.max(1, ones(w) - Math.max(0, w.successes ?? 0));
          const a = actor._source.system.wraith.shadow.angst;
          await actor.update({ "system.wraith.shadow.angst.permanent": Math.min(10, a.permanent + extra) });
        }
        return say(actor, ok ? "fa-person-rays" : "fa-mask", t(ok ? "Risen.Risen" : botch ? "Risen.RiseBotch" : "Risen.RiseShadow", { name: esc(actor.name) }), ok ? "" : "is-shadow");
      });
    } });
}

/** В Земли Теней (тело спрятано): 1 Воля + 1 Пафос, Воля (сл. 7). */
export async function toShadowlands(actor) {
  if (!inBody(actor)) return ui.notifications.info(t("Risen.NotInBody"));
  if (!(await spendPathos(actor, 1)) || !(await spendWill(actor))) return null;
  return willRoll(actor, t("Risen.ToShadowlands"), 7, t("Risen.ToShadowlandsNote"), async w => {
    const ok = (w?.successes ?? 0) > 0, botch = w?.outcome === "botch";
    if (ok || botch) await gainAngst(actor, 1, { reason: t("Risen.ToShadowlands") });
    if (ok) await actor.update({ "system.wraith.risen.body": false });
    return say(actor, "fa-ghost", t(ok ? "Risen.LeftBody" : botch ? "Risen.LeaveBotch" : "Risen.LeaveFail", { name: esc(actor.name) }));
  });
}

/** Обратно в тело: 1 Воля, Ловкость + Кукловодство (сл. 5), Воля (сл. 8). */
export async function toBody(actor) {
  if (inBody(actor)) return ui.notifications.info(t("Risen.AlreadyInBody"));
  if (!(await spendWill(actor))) return null;
  return RollDialog.prompt(actor, { title: t("Risen.ToBody"), trait1: "attributes.dexterity", trait2: "wraith.puppetry", difficulty: 5, lockTraits: true,
    extra: { wraith: { kind: "risen", step: t("Risen.ToBody") } },
    onRolled: async r => {
      if (!((r?.successes ?? 0) > 0)) return say(actor, "fa-ghost", t("Risen.ReturnFail", { name: esc(actor.name) }));
      return willRoll(actor, t("Risen.ToBodyWill"), 8, "", async w => {
        const ok = (w?.successes ?? 0) > 0, botch = w?.outcome === "botch";
        if (botch) { await gainAngst(actor, 1, { reason: t("Risen.ToBody") }); return say(actor, "fa-mask", t("Risen.ReturnBotch", { name: esc(actor.name) }), "is-shadow"); }
        await actor.update({ "system.wraith.risen.body": true, "system.wraith.shadow.catharsis": !ok });
        return say(actor, ok ? "fa-person-rays" : "fa-mask", t(ok ? "Risen.Returned" : "Risen.ReturnShadow", { name: esc(actor.name) }), ok ? "" : "is-shadow");
      });
    } });
}

/** «Дисциплина» тела: 1 Пафос (у Тени за рулём — Ангст) — Мощь и Стойкость дают кубики, Быстрота — действия на ход. */
export async function risenDisc(actor, key) {
  const n = actor.system.wraith.risen.disc[key] ?? 0;
  if (!n) return null;
  const shadow = actor.system.wraith.shadow.catharsis;
  if (shadow) {
    const a = actor._source.system.wraith.shadow.angst.temporary;
    if (a < 1) return ui.notifications.warn(t("Risen.NoAngst"));
    await actor.update({ "system.wraith.shadow.angst.temporary": a - 1 });
  } else if (!(await spendPathos(actor, 1))) return null;
  return say(actor, "fa-person-running", t(`Risen.DiscUsed.${key}`, { name: esc(actor.name), n }));
}

/** Уровень Очарования или Случайности: пул из текста, цена в Пафосе и Воле; дополнительного Ангста эти Арканои не дают. */
export async function rollRisenArt(actor, key, level) {
  const a = risenArtOf(key), lv = a?.levels.find(l => l.level === Number(level));
  if (!lv) return null;
  if ((actor.system.wraith.risen.arcanoi[key] ?? 0) < lv.level) return ui.notifications.warn(t("ArtTooHigh", { n: lv.level }));
  if (lv.pathos && !(await spendPathos(actor, lv.pathos))) return null;
  if (lv.angst) await gainAngst(actor, lv.angst, { reason: lv.name });
  const [t1, t2] = lv.pool ?? ["attributes.manipulation", `risen.${key}`];
  return RollDialog.prompt(actor, { title: `${a.name}: ${lv.name}`, trait1: t1, trait2: t2, difficulty: lv.diff ?? 6, lockTraits: true,
    diffNote: lv.diffRule ? t("Shroud.Rule", { rule: lv.diffRule }) : "", effect: lv.html, willpowerCost: lv.willpower ?? 0,
    extra: { wraith: { kind: "risenArt", key, level: lv.level, name: lv.name } } });
}

/** Корпус кончился: есть Пафос — обморок (Выносливость + Стойкость, сл. 10 − Пафос); нет — дух изгнан к месту погребения. */
export async function risenDown(actor) {
  const pathos = actor.system.wraith.pathos.value;
  if (!pathos) {
    await actor.update({ "system.wraith.risen.body": false });
    return say(actor, "fa-skull", t("Risen.Expelled", { name: esc(actor.name), n: actor.system.wraith.shadow.angst.temporary }), "is-shadow");
  }
  const diff = 10 - pathos;
  if (diff <= 1) return say(actor, "fa-person-rays", t("Risen.UpAtOnce", { name: esc(actor.name) }));
  const fort = actor.system.wraith.risen.disc.fortitude ?? 0;
  return RollDialog.prompt(actor, { title: t("Risen.Down"), trait1: "attributes.stamina", bonus: fort, bonusLabel: t("Risen.Disc.fortitude"), difficulty: Math.max(2, diff),
    lockTraits: true, extra: { wraith: { kind: "risenDown" } } });
}

/** Сон Восставшего (8 часов у Оков или Проводника): губительный — Выносливость, сл. 7, уровень за успех; провал — не уснул, ещё час. */
export function risenSlumber(actor) {
  return RollDialog.prompt(actor, { title: t("Risen.Slumber"), trait1: "attributes.stamina", difficulty: 7, lockTraits: true, noBotch: true,
    diffNote: t("Risen.SlumberNote"), extra: { wraith: { kind: "risenSlumber" } },
    onRolled: async r => {
      const n = Math.min(r?.successes ?? 0, actor._source.system.health.aggravated);
      if (n > 0) await actor.update({ "system.health.aggravated": actor._source.system.health.aggravated - n });
      return say(actor, "fa-bed", t(n > 0 ? "Risen.Slept" : "Risen.NoSleep", { name: esc(actor.name), n }));
    } });
}

/** Проводник: таблица обморока — для карточки броска. */
export function downTime(n, botch) {
  if (botch) return W().risen?.unconscious?.at(-1)?.[1] ?? "";
  return (W().risen?.unconscious ?? []).find(([k]) => n >= k)?.[1] ?? "";
}

export { SYSTEM_ID, VTM20 };
