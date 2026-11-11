// module/apps/target-powers/apply.mjs
// Силы по цели — применение исхода к цели: эффекты по виду силы, сроки, кнопка «применить» на карточке.

import { SYSTEM_ID } from "../../config.mjs";
import { Codex } from "../../data/codex.mjs";
import { bloodApply, BLOOD_APPLY } from "../bloodlines.mjs";
import { clockApi, t, esc, TARGET_POWERS, SUBSUME, sameActor, supernatural, untilOf, tierText, done, notice, selfCheck, ask } from "./core.mjs";
import { applyPath, conjure, summonPathCreature, beckon, placeShroud, summonArms } from "./effects.mjs";

/** Кнопка на карточке: эффект силы на цели (владелец цели или рассказчик). */
export async function applyTargetPower(message, state, ev) {
  const x = state.extra?.targetPower, tp = x && TARGET_POWERS[x.key];
  if (!tp || x.done) return;
  const target = await foundry.utils.fromUuid(x.target);
  if (!target) return ui.notifications.warn(t("Gone"));
  if (tp.kind === "summon") {
    if (!game.user.isGM) return ui.notifications.warn(t("GMOnly"));
    await done(message, state, x);
    return summonPathCreature(target, tp.summon, ev.successes);
  }
  if (["shroud", "arms", "beckon"].includes(tp.kind) && tp.kind === "beckon") {
    if (!game.user.isGM) return ui.notifications.warn(t("GMOnly"));
    return beckon(message, state, x, target, ev.successes);
  }
  if (["shroud", "arms"].includes(tp.kind)) {
    if (!game.user.isGM) return ui.notifications.warn(t("GMOnly"));
    await done(message, state, x);
    return tp.kind === "shroud" ? placeShroud(target, ev.successes) : summonArms(target, ev.successes);
  }
  if (!target.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: target.name }));
  const api = await clockApi(), n = ev.successes, now = api.getClock();
  const [disc] = x.key.split("|");
  const flags = { mind: x.key, by: state.actorUuid ?? "", start: now };
  let name = `${x.powerName} · ${x.actorName}`, desc = "";
  if (BLOOD_APPLY.has(tp.kind)) return bloodApply({ message, state, x, tp, target, n, flags, now, api });
  if (tp.kind === "beast") {
    // Отчуждение Зверя: бешенство вампира переходит на цель (V20, Анимализм 5)
    const self = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
    if (self && !self.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: self.name }));
    if (self?.statuses?.has("r-frenzy")) await self.toggleStatusEffect("r-frenzy", { active: false });
    if (!target.statuses?.has("r-frenzy")) await target.toggleStatusEffect("r-frenzy", { active: true });
    if (self) await self.createEmbeddedDocuments("ActiveEffect", [{ name: t("BeastOutName", { name: target.name }), img: Codex.disciplineIcon("animalism"),
      description: `<p>${esc(t("BeastOutDesc"))}</p>`, flags: { [SYSTEM_ID]: { ...flags, beastOut: target.uuid, mode: "scene" } } }]);
    desc = t(n >= 3 ? "Beast3" : n === 2 ? "Beast2" : "Beast1");
    await done(message, state, x);
    return notice(target, x.powerName, desc);
  }
  if (tp.kind === "conjure") return conjure(message, state, x, tp, target);
  if (["cond", "self", "dehydrate", "dust", "comrades"].includes(tp.kind)) return applyPath(message, state, x, tp, target, n, flags, api);
  if (tp.kind === "voice") {
    // Голос безумия: по слушателю за успех; смертные поддаются сразу (и не помнят), вампиры — проверка, сложность +2
    const crowd = (await Promise.all((x.crowd ?? []).map(u => foundry.utils.fromUuid(u)))).filter(Boolean).slice(0, n);
    await done(message, state, x);
    const hit = [];
    for (const who of crowd) {
      if (who.isVampire) { selfCheck(who, x.mode, 8, t("VoiceKindred", { name: who.name })); hit.push(`${who.name} (${t("VoiceResist")})`); continue; }
      if (!who.isOwner) { ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: who.name })); continue; }
      if (!who.statuses?.has(`r-${x.mode}`)) await who.toggleStatusEffect(`r-${x.mode}`, { active: true });
      hit.push(who.name);
    }
    return notice(target, x.powerName, hit.length ? t("VoiceDone", { names: hit.join(", ") }) : t("AweNobody", { n }));
  }
  if (tp.kind === "mesmerize" || tp.kind === "forget") {
    // Внушение: одна программа в разуме — новая заменяет старую при большем или равном числе успехов
    const text = await foundry.applications.api.DialogV2.prompt({ window: { title: x.powerName }, classes: ["vtm20", "r-dialog"], rejectClose: false,
      content: `<div class="r-form"><label class="r-field"><span>${esc(t(tp.kind === "mesmerize" ? "MesWhat" : "ForgWhat"))}</span><textarea name="t" rows="3"></textarea></label></div>`,
      ok: { label: t("SelfApply"), callback: (e, b) => b.form.elements.t.value.trim() } });
    if (text == null) return;
    const self = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
    if (tp.kind === "mesmerize") {
      const old = target.effects.find(e => e.flags?.[SYSTEM_ID]?.program);
      if (old && Number(old.flags[SYSTEM_ID].program) > n) { await done(message, state, x); return notice(target, x.powerName, t("MesKept", { n: old.flags[SYSTEM_ID].program })); }
      if (old) await old.delete();
    }
    await done(message, state, x);
    const desc = tp.kind === "mesmerize" ? `${tierText(tp, n)} ${text}`.trim()
      : `${tierText(tp, n)} ${text} ${t("ForgRestore", { d: self?.discipline?.("dominate") ?? "?", w: self?.system.willpower?.permanent ?? "?", n })}`.trim();
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t(tp.kind === "mesmerize" ? "MesName" : "ForgName", { name: x.actorName, n }), img: Codex.disciplineIcon("dominate"),
      description: `<p>${esc(desc)}</p>`, flags: { [SYSTEM_ID]: { ...flags, mode: "manual", ...(tp.kind === "mesmerize" ? { program: n } : { memory: n }) } } }]);
    return notice(target, x.powerName, desc);
  }
  if (tp.kind === "condition") {
    // Порабощение: успехи копятся по сцене; сколько нужно — тайно решает рассказчик (5–10 × Самоконтроль цели)
    if (!game.user.isGM) return ui.notifications.warn(t("GMOnly"));
    const self = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
    const prog = target.getFlag(SYSTEM_ID, "conditioning");
    const mine = prog && sameActor(prog.by, self);
    let need = mine ? prog.need : null;
    if (!need) {
      const sc = target.system.virtues?.selfControl?.value ?? 3;
      const k = await ask(x.powerName, [5, 6, 7, 8, 9, 10].map(m => [String(m), t("CondNeed", { m, n: m * sc })]));
      if (!k) return;
      need = Number(k) * sc;
    }
    const total = (mine ? prog.total : 0) + n;
    await done(message, state, x);
    if (total < need) {
      await target.setFlag(SYSTEM_ID, "conditioning", { by: self?.uuid ?? state.actorUuid, total, need });
      return ChatMessage.create({ whisper: game.users.filter(u => u.isGM).map(u => u.id), content: `<div class="r-notice"><i class="fa-solid fa-link"></i> ${esc(t("CondProgress", { name: target.name, total, need }))}</div>` });
    }
    await target.unsetFlag(SYSTEM_ID, "conditioning");
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("CondName", { name: x.actorName }), img: Codex.disciplineIcon("dominate"),
      description: `<p>${esc(t("CondDesc", { w: target.system.willpower?.permanent ?? 0 }))}</p>`, flags: { [SYSTEM_ID]: { ...flags, conditioned: self?.uuid ?? state.actorUuid, mode: "manual" } } }]);
    return notice(target, x.powerName, t("CondDone"));
  }
  if (tp.kind === "awe") {
    // Благоговение: охват — 1 / 2 / 6 / 20 / все; поддаются те, у кого Воля ниже
    const reach = n >= 5 ? Infinity : [0, 1, 2, 6, 20][n];
    const crowd = (await Promise.all((x.crowd ?? []).map(u => foundry.utils.fromUuid(u)))).filter(Boolean)
      .sort((p1, p2) => (p1.system.willpower?.permanent ?? 0) - (p2.system.willpower?.permanent ?? 0)).slice(0, reach);
    await done(message, state, x);
    const hit = [];
    for (const who of crowd) {
      if (!who.isOwner) { ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: who.name })); continue; }
      await who.createEmbeddedDocuments("ActiveEffect", [{ name: t("AweName", { name: x.actorName }), img: Codex.disciplineIcon("presence"),
        description: `<p>${esc(t("AweDesc", { n }))}</p>`, flags: { [SYSTEM_ID]: { ...flags, awe: n, mode: "scene" } } }]);
      hit.push(who.name);
    }
    return notice(target, x.powerName, hit.length ? t("AweDone", { names: hit.join(", "), n: reach === Infinity ? "∞" : reach }) : t("AweNobody", { n: reach === Infinity ? "∞" : reach }));
  }
  if (tp.kind === "call") {
    // Приглашение: тянется к вампиру до рассвета; как — по успехам
    await done(message, state, x);
    const how = t(`Call${Math.min(5, n)}`);
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("CallName", { name: x.actorName }), img: Codex.disciplineIcon("presence"),
      description: `<p>${esc(how)}</p>`, flags: { [SYSTEM_ID]: { ...flags, mode: "timed", until: api.nextSunrise(now) } } }]);
    return notice(target, x.powerName, how);
  }
  if (tp.kind === "possess") {
    // Вселение: цель бросает текущую Волю (сл. 7); успехи вампира сверх её — минус временная Воля цели
    const { rollPool } = await import("../../dice/roll.mjs");
    const wp = target.system.willpower?.temporary ?? 0;
    const res = wp > 0 ? await rollPool({ actor: target, title: t("PossessResist"), pool: wp, difficulty: 7, kind: "check" }) : { successes: 0 };
    const net = Math.max(0, n - (res?.successes ?? 0)), left = Math.max(0, wp - net);
    await done(message, state, x);
    if (net) await target.update({ "system.willpower.temporary": left });
    if (left > 0) return notice(target, x.powerName, t("PossessStruggle", { n: net, left }));
    const self = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("PossessedName", { name: x.actorName }), img: Codex.disciplineIcon("dominate"),
      description: `<p>${esc(t("PossessedDesc"))}</p>`, flags: { [SYSTEM_ID]: { ...flags, mode: "manual" } } }]);
    if (self?.isOwner) await self.createEmbeddedDocuments("ActiveEffect", [{ name: t("EmptyBody"), img: Codex.disciplineIcon("dominate"),
      description: `<p>${esc(t("EmptyBodyDesc"))}</p>`, flags: { [SYSTEM_ID]: { ...flags, mode: "manual", host: target.uuid } } }]);
    // доступ к Дисциплинам через тело — Манипуляция + Запугивание (сл. 7), по успехам (та же таблица, что у Поглощения духа)
    if (self) ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: self }), flags: { [SYSTEM_ID]: { possessRoll: { actorUuid: self.uuid, host: target.uuid, hostName: target.name } } },
      content: `<div class="r-notice"><i class="fa-solid fa-user-astronaut"></i> ${esc(t("PossessAccess", { name: target.name }))}
        <div class="r-card-buttons"><button type="button" data-r-action="possessRoll"><i class="fa-solid fa-dice-d10"></i> ${esc(t("PossessAccessRoll"))}</button></div></div>` });
    return notice(target, x.powerName, t("PossessDone"));
  }
  if (tp.kind === "project") {
    await done(message, state, x);
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("ProjectName"), img: Codex.disciplineIcon("auspex"),
      description: `<p>${esc(t("ProjectDesc"))}</p>`, flags: { [SYSTEM_ID]: { ...flags, mode: "scene" } } }]);
    return notice(target, x.powerName, t("ProjectDesc"));
  }
  if (tp.kind === "flesh") {
    // Искусство тканей: Привлекательность ±1 за успех; Укрепление — +1 куб к поглощению за успех ценой 1 точки Силы
    await done(message, state, x);
    const ap = target.system.attributes.appearance?.value ?? 0, mode = x.flesh ?? "lower";
    if (mode === "armor") {
      // по книге каждый куб стоит точку Силы; без цены — решение рассказчика (галочка в окне силы)
      const k = x.fleshFree ? n : Math.min(n, (target.system.attributes.strength?.value ?? 1) - 1);
      if (k < 1) return notice(target, x.powerName, t("FleshNoStrength"));
      if (!x.fleshFree) await target.update({ "system.attributes.strength.value": target.system.attributes.strength.value - k });
      await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("FleshArmorName", { n: k }), img: Codex.disciplineIcon("vicissitude"),
        description: `<p>${esc(t("FleshArmorDesc", { n: k }))}</p>`, flags: { [SYSTEM_ID]: { ...flags, soakDice: k, mode: "manual" } } }]);
      return notice(target, x.powerName, t("FleshArmorDesc", { n: k }));
    }
    const next = Math.clamp(ap + (mode === "raise" ? n : -n), 0, 5);
    await target.update({ "system.attributes.appearance.value": next });
    return notice(target, x.powerName, t("FleshLooks", { from: ap, to: next }));
  }
  if (tp.kind === "bone" && x.bone === "botch") {
    // провал шипов (по кнопке): смертный умирает, вампир уходит в торпор
    await done(message, state, x);
    if (target.isVampire) { if (!target.statuses?.has("r-torpor")) await target.toggleStatusEffect("r-torpor", { active: true }); }
    else await target.applyDamage(8, "lethal");
    return notice(target, x.powerName, t("BoneSpikesBotch"));
  }
  if (tp.kind === "bone" && x.bone === "custom") {
    // своя работа — отдельный эффект (работ сколько угодно): цена ранами, правки характеристик, прочность, шипы; оружие — предмет при эффекте
    await done(message, state, x);
    const { normBone, boneSummary } = await import("../bone-work.mjs");
    const c = normBone(x.custom), wounds = Math.max(0, c.cost.wounds - (c.cost.minus ? n : 0));
    if (wounds) await target.applyDamage(wounds, c.cost.type);
    // прочность ценой Силы (как Укрепление в Искусстве тканей): точка Силы за куб, не ниже 1
    let soak = c.soak;
    if (soak && c.soakStr) {
      const str = target.system.attributes.strength?.value ?? 1;
      soak = Math.min(soak, str - 1);
      if (soak > 0) await target.update({ "system.attributes.strength.value": str - soak });
    }
    const lines = [c.note, ...boneSummary({ ...c, cost: { ...c.cost, wounds }, soak, diff: c.diff }).slice(1)].filter(Boolean);
    const [eff] = await target.createEmbeddedDocuments("ActiveEffect", [{ name: `${x.powerName} · ${c.name}`, img: Codex.disciplineIcon("vicissitude"),
      description: lines.map(l => `<p>${esc(l)}</p>`).join(""),
      flags: { [SYSTEM_ID]: { ...flags, mode: "manual", boneWork: c.name, ...(Object.keys(c.attr).length ? { attrMod: c.attr } : {}),
        ...(soak > 0 ? { soakDice: soak } : {}), ...(c.spikes ? { spikes: true } : {}), ...(c.grapple ? { grappleDice: c.grapple } : {}) } } }]);
    if (c.weapon && eff) await target.createEmbeddedDocuments("Item", [{ name: c.name, type: "weapon", img: `systems/${SYSTEM_ID}/assets/icons/weapon.svg`,
      system: { ...c.weapon, equipped: true }, flags: { [SYSTEM_ID]: { boneWork: eff.id } } }]);
    return notice(target, x.powerName, `${c.name}: ${lines.join(" · ")}`);
  }
  if (tp.kind === "bone") {
    // Когти — цена 1 тяжёлое; шипы — 5 тяжёлых минус 1 за каждый успех. Прежние когти или шипы уходят.
    await done(message, state, x);
    const old = target.powerEffects.find(e => e.power === "vicissitude:3");
    if (old) await target.endPower(old.effect, { quiet: true });
    const cost = x.bone === "claws" ? 1 : Math.max(0, 5 - n);
    if (cost) await target.applyDamage(cost, "lethal");
    await target.startPower("vicissitude:3", { variant: x.bone, blood: 0 });
    return notice(target, x.powerName, t(x.bone === "claws" ? "BoneClawsDone" : "BoneSpikesDone", { n: cost }));
  }
  if (tp.kind === "anest") {
    // боль: столько ходов без штрафов за раны, сколько успехов; против воли и сон — цель сопротивляется Волей (сл. 8)
    await done(message, state, x);
    let net = n;
    if (x.anest !== "pain") {
      const { rollPool } = await import("../../dice/roll.mjs");
      const res = await rollPool({ actor: target, title: t("AnestResist"), pool: target.system.willpower?.permanent ?? 0, difficulty: 8, kind: "check", noBotch: true });
      net = n - (res?.successes ?? 0);
      if (net <= 0) return notice(target, x.powerName, t("AnestResisted"));
    }
    if (x.anest === "sleep") {
      await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("SleepName"), img: Codex.disciplineIcon(disc), statuses: ["r-held"],
        description: `<p>${esc(t("SleepDesc"))}</p>`, flags: { [SYSTEM_ID]: { ...flags, mode: "timed", until: now + 8 * api.MS_HOUR } } }]);
      return notice(target, x.powerName, t("SleepDesc"));
    }
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("PainName", { n: net }), img: Codex.disciplineIcon(disc),
      description: `<p>${esc(t("PainDesc"))}</p>`, flags: { [SYSTEM_ID]: { ...flags, mode: "scene", painless: net } } }]);
    return notice(target, x.powerName, t("PainName", { n: net }));
  }
  if (tp.kind === "void") {
    // Сородич сопротивляется Смелостью (сл. — Воля баали): больше успехов — не действует
    const self = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
    await done(message, state, x);
    if (target.isVampire) {
      const { rollPool } = await import("../../dice/roll.mjs");
      const res = await rollPool({ actor: target, title: t("VoidResist"), pool: target.system.virtues?.courage?.value ?? 0,
        difficulty: Math.clamp(self?.system.willpower?.temporary ?? 6, 2, 10), kind: "check", noBotch: true });
      if ((res?.successes ?? 0) > n) return notice(target, x.powerName, t("VoidResisted"));
    }
    const tier = Math.min(3, n);
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t(`VoidName.${tier}`), img: Codex.disciplineIcon("daimoinon"),
      ...(tier >= 2 ? { statuses: [tier === 2 ? "r-rotschreck" : "r-held"] } : {}), description: `<p>${esc(t(`VoidDesc.${tier}`))}</p>`,
      flags: { [SYSTEM_ID]: { ...flags, mode: "scene" } } }]);
    return notice(target, x.powerName, t(`VoidDesc.${tier}`));
  }
  if (tp.kind === "conflag") {
    // чёрное пламя: губительные по крови, как огонь (Ротшрек — как от огня того же размера); цель может уклониться
    await done(message, state, x);
    const self = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
    const { postFixedDamage } = await import("../../data/combat-powers.mjs");
    return postFixedDamage(self, target, { amount: x.conflag ?? 1, type: "aggravated", soakDiff: 6, fire: true, title: x.powerName });
  }
  if (tp.kind === "psychomachia") {
    // жертва: низшая Добродетель, сл. 6; неудача — кошмарный противник, провал — поддаётся страху
    const v = target.system.virtues ?? {};
    const low = Object.entries(v).filter(([, x]) => Number.isFinite(x?.value)).sort((a, b) => a[1].value - b[1].value)[0];
    const { rollPool } = await import("../../dice/roll.mjs");
    const res = await rollPool({ actor: target, title: t("PsychoVirtue", { v: low ? game.i18n.localize(`VTM20.Virtue.${low[0]}`) : "—" }), pool: low?.[1].value ?? 1, difficulty: 6, kind: "check" });
    await done(message, state, x);
    const out = res?.outcome === "botch" ? "botch" : (res?.successes ?? 0) > 0 ? "ok" : "fail";
    if (out === "ok") return notice(target, x.powerName, t("PsychoOk"));
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("PsychoFoe"), img: Codex.disciplineIcon("daimoinon"),
      description: `<p>${esc(t(out === "botch" ? "PsychoBotch" : "PsychoFail"))}</p>`, flags: { [SYSTEM_ID]: { ...flags, mode: "scene" } } }]);
    return notice(target, x.powerName, t(out === "botch" ? "PsychoBotch" : "PsychoFail"));
  }
  if (tp.kind === "condemn") {
    // успехи — тяжесть (1–5) и срок (0 — ночь … 5 — навсегда)
    const sev = Number(await ask(x.powerName, Array.from({ length: Math.min(5, n) }, (_, i) => [String(i + 1),
      t("CondemnSplit", { s: t(`CondemnSev.${i + 1}`), d: t(`CondemnDur.${Math.min(5, n - i - 1)}`) })])));
    if (!sev) return;
    const dur = Math.min(5, n - sev), code = ["night", "week", "month", "year", "10years", "forever"][dur];
    const until = code === "forever" ? null : untilOf(code, now, api);
    await done(message, state, x);
    const extra = sev === 1 ? { diffTraits: [["abilities.subterfuge", 3]] } : sev === 2 ? { diffTraits: [["attributes.strength", 2]] } : sev === 5 ? { curseBotch: true } : {};
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("CondemnName", { s: t(`CondemnSev.${sev}`) }), img: Codex.disciplineIcon("daimoinon"),
      description: `<p>${esc(t(`CondemnDesc.${sev}`))} ${esc(t(`CondemnDur.${dur}`))}</p>`,
      flags: { [SYSTEM_ID]: { ...flags, ...extra, mode: until ? "timed" : "manual", ...(until ? { until } : {}) } } }]);
    return notice(target, x.powerName, `${t(`CondemnDesc.${sev}`)} ${t(`CondemnDur.${dur}`)}`);
  }
  if (tp.kind === "paradox") {
    // Парадокс: слушатели оцепеневают до конца сцены (атака — снимает); навсегда +1 к сложности вредить этому вампиру
    await done(message, state, x);
    for (const uuid of x.crowd ?? [x.target]) {
      const who = await foundry.utils.fromUuid(uuid);
      if (!who?.isOwner) continue;
      await who.createEmbeddedDocuments("ActiveEffect", [
        { name: t("ParadoxName", { name: x.actorName }), img: Codex.disciplineIcon("bardo"), statuses: ["r-held"], description: `<p>${esc(t("ParadoxDesc"))}</p>`,
          flags: { [SYSTEM_ID]: { ...flags, mode: "scene" } } },
        { name: t("ParadoxMark", { name: x.actorName }), img: Codex.disciplineIcon("bardo"), description: `<p>${esc(t("ParadoxMarkDesc", { name: x.actorName }))}</p>`,
          flags: { [SYSTEM_ID]: { mode: "manual", harmDiff: { by: state.actorUuid ?? "", n: 1 } } } }]);
    }
    return notice(target, x.powerName, t("ParadoxDone", { names: x.targetName }));
  }
  if (tp.kind === "riddle") {
    // Волшебная загадка: жертва замирает; нужно втрое больше успехов, чем у киасида; решает кнопкой на карточке
    await done(message, state, x);
    const need = 3 * n;
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("RiddleName", { name: x.actorName }), img: Codex.disciplineIcon("mytherceria"),
      description: `<p>${esc(t("RiddleDesc", { need }))}</p>`, statuses: ["r-held"], flags: { [SYSTEM_ID]: { ...flags, mode: "manual", riddle: { need, got: 0 } } } }]);
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: target }), flags: { [SYSTEM_ID]: { riddleRoll: { target: target.uuid } } },
      content: `<div class="r-notice"><i class="fa-solid fa-puzzle-piece"></i> <b>${esc(x.powerName)}</b> → ${esc(target.name)}: ${esc(t("RiddleDesc", { need }))}
        <div class="r-card-buttons"><button type="button" data-r-action="riddleRoll"><i class="fa-solid fa-dice-d10"></i> ${esc(t("RiddleRoll"))}</button></div></div>` });
  }
  if (tp.kind === "nightmare") {
    // Кошмар наяву: урон по разуму — без поглощения; не убивает (смертный теряет сознание, вампир — торпор)
    await done(message, state, x);
    const cap = x.night?.startsWith("cap") ? Number(x.night.slice(3)) : Infinity;
    const type = x.night === "bashing" ? "bashing" : "lethal";
    const h = target._source.system.health ?? {}, room = Math.max(0, 7 - (h.bashing ?? 0) - (h.lethal ?? 0) - (h.aggravated ?? 0));
    const amount = Math.min(n, cap, room);
    if (amount) await target.applyDamage(amount, type);
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("NightName", { n: amount }), img: Codex.disciplineIcon("chimerstry"),
      description: `<p>${esc(t("NightDesc", { n: amount }))}</p>`, flags: { [SYSTEM_ID]: { ...flags, mode: "timed", until: now + api.MS_DAY, nightmare: amount, nightType: type } } }]);
    if (room <= amount && target.isVampire && !target.statuses?.has("r-torpor")) await target.toggleStatusEffect("r-torpor", { active: true });
    return notice(target, x.powerName, t(room <= amount ? (target.isVampire ? "NightTorpor" : "NightFaint") : "NightDone", { n: amount }));
  }
  if (tp.kind === "dagon") {
    // сопротивление цели: Выносливость, сложность — текущая Воля ассамита; лишние успехи — тяжёлые изнутри (броня не помогает)
    const self = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
    const sw = self?.system.willpower?.temporary ?? self?.system.willpower?.permanent ?? 6;
    const { rollPool } = await import("../../dice/roll.mjs");
    const pool = target.system.attributes?.stamina?.total ?? 0;
    const res = pool > 0 ? await rollPool({ actor: target, title: t("DagonResist"), pool, difficulty: Math.clamp(sw, 2, 10), kind: "check", noBotch: true }) : { successes: 0 };
    const net = n - (res?.successes ?? 0);
    await done(message, state, x);
    if (net <= 0) return notice(target, x.powerName, t("DagonResisted"));
    const { postFixedDamage } = await import("../../data/combat-powers.mjs");
    return postFixedDamage(self, target, { amount: net, type: "lethal", soakDiff: 6, title: x.powerName, internal: true });
  }
  if (tp.kind === "subsume") {
    // Поглощение духа: тело вампира пустует, в звере — его дух; Дисциплины — по успехам
    const self = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
    if (!self?.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: self?.name ?? "" }));
    await done(message, state, x);
    const tier = Math.min(5, n), list = SUBSUME[tier].map(k => Codex.disciplineLabel(k)).join(", ") || t("SubsumeNone");
    await self.createEmbeddedDocuments("ActiveEffect", [{ name: t("SubsumeName", { name: target.name }), img: Codex.disciplineIcon("animalism"),
      description: `<p>${esc(t("SubsumeDesc", { list }))}</p>`, flags: { [SYSTEM_ID]: { ...flags, subsume: tier, host: target.uuid, mode: "manual" } } }]);
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("PossessedName", { name: x.actorName }), img: Codex.disciplineIcon("animalism"),
      flags: { [SYSTEM_ID]: { ...flags, subsumedBy: self.uuid, mode: "manual" } } }]);
    return notice(target, x.powerName, t("SubsumeDesc", { list }));
  }
  if (tp.kind === "rage") {
    // Неистовство крови: каждый успех — жертва тратит 1 кровь (лимит за ход не действует), +1 к сложности ярости за каждую
    const k = Math.min(n, target.system.blood?.value ?? 0);
    await done(message, state, x);
    if (!k) return notice(target, x.powerName, t("RageEmpty"));
    await target.update({ "system.blood.value": target.system.blood.value - k });
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("RageName", { n: k }), img: Codex.disciplineIcon("thaumaturgy"),
      description: `<p>${esc(t("RageDesc", { n: k }))}</p>`, flags: { [SYSTEM_ID]: { ...flags, frenzyDiff: k, mode: "scene" } } }]);
    return notice(target, x.powerName, t("RageDesc", { n: k }));
  }
  if (tp.kind === "theft") {
    // Хищение крови: каждый успех — 1 кровь от цели тауматургу; узы так не возникают
    const self = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
    if (!self?.isOwner) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: self?.name ?? "" }));
    const room = Math.max(0, (self.system.blood?.max ?? 0) - (self.system.blood?.value ?? 0));
    const k = Math.min(n, target.system.blood?.value ?? 0, room);
    await done(message, state, x);
    if (k) {
      await target.update({ "system.blood.value": target.system.blood.value - k });
      await self.update({ "system.blood.value": self.system.blood.value + k });
    }
    return notice(target, x.powerName, t("TheftDone", { n: k, name: self.name }));
  }
  if (tp.kind === "potency") {
    // Могущество крови: успех — поколение ниже на 1 на час; каждый лишний — +1 час или ещё ступень (распределить сразу)
    const steps = n === 1 ? 1 : await foundry.applications.api.DialogV2.prompt({ window: { title: x.powerName, icon: "fa-solid fa-droplet" }, classes: ["vtm20", "r-dialog"], rejectClose: false,
      content: `<div class="r-form"><p>${esc(t("PotencyAsk", { n }))}</p><label class="r-field"><span>${esc(t("PotencySteps"))}</span><select name="s">${Array.from({ length: n }, (_, i) =>
        `<option value="${i + 1}">${esc(t("PotencyOpt", { s: i + 1, h: n - i }))}</option>`).join("")}</select></label></div>`,
      ok: { label: t("PotencyApply"), callback: (e, b) => Number(b.form.elements.s.value) || 1 } });
    if (!steps) return;
    const hours = 1 + n - steps;
    await done(message, state, x);
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("PotencyName", { s: steps }), img: Codex.disciplineIcon("thaumaturgy"),
      description: `<p>${esc(t("PotencyDesc", { s: steps, h: hours }))}</p>`, flags: { [SYSTEM_ID]: { ...flags, genDrop: steps, mode: "timed", until: now + hours * api.MS_HOUR } } }]);
    await target.setFlag(SYSTEM_ID, "potencyNight", api.nextSunrise(now));
    return notice(target, x.powerName, t("PotencyDesc", { s: steps, h: hours }));
  }
  if (tp.kind === "vanish") {
    // 4+ успеха — исчезает полностью (Незримое присутствие); 1–3 — полупрозрачный силуэт (V20, Сокрытие 4)
    await done(message, state, x);
    if (n >= 4) { if (!target.powerEffects.some(e => e.power === "obfuscate:2")) await target.startPower("obfuscate:2"); return notice(target, x.powerName, t("Vanish4")); }
    await target.createEmbeddedDocuments("ActiveEffect", [{ name: t("VanishName"), img: Codex.disciplineIcon("obfuscate"), description: `<p>${esc(t("Vanish1"))}</p>`,
      flags: { [SYSTEM_ID]: { ...flags, mode: "scene" } } }]);
    return notice(target, x.powerName, t("Vanish1"));
  }
  if (tp.kind === "poison") {
    // Касание скорпиона: сопротивление Выносливость + Стойкость (сл. 6), каждый успех снимает успех ассамита
    const { rollPool } = await import("../../dice/roll.mjs");
    const pool = (target.system.attributes?.stamina?.total ?? 0) + (target.discipline?.("fortitude") ?? 0);
    const res = pool > 0 ? await rollPool({ actor: target, title: t("PoisonResist"), pool, difficulty: 6, kind: "check", noBotch: true }) : { successes: 0 };
    const left = n - (res?.successes ?? 0);
    await done(message, state, x);
    if (left <= 0) return notice(target, x.powerName, t("PoisonResisted"));
    const code = tp.timed[Math.min(left, tp.timed.length) - 1];
    const until = untilOf(code, now, api);
    Object.assign(flags, { attrMod: { stamina: -(x.poison ?? 1) }, mode: code === "forever" ? "manual" : until ? "timed" : "scene", ...(until ? { until } : {}) });
    name = t("PoisonName", { n: x.poison ?? 1 });
    desc = t("PoisonDesc", { n: x.poison ?? 1, dur: t(`Dur.${code}`) });
  } else if (tp.kind === "eyes") {
    Object.assign(flags, { mode: "scene" });
    name = t("EyesName", { name: x.actorName });
    desc = t(supernatural(target) ? "EyesSuper" : "EyesMortal");
  } else if (tp.kind === "quell") {
    const self = state.actorUuid ? await foundry.utils.fromUuid(state.actorUuid) : null;
    Object.assign(flags, { mode: "manual" });
    name = t("QuellName", { name: x.actorName });
    desc = t("QuellDesc", { n: self?.system.willpower?.permanent ?? "?" });
  } else if (tp.kind === "ward") {
    // Печать фей: −2 куба к проверкам Интеллекта, срок по успехам
    const code = tp.timed[Math.min(n, tp.timed.length) - 1];
    const until = untilOf(code, now, api);
    Object.assign(flags, { attrMod: { intelligence: -2 }, mode: until ? "timed" : "scene", ...(until ? { until } : {}) });
    name = t("WardName", { name: x.actorName });
    desc = t("WardDesc", { dur: t(`Dur.${code}`) });
  } else if (tp.dread) {
    // −1 куб за успех на следующий ход цели; 3+ — бежит в ужасе (V20, Величие 2)
    Object.assign(flags, { dread: n, mode: "scene" });
    name = t("DreadName", { n });
    desc = t(n >= 3 ? "DreadFlee" : "DreadDice", { n });
  } else {
    const code = tp.timed[Math.min(n, tp.timed.length) - 1];
    const until = untilOf(code, now, api);
    Object.assign(flags, { mode: until ? "timed" : "scene", ...(until ? { until } : {}) });
    desc = t(`Dur.${code}`);
  }
  await target.createEmbeddedDocuments("ActiveEffect", [{ name, img: Codex.disciplineIcon(disc), description: `<p>${esc(desc)}</p>`,
    ...(tp.kind === "eyes" ? { statuses: ["r-held"] } : {}), flags: { [SYSTEM_ID]: flags } }]);
  if (tp.kind !== "poison") await done(message, state, x);
  if (tp.kind === "poison" && (target.system.attributes?.stamina?.total ?? 1) <= 0) {
    if (target.isVampire) { if (!target.statuses?.has("r-torpor")) await target.toggleStatusEffect("r-torpor", { active: true }); }
    await notice(target, x.powerName, t(target.isVampire ? "PoisonZeroVampire" : "PoisonZeroMortal"));
  }
  return notice(target, x.powerName, desc);
}

/** Кнопка карточки «наложить» без броска (Глаза змеи против смертного). */
export async function applyFromCard(message) {
  const x = message.getFlag(SYSTEM_ID, "targetApply");
  if (!x || x.done) return;
  return applyTargetPower(message, { actorUuid: x.actorUuid, extra: { targetPower: x } }, { successes: 1, outcome: "success" });
}
