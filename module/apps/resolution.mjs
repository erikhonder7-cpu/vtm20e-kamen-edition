// module/apps/resolution.mjs
// Разрешение Страстей и Оков (Wraith 20, гл. 8, «Resolving Passions», «Resolving Fetters»), их угасание («Neglect») и потеря
// Оков («Destruction»); срок в Землях Теней без Оков. Броски — по решению рассказчика, после отыгрыша.
//  • Ослабление: рейтинг, сл. 9; у Страсти каждый успех −1, у Оков — каждые два; ниже 1 так не опустить.
//  • Итоговый бросок: Воля (постоянная), сл. 5 + исходный рейтинг; нужно успехов не меньше исходного рейтинга. Оковы — только
//    когда рейтинг уже не выше половины исходного (у Страстей это совет книги). Провал — рейтинг +1. Ботч Страсти — Испытание
//    Разрушения, рейтинг +1 и больше не разрешить; ботч Оков — Оковы уничтожены и Испытание Разрушения.
//  • Пренебрежение: рейтинг, сл. 9; провал −1, ботч −2; до нуля — Испытание.
//  • Без Оков: Воля за сцену в Землях Теней; если хоть одни Оковы разрешены — Воля за день.

import { RollDialog } from "../dice/dialog.mjs";
import { t, esc, say, pick, harrowing } from "./wraith.mjs";

const PATH = { passion: "system.wraith.passions", fetter: "system.wraith.fetters" };
const listOf = (actor, kind) => foundry.utils.deepClone(actor._source.system.wraith[kind === "passion" ? "passions" : "fetters"] ?? []);
const save = (actor, kind, list) => actor.update({ [PATH[kind]]: list });
/** Половина исходного рейтинга, вниз, не меньше 1. */
export const halfOf = orig => Math.max(1, Math.floor(orig / 2));
const label = (kind, r) => r.text || t(kind === "passion" ? "Res.Passion" : "Res.Fetter");

/** Состояние разрешения строки — для листа. */
export function resolveInfo(row, kind) {
  const orig = row.orig || row.value;
  return { resolving: !!row.orig && !row.resolved, orig, half: halfOf(orig), ready: row.value <= halfOf(orig), locked: !!row.locked,
    tip: row.orig && !row.resolved ? t("Res.Progress", { v: row.value, orig: row.orig, half: halfOf(row.orig) }) : "" };
}

/** Разрешение: ослабить или итоговый бросок. */
export async function resolveRow(actor, kind, i) {
  i = Number(i);
  const r = listOf(actor, kind)[i];
  if (!r) return null;
  if (r.resolved) return ui.notifications.info(t("Res.Already"));
  if (r.locked) return ui.notifications.warn(t("Res.Locked"));
  if (!r.value) return ui.notifications.warn(t("Res.Empty"));
  const orig = r.orig || r.value, half = halfOf(orig), ready = r.value <= half, d = Math.min(10, 5 + orig);
  const step = await pick(t("Res.Title", { text: label(kind, r) }), [
    { key: "weaken", icon: "fa-feather", title: t("Res.Weaken"), sub: t(kind === "passion" ? "Res.WeakenSubP" : "Res.WeakenSubF", { n: r.value }), disabled: r.value <= 1 },
    { key: "final", icon: "fa-dove", title: t("Res.Final"),
      sub: t("Res.FinalSub", { d, n: orig }) + (ready ? "" : ` · ${t(kind === "passion" ? "Res.EarlyP" : "Res.NotReadyF", { n: half })}`), disabled: kind === "fetter" && !ready }
  ], { lead: t("Res.Lead", { orig, half }) });
  if (step === "weaken") return weaken(actor, kind, i, orig);
  if (step === "final") return finalRoll(actor, kind, i, orig);
  return null;
}

async function weaken(actor, kind, i, orig) {
  const r = listOf(actor, kind)[i];
  return RollDialog.prompt(actor, { title: t("Res.WeakenTitle", { text: label(kind, r) }), pool: r.value, difficulty: 9, lockTraits: true,
    extra: { wraith: { kind: "resolve", step: "weaken", list: kind, text: r.text } },
    onRolled: async res => {
      const list = listOf(actor, kind), row = list[i];
      if (!row) return;
      const n = res?.successes ?? 0, drop = kind === "passion" ? n : Math.floor(n / 2), was = row.value;
      row.orig ||= orig;
      row.value = Math.max(1, row.value - drop);
      await save(actor, kind, list);
      await say(actor, "fa-feather", t("Res.Weakened", { name: esc(actor.name), text: esc(label(kind, row)), was, v: row.value, half: halfOf(row.orig) }));
    } });
}

