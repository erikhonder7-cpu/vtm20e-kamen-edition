// module/apps/werewolf.mjs
// Оборотень (Werewolf: The Apocalypse 20th; данные — data/werewolf.json из справочника books/…/Оборотни/_справочник).
// Гару: system.werewolf — порода, аугурия, племя, Ранг, Слава, Ярость, Гнозис, форма, Дары (ключи), ритуалы (ключи).
// Смена формы (W20, гл. 6): мгновенно за 1 Ярость или бросок Выносливость + Первобытный инстинкт по сложности целевой формы —
// по успеху за каждую форму на пути (порядок: Хомид — Глабро — Кринос — Хиспо — Лупус).

import { Codex } from "../data/codex.mjs";
import { RollDialog } from "../dice/dialog.mjs";
import { VTM20, SYSTEM_PATH } from "../config.mjs";
import { totemOf } from "./coterie.mjs";
import { septOf } from "./sept.mjs";
import { umbraOf } from "./umbra.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Werewolf.${k}`, d) : game.i18n.localize(`VTM20.Werewolf.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
export const W = () => Codex.werewolf ?? { breeds: [], auspices: [], tribes: [], forms: [], gifts: [], rites: [], rank: {}, rankNames: [] };
export const giftOf = key => W().gifts.find(g => g.key === key) ?? null;
export const riteOf = key => W().rites.find(r => r.key === key) ?? null;
const byKey = (list, key) => list.find(x => x.key === key) ?? null;
const ORDER = ["homid", "glabro", "crinos", "hispo", "lupus"];

/* ── Окна оборотня: настоящие знаки W:tA (assets/werewolf) и общий вид — шапка со знаком и карточки-действия ── */

// путь от корня: относительный url() в CSS-переменной считался бы от файла стилей
export const wwGlyphSrc = name => foundry.utils.getRoute(`${SYSTEM_PATH}/assets/werewolf/${name}.png`);
/** Знак маской, залитой лунным серебром (цвет задаёт CSS: .r-wg). */
/** Знак рода Фера; у Аджаба, Моколе и Рокеа он длинный и плоский — в узкой ячейке ему дают ширину (is-wide). */
const FERA_WIDE = new Set(["ajaba", "mokole", "rokea"]);
export const feraSym = key => ({ src: wwGlyphSrc(`fera-${key}`), wide: FERA_WIDE.has(key) });
export const wwGlyph = (name, cls = "") => `<span class="r-sym r-wg${cls ? ` ${cls}` : ""}" style="--sym: url('${wwGlyphSrc(name)}')" aria-hidden="true"></span>`;
export const RENOWN_GLYPH = { glory: "glyph-glory", honor: "glyph-honor", wisdom: "glyph-wisdom" };

/** Знаки листа: на рейке и водяным знаком — племя (у Фера — знак рода), на печати под портретом — аугурия (у Фера — тоже знак рода). */
export function werewolfSigil(actor) {
  const w = actor.system.werewolf, D = W(), fera = feraOf(actor);
  const tribe = byKey(D.tribes, w.tribe), aus = byKey(D.auspices, w.auspice);
  return {
    sym: fera ? feraSym(fera.key) : { src: wwGlyphSrc(tribe ? `tribe-${tribe.key}` : "glyph-garou") }, label: fera ? VTM20.label(fera) : tribe?.name ?? "",
    seal: fera ? { sym: feraSym(fera.key), label: VTM20.label(fera) } : { sym: { src: wwGlyphSrc(aus ? `auspice-${aus.key}` : "glyph-luna") }, label: aus?.name ?? t("Garou") }
  };
}

/** Шапка окна: знак в лунном кольце, надзаголовок, заголовок и строка под ним. */
export const wwHead = ({ glyph, icon, kicker = "", title = "", sub = "" }) => `<header class="r-wh">
    <span class="r-wh-sigil">${glyph ? wwGlyph(glyph) : `<i class="fa-solid ${icon ?? "fa-paw"}"></i>`}</span>
    <span class="r-wh-text">${kicker ? `<small>${kicker}</small>` : ""}<b>${title}</b>${sub ? `<span>${sub}</span>` : ""}</span>
  </header>`;

/** Пул строкой с числами: «Выносливость 3 + Первобытный инстинкт 2 = 5». */
function poolNums(actor, a, b) {
  const parts = [a, b].filter(Boolean).map(k => ({ label: actor.traitLabel(k), n: Number(actor.traitValue(k)) || 0 }));
  return `${parts.map(x => `${esc(x.label)} <b>${x.n}</b>`).join(" + ")} = <b>${parts.reduce((n, x) => n + x.n, 0)}</b>`;
}

/**
 * Окно выбора: шапка, пояснение и карточки — щелчок по карточке и есть выбор (без ряда кнопок внизу, закрыть — крестиком).
 * cards: [{ key, glyph | icon, title, sub, note, badge, disabled, cls }]; возвращает key выбранной карточки или null.
 */
async function wwPick({ title, icon = "fa-paw", head = "", lead = "", cards, width = 520, cls = "", after = "" }) {
  let picked = null;
  const card = c => `<button type="button" class="r-wc-card${c.cls ? ` ${c.cls}` : ""}" data-pick="${esc(c.key)}"${c.disabled ? " disabled" : ""}>
      <span class="r-wc-mark">${c.glyph ? wwGlyph(c.glyph) : `<i class="fa-solid ${c.icon ?? "fa-circle"}"></i>`}</span>
      <span class="r-wc-body"><b>${c.title}</b>${c.sub ? `<small>${c.sub}</small>` : ""}${c.note ? `<em>${c.note}</em>` : ""}</span>
      ${c.badge ? `<span class="r-wc-badge">${c.badge}</span>` : ""}</button>`;
  await foundry.applications.api.DialogV2.wait({
    window: { title, icon: `fa-solid ${icon}` }, classes: ["vtm20", "r-dialog", "r-type-werewolf", "r-wc-dlg", ...(cls ? [cls] : [])],
    position: { width }, rejectClose: false,
    content: `<div class="r-wc">${head}${lead ? `<p class="r-wc-lead">${lead}</p>` : ""}<div class="r-wc-cards">${cards.map(card).join("")}</div>${after}</div>`,
    buttons: [{ action: "cancel", label: game.i18n.localize("Cancel") }],
    render: (ev, dlg) => dlg.element.querySelectorAll("[data-pick]").forEach(b => b.addEventListener("click", () => { picked = b.dataset.pick; dlg.close(); }))
  });
  return picked;
}

/** Карточка Гару для шапки и вкладки шкал: порода, аугурия, племя, Ранг, Слава, Ярость, Гнозис, формы. */
export const feraOf = actor => actor?.system.werewolf?.fera ? (W().fera ?? []).find(b => b.key === actor.system.werewolf.fera) ?? null : null;

export function werewolfInfo(actor, dots) {
  const w = actor.system.werewolf, D = W(), fera = feraOf(actor);
  const breed = byKey(D.breeds, w.breed), auspice = byKey(D.auspices, w.auspice), tribe = byKey(D.tribes, w.tribe);
  // need — сколько постоянной этой Славы нужно до следующего Ранга (у Рагабаша — сумма, по отдельности не считается)
  const next = rankNeed(w.auspice, w.rank + 1);
  const renown = ["glory", "honor", "wisdom"].map((k, i) => ({ key: k, label: t(`Renown.${k}`), perm: w.renown[k].permanent, temp: w.renown[k].temporary,
    need: Array.isArray(next) ? next[i] : null, met: Array.isArray(next) && w.renown[k].permanent >= next[i],
    glyph: { src: wwGlyphSrc(RENOWN_GLYPH[k]) }, ready: w.renown[k].temporary >= 10,
    dots: dots(w.renown[k].permanent, 10, { path: `system.werewolf.renown.${k}.permanent` }),
    tempDots: dots(w.renown[k].temporary, 10, { path: `system.werewolf.renown.${k}.temporary`, cls: "is-temp" }) }));
  return {
    breed, auspice, tribe, rank: w.rank, rankName: fera ? "" : D.rankNames?.[w.rank - 1] ?? "", fera,   // звания Рангов — только Гару: у родов Фера в книге своих нет
    feraOptions: [{ key: "", label: t("Garou"), selected: !w.fera },
      ...(D.fera ?? []).map(b => ({ key: b.key, label: VTM20.label(b), selected: b.key === w.fera }))],
    feraDims: (fera?.dims ?? []).filter(d => d.options.length).map(d => ({ key: d.key, label: d.label, value: w.feraSub?.[d.key] ?? "",
      text: d.options.find(o => o.key === w.feraSub?.[d.key])?.text ?? "", picked: VTM20.label(d.options.find(o => o.key === w.feraSub?.[d.key]) ?? {}),
      options: d.options.map(o => ({ key: o.key, name: VTM20.label(o), selected: o.key === w.feraSub?.[d.key] })) })),
    // в шапке — не больше двух выборов рода (остальные — на вкладке Даров)
    get headDims() { return this.feraDims.slice(0, 2); }, get restDims() { return this.feraDims.slice(2); }, packTotem: totemOf(actor), sept: septOf(actor), umbra: umbraOf(actor),
    rage: w.rage.value, ragePerm: w.rage.permanent, gnosis: w.gnosis.value, gnosisPerm: w.gnosis.permanent,
    rageDots: dots(w.rage.permanent, 10, { path: "system.werewolf.rage.permanent" }),
    gnosisDots: dots(w.gnosis.permanent, 10, { path: "system.werewolf.gnosis.permanent" }),
    // текущий пул квадратиками (как временная Воля); Ярость может быть выше постоянной, Гнозис — нет
    rageTemp: dots(w.rage.value, 10, { path: "system.werewolf.rage.value" }),
    gnosisTemp: dots(w.gnosis.value, 10, { path: "system.werewolf.gnosis.value" }).map((d, i) => ({ ...d, locked: i >= w.gnosis.permanent })),
    standing: ["glory", "honor", "wisdom"].map(k => ({ key: k, label: t(`Renown.${k}`), perm: w.renown[k].permanent, temp: w.renown[k].temporary })),
    renown, nextRank: next ? renownText(next) : "", canRank: next ? meetsRank(w, next) : false,
    beast: Math.max(0, w.rage.value - actor.system.willpower.permanent),   // Зверь внутри: −1 к соц. броскам за Ярость сверх Воли
    formName: VTM20.label(byKey(fera ? fera.forms : VTM20.garouForms, w.form) ?? {}), formIcon: fera ? "fa-paw" : byKey(VTM20.garouForms, w.form)?.icon ?? "fa-person",
    form: w.form, forms: (fera ? fera.forms.map(f => ({ ...f, icon: "fa-paw", diff: 6 })) : VTM20.garouForms).map(f => ({ ...f, active: f.key === w.form, mods: modsText(f) })),
    breeds: D.breeds.map(b => ({ value: b.key, label: b.name, selected: b.key === w.breed })),
    auspices: D.auspices.map(b => ({ value: b.key, label: b.name, selected: b.key === w.auspice })),
    tribes: D.tribes.map(b => ({ value: b.key, label: b.name, selected: b.key === w.tribe }))
  };
}

