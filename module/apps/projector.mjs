// module/apps/projector.mjs
// Проектор «Орфея» (Wraith 20, приложение «Orpheus»): живой, выходящий из тела в Земли Теней, — режим листа призрака
// (system.wraith.projector.on). Тени нет — вместо неё Пятна; Оковы — Тетеры (сильнейшая — к телу, серебряный шнур).
//   · Оттенок (Shade): Любимые Арканои дешевле на 1 опыт за уровень, Запретный — дороже; поправки к Пафосу, Воле, Ангсту.
//   · Пятна: одно на каждые 2 постоянного Ангста; проявить — 1 временный Ангст, держится ходов = постоянному Ангсту;
//     временный Ангст выше постоянной Воли — Пятна лезут сами (1 Воля — сдержать на сцену); Социальные сложности +1 за Пятно.
//   · Живучесть: Пафос не выше временного Корпуса; 1 Воля — сразу 3 Пафоса (лишнее уходит на лечение Корпуса).
//   · Эмблема защиты: 2 Пафоса — броня 4/2/1 на сцену; +1 Пафос — разряд: 1 летальный схватившему.
//   · Скиммер возвращается рывком шнура — 1 ударный телу; спящий проецируется и возвращается часами.
//   · Глаза мёртвых: в теле — Восприятие + Чутьё (сл. 7), Взгляд жизни и смерти на сцену.
//   · Испытание живому не грозит: что привело бы к нему — возвращает проектора в тело с 1 губительным уровнем.

import { RollDialog } from "../dice/dialog.mjs";
import { W, t, esc, say } from "./wraith.mjs";

export const isProjector = actor => !!actor?.system?.wraith?.projector?.on;
const shadeOf = key => (W().shades ?? []).find(s => s.key === key) ?? null;
const stainOf = key => (W().stains ?? []).find(s => s.key === key) ?? null;

export function projectorView(actor) {
  const w = actor.system.wraith, p = w.projector, shade = shadeOf(p.shade), arc = k => (W().arcanoi ?? []).find(a => a.key === k)?.name
    ?? (W().risenArcanoi ?? []).find(a => a.key === k)?.name ?? k;
  const slots = p.stainSlots ?? 0, shown = p.stains.filter(s => s.shown).length;
  return { shade, shades: (W().shades ?? []).map(s => ({ key: s.key, name: `${s.name} (${s.en})`, selected: s.key === p.shade })),
    favored: shade?.favored.map(arc).join(", ") ?? "", prohibited: shade?.prohibited.map(arc).join(", ") ?? "",
    lament: p.lament, projecting: p.projecting, emblem: p.emblem, pathosMax: w.pathos.max,
    stains: p.stains.map((s, i) => ({ i, ...s, ...(stainOf(s.key) ?? { name: s.key }) })), slots, shown, social: shown,
    stainAvail: (W().stains ?? []).filter(s => !p.stains.some(x => x.key === s.key)).map(s => ({ key: s.key, label: s.name })),
    overSlots: p.stains.length > slots, wild: w.shadow.angst.temporary > actor.system.willpower.permanent };
}

/** Выйти в проекцию или вернуться (скиммер — рывок шнура: 1 ударный телу, кровь из носа). */
export async function project(actor) {
  const p = actor.system.wraith.projector;
  if (!p.projecting) {
    await actor.update({ "system.wraith.projector.projecting": true });
    return say(actor, "fa-person-falling-burst", t(p.lament === "sleeper" ? "Proj.OutSleeper" : "Proj.OutSkimmer", { name: esc(actor.name) }));
  }
  await actor.update({ "system.wraith.projector.projecting": false, "system.wraith.projector.emblem": false,
    "system.wraith.projector.stains": p.stains.map(s => ({ ...s, shown: false })) });
  return say(actor, "fa-person", t(p.lament === "sleeper" ? "Proj.BackSleeper" : "Proj.BackSkimmer", { name: esc(actor.name) }));
}

