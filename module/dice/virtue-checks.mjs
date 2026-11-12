// module/dice/virtue-checks.mjs
// Проверки ярости и Ротшрека (02, 05): один запуск для листа и для подсказок в чате по событиям —
// огонь и солнце (Ротшрек), голод, когда кровь опускается ниже 5 (ярость). Проваленная проверка ставит
// состояние на токен сама (rollPool), здесь — только предложить бросок тому, кто управляет персонажем.

import { VTM20, SYSTEM_ID } from "../config.mjs";
import { RollDialog } from "./dialog.mjs";
import { Codex } from "../data/codex.mjs";

/**
 * Иерархия грехов Пути (V20, гл. 6; Пути Просветления — свои): что совершено. Грех с рейтингом выше нынешней морали
 * проверки не требует; иначе — бросок с грехом в заметке. Возвращает { sin } | null (отмена) | { skip: true }.
 */
async function pickSin(actor) {
  const path = Codex.path(actor.system.morality?.path ?? "humanity"), cur = actor.system.morality?.value ?? 7;
  const list = path?.hierarchy ?? [];
  if (!list.length) return { sin: null };
  const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
  const rows = list.map((h, i) => `<label class="r-sin ${h.rating > cur ? "is-safe" : ""}"><input type="radio" name="sin" value="${i}" ${i === list.findIndex(x => x.rating <= cur) ? "checked" : ""}>
    <b>${h.rating}</b><span>${esc(h.sin)}</span></label>`).join("");
  const i = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("Roll.degeneration.title"), icon: "fa-solid fa-scale-unbalanced" }, classes: ["vtm20", "r-dialog", "r-sins"], position: { width: 520 }, rejectClose: false,
    content: `<p>${t("Sins.Ask", { path: esc(VTM20.label(path)), n: cur })}</p><div class="r-sin-list">${rows}</div>`,
    ok: { label: t("Sins.Go"), icon: "fa-solid fa-dice-d10", callback: (ev, btn) => Number(btn.form.elements.sin.value) }
  });
  if (i == null || Number.isNaN(i)) return null;
  const h = list[i];
  if (h.rating > cur) { await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice"><i class="fa-solid fa-scale-balanced"></i> ${t("Sins.Safe", { name: esc(actor.name), sin: esc(h.sin), r: h.rating, n: cur })}</div>` }); return { skip: true }; }
  return { sin: h };
}

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);

/** Ниже этого запаса крови вампир голоден (V20, 05). */
export const HUNGER_BELOW = 5;

/** Поводы к Безумию гулей и дампиров (Accursed Heirs, гл. 1; по образцу Ghouls: Fatal Addiction): ключ → сложность. */
export const GHOUL_PROVOCATIONS = [
  ["insult", 3], ["intoxication", 3], ["arousal", 3, "rapture"], ["beaten", 4], ["lovedOne", 4],
  ["privateHumiliation", 4], ["intimacy", 4, "rapture"], ["publicHumiliation", 5], ["lethal", 5], ["rejection", 6]
];

/** Выбор повода перед проверкой гуля или дампира; null — отмена, 0 — «иное» (прежнее правило). */
async function pickProvocation(kind) {
  const list = GHOUL_PROVOCATIONS.filter(p => kind !== "rapture" || p[2] === "rapture");
  const buttons = list.map(([k, d], i) => ({ action: k, label: `${t(`Provocation.${k}`)} — ${d}`, default: i === 0 }));
  if (kind === "frenzy") buttons.push({ action: "other", label: t("Provocation.other") });
  const v = await foundry.applications.api.DialogV2.wait({
    window: { title: t(kind === "rapture" ? "Roll.rapture.title" : "Roll.frenzy.title") }, classes: ["vtm20", "r-dialog", "r-provocation"],
    position: { width: 460 }, content: `<p>${t("Provocation.Hint")}</p>`, buttons
  }).catch(() => null);
  if (!v) return null;
  return v === "other" ? 0 : list.find(p => p[0] === v)?.[1] ?? 0;
}

