// module/apps/creator/sorcerer.mjs
// Мастер создания: колдун (M20 Sorcerer, гл. 3) — смертный с отметкой «колдун»: Объединение и 5 точек нумин
// (Пути линейной магии или психические феномены — на старте не вперемешку), Путь за свободные пункты — 7, Воля 5.
// Нумины сидят на слоте Дисциплин мастера; ритуалы (по одному на точку Пути) колдун записывает уже на листе.

import { S as sorcData } from "../sorcerer.mjs";
import { plain } from "./rules.mjs";

const loc = k => game.i18n.localize(k);

export class SorcererCreator {
  get isSorcerer() { return this.type === "mortal" && this.st?.mark === "sorcerer"; }
  /** Все нумины: сначала Пути, потом феномены. */
  get sorcKeys() { const D = sorcData(); return [...D.paths, ...D.psychic].map(x => x.key); }
  /** Нумина как «Дисциплина» мастера. */
  sorcNumen(k) {
    const D = sorcData(), x = D.paths.find(p => p.key === k) ?? D.psychic.find(p => p.key === k);
    return x ? { key: k, name: x.name, en: x.en, psychic: D.psychic.includes(x), powers: [{ level: 1, name: "", en: "", html: x.html ?? x.text ?? "" }] } : null;
  }
  /** Точки нумин по виду: [в Путях, в феноменах]. */
  get sorcSpread() {
    const D = sorcData(), sum = list => list.reduce((n, x) => n + this.value("disc", x.key), 0);
    return [sum(D.paths), sum(D.psychic)];
  }
  /** На старте — либо Пути, либо феномены (смешивать — только за опыт и с согласия рассказчика). */
  get sorcIssues() {
    const [p, q] = this.sorcSpread;
    return p > 0 && q > 0 ? [loc("VTM20.SorcCr.Mixed")] : [];
  }
  /** Объединения для выбора: любимые Атрибуты и Пути — подсказкой. */
  sorcAffiliations() {
    return sorcData().affiliations.map(x => ({ key: x.key, label: x.name, selected: x.key === this.st.sorcAff, tip: plain([x.attrs, x.paths].filter(Boolean).join(" · ")) }));
  }
  /** Что пишется на лист. */
  sorcWrite(old = {}) {
    const D = sorcData();
    return { ...old, on: true, affiliation: this.st.sorcAff || "",
      numina: this.sorcKeys.map(key => ({ key, dots: this.value("disc", key), ability: (old.numina ?? []).find(n => n.key === key)?.ability ?? "" })).filter(n => n.dots > 0 && D) };
  }
}
