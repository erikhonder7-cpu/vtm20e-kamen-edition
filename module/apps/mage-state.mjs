// module/apps/mage-state.mjs
// Маг: состояния и имущество сверх чародейства (правила — data/mage.json, справочник M20).
//   · Резонанс и Синергия (Book of Secrets): подписи со степенью 1–5; раз за историю старшая подпись даёт кубики к Арете;
//     скрыть подпись — Воля, сложность степень + 3, успех прячет точку примерно на час;
//   · Безмолвие (M20, гл. 10): уровень 0–6 и вид; выйти — 1 Воля и бросок Воли (сл. 7, три успеха): рассудок на сцену и −1 Парадокс,
//     провал с единицами рождает гоблина (живёт сутки за точку Арете);
//   · Изъяны Парадокса: степень по успехам отката (пустяковый … решающий);
//   · Поиск: рассказчик отмечает исход — Принятие разрешает купить точку Арете и возвращает Волю, Отрицание отнимает Волю;
//   · Чудеса — предметы типа «wonder»: у Талисмана и Устройства своё Арете (пул) и запас Квинтэссенции.

import { M, isMarauder, changeParadox, castEffect, mageGlyphSrc, sphereName, topResonance, parseSpheres, RES_DICE } from "./mage.mjs";

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
    wonders: wondersView(actor)
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
  const n = d > 0 ? Math.min(1, s.quintessence, 20 - m.paradox - m.quintessence) : -Math.min(1, m.quintessence, s.quintMax - s.quintessence);
  if (!n) return ui.notifications.info(t(d > 0 ? "WonderEmpty" : "WonderFull"));
  await it.update({ "system.quintessence": s.quintessence - n });
  return actor.update({ "system.mage.quintessence": m.quintessence + n });
}
