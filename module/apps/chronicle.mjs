// module/apps/chronicle.mjs
// Летопись сессии: «Конец сессии» собирает из чата, что было за вечер, — броски (удачи и провалы), срывы
// (ярость, Ротшрек, деградация), урон, траты крови, торпор и смерть, Муку падших (журнал Муки) — и пишет итог страницей в журнал
// «Летопись хроники» и строкой в журнал ночей (calendar.mjs). Начало сессии — метка прошлой летописи
// (настройка мира chronicleMark), иначе начало суток. Ведущий правит текст перед записью.

import { SYSTEM_ID, SYSTEM_PATH } from "../config.mjs";
import { getClock, shortDate, nightNumber, nightNote, setNightNote } from "./calendar.mjs";
import { evaluate } from "../dice/roll.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const JOURNAL = "chronicleJournal";

/** Шаблон строки перевода как регулярка: {n} — число, остальное — что угодно. */
const pattern = key => new RegExp(game.i18n.localize(`VTM20.${key}`).replace(/[.*+?^$()|[\]\\]/g, "\\$&")
  .replace(/\{n\}/g, "(\\d+)").replace(/\{[a-z]+\}/gi, "(.+?)"));
const plain = html => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export function registerChronicle() {
  game.settings.register(SYSTEM_ID, "chronicleMark", { scope: "world", config: false, type: Number, default: 0 });
  game.settings.register(SYSTEM_ID, JOURNAL, { scope: "world", config: false, type: String, default: "" });
}

export function openChronicle() {
  if (!game.user.isGM) return ui.notifications.warn(t("Notify.GMOnly"));
  const open = foundry.applications.instances.get("r-chronicle");
  return (open ?? new ChronicleWindow()).render({ force: true });
}

