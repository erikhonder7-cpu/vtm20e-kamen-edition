// module/ui/combat-tracker.mjs
// Трекер боя в духе листа: под именем бойца — состояние здоровья со штрафом, кровь и воля (только тем, кто
// видит лист: владельцу и рассказчику), значки ярости/торпора и т. п.; строка подсвечивается по состоянию.
// Инициатива V20 — d10, поэтому значок броска инициативы — d10, а не d20 (стили — r-foundry.css).

const t = k => game.i18n.localize(`VTM20.${k}`);

/** Состояния, которые видно всем за столом (как значки на жетоне). */
const STATES = [
  { id: "r-frenzy", icon: "fa-face-angry", cls: "is-frenzy" },
  { id: "r-rotschreck", icon: "fa-fire", cls: "is-fear" },
  { id: "r-torpor", icon: "fa-bed", cls: "is-torpor" },
  { id: "r-staked", icon: "fa-thumbtack", cls: "is-torpor" }
];

export function registerCombatTracker() {
  Hooks.on("renderCombatTracker", (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    const combat = app.viewed ?? game.combat;
    if (!root || !combat) return;
    for (const li of root.querySelectorAll(".combatant[data-combatant-id]")) {
      const c = combat.combatants.get(li.dataset.combatantId);
      const a = c?.actor;
      if (!a?.system?.health) continue;
      const h = a.system.health, st = a.statuses ?? new Set();
      li.classList.add("r-ct");
      li.classList.toggle("is-hurt", h.damage > 0 && !h.incapacitated);
      li.classList.toggle("is-down", !!h.incapacitated);
      for (const s of STATES) li.classList.toggle(s.cls, st.has(s.id));

      const line = document.createElement("div");
      line.className = "r-ct-line";
      const status = h.status === "healthy" ? t("Health.healthy") : t(`Health.${h.status}`);
      const parts = [`<span class="r-ct-health" data-tooltip="${t("Sheet.Health")}">${status}${h.penalty ? ` <b>${h.penalty}</b>` : ""}</span>`];
      // кровь и воля — только тем, кто видит лист (игрок не узнаёт запасы чужих)
      if (a.isOwner) {
        if (a.hasBlood) parts.push(`<span class="r-ct-blood" data-tooltip="${t("Sheet.BloodPool")}"><i class="fa-solid fa-droplet"></i> ${a.system.blood.value}/${a.system.blood.max}</span>`);
        parts.push(`<span class="r-ct-will" data-tooltip="${t("Willpower")}"><i class="fa-solid fa-star"></i> ${a.system.willpower.temporary}/${a.system.willpower.permanent}</span>`);
      }
      const icons = STATES.filter(s => st.has(s.id)).map(s => `<i class="fa-solid ${s.icon} r-ct-state" data-tooltip="${t(`Status.${s.id.slice(2)}`)}"></i>`).join("");
      line.innerHTML = parts.join("") + icons;
      li.querySelector(".token-name")?.append(line);
    }
  });
  // Изменились раны, кровь или состояния бойца — перерисовать трекер
  const refresh = doc => {
    const actor = doc?.documentName === "Actor" ? doc : doc?.parent;
    if (actor && game.combat?.combatants.some(c => c.actor === actor)) ui.combat?.render();
  };
  Hooks.on("updateActor", refresh);
  Hooks.on("createActiveEffect", refresh);
  Hooks.on("deleteActiveEffect", refresh);
}
