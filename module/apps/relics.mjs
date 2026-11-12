// module/apps/relics.mjs
// Реликвии и Артефакты (Wraith 20, гл. 12) и душековка (Book of Oblivion, «Machines in the Ghosts: Soulforging»).
// Вещь Подземного мира — оружие, броня или вещь с полем system.ghost (data/models.mjs): вид, рейтинг, цена пробуждения,
// кристалл мягкого огня, сплав, стиль кузнеца, трещина. Пробуждение тратит Пафос — сперва из кристалла, потом свой.
// Душековка — проект на листе кузнеца (флаг forge): Оценка → Работа → Отделка; готовая вещь появляется на листе.

import { SYSTEM_ID, VTM20 } from "../config.mjs";
import { RollDialog } from "../dice/dialog.mjs";
import { t, esc, say, W, spendPathos, gainAngst } from "./wraith.mjs";

const F = () => W().forge ?? { sizes: [], shapes: [], finish: [], alloys: [], styles: [], cracks: [] };
export const RELIC_KINDS = ["relic", "artifact", "skin", "spectre", "forged"];
const GHOST_TYPES = ["weapon", "armor", "gear"];

/** Варианты для листа предмета (templates/item/parts/ghost.hbs). */
export function ghostOptions(item) {
  const g = item.system.ghost ?? {}, f = F();
  const opt = (list, cur) => list.map(x => ({ ...x, selected: x.value === cur }));
  return {
    show: item.parent?.type === "wraith" || !!g.kind, kind: g.kind,
    kinds: opt([{ value: "", label: t("Relic.KindNone") }, ...RELIC_KINDS.map(k => ({ value: k, label: t(`Relic.Kinds.${k}`) }))], g.kind),
    alloys: opt(f.alloys.map(a => ({ value: a.key, label: a.label })), g.alloy),
    styles: opt(f.styles.map(s => ({ value: s.key, label: s.label })), g.style),
    cracks: opt([{ value: "", label: t("Relic.NoCrack") }, ...f.cracks.map(c => ({ value: c, label: c }))], g.crack)
  };
}

/** Вещи Подземного мира на листе призрака. */
export function relicsView(actor) {
  const f = F();
  const list = actor.items.filter(i => GHOST_TYPES.includes(i.type) && i.system.ghost?.kind).map(i => {
    const g = i.system.ghost, alloy = f.alloys.find(a => a.key === g.alloy);
    return { id: i.id, name: i.name, img: i.img, kind: t(`Relic.Kinds.${g.kind}`), rating: g.rating, dots: "•".repeat(g.rating),
      pathos: g.pathos, crystal: g.crystal, alloy: g.alloy ? alloy?.label ?? g.alloy : "", alloyTip: alloy?.text ?? "", crack: g.crack,
      rough: g.rough, aggravated: i.type === "weapon" && i.system.damageType === "aggravated" };
  });
  const p = actor.getFlag(SYSTEM_ID, "forge");
  return { list, forge: p ? forgeView(actor, p) : null };
}

/** Пробудить вещь: цена — Пафос (из кристалла, потом свой); описание — в чат. */
export async function wakeRelic(actor, id) {
  const it = actor.items.get(id), g = it?.system.ghost;
  if (!g?.kind) return null;
  const cost = g.pathos;
  let from = "";
  if (cost) {
    if (g.crystal >= cost) { await it.update({ "system.ghost.crystal": g.crystal - cost }); from = t("Relic.FromCrystal", { n: g.crystal - cost }); }
    else if (!(await spendPathos(actor, cost))) return null;
    else from = t("Relic.FromOwn");
  }
  return say(actor, "fa-wand-sparkles", `<b>${esc(it.name)}</b> <small>(${t(`Relic.Kinds.${g.kind}`)}${g.rating ? ` ${"•".repeat(g.rating)}` : ""})</small>
    ${cost ? `<br><small>${t("Relic.Woke", { n: cost })} ${from}</small>` : ""}${it.system.description ? `<div class="r-wr-relic-text">${it.system.description}</div>` : ""}`);
}

/* ── Душековка ──────────────────────────────────────────────────────── */

const STAGES = ["appraise", "work", "finish"];

