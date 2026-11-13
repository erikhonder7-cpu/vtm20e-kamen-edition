// module/apps/creator/actions.mjs
// Мастер создания — кнопки: шаги, выбор клана, Дома, рода, точки, свободные пункты и опыт, черты, «Готово».
// Обработчики вызываются Foundry с this = мастер (ApplicationV2 actions).

import { VTM20 } from "../../config.mjs";
import { Codex } from "../../data/codex.mjs";
import { openClans } from "../clans.mjs";
import { openHouses } from "../houses.mjs";
import { blockerFor } from "../../data/trait-rules.mjs";
import { TIERS, SECTS, EXTRA_DISC_MERIT } from "../creator/rules.mjs";
import { M as mageData } from "../mage.mjs";
import { H as hunterData, growth as hunterGrowth, hasPrevEdge } from "../hunter.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const loc = k => game.i18n.localize(k);


function onGoto(event, target) { this.step = Number(target.dataset.i); this.render(); }
function onNext() { this.step = Math.min(this.steps.length - 1, this.step + 1); this.render(); }
function onPrev() { this.step = Math.max(0, this.step - 1); this.render(); }

function onTier(event, target) {
  const k = target.dataset.tier;
  this.st.tier = k; this.st.xpTotal = TIERS[k]?.xp ?? 0;
  this.render();
}
function onSect(event, target) {
  const s = SECTS.find(x => x.key === target.dataset.sect);
  this.st.sectKey = s.key; this.st.sect = t(s.label);
  // новые числа секты меньше уже распределённого — распределение сбрасывается (факты биографии остаются отмеченными)
  const r = this.rules, st = this.st, reset = [];
  if (this.sum(st.disc) > r.disc) { st.disc = {}; reset.push(t("Sheet.Disciplines")); }
  if (this.sum(st.bg) > r.bg) {
    // «Поколение» Шабаш покупает свободными пунктами — переносим туда
    if (!r.bg && st.bg["Поколение"]) st.free.bg["Поколение"] = (st.free.bg["Поколение"] ?? 0) + st.bg["Поколение"];
    for (const k of Object.keys(st.bg)) st.bg[k] = 0;
    reset.push(t("Sheet.Backgrounds"));
  }
  if (this.sum(st.virt) > r.virt) { st.virt = { conscience: 0, selfControl: 0, courage: 0 }; reset.push(t("Sheet.Virtues")); }
  if (reset.length) ui.notifications.info(t("Creator.SectReset", { what: reset.join(", ") }));
  this.render();
}
/** Дом: Знания чужих Домов, взятые раньше, снимаются; Облик — заново. */
function onHouse(event, target) {
  this.st.house = target.dataset.house;
  this.st.visage = "";
  const ok = new Set(this.clanDisciplines);
  for (const bag of [this.st.disc, this.st.free.disc, this.st.xp.disc]) for (const k of Object.keys(bag)) if (!ok.has(k)) delete bag[k];
  this.render();
}
function onVisage(event, target) { this.st.visage = target.dataset.visage; this.render(); }
/** Гару: выбор рода, породы, аугурии, племени или варианта внутри рода Фера; Дары, которых больше нет в ячейках, — сбрасываются. */
function onGarouPick(event, target) {
  const { what, key } = target.dataset, w = this.st.ww;
  if (what === "fera") { w.fera = key; w.sub = {}; w.gifts = {}; w.extra = []; w.deform = ""; w.renown = { glory: 0, honor: 0, wisdom: 0 }; }
  else if (what.startsWith("sub.")) w.sub[what.slice(4)] = w.sub[what.slice(4)] === key ? "" : key;
  else w[what] = key;
  if (!this.isMetis) w.deform = "";
  this.fixGiftSlots();
  this.render();
}
/** Шаг мага: вкладка группы, фракция, Сущность, родовая Сфера. */
/** Вид гуля (вассал, независимый, ревенант, дампир) — от него зависят Добродетели, Дисциплины и шаги мастера. */
function onGhoulType(event, target) {
  this.st.ghoulType = target.dataset.key;
  if (this.st.ghoulType !== "revenant") this.st.family = "";
  if (this.st.ghoulType !== "dhampir") this.st.dhSwap = false;
  // Дисциплины, распределённые под прежний вид, не всегда разрешены новым — начать их заново
  this.st.disc = {}; this.st.free.disc = {}; this.st.xp.disc = {};
  if (this.step >= this.steps.length) this.step = this.steps.length - 1;
  this.render();
}
function onMagePick(event, target) {
  const { what, key } = target.dataset, g = this.st.mg;
  g[what] = what === "sub" && g.sub === key ? "" : key;        // течение — по желанию: повторный щелчок снимает
  if (what === "faction") g.sub = "";
  // у фракции свои родовые Сферы: прежний выбор не из её списка — сбросить
  if (what === "faction") { const aff = this.mageFaction?.affinity ?? []; if (aff.length && !aff.includes(g.affinity)) g.affinity = aff.length === 1 ? aff[0] : ""; }
  this.render();
}
/** Дар в ячейку (повторный щелчок — снять). */
function onGarouGift(event, target) {
  const { slot, key } = target.dataset, w = this.st.ww;
  if (slot === "general") {                          // общая колонка: снять выбранный или занять первую свободную ячейку
    const gen = this.giftSlots.filter(s => s.key.startsWith("general")).map(s => s.key), had = gen.find(k => w.gifts[k] === key);
    if (had) w.gifts[had] = "";
    else { const free = gen.find(k => !w.gifts[k]); if (!free) return ui.notifications.info(t("GarouCr.GiftGeneralFull", { n: gen.length })); w.gifts[free] = key; }
  } else w.gifts[slot] = w.gifts[slot] === key ? "" : key;
  w.extra = w.extra.filter(k => k !== key);
  this.render();
}
/** Дар сверх трёх — за бонусные очки (W20, гл. 3: 7 за Дар 1-го уровня). */
function onGarouExtra(event, target) {
  const k = target.dataset.key, w = this.st.ww;
  w.extra = w.extra.includes(k) ? w.extra.filter(x => x !== k) : [...w.extra, k];
  this.render();
}
function onEarthbound() { this.st.earthbound = !this.st.earthbound; this.render(); }
function onThrall() { this.st.thrall = !this.st.thrall; if (this.st.thrall) this.st.mark = ""; this.render(); }
/** Особый смертный: Родня, Ками или фомор (повторный щелчок — обычный смертный). */
function onMark(event, target) { const m = target.dataset.mark ?? ""; this.st.mark = m; if (this.st.mark) this.st.thrall = false; this.render(); }
/** Сила Ками (1–3) или фомора (до двух сверх сил породы). */
function onMarkPower(event, target) {
  const k = target.dataset.key, list = this.st.mark === "kami" ? "kamiPowers" : "fomorPowers", cap = this.st.mark === "kami" ? 3 : 2;
  const cur = this.st[list];
  this.st[list] = cur.includes(k) ? cur.filter(x => x !== k) : cur.length < cap ? [...cur, k] : cur;
  this.render();
}
/** Охотник: кредо — основная Добродетель и начальная Убеждённость; Грани чужих путей пересчитываются. */
function onCreed(event, target) { this.st.creed = target.dataset.creed; this.render(); }
/** Кровное право дампира: точка n (повторный щелчок по последней точке — снять). */
function onDhSwap() { this.st.dhSwap = !this.st.dhSwap; this.render(); }
/** Варианты дампира: «сильный» (7/4/3, 12/8/4, ещё точка Дисциплины) и «без Кровных прав» — распределение начинается заново. */
function onDhOption(event, target) {
  const k = target.dataset.key;
  this.st[k] = !this.st[k];
  if (k === "dhStrong") { this.st.attr = {}; this.st.abil = {}; this.st.disc = {}; }
  if (k === "dhNoRights") { this.st.abil = {}; this.st.bloodrights = {}; }
  this.render();
}
function onBrSet(event, target) {
  const k = target.dataset.key, n = Number(target.dataset.n), cur = this.st.bloodrights[k] ?? 0;
  const v = cur === n ? n - 1 : n;
  if (v <= 0) delete this.st.bloodrights[k]; else this.st.bloodrights[k] = v;
  this.render();
}

