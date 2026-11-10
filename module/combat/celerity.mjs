// Дополнительные действия Стремительности: отдельная фаза после обычных ходов раунда.
// Действия остаются физическими и выполняются полным пулом; купленные точки снимаются
// с бонуса Ловкости на протяжении всего раунда (правило дисциплины V20).

import { SYSTEM_ID } from "../config.mjs";
import { RollDialog } from "../dice/dialog.mjs";
import { openAttack, pendingAttacks, defendFromHud } from "./combat.mjs";

const t = (key, data) => data ? game.i18n.format(`VTM20.${key}`, data) : game.i18n.localize(`VTM20.${key}`);

const phaseOf = combat => combat?.getFlag?.(SYSTEM_ID, "celerityPhase") ?? null;

/** Возвращает текущую запись фазы только для персонажа, которому сейчас принадлежит очередь. */
function canAct(actor) {
  return !!actor
    && !actor.system?.health?.incapacitated
    && !actor.statuses?.has("r-torpor")
    && !actor.statuses?.has("r-staked")
    && !actor.statuses?.has("r-stunned");
}

export function celerityPhaseFor(actor, combat = game.combat) {
  const phase = phaseOf(combat), index = Number(phase?.index), entry = phase?.queue?.[index];
  if (!phase?.active || !Number.isInteger(index) || entry?.actorUuid !== actor?.uuid || !canAct(actor)) return null;
  const flag = actor.getFlag(SYSTEM_ID, "celerity");
  // Не разрешаем действие по устаревшей записи очереди: без исходного флага
  // его нельзя списать, и игрок получил бы возможность повторять его бесконечно.
  if (!flag || flag.key !== phase.key) return null;
  const remaining = Math.max(0, Number(flag.n ?? 0) - Number(flag.used ?? 0));
  if (!remaining) return null;
  return { ...entry, remaining, index, key: phase.key, nextRound: phase.nextRound };
}

function pendingQueue(combat) {
  const key = `${combat.id}:${combat.round}`;
  const turns = combat.turns ?? combat.combatants.contents;
  const seen = new Set();
  return turns.map(c => c.actor ? { c, actor: c.actor } : null).filter(Boolean)
    .filter(({ actor }) => {
      if (seen.has(actor.uuid)) return false;
      seen.add(actor.uuid);
      return true;
    })
    .map(({ c, actor }) => ({ c, actor, flag: actor.getFlag(SYSTEM_ID, "celerity") }))
    .filter(({ actor, flag }) => flag?.key === key && (flag.n ?? 0) > (flag.used ?? 0) && canAct(actor))
    .map(({ c, actor, flag }) => ({ combatantId: c.id, actorUuid: actor.uuid,
      total: flag.n - (flag.used ?? 0), remaining: flag.n - (flag.used ?? 0) }));
}

async function startCelerityPhase(combat, nextRound) {
  const queue = pendingQueue(combat);
  if (!queue.length) return false;
  const key = `${combat.id}:${combat.round}`;
  await combat.setFlag(SYSTEM_ID, "celerityPhase", { active: true, key, nextRound, index: 0, queue });
  ui.notifications.info(t("Combat.CelerityPhaseStarted", { n: queue.reduce((sum, x) => sum + x.remaining, 0) }));
  ui.combat?.render();
  return true;
}

/** Продвинуть очередь; GM может пропустить оставшиеся действия текущего участника. */
export async function advanceCelerityQueue(combat = game.combat, { skipCurrent = false } = {}) {
  const phase = phaseOf(combat);
  if (!phase?.active) return false;
  let queue = phase.queue.map(x => ({ ...x }));
  let index = phase.index;
  if (skipCurrent && queue[index]) {
    // Пропуск меняет только очередь боя; лист персонажа может принадлежать игроку.
    queue[index].remaining = 0;
  }
  while (index < queue.length && queue[index].remaining <= 0) index++;
  if (index >= queue.length) {
    // Маркер не даёт preUpdateCombat повторно перехватить переход на следующий раунд.
    await combat.setFlag(SYSTEM_ID, "celerityPhase", { active: false, resumeRound: phase.nextRound });
    await combat.update({ round: phase.nextRound, turn: 0 });
    ui.combat?.render();
    return true;
  }
  await combat.setFlag(SYSTEM_ID, "celerityPhase", { ...phase, queue, index });
  ui.combat?.render();
  return true;
}

