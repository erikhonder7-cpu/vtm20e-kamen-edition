// module/apps/mage-duel.mjs
// Маг против мира и против мага (M20, справочник — data/mage.json):
//   · шаг в сторону — Дух 3, длительный бросок Арете против Преграды места (гл. 9; таблица Преграды — гл. 10);
//   · контрмагия — Арете, сл. 7: врождённая, развеять (+1), отразить (+2), расплести (+1), анти-магия — пул Первоначала, сл. 8;
//   · сертамен — старая дуэль Ордена Гермеса: Гладиус бьёт по Эгиде, успехи тянут Квинтэссенцию из Локуса соперника.
// Итог — в карточке броска (блок «mduel»: чипы и строка итога), без отдельных уведомлений.

import { SYSTEM_ID, VTM20 } from "../config.mjs";
import { registerCardBlock, themeClass } from "../ui/themes.mjs";
import { M, aretePool, sphereName, mageGlyphSrc, changeParadox, mt } from "./mage.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Mage.${k}`, d) : game.i18n.localize(`VTM20.Mage.${k}`);
const esc = x => foundry.utils.escapeHTML(String(x ?? ""));
const owner = actor => actor?.isOwner || (ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: actor?.name ?? "" })), false);
const sph = (actor, k) => actor.system.mage?.spheres?.[k] ?? 0;

/** Окно выбора: плитки r-pick (значение — в data-v), вернёт выбранное или null. Поля формы — в extra. */
async function pick(actor, { title, icon, lead, options, extra = "", read = null }) {
  let res = null;
  await foundry.applications.api.DialogV2.wait({
    window: { title: `${title}: ${actor.name}`, icon: `fa-solid ${icon}` }, classes: ["vtm20", "r-dialog", "r-mduel", ...themeClass(actor).split(" ")], position: { width: 520 }, rejectClose: false,
    content: `<div class="r-form r-mduel-form">${lead ? `<p class="r-note r-explain">${lead}</p>` : ""}
      <div class="r-mduel-opts">${options.map((o, i) => `<label class="r-mduel-opt ${o.off ? "is-off" : ""}" ${o.tip ? `data-tooltip="${esc(o.tip)}"` : ""}>
        <input type="radio" name="v" value="${esc(o.key)}" ${o.off ? "disabled" : ""} ${!o.off && options.findIndex(x => !x.off) === i ? "checked" : ""}>
        <span class="r-mduel-face">${o.sym ? `<span class="r-sym r-mg" style="--sym: url('${o.sym}')"></span>` : `<i class="fa-solid ${o.icon ?? "fa-circle"}"></i>`}</span>
        <span class="r-mduel-text"><b>${esc(o.label)}</b>${o.sub ? `<em>${esc(o.sub)}</em>` : ""}</span>${o.badge != null ? `<span class="r-mduel-badge">${esc(o.badge)}</span>` : ""}</label>`).join("")}</div>${extra}</div>`,
    buttons: [{ action: "ok", icon: `fa-solid ${icon}`, label: title, default: true, callback: (ev, b) => { const f = b.form; res = { v: f.elements.v?.value ?? "", ...(read ? read(f) : {}) }; } }]
  });
  return res?.v ? res : null;
}

/* ── Шаг в сторону ────────────────────────────────────────────────────── */

/** Маг в Умбре? Флаг общий с оборотнями (apps/umbra.mjs): жетон бледнеет. */
export const inUmbra = actor => !!actor.getFlag(SYSTEM_ID, "umbra");

