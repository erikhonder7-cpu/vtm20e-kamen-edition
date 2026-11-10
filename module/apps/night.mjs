// module/apps/night.mjs
// Автоматизация ночной жизни Сородичей:
//   · охота (V20_Основные_правила/03): угодья → сложность, Слава и Домен −1, Стадо +1 кубик;
//     модификаторы кубиков и сложности от рассказчика; успех — игрок выбирает, сколько выпить; голод — проверка ярости;
//   · «Наступила ночь»: вечерний пункт крови у всех вампиров, сброс усилений, по настройке +1 воля (05);
//   · конец сцены — сброс усилений кровью; конец истории — воля восстанавливается полностью (03);
//   · после боя усиления снимаются сами.

import { VTM20, SYSTEM_ID, SYSTEM_PATH } from "../config.mjs";
import { coterieBg } from "./coterie.mjs";
import { domainRating, domainsOf } from "./domain.mjs";
import { perkBonus } from "../ui/strategy.mjs";
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
/** Свой факт или общий факт котерии (apps/coterie.mjs) — что больше. */
const bgOrCoterie = (actor, name, pooled) => Math.max(bgValue(actor, name), coterieBg(actor, pooled), name === "домен" ? domainRating(actor) : 0);

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const GROUND_ICONS = { slums: "fa-dumpster-fire", poor: "fa-house-crack", business: "fa-building", industrial: "fa-industry", suburb: "fa-tree-city", guarded: "fa-shield-halved" };

/**
 * Окно охоты. place — место с карты города (план 8): { name, ground, owner: { id, name } | null }.
 * В своём домене Домен считается (не меньше 1), в чужом — не считается, а хозяин попадает в карточку броска.
 */
export function openHunt(actor, place = null) {
  return new HuntDialog(actor, place).render({ force: true });
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

  constructor(actor, place = null) {
    super({ window: { title: t("Hunt.Title", { name: actor.name }) } });
    this.actor = actor;
    this.place = place;
    // домен-актёр (V20): хозяин (и его котерия) и гости охотятся с размером домена, незваным — защищённость к сложности
    const pd = place?.domain, mine = pd && (domainsOf(actor).some(d => d.id === pd.id) || pd.guests.includes(actor.id));
    const own = pd ? !!mine : place?.owner?.id === actor.id, foreign = pd ? !mine : !!place?.owner && !own;
    const domain = bgOrCoterie(actor, "домен", "Домен");
    this.bg = { fame: bgValue(actor, "слава"), domain: own ? Math.max(1, domain, pd?.size ?? 0) : foreign ? 0 : domain, herd: bgOrCoterie(actor, "стадо", "Стадо") };
    this.uninvited = pd && foreign ? pd.security : 0;
    this.domainState = own ? "own" : foreign ? "foreign" : "";
    this.v = { ground: place?.ground in HUNTING_GROUNDS ? place.ground : "business", method: "alleys", fame: this.bg.fame + this.bg.domain > 0, herd: this.bg.herd > 0, inhuman: false, modDice: 0, modDiff: 0,
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
    // незваный в защищённом домене: +1 к сложности за точку защищённости (V20, «Домен»)
    if (this.uninvited) diff += this.uninvited;
    // Стратегия города: влияние в секторе с пользой «охота» — сложность −1 (от 5 фишек −2)
    const sh = perkBonus(a, "hunt");
    if (sh.n) diff = Math.max(3, diff - (sh.n >= 5 ? 2 : 1));
    // жар Маскарада с карты: после нарушений охотиться в этом месте труднее
    if (this.place?.masq) diff += this.place.masq;
    diff = Math.min(10, Math.max(2, diff + v.modDiff));
    return { pool: Math.max(0, pool), diff, bd };
  }

  async _prepareContext() {
    const a = this.actor, v = this.v, c = this.calc();
    const modes = CONFIG.ChatMessage?.modes ?? {};
    return {
      v, ...c, bg: this.bg, fameTotal: this.bg.fame + this.bg.domain,
      place: this.place ? { name: this.place.name, own: this.domainState === "own", foreign: this.domainState === "foreign", owner: this.place.owner?.name ?? "",
        n: this.bg.domain, masq: this.place.masq ?? 0 } : null,
      grounds: Object.entries(HUNTING_GROUNDS).map(([k, d]) => ({ key: k, d, label: t(`Hunt.Ground.${k}`), icon: GROUND_ICONS[k], active: k === v.ground })),
      methods: Object.entries(HUNTING_METHODS).map(([k, [x, y]]) => ({ key: k, selected: k === v.method,
        label: `${t(`Hunt.Method.${k}`)} · ${a.traitValue(x) + a.traitValue(y)}`, title: `${a.traitLabel(x)} + ${a.traitLabel(y)}` })),
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
      actor: a, title: t("Hunt.Title", { name: "" }).replace(/:\s*$/, ""), subtitle: `${this.place ? `${this.place.name} · ` : ""}${t(`Hunt.Ground.${v.ground}`)} · ${t(`Hunt.Method.${v.method}`)}`,
      pool: c.pool, difficulty: c.diff, breakdown: c.bd, kind: "hunt", messageMode: v.messageMode, extra: { method: v.method, hungry },
      notes: [
        ...(this.place ? [`<i class="fa-solid fa-map-location-dot"></i> ${t("Hunt.PlaceNote", { name: this.place.name })}`] : []),
        ...(this.domainState === "foreign" ? [`<i class="fa-solid fa-crown"></i> ${t("Hunt.ForeignNote", { owner: this.place.owner.name })}`] : []),
        ...(this.place?.masq ? [`<i class="fa-solid fa-mask"></i> ${t("Hunt.MasqNote", { n: this.place.masq })}`] : []),
        ...(hungry ? [`<i class="fa-solid fa-face-angry"></i> ${t("Hunt.Hungry", { n: 7 - selfC })}`] : []),
        ...(a.system.clan === "ventrue" && a.system.weaknessNote ? [`<i class="fa-solid fa-wine-glass"></i> ${t("Hunt.Ventrue", { taste: a.system.weaknessNote })}`] : []),
        ...(a.system.clan === "giovanni" ? [`<i class="fa-solid fa-skull"></i> ${t("Hunt.Giovanni")}`] : [])
      ]
    });
  }
}

