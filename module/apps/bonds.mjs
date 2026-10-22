// module/apps/bonds.mjs
// Узы крови (V20_Основные_правила/05, «Узы крови»):
//   · кровь одного вампира в три разные ночи — 3-я ступень; в ту же ночь ступень не растёт;
//   · у вассала один сюзерен 3-й ступени: новые полные узы разрушают все более слабые;
//   · временно сопротивляться — проверка воли (сл. 8), нужно успехов больше, чем раз пил (максимум 9), и 1 пункт воли;
//   · без крови сюзерена узы слабеют на ступень за (12 − воля вассала) месяцев; на 0 — разорваны.
// В записи уз: rating — ступень, drinks — сколько раз пил, last — ночь последнего глотка (ГГГГ-ММ-ДД по часам хроники).

import { getClock, ymd } from "./calendar.mjs";
import { RollDialog } from "../dice/dialog.mjs";

const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const today = () => ymd(new Date(getClock()));
const notice = (actor, icon, html) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice"><i class="fa-solid ${icon}"></i> ${html}</div>` });

/** Глоток витэ сюзерена: ступень +1, если это новая ночь. */
export async function drinkVitae(actor, index) {
  const bonds = foundry.utils.deepClone(actor._source.system.bonds ?? []);
  const b = bonds[index];
  if (!b || b.role !== "regnant") return;
  const night = today(), sameNight = b.last === night;
  b.drinks = (b.drinks ?? 0) + 1;
  const full = bonds.find((x, i) => i !== index && x.role === "regnant" && x.rating >= 3);
  let msg;
  if (sameNight) msg = t("BondX.SameNight", { name: b.name || "?" });
  else if (b.rating >= 3) msg = t("BondX.Reinforced", { name: b.name || "?" });
  else if (b.rating === 2 && full) msg = t("BondX.AlreadyBound", { name: b.name || "?", other: full.name || "?" });
  else { b.rating += 1; msg = t(`BondX.Step${b.rating}`, { name: b.name || "?" }); }
  b.last = night;
  let list = bonds;
  // новые полные узы разрушают все более слабые
  if (b.rating >= 3 && !sameNight) {
    const broken = bonds.filter((x, i) => i !== index && x.role === "regnant" && x.rating < 3);
    if (broken.length) msg += " " + t("BondX.Shattered", { names: broken.map(x => x.name || "?").join(", ") });
    list = bonds.filter((x, i) => i === index || x.role !== "regnant" || x.rating >= 3);
  }
  await actor.update({ "system.bonds": list });
  return notice(actor, "fa-droplet", msg);
}

/** Временно сбросить узы: воля, сл. 8, успехов больше, чем глотков (≤ 9), и 1 пункт воли. */
export function resistBond(actor, index) {
  const b = actor.system.bonds?.[index];
  if (!b || b.role !== "regnant") return;
  const need = Math.min(9, Math.max(1, (b.drinks ?? b.rating) + 1));
  return RollDialog.prompt(actor, {
    title: t("BondX.ResistTitle", { name: b.name || "?" }), subtitle: t("BondX.Step", { n: b.rating }),
    trait1: "willpower.permanent", difficulty: 8, willpowerCost: true, lockTraits: true, noWillpower: true,
    diffNote: t("BondX.ResistNeed", { n: need }), kind: "bond", extra: { bondNeed: need, bondName: b.name }
  });
}

const monthsBetween = (a, b) => {
  const [y1, m1, d1] = a.split("-").map(Number), [y2, m2, d2] = b.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
};

/** Ослабление уз без крови сюзерена; вызывается при наступлении ночи. Возвращает строки для сводки. */
export async function decayBonds(actor) {
  const src = actor._source.system.bonds ?? [];
  if (!src.length) return [];
  const now = today(), will = actor.system.willpower?.permanent ?? 5;
  const period = Math.max(1, 12 - will);
  const lines = [];
  let changed = false;
  const list = [];
  for (const b0 of src) {
    const b = { ...b0 };
    if (b.role === "regnant" && b.last) {
      const steps = Math.floor(monthsBetween(b.last, now) / period);
      if (steps > 0) {
        const from = b.rating;
        b.rating = Math.max(0, b.rating - steps);
        const [y, m, d] = b.last.split("-").map(Number);
        b.last = ymd(new Date(y, m - 1 + steps * period, d));
        changed = true;
        lines.push(b.rating > 0 ? t("BondX.Weakened", { actor: actor.name, name: b.name || "?", from, to: b.rating })
          : t("BondX.Broken", { actor: actor.name, name: b.name || "?" }));
        if (b.rating === 0) continue;
      }
    }
    list.push(b);
  }
  if (changed) await actor.update({ "system.bonds": list });
  return lines;
}
