// module/ui/sounds.mjs
// Звуки системы — записи (assets/sounds/, паки Kenney, CC0: LICENSE-kenney.txt) в эхе каменного свода (свёртка WebAudio).
// Стук костей — стандартный Foundry (CONFIG.sounds.dice; свой пользователь отверг); итог броска — колокол (успех),
// колокол дважды (исключительный, 4+ успеха), глухой удар (провал), бьющееся стекло (ботч). Урон по виду: ударный — удар,
// летальный — разрез, губительный — рубящий; лечение — шорох ткани; кровь — мягкий удар и стук сердца (синтез);
// Воля — металлическая защёлка; ярость и Ротшрек — сердце; «твой ход» — низкий колокол; кнопки — тихий щелчок.
// Открытие окон — без звука (шорох пергамента пользователь отверг); атмосферы (город, дождь, музыка) нет и не будет.
// Громкость — «Интерфейс» Foundry × своя настройка клиента; выключаются отдельной галочкой.

import { SYSTEM_ID } from "../config.mjs";

let ac = null;
const context = () => game.audio?.interface?.context ?? (ac ??= new AudioContext());
const BASE = () => `systems/${SYSTEM_ID}/assets/sounds/`;
const pick = list => list[Math.floor(Math.random() * list.length)];
const range = (stem, n) => Array.from({ length: n }, (_, i) => `${stem}-${i + 1}`);

/** Итоговая громкость 0…1; 0 — молчим. */
function volume() {
  try {
    if (!game.settings.get(SYSTEM_ID, "uiSounds")) return 0;
    return Number(game.settings.get("core", "globalInterfaceVolume") ?? .5) * (Number(game.settings.get(SYSTEM_ID, "uiSoundVolume")) / 100);
  } catch { return 0; }
}

/** Эхо свода: короткий (1,1 с) тёмный хвост — частые щелчки не наслаиваются. Один на контекст; собирается в простое. */
const vaults = new WeakMap();
function vault(c) {
  if (vaults.has(c)) return vaults.get(c);
  const len = Math.ceil(c.sampleRate * 1.1), ir = c.createBuffer(2, len, c.sampleRate), fade = c.sampleRate * .012;
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len, e = 1 - k;
      lp += (Math.random() * 2 - 1 - lp) * (.5 - .42 * k);           // чем дальше, тем глуше
      d[i] = lp * e * e * e * (i < fade ? i / fade : 1);                // ≈ (1−k)^3, без pow на каждом отсчёте
    }
  }
  const conv = c.createConvolver();
  conv.buffer = ir;
  vaults.set(c, conv);
  return conv;
}

/** Тон для стука сердца: частота from → to, огибающая, фильтр. */
function tone(c, out, { from, to = from, dur, gain, at = 0, lp = 0 }) {
  const t0 = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
  o.frequency.setValueAtTime(from, t0);
  if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + .008);
  g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
  let node = o;
  if (lp) { const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp; node.connect(f); node = f; }
  node.connect(g); g.connect(out);
  o.start(t0); o.stop(t0 + dur + .05);
}
/** Удар сердца: два глухих толчка «тук-тук». */
function heart(c, out, gain, at = 0) {
  tone(c, out, { from: 62, to: 38, dur: .16, gain, at, lp: 160 });
  tone(c, out, { from: 54, to: 34, dur: .18, gain: gain * .75, at: at + .19, lp: 140 });
}

/** Записи: загрузка и разбор один раз на файл. */
const buffers = new Map();
function load(c, file) {
  if (!buffers.has(file)) buffers.set(file, fetch(`${BASE()}${file}.ogg`).then(r => r.arrayBuffer()).then(a => c.decodeAudioData(a)).catch(() => null));
  return buffers.get(file);
}
/** Сыграть одну из записей files: громкость gain, задержка at (с), скорость rate (ниже — глуше), лёгкий разброс высоты (exact — без него). */
function sample(c, out, files, { gain = 1, at = 0, rate = 1, exact = false } = {}) {
  load(c, pick(files)).then(buf => {
    if (!buf) return;
    const s = c.createBufferSource(), g = c.createGain();
    s.buffer = buf; s.playbackRate.value = exact ? rate : rate * (.96 + Math.random() * .08);
    g.gain.value = gain; s.connect(g); g.connect(out);
    s.start(c.currentTime + at);
  });
}