/** Поправки формы строкой: «Сила +4, Ловкость +1 …». */
function modsText(f) {
  const L = k => game.i18n.localize(VTM20.attributes[k]?.label ?? k);
  return [...Object.entries(f.mods ?? {}).map(([k, v]) => `${L(k)} ${v > 0 ? "+" : "−"}${Math.abs(v)}`),
    ...Object.entries(f.set ?? {}).map(([k, v]) => `${L(k)} = ${v}`)].join(", ");
}

/** Требование Славы к Рангу: число (Рагабаш — сумма) или [Слава, Честь, Мудрость]. */
function rankNeed(auspice, rank) {
  const row = W().rank?.[auspice];
  return row && rank >= 1 && rank <= row.length ? row[rank - 1] : null;
}
function renownText(need) {
  return typeof need === "number" ? t("RankSum", { n: need }) : t("RankEach", { g: need[0], h: need[1], w: need[2] });
}
function meetsRank(w, need) {
  const r = w.renown, p = k => r[k].permanent;
  return typeof need === "number" ? p("glory") + p("honor") + p("wisdom") >= need : p("glory") >= need[0] && p("honor") >= need[1] && p("wisdom") >= need[2];
}

/** Свой ли Дар: у Гару — списки породы, аугурии и племени; у Фера — только Дары своего рода. */
export function ownGift(w, g) {
  if (!w) return false;
  if (w.fera) return g.groups.some(x => { if (x.kind !== "fera" || x.key !== w.fera || !x.sub) return x.kind === "fera" && x.key === w.fera;
    const [d, o] = x.sub.split(":"); return w.feraSub?.[d] === o; });
  // у Танцоров Чёрной Спирали племенные Дары — список изгоев blackSpiralDancers
  return g.groups.some(x => (x.kind === "breed" && x.key === w.breed) || (x.kind === "auspice" && x.key === w.auspice)
    || ((x.kind === "tribe" || x.kind === "outsider") && x.key === w.tribe));
}

/** Дары персонажа и доступные к добавлению (свои списки, уровень ≤ Ранга). */
export function giftsView(actor) {
  const w = actor.system.werewolf, own = (w.gifts ?? []).map(giftOf).filter(Boolean);
  const mine = g => ownGift(w, g);
  // откуда Дар: у Фера — только группы своего рода, у Гару — без групп Фера
  const label = g => g.groups.filter(x => w.fera ? x.kind === "fera" && x.key === w.fera : x.kind !== "fera").map(x => x.kind === "fera" ? x.label : x.kind === "breed" ? byKey(W().breeds, x.key)?.name : x.kind === "auspice" ? byKey(W().auspices, x.key)?.name
    : x.kind === "tribe" ? byKey(W().tribes, x.key)?.name : t(`Outsider.${x.key}`)).filter(Boolean).join(" · ");
  const rows = own.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, "ru")).map(g => ({ ...g, own: mine(g), from: label(g),
    pool: g.roll ? poolLabel(actor, g.roll) : "", cost: costText(g.cost) }));
  const have = new Set(w.gifts ?? []);
  const avail = W().gifts.filter(g => !have.has(g.key) && mine(g) && g.level <= Math.max(1, w.rank))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, "ru")).map(g => ({ key: g.key, label: `${g.level} · ${VTM20.label(g)}` }));
  const rites = (w.rites ?? []).map(riteOf).filter(Boolean).sort((a, b) => a.level - b.level).map(r => ({ ...r, pool: poolLabel(actor, r.roll ?? { trait1: "attributes.wits", trait2: "abilities.rituals", byTarget: true }) }));
  const ritesAvail = W().rites.filter(r => !(w.rites ?? []).includes(r.key) && r.level <= Math.max(1, actor.system.abilities.rituals?.value ?? 0))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, "ru")).map(r => ({ key: r.key, label: `${r.level || "—"} · ${VTM20.label(r)} · ${r.kindName}` }));
  return { gifts: rows, avail, rites, ritesAvail };
}

function poolLabel(actor, r) {
  if (!r) return "";
  return [r.trait1 && actor.traitLabel(r.trait1), r.trait2 && actor.traitLabel(r.trait2)].filter(Boolean).join(" + ")
    + (r.byTarget ? ` · ${t("DiffByTarget")}` : r.difficulty ? ` · ${t("Diff", { n: r.difficulty })}` : "");
}
function costText(c = {}) {
  return [c.rage && t("CostRage", { n: c.rage }), c.gnosis && t("CostGnosis", { n: c.gnosis }), c.willpower && t("CostWill", { n: c.willpower })].filter(Boolean).join(", ");
}

/**
 * Слава и Ранг (W20, гл. 3–4) — одно окно. Сверху — медальон Ранга со званием и аугурией и три карточки Славы:
 * постоянная кружками, временная квадратиками (щелчок сразу ставит значение), под карточкой — сколько нужно до следующего Ранга;
 * 10 временных — Признание (+1 постоянная). Ниже, у рассказчика, — награда: поступок из таблицы или своя; ниже нуля сгорает
 * постоянная точка (и превращается в 10 временных).
 */
