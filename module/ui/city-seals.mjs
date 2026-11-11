// module/ui/city-seals.mjs
// Карта города — сургучные печати меток: рисунок печати на холсте по зерну имени, печати расширений. Вынесено из citymap.mjs.

import { EXT } from "./city-ext.mjs";

export const sealURL = {};   // ключ значка → data URL печати (для булавок-меток в DOM)

/** Детерминированный «шум» по строке — края сургуча у каждой печати свои, но стабильные. */
export function hashRand(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}

/** Картинка печати от модулей (печати фракций и т. п.). */
export async function extSeal(key) {
  for (const f of EXT.seals) { const img = await f(key); if (img) return img; }
  return null;
}

/** Сургучная печать: неровный край, блик, вдавленное кольцо и выпуклая эмблема. */
export function drawSeal(ctx, S, key, wax, img) {
  const rnd = hashRand(key), c = S / 2, R = S / 2 - 5;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const t = i / 40 * Math.PI * 2, r = R * (1 + (rnd() - .5) * .09);
    ctx[i ? "lineTo" : "moveTo"](c + Math.cos(t) * r, c + Math.sin(t) * r);
  }
  const g = ctx.createRadialGradient(c - R * .35, c - R * .4, R * .1, c, c, R * 1.05);
  g.addColorStop(0, wax[0]); g.addColorStop(1, wax[1]);
  ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  // вдавленное кольцо печати
  ctx.beginPath(); ctx.arc(c, c, R * .78, 0, Math.PI * 2);
  ctx.lineWidth = 1.6; ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.stroke();
  ctx.beginPath(); ctx.arc(c, c + .8, R * .78, 0, Math.PI * 2);
  ctx.lineWidth = .8; ctx.strokeStyle = "rgba(255,225,190,.18)"; ctx.stroke();
  if (img) {
    const w = R * 1.12;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 1.5; ctx.shadowOffsetY = 1.2;
    ctx.drawImage(img, c - w / 2, c - w / 2, w, w);
    ctx.restore();
  }
}
