# tools/build_demon.py — справочник демонов (Demon: The Fallen) для системы: data/demon.json.
# Из книги берутся только названия, уровни, пулы бросков и номера страниц (текст книги в репозиторий не попадает):
# Знания с пятью призывами и чертами апокалиптической формы (4 при низкой Муке, 4 при высокой), Дома, Облики, фракции.
# Запуск: python tools/build_demon.py [путь к Demon_The_Fallen.pdf] — русское издание, главы 5–7.
import json, os, re, sys

PDF = sys.argv[1] if len(sys.argv) > 1 else r"D:\Загрузки\Новая папка\Demon_The_Fallen.pdf"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "demon.json")
BOOK = "Demon: The Fallen"

# Знание: ключ, англ. название, Дом (None — общее)
LORES = {
    "Основания": ("fundament", "Lore of the Fundament", None), "Человечества": ("humanity", "Lore of Humanity", None),
    "Небожителей": ("celestials", "Lore of the Celestials", "devils"), "Пламени": ("flame", "Lore of Flame", "devils"),
    "Сияния": ("radiance", "Lore of Radiance", "devils"),
    "Пробуждения": ("awakening", "Lore of Awakening", "scourges"), "Небесного Свода": ("firmament", "Lore of the Firmament", "scourges"),
    "Ветра": ("winds", "Lore of the Winds", "scourges"),
    "Земли": ("earth", "Lore of the Earth", "malefactors"), "Путей": ("paths", "Lore of Paths", "malefactors"),
    "Кузнечного Дела": ("forge", "Lore of the Forge", "malefactors"),
    "Узоров": ("patterns", "Lore of Patterns", "fiends"), "Порталов": ("portals", "Lore of Portals", "fiends"),
    "Света": ("light", "Lore of Light", "fiends"),
    "Желания": ("longing", "Lore of Longing", "defilers"), "Бурь": ("storms", "Lore of Storms", "defilers"),
    "Метаморфоз": ("transfiguration", "Lore of Transfiguration", "defilers"),
    "Зверей": ("beast", "Lore of the Beast", "devourers"), "Дикой природы": ("wild", "Lore of the Wild", "devourers"),
    "Плоти": ("flesh", "Lore of the Flesh", "devourers"),
    "Смерти": ("death", "Lore of Death", "slayers"), "Душ": ("spirit", "Lore of the Spirit", "slayers"),
    "Сфер": ("realms", "Lore of the Realms", "slayers"),
}
# Дома: ключ → (название, мн. ч. по-аккадски, англ., стартовая Мука (гл. 5), Облики по Знаниям, кратко своими словами)
HOUSES = {
    "devils": ("Дьяволы", "Намару", "Devils", 4, {"celestials": "Бел", "flame": "Нуску", "radiance": "Кингу"},
               "Первый Дом, глашатаи Небес: вожди и соблазнители, чей голос подчиняет и ранит души."),
    "scourges": ("Кнуты", "Ашару", "Scourges", 3, {"awakening": "Даган", "firmament": "Аншар", "winds": "Эллиль"},
                 "Второй Дом, дыхание Творца: ветра, небосвод и сама жизнь — исцеление и мор одним прикосновением."),
    "malefactors": ("Преступники", "Аннунаки", "Malefactors", 3, {"earth": "Кишар", "paths": "Анту", "forge": "Мумму"},
                    "Третий Дом, зодчие мира: земля, дороги и ремесло — любое чудо, но за свою цену."),
    "fiends": ("Изверги", "Неберу", "Fiends", 3, {"patterns": "Нинсун", "portals": "Неду", "light": "Шамаш"},
               "Четвёртый Дом, хранители звёзд: судьбы, проходы и свет, пророчества и проклятия."),
    "defilers": ("Осквернители", "Ламмасу", "Defilers", 3, {"longing": "Ишхара", "storms": "Адад", "transfiguration": "Маммету"},
                 "Пятый Дом, глубины морей и желаний: вдохновение, буря и облик, которого жаждут."),
    "devourers": ("Пожиратели", "Рабису", "Devourers", 4, {"beast": "Зальту", "wild": "Нинурту", "flesh": "Аруру"},
                  "Шестой Дом, воины-охотники: звери, дикая природа и плоть, которую они лепят."),
    "slayers": ("Убийцы", "Халаку", "Slayers", 4, {"death": "Намтар", "spirit": "Эрешкигаль", "realms": "Нергал"},
                "Седьмой Дом, ангелы смерти: провожатые душ, владыки тлена и мира за Пеленой."),
}
FACTIONS = {
    "luciferans": ("Люцифериане", "Верность Люциферу и прежней войне за человечество."),
    "faustians": ("Фаустианцы", "Власть через договоры со смертными: Вера в обмен на исполненные желания."),
    "cryptics": ("Скрытные", "Криптики: разгадать, почему пали ангелы и куда исчез Люцифер."),
    "ravenous": ("Жаждущие", "Месть Небесам любой ценой и вкус силы, утраченной в Бездне."),
    "reconcilers": ("Миротворцы", "Искупление: вернуть Творению красоту и залечить раны мира."),
}
ATTR = {"Сила": "strength", "Ловкость": "dexterity", "Выносливость": "stamina", "Обаяние": "charisma", "Харизма": "charisma",
        "Манипуляция": "manipulation", "Внешность": "appearance", "Восприятие": "perception", "Интеллект": "intelligence",
        "Сообразительность": "wits", "Смекалка": "wits"}
