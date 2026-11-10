// module/ui/hud.mjs
// HUD «Герб» вместо панели макросов: персонаж игрока или выделенный токен — квадратный портрет с лентой имени,
// слева крыло «Жизнь и Воля», справа — запасы своего вида (кровь каплями и путь; Ярость и Гнозис; Вера и Мука;
// Убеждённость; Эссенция духа), над портретом — вкладки и дуга печатей: бой (оружие, естественное оружие формы,
// приёмы, защиты), кровь (трата, Мощь, Стремительность, лечение, охота), форма и Ярость Гару, силы (вынесенные
// с листа, облик падшего, второе зрение), прочее. В бою — монеты брони и инициативы. Цвет — по виду (rh-t-*).

import { SYSTEM_ID, VTM20 } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { RollDialog } from "../dice/dialog.mjs";
import { openAttack, openDefense, weaponsOf, pendingAttacks, defendFromHud, grapplesOf, breakGrapple } from "../combat/combat.mjs";
import { celerityPhaseFor, useCelerityAction } from "../combat/celerity.mjs";
import { phaseOf, declarationOf, openDeclare } from "../combat/turn.mjs";
import { openHazard } from "../apps/hazard.mjs";
import { openHunt } from "../apps/night.mjs";
import { rollPowerRef, powerByRef } from "../sheets/actor-sheet.mjs";
import { effectTimer } from "../apps/timers.mjs";
import { W as werewolfData, feraOf, changeForm, rageActions, regenerate, stepSideways, frenzyCheck, giftOf, rollGift, rollRite } from "../apps/werewolf.mjs";
import { H as hunterData, secondSight, edgesView, useEdge } from "../apps/hunter.mjs";
import { castEffect, sphereName, aretePool, factionOf } from "../apps/mage.mjs";
import { assumeForm } from "../apps/torment.mjs";
import { togglePowerEffect } from "../apps/power-effects.mjs";

const ID = "r-hud";
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
let frame = null;

/** Чей HUD: выделенный свой токен, иначе персонаж игрока. */
function hudActor() {
  const tok = canvas?.tokens?.controlled?.[0];
  if (tok?.actor?.isOwner) return tok.actor;
  return game.user.character ?? null;
}

const enabled = () => game.settings.get(SYSTEM_ID, "hud");

function mount() {
  let el = document.getElementById(ID);
  if (el) return el;
  const bottom = document.getElementById("ui-bottom") ?? document.body;
  el = document.createElement("section");
  el.id = ID;
  el.className = "vtm20 r-hud";
  const hotbar = document.getElementById("hotbar");
  if (hotbar?.parentElement === bottom) bottom.insertBefore(el, hotbar); else bottom.appendChild(el);
  el.addEventListener("click", onClick);
  el.addEventListener("contextmenu", ev => {
    const w = ev.target.closest("[data-weapon]");
    if (!w) return;
    ev.preventDefault();
    hudActor()?.items.get(w.dataset.weapon)?.sheet.render(true);
  });
  return el;
}

/** Значок оружия по названию (у предметов один общий значок); иначе — по виду оружия. */
const WEAPON_GLYPHS = [
  [/когти|claws?/i, "fa-paw"], [/лук|арбалет/i, "fa-bow-arrow"], [/коса/i, "fa-scythe"], [/серп/i, "fa-sickle"],
  [/нож|кинжал|стилет|бритв|скальпел/i, "fa-dagger"], [/меч|сабл|шпаг|рапир|клинок|палаш|катан/i, "fa-sword"],
  [/топор|секир|алебард|тесак/i, "fa-axe"], [/молот|кувалд/i, "fa-hammer-war"], [/бит[аы]/i, "fa-baseball-bat"],
  [/булав|дубин|палиц|кистен|моргенштерн/i, "fa-mace"], [/посох|шест|копь|пика|трост/i, "fa-staff"],
  [/пистол|револьвер|ружь|мушкет|винтов|карабин|автомат|пулем|дробов|обрез/i, "fa-gun"], [/кастет|кулак/i, "fa-hand-back-fist"]
];
function weaponGlyph(w) {
  return WEAPON_GLYPHS.find(([re]) => re.test(w.name ?? ""))?.[1]
    ?? { brawl: "fa-hand-back-fist", melee: "fa-khanda", firearms: "fa-gun", thrown: "fa-bullseye" }[w.kind] ?? "fa-khanda";
}

/** Вид персонажа для HUD: свой набор запасов, действий и цвета (styles/r-hud.css, rh-t-*). */
function kindOf(a) {
  if (a.type === "ghoul" && a.system.ghoulType === "dhampir") return "dhampir";
  if (a.type === "creature" && a.system.spirit?.on) return "spirit";
  return a.type;
}

/** Вторая строка таблички: клан и поколение, племя и аугурия с Рангом, Дом и Облик, кредо… */
function subtitleOf(a, kind) {
  const s = a.system, typeName = game.i18n.localize(`TYPES.Actor.${a.type}`), lbl = x => x ? VTM20.label(x) : "";
  switch (kind) {
    case "vampire": return [Codex.clan(s.clan)?.name ?? typeName, game.i18n.format("VTM20.GenerationN", { n: s.generation })].filter(Boolean).join(" · ");
    case "dhampir": return [t("Hud.Kind.dhampir"), Codex.clan(Codex.traitClan(s.dhampir?.antecedentClan))?.name ?? ""].filter(Boolean).join(" · ");
    case "werewolf": {
      const D = werewolfData(), w = s.werewolf, fera = feraOf(a);
      const who = fera ? lbl(fera) : lbl(D.tribes.find(x => x.key === w.tribe));
      return [who, fera ? "" : lbl(D.auspices.find(x => x.key === w.auspice)), t("Hud.Rank", { n: w.rank })].filter(Boolean).join(" · ");
    }
    case "demon": { const h = Codex.house(s.house); return [h?.name ?? typeName, h?.visages?.[s.visage] ?? ""].filter(Boolean).join(" · "); }
    case "hunter": { const c = hunterData().creeds.find(x => x.key === s.hunter?.creed); return c ? `${c.name} · ${c.who}` : typeName; }
    case "mage": return factionOf(a)?.name ?? typeName;
    case "mortal": return s.kinfolk?.on ? t("Hud.Kind.kinfolk") : s.kami?.on ? t("Hud.Kind.kami") : s.fomor?.on ? t("Hud.Kind.fomor") : typeName;
    case "spirit": return [t("Hud.Kind.spirit"), s.kind].filter(Boolean).join(" · ");
    default: return s.kind || typeName;
  }
}

