// module/apps/target-powers/effects.mjs
// Силы по цели — что происходит после броска: сопротивление и спор сил, пути Тауматургии, призывы и творения,
// иллюзии Химерии, чтение ауры и вкус крови, Затемнение (Пелена, Руки Бездны), одержимость, загадка.

import { SYSTEM_ID, VTM20 } from "../../config.mjs";
import { Codex } from "../../data/codex.mjs";
import { t, esc, TARGET_POWERS, SUBSUME, untilOf, done, notice, MS_H, ask } from "./core.mjs";

/** Сумма черт персонажа: Атрибуты, Способности, Добродетели, Воля, Дисциплины. */
export function poolOf(a, keys) {
  const s = a.system;
  return keys.reduce((sum, k) => sum + Number(
    k === "willpower" ? s.willpower?.permanent ?? 0
    : ["conscience", "selfControl", "courage"].includes(k) ? s.virtues?.[k]?.value ?? 0
    : s.attributes?.[k] ? s.attributes[k].total ?? s.attributes[k].value ?? 0
    : s.abilities?.[k] ? s.abilities[k].value ?? 0
    : a.discipline?.(k) ?? 0) || 0, 0);
}

/** Сопротивление цели (путь Тауматургии): бросок за цель, итог — сколько успехов тауматурга осталось. */
async function resistOf(spec, target, caster, n) {
  if (!spec) return { net: n, res: 0 };
  if (spec.needFortitude && !target.discipline?.("fortitude")) return { net: n, res: 0, note: t("NoFortitude") };
  const diff = typeof spec.diff === "number" ? spec.diff : spec.diff === "casterWP" ? (caster?.system.willpower?.temporary ?? 6)
    : spec.diff?.sum ? poolOf(caster, spec.diff.sum) : (spec.diff?.base ?? 6) + (spec.diff?.plus === "succ" ? n : 0);
  const pool = poolOf(target, spec.pool);
  const { rollPool } = await import("../../dice/roll.mjs");
  const r = pool > 0 ? await rollPool({ actor: target, title: t("Resist"), pool, difficulty: Math.clamp(diff, 2, 10), kind: "check" }) : { successes: 0 };
  const res = Math.max(0, r?.successes ?? 0);
  if (spec.mode === "net") return { net: n - res, res };
  if (spec.mode === "beat") return { net: res > n ? 0 : n, res };
  return { net: n, res };                                 // shorten, atrophy, contradict — итог по таблице
}

/** Искушение: цель бросает Восприятие + Хитрость (сл. 2 + успехи) — что она поняла. */
export async function contradict(caster, target, power, n) {
  const { res } = await resistOf(TARGET_POWERS["thaumaturgy|Contradict"].resist, target, caster, n);
  const line = t(res >= 5 ? "Contra5" : res >= 4 ? "Contra4" : res >= 3 ? "Contra3" : res >= 2 ? "Contra2" : "Contra0");
  return notice(target, power, line);
}

