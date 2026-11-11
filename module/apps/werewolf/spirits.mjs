// module/apps/werewolf/spirits.mjs
// Оборотень — Умбра и духи: шаг в сторону, образцы духов, Чары, Сущность, кин-фетч.

import { RollDialog } from "../../dice/dialog.mjs";
import { VTM20 } from "../../config.mjs";
import { septOf } from "../sept.mjs";
import { t, esc, W, wwHead, wwPick } from "../werewolf.mjs";

/** Преграда по месту (W20, гл. 7): от лаборатории 9 до величайших каэрнов 2. */
export const GAUNTLET = [["lab", 9], ["downtown", 8], ["street", 7], ["rural", 6], ["wild", 5], ["urbanCaern", 5], ["caern", 4], ["mightyCaern", 3], ["greatCaern", 2]];

/** Шаг в Умбру (W20, гл. 7): Гнозис против Преграды места; успехи — время перехода, провал с единицами — застрял в Преграде. */
export async function stepSideways(actor, trait = "werewolf.gnosis") {
  const sp = septOf(actor);
  const places = [...(sp ? [{ key: String(sp.gauntlet), icon: "fa-campground", title: t("GauntletSept", { name: esc(sp.name) }), badge: sp.gauntlet, cls: "is-sept" }] : []),
    ...GAUNTLET.map(([k, n]) => ({ key: String(n), ...(/aern/i.test(k) ? { glyph: "glyph-caern" } : { icon: k === "lab" ? "fa-flask" : k === "downtown" ? "fa-city" : k === "street" ? "fa-road" : k === "rural" ? "fa-wheat-awn" : "fa-mountain-sun" }),
      title: t(`Gauntlet.${k}`), badge: n }))];
  const diff = Number(await wwPick({ title: t("StepSideways"), icon: "fa-moon", width: 760, cls: "r-wc-grid",
    head: wwHead({ glyph: "glyph-umbra", kicker: esc(actor.name), title: t("GauntletPick"), sub: t("GauntletSub", { n: `<b>${actor.traitValue(trait) ?? 0}</b>` }) }),
    lead: t("GauntletTimes"),
    cards: places })) || 0;
  if (!diff) return;
  // Стратегия города: фишки в секторе с каэрном — Преграда −1 за каждые 2 (не больше −2, не ниже 2)
  const { perkBonus } = await import("../../ui/strategy.mjs");
  const pk = perkBonus(actor, "caern"), cut = Math.min(2, pk.dice), d = Math.max(2, diff - cut);
  return RollDialog.prompt(actor, { title: t("StepSideways"), trait1: trait, difficulty: d,
    diffNote: cut ? `${t("GauntletNote")} · ${t("GauntletPerk", { n: cut, name: pk.names.join(", ") })}` : t("GauntletNote"),
    onRolled: async r => { if ((r?.successes ?? 0) > 0) { const { setUmbra } = await import("../umbra.mjs"); await setUmbra(actor, "penumbra"); } } });
}

export const SPIRIT_RANKS = ["gaffling", "jaggling", "incarna", "celestine"];

export const charmOf = key => {
  // особая Чара образца духа: «~образец:Название», текст — в spirits[].specials
  if (key?.startsWith("~")) {
    const [tpl, name] = key.slice(1).split(/:(.*)/s), sp = spiritTplOf(tpl);
    return { key, name, en: "", general: false, text: sp?.specials?.[name] || game.i18n.format("VTM20.Werewolf.Spirit.specialOf", { name: sp?.name ?? tpl }) };
  }
  return (W().charms ?? []).find(c => c.key === key) ?? null;
};

export const spiritTplOf = key => (W().spirits ?? []).find(s => s.key === key) ?? null;

export const SPIRIT_KINDS = ["gaia", "wyld", "weaver", "fetch", "bane"];

/** Образцы, сгруппированные по видам, — для выпадающего списка. */
export const spiritTplGroups = () => SPIRIT_KINDS.map(k => ({ label: t(`Spirit.kind.${k}`),
  list: (W().spirits ?? []).filter(s => s.kind === k).map(s => ({ key: s.key, label: `${VTM20.label(s)} — ${s.rage}/${s.gnosis}/${s.willpower} · ${s.source}` })) }))
  .filter(g => g.list.length);

export const spiritData = sp => ({ on: true, rank: sp.rank, rage: sp.rage, gnosis: sp.gnosis, willpower: sp.willpower,
  essence: { value: sp.essence, max: sp.essence }, charms: sp.charms });

