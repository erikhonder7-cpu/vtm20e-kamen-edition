// module/apps/houses.mjs
// Справочник Домов падших (Demon: The Fallen): семь Домов — аккадское имя, начальная Мука, Знания с призывами
// по кругам, Облики с чертами апокалиптической формы; пять фракций. Данные — data/demon.json (своими словами).
// По «Домам Падших» (data/demon-hof.json, пересказ) — история Дома, его ритуалы и реликвии.
// Разметка и стили — как у справочника кланов (r-cl-*); тема окна — демонская (r-type-demon).
// Открывается из листа демона (знак на корешке, имя Дома в шапке).

import { SYSTEM_PATH } from "../config.mjs";
import { Codex } from "../data/codex.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const t = (k, d) => d ? game.i18n.format(`VTM20.${k}`, d) : game.i18n.localize(`VTM20.${k}`);
const ROMAN = ["I", "II", "III", "IV", "V"];

/** Открыть справочник (на Доме или фракции `key`); уже открытое окно переключается. */
export async function openHouses(key = "") {
  await Codex.load();
  const open = foundry.applications.instances.get("r-houses");
  if (open) { if (key) open.show(key); open.bringToFront(); return open; }
  return new HouseAtlas(key).render({ force: true });
}

class HouseAtlas extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "r-houses",
    classes: ["vtm20", "r-dialog", "r-clans", "r-houses", "r-type-demon"],
    window: { title: "VTM20.Demon.Atlas", icon: "fa-solid fa-fire-flame-curved", resizable: true },
    position: { width: 900, height: 680 },
    actions: { pick: HouseAtlas.#onPick, group: HouseAtlas.#onGroup }
  };

  static PARTS = { body: { template: `${SYSTEM_PATH}/templates/apps/houses.hbs`, scrollable: [".r-cl-list", ".r-cl-card"] } };

  constructor(key) {
    super();
    const group = Codex.faction(key) ? "factions" : "houses";
    this.v = { key: Codex.house(key) || Codex.faction(key) ? key : Codex.houses[0]?.key ?? "", group };
  }

  show(key) {
    if (!Codex.house(key) && !Codex.faction(key)) return;
    Object.assign(this.v, { key, group: Codex.faction(key) ? "factions" : "houses" });
    this.render();
  }

  async _prepareContext() {
    const v = this.v;
    const list = v.group === "factions"
      ? Codex.factions.map(f => ({ key: f.key, name: f.name, icon: "fa-flag", active: f.key === v.key }))
      : Codex.houses.map(h => ({ key: h.key, name: h.name, sub: `${h.akkadian} · ${h.en}`, icon: "fa-fire-flame-curved", active: h.key === v.key }));
    const house = Codex.house(v.key), faction = Codex.faction(v.key);
    return {
      v, list,
      groups: [["houses", Codex.houses.length], ["factions", Codex.factions.length]].map(([k, n]) => ({ key: k, label: t(`Demon.Atlas${k === "houses" ? "Houses" : "Factions"}`), n, active: v.group === k })),
      house: house ? this.#house(house) : null,
      faction: !house && faction ? faction : null
    };
  }

  /** Карточка Дома: Знания (свои и общие) с призывами по кругам, Облики с чертами формы. */
  #house(h) {
    const lore = k => {
      const l = Codex.lore(k);
      return l ? { key: k, name: l.name, en: l.en, page: l.page, powers: l.powers.map(p => ({ roman: ROMAN[p.level - 1], name: p.name, page: p.page })) } : null;
    };
    const hof = Codex.hof(h.key) ?? {};
    const lname = ([k, n]) => `${Codex.lore(k)?.name ?? k} ${"•".repeat(n)}`;
    return {
      ...h,
      history: hof.sections ?? [],
      rituals: (hof.rituals ?? []).map(r => ({ ...r, primaryLabel: lname(r.primary), secondaryLabel: r.secondary.map(lname).join(", ") })),
      ritualsNote: hof.rituals_note ?? "",
      relics: (hof.relics ?? []).map(r => ({ ...r, craft: r.kind === "craft", loreLabel: r.lores.map(k => Codex.lore(k)?.name ?? k).join(", ") })),
      lores: h.lores.map(lore).filter(Boolean),
      common: (Codex.demon?.common ?? []).map(lore).filter(Boolean),
      visages: Object.entries(h.visages).map(([k, name]) => ({ name, lore: Codex.lore(k)?.name ?? k, form: Codex.lore(k)?.form }))
    };
  }

  static #onPick(event, target) { this.v.key = target.dataset.key; this.render(); }
  static #onGroup(event, target) {
    const g = target.dataset.group;
    Object.assign(this.v, { group: g, key: (g === "factions" ? Codex.factions : Codex.houses)[0]?.key ?? "" });
    this.render();
  }
}
