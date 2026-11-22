// module/ui/journal-skin.mjs
// Журнал как книга своей линейки: окно журнала из компендия системы получает знак линейки
// (над названием книги и бледным водяным знаком на странице) — styles/r-foundry.css, «Журналы: печатный лист».
// Свои журналы мира — без знака: только бумага и рамка.

import { SYSTEM_ID, VTM20 } from "../config.mjs";

/** Линейка компендия по имени: werewolf-books → werewolf; правила V20 и Пути — вампиры. */
function lineOf(pack) {
  const name = pack?.startsWith(`${SYSTEM_ID}.`) ? pack.slice(SYSTEM_ID.length + 1) : null;
  if (!name) return null;
  const m = /^(werewolf|mage|wraith|changeling|demon|hunter|dhampir)\b/.exec(name);
  return m ? (m[1] === "dhampir" ? "ghoul" : m[1]) : "vampire";
}

export function registerJournalSkin() {
  Hooks.on("renderJournalEntrySheet", (app, element) => {
    const el = element instanceof HTMLElement ? element : element?.[0];
    if (!el) return;
    const line = lineOf(app.document?.pack);
    el.classList.add("r-journal");
    if (!line) return;
    el.dataset.rLine = line;
    el.style.setProperty("--r-jsigil", `url("${foundry.utils.getRoute(VTM20.typeSigil(line))}")`);
  });
}
