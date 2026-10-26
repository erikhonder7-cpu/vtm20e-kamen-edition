// module/apps/host.mjs
// Тело-носитель падшего (Demon: The Fallen, гл. 9, с. 256, 260–261).
//   · Тело погибло или изгнан экзорцизмом — на следующем ходу падший является в апокалиптической форме, без тела:
//     вредить и пользоваться Знаниями не может, видит души, проходит сквозь стены, (Воля + 5) миль за ход.
//   · Каждый ход без тела — бросок Воли, сл. 6 (пункт Воли — верный успех); неудача — Бездна утягивает его.
//   · Новое тело: человек с угасшей душой — Воля, сл. 8; слуга — сл. 6, добровольно — без броска; предмет — сл. 9
//     (6, если предмет связан с ним или его Домом), падший становится Привязанным; провал с предметом — −1 постоянная
//     Воля, в тот же предмет второй раз нельзя. Устроился — −1 постоянная Вера и +1 постоянная Мука.

import { rollPool } from "../dice/roll.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Host.${k}`, d) : game.i18n.localize(`VTM20.Host.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const notice = (actor, icon, html, cls = "is-form") => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="r-notice r-type-demon ${cls}"><i class="fa-solid ${icon}"></i> ${html}</div>` });

/** Падший потерял тело (гибель или экзорцизм): дух в апокалиптической форме, без носителя. */
export async function loseHost(actor, why = "death") {
  if (actor.system.hostless) return null;
  await actor.update({ "system.hostless": true, "system.abyss": false, "system.apocalyptic": true });
  return notice(actor, "fa-ghost", t(why === "exorcism" ? "LostExorcism" : "Lost", { name: esc(actor.name), miles: actor.system.willpower.permanent + 5 }));
}

/** Ход без тела: удержаться в мире — бросок Воли, сл. 6, или пункт Воли за верный успех. */
export async function holdOn(actor) {
  const s = actor.system;
  if (!s.hostless || s.abyss) return null;
  const how = await foundry.applications.api.DialogV2.wait({
    window: { title: t("Hold") }, classes: ["vtm20", "r-dialog"], position: { width: 420 },
    content: `<p>${t("HoldHow", { n: s.willpower.permanent, w: s.willpower.temporary })}</p>`,
    buttons: [{ action: "roll", label: t("HoldRoll"), icon: "fa-solid fa-dice-d10", default: true },
      { action: "spend", label: t("HoldSpend"), icon: "fa-solid fa-sun" }]
  }).catch(() => null);
  if (!how) return null;
  if (how === "spend") {
    if (!(await actor.spendWillpower(1))) return ui.notifications.warn(t("NoWill"));
    return notice(actor, "fa-anchor", t("Held", { name: esc(actor.name) }));
  }
  const res = await rollPool({ actor, title: t("Hold"), pool: s.willpower.permanent, difficulty: 6, kind: "abyssHold",
    breakdown: [{ label: game.i18n.localize("VTM20.Willpower"), value: s.willpower.permanent }] });
  if (res.successes > 0) return res;
  await actor.update({ "system.abyss": true, "system.apocalyptic": false });
  await notice(actor, "fa-hurricane", t("Dragged", { name: esc(actor.name) }), "is-sin");
  return res;
}

/** Призван обратно из Бездны (ритуалом вызова) — снова без тела, ищет носителя. */
export async function summonedBack(actor) {
  await actor.update({ "system.abyss": false, "system.hostless": true });
  await notice(actor, "fa-door-open", t("Summoned", { name: esc(actor.name) }));
  return newHost(actor);
}