/** Новый проект: душа (её Воля и Выносливость), что куём (размер, форма, вид предмета), сплав и стиль. */
export async function startForge(actor) {
  const f = F(), sel = (name, list, lbl) => `<label class="r-f"><span>${lbl}</span><select name="${name}">${list.map(x => `<option value="${esc(x.v)}">${esc(x.l)}</option>`).join("")}</select></label>`;
  const crafts = actor.system.abilities?.crafts?.value ?? 0;
  if (!crafts) return ui.notifications.warn(t("Forge.NoCrafts"));
  const r = await foundry.applications.api.DialogV2.prompt({ window: { title: t("Forge.Title") }, classes: ["vtm20", "r-dialog"], position: { width: 460 },
    content: `<p class="r-note">${t("Forge.Lead")}</p>
      <label class="r-f"><span>${t("Forge.Name")}</span><input type="text" name="name" placeholder="${esc(t("Forge.NamePh"))}"></label>
      ${sel("type", GHOST_TYPES.map(k => ({ v: k, l: game.i18n.localize(`TYPES.Item.${k}`) })), t("Forge.Type"))}
      <label class="r-f"><span>${t("Forge.SoulWill")}</span><input type="number" name="will" value="5" min="1" max="10"></label>
      <label class="r-f"><span>${t("Forge.SoulSta")}</span><input type="number" name="sta" value="2" min="1" max="5"></label>
      ${sel("size", f.sizes.map(x => ({ v: x.n, l: `${x.n} — ${x.label}` })), t("Forge.Size"))}
      ${sel("shape", f.shapes.map(x => ({ v: x.n, l: `${x.n} — ${x.label}` })), t("Forge.Shape"))}
      ${sel("alloy", f.alloys.map(x => ({ v: x.key, l: `${x.label}${x.crafts > 1 ? ` (${t("Forge.NeedCrafts", { n: x.crafts })})` : ""}` })), t("Relic.Alloy"))}
      ${sel("style", f.styles.map(x => ({ v: x.key, l: x.label })), t("Relic.Style"))}`,
    ok: { label: t("Forge.Start"), callback: (ev, btn) => Object.fromEntries(new FormData(btn.form)) }, rejectClose: false });
  if (!r) return null;
  const alloy = f.alloys.find(a => a.key === r.alloy) ?? f.alloys[0];
  if ((alloy?.crafts ?? 1) > crafts) return ui.notifications.warn(t("Forge.AlloyCrafts", { alloy: alloy.label, n: alloy.crafts }));
  const p = { name: r.name?.trim() || t("Forge.Unnamed"), type: r.type, will: Math.clamp(Number(r.will) || 5, 1, 10), sta: Math.clamp(Number(r.sta) || 2, 1, 5),
    need: Number(r.size) + Number(r.shape), alloy: r.alloy ?? "", style: r.style ?? "",
    stage: "appraise", hits: 0, fails: 0, finishFails: 0, plusDiff: 0, cracks: [], effects: [], rough: true };
  await actor.setFlag(SYSTEM_ID, "forge", p);
  return say(actor, "fa-hammer", t("Forge.Started", { name: esc(actor.name), item: esc(p.name), need: p.need }));
}

/** Атрибут стадии: по книге, или атрибут стиля кузнеца. */
function stageAttr(p, stage) {
  const style = F().styles.find(s => s.key === p.style);
  if (style?.attr) return style.attr;
  return { appraise: "manipulation", work: "strength", finish: "perception" }[stage];
}

/** Вид проекта для листа. */
export function forgeView(actor, p) {
  const st = p.stage, alloy = F().alloys.find(a => a.key === p.alloy);
  return { ...p, stageLabel: t(`Forge.Stage.${st}`), attr: game.i18n.localize(VTM20.attributes[stageAttr(p, st)]?.label ?? ""),
    diff: forgeDiff(p, st), hours: (st === "work" || st === "finish" ? (alloy?.time ?? 1) : 1) * (p.style === "zurcher" ? 4 : 1),
    needLabel: st === "work" ? `${p.hits}/${p.need}` : st === "finish" ? String(p.hits) : "",
    alloyLabel: alloy?.label ?? "", cracksText: p.cracks.join("; "), isFinish: st === "finish",
    fx: st === "finish" ? F().finish.map(x => ({ key: x.key, label: x.label, n: fxCost(p, x), taken: p.effects.includes(x.key) })) : [] };
}
/** Цена эффекта Отделки: Нхудрик — +25% Корпуса за 2; Цюрхер — специализации на 1 дешевле; пепельное железо — штраф брони за 1. */
function fxCost(p, fx) {
  let cost = fx.n;
  if (fx.key === "corpus" && p.style === "nhudric") cost = 2;
  if (/Spec$/.test(fx.key) && p.style === "zurcher") cost -= 1;
  if (/^armor(One|All)$/.test(fx.key) && p.alloy === "ashiron") cost = 1;
  return cost;
}
const forgeDiff = (p, st) => Math.min(10, (st === "appraise" ? p.will : st === "work" ? p.sta + 2 : 8) + (p.plusDiff ?? 0));

