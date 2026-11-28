// module/apps/battle.mjs
// Сражение Тёмных веков (V20 Dark Ages: Tome of Secrets, гл. 3 «Средневековая война», с. 91–97) — окно рассказчика.
//   · Цели сторон: финальная и промежуточные по правилу книги — укрепления (1–2), чужак на земле, меньшее войско (1–2),
//     преимущество врага (1–2), общая битва. Каждая цель — одна сцена; провал рождает новую цель-сцену.
//   · Отряды смертных: пул — 1 куб за слабого, 2 за солдата, 3 за ветерана; оружие — его бонус один раз; конь — свой бонус за
//     всадника; защита — бонус брони − 1; Мощь у большинства — автоуспех. Инициатива — по двум сильнейшим; два действия за долгий
//     ход; урон — уровень за успех сверх защиты; убит — пул меньше на его кубы.
//   · Долгие ходы (час боя): действий — физических по Ловкости, умственных по Смекалке, социальных по Манипуляции (смешанные — по
//     меньшей); порядок — по инициативе Ловкость + Смекалка без броска.
// Хранение — настройка мира battle (только рассказчик).

import { SYSTEM_ID, SYSTEM_PATH } from "../config.mjs";
import { rollPool } from "../dice/roll.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.Battle.${k}`, d) : game.i18n.localize(`VTM20.Battle.${k}`);
export const OBJ_TYPES = ["fortify", "stranger", "smaller", "advantage", "general"];
const MEMBER = { weak: 1, soldier: 2, veteran: 3 };
const uid = () => foundry.utils.randomID(8);
const blank = () => ({ turn: 1, sides: [{ name: "", final: "", finalDone: "", objectives: [] }, { name: "", final: "", finalDone: "", objectives: [] }], groups: [], fighters: [] });

export function registerBattle() {
  game.settings.register(SYSTEM_ID, "battle", { scope: "world", config: false, type: Object, default: blank(),
    onChange: () => foundry.applications.instances.get("vtm20-battle")?.render() });
}
const state = () => foundry.utils.mergeObject(blank(), foundry.utils.deepClone(game.settings.get(SYSTEM_ID, "battle") ?? {}), { inplace: false });
const save = b => game.settings.set(SYSTEM_ID, "battle", b);

/** Пул отряда: состав, оружие, кони; защита — бронёй − 1; инициатива — по двум сильнейшим. */
export function groupMath(g) {
  const base = (g.weak ?? 0) * MEMBER.weak + (g.soldier ?? 0) * MEMBER.soldier + (g.veteran ?? 0) * MEMBER.veteran;
  const members = [...Array(g.veteran ?? 0).fill(3), ...Array(g.soldier ?? 0).fill(2), ...Array(g.weak ?? 0).fill(1)];
  const horses = 2 * Math.min(g.horses ?? 0, members.length);
  return { base, attack: base + (base ? (g.weapon ?? 0) + horses : 0), defense: base + (base ? Math.max(0, (g.armor ?? 0) - 1) : 0),
    init: (members[0] ?? 0) + (members[1] ?? 0), size: members.length, auto: g.potence ? 1 : 0 };
}

class BattleApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "vtm20-battle", classes: ["vtm20", "r-dialog", "r-battle"],
    window: { title: "VTM20.Battle.Title", icon: "fa-solid fa-chess-board", resizable: true },
    position: { width: 1000, height: 820 },
    actions: { act: BattleApp.#onAct }
  };
  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/apps/battle.hbs`, scrollable: [".r-bt-body"] } };

  async _prepareContext() {
    const b = state();
    const sides = b.sides.map((s, si) => ({ si, name: s.name, final: s.final, finalDone: s.finalDone,
      objectives: s.objectives.map((o, oi) => ({ ...o, oi, si, typeLabel: t(`Obj.${o.type}`), hint: t(`ObjHint.${o.type}`) })),
      left: s.objectives.filter(o => o.status !== "done").length,
      types: OBJ_TYPES.map(k => ({ key: k, label: t(`Obj.${k}`), hint: t(`ObjHint.${k}`) })) }));
    const groups = b.groups.map((g, gi) => { const m = groupMath(g);
      return { ...g, gi, ...m, sideName: b.sides[g.side]?.name || t(g.side ? "SideB" : "SideA"), sideB: g.side === 1,
        members: Object.keys(MEMBER).map(k => ({ k, label: t(`M.${k}`), n: g[k] ?? 0 })),
        pips: [0, 1].map(n => ({ n, on: n < (g.spent ?? 0) })) }; });
    const fighters = b.fighters.map((f, fi) => { const a = fromUuidSync(f.uuid); if (!a) return null;
      const at = a.system?.attributes ?? {}, val = k => at[k]?.total ?? at[k]?.value ?? 0;
      const row = (k, n) => ({ k, n, pips: Array.from({ length: n }, (_, i) => ({ i, on: i < (f.spent?.[k] ?? 0) })) });
      return { fi, uuid: f.uuid, name: a.name, img: a.img, init: val("dexterity") + val("wits"),
        kinds: [row("phys", val("dexterity")), row("ment", val("wits")), row("soc", val("manipulation"))].map(r => ({ ...r, label: t(`Act.${r.k}`) })) };
    }).filter(Boolean).sort((x, y) => y.init - x.init);
    return { turn: b.turn, sides, groups, fighters, empty: !b.groups.length && !b.fighters.length };
  }

  _onRender(ctx, opts) {
    super._onRender?.(ctx, opts);
    for (const el of this.element.querySelectorAll("[data-bt]")) el.addEventListener("change", ev => {
      ev.stopPropagation();
      const b = state(), [kind, a, c, d] = el.dataset.bt.split("|"), v = el.type === "checkbox" ? el.checked : el.value;
      if (kind === "side") b.sides[a][c] = String(v).slice(0, 80);
      else if (kind === "obj") { const o = b.sides[a]?.objectives?.[c]; if (o) o[d] = String(v).slice(0, 120); }
      else if (kind === "group") { const g = b.groups[a]; if (!g) return; g[c] = c === "name" ? String(v).slice(0, 60) : c === "potence" ? !!v : Math.clamp(Number(v) || 0, 0, 999); }
      save(b);
    });
    // лист персонажа или жетон — в долгие ходы
    if (this._dropBound !== this.element) {
      this._dropBound = this.element;
      this.element.addEventListener("dragover", ev => ev.preventDefault());
      this.element.addEventListener("drop", async ev => {
        const data = TextEditor.getDragEventData?.(ev) ?? JSON.parse(ev.dataTransfer.getData("text/plain") || "{}");
        if (data.type !== "Actor") return;
        const b = state(); if (!b.fighters.some(f => f.uuid === data.uuid)) b.fighters.push({ uuid: data.uuid, spent: {} }); save(b);
      });
    }
  }

  static async #onAct(event, target) {
    const d = target.dataset, b = state(), si = Number(d.si), oi = Number(d.oi), gi = Number(d.gi), fi = Number(d.fi);
    switch (d.op) {
      case "objAdd": b.sides[si].objectives.push({ id: uid(), type: d.type, text: "", status: "open" }); break;
      case "objDel": b.sides[si].objectives.splice(oi, 1); break;
      case "objDone": { const o = b.sides[si].objectives[oi]; o.status = o.status === "done" ? "open" : "done"; break; }
      case "objFail": { // провал — новая цель-сцена той же стороны (Tome of Secrets, с. 93)
        const o = b.sides[si].objectives[oi]; o.status = "failed";
        b.sides[si].objectives.splice(oi + 1, 0, { id: uid(), type: o.type, text: t("FailedFollow", { text: o.text || t(`Obj.${o.type}`) }), status: "open", from: o.id });
        break; }
      case "objUp": if (oi > 0) { const l = b.sides[si].objectives; [l[oi - 1], l[oi]] = [l[oi], l[oi - 1]]; } break;
      case "finalDone": b.sides[si].finalDone = b.sides[si].finalDone ? "" : "1"; break;
      case "groupAdd": b.groups.push({ name: "", side: Number(d.side) || 0, weak: 0, soldier: 4, veteran: 0, weapon: 2, armor: 2, horses: 0, potence: false, spent: 0 }); break;
      case "groupDel": b.groups.splice(gi, 1); break;
      case "member": { const g = b.groups[gi]; g[d.k] = Math.max(0, (g[d.k] ?? 0) + Number(d.d)); break; }
      case "groupSide": b.groups[gi].side = b.groups[gi].side ? 0 : 1; break;
      case "groupPip": { const g = b.groups[gi]; g.spent = g.spent === Number(d.n) + 1 ? Number(d.n) : Number(d.n) + 1; break; }
      case "groupRoll": return rollGroup(b.groups[gi], d.mode);
      case "fighterAdd": for (const tk of canvas?.tokens?.controlled ?? []) if (tk.actor && !b.fighters.some(f => f.uuid === tk.actor.uuid)) b.fighters.push({ uuid: tk.actor.uuid, spent: {} }); break;
      case "fighterDel": b.fighters.splice(fi, 1); break;
      case "fighterOpen": return fromUuidSync(d.uuid)?.sheet?.render(true);
      case "pip": { const f = b.fighters.find(x => x.uuid === d.uuid); if (!f) return; const n = Number(d.i) + 1; f.spent ??= {}; f.spent[d.k] = f.spent[d.k] === n ? n - 1 : n; break; }
      case "nextTurn": b.turn += 1; for (const f of b.fighters) f.spent = {}; for (const g of b.groups) g.spent = 0;
        ChatMessage.create({ content: `<div class="r-notice"><i class="fa-solid fa-hourglass-half"></i> ${foundry.utils.escapeHTML(t("TurnStart", { n: b.turn }))}</div>` }); break;
      case "reset": if (!(await foundry.applications.api.DialogV2.confirm({ window: { title: t("Reset") }, content: `<p>${t("ResetAsk")}</p>` }))) return;
        return save(blank());
      default: return;
    }
    return save(b);
  }
}

/** Бросок отряда: атака (пул с оружием и конями, автоуспех Мощи) или защита (пул с бронёй − 1). */
function rollGroup(g, mode) {
  if (!g) return;
  const m = groupMath(g), attack = mode !== "def";
  const bd = [{ label: t("Members", { w: g.weak ?? 0, s: g.soldier ?? 0, v: g.veteran ?? 0 }), value: m.base },
    ...(attack ? [{ label: t("Weapon"), value: g.weapon ?? 0 }] : [{ label: t("ArmorDef"), value: Math.max(0, (g.armor ?? 0) - 1) }]),
    ...(attack && g.horses ? [{ label: t("Horses"), value: 2 * Math.min(g.horses, m.size) }] : [])].filter(x => x.value);
  return rollPool({ title: `${g.name || t("Group")}: ${t(attack ? "Attack" : "Defend")}`, pool: attack ? m.attack : m.defense, difficulty: 6,
    auto: attack ? m.auto : 0, breakdown: bd, kind: "check", notes: [t(attack ? "AttackNote" : "DefendNote")] });
}

export function openBattle() {
  if (!game.user.isGM) return ui.notifications.warn(t("GmOnly"));
  const app = foundry.applications.instances.get("vtm20-battle") ?? new BattleApp();
  app.render({ force: true });
  return app;
}
