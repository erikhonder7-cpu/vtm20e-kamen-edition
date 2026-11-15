// module/combat/ruler.mjs
// Линейка жетона по зонам передвижения V20 (combat/movement.mjs): путь окрашен — зелёный шагом, жёлтый трусцой,
// красный бегом, серый — дальше, чем за ход; в подписи точки пути — какая это зона. Расстояние — по пути с начала
// хода (Foundry v14 считает пройденное в бою вместе с планом). Единицы сцены в футах — переводятся в метры.

import { movement, registerMoveTracking } from "./movement.mjs";

const COLORS = { walk: 0x5fa463, jog: 0xd8b04a, run: 0xc4474c, over: 0x6b6660 };
const t = k => game.i18n.localize(`VTM20.Combat.Move.Zone.${k}`);

/** Метры в единице сетки сцены. */
const meters = () => /ft|feet|фут/i.test(canvas.grid?.units ?? "") ? 0.3048 : /yd|ярд/i.test(canvas.grid?.units ?? "") ? 0.9144 : 1;

export function registerMoveRuler() {
  registerMoveTracking();   // движение в ходу боя — для штрафа «двигался и атакует» (combat.mjs)
  const Base = foundry.canvas?.placeables?.tokens?.TokenRuler;
  if (!Base) return;
  class VtmTokenRuler extends Base {
    /** Зона для точки пути: walk / jog / run / over; null — у актёра нет передвижения (дух, предмет). */
    #zone(waypoint) {
      const mv = movement(this.token?.actor);
      const d = Number(waypoint?.measurement?.distance);
      if (!mv || !Number.isFinite(d)) return null;
      const m = d * meters();
      if (m <= mv.walk + 0.01) return "walk";
      if (mv.jog != null && m <= mv.jog + 0.01) return "jog";
      if (mv.run != null && m <= mv.run + 0.01) return "run";
      return "over";
    }
    _getSegmentStyle(waypoint) {
      const s = super._getSegmentStyle(waypoint), z = s.width ? this.#zone(waypoint) : null;
      return z ? { ...s, color: COLORS[z] } : s;
    }
    _getGridHighlightStyle(waypoint, offset) {
      const s = super._getGridHighlightStyle(waypoint, offset), z = s.alpha === 0 ? null : this.#zone(waypoint);
      return z ? { ...s, color: COLORS[z], alpha: 0.35 } : s;
    }
    _getWaypointLabelContext(waypoint, state) {
      const ctx = super._getWaypointLabelContext(waypoint, state), z = ctx ? this.#zone(waypoint) : null;
      if (z) ctx.units = `${ctx.units ?? ""} · ${t(z)}`;
      return ctx;
    }
  }
  CONFIG.Token.rulerClass = VtmTokenRuler;
}
