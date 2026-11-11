// module/ui/city-icons.mjs
// Карта города — значки мест для слоя MapLibre: гербы, печати видов мест, значки расширений.
// Вынесено из citymap.mjs; состояние карты — city-state.mjs.

import { SYSTEM_PATH } from "../config.mjs";
import { CITY_CATEGORIES, catOf, CITY_KINDS, SEAL_SVG, WAX } from "./city-kinds.mjs";
import { revolution } from "./city-style.mjs";
import { sealURL, extSeal, drawSeal } from "./city-seals.mjs";

export const iconOk = {};

/** Эмблема (SVG одним путём) цветом кости — картинка для холста. */
export async function emblem(key) {
  const txt = await fetch(`${SYSTEM_PATH}/assets/icons/city/${key}.svg`).then(r => r.ok ? r.text() : "").catch(() => "");
  if (!txt) return null;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(txt.replace(/<path /g, '<path fill="#f3e7cd" '))}`;
  try { await img.decode(); } catch (e) { return null; }
  return img;
}

/** Значки мест: в эпоху Революции — эмблемы на сургуче, иначе — глиф Font Awesome в тёмном круге цвета категории. */
export async function buildIcons() {
  // пиксели каждого значка читаются обратно (карте нужны сырые данные): холст в памяти, а не на видеокарте, — чтение без задержки
  const READ = { willReadFrequently: true };
  const probe = document.createElement("i");
  probe.style.cssText = "position:absolute;left:-9999px;top:-9999px";
  document.body.appendChild(probe);
  const out = {};
  const all = [
    ...Object.entries(CITY_CATEGORIES).map(([k, c]) => [k, k, c.icon, c.color, null, k]),
    ...Object.entries(CITY_KINDS).map(([k, [icon, cat]]) => [`k-${k}`, k, icon, catOf(cat).color, catOf(cat).icon, cat])
  ];
  const sealed = revolution();
  for (let [k, svg, icon, color, fallback, cat] of all) {
    // штабы фракций — печати мастера (assets/factions/seal-*.webp, tools/build_faction_seals.py)
    const fac = sealed && /^f-/.test(svg) ? await extSeal(svg.slice(2)) : null;
    if (fac) {
      const S = 76, cv = document.createElement("canvas");
      cv.width = cv.height = S;
      const ctx = cv.getContext("2d", READ);
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,.6)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;
      ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 5, 0, Math.PI * 2); ctx.fillStyle = "#000"; ctx.fill(); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 5, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(fac, 5, 5, S - 10, S - 10); ctx.restore();
      out[k] = { width: S, height: S, data: new Uint8Array(ctx.getImageData(0, 0, S, S).data.buffer) };
      sealURL[k] = cv.toDataURL();
      continue;
    }
    if (sealed && SEAL_SVG.has(svg)) {
      const S = 76;
      const cv = document.createElement("canvas");
      cv.width = cv.height = S;
      const ctx = cv.getContext("2d", READ);
      drawSeal(ctx, S, k, WAX[cat] ?? WAX.other, await emblem(svg));
      out[k] = { width: S, height: S, data: new Uint8Array(ctx.getImageData(0, 0, S, S).data.buffer) };
      sealURL[k] = cv.toDataURL();
      continue;
    }
    const S = 52;
    probe.className = `fa-solid ${icon}`;
    // Font Awesome 7 пишет content как `"<глиф>" / ""` (с альтернативным текстом) — берём первую строку.
    const raw = getComputedStyle(probe, "::before").content;
    let glyph = raw.match(/^(["'])(.*?)\1/)?.[2] ?? raw;
    // Значка нет в этой сборке Font Awesome — берём значок категории.
    if ((!glyph || raw === "none") && fallback) {
      iconOk[k] = false;
      probe.className = `fa-solid ${fallback}`;
      const r2 = getComputedStyle(probe, "::before").content;
      glyph = r2.match(/^(["'])(.*?)\1/)?.[2] ?? r2;
    }
    const cs = getComputedStyle(probe);
    const font = `${cs.fontWeight} 22px ${cs.fontFamily}`;
    try { await document.fonts.load(font, glyph); } catch (e) {}
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const ctx = cv.getContext("2d", READ);
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(12,10,12,.92)"; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.stroke();
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(glyph, S / 2, S / 2 + 1);
    out[k] = { width: S, height: S, data: new Uint8Array(ctx.getImageData(0, 0, S, S).data.buffer) };
  }
  probe.remove();
  return out;
}