const ROMAN_RANK = ["0", "I", "II", "III", "IV", "V", "VI"];
export const editStanding = actor => renownAward(actor);
export async function renownAward(actor) {
  const D = W(), gm = game.user.isGM, edit = actor.isOwner, KEYS = ["glory", "honor", "wisdom"];
  const rows = gm ? D.renownAwards ?? [] : [], secs = [...new Set(rows.map(r => r.sec))];
  const sign = n => `${n > 0 ? "+" : "−"}${Math.abs(n)}`;
  // награда чипом: знак Славы и число; полные названия — во всплывающей подсказке
  const chip = v => {
    const parts = KEYS.map((k, j) => [k, v[j]]).filter(([, n]) => n);
    const tip = parts.map(([k, n]) => `${t(`Renown.${k}`)} ${sign(n)}`).join(", ") || "0";
    return `<a class="r-ra-chip ${v.some(x => x < 0) ? "is-neg" : ""}" data-v="${v.join(",")}" data-tooltip="${esc(tip)}">${parts.map(([k, n]) =>
      `<span class="is-${k}${n < 0 ? " is-minus" : ""}">${wwGlyph(RENOWN_GLYPH[k])}${sign(n)}</span>`).join("") || "0"}</a>`;
  };
  const list = secs.map(sec => {
    const own = rows.map((r, ri) => ({ r, ri })).filter(x => x.r.sec === sec);
    return `<section class="r-ra-sec" data-sec="${esc(sec)}"><h4>${esc(sec)} <small>${own.length}</small></h4>${own.map(({ r, ri }) =>
      `<div class="r-ra-row" data-row="${ri}" data-search="${esc((sec + " " + r.text).toLowerCase().replace(/<[^>]+>/g, ""))}">
        <span class="r-ra-text">${r.text}${r.yearly ? ` <small class="r-ra-yearly">${t("RenownYearly")}</small>` : ""}</span>
        <span class="r-ra-chips">${r.v.map(chip).join("")}</span></div>`).join("")}</section>`;
  }).join("");
  // Ранг и три Славы — перерисовываются после каждой правки
  const top = () => {
    const w = actor.system.werewolf, aus = byKey(D.auspices, w.auspice), need = rankNeed(w.auspice, w.rank + 1), p = k => w.renown[k].permanent;
    const nextRoman = ROMAN_RANK[w.rank + 1] ?? w.rank + 1;
    const track = (k, kind, n) => `<div class="r-ws-track is-${kind}">${Array.from({ length: 10 }, (_, i) =>
      `<a class="r-ws-pip ${i < n ? "is-on" : ""}" ${edit ? `data-key="${k}" data-kind="${kind}" data-n="${i + 1}"` : ""}></a>`).join("")}</div>`;
    const card = (k, i) => {
      const r = w.renown[k], each = Array.isArray(need), met = each && p(k) >= need[i];
      return `<section class="r-ws-card">
        <header><span class="r-ws-glyph is-${k}">${wwGlyph(RENOWN_GLYPH[k])}</span><b>${esc(t(`Renown.${k}`))}</b><span class="r-ws-num">${r.permanent}</span></header>
        <small>${esc(t("Permanent"))}</small>${track(k, "permanent", r.permanent)}
        <small>${esc(t("Temporary"))}</small>${track(k, "temporary", r.temporary)}
        <footer class="${met ? "is-met" : ""}">${each ? `<span data-tooltip="${esc(t("NeedTip", { n: nextRoman, need: need[i] }))}"><i class="fa-solid ${met ? "fa-check" : "fa-arrow-up"}"></i> ${t("NeedOf", { have: p(k), need: need[i] })}</span>` : ""}
          ${gm && r.temporary >= 10 ? `<a class="r-ra-recog" data-recog="${k}" data-tooltip="${esc(t("Recognition", { r: t(`Renown.${k}`) }))}"><i class="fa-solid fa-medal"></i> ${t("RecognitionShort")}</a>` : ""}</footer>
      </section>`;
    };
    let next = "";
    if (typeof need === "number") {
      const have = p("glory") + p("honor") + p("wisdom");
      next = `${esc(t("ToRank", { n: nextRoman }))}: ${t("RankSum", { n: need })} <b class="${have >= need ? "is-met" : ""}">${t("NeedOf", { have, need })}</b>`;
    } else if (need) next = `${esc(t("ToRank", { n: nextRoman }))}: ${t("RankEach", { g: need[0], h: need[1], w: need[2] })}`;
    return `<div class="r-ws-rank">
        ${edit ? `<a class="r-ws-step" data-step="-1"><i class="fa-solid fa-chevron-left"></i></a>` : ""}
        <div class="r-ws-medal"><span class="r-ws-roman">${ROMAN_RANK[w.rank] ?? w.rank}</span></div>
        ${edit ? `<a class="r-ws-step" data-step="1"><i class="fa-solid fa-chevron-right"></i></a>` : ""}
        <div class="r-ws-title"><b>${esc((!w.fera && D.rankNames?.[w.rank - 1]) || `${t("Rank")} ${ROMAN_RANK[w.rank] ?? w.rank}`)}</b><span>${aus ? `<span class="r-ws-aus">${wwGlyph(`auspice-${aus.key}`)}</span>` : ""}${esc(aus?.name ?? "")}</span><em>${next}</em></div>
      </div>
      <div class="r-ws-cards">${KEYS.map(card).join("")}</div>`;
  };
  const stepper = k => `<span class="r-ra-step is-${k}" data-tooltip="${esc(t(`Renown.${k}`))}">${wwGlyph(RENOWN_GLYPH[k])}
      <a data-bump="${k}" data-d="-1">−</a><input type="number" name="${k}" value="0" min="-10" max="10"><a data-bump="${k}" data-d="1">+</a></span>`;
  const award = gm ? `<h4 class="r-banner r-ra-cap-head">${t("RenownAwardHead")}</h4>
    <div class="r-ra-tools">
      <input type="search" class="r-ra-search" placeholder="${esc(t("RenownSearch"))}">
      <select class="r-ra-filter"><option value="">${t("RenownAllSecs")}</option>${secs.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select>
    </div>
    <div class="r-ra-list">${list}</div>
    <div class="r-ra-custom">
      <span class="r-ra-cap">${t("RenownCustom")}</span>
      ${KEYS.map(stepper).join("")}
      <input type="text" name="note" placeholder="${esc(t("RenownWhy"))}">
      <button type="button" class="r-ra-give" data-custom><i class="fa-solid fa-award"></i> ${t("RenownGive")}</button>
    </div>` : "";
  const content = `<div class="r-ra${gm ? "" : " is-view"}"><div class="r-ws r-ra-top">${top()}</div>${award}</div>`;
  const apply = async (v, why) => {
    const ren = foundry.utils.deepClone(actor.system.werewolf.renown), lines = [];
    KEYS.forEach((k, j) => {
      if (!v[j]) return;
      let tmp = ren[k].temporary + v[j], perm = ren[k].permanent;
      while (tmp < 0 && perm > 0) { perm -= 1; tmp += 10; lines.push(t("RenownBurn", { r: t(`Renown.${k}`) })); }
      ren[k] = { permanent: perm, temporary: Math.clamp(tmp, 0, 10) };
    });
    await actor.update({ "system.werewolf.renown": ren });
    const what = KEYS.map((k, j) => v[j] ? `${t(`Renown.${k}`)} ${sign(v[j])}` : "").filter(Boolean).join(", ");
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flags: { [game.system.id]: { garou: "renown" } }, content: `<div class="r-notice r-type-werewolf"><i class="fa-solid fa-award"></i> <b>${esc(actor.name)}</b>: ${esc(what)}${why ? ` — ${why}` : ""}${lines.map(l => `<br><em>${esc(l)}</em>`).join("")}</div>` });
  };
  return foundry.applications.api.DialogV2.wait({
    window: { title: t("StandingTitle", { name: actor.name }), icon: "fa-solid fa-award" }, classes: ["vtm20", "r-dialog", "r-type-werewolf", "r-ra-dlg", "r-wc-dlg", "r-ww-standing-dlg"],
    position: gm ? { width: 780, height: 820 } : { width: 600 }, content, rejectClose: false,
    buttons: [{ action: "close", label: t("Close") }],
    render: (ev, dlg) => {
      const root = dlg.element, redraw = () => { root.querySelector(".r-ra-top").innerHTML = top(); };
      const filter = () => {
        const q = root.querySelector(".r-ra-search").value.trim().toLowerCase(), sec = root.querySelector(".r-ra-filter").value;
        for (const box of root.querySelectorAll(".r-ra-sec")) {
          let any = false;
          for (const r of box.querySelectorAll(".r-ra-row")) { r.hidden = !!q && !r.dataset.search.includes(q); any ||= !r.hidden; }
          box.hidden = !any || (!!sec && box.dataset.sec !== sec);
        }
      };
      root.querySelector(".r-ra-search")?.addEventListener("input", filter);
      root.querySelector(".r-ra-filter")?.addEventListener("change", filter);
      root.addEventListener("click", async e => {
        // кружок или квадратик Славы: щелчок по последнему закрашенному — снять его
        const pip = e.target.closest(".r-ws-pip[data-key]");
        if (pip) {
          const { key, kind } = pip.dataset, n = Number(pip.dataset.n), cur = actor.system.werewolf.renown[key][kind];
          await actor.update({ [`system.werewolf.renown.${key}.${kind}`]: cur === n ? n - 1 : n }); redraw(); return;
        }
        const step = e.target.closest("[data-step]");
        if (step) { await actor.update({ "system.werewolf.rank": Math.clamp(actor.system.werewolf.rank + Number(step.dataset.step), 0, 6) }); redraw(); return; }
        const c = e.target.closest(".r-ra-chip");
        if (c) { const row = rows[Number(c.closest("[data-row]").dataset.row)]; await apply(c.dataset.v.split(",").map(Number), row.text); c.classList.add("is-done"); redraw(); return; }
        const b = e.target.closest("[data-bump]");
        if (b) { const inp = root.querySelector(`input[name=${b.dataset.bump}]`); inp.value = Math.clamp((Number(inp.value) || 0) + Number(b.dataset.d), -10, 10); return; }
        if (e.target.closest("[data-custom]")) {
          const v = KEYS.map(k => Number(root.querySelector(`input[name=${k}]`).value) || 0);
          if (!v.some(Boolean)) return ui.notifications.info(t("RenownNothing"));
          await apply(v, esc(root.querySelector("input[name=note]").value.trim()));
          KEYS.forEach(k => { root.querySelector(`input[name=${k}]`).value = 0; });
          root.querySelector("input[name=note]").value = "";
          redraw(); return;
        }
        const rk = e.target.closest("[data-recog]")?.dataset.recog;
        if (rk) {
          const r = actor.system.werewolf.renown[rk];
          await actor.update({ [`system.werewolf.renown.${rk}`]: { permanent: Math.min(10, r.permanent + 1), temporary: r.temporary - 10 } });
          await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-werewolf"><i class="fa-solid fa-medal"></i> ${esc(t("RecognitionDone", { name: actor.name, r: t(`Renown.${rk}`) }))}</div>` });
          redraw();
        }
      });
    }
  });
}

/** Потратить Ярость или Гнозис (текущий пул). */
export async function spend(actor, what, n = 1) {
  const cur = actor.system.werewolf[what].value;
  if (cur < n) { ui.notifications.warn(t(what === "rage" ? "NoRage" : "NoGnosis", { n })); return false; }
  await actor.update({ [`system.werewolf.${what}.value`]: cur - n });
  return true;
}

