// module/apps/werewolf.mjs
// Оборотень (Werewolf: The Apocalypse 20th; данные — data/werewolf.json из справочника books/…/Оборотни/_справочник).
// Гару: system.werewolf — порода, аугурия, племя, Ранг, Слава, Ярость, Гнозис, форма, Дары (ключи), ритуалы (ключи).
// Смена формы (W20, гл. 6): мгновенно за 1 Ярость или бросок Выносливость + Первобытный инстинкт по сложности целевой формы —
// по успеху за каждую форму на пути (порядок: Хомид — Глабро — Кринос — Хиспо — Лупус).

import { Codex } from "../data/codex.mjs";
import { RollDialog } from "../dice/dialog.mjs";
import { VTM20 } from "../config.mjs";
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

/** Карточка Гару для шапки и вкладки шкал: порода, аугурия, племя, Ранг, Слава, Ярость, Гнозис, формы. */
export const feraOf = actor => actor?.system.werewolf?.fera ? (W().fera ?? []).find(b => b.key === actor.system.werewolf.fera) ?? null : null;

export function werewolfInfo(actor, dots) {
  const w = actor.system.werewolf, D = W(), fera = feraOf(actor);
  const breed = byKey(D.breeds, w.breed), auspice = byKey(D.auspices, w.auspice), tribe = byKey(D.tribes, w.tribe);
  const renown = ["glory", "honor", "wisdom"].map(k => ({ key: k, label: t(`Renown.${k}`), perm: w.renown[k].permanent, temp: w.renown[k].temporary,
    dots: dots(w.renown[k].permanent, 10, { path: `system.werewolf.renown.${k}.permanent` }),
    tempDots: dots(w.renown[k].temporary, 10, { path: `system.werewolf.renown.${k}.temporary`, cls: "is-temp" }) }));
  const next = rankNeed(w.auspice, w.rank + 1);
  return {
    breed, auspice, tribe, rank: w.rank, rankName: D.rankNames?.[w.rank - 1] ?? "", fera, feraOptions: [{ key: "", label: t("Garou"), selected: !w.fera },
      ...(D.fera ?? []).map(b => ({ key: b.key, label: VTM20.label(b), selected: b.key === w.fera }))],
    feraDims: (fera?.dims ?? []).filter(d => d.options.length).map(d => ({ key: d.key, label: d.label, value: w.feraSub?.[d.key] ?? "",
      options: d.options.map(o => ({ key: o.key, name: VTM20.label(o), selected: o.key === w.feraSub?.[d.key] })) })), packTotem: totemOf(actor), sept: septOf(actor), umbra: umbraOf(actor),
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
  const label = g => g.groups.filter(x => x.kind !== "fera" || x.key === w.fera).map(x => x.kind === "fera" ? x.label : x.kind === "breed" ? byKey(W().breeds, x.key)?.name : x.kind === "auspice" ? byKey(W().auspices, x.key)?.name
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

/**
 * Награда Славой (W20, гл. 3): поступок из таблицы или своя награда — временная Слава; ниже нуля — сгорает
 * постоянная точка (и превращается в 10 временных); 10 временных — можно просить Признания (+1 постоянная).
 */
export async function renownAward(actor) {
  const rows = W().renownAwards ?? [], secs = [...new Set(rows.map(r => r.sec))];
  const sign = (n, k) => n ? `${n > 0 ? "+" : "−"}${Math.abs(n)} ${t(`RenownShort.${k}`)}` : "";
  const chip = (v, i) => { const lab = ["glory", "honor", "wisdom"].map((k, j) => sign(v[j], k)).filter(Boolean).join(" ") || "0";
    return `<a class="r-ra-chip ${v.some(x => x < 0) ? "is-neg" : ""}" data-v="${v.join(",")}" data-i="${i}">${lab}</a>`; };
  const list = secs.map(sec => `<h4>${esc(sec)}</h4>${rows.map((r, ri) => ({ r, ri })).filter(x => x.r.sec === sec).map(({ r, ri }) =>
    `<div class="r-ra-row" data-row="${ri}" data-search="${esc((sec + " " + r.text).toLowerCase().replace(/<[^>]+>/g, ""))}"><span>${r.text}${r.yearly ? ` <small>${t("RenownYearly")}</small>` : ""}</span>${r.v.map(chip).join("")}</div>`).join("")}`).join("");
  const recog = () => ["glory", "honor", "wisdom"].filter(k => actor.system.werewolf.renown[k].temporary >= 10)
    .map(k => `<a class="r-btn" data-recog="${k}"><i class="fa-solid fa-medal"></i> ${t("Recognition", { r: t(`Renown.${k}`) })}</a>`).join("");
  const content = `<div class="r-ra"><input type="search" class="r-ra-search" placeholder="${esc(t("RenownSearch"))}">
    <div class="r-ra-list">${list}</div>
    <div class="r-ra-custom"><span>${t("RenownCustom")}</span>${["glory", "honor", "wisdom"].map(k => `<label>${t(`RenownShort.${k}`)}<input type="number" name="${k}" value="0"></label>`).join("")}
      <input type="text" name="note" placeholder="${esc(t("RenownWhy"))}"><a class="r-btn" data-custom><i class="fa-solid fa-plus"></i></a></div>
    <div class="r-ra-recog">${recog()}</div></div>`;
  const apply = async (v, why) => {
    const ren = foundry.utils.deepClone(actor.system.werewolf.renown), lines = [];
    ["glory", "honor", "wisdom"].forEach((k, j) => {
      if (!v[j]) return;
      let tmp = ren[k].temporary + v[j], perm = ren[k].permanent;
      while (tmp < 0 && perm > 0) { perm -= 1; tmp += 10; lines.push(t("RenownBurn", { r: t(`Renown.${k}`) })); }
      ren[k] = { permanent: perm, temporary: Math.max(0, tmp) };
    });
    await actor.update({ "system.werewolf.renown": ren });
    const what = ["glory", "honor", "wisdom"].map((k, j) => sign(v[j], k)).filter(Boolean).join(", ");
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-werewolf"><i class="fa-solid fa-award"></i> <b>${esc(actor.name)}</b>: ${esc(what)}${why ? ` — ${why}` : ""}${lines.map(l => `<br><em>${esc(l)}</em>`).join("")}</div>` });
  };
  return foundry.applications.api.DialogV2.wait({
    window: { title: t("RenownAwardTitle", { name: actor.name }), icon: "fa-solid fa-award" }, classes: ["vtm20", "r-dialog", "r-type-werewolf", "r-ra-dlg"],
    position: { width: 640, height: 640 }, content, rejectClose: false,
    buttons: [{ action: "close", label: t("Close"), icon: "fa-solid fa-check", default: true }],
    render: (ev, dlg) => {
      const root = dlg.element, redrawRecog = () => { root.querySelector(".r-ra-recog").innerHTML = recog(); };
      root.querySelector(".r-ra-search").addEventListener("input", e => {
        const q = e.target.value.trim().toLowerCase();
        for (const r of root.querySelectorAll(".r-ra-row")) r.hidden = !!q && !r.dataset.search.includes(q);
      });
      root.addEventListener("click", async e => {
        const c = e.target.closest(".r-ra-chip");
        if (c) { const row = rows[Number(c.closest("[data-row]").dataset.row)]; await apply(c.dataset.v.split(",").map(Number), row.text); c.classList.add("is-done"); redrawRecog(); return; }
        if (e.target.closest("[data-custom]")) {
          const v = ["glory", "honor", "wisdom"].map(k => Number(root.querySelector(`input[name=${k}]`).value) || 0);
          if (v.some(Boolean)) await apply(v, esc(root.querySelector("input[name=note]").value.trim()));
          redrawRecog(); return;
        }
        const rk = e.target.closest("[data-recog]")?.dataset.recog;
        if (rk) {
          const r = actor.system.werewolf.renown[rk];
          await actor.update({ [`system.werewolf.renown.${rk}`]: { permanent: Math.min(10, r.permanent + 1), temporary: r.temporary - 10 } });
          await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-werewolf"><i class="fa-solid fa-medal"></i> ${esc(t("RecognitionDone", { name: actor.name, r: t(`Renown.${rk}`) }))}</div>` });
          redrawRecog();
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
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-werewolf ${thrall ? "is-warn" : ""}">
        <p><i class="fa-solid fa-fire"></i> ${t("FrenzyOn", { name: esc(actor.name) })}</p><p>${t("FrenzyKinds")}</p>
        ${thrall ? `<p><b><i class="fa-solid fa-skull"></i> ${t("ThrallTitle")}</b> ${t(`Thrall.${w.breed}`)}</p>` : ""}
        <p><small>${t("FrenzyExit", { n: w.rage.value })}</small></p></div>` });
    } });
}

/* ── Боевые шрамы (W20, гл. 6): за каждый — временная Слава ─────────── */

export const scarOf = key => (W().scars ?? []).find(s => s.key === key) ?? null;
export async function addScar(actor, key) {
  const sc = scarOf(key);
  if (!sc) return;
  const g = actor.system.werewolf.renown.glory;
  await actor.update({ "system.werewolf.scars": [...actor.system.werewolf.scars, key], "system.werewolf.renown.glory.temporary": g.temporary + sc.glory });
  return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-werewolf"><i class="fa-solid fa-bandage"></i> ${t("ScarAdded", { name: esc(actor.name), scar: esc(sc.name), n: sc.glory })}<br><small>${sc.effect}</small></div>` });
}
export async function removeScar(actor, i) {
  const list = [...actor.system.werewolf.scars];
  list.splice(i, 1);
  return actor.update({ "system.werewolf.scars": list });
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

/** Шрамы персонажа для вкладки Даров. */
export const scarView = actor => (actor.system.werewolf.scars ?? []).map((k, i) => ({ i, ...(scarOf(k) ?? { name: k, effect: "" }) }));

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
export async function delirium(actor) {
  const targets = [...game.user.targets].map(tk => tk.actor).filter(a => a && ["mortal", "hunter", "ghoul"].includes(a.type));
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
  const opts = (sp ? `<option value="${sp.gauntlet}">${t("GauntletSept", { name: esc(sp.name) })} — ${sp.gauntlet}</option>` : "")
    + GAUNTLET.map(([k, n]) => `<option value="${n}" ${k === "street" && !sp ? "selected" : ""}>${t(`Gauntlet.${k}`)} — ${n}</option>`).join("");
  const diff = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("StepSideways"), icon: "fa-solid fa-moon-over-sun" }, classes: ["vtm20", "r-dialog", "r-type-werewolf"], rejectClose: false,
    content: `<p>${t("GauntletAsk")}</p><select name="g">${opts}</select><p class="r-hint">${t("GauntletTimes")}</p>`,
    ok: { label: t("StepGo"), icon: "fa-solid fa-moon", callback: (ev, btn) => Number(btn.form.elements.g.value) }
  });
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
  const key = await foundry.applications.api.DialogV2.wait({
    window: { title: t("Primal.title"), icon: "fa-solid fa-paw" }, classes: ["vtm20", "r-dialog", "r-type-werewolf"],
    content: `<div class="r-primal">${list.map(u => `<details><summary><b>${esc(u.name)}</b>${u.roll ? ` <small>${esc(poolLabel(actor, u.roll))}${u.roll.byTarget ? "" : ` · ${t("Primal.diff", { n: u.roll.difficulty })}`}</small>` : ""}</summary>${u.text}</details>`).join("")}</div>`,
    buttons: list.filter(u => u.roll).map(u => ({ action: u.key, label: u.name })), rejectClose: false });
  const u = list.find(x => x.key === key);
  if (u?.roll) return RollDialog.prompt(actor, { title: u.name, trait1: u.roll.trait1, trait2: u.roll.trait2, difficulty: u.roll.difficulty });
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