export async function stepSideways(actor) {
  if (!owner(actor)) return null;
  const { setUmbra } = await import("./umbra.mjs");
  if (inUmbra(actor)) { await actor.unsetFlag(SYSTEM_ID, "umbraStep"); await setUmbra(actor, ""); return ui.notifications.info(t("StepBack", { name: actor.name })); }
  if (sph(actor, "spirit") < 3) return ui.notifications.warn(t("StepNeedSpirit", { sphere: sphereName(actor, "spirit") }));
  const pool = aretePool(actor);
  if (pool < 1) return ui.notifications.warn(t("NoArete"));
  const G = M().gauntlet ?? [], run = actor.getFlag(SYSTEM_ID, "umbraStep");
  const place = run ? G.find(g => g.key === run.key) : null;
  // начатый переход продолжается там же; новый — выбор места
  const choice = place ? { v: place.key } : await pick(actor, { title: t("StepSideways"), icon: "fa-circle-half-stroke", lead: esc(t("StepLead")),
    options: G.map(g => ({ key: g.key, label: g.name, sub: t("StepNeed", { n: g.need }), badge: g.diff, icon: g.icon })) });
  let g = G.find(x => x.key === choice?.v);
  if (!g) return null;
  const { rollPool } = await import("../dice/roll.mjs");
  const got0 = run?.key === g.key ? run.got : 0;
  // Стратегия города: фишки в секторе с Узлом — Преграда −1 за каждые 2 (не больше −2, не ниже Преграды самого Узла)
  const { perkBonus } = await import("../ui/strategy.mjs");
  const pk = perkBonus(actor, "node"), cut = Math.min(2, pk.dice), node = G.find(x => x.key === "node")?.diff ?? 3;
  g = { ...g, diff: Math.max(node, g.diff - cut) };
  const roll = await rollPool({ actor, title: t("StepSideways"), subtitle: `${g.name} · ${t("StepProgress", { got: got0, need: g.need })}`, pool, difficulty: g.diff, kind: "check",
    breakdown: [{ label: mt(actor, "Arete"), value: pool }], extra: { mduel: { kind: "step", place: g.name, diff: g.diff, need: g.need, got0 } } });
  if (!roll) return null;
  const got = got0 + (roll.successes ?? 0);
  if (roll.outcome === "botch") await actor.unsetFlag(SYSTEM_ID, "umbraStep");
  else if (got >= g.need) {
    await actor.unsetFlag(SYSTEM_ID, "umbraStep");
    await setUmbra(actor, "penumbra");
    await changeParadox(actor, 1);                      // шаг в сторону вульгарен: успешная вульгарная магия — 1 Парадокс
  } else await actor.setFlag(SYSTEM_ID, "umbraStep", { key: g.key, got });
  return roll;
}

/* ── Контрмагия ───────────────────────────────────────────────────────── */

const COUNTER = [
  { key: "basic", icon: "fa-shield-halved", mod: 0 },
  { key: "dispel", icon: "fa-wind", mod: 1, prime: 1, quint: 1 },
  { key: "reflect", icon: "fa-rotate-left", mod: 2, prime: 1, quint: 1 },
  { key: "unweave", icon: "fa-scissors", mod: 1, prime: 1 },
  { key: "anti", icon: "fa-ban", prime: 1, anti: true }
];

export async function counterMagic(actor) {
  if (!owner(actor)) return null;
  const m = actor.system.mage, pool = aretePool(actor), prime = sph(actor, "prime"), C = M().counter ?? { difficulty: 7, antiDifficulty: 8 };
  if (pool < 1) return ui.notifications.warn(t("NoArete"));
  const why = c => c.prime && prime < c.prime ? t("CounterNeedPrime", { sphere: sphereName(actor, "prime") }) : c.quint && m.quintessence < c.quint ? t("CounterNeedQuint") : "";
  const choice = await pick(actor, { title: t("Counter"), icon: "fa-shield-halved", lead: esc(t("CounterLead")),
    options: COUNTER.map(c => ({ key: c.key, label: t(`CounterKind.${c.key}`), sub: t(`CounterHint.${c.key}`), icon: c.icon, off: !!why(c), tip: why(c),
      badge: c.anti ? `${prime}d · ${C.antiDifficulty}` : `${pool}d · ${C.difficulty + c.mod}` })) });
  const c = COUNTER.find(x => x.key === choice?.v);
  if (!c) return null;
  const { rollPool } = await import("../dice/roll.mjs");
  if (c.quint) await actor.update({ "system.mage.quintessence": m.quintessence - c.quint });
  const dice = c.anti ? prime : pool, diff = c.anti ? C.antiDifficulty : C.difficulty + c.mod;
  const roll = await rollPool({ actor, title: t("Counter"), subtitle: t(`CounterKind.${c.key}`), pool: dice, difficulty: diff, kind: "check",
    breakdown: [{ label: c.anti ? sphereName(actor, "prime") : mt(actor, "Arete"), value: dice }], extra: { mduel: { kind: "counter", mode: c.key, quint: c.quint ?? 0, have: actor.system.mage.quintessence } } });
  // анти-магия: каждый успех стоит 1 Квинтэссенции — сколько есть, столько и сработает
  if (roll && c.anti) { const n = Math.min(roll.successes ?? 0, actor.system.mage.quintessence); if (n) await actor.update({ "system.mage.quintessence": actor.system.mage.quintessence - n }); }
  return roll;
}

/* ── Сертамен ─────────────────────────────────────────────────────────── */

