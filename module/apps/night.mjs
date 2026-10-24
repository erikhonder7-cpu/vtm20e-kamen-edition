// module/apps/night.mjs
// Автоматизация ночной жизни Сородичей:
//   · охота (V20_Основные_правила/03): угодья → сложность, Слава и Домен −1, Стадо +1 кубик;
//     модификаторы кубиков и сложности от рассказчика; успех — игрок выбирает, сколько выпить; голод — проверка ярости;
//   · «Наступила ночь»: вечерний пункт крови у всех вампиров, сброс усилений, по настройке +1 воля (05);
//   · конец сцены — сброс усилений кровью; конец истории — воля восстанавливается полностью (03);
//   · после боя усиления снимаются сами.

import { VTM20, SYSTEM_ID, SYSTEM_PATH } from "../config.mjs";
import { rollPool, odds, chancesView } from "../dice/roll.mjs";

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

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const GROUND_ICONS = { slums: "fa-dumpster-fire", poor: "fa-house-crack", business: "fa-building", industrial: "fa-industry", suburb: "fa-tree-city", guarded: "fa-shield-halved" };

export function openHunt(actor) {
  return new HuntDialog(actor).render({ force: true });
}

/** Окно охоты (03) в стиле окна броска: угодья плитками, способ, модификаторы, итог пула и шансы. */
class HuntDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-dialog", "r-roll-dialog", "r-hunt-dialog"],
    tag: "form",
    window: { title: "VTM20.Hunt.Button", icon: "fa-solid fa-moon" },
    position: { width: 460 },
    form: { handler: HuntDialog.#onSubmit, closeOnSubmit: true, submitOnChange: false },
    actions: { ground: HuntDialog.#onGround, bump: HuntDialog.#onBump }
  };

  static PARTS = { form: { template: `${SYSTEM_PATH}/templates/apps/hunt.hbs` } };

  constructor(actor) {
    super({ window: { title: t("Hunt.Title", { name: actor.name }) } });
    this.actor = actor;
    this.bg = { fame: bgValue(actor, "слава"), domain: bgValue(actor, "домен"), herd: bgValue(actor, "стадо") };
    this.v = { ground: "business", method: "alleys", fame: this.bg.fame + this.bg.domain > 0, herd: this.bg.herd > 0, inhuman: false, modDice: 0, modDiff: 0,
      messageMode: game.settings.get("core", "messageMode") };
  }

  /** Пул, сложность и разбор — общий расчёт для окна и броска. */
  calc() {
    const a = this.actor, v = this.v, [t1, t2] = HUNTING_METHODS[v.method];
    const bd = [{ label: a.traitLabel(t1), value: a.traitValue(t1) }, { label: a.traitLabel(t2), value: a.traitValue(t2) }];
    let pool = a.traitValue(t1) + a.traitValue(t2), diff = HUNTING_GROUNDS[v.ground];
    const wounds = a.system.health.penalty ?? 0;
    if (wounds) { pool += wounds; bd.push({ label: t("Roll.Wounds"), value: wounds }); }
    if (v.herd && this.bg.herd) { pool += this.bg.herd; bd.push({ label: t("Hunt.HerdShort"), value: this.bg.herd }); }
    if (v.modDice) { pool += v.modDice; bd.push({ label: t("Hunt.ModShort"), value: v.modDice }); }
    if (v.fame && this.bg.fame + this.bg.domain) diff = Math.max(3, diff - (this.bg.fame + this.bg.domain));
    if (v.inhuman) diff += 1;
    diff = Math.min(10, Math.max(2, diff + v.modDiff));
    return { pool: Math.max(0, pool), diff, bd };
  }

  async _prepareContext() {
    const a = this.actor, v = this.v, c = this.calc();
    const modes = CONFIG.ChatMessage?.modes ?? {};
    return {
      v, ...c, bg: this.bg, fameTotal: this.bg.fame + this.bg.domain,
      grounds: Object.entries(HUNTING_GROUNDS).map(([k, d]) => ({ key: k, d, label: t(`Hunt.Ground.${k}`), icon: GROUND_ICONS[k], active: k === v.ground })),
      methods: Object.entries(HUNTING_METHODS).map(([k, [x, y]]) => ({ key: k, selected: k === v.method,
        label: `${t(`Hunt.Method.${k}`)} — ${a.traitLabel(x)} + ${a.traitLabel(y)} (${a.traitValue(x) + a.traitValue(y)})` })),
      chances: chancesView(odds({ pool: c.pool, difficulty: c.diff })),
      messageModes: Object.entries(modes).map(([k, m]) => ({ value: k, label: game.i18n.localize(m.label ?? k), selected: k === v.messageMode }))
    };
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.element.addEventListener("change", ev => {
      const f = new foundry.applications.ux.FormDataExtended(this.element).object;
      Object.assign(this.v, { method: f.method ?? this.v.method, fame: !!f.fame, herd: !!f.herd, inhuman: !!f.inhuman,
        modDice: Math.trunc(Number(f.modDice) || 0), modDiff: Math.trunc(Number(f.modDiff) || 0), messageMode: f.messageMode ?? this.v.messageMode });
      this.render();
    });
  }

  static #onGround(event, target) { this.v.ground = target.dataset.key; this.render(); }
  static #onBump(event, target) {
    const k = target.dataset.field, lim = k === "modDiff" ? 5 : 10;
    this.v[k] = Math.max(-lim, Math.min(lim, this.v[k] + Number(target.dataset.d))); this.render();
  }

  static async #onSubmit() {
    const a = this.actor, v = this.v, c = this.calc();
    const selfC = a.traitValue("virtues.selfControl");
    const hungry = a.hasBlood && a.system.blood.value < 7 - selfC;
    return rollPool({
      actor: a, title: t("Hunt.Title", { name: "" }).replace(/:\s*$/, ""), subtitle: `${t(`Hunt.Ground.${v.ground}`)} · ${t(`Hunt.Method.${v.method}`)}`,
      pool: c.pool, difficulty: c.diff, breakdown: c.bd, kind: "hunt", messageMode: v.messageMode, extra: { method: v.method },
      notes: [
        ...(hungry ? [`<i class="fa-solid fa-face-angry"></i> ${t("Hunt.Hungry", { n: 7 - selfC })}`] : []),
        ...(a.system.clan === "ventrue" && a.system.weaknessNote ? [`<i class="fa-solid fa-wine-glass"></i> ${t("Hunt.Ventrue", { taste: a.system.weaknessNote })}`] : []),
        ...(a.system.clan === "giovanni" ? [`<i class="fa-solid fa-skull"></i> ${t("Hunt.Giovanni")}`] : [])
      ]
    });
  }
}

