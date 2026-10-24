// module/apps/night.mjs
// Автоматизация ночной жизни Сородичей:
//   · охота (V20_Основные_правила/03): угодья → сложность, Слава и Домен −1, Стадо +1 кубик;
//     успех — кровь 1d10 (по решению рассказчика можно и «сколько хочется»), голод — проверка ярости;
//   · «Наступила ночь»: вечерний пункт крови у всех вампиров, сброс усилений, по настройке +1 воля (05);
//   · конец сцены — сброс усилений кровью; конец истории — воля восстанавливается полностью (03);
//   · после боя усиления снимаются сами.

import { VTM20, SYSTEM_ID } from "../config.mjs";
import { rollPool } from "../dice/roll.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);

/** Угодья и сложность охоты (03). */
export const HUNTING_GROUNDS = {
  slums: 4, poor: 5, business: 6, industrial: 6, suburb: 7, guarded: 8
};
/** Способы охоты: пул «характеристика + способность». */
export const HUNTING_METHODS = {
  club: ["attributes.appearance", "abilities.subterfuge"],
  chase: ["attributes.stamina", "abilities.athletics"],
  alleys: ["attributes.wits", "abilities.streetwise"],
  seduce: ["attributes.charisma", "abilities.empathy"],
  herd: ["attributes.charisma", "abilities.leadership"],
  animals: ["attributes.wits", "abilities.animalKen"]
};

const bgValue = (actor, name) => actor.items.find(i => i.type === "background" && i.name.toLowerCase() === name)?.system.value ?? 0;

export async function openHunt(actor) {
  const fame = bgValue(actor, "слава"), domain = bgValue(actor, "домен"), herd = bgValue(actor, "стадо");
  const grounds = Object.entries(HUNTING_GROUNDS).map(([k, d]) => `<option value="${k}">${t(`Hunt.Ground.${k}`)} — ${d}</option>`).join("");
  const methods = Object.entries(HUNTING_METHODS).map(([k, [a, b]]) =>
    `<option value="${k}">${t(`Hunt.Method.${k}`)} (${actor.traitLabel(a)} + ${actor.traitLabel(b)}: ${actor.traitValue(a) + actor.traitValue(b)})</option>`).join("");
  const content = `<div class="r-form">
    <label class="r-field"><span>${t("Hunt.Ground.label")}</span><select name="ground">${grounds}</select></label>
    <label class="r-field"><span>${t("Hunt.Method.label")}</span><select name="method">${methods}</select></label>
    <label class="r-check"><input type="checkbox" name="fame" ${fame + domain ? "checked" : "disabled"}> ${t("Hunt.FameDomain", { n: fame + domain })}</label>
    <label class="r-check"><input type="checkbox" name="herd" ${herd ? "checked" : "disabled"}> ${t("Hunt.Herd", { n: herd })}</label>
    <label class="r-check"><input type="checkbox" name="inhuman"> ${t("Hunt.Inhuman")}</label>
    <p class="r-hint">${t("Hunt.Hint")}</p></div>`;
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("Hunt.Title", { name: actor.name }), icon: "fa-solid fa-moon" }, classes: ["vtm20", "r-dialog"], content,
    ok: { label: t("Hunt.Go"), icon: "fa-solid fa-droplet", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
    rejectClose: false
  });
  if (!res) return;
  const [a, b] = HUNTING_METHODS[res.method];
  let diff = HUNTING_GROUNDS[res.ground];
  const bd = [{ label: actor.traitLabel(a), value: actor.traitValue(a) }, { label: actor.traitLabel(b), value: actor.traitValue(b) }];
  if (res.fame) diff = Math.max(3, diff - (fame + domain));
  if (res.inhuman) diff += 1;
  let pool = actor.traitValue(a) + actor.traitValue(b) + actor.system.health.penalty;
  if (res.herd) { pool += herd; bd.push({ label: t("Hunt.HerdShort"), value: herd }); }
  const selfC = actor.traitValue("virtues.selfControl");
  const hungry = actor.hasBlood && actor.system.blood.value < 7 - selfC;
  return rollPool({
    actor, title: t("Hunt.Title", { name: "" }).replace(/:\s*$/, ""), subtitle: `${t(`Hunt.Ground.${res.ground}`)} · ${t(`Hunt.Method.${res.method}`)}`,
    pool, difficulty: diff, breakdown: bd, kind: "hunt",
    notes: [
      ...(hungry ? [`<i class="fa-solid fa-face-angry"></i> ${t("Hunt.Hungry", { n: 7 - selfC })}`] : []),
      ...(actor.system.clan === "ventrue" && actor.system.weaknessNote ? [`<i class="fa-solid fa-wine-glass"></i> ${t("Hunt.Ventrue", { taste: actor.system.weaknessNote })}`] : []),
      ...(actor.system.clan === "giovanni" ? [`<i class="fa-solid fa-skull"></i> ${t("Hunt.Giovanni")}`] : [])
    ]
  });
}

/** Кровь после удачной охоты. */
/**
 * Кормление после удачной охоты: сколько выпить, решает сам игрок (вампир обычно контролирует Поцелуй),
 * в пределах свободного места в запасе. Сосуд-смертный — 10 пунктов крови: осушить его — убить.
 */
