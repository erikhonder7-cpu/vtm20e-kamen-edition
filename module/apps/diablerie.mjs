// module/apps/diablerie.mjs
// Диаблери, Амарант (V20_Основные_правила/05): выпив кровь, вампир пьёт душу —
// продолжительная проверка Силы (сл. 9), каждый успех — неотвратимое губительное
// повреждение жертве; когда все уровни здоровья жертвы заполнены, душа поглощена.
// Итог: поколение −1, если жертва старше (больше — по решению рассказчика), Человечность
// −1 автоматически, чёрные прожилки в ауре (разница поколений в годах, минимум 1),
// тревожная аура столько же месяцев, проверка экстаза (Самоконтроль, сл. 10 − мораль).

import { VTM20, SYSTEM_PATH } from "../config.mjs";
import { rollPool } from "../dice/roll.mjs";
import { RollDialog } from "../dice/dialog.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const LEVELS = 7;

export function openDiablerie(actor) {
  if (!actor.isVampire) return ui.notifications.warn(t("Diablerie.OnlyVampire"));
  return new DiablerieDialog(actor).render({ force: true });
}

class DiablerieDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["vtm20", "r-dialog", "r-diablerie"],
    tag: "form",
    window: { title: "VTM20.Diablerie.Title", icon: "fa-solid fa-skull" },
    position: { width: 440 },
    form: { handler: DiablerieDialog.#onDrink, closeOnSubmit: false, submitOnChange: false },
    actions: { finish: DiablerieDialog.#onFinish }
  };

  static PARTS = { form: { template: `${SYSTEM_PATH}/templates/apps/diablerie.hbs` } };

  constructor(actor) {
    super({ window: { title: `${t("Diablerie.Title")}: ${actor.name}` } });
    this.actor = actor;
    this.v = { victimId: "", victimGen: 13, progress: 0, drop: null, done: false };
  }

  get victim() { return this.v.victimId ? game.actors.get(this.v.victimId) : null; }
  get victimGen() { return this.victim?.system.generation ?? this.v.victimGen; }
  /** Сколько уровней здоровья жертвы ещё не заняты губительными повреждениями. */
  get needed() {
    const agg = this.victim?.system.health.aggravated ?? 0;
    return Math.max(0, LEVELS - agg);
  }
  get suggestedDrop() {
    const diff = this.actor.system.generation - this.victimGen;
    if (diff <= 0) return 0;
    return diff >= 5 ? 2 : 1;
  }

  async _prepareContext() {
    const a = this.actor, v = this.v, gen = a.system.generation, vg = this.victimGen;
    const drop = v.drop ?? this.suggestedDrop;
    const years = Math.max(1, gen - vg);
    const victims = game.actors.filter(x => x.isVampire && x.id !== a.id)
      .map(x => ({ id: x.id, name: `${x.name} (${toGen(x.system.generation)})`, selected: x.id === v.victimId }));
    return {
      v, victims, victim: this.victim, vg, gen, drop, newGen: gen - drop, years,
      pool: a.system.attributes.strength.total + a.physicalDisciplineBonus("strength"),
      needed: this.needed, progress: v.progress, complete: v.progress >= this.needed && this.needed > 0 || v.done,
      pct: this.needed ? Math.min(100, Math.round(v.progress / this.needed * 100)) : 0,
      bigGap: gen - vg >= 5, canHurt: !!this.victim?.isOwner
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.element.addEventListener("change", () => {
      const f = new foundry.applications.ux.FormDataExtended(this.element).object;
      if ((f.victimId ?? "") !== this.v.victimId) { this.v.victimId = f.victimId ?? ""; this.v.progress = 0; this.v.drop = null; }
      if (f.victimGen != null) this.v.victimGen = Math.clamp(Number(f.victimGen) || 13, 3, 15);
      if (f.drop != null && f.drop !== "") this.v.drop = Math.clamp(Number(f.drop), 0, 6);
      this.render();
    });
  }

  /** Очередной бросок продолжительной проверки Силы (сл. 9). */
  static async #onDrink() {
    const a = this.actor;
    const pool = a.system.attributes.strength.total + a.physicalDisciplineBonus("strength");
    const r = await rollPool({
      actor: a, title: t("Diablerie.Drink"), subtitle: t("Diablerie.Title"), pool, difficulty: 9, kind: "check",
      breakdown: [{ label: game.i18n.localize(VTM20.attributes.strength.label), value: pool }],
      notes: [t("Diablerie.DrinkNote")]
    });
    const gained = Math.min(r.successes, Math.max(0, this.needed - this.v.progress));
    this.v.progress += gained;
    const victim = this.victim;
    if (victim?.isOwner && gained > 0) await victim.applyDamage(gained, "aggravated");
    this.render();
  }

  /** Душа поглощена: поколение, мораль, след в ауре, проверка экстаза. */
  static async #onFinish() {
    const a = this.actor, gen = a.system.generation, vg = this.victimGen;
    const drop = this.v.drop ?? this.suggestedDrop;
    const newGen = Math.max(3, gen - drop);
    const morality = Math.max(0, a.system.morality.value - 1);
    await a.update({ "system.generation": newGen, "system.morality.value": morality });
    const years = Math.max(1, gen - vg);
    const lines = [
      `<b>${t("Diablerie.Consumed", { name: this.victim?.name ?? t("Diablerie.Victim") })}</b>`,
      drop ? t("Diablerie.GenDrop", { from: toGen(gen), to: toGen(newGen) }) : t("Diablerie.GenSame"),
      t("Diablerie.MoralityLoss", { n: morality }),
      t("Diablerie.Aura", { years, months: years }),
      t("Diablerie.Powers")
    ];
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: a }),
      content: `<div class="r-notice is-warn"><i class="fa-solid fa-skull"></i> ${lines.join("<br>")}</div>`
    });
    this.v.done = true;
    await this.close();
    return RollDialog.prompt(a, {
      title: t("Diablerie.Ecstasy"), trait1: "virtues.selfControl", reflexive: true, lockTraits: true,
      difficulty: Math.max(2, 10 - morality), diffNote: t("Diablerie.EcstasyNote")
    });
  }
}

function toGen(n) { return game.i18n.format("VTM20.GenerationN", { n }); }