/* ── «Герб»: квадратный портрет в центре, крылья-знамёна по бокам (слева Жизнь и Воля, справа запасы вида),
   над ним — вкладки и дуга печатей-действий; броня и инициатива — монетами на плечах портрета, только в бою ── */

const tabOf = new Map();   // открытая вкладка печатей — своя у каждого персонажа (id актёра → ключ)
let pop = null;           // открытый над HUD список сил одной группы (ключ группы) или null

/**
 * Освоенные силы группами: Дисциплины и пути магии крови (силы до своего уровня), Знания падшего, Дары и ритуалы Гару.
 * Группа — печать во вкладке «Силы»; щелчок открывает над HUD список её сил, щелчок по силе — бросок.
 */
function powerGroups(a, kind) {
  const out = [], by = type => a.items.filter(i => i.type === type && (i.system.value ?? 0) > 0);
  for (const i of by("discipline")) {
    const k = i.system.key, d = Codex.discipline(k), rows = (d?.powers ?? []).map((p, n) => ({ p, n })).filter(x => x.p.level <= i.system.value);
    if (rows.length) out.push({ id: `d:${k}`, label: Codex.disciplineLabel(k), img: foundry.utils.getRoute(Codex.disciplineIcon(k)), lvl: i.system.value,
      rows: rows.map(x => ({ name: x.p.name, level: x.p.level, act: "power",
        icon: k === "protean" ? ({ 1: "fa-eye-low-vision", 2: "fa-paw", 3: "fa-mound", 4: "fa-paw", 5: "fa-smog" }[x.p.level] ?? "fa-wand-sparkles") : "",
        attrs: `data-ref="${esc(`${k}|${x.n}`)}"` })) });
  }
  for (const i of by("thaumPath")) {
    const k = i.system.discipline, pd = Codex.bloodPath(k, i.name), pi = (Codex.discipline(k)?.paths ?? []).indexOf(pd);
    const rows = (pd?.powers ?? []).map((p, n) => ({ p, n })).filter(x => x.p.level <= i.system.value);
    if (pi >= 0 && rows.length) out.push({ id: `p:${k}:${pi}`, label: i.name, img: foundry.utils.getRoute(Codex.disciplineIcon(k)), lvl: i.system.value,
      rows: rows.map(x => ({ name: x.p.name, level: x.p.level, act: "power", attrs: `data-ref="${esc(`${k}|path|${pi}|${x.n}`)}"` })) });
  }
  for (const i of by("lore")) {
    const L = Codex.lore(i.system.key), rows = (L?.powers ?? []).map((p, n) => ({ p, n })).filter(x => x.p.level <= i.system.value);
    if (rows.length) out.push({ id: `l:${i.system.key}`, label: L.name ?? i.name, icon: "fa-book-skull", lvl: i.system.value,
      rows: rows.map(x => ({ name: x.p.name, level: x.p.level, act: "power", attrs: `data-ref="${esc(`lore:${i.system.key}|${x.n}`)}"` })) });
  }
  if (kind === "werewolf") {
    const w = a.system.werewolf, gifts = (w.gifts ?? []).map(giftOf).filter(Boolean).sort((x, y) => x.level - y.level || x.name.localeCompare(y.name, "ru"));
    if (gifts.length) out.push({ id: "gifts", label: t("Werewolf.Gifts"), icon: "fa-paw", rows: gifts.map(g => ({ name: g.name, level: g.level, act: "gift", attrs: `data-key="${esc(g.key)}"` })) });
    const rites = (w.rites ?? []).map(k => werewolfData().rites.find(r => r.key === k)).filter(Boolean);
    if (rites.length) out.push({ id: "rites", label: t("Werewolf.Rites"), icon: "fa-hands-praying", rows: rites.map(r => ({ name: r.name, level: r.level || 0, act: "rite", attrs: `data-key="${esc(r.key)}"` })) });
  }
  // Грани охотника — по путям вероучений, как на листе
  if (kind === "hunter") for (const g of edgesView(a)) if (g.edges.length)
    out.push({ id: `e:${g.path}`, label: g.name, icon: "fa-eye", rows: g.edges.map(e => ({ name: e.name, level: e.level, act: "edge", attrs: `data-key="${esc(e.key)}"` })) });
  // Сферы мага — одной группой: щелчок открывает окно чародейства с этой Сферой
  if (kind === "mage") {
    const sp = VTM20.mageSpheres.filter(k => (a.system.mage?.spheres?.[k] ?? 0) > 0);
    if (sp.length) out.push({ id: "spheres", label: t("Mage.Spheres"), icon: "fa-hat-wizard", lvl: aretePool(a),
      rows: sp.map(k => ({ name: sphereName(a, k), level: a.system.mage.spheres[k], act: "sphere", attrs: `data-key="${k}"` })) });
  }
  return out;
}

/** Точки и клетки — как на листе: n из max, вид заливки классом. */
const dots = (n, max, fill = "") => Array.from({ length: max }, (_, i) => `<i class="d${i < n ? ` on ${fill}` : ""}"></i>`).join("");
const boxes = (n, max, fill = "") => Array.from({ length: max }, (_, i) => `<i class="b${i < n ? ` on ${fill}` : ""}"></i>`).join("");
const DROP = "M12 2C12 2 4 12 4 18a8 8 0 0 0 16 0C20 12 12 2 12 2z";
/** Капля залита на p процентов снизу (неполная — при запасе больше 20, где капля стоит несколько пунктов). */
const drop = p => `<svg class="dr" viewBox="0 0 24 30" aria-hidden="true"><defs><linearGradient id="rh-bf-${p}" x1="0" y1="1" x2="0" y2="0">
  <stop offset="0" stop-color="#7d161c"/><stop offset="${p}%" stop-color="#c4474c"/><stop offset="${p}%" stop-color="#c4474c" stop-opacity="0"/></linearGradient></defs>
  <path d="${DROP}" fill="url(#rh-bf-${p})" stroke="${p > 0 ? "#c4474c" : "rgba(196,71,76,.45)"}" stroke-width="2"/></svg>`;