const F = {
  click: ["click"], blood: range("blood", 3), fail: range("fail", 3), bell: range("bell", 3), botch: range("botch", 3),
  bashing: range("bashing", 3), lethal: range("lethal", 2), aggravated: range("aggravated", 2), heal: range("heal", 3), will: range("will", 2)
};

/** Звуки: [что звучит, доля эха]. Щелчок едва слышен, удар и провал — заметны. */
const SOUNDS = {
  click: [(c, o) => sample(c, o, F.click, { gain: .32, exact: true }), .05],   // один и тот же щелчок, без разброса (хлопок пользователь отверг)
  turn: [(c, o) => { sample(c, o, F.bell, { gain: .5, rate: .8 }); sample(c, o, F.bell, { gain: .32, rate: 1.05, at: .28 }); }, .35],
  blood: [(c, o) => { sample(c, o, F.blood, { gain: .7, rate: .85 }); heart(c, o, .45, .14); }, .2],
  damage: [(c, o) => sample(c, o, F.bashing, { gain: .85 }), .22],                      // прежнее имя — ударный
  "damage-bashing": [(c, o) => sample(c, o, F.bashing, { gain: .85 }), .22],
  "damage-lethal": [(c, o) => sample(c, o, F.lethal, { gain: .85 }), .22],
  "damage-aggravated": [(c, o) => { sample(c, o, F.aggravated, { gain: .9 }); sample(c, o, F.bashing, { gain: .45, rate: .7, at: .04 }); }, .25],
  heal: [(c, o) => sample(c, o, F.heal, { gain: .55 }), .15],
  will: [(c, o) => sample(c, o, F.will, { gain: .6 }), .2],
  fury: [(c, o) => { heart(c, o, .6); heart(c, o, .6, .5); heart(c, o, .55, 1); }, .2],
  success: [(c, o) => sample(c, o, F.bell, { gain: .55 }), .3],
  exceptional: [(c, o) => { sample(c, o, F.bell, { gain: .55 }); sample(c, o, F.bell, { gain: .4, rate: 1.26, at: .32 }); }, .35],
  failure: [(c, o) => sample(c, o, F.fail, { gain: .8, rate: .85 }), .3],
  botch: [(c, o) => { sample(c, o, F.botch, { gain: .75 }); sample(c, o, F.fail, { gain: .6, rate: .65, at: .05 }); }, .3]
};

/** Собрать звук в контексте c на выход dest с громкостью v. */
function renderSound(c, dest, name, v = 1) {
  const [make, wet] = SOUNDS[name];
  const out = c.createGain(), dry = c.createGain(), send = c.createGain();
  out.gain.value = v; dry.gain.value = 1; send.gain.value = wet;
  out.connect(dry); dry.connect(dest);
  const rv = vault(c);
  out.connect(send); send.connect(rv);
  if (!rv._wired?.has?.(dest)) { rv.connect(dest); (rv._wired ??= new Set()).add(dest); }
  make(c, out);
  return out;
}

let lastAt = {};
/** Сыграть звук по имени (не чаще раза в 60 мс на имя — чтобы двойные события не дублировали). */
export function playSound(name) {
  const v = volume();
  if (!v || !SOUNDS[name] || performance.now() - (lastAt[name] ?? 0) < 60) return;
  lastAt[name] = performance.now();
  try {
    const c = context();
    if (c.state === "suspended") c.resume();
    const out = renderSound(c, c.destination, name, v);
    setTimeout(() => out.disconnect(), 5000);
  } catch { /* без звука — не беда */ }
}