/** Кровь после удачной охоты. */
/**
 * Кормление после удачной охоты: сколько выпить, решает сам игрок (вампир обычно контролирует Поцелуй),
 * в пределах свободного места в запасе. Сосуд-смертный — 10 пунктов крови: осушить его — убить.
 */
export async function feedAfterHunt(actor, { animal = false } = {}) {
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
  let drink = n;
  // Сильный голод (крови меньше 5): чтобы оторваться раньше, чем насытится, — бросок Силы воли (сл. 6), иначе пьёт досыта
  if (s.value < 5 && n < top) {
    const r = await rollPool({ actor, title: t("Hunt.StopTitle"), subtitle: t("Hunt.StopSub", { n }), pool: actor.system.willpower.permanent, difficulty: 6, kind: "check" });
    if (r.outcome !== "success") drink = top;
  }
  const before = actor.system.blood.value;
  await actor.gainBlood(drink);
  if (drink > n) ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice is-warn"><i class="fa-solid fa-face-angry"></i> ${t("Hunt.CouldNotStop", { n: drink })}</div>` });
  // Больше 8 пунктов из человека — на грани убийства: проверка деградации
  if (!animal && drink > 8) {
    const { suggestCheck } = await import("../dice/virtue-checks.mjs");
    suggestCheck(actor, "degeneration", { reason: t("Hunt.Drained", { n: drink }), difficulty: 8 });
  }
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
