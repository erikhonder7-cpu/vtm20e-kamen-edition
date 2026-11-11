// module/apps/mage-state.mjs
// Маг: состояния и имущество сверх чародейства (правила — data/mage.json, справочник M20).
//   · Резонанс и Синергия (Book of Secrets): подписи со степенью 1–5; раз за историю старшая подпись даёт кубики к Арете;
//     скрыть подпись — Воля, сложность степень + 3, успех прячет точку примерно на час;
//   · Безмолвие (M20, гл. 10): уровень 0–6 и вид; выйти — 1 Воля и бросок Воли (сл. 7, три успеха): рассудок на сцену и −1 Парадокс,
//     провал с единицами рождает гоблина (живёт сутки за точку Арете);
//   · Изъяны Парадокса: степень по успехам отката (пустяковый … решающий);
//   · Поиск: рассказчик отмечает исход — Принятие разрешает купить точку Арете и возвращает Волю, Отрицание отнимает Волю;
//   · Чудеса — предметы типа «wonder»: у Талисмана и Устройства своё Арете (пул) и запас Квинтэссенции.

import { SYSTEM_ID, VTM20 } from "../config.mjs";
import { M, isMarauder, isFallen, aretePool, changeQuintessence, paradoxOf, changeParadox, castEffect, mageGlyphSrc, sphereName, topResonance, parseSpheres, RES_DICE } from "./mage.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Mage.${k}`, d) : game.i18n.localize(`VTM20.Mage.${k}`);
const esc = x => foundry.utils.escapeHTML(String(x ?? ""));
const DLG = ["vtm20", "r-dialog", "r-type-mage"];
const say = (actor, icon, html) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
  content: `<div class="r-notice r-type-mage"><i class="fa-solid ${icon}"></i> ${html}</div>` });
const pips = (v, max) => Array.from({ length: max }, (_, i) => ({ n: i + 1, filled: i < v }));
const owner = actor => actor?.isOwner || (ui.notifications.warn(game.i18n.format("VTM20.Notify.NotOwner", { name: actor?.name ?? "" })), false);

/** Уровень Безмолвия по числу очков Парадокса (разряженных откатом или накопленных). */
export const quietLevelFor = n => (M().quiet?.levels ?? []).find(l => n >= l.min && n <= l.max)?.n ?? 0;
/** Степень Изъяна Парадокса по успехам отката. */
export const flawGradeFor = n => (M().pflaws ?? []).find(g => n >= g.min && n <= g.max) ?? null;

/** Данные вкладки Сфер: Резонанс, Синергия, Безмолвие, Изъяны, Поиск, Чудеса. */
export function stateView(actor, dots) {
  const m = actor.system.mage, D = M(), R = D.resonance ?? {}, Q = D.quiet ?? {}, mar = isMarauder(actor), top = topResonance(actor);
  const lvl = (Q.levels ?? []).find(l => l.n === m.quiet.level) ?? null;
  return {
    resonances: m.resonances.map((r, i) => ({ i, name: r.name, flavor: (R.flavors ?? []).find(f => f.key === r.flavor)?.name ?? "", degree: R.degrees?.[r.value] ?? "", dots: pips(r.value, 5), top: r === top })),
    synergy: (R.synergy ?? []).map(s => ({ ...s, value: m.synergy[s.key], dots: dots(m.synergy[s.key], 5, { path: `system.mage.synergy.${s.key}` }) })),
    resBonus: top ? RES_DICE[Math.clamp(top.value, 0, 5)] : 0, resUsed: m.resUsed, resTop: top?.name ?? "",
    quiet: { level: m.quiet.level, dots: dots(m.quiet.level, 6, { path: "system.mage.quiet.level" }),
      kinds: [{ key: "", name: "—" }, ...(Q.kinds ?? [])].map(k => ({ ...k, selected: k.key === m.quiet.kind })),
      text: !lvl ? "" : mar ? Q.marauder?.[lvl.n - 1] ?? "" : [lvl.general, m.quiet.kind && lvl[m.quiet.kind]].filter(Boolean).join(" · "),
      // Мародёр: каждое очко Безмолвия отводит 5 очков отката на окружающих
      insulate: mar ? m.quiet.level * (Q.insulate ?? 5) : 0 },
    flaws: m.pflaws.map((f, i) => ({ i, ...f, gradeName: (D.pflaws ?? []).find(g => g.key === f.grade)?.name ?? "" })),
    seeking: m.seeking, marauder: mar, isGM: game.user.isGM,
    ghoul: ghoulView(actor, dots), wonders: wondersView(actor), investments: isFallen(actor) ? investmentsView(actor) : []
  };
}