function onEdgeToggle(event, target) {
  const k = target.dataset.key, list = this.st.edges;
  if (list.includes(k)) {
    // снять Грань — и те выше по тому же пути, которым больше не на что опереться (у Граней книг кредо — свой уровень рядом)
    const E = key => hunterData().edges.find(x => x.key === key);
    let rest = list.filter(x => x !== k), changed = true;
    while (changed) {
      const keep = rest.filter(x => { const e = E(x); return !e || hasPrevEdge(rest, e); });
      changed = keep.length !== rest.length; rest = keep;
    }
    this.st.edges = rest;
  } else {
    const why = this.edgeIssues(k);
    if (why.length) return ui.notifications.warn(why.join(" "));
    list.push(k);
  }
  this.render();
}
/** Доля Веры слуги хозяину: ±1 в пределах половины (вверх). */
function onPactShare(event, target) {
  this.st.pact.share = Math.max(0, Math.min(this.pactShareMax, this.pactShare + Number(target.dataset.d)));
  this.render();
}
/** Дар-прибавка к Характеристике или Способности: ±1, не выше 5 и в пределах пунктов даров. */
function onPactGift(event, target) {
  const { kind, key } = target.dataset, d = Number(target.dataset.d), store = this.st.pact[kind];
  const cur = store[key] ?? 0, next = cur + d;
  if (next < 0 || this.value(kind, key) + next > 5) return;
  store[key] = next;
  if (d > 0 && this.giftUsed > this.giftPoints) { store[key] = cur; ui.notifications.warn(t("Creator.PactNoPoints")); return; }
  if (!store[key]) delete store[key];
  this.render();
}
function onReliquary(event, target) { this.st.reliquary = target.dataset.kind; this.render(); }
function onFaction(event, target) { this.st.faction = this.st.faction === target.dataset.faction ? "" : target.dataset.faction; this.render(); }
function onHouseAtlas() { return openHouses(this.st.house); }
function onClanGroup(event, target) { this.ui.clanGroup = target.dataset.group; this.render(); }
function onClan(event, target) {
  this.st.clan = target.dataset.clan; this.st.clanChoice = "";
  this.st.disc = {}; this.st.free.disc = {}; this.st.xp.disc = {};
  this.render();
}
function onChoice(event, target) { this.st.clanChoice = target.dataset.key; this.render(); }
function onClanAtlas(event, target) { return openClans(target.dataset.clan); }
/** Поколение покупается фактом биографии «Поколение» (01). */
function onGen(event, target) {
  const n = 13 - Number(target.dataset.gen);
  // у Шабаша фактов биографии на старте нет — «Поколение» идёт за свободные пункты
  if (n > 0 && !this.rules.bg) { this.st.bg["Поколение"] = 0; this.st.free.bg["Поколение"] = n; }
  else if (n > 0) this.st.bg["Поколение"] = n; else { delete this.st.bg["Поколение"]; delete this.st.free.bg["Поколение"]; }
  this.render();
}