/**
 * Кормление после удачной охоты: сколько выпить, решает сам игрок (вампир обычно контролирует Поцелуй),
 * в пределах свободного места в запасе и крови сосуда (data/vessels.mjs: человек 10, ребёнок 5, оборотень 20,
 * корова 5…). В крови сосуда может быть вещество — оно ложится на пьющего эффектом со сроком по часам хроники;
 * больной сосуд — проверка Интеллект + Медицина (сл. 7) до глотка и Выносливость (сл. 6) после (V20, гл. 4).
 */
export async function feedAfterHunt(actor, { animal = false } = {}) {
  if (!actor?.hasBlood) return;
  const s = actor.system.blood, room = Math.max(0, s.max - s.value);
  if (!room) return ui.notifications.info(t("Hunt.Full", { name: actor.name }));
  const { VESSELS, SUBSTANCES, vesselOf } = await import("../data/vessels.mjs");
  const list = VESSELS.filter(v => !!v.animal === animal || v.key === "bag");
  const topOf = key => Math.min(room, vesselOf(key).size), top = topOf(list[0].key);
  const res = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("Hunt.FeedTitle", { name: actor.name }), icon: "fa-solid fa-droplet" }, classes: ["vtm20", "r-dialog", "r-feed"],
    content: `<div class="r-form r-feed-form">
      <p class="r-feed-pool">${t("Hunt.FeedPool", { cur: s.value, max: s.max })}</p>
      <label class="r-field"><span>${t("Vessel.Label")}</span><select name="vessel">${list.map(v =>
        `<option value="${v.key}">${t(`Vessel.${v.key}`)} · ${v.size}</option>`).join("")}</select></label>
      <div class="r-feed-pick"></div>
      <label class="r-feed-range"><input type="range" name="n" min="1" max="${top}" value="${top}" step="1"><output>${top}</output></label>
      ${animal ? "" : `<label class="r-field"><span>${t("Vessel.Substance")}</span><select name="substance"><option value="">${t("Vessel.Clean")}</option>${Object.keys(SUBSTANCES).map(k =>
        `<option value="${k}">${t(`Vessel.Sub.${k}`)}</option>`).join("")}</select></label>
      <label class="r-field r-feed-dose" hidden><span>${t("Vessel.Dose")}</span><input type="number" name="dose" min="1" max="5" value="1"></label>
      <label class="r-check"><input type="checkbox" name="ill"> ${t("Vessel.Ill")}</label>`}
      <p class="r-feed-hint">${t(s.value < 5 ? "Hunt.FeedHintHungry" : "Hunt.FeedHint")}</p>
      <p class="r-feed-hint" data-note></p>
    </div>`,
    render: (ev, dlg) => {
      const el = dlg.element, range = el.querySelector("[name=n]"), out = el.querySelector("output"), pick = el.querySelector(".r-feed-pick");
      const note = el.querySelector("[data-note]"), sub = el.querySelector("[name=substance]"), dose = el.querySelector(".r-feed-dose");
      // сосуд меняет предел: человек 10, оборотень 20 (не больше места в запасе)
      const marks = () => {
        const v = vesselOf(el.querySelector("[name=vessel]").value), mx = topOf(v.key);
        range.max = mx; range.value = mx; out.value = mx;
        pick.innerHTML = [1, 2, 5, mx].filter((x, i, a) => x <= mx && a.indexOf(x) === i)
          .map(x => `<button type="button" data-feed="${x}">${x === mx && mx === room ? t("Hunt.FeedFull", { n: x }) : x}</button>`).join("");
        pick.querySelectorAll("[data-feed]").forEach(b => b.addEventListener("click", () => { range.value = b.dataset.feed; out.value = b.dataset.feed; }));
        note.textContent = v.rich ? t("Vessel.Rich") : "";
      };
      range.addEventListener("input", () => { out.value = range.value; });
      el.querySelector("[name=vessel]").addEventListener("change", marks);
      // дозы — у алкоголя (по 100 г крепкого), галлюциногенов и яда (сила)
      sub?.addEventListener("change", () => { const d = SUBSTANCES[sub.value]?.doses; dose.hidden = !d; if (d) dose.querySelector("input").max = d; });
      marks();
    },
    ok: { label: t("Hunt.Feed"), icon: "fa-solid fa-droplet", callback: (e, b) => { const f = b.form.elements;
      return { n: Number(f.n.value) || 0, vessel: f.vessel.value, substance: f.substance?.value ?? "", dose: Math.max(1, Number(f.dose?.value) || 1), ill: !!f.ill?.checked }; } },
    rejectClose: false
  });
  if (!res?.n) return;
  return drinkVessel(actor, res);
}