/* ── Резонанс ─────────────────────────────────────────────────────────── */

export async function addResonance(actor) {
  if (!owner(actor)) return null;
  const R = M().resonance ?? {};
  const res = await foundry.applications.api.DialogV2.prompt({ window: { title: t("ResAdd"), icon: "fa-solid fa-wave-square" }, classes: DLG, rejectClose: false, position: { width: 440 },
    content: `<div class="r-form"><label class="r-field"><span>${esc(t("ResName"))}</span><input type="text" name="name" list="r-res-sign" placeholder="${esc(t("ResNameHint"))}" autofocus></label>
      <datalist id="r-res-sign">${(R.signatures ?? []).map(x => `<option value="${esc(x)}"></option>`).join("")}</datalist>
      <label class="r-field"><span>${esc(t("ResFlavor"))}</span><select name="flavor"><option value="">—</option>${(R.flavors ?? []).map(f => `<option value="${f.key}">${esc(f.name)} — ${esc(f.text)}</option>`).join("")}</select></label>
      <p class="r-note">${esc(t("ResRule"))}</p></div>`,
    ok: { label: game.i18n.localize("VTM20.Common.Add"), callback: (e, b) => ({ name: b.form.elements.name.value.trim(), flavor: b.form.elements.flavor.value, value: 1 }) } });
  if (!res?.name) return null;
  return actor.update({ "system.mage.resonances": [...actor.system.mage.resonances.map(r => ({ ...r })), res] });
}
/** Степень подписи: щелчок по той же точке снимает её; ноль точек — подпись остаётся в списке «неразличимой». */
export async function setResonance(actor, i, n) {
  const list = actor.system.mage.resonances.map(r => ({ ...r }));
  if (!list[i]) return null;
  list[i].value = list[i].value === n ? n - 1 : n;
  return actor.update({ "system.mage.resonances": list });
}
export async function removeResonance(actor, i) {
  const list = actor.system.mage.resonances.map(r => ({ ...r }));
  list.splice(i, 1);
  return actor.update({ "system.mage.resonances": list });
}
/** Бонус истории: потрачен ↔ снова доступен (новая история). */
export const toggleResUsed = actor => actor.update({ "system.mage.resUsed": !actor.system.mage.resUsed });

/** Скрыть подпись: Воля, сложность степень + 3; каждый успех прячет точку примерно на час. */
export async function cloakResonance(actor) {
  const top = topResonance(actor);
  if (!top?.value) return ui.notifications.info(t("ResNone"));
  const { rollPool } = await import("../dice/roll.mjs");
  return rollPool({ actor, title: t("ResCloak"), subtitle: t("ResCloakSub", { name: top.name }), pool: actor.system.willpower.permanent, difficulty: Math.min(10, top.value + 3), kind: "check",
    breakdown: [{ label: game.i18n.localize("VTM20.Willpower"), value: actor.system.willpower.permanent }] });
}

/* ── Безмолвие ────────────────────────────────────────────────────────── */

