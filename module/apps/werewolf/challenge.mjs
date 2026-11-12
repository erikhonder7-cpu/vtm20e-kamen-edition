// module/apps/werewolf/challenge.mjs
// Вызов на Ранг (W20, гл. 3): набрав нужную Славу, Гару бросает вызов сородичу равного или выше желаемого Ранга;
// испытание выбирает вызываемый (от поединка за главенство до квеста), при победе — новый Ранг. Щенку Клиата дают
// без вызова — после Обряда Посвящения. Вызвать можно только на Ранг на 1 выше своего.
// Слава (таблица наград): участие в справедливом вызове — Слава 1, Честь 2; вызов слишком высокому или низкому Рангу — Честь −3.
// Исход отмечает рассказчик кнопками карточки в чате.

import { SYSTEM_ID } from "../../config.mjs";
import { W, t, esc } from "../werewolf.mjs";

const KEYS = ["glory", "honor", "wisdom"];
const FAIR = [1, 2, 0], UNFAIR = [0, -3, 0];

function rankNeed(auspice, rank) {
  const row = W().rank?.[auspice];
  return row && rank >= 1 && rank <= row.length ? row[rank - 1] : null;
}
/** Хватает ли постоянной Славы на следующий Ранг (Рагабаш — сумма). */
export function rankReady(actor) {
  const w = actor.system.werewolf, need = rankNeed(w.auspice, w.rank + 1);
  if (!need) return false;
  const p = k => w.renown[k].permanent;
  return typeof need === "number" ? p("glory") + p("honor") + p("wisdom") >= need : KEYS.every((k, i) => p(k) >= need[i]);
}
const rankName = n => W().rankNames?.[n - 1] ?? `${t("Rank")} ${n}`;

/** Временная Слава с переносом: ниже нуля сгорает постоянная точка (и даёт 10 временных). */
export async function addRenown(actor, v) {
  const ren = foundry.utils.deepClone(actor.system.werewolf.renown);
  KEYS.forEach((k, j) => {
    if (!v[j]) return;
    let tmp = ren[k].temporary + v[j], perm = ren[k].permanent;
    while (tmp < 0 && perm > 0) { perm -= 1; tmp += 10; }
    ren[k] = { permanent: perm, temporary: Math.clamp(tmp, 0, 10) };
  });
  return actor.update({ "system.werewolf.renown": ren });
}
const renownLine = v => KEYS.map((k, j) => v[j] ? `${t(`Renown.${k}`)} ${v[j] > 0 ? "+" : "−"}${Math.abs(v[j])}` : "").filter(Boolean).join(", ");

/**
 * Бросить вызов (или, щенку, пройти Обряд Посвящения): окно выбора вызываемого — карточка в чат.
 * Вызываемый — Гару из мира или просто имя; ниже желаемого Ранга — вызов нечестный (Честь −3 за любой исход).
 */