ABIL = {"Атлетизм": "athletics", "Атлетика": "athletics", "Наука": "science", "Бдительность": "alertness", "Выживание": "survival",
        "Медицина": "medicine", "Ремесло": "crafts", "Интуиция": "intuition", "Осведомленность": "awareness", "Осведомлённость": "awareness",
        "Актерство": "performance", "Актёрство": "performance", "Выразительность": "expression", "Эмпатия": "empathy",
        "Хитрость": "subterfuge", "Знание животных": "animalKen", "Запугивание": "intimidation", "Лидерство": "leadership",
        "Оккультизм": "occult", "Религия": "religion", "Убеждение": "expression", "Красноречие": "expression"}


def main():
    import pymupdf
    doc = pymupdf.open(PDF)
    pages = {i + 1: doc[i].get_text() for i in range(168, 216)}
    lores, cur, ev, buf = [], None, None, []

    def flush():
        if ev is None: buf.clear(); return
        t = " ".join(buf)
        m = re.search(r"Система[:.]?(.{0,400})", t)
        s = m.group(1) if m else ""
        pm = re.search(r"(" + "|".join(ATTR) + r")\s*\+\s*(" + "|".join(sorted(ABIL, key=len, reverse=True)) + r")", s)
        dm = re.search(r"сложност\w*\s*(?:равна\s*|-\s*)?(\d+)", s)
        if pm: ev["roll"] = {"trait1": f"attributes.{ATTR[pm.group(1)]}", "trait2": f"abilities.{ABIL[pm.group(2)]}",
                             "difficulty": int(dm.group(1)) if dm and 2 <= int(dm.group(1)) <= 10 else 6}
        buf.clear()

    for page, text in pages.items():
        for line in text.split("\n"):
            s = line.strip()
            mL = re.match(r"^Знание (.+)$", s)
            if mL and mL.group(1).strip() in LORES and len(s) < 40:
                flush(); ev = None
                key, en, house = LORES[mL.group(1).strip()]
                cur = {"key": key, "name": s, "en": en, "house": house, "page": page, "powers": [], "form": []}
                lores.append(cur); continue
            mE = re.match(r"^((?:•\s*){1,5})\s*([А-ЯЁ].{2,40})$", s)
            if cur and mE and ":" not in s:
                lvl = mE.group(1).count("•")
                if len(cur["powers"]) < 5 and lvl == len(cur["powers"]) + 1:
                    flush(); ev = {"level": lvl, "name": mE.group(2).strip(" ."), "page": page}; cur["powers"].append(ev); continue
            mF = re.match(r"^•\s*([А-ЯЁXA-Z][^:]{2,40}):", s)
            if cur and mF:
                flush(); ev = None
                name = re.sub(r"\s+", " ", mF.group(1)).strip().replace("Xорошее", "Хорошее").replace("Я довитая", "Ядовитая")
                if re.fullmatch(r"(?:\S ){3,}\S.*", name):          # набрано вразрядку: «П о к р о в  П л а м е н и»
                    name = " ".join(w.replace(" ", "") for w in re.split(r" (?=[А-ЯЁ])", name))
                if len(cur["form"]) < 8: cur["form"].append(name)
                continue
            buf.append(s)
    flush()
    for L in lores:
        for p in L["powers"]:
            p["html"] = f"<p><em>{BOOK}, с. {p['page']}.</em> Призыв {p['level']}-го круга. Эффект обычный — если кость Муки выше Муки демона, иначе — эффект высокой Муки (см. книгу).</p>"
        # первые четыре черты формы — при низкой Муке, остальные — при высокой (гл. 7)
        L["form"] = {"low": L["form"][:4], "high": L["form"][4:8]} if L["form"] else None
    houses = [{"key": k, "name": v[0], "akkadian": v[1], "en": v[2], "torment": v[3],
               "lores": [l for l in v[4]], "visages": v[4], "text": v[5]} for k, v in HOUSES.items()]
    data = {"source": BOOK, "houses": houses,
            "factions": [{"key": k, "name": v[0], "text": v[1]} for k, v in FACTIONS.items()],
            "common": ["fundament", "humanity"], "lores": lores}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print("Знаний:", len(lores), "| призывов:", sum(len(l["powers"]) for l in lores),
          "| с пулом:", sum(1 for l in lores for p in l["powers"] if p.get("roll")),
          "| форм:", sum(1 for l in lores if l["form"]))
    for L in lores:
        if len(L["powers"]) != 5 or (L["house"] and not L["form"]): print("  проверить:", L["name"], len(L["powers"]), L["form"])


if __name__ == "__main__":
    main()