/** Смена формы: за Ярость мгновенно или бросок по сложности целевой формы (успехов — по числу шагов). */
export async function changeForm(actor, key) {
  const w = actor.system.werewolf, fera = feraOf(actor), list = fera ? fera.forms.map(x => ({ ...x, icon: "fa-paw", diff: 6 })) : VTM20.garouForms;
  const f = byKey(list, key);
  if (!f || key === w.form) return null;
  // Фера: шаги — по порядку своих форм; у Гару — Хомид — Глабро — Кринос — Хиспо — Лупус
  const order = fera ? list.map(x => x.key) : ORDER, cur = order.includes(w.form) ? w.form : order[0];
  const steps = Math.max(1, Math.abs(order.indexOf(key) - order.indexOf(cur)));
  // дорожка форм: откуда, куда и формы на пути; поправки целевой формы — чипами
  const from = order.indexOf(cur), to = order.indexOf(key), lo = Math.min(from, to), hi = Math.max(from, to);
  const L = k => game.i18n.localize(VTM20.attributes[k]?.label ?? k);
  const track = `<div class="r-wf-track">${order.map((k, i) => { const x = byKey(list, k);
    return `<span class="r-wf-node${i === from ? " is-from" : ""}${i === to ? " is-to" : ""}${i > lo && i < hi ? " is-path" : ""}"><i class="fa-solid ${x?.icon ?? "fa-paw"}"></i><small>${esc(x?.name ?? k)}</small></span>`; }).join("")}</div>`;
  const mods = [...Object.entries(f.mods ?? {}).map(([k, v]) => `<span class="r-wf-mod ${v > 0 ? "is-up" : "is-down"}">${esc(L(k))} ${v > 0 ? "+" : "−"}${Math.abs(v)}</span>`),
    ...Object.entries(f.set ?? {}).map(([k, v]) => `<span class="r-wf-mod">${esc(L(k))} = ${v}</span>`)].join("");
  const how = await wwPick({ title: t("FormTitle", { form: f.name }), icon: f.icon, width: 540,
    head: `${track}${mods ? `<div class="r-wf-mods">${mods}</div>` : ""}`,
    lead: f.delirium ? `<i class="fa-solid fa-eye-low-vision"></i> ${t("FormDeliriumNote")}` : "",
    cards: [
      { key: "rage", glyph: "glyph-rage", title: t("FormInstant"), sub: t("FormInstantSub", { n: w.rage.value }), disabled: w.rage.value < 1, cls: "is-rage" },
      { key: "roll", icon: "fa-dice-d10", title: t("FormRoll"), sub: `${poolNums(actor, "attributes.stamina", "abilities.primalUrge")} · ${t("Diff", { n: f.diff })}`,
        note: t("FormNeedSteps", { n: steps }) }
    ] });
  if (how === "rage") {
    if (!(await spend(actor, "rage"))) return null;
    await actor.update({ "system.werewolf.form": key });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${t("FormDone", { name: esc(actor.name), form: esc(f.name) })}</p>` });
    if (f.delirium && sceneWitnesses(actor).length) await delirium(actor);
    return true;
  }
  if (how === "roll") {
    return RollDialog.prompt(actor, { title: t("FormTitle", { form: f.name }), trait1: "attributes.stamina", trait2: "abilities.primalUrge",
      difficulty: f.diff, diffNote: t("FormNeed", { n: steps }), onRolled: async r => {
        if ((r?.successes ?? 0) >= steps) {
          await actor.update({ "system.werewolf.form": key });
          if (f.delirium && sceneWitnesses(actor).length) await delirium(actor);
        }
      } });
  }
  return null;
}

/** Бросок Дара: пул из текста Дара (если найден), иначе — выбор в окне; цена списывается до броска. */
export async function rollGift(actor, key) {
  const g = giftOf(key);
  if (!g) return null;
  for (const [what, n] of Object.entries(g.cost ?? {})) {
    if (what === "willpower") continue;                          // Воля — в окне броска, как обычно
    if (!(await spend(actor, what, n))) return null;
  }
  const r = g.roll ?? {};
  return RollDialog.prompt(actor, { title: g.name, trait1: r.trait1 || "attributes.wits", trait2: r.trait2 || undefined,
    difficulty: r.difficulty || 6, diffNote: r.byTarget || !g.roll ? t("DiffByTargetNote") : "" });
}

/** Ритуал: Смекалка + Ритуалы (или пул из текста), сложность по цели. */
export function rollRite(actor, key) {
  const r = riteOf(key);
  if (!r) return null;
  const p = r.roll ?? { trait1: "attributes.wits", trait2: "abilities.rituals", difficulty: 7 };
  return RollDialog.prompt(actor, { title: r.name, trait1: p.trait1, trait2: p.trait2, difficulty: p.difficulty || 7, diffNote: t("DiffByTargetNote") });
}

/** Проверка бешенства (W20, гл. 6): бросок текущей Ярости; 4+ успеха — бешенство (Ранг 5 — 5+); Ранг 3–4 — сложность +1/+2. */
/** Сложность броска Ярости по Луне (W20, гл. 6): новая 8, серп 7, половина 6, выпуклая 5, полная 4. */
const MOON_CLASS = { new: "new", waxingCrescent: "crescent", waningCrescent: "crescent", firstQuarter: "half", lastQuarter: "half",
  waxingGibbous: "gibbous", waningGibbous: "gibbous", full: "full" };
const MOON_DIFF = { new: 8, crescent: 7, half: 6, gibbous: 5, full: 4 };
const AUSPICE_MOON = { ragabash: "new", theurge: "crescent", philodox: "half", galliard: "gibbous", ahroun: "full" };

/**
 * Бешенство (W20, гл. 6): бросок Ярости, сложность по Луне хроники; −1, если Луна аугурии или в Криносе (не вместе);
 * Ранг 3+ — сложность выше. 4+ успеха — бешенство (Ранг 5 — 5+, Ранг 6 — 6+); 6+ — Хватка Червя.
 */
export async function frenzyCheck(actor) {
  const w = actor.system.werewolf, rank = w.rank;
  const { moonPhase } = await import("./calendar.mjs");
  const m = moonPhase(), cls = MOON_CLASS[m.key] ?? "half";
  const minus = AUSPICE_MOON[w.auspice] === cls || w.form === "crinos" ? 1 : 0;
  const add = rank >= 4 ? 2 : rank === 3 ? 1 : 0, need = rank >= 6 ? 6 : rank >= 5 ? 5 : 4;
  const diff = MOON_DIFF[cls] - minus + add;
  return RollDialog.prompt(actor, { title: t("Frenzy"), trait1: "werewolf.rage", difficulty: diff,
    diffNote: t("FrenzyMoon", { moon: `${m.glyph} ${m.label}`, n: need }),
    onRolled: async r => {
      const s = r?.successes ?? 0;
      if (s < need) return;
      await actor.toggleStatusEffect?.("r-frenzy", { active: true });
      const thrall = s >= 6;
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flags: { [game.system.id]: { garou: thrall ? "thrall" : "frenzy" } },
        content: `<div class="r-notice r-type-werewolf ${thrall ? "is-warn" : ""}">
        <p><i class="fa-solid fa-fire"></i> ${t("FrenzyOn", { name: esc(actor.name) })}</p><p>${t("FrenzyKinds")}</p>
        ${thrall ? `<p><b><i class="fa-solid fa-skull"></i> ${t("ThrallTitle")}</b> ${t(`Thrall.${w.breed}`)}</p>` : ""}
        <p><small>${t("FrenzyExit", { n: w.rage.value })}</small></p></div>` });
    } });
}

/** Харано (W20, гл. 6): включение и снятие отметки — запись для рассказчика и «Летописи сессии». */
export function registerGarouLog() {
  const note = (actor, on) => game.user.isGM && actor && ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: ChatMessage.getWhisperRecipients("GM"),
    flags: { [game.system.id]: { garou: on ? "harano" : "haranoEnd" } },
    content: `<div class="r-notice r-type-werewolf"><i class="fa-solid fa-cloud-rain"></i> ${t(on ? "HaranoOn" : "HaranoOff", { name: esc(actor.name) })}</div>` });
  Hooks.on("createActiveEffect", ef => { if (ef.statuses?.has("r-harano")) note(ef.parent, true); });
  Hooks.on("deleteActiveEffect", ef => { if (ef.statuses?.has("r-harano")) note(ef.parent, false); });
}

/* ── Боевые шрамы (W20, гл. 6): за каждый — временная Слава ─────────── */

export const scarOf = key => (W().scars ?? []).find(s => s.key === key) ?? null;
export async function addScar(actor, key) {
  const sc = scarOf(key);
  if (!sc) return;
  const g = actor.system.werewolf.renown.glory;
  await actor.update({ "system.werewolf.scars": [...actor.system.werewolf.scars, key], "system.werewolf.renown.glory.temporary": g.temporary + sc.glory });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flags: { [game.system.id]: { garou: "scar" } }, content: `<div class="r-notice r-type-werewolf"><i class="fa-solid fa-bandage"></i> ${t("ScarAdded", { name: esc(actor.name), scar: esc(sc.name), n: sc.glory })}<br><small>${sc.effect}</small></div>` });
}
export async function removeScar(actor, i) {
  const list = [...actor.system.werewolf.scars];
  list.splice(i, 1);
  return actor.update({ "system.werewolf.scars": list });
}
/** Выбор боевого шрама карточками (W20, гл. 6: таблица шрамов; какой — решает рассказчик). */
export async function pickScar(actor, lead = "") {
  const key = await wwPick({ title: t("ScarPick"), icon: "fa-bandage", width: 620,
    head: wwHead({ icon: "fa-bandage", kicker: esc(actor.name), title: t("ScarPick"), sub: t("ScarPickSub") }), lead,
    cards: (W().scars ?? []).map(s => ({ key: s.key, icon: "fa-bandage", title: esc(s.name), sub: esc(s.effect), badge: `+${s.glory}` })) });
  return key ? addScar(actor, key) : null;
}

/** Нужно успехов на броске Ярости для бешенства: 4, у Ранга 5 — 5, у Ранга 6 — 6 (W20, гл. 6). */
const frenzyNeed = rank => rank >= 6 ? 6 : rank >= 5 ? 5 : 4;
const sceneKey = () => game.combat?.id ?? canvas?.scene?.id ?? "";

/**
 * Остаться в строю (W20, гл. 6, «Ярость»): ниже Обездвиженного — бросок Ярости сл. 8, каждый успех лечит уровень любого урона
 * (сначала губительный, затем летальный, ударный); раз в сцену. Бросок Ярости грозит бешенством, а рана остаётся боевым шрамом.
 */
export async function stayUp(actor) {
  const h = actor.system.health, w = actor.system.werewolf, scene = sceneKey();
  if (h.bashing + h.lethal + h.aggravated < 7) return ui.notifications.warn(t("StayUpNotDown"));
  if (scene && actor.getFlag(game.system.id, "stayUp") === scene) return ui.notifications.warn(t("StayUpUsed"));
  if (w.rage.value < 1) return ui.notifications.warn(t("NoRage", { n: 1 }));
  const say = html => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flags: { [game.system.id]: { garou: "stayUp" } },
    content: `<div class="r-notice r-type-werewolf">${html}</div>` });
  return RollDialog.prompt(actor, { title: t("StayUp"), trait1: "werewolf.rage", difficulty: 8, diffNote: t("StayUpNote"), onRolled: async r => {
    if (scene) await actor.setFlag(game.system.id, "stayUp", scene);
    const s = r?.successes ?? 0;
    if (s < 1) return say(`<i class="fa-solid fa-heart-crack"></i> ${t("StayUpFail", { name: esc(actor.name) })}`);
    let left = s;
    for (const type of ["aggravated", "lethal", "bashing"]) {
      const n = Math.min(left, actor._source.system.health[type]);
      if (n > 0) { await actor.healDamage(type, n); left -= n; }
    }
    const frenzy = s >= frenzyNeed(w.rank);
    if (frenzy) await actor.toggleStatusEffect?.("r-frenzy", { active: true });
    await say(`<i class="fa-solid fa-person-rays"></i> ${t("StayUpDone", { name: esc(actor.name), n: s - left })}${frenzy ? `<br><b><i class="fa-solid fa-fire"></i> ${t("FrenzyOn", { name: esc(actor.name) })}</b>` : ""}`);
    pickScar(actor, t("StayUpScar"));   // отдельным окном — окно броска закрывается сразу
  } });
}

/**
 * Восстановление Ярости (W20, гл. 6): при первом взгляде на Луну за ночь — новолуние 1, убывающая 2, половина или растущая 3,
 * полная 4, Луна своей аугурии — вся Ярость; катастрофа, унижение, начало стычки — по 1; в начале истории — бросить кубик:
 * столько Ярости сейчас (может быть больше постоянной). Луна и «по 1» — не выше постоянной (правило системы: книга о потолке молчит).
 */
const MOON_RAGE = { new: 1, waningCrescent: 2, waningGibbous: 2, waxingCrescent: 3, firstQuarter: 3, lastQuarter: 3, waxingGibbous: 3, full: 4 };
export async function regainRage(actor) {
  const w = actor.system.werewolf, perm = w.rage.permanent, cur = w.rage.value;
  const { moonPhase, nightNumber } = await import("./calendar.mjs");
  const m = moonPhase(), night = nightNumber(), seen = actor.getFlag(game.system.id, "moonNight") === night;
  const own = !!w.auspice && AUSPICE_MOON[w.auspice] === MOON_CLASS[m.key];
  const moonGain = own ? Math.max(0, perm - cur) : Math.max(0, Math.min(MOON_RAGE[m.key] ?? 0, perm - cur));
  const pick = await wwPick({ title: t("RageRegain"), icon: "fa-moon", width: 560,
    head: wwHead({ glyph: "glyph-rage", kicker: esc(actor.name), title: t("RageRegain"), sub: t("RageNow", { n: cur, p: perm }) }),
    cards: [
      { key: "moon", glyph: "glyph-luna", title: `${m.glyph} ${t("RageMoon", { moon: m.label })}`, disabled: seen || !moonGain,
        sub: seen ? t("RageMoonSeen") : own ? t("RageMoonOwn") : t("RageMoonGain", { n: MOON_RAGE[m.key] ?? 0 }), badge: !seen && moonGain ? `+${moonGain}` : "" },
      { key: "story", icon: "fa-dice-d10", title: t("RageStory"), sub: t("RageStorySub") },
      { key: "one", icon: "fa-plus", title: t("RageOne"), sub: t("RageOneSub"), disabled: cur >= perm, badge: cur < perm ? "+1" : "" }
    ] });
  if (!pick) return null;
  let to = cur;
  if (pick === "moon") { to = cur + moonGain; await actor.setFlag(game.system.id, "moonNight", night); }
  else if (pick === "one") to = Math.min(perm, cur + 1);
  else {
    const roll = await new Roll("1d10").evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: t("RageStory") });
    to = roll.total;
  }
  await actor.update({ "system.werewolf.rage.value": to });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flags: { [game.system.id]: { garou: "rage" } },
    content: `<div class="r-notice r-type-werewolf"><i class="fa-solid fa-moon"></i> ${t("RageRegainDone", { name: esc(actor.name), from: cur, to })}</div>` });
}

/**
 * Восстановление Гнозиса (W20, гл. 9; не выше постоянного): медитация — Сообразительность + Загадки, сл. 8, 1 Гнозис за успех
 * (не больше 1 за час), раз в день, каждый следующий день той же недели — сложность +1 (до 10); священная охота — весь Гнозис;
 * сделка с духом — по Гнозису за его Эссенцию; между историями — Обаяние + Загадки, 1 за успех (сложности в книге нет —
 * 6, правило системы).
 */
export async function regainGnosis(actor) {
  const w = actor.system.werewolf, perm = w.gnosis.permanent, cur = w.gnosis.value;
  const { nightNumber } = await import("./calendar.mjs");
  const night = nightNumber(), week = Math.floor((night - 1) / 7);
  const med = actor.getFlag(game.system.id, "meditation") ?? {}, sameWeek = med.week === week;
  const today = sameWeek && med.night === night, diff = Math.min(10, 8 + (sameWeek ? med.days ?? 0 : 0));
  const pick = await wwPick({ title: t("GnosisRegain"), icon: "fa-spiral", width: 560,
    head: wwHead({ glyph: "glyph-gnosis", kicker: esc(actor.name), title: t("GnosisRegain"), sub: t("RageNow", { n: cur, p: perm }) }),
    cards: [
      { key: "meditate", icon: "fa-om", title: t("GnosisMeditate"), disabled: today || cur >= perm,
        sub: today ? t("GnosisMeditatedToday") : t("GnosisMeditateSub", { d: diff }) },
      { key: "hunt", glyph: "glyph-spirit", title: t("GnosisHunt"), sub: t("GnosisHuntSub"), disabled: cur >= perm, badge: cur < perm ? `+${perm - cur}` : "" },
      { key: "deal", icon: "fa-handshake", title: t("GnosisDeal"), sub: t("GnosisDealSub"), disabled: cur >= perm, badge: cur < perm ? "+1" : "" },
      { key: "story", icon: "fa-book-open", title: t("GnosisStory"), sub: t("GnosisStorySub"), disabled: cur >= perm }
    ] });
  if (!pick) return null;
  const done = async (to, note = "") => {
    to = Math.clamp(to, 0, perm);
    await actor.update({ "system.werewolf.gnosis.value": to });
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flags: { [game.system.id]: { garou: "gnosis" } },
      content: `<div class="r-notice r-type-werewolf"><i class="fa-solid fa-spiral"></i> ${t("GnosisRegainDone", { name: esc(actor.name), from: cur, to })}${note ? `<br><small>${note}</small>` : ""}</div>` });
  };
  if (pick === "hunt") return done(perm);
  if (pick === "deal") return done(cur + 1);
  const meditate = pick === "meditate";
  if (meditate) await actor.setFlag(game.system.id, "meditation", { week, night, days: (sameWeek ? med.days ?? 0 : 0) + 1 });
  return RollDialog.prompt(actor, { title: t(meditate ? "GnosisMeditate" : "GnosisStory"), trait1: meditate ? "attributes.wits" : "attributes.charisma",
    trait2: "abilities.enigmas", difficulty: meditate ? diff : 6, diffNote: t(meditate ? "GnosisMeditateNote" : "GnosisStoryNote"),
    onRolled: async r => { const s = r?.successes ?? 0; if (s > 0) await done(cur + s, meditate ? t("GnosisHours", { n: Math.min(s, perm - cur) }) : ""); } });
}

/**
 * Склонность к Харано (недостаток, W20, гл. 9): бросок Воли в сцене с неудачей; провал — временное Харано (−1 кубик к каждому пулу),
 * провал с единицами — ещё и временное расстройство; трата Воли откладывает проверку на сцену.
 * Сложности в книге нет — 6 по умолчанию, рассказчик меняет в окне броска (правило системы).
 */
export const HARANO_FLAW = "Склонность к Харано";
export const haranoProne = actor => actor.items.some(i => i.type === "flaw" && i.name === HARANO_FLAW);
export async function haranoCheck(actor) {
  const say = html => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flags: { [game.system.id]: { garou: "harano" } },
    content: `<div class="r-notice r-type-werewolf">${html}</div>` });
  const how = await wwPick({ title: t("HaranoCheck"), icon: "fa-cloud-rain", width: 520,
    head: wwHead({ icon: "fa-cloud-rain", kicker: esc(actor.name), title: t("HaranoCheck"), sub: t("HaranoCheckSub") }),
    cards: [
      { key: "roll", icon: "fa-dice-d10", title: t("HaranoRoll"), sub: t("HaranoRollSub") },
      { key: "delay", icon: "fa-shield-heart", title: t("HaranoDelay"), sub: t("HaranoDelaySub"), disabled: actor.system.willpower.temporary < 1 }
    ] });
  if (how === "delay") {
    if (!(await actor.spendWillpower(1))) return null;
    return say(`<i class="fa-solid fa-shield-heart"></i> ${t("HaranoDelayed", { name: esc(actor.name) })}`);
  }
  if (how !== "roll") return null;
  return RollDialog.prompt(actor, { title: t("HaranoCheck"), trait1: "willpower.permanent", difficulty: 6, diffNote: t("HaranoDiffNote"), noWillpower: true,
    onRolled: async r => {
      if ((r?.successes ?? 0) > 0) return say(`<i class="fa-solid fa-sun"></i> ${t("HaranoHeld", { name: esc(actor.name) })}`);
      await actor.toggleStatusEffect?.("r-harano", { active: true });
      if (r?.outcome === "botch") return say(`<i class="fa-solid fa-cloud-rain"></i> <b>${t("HaranoBotch", { name: esc(actor.name) })}</b>`);
    } });
}

/* ── Уродства метисов (W20, гл. 1; Changing Ways): хотя бы одно врождённое, скрывать — бесчестье ── */

export const deformityOf = key => (W().deformities ?? []).find(d => d.key === key) ?? null;
export const deformityView = actor => (actor.system.werewolf.deformities ?? []).map(deformityOf).filter(Boolean);
export function addDeformity(actor, key) {
  if (!deformityOf(key) || actor.system.werewolf.deformities.includes(key)) return;
  return actor.update({ "system.werewolf.deformities": [...actor.system.werewolf.deformities, key] });
}
export function removeDeformity(actor, key) {
  return actor.update({ "system.werewolf.deformities": actor.system.werewolf.deformities.filter(k => k !== key) });
}

/**
 * Регенерация (W20, гл. 6): худший уровень ударного или летального за ход; в бою — рефлекторный бросок Выносливости сл. 8
 * (провал — нет, провал с единицами — до отдыха нельзя). Хомид и Лупус в породной форме не регенерируют, губительное — 1 в день отдыха.
 */
export async function regenerate(actor) {
  const w = actor.system.werewolf, h = actor.system.health;
  const say = html => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-werewolf">${html}</div>` });
  if (w.breedForm) return ui.notifications.warn(t("RegenBreed"));
  const type = h.lethal > 0 ? "lethal" : h.bashing > 0 ? "bashing" : null;
  if (!type) return ui.notifications.info(t(h.aggravated > 0 ? "RegenAgg" : "RegenNothing"));
  const fight = !!game.combat?.started && game.combat.combatants.some(c => c.actor === actor);
  if (fight) {
    const { rollPool } = await import("../dice/roll.mjs");
    const res = await rollPool({ actor, title: t("Regen"), subtitle: t("RegenStress"), pool: actor.system.attributes.stamina.total, difficulty: 8,
      breakdown: [{ label: actor.traitLabel("attributes.stamina"), value: actor.system.attributes.stamina.total }] });
    if (!(res?.successes > 0)) return say(`<i class="fa-solid fa-heart-crack"></i> ${t(res?.outcome === "botch" ? "RegenBotch" : "RegenFail")}`);
  }
  await actor.healDamage(type, 1);
  return say(`<i class="fa-solid fa-heart-pulse"></i> ${t("RegenDone", { type: game.i18n.localize(VTM20.damageTypes[type].label) })}`);
}