/**
 * Глоток из сосуда (окно выше или бросок без окна): { n, vessel, substance, dose, ill }.
 * Голод, деградация на грани убийства, раны сосуда, вещество и болезнь крови.
 */
export async function drinkVessel(actor, res) {
  const { vesselOf } = await import("../data/vessels.mjs");
  const s = actor.system.blood, room = Math.max(0, s.max - s.value);
  const say = (html, warn = false) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice${warn ? " is-warn" : ""}">${html}</div>` });
  const v = vesselOf(res.vessel), limit = Math.min(room, v.size), n = Math.min(res.n, limit), person = !v.animal && v.key !== "bag";
  // больной сосуд: заметить до глотка — Интеллект + Медицина (сл. 7); провал с единицами — разносчик без проверки
  let carrier = false, checkAfter = false;
  if (res.ill) {
    const med = actor.system.abilities.medicine?.value ?? 0, int = actor.system.attributes.intelligence.total;
    const look = res.look ?? await rollPool({ actor, title: t("Vessel.LookTitle"), subtitle: t("Vessel.LookSub"), difficulty: 7, kind: "check", pool: int + med,
      breakdown: [{ label: actor.traitLabel("attributes.intelligence"), value: int }, { label: actor.traitLabel("abilities.medicine"), value: med }] });
    if (look?.outcome === "success") return say(`<i class="fa-solid fa-virus"></i> ${t("Vessel.Noticed", { name: actor.name })}`);
    if (look?.outcome === "botch") carrier = true; else checkAfter = true;
  }
  let drink = n;
  // Сильный голод (крови меньше 5): чтобы оторваться раньше, чем насытится, — бросок Силы воли (сл. 6), иначе пьёт досыта
  if (s.value < 5 && n < limit && !res.noStop) {
    const r = await rollPool({ actor, title: t("Hunt.StopTitle"), subtitle: t("Hunt.StopSub", { n }), pool: actor.system.willpower.permanent, difficulty: 6, kind: "check" });
    if (r.outcome !== "success") drink = limit;
  }
  const before = actor.system.blood.value;
  await actor.gainBlood(drink);
  if (drink > n) say(`<i class="fa-solid fa-face-angry"></i> ${t("Hunt.CouldNotStop", { n: drink })}`, true);
  // на грани убийства (осушил сосуд почти до дна; у человека — 9+) — проверка деградации, только на Человечности (правило системы)
  if (person && drink >= v.size - 1 && (actor.system.morality?.path ?? "humanity") === "humanity") {
    const { suggestCheck } = await import("../dice/virtue-checks.mjs");
    suggestCheck(actor, "degeneration", { reason: t("Hunt.Drained", { n: drink }), difficulty: 8 });
  }
  // V20, гл. 6: каждый пункт сверх двух — тяжёлое повреждение жертве
  const extra = [v.key !== "human" ? t(`Vessel.${v.key}`) : "", person && drink > 2 ? t("Vessel.Wounds", { n: drink - 2 }) : ""].filter(Boolean).join(" · ");
  await say(`<i class="fa-solid fa-droplet"></i> ${t("Hunt.Fed", { n: actor.system.blood.value - before, cur: actor.system.blood.value, max: s.max })}${extra ? ` <span class="r-muted">${extra}</span>` : ""}`);
  if (res.substance && drink > 0) await taintBlood(actor, res.substance, res.dose);
  if (checkAfter) {
    const st = res.resist ?? await rollPool({ actor, title: t("Vessel.CarrierTitle"), subtitle: t("Vessel.CarrierSub"), difficulty: 6, kind: "check",
      pool: actor.system.attributes.stamina.total, breakdown: [{ label: actor.traitLabel("attributes.stamina"), value: actor.system.attributes.stamina.total }] });
    carrier = st?.outcome !== "success";
  }
  if (carrier) await makeCarrier(actor);
  return drink;
}

