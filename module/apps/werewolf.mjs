// module/apps/werewolf.mjs
// Оборотень (Werewolf: The Apocalypse 20th; данные — data/werewolf.json из справочника books/…/Оборотни/_справочник).
// Гару: system.werewolf — порода, аугурия, племя, Ранг, Слава, Ярость, Гнозис, форма, Дары (ключи), ритуалы (ключи).
// Смена формы (W20, гл. 6): мгновенно за 1 Ярость или бросок Выносливость + Первобытный инстинкт по сложности целевой формы —
// по успеху за каждую форму на пути (порядок: Хомид — Глабро — Кринос — Хиспо — Лупус).

import { Codex } from "../data/codex.mjs";
import { RollDialog } from "../dice/dialog.mjs";
import { VTM20 } from "../config.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Werewolf.${k}`, d) : game.i18n.localize(`VTM20.Werewolf.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
export const W = () => Codex.werewolf ?? { breeds: [], auspices: [], tribes: [], forms: [], gifts: [], rites: [], rank: {}, rankNames: [] };
export const giftOf = key => W().gifts.find(g => g.key === key) ?? null;
export const riteOf = key => W().rites.find(r => r.key === key) ?? null;
const byKey = (list, key) => list.find(x => x.key === key) ?? null;
const ORDER = ["homid", "glabro", "crinos", "hispo", "lupus"];

/** Карточка Гару для шапки и вкладки шкал: порода, аугурия, племя, Ранг, Слава, Ярость, Гнозис, формы. */
export function werewolfInfo(actor, dots) {
  const w = actor.system.werewolf, D = W();
  const breed = byKey(D.breeds, w.breed), auspice = byKey(D.auspices, w.auspice), tribe = byKey(D.tribes, w.tribe);
  const renown = ["glory", "honor", "wisdom"].map(k => ({ key: k, label: t(`Renown.${k}`), perm: w.renown[k].permanent, temp: w.renown[k].temporary,
    dots: dots(w.renown[k].permanent, 10, { path: `system.werewolf.renown.${k}.permanent` }),
    tempDots: dots(w.renown[k].temporary, 10, { path: `system.werewolf.renown.${k}.temporary`, cls: "is-temp" }) }));
  const next = rankNeed(w.auspice, w.rank + 1);
  return {
    breed, auspice, tribe, rank: w.rank, rankName: D.rankNames?.[w.rank - 1] ?? "",
    rage: w.rage.value, ragePerm: w.rage.permanent, gnosis: w.gnosis.value, gnosisPerm: w.gnosis.permanent,
    rageDots: dots(w.rage.permanent, 10, { path: "system.werewolf.rage.permanent" }),
    gnosisDots: dots(w.gnosis.permanent, 10, { path: "system.werewolf.gnosis.permanent" }),
    // текущий пул квадратиками (как временная Воля); Ярость может быть выше постоянной, Гнозис — нет
    rageTemp: dots(w.rage.value, 10, { path: "system.werewolf.rage.value" }),
    gnosisTemp: dots(w.gnosis.value, 10, { path: "system.werewolf.gnosis.value" }).map((d, i) => ({ ...d, locked: i >= w.gnosis.permanent })),
    standing: ["glory", "honor", "wisdom"].map(k => ({ key: k, label: t(`Renown.${k}`), perm: w.renown[k].permanent, temp: w.renown[k].temporary })),
    renown, nextRank: next ? renownText(next) : "", canRank: next ? meetsRank(w, next) : false,
    beast: Math.max(0, w.rage.value - actor.system.willpower.permanent),   // Зверь внутри: −1 к соц. броскам за Ярость сверх Воли
    formName: VTM20.label(byKey(VTM20.garouForms, w.form) ?? {}), formIcon: byKey(VTM20.garouForms, w.form)?.icon ?? "fa-person",
    form: w.form, forms: VTM20.garouForms.map(f => ({ ...f, active: f.key === w.form, mods: modsText(f) })),
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

/** Дары персонажа и доступные к добавлению (свои списки, уровень ≤ Ранга). */
export function giftsView(actor) {
  const w = actor.system.werewolf, own = (w.gifts ?? []).map(giftOf).filter(Boolean);
  const mine = g => g.groups.some(x => (x.kind === "breed" && x.key === w.breed) || (x.kind === "auspice" && x.key === w.auspice) || (x.kind === "tribe" && x.key === w.tribe));
  const label = g => g.groups.map(x => x.kind === "breed" ? byKey(W().breeds, x.key)?.name : x.kind === "auspice" ? byKey(W().auspices, x.key)?.name
    : x.kind === "tribe" ? byKey(W().tribes, x.key)?.name : t(`Outsider.${x.key}`)).filter(Boolean).join(" · ");
  const rows = own.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, "ru")).map(g => ({ ...g, own: mine(g), from: label(g),
    pool: g.roll ? poolLabel(actor, g.roll) : "", cost: costText(g.cost) }));
  const have = new Set(w.gifts ?? []);
  const avail = W().gifts.filter(g => !have.has(g.key) && mine(g) && g.level <= Math.max(1, w.rank))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, "ru")).map(g => ({ key: g.key, label: `${g.level} · ${VTM20.label(g)}` }));
  const rites = (w.rites ?? []).map(riteOf).filter(Boolean).sort((a, b) => a.level - b.level).map(r => ({ ...r, pool: poolLabel(actor, r.roll ?? { trait1: "attributes.wits", trait2: "abilities.rituals" }) }));
  const ritesAvail = W().rites.filter(r => !(w.rites ?? []).includes(r.key) && r.level <= Math.max(1, actor.system.abilities.rituals?.value ?? 0))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, "ru")).map(r => ({ key: r.key, label: `${r.level || "—"} · ${VTM20.label(r)} · ${r.kindName}` }));
  return { gifts: rows, avail, rites, ritesAvail };
}

