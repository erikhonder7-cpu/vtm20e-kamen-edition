// module/ui/hud.mjs
// HUD вместо панели макросов (по образцу vtm5e-kamen-edition, под правила V20):
// персонаж игрока или выделенный токен — портрет, семь уровней здоровья, воля, запас
// крови и мораль; оружие и манёвры одним щелчком; защиты (уклонение, блок, парирование);
// трата крови и лечение, опасности среды; инициатива, броня, прочность и штраф за раны.

import { SYSTEM_ID, VTM20 } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { RollDialog } from "../dice/dialog.mjs";
import { openAttack, openDefense, weaponsOf, pendingAttacks, defendFromHud } from "../combat/combat.mjs";
import { openHazard } from "../apps/hazard.mjs";
import { openHunt } from "../apps/night.mjs";
import { rollPowerRef, powerByRef } from "../sheets/actor-sheet.mjs";

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
  [/лук|арбалет/i, "fa-bow-arrow"], [/коса/i, "fa-scythe"], [/серп/i, "fa-sickle"],
  [/нож|кинжал|стилет|бритв|скальпел/i, "fa-dagger"], [/меч|сабл|шпаг|рапир|клинок|палаш|катан/i, "fa-sword"],
  [/топор|секир|алебард|тесак/i, "fa-axe"], [/молот|кувалд/i, "fa-hammer-war"], [/бит[аы]/i, "fa-baseball-bat"],
  [/булав|дубин|палиц|кистен|моргенштерн/i, "fa-mace"], [/посох|шест|копь|пика|трост/i, "fa-staff"],
  [/пистол|револьвер|ружь|мушкет|винтов|карабин|автомат|пулем|дробов|обрез/i, "fa-gun"], [/кастет|кулак/i, "fa-hand-back-fist"]
];
function weaponGlyph(w) {
  return WEAPON_GLYPHS.find(([re]) => re.test(w.name ?? ""))?.[1]
    ?? { brawl: "fa-hand-back-fist", melee: "fa-khanda", firearms: "fa-gun", thrown: "fa-bullseye" }[w.kind] ?? "fa-khanda";
}

/** Здоровье: семь клеток с отметками /, X, ✱ (04). */
function healthTrack(s) {
  const last = s.health.levels.reduce((n, l, i) => l.state && l.state !== "empty" && l.state !== "none" ? i : n, -1);
  const cells = s.health.levels.map((l, i) => `<i class="is-${l.state}${i === last ? " is-current" : ""}" data-tooltip="${esc(game.i18n.localize(l.label))}">${l.state === "empty" ? "" : VTM20.damageTypes[l.state]?.mark ?? ""}</i>`);
  return `<span class="rh-track rh-health">${cells.join("")}</span>`;
}

/** Воля: постоянная — рамка клетки, временная — заполнение. */
function willTrack(s) {
  const w = s.willpower, out = [];
  for (let i = 0; i < w.permanent; i++) out.push(`<i class="${i < w.temporary ? "on" : ""}"></i>`);
  return `<span class="rh-track rh-will">${out.join("")}</span>`;
}