/** Выйти из Безмолвия: 1 Воля, ход бездействия, бросок Воли — три успеха при сложности 7. */
export async function quietExit(actor) {
  if (!owner(actor)) return null;
  const m = actor.system.mage, wp = actor.system.willpower, X = M().quiet?.exit ?? { difficulty: 7, successes: 3 };
  if (m.quiet.level < 1) return ui.notifications.info(t("QuietNone"));
  if (wp.temporary < 1) return ui.notifications.warn(t("QuietNoWill"));
  await actor.update({ "system.willpower.temporary": wp.temporary - 1 });
  const { rollPool } = await import("../dice/roll.mjs");
  const roll = await rollPool({ actor, title: t("QuietExit"), subtitle: t("QuietExitSub", { n: X.successes, d: X.difficulty }), pool: wp.permanent, difficulty: X.difficulty, kind: "check",
    breakdown: [{ label: game.i18n.localize("VTM20.Willpower"), value: wp.permanent }] });
  if (!roll) return null;
  if (roll.outcome === "botch") return say(actor, "fa-ghost", t("QuietGoblin", { name: esc(actor.name), n: m.arete }));
  if ((roll.successes ?? 0) < X.successes) return say(actor, "fa-cloud", t("QuietStay", { name: esc(actor.name) }));
  const now = await changeParadox(actor, -1);
  return say(actor, "fa-eye", t("QuietClear", { name: esc(actor.name), now }));
}

/* ── Изъяны Парадокса ─────────────────────────────────────────────────── */

export async function addFlaw(actor, preset = {}) {
  if (!owner(actor)) return null;
  const G = M().pflaws ?? [];
  const res = await foundry.applications.api.DialogV2.prompt({ window: { title: t("FlawAdd"), icon: "fa-solid fa-burst" }, classes: DLG, rejectClose: false, position: { width: 460 },
    content: `<div class="r-form"><label class="r-field"><span>${esc(t("FlawName"))}</span><input type="text" name="name" placeholder="${esc(t("FlawNameHint"))}" autofocus></label>
      <label class="r-field"><span>${esc(t("FlawGrade"))}</span><select name="grade">${G.map(g => `<option value="${g.key}"${g.key === preset.grade ? " selected" : ""}>${esc(g.name)} — ${esc(g.text)}</option>`).join("")}</select></label>
      <label class="r-field"><span>${esc(t("RoteText"))}</span><textarea name="text" rows="3"></textarea></label>
      <p class="r-note">${esc(t("FlawRule"))}</p></div>`,
    ok: { label: game.i18n.localize("VTM20.Common.Add"), callback: (e, b) => Object.fromEntries(["name", "grade", "text"].map(k => [k, b.form.elements[k].value.trim()])) } });
  if (!res?.name) return null;
  await actor.update({ "system.mage.pflaws": [...actor.system.mage.pflaws.map(f => ({ ...f })), res] });
  return res;
}
export async function removeFlaw(actor, i) {
  const list = actor.system.mage.pflaws.map(f => ({ ...f }));
  list.splice(i, 1);
  return actor.update({ "system.mage.pflaws": list });
}

/* ── Поиск ────────────────────────────────────────────────────────────── */

/** Исход Поиска (рассказчик): Принятие — можно купить точку Арете, +1 Воля; Отрицание — −1 Воля, роста нет. */
export async function seekingDialog(actor) {
  if (!game.user.isGM) return ui.notifications.warn(game.i18n.localize("VTM20.Notify.GMOnly"));
  const m = actor.system.mage, wp = actor.system.willpower, ess = (M().essences ?? []).find(e => e.key === m.essence);
  const res = await foundry.applications.api.DialogV2.wait({ window: { title: `${t("Seeking")}: ${actor.name}`, icon: "fa-solid fa-mountain-sun" }, classes: DLG, rejectClose: false, position: { width: 480 },
    content: `<div class="r-form"><p>${esc(t("SeekingRule", { n: m.arete + 1 }))}</p>${ess ? `<p class="r-note"><b>${esc(ess.name)}.</b> ${esc(ess.text ?? "")}</p>` : ""}
      <p class="r-note">${esc(t("SeekingSteps"))}</p></div>`,
    buttons: [{ action: "accept", icon: "fa-solid fa-sun", label: t("SeekingAccept"), default: true }, { action: "deny", icon: "fa-solid fa-cloud-rain", label: t("SeekingDeny") }] });
  if (res === "accept") {
    await actor.update({ "system.mage.seeking": true, "system.willpower.temporary": Math.min(wp.permanent, wp.temporary + 1) });
    return say(actor, "fa-sun", t("SeekingAccepted", { name: esc(actor.name), n: m.arete + 1 }));
  }
  if (res === "deny") {
    await actor.update({ "system.mage.seeking": false, "system.willpower.temporary": Math.max(0, wp.temporary - 1) });
    return say(actor, "fa-cloud-rain", t("SeekingDenied", { name: esc(actor.name) }));
  }
  return null;
}

