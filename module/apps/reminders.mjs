// module/apps/reminders.mjs
// Напоминание со сроком после удачного броска ротэ мага: срок — из описания ротэ тем же правилом, что у ритуалов
// (apps/timers.mjs ritualDuration: «до рассвета», «на ночь» — ночь; «на час» — час; «до конца сцены», «на сцену» — сцена).
// Без срока в тексте — ничего. Ложится эффектом на вкладку «Эффекты» (data/effects.mjs → reminder:<срок>), гаснет по часам
// хроники или с концом сцены. Ритуалы так уже умеют (apps/timers.mjs startRitualEffect).

import { SYSTEM_ID } from "../config.mjs";
import { ritualDuration, untilFor } from "./timers.mjs";
import { getClock } from "./calendar.mjs";

/** Напоминание: name — сила, html — её текст, n — успехи. Возвращает эффект или null (нет срока или провал). */
export async function reminderAfterRoll(actor, { name, html, img = null, n = 0 }) {
  const mode = ritualDuration(html);
  if (!mode || !(n > 0) || !actor?.isOwner) return null;
  const now = getClock(), until = untilFor(mode, { now });
  const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [{ name, ...(img ? { img } : {}), description: html ?? "",
    flags: { [SYSTEM_ID]: { power: `reminder:${mode}`, mode, ready: true, successes: n, ...(until ? { start: now, until } : {}) } } }]);
  return effect;
}
