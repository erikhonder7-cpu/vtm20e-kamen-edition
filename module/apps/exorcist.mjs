// module/apps/exorcist.mjs
// Вера против падших — окно смертного-охотника (Demon: The Fallen, гл. 9 «Вера как оружие», с. 256; «Спасители и
// истребители», гл. 4 — пересказ: data/demon-rules.json, глава key "saviors").
//   · Молитвы основной книги: встречный бросок Веры (с помощниками и благословлённым предметом) против Воли падшего, сл. 6.
//     Изгнание и ограждение — на столько часов, сколько Муки; ограждение — на площадь (сумма Веры) кв. ярдов; связывание —
//     пока длится молитва. Падшим с Мукой 3 и ниже молитвы не страшны.
//   · Экзорцизм (настройка мира exorcismRule): «core» — победа в час, побед больше постоянной Веры демона → «без тела»;
//     «saviors» — поиск души (Восприятие + Шестое чувство, сл. Воля + 2, три попытки), потом час за часом Воля против Воли,
//     сл. 8 (Истинное Имя — 6); проигравший теряет пункт Воли; провал экзорциста — обряд сорван навсегда, провал демона или
//     демон без Воли — дух уходит в Бездну.
//   · Поиски оружия веры — продолжительные броски Интеллект + Расследование/Оккультизм раз в 4 часа; сколько нужно — видит ведущий.
//   · Медальон св. Бенедикта, кила, молитва св. Михаилу (раз в неделю), ритуал Зар (12 часов хроники — гибель тела → Бездна).

