// module/apps/witch.mjs
// Ведьмовство Тёмных веков (V20 Dark Ages: Tome of Secrets, гл. 2 «Колдовство», с. 68–75) — блок «Сверхъестественное» на листе:
//   · Народная мудрость — необычные, но обычные умения (заворожить зверя, власть над телом, яды и снадобья, фокусы, «чтение мыслей»):
//     готовые броски по книге. Доступна всем; у смертного и гуля — всегда, у Каинита — если знает хоть один заговор.
//   · Заговоры — достоинства «Заговор …» (data/merits.json): 1 Воля и бросок постоянной Воли, сложность 8; «Призвать существо» —
//     после него Обаяние + Житейская мудрость или Оккультизм, сложность — Воля существа + 3.
//   · Пробуждённая ведьма (Основа и Столпы) — у смертного: Основа 1–5 со словом-ключом, до четырёх Столпов 1–5; сила Дисциплины под
//     Столпом — Основа + Столп, сложность 7 (+1, если уровень силы выше Основы); Квинтэссенция — как запас крови вампира
//     поколения 14 − Основа; по точке Квинтэссенции −1 к сложности (до −3); место: родственное −1, враждебное до +3, гибельное +1.
// Хранение — флаг witch: { awake, foundation, keyword, pillars: [{ name, dots }], quint }.