/**
 * Доп. действия за Ярость (W20, гл. 6): 1 очко — 1 действие, не больше половины постоянной Ярости (вверх) за ход;
 * сверх меньшего из Ловкости и Смекалки — +3 ко всем сложностям в этот ход.
 */
export async function rageActions(actor) {
  const w = actor.system.werewolf, at = actor.system.attributes;
  const cap = Math.min(Math.ceil(w.rage.permanent / 2), w.rage.value), free = Math.min(at.dexterity.total, at.wits.total);
  if (cap < 1) return ui.notifications.warn(t("ActionsNone"));
  // карточка — число действий крупно и его цена; сверх меньшего из Ловкости и Смекалки — с пометкой о сложностях
  const n = Number(await wwPick({ title: t("Actions"), icon: "fa-bolt", width: 540,
    head: wwHead({ glyph: "glyph-rage", kicker: esc(actor.name), title: t("ActionsCap", { cap }), sub: t("ActionsFreeSub", { free }) }),
    lead: t("ActionsLead"),
    cards: Array.from({ length: cap }, (_, i) => ({ key: String(i + 1), cls: i + 1 > free ? "is-warn" : "", badge: `${i + 1}`,
      icon: "fa-bolt", title: t("ActionsCost", { n: i + 1 }), sub: i + 1 > free ? t("ActionsFast") : t("ActionsFree") })) })) || 0;
  if (!n) return;
  await actor.update({ "system.werewolf.rage.value": w.rage.value - n });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-werewolf"><i class="fa-solid fa-bolt"></i> ${
    t("ActionsDone", { name: esc(actor.name), n })}${n > free ? ` ${t("ActionsFastNote")}` : ""}</div>` });
}

/* ── Фетиши и талены (W20, гл. 4) ────────────────────────────────────── */

export const fetishOf = key => (W().fetishes ?? []).find(f => f.key === key) ?? null;

/** Шрамы персонажа для вкладки Даров. */
export const scarView = actor => (actor.system.werewolf.scars ?? []).map((k, i) => ({ i, ...(scarOf(k) ?? { name: k, effect: "" }) }));

/** Список фетишей и тален персонажа для вкладки Даров. */
export function fetishView(actor) {
  return (actor.system.werewolf.fetishes ?? []).map((x, i) => ({ ...x, i, data: fetishOf(x.key) })).filter(x => x.data)
    .map(x => ({ i: x.i, key: x.key, attuned: x.attuned, rejected: !!x.rejected, n: x.n, talen: x.data.kind === "talen", name: x.data.name, en: x.data.en, level: x.data.level,
      gnosis: x.data.gnosis, text: x.data.text }));
}
export async function addFetish(actor, key) {
  const f = fetishOf(key);
  if (!f) return;
  const list = foundry.utils.deepClone(actor.system.werewolf.fetishes ?? []), have = list.find(x => x.key === key);
  if (have && f.kind === "talen") have.n += 1;
  else if (!have) list.push({ key, attuned: false, n: 1 });
  return actor.update({ "system.werewolf.fetishes": list });
}
export async function removeFetish(actor, i) {
  const list = foundry.utils.deepClone(actor.system.werewolf.fetishes ?? []);
  list.splice(i, 1);
  return actor.update({ "system.werewolf.fetishes": list });
}
/**
 * Настройка фетиша (W20, гл. 4): Гнозис против Гнозиса фетиша, нужен 1 успех; провал с единицами — фетиш отверг владельца:
 * новая попытка только после примирения с духом (отметку снимает рассказчик).
 */
export function attuneFetish(actor, i) {
  const x = actor.system.werewolf.fetishes[i], f = fetishOf(x?.key);
  if (!f) return;
  if (x.rejected) return ui.notifications.warn(t("FetishRejectedNote", { name: f.name }));
  return RollDialog.prompt(actor, { title: t("Attune", { name: f.name }), trait1: "werewolf.gnosis", difficulty: f.gnosis, diffNote: t("AttuneNote"),
    onRolled: async r => {
      const ok = (r?.successes ?? 0) > 0, botch = r?.outcome === "botch";
      if (!ok && !botch) return;
      const list = foundry.utils.deepClone(actor.system.werewolf.fetishes);
      if (ok) list[i].attuned = true; else list[i].rejected = true;
      await actor.update({ "system.werewolf.fetishes": list });
      if (botch) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flags: { [game.system.id]: { garou: "fetish" } },
        content: `<div class="r-notice r-type-werewolf is-warn"><i class="fa-solid fa-link-slash"></i> ${t("FetishRejected", { name: esc(actor.name), fetish: esc(f.name) })}</div>` });
    } });
}
/** Примирение с духом фетиша (рассказчик): снять отметку «отверг» — можно снова настраивать. */
export async function reconcileFetish(actor, i) {
  const list = foundry.utils.deepClone(actor.system.werewolf.fetishes ?? []);
  if (!list[i]) return;
  list[i].rejected = false;
  return actor.update({ "system.werewolf.fetishes": list });
}
/** Пробудить фетиш или использовать талену: бросок Гнозиса против Гнозиса предмета или трата 1 Гнозиса (талена — и тратится). */
export async function useFetish(actor, i) {
  const x = actor.system.werewolf.fetishes[i], f = fetishOf(x?.key);
  if (!f) return;
  if (f.kind === "fetish" && !x.attuned) return ui.notifications.warn(t("NotAttuned"));
  const talen = f.kind === "talen";
  const how = await wwPick({ title: f.name, icon: "fa-gem", width: 560,
    head: wwHead({ glyph: "glyph-fetish", kicker: t(talen ? "TalenKicker" : "FetishKicker", { n: f.level ?? "—" }), title: esc(f.name), sub: t("FetishGnosis", { g: f.gnosis }) }),
    after: `<div class="r-wc-text">${f.text}</div>`,
    cards: [
      { key: "roll", icon: "fa-dice-d10", title: t("UseRoll"), sub: `${t("Gnosis")} <b>${actor.system.werewolf.gnosis.value}</b> · ${t("Diff", { n: f.gnosis })}`, note: talen ? t("TalenGone") : "" },
      { key: "spend", glyph: "glyph-gnosis", title: t("UseSpend"), sub: t("UseSpendSub", { n: actor.system.werewolf.gnosis.value }), disabled: actor.system.werewolf.gnosis.value < 1 }
    ] });
  if (!how) return;
  const spendTalen = async () => {
    if (f.kind !== "talen") return;
    const list = foundry.utils.deepClone(actor.system.werewolf.fetishes);
    list[i].n -= 1;
    if (list[i].n <= 0) list.splice(i, 1);
    await actor.update({ "system.werewolf.fetishes": list });
  };
  const say = html => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-werewolf"><i class="fa-solid fa-gem"></i> ${html}</div>` });
  if (how === "spend") {
    if (!(await spend(actor, "gnosis", 1))) return;
    await spendTalen();
    return say(t("Awakened", { name: esc(f.name) }));
  }
  return RollDialog.prompt(actor, { title: f.name, trait1: "werewolf.gnosis", difficulty: f.gnosis,
    onRolled: async r => { if ((r?.successes ?? 0) > 0) { await spendTalen(); await say(t("Awakened", { name: esc(f.name) })); } } });
}