/** Удар Гладиусом: Смекалка или Ловкость + Сфера Гладиуса против (Эгида соперника + 3); успехи тянут Квинтэссенцию из его Локуса. */
export async function certamen(actor) {
  if (!owner(actor)) return null;
  const mine = VTM20.mageSpheres.filter(k => sph(actor, k) > 0);
  if (!mine.length) return ui.notifications.warn(t("NoSpheres"));
  const foe = [...(game.user.targets ?? [])].map(tk => tk.actor).find(a => a && a !== actor && a.type === "mage") ?? null;
  const attrs = ["wits", "dexterity"].map(k => [k, actor.system.attributes?.[k]?.value ?? 0]);
  const choice = await pick(actor, { title: t("Certamen"), icon: "fa-khanda", lead: esc(t("CertamenLead")),
    options: mine.map(k => ({ key: k, label: sphereName(actor, k), sub: t("Gladius"), badge: sph(actor, k), sym: mageGlyphSrc(`sphere-${k}`) })),
    extra: `<div class="r-mduel-row"><label class="r-field"><span>${esc(t("CertamenAttr"))}</span><select name="attr">${attrs.map(([k, v]) => `<option value="${k}">${esc(game.i18n.localize(`VTM20.Attr.${k}`))} ${v}</option>`).join("")}</select></label>
      <label class="r-field"><span>${esc(t("Aegis"))}${foe ? ` · ${esc(foe.name)}` : ""}</span><input type="number" name="aegis" min="0" max="5" value="${foe ? Math.max(0, ...Object.values(foe.system.mage?.spheres ?? {})) : 1}"></label></div>`,
    read: f => ({ attr: f.elements.attr.value, aegis: Math.clamp(Number(f.elements.aegis.value) || 0, 0, 5) }) });
  if (!choice) return null;
  const a = actor.system.attributes?.[choice.attr]?.value ?? 0, g = sph(actor, choice.v), pool = a + g, diff = Math.min(10, choice.aegis + 3);
  const { rollPool } = await import("../dice/roll.mjs");
  const roll = await rollPool({ actor, title: t("Certamen"), subtitle: `${t("Gladius")}: ${sphereName(actor, choice.v)}`, pool, difficulty: diff, kind: "check",
    breakdown: [{ label: game.i18n.localize(`VTM20.Attr.${choice.attr}`), value: a }, { label: sphereName(actor, choice.v), value: g }],
    extra: { mduel: { kind: "certamen", sphere: choice.v, aegis: choice.aegis, foe: foe?.name ?? "", foeUuid: foe?.uuid ?? "" } } });
  // соперник выбран целью и доступен — Квинтэссенция переходит сама (Первоначало соперника поглощает — его броском, вручную)
  const n = roll?.successes ?? 0;
  if (n > 0 && foe?.isOwner) {
    const take = Math.min(n, foe.system.mage.quintessence);
    if (take) { await foe.update({ "system.mage.quintessence": foe.system.mage.quintessence - take }); await actor.update({ "system.mage.quintessence": Math.min(20 - actor.system.mage.paradox, actor.system.mage.quintessence + take) }); }
  }
  return roll;
}

/* Блок карточки (общий вид «чипы + строка итога», templates/chat/roll-card.hbs) */
registerCardBlock("mduel", (state, ev, actor) => {
  const x = state.extra.mduel, n = ev.successes ?? 0, botch = ev.outcome === "botch";
  if (x.kind === "step") {
    const got = x.got0 + n, done = got >= x.need;
    return { chips: [{ icon: "fa-circle-half-stroke", label: x.place }, { icon: "fa-bullseye", label: t("Gauntlet"), value: x.diff }, { icon: "fa-list-ol", label: t("StepNeedShort"), value: `${Math.min(got, x.need)}/${x.need}` }],
      cls: botch ? "is-bad" : done ? "is-ok" : "", text: botch ? t("StepBotch") : done ? t("StepDone", { name: esc(actor?.name ?? "") }) : t("StepOnward", { got, need: x.need }),
      sub: done && !botch ? t("StepVulgar") : "" };
  }
  if (x.kind === "counter") {
    const anti = x.mode === "anti", eff = anti ? Math.min(n, x.have ?? n) : n;
    return { chips: [{ icon: "fa-shield-halved", label: t(`CounterKind.${x.mode}`) }, ...(x.quint ? [{ icon: "fa-sun", label: actor ? mt(actor, "Quintessence") : t("Quintessence"), value: `−${x.quint}`, cls: "is-cost" }] : [])],
      cls: botch ? "is-bad" : eff > 0 ? "is-ok" : "", text: botch ? t("CounterBotch") : eff < 1 ? t("CounterFail") : t(`CounterRes.${x.mode}`, { n: eff }),
      sub: anti && eff > 0 ? t("CounterAntiCost", { n: eff }) : "" };
  }
  if (x.kind === "certamen") return { chips: [{ sym: { src: mageGlyphSrc(`sphere-${x.sphere}`) }, label: t("Gladius") }, { icon: "fa-shield", label: t("Aegis"), value: x.aegis }],
    cls: botch ? "is-bad" : n > 0 ? "is-ok" : "", text: botch ? t("CertamenBotch") : n < 1 ? t("CertamenMiss") : t("CertamenHit", { n, foe: esc(x.foe || t("CertamenFoe")) }), sub: n > 0 ? t("CertamenSoak") : "" };
  return {};
});
