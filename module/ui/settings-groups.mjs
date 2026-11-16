// module/ui/settings-groups.mjs
// Настройки системы в окне «Настройки» Foundry — по разделам с заголовками, а не одним списком из 35 строк.
// Сохранение остаётся родным (поля те же, меняется только порядок в DOM); настройка, не попавшая в разделы, — в «Прочее».

import { SYSTEM_ID } from "../config.mjs";

/** Разделы и ключи настроек по порядку (подписи — VTM20.Settings.Group.<раздел>). */
const GROUPS = [
  ["chronicle", ["era", "darkAgesContent", "currency", "assignatRate", "nightlyWillpower", "monthlyIncome", "incomeTable", "herdNightly", "mageWeekly"]],
  ["city", ["latitude", "longitude", "utcOffset", "dawnWarnings", "cityMapEnabled", "nexusNav", "huntersAlert"]],
  ["combat", ["combatInitEachTurn", "combatInitFixed", "combatDeclare"]],
  ["rules", ["horridForm", "bogatyri", "tormentRule", "exorcismRule", "hunterGrowth", "hunterSacrifice", "hunterFreeform", "hunterEdgeCost", "hunterFifth", "koldunRoll", "koldunOutside"]],
  ["ui", ["sheetTheme", "uiSkin", "hud", "pauseLook", "uiSounds", "uiSoundVolume"]]
];

const head = key => {
  const h = document.createElement("h4");
  h.className = "r-settings-head";
  h.innerHTML = `<span>${game.i18n.localize(`VTM20.Settings.Group.${key}`)}</span>`;
  return h;
};

export function registerSettingsGroups() {
  Hooks.on("renderSettingsConfig", (app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    const sec = root?.querySelector('section[data-category="system"]');
    if (!sec || sec.querySelector(".r-settings-head")) return;
    const row = key => sec.querySelector(`[name="${SYSTEM_ID}.${key}"]`)?.closest(".form-group");
    const placed = new Set();
    const frag = document.createDocumentFragment();
    for (const [group, keys] of GROUPS) {
      const rows = keys.map(row).filter(Boolean);
      if (!rows.length) continue;
      frag.append(head(group), ...rows);
      rows.forEach(r => placed.add(r));
    }
    // настройки, которых нет в разделах (новые), — в конец, под «Прочее»
    const rest = [...sec.querySelectorAll(":scope > .form-group")].filter(r => !placed.has(r) && r.querySelector(`[name^="${SYSTEM_ID}."]`));
    if (rest.length) frag.append(head("other"), ...rest);
    sec.prepend(frag);
  });
}
