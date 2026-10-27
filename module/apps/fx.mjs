// module/apps/fx.mjs
// Анимации и звуки сил (data/fx-map.mjs): успешный бросок силы, ритуала, Знания падшего или Грани, включённая сила без броска,
// срыв (Безумие, Ротшрек), молитва, апокалиптическая форма. Файлы лежат в данных Foundry (настройка fxRoot, по умолчанию
// assets/vtm20-fx) — их кладёт туда tools/fx_extract.mjs из купленных паков; manifest.json там же говорит, какие темы есть.
// Анимация — через модуль Sequencer (если включён); без него — только звук. Каждый клиент играет сам (по своим настройкам «анимации»
// и «звуки»), если мастер не выключил эффекты в мире; цель — та, что выбрана у автора броска. Скрытый бросок видят только его зрители.

import { SYSTEM_ID } from "../config.mjs";
import { Codex } from "../data/codex.mjs";
import { powerOfKey } from "../data/effects.mjs";
import { evaluate } from "../dice/roll.mjs";
import { FX_THEMES, FX_DISC, FX_PATHS, FX_RITUALS, FX_LORES, FX_EDGES, FX_KINDS, FX_EVENTS } from "../data/fx-map.mjs";

const get = k => { try { return game.settings.get(SYSTEM_ID, k); } catch { return null; } };
const root = () => String(get("fxRoot") || "assets/vtm20-fx").replace(/\/+$/, "");
let manifest = null;

/** Какие темы лежат на диске: { тема: { anim, sound } }; без manifest.json — ничего. */
async function themesOnDisk() {
  if (manifest) return manifest;
  try {
    const r = await fetch(`${root()}/manifest.json`, { cache: "no-cache" });
    manifest = r.ok ? (await r.json()).themes ?? {} : {};
  } catch { manifest = {}; }
  return manifest;
}

/** Тема силы: Знание падшего, путь магии крови (по названию), Дисциплина по уровню. */
export function powerTheme(disc, level, path = "") {
  disc = String(disc ?? "");
  if (disc.startsWith("lore:")) return FX_LORES[disc.slice(5)] ?? "evocation";
  if (path) { const hit = FX_PATHS.find(([re]) => re.test(path)); if (hit) return hit[1]; }
  const d = FX_DISC[disc];
  if (!d) return null;
  return Array.isArray(d) ? d[Math.min(d.length, Math.max(1, Number(level) || 1)) - 1] : d;
}

/** Тема Грани охотника по ключу «путь|уровень». */
export function edgeTheme(key) {
  const [path, lv] = String(key ?? "").split("|");
  return FX_EDGES[path]?.[Math.max(1, Number(lv) || 1) - 1] ?? null;
}

/** Тема по состоянию броска и когда её играть. */
function rollTheme(st) {
  const x = st?.extra ?? {};
  if (x.power) return { theme: powerTheme(x.power.disc, x.power.level, x.power.path), on: "success" };
  if (x.magic?.ritual) return { theme: FX_RITUALS[x.magic.disc] ?? "runes", on: "success" };
  if (x.edge) return { theme: edgeTheme(x.edge), on: "success" };
  return FX_KINDS[st?.kind] ?? null;
}

/** Проиграть тему на этом клиенте: на персонаже (и цели автора). Без токена на сцене — только звук. */
export async function playFx(theme, actor, { user = game.user, target = null } = {}) {
  const def = FX_THEMES[theme];
  if (!def || !get("fxWorld")) return;
  const wantAnim = !!get("fxAnim"), wantSound = !!get("fxSound");
  if (!wantAnim && !wantSound) return;
  const on = (await themesOnDisk())[theme] ?? {};
  const has = { anim: on.anim && wantAnim, sound: on.sound && wantSound };
  if (!has.anim && !has.sound) return;
  const anim = `${root()}/anim/${theme}.webm`, sound = `${root()}/sound/${theme}.ogg`, volume = Number(get("fxVolume") ?? 0.6);
  const from = actor?.getActiveTokens?.()[0] ?? null;
  const to = target ?? [...(user?.targets ?? [])][0] ?? null;
  const Seq = game.modules.get("sequencer")?.active ? globalThis.Sequence : null;
  const ray = def.at === "ray";
  if (Seq && has.anim && from && (!ray || (to && to !== from))) {
    const seq = new Seq();
    const e = seq.effect().file(anim).locally();
    if (ray) e.atLocation(from).stretchTo(to);
    else {
      e.atLocation(def.at === "target" && to ? to : from).scaleToObject(def.scale ?? 1.5);
      if (def.at === "ground") e.belowTokens();
    }
    if (has.sound) seq.sound().file(sound).volume(volume).locally();
    return seq.play();
  }
  if (has.sound) return foundry.audio.AudioHelper.play({ src: sound, volume, autoplay: true, loop: false }, false);
}

