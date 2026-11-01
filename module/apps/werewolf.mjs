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
    window: { title: t("FormTitle", { form: f.name }), icon: `fa-solid ${f.icon}` }, classes: ["vtm20", "r-dialog"],
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