function onDot(event, target) {
  const { kind, key } = target.dataset;
  const n = Number(target.dataset.n);
  const st = this.st;
  // Слава Рагабаша и Фера: 3 точки в любом сочетании (у прочих аугурий — по книге, без выбора)
  if (kind === "renown") {
    if (this.renownFixed) return;
    st.ww.renown[key] = st.ww.renown[key] === n ? n - 1 : n;
    return this.render();
  }
  if (kind === "disc" && this.isEarthbound && Codex.lore(key)?.dark) { ui.notifications.warn(t("Creator.DarkFreeOnly")); return; }
  const store = kind === "attr" ? st.attr : kind === "abil" ? st.abil : kind === "disc" ? st.disc : kind === "bg" ? st.bg : st.virt;
  const base = this.base(kind, key);
  const extra = (st.free[kind]?.[key] ?? 0) + (st.xp[kind]?.[key] ?? 0);
  const cur = base + (store[key] ?? 0);
  let want = n === cur ? n - 1 : n;
  want = Math.max(base, Math.min(want, (kind === "virt" && this.isHunter && !this.isLost ? 10 : 5) - extra));
  if (kind === "abil") want = Math.min(want, VTM20.creation.abilityCap);
  if (kind === "disc" && this.isWraith) want = Math.min(want, this.wrNums.arcanosMax ?? 3);   // Арканос на создании — не больше 3 (гл. 4)
  if (kind === "disc" && (this.type === "vampire" || this.isDemon) && this.clanDisciplines && !this.clanDisciplines.includes(key) && want > base) {
    ui.notifications.warn(t(this.isDemon ? "Creator.OnlyHouse" : "Creator.OnlyClan")); return;
  }
  if (kind === "disc" && want > base && this.bannedDisc(key)) { ui.notifications.warn(t("Creator.SectBanned", { name: Codex.disciplineLabel(key) })); return; }
  if (kind === "disc" && this.isMage && want + extra > this.morality) { ui.notifications.warn(loc("VTM20.MageCr.OverArete")); want = Math.max(base, this.morality - extra); }
  if (kind === "bg" && want > base && !this.rules.bg) { ui.notifications.warn(t("Creator.SabbatNoBg")); return; }
  store[key] = want - base;
  this.render();
}

function onPrio(event, target) {
  const { group, kind } = target.dataset, i = Number(target.dataset.i);
  const arr = kind === "attr" ? this.st.attrPrio : this.st.abilPrio;
  const j = arr.indexOf(group);
  [arr[i], arr[j]] = [arr[j], arr[i]];
  this.render();
}