/** Путь Тауматургии: эффект на цели или на себе по таблице data/path-powers.mjs. */
export async function applyPath(message, state, x, tp, target, n, flags, api) {
  const caster = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
  const [disc] = x.key.split("|");
  // Боевой товарищ: младшую силу Пути Марса — на союзника
  if (tp.kind === "comrades") {
    const mars = (caster?.effects ?? []).filter(e => e.flags?.[SYSTEM_ID]?.mars);
    if (!mars.length) return ui.notifications.warn(t("ComradesNone"));
    const pick = mars.length === 1 ? mars[0].id : await foundry.applications.api.DialogV2.prompt({ window: { title: x.powerName }, classes: ["vtm20", "r-dialog"], rejectClose: false,
      content: `<div class="r-form"><select name="e">${mars.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join("")}</select></div>`,
      ok: { label: t("SelfApply"), callback: (e, b) => b.form.elements.e.value } });
    const src = caster.effects.get(pick);
    if (!src) return;
    await done(message, state, x);
    await target.createEmbeddedDocuments("ActiveEffect", [{ ...src.toObject(), _id: undefined, name: `${src.name} (${caster.name})` }]);
    return notice(target, x.powerName, src.name);
  }
  const r = await resistOf(tp.resist, target, caster, n);
  await done(message, state, x);
  // Превращение в прах: сопротивление — нужно больше успехов, чем у тауматурга
  if (tp.kind === "dust") {
    if (r.net <= 0) return notice(target, x.powerName, t("Resisted"));
    if (!target.isVampire) return notice(target, x.powerName, t("DustMortal", { y: 10 * n }));
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("DustName"), img: Codex.disciplineIcon(disc), description: `<p>${esc(t("DustVamp"))}</p>`,
      flags: { [SYSTEM_ID]: { ...flags, attrMod: { appearance: -1 }, mode: "timed", until: api.nextSunrise(api.nextSunrise(api.getClock()) + MS_H) } } }]);
    return notice(target, x.powerName, t("DustVamp"));
  }
  // Обезвоживание: каждый лишний успех — вампир теряет кровь, потом тяжёлые; смертный — тяжёлые без поглощения
  if (tp.kind === "dehydrate") {
    if (r.net <= 0) return notice(target, x.powerName, t("Resisted"));
    let left = r.net;
    if (target.hasBlood) {
      const b = Math.min(left, target.system.blood?.value ?? 0);
      if (b) await target.update({ "system.blood.value": target.system.blood.value - b });
      left -= b;
    }
    if (left) await target.applyDamage(left, "lethal");
    return notice(target, x.powerName, t("DehydrateDone", { n: r.net }));
  }
  if (r.net <= 0) return notice(target, x.powerName, t("Resisted"));
  const fx = { ...(tp.fx ?? {}) }, f = { ...flags, mind: x.key, ...(tp.mars ? { mars: true } : {}) };
  let name = x.powerName, desc = tp.fx?.note ? t(`PathNote.${tp.fx.note}`) : "";
  // Атрофия: таблица успехов сопротивления
  if (tp.resist?.mode === "atrophy") {
    if (r.res >= 3) return notice(target, x.powerName, t("Resisted"));
    desc = t(r.res === 2 ? "Atrophy2" : r.res === 1 ? "Atrophy1" : "Atrophy0");
  }
  if (tp.resist?.mode === "shorten" && r.res) desc = `${desc} ${t("Shorten", { n: r.res })}`.trim();
  if (r.note) desc = `${desc} ${r.note}`.trim();
  // что спросить: конечность (Судорога), Атрибут (Порча тела), распределение (Сила стихий)
  if (tp.ask === "limb") {
    const limb = await ask(x.powerName, [["leg", t("LimbLeg")], ["arm", t("LimbArm")], ["head", t("LimbHead")]]);
    if (!limb) return;
    if (limb === "leg") fx.diffDex = 2;
    if (limb === "head") fx.diffSocial = 2;
    desc = t(`Limb.${limb}`);
  }
  if (tp.ask === "attr") {
    const k = await ask(x.powerName, ["strength", "dexterity", "stamina", "appearance"].map(k => [k, game.i18n.localize(`VTM20.Attr.${k}`)]));
    if (!k) return;
    fx.attrSet = { [k]: 1 };
    desc = t("CorruptDesc", { what: game.i18n.localize(`VTM20.Attr.${k}`) });
  }
  if (tp.ask === "split") {
    const pts = await splitPoints(x.powerName, 3);
    if (!pts) return;
    fx.attr = pts;
    desc = t("SplitDesc", { s: pts.strength, d: pts.dexterity, st: pts.stamina, n: n });
  }
  if (fx.maladySucc) { const k = Math.min(3, n); fx.attr = { strength: -k, dexterity: -k, stamina: -k }; }
  if (fx.bloodToWater) {
    const k = Math.min(n, target.system.blood?.value ?? 0);
    if (k) await target.update({ "system.blood.value": target.system.blood.value - k });
    if (!target.hasBlood || !target.isVampire) return notice(target, x.powerName, t("WaterMortal"));
    fx.diceAll = Number(VTM20.healthLevels?.[k - 1]?.penalty ?? -Math.min(k, 5));
    desc = t("WaterVamp", { n: k });
  }
  if (fx.sleep) {
    if (n < 3) { Object.assign(f, { dread: n, mode: "scene" }); name = t("SleepyName", { n }); desc = t("SleepyDesc", { n }); }
    else { desc = t("SleepDesc"); }
  }
  // флаги эффекта
  for (const k of ["diceAll", "diceSocial", "diffPhys", "diffAll", "diffSocial", "diffDex", "centered", "windDance", "brawlAgg", "strikeTrue", "clarity"]) if (fx[k] != null) f[k] = fx[k];
  if (fx.attr) f.attrMod = fx.attr;
  if (fx.attrSet) f.attrSet = fx.attrSet;
  if (fx.dot) f.dot = fx.dot;
  // срок
  const code = Array.isArray(tp.dur) ? tp.dur[Math.min(r.net, tp.dur.length) - 1] : tp.dur;
  const now = api.getClock(), nights = k => { let u = now; for (let i = 0; i < k; i++) u = api.nextSunrise(u + MS_H); return u; };
  const until = code === "succNights" ? nights(r.net) : code === "casterWPNights" ? nights(caster?.system.willpower?.permanent ?? 1)
    : code === "succHours" ? now + r.net * api.MS_HOUR : code === "3nights" ? nights(3) : code === "season" ? now + 90 * api.MS_DAY
    : ["scene", "manual"].includes(code) ? null : untilOf(code, now, api);
  if (!f.mode) f.mode = until ? "timed" : code === "manual" ? "manual" : "scene";
  if (until) f.until = until;
  const durText = until ? t("DurUntil", { at: new Date(until).toLocaleDateString(game.i18n.lang, { day: "numeric", month: "long" }) }) : t(`Dur.${code === "manual" ? "forever" : "scene"}`);
  await target.createEmbeddedDocuments("ActiveEffect", [{ name, img: Codex.disciplineIcon(disc), description: `<p>${esc(desc)}</p>`,
    ...(fx.statuses ? { statuses: fx.statuses } : {}), flags: { [SYSTEM_ID]: f } }]);
  // Марионетка: и самому тауматургу +2 к сложности своих действий
  if (tp.casterFx && caster?.isOwner) await caster.createEmbeddedDocuments("ActiveEffect", [{ name: t("CasterBusy", { power: x.powerName }), img: Codex.disciplineIcon(disc),
    flags: { [SYSTEM_ID]: { mind: x.key, mode: "scene", ...tp.casterFx } } }]);
  return notice(target, x.powerName, `${desc ? `${desc} — ` : ""}${durText}`);
}