/** Дух по образцу: черты, Эссенция и Чары; вид существа — по образцу, описание — в чат при применении. */
export async function applySpiritTpl(actor, key) {
  const sp = spiritTplOf(key);
  if (!sp) return;
  await actor.update({ "system.spirit": spiritData(sp), "system.kind": `${t(`Spirit.kind.${sp.kind}`)}: ${sp.name}` });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: ChatMessage.getWhisperRecipients("GM"),
    content: `<div class="r-notice r-type-werewolf"><b>${esc(sp.name)}</b>${sp.en ? ` <small>(${esc(sp.en)})</small>` : ""}<p>${sp.text}</p><small>${esc(sp.source)}</small></div>` });
}

/** Новое существо-дух по образцу (для кин-фетча и рассказчика). */
export async function createSpirit(key, name) {
  const sp = spiritTplOf(key);
  if (!sp) return null;
  return Actor.create({ name: name || sp.name, type: "creature",
    flags: { [game.system.id]: { created: true, spiritTpl: key } },
    system: { kind: `${t(`Spirit.kind.${sp.kind}`)}: ${sp.name}`, spirit: spiritData(sp) } });
}

export function fetchInfo(actor) {
  const k = actor.system.kinfolk, f = k.fetch ? fromUuidSync(k.fetch) : null;
  const rite = (W().fetchRites ?? []).find(r => r.tribe === k.tribe);
  return { actor: f ? { uuid: f.uuid, name: f.name } : null, rite: rite?.text ?? "", tribe: rite?.name ?? "",
    tpls: (W().spirits ?? []).filter(s => s.source === "W20 Kinfolk").map(s => ({ key: s.key, label: VTM20.label(s) })) };
}

export async function bindFetch(actor, key) {
  const f = await createSpirit(key, `${spiritTplOf(key)?.name ?? "Кин-фетч"}: ${actor.name}`);
  if (!f) return;
  await actor.update({ "system.kinfolk.fetch": f.uuid });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-werewolf"><i class="fa-solid fa-feather"></i> ${t("Fetch.bound", { name: esc(actor.name), fetch: esc(f.name) })}</div>` });
}

/** Первая Перемена: клеймо сгорает, фетч летит к племени. */
export async function burnFetch(actor) {
  const f = actor.system.kinfolk.fetch ? await fromUuid(actor.system.kinfolk.fetch) : null;
  await actor.update({ "system.kinfolk.fetch": "" });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-werewolf"><i class="fa-solid fa-fire"></i> ${t("Fetch.burned", { name: esc(actor.name), fetch: esc(f?.name ?? "—") })}</div>` });
}

/** Карточка духа: черты точками, Эссенция квадратиками, Чары (общие — у всех). */
export function spiritInfo(actor, dots) {
  const sp = actor.system.spirit, all = W().charms ?? [];
  const charms = [...all.filter(c => c.general), ...sp.charms.map(charmOf).filter(c => c && !c.general)];
  return {
    rank: sp.rank, ranks: SPIRIT_RANKS.map(k => ({ key: k, label: t(`SpiritRank.${k}`), selected: k === sp.rank })),
    traits: ["willpower", "rage", "gnosis"].map(k => ({ k, v: sp[k], label: t(`Spirit.${k}`), hint: t(`Spirit.${k}Hint`), dots: dots(sp[k], 10, { path: `system.spirit.${k}` }) })),
    essence: sp.essence.value, essenceMax: sp.essence.max, suggested: sp.rage + sp.gnosis + sp.willpower,
    essenceBoxes: Array.from({ length: Math.min(40, sp.essence.max) }, (_, i) => ({ n: i + 1, filled: i < sp.essence.value, path: "system.spirit.essence.value" })),
    charms: charms.map(c => ({ ...c, general: c.general })), avail: all.filter(c => !c.general && !sp.charms.includes(c.key))
  };
}

export async function addCharm(actor, key) {
  if (!key || actor.system.spirit.charms.includes(key)) return;
  return actor.update({ "system.spirit.charms": [...actor.system.spirit.charms, key] });
}

export async function removeCharm(actor, key) {
  return actor.update({ "system.spirit.charms": actor.system.spirit.charms.filter(k => k !== key) });
}

/** Эссенция по правилу W20: Воля + Ярость + Гнозис, и заполнить. */
export async function spiritEssenceReset(actor) {
  const sp = actor.system.spirit, n = sp.rage + sp.gnosis + sp.willpower;
  return actor.update({ "system.spirit.essence": { value: n, max: n } });
}