/** Пятно: проявить за 1 временный Ангст (держится ходов = постоянному Ангсту) или убрать. */
export async function stain(actor, i) {
  const list = foundry.utils.deepClone(actor._source.system.wraith.projector.stains), s = list[i];
  if (!s) return null;
  if (!s.shown) {
    const a = actor._source.system.wraith.shadow.angst;
    if (a.temporary < 1) return ui.notifications.warn(t("Proj.NoAngst"));
    await actor.update({ "system.wraith.shadow.angst.temporary": a.temporary - 1 });
  }
  s.shown = !s.shown;
  await actor.update({ "system.wraith.projector.stains": list });
  if (s.shown) return say(actor, "fa-droplet", t("Proj.StainShown", { name: esc(actor.name), stain: esc(stainOf(s.key)?.name ?? s.key), n: actor.system.wraith.shadow.angst.permanent }), "is-shadow");
  return null;
}

/** Сдержать Пятна на сцену (временный Ангст выше постоянной Воли): 1 Воля. */
export async function suppressStains(actor) {
  if (!(await actor.spendWillpower(1))) return null;
  await actor.update({ "system.wraith.projector.stains": actor._source.system.wraith.projector.stains.map(s => ({ ...s, shown: false })) });
  return say(actor, "fa-hand", t("Proj.Suppressed", { name: esc(actor.name) }));
}

/** Живучесть: 1 Воля — сразу 3 Пафоса; что сверх Корпуса — сразу лечит Корпус. */
export async function willToPathos(actor) {
  if (!(await actor.spendWillpower(1))) return null;
  const w = actor._source.system.wraith, cap = actor.system.wraith.pathos.max, h = foundry.utils.deepClone(actor._source.system.health);
  let pathos = w.pathos.value + 3, healed = 0;
  while (pathos > cap && (h.bashing || h.lethal || h.aggravated)) {
    const k = h.bashing ? "bashing" : h.lethal ? "lethal" : "aggravated";
    h[k] -= 1; pathos -= 1; healed += 1;
  }
  await actor.update({ "system.health": h });
  await actor.update({ "system.wraith.pathos.value": Math.min(pathos, Math.max(0, actor.system.wraith.pathos.max)) });
  return say(actor, "fa-heart-pulse", t("Proj.Vitality", { name: esc(actor.name), n: healed }));
}

/** Эмблема защиты: 2 Пафоса — броня 4 ударный / 2 летальный / 1 губительный на сцену; ещё 1 — разряд. */
export async function emblem(actor) {
  const p = actor.system.wraith.projector;
  if (p.emblem) { await actor.update({ "system.wraith.projector.emblem": false }); return null; }
  const { spendPathos } = await import("./wraith.mjs");
  if (!(await spendPathos(actor, 2))) return null;
  await actor.update({ "system.wraith.projector.emblem": true });
  return say(actor, "fa-shield-halved", t("Proj.Emblem", { name: esc(actor.name) }));
}

/** Глаза мёртвых: в теле — Восприятие + Чутьё, сл. 7: Взгляд жизни и смерти на сцену. */
export function deadEyes(actor) {
  return RollDialog.prompt(actor, { title: t("Proj.DeadEyes"), trait1: "attributes.perception", trait2: "abilities.awareness", difficulty: 7, lockTraits: true,
    diffNote: t("Proj.DeadEyesNote"), extra: { wraith: { kind: "deadEyes" } } });
}

/** Что привело бы призрака к Испытанию, проектора возвращает в тело с 1 губительным уровнем. */
export async function projectorHarrowed(actor) {
  const h = actor._source.system.health;
  await actor.update({ "system.wraith.projector.projecting": false, "system.wraith.projector.emblem": false,
    "system.health": { bashing: 0, lethal: 0, aggravated: Math.min(10, h.aggravated + 1) } });
  return say(actor, "fa-person", t("Proj.Harrowed", { name: esc(actor.name) }), "is-shadow");
}

export async function stainRow(actor, op, data) {
  const list = foundry.utils.deepClone(actor._source.system.wraith.projector.stains);
  if (op === "add") { if (data.key && !list.some(s => s.key === data.key)) list.push({ key: data.key, shown: false }); } else list.splice(data.i, 1);
  return actor.update({ "system.wraith.projector.stains": list });
}
