// module/apps/path-shift.mjs
// Переход с Человечности на Путь Просветления в игре (V20, гл. 7, «Переход с Человечности на Путь»):
// условия — Человечность ≤ 3 и заменяемые Добродетели (Совесть и/или Самоконтроль) = 1; наставник с этого Пути,
// не меньше года обучения и испытание с чудовищным поступком — их отмечает рассказчик. Проверка Воли: сложность 8 при
// Человечности 3, 7 при 2, 6 при 1, Воля на автоуспех запрещена. Успех — Путь 1 (3+ успеха — Путь 2), новые Добродетели по 1;
// неудача — −1 Человечность, повторить через месяц; провал — повторить только через год; 0 — Зверь победил.

import { VTM20 } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { RollDialog } from "../dice/dialog.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.PathShift.${k}`, d) : game.i18n.localize(`VTM20.PathShift.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const V = k => game.i18n.localize(VTM20.virtues[k]?.label ?? k);

/** Что мешает перейти на этот Путь (Человечность и заменяемые Добродетели), пустой список — можно. */
function blockers(actor, path) {
  const s = actor.system, out = [];
  if ((s.morality?.value ?? 10) > 3) out.push(t("NeedHumanity", { n: s.morality.value }));
  if (path.virtues.includes("conviction") && s.virtues.conscience.value !== 1) out.push(t("NeedVirtue", { v: V("conscience"), n: s.virtues.conscience.value }));
  if (path.virtues.includes("instinct") && s.virtues.selfControl.value !== 1) out.push(t("NeedVirtue", { v: V("selfControl"), n: s.virtues.selfControl.value }));
  return out;
}

export async function openPathShift(actor) {
  const s = actor.system;
  if (!actor.isVampire || (s.morality?.path ?? "humanity") !== "humanity") return ui.notifications.warn(t("OnlyHumanity"));
  const paths = Codex.paths.filter(p => p.key !== "humanity" && Codex.visible(p));
  if (!paths.length) return;
  const h = s.morality.value, diff = h >= 3 ? 8 : h === 2 ? 7 : 6;
  const story = ["mentor", "year", "trial"];
  const content = `<div class="r-form r-pathshift">
    <p>${t("Lead", { n: h, d: diff })}</p>
    <label class="r-field"><span>${t("Path")}</span><select name="path">${paths.map(p => `<option value="${p.key}">${esc(p.name)} — ${p.virtues.map(V).join(", ")}</option>`).join("")}</select></label>
    <p class="r-note" data-why></p>
    <fieldset class="r-pathshift-story"><legend>${t("Story")}</legend>
      ${story.map(k => `<label class="r-check"><input type="checkbox" name="${k}"> ${t(`Cond.${k}`)}</label>`).join("")}</fieldset>
  </div>`;
  let key = paths[0].key;
  const ok = await foundry.applications.api.DialogV2.wait({
    window: { title: t("Title", { name: actor.name }), icon: "fa-solid fa-route" }, classes: ["vtm20", "r-dialog"], position: { width: 520 }, rejectClose: false, content,
    buttons: [{ action: "roll", label: t("Roll", { d: diff }), icon: "fa-solid fa-dice-d10", default: true }, { action: "cancel", label: game.i18n.localize("Cancel") }],
    render: (ev, dlg) => {
      const root = dlg.element, sel = root.querySelector("select[name=path]"), why = root.querySelector("[data-why]"), btn = root.querySelector("button[data-action=roll]");
      const upd = () => {
        key = sel.value;
        const p = paths.find(x => x.key === key), b = blockers(actor, p), done = story.every(k => root.querySelector(`input[name=${k}]`).checked);
        why.innerHTML = b.length ? `<i class="fa-solid fa-ban"></i> ${b.map(esc).join("<br>")}` : esc(t("Ready"));
        btn.disabled = !!b.length || !done;
      };
      root.addEventListener("change", upd); upd();
    }
  });
  if (ok !== "roll") return null;
  const path = paths.find(x => x.key === key);
  return RollDialog.prompt(actor, { title: t("RollTitle", { path: path.name }), trait1: "willpower.permanent", reflexive: true, difficulty: diff, noWillpower: true, lockTraits: true,
    diffNote: `<i class="fa-solid fa-route"></i> ${esc(t("RollNote"))}`, onRolled: res => settle(actor, path, res) });
}

export async function settle(actor, path, res) {
  const say = (html, warn = false) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="r-notice ${warn ? "is-warn" : ""}"><i class="fa-solid fa-route"></i> ${html}</div>` });
  const name = esc(actor.name);
  if (res?.outcome === "botch") return say(t("Botch", { name }), true);
  if (!(res?.successes > 0)) {
    const n = Math.max(0, actor.system.morality.value - 1);
    await actor.update({ "system.morality.value": n });
    return say(`${t("Fail", { name, n })}${n === 0 ? `<br>${game.i18n.localize("VTM20.Degen.Beast")}` : ""}`, true);
  }
  // успех: Путь 1 (3+ успеха — 2), новые Добродетели — по 1 (Смелость остаётся)
  const value = res.successes >= 3 ? 2 : 1, upd = { "system.morality.path": path.key, "system.morality.value": value };
  if (path.virtues.includes("conviction")) upd["system.virtues.conscience.value"] = 1;
  if (path.virtues.includes("instinct")) upd["system.virtues.selfControl.value"] = 1;
  await actor.update(upd);
  return say(t("Done", { name, path: esc(path.name), n: value }));
}