async function finalRoll(actor, kind, i, orig) {
  const r = listOf(actor, kind)[i], d = Math.min(10, 5 + orig);
  return RollDialog.prompt(actor, { title: t("Res.FinalTitle", { text: label(kind, r) }), trait1: "willpower.permanent", difficulty: d, lockTraits: true,
    diffNote: t("Res.FinalNote", { n: orig }),
    extra: { wraith: { kind: "resolve", step: "final", list: kind, text: r.text, need: orig } },
    onRolled: async res => {
      const list = listOf(actor, kind), row = list[i];
      if (!row) return;
      const n = res?.successes ?? 0, name = esc(actor.name), text = esc(label(kind, row));
      if (res?.outcome === "botch") {
        if (kind === "fetter") {
          list.splice(i, 1);
          await save(actor, kind, list);
          await say(actor, "fa-link-slash", t("Res.FetterBotch", { name, text }), "is-warn");
        } else {
          Object.assign(row, { orig: orig, value: Math.min(5, row.value + 1), locked: true });
          await save(actor, kind, list);
          await say(actor, "fa-heart-crack", t("Res.PassionBotch", { name, text }), "is-warn");
        }
        return harrowing(actor, "resolution");
      }
      if (n >= orig) {
        Object.assign(row, { orig: orig, value: 0, resolved: true });
        await save(actor, kind, list);
        return say(actor, "fa-dove", t(kind === "passion" ? "Res.PassionDone" : "Res.FetterDone", { name, text }));
      }
      Object.assign(row, { orig: orig, value: Math.min(5, row.value + 1) });
      await save(actor, kind, list);
      return say(actor, "fa-hand", t("Res.Failed", { name, text, n, need: orig, v: row.value }), "is-warn");
    } });
}

/** Рассказчик: пренебрежение (сл. 9) или — у Оков — их гибель в мире живых. */
export async function waneRow(actor, kind, i) {
  if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("VTM20.Notify.GMOnly"));
  i = Number(i);
  const r = listOf(actor, kind)[i];
  if (!r || r.resolved) return null;
  const how = await pick(t("Res.WaneTitle", { text: label(kind, r) }), [
    { key: "neglect", icon: "fa-hourglass-end", title: t("Res.Neglect"), sub: t("Res.NeglectSub", { n: r.value }), disabled: !r.value },
    ...(kind === "fetter" ? [{ key: "lost", icon: "fa-link-slash", title: t("Res.Lost"), sub: t("Res.LostSub") }] : [])
  ], { lead: t("Res.WaneLead") });
  if (how === "lost") {
    const list = listOf(actor, kind);
    list.splice(i, 1);
    await save(actor, kind, list);
    await say(actor, "fa-link-slash", t("Res.LostMsg", { name: esc(actor.name), text: esc(label(kind, r)) }), "is-warn");
    return harrowing(actor, "fetter");
  }
  if (how !== "neglect") return null;
  return RollDialog.prompt(actor, { title: t("Res.NeglectTitle", { text: label(kind, r) }), pool: r.value, difficulty: 9, lockTraits: true,
    extra: { wraith: { kind: "resolve", step: "neglect", list: kind, text: r.text } },
    onRolled: async res => {
      const list = listOf(actor, kind), row = list[i];
      if (!row) return;
      const drop = res?.outcome === "botch" ? 2 : (res?.successes ?? 0) ? 0 : 1;
      if (!drop) return;
      row.value = Math.max(0, row.value - drop);
      const gone = !row.value;
      if (gone) list.splice(i, 1);
      await save(actor, kind, list);
      await say(actor, "fa-hourglass-end", t(gone ? "Res.NeglectGone" : "Res.NeglectDrop", { name: esc(actor.name), text: esc(label(kind, row)), n: drop, v: row.value }), "is-warn");
      if (gone) return harrowing(actor, kind);
    } });
}

/** Путь к Трансценденции (гл. 8; механики у книги нет): сколько Страстей и Оков разрешено. */
export function transcendInfo(actor) {
  const w = actor.system.wraith, p = w.passions.filter(x => x.resolved).length, f = w.fetters.filter(x => x.resolved).length;
  return p + f ? { passions: p, fetters: f } : null;
}

/** Сколько у призрака живых Оков; без них — срок в Землях Теней за Волю. */
export function shadowlandsInfo(actor) {
  const f = actor.system.wraith.fetters, live = f.filter(x => !x.resolved && x.value > 0).length;
  return { live, noFetters: !live, perDay: !live && f.some(x => x.resolved) };
}

/** Остаться в Землях Теней без Оков: 1 Воля — сцена (день, если хоть одни Оковы разрешены). */
export async function linger(actor) {
  const s = shadowlandsInfo(actor), wp = actor.system.willpower.temporary;
  if (!s.noFetters) return ui.notifications.info(t("Res.HasFetters"));
  if (wp < 1) return say(actor, "fa-door-open", t("Res.Byway", { name: esc(actor.name) }), "is-warn");
  await actor.update({ "system.willpower.temporary": wp - 1 });
  return say(actor, "fa-hourglass-half", t(s.perDay ? "Res.LingerDay" : "Res.LingerScene", { name: esc(actor.name), n: wp - 1 }));
}