function onAddDisc(event, target) {
  const sel = target.closest(".r-toolbar")?.querySelector("select[name=cr-disc]") ?? this.element.querySelector("select[name=cr-disc]");
  const k = sel?.value;
  if (k) { this.st.disc[k] ??= 0; this.render(); }
}
/** Убрать добавленную внеклановую Дисциплину без точек. */
function onDropDisc(event, target) {
  const k = target.dataset.key;
  if (!k || this.inClan(k) || this.value("disc", k) > this.base("disc", k)) return;
  for (const bag of [this.st.disc, this.st.free.disc, this.st.xp.disc]) delete bag[k];
  this.render();
}
/** Выбор по «Дополнительной Дисциплине»; прежняя Дисциплина снова внеклановая — её начальные точки снимаются. */
export function setExtraDisc(k) {
  const old = this.st.extraDisc;
  if (old && old !== k && this.st.disc[old]) delete this.st.disc[old];
  this.st.extraDisc = k || "";
  if (k) this.st.disc[k] ??= 0;
}

/** Раскрыть или свернуть полное описание факта биографии, достоинства или недостатка. */
function onRead(event, target) {
  const k = target.dataset.key;
  if (this.ui.open.has(k)) this.ui.open.delete(k); else this.ui.open.add(k);
  this.render();
}

function onBgToggle(event, target) {
  const n = target.dataset.name;
  if (n in this.st.bg || this.st.free.bg[n]) { delete this.st.bg[n]; delete this.st.free.bg[n]; }
  else this.st.bg[n] = 0;
  this.render();
}

function onMfTab(event, target) { this.ui.mfTab = target.dataset.tab; this.render(); }
function onMfCat(event, target) { this.ui.mfCat = target.dataset.cat; this.render(); }
function onMfToggle(event, target) {
  const name = target.dataset.name, kind = target.dataset.kind ?? this.ui.mfTab;
  const list = kind === "merit" ? this.st.merits : this.st.flaws;
  const i = list.findIndex(x => x.name === name);
  if (i >= 0) {
    if (list[i].en === EXTRA_DISC_MERIT) setExtraDisc.call(this, "");
    list.splice(i, 1);
  }
  else {
    // Прямой запрет в тексте черты — не даём взять (trait-rules.mjs)
    const blocker = blockerFor(name, [...this.st.merits, ...this.st.flaws].map(x => x.name));
    if (blocker) return ui.notifications.warn(t("Creator.TraitBlocked", { a: name, b: blocker }));
    const m = Codex.merits.find(x => x.kind === kind && x.name === name);
    if (m) list.push({ name, cost: Number(m.min) || 1, min: Number(m.min) || 1, max: Number(m.max) || Number(m.min) || 1, html: m.html, category: m.category, en: m.en, clan: m.clan ?? "", sect: m.sect ?? "" });
  }
  this.render();
}

