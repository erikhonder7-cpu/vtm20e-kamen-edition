// module/ui/sounds.mjs
// Звуки интерфейса в духе Мира Тьмы — синтез WebAudio без файлов (как колокол рассвета в calendar.mjs):
// всё звучит в эхе каменного свода. Щелчок — мягкий глухой «тук»; окно — шорох старого пергамента;
// трата крови — густая капля и удар сердца; урон — удар по плоти и гул; успех — далёкий колокол в миноре;
// провал — низкий вздох струн вниз; провал с единицами — тритон и рык Зверя.
// Стук костей не синтезируется — его уже играет Foundry (CONFIG.sounds.dice).
// Только интерфейс: атмосферы (шум города, дождь, музыка) здесь нет и не будет — так решил пользователь.
// Громкость — «Интерфейс» Foundry × своя настройка клиента; выключаются отдельной галочкой.

import { SYSTEM_ID } from "../config.mjs";

let ac = null;
const context = () => game.audio?.interface?.context ?? (ac ??= new AudioContext());

/** Итоговая громкость 0…1; 0 — молчим. */
function volume() {
  try {
    if (!game.settings.get(SYSTEM_ID, "uiSounds")) return 0;
    return Number(game.settings.get("core", "globalInterfaceVolume") ?? .5) * (Number(game.settings.get(SYSTEM_ID, "uiSoundVolume")) / 100);
  } catch { return 0; }
}

/** Эхо свода: импульс — затухающий шум (2,6 с), тёмный — высокие гаснут быстрее. Один на контекст. */
const vaults = new WeakMap();
function vault(c) {
  if (vaults.has(c)) return vaults.get(c);
  // хвост короткий (1,1 с) и гаснет быстро — длинное эхо мешало при частых щелчках
  const len = Math.ceil(c.sampleRate * 1.1), ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len;
      lp += (Math.random() * 2 - 1 - lp) * (.5 - .42 * k);           // чем дальше, тем глуше
      d[i] = lp * Math.pow(1 - k, 3.2) * (i < c.sampleRate * .012 ? i / (c.sampleRate * .012) : 1);
    }
  }
  const conv = c.createConvolver();
  conv.buffer = ir;
  vaults.set(c, conv);
  return conv;
}

/** Тон: частота from → to, огибающая (атака attack, затухание до dur), по желанию — фильтр lp и дрожь trem. */
function tone(c, out, { type = "sine", from, to = from, dur, gain, at = 0, attack = .008, lp = 0, trem = 0 }) {
  const t0 = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, t0);
  if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
  let node = o;
  if (lp) { const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp; node.connect(f); node = f; }
  if (trem) {
    const m = c.createGain(), lfo = c.createOscillator(), depth = c.createGain();
    lfo.frequency.value = trem; depth.gain.value = .45; m.gain.value = .55;
    lfo.connect(depth); depth.connect(m.gain); lfo.start(t0); lfo.stop(t0 + dur + .05);
    node.connect(m); node = m;
  }
  node.connect(g); g.connect(out);
  o.start(t0); o.stop(t0 + dur + .05);
}

/** Шум через фильтр (шорох, удар): частота from → to; type — bandpass или lowpass; grain — потрескивание. */
function noise(c, out, { from, to = from, q = 1, dur, gain, at = 0, type = "bandpass", grain = 0 }) {
  const t0 = c.currentTime + at, len = Math.ceil(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (grain && Math.random() < grain ? 4 : 1);
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = buf;
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(from, t0);
  if (to !== from) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(.02, dur * .2));
  g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(out);
  src.start(t0); src.stop(t0 + dur + .05);
}

/** Колокол: негармонические призвуки над основой (малая терция — мрачнее). */
function bell(c, out, base, gain, at = 0, dur = 1.4) {
  for (const [k, a, d] of [[.5, .5, 1.25], [1, 1, 1], [1.19, .55, .85], [1.5, .35, .7], [2, .3, .55], [2.74, .16, .4], [3.76, .08, .3]])
    tone(c, out, { from: base * k, dur: dur * d, gain: gain * a, at, attack: .004 });
}

/** Удар сердца: два глухих толчка «тук-тук». */
function heart(c, out, gain, at = 0) {
  tone(c, out, { from: 62, to: 38, dur: .16, gain, at, lp: 160 });
  tone(c, out, { from: 54, to: 34, dur: .18, gain: gain * .75, at: at + .19, lp: 140 });
}