/** Вещество из выпитой крови — эффектом на листе со сроком (V20, гл. 4: алкоголь — час на каждые 100 г, наркотики — по Выносливости). */
export async function taintBlood(actor, key, dose = 1) {
  const { SUBSTANCES } = await import("../data/vessels.mjs");
  const { getClock } = await import("./calendar.mjs");
  const def = SUBSTANCES[key];
  if (!def) return;
  const d = def.doses ? Math.clamp(dose, 1, def.doses) : 1, ms = def.ms(actor.system.attributes.stamina.total, d);
  const now = getClock(), name = `${t(`Vessel.Sub.${key}`)}${def.doses ? ` ×${d}` : ""}`;
  await actor.createEmbeddedDocuments("ActiveEffect", [{ name, img: def.icon,
    flags: { [SYSTEM_ID]: { substance: key, dose: d, start: now, ...(ms ? { until: now + ms } : {}) } } }]);
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="r-notice"><i class="fa-solid fa-flask"></i> ${t("Vessel.Tainted", { name: actor.name, what: name })}<br><small>${t(`Vessel.SubFx.${key}`)}</small></div>` });
}

/** Стал разносчиком болезни крови: недостаток «Разносчик заразы» на лист (V20, Достоинства и недостатки). */
async function makeCarrier(actor) {
  const NAME = "Разносчик заразы";
  if (!actor.items.some(i => i.type === "flaw" && i.name === NAME)) {
    const { Codex } = await import("../data/codex.mjs");
    const { LibraryItems } = await import("./library.mjs");
    await Codex.load();
    const m = (Codex.merits ?? []).find(x => x.kind === "flaw" && x.name === NAME);
    await actor.createEmbeddedDocuments("Item", [m ? LibraryItems.trait(m, 4) : { name: NAME, type: "flaw", system: { cost: 4 } }]);
  }
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice is-warn"><i class="fa-solid fa-virus"></i> ${t("Vessel.Carrier", { name: actor.name })}</div>` });
}

/* ── Ночь, сцена, история ─────────────────────────────────────────────── */

function kindredOf() {
  return game.actors.filter(a => a.type === "vampire" && (a.hasPlayerOwner || a.getFlag(SYSTEM_ID, "nightly")));
}