/** Путь Воплощения: предмет в инвентаре тауматурга; Постоянство — закрепить уже созданный. */
export async function conjure(message, state, x, tp, caster) {
  if (tp.conjure === "fix") {
    const list = caster.items.filter(i => i.getFlag(SYSTEM_ID, "conjured") === "scene");
    if (!list.length) return ui.notifications.warn(t("ConjureNone"));
    const id = list.length === 1 ? list[0].id : await ask(x.powerName, list.map(i => [i.id, i.name]));
    const item = caster.items.get(id);
    if (!item) return;
    await done(message, state, x);
    await item.setFlag(SYSTEM_ID, "conjured", "forever");
    return notice(caster, x.powerName, t("ConjureFixed", { name: item.name }));
  }
  const name = await foundry.applications.api.DialogV2.prompt({ window: { title: x.powerName, icon: "fa-solid fa-wand-magic-sparkles" }, classes: ["vtm20", "r-dialog"], rejectClose: false,
    content: `<div class="r-form"><label class="r-field"><span>${esc(t("ConjureWhat"))}</span><input type="text" name="n" autofocus placeholder="${esc(t("ConjureHint"))}"></label></div>`,
    ok: { label: t("ConjureApply"), callback: (e, b) => b.form.elements.n.value.trim() } });
  if (!name) return;
  await done(message, state, x);
  await caster.createEmbeddedDocuments("Item", [{ name, type: "gear", flags: { [SYSTEM_ID]: { conjured: tp.conjure } } }]);
  return notice(caster, x.powerName, t(tp.conjure === "scene" ? "ConjureScene" : "ConjureForever", { name }));
}