export function renderHud() {
  if (!enabled()) return;
  const el = mount();
  document.body.classList.add("r-hud-on");
  const a = hudActor();
  if (!a) {
    el.classList.remove("is-turn");
    el.innerHTML = `<p class="rh-empty"><i class="fa-solid fa-user-slash"></i> ${esc(t(game.user.isGM ? "Hud.PickToken" : "Hud.NoCharacter"))}</p>`;
    fitHud(); return;
  }
  const s = a.system, vamp = a.isVampire;
  const clan = vamp ? (Codex.clan(s.clan)?.name ?? "") : game.i18n.localize(`TYPES.Actor.${a.type}`);
  const sub = [clan, vamp ? game.i18n.format("VTM20.GenerationN", { n: s.generation }) : ""].filter(Boolean).join(" · ");
  const path = Codex.path(s.morality.path);
  const perTurn = s.blood?.perTurn ?? 1, spentTurn = a.hasBlood ? a.bloodSpentThisTurn : 0;
  const turnPips = a.hasBlood && perTurn <= 10 ? `<span class="rh-turn">${Array.from({ length: perTurn }, (_, i) => `<i class="${i < spentTurn ? "on" : ""}"></i>`).join("")}</span>` : "";
  const blood = a.hasBlood ? `<a class="rh-stat rh-blood" data-act="spend" data-tooltip="${esc((game.combat?.started ? t("Hud.BloodTipTurn", { n: perTurn, spent: spentTurn }) : t("Hud.BloodTip", { n: perTurn })))}">
      <i class="fa-solid fa-droplet"></i><b>${s.blood.value}</b><small>/${s.blood.max}</small>${turnPips}</a>` : "";
  const morality = `<span class="rh-stat rh-moral" data-tooltip="${esc(path?.name ?? t("Humanity"))}"><i class="fa-solid fa-scale-balanced"></i><b>${s.morality.value}</b></span>`;

  // оружие — только значок, подобранный по названию (лук, коса, кинжал…); название и урон — в подсказке; лишнее с конца прячет fitWeapons
  const weapons = weaponsOf(a).slice(0, 4).map(w => `<a class="rh-btn rh-weapon" data-act="attack" data-weapon="${w.id}" data-tooltip="${esc(`${w.name} · ${w.label} · ${game.i18n.localize(VTM20.damageTypes[w.damageType]?.label ?? "")}`)}" aria-label="${esc(w.name)}">
      <i class="fa-solid ${weaponGlyph(w)}"></i></a>`).join("");
  const man = (k, icon) => {
    const tip = [t(`Combat.M.${k}`), t(`Combat.MNote.${k}`)].filter(Boolean).join(" — ");
    return `<a class="rh-btn rh-man ${k === "bite" ? "rh-bite" : ""}" data-act="maneuver" data-man="${k}" data-tooltip="${esc(tip)}" aria-label="${esc(t(`Combat.M.${k}`))}"><i class="fa-solid ${icon}"></i></a>`;
  };
  const maneuvers = man("punch", "fa-hand-fist") + (s.fx?.claws ? man("claws", "fa-paw") : "") + (vamp ? man("bite", "fa-tooth") : man("clinch", "fa-people-pulling"));
  // Мощь за кровь и дополнительные действия Стремительности — на этот ход (Дисциплины/06, 14)
  const pot = a.discipline("potence"), cel = a.discipline("celerity");
  const physBtns = (a.hasBlood && pot ? `<a class="rh-btn ${a.potenceActive ? "is-on" : ""}" data-act="potence" data-tooltip="${esc(t(a.potenceActive ? "Hud.PotenceOnTip" : "Hud.PotenceTip", { n: pot }))}"><i class="fa-solid fa-hand-fist"></i></a>` : "")
    + (a.hasBlood && cel ? `<a class="rh-btn ${a.celerityActions ? "is-on" : ""}" data-act="celerity" data-tooltip="${esc(t("Hud.CelerityTip", { n: cel, used: a.celerityActions }))}"><i class="fa-solid fa-forward"></i>${a.celerityActions ? `<small>${a.celerityActions}</small>` : ""}</a>` : "");
  // силы, вынесенные булавкой с листа (флаг hudPowers): знак Дисциплины и уровень, щелчок — бросок
  const powers = (a.getFlag(SYSTEM_ID, "hudPowers") ?? []).map(ref => {
    const x = powerByRef(ref);
    if (!x) return "";
    return `<a class="rh-btn rh-power" data-act="power" data-ref="${esc(ref)}" data-tooltip="${esc(`${x.p.name} · ${x.pathName || x.d.name} ${x.p.level}`)}">
      <img class="rh-pico" src="${esc(foundry.utils.getRoute(Codex.disciplineIcon(x.disc)))}" alt=""><small>${x.p.level}</small></a>`;
  }).join("");
  const fxChips = (a.powerEffects ?? []).map(x => `<span class="rh-chip rh-fx" data-tooltip="${esc(x.effect.name)}"><img src="${esc(x.effect.img)}" alt=""></span>`).join("");

  const arm = a.armor;
  const soak = `${a.soakPool("bashing")}/${a.soakPool("lethal")}/${a.soakPool("aggravated")}`;
  const combatant = game.combat?.combatants?.find(c => c.actor?.id === a.id);
  const myTurn = !!(combatant && game.combat?.started && game.combat.combatant === combatant);
  const initBox = (tag, act, num, cap, tip = "") => `<${tag} class="rh-init ${myTurn ? "is-turn" : ""}" ${act ? `data-act="${act}"` : ""} ${tip ? `data-tooltip="${esc(tip)}"` : ""}><b>${num}</b><span>${cap}</span></${tag}>`;
  const init = game.combat ? (combatant
    ? (combatant.initiative == null ? initBox("a", "init", `<i class="fa-solid fa-dice-d10"></i>`, esc(t("Hud.Init")))
      : initBox("span", "", Math.floor(combatant.initiative), myTurn ? esc(t("Hud.YourTurn")) : `<i class="fa-solid fa-bolt"></i> ${esc(t("Hud.InitShort"))}`, t("Sheet.Initiative")))
    : initBox("a", "join", `<i class="fa-solid fa-swords"></i>`, esc(t("Hud.Join"))))
    : initBox("a", "initRoll", s.initiative, `<i class="fa-solid fa-bolt"></i> ${esc(t("Hud.InitShort"))}`, t("Hud.InitTip"));

  // Атаки, ждущие защиты этого персонажа
  const pend = pendingAttacks(a);
  const last = pend.at(-1)?.getFlag(SYSTEM_ID, "combat");
  const alarm = last ? `<a class="rh-alarm" data-act="defendPending" data-tooltip="${esc(t("Hud.DefendTip", { a: last.attackerName, w: last.weaponName, n: last.successes }))}">
      <i class="fa-solid fa-triangle-exclamation"></i><span>${esc(t("Hud.UnderAttack", { name: last.attackerName }))}</span>${pend.length > 1 ? `<b>×${pend.length}</b>` : ""}</a>` : "";
  const btn = (k, icon, tip) => `<a class="rh-btn" data-act="${k}" data-tooltip="${esc(tip)}" aria-label="${esc(tip)}"><i class="fa-solid ${icon}"></i></a>`;
  const group = (label, body, cls = "") => `<div class="rh-group ${cls}"><label>${esc(label)}</label><div class="rh-group-body">${body}</div></div>`;
  const healthNote = s.health.damage ? `${game.i18n.localize(`VTM20.Health.${s.health.status}`)}${s.health.penalty ? ` ${s.health.penalty}` : ""}` : t("Health.healthy");
  el.innerHTML = `
    <div class="rh-face" data-act="sheet" data-tooltip="${esc(t("Hud.SheetTip"))}">
      <img src="${esc(a.img)}" alt="">
      <div><b>${esc(a.name)}</b><small>${esc(sub)}</small></div>
    </div>
    <div class="rh-tracks">
      <div data-tooltip="${esc(healthNote)}"><label>${esc(t("Sheet.Health"))}</label>${healthTrack(s)}<em class="${s.health.damage ? "is-hurt" : ""}">${esc(healthNote)}</em></div>
      <div><label>${esc(t("Willpower"))}</label>${willTrack(s)}<em>${s.willpower.temporary}/${s.willpower.permanent}</em></div>
      <div class="rh-stats">${blood}${morality}</div>
    </div>
    ${group(t("Combat.Attack"), `${alarm}${weapons}${maneuvers}<a class="rh-btn rh-man" data-act="attack" data-tooltip="${esc(t("Hud.AttackTip"))}"><i class="fa-solid fa-ellipsis"></i></a>`, "rh-attacks")}
    ${group(t("Hud.Defense"), btn("dodge", "fa-person-running", t("Combat.Defense.dodge")) + btn("block", "fa-shield-halved", t("Combat.Defense.block")) + btn("parry", "fa-khanda", t("Combat.Defense.parry")))}
    ${group(t("Hud.Actions"), btn("roll", "fa-dice-d10", t("Hud.RollTip"))
      + physBtns
      + (a.hasBlood ? btn("heal", "fa-hand-holding-droplet", t("Sheet.HealHint")) + btn("hunt", "fa-moon", t("Hunt.Button")) : "")
      + btn("hazard", "fa-fire", t("Hazard.Title")))}
    ${powers || fxChips ? group(t("Hud.Powers"), powers + fxChips, "rh-powers") : ""}
    <div class="rh-side">${init}
      <div class="rh-side-row">
        <span class="rh-chip ${arm.rating ? "" : "is-off"}" data-tooltip="${esc(arm.rating ? t("Hud.ArmorTip", { r: arm.rating, p: arm.penalty }) : t("Hud.NoArmor"))}"><i class="fa-solid fa-shield"></i> ${arm.rating}${arm.penalty ? ` <small>−${arm.penalty}</small>` : ""}</span>
        <span class="rh-chip" data-tooltip="${esc(t("Sheet.SoakHint"))}"><i class="fa-solid fa-shield-halved"></i> ${soak}</span>
      </div>
    </div>`;
  el.classList.toggle("is-turn", myTurn);
  fitHud();
}

