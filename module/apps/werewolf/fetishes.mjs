// module/apps/werewolf/fetishes.mjs
// Оборотень — фетиши и талены (W20, гл. 4): настройка, примирение с духом, применение, изготовление.

import { RollDialog } from "../../dice/dialog.mjs";
import { t, esc, W, riteOf, wwGlyph, wwHead, wwPick, spend } from "../werewolf.mjs";

export const fetishOf = key => (W().fetishes ?? []).find(f => f.key === key) ?? null;

/** Список фетишей и тален персонажа для вкладки Даров. */
export function fetishView(actor) {
  return (actor.system.werewolf.fetishes ?? []).map((x, i) => ({ ...x, i, data: fetishOf(x.key) })).filter(x => x.data)
    .map(x => ({ i: x.i, key: x.key, attuned: x.attuned, rejected: !!x.rejected, n: x.n, talen: x.data.kind === "talen", name: x.data.name, en: x.data.en, level: x.data.level,
      gnosis: x.data.gnosis, text: x.data.text }));
}

export async function addFetish(actor, key) {
  const f = fetishOf(key);
  if (!f) return;
  const list = foundry.utils.deepClone(actor.system.werewolf.fetishes ?? []), have = list.find(x => x.key === key);
  if (have && f.kind === "talen") have.n += 1;
  else if (!have) list.push({ key, attuned: false, n: 1 });
  return actor.update({ "system.werewolf.fetishes": list });
}

export async function removeFetish(actor, i) {
  const list = foundry.utils.deepClone(actor.system.werewolf.fetishes ?? []);
  list.splice(i, 1);
  return actor.update({ "system.werewolf.fetishes": list });
}

/**
 * Настройка фетиша (W20, гл. 4): Гнозис против Гнозиса фетиша, нужен 1 успех; провал с единицами — фетиш отверг владельца:
 * новая попытка только после примирения с духом (отметку снимает рассказчик).
 */
export function attuneFetish(actor, i) {
  const x = actor.system.werewolf.fetishes[i], f = fetishOf(x?.key);
  if (!f) return;
  if (x.rejected) return ui.notifications.warn(t("FetishRejectedNote", { name: f.name }));
  return RollDialog.prompt(actor, { title: t("Attune", { name: f.name }), trait1: "werewolf.gnosis", difficulty: f.gnosis, diffNote: t("AttuneNote"),
    onRolled: async r => {
      const ok = (r?.successes ?? 0) > 0, botch = r?.outcome === "botch";
      if (!ok && !botch) return;
      const list = foundry.utils.deepClone(actor.system.werewolf.fetishes);
      if (ok) list[i].attuned = true; else list[i].rejected = true;
      await actor.update({ "system.werewolf.fetishes": list });
      if (botch) await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), flags: { [game.system.id]: { garou: "fetish" } },
        content: `<div class="r-notice r-type-werewolf is-warn"><i class="fa-solid fa-link-slash"></i> ${t("FetishRejected", { name: esc(actor.name), fetish: esc(f.name) })}</div>` });
    } });
}

/** Примирение с духом фетиша (рассказчик): снять отметку «отверг» — можно снова настраивать. */
export async function reconcileFetish(actor, i) {
  const list = foundry.utils.deepClone(actor.system.werewolf.fetishes ?? []);
  if (!list[i]) return;
  list[i].rejected = false;
  return actor.update({ "system.werewolf.fetishes": list });
}