/** Обжигающее касание: без броска — кровь (не меньше 1), каждая — −2 куба ко всем пулам цели, пока держится касание. */
export async function burningTouch(actor, p, target) {
  const max = Math.min(actor.system.blood?.value ?? 0, Math.max(1, (actor.system.blood?.perTurn ?? 1) - (actor.bloodSpentThisTurn ?? 0)));
  if (max < 1) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NoBlood", { name: actor.name }));
  const n = Number(await ask(p.name, Array.from({ length: max }, (_, i) => [String(i + 1), t("BurnPick", { n: i + 1, d: 2 * (i + 1) })])));
  if (!n || !(await actor.spendBlood(n, { reason: p.name }))) return null;
  if (!target.isOwner) return notice(target, p.name, t("BurnDesc", { d: 2 * n }));
  await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("BurnName", { d: 2 * n }), img: Codex.disciplineIcon("valeren"),
    description: `<p>${esc(t("BurnDesc", { d: 2 * n }))}</p>`, flags: { [SYSTEM_ID]: { mind: "valeren|Burning Touch", by: actor.uuid, mode: "manual", diceAll: -2 * n } } }]);
  return notice(target, p.name, t("BurnDesc", { d: 2 * n }));
}

/** Фантасмагория 1–4: иллюзия на листе вампира (Морок, Фата‑моргана) или шаг к выбранной иллюзии (Анимация, Постоянство). */
export async function illusion(actor, p, tp) {
  const mine = actor.effects.filter(e => e.flags?.[SYSTEM_ID]?.illusion);
  if (tp.step) {
    const can = mine.filter(e => !e.flags[SYSTEM_ID][tp.step]);
    if (!can.length) return ui.notifications.warn(t("IllNone"));
    const id = await ask(p.name, can.map(e => [e.id, e.name]));
    if (!id) return null;
    if (!(await actor.spendBlood(1, { reason: p.name }))) return null;
    const e = actor.effects.get(id);
    await e.update({ name: `${e.name} · ${t(tp.step === "animate" ? "IllAnimated" : "IllPermanent")}`, [`flags.${SYSTEM_ID}.${tp.step}`]: true,
      description: `${e.description ?? ""}<p>${esc(t(tp.step === "animate" ? "IllAnimateDesc" : "IllPermDesc"))}</p>` });
    return notice(actor, p.name, t(tp.step === "animate" ? "IllAnimateDesc" : "IllPermDesc"));
  }
  const what = await foundry.applications.api.DialogV2.prompt({ window: { title: p.name, icon: "fa-solid fa-wand-magic-sparkles" }, classes: ["vtm20", "r-dialog"], rejectClose: false,
    content: `<div class="r-form"><label class="r-field"><span>${esc(t("IllWhat"))}</span><input type="text" name="w" autofocus placeholder="${esc(t(tp.all ? "IllHintAll" : "IllHintOne"))}"></label></div>`,
    ok: { label: t("IllGo"), callback: (e, b) => b.form.elements.w.value.trim() } });
  if (!what) return null;
  // цена: Воля и кровь — сначала проверить, что хватит того и другого
  if ((actor.system.willpower?.temporary ?? 0) < (tp.will ?? 0)) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NoWillpower", { name: actor.name }));
  if (tp.blood && (actor.system.blood?.value ?? 0) < tp.blood) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NoBlood", { name: actor.name }));
  if (tp.will && !(await actor.spendWillpower(tp.will))) return null;
  if (tp.blood && !(await actor.spendBlood(tp.blood, { reason: p.name }))) return null;
  const vol = 0.5 * (actor.discipline?.("chimerstry") ?? 1);
  const desc = t(tp.all ? "IllAllDesc" : "IllOneDesc", { v: vol });
  await actor.createEmbeddedDocuments("ActiveEffect", [{ name: t("IllName", { what }), img: Codex.disciplineIcon("chimerstry"),
    description: `<p>${esc(desc)}</p>`, flags: { [SYSTEM_ID]: { illusion: true, mode: "manual", by: actor.uuid } } }]);
  return notice(actor, p.name, `${what}: ${desc}`);
}