/* ── Чудеса ───────────────────────────────────────────────────────────── */

/** Чудеса на листе: вид, точки, Арете, запас Квинтэссенции, Сферы со знаками. */
export function wondersView(actor) {
  return actor.items.filter(i => i.type === "wonder").map(it => {
    const s = it.system, ranks = parseSpheres(s.spheres);
    return { id: it.id, name: it.name, img: it.img, kind: s.kind, kindLabel: game.i18n.localize(`VTM20.Wonder.Kind.${s.kind}`), value: s.value, arete: s.arete,
      quint: s.quintessence, quintMax: s.quintMax, holds: s.quintMax > 0, perm: s.paradoxPerm,
      chips: Object.entries(ranks).map(([k, rank]) => ({ name: sphereName(actor, k), rank, sym: { src: mageGlyphSrc(`sphere-${k}`) } })),
      canUse: s.arete > 0, html: s.description };
  });
}
/** Применить Чудо: у Талисмана и Устройства — бросок его Арете в окне чародейства; прочее — карточка в чат. */
export function useWonder(actor, id) {
  const it = actor.items.get(id);
  if (!it) return null;
  if (it.system.arete < 1) return it.sheet.render(true);
  return castEffect(actor, { wonder: it, name: it.name });
}
/** Запас Квинтэссенции Чуда (Периапт — 5 за точку): перелить в мага или из мага, по очку. */
export async function wonderQuint(actor, id, d) {
  const it = actor.items.get(id), m = actor.system.mage;
  if (!it || !owner(actor)) return null;
  const s = it.system;
  // d > 0 — маг вбирает из Чуда; d < 0 — заряжает Чудо своей Квинтэссенцией
  const n = d > 0 ? Math.min(1, s.quintessence, 20 - paradoxOf(actor) - m.quintessence) : -Math.min(1, m.quintessence, s.quintMax - s.quintessence);
  if (!n) return ui.notifications.info(t(d > 0 ? "WonderEmpty" : "WonderFull"));
  await it.update({ "system.quintessence": s.quintessence - n });
  return actor.update({ "system.mage.quintessence": m.quintessence + n });
}

/* ── Духи и Царства Парадокса (рассказчик, с карточки отката) ────────── */