/** Пробудить фетиш или использовать талену: бросок Гнозиса против Гнозиса предмета или трата 1 Гнозиса (талена — и тратится). */
export async function useFetish(actor, i) {
  const x = actor.system.werewolf.fetishes[i], f = fetishOf(x?.key);
  if (!f) return;
  if (f.kind === "fetish" && !x.attuned) return ui.notifications.warn(t("NotAttuned"));
  const talen = f.kind === "talen";
  const how = await wwPick({ title: f.name, icon: "fa-gem", width: 560,
    head: wwHead({ glyph: "glyph-fetish", kicker: t(talen ? "TalenKicker" : "FetishKicker", { n: f.level ?? "—" }), title: esc(f.name), sub: t("FetishGnosis", { g: f.gnosis }) }),
    after: `<div class="r-wc-text">${f.text}</div>`,
    cards: [
      { key: "roll", icon: "fa-dice-d10", title: t("UseRoll"), sub: `${t("Gnosis")} <b>${actor.system.werewolf.gnosis.value}</b> · ${t("Diff", { n: f.gnosis })}`, note: talen ? t("TalenGone") : "" },
      { key: "spend", glyph: "glyph-gnosis", title: t("UseSpend"), sub: t("UseSpendSub", { n: actor.system.werewolf.gnosis.value }), disabled: actor.system.werewolf.gnosis.value < 1 }
    ] });
  if (!how) return;
  const spendTalen = async () => {
    if (f.kind !== "talen") return;
    const list = foundry.utils.deepClone(actor.system.werewolf.fetishes);
    list[i].n -= 1;
    if (list[i].n <= 0) list.splice(i, 1);
    await actor.update({ "system.werewolf.fetishes": list });
  };
  const say = html => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-werewolf"><i class="fa-solid fa-gem"></i> ${html}</div>` });
  if (how === "spend") {
    if (!(await spend(actor, "gnosis", 1))) return;
    await spendTalen();
    return say(t("Awakened", { name: esc(f.name) }));
  }
  return RollDialog.prompt(actor, { title: f.name, trait1: "werewolf.gnosis", difficulty: f.gnosis,
    onRolled: async r => { if ((r?.successes ?? 0) > 0) { await spendTalen(); await say(t("Awakened", { name: esc(f.name) })); } } });
}

/**
 * Создать фетиш или талену обрядом (W20, гл. 7). Фетиш — «Ритуал фетиша»: Смекалка + Ритуалы, сл. 10, каждый потраченный
 * постоянный Гнозис — сложность −2 (предмет очищен три ночи, дух уговорен или побеждён — решает рассказчик).
 * Талена — «Ритуал связывания»: Воля против Гнозиса духа (= Гнозис талены), каждый потраченный Гнозис — Гнозис духа −1.
 * Успех — предмет на листе (фетиш — уже настроен на создателя).
 */