/** Распределить точки по Физическим Атрибутам (Сила стихий: 3 временные точки). */
async function splitPoints(title, total) {
  const res = await foundry.applications.api.DialogV2.prompt({ window: { title }, classes: ["vtm20", "r-dialog"], rejectClose: false,
    content: `<div class="r-form"><p>${esc(t("SplitAsk", { n: total }))}</p>${["strength", "dexterity", "stamina"].map((k, i) =>
      `<label class="r-field"><span>${esc(game.i18n.localize(`VTM20.Attr.${k}`))}</span><input type="number" name="${k}" value="${i === 0 ? total : 0}" min="0" max="${total}"></label>`).join("")}</div>`,
    ok: { label: t("SelfApply"), callback: (e, b) => Object.fromEntries(["strength", "dexterity", "stamina"].map(k => [k, Math.max(0, Number(b.form.elements[k].value) || 0)])) } });
  if (!res) return null;
  if (Object.values(res).reduce((s, v) => s + v, 0) !== total) { ui.notifications.warn(t("SplitBad", { n: total })); return null; }
  return res;
}

/** Существа путей: Танец лозы, Лесные великаны, Элементаль — статистами у жетона тауматурга. */
export async function summonPathCreature(caster, what, n) {
  const s = caster.system, wp = s.willpower?.permanent ?? 1, th = caster.discipline("thaumaturgy"), brawl = s.abilities?.brawl?.value ?? 0;
  const spec = {
    vines: { name: t("VinesName"), attrs: { strength: Math.floor(wp / 2), dexterity: Math.floor(wp / 2), stamina: Math.floor(wp / 2) }, brawl: Math.max(0, brawl - 1), note: t("VinesDone", { n }) },
    giant: { name: t("GiantName"), attrs: { strength: th, dexterity: 2, stamina: th }, brawl, note: t("GiantDone", { n }) },
    elemental: { name: t("ElementalName"), attrs: Object.fromEntries(["strength", "dexterity", "stamina", "perception", "intelligence", "wits"].map(k => [k, 3])), brawl: 3, note: t("ElementalDone", { n: Math.max(0, n - 1) }) }
  }[what];
  const a = await Actor.create({ name: `${spec.name} (${caster.name})`, type: "creature", img: `systems/${SYSTEM_ID}/assets/icons/creature.svg`,
    flags: { [SYSTEM_ID]: { summoned: caster.uuid } },
    system: { kind: spec.name, supernatural: true, blood: { max: 0, value: 0 },
      attributes: Object.fromEntries(Object.entries(spec.attrs).map(([k, v]) => [k, { value: Math.clamp(v, 0, 10) }])), abilities: { brawl: { value: spec.brawl } } } });
  const tok = caster.getActiveTokens?.()[0];
  if (tok && canvas?.scene) await canvas.scene.createEmbeddedDocuments("Token", [await a.getTokenDocument({ x: tok.document.x + canvas.grid.size, y: tok.document.y - canvas.grid.size })]);
  return notice(caster, spec.name, spec.note);
}