/** Дух Парадокса: выбрать из книжных — и он появляется существом-духом (Воля, Ярость, Гнозис, Сущность; Чары — словами). */
export async function paradoxSpirit(actor) {
  const list = M().paradoxSpirits ?? [];
  if (!list.length) return null;
  const key = await foundry.applications.api.DialogV2.prompt({ window: { title: t("SpiritTitle"), icon: "fa-solid fa-ghost" }, classes: DLG, rejectClose: false, position: { width: 480 },
    content: `<div class="r-form"><label class="r-field"><span>${esc(t("SpiritPick"))}</span><select name="key">${list.map(s => `<option value="${s.key}">${esc(s.name)}${s.of ? ` — ${esc(s.of)}` : ""} · ${esc(t("SpiritStats", s))}</option>`).join("")}</select></label>
      <p class="r-note">${esc(t("SpiritRule"))}</p></div>`,
    ok: { label: t("SpiritCall"), callback: (e, b) => b.form.elements.key.value } });
  const sp = list.find(s => s.key === key);
  if (!sp) return null;
  const made = await Actor.create({ name: sp.name, type: "creature", flags: { [SYSTEM_ID]: { created: true } },
    system: { kind: t("SpiritKind"), spirit: { on: true, rank: "jaggling", rage: sp.rage, gnosis: sp.gnosis, willpower: sp.willpower, essence: { value: sp.essence, max: sp.essence },
      charms: [], brood: t("SpiritBrood", { name: actor.name }), ban: sp.charms ? `${t("SpiritCharms")}: ${sp.charms}` : "" } } });
  await say(actor, "fa-ghost", t("SpiritCame", { name: esc(actor.name), spirit: esc(sp.name), stats: esc(t("SpiritStats", sp)) }));
  return made;
}
/** Царство Парадокса: стиль тюрьмы — по Сфере, с которой маг перестарался. */
export async function paradoxRealm(actor) {
  const R = M().realms ?? {};
  const key = await foundry.applications.api.DialogV2.prompt({ window: { title: t("RealmTitle"), icon: "fa-solid fa-dungeon" }, classes: DLG, rejectClose: false, position: { width: 460 },
    content: `<div class="r-form"><label class="r-field"><span>${esc(t("RealmPick"))}</span><select name="key">${Object.entries(R).map(([k, v]) => `<option value="${k}">${esc(sphereName(actor, k))} — ${esc(v)}</option>`).join("")}</select></label>
      <p class="r-note">${esc(t("RealmRule"))}</p></div>`,
    ok: { label: t("RealmSend"), callback: (e, b) => b.form.elements.key.value } });
  if (!R[key]) return null;
  return say(actor, "fa-dungeon", t("RealmCame", { name: esc(actor.name), sphere: esc(sphereName(actor, key)), style: esc(R[key]) }));
}

/* ── Инфернальные Инвестиции (Book of the Fallen) ────────────────────── */

const INVEST_ACT = { Hellfire: ["hellfire", "fa-fire"], Regeneration: ["regen", "fa-heart-pulse"] };
/** Инвестиции на листе Падшего: черты из компендия по книжному названию; у Адского пламени и Регенерации — кнопка. */
export function investmentsView(actor) {
  const book = (M().merits ?? []).filter(m => m.investment);
  return actor.items.filter(i => i.type === "merit" && book.some(m => m.name === i.name || m.en === i.system.source)).map(i => {
    const m = book.find(x => x.name === i.name || x.en === i.system.source), act = INVEST_ACT[m.en];
    return { id: i.id, name: i.name, cost: i.system.cost, act: act?.[0] ?? "", icon: act?.[1] ?? "", tip: act ? t(`Invest.${act[0]}`) : "" };
  });
}
/** Адское пламя: 3 очка — 3 уровня губительного огня, +1 за каждые 2 очка сверх; попасть — Ловкость + Оккультизм, сл. 5; цель поглощает со сл. 9. */
async function hellfire(actor, item) {
  const s = actor.system, dex = s.attributes.dexterity.value, occ = s.abilities.occult?.value ?? 0, dmg = 3 + Math.floor(Math.max(0, item.system.cost - 3) / 2);
  const { rollPool } = await import("../dice/roll.mjs");
  const roll = await rollPool({ actor, title: item.name, subtitle: t("Invest.hellfireSub", { n: dmg }), pool: dex + occ, difficulty: 5, kind: "check",
    breakdown: [{ label: actor.traitLabel("attributes.dexterity"), value: dex }, { label: actor.traitLabel("abilities.occult"), value: occ }] });
  if (roll && (roll.successes ?? 0) > 0) await say(actor, "fa-fire", t("Invest.hellfireHit", { name: esc(actor.name), n: dmg }));
  return roll;
}
/** Регенерация: 1 Воля — 1 уровень здоровья, начиная с самых тяжёлых ран (кроме ран от Первоначала и Истинной веры — решает рассказчик). */
async function regenerate(actor) {
  const wp = actor.system.willpower, h = actor._source.system.health, type = ["aggravated", "lethal", "bashing"].find(k => (h[k] ?? 0) > 0);
  if (!type) return ui.notifications.info(t("Invest.regenNone"));
  if (wp.temporary < 1) return ui.notifications.warn(t("QuietNoWill"));
  await actor.update({ "system.willpower.temporary": wp.temporary - 1 });
  await actor.healDamage(type, 1);
  return say(actor, "fa-heart-pulse", t("Invest.regenDone", { name: esc(actor.name), type: game.i18n.localize(VTM20.damageTypes[type]?.label ?? type) }));
}
export function useMageInvestment(actor, id, act) {
  const it = actor.items.get(id);
  if (!it || !owner(actor)) return null;
  return act === "hellfire" ? hellfire(actor, it) : act === "regen" ? regenerate(actor) : null;
}