/** Час работы над проектом — бросок текущей стадии. */
export async function forgeStep(actor) {
  const p = foundry.utils.deepClone(actor.getFlag(SYSTEM_ID, "forge"));
  if (!p || !STAGES.includes(p.stage)) return null;
  const st = p.stage, diff = forgeDiff(p, st), attr = stageAttr(p, st);
  return RollDialog.prompt(actor, { title: t("Forge.StepTitle", { item: p.name, stage: t(`Forge.Stage.${st}`) }), trait1: `attributes.${attr}`, trait2: "abilities.crafts",
    difficulty: diff, lockTraits: true, diffNote: t(`Forge.Note.${st}`, { need: p.need, hits: p.hits }), extra: { wraith: { kind: "forge", stage: st } },
    onRolled: async r => {
      const q = foundry.utils.deepClone(actor.getFlag(SYSTEM_ID, "forge"));
      if (!q) return;
      const n = r?.successes ?? 0, failed = !n || r?.outcome === "botch", lines = [];
      if (st === "appraise") {
        if (failed) { q.plusDiff = 1; lines.push(t("Forge.AppraiseFail")); } else lines.push(t("Forge.AppraiseOk", { min: Math.max(0, 60 - 10 * n) }));
        q.stage = "work"; q.hits = 0;
      } else if (failed) {
        // провал — трещина (Остров Роз: первый провал без неё, но каждый провал — Тени кузнеца +3 Ангста; Нхудрик: три провала Работы губят душу)
        const key = st === "work" ? "fails" : "finishFails";
        q[key] += 1;
        const noCrack = q.style === "rose" && q[key] === 1;
        if (!noCrack) { const c = F().cracks[Math.floor(Math.random() * F().cracks.length)]; q.cracks.push(c); lines.push(t("Forge.Crack", { crack: esc(c) })); }
        if (q.style === "rose" || (q.style === "nhudric" && st === "work" && q[key] >= 3)) await gainAngst(actor, 3, { reason: t("Forge.Title") });
        if (q[key] >= 3) {
          if (st === "finish" || q.style === "nhudric") { await actor.unsetFlag(SYSTEM_ID, "forge"); return say(actor, "fa-fire", t(st === "finish" ? "Forge.Ruined" : "Forge.SoulLost", { item: esc(q.name) }), "is-warn"); }
          lines.push(t("Forge.Cool"));
          q.fails = 0;
        }
      } else if (st === "work") {
        q.hits += n;
        lines.push(t("Forge.WorkHits", { hits: q.hits, need: q.need }));
        if (q.hits >= q.need) { q.stage = "finish"; q.hits = 0; lines.push(t("Forge.Shaped")); }
      } else {
        q.hits += n;
        lines.push(t("Forge.FinishHits", { hits: q.hits }));
      }
      await actor.setFlag(SYSTEM_ID, "forge", q);
      return say(actor, "fa-hammer", `<b>${esc(q.name)}</b> — ${t(`Forge.Stage.${st}`)}: ${lines.join(" ")}`, failed ? "is-warn" : "");
    } });
}

/** Отделка: потратить накопленные успехи на эффект. */
export async function forgeFinishEffect(actor, key) {
  const p = foundry.utils.deepClone(actor.getFlag(SYSTEM_ID, "forge")), fx = F().finish.find(x => x.key === key);
  if (!p || p.stage !== "finish" || !fx) return null;
  const cost = fxCost(p, fx);
  if (p.effects.includes(key)) return ui.notifications.warn(t("Forge.Twice"));
  if (p.hits < cost) return ui.notifications.warn(t("Forge.NotEnough", { n: cost, hits: p.hits }));
  p.hits -= cost; p.effects.push(key);
  if (key === "clean") p.rough = false;
  await actor.setFlag(SYSTEM_ID, "forge", p);
  return say(actor, "fa-gem", t("Forge.Effect", { item: esc(p.name), fx: esc(fx.label), n: cost }));
}

/** Готово: вещь — на лист кузнеца с клеймом, сплавом, трещинами; проект закрывается. */
export async function forgeComplete(actor) {
  const p = actor.getFlag(SYSTEM_ID, "forge");
  if (!p || p.stage !== "finish") return null;
  const fx = F().finish, alloy = F().alloys.find(a => a.key === p.alloy);
  const html = `<p>${t("Forge.ItemText", { maker: esc(actor.name), alloy: esc(alloy?.label ?? "") })}</p>
    ${p.effects.length ? `<p><b>${t("Forge.Effects")}:</b> ${p.effects.map(k => esc(fx.find(x => x.key === k)?.label ?? k)).join("; ")}</p>` : ""}
    ${p.rough ? `<p><i>${t("Relic.RoughHint")}</i></p>` : ""}${alloy?.text ? `<p>${esc(alloy.label)}: ${esc(alloy.text)}</p>` : ""}`;
  const [it] = await actor.createEmbeddedDocuments("Item", [{ name: p.name, type: p.type,
    system: { description: html, ghost: { kind: "forged", alloy: p.alloy, style: p.style, crack: p.cracks[0] ?? "", maker: actor.name, rough: p.rough } } }]);
  await actor.unsetFlag(SYSTEM_ID, "forge");
  await say(actor, "fa-hammer", t("Forge.Done", { name: esc(actor.name), item: esc(p.name) }) + (p.cracks.length > 1 ? ` <small>${t("Forge.MoreCracks", { list: esc(p.cracks.slice(1).join("; ")) })}</small>` : ""));
  return it;
}

export async function forgeAbandon(actor) {
  if (!actor.getFlag(SYSTEM_ID, "forge")) return null;
  const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t("Forge.Title") }, content: `<p>${t("Forge.AbandonAsk")}</p>`, rejectClose: false });
  if (!ok) return null;
  return actor.unsetFlag(SYSTEM_ID, "forge");
}
