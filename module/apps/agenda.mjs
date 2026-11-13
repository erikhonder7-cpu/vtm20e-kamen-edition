// module/apps/agenda.mjs
// Агенды (C20 Players Guide, гл. 1, «Agendas») — политика как растянутое действие, на листе подменыша (system.changeling.agendas):
//   · Рассказчик задаёт пул (Атрибут + Способность), сложность и сколько успехов нужно;
//   · успехи копятся; провал — +1 к счёту провалов; ботч обнуляет накопленное (как растянутые броски системы, dice/roll.mjs);
//   · Агенда принята, когда набрана цель и успехов больше, чем провалов; малый перевес — «едва-едва» (до 2 — правило системы);
//   · Обаяние или Манипуляция 4+ и Закон или Политика 3+ снижают цель — по 1 за каждое (сколько именно, книга оставляет
//     Рассказчику; по 1 — правило системы);
//   · продвигать за раз можно одну Агенду (активная); против сильного соперника — встречная гонка: Рассказчик бросает за него,
//     первый набравший цель побеждает.

import { RollDialog } from "../dice/dialog.mjs";
import { VTM20 } from "../config.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Agenda.${k}`, d) : game.i18n.localize(`VTM20.Agenda.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const say = (actor, html, warn = false) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="r-notice r-type-changeling ${warn ? "is-warn" : ""}"><i class="fa-solid fa-landmark"></i> ${html}</div>` });

export const AGENDA_ATTRS = ["charisma", "manipulation", "appearance", "intelligence", "wits", "perception"];
export const AGENDA_ABILS = ["politics", "law", "expression", "leadership", "subterfuge", "etiquette", "empathy", "intimidation", "academics"];
const list = actor => foundry.utils.deepClone(actor._source.system.changeling.agendas ?? []);

/** Снижение цели за мастерство: Обаяние или Манипуляция 4+ — 1, Закон или Политика 3+ — 1. */
export function agendaEase(actor) {
  const a = actor.system.attributes, ab = actor.system.abilities;
  return (Math.max(a.charisma?.total ?? 0, a.manipulation?.total ?? 0) >= 4 ? 1 : 0) + (Math.max(ab.law?.value ?? 0, ab.politics?.value ?? 0) >= 3 ? 1 : 0);
}

/** Для листа: Агенды с пулом, целью с поправкой, ходом и исходом. */
export function agendasView(actor) {
  const ease = agendaEase(actor), loc = k => game.i18n.localize(k);
  const opts = (keys, cfg, cur) => keys.map(k => ({ key: k, label: loc(cfg[k]?.label ?? k), selected: k === cur }));
  return (actor.system.changeling.agendas ?? []).map((g, i) => {
    const need = Math.max(1, g.need - ease), pool = (actor.system.attributes[g.attr]?.total ?? 0) + (actor.system.abilities[g.abil]?.value ?? 0);
    return { ...g, i, need, baseNeed: g.need, ease, pool, pct: Math.min(100, Math.round(g.got / need * 100)), rivalPct: g.rival ? Math.min(100, Math.round(g.rivalGot / need * 100)) : 0,
      attrs: opts(AGENDA_ATTRS, VTM20.attributes, g.attr), abils: opts(AGENDA_ABILS, VTM20.abilities, g.abil),
      stateLabel: g.state ? t(`State.${g.state}`) : "" };
  });
}

export function addAgenda(actor) {
  const l = list(actor);
  l.push({ name: t("NewName"), text: "", attr: "manipulation", abil: "politics", diff: 6, need: 10, got: 0, fails: 0, active: !l.some(x => x.active && !x.state), rival: "", rivalGot: 0, state: "" });
  return actor.update({ "system.changeling.agendas": l });
}
export function dropAgenda(actor, i) { const l = list(actor); l.splice(i, 1); return actor.update({ "system.changeling.agendas": l }); }
/** Продвигать эту: остальные — на паузе. */
export function focusAgenda(actor, i) { const l = list(actor); l.forEach((x, j) => { x.active = j === i; }); return actor.update({ "system.changeling.agendas": l }); }
export function resetAgenda(actor, i) {
  const l = list(actor); Object.assign(l[i], { got: 0, fails: 0, rivalGot: 0, state: "" });
  return actor.update({ "system.changeling.agendas": l });
}