/** Чтение ауры: по успехам — яркость, цвет, узоры (природа существа), смена эмоций, следы (правило системы). */
export function auraLines(target, n) {
  const out = [t("Aura1")];
  if (n >= 2) out.push(t(target.statuses?.has("r-frenzy") ? "Aura2Frenzy" : "Aura2"));
  if (n >= 3) {
    const k = target.isVampire ? "vampire" : target.type === "ghoul" ? "ghoul" : target.type === "werewolf" ? "werewolf" : target.type === "demon" ? "demon"
      : target.isSpirit ? "spirit" : target.type === "creature" ? ( target.system.supernatural ? "creature" : "animal") : "mortal";
    out.push(t(`AuraKind.${k}`));
  }
  if (n >= 4) out.push(t("Aura4"));
  if (n >= 5) {
    const list = target.getFlag(SYSTEM_ID, "diablerie") ?? [];
    out.push(t(list.length ? "AuraDiab" : "AuraClean"));
  }
  return out;
}

/** Зов: рассказчик выбирает зверя из справочника и сколько их услышало; приходит доля по успехам. */
export async function beckon(message, state, x, vampire, n) {
  const { animalTemplates, spawnFromTemplate } = await import("../npc-gen.mjs");
  const list = await animalTemplates();
  const res = await foundry.applications.api.DialogV2.prompt({ window: { title: x.powerName, icon: "fa-solid fa-paw" }, classes: ["vtm20", "r-dialog"], rejectClose: false,
    content: `<div class="r-form"><label class="r-field"><span>${esc(t("BeckonWho"))}</span><select name="k">${list.map(a => `<option value="${esc(a.key)}">${esc(a.name)}</option>`).join("")}</select></label>
      <label class="r-field"><span>${esc(t("BeckonHeard"))}</span><input type="number" name="heard" value="8" min="1" max="40"></label></div>`,
    ok: { label: t("BeckonGo"), callback: (e, b) => ({ k: b.form.elements.k.value, heard: Number(b.form.elements.heard.value) || 1 }) } });
  if (!res) return;
  const tpl = list.find(a => a.key === res.k);
  const count = n <= 1 ? 1 : n >= 5 ? res.heard : Math.max(1, Math.ceil(res.heard * [0, 0, 0.25, 0.5, 0.75][n]));
  await done(message, state, x);
  const tok = vampire.getActiveTokens?.()[0];
  const made = [];
  for (let i = 0; i < count; i++) made.push(await spawnFromTemplate(tpl, { name: `${tpl.name} ${i + 1}` }));
  if (tok && canvas?.scene) await canvas.scene.createEmbeddedDocuments("Token", await Promise.all(made.filter(Boolean).map((a, i) =>
    a.getTokenDocument({ x: tok.document.x + ((i % 5) - 2) * canvas.grid.size, y: tok.document.y + (2 + Math.floor(i / 5)) * canvas.grid.size }))));
  return notice(vampire, x.powerName, t("BeckonDone", { n: count, name: tpl.name }));
}

/** Вкус крови: чем больше успехов, тем больше сведений (правило системы: кровь → природа → поколение → диаблери). */
export function tasteLines(target, n) {
  const s = target.system, out = [t("TasteBlood", { v: s.blood?.value ?? 0, max: s.blood?.max ?? 0 })];
  const kindKey = target.isVampire ? "vampire" : target.type === "ghoul" ? (target.isDhampir ? "dhampir" : "ghoul") : target.type === "werewolf" ? "werewolf"
    : target.type === "demon" ? "demon" : "mortal";
  if (n >= 2) out.push(t(`TasteKind.${kindKey}`));
  if (n >= 3 && target.isVampire) out.push(t("TasteGen", { g: s.generation }));
  if (n >= 4 && target.isVampire) out.push(t((target.getFlag(SYSTEM_ID, "diablerie") ?? []).length ? "TasteDiab" : "TasteNoDiab"));
  return out;
}