export async function nightfall() {
  if (!game.user.isGM) return ui.notifications.warn(t("Notify.GMOnly"));
  const will = game.settings.get(SYSTEM_ID, "nightlyWillpower");
  const lines = [];
  const { herdBlood } = await import("./income.mjs");
  for (const a of kindredOf()) {
    const before = a.system.blood.value;
    await a.awaken({ willpower: will, quiet: true });
    // кровь от Стада (apps/income.mjs, галочка мира) — после пробуждения
    const herd = await herdBlood(a);
    lines.push(`<li><b>${a.name}</b>: ${t("Night.Line", { from: before, to: a.system.blood.value })}${herd ? ` ${herd}` : ""}${before <= 0 ? ` <span class="r-fate">${t("Night.Starving")}</span>` : ""}</li>`);
  }
  // ревенанты производят собственную витэ — пункт за ночь (Ghouls & Revenants; «Утечка витэ» — вдвое медленнее, решает рассказчик)
  for (const a of game.actors.filter(x => x.isRevenant && x.system.blood.value < x.system.blood.max)) {
    const before = a.system.blood.value;
    await a.update({ "system.blood.value": before + 1 });
    lines.push(`<li><b>${a.name}</b>: ${t("Night.Revenant", { from: before, to: before + 1 })}</li>`);
  }
  // дампиры восполняют пункт в сутки, если сыты, здоровы (не ниже «Задет») и выспались (Accursed Heirs, гл. 1)
  for (const a of game.actors.filter(x => x.isDhampir && x.system.blood.value < x.system.blood.max)) {
    const before = a.system.blood.value, hurt = (a.system.health?.damage ?? 0) > 2;
    if (hurt) { lines.push(`<li><b>${a.name}</b>: ${t("Night.DhampirHurt")}</li>`); continue; }
    await a.update({ "system.blood.value": before + 1 });
    lines.push(`<li><b>${a.name}</b>: ${t("Night.Dhampir", { from: before, to: before + 1 })}</li>`);
  }
  // узы крови слабеют без крови сюзерена (05)
  const { decayBonds } = await import("./bonds.mjs");
  for (const a of game.actors.filter(x => (x.system.bonds ?? []).length)) for (const l of await decayBonds(a)) lines.push(`<li>${l}</li>`);
  ChatMessage.create({ content: `<div class="r-notice"><i class="fa-solid fa-moon"></i> <b>${t("Night.Title")}</b><ul>${lines.join("") || `<li>${t("Night.Nobody")}</li>`}</ul></div>` });
  // Маскарад: огласка в городе — карточка рассказчику об охотниках (ui/masquerade.mjs)
  const { huntersAlert } = await import("../ui/masquerade.mjs");
  await huntersAlert();
  // снимок на начало ночи — для «Итогов ночи»
  await game.settings.set(SYSTEM_ID, "nightSnapshot", { at: Date.now(), actors: Object.fromEntries(summaryActors().map(a => [a.id, stateOf(a)])) });
}

/* ── Итоги ночи ───────────────────────────────────────────────────────── */
// Кнопка «Итоги ночи» (рассказчик): по каждому персонажу игроков — что изменилось с начала ночи (кнопка «Ночь»):
// кровь, Воля, ресурс линейки (Ярость и Гнозис, Вера и Мука, Убеждённость), раны и что из эффектов ещё действует.

const summaryActors = () => game.actors.filter(a => a.hasPlayerOwner && !["coterie", "domain"].includes(a.type));

/** Состояние персонажа для сводки: ресурсы по линейке и раны. */
function stateOf(a) {
  const s = a.system, h = s.health ?? {}, ww = a.type === "werewolf" ? s.werewolf : null, dm = a.type === "demon";
  return { blood: a.hasBlood ? s.blood?.value ?? 0 : null, will: s.willpower?.temporary ?? null,
    rage: ww ? ww.rage?.value ?? 0 : null, gnosis: ww ? ww.gnosis?.value ?? 0 : null,
    faith: dm ? s.faith?.temporary ?? 0 : null, torment: dm ? s.torment?.temporary ?? 0 : null,
    conviction: a.type === "hunter" ? s.hunter?.conviction ?? 0 : null,
    b: h.bashing ?? 0, l: h.lethal ?? 0, a: h.aggravated ?? 0 };
}