/* ── Создание Чуда (M20, гл. 9) ──────────────────────────────────────── */

/**
 * Создание Чуда: нужны все Сферы его эффектов и Квинтэссенция — 5 за точку Чуда; каждый бросок создания стоит ещё 1.
 * Сколько успехов нужно — по правилам изобретений, это решает рассказчик: окно считает цену, проверяет Сферы и ведёт броски.
 */
export async function craftWonder(actor) {
  if (!owner(actor)) return null;
  const m = actor.system.mage, kinds = ["talisman", "device", "trinket", "periapt", "fetish", "artifact", "charm", "grimoire"];
  const res = await foundry.applications.api.DialogV2.wait({ window: { title: t("Craft.Title"), icon: "fa-solid fa-hammer" }, classes: DLG, rejectClose: false, position: { width: 500 },
    content: `<div class="r-form"><label class="r-field"><span>${esc(t("RoteName"))}</span><input type="text" name="name" autofocus></label>
      <label class="r-field"><span>${esc(game.i18n.localize("VTM20.Relic.KindLabel"))}</span><select name="kind">${kinds.map(k => `<option value="${k}">${esc(game.i18n.localize(`VTM20.Wonder.Kind.${k}`))}</option>`).join("")}</select></label>
      <label class="r-field"><span>${esc(game.i18n.localize("VTM20.Wonder.Value"))}</span><input type="number" name="value" value="1" min="1" max="10"></label>
      <label class="r-field"><span>${esc(t("RoteSpheres"))}</span><input type="text" name="spheres" placeholder="${esc(t("RoteSpheresHint"))}"></label>
      <p class="r-note" data-craft-cost></p><p class="r-note">${esc(t("Craft.Rule"))}</p></div>`,
    render: (ev, dlg) => {
      const f = dlg.element.querySelector("form") ?? dlg.element, cost = dlg.element.querySelector("[data-craft-cost]");
      const sync = () => { const n = Math.clamp(Number(f.querySelector('[name="value"]').value) || 1, 1, 10), miss = craftMissing(actor, f.querySelector('[name="spheres"]').value);
        cost.innerHTML = `<b>${esc(t("Craft.Cost", { n: n * 5, have: m.quintessence }))}</b>${miss.length ? ` <span class="is-warn">${esc(t("Craft.Missing", { list: miss.join(", ") }))}</span>` : ""}`; };
      dlg.element.addEventListener("input", sync); sync();
    },
    buttons: [{ action: "roll", icon: "fa-solid fa-dice-d10", label: t("Craft.Roll"), callback: (e, b) => ({ roll: true, ...craftRead(b.form) }) },
      { action: "ok", icon: "fa-solid fa-hammer", label: t("Craft.Finish"), default: true, callback: (e, b) => craftRead(b.form) }] });
  if (!res?.name) return null;
  const ranks = parseSpheres(res.spheres), miss = craftMissing(actor, res.spheres), high = Math.max(0, ...Object.values(ranks));
  if (miss.length) return ui.notifications.warn(t("Craft.Missing", { list: miss.join(", ") }));
  if (res.roll) {      // бросок создания: Арете, сложность — высшая Сфера + 3; каждый бросок стоит очко Квинтэссенции
    if (m.quintessence < 1) return ui.notifications.warn(t("Craft.NoQuint", { n: 1 }));
    await changeQuintessence(actor, -1);
    const { rollPool } = await import("../dice/roll.mjs"), pool = aretePool(actor);
    return rollPool({ actor, title: `${t("Craft.Title")}: ${res.name}`, subtitle: t("Craft.RollSub"), pool, difficulty: Math.clamp(high + 3, 3, 10), kind: "check",
      breakdown: [{ label: game.i18n.localize("VTM20.Mage.Arete"), value: pool }] });
  }
  const price = res.value * 5;
  if (m.quintessence < price) return ui.notifications.warn(t("Craft.NoQuint", { n: price }));
  await changeQuintessence(actor, -price);
  const holds = res.kind === "periapt" ? price : ["talisman", "device", "artifact"].includes(res.kind) ? price : 0;
  const [item] = await actor.createEmbeddedDocuments("Item", [{ name: res.name, type: "wonder", img: `systems/${SYSTEM_ID}/assets/icons/wonder.svg`,
    system: { kind: res.kind, value: res.value, arete: ["talisman", "device", "artifact"].includes(res.kind) ? Math.min(res.value, m.arete) : 0, quintessence: 0, quintMax: holds, spheres: res.spheres } }]);
  await say(actor, "fa-hammer", t("Craft.Done", { name: esc(actor.name), item: esc(res.name), n: price }));
  return item;
}
const craftRead = form => ({ name: form.elements.name.value.trim(), kind: form.elements.kind.value, value: Math.clamp(Number(form.elements.value.value) || 1, 1, 10), spheres: form.elements.spheres.value.trim() });
/** Каких Сфер не хватает мастеру для эффектов Чуда. */
function craftMissing(actor, text) {
  const m = actor.system.mage;
  return Object.entries(parseSpheres(text)).filter(([k, v]) => (m.spheres[k] ?? 0) < v).map(([k, v]) => `${sphereName(actor, k)} ${v}`);
}

