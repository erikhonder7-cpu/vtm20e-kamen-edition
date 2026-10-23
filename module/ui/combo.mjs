// module/ui/combo.mjs
// Выпадающие подсказки для текстовых полей (Натура, Маска, Секта…). Раньше это был <datalist>:
// его список рисует сам браузер — серый, чужим шрифтом, CSS на него не действует. Здесь список свой,
// в оформлении системы; поле остаётся текстовым, своё значение можно вписать руками.
//
// Разметка: <input type="text" data-combo="id-списка"> и где-то рядом <datalist id="id-списка"> с вариантами
// (datalist без атрибута list у поля браузер не показывает — он служит только хранилищем вариантов).

const norm = s => String(s ?? "").toLowerCase().replace(/ё/g, "е").trim();

/** Подключить списки ко всем полям [data-combo] внутри root (повторный вызов для тех же полей ничего не делает). */
export function attachCombos(root) {
  for (const input of root.querySelectorAll("input[data-combo]")) {
    if (input.dataset.comboReady) continue;
    input.dataset.comboReady = "1";
    input.setAttribute("autocomplete", "off");
    new Combo(input, root);
  }
}

class Combo {
  constructor(input, root) {
    this.input = input;
    this.root = root;
    this.pop = null;
    this.active = -1;
    input.addEventListener("focus", () => this.open(true));
    input.addEventListener("click", () => this.open(true));
    input.addEventListener("input", () => this.open(false));
    input.addEventListener("keydown", e => this.#key(e));
    input.addEventListener("blur", () => setTimeout(() => this.close(), 120));
  }

  get values() {
    const list = this.root.querySelector(`datalist#${CSS.escape(this.input.dataset.combo)}`);
    return [...(list?.options ?? [])].map(o => o.value).filter(Boolean);
  }

  /** all — показать весь список (при фокусе); иначе — отфильтровать по набранному. */
  open(all) {
    const q = norm(this.input.value);
    const values = this.values;
    const shown = all || !q ? values : values.filter(v => norm(v).includes(q));
    if (!shown.length) return this.close();
    if (!this.pop) {
      this.pop = document.createElement("div");
      this.pop.className = "vtm20 r-combo-pop";
      this.pop.addEventListener("mousedown", e => {          // mousedown, а не click: поле не теряет фокус раньше выбора
        const li = e.target.closest("[data-value]");
        e.preventDefault();
        if (li) this.pick(li.dataset.value);
      });
      document.body.append(this.pop);
      this._reflow = () => this.place();
      window.addEventListener("resize", this._reflow);
      document.addEventListener("scroll", this._reflow, true);
    }
    const cur = norm(this.input.value);
    this.items = shown;
    this.active = Math.max(0, shown.findIndex(v => norm(v) === cur));
    this.pop.innerHTML = shown.map((v, i) =>
      `<div class="r-combo-item${norm(v) === cur ? " is-current" : ""}${i === this.active ? " is-active" : ""}" data-value="${foundry.utils.escapeHTML(v)}">${foundry.utils.escapeHTML(v)}</div>`).join("");
    this.place();
    this.pop.children[this.active]?.scrollIntoView({ block: "nearest" });
  }

  /** Под полем; если снизу не хватает места — над ним. */
  place() {
    if (!this.pop) return;
    if (!this.input.isConnected) return this.close();
    const r = this.input.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 8, above = r.top - 8;
    const up = below < 160 && above > below;
    const maxH = Math.min(320, up ? above : below);
    Object.assign(this.pop.style, {
      left: `${Math.round(r.left)}px`, minWidth: `${Math.round(Math.max(r.width, 180))}px`, maxHeight: `${Math.round(maxH)}px`,
      top: up ? "" : `${Math.round(r.bottom + 2)}px`, bottom: up ? `${Math.round(window.innerHeight - r.top + 2)}px` : ""
    });
  }

  pick(value) {
    this.input.value = value;
    this.input.dispatchEvent(new Event("change", { bubbles: true }));   // форма листа сохраняет по change
    this.close();
  }

  close() {
    if (!this.pop) return;
    window.removeEventListener("resize", this._reflow);
    document.removeEventListener("scroll", this._reflow, true);
    this.pop.remove();
    this.pop = null;
  }

  #key(e) {
    if (!this.pop) { if (e.key === "ArrowDown") { this.open(true); e.preventDefault(); } return; }
    const n = this.items.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      this.active = (this.active + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
      [...this.pop.children].forEach((el, i) => el.classList.toggle("is-active", i === this.active));
      this.pop.children[this.active]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (this.items[this.active] !== undefined) this.pick(this.items[this.active]);
    } else if (e.key === "Escape") {
      e.preventDefault(); e.stopPropagation();
      this.close();
    }
  }
}