/**
 * Создать фетиш или талену обрядом (W20, гл. 7). Фетиш — «Ритуал фетиша»: Смекалка + Ритуалы, сл. 10, каждый потраченный
 * постоянный Гнозис — сложность −2 (предмет очищен три ночи, дух уговорен или побеждён — решает рассказчик).
 * Талена — «Ритуал связывания»: Воля против Гнозиса духа (= Гнозис талены), каждый потраченный Гнозис — Гнозис духа −1.
 * Успех — предмет на листе (фетиш — уже настроен на создателя).
 */
export async function craftFetish(actor, key) {
  const f = fetishOf(key);
  if (!f) return ui.notifications.warn(t("CraftPick"));
  const talen = f.kind === "talen", rite = talen ? "rite-of-binding" : "rite-of-the-fetish", w = actor.system.werewolf;
  const knows = (w.rites ?? []).includes(rite), gn = w.gnosis;
  const max = talen ? gn.value : gn.permanent;
  const diffOf = k => talen ? Math.max(2, f.gnosis - k) : Math.max(3, 10 - 2 * k);
  const n = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("CraftTitle", { name: f.name }), icon: "fa-solid fa-gem" }, classes: ["vtm20", "r-dialog", "r-type-werewolf", "r-wc-dlg", "has-foot"], rejectClose: false,
    position: { width: 540 },
    content: `<div class="r-wc">${wwHead({ glyph: talen ? "glyph-spirit" : "glyph-fetish", kicker: riteOf(rite)?.name ?? rite, title: esc(f.name), sub: t("FetishGnosis", { g: f.gnosis }) })}
      <p class="r-wc-lead">${t(talen ? "CraftTalenHow" : "CraftFetishHow", { g: f.gnosis })}</p>
      ${knows ? "" : `<p class="r-wc-warn"><i class="fa-solid fa-triangle-exclamation"></i> ${t("CraftNoRite", { rite: riteOf(rite)?.name ?? rite })}</p>`}
      <div class="r-wc-stepper"><span>${wwGlyph("glyph-gnosis")} ${t(talen ? "CraftSpendTemp" : "CraftSpendPerm")}</span>
        <a data-d="-1">−</a><input type="number" name="n" value="0" min="0" max="${max}"><a data-d="1">+</a>
        <em>${t("CraftDiff")} <b data-diff>${diffOf(0)}</b></em></div></div>`,
    render: (ev, dlg) => {
      const root = dlg.element, inp = root.querySelector("input[name=n]"), out = root.querySelector("[data-diff]");
      const upd = () => { inp.value = Math.clamp(Number(inp.value) || 0, 0, max); out.textContent = diffOf(Number(inp.value)); };
      root.querySelectorAll(".r-wc-stepper [data-d]").forEach(a => a.addEventListener("click", () => { inp.value = (Number(inp.value) || 0) + Number(a.dataset.d); upd(); }));
      inp.addEventListener("input", upd);
    },
    ok: { label: t("CraftGo"), icon: "fa-solid fa-hand-sparkles", callback: (ev, btn) => Math.clamp(Number(btn.form.elements.n.value) || 0, 0, max) }
  });
  if (n == null) return;
  if (n > 0) await actor.update(talen ? { "system.werewolf.gnosis.value": gn.value - n }
    : { "system.werewolf.gnosis.permanent": gn.permanent - n, "system.werewolf.gnosis.value": Math.min(gn.value, gn.permanent - n) });
  const done = async r => {
    if (!((r?.successes ?? 0) > 0)) return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-werewolf"><i class="fa-solid fa-ghost"></i> ${t("CraftFail", { name: esc(f.name) })}</div>` });
    const list = foundry.utils.deepClone(actor.system.werewolf.fetishes ?? []), have = list.find(x => x.key === key);
    if (have && talen) have.n += 1; else if (!have) list.push({ key, attuned: !talen, n: 1 }); else have.attuned = true;
    await actor.update({ "system.werewolf.fetishes": list });
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-werewolf"><i class="fa-solid fa-gem"></i> ${t("CraftDone", { name: esc(actor.name), item: esc(f.name) })}</div>` });
  };
  return talen
    ? RollDialog.prompt(actor, { title: t("CraftTitle", { name: f.name }), trait1: "willpower", difficulty: Math.max(2, f.gnosis - n), diffNote: t("CraftTalenNote"), onRolled: done })
    : RollDialog.prompt(actor, { title: t("CraftTitle", { name: f.name }), trait1: "attributes.wits", trait2: "abilities.rituals", difficulty: Math.max(3, 10 - 2 * n),
        diffNote: t("CraftFetishNote"), onRolled: done });
}

/* ── Родня Гару (W20 Kinfolk): Дары 1-го уровня своей породы и племени и особые Дары Родни ─── */

const kinGiftOf = key => (W().kinGifts ?? []).find(g => g.key === key) ?? giftOf(key);
/** Цена Дара для Родни в опыте: свой — 15, чужой — 20 (+5 за учителя-Гару — по решению рассказчика). */
const kinCost = (k, g) => (g.groups ? g.groups.some(x => x.key === k.tribe || x.key === k.breed) : g.tribe === k.tribe) ? 15 : 20;

/** Блок «Родня Гару» на листе смертного. */
export function kinfolkInfo(actor) {
  const k = actor.system.kinfolk;
  if (!k) return null;
  const D = W();
  const gifts = k.gifts.map(kinGiftOf).filter(Boolean).map(g => ({ key: g.key, name: g.name, en: g.en, text: g.text, roll: !!g.roll,
    gnosis: /Гнозис/.test(g.text ?? "") }));
  const own = [...(D.kinGifts ?? []).filter(g => g.tribe === k.tribe), ...D.gifts.filter(g => g.level === 1 && g.groups.some(x => x.key === k.tribe || x.key === k.breed))];
  const other = (D.kinGifts ?? []).filter(g => g.tribe !== k.tribe);
  const avail = [...own, ...other].filter(g => !k.gifts.includes(g.key))
    .map(g => ({ key: g.key, label: `${VTM20.label(g)}${g.tribe != null && g.tribe !== k.tribe && !g.groups ? ` (${D.tribes.find(t => t.key === g.tribe)?.name ?? "?"})` : ""} — ${kinCost(k, g)}`, xp: kinCost(k, g) }));
  const numina = (k.numina ?? []).map(x => ({ ...x, data: numenOf(x.key) })).filter(x => x.data).map(x => ({ key: x.key, name: x.data.name, en: x.data.en,
    kind: t(`Numen.${x.data.kind}`), pool: x.data.pool, cost: x.data.cost, text: x.data.text,
    dots: Array.from({ length: 5 }, (_, i) => ({ n: i + 1, filled: i < x.dots })),
    levels: x.data.levels.map(l => ({ ...l, reached: l.n <= x.dots })) }));
  const numAvail = (D.numina ?? []).filter(n => !(k.numina ?? []).some(x => x.key === n.key)).map(n => ({ key: n.key, label: `${VTM20.label(n)} — ${t(`Numen.${n.kind}`)}` }));
  return { on: k.on, tribe: k.tribe, breed: k.breed, gnosis: k.gnosis,
    tribes: D.tribes.map(t => ({ key: t.key, label: VTM20.label(t), selected: t.key === k.tribe })),
    breeds: ["homid", "lupus"].map(b => ({ key: b, label: VTM20.label(D.breeds.find(x => x.key === b) ?? { name: b }), selected: b === k.breed })),
    gifts, avail, numina, numAvail };
}