/** Звуки: [что звучит, доля эха]. Громкости подобраны так, чтобы щелчок был едва слышен, а удар и провал — заметны. */
export const SOUNDS = {
  // мягкий глухой «тук» — без шума: шумовой всплеск звучал резким хлопком
  click: [(c, o) => {
    tone(c, o, { from: 420, to: 250, dur: .08, gain: .13, attack: .006, lp: 900 });
    tone(c, o, { from: 150, to: 120, dur: .1, gain: .07, attack: .008, lp: 400 });
  }, .05],
  page: [(c, o) => {
    noise(c, o, { from: 500, to: 1700, q: .6, dur: .24, gain: .26, grain: .02 });
    noise(c, o, { from: 1400, to: 650, q: .8, dur: .16, gain: .16, at: .11, grain: .03 });
  }, .15],
  blood: [(c, o) => {
    tone(c, o, { from: 640, to: 150, dur: .14, gain: .22, lp: 1200 });
    tone(c, o, { from: 230, to: 320, dur: .07, gain: .07, at: .12, lp: 900 });
    heart(c, o, .5, .22);
  }, .2],
  damage: [(c, o) => {
    tone(c, o, { from: 88, to: 36, dur: .28, gain: .55, lp: 300 });
    noise(c, o, { from: 380, to: 120, q: .7, dur: .16, gain: .32, type: "lowpass" });
    tone(c, o, { type: "sawtooth", from: 46, to: 40, dur: .45, gain: .07, at: .04, lp: 180, trem: 9 });
  }, .25],
  success: [(c, o) => { bell(c, o, 196, .13); }, .3],
  failure: [(c, o) => {
    tone(c, o, { type: "sawtooth", from: 146.8, to: 130.8, dur: .6, gain: .18, attack: .06, lp: 650 });
    tone(c, o, { type: "sawtooth", from: 73.4, to: 65.4, dur: .65, gain: .13, attack: .08, lp: 400 });
  }, .3],
  botch: [(c, o) => {
    tone(c, o, { type: "sawtooth", from: 55, to: 49, dur: .85, gain: .24, attack: .04, lp: 320, trem: 7 });
    tone(c, o, { type: "sawtooth", from: 77.8, to: 69.3, dur: .8, gain: .18, attack: .05, lp: 380, trem: 5.5 });   // тритон
    noise(c, o, { from: 140, to: 70, q: .5, dur: .55, gain: .32, type: "lowpass" });
    bell(c, o, 98, .09, .1, 1.1);
  }, .3]
};

/** Собрать звук в контексте c на выход dest с громкостью v (для игры и для записи образцов). */
export function renderSound(c, dest, name, v = 1) {
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
    setTimeout(() => out.disconnect(), 4000);
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
  // окна открываются пачкой при загрузке мира — шуршать начинаем чуть позже
  Hooks.once("ready", () => setTimeout(() => { ready = true; }, 3000));

  document.addEventListener("click", ev => { if (ready && ev.target.closest?.(BUTTONS)) playSound("click"); }, true);

  Hooks.on("renderApplicationV2", (app, el, context, options) => {
    if (ready && options?.isFirstRender && el?.classList?.contains("vtm20")) playSound("page");
  });

  // трата крови и урон — у того, кто их вызвал (preUpdate идёт только на его клиенте)
  Hooks.on("preUpdateActor", (actor, changes) => {
    if (!ready) return;
    const blood = foundry.utils.getProperty(changes, "system.blood.value");
    if (typeof blood === "number" && blood < (actor.system.blood?.value ?? 0)) playSound("blood");
    const h = foundry.utils.getProperty(changes, "system.health"), cur = actor.system.health;
    if (h && cur) {
      const sum = x => (x?.bashing ?? 0) + (x?.lethal ?? 0) + (x?.aggravated ?? 0);
      const next = { bashing: h.bashing ?? cur.bashing, lethal: h.lethal ?? cur.lethal, aggravated: h.aggravated ?? cur.aggravated };
      if (sum(next) > sum(cur) || next.aggravated > (cur.aggravated ?? 0)) playSound("damage");
    }
  });

  // итог броска системы — после стука костей Foundry, у всех, кому виден результат
  Hooks.on("createChatMessage", async message => {
    const st = message.flags?.[SYSTEM_ID]?.roll;
    if (!ready || !st || !message.isContentVisible) return;
    const { evaluate } = await import("../dice/roll.mjs");
    const r = evaluate(st.values ?? [], st);
    setTimeout(() => playSound(r.outcome === "botch" ? "botch" : r.outcome === "success" ? "success" : "failure"), 650);
  });
}