import { SYSTEM_ID, SYSTEM_PATH } from "../config.mjs";
import { rollPool, evaluate } from "../dice/roll.mjs";
import { getClock, shortDate } from "./calendar.mjs";
import { Codex } from "../data/codex.mjs";

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.Exorcist.${k}`, d) : game.i18n.localize(`VTM20.Exorcist.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const HOUR = 3600000, WEEK = 7 * 24 * HOUR;
const notice = (actor, icon, html, cls = "") => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="r-notice r-type-mortal ${cls}"><i class="fa-solid ${icon}"></i> ${html}</div>` });

/** Поиски: ключ, сколько успехов нужно (по книге). */
export const RESEARCH = [
  { key: "prayer", need: 12 }, { key: "rite", need: 10 }, { key: "michael", need: 15 }, { key: "relic", need: 25 },
  { key: "kila", need: 35 }, { key: "shurpu", need: 50 }, { key: "medallion", need: 60 }, { key: "zar", need: 85 },
  { key: "legend", need: 75 }
];
const SOURCES = [6, 7, 8, 9, 10];

const rule = () => game.settings.get(SYSTEM_ID, "exorcismRule");
const wp = a => a.system.willpower;
const ex = a => a.system.exorcist ?? {};

/** Бросок «за кадром» (помощники и падший во встречном броске): кубики, успехи, провал. */
async function quietRoll(pool, difficulty) {
  if (pool <= 0) return { values: [], successes: 0, outcome: "failure" };
  const r = await new Roll(`${pool}d10`).evaluate();
  const values = r.dice[0].results.map(x => x.result);
  const ev = evaluate(values, { difficulty });
  return { values, successes: ev.successes, outcome: ev.outcome };
}

/** Чужой лист меняет только тот, у кого есть права; остальным — подсказка, что поменять у ведущего. */
async function change(doc, data) {
  if (doc.isOwner) return doc.update(data);
  ui.notifications.warn(t("NotOwner", { name: doc.name }));
  return null;
}

class ExorcistWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(actor) {
    super({ id: `r-exorcist-${actor.id}`, window: { title: `${t("Title")}: ${actor.name}` } });
    this.actor = actor;
    this.hook = Hooks.on("updateActor", a => {
      const e = ex(this.actor);
      if (a === this.actor || a.uuid === e.target || (e.helpers ?? []).includes(a.uuid)) this.render();
    });
  }

  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: ["vtm20", "r-dialog", "r-exorcist", "r-type-mortal"],
    window: { icon: "fa-solid fa-hands-praying", resizable: true },
    position: { width: 640, height: "auto" },
    form: { handler: ExorcistWindow.#onSave, submitOnChange: true, closeOnSubmit: false },
    actions: { pray: ExorcistWindow.#onPray, soul: ExorcistWindow.#onSoul, hour: ExorcistWindow.#onHour, restart: ExorcistWindow.#onRestart,
      delHelper: ExorcistWindow.#onDelHelper, open: ExorcistWindow.#onOpen, medallion: ExorcistWindow.#onMedallion,
      kila: ExorcistWindow.#onKila, michael: ExorcistWindow.#onMichael, zar: ExorcistWindow.#onZar, sight: ExorcistWindow.#onSight,
      researchAdd: ExorcistWindow.#onResearchAdd, researchRoll: ExorcistWindow.#onResearchRoll, researchDel: ExorcistWindow.#onResearchDel }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/apps/exorcist.hbs` } };

  async close(o) { Hooks.off("updateActor", this.hook); return super.close(o); }

  get demon() { const u = ex(this.actor).target; return u ? fromUuidSync(u) : null; }
  get helpers() { return (ex(this.actor).helpers ?? []).map(u => fromUuidSync(u)).filter(Boolean); }

  /** Вера молящихся: сам, помощники и благословлённый предмет (в руках верующего). */
  get faithPool() {
    const own = this.actor.system.trueFaith ?? 0;
    return own + this.helpers.reduce((s, h) => s + (h.system.trueFaith ?? 0), 0) + (own ? ex(this.actor).talisman ?? 0 : 0);
  }

  async _prepareContext() {
    const a = this.actor, e = ex(a), d = this.demon, r = rule(), now = getClock();
    const demons = game.actors.filter(x => x.type === "demon" && x.testUserPermission(game.user, "LIMITED"))
      .map(x => ({ uuid: x.uuid, name: x.name, selected: x.uuid === e.target }));
    if (d && !demons.some(x => x.uuid === d.uuid)) demons.unshift({ uuid: d.uuid, name: d.name, selected: true });
    const ds = d?.system;
    const research = (e.research ?? []).map((x, i) => ({ ...x, i, done: x.got >= x.need,
      label: x.name || t(`R.${x.key}`), abilityLabel: a.traitLabel(`abilities.${x.ability}`) }));
    return {
      editable: a.isOwner, isGM: game.user.isGM, e, rule: r, isCore: r === "core", ruleLabel: t(`Rule.${r}`),
      demons, d, demon: d ? { name: d.name, uuid: d.uuid, wp: ds.willpower.temporary, wpPerm: ds.willpower.permanent,
        faith: ds.faith.permanent, torment: ds.torment.permanent, hostless: ds.hostless, abyss: ds.abyss,
        immune: ds.torment.permanent <= 3 } : null,
      faith: a.system.trueFaith ?? 0, wp: wp(a).temporary, wpPerm: wp(a).permanent, pool: this.faithPool,
      isHunter: a.type === "hunter", conviction: a.system.hunter?.conviction ?? 0,
      helpers: this.helpers.map(h => ({ uuid: h.uuid, name: h.name, faith: h.system.trueFaith ?? 0, wp: wp(h).temporary })),
      failedHere: !!d && (e.failed ?? []).includes(d.uuid),
      soulDiff: d ? Math.min(10, ds.willpower.permanent + 2) : 0, soulLeft: 3 - (e.soulTries ?? 0),
      need: d ? ds.faith.permanent + 1 : 0,
      michaelReady: now - (e.michael ?? 0) >= WEEK || !e.michael,
      michaelNext: e.michael ? shortDate(new Date(e.michael + WEEK)) : "",
      zarUntil: ds?.zar && ds.zar > now ? shortDate(new Date(ds.zar)) : "",
      research, presets: RESEARCH.map(p => ({ value: p.key, label: t(`R.${p.key}`) + (game.user.isGM ? ` · ${p.need}` : "") })),
      sources: SOURCES.map(n => ({ value: n, label: t(`Src.${n}`) })),
      abilities: ["investigation", "occult"].map(k => ({ value: k, label: a.traitLabel(`abilities.${k}`) }))
    };
  }

  /** Цель, Истинное Имя, предмет, поля поисков. Новая цель — обряд с начала. */
  static async #onSave(event, form, formData) {
    const d = foundry.utils.expandObject(formData.object), e = ex(this.actor);
    const upd = { "system.exorcist.trueName": !!d.trueName, "system.exorcist.talisman": Math.clamp(Number(d.talisman) || 0, 0, 5) };
    if ((d.target ?? "") !== e.target) Object.assign(upd, { "system.exorcist.target": d.target ?? "", "system.exorcist.soul": "",
      "system.exorcist.soulTries": 0, "system.exorcist.wins": 0, "system.exorcist.hours": 0 });
    if (d.research) upd["system.exorcist.research"] = (e.research ?? []).map((x, i) => {
      const n = d.research[i] ?? {};
      return { ...x, name: n.name ?? x.name, diff: Number(n.diff) || x.diff, ability: n.ability ?? x.ability,
        need: game.user.isGM && n.need != null ? Math.max(1, Number(n.need) || x.need) : x.need };
    });
    await this.actor.update(upd);
  }

  /** Перед молитвой и обрядом: есть ли цель и не слишком ли она «чиста». */
  #check() {
    const d = this.demon;
    if (!d) { ui.notifications.warn(t("NoTarget")); return null; }
    if (d.system.hostless || d.system.abyss) { ui.notifications.warn(t("NoBody", { name: d.name })); return null; }
    return d;
  }

  /** Встречный бросок Веры против Воли падшего (сл. 6): изгнание, ограждение, связывание или час экзорцизма по основной книге. */
  async #faithContest(kind) {
    const a = this.actor, d = this.#check();
    if (!d) return null;
    if (d.system.torment.permanent <= 3) { await notice(a, "fa-dove", t("Immune", { name: esc(d.name) })); return null; }
    const pool = this.faithPool;
    if (!pool) { ui.notifications.warn(t("NoFaith")); return null; }
    const o = await quietRoll(d.system.willpower.permanent, 6);
    const helpers = this.helpers.filter(h => h.system.trueFaith);
    const breakdown = [{ label: t("Faith"), value: a.system.trueFaith ?? 0 },
      ...helpers.map(h => ({ label: h.name, value: h.system.trueFaith })),
      ...(a.system.trueFaith && ex(a).talisman ? [{ label: t("Talisman"), value: ex(a).talisman }] : [])];
    const res = await rollPool({ actor: a, title: t(`Pray.${kind}`), subtitle: d.name, pool, difficulty: 6, kind: "prayer", breakdown,
      extra: { opposed: { label: `${d.name} · ${game.i18n.localize("VTM20.Willpower")}`, values: o.values, successes: o.successes, difficulty: 6 } } });
    return { res, won: res.successes > o.successes, d };
  }

  static async #onPray(event, target) {
    const kind = target.dataset.kind, r = await this.#faithContest(kind);
    if (!r?.won) return;
    const h = r.d.system.torment.permanent;
    const area = (this.actor.system.trueFaith ?? 0) + this.helpers.reduce((s, x) => s + (x.system.trueFaith ?? 0), 0);
    return notice(this.actor, "fa-hands-praying", t(`Pray.${kind}Done`, { name: esc(r.d.name), h, area }));
  }

  /** «Спасители»: есть ли в теле душа — Восприятие + Шестое чувство, сл. Воля демона + 2; три попытки, провал — нет. */
  static async #onSoul() {
    const a = this.actor, e = ex(a), d = this.#check();
    if (!d) return;
    const diff = Math.min(10, d.system.willpower.permanent + 2);
    const pool = a.traitValue("attributes.perception") + a.traitValue("abilities.awareness");
    const res = await rollPool({ actor: a, title: t("Soul"), subtitle: d.name, pool, difficulty: diff, kind: "check",
      breakdown: [{ label: a.traitLabel("attributes.perception"), value: a.traitValue("attributes.perception") },
        { label: a.traitLabel("abilities.awareness"), value: a.traitValue("abilities.awareness") }] });
    const tries = (e.soulTries ?? 0) + 1;
    const soul = res.successes > 0 ? "yes" : (res.outcome === "botch" || tries >= 3) ? "no" : "";
    await a.update({ "system.exorcist.soulTries": tries, "system.exorcist.soul": soul });
    if (soul) await notice(a, soul === "yes" ? "fa-heart-pulse" : "fa-heart-crack", t(soul === "yes" ? "SoulYes" : "SoulNo", { name: esc(d.name) }),
      soul === "yes" ? "" : "is-sin");
  }

  /** Час обряда — по выбранной в мире системе. */
  static async #onHour() {
    const a = this.actor, e = ex(a);
    if (rule() === "core") {
      const r = await this.#faithContest("exorcism");
      if (!r) return;
      const wins = (e.wins ?? 0) + (r.won ? 1 : 0), need = r.d.system.faith.permanent + 1;
      await a.update({ "system.exorcist.wins": wins, "system.exorcist.hours": (e.hours ?? 0) + 1 });
      if (wins >= need) return this.#victory(r.d, false);
      return;
    }
    const d = this.#check();
    if (!d) return;
    if ((e.failed ?? []).includes(d.uuid)) return ui.notifications.warn(t("FailedBefore", { name: d.name }));
    if (e.soul !== "yes") return ui.notifications.warn(t("SoulFirst"));
    const diff = e.trueName ? 6 : 8;
    const helpers = this.helpers.filter(h => wp(h).temporary > 0);
    if (wp(a).temporary <= 0 && !helpers.length) return ui.notifications.warn(t("NoWill"));
    const o = await quietRoll(d.system.willpower.permanent, 8);
    const hr = [];
    for (const h of helpers) hr.push({ h, ...(await quietRoll(wp(h).permanent, diff)) });
    const self = wp(a).temporary > 0;
    const notes = hr.map(x => t("HelperRoll", { name: esc(x.h.name), n: x.successes, botch: x.outcome === "botch" ? t("BotchMark") : "" }));
    const res = await rollPool({ actor: a, title: t("Hour", { n: (e.hours ?? 0) + 1 }), subtitle: d.name, pool: self ? wp(a).permanent : 0,
      difficulty: diff, kind: "check", notes, breakdown: [{ label: game.i18n.localize("VTM20.Willpower"), value: self ? wp(a).permanent : 0 }],
      extra: { opposed: { label: `${d.name} · ${game.i18n.localize("VTM20.Willpower")}`, values: o.values, successes: o.successes, difficulty: 8 } } });
    await a.update({ "system.exorcist.hours": (e.hours ?? 0) + 1 });
    const botched = (self && res.outcome === "botch") || hr.some(x => x.outcome === "botch");
    if (botched) {
      await a.update({ "system.exorcist.failed": [...(e.failed ?? []), d.uuid], "system.exorcist.soul": "", "system.exorcist.soulTries": 0 });
      return notice(a, "fa-skull", t("Botched", { name: esc(d.name) }), "is-sin");
    }
    if (o.outcome === "botch") return this.#victory(d, true);
    const ours = (self ? res.successes : 0) + hr.reduce((s, x) => s + x.successes, 0);
    if (ours > o.successes) {
      const left = Math.max(0, d.system.willpower.temporary - 1);
      await change(d, { "system.willpower.temporary": left });
      if (left === 0) return this.#victory(d, true);
      return notice(a, "fa-arrow-down", t("DemonLoses", { name: esc(d.name), n: ours, m: o.successes, w: left }));
    }
    if (ours < o.successes) {
      for (const x of [...(self ? [a] : []), ...helpers]) await change(x, { "system.willpower.temporary": Math.max(0, wp(x).temporary - 1) });
      const anyLeft = [a, ...helpers].some(x => wp(x).temporary > 0);
      return notice(a, "fa-arrow-down", t(anyLeft ? "WeLose" : "WeBroken", { name: esc(d.name), n: ours, m: o.successes }), "is-sin");
    }
    return notice(a, "fa-equals", t("Tie", { n: ours }));
  }

  /** Победа: «Спасители» — дух в Бездну, носитель очнулся; основная книга — падший без тела ищет новое. */
  async #victory(d, abyss) {
    const { loseHost } = await import("./host.mjs");
    if (d.isOwner) {
      await loseHost(d, "exorcism");
      if (abyss) await d.update({ "system.abyss": true, "system.apocalyptic": false });
    } else ui.notifications.warn(t("NotOwner", { name: d.name }));
    await this.actor.update({ "system.exorcist.soul": "", "system.exorcist.soulTries": 0, "system.exorcist.wins": 0, "system.exorcist.hours": 0 });
    return notice(this.actor, "fa-sun", t(abyss ? "VictoryAbyss" : "VictoryCore", { name: esc(d.name) }));
  }

  static async #onRestart() {
    await this.actor.update({ "system.exorcist.soul": "", "system.exorcist.soulTries": 0, "system.exorcist.wins": 0, "system.exorcist.hours": 0 });
  }

  static async #onDelHelper(event, target) {
    const u = target.dataset.uuid;
    await this.actor.update({ "system.exorcist.helpers": (ex(this.actor).helpers ?? []).filter(x => x !== u) });
  }
  static async #onOpen(event, target) { (await fromUuid(target.dataset.uuid))?.sheet?.render(true); }

  /** Охотник (Hunter: The Reckoning): второе зрение видит падшего поверх тела-носителя — Дом и облик; пункт Убеждённости. */
  static async #onSight() {
    const a = this.actor, d = this.demon;
    if (a.type !== "hunter") return;
    const { secondSight } = await import("./hunter.mjs");
    const c = a.system.hunter?.conviction ?? 0;
    await secondSight(a);
    if (!d || c < 1) return;
    const house = Codex.house(d.system.house)?.name ?? "", visage = Codex.house(d.system.house)?.visages?.[d.system.visage] ?? "";
    return notice(a, "fa-eye", t("SightDemon", { who: esc(a.name), name: esc(d.name), house: esc(house || "—"), visage: esc(visage || "—") }));
  }

  /** Медальон св. Бенедикта: пункт Воли — сцена без власти Проявления и призывов над разумом. */
  static async #onMedallion() {
    if (!(await this.actor.spendWillpower(1))) return;
    return notice(this.actor, "fa-medal", t("MedallionOn", { name: esc(this.actor.name) }));
  }

  /** Кила попала: бросок Воли, сл. 7 — каждый успех снимает пункт временной Веры падшего. */
  static async #onKila() {
    const a = this.actor, d = this.demon;
    if (!d) return ui.notifications.warn(t("NoTarget"));
    const res = await rollPool({ actor: a, title: t("Kila"), subtitle: d.name, pool: wp(a).permanent, difficulty: 7, kind: "check",
      breakdown: [{ label: game.i18n.localize("VTM20.Willpower"), value: wp(a).permanent }] });
    const n = Math.min(res.successes, d.system.faith.temporary);
    if (!n) return;
    await change(d, { "system.faith.temporary": d.system.faith.temporary - n });
    return notice(a, "fa-khanda", t("KilaHit", { name: esc(d.name), n }));
  }

  /** Молитва св. Михаилу: вся временная Воля назад, раз в неделю (часы хроники). */
  static async #onMichael() {
    const a = this.actor, e = ex(a), now = getClock();
    if (e.michael && now - e.michael < WEEK) return ui.notifications.warn(t("MichaelWait", { date: shortDate(new Date(e.michael + WEEK)) }));
    await a.update({ "system.willpower.temporary": wp(a).permanent, "system.exorcist.michael": now });
    return notice(a, "fa-shield-halved", t("MichaelDone", { name: esc(a.name), n: wp(a).permanent }));
  }

  /** Ритуал Зар: пост 12 часов (три броска Выносливости) и танец 12 часов (три броска Выносливость + Атлетика). */
  static async #onZar() {
    const a = this.actor, d = this.demon;
    if (!d) return ui.notifications.warn(t("NoTarget"));
    const sta = a.traitValue("attributes.stamina"), ath = a.traitValue("abilities.athletics");
    for (const [i, diff] of [6, 7, 8].entries()) {
      const res = await rollPool({ actor: a, title: t("ZarFast", { n: i + 1 }), subtitle: d.name, pool: sta, difficulty: diff, kind: "check",
        breakdown: [{ label: a.traitLabel("attributes.stamina"), value: sta }] });
      if (res.outcome === "botch") return notice(a, "fa-bed", t("ZarFaint", { name: esc(a.name) }), "is-sin");
      if (res.successes > 0) continue;
      const go = await foundry.applications.api.DialogV2.confirm({ window: { title: t("Zar") }, content: `<p>${t("ZarWill")}</p>` }).catch(() => false);
      if (!go || !(await a.spendWillpower(1))) return notice(a, "fa-utensils", t("ZarBroke", { name: esc(a.name) }), "is-sin");
    }
    for (const [i, diff] of [7, 8, 9].entries()) {
      const res = await rollPool({ actor: a, title: t("ZarDance", { n: i + 1 }), subtitle: d.name, pool: sta + ath, difficulty: diff, kind: "check",
        breakdown: [{ label: a.traitLabel("attributes.stamina"), value: sta }, { label: a.traitLabel("abilities.athletics"), value: ath }] });
      if (res.outcome === "botch") { await a.applyDamage(2, "bashing"); return notice(a, "fa-person-falling", t("ZarHurt", { name: esc(a.name) }), "is-sin"); }
      if (!res.successes) return notice(a, "fa-rotate-left", t("ZarStopped", { name: esc(a.name) }), "is-sin");
    }
    const until = getClock() + 12 * HOUR;
    await change(d, { "system.zar": until });
    return notice(a, "fa-drum", t("ZarDone", { name: esc(d.name), date: shortDate(new Date(until)) }));
  }

  static async #onResearchAdd() {
    const el = this.element, key = el.querySelector("[name=preset]")?.value || "prayer";
    const p = RESEARCH.find(x => x.key === key) ?? RESEARCH[0];
    const list = [...(ex(this.actor).research ?? []), { key: p.key, name: "", need: p.need, got: 0, diff: 7, ability: "investigation" }];
    await this.actor.update({ "system.exorcist.research": list });
  }

  /** Четыре часа поисков: Интеллект + Расследование/Оккультизм; пункт Воли — верный успех; провал — всё найденное оказалось ложью. */
  static async #onResearchRoll(event, target) {
    const a = this.actor, i = Number(target.dataset.index), will = target.dataset.will === "1";
    const list = foundry.utils.deepClone(ex(a).research ?? []), x = list[i];
    if (!x) return;
    const int = a.traitValue("attributes.intelligence"), ab = a.traitValue(`abilities.${x.ability}`);
    const name = x.name || t(`R.${x.key}`);
    const res = await rollPool({ actor: a, title: t("Research"), subtitle: name, pool: int + ab, difficulty: x.diff, kind: "check", willpower: will,
      breakdown: [{ label: a.traitLabel("attributes.intelligence"), value: int }, { label: a.traitLabel(`abilities.${x.ability}`), value: ab }] });
    const was = x.got;
    x.got = res.outcome === "botch" ? 0 : x.got + res.successes;
    await a.update({ "system.exorcist.research": list });
    if (res.outcome === "botch" && was) return notice(a, "fa-book-skull", t("ResearchLost", { name: esc(name) }), "is-sin");
    if (x.got >= x.need && was < x.need) return notice(a, "fa-book-open", t("ResearchDone", { who: esc(a.name), name: esc(name) }));
  }

  static async #onResearchDel(event, target) {
    const i = Number(target.dataset.index);
    await this.actor.update({ "system.exorcist.research": (ex(this.actor).research ?? []).filter((_, j) => j !== i) });
  }

  /** Перетащить падшего — цель; смертного — помощник. */
  _onRender(context, options) {
    super._onRender(context, options);
    this.element.addEventListener("drop", async ev => {
      let data; try { data = JSON.parse(ev.dataTransfer.getData("text/plain")); } catch { return; }
      if (data?.type !== "Actor") return;
      const doc = await fromUuid(data.uuid), e = ex(this.actor);
      if (!doc || doc === this.actor) return;
      if (doc.type === "demon") return this.actor.update({ "system.exorcist.target": doc.uuid, "system.exorcist.soul": "",
        "system.exorcist.soulTries": 0, "system.exorcist.wins": 0, "system.exorcist.hours": 0 });
      if (["mortal", "hunter"].includes(doc.type) && !(e.helpers ?? []).includes(doc.uuid))
        return this.actor.update({ "system.exorcist.helpers": [...(e.helpers ?? []), doc.uuid] });
    });
  }
}

export function openExorcist(actor) {
  const app = foundry.applications.instances.get(`r-exorcist-${actor.id}`) ?? new ExorcistWindow(actor);
  return app.render({ force: true });
}

export function registerExorcist() {
  game.settings.register(SYSTEM_ID, "exorcismRule", {
    name: "VTM20.Settings.ExorcismRule.Name", hint: "VTM20.Settings.ExorcismRule.Hint",
    scope: "world", config: true, type: String, default: "saviors",
    choices: { saviors: "VTM20.Settings.ExorcismRule.saviors", core: "VTM20.Settings.ExorcismRule.core" }
  });
}