export async function nightSummary() {
  if (!game.user.isGM) return ui.notifications.warn(t("Notify.GMOnly"));
  const esc = x => foundry.utils.escapeHTML(String(x ?? ""));
  const snap = game.settings.get(SYSTEM_ID, "nightSnapshot") ?? {};
  const rows = summaryActors().sort((x, y) => x.name.localeCompare(y.name, "ru")).map(a => {
    const now = stateOf(a), was = snap.actors?.[a.id] ?? null;
    const pair = k => now[k] == null ? "" : was && was[k] != null && was[k] !== now[k]
      ? `<span class="r-ns-stat is-${now[k] < was[k] ? "down" : "up"}">${esc(t(`NightSum.${k}`))} ${was[k]} → <b>${now[k]}</b></span>`
      : `<span class="r-ns-stat">${esc(t(`NightSum.${k}`))} <b>${now[k]}</b></span>`;
    const stats = ["blood", "rage", "gnosis", "faith", "torment", "conviction", "will"].map(pair).filter(Boolean).join("");
    const hurtNow = now.b + now.l + now.a, delta = was ? hurtNow - (was.b + was.l + was.a) : 0;
    const hurt = hurtNow || delta ? `<span class="r-ns-hurt"><i class="fa-solid fa-heart-crack"></i> ${hurtNow ? esc(t("NightSum.Hurt", { b: now.b, l: now.l, a: now.a })) : esc(t("NightSum.Healthy"))}${
      delta > 0 ? ` <em>${esc(t("NightSum.HurtMore", { n: delta }))}</em>` : delta < 0 ? ` <em>${esc(t("NightSum.HurtLess", { n: -delta }))}</em>` : ""}</span>` : "";
    const fx = a.effects.filter(e => !e.disabled).map(e => e.name);
    const effects = fx.length ? `<span class="r-ns-fx"><i class="fa-solid fa-wand-sparkles"></i> ${esc(fx.slice(0, 6).join(", "))}${fx.length > 6 ? ` ${esc(t("NightSum.More", { n: fx.length - 6 }))}` : ""}</span>` : "";
    return `<li><b class="r-ns-name">${esc(a.name)}</b><span class="r-ns-stats">${stats}</span>${hurt}${effects}</li>`;
  });
  return ChatMessage.create({ speaker: { alias: t("NightSum.Title") },
    content: `<div class="r-roll-card r-turn-card r-night-sum"><header class="r-turn-head"><i class="fa-solid fa-scroll"></i> <b>${esc(t("NightSum.Title"))}</b></header>
      <ul class="r-ns-list">${rows.join("") || `<li>${esc(t("NightSum.Nobody"))}</li>`}</ul>
      <p class="r-turn-foot">${esc(t(snap.actors ? "NightSum.Foot" : "NightSum.FootNoSnap"))}</p></div>` });
}

/** Состояния, которые проходят с концом сцены: ошеломление, падение, захват, ярость, Ротшрек. */
const SCENE_STATUSES = ["r-stunned", "r-prone", "r-held", "r-frenzy", "r-rotschreck"];

export async function endScene() {
  const owned = game.user.isGM ? game.actors.contents : game.actors.filter(a => a.isOwner);
  for (const a of owned.filter(x => x.hasBlood)) if (Object.values(a.system.boosts ?? {}).some(v => v > 0)) await a.clearBoosts();
  for (const a of owned) for (const id of SCENE_STATUSES) if (a.statuses?.has(id)) await a.toggleStatusEffect(id, { active: false });
  // силы против цели «на ход» и Устрашающий взор — до конца сцены (apps/target-powers.mjs)
  const { endSceneMind } = await import("./target-powers.mjs");
  for (const a of owned) await endSceneMind(a);
  await (await import("./target-powers.mjs")).endSceneAbyss();
  // Мощь, включённая кровью вне боя, держится до конца сцены
  for (const a of owned) if (a.getFlag(SYSTEM_ID, "potence")) await a.unsetFlag(SYSTEM_ID, "potence");
  // Силы «до конца сцены» (Когти Зверя…) гаснут
  for (const a of owned) for (const x of a.powerEffects ?? []) if (x.def.mode === "scene") await a.endPower(x.effect);
  // падшие: Вера за сцену (сложность Проявления) и черты высокой Муки «на эпизод» — с концом сцены обнуляются
  for (const a of owned.filter(x => x.type === "demon")) {
    if (a.getFlag(SYSTEM_ID, "sceneFaith")) await a.unsetFlag(SYSTEM_ID, "sceneFaith");
    if (a.getFlag(SYSTEM_ID, "formScene")) await a.unsetFlag(SYSTEM_ID, "formScene");
  }
  // охотники: Грань «свыше» сцены, запрет после неудачи, риск Убеждённостью
  const { hunterSceneEnd, hunterStoryEnd } = await import("./hunter.mjs");
  for (const a of owned.filter(x => x.type === "hunter")) await hunterSceneEnd(a);
  ui.notifications.info(t("Notify.SceneEnded"));
}

export async function endStory() {
  if (!game.user.isGM) return ui.notifications.warn(t("Notify.GMOnly"));
  for (const a of game.actors.filter(x => x.hasPlayerOwner)) {
    await a.update({ "system.willpower.temporary": a.system.willpower.permanent });
  }
  // охотники: Убеждённость к начальной, счёт воззваний и жертв за историю — заново
  const { hunterStoryEnd } = await import("./hunter.mjs");
  for (const a of game.actors.filter(x => x.type === "hunter")) await hunterStoryEnd(a);
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
    mk("fa-scroll", t("NightSum.Button"), nightSummary);
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
