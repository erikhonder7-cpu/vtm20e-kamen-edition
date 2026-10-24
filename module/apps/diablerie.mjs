// module/apps/diablerie.mjs
// Диаблери, Амарант (V20_Основные_правила/05): выпив кровь, вампир пьёт душу —
// продолжительная проверка Силы (сл. 9), каждый успех — неотвратимое губительное
// повреждение жертве; когда все уровни здоровья жертвы заполнены, душа поглощена.
// Итог: поколение −1, если жертва старше (больше — по решению рассказчика), Человечность
// −1 автоматически, чёрные прожилки в ауре (разница поколений в годах, минимум 1),
// тревожная аура столько же месяцев, проверка экстаза (Самоконтроль, сл. 10 − мораль).

import { VTM20, SYSTEM_PATH } from "../config.mjs";
import { rollPool, odds, chancesView } from "../dice/roll.mjs";
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
    classes: ["vtm20", "r-dialog", "r-roll-dialog", "r-diablerie"],
    tag: "form",
    window: { title: "VTM20.Diablerie.Title", icon: "fa-solid fa-skull" },
    position: { width: 460 },
    form: { handler: DiablerieDialog.#onDrink, closeOnSubmit: false, submitOnChange: false },
    actions: { finish: DiablerieDialog.#onFinish, bump: DiablerieDialog.#onBump }
  };

  static PARTS = { form: { template: `${SYSTEM_PATH}/templates/apps/diablerie.hbs` } };

  constructor(actor) {
    super({ window: { title: `${t("Diablerie.Title")}: ${actor.name}` } });
    this.actor = actor;
    this.v = { victimId: "", victimGen: 13, base: 0, progress: 0, drop: null, done: false, messageMode: game.settings.get("core", "messageMode") };
  }

  get victim() { return this.v.victimId ? game.actors.get(this.v.victimId) : null; }
  get victimGen() { return this.victim?.system.generation ?? this.v.victimGen; }
  /** Сколько уровней здоровья жертвы надо заполнить: от губительных повреждений на момент выбора жертвы,
   *  иначе урон, который наносит само питьё, засчитывался бы дважды. */
  get needed() { return Math.max(0, LEVELS - this.v.base); }
  get suggestedDrop() {
    const diff = this.actor.system.generation - this.victimGen;
    if (diff <= 0) return 0;
    return diff >= 5 ? 2 : 1;
  }
  get pool() {
    const a = this.actor;
    return a.system.attributes.strength.total + a.physicalDisciplineBonus("strength");
  }

  async _prepareContext() {
    const a = this.actor, v = this.v, gen = a.system.generation, vg = this.victimGen;
    const drop = v.drop ?? this.suggestedDrop, needed = this.needed, pool = this.pool;
    const str = a.system.attributes.strength.total, potence = a.physicalDisciplineBonus("strength");
    const chances = chancesView(odds({ pool, difficulty: 9 }));
    const left = Math.max(0, needed - v.progress), mean = odds({ pool, difficulty: 9 }).mean;
    const modes = CONFIG.ChatMessage?.modes ?? {};
    return {
      v, victim: this.victim, vg, gen, drop, newGen: Math.max(3, gen - drop), years: Math.max(1, gen - vg), pool, chances,
      victims: game.actors.filter(x => x.isVampire && x.id !== a.id)
        .map(x => ({ id: x.id, name: `${x.name} (${toGen(x.system.generation)})`, selected: x.id === v.victimId })),
      bd: [{ label: game.i18n.localize(VTM20.attributes.strength.label), value: str }, ...(potence ? [{ label: a.traitLabel("disciplines.potence"), value: potence }] : [])],
      soul: Array.from({ length: LEVELS }, (_, i) => i < v.base ? "is-old" : i < v.base + v.progress ? "is-full" : ""),
      needed, progress: v.progress, left, complete: (v.progress >= needed && needed > 0) || v.done,
      tries: left && mean > 0 ? Math.ceil(left / mean) : 0,
      bigGap: gen - vg >= 5, canHurt: !!this.victim?.isOwner,
      messageModes: Object.entries(modes).map(([k, m]) => ({ value: k, label: game.i18n.localize(m.label ?? k), selected: k === v.messageMode }))
    };
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.element.addEventListener("change", () => {
      const f = new foundry.applications.ux.FormDataExtended(this.element).object;
      if ((f.victimId ?? "") !== this.v.victimId) {
        this.v.victimId = f.victimId ?? ""; this.v.progress = 0; this.v.drop = null;
        this.v.base = Math.min(LEVELS, this.victim?.system.health.aggravated ?? 0);
      }
      if (f.victimGen != null) this.v.victimGen = Math.clamp(Number(f.victimGen) || 13, 3, 15);
      if (f.drop != null && f.drop !== "") this.v.drop = Math.clamp(Number(f.drop), 0, 6);
      this.v.messageMode = f.messageMode ?? this.v.messageMode;
      this.render();
    });
  }

  static #onBump(event, target) {
    const k = target.dataset.field, d = Number(target.dataset.d);
    if (k === "victimGen") this.v.victimGen = Math.clamp(this.v.victimGen + d, 3, 15);
    else this.v.drop = Math.clamp((this.v.drop ?? this.suggestedDrop) + d, 0, 6);
    this.render();
  }

  /** Очередной бросок продолжительной проверки Силы (сл. 9). */
  static async #onDrink() {
    const a = this.actor;
    const r = await rollPool({
      actor: a, title: t("Diablerie.Drink"), subtitle: t("Diablerie.Title"), pool: this.pool, difficulty: 9, kind: "check", messageMode: this.v.messageMode,
      breakdown: [{ label: game.i18n.localize(VTM20.attributes.strength.label), value: this.pool }],
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