function poolLabel(actor, r) {
  if (!r) return "";
  return [r.trait1 && actor.traitLabel(r.trait1), r.trait2 && actor.traitLabel(r.trait2)].filter(Boolean).join(" + ")
    + (r.byTarget ? ` · ${t("DiffByTarget")}` : ` · ${t("Diff", { n: r.difficulty })}`);
}
function costText(c = {}) {
  return [c.rage && t("CostRage", { n: c.rage }), c.gnosis && t("CostGnosis", { n: c.gnosis }), c.willpower && t("CostWill", { n: c.willpower })].filter(Boolean).join(", ");
}

/** Слава и Ранг (W20, гл. 4): окно — медальон Ранга со званием и аугурией, три карточки Славы (постоянная — кружками,
 *  временная — квадратиками, щелчок ставит значение) и что нужно до следующего Ранга. */
const RENOWN_ICON = { glory: "fa-sun", honor: "fa-scale-balanced", wisdom: "fa-eye" };
const ROMAN_RANK = ["0", "I", "II", "III", "IV", "V", "VI"];
export async function editStanding(actor) {
  const w = actor.system.werewolf, D = W(), aus = byKey(D.auspices, w.auspice);
  const state = { rank: w.rank, glory: { ...w.renown.glory }, honor: { ...w.renown.honor }, wisdom: { ...w.renown.wisdom } };
  const track = (k, kind, n) => `<div class="r-ws-track is-${kind}">${Array.from({ length: 10 }, (_, i) =>
    `<a class="r-ws-pip ${i < n ? "is-on" : ""}" data-key="${k}" data-kind="${kind}" data-n="${i + 1}"></a>`).join("")}</div>`;
  const card = k => `<section class="r-ws-card" data-card="${k}">
      <header><i class="fa-solid ${RENOWN_ICON[k]}"></i><b>${esc(t(`Renown.${k}`))}</b><span class="r-ws-num" data-num="${k}">${state[k].permanent}</span></header>
      <small>${esc(t("Permanent"))}</small>${track(k, "permanent", state[k].permanent)}
      <small>${esc(t("Temporary"))}</small>${track(k, "temporary", state[k].temporary)}
      <footer data-need="${k}"></footer>
    </section>`;
  const content = `<div class="r-ws">
      <div class="r-ws-rank">
        <a class="r-ws-step" data-step="-1"><i class="fa-solid fa-chevron-left"></i></a>
        <div class="r-ws-medal"><span class="r-ws-roman" data-roman></span></div>
        <a class="r-ws-step" data-step="1"><i class="fa-solid fa-chevron-right"></i></a>
        <div class="r-ws-title"><b data-title></b><span><i class="fa-solid ${aus?.icon ?? "fa-moon"}"></i> ${esc(aus?.name ?? "")}</span><em data-next></em></div>
      </div>
      <div class="r-ws-cards">${["glory", "honor", "wisdom"].map(card).join("")}</div>
    </div>`;
  // что нужно до следующего Ранга: у Рагабаша — сумма, у остальных — по каждой Славе
  const refresh = root => {
    root.querySelector("[data-roman]").textContent = ROMAN_RANK[state.rank] ?? state.rank;
    root.querySelector("[data-title]").textContent = D.rankNames?.[state.rank - 1] ?? t("Rank");
    const need = rankNeed(w.auspice, state.rank + 1), p = k => state[k].permanent;
    const next = root.querySelector("[data-next]");
    if (!need) next.textContent = "";
    else if (typeof need === "number") {
      const have = p("glory") + p("honor") + p("wisdom");
      next.innerHTML = `${esc(t("ToRank", { n: ROMAN_RANK[state.rank + 1] }))}: ${t("RankSum", { n: need })} <b class="${have >= need ? "is-met" : ""}">${have}/${need}</b>`;
    } else next.textContent = t("ToRank", { n: ROMAN_RANK[state.rank + 1] });
    ["glory", "honor", "wisdom"].forEach((k, i) => {
      root.querySelector(`[data-num="${k}"]`).textContent = p(k);
      const f = root.querySelector(`[data-need="${k}"]`);
      if (!need || typeof need === "number") { f.innerHTML = ""; return; }
      const met = p(k) >= need[i];
      f.innerHTML = `<i class="fa-solid ${met ? "fa-check" : "fa-arrow-up"}"></i> ${p(k)} / ${need[i]}`;
      f.classList.toggle("is-met", met);
    });
  };
  const data = await foundry.applications.api.DialogV2.wait({
    window: { title: t("StandingTitle", { name: actor.name }), icon: "fa-solid fa-medal" },
    classes: ["vtm20", "r-dialog", "r-ww-standing-dlg", "r-type-werewolf"], position: { width: 560 }, content,
    buttons: [{ action: "ok", label: t("Save"), icon: "fa-solid fa-check", default: true, callback: () => state }],
    render: (ev, dlg) => {
      const root = dlg.element;
      refresh(root);
      root.querySelectorAll(".r-ws-pip").forEach(el => el.addEventListener("click", () => {
        const { key, kind } = el.dataset, n = Number(el.dataset.n);
        state[key][kind] = state[key][kind] === n ? n - 1 : n;           // щелчок по последней — снять
        el.parentElement.querySelectorAll(".r-ws-pip").forEach((x, i) => x.classList.toggle("is-on", i < state[key][kind]));
        refresh(root);
      }));
      root.querySelectorAll("[data-step]").forEach(el => el.addEventListener("click", () => {
        state.rank = Math.max(0, Math.min(6, state.rank + Number(el.dataset.step)));
        refresh(root);
      }));
    }
  }).catch(() => null);
  if (!data || typeof data !== "object") return null;
  const upd = { "system.werewolf.rank": data.rank };
  for (const k of ["glory", "honor", "wisdom"]) for (const p of ["permanent", "temporary"]) upd[`system.werewolf.renown.${k}.${p}`] = data[k][p];
  return actor.update(upd);
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
  const w = actor.system.werewolf, f = byKey(VTM20.garouForms, key);
  if (!f || key === w.form) return null;
  const steps = Math.abs(ORDER.indexOf(key) - ORDER.indexOf(w.form));
  const how = await foundry.applications.api.DialogV2.wait({
    window: { title: t("FormTitle", { form: f.name }), icon: `fa-solid ${f.icon}` }, classes: ["vtm20", "r-dialog", "r-type-werewolf"],
    content: `<p>${t("FormHow", { steps, diff: f.diff })}</p>${f.mods ? `<p class="r-note">${esc(modsText(f))}</p>` : ""}`,
    buttons: [{ action: "rage", label: t("FormRage"), icon: "fa-solid fa-fire", default: w.rage.value > 0 },
      { action: "roll", label: t("FormRoll"), icon: "fa-solid fa-dice-d10" }]
  }).catch(() => null);
  if (how === "rage") {
    if (!(await spend(actor, "rage"))) return null;
    await actor.update({ "system.werewolf.form": key });
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p>${t("FormDone", { name: esc(actor.name), form: esc(f.name) })}</p>` });
  }
  if (how === "roll") {
    return RollDialog.prompt(actor, { title: t("FormTitle", { form: f.name }), trait1: "attributes.stamina", trait2: "abilities.primalUrge",
      difficulty: f.diff, diffNote: t("FormNeed", { n: steps }), onRolled: async r => {
        if ((r?.successes ?? 0) >= steps) await actor.update({ "system.werewolf.form": key });
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
export function frenzyCheck(actor) {
  const w = actor.system.werewolf, rank = w.rank;
  const add = rank >= 4 ? 2 : rank === 3 ? 1 : 0, need = rank >= 6 ? 6 : rank >= 5 ? 5 : 4;
  return RollDialog.prompt(actor, { title: t("Frenzy"), trait1: "werewolf.rage", difficulty: 6 + add, diffNote: t("FrenzyNote", { n: need }),
    onRolled: async r => {
      if ((r?.successes ?? 0) < need) return;
      await actor.toggleStatusEffect?.("r-frenzy", { active: true });
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><i class="fa-solid fa-fire"></i> ${t("FrenzyOn", { name: esc(actor.name) })}</p>` });
    } });
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
  const opts = Array.from({ length: cap }, (_, i) => `<option value="${i + 1}">${i + 1}${i + 1 > free ? ` — ${t("ActionsFast")}` : ""}</option>`).join("");
  const n = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("Actions"), icon: "fa-solid fa-bolt" }, classes: ["vtm20", "r-dialog", "r-type-werewolf"],
    content: `<p>${t("ActionsText", { cap, free })}</p><label class="r-f"><span>${t("ActionsHow")}</span><select name="n">${opts}</select></label>`,
    ok: { label: t("ActionsSpend"), icon: "fa-solid fa-fire", callback: (ev, btn) => Number(btn.form.elements.n.value) }, rejectClose: false
  });
  if (!n) return;
  await actor.update({ "system.werewolf.rage.value": w.rage.value - n });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-werewolf"><i class="fa-solid fa-bolt"></i> ${
    t("ActionsDone", { name: esc(actor.name), n })}${n > free ? ` ${t("ActionsFastNote")}` : ""}</div>` });
}

/* ── Фетиши и талены (W20, гл. 4) ────────────────────────────────────── */

export const fetishOf = key => (W().fetishes ?? []).find(f => f.key === key) ?? null;

/** Список фетишей и тален персонажа для вкладки Даров. */
export function fetishView(actor) {
  return (actor.system.werewolf.fetishes ?? []).map((x, i) => ({ ...x, i, data: fetishOf(x.key) })).filter(x => x.data)
    .map(x => ({ i: x.i, key: x.key, attuned: x.attuned, n: x.n, talen: x.data.kind === "talen", name: x.data.name, en: x.data.en, level: x.data.level,
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
/** Настройка фетиша: Гнозис против Гнозиса фетиша, нужен 1 успех (провал — фетиш отверг владельца). */
export function attuneFetish(actor, i) {
  const x = actor.system.werewolf.fetishes[i], f = fetishOf(x?.key);
  if (!f) return;
  return RollDialog.prompt(actor, { title: t("Attune", { name: f.name }), trait1: "werewolf.gnosis", difficulty: f.gnosis, diffNote: t("AttuneNote"),
    onRolled: async r => {
      if (!((r?.successes ?? 0) > 0)) return;
      const list = foundry.utils.deepClone(actor.system.werewolf.fetishes);
      list[i].attuned = true;
      await actor.update({ "system.werewolf.fetishes": list });
    } });
}
/** Пробудить фетиш или использовать талену: бросок Гнозиса против Гнозиса предмета или трата 1 Гнозиса (талена — и тратится). */
export async function useFetish(actor, i) {
  const x = actor.system.werewolf.fetishes[i], f = fetishOf(x?.key);
  if (!f) return;
  if (f.kind === "fetish" && !x.attuned) return ui.notifications.warn(t("NotAttuned"));
  const how = await foundry.applications.api.DialogV2.wait({
    window: { title: f.name, icon: "fa-solid fa-gem" }, classes: ["vtm20", "r-dialog", "r-type-werewolf"], rejectClose: false,
    content: `<p>${t(f.kind === "talen" ? "UseTalen" : "UseFetish", { g: f.gnosis })}</p>${f.text}`,
    buttons: [{ action: "roll", label: t("UseRoll"), icon: "fa-solid fa-dice-d10", default: true }, { action: "spend", label: t("UseSpend"), icon: "fa-solid fa-moon" }]
  });
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

/* ── Бред (W20, гл. 6): реакция смертного на Кринос — по его Силе воли ─────── */

const DELIRIUM = [null, "catatonic", "panic", "disbelief", "berserk", "terror", "conciliatory", "controlled", "curious", "bloodlust", "none"];
/** Реакция по Воле 1–10 и помнит ли смотрящий. */
export const deliriumOf = wp => { const n = Math.clamp(wp, 1, 10); return { n, key: DELIRIUM[n], forgets: n <= 6 }; };

/** Бред: целям (выделенным токенам) — реакция по их Воле; без целей — справочная таблица. */
export async function delirium(actor) {
  const targets = [...game.user.targets].map(tk => tk.actor).filter(a => a && ["mortal", "hunter", "ghoul"].includes(a.type));
  const row = (name, wp) => { const d = deliriumOf(wp);
    return `<tr><td>${esc(name)}</td><td>${d.n}</td><td><b>${t(`DeliriumR.${d.key}`)}</b><br><small>${t(d.forgets ? "DeliriumForgets" : d.n <= 8 ? "DeliriumExplains" : "DeliriumRemembers")}</small></td></tr>`; };
  const rows = targets.length ? targets.map(a => row(a.name, a.system.willpower?.permanent ?? 3)).join("")
    : Array.from({ length: 10 }, (_, k) => row("", k + 1)).join("");
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), whisper: targets.length ? [] : ChatMessage.getWhisperRecipients("GM"),
    content: `<div class="r-notice r-type-werewolf r-delirium"><h4><i class="fa-solid fa-eye-low-vision"></i> ${t("DeliriumTitle")}</h4>
      <p>${t(targets.length ? "DeliriumHint" : "DeliriumNoTargets")}</p><table><thead><tr><th></th><th>${t("DeliriumWp")}</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` });
}

/** Шаг в Умбру (W20, гл. 7): бросок Гнозиса против Преграды; зеркало или отражение — сложность −? по решению рассказчика. */
export function stepSideways(actor) {
  return RollDialog.prompt(actor, { title: t("StepSideways"), trait1: "werewolf.gnosis", difficulty: 7, diffNote: t("GauntletNote") });
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