/* ── Неделя хроники: Узлы и утечка Парадокса (M20, гл. 10; Факт «Узел») ── */

let _weekBusy = false;
/**
 * Раз в неделю хроники (по ночным часам, пишет один активный рассказчик): Узел каждого кабала отдаёт выработку в запас
 * (половина свободной Квинтэссенцией, половина Тассом); у мага с Парадоксом ниже 5, который за неделю не колдовал, уходит очко.
 * Пропущенные недели (часы перевели вперёд) досчитываются, но не больше двенадцати за раз.
 */
export async function mageWeekTick() {
  if (_weekBusy || !game.users.activeGM?.isSelf || !game.settings.get(SYSTEM_ID, "mageWeekly")) return;
  const { nightNumber } = await import("./calendar.mjs");
  const week = Math.floor((nightNumber() - 1) / 7), last = game.settings.get(SYSTEM_ID, "mageWeek");
  if (last == null || last < 0 || week < last) return game.settings.set(SYSTEM_ID, "mageWeek", week);   // первая неделя мира или часы отвели назад
  if (week === last) return;
  _weekBusy = true;
  try {
    const n = Math.min(12, week - last), lines = [];
    for (const c of game.actors.filter(a => a.type === "coterie" && a.system.kind === "cabal" && a.system.chantry.node > 0)) {
      const ch = c.system.chantry, y = ch.node * ch.rate * n, free = Math.ceil(y / 2), tass = Math.floor(y / 2);
      await c.update({ "system.chantry.quint": ch.quint + free, "system.chantry.tass": ch.tass + tass });
      lines.push(t("WeekNode", { name: esc(ch.name || c.name), free, tass }));
    }
    for (const a of game.actors.filter(x => x.type === "mage")) {
      const m = a.system.mage, p = paradoxOf(a), floor = p - (m.paradox - m.paradoxPerm > 0 ? Math.min(n, m.paradox - m.paradoxPerm) : 0);
      // колдовал на этой неделе или Парадокса пять и больше — не утекает (при 5+ ждёт отката)
      if (p >= 5 || floor === p || (a.getFlag(SYSTEM_ID, "castWeek") ?? -1) >= last) continue;
      await a.update({ "system.mage.paradox": Math.max(m.paradoxPerm, m.paradox - n) });
      lines.push(t("WeekParadox", { name: esc(a.name), n: p - Math.max(m.paradoxPerm, m.paradox - n) }));
    }
    await game.settings.set(SYSTEM_ID, "mageWeek", week);
    if (lines.length) await ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients("GM"),
      content: `<div class="r-notice r-type-mage"><i class="fa-solid fa-calendar-week"></i> <b>${esc(t("WeekTitle", { n }))}</b><br>${lines.join("<br>")}</div>` });
  } finally { _weekBusy = false; }
}
/** Настройки недельного такта магов. */
export function registerMageWeek() {
  game.settings.register(SYSTEM_ID, "mageWeek", { scope: "world", config: false, type: Number, default: -1 });
  game.settings.register(SYSTEM_ID, "mageWeekly", { name: "VTM20.Settings.MageWeekly.Name", hint: "VTM20.Settings.MageWeekly.Hint", scope: "world", config: true, type: Boolean, default: true });
}