/** Покрывало ночи: облако тьмы (источник тьмы Foundry) у жетона вампира. */
export async function placeShroud(actor, n) {
  const tok = actor.getActiveTokens?.()[0];
  if (!tok || !canvas?.scene) return ui.notifications.warn(t("NoToken", { name: actor.name }));
  const meters = 1.5 * 2 ** Math.max(0, n - 1);                         // радиус: 3 м в диаметре, ×2 за лишний успех
  const feet = /ft|фут/i.test(canvas.scene.grid.units ?? "");
  const radius = Math.round((feet ? meters * 3.28 : meters) * 10) / 10;
  await canvas.scene.createEmbeddedDocuments("AmbientLight", [{ x: tok.center.x, y: tok.center.y,
    config: { negative: true, bright: radius, dim: radius }, flags: { [SYSTEM_ID]: { abyss: actor.uuid } } }]);
  return notice(actor, t("ShroudTitle"), t("ShroudDone", { d: meters * 2 }));
}

/** Руки Бездны: щупальце за успех — статист рядом с вампиром. */
export async function summonArms(actor, n) {
  const tok = actor.getActiveTokens?.()[0];
  const ob = actor.discipline("obtenebration"), pot = actor.discipline("potence"), cel = actor.discipline("celerity");
  const s = actor.system, sta = (s.attributes.stamina.total ?? 1) + actor.discipline("fortitude");
  const made = [];
  for (let i = 0; i < n; i++) {
    const a = await Actor.create({ name: t("ArmName", { i: i + 1, name: actor.name }), type: "creature", img: `systems/${SYSTEM_ID}/assets/icons/creature.svg`,
      flags: { [SYSTEM_ID]: { abyssArm: actor.uuid } },
      system: { kind: t("ArmKind"), supernatural: true, blood: { max: 0, value: 0 },
        attributes: { strength: { value: Math.min(10, ob + pot) }, dexterity: { value: Math.min(10, ob + cel) }, stamina: { value: Math.min(10, sta) } },
        abilities: { brawl: { value: s.abilities?.brawl?.value ?? 0 } } } });
    await a.createEmbeddedDocuments("Item", [{ name: t("ArmGrip"), type: "weapon", system: { kind: "brawl", damage: 1, strength: true, damageType: "lethal", difficulty: 6, equipped: true } }]);
    made.push(a);
  }
  if (tok && canvas?.scene) await canvas.scene.createEmbeddedDocuments("Token", await Promise.all(made.map((a, i) =>
    a.getTokenDocument({ x: tok.document.x + (i + 1) * canvas.grid.size, y: tok.document.y + canvas.grid.size }))));
  return notice(actor, t("ArmsTitle"), t("ArmsDone", { n, s: Math.min(10, ob + pot), d: Math.min(10, ob + cel) }));
}