export async function feedAfterHunt(actor) {
  if (!actor?.hasBlood) return;
  const s = actor.system.blood, room = Math.max(0, s.max - s.value);
  if (!room) return ui.notifications.info(t("Hunt.Full", { name: actor.name }));
  const top = Math.min(room, 10);
  const marks = [1, 2, 5, top].filter((v, i, a) => v <= top && a.indexOf(v) === i);
  const n = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("Hunt.FeedTitle", { name: actor.name }), icon: "fa-solid fa-droplet" }, classes: ["vtm20", "r-dialog", "r-feed"],
    content: `<div class="r-form r-feed-form">
      <p class="r-feed-pool">${t("Hunt.FeedPool", { cur: s.value, max: s.max })}</p>
      <div class="r-feed-pick">${marks.map(v => `<button type="button" data-feed="${v}">${v === top && top === room ? t("Hunt.FeedFull", { n: v }) : v}</button>`).join("")}</div>
      <label class="r-feed-range"><input type="range" name="n" min="1" max="${top}" value="${top}" step="1"><output>${top}</output></label>
      <p class="r-feed-hint">${t(s.value < 5 ? "Hunt.FeedHintHungry" : "Hunt.FeedHint")}</p>
    </div>`,
    render: (ev, dlg) => {
      const el = dlg.element, range = el.querySelector("[name=n]"), out = el.querySelector("output");
      range.addEventListener("input", () => { out.value = range.value; });
      el.querySelectorAll("[data-feed]").forEach(b => b.addEventListener("click", () => { range.value = b.dataset.feed; out.value = b.dataset.feed; }));
    },
    ok: { label: t("Hunt.Feed"), icon: "fa-solid fa-droplet", callback: (e, b) => Number(b.form.elements.n.value) || 0 }, rejectClose: false
  });
  if (!n) return;
  const before = actor.system.blood.value;
  await actor.gainBlood(n);
  ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="r-notice"><i class="fa-solid fa-droplet"></i> ${t("Hunt.Fed", { n: actor.system.blood.value - before, cur: actor.system.blood.value, max: s.max })}</div>`
  });
}

/* ── Ночь, сцена, история ─────────────────────────────────────────────── */

function kindredOf() {
  return game.actors.filter(a => a.type === "vampire" && (a.hasPlayerOwner || a.getFlag(SYSTEM_ID, "nightly")));
}

export async function nightfall() {
  if (!game.user.isGM) return ui.notifications.warn(t("Notify.GMOnly"));
  const will = game.settings.get(SYSTEM_ID, "nightlyWillpower");
  const lines = [];
  for (const a of kindredOf()) {
    const before = a.system.blood.value;
    await a.awaken({ willpower: will, quiet: true });
    lines.push(`<li><b>${a.name}</b>: ${t("Night.Line", { from: before, to: a.system.blood.value })}${before <= 0 ? ` <span class="r-fate">${t("Night.Starving")}</span>` : ""}</li>`);
  }
  // узы крови слабеют без крови сюзерена (05)
  const { decayBonds } = await import("./bonds.mjs");
  for (const a of game.actors.filter(x => (x.system.bonds ?? []).length)) for (const l of await decayBonds(a)) lines.push(`<li>${l}</li>`);
  ChatMessage.create({ content: `<div class="r-notice"><i class="fa-solid fa-moon"></i> <b>${t("Night.Title")}</b><ul>${lines.join("") || `<li>${t("Night.Nobody")}</li>`}</ul></div>` });
}

/** Состояния, которые проходят с концом сцены: ошеломление, падение, захват, ярость, Ротшрек. */
const SCENE_STATUSES = ["r-stunned", "r-prone", "r-held", "r-frenzy", "r-rotschreck"];

export async function endScene() {
  const owned = game.user.isGM ? game.actors.contents : game.actors.filter(a => a.isOwner);
  for (const a of owned.filter(x => x.hasBlood)) if (Object.values(a.system.boosts ?? {}).some(v => v > 0)) await a.clearBoosts();
  for (const a of owned) for (const id of SCENE_STATUSES) if (a.statuses?.has(id)) await a.toggleStatusEffect(id, { active: false });
  // Силы «до конца сцены» (Когти Зверя…) гаснут
  for (const a of owned) for (const x of a.powerEffects ?? []) if (x.def.mode === "scene") await a.endPower(x.effect);
  ui.notifications.info(t("Notify.SceneEnded"));
}

export async function endStory() {
  if (!game.user.isGM) return ui.notifications.warn(t("Notify.GMOnly"));
  for (const a of game.actors.filter(x => x.hasPlayerOwner)) {
    await a.update({ "system.willpower.temporary": a.system.willpower.permanent });
  }
  ChatMessage.create({ content: `<div class="r-notice"><i class="fa-solid fa-book"></i> ${t("Night.StoryEnd")}</div>` });
}

/** Кнопки рассказчика в каталоге персонажей. */
export function registerNightTools() {
  Hooks.on("renderActorDirectory", (app, html) => {
    if (!game.user.isGM) return;
    const root = html instanceof HTMLElement ? html : html[0];
    const bar = root?.querySelector(".header-actions");
    if (!bar || bar.querySelector(".r-night-tools")) return;
    const box = document.createElement("div");
    box.className = "r-night-tools";
    const mk = (icon, label, fn) => {
      const b = document.createElement("button");
      b.type = "button"; b.innerHTML = `<i class="fa-solid ${icon}"></i> ${label}`;
      b.addEventListener("click", fn); box.append(b);
    };
    mk("fa-moon", t("Night.Button"), nightfall);
    mk("fa-hourglass-end", t("Night.SceneButton"), endScene);
    mk("fa-book", t("Night.StoryButton"), endStory);
    bar.after(box);
  });
  // Бой окончен — усиления кровью длятся до конца сцены, снимаем их
  Hooks.on("deleteCombat", combat => {
    if (!game.user.isGM) return;
    for (const c of combat.combatants) if (c.actor?.hasBlood && Object.values(c.actor.system.boosts ?? {}).some(v => v > 0)) c.actor.clearBoosts();
  });
}