/* ── Ками (W20 Umbra, гл. 4): избранники Геи — силы, Гейс; новая сила за опыт — (число сил × 3) ── */

export const kamiPowerOf = key => (W().kami?.powers ?? []).find(p => p.key === key) ?? null;
const kamiCount = k => (k.powers ?? []).reduce((n, p) => n + p.n, 0);
export function kamiInfo(actor) {
  const k = actor.system.kami;
  if (!k) return null;
  const D = W().kami ?? {};
  const powers = k.powers.map(p => ({ ...p, data: kamiPowerOf(p.key) })).filter(p => p.data).map(p => ({ key: p.key, n: p.n, name: p.data.name, en: p.data.en,
    text: p.data.text, more: p.data.repeat && p.n < p.data.max, roll: !!p.data.roll, kind: t(`Kami.kind.${p.data.kind}`) }));
  // силы неподвижных — растениям и земле; повторяемые — пока не исчерпан предел покупок
  const avail = (D.powers ?? []).filter(p => (p.kind !== "immobile" || k.kind === "plant") && !k.powers.some(x => x.key === p.key))
    .map(p => ({ key: p.key, label: `${VTM20.label(p)} — ${t(`Kami.kind.${p.kind}`)}` }));
  const st = D.start?.[k.kind] ?? {};
  return { on: k.on, geas: k.geas, gnosis: k.gnosis, rage: k.rage, xp: kamiCount(k) * 3, gnosisMax: st.gnosisMax ?? 10,
    start: t("Kami.start", { wp: st.willpower ?? 3, gnosis: st.gnosis ?? 1 }), geasHint: D.geas ?? "", create: D.create ?? "", examples: D.examples ?? "",
    kinds: ["human", "animal", "plant"].map(x => ({ key: x, label: t(`Kami.form.${x}`), selected: x === k.kind })), powers, avail };
}
/** Сила Ками: новая или ещё одна покупка повторяемой; за опыт — (число сил × 3). «Берсерк» даёт 5 Ярости. */
export async function kamiAdd(actor, key, buy = false) {
  const k = actor.system.kami, p = kamiPowerOf(key);
  if (!p) return;
  const list = k.powers.map(x => ({ ...x })), have = list.find(x => x.key === key);
  if (have && (!p.repeat || have.n >= p.max)) return;
  if (buy) {
    const cost = kamiCount(k) * 3, xp = actor.system.experience;
    if (xp.available < cost) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NoXp", { cost, have: xp.available }));
    const log = foundry.utils.deepClone(actor._source.system.experience.log);
    log.unshift({ amount: -cost, reason: t("Kami.learned", { name: p.name }), date: new Date().toLocaleDateString(game.i18n.lang) });
    await actor.update({ "system.experience.spent": actor._source.system.experience.spent + cost, "system.experience.log": log });
  }
  if (have) have.n += 1; else list.push({ key, n: 1 });
  return actor.update({ "system.kami.powers": list, ...(key === "berserker" && k.rage < 5 ? { "system.kami.rage": 5 } : {}) });
}
/** Снять одну покупку силы (последняя — сила уходит целиком). */
export function kamiRemove(actor, key) {
  const list = actor.system.kami.powers.map(x => ({ ...x })), have = list.find(x => x.key === key);
  if (!have) return;
  return actor.update({ "system.kami.powers": have.n > 1 ? list.map(x => x.key === key ? { ...x, n: x.n - 1 } : x) : list.filter(x => x.key !== key) });
}
/** Сила Ками: бросок, если в книге указан пул, иначе — описание в чат. */
export function kamiUse(actor, key) {
  const p = kamiPowerOf(key);
  if (!p) return;
  if (p.roll) return RollDialog.prompt(actor, { title: p.name, trait1: p.roll.trait1, trait2: p.roll.trait2, difficulty: p.roll.difficulty ?? 6 });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-werewolf"><b>${esc(p.name)}</b><p>${p.text}</p></div>` });
}
/** Ками-животные, растения и земля к Бреду невосприимчивы; человек — с силой «Иммунитет к Бреду». */
export const kamiDeliriumImmune = a => !!a.system.kami?.on && (a.system.kami.kind !== "human" || a.system.kami.powers.some(p => kamiPowerOf(p.key)?.name === "Иммунитет к Бреду"));

/* ── Нумины Родни (W20 Kinfolk, гл. 3): ворожба — только через ритуалы своего уровня, психические феномены ── */

export const numenOf = key => (W().numina ?? []).find(n => n.key === key) ?? null;
export function kinAddNumen(actor, key) {
  const list = actor.system.kinfolk.numina ?? [];
  if (!numenOf(key) || list.some(x => x.key === key)) return;
  return actor.update({ "system.kinfolk.numina": [...list, { key, dots: 1 }] });
}
export const kinRemoveNumen = (actor, key) => actor.update({ "system.kinfolk.numina": actor.system.kinfolk.numina.filter(x => x.key !== key) });
/** Точки нумины; щелчок по последней закрашенной — на точку меньше (как у прочих черт). */
export function kinNumenDots(actor, key, n) {
  const list = actor.system.kinfolk.numina.map(x => ({ ...x }));
  const x = list.find(y => y.key === key);
  if (!x) return;
  x.dots = Math.clamp(x.dots === n ? n - 1 : n, 0, 5);
  return actor.update({ "system.kinfolk.numina": list });
}
/** Бросок нумины: пул из книги (чего нет у смертного — выбрать в окне); сложность Эмпатического исцеления — по уровню. */
export function kinUseNumen(actor, key) {
  const n = numenOf(key), have = actor.system.kinfolk.numina.find(x => x.key === key)?.dots ?? 0;
  if (!n) return;
  const lvl = n.levels.filter(l => l.n <= have).at(-1);
  if (!n.roll) return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-werewolf"><b>${esc(n.name)}</b>${n.text}</div>` });
  return RollDialog.prompt(actor, { title: `${n.name}${have ? ` ${"•".repeat(have)}` : ""}`, trait1: n.roll.trait1 ?? "", trait2: n.roll.trait2 ?? "",
    difficulty: lvl?.difficulty || n.roll.difficulty || 6 });
}
export async function kinAddGift(actor, key, buy = false) {
  const k = actor.system.kinfolk, g = kinGiftOf(key);
  if (!g || k.gifts.includes(key)) return;
  if (buy) {
    const cost = kinCost(k, g), xp = actor.system.experience;
    if (xp.available < cost) return ui.notifications.warn(game.i18n.format("VTM20.Notify.NoXp", { cost, have: xp.available }));
    const log = foundry.utils.deepClone(actor._source.system.experience.log);
    log.unshift({ amount: -cost, reason: t("KinLearned", { name: g.name }), date: new Date().toLocaleDateString(game.i18n.lang) });
    await actor.update({ "system.experience.spent": actor._source.system.experience.spent + cost, "system.experience.log": log });
  }
  return actor.update({ "system.kinfolk.gifts": [...k.gifts, key] });
}
export const kinRemoveGift = (actor, key) => actor.update({ "system.kinfolk.gifts": actor.system.kinfolk.gifts.filter(x => x !== key) });
/** Дар Родни: бросок, если он указан, иначе — описание в чат. */
export function kinUseGift(actor, key) {
  const g = kinGiftOf(key);
  if (!g) return;
  if (g.roll) return RollDialog.prompt(actor, { title: g.name, trait1: g.roll.trait1, trait2: g.roll.trait2, difficulty: g.roll.difficulty ?? 6 });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-werewolf"><b>${esc(g.name)}</b>${g.text}</div>` });
}

/* ── Бред (W20, гл. 6): реакция смертного на Кринос — по его Силе воли ─────── */

const DELIRIUM = [null, "catatonic", "panic", "disbelief", "berserk", "terror", "conciliatory", "controlled", "curious", "bloodlust", "none"];
/** Реакция по Воле 1–10 и помнит ли смотрящий. */
export const deliriumOf = wp => { const n = Math.clamp(wp, 1, 10); return { n, key: DELIRIUM[n], forgets: n <= 6 }; };

/** Бред: целям (выделенным токенам) — реакция по их Воле; без целей — справочная таблица. */
/** Свидетели на сцене: смертные, охотники и гули на текущей сцене (кроме самого оборотня). */
export function sceneWitnesses(actor) {
  const seen = new Set();
  return (canvas?.scene?.tokens?.contents ?? []).map(tk => tk.actor).filter(a => a && a.id !== actor?.id && ["mortal", "hunter", "ghoul"].includes(a.type)
    && !seen.has(a.id) && seen.add(a.id));
}