/** Новое тело: человек с угасшей душой, слуга (добровольно — без броска) или предмет (Привязанный). */
export async function newHost(actor) {
  const s = actor.system;
  const thralls = (s.thralls ?? []).filter(x => x.name);
  const content = `<p class="r-choice-hint">${t("NewHint")}</p><div class="r-choice-list">
    <label class="r-choice"><input type="radio" name="kind" value="human" checked><span><b>${t("KindHuman")}</b><em class="r-choice-when">${t("KindHumanHint")}</em></span></label>
    <label class="r-choice"><input type="radio" name="kind" value="thrall" ${thralls.length ? "" : "disabled"}><span><b>${t("KindThrall")}</b><em class="r-choice-when">${t("KindThrallHint")}</em></span></label>
    <label class="r-choice"><input type="radio" name="kind" value="object"><span><b>${t("KindObject")}</b><em class="r-choice-when">${t("KindObjectHint")}</em></span></label></div>
    <div class="r-fields">
      ${thralls.length ? `<label class="r-f is-span2"><span>${t("Thrall")}</span><select name="thrall">${thralls.map((x, i) => `<option value="${i}">${esc(x.name)}</option>`).join("")}</select></label>
      <label class="r-check is-span2"><input type="checkbox" name="willing"> ${t("Willing")}</label>` : ""}
      <label class="r-f is-span2"><span>${t("Body")}</span><input type="text" name="body" placeholder="${esc(t("BodyPh"))}"></label>
      <label class="r-check is-span2"><input type="checkbox" name="tied"> ${t("Tied")}</label>
    </div>`;
  const v = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("New") }, classes: ["vtm20", "r-dialog", "r-choice-dialog"], position: { width: 480 }, content,
    ok: { label: t("NewTry"), callback: (ev, btn) => { const f = btn.form.elements;
      return { kind: f.kind.value, thrall: thralls[Number(f.thrall?.value)] ?? null, willing: !!f.willing?.checked, body: f.body.value.trim(), tied: !!f.tied.checked }; } }
  }).catch(() => null);
  if (!v) return null;
  const body = v.kind === "thrall" ? v.thrall?.name ?? "" : v.body;
  // слуга по доброй воле — без броска
  let ok = v.kind === "thrall" && v.willing, res = null;
  if (!ok) {
    const diff = v.kind === "human" ? 8 : v.kind === "thrall" ? 6 : v.tied ? 6 : 9;
    res = await rollPool({ actor, title: t("New"), subtitle: body || t(`Kind${v.kind[0].toUpperCase()}${v.kind.slice(1)}`), pool: s.willpower.permanent,
      difficulty: diff, kind: "newHost", breakdown: [{ label: game.i18n.localize("VTM20.Willpower"), value: s.willpower.permanent }] });
    ok = res.successes > 0;
    if (!ok) {
      if (v.kind === "object" && res.outcome === "botch") {
        const w = s.willpower;
        await actor.update({ "system.willpower.permanent": Math.max(0, w.permanent - 1), "system.willpower.temporary": Math.min(w.temporary, Math.max(0, w.permanent - 1)) });
      }
      await notice(actor, "fa-ghost", t(v.kind === "object" ? "FailObject" : "Fail", { name: esc(actor.name), body: esc(body) }), "is-sin");
      return res;
    }
  }
  // устроился: −1 постоянная Вера, +1 постоянная Мука; предмет — Привязанный
  const f = s.faith, tm = s.torment, faith = Math.max(0, f.permanent - 1);
  const upd = { "system.hostless": false, "system.abyss": false, "system.apocalyptic": false,
    "system.faith.permanent": faith, "system.faith.temporary": Math.min(f.temporary, faith),
    "system.torment.permanent": Math.min(10, tm.permanent + 1) };
  if (v.kind === "object") upd["system.earthbound"] = true;
  await actor.update(upd);
  await notice(actor, v.kind === "object" ? "fa-gem" : "fa-person", t(v.kind === "object" ? "NewObject" : "NewBody", { name: esc(actor.name), body: esc(body) || "—" }));
  // Мука выше шести — новая черта высокой Муки на выбор (как при росте Муки)
  if (tm.permanent < 10 && tm.permanent + 1 > 6) {
    const { pickHighFeatures } = await import("./torment.mjs");
    await pickHighFeatures(actor);
  }
  return res ?? true;
}