/** Окно проверки ярости (Самоконтроль) или Ротшрека (Мужество). difficulty — сложность по событию, без поправок клана. */
export async function rollVirtueCheck(actor, kind, { difficulty = 6, fromPrompt = false } = {}) {
  // Голконда: Зверь не властен — ни бешенства, ни Ротшрека
  const shield = (await import("../apps/golconda.mjs")).golcondaShield(actor, kind);
  if (shield) return shield;
  // гуль и дампир: сложность — по поводу из таблицы (без поправки «−3» — таблица уже для гулей)
  let table = 0;
  if (actor.type === "ghoul" && (kind === "frenzy" || kind === "rapture") && !fromPrompt) {
    table = await pickProvocation(kind);
    if (table === null) return null;
  }
  // Дампир (Accursed Heirs, гл. 1, «Жажда крови»): против Безумия — не больше кубиков Самоконтроля, чем крови в запасе
  const bloodlust = () => {
    if (!actor.isDhampir) return {};
    const sc = actor.traitValue?.("virtues.selfControl") ?? 0, blood = actor.system.blood?.value ?? 0;
    return blood < sc ? { bonus: blood - sc, diffNote: `<i class="fa-solid fa-droplet"></i> ${t("Roll.Bloodlust", { n: blood })}` } : {};
  };
  if (kind === "frenzy") {
    // Бруха: +2 к сложности, воля не помогает предотвратить (02); гули — −3
    const brujah = actor.system.clan === "brujah" || actor.system.clan === "bruhaAntitribu";
    if (actor.virtueKey?.("selfControl") === "instinct" && actor.type !== "ghoul") return instinctFrenzy(actor, Math.max(2, difficulty + (brujah ? 2 : 0)));
    return RollDialog.prompt(actor, {
      title: t("Roll.frenzy.title"), trait1: "virtues.selfControl", reflexive: true, kind: "frenzy",
      extra: { atavism: VTM20.atavismClans.includes(actor.system.clan) },
      difficulty: table ? table : Math.max(2, difficulty + (brujah ? 2 : 0) - (actor.type === "ghoul" ? 3 : 0)), noWillpower: brujah, lockTraits: true,
      ...bloodlust()
    });
  }
  // Безумие страсти (Accursed Heirs, гл. 1): у гулей и дампиров желание сильнее рассудка. Сильное возбуждение — сл. 3,
  // интимная близость — 4 (таблица поводов к Безумию гулей и дампиров)
  if (kind === "rapture") return RollDialog.prompt(actor, {
    title: t("Roll.rapture.title"), trait1: "virtues.selfControl", reflexive: true, kind: "rapture", lockTraits: true,
    difficulty: table || (difficulty === 6 ? 3 : difficulty), ...bloodlust(),
    diffNote: [bloodlust().diffNote, `<i class="fa-solid fa-heart-pulse"></i> ${t("Roll.rapture.note")}`].filter(Boolean).join("<br>")
  });
  if (kind === "degeneration") {
    const pickd = fromPrompt ? { sin: null } : await pickSin(actor);
    if (!pickd || pickd.skip) return null;
    return RollDialog.prompt(actor, { title: t("Roll.degeneration.title"), trait1: "virtues.conscience", reflexive: true, kind: "degeneration", difficulty, noWillpower: true, lockTraits: true,
      ...(pickd.sin ? { diffNote: `<i class="fa-solid fa-scale-unbalanced"></i> ${t("Sins.Note", { r: pickd.sin.rating, sin: foundry.utils.escapeHTML(pickd.sin.sin) })}` } : {}),
      onRolled: res => degenerate(actor, res) });
  }
  return RollDialog.prompt(actor, { title: t("Roll.rotschreck.title"), trait1: "virtues.courage", reflexive: true, kind: "rotschreck", difficulty, lockTraits: true });
}

/**
 * Итог проверки деградации (V20, гл. 7): успех — мораль та же; неудача — −1 Человечность/Путь;
 * провал — ещё −1 Совесть/Убеждённость и психическое расстройство (выбирают игрок и рассказчик). 0 — Зверь победил.
 */
export async function degenerate(actor, res) {
  if (!res || res.successes > 0 && res.outcome !== "botch") return;
  const m = actor.system.morality, v = actor.system.virtues.conscience, botch = res.outcome === "botch";
  const now = Math.max(0, m.value - 1), upd = { "system.morality.value": now };
  if (botch) upd["system.virtues.conscience.value"] = Math.max(0, v.value - 1);
  await actor.update(upd);
  const virtue = game.i18n.localize(VTM20.virtues[actor.virtueKey?.("conscience") ?? "conscience"]?.label ?? "");
  const path = VTM20.label(Codex.path(m.path ?? "humanity") ?? {}) || t("Humanity");
  const lines = [t("Degen.Lost", { name: foundry.utils.escapeHTML(actor.name), path, n: now }),
    ...(botch ? [t("Degen.Botch", { virtue, n: Math.max(0, v.value - 1) })] : []), ...(now === 0 ? [t("Degen.Beast")] : [])];
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flags: { [SYSTEM_ID]: { degeneration: true } },
    content: `<div class="r-notice is-warn"><i class="fa-solid fa-scale-unbalanced"></i> ${lines.join("<br>")}</div>` });
}