export async function challengeRank(actor) {
  if (!actor.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: actor.name }));
  const w = actor.system.werewolf, to = w.rank + 1;
  if (!rankReady(actor)) return ui.notifications.warn(t("Challenge.NotReady"));
  const passage = w.rank === 0;
  let target = null, unfair = false;
  if (!passage) {
    const garou = game.actors.filter(a => a.id !== actor.id && a.system.werewolf?.on !== false && a.system.werewolf && (a.type === "werewolf" || a.system.werewolf.auspice))
      .sort((a, b) => b.system.werewolf.rank - a.system.werewolf.rank || a.name.localeCompare(b.name, "ru"));
    const opts = garou.map(a => `<option value="${a.id}">${esc(a.name)} · ${esc(rankName(a.system.werewolf.rank))}</option>`).join("");
    const res = await foundry.applications.api.DialogV2.wait({
      window: { title: t("Challenge.Title", { name: actor.name }), icon: "fa-solid fa-hand-fist" }, classes: ["vtm20", "r-dialog", "r-type-werewolf"],
      position: { width: 460 }, rejectClose: false,
      content: `<div class="r-form"><p>${esc(t("Challenge.Rule", { n: rankName(to) }))}</p>
        <label class="r-field"><span>${esc(t("Challenge.Whom"))}</span><select name="who"><option value="">—</option>${opts}</select></label>
        <label class="r-field"><span>${esc(t("Challenge.OrName"))}</span><input type="text" name="name"></label>
        <label class="r-field"><span>${esc(t("Challenge.Trial"))}</span><input type="text" name="trial" placeholder="${esc(t("Challenge.TrialHint"))}"></label></div>`,
      buttons: [{ action: "ok", icon: "fa-solid fa-hand-fist", label: t("Challenge.Do"), default: true,
        callback: (e, b) => ({ who: b.form.elements.who.value, name: b.form.elements.name.value.trim(), trial: b.form.elements.trial.value.trim() }) },
      { action: "cancel", label: game.i18n.localize("VTM20.Common.Cancel") }]
    });
    if (!res || res === "cancel") return null;
    const other = res.who ? game.actors.get(res.who) : null;
    if (!other && !res.name) return ui.notifications.warn(t("Challenge.NoTarget"));
    // вызывать можно Гару равного или выше желаемого Ранга; ниже — нечестно, выше на 2 и больше — тоже
    unfair = !!other && (other.system.werewolf.rank < to || other.system.werewolf.rank > to + 1);
    target = { id: other?.id ?? "", name: other?.name ?? res.name, rank: other?.system.werewolf.rank ?? null, trial: res.trial };
  }
  const btn = (k, icon) => `<button type="button" data-r-challenge="${k}"><i class="fa-solid ${icon}"></i> ${esc(t(`Challenge.${k}`))}</button>`;
  const head = passage ? t("Challenge.PassageText", { name: esc(actor.name), r: esc(rankName(1)) })
    : t("Challenge.Text", { name: esc(actor.name), other: esc(target.name), r: esc(rankName(to)) });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    flags: { [SYSTEM_ID]: { rankChallenge: { actor: actor.uuid, to, passage, unfair, target: target?.id ?? "" } } },
    content: `<div class="r-notice r-type-werewolf r-challenge-card"><i class="fa-solid ${passage ? "fa-moon" : "fa-hand-fist"}"></i> ${head}
      ${target?.trial ? `<p>${esc(t("Challenge.TrialIs"))}: <b>${esc(target.trial)}</b></p>` : passage ? "" : `<p><small>${esc(t("Challenge.TrialBy"))}</small></p>`}
      ${unfair ? `<p class="r-warn">${esc(t("Challenge.Unfair"))}</p>` : ""}
      <div class="r-card-buttons">${passage ? btn("Passed", "fa-moon") : `${btn("Won", "fa-crown")}${btn("Lost", "fa-xmark")}`}</div></div>`
  });
}

/** Исход вызова (рассказчик): победа — новый Ранг; Слава за участие — при любом исходе. */
async function resolve(msg, kind, html) {
  const f = msg.flags[SYSTEM_ID].rankChallenge, actor = await fromUuid(f.actor);
  if (!actor || f.done) return;
  const up = kind !== "Lost" && actor.system.werewolf.rank < f.to;
  if (up) await actor.update({ "system.werewolf.rank": f.to });
  const v = f.passage ? null : f.unfair ? UNFAIR : FAIR;
  if (v) await addRenown(actor, v);
  await msg.setFlag(SYSTEM_ID, "rankChallenge", { ...f, done: kind });
  for (const b of html.querySelectorAll("[data-r-challenge]")) b.disabled = true;
  const line = up ? t("Challenge.Up", { name: esc(actor.name), r: esc(rankName(f.to)) }) : t("Challenge.Down", { name: esc(actor.name) });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="r-notice r-type-werewolf"><i class="fa-solid ${up ? "fa-crown" : "fa-xmark"}"></i> ${line}${v ? ` <small>${esc(renownLine(v))}</small>` : ""}</div>` });
}

export function registerRankChallenge() {
  Hooks.on("renderChatMessageHTML", (msg, html) => {
    const f = msg.flags?.[SYSTEM_ID]?.rankChallenge;
    if (!f) return;
    if (f.done) for (const b of html.querySelectorAll("[data-r-challenge]")) b.disabled = true;
    html.addEventListener("click", ev => {
      const b = ev.target.closest("[data-r-challenge]");
      if (!b) return;
      if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("VTM20.Notify.GMOnly"));
      return resolve(msg, b.dataset.rChallenge, html);
    });
  });
}