const row = html => `<span class="rh-row">${html}</span>`;

/** Строка крыла: подпись (с пометками ниже), шкалы, число. */
const line = (label, rows, num, { notes = [], tip = "", act = "" } = {}) => `<span class="rh-lbl"${tip ? ` data-tooltip="${esc(tip)}"` : ""}>${esc(label)}${notes.map(n => `<small>${esc(n)}</small>`).join("")}</span>
  <${act ? `a data-act="${act}"` : "span"} class="rh-scales"${tip ? ` data-tooltip="${esc(tip)}"` : ""}>${rows.map(row).join("")}</${act ? "a" : "span"}><b class="rh-num">${num}</b>`;

/** Кровь: до 20 — капля на пункт рядами по 10, больше — 10 капель, каждая стоит запас ÷ 10 (неполная залита частично). */
function bloodLine(a) {
  const b = a.system.blood, perTurn = b.perTurn ?? 1, spent = a.bloodSpentThisTurn ?? 0, inFight = !!game.combat?.started;
  const tip = inFight ? t("Hud.BloodTipTurn", { n: perTurn, spent }) : t("Hud.BloodTip", { n: perTurn });
  let rows;
  const notes = [t("Hud.PerTurn", { n: perTurn })];
  if (b.max <= 20) {
    rows = [];
    for (let s = 0; s < b.max; s += 10) rows.push(Array.from({ length: Math.min(10, b.max - s) }, (_, i) => drop(s + i < b.value ? 100 : 0)).join(""));
  } else {
    const per = Math.ceil(b.max / 10);
    rows = [Array.from({ length: 10 }, (_, i) => drop(Math.round(Math.clamp((b.value - i * per) / per, 0, 1) * 100))).join("")];
    notes.push(t("Hud.DropIs", { n: per }));
  }
  return line(t("Hud.Blood"), rows, `${b.value}<small>/${b.max}</small>`, { notes, tip, act: "spend" });
}

/** Левое крыло: Жизнь (клетки листа с отметками урона, штраф — в подсказке) и Воля. */
function leftWing(s) {
  const last = s.health.levels.reduce((n, l, i) => l.state && l.state !== "empty" && l.state !== "none" ? i : n, -1);
  const cells = s.health.levels.map((l, i) => `<i class="hb is-${l.state}${i === last ? " is-current" : ""}${i === s.health.levels.length - 1 ? " is-last" : ""}" data-tooltip="${esc(game.i18n.localize(l.label))}">${l.state === "empty" || l.state === "none" ? "" : VTM20.damageTypes[l.state]?.mark ?? ""}</i>`).join("");
  const note = s.health.damage ? `${game.i18n.localize(`VTM20.Health.${s.health.status}`)}${s.health.penalty ? ` ${s.health.penalty}` : ""}` : t("Health.healthy");
  const w = s.willpower;
  return `<span class="rh-lbl">${esc(t("Sheet.Health"))}</span><span class="rh-scales"><span class="rh-row is-health">${cells}</span></span><b class="rh-num rh-wound ${s.health.damage ? "is-hurt" : ""}">${esc(note)}</b>
    ${line(t("Willpower"), [dots(w.permanent, 10, "bone"), boxes(w.temporary, w.permanent)], `${w.temporary}<small>/${w.permanent}</small>`)}`;
}

/** Правое крыло: запасы своего вида — кровь и путь, Ярость и Гнозис, Вера и Мука, Убеждённость, Эссенция духа… */
function rightWing(a, kind) {
  const s = a.system, out = [];
  const moral = () => s.morality && out.push(line(Codex.path(s.morality.path)?.name ?? t("Humanity"), [dots(s.morality.value, 10)], s.morality.value));
  if (a.hasBlood) { out.push(bloodLine(a)); moral(); }
  else if (kind === "werewolf") {
    const w = s.werewolf;
    out.push(line(t("Werewolf.Rage"), [dots(w.rage.permanent, 10, "rage"), boxes(w.rage.value, 10, "rage")], `${w.rage.value}<small>/${w.rage.permanent}</small>`, { tip: t("Hud.RageTip") }));
    out.push(line(t("Werewolf.Gnosis"), [dots(w.gnosis.permanent, 10, "gnosis"), boxes(w.gnosis.value, w.gnosis.permanent, "gnosis")], `${w.gnosis.value}<small>/${w.gnosis.permanent}</small>`, { tip: t("Hud.GnosisTip") }));
  } else if (kind === "demon") {
    out.push(line(t("Demon.Faith"), [dots(s.faith?.permanent ?? 0, 10, "gold"), boxes(s.faith?.temporary ?? 0, 10, "gold")], `${s.faith?.temporary ?? 0}<small>/${s.faith?.permanent ?? 0}</small>`));
    out.push(line(t("Demon.Torment"), [dots(s.torment?.permanent ?? 0, 10), boxes(s.torment?.temporary ?? 0, 10, "torment")], s.torment?.permanent ?? 0, { tip: t("Hud.TormentTip", { n: s.torment?.temporary ?? 0 }) }));
  } else if (kind === "hunter") {
    // у охотника нет Человечности — его мораль в Добродетелях: Милосердие, Прозрение, Рвение
    out.push(line(t("Hunter.Conviction"), [dots(s.hunter?.conviction ?? 0, 10, "amber")], s.hunter?.conviction ?? 0));
    const V = hunterData().virtues ?? {};
    const vk = ["mercy", "vision", "zeal"];
    out.push(line(t("Sheet.Virtues"), vk.map(k => dots(s.hunter?.[k] ?? 0, 5, "amber")), vk.map(k => s.hunter?.[k] ?? 0).join("·"),
      { tip: vk.map(k => `${V[k] ?? k}: ${s.hunter?.[k] ?? 0}`).join(", ") }));
  } else if (kind === "mage") {
    // маг: Арете — кубики магии; Квинтэссенция и Парадокс — две стороны одного колеса
    const m = s.mage;
    out.push(line(t("Mage.Arete"), [dots(m.arete, 10, "gold")], m.arete));
    out.push(line(t("Mage.Quintessence"), [boxes(m.quintessence, 20, "gold")], `${m.quintessence}<small> · ${t("Mage.Paradox")} ${m.paradox}</small>`, { tip: t("Mage.WheelHint") }));
  } else if (kind === "spirit") {
    const sp = s.spirit, e = sp.essence;
    out.push(line(t("Hud.Essence"), [boxes(Math.round(e.value / Math.max(1, e.max) * 10), 10, "gnosis")], `${e.value}<small>/${e.max}</small>`, { tip: t("Hud.EssenceTip") }));
    out.push(line(t("Werewolf.Rage"), [dots(sp.rage, 10, "rage")], sp.rage), line(t("Werewolf.Gnosis"), [dots(sp.gnosis, 10, "gnosis")], sp.gnosis));
  } else {
    moral();
    if (s.kinfolk?.on && s.kinfolk.gnosis) out.push(line(t("Werewolf.Gnosis"), [dots(s.kinfolk.gnosis, 10, "gnosis")], s.kinfolk.gnosis));
    if (s.kami?.on) out.push(line(t("Werewolf.Gnosis"), [dots(s.kami.gnosis, 10, "gnosis")], s.kami.gnosis));
    const rage = s.kami?.on ? s.kami.rage : s.fomor?.on ? s.fomor.rage : 0;
    if (rage) out.push(line(t("Werewolf.Rage"), [dots(rage, 10, "rage")], rage));
  }
  return out.join("");
}