/** Исход после броска: цель набрана и успехов больше провалов — принята; соперник первым набрал цель — провалена. */
async function settle(actor, i) {
  const l = list(actor), g = l[i], need = Math.max(1, g.need - agendaEase(actor));
  if (g.state) return;
  if (g.rival && g.rivalGot >= need && g.got < need) g.state = "lost";
  else if (g.got >= need && g.got > g.fails) g.state = g.got - Math.max(need, g.fails) <= 2 ? "narrow" : "passed";
  if (!g.state) return actor.update({ "system.changeling.agendas": l });
  await actor.update({ "system.changeling.agendas": l });
  return say(actor, t(`Done.${g.state}`, { actor: esc(actor.name), name: esc(g.name), rival: esc(g.rival) }), g.state === "lost");
}

/** Бросок за Агенду (только активную): пул и сложность — заданные Рассказчиком. */
export async function rollAgenda(actor, i) {
  const g = actor.system.changeling.agendas?.[i];
  if (!g || g.state) return null;
  if (!g.active) return ui.notifications.warn(t("NotActive"));
  const need = Math.max(1, g.need - agendaEase(actor));
  return RollDialog.prompt(actor, { title: t("RollTitle", { name: g.name }), subtitle: t("Progress", { got: g.got, need, fails: g.fails }),
    trait1: `attributes.${g.attr}`, trait2: `abilities.${g.abil}`, difficulty: g.diff, kind: "check",
    diffNote: `<i class="fa-solid fa-landmark"></i> ${t("RollNote")}`,
    onRolled: async r => {
      const l = list(actor), x = l[i];
      if (!x) return;
      if (r.outcome === "botch") { x.got = 0; x.fails += 1; }
      else if (r.successes > 0) x.got += r.successes;
      else x.fails += 1;
      await actor.update({ "system.changeling.agendas": l });
      if (r.outcome === "botch") await say(actor, t("Botch", { actor: esc(actor.name), name: esc(x.name) }), true);
      return settle(actor, i);
    } });
}

/** Ход соперника (Рассказчик): пул вводится, сложность — та же, что у Агенды (правило системы, если Рассказчик не назначит иную). */
export async function rollRival(actor, i) {
  const g = actor.system.changeling.agendas?.[i];
  if (!g?.rival || g.state) return null;
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("RivalTitle", { rival: g.rival }), icon: "fa-solid fa-chess-rook" }, classes: ["vtm20", "r-dialog"],
    content: `<p class="r-hint">${t("RivalHint")}</p>
      <label class="r-field"><span>${t("RivalPool")}</span><input type="number" name="pool" value="6" min="1" max="30"></label>
      <label class="r-field"><span>${t("Diff")}</span><input type="number" name="diff" value="${g.diff}" min="2" max="10"></label>`,
    ok: { label: t("RivalDo"), callback: (e, b) => ({ pool: Math.max(1, Number(b.form.elements.pool.value) || 1), diff: Math.clamp(Number(b.form.elements.diff.value) || 6, 2, 10) }) },
    rejectClose: false
  });
  if (!res) return null;
  const { rollPool } = await import("../dice/roll.mjs");
  const r = await rollPool({ actor, title: t("RivalTitle", { rival: g.rival }), subtitle: g.name, pool: res.pool, difficulty: res.diff, kind: "check",
    breakdown: [{ label: g.rival, value: res.pool }], messageMode: "gm" });
  if (!r) return null;
  const l = list(actor), x = l[i];
  x.rivalGot = r.outcome === "botch" ? 0 : x.rivalGot + Math.max(0, r.successes);
  await actor.update({ "system.changeling.agendas": l });
  return settle(actor, i);
}

/** Вручную: успехи помощников (другие персонажи бросают свои пулы) или поправка Рассказчика. */
export function bumpAgenda(actor, i, d) {
  const l = list(actor), x = l[i];
  if (!x || x.state) return null;
  x.got = Math.max(0, x.got + d);
  return actor.update({ "system.changeling.agendas": l }).then(() => settle(actor, i));
}