/** Что считается кнопкой системы: действия окон и листов, HUD, кнопки карточек чата. */
const BUTTONS = ".vtm20 [data-action], .vtm20 button, #r-hud [data-act], .r-card-buttons button, .r-notice button";

export function registerSounds() {
  game.settings.register(SYSTEM_ID, "uiSounds", {
    name: "VTM20.Settings.UiSounds.Name", hint: "VTM20.Settings.UiSounds.Hint",
    scope: "client", config: true, type: Boolean, default: true
  });
  game.settings.register(SYSTEM_ID, "uiSoundVolume", {
    name: "VTM20.Settings.UiSoundVolume.Name", hint: "VTM20.Settings.UiSoundVolume.Hint",
    scope: "client", config: true, type: Number, default: 60, range: { min: 0, max: 100, step: 5 },
    onChange: () => playSound("click")
  });

  let ready = false;
  // при загрузке мира листы и окна меняются пачкой — звучать начинаем чуть позже; записи и эхо готовим в простое
  Hooks.once("ready", () => setTimeout(() => {
    ready = true;
    const idle = globalThis.requestIdleCallback ?? (f => setTimeout(f, 500));
    idle(() => { try { if (!volume()) return; const c = context(); vault(c); for (const list of Object.values(F)) for (const f of list) load(c, f); } catch { /* позже */ } });
  }, 3000));

  document.addEventListener("click", ev => { if (ready && ev.target.closest?.(BUTTONS)) playSound("click"); }, true);

  // кровь, урон по виду, лечение, Воля — у того, кто их вызвал (preUpdate идёт только на его клиенте)
  Hooks.on("preUpdateActor", (actor, changes) => {
    if (!ready) return;
    const blood = foundry.utils.getProperty(changes, "system.blood.value");
    if (typeof blood === "number" && blood < (actor.system.blood?.value ?? 0)) playSound("blood");
    const will = foundry.utils.getProperty(changes, "system.willpower.value");
    if (typeof will === "number" && will < (actor.system.willpower?.value ?? 0)) playSound("will");
    const h = foundry.utils.getProperty(changes, "system.health"), cur = actor.system.health;
    if (h && cur) {
      const next = { bashing: h.bashing ?? cur.bashing ?? 0, lethal: h.lethal ?? cur.lethal ?? 0, aggravated: h.aggravated ?? cur.aggravated ?? 0 };
      const sum = x => (x?.bashing ?? 0) + (x?.lethal ?? 0) + (x?.aggravated ?? 0);
      if (next.aggravated > (cur.aggravated ?? 0)) playSound("damage-aggravated");
      else if (next.lethal > (cur.lethal ?? 0)) playSound("damage-lethal");
      else if (next.bashing > (cur.bashing ?? 0)) playSound("damage-bashing");
      else if (sum(next) < sum(cur)) playSound("heal");
    }
  });

  // ярость и Красный Ужас — стук сердца у того, кто включил состояние
  Hooks.on("createActiveEffect", (effect, options, userId) => {
    if (!ready || userId !== game.user.id) return;
    if (effect.statuses?.has?.("r-frenzy") || effect.statuses?.has?.("r-rotschreck")) playSound("fury");
  });

  // итог броска системы — после стука костей, у всех, кому виден результат
  Hooks.on("createChatMessage", async message => {
    const st = message.flags?.[SYSTEM_ID]?.roll;
    if (!ready || !st || !message.isContentVisible) return;
    const { evaluate } = await import("../dice/roll.mjs");
    const r = evaluate(st.values ?? [], st);
    const name = r.outcome === "botch" ? "botch" : r.outcome !== "success" ? "failure" : r.successes >= 4 ? "exceptional" : "success";
    setTimeout(() => playSound(name), 650);
  });
}