/**
 * Ярость при Инстинктах (V20, гл. 7, «Альтернативные Добродетели»): проверки сопротивления нет — персонаж впадает в ярость,
 * но если сложность повода ниже Инстинктов, может по желанию не впадать. Уже в ярости — «оседлать волну»: бросок Инстинктов
 * со сложностью повода, чтобы совершить сознательное действие (ярость продолжается).
 */
async function instinctFrenzy(actor, difficulty) {
  // сравнивается само значение Инстинктов (пул Добродетели ограничен моралью — это только для бросков)
  const inst = actor.system.virtues?.selfControl?.value ?? 0;
  if (actor.statuses?.has("r-frenzy")) return RollDialog.prompt(actor, { title: t("Instinct.RideTitle"), trait1: "virtues.selfControl", reflexive: true, lockTraits: true,
    difficulty, kind: "rideWave", diffNote: `<i class="fa-solid fa-water"></i> ${t("Instinct.RideNote")}` });
  const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
  let d = difficulty;
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: t("Roll.frenzy.title"), icon: "fa-solid fa-face-angry" }, classes: ["vtm20", "r-dialog", "r-instinct"], position: { width: 460 }, rejectClose: false,
    content: `<p>${t("Instinct.Lead", { n: inst })}</p>
      <label class="r-field"><span>${t("Instinct.Diff")}</span><input type="number" name="d" value="${difficulty}" min="2" max="10"></label>
      <p class="r-note" data-instinct-note></p>`,
    buttons: [{ action: "resist", label: t("Instinct.Resist"), icon: "fa-solid fa-hand" }, { action: "frenzy", label: t("Instinct.Frenzy"), icon: "fa-solid fa-face-angry", default: true }],
    render: (ev, dlg) => {
      const root = dlg.element, inp = root.querySelector("input[name=d]"), note = root.querySelector("[data-instinct-note]"), btn = root.querySelector("button[data-action=resist]");
      const upd = () => { d = Math.clamp(Number(inp.value) || difficulty, 2, 10); const can = d < inst;
        btn.disabled = !can; note.textContent = t(can ? "Instinct.CanResist" : "Instinct.NoResist", { d, n: inst }); };
      inp.addEventListener("input", upd); upd();
    }
  });
  if (!choice) return null;
  if (choice === "resist" && d < inst) return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="r-notice"><i class="fa-solid fa-hand"></i> ${t("Instinct.Resisted", { name: esc(actor.name), d, n: inst })}</div>` });
  await actor.toggleStatusEffect?.("r-frenzy", { active: true });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="r-notice is-warn"><i class="fa-solid fa-face-angry"></i> ${t("Instinct.Frenzied", { name: esc(actor.name), d })}</div>` });
}

/** Карточка в чате: «стоит проверить ярость/Ротшрек» с кнопкой броска. Только вампирам, не в торпоре и не уже в этом состоянии. */
export function suggestCheck(actor, kind, { reason, difficulty = 6 }) {
  if (!actor?.isVampire || actor.statuses?.has(`r-${kind}`) || actor.statuses?.has("r-torpor")) return null;
  // Голконда: бешенство и Ротшрек не грозят — и предлагать бросок незачем
  if (["frenzy", "rotschreck"].includes(kind) && actor.system.golconda?.stage === "attained" && actor.system.morality?.path === "humanity"
    && actor.system.morality.value >= 7 && (actor.system.virtues?.conscience?.value ?? 0) >= 4) return null;
  const icon = { frenzy: "fa-face-angry", rotschreck: "fa-fire", degeneration: "fa-scale-unbalanced" }[kind];
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: game.users.filter(u => u.isGM || actor.testUserPermission(u, "OWNER")).map(u => u.id),
    content: `<div class="r-notice r-check-prompt is-${kind}"><i class="fa-solid ${icon}"></i>
      <span>${t(`CheckPrompt.${kind}`, { name: foundry.utils.escapeHTML(actor.name), reason, n: difficulty })}</span>
      <div class="r-card-buttons"><button type="button" data-r-action="virtueCheck"><i class="fa-solid fa-dice-d10"></i> ${t("CheckPrompt.Roll")}</button></div></div>`,
    flags: { [SYSTEM_ID]: { checkPrompt: { kind, difficulty, actorUuid: actor.uuid } } }
  });
}

/** Кнопка карточки-подсказки. */
export async function rollFromPrompt(message) {
  const p = message.getFlag(SYSTEM_ID, "checkPrompt");
  const actor = p && await foundry.utils.fromUuid(p.actorUuid);
  if (!actor?.isOwner) return ui.notifications.warn(t("CheckPrompt.NotOwner"));
  return rollVirtueCheck(actor, p.kind, { difficulty: p.difficulty, fromPrompt: true });
}
