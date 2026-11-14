// module/sheets/actor/sabbat.mjs
// Действия листа — ритусы Шабаша (data/sabbat-ritae.json, вкладка «Преимущества»): Огненная пляска (V20, гл. 7) —
// подойти к огню (Смелость, сл. 5) и прыжок (Ловкость + Атлетика, сл. 6; перепрыгнувший — Смелость +1 на 3 ночи);
// любой ритус — правилами в чат. this — лист (ApplicationV2 зовёт обработчики со своим this).

import { Codex } from "../../data/codex.mjs";
import { RollDialog } from "../../dice/dialog.mjs";

const t = k => game.i18n.localize(`VTM20.Ritae.${k}`);

function onRitaeFire(event, target) {
  const leap = target.dataset.step === "leap";
  return RollDialog.prompt(this.actor, leap
    ? { title: t("LeapTitle"), trait1: "attributes.dexterity", trait2: "abilities.athletics", difficulty: 6, diffNote: t("LeapNote") }
    : { title: t("ApproachTitle"), trait1: "virtues.courage", trait2: "", difficulty: 5, diffNote: t("ApproachNote") });
}

function onRitaeChat(event, target) {
  const g = Codex["sabbat-ritae"]?.groups?.find(x => x.key === target.dataset.group), r = g?.list?.[Number(target.dataset.i)];
  if (!r) return null;
  const esc = foundry.utils.escapeHTML;
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this.actor }),
    content: `<div class="r-notice r-ritae-card"><i class="fa-solid fa-cross"></i> <b>${esc(r.name)}</b>${r.en ? ` <em>(${esc(r.en)})</em>` : ""}
      <small>${esc([t(g.key), r.faction].filter(Boolean).join(" · "))}</small>${r.html}</div>` });
}

export const SABBAT_ACTIONS = { ritaeFire: onRitaeFire, ritaeChat: onRitaeChat };
