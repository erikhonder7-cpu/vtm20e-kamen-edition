// module/apps/consorts.mjs
// Настройка и Консорты (Wraith 20, гл. 5, «Attunement and Consorts»): каждый раз, когда призрак удачно является, Вселяется
// или «входит» в существо или вещь, игрок может вложить 1 Волю — не чаще раза за сцену. Чужому нужно 5 Воли, близкому
// другу или любимому — 2–3 (решает рассказчик). Консортов не больше постоянной Воли; Оковы — всегда настроены и вне лимита.
// Выгода — по Арканосу; где книга молчит, «хороший выбор по умолчанию — меньшая сложность»: −1 (правило системы) — галочкой
// в окне броска Арканоса.

import { t, esc, say } from "./wraith.mjs";

const PATH = "system.wraith.consorts";
const listOf = actor => foundry.utils.deepClone(actor._source.system.wraith.consorts ?? []);
/** «Сцена» для правила «раз за сцену»: сцена, которую смотрит пользователь (правило системы). */
const sceneKey = () => game.scenes?.viewed?.id ?? "-";

/** Консорты для листа. */
export function consortsView(actor) {
  const list = actor.system.wraith.consorts ?? [], limit = actor.system.willpower.permanent;
  const rows = list.map((c, i) => ({ ...c, i, attuned: c.invested >= c.need,
    boxes: Array.from({ length: c.need }, (_, k) => ({ filled: k < c.invested })),
    needs: [1, 2, 3, 4, 5].map(n => ({ n, selected: n === c.need })), done: c.scene === sceneKey() }));
  const count = rows.filter(r => r.attuned).length;
  return { rows, count, limit, over: count > limit };
}
export const attunedConsorts = actor => (actor.system.wraith.consorts ?? []).filter(c => c.invested >= c.need);

export async function addConsort(actor) {
  return actor.update({ [PATH]: [...listOf(actor), { name: "", need: 5, invested: 0, scene: "" }] });
}
export async function removeConsort(actor, i) {
  const list = listOf(actor);
  list.splice(Number(i), 1);
  return actor.update({ [PATH]: list });
}

/** Вложить 1 Волю в настройку на цель i (после удачного явления, Вселения или Кукловодства). */
export async function investWill(actor, i) {
  const list = listOf(actor), c = list[Number(i)];
  if (!c) return null;
  if (c.invested >= c.need) return ui.notifications.info(t("Consort.Already"));
  if (c.scene === sceneKey() && !game.user.isGM) return ui.notifications.warn(t("Consort.OncePerScene"));
  const count = list.filter(x => x.invested >= x.need).length, limit = actor.system.willpower.permanent;
  if (c.invested + 1 >= c.need && count >= limit) return ui.notifications.warn(t("Consort.Limit", { n: limit }));
  const wp = actor.system.willpower.temporary;
  if (wp < 1) return ui.notifications.warn(t("Consort.NoWill"));
  Object.assign(c, { invested: c.invested + 1, scene: sceneKey() });
  await actor.update({ [PATH]: list, "system.willpower.temporary": wp - 1 });
  const name = esc(actor.name), who = esc(c.name || t("Consort.Someone"));
  return say(actor, "fa-hand-holding-heart", c.invested >= c.need ? t("Consort.AttunedMsg", { name, who })
    : t("Consort.Invested", { name, who, n: c.invested, need: c.need }));
}

/** Ситуативная поправка для окна броска Арканоса: цель — Консорт. */
export function consortSitu(actor) {
  const list = attunedConsorts(actor);
  return list.length ? [{ label: t("Consort.Target"), value: -1, kind: "consort" }] : [];
}
