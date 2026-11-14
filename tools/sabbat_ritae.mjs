// tools/sabbat_ritae.mjs — ритусы Шабаша для листа (data/sabbat-ritae.json) из статей правил data/rules.json:
//  · «7. Обряды Шабаша (Ритэ)» (V20, гл. 7): священные — таблицей «Обряд | Суть | Механика», мирские — списком;
//  · «10. Ритусы фракций» (V20 Rites of the Blood, гл. 2): таблица «Фракция | Ритус | Эффект» (пустая фракция — та же, что выше).
// Братание (Vaulderie) — отдельной строкой: у него своё окно обряда (apps/vaulderie.mjs).
// Запуск: node tools/sabbat_ritae.mjs  (после правки статей правил)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rules = JSON.parse(fs.readFileSync(path.join(ROOT, "data/rules.json"), "utf8"));
const page = (key, name) => {
  const p = rules.find(g => g.key === key)?.pages.find(x => x.name === name);
  if (!p) throw new Error(`нет статьи «${name}» в разделе ${key}`);
  return p.html;
};
const cells = tr => [...tr.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(m => m[1].trim());
const rows = html => [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m => cells(m[1])).filter(c => c.length);
const text = h => h.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
/** «Боевой поход (War Party)» → имя и английское. */
const split = s => { const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(text(s)); return m ? { name: m[1], en: m[2] } : { name: text(s), en: "" }; };

// V20: священные и мирские
const core = page("07", "Обряды Шабаша (Ритэ)");
const [sacredHtml, profaneHtml] = core.split(/<h4>Мирские[^<]*<\/h4>/);
const sacred = rows(sacredHtml).map(([n, gist, mech]) => ({ ...split(n), gist: text(gist), html: `<p><b>Механика:</b> ${mech}</p>` }));   // суть — строкой под именем
const profane = [...(profaneHtml ?? "").matchAll(/<li><strong>([^<]+)<\/strong>\s*—\s*([\s\S]*?)<\/li>/g)]
  .map(m => ({ name: m[1].trim(), en: "", gist: text(m[2]).split(/[;.]/)[0], html: `<p>${m[2].trim()}</p>` }));
// требование к проводящему — первым абзацем статьи (без ссылки на файл справочника про Братание)
const requirement = text(core.split("<h4>")[0]).replace(/\s*Братание \(Vaulderie\).*$/, "");

// Rites of the Blood: ритусы фракций
let faction = "";
const factions = rows(page("10", "Ритусы фракций (Faction Ritae)")).map(([f, n, fx]) => {
  if (text(f)) faction = text(f);
  return { ...split(n), faction, gist: text(fx).split(/[.;]/)[0], html: `<p>${fx}</p>` };
});

// ключи для действий листа: Огненная пляска — броски, Братание — окно обряда
const tag = x => /Огненн/.test(x.name) ? { ...x, act: "fire" } : x;
const vaulderie = { name: "Братание", en: "Vaulderie", act: "vaulderie", gist: "общая чаша: Винкулум каждого к каждому",
  html: "<p>Участники смешивают кровь в чаше и пьют: Винкулум каждого к каждому растёт или падает (V20, гл. 5). Обряд ведёт рассказчик — кнопкой «Братание».</p>" };

const out = {
  _about: "Ритусы Шабаша для листа (tools/sabbat_ritae.mjs из data/rules.json — правьте статьи правил и пересоберите).",
  require: requirement,
  groups: [
    { key: "auctoritas", list: [vaulderie, ...sacred.map(tag)] },
    { key: "ignoblis", list: profane },
    { key: "faction", list: factions }
  ]
};
fs.writeFileSync(path.join(ROOT, "data/sabbat-ritae.json"), `${JSON.stringify(out, null, 1)}\n`);
console.log("ритусы:", out.groups.map(g => `${g.key} ${g.list.length}`).join(", "));