/** Открыть меню одного дополнительного физического действия. */
export async function useCelerityAction(actor) {
  const entry = celerityPhaseFor(actor);
  if (!entry) return ui.notifications.warn(t("Combat.CelerityNotYourTurn"));
  if (!actor.isOwner) return ui.notifications.warn(t("Combat.CelerityNotOwner"));
  // действия — карточками: значок, название, что будет; один клик — выбор
  // действия за Ярость (Гару) — в той же фазе; они не обязаны быть физическими
  const rage = !!actor.getFlag(SYSTEM_ID, "celerity")?.rage;
  const choices = [
    ["attack", "fa-khanda", t("Combat.CelerityAttack"), t("Combat.CelerityAttackSub")],
    ["physical", "fa-person-running", t(rage ? "Combat.ExtraCheck" : "Combat.CelerityPhysical"), t(rage ? "Combat.ExtraCheckSub" : "Combat.CelerityPhysicalSub")],
    ["move", "fa-person-walking", t("Combat.CelerityMove"), t("Combat.CelerityMoveSub")]
  ];
  if (pendingAttacks(actor).length) choices.unshift(["defend", "fa-shield-halved", t("Combat.CelerityDefend"), t("Combat.CelerityDefendSub")]);
  const esc = x => foundry.utils.escapeHTML(String(x ?? ""));
  const pips = Array.from({ length: Math.min(10, entry.remaining) }, () => `<i class="fa-solid fa-bolt"></i>`).join("");
  let action = null;
  await foundry.applications.api.DialogV2.wait({
    window: { title: rage ? t("Werewolf.Rage") : t("Combat.CelerityWindow"), icon: "fa-solid fa-forward" },
    classes: ["vtm20", "r-dialog", "r-celerity-dialog"], position: { width: 420 },
    content: `<div class="r-cel">
      <div class="r-cel-head">
        <span class="r-cel-kicker">${esc(t("Combat.CelerityKicker"))}</span>
        <b class="r-cel-name">${esc(actor.name)}</b>
        <span class="r-cel-left"><span class="r-cel-pips">${pips}</span>${esc(t("Combat.CelerityLeft", { n: entry.remaining }))}</span>
      </div>
      <p class="r-cel-hint">${esc(t(rage ? "Combat.ExtraActionHint" : "Combat.CelerityActionHint", { n: entry.remaining }))}</p>
      <div class="r-ask-list">${choices.map(([v, icon, label, sub]) => `<button type="button" class="r-ask-opt r-cel-opt" data-v="${v}">
        <i class="fa-solid ${icon} r-cel-ico"></i><span class="r-ask-txt"><b>${esc(label)}</b><em>${esc(sub)}</em></span><i class="fa-solid fa-chevron-right r-ask-go"></i></button>`).join("")}</div>
    </div>`,
    buttons: [{ action: "cancel", icon: "fa-solid fa-xmark", label: t("Combat.CelerityLater") }],
    render: (ev, dlg) => {
      for (const b of dlg.element.querySelectorAll(".r-cel-opt")) b.addEventListener("click", () => { action = b.dataset.v; dlg.close(); });
    },
    rejectClose: false
  });
  if (action === "attack") return openAttack(actor, { celerityAction: true });
  if (action === "physical") return RollDialog.prompt(actor, {
    // Дополнительное действие может быть любой физической проверкой, а не только
    // заранее заданной проверкой Ловкость + Атлетика. Список черт ограничивает
    // RollDialog физическими характеристиками и способностями.
    title: t(rage ? "Combat.ExtraCheck" : "Combat.CelerityPhysical"), physicalOnly: !rage, celerityAction: true,
    diffNote: t(rage ? "Combat.ExtraPhaseNote" : "Combat.CelerityPhaseNote")
  });
  if (action === "defend") return defendFromHud(actor, { celerityAction: true });
  if (action === "move") {
    const used = await actor.consumeCelerityAction();
    if (!used) return ui.notifications.warn(t("Combat.CelerityNotYourTurn"));
    ui.notifications.info(t("Combat.CelerityMoveNow"));
    return true;
  }
  return null;
}

/** Подключить перехват конца раунда: если куплены доп. действия, сначала разрешить их. */
export function registerCelerity() {
  Hooks.on("preUpdateCombat", (combat, changed) => {
    if (!game.user.isGM || changed.round == null || Number(changed.round) <= combat.round) return;
    const phase = phaseOf(combat);
    if (phase?.active) return false;
    if (phase?.resumeRound === Number(changed.round)) return;
    const queue = pendingQueue(combat);
    if (!queue.length) return;
    // Блокируем только переход раунда; текущий раунд остаётся активным до завершения фазы.
    void startCelerityPhase(combat, Number(changed.round)).catch(error => {
      console.error("VTM20 | Не удалось начать фазу Стремительности", error);
      ui.notifications.error(t("Combat.CelerityPhaseError"));
    });
    return false;
  });
  // Игроки не могут менять флаг Combat. Они списывают действие на своём Actor,
  // а клиент Рассказчика синхронизирует остаток и переводит очередь.
  Hooks.on("updateActor", async actor => {
    if (!game.user.isGM) return;
    const combat = game.combat, phase = phaseOf(combat), entry = phase?.queue?.[phase.index];
    if (!phase?.active || entry?.actorUuid !== actor.uuid) return;
    const flag = actor.getFlag(SYSTEM_ID, "celerity");
    const remaining = flag?.key === phase.key && canAct(actor)
      ? Math.max(0, Number(flag.n ?? 0) - Number(flag.used ?? 0)) : 0;
    if (entry.remaining === remaining) return;
    const queue = phase.queue.map((item, index) => index === phase.index ? { ...item, remaining } : item);
    await combat.setFlag(SYSTEM_ID, "celerityPhase", { ...phase, queue });
    if (remaining === 0) await advanceCelerityQueue(combat);
    else ui.combat?.render();
  });
  Hooks.on("updateCombat", async combat => {
    const phase = phaseOf(combat);
    if (phase && !phase.active && phase.resumeRound != null && combat.round >= phase.resumeRound) {
      await combat.unsetFlag(SYSTEM_ID, "celerityPhase");
    }
    ui.combat?.render();
  });
}