/** Печать действия: круглая кнопка со значком (или картинкой), подпись, точки уровня; on — включено, man — приём. */
function seal(act, icon, label, { tip = "", on = false, man = false, img = "", lvl = 0, attrs = "", badge = "", compact = false } = {}) {
  // Печать дисциплины всегда сохраняет свой символ; уровень показывается малым бейджем.
  const face = img ? `<img src="${esc(img)}" alt="">` : `<i class="fa-solid ${icon}"></i>`;
  return `<a class="rh-seal${on ? " is-on" : ""}${man ? " is-man" : ""}${compact ? " is-compact" : ""}" data-act="${act}" ${attrs} data-tooltip="${esc(tip || label)}" aria-label="${esc(tip || label)}">
    <span class="rh-knob">${face}${badge ? `<b class="rh-knob-badge">${badge}</b>` : ""}</span>
    ${compact ? "" : `<span class="rh-seal-l">${esc(label)}</span>${lvl ? `<span class="rh-lvl">${dots(lvl, 5)}</span>` : ""}`}</a>`;
}

/** Вкладки и их печати по виду персонажа. */
function tabsOf(a, kind) {
  const s = a.system, vamp = a.isVampire, tabs = [];
  // Бой: оружие, естественное оружие формы, приёмы (с естественным оружием — под «…»), защиты
  const beastForm = s.fx?.beastForm;
  const noPhysicalAction = !!(s.fx?.earthMeld || s.fx?.mistForm || s.fx?.shadowForm);
  const formWeapons = beastForm === "modified" ? weaponsOf(a).filter(w => w.naturalFormWeapon) : [];
  const weaponChoices = beastForm === "modified" ? formWeapons : (beastForm || noPhysicalAction ? [] : weaponsOf(a));
  const weapons = weaponChoices.slice(0, 3).map(w => seal("attack", weaponGlyph(w), w.name, { attrs: `data-weapon="${w.id}"`,
    tip: `${w.name} · ${w.label} · ${game.i18n.localize(VTM20.damageTypes[w.damageType]?.label ?? "")}` }));
  const natural = (s.formFx?.weapons ?? []).map((w, i) => seal("natural", w.icon ?? (/укус|клык|bite/i.test(w.name) ? "fa-tooth" : "fa-paw"), w.name,
    { attrs: `data-n="${i}"`, tip: `${w.name} · ${game.i18n.localize(VTM20.damageTypes[w.type]?.label ?? "")}` }));
  const man = (k, icon) => seal("maneuver", icon, t(`Combat.M.${k}`), { man: true, attrs: `data-man="${k}"`, tip: [t(`Combat.M.${k}`), t(`Combat.MNote.${k}`)].filter(Boolean).join(" — ") });
  const hasProteanClawItem = a.items.some(i => i.type === "weapon" && i.getFlag?.(SYSTEM_ID, "power") === "protean:2");
  const maneuvers = noPhysicalAction || beastForm === "modified" ? [] : beastForm === "wolf" ? [man("claws", "fa-paw"), man("bite", "fa-tooth")]
    : ["bat", "cobra"].includes(beastForm) ? [man("bite", "fa-tooth")]
    : natural.length ? [] : [man("punch", "fa-hand-fist"), ...(s.fx?.claws && !hasProteanClawItem ? [man("claws", "fa-paw")] : []), vamp ? man("bite", "fa-tooth") : man("clinch", "fa-people-pulling")];
  // фаза заявок: «Заявить» — первой печатью боя (у своего бойца)
  const combat = game.combat, ph = phaseOf(combat);
  const inFight = combat?.started && combat.combatants.some(c => c.actor === a);
  const declareSeal = inFight && ph?.phase === "declare" && ph.round === combat.round && a.isOwner
    ? [seal("declare", "fa-bullhorn", t("Turn.Declare"), { tip: declarationOf(a, combat) ? t("Turn.DeclareChange") : t("Turn.DeclareTip"), on: !declarationOf(a, combat) })] : [];
  // в клинче или захвате — «Вырваться» (встречная Сила + Драка)
  const grip = grapplesOf(a)[0];
  const gripSeal = grip ? [seal("breakFree", "fa-people-pulling", t("Combat.Grapple.break"), { on: true, tip: grip.effect.name })] : [];
  tabs.push({ key: "fight", label: t("Hud.Tab.fight"), seals: [...declareSeal, ...gripSeal, ...weapons, ...natural, ...maneuvers,
    ...(noPhysicalAction ? [] : [seal("attack", "fa-ellipsis", t("Hud.More"), { man: true, tip: t("Hud.AttackTip") })]),
    ...(s.fx?.earthMeld ? [] : [seal("dodge", "fa-person-running", t("Hud.Dodge"), { tip: t("Combat.Defense.dodge") }),
      seal("block", "fa-shield-halved", t("Hud.Block"), { tip: t("Combat.Defense.block") }), seal("parry", "fa-khanda", t("Hud.Parry"), { tip: t("Combat.Defense.parry") })])] });
  if (a.hasBlood) {
    // Мощь за кровь и дополнительные действия Стремительности — на этот ход (Дисциплины/06, 14)
    const pot = a.discipline("potence"), cel = a.discipline("celerity"), b = [seal("spend", "fa-droplet", t("Hud.Spend"), { tip: t("Hud.BloodTip", { n: s.blood.perTurn ?? 1 }) })];
    if (pot) b.push(seal("potence", "fa-hand-fist", Codex.disciplineLabel("potence"), { on: a.potenceActive, tip: t(a.potenceActive ? "Hud.PotenceOnTip" : "Hud.PotenceTip", { n: pot }) }));
    if (cel) b.push(seal("celerity", "fa-forward", Codex.disciplineLabel("celerity"), { on: !!a.celerityActions, badge: a.celerityActions || "", tip: t("Hud.CelerityTip", { n: cel, used: a.celerityActions }) }));
    const celerityTurn = celerityPhaseFor(a);
    if (celerityTurn) b.push(seal("celerityUse", "fa-forward-fast", t("Hud.CelerityUse"), { on: true, badge: celerityTurn.remaining, tip: t("Hud.CelerityUseTip", { n: celerityTurn.remaining }) }));
    b.push(seal("heal", "fa-hand-holding-droplet", t("Hud.Heal"), { tip: t("Sheet.HealHint") }), seal("hunt", "fa-moon", t("Hunt.Button")));
    tabs.push({ key: "blood", label: t("Hud.Tab.blood"), seals: b });
  }
  if (kind === "werewolf") {
    const w = s.werewolf, fera = feraOf(a), list = fera ? fera.forms.map(f => ({ ...f, icon: "fa-paw" })) : VTM20.garouForms;
    tabs.push({ key: "form", label: t("Hud.Form"), seals: list.map(f => seal(f.key === w.form ? "noop" : "form", f.icon ?? "fa-paw", VTM20.label(f),
      { on: f.key === w.form, attrs: `data-form="${f.key}"`, tip: f.key === w.form ? t("Hud.FormNow") : VTM20.label(f) })) });
    const rageTurn = celerityPhaseFor(a);
    tabs.push({ key: "rage", label: t("Werewolf.Rage"), seals: [
      ...(rageTurn ? [seal("celerityUse", "fa-bolt", t("Hud.CelerityUse"), { on: true, badge: rageTurn.remaining, tip: t("Hud.CelerityUseTip", { n: rageTurn.remaining }) })] : []),
      seal("wwActions", "fa-forward-fast", t("Werewolf.Actions"), { tip: t("Werewolf.ActionsHint"), badge: a.celerityActions || "" }),
      seal("wwRegen", "fa-heart-pulse", t("Werewolf.Regen"), { tip: t("Werewolf.RegenHint") }), seal("wwStep", "fa-circle-half-stroke", t("Werewolf.StepSideways"), { tip: t("Werewolf.StepHint") }),
      seal("wwFrenzy", "fa-face-angry", t("Werewolf.Frenzy"), { tip: t("Werewolf.FrenzyHint") })] });
  }
  // Силы: вынесенные булавкой с листа (знак Дисциплины и уровень точками), силы на время, свои силы вида и «Все» — вкладка сил на листе
  const powers = (a.getFlag(SYSTEM_ID, "hudPowers") ?? []).map(ref => {
    const x = powerByRef(ref);
    return x ? seal("power", x.disc.startsWith("lore:") ? "fa-book-skull" : "", x.p.name, { img: x.disc.startsWith("lore:") ? "" : foundry.utils.getRoute(Codex.disciplineIcon(x.disc)),
      badge: String(x.p.level), attrs: `data-ref="${esc(ref)}"`, compact: true,
      tip: `${x.p.name} · ${x.pathName || x.d.name} ${x.p.level}` }) : "";
  }).filter(Boolean);
  const own = kind === "demon" ? [seal("apocalyptic", "fa-dragon", t("Hud.Visage"), { on: !!s.apocalyptic, tip: t(s.apocalyptic ? "Hud.ApocOn" : "Hud.ApocOff") })]
    : kind === "hunter" ? [seal("sight", "fa-eye", t("Hud.Sight"), { tip: t("Hud.SightTip") })] : [];
  const fx = (a.powerEffects ?? []).map(x => {
    const tm = effectTimer(x.effect), tip = tm ? `${x.effect.name} · ${t(x.def.mode === "night" ? "Timer.ToDawn" : "Timer.Left")} ${tm.left}` : x.effect.name;
    // У активного эффекта — знак самой силы (глаз, когти, холм, туман),
    // а не общий знак дисциплины. Значок дисциплины остаётся на кнопке группы.
    const icon = String(x.def.icon || "fa-wand-sparkles").replace(/^fa-solid\s+/, "");
    const suffix = String(x.power).split(":").slice(1).join(":");
    const level = /^\d+$/.test(suffix) ? suffix : /Модифицированный Облик Зверя|Shape of the Beast Revisited/i.test(suffix) ? "4" : "";
    return `<span class="rh-seal is-fx" data-tooltip="${esc(tip)}" aria-label="${esc(tip)}" ${tm ? `data-fx-start="${tm.start}" data-fx-until="${tm.until}"` : ""}><span class="rh-knob"><i class="fa-solid ${esc(icon)}"></i>${level ? `<b class="rh-knob-badge">${level}</b>` : ""}${tm ? `<i class="rh-fx-bar" style="width:${tm.pctW}%"></i>` : ""}</span><span class="rh-seal-l">${esc(x.effect.name)}</span></span>`;
  });
  const groups = powerGroups(a, kind).map(g => seal("pop", g.icon ?? "", g.label, { attrs: `data-pop="${esc(g.id)}"`, img: g.img ?? "", lvl: g.lvl ?? 0,
    badge: g.lvl != null ? String(g.lvl) : "", compact: g.lvl != null,
    on: pop === g.id, tip: t("Hud.PowersOf", { name: g.label }) }));
  tabs.push({ key: "powers", label: t("Hud.Powers"), seals: [...own, ...groups, ...powers, ...fx, seal("allPowers", "fa-book-open", t("Hud.AllPowers"), { man: true, compact: true, tip: t("Hud.AllPowersTip") })] });
  tabs.push({ key: "other", label: t("Hud.Tab.other"), seals: [seal("roll", "fa-dice-d10", t("Hud.Roll"), { tip: t("Hud.RollTip") }),
    seal("initRoll", "fa-bolt", t("Hud.InitShortCap"), { tip: t("Hud.InitTip") }), seal("hazard", "fa-fire-flame-curved", t("Hud.Hazard"), { tip: t("Hazard.Title") }),
    seal("sheet", "fa-book", t("Hud.Sheet"), { tip: t("Hud.SheetTip") })] });
  return tabs;
}