/** Свободные пункты и опыт: левый клик +1, правый −1. */
function onFree(event, target) { bump.call(this, "free", event, target); }
function onXp(event, target) { bump.call(this, "xp", event, target); }
function bump(mode, event, target) {
  const { kind, key } = target.dataset;
  const d = event.button === 2 || target.dataset.d === "-1" ? -1 : 1;
  const bag = this.st[mode];
  const hxp = this.isHunter && mode === "xp" && hunterGrowth() === "xp";
  if (this.isLost && kind === "morality") return ui.notifications.warn(t("Creator.LostNoConviction"));
  if (this.isHunter && !this.isLost && !hxp && (kind === "virt" || (kind === "morality" && mode === "xp"))) return ui.notifications.warn(t("Creator.HunterNoBuy"));
  // начальная Убеждённость за опыт — не выше Силы воли
  if (hxp && kind === "morality" && d > 0 && this.morality >= this.willpower) return ui.notifications.warn(t("Creator.HunterConvWill"));
  if (this.isWraith && ["pathos", "trade", "pas", "fet", "rdisc"].includes(kind)) {   // призрак: Пафос, торг с Тенью (Спектру — Психее), Страсти, Оковы, «Дисциплины» Восставшего
    if (mode !== "free") return;
    if (kind === "pathos") { if (d > 0 && this.wraithPathos >= (this.wrNums.pathosMax ?? 10)) return; bag.pathos = Math.max(0, (bag.pathos ?? 0) + d); }
    else if (kind === "trade") bag.trade = Math.clamp((bag.trade ?? 0) + d, this.wrPath === "spectre" ? 0 : -(this.wrNums.shadowFreebies ?? 10), this.wrNums.shadowTrade ?? 7);
    else if (kind === "rdisc") { bag.rdisc ??= {}; bag.rdisc[key] = Math.clamp((bag.rdisc[key] ?? 0) + d, 0, 5); }
    else {
      if (d > 0 && this.passionValue(kind, Number(key)) >= 5) return;
      bag[kind] ??= {};
      bag[kind][key] = Math.max(0, (bag[kind][key] ?? 0) + d);
    }
    return this.render();
  }
  if (kind === "res") {                                  // маг: Резонанс — до 5 точек
    if (mode !== "free" || (d > 0 && this.mageRes >= 5)) return;
    bag.res = Math.max(0, (bag.res ?? 0) + d);
  } else if (kind === "quint") {                                // маг: Квинтэссенция по 4 за пункт, на колесе — до 20
    if (mode !== "free" || (d > 0 && this.mageAvatar + 4 * ((bag.quint ?? 0) + 1) > 20)) return;
    bag.quint = Math.max(0, (bag.quint ?? 0) + d);
  } else if (kind === "rage" || kind === "gnosis") {     // Гару: Ярость и Гнозис — до 10
    if (d > 0 && (kind === "rage" ? this.garouRage : this.garouGnosis) >= 10) return;
    bag[kind] = Math.max(0, bag[kind] + d);
  } else if (kind === "morality" || kind === "will") {
    const cap = this.isMage ? (mode === "xp" ? 10 : mageData().creation?.areteMax ?? 3) : this.isHunter ? (mode === "xp" ? 10 : 8) : this.st.path === "humanity" || mode === "xp" ? 10 : 5;
    if (d > 0 && (kind === "will" ? this.willpower >= 10 : this.morality >= cap)) return;
    bag[kind] = Math.max(0, bag[kind] + d);
  } else {
    const max = kind === "disc" && this.isMage ? Math.min(5, this.morality) : kind === "disc" && this.type === "vampire" ? VTM20.generationOf(13 - Math.min(5, this.value("bg", "Поколение"))).trait : kind === "virt" && this.isHunter && !this.isLost ? 10 : 5;
    if (d > 0 && kind === "disc" && this.bannedDisc(key)) return ui.notifications.warn(t("Creator.SectBanned", { name: Codex.disciplineLabel(key) }));
    if (d > 0 && this.value(kind, key) >= max) return;
    bag[kind][key] = Math.max(0, (bag[kind][key] ?? 0) + d);
  }
  this.render();
}

async function onRollBlood() {
  const r = await new Roll("1d10").evaluate();
  this.st.blood = r.total;
  r.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: t("Creator.BloodRoll") }, { messageMode: "self" });
  this.render();
}


async function onFinish() {
  const rem = this.remaining(), probs = this.problems(rem);
  if (probs.length) {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: t("Creator.FinishTitle") },
      content: `<p>${t("Creator.HasProblems")}</p><ul>${probs.map(p => `<li>${p}</li>`).join("")}</ul>`
    });
    if (!ok) return;
  }
  await this.write();
  this.close();
  this.actor.sheet.render(true);
}

/** data-action → обработчик (DEFAULT_OPTIONS.actions мастера). */
export const ACTIONS = {
      goto: onGoto, next: onNext, prev: onPrev,
      tier: onTier, sect: onSect, clan: onClan, clanGroup: onClanGroup,
      creed: onCreed, edgeToggle: onEdgeToggle, brSet: onBrSet, dhSwap: onDhSwap, dhOption: onDhOption,
      ghoulType: onGhoulType, magePick: onMagePick, garouPick: onGarouPick, garouGift: onGarouGift, garouExtra: onGarouExtra,
      house: onHouse, earthbound: onEarthbound, thrall: onThrall, mark: onMark, markPower: onMarkPower, pactShare: onPactShare, pactGift: onPactGift, reliquary: onReliquary, visage: onVisage, faction: onFaction, houseAtlas: onHouseAtlas,
      gen: onGen, choice: onChoice, clanAtlas: onClanAtlas,
      dot: onDot, prio: onPrio,
      bgToggle: onBgToggle, mfToggle: onMfToggle, mfTab: onMfTab, mfCat: onMfCat,
      addDisc: onAddDisc, dropDisc: onDropDisc, read: onRead,
      free: { handler: onFree, buttons: [0, 2] },
      xp: { handler: onXp, buttons: [0, 2] },
      rollBlood: onRollBlood, finish: onFinish
};