/** Тайное собрание: действующее Сокрытие — на отмеченных спутников (по одному за точку Скрытности). */
export async function cloakGathering(actor, p) {
  const own = actor.powerEffects.find(e => /^obfuscate:[123]$/.test(e.power));
  if (!own) return ui.notifications.warn(t("GatherNoCloak"));
  const max = actor.system.abilities?.stealth?.value ?? 0;
  const allies = [...(game.user.targets ?? [])].map(tk => tk.actor).filter(x => x && x !== actor);
  if (!allies.length) return ui.notifications.warn(t("GatherMark"));
  const taken = allies.slice(0, max), skipped = allies.length - taken.length;
  for (const ally of taken) {
    if (!ally.isOwner) { ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: ally.name })); continue; }
    await ally.createEmbeddedDocuments("ActiveEffect", [{ name: t("GatherName", { power: own.effect.name, name: actor.name }), img: Codex.disciplineIcon("obfuscate"),
      description: `<p>${esc(t("GatherDesc"))}</p>`, flags: { [SYSTEM_ID]: { mind: "obfuscate|Cloak the Gathering", by: actor.uuid, mode: "scene" } } }]);
  }
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice"><i class="fa-solid fa-user-secret"></i> <b>${esc(p.name)}</b>: ${esc(t("GatherDone",
    { names: taken.map(a => a.name).join(", "), power: own.effect.name }))}${skipped ? ` ${esc(t("GatherSkipped", { n: skipped, max }))}` : ""}</div>` });
}

/** Конец сцены (рассказчик): тьма Покрывала ночи и щупальца Рук Бездны исчезают. */
export async function endSceneAbyss() {
  if (!game.user.isGM) return;
  for (const s of game.scenes) {
    const lights = s.lights.filter(l => l.getFlag(SYSTEM_ID, "abyss")).map(l => l.id);
    if (lights.length) await s.deleteEmbeddedDocuments("AmbientLight", lights);
  }
  await dismissArms(game.actors.filter(a => a.getFlag(SYSTEM_ID, "abyssArm") || a.getFlag(SYSTEM_ID, "summoned")));
}

export async function dismissArms(arms) {
  for (const a of arms) {
    for (const s of game.scenes) { const ids = s.tokens.filter(tk => tk.actorId === a.id).map(tk => tk.id); if (ids.length) await s.deleteEmbeddedDocuments("Token", ids); }
    await a.delete();
  }
}

/** Вселение: проверка доступа к Дисциплинам через тело носителя. */
export async function possessAccess(message) {
  const p = message.getFlag(SYSTEM_ID, "possessRoll");
  const self = p && await foundry.utils.fromUuid(p.actorUuid);
  if (!self?.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: self?.name ?? "" }));
  const { RollDialog } = await import("../../dice/dialog.mjs");
  return RollDialog.prompt(self, { title: t("PossessAccessRoll"), subtitle: p.hostName, trait1: "attributes.manipulation", trait2: "abilities.intimidation", difficulty: 7,
    onRolled: async res => {
      const tier = Math.min(5, res?.successes ?? 0);
      const fx = self.effects.find(e => e.flags?.[SYSTEM_ID]?.mind === "dominate|Possession" && e.flags[SYSTEM_ID].host);
      if (fx) await fx.update({ [`flags.${SYSTEM_ID}.subsume`]: tier, description: `<p>${esc(t("SubsumeDesc", { list: SUBSUME[tier].map(k => Codex.disciplineLabel(k)).join(", ") || t("SubsumeNone") }))}</p>` });
      notice(self, t("PossessAccessRoll"), SUBSUME[tier].map(k => Codex.disciplineLabel(k)).join(", ") || t("SubsumeNone"));
    } });
}

/** Волшебная загадка: ежечасная проверка решения — Смекалка + Оккультизм (сл. 8, ± расстройства — в окне броска). */
export async function riddleRoll(message) {
  const x = message.getFlag(SYSTEM_ID, "riddleRoll");
  const victim = x && await foundry.utils.fromUuid(x.target);
  if (!victim) return ui.notifications.warn(t("Gone"));
  if (!victim.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: victim.name }));
  const fx = victim.effects.find(e => e.flags?.[SYSTEM_ID]?.riddle);
  if (!fx) return ui.notifications.info(t("RiddleGone"));
  const { RollDialog } = await import("../../dice/dialog.mjs");
  return RollDialog.prompt(victim, { title: t("RiddleRoll"), subtitle: fx.name, trait1: "attributes.wits", trait2: "abilities.occult", difficulty: 8,
    diffNote: t("RiddleRollNote"),
    onRolled: async res => {
      const cur = victim.effects.get(fx.id); if (!cur) return;
      const r = cur.flags[SYSTEM_ID].riddle;
      if (res?.outcome === "botch") {
        await victim.applyDamage(1, "lethal");
        await cur.update({ [`flags.${SYSTEM_ID}.riddle.got`]: 0 });
        return notice(victim, t("RiddleRoll"), t("RiddleBotch"));
      }
      const got = r.got + (res?.successes ?? 0);
      if (got >= r.need) { await cur.delete(); return notice(victim, t("RiddleRoll"), t("RiddleSolved")); }
      await cur.update({ [`flags.${SYSTEM_ID}.riddle.got`]: got });
      return notice(victim, t("RiddleRoll"), t("RiddleProgress", { got, need: r.need }));
    } });
}