/** Событие без броска (апокалиптическая форма) — на этом клиенте. */
export const playEvent = (key, actor, opts) => FX_EVENTS[key] ? playFx(FX_EVENTS[key], actor, opts) : null;

/** Пометка для карточки в чат: эффект сыграют все, кто её увидит. */
export const fxFlags = (theme, actor) => theme ? { fx: theme, fxActor: actor?.uuid ?? null } : {};
export const eventTheme = key => FX_EVENTS[key] ?? null;

export function registerFx() {
  game.settings.register(SYSTEM_ID, "fxWorld", {
    name: "VTM20.Settings.FxWorld.Name", hint: "VTM20.Settings.FxWorld.Hint", scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(SYSTEM_ID, "fxAnim", {
    name: "VTM20.Settings.FxAnim.Name", hint: "VTM20.Settings.FxAnim.Hint", scope: "client", config: true, type: Boolean, default: true
  });
  game.settings.register(SYSTEM_ID, "fxSound", {
    name: "VTM20.Settings.FxSound.Name", hint: "VTM20.Settings.FxSound.Hint", scope: "client", config: true, type: Boolean, default: true
  });
  game.settings.register(SYSTEM_ID, "fxVolume", {
    name: "VTM20.Settings.FxVolume.Name", hint: "VTM20.Settings.FxVolume.Hint", scope: "client", config: true, type: Number, default: 0.6,
    range: { min: 0, max: 1, step: 0.05 }
  });
  game.settings.register(SYSTEM_ID, "fxRoot", {
    name: "VTM20.Settings.FxRoot.Name", hint: "VTM20.Settings.FxRoot.Hint", scope: "world", config: true, type: String, default: "assets/vtm20-fx",
    onChange: () => { manifest = null; }
  });

  // бросок силы, ритуала, Грани; молитва; срыв; карточка с темой (второе зрение, Грань без броска…) — у всех, кто видит сообщение
  Hooks.on("createChatMessage", async message => {
    const f = message.flags?.[SYSTEM_ID] ?? {}, user = message.author ?? game.user;
    if (f.fx) return playFx(f.fx, f.fxActor ? await fromUuid(f.fxActor) : null, { user });
    const st = f.roll, pick = st && rollTheme(st);
    if (!pick?.theme) return;
    const ext = st.extra?.extended;
    const ok = ext ? ext.done : evaluate(st.values ?? [], st).successes > 0;
    if (pick.on === "fail" ? ok : !ok) return;
    const actor = st.actorUuid ? await fromUuid(st.actorUuid) : null;
    return playFx(pick.theme, actor, { user });
  });
  // сила включена без броска (лист, панель сил)
  Hooks.on("createActiveEffect", (effect, options, userId) => {
    const power = effect.flags?.[SYSTEM_ID]?.power;
    if (!power || !(effect.parent instanceof Actor)) return;
    const { disc, level } = powerOfKey(Codex, power);
    const theme = powerTheme(disc, level);
    if (theme) playFx(theme, effect.parent, { user: game.users.get(userId) });
  });
  // падший принимает апокалиптическую форму
  Hooks.on("updateActor", (actor, changes) => {
    if (actor.type === "demon" && changes.system?.apocalyptic === true) playEvent("demonForm", actor);
  });
}