async function onClick(ev) {
  const el = ev.target.closest("[data-act]");
  if (!el) return;
  ev.preventDefault();
  const a = hudActor();
  if (!a) return;
  switch (el.dataset.act) {
    case "sheet": return a.sheet.render(true);
    case "attack": return openAttack(a, { weapon: el.dataset.weapon ?? null });
    case "maneuver": return openAttack(a, { maneuver: el.dataset.man });
    case "roll": return RollDialog.prompt(a, {});
    case "dodge": case "block": case "parry": return openDefense(a, el.dataset.act);
    case "spend": return a.spendBlood(1, { reason: t("Notify.ReasonManual") });
    case "heal": return a.bloodHeal(null);
    case "potence": return a.potenceActive ? null : a.activatePotence();
    case "celerity": {
      const max = Math.min(a.discipline("celerity"), a.celerityActions + (a.system.blood?.value ?? 0));
      if (max <= a.celerityActions) return ui.notifications.warn(t("Notify.NoBlood", { name: a.name }));
      const opts = Array.from({ length: max - a.celerityActions }, (_, i) => a.celerityActions + i + 1)
        .map(n => `<option value="${n}">${esc(t("Hud.CelerityOption", { n }))}</option>`).join("");
      const n = await foundry.applications.api.DialogV2.prompt({
        window: { title: Codex.disciplineLabel("celerity"), icon: "fa-solid fa-forward" }, classes: ["vtm20", "r-dialog"],
        content: `<div class="r-form"><p>${esc(t("Hud.CelerityAsk"))}</p><label class="r-field"><select name="n">${opts}</select></label></div>`,
        ok: { label: t("Hud.CelerityBuy"), callback: (e, b) => Number(b.form.elements.n.value) || 0 }, rejectClose: false
      });
      return n ? a.buyCelerityActions(n) : null;
    }
    case "power": return rollPowerRef(a, el.dataset.ref);
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

/** Не залезать под поле чата, когда боковая панель свёрнута. */
function fitHud() {
  const el = document.getElementById(ID), bottom = document.getElementById("ui-bottom");
  if (!el || !bottom) return;
  const chat = document.getElementById("chat-notifications");
  const r = chat?.getBoundingClientRect(), b = bottom.getBoundingClientRect();
  const input = chat?.querySelector("#chat-message");
  const busy = r && r.width > 0 && r.left < b.right && input && getComputedStyle(input).display !== "none";
  el.style.maxWidth = busy ? `${Math.max(420, r.left - b.left - 12)}px` : "";
  el.style.marginLeft = busy ? "0" : "";
  fitWeapons(el);
}

/** Оружие в группе атаки: прятать с конца, пока приёмы и «…» не влезут целиком (хотя бы одно оружие остаётся). */
function fitWeapons(el) {
  const body = el.querySelector(".rh-attacks .rh-group-body");
  if (!body) return;
  const list = [...body.querySelectorAll(".rh-weapon")];
  list.forEach(w => { w.hidden = false; });
  for (let i = list.length - 1; i > 0 && body.scrollWidth > body.clientWidth + 1; i--) list[i].hidden = true;
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