export async function craftFetish(actor, key) {
  const f = fetishOf(key);
  if (!f) return ui.notifications.warn(t("CraftPick"));
  const talen = f.kind === "talen", rite = talen ? "rite-of-binding" : "rite-of-the-fetish", w = actor.system.werewolf;
  const knows = (w.rites ?? []).includes(rite), gn = w.gnosis;
  const max = talen ? gn.value : gn.permanent;
  const diffOf = k => talen ? Math.max(2, f.gnosis - k) : Math.max(3, 10 - 2 * k);
  const n = await foundry.applications.api.DialogV2.prompt({
    window: { title: t("CraftTitle", { name: f.name }), icon: "fa-solid fa-gem" }, classes: ["vtm20", "r-dialog", "r-type-werewolf", "r-wc-dlg", "has-foot"], rejectClose: false,
    position: { width: 540 },
    content: `<div class="r-wc">${wwHead({ glyph: talen ? "glyph-spirit" : "glyph-fetish", kicker: riteOf(rite)?.name ?? rite, title: esc(f.name), sub: t("FetishGnosis", { g: f.gnosis }) })}
      <p class="r-wc-lead">${t(talen ? "CraftTalenHow" : "CraftFetishHow", { g: f.gnosis })}</p>
      ${knows ? "" : `<p class="r-wc-warn"><i class="fa-solid fa-triangle-exclamation"></i> ${t("CraftNoRite", { rite: riteOf(rite)?.name ?? rite })}</p>`}
      <div class="r-wc-stepper"><span>${wwGlyph("glyph-gnosis")} ${t(talen ? "CraftSpendTemp" : "CraftSpendPerm")}</span>
        <a data-d="-1">−</a><input type="number" name="n" value="0" min="0" max="${max}"><a data-d="1">+</a>
        <em>${t("CraftDiff")} <b data-diff>${diffOf(0)}</b></em></div></div>`,
    render: (ev, dlg) => {
      const root = dlg.element, inp = root.querySelector("input[name=n]"), out = root.querySelector("[data-diff]");
      const upd = () => { inp.value = Math.clamp(Number(inp.value) || 0, 0, max); out.textContent = diffOf(Number(inp.value)); };
      root.querySelectorAll(".r-wc-stepper [data-d]").forEach(a => a.addEventListener("click", () => { inp.value = (Number(inp.value) || 0) + Number(a.dataset.d); upd(); }));
      inp.addEventListener("input", upd);
    },
    ok: { label: t("CraftGo"), icon: "fa-solid fa-hand-sparkles", callback: (ev, btn) => Math.clamp(Number(btn.form.elements.n.value) || 0, 0, max) }
  });
  if (n == null) return;
  if (n > 0) await actor.update(talen ? { "system.werewolf.gnosis.value": gn.value - n }
    : { "system.werewolf.gnosis.permanent": gn.permanent - n, "system.werewolf.gnosis.value": Math.min(gn.value, gn.permanent - n) });
  const done = async r => {
    if (!((r?.successes ?? 0) > 0)) return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-werewolf"><i class="fa-solid fa-ghost"></i> ${t("CraftFail", { name: esc(f.name) })}</div>` });
    const list = foundry.utils.deepClone(actor.system.werewolf.fetishes ?? []), have = list.find(x => x.key === key);
    if (have && talen) have.n += 1; else if (!have) list.push({ key, attuned: !talen, n: 1 }); else have.attuned = true;
    await actor.update({ "system.werewolf.fetishes": list });
    return ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="r-notice r-type-werewolf"><i class="fa-solid fa-gem"></i> ${t("CraftDone", { name: esc(actor.name), item: esc(f.name) })}</div>` });
  };
  return talen
    ? RollDialog.prompt(actor, { title: t("CraftTitle", { name: f.name }), trait1: "willpower", difficulty: Math.max(2, f.gnosis - n), diffNote: t("CraftTalenNote"), onRolled: done })
    : RollDialog.prompt(actor, { title: t("CraftTitle", { name: f.name }), trait1: "attributes.wits", trait2: "abilities.rituals", difficulty: Math.max(3, 10 - 2 * n),
        diffNote: t("CraftFetishNote"), onRolled: done });
}

/**
 * Клайвы (W20, гл. 4; Book of the Wyrm): фетиш-клинок сразу и оружием на листе — серебро, урон Сила + N губительный.
 * Клэйв: сл. 6, Сила + 2, −1 эффективного Гнозиса; Великий клэйв: сл. 7, Сила + 3, −2; Баньклейв: сл. 7, Сила + 3
 * (о Гнозисе в книге ни слова — без потери). Пока клинок при себе (оружие «в руках»), бросок Гнозиса меньше на потерю.
 */
export const KLAIVES = { klaive: { damage: 2, difficulty: 6, loss: 1 }, "grand-klaive": { damage: 3, difficulty: 7, loss: 2 }, baneklaive: { damage: 3, difficulty: 7, loss: 0 } };

/** Оружие-клайвы под фетиши листа: недостающие создать, лишние (фетиш убран) — удалить. */
export async function syncKlaives(actor) {
  if (!actor?.isOwner || !actor.system.werewolf) return;
  const want = new Set((actor.system.werewolf.fetishes ?? []).map(x => x.key).filter(k => KLAIVES[k]));
  const have = actor.items.filter(i => i.type === "weapon" && i.getFlag(game.system.id, "klaive"));
  const del = have.filter(i => !want.has(i.getFlag(game.system.id, "klaive"))).map(i => i.id);
  const own = new Set(have.map(i => i.getFlag(game.system.id, "klaive")));
  const add = [...want].filter(k => !own.has(k)).map(k => {
    const f = fetishOf(k), K = KLAIVES[k];
    return { name: f.name, type: "weapon", flags: { [game.system.id]: { klaive: k, gnosisLoss: K.loss } },
      system: { kind: "melee", damage: K.damage, strength: true, damageType: "aggravated", difficulty: K.difficulty, silver: true, equipped: true,
        description: `${f.text ?? ""}${K.loss ? `<p><em>${t("KlaiveLoss", { n: K.loss })}</em></p>` : ""}` } };
  });
  if (del.length) await actor.deleteEmbeddedDocuments("Item", del);
  if (add.length) await actor.createEmbeddedDocuments("Item", add);
}

/** Список фетишей меняется (добавление, изготовление, удаление) — клинки на листе следом; пишет тот, кто менял. */
export function registerKlaives() {
  Hooks.on("updateActor", (actor, diff, opts, userId) => {
    if (userId !== game.user.id || !foundry.utils.hasProperty(diff, "system.werewolf.fetishes")) return;
    syncKlaives(actor);
  });
}