/** Печати встают дугой: над портретом — выше него, над крыльями — опускаются к ним (без пустоты между рядом и гербом). */
const arc = list => {
  const w = list.map(h => (/^<(a|span) class="rh-seal[^"]*is-compact/.test(h) ? 42 : 58) + 6);
  const total = w.reduce((s, x) => s + x, 0);
  let x = -total / 2;
  return list.map((h, i) => {
    const off = Math.abs(x + w[i] / 2); x += w[i];
    const drop = Math.round(Math.min(1, Math.max(0, (off - 70) / 90)) * 24);
    return h.replace(/^<(a|span) class="rh-seal/, `<$1 style="--arc:${drop}px" class="rh-seal`);
  }).join("");
};

/** HUD свёрнут (клавиша H или кнопка на панели) — остаётся язычок «показать». */
const hidden = () => game.settings.get(SYSTEM_ID, "hudHidden");
export function toggleHud(force) {
  const v = typeof force === "boolean" ? force : !hidden();
  return game.settings.set(SYSTEM_ID, "hudHidden", v).then(() => renderHud());
}
const hideBtn = () => `<a class="rh-hide" data-act="hide" data-tooltip="${esc(t("Hud.Hide"))}" aria-label="${esc(t("Hud.Hide"))}"><i class="fa-solid fa-eye-slash"></i></a>`;

export function renderHud() {
  if (!enabled()) return;
  const el = mount();
  document.body.classList.add("r-hud-on");
  const a = hudActor();
  el.className = "vtm20 r-hud";
  if (hidden()) {
    el.classList.add("is-hidden");
    el.innerHTML = `<a class="rh-show" data-act="show" data-tooltip="${esc(t("Hud.Show"))}"><i class="fa-solid fa-eye"></i><span>${esc(a?.name ?? t("Hud.ShowShort"))}</span></a>`;
    fitHud(); return;
  }
  if (!a) {
    el.innerHTML = `<p class="rh-empty"><i class="fa-solid fa-user-slash"></i> ${esc(t(game.user.isGM ? "Hud.PickToken" : "Hud.NoCharacter"))}${hideBtn()}</p>`;
    fitHud(); return;
  }
  const s = a.system, kind = kindOf(a);
  el.classList.add(`rh-t-${kind}`);
  const tabs = tabsOf(a, kind), cur = tabs.find(x => x.key === tabOf.get(a.id)) ?? tabs[0];
  const group = cur.key === "powers" && pop ? powerGroups(a, kind).find(g => g.id === pop) : null;
  const popup = group ? `<div class="rh-pop"><header>${group.img ? `<img src="${esc(group.img)}" alt="">` : `<i class="fa-solid ${group.icon}"></i>`}<b>${esc(group.label)}</b>
      ${group.lvl ? `<span class="rh-lvl">${dots(group.lvl, 5)}</span>` : ""}<a data-act="popClose" aria-label="${esc(t("Hud.Close"))}"><i class="fa-solid fa-xmark"></i></a></header>
      <div class="rh-pop-list">${group.rows.map(r => `<a class="rh-pop-row" data-act="${r.act}" ${r.attrs}><i>${r.level || "—"}</i><span>${esc(r.name)}</span><em class="fa-solid ${esc(r.icon || "fa-dice-d10")}"></em></a>`).join("")}</div></div>` : "";

  // бой: броня и инициатива — монетами на плечах портрета; вне боя их нет (инициатива — печатью во вкладке «Прочее»)
  const combatant = game.combat?.combatants?.find(c => c.actor?.id === a.id);
  const myTurn = !!(combatant && game.combat?.started && game.combat.combatant === combatant);
  const inFight = !!game.combat && (!!combatant || game.combat.started);
  const arm = a.armor, soak = `${a.soakPool("bashing")}/${a.soakPool("lethal")}/${a.soakPool("aggravated")}`;
  const coin = (cls, act, num, cap, tip) => `<${act ? `a data-act="${act}"` : "span"} class="rh-coin ${cls}" data-tooltip="${esc(tip)}"><b>${num}</b><span>${esc(cap)}</span></${act ? "a" : "span"}>`;
  const coins = !inFight ? "" : coin("is-armor", "", arm.rating, t("Hud.ArmorCap"), `${arm.rating ? t("Hud.ArmorTip", { r: arm.rating, p: arm.penalty }) : t("Hud.NoArmor")} · ${t("Sheet.SoakHint")}: ${soak}`)
    + (combatant ? (combatant.initiative == null ? coin("is-init", "init", `<i class="fa-solid fa-dice-d10"></i>`, t("Hud.InitShort"), t("Hud.Init"))
      : coin(`is-init${myTurn ? " is-turn" : ""}`, "", Math.floor(combatant.initiative), myTurn ? t("Hud.YourTurn") : t("Hud.InitShort"), t("Sheet.Initiative")))
      : coin("is-init", "join", `<i class="fa-solid fa-swords"></i>`, t("Hud.Join"), t("Hud.Join")));

  // атаки, ждущие защиты этого персонажа — красной полосой над вкладками
  const pend = pendingAttacks(a), last = pend.at(-1)?.getFlag(SYSTEM_ID, "combat");
  const alarm = last ? `<a class="rh-alarm" data-act="defendPending" data-tooltip="${esc(t("Hud.DefendTip", { a: last.attackerName, w: last.weaponName, n: last.successes }))}">
      <i class="fa-solid fa-triangle-exclamation"></i><span>${esc(t("Hud.UnderAttack", { name: last.attackerName }))}</span>${pend.length > 1 ? `<b>×${pend.length}</b>` : ""}</a>` : "";
  // состояния (торпор, бешенство, Харано…) — значками на портрете
  const states = ["r-torpor", "r-staked", "r-frenzy", "r-rotschreck", "r-harano", "r-rapture"].filter(id => a.statuses?.has(id))
    .map(id => CONFIG.statusEffects.find(e => e.id === id)).filter(Boolean)
    .map(e => `<img src="${esc(e.img)}" data-tooltip="${esc(game.i18n.localize(e.name))}" alt="">`).join("");
  const wing = side => `<svg class="rh-banner" viewBox="0 0 340 76" preserveAspectRatio="none" aria-hidden="true"${side === "right" ? ` style="transform:scaleX(-1)"` : ""}>
      <polygon points="0,0 340,0 340,76 0,76 22,38"/><polyline points="340,5 9,5 28,38 9,71 340,71"/></svg>`;
  el.innerHTML = `
    ${popup}${alarm}
    <nav class="rh-tabs">${tabs.map((x, i) => `${i ? `<i class="rh-sep">◆</i>` : ""}<a class="${x === cur ? "on" : ""}" data-act="tab" data-tab="${x.key}">${esc(x.label)}</a>`).join("")}</nav>
    <div class="rh-seals">${arc(cur.seals)}</div>
    <div class="rh-crest${myTurn ? " is-turn" : ""}">
      <div class="rh-wing is-left">${wing("left")}<div class="rh-grid">${leftWing(s)}</div></div>
      <div class="rh-wing is-right">${wing("right")}<div class="rh-grid">${rightWing(a, kind)}</div></div>
      <a class="rh-frame" data-act="sheet" data-tooltip="${esc(t("Hud.SheetTip"))}"><img src="${esc(a.img)}" alt="">${states ? `<span class="rh-states">${states}</span>` : ""}</a>
      ${coins}${hideBtn()}
      <a class="rh-ribbon" data-act="sheet" data-tooltip="${esc(t("Hud.SheetTip"))}"><b>${esc(a.name)}</b><small>${esc(subtitleOf(a, kind))}</small></a>
    </div>`;
  el.classList.toggle("is-turn", myTurn);
  fitHud();
}

async function onClick(ev) {
  const el = ev.target.closest("[data-act]");
  if (!el) return;
  ev.preventDefault();
  if (el.dataset.act === "hide") return toggleHud(true);
  if (el.dataset.act === "show") return toggleHud(false);
  const a = hudActor();
  if (!a) return;
  switch (el.dataset.act) {
    case "sheet": return a.sheet.render(true);
    case "tab": tabOf.set(a.id, el.dataset.tab); pop = null; return renderHud();
    case "pop": pop = pop === el.dataset.pop ? null : el.dataset.pop; return renderHud();
    case "popClose": pop = null; return renderHud();
    // силы из списка над HUD: Дисциплины и Знания — броском силы, Дары и ритуалы Гару — своими бросками
    case "gift": pop = null; renderHud(); return rollGift(a, el.dataset.key);
    case "rite": pop = null; renderHud(); return rollRite(a, el.dataset.key);
    case "edge": pop = null; renderHud(); return useEdge(a, el.dataset.key);
    case "sphere": pop = null; renderHud(); return castEffect(a, { sphere: el.dataset.key });
    case "noop": return;
    // все силы — вкладка сил на листе (Дисциплины, Дары, Знания, Грани)
    case "allPowers": await a.sheet.render(true); return a.sheet.changeTab?.("disciplines", "primary");
    case "declare": return openDeclare(a);
    case "breakFree": return breakGrapple(a);
    case "attack": return openAttack(a, { weapon: el.dataset.weapon ?? null });
    case "maneuver": return openAttack(a, { maneuver: el.dataset.man });
    case "natural": return openAttack(a, { natural: Number(el.dataset.n) });
    // Гару: форма, действия за Ярость, регенерация, шаг в сторону, бешенство (W20, гл. 6–7)
    case "form": return changeForm(a, el.dataset.form);
    case "wwActions": return rageActions(a);
    case "wwRegen": return regenerate(a);
    case "wwStep": return stepSideways(a);
    case "wwFrenzy": return frenzyCheck(a);
    // падший: апокалиптическая форма; охотник: второе зрение
    case "apocalyptic": return assumeForm(a);
    case "sight": return secondSight(a);
    case "roll": return RollDialog.prompt(a, {});
    case "dodge": case "block": case "parry": return openDefense(a, el.dataset.act);
    case "spend": return a.spendBlood(1, { reason: t("Notify.ReasonManual") });
    case "heal": return a.bloodHeal(null);
    case "potence": {
      const active = await a.togglePotence();
      refreshHud();
      return active;
    }
    case "celerityUse": return useCelerityAction(a);
    case "celerity": {
      if (game.combat?.getFlag?.(SYSTEM_ID, "celerityPhase")?.active) return ui.notifications.warn(t("Combat.CelerityPhaseFirst"));
      const max = a.celerityMaxBuyable;
      if (max <= a.celerityActions) return ui.notifications.warn(t("Notify.NoBlood", { name: a.name }));
      const minimum = Math.max(1, a.celerityActions + 1);
      const initial = Math.min(max, minimum);
      const bloodCost = a.celerityActions > 0 ? 0 : (a.doubleBloodCost ? 2 : 1);
      const content = `<div class="r-cel-dialog">
        <header class="r-cel-hero"><span class="r-cel-sigil"><i class="fa-solid fa-forward-fast"></i></span><div>
          <small>${esc(t("Hud.CelerityKicker"))}</small><h2>${esc(Codex.disciplineLabel("celerity"))}</h2>
          <p>${esc(t("Hud.CelerityAsk"))}</p></div></header>
        <section class="r-cel-card">
          <div class="r-cel-count-label">${esc(t("Hud.CelerityCountLabel"))}</div>
          <div class="r-cel-stepper">
            <button type="button" data-cel-step="-1" aria-label="−">−</button>
            <div class="r-cel-count"><b data-cel-count>${initial}</b><span>${esc(t("Hud.CelerityActionWord"))}</span></div>
            <button type="button" data-cel-step="1" aria-label="+">+</button>
          </div>
          <input type="hidden" name="n" value="${initial}" data-cel-value>
          <div class="r-cel-summary">
            <div><span>${esc(t("Hud.CelerityNewActions"))}</span><b data-cel-new>${initial - a.celerityActions}</b></div>
            <div><span>${esc(t("Hud.CelerityBloodCost"))}</span><b><i class="fa-solid fa-droplet"></i> <span data-cel-cost>${bloodCost}</span></b></div>
            <div><span>${esc(t("Hud.CelerityDexPenalty"))}</span><b data-cel-dex>${initial}</b></div>
          </div>
        </section>
        <p class="r-cel-footnote"><i class="fa-solid fa-circle-info"></i> ${esc(t("Hud.CelerityRuleNote", { max }))}</p>
      </div>`;
      const n = await foundry.applications.api.DialogV2.prompt({
        window: { title: Codex.disciplineLabel("celerity"), icon: "fa-solid fa-forward-fast" },
        classes: ["vtm20", "r-dialog", "r-celerity-dialog", "has-foot"], position: { width: 520 },
        content, rejectClose: false,
        render: (event, dialog) => {
          const root = dialog.element, value = root.querySelector("[data-cel-value]"), count = root.querySelector("[data-cel-count]");
          const added = root.querySelector("[data-cel-new]"), cost = root.querySelector("[data-cel-cost]"), dex = root.querySelector("[data-cel-dex]");
          const minus = root.querySelector('[data-cel-step="-1"]'), plus = root.querySelector('[data-cel-step="1"]');
          const update = () => {
            const chosen = Math.max(minimum, Math.min(max, Math.floor(Number(value.value) || minimum)));
            value.value = String(chosen); count.textContent = String(chosen);
            added.textContent = String(chosen - a.celerityActions);
            cost.textContent = String(a.celerityActions > 0 ? 0 : (a.doubleBloodCost ? 2 : 1));
            dex.textContent = String(chosen);
            minus.disabled = chosen <= minimum; plus.disabled = chosen >= max;
          };
          minus.addEventListener("click", () => { value.value = Number(value.value) - 1; update(); });
          plus.addEventListener("click", () => { value.value = Number(value.value) + 1; update(); });
          update();
        },
        ok: { label: t("Hud.CelerityBuy"), icon: "fa-solid fa-droplet", callback: (e, b) => Number(b.form.elements.n.value) || 0 }
      });
      return n ? a.buyCelerityActions(n) : null;
    }
    case "power": {
      if (pop) { pop = null; renderHud(); }
      const x = powerByRef(el.dataset.ref);
      // Первые пять точек Метаморфоз — механические эффекты, а не бросок карточки.
      // Для альтернативной 4-й точки используем английский ключ справочника,
      // чтобы маршрутизация не зависела от языка интерфейса.
      if (String(x?.disc ?? "").toLowerCase() === "protean") {
        const revisited = x.p?.en === "Shape of the Beast Revisited"
          || x.p?.name === "Модифицированный Облик Зверя";
        const key = revisited ? "protean:Модифицированный Облик Зверя"
          : (x.p?.level >= 1 && x.p.level <= 5 ? `protean:${x.p.level}` : null);
        if (key) return togglePowerEffect(a, key);
      }
      return rollPowerRef(a, el.dataset.ref);
    }
    case "hunt": return openHunt(a);
    case "hazard": return openHazard(a);
    case "defendPending": return defendFromHud(a);
    case "initRoll": {
      const r = await new Roll("1d10 + @initiative", a.getRollData()).evaluate();
      return r.toMessage({ speaker: ChatMessage.getSpeaker({ actor: a }), flavor: t("Roll.Initiative") });
    }
    case "init": {
      const c = game.combat?.combatants?.find(x => x.actor?.id === a.id);
      if (c) return game.combat.rollInitiative([c.id]);
      break;
    }
    case "join": {
      const tok = canvas.tokens.controlled.find(x => x.actor === a) ?? a.getActiveTokens()[0];
      if (tok) await tok.document.toggleCombatant();
      break;
    }
  }
}

/** Не залезать под поле чата, когда боковая панель свёрнута; если места меньше ширины герба — уменьшить его целиком. */
function fitHud() {
  const el = document.getElementById(ID), bottom = document.getElementById("ui-bottom");
  if (!el || !bottom) return;
  const chat = document.getElementById("chat-notifications");
  const r = chat?.getBoundingClientRect(), b = bottom.getBoundingClientRect();
  const input = chat?.querySelector("#chat-message");
  const busy = r && r.width > 0 && r.left < b.right && input && getComputedStyle(input).display !== "none";
  const room = busy ? Math.max(420, r.left - b.left - 12) : b.width;
  // Герб на 15% крупнее базового, но сжимается до доступной ширины, когда открыта боковая панель.
  el.style.setProperty("--rh-scale", Math.min(1.15, room / 840).toFixed(3));
}

/** Перерисовать не чаще раза в кадр. */
export function refreshHud() {
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = null; renderHud(); });
}

export function registerHud() {
  game.settings.register(SYSTEM_ID, "hud", {
    name: "VTM20.Hud.Setting", hint: "VTM20.Hud.SettingHint",
    scope: "client", config: true, type: Boolean, default: true, requiresReload: true
  });
  game.settings.register(SYSTEM_ID, "hudHidden", { scope: "client", config: false, type: Boolean, default: false });
  game.keybindings.register(SYSTEM_ID, "toggleHud", {
    name: "VTM20.Hud.ToggleKey", editable: [{ key: "KeyH" }],
    onDown: () => { if (!enabled()) return false; toggleHud(); return true; }
  });
  Hooks.once("ready", () => {
    if (!enabled()) return;
    renderHud();
    Hooks.on("collapseSidebar", () => setTimeout(fitHud, 350));
    window.addEventListener("resize", () => requestAnimationFrame(fitHud));
    const right = document.getElementById("ui-right");
    if (right) new ResizeObserver(() => fitHud()).observe(right);
    for (const h of ["controlToken", "updateActor", "createItem", "updateItem", "deleteItem", "createChatMessage", "deleteChatMessage",
      "updateCombat", "createCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant", "canvasReady", "updateUser",
      "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"])
      Hooks.on(h, refreshHud);
  });
}