/* ── Маг-гуль (V20, гл. 9: гули) ─────────────────────────────────────── */

/** Гуль на листе мага: домитор, витэ в теле, узы крови, Дисциплины (предметами — работают как у любого гуля). */
export function ghoulView(actor, dots) {
  const g = actor.system.mage.ghoul;
  return { ...g, boxes: Array.from({ length: 10 }, (_, i) => ({ n: i + 1, filled: i < g.vitae })), bondDots: dots(g.bond, 3, { path: "system.mage.ghoul.bond" }),
    bondText: g.bond ? t(`Ghoul.Bond${g.bond}`) : "", wounded: ["bashing", "lethal"].some(k => (actor._source.system.health[k] ?? 0) > 0),
    discs: actor.items.filter(i => i.type === "discipline").map(i => ({ id: i.id, name: i.name, value: i.system.value, dots: Array.from({ length: 5 }, (_, k) => ({ n: k + 1, filled: k < i.system.value })) })) };
}
/** Отметить мага гулем (или снять): с первым глотком гуль получает точку Могущества (V20, гл. 9). */
export async function toggleGhoul(actor) {
  if (!owner(actor)) return null;
  const g = actor.system.mage.ghoul, on = !g.on;
  await actor.update({ "system.mage.ghoul.on": on, ...(on && !g.vitae ? { "system.mage.ghoul.vitae": 1 } : {}) });
  if (on && !actor.items.some(i => i.type === "discipline" && i.system.key === "potence")) {
    const pack = game.packs.get(`${SYSTEM_ID}.disciplines`), idx = await pack?.getIndex({ fields: ["system.key", "type"] });
    const hit = idx?.find(i => i.type === "discipline" && i.system?.key === "potence"), doc = hit && await pack.getDocument(hit._id);
    if (doc) await actor.createEmbeddedDocuments("Item", [foundry.utils.mergeObject(doc.toObject(), { "system.value": 1 })]);
  }
  return say(actor, "fa-hand-holding-droplet", t(on ? "Ghoul.Made" : "Ghoul.Freed", { name: esc(actor.name), domitor: esc(g.domitor || t("Ghoul.Someone")) }));
}
/** Витэ в теле: клетка — столько и осталось (щелчок по той же — на одну меньше). */
export function ghoulVitae(actor, n) {
  const g = actor.system.mage.ghoul;
  return actor.update({ "system.mage.ghoul.vitae": g.vitae === n ? n - 1 : n });
}
/** Лечение кровью: 1 витэ — одно лёгкое или тяжёлое повреждение (как у гуля). */
export async function ghoulHeal(actor) {
  if (!owner(actor)) return null;
  const g = actor.system.mage.ghoul, h = actor._source.system.health, type = ["lethal", "bashing"].find(k => (h[k] ?? 0) > 0);
  if (g.vitae < 1) return ui.notifications.warn(t("Ghoul.NoVitae"));
  if (!type) return ui.notifications.info(t("Invest.regenNone"));
  await actor.update({ "system.mage.ghoul.vitae": g.vitae - 1 });
  await actor.healDamage(type, 1);
  return say(actor, "fa-droplet", t("Ghoul.Healed", { name: esc(actor.name), type: game.i18n.localize(VTM20.damageTypes[type]?.label ?? type), n: g.vitae - 1 }));
}