/** Сводка сообщений после since (мс реального времени). */
export function collectSession(since) {
  const who = m => ChatMessage.getSpeakerActor(m.speaker)?.name ?? m.speaker?.alias ?? "—";
  const reBlood = pattern("Notify.BloodSpent"), reDmg = pattern("Notify.Damaged");
  const S = { rolls: 0, botches: [], greats: [], breaks: [], damage: {}, blood: {}, fates: [], people: new Set(), count: 0 };
  for (const m of game.messages.contents) {
    if ((m.timestamp ?? 0) <= since) continue;
    S.count++;
    const name = who(m), st = m.flags?.[SYSTEM_ID]?.roll;
    if (ChatMessage.getSpeakerActor(m.speaker)?.hasPlayerOwner) S.people.add(name);
    if (st) {
      S.rolls++;
      const r = evaluate(st.values ?? [], st), title = st.title || t("Roll.Title");
      if (r.outcome === "botch") S.botches.push(t("Chronicle.Botch", { who: name, what: title }));
      else if (r.outcome === "success" && r.successes >= 5) S.greats.push(t("Chronicle.Great", { who: name, what: title, n: r.successes }));
      // срывы: провал проверки ярости, Ротшрека или деградации
      if (["frenzy", "rotschreck", "degeneration"].includes(st.kind) && r.outcome !== "success") S.breaks.push(t(`Chronicle.Break.${st.kind}`, { who: name }));
      continue;
    }
    const text = plain(m.content);
    let x;
    if ((x = text.match(reDmg))) S.damage[name] = (S.damage[name] ?? 0) + Number(x[1]);
    else if ((x = text.match(reBlood))) S.blood[name] = (S.blood[name] ?? 0) + Number(x[1]);
    else if (/fa-bed|fa-skull"/.test(m.content) && /r-notice/.test(m.content)) S.fates.push(text);
  }
  // Мука падших за сессию — из журнала Муки: было → стало, за что
  S.torment = [];
  for (const a of game.actors.filter(x => x.type === "demon")) {
    const rows = (a.system.tormentLog ?? []).filter(r => r.ts > since);
    if (!rows.length) continue;
    const first = rows[0], last = rows.at(-1);
    const from = first.before || "?", to = `${last.permAfter}/${last.tempAfter}`;
    const why = rows.map(r => `${r.reason} ${[r.perm ? `${r.perm > 0 ? "+" : ""}${r.perm} ${t("Demon.LogPerm")}` : "", r.temp ? `${r.temp > 0 ? "+" : ""}${r.temp}` : ""].filter(Boolean).join(", ")}`);
    S.torment.push({ who: a.name, from, to, why: why.join("; ") });
  }
  return S;
}

/** Готовый текст итога: ночь, участники, главное — его ведущий правит перед записью. */
function draft(S, now = getClock()) {
  const lines = [t("Chronicle.Head", { date: shortDate(new Date(now)), n: nightNumber(now) })];
  if (S.people.size) lines.push(t("Chronicle.People", { list: [...S.people].join(", ") }));
  lines.push(t("Chronicle.Rolls", { n: S.rolls, b: S.botches.length }));
  for (const l of [...S.greats, ...S.botches, ...S.breaks, ...S.fates]) lines.push(`— ${l}`);
  const dmg = Object.entries(S.damage).map(([k, v]) => `${k} ${v}`), bl = Object.entries(S.blood).map(([k, v]) => `${k} ${v}`);
  if (dmg.length) lines.push(t("Chronicle.Damage", { list: dmg.join(", ") }));
  if (bl.length) lines.push(t("Chronicle.Blood", { list: bl.join(", ") }));
  for (const x of S.torment ?? []) lines.push(t("Chronicle.Torment", { who: x.who, from: x.from, to: x.to, why: x.why }));
  return lines.join("\n");
}

class ChronicleWindow extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "r-chronicle",
    classes: ["vtm20", "r-dialog", "r-court-app", "r-chron-app"],
    window: { title: "VTM20.Chronicle.Title", icon: "fa-solid fa-book-open", resizable: true },
    position: { width: 900, height: 660 },
    actions: { range: ChronicleWindow.#onRange, write: ChronicleWindow.#onWrite, redraft: ChronicleWindow.#onRedraft }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/apps/chronicle.hbs` } };

  range = "mark";
  text = null;

  get since() {
    const now = Date.now(), mark = game.settings.get(SYSTEM_ID, "chronicleMark");
    if (this.range === "6h") return now - 6 * 3600000;
    const day = new Date(); day.setHours(0, 0, 0, 0);
    return this.range === "mark" && mark ? mark : day.getTime();
  }

  async _prepareContext() {
    const S = collectSession(this.since), mark = game.settings.get(SYSTEM_ID, "chronicleMark");
    this.text ??= draft(S);
    const fmt = ms => new Date(ms).toLocaleString(game.i18n.lang, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    return {
      ranges: [
        { key: "mark", label: mark ? t("Chronicle.SinceMark") : t("Chronicle.SinceToday"), note: mark ? fmt(mark) : "", active: this.range === "mark" },
        { key: "day", label: t("Chronicle.SinceToday"), active: this.range === "day" },
        { key: "6h", label: t("Chronicle.Since6h"), active: this.range === "6h" }
      ],
      count: S.count, rolls: S.rolls, people: [...S.people],
      greats: S.greats, botches: S.botches, breaks: S.breaks, fates: S.fates,
      damage: Object.entries(S.damage).map(([who, n]) => ({ who, n })), blood: Object.entries(S.blood).map(([who, n]) => ({ who, n })),
      torment: S.torment,
      text: this.text, night: nightNumber(getClock())
    };
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.element.addEventListener("input", ev => { if (ev.target.matches("textarea[name=chron-text]")) this.text = ev.target.value; });
  }

  static #onRange(event, target) { this.range = target.dataset.range; this.text = null; this.render(); }
  static #onRedraft() { this.text = null; this.render(); }

  /** Записать: страница журнала «Летопись хроники», строка в журнал ночей, метка конца сессии. */
  static async #onWrite() {
    const text = String(this.text ?? "").trim();
    if (!text) return;
    const now = getClock(), n = nightNumber(now);
    let j = game.journal.get(game.settings.get(SYSTEM_ID, JOURNAL));
    if (!j) {
      j = await JournalEntry.create({ name: t("Chronicle.Journal") });
      await game.settings.set(SYSTEM_ID, JOURNAL, j.id);
    }
    const html = text.split("\n").map(l => `<p>${esc(l)}</p>`).join("");
    await j.createEmbeddedDocuments("JournalEntryPage", [{ name: t("Chronicle.PageName", { date: shortDate(new Date(now)), n }), type: "text",
      text: { content: html }, sort: (j.pages.size + 1) * 100000 }]);
    if (this.element.querySelector("input[name=chron-night]")?.checked) {
      // в журнал ночей — первый яркий момент (удача, провал, срыв), иначе строка с бросками
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      const first = (lines.find(l => l.startsWith("— ")) ?? lines[2] ?? lines[1] ?? lines[0]).replace(/^— /, "");
      await setNightNote(n, [nightNote(now), first].filter(Boolean).join(" · "));
    }
    await game.settings.set(SYSTEM_ID, "chronicleMark", Date.now());
    ui.notifications.info(t("Chronicle.Written", { name: j.name }));
    this.range = "mark"; this.text = null;
    j.sheet.render(true);
    this.close();
  }
}