import { VTM20, SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { RollDialog } from "../dice/dialog.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Witch.${k}`, d) : game.i18n.localize(`VTM20.Witch.${k}`);
const abilLabel = k => game.i18n.localize(VTM20.abilities[k]?.label ?? `VTM20.Abil.${k}`);
const attrLabel = k => game.i18n.localize(VTM20.attributes[k]?.label ?? k);

/** Народная мудрость: черты, сложность (null — по цели) и иконка. */
export const FOLK = [
  { key: "animal", attr: "charisma", ability: "animalKen", difficulty: null, icon: "fa-paw" },
  { key: "body", attr: "stamina", ability: "awareness", difficulty: 8, icon: "fa-person-praying" },
  { key: "drugs", attr: "intelligence", ability: "hearthWisdom", difficulty: null, icon: "fa-mortar-pestle" },
  { key: "illusion", attr: "manipulation", ability: "legerdemain", difficulty: 6, icon: "fa-wand-sparkles" },
  { key: "mentalism", attr: "manipulation", ability: "empathy", difficulty: 6, icon: "fa-eye" }
];
const PILLARS_MAX = 4;

const state = actor => foundry.utils.mergeObject({ awake: false, foundation: 1, keyword: "", pillars: [], quint: 0 }, actor.getFlag(SYSTEM_ID, "witch") ?? {}, { inplace: false });
const save = (actor, w) => actor.setFlag(SYSTEM_ID, "witch", w);
/** Запас Квинтэссенции и трата за ход — как у вампира поколения 14 − Основа (Tome of Secrets, с. 74–75). */
export const quintPool = foundation => VTM20.generationOf(14 - Math.clamp(foundation, 1, 9));

/** Заговоры персонажа: его достоинства «Заговор …» (en «Incantation…»). */
const incantationsOf = actor => actor.items.filter(i => i.type === "merit" && (/^Заговор/.test(i.name) || /^Incantation/.test(i.system?.source ?? "")));

/** Данные блока на листе; null — блока нет (не Тёмные века, или Каинит без заговоров). */
export function witchInfo(actor, dots) {
  if (!VTM20.isDarkAges() || !["mortal", "ghoul", "vampire"].includes(actor.type)) return null;
  const inc = incantationsOf(actor);
  if (actor.type === "vampire" && !inc.length) return null;
  const w = state(actor), canAwake = actor.type === "mortal", gen = quintPool(w.foundation);
  return {
    folk: FOLK.map(f => ({ key: f.key, icon: f.icon, name: t(`Folk.${f.key}`), tip: t(`FolkHint.${f.key}`),
      pool: `${attrLabel(f.attr)} + ${abilLabel(f.ability)}` })),
    incantations: inc.map(i => ({ id: i.id, name: i.name.replace(/^Заговор\s*/, "").replace(/^[«(]|[»)]$/g, "") || i.name, summon: /Призвать|Summon/.test(i.name) })),
    canAwake, awake: canAwake && w.awake,
    foundation: w.foundation, keyword: w.keyword,
    foundationDots: dots(w.foundation, 5).map(x => ({ ...x, key: "foundation" })),
    pillars: w.pillars.map((p, i) => ({ i, name: p.name, dotsN: p.dots, dots: dots(p.dots, 5).map(x => ({ ...x, key: `pillar-${i}` })) })),
    canAddPillar: w.pillars.length < PILLARS_MAX,
    quint: { value: Math.min(w.quint, gen.pool), max: gen.pool, perTurn: gen.perTurn,
      boxes: Array.from({ length: gen.pool }, (_, i) => ({ n: i + 1, filled: i < w.quint })) }
  };
}

/* ── Броски ─────────────────────────────────────────────────────────────── */

function rollFolk(actor, key) {
  const f = FOLK.find(x => x.key === key);
  if (!f) return;
  return RollDialog.prompt(actor, { title: t(`Folk.${key}`), subtitle: t("FolkTitle"), trait1: `attributes.${f.attr}`, trait2: `abilities.${f.ability}`,
    difficulty: f.difficulty ?? 6, diffNote: t(`FolkNote.${key}`), effect: `<p>${t(`FolkHint.${key}`)}</p>`, kind: "check" });
}

async function rollIncantation(actor, id) {
  const it = actor.items.get(id);
  if (!it) return;
  const summon = /Призвать|Summon/.test(it.name);
  return RollDialog.prompt(actor, { title: it.name, subtitle: t("IncTitle"), trait1: "willpower.permanent", trait2: "", difficulty: 8, willpowerCost: true,
    diffNote: summon ? t("IncSummonNote") : t("IncNote"), effect: it.system.description ?? "", kind: "check", lockTraits: true });
}

/** Место для колдовства (Tome of Secrets, с. 74–75): родственное −1, враждебное +1…+3, гибельное для пробуждённой — ещё +1. */
const PLACES = [["neutral", 0], ["sympathetic", -1], ["opposed1", 1], ["opposed2", 2], ["opposed3", 3], ["hostile", 1]];

async function rollPillar(actor, i) {
  const w = state(actor), p = w.pillars[i];
  if (!p) return;
  // перед броском: Квинтэссенция (−1 за точку, до 3 и не больше траты за ход), место и уровень силы выше Основы (+1)
  const gen = quintPool(w.foundation), maxQ = Math.min(3, w.quint, gen.perTurn);
  const chips = Array.from({ length: maxQ + 1 }, (_, n) => `<label class="r-atk-chip"><input type="radio" name="q" value="${n}" ${n ? "" : "checked"}><span>${n}</span></label>`).join("");
  const content = `<div class="r-holy-dlg">
    <p class="r-holy-line"><b>${foundry.utils.escapeHTML(p.name || t("Pillar"))}</b> · ${t("Foundation")} ${w.foundation} + ${p.dots} = ${w.foundation + p.dots}</p>
    <div class="r-holy-row"><span>${t("QuintSpend")}</span><div class="r-atk-chips">${chips}</div><small>${t("QuintLeft", { n: w.quint, per: gen.perTurn })}</small></div>
    <label class="r-holy-row"><span>${t("Place")}</span><select name="place">${PLACES.map(([k, d]) => `<option value="${k}">${t(`PlaceKind.${k}`)}${d ? ` (${d > 0 ? "+" : ""}${d})` : ""}</option>`).join("")}</select></label>
    <label class="r-holy-row"><span>${t("Above")}</span><span><input type="checkbox" name="above"> ${t("AboveHint", { f: w.foundation })}</span></label>
  </div>`;
  const opt = await foundry.applications.api.DialogV2.prompt({ window: { title: p.name || t("Pillar"), icon: "fa-solid fa-sun-plant-wilt" }, classes: ["vtm20", "r-dialog", "r-holy"],
    position: { width: 480 }, content, rejectClose: false,
    ok: { label: t("PillarGo"), icon: "fa-solid fa-dice-d10", callback: (ev, btn) => { const f = btn.form.elements; return { q: Number(f.q.value) || 0, place: f.place.value, above: f.above.checked }; } } });
  if (!opt) return;
  const placeD = PLACES.find(([k]) => k === opt.place)?.[1] ?? 0;
  const diff = Math.clamp(7 - opt.q + placeD + (opt.above ? 1 : 0), 2, 10);
  if (opt.q) await save(actor, { ...w, quint: Math.max(0, w.quint - opt.q) });
  const notes = [opt.q ? t("QuintNote", { n: opt.q }) : "", placeD ? `${t(`PlaceKind.${opt.place}`)} ${placeD > 0 ? "+" : ""}${placeD}` : "", opt.above ? t("AboveNote") : ""].filter(Boolean);
  const pool = w.foundation + p.dots;
  return RollDialog.prompt(actor, { title: p.name || t("Pillar"), subtitle: `${t("Awakened")} · ${w.keyword || t("Foundation")}`, difficulty: diff,
    pool, lockTraits: true, breakdown: [{ label: `${t("Foundation")} ${w.keyword ? `(${w.keyword})` : ""}`.trim(), value: w.foundation }, { label: p.name || t("Pillar"), value: p.dots }],
    diffNote: notes.join(" · ") || t("PillarNote", { f: w.foundation }), effect: `<p>${t("PillarHint")}</p>`, kind: "magic" });
}

/* ── Правка блока ───────────────────────────────────────────────────────── */

export async function witchAct(actor, d) {
  const w = state(actor);
  switch (d.op) {
    case "folk": return rollFolk(actor, d.key);
    case "inc": return rollIncantation(actor, d.id);
    case "pillarRoll": return rollPillar(actor, Number(d.i));
    case "awake": w.awake = !w.awake; break;
    case "dots": {
      const n = Number(d.n);
      if (d.key === "foundation") w.foundation = Math.max(1, w.foundation === n ? n - 1 : n);
      else { const p = w.pillars[Number(d.key.split("-")[1])]; if (p) p.dots = p.dots === n ? n - 1 : n; }
      break;
    }
    case "pillarAdd": if (w.pillars.length < PILLARS_MAX) w.pillars.push({ name: "", dots: 1 }); break;
    case "pillarDel": w.pillars.splice(Number(d.i), 1); break;
    case "quint": { const n = Number(d.n); w.quint = w.quint === n ? n - 1 : n; break; }
    default: return null;
  }
  w.quint = Math.min(w.quint, quintPool(w.foundation).pool);
  return save(actor, w);
}

/** Поля ввода блока (слово Основы, имена Столпов) — пишутся во флаг при изменении. */
export async function witchField(actor, name, value) {
  const w = state(actor);
  if (name === "keyword") w.keyword = String(value).slice(0, 40);
  else if (name.startsWith("pillar-")) { const p = w.pillars[Number(name.split("-")[1])]; if (p) p.name = String(value).slice(0, 40); }
  else return;
  return save(actor, w);
}

/** Действие листа: data-action="witch" data-op="…". */
export const WITCH_ACTIONS = { witch(event, target) { return witchAct(this.actor, target.dataset); } };
