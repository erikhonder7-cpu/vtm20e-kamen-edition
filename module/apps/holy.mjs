// module/apps/holy.mjs
// Святые реликвии (V20 Dark Ages: Tome of Secrets, гл. 4 «Вера», «Черты веры»): у вещи — своя Истинная вера и черты (по одной на
// точку). Отпугнуть Каинита — бросок веры реликвии против его текущей Воли; дело в духе черты — −1 к сложности за каждую, против —
// +1 за каждую, и тогда своя Истинная вера владельца не прибавляется. Злоупотребление — год за дремлющую точку (у места — 10 лет);
// после подвига или злодейства дремлющие точки бросаются со сложностью 8: успех — точка вернулась (или ушла).
// Хранение — флаг предмета holy: { faith, aspects: [], dormant }.

import { SYSTEM_ID } from "../config.mjs";
import { rollPool } from "../dice/roll.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.Holy.${k}`, d) : game.i18n.localize(`VTM20.Holy.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
export const holyOf = item => item?.getFlag?.(SYSTEM_ID, "holy") ?? null;

/** Для строки снаряжения: вера, активные точки, черты. */
export function holyView(item) {
  const h = holyOf(item);
  if (!h) return null;
  const active = Math.max(0, (h.faith ?? 0) - (h.dormant ?? 0));
  return { faith: h.faith ?? 0, active, dormant: h.dormant ?? 0, aspects: (h.aspects ?? []).join(", "),
    pips: Array.from({ length: h.faith ?? 0 }, (_, i) => ({ on: i < active })) };
}

/** Окно реликвии: отпугнуть или испытать дремлющие точки. */
export async function useRelic(actor, item) {
  const h = holyOf(item);
  if (!h) return;
  const active = Math.max(0, (h.faith ?? 0) - (h.dormant ?? 0)), own = actor.system.trueFaith ?? 0, n = (h.aspects ?? []).length;
  // цели: отмеченные токены и токены сцены (их текущая Воля — сложность)
  const seen = new Set(), foes = [];
  for (const tk of [...(game.user.targets ?? []), ...(canvas?.tokens?.placeables ?? [])]) {
    const a = tk.actor; if (!a || a === actor || seen.has(a.uuid)) continue; seen.add(a.uuid);
    foes.push({ uuid: a.uuid, name: a.name, wp: a.system?.willpower?.temporary ?? a.system?.willpower?.permanent ?? 6 });
  }
  const chips = (name, max) => Array.from({ length: max + 1 }, (_, i) => `<label class="r-atk-chip"><input type="radio" name="${name}" value="${i}" ${i ? "" : "checked"}><span>${i}</span></label>`).join("");
  const content = `<div class="r-holy-dlg">
    <p class="r-holy-line"><b>${esc(item.name)}</b> · ${t("Faith")} ${"●".repeat(active)}${"○".repeat(h.dormant ?? 0)}${(h.dormant ?? 0) ? ` <small>${t("DormantN", { n: h.dormant })}</small>` : ""}</p>
    <p class="r-holy-aspects"><i class="fa-solid fa-hands-praying"></i> ${esc((h.aspects ?? []).join(", "))}</p>
    <label class="r-holy-row"><span>${t("Target")}</span><select name="foe"><option value="">${t("NoTarget")}</option>${foes.map(f => `<option value="${f.uuid}" data-wp="${f.wp}">${esc(f.name)} — ${t("Will", { n: f.wp })}</option>`).join("")}</select></label>
    <label class="r-holy-row"><span>${t("Diff")}</span><input type="number" name="diff" value="6" min="2" max="10"><small>${t("DiffHint")}</small></label>
    <div class="r-holy-row"><span>${t("WithAspect")}</span><div class="r-atk-chips">${chips("with", n)}</div></div>
    <div class="r-holy-row"><span>${t("AgainstAspect")}</span><div class="r-atk-chips">${chips("against", n)}</div></div>
    <p class="r-hint-note">${own ? t("OwnFaith", { n: own }) : t("NoOwnFaith")}</p>
  </div>`;
  const res = await foundry.applications.api.DialogV2.wait({
    window: { title: `${t("Title")}: ${item.name}`, icon: "fa-solid fa-hand-sparkles" }, classes: ["vtm20", "r-dialog", "r-holy"], position: { width: 540 }, content,
    render: (ev, dlg) => { const el = dlg.element ?? dlg; const sel = el.querySelector("select[name=foe]"), diff = el.querySelector("input[name=diff]");
      sel?.addEventListener("change", () => { const o = sel.selectedOptions[0]; if (o?.dataset.wp) diff.value = Math.clamp(Number(o.dataset.wp), 2, 10); }); },
    buttons: [
      { action: "rebuke", label: t("Rebuke"), icon: "fa-solid fa-hand-sparkles", default: true,
        callback: (ev, btn) => { const f = btn.form.elements; return { op: "rebuke", foe: f.foe.value, diff: Number(f.diff.value) || 6,
          with: Number(f.with.value) || 0, against: Number(f.against.value) || 0 }; } },
      { action: "wake", label: t("Wake"), icon: "fa-solid fa-sun", callback: () => ({ op: "wake" }) },
      { action: "dim", label: t("Dim"), icon: "fa-solid fa-cloud", callback: () => ({ op: "dim" }) }
    ], rejectClose: false
  });
  if (!res) return;
  if (res.op === "dim") return item.setFlag(SYSTEM_ID, "holy", { ...h, dormant: Math.min(h.faith, (h.dormant ?? 0) + 1) });
  if (res.op === "wake") {
    if (!(h.dormant > 0)) return ui.notifications.info(t("NoDormant"));
    const r = await rollPool({ actor, title: `${item.name}: ${t("Wake")}`, pool: h.dormant, difficulty: 8, kind: "check",
      breakdown: [{ label: t("DormantDots"), value: h.dormant }], notes: [t("WakeNote")] });
    if ((r?.successes ?? 0) > 0) await item.setFlag(SYSTEM_ID, "holy", { ...h, dormant: h.dormant - 1 });
    return r;
  }
  const foe = res.foe ? fromUuidSync(res.foe) : null, addOwn = !res.against && own > 0;
  const diff = Math.clamp(res.diff - res.with + res.against, 2, 10);
  const bd = [{ label: t("RelicFaith"), value: active }, ...(addOwn ? [{ label: t("OwnFaithLbl"), value: own }] : [])];
  const notes = [res.with ? t("WithNote", { n: res.with }) : "", res.against ? t("AgainstNote", { n: res.against }) : "", t("RebukeNote")].filter(Boolean);
  return rollPool({ actor, title: `${item.name}: ${t("Rebuke")}`, subtitle: foe ? `→ ${foe.name}` : "", pool: active + (addOwn ? own : 0), difficulty: diff, kind: "check", breakdown: bd, notes });
}