/** Бред (W20, гл. 7): по целям, иначе по свидетелям на сцене, иначе — таблица для рассказчика. */
export async function delirium(actor) {
  let targets = [...game.user.targets].map(tk => tk.actor).filter(a => a && ["mortal", "hunter", "ghoul"].includes(a.type));
  if (!targets.length) targets = sceneWitnesses(actor);
  const row = (name, wp, kin = false) => { if (kin) return `<tr><td>${esc(name)}</td><td>—</td><td><b>${t("DeliriumKin")}</b></td></tr>`; const d = deliriumOf(wp);
    return `<tr><td>${esc(name)}</td><td>${d.n}</td><td><b>${t(`DeliriumR.${d.key}`)}</b><br><small>${t(d.forgets ? "DeliriumForgets" : d.n <= 8 ? "DeliriumExplains" : "DeliriumRemembers")}</small></td></tr>`; };
  const rows = targets.length ? targets.map(a => row(a.name, a.system.willpower?.permanent ?? 3, !!a.system.kinfolk?.on || kamiDeliriumImmune(a) || (!!a.system.fomor?.on && a.system.fomor.powers.some(p => p.key === "immunity-to-the-delirium")))).join("")
    : Array.from({ length: 10 }, (_, k) => row("", k + 1)).join("");
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: targets.length ? [] : ChatMessage.getWhisperRecipients("GM"),
    content: `<div class="r-notice r-type-werewolf r-delirium"><h4><i class="fa-solid fa-eye-low-vision"></i> ${t("DeliriumTitle")}</h4>
      <p>${t(targets.length ? "DeliriumHint" : "DeliriumNoTargets")}</p><table><thead><tr><th></th><th>${t("DeliriumWp")}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` });
}

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
  const { perkBonus } = await import("../ui/strategy.mjs");
  const pk = perkBonus(actor, "caern"), cut = Math.min(2, pk.dice), d = Math.max(2, diff - cut);
  return RollDialog.prompt(actor, { title: t("StepSideways"), trait1: trait, difficulty: d,
    diffNote: cut ? `${t("GauntletNote")} · ${t("GauntletPerk", { n: cut, name: pk.names.join(", ") })}` : t("GauntletNote"),
    onRolled: async r => { if ((r?.successes ?? 0) > 0) { const { setUmbra } = await import("./umbra.mjs"); await setUmbra(actor, "penumbra"); } } });
}

/* ── Духи Умбры (тип «Существо» с отметкой «Дух»; W20, гл. 7) ─────────── */

export const SPIRIT_RANKS = ["gaffling", "jaggling", "incarna", "celestine"];
export const charmOf = key => {
  // особая Чара образца духа: «~образец:Название», текст — в spirits[].specials
  if (key?.startsWith("~")) {
    const [tpl, name] = key.slice(1).split(/:(.*)/s), sp = spiritTplOf(tpl);
    return { key, name, en: "", general: false, text: sp?.specials?.[name] || game.i18n.format("VTM20.Werewolf.Spirit.specialOf", { name: sp?.name ?? tpl }) };
  }
  return (W().charms ?? []).find(c => c.key === key) ?? null;
};

/* ── Образцы духов (бестиарии основной книги, Умбры, Книги Червя; кин-фетчи Родни) ── */

export const spiritTplOf = key => (W().spirits ?? []).find(s => s.key === key) ?? null;
const SPIRIT_KINDS = ["gaia", "wyld", "weaver", "fetch", "bane"];
/** Образцы, сгруппированные по видам, — для выпадающего списка. */
export const spiritTplGroups = () => SPIRIT_KINDS.map(k => ({ label: t(`Spirit.kind.${k}`),
  list: (W().spirits ?? []).filter(s => s.kind === k).map(s => ({ key: s.key, label: `${VTM20.label(s)} — ${s.rage}/${s.gnosis}/${s.willpower} · ${s.source}` })) }))
  .filter(g => g.list.length);
const spiritData = sp => ({ on: true, rank: sp.rank, rage: sp.rage, gnosis: sp.gnosis, willpower: sp.willpower,
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

/* ── Кин-фетч (W20 Kinfolk, гл. 3): дух-хранитель Родни, клеймо сгорает при Первой Перемене ── */

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

/** Добавить Дар или ритуал; рассказчик может добавить любой. */
export async function addGift(actor, key) {
  const list = actor.system.werewolf.gifts ?? [];
  if (!key || list.includes(key)) return null;
  return actor.update({ "system.werewolf.gifts": [...list, key] });
}
export async function removeGift(actor, key) {
  return actor.update({ "system.werewolf.gifts": (actor.system.werewolf.gifts ?? []).filter(k => k !== key) });
}
export async function addRite(actor, key) {
  const list = actor.system.werewolf.rites ?? [];
  if (!key || list.includes(key)) return null;
  return actor.update({ "system.werewolf.rites": [...list, key] });
}
export async function removeRite(actor, key) {
  return actor.update({ "system.werewolf.rites": (actor.system.werewolf.rites ?? []).filter(k => k !== key) });
}

/* ── Первобытный инстинкт (W20 Changing Ways, гл. 1): частичное превращение и звериные приёмы ── */

/** Окно приёмов: описание каждого и бросок по пулу из книги (у частичного превращения сложность — на усмотрение Рассказчика). */
export async function primalUses(actor) {
  const list = W().primalUses ?? [];
  let picked = null;
  // приём с несколькими бросками («… (1)», «… (2)») — одной карточкой: текст один, у каждого пула своя кнопка
  const groups = [];
  for (const u of list) {
    const name = u.name.replace(/\s*\(\d+\)$/, ""), g = groups.find(x => x.name === name);
    if (g) g.uses.push(u); else groups.push({ name, text: u.text, uses: [u] });
  }
  const roll = u => u.roll ? `<div class="r-pu-line"><span class="r-pu-pool">${poolNums(actor, u.roll.trait1, u.roll.trait2)}</span><span class="r-pu-diff">${u.roll.byTarget ? t("DiffByTarget") : t("Diff", { n: u.roll.difficulty })}</span>
        <button type="button" class="r-pu-roll" data-roll="${esc(u.key)}"><i class="fa-solid fa-dice-d10"></i> ${t("RollShort")}</button></div>` : "";
  const item = g => `<article class="r-pu">
      <header><b>${esc(g.name)}</b></header>${g.uses.map(roll).join("")}
      <div class="r-pu-text" >${g.text}</div></article>`;
  const pu = actor.system.abilities.primalUrge?.value ?? 0;
  await foundry.applications.api.DialogV2.wait({
    window: { title: t("Primal.title"), icon: "fa-solid fa-paw" }, classes: ["vtm20", "r-dialog", "r-type-werewolf", "r-wc-dlg", "r-pu-dlg"],
    position: { width: 680, height: 700 }, rejectClose: false,
    content: `<div class="r-wc">${wwHead({ glyph: "glyph-wyld", kicker: esc(actor.name), title: t("Primal.title"),
        sub: `<span class="r-pu-dots">${"●".repeat(pu)}${"○".repeat(Math.max(0, 5 - pu))}</span> ${t("Primal.hint")}` })}
      <div class="r-pu-list">${groups.map(item).join("")}</div></div>`,
    buttons: [{ action: "cancel", label: game.i18n.localize("Cancel") }],
    render: (ev, dlg) => {
      dlg.element.querySelectorAll("[data-roll]").forEach(b => b.addEventListener("click", () => { picked = b.dataset.roll; dlg.close(); }));
      // длинное описание свёрнуто в три строки — щелчок раскрывает
      dlg.element.querySelectorAll(".r-pu-text").forEach(el => {
        el.classList.toggle("is-long", el.scrollHeight > el.clientHeight + 2);       // стрелка — только у свёрнутого длинного текста
        el.addEventListener("click", () => el.classList.toggle("is-open"));
      });
    }
  });
  const u = list.find(x => x.key === picked);
  if (u?.roll) return RollDialog.prompt(actor, { title: u.name, trait1: u.roll.trait1, trait2: u.roll.trait2, difficulty: u.roll.difficulty,
    diffNote: u.roll.byTarget ? t("DiffByTargetNote") : "" });
}

/* ── Фоморы (W20, гл. 13; Book of the Wyrm, гл. 2): люди и звери, одержимые Бейнами ── */

const FOMORI = () => W().fomori ?? { powers: [], breeds: [] };
export const fomorBreedOf = key => FOMORI().breeds.find(b => b.key === key) ?? null;
/** Сила фомори: из общей таблицы или особая сила породы («~порода:Название»). */
export const fomorPowerOf = key => {
  if (key?.startsWith("~")) {
    const [b, name] = key.slice(1).split(/:(.*)/s), br = fomorBreedOf(b);
    return { key, name, en: "", text: br?.specials?.[name] || t("Fomor.specialOf", { name: br?.name ?? b }), roll: null, repeat: false, max: 1 };
  }
  return FOMORI().powers.find(p => p.key === key) ?? null;
};
export function fomorInfo(actor) {
  const f = actor.system.fomor;
  if (!f) return null;
  const br = fomorBreedOf(f.breed);
  const powers = f.powers.map(p => ({ ...p, data: fomorPowerOf(p.key) })).filter(p => p.data).map(p => ({ key: p.key, n: p.n, name: p.data.name, en: p.data.en,
    text: p.data.text, more: p.data.repeat && p.n < p.data.max, roll: !!p.data.roll }));
  return { on: f.on, rage: f.rage, breed: br, powers,
    breeds: [{ key: "", label: "—", selected: !f.breed }, ...FOMORI().breeds.map(b => ({ key: b.key, label: `${VTM20.label(b)} — ${t("Fomor.wp", { n: b.willpower })}`, selected: b.key === f.breed }))],
    avail: FOMORI().powers.filter(p => !f.powers.some(x => x.key === p.key)).map(p => ({ key: p.key, label: VTM20.label(p) })) };
}
/** Порода фомори: её силы (особые — с текстом породы) и Воля; прежние силы остаются. */
export async function fomorBreed(actor, key) {
  const br = fomorBreedOf(key), f = actor.system.fomor;
  const list = f.powers.map(x => ({ ...x }));
  for (const k of br?.powers ?? []) if (!list.some(x => x.key === k)) list.push({ key: k, n: 1 });
  return actor.update({ "system.fomor.breed": key, "system.fomor.powers": list,
    ...(br ? { "system.willpower.permanent": br.willpower, "system.willpower.temporary": br.willpower } : {}),
    ...(list.some(x => fomorPowerOf(x.key)?.rage) && f.rage < 5 ? { "system.fomor.rage": 5 } : {}) });
}
export function fomorAdd(actor, key) {
  const p = fomorPowerOf(key), f = actor.system.fomor;
  if (!p) return;
  const list = f.powers.map(x => ({ ...x })), have = list.find(x => x.key === key);
  if (have && (!p.repeat || have.n >= p.max)) return;
  if (have) have.n += 1; else list.push({ key, n: 1 });
  // «Берсерк»: 5 Ярости, тратятся как у Гару
  return actor.update({ "system.fomor.powers": list, ...(p.rage && f.rage < 5 ? { "system.fomor.rage": 5 } : {}) });
}
export function fomorRemove(actor, key) {
  const list = actor.system.fomor.powers.map(x => ({ ...x })), have = list.find(x => x.key === key);
  if (!have) return;
  return actor.update({ "system.fomor.powers": have.n > 1 ? list.map(x => x.key === key ? { ...x, n: x.n - 1 } : x) : list.filter(x => x.key !== key) });
}
export function fomorUse(actor, key) {
  const p = fomorPowerOf(key);
  if (!p) return;
  if (p.roll) return RollDialog.prompt(actor, { title: p.name, trait1: p.roll.trait1, trait2: p.roll.trait2, difficulty: p.roll.difficulty ?? 6 });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-werewolf"><b>${esc(p.name)}</b><p>${p.text}</p></div>` });
}
