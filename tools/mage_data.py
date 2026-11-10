# tools/mage_data.py
# Маг: Восхождение (Mage: The Ascension 20th Anniversary) — данные линейки из справочника проекта
# books/Мир Тьмы/Маги/_справочник (пересказ механики по-русски, «Русское (English)»; текста книг в системе нет).
# Пишет:
#   data/mage.json       — Сферы (ранги 1–5, специализации, технократические аналоги), фракции (Традиции, Конвенции,
#                          Ремёсла) с родовыми Сферами, Сущности Аватара, архетипы, Факты биографии, Достоинства и
#                          недостатки, фокус (парадигмы, практики, инструменты), таблицы магии и Парадокса;
#   data/mage-books.json — компендий «Маг — книги»: книга — папка, файл — запись журнала, «## » — страница.
# Запуск — из build_data.py (или сам: python -I tools/mage_data.py).

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import werewolf_data as wd   # общий разбор Markdown: md_html, md_inline, split_md, slug   # noqa: E402

REF = os.path.join(ROOT, "books", "Мир Тьмы", "Маги", "_справочник")
CORE = os.path.join(REF, "M20_Основная")
OUT = os.path.join(ROOT, "data", "mage.json")
BOOKS_OUT = os.path.join(ROOT, "data", "mage-books.json")
SOURCE = "M20"

SPHERES = [("correspondence", "Correspondence", "Соответствие", "fa-diagram-project"), ("entropy", "Entropy", "Энтропия", "fa-dice"),
           ("forces", "Forces", "Силы", "fa-bolt"), ("life", "Life", "Жизнь", "fa-seedling"), ("matter", "Matter", "Материя", "fa-cube"),
           ("mind", "Mind", "Разум", "fa-brain"), ("prime", "Prime", "Первоначало", "fa-sun"), ("spirit", "Spirit", "Дух", "fa-ghost"),
           ("time", "Time", "Время", "fa-hourglass-half")]
RANKS = ["Восприятие", "Манипуляция", "Контроль", "Власть", "Мастерство"]
# технократические аналоги (опциональное правило M20): чья Сфера
TECH = {"Data": "correspondence", "Dimensional Science": "spirit", "Primal Utility": "prime"}
RU_SPHERE = {ru: key for key, _, ru, _ in SPHERES}
RU_SPHERE.update({"Данные": "correspondence", "Пространственная наука": "spirit", "Первичная Полезность": "prime"})
ARETE = ["Спящий", "Посвящённый", "Одарённый", "Обученный", "Дисциплинированный", "Повелевающий", "Мастерский", "Понимающий", "Мудрый",
         "Просветлённый", "Трансцендентный"]
GROUPS = [("traditions", "Совет Девяти Традиций", "## Совет Девяти Мистических Традиций"),
          ("technocracy", "Технократический Союз", "## Технократический Союз"),
          ("disparates", "Дисперсные Ремёсла", "## Дисперсные Ремёсла")]
CAT = [("физ", "physical"), ("мент", "mental"), ("соц", "social"), ("сверх", "supernatural"), ("генет", "physical")]

# стоимость по M20 (файл 01): свободные пункты и опыт
FREEBIES = {"attribute": 5, "ability": 2, "background": 1, "sphere": 7, "arete": 4, "willpower": 1, "quintessence4": 1}
XP = {"newAbility": 3, "ability": 2, "newSphere": 10, "affinitySphere": 7, "sphere": 8, "arete": 8, "attribute": 4, "background": 3, "willpower": 1}
# магия (файл 03): сложность = высшая Сфера + …; урон и длительность по успехам; откат Парадокса
CASTING = {"coincidental": 3, "vulgar": 4, "witnessed": 5, "min": 3, "max": 10, "modCap": 3}
EFFECT = [{"n": 1, "damage": 0, "duration": "1 ход"}, {"n": 2, "damage": 2, "duration": "1 сцена"}, {"n": 3, "damage": 6, "duration": "1 день"},
          {"n": 4, "damage": 8, "duration": "1 история"}, {"n": 5, "damage": 10, "duration": "6 месяцев"}]
BACKLASH = [{"min": 1, "max": 5, "text": "по 1 очку за успех; Ожог — лёгкое повреждение за успех — и пустяковый Изъян Парадокса"},
            {"min": 6, "max": 10, "text": "разряд; Ожог (лёгкое повреждение за успех) или малый Изъян"},
            {"min": 11, "max": 15, "text": "разряд; тяжёлый Ожог или: значительный Изъян, визит Духа Парадокса, лёгкое Безмолвие"},
            {"min": 16, "max": 20, "text": "разряд; тяжёлый Ожог и 1 постоянный Парадокс — или два из: серьёзный Изъян, Дух Парадокса, умеренное Безмолвие, Царство Парадокса"},
            {"min": 21, "max": 999, "text": "разряд; губительный Ожог (уровень за 2 успеха) и: 2 постоянного Парадокса, или решающий Изъян, Дух, тяжёлое Безмолвие, Царство Парадокса"}]


def read(path):
    with open(path, encoding="utf-8") as f:
        text = f.read()
    return text.split("---", 2)[2] if text.startswith("---") else text


def core(prefix):
    fn = next(f for f in sorted(os.listdir(CORE)) if f.startswith(prefix))
    return read(os.path.join(CORE, fn))


def section(text, heading):
    """Тело раздела по началу заголовка (до следующего заголовка того же или старшего уровня)."""
    level = len(heading) - len(heading.lstrip("#"))
    lines, out, on = text.splitlines(), [], False
    for line in lines:
        if on and re.match(rf"^#{{1,{level}}} ", line):
            break
        if on:
            out.append(line)
        elif line.startswith(heading):
            on = True
    return out


def ru_en(title):
    """«Русское (English)» → (русское, английское); пометки «$» и «*» — отдельно."""
    marks = "".join(ch for ch in "$*" if ch in title)
    title = re.sub(r"\s*[$*]", "", title).strip()
    m = re.match(r"^(.+?)\s*\(([^()]+)\)\s*$", title)
    return (m.group(1).strip(), m.group(2).strip(), marks) if m else (title, "", marks)


def html_of(lines):
    return wd.md_html([x for x in lines])


def plain(s):
    return re.sub(r"\*\*|\*", "", s).strip()


def parse_spheres():
    text = core("02a") + "\n" + core("02b")
    out = []
    for key, en, ru, icon in SPHERES:
        lines = section(text, f"## {ru} ({en})")
        ranks, about = {}, []
        for line in lines:
            m = re.match(r"^- \*\*(•+)\*\*\s*(.*)$", line)
            if m:
                ranks[len(m.group(1))] = wd.md_inline(m.group(2).strip())
            elif not ranks and line.strip() and not line.startswith("|") and not line.startswith("#"):
                about.append(line.strip())
        spec = re.match(r"^Специализации:\s*(.+?)\.(?:\s|$)", about[0]) if about else None
        out.append({"key": key, "name": ru, "en": en, "icon": icon, "specialties": plain(spec.group(1)) if spec else "",
                    "about": wd.md_inline(" ".join(about)), "ranks": [ranks.get(i, "") for i in range(1, 6)], "html": html_of(lines)})
    # технократические аналоги: «### Данные (Data) — аналог Соответствия»
    for line in text.splitlines():
        m = re.match(r"^### (.+?) \((.+?)\) — аналог", line)
        if not m or m.group(2) not in TECH:
            continue
        body = section(text, line)
        ranks = {}
        for x in body:
            r = re.match(r"^- (•+)\s+(.*)$", x)
            if r:
                ranks[len(r.group(1))] = wd.md_inline(r.group(2).strip())
        sp = next(s for s in out if s["key"] == TECH[m.group(2)])
        sp["tech"] = {"name": m.group(1), "en": m.group(2), "ranks": [ranks.get(i, "") for i in range(1, 6)], "html": html_of(body)}
    return out


def affinity_of(cell):
    cell = re.split(r"никогда", plain(cell))[0]
    if re.search(r"Любая|Не привязаны", cell):
        return [k for k, *_ in SPHERES]
    found = []
    for m in re.finditer("|".join(sorted(map(re.escape, RU_SPHERE), key=len, reverse=True)), cell):
        k = RU_SPHERE[m.group(0)]
        if k not in found:
            found.append(k)
    return found


def parse_factions():
    text = core("06")
    out = []
    for group, _, heading in GROUPS:
        for line in section(text, heading):
            m = re.match(r"^\|\s*\*\*(.+?)\s*\((.+?)\)\*\*\s*\|\s*(.+?)\s*\|\s*(.*?)\s*\|\s*$", line)
            if not m:
                continue
            name, en, aff, notes = m.groups()
            name = name.replace("Таfтани", "Тафтани")   # в справочнике латинская буква
            out.append({"key": wd.slug(en.split(",")[0].split("/")[0]), "name": name.strip(), "en": en.strip(), "group": group,
                        "affinity": affinity_of(aff), "affinityText": plain(aff), "practices": plain(notes)})
    return out


def parse_essences():
    out = []
    for line in section(core("01"), "## Сущность Аватара"):
        m = re.match(r"^- \*\*(.+?) \((.+?)\)\*\*\s*—\s*(.*)$", line)
        if m:
            out.append({"key": wd.slug(m.group(2)), "name": m.group(1).split("/")[0].strip(), "en": m.group(2), "text": plain(m.group(3))})
    return out


def parse_archetypes():
    """Архетипы Book of Secrets — с условием восстановления Воли; список основной книги — названиями."""
    out, seen = [], set()
    bos = read(os.path.join(REF, "M20_Book_of_Secrets", "01_Архетипы_и_дополнительные_Способности.md"))
    for line in section(bos, "## Новые архетипы"):
        m = re.match(r"^- \*\*(.+?) \((.+?)\):\*\*\s*(.*)$", line)
        if m and m.group(1) not in seen:
            seen.add(m.group(1))
            out.append({"name": m.group(1), "en": m.group(2), "regain": plain(m.group(3)).rstrip(".")})
    listed = re.search(r"Список:\s*(.+?)\.\s*$", "\n".join(section(core("01"), "## Архетипы")), re.M)
    for name in (listed.group(1).split(",") if listed else []):
        name = re.sub(r"\s*\(.*?\)", "", name).strip()
        if name and name not in seen:
            seen.add(name)
            out.append({"name": name, "en": "", "regain": ""})
    return out


def parse_backgrounds():
    text, out = core("05"), []
    for line in text.splitlines():
        if not line.startswith("## ") or line.startswith("## Общие"):
            continue
        name, en, marks = ru_en(line[3:])
        if not en:
            continue
        body = section(text, line)
        out.append({"name": name, "en": en, "double": "$" in marks, "technocracy": "*" in marks, "html": html_of(body), "source": SOURCE})
    return out


def cost_of(text):
    """«1 или 3», «+1…+5», «(1–2)», «7 за точку» → (строка, мин, макс)."""
    nums = [int(x) for x in re.findall(r"\d+", text)]
    if not nums:
        return "", 0, 0
    lo, hi = min(nums), max(nums)
    return (str(lo) if lo == hi else f"{lo}–{hi}"), lo, hi


def category_of(text):
    low = text.lower()
    return next((c for w, c in CAT if w in low), "supernatural")


def parse_merits():
    out, seen = [], set()

    def add(kind, category, name, en, cost_text, body, source):
        cost, lo, hi = cost_of(cost_text)
        if not name or (kind, name) in seen or not lo:
            return
        seen.add((kind, name))
        out.append({"kind": kind, "category": category, "name": name, "en": en, "cost": cost, "min": lo, "max": hi, "clan": "", "sect": "", "era": "",
                    "source": source, "html": f"<p>{wd.md_inline(body.strip())}</p>" if body.strip() else ""})

    # основная книга: таблица (название, цена, тип) и описания списком
    text = core("09")
    table = {}
    for line in section(text, "## Таблица"):
        m = re.match(r"^\|\s*(.+?)\s*\((.+?)\)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$", line)
        if m and "Название" not in m.group(1):
            table[m.group(1).strip()] = (m.group(2).strip(), m.group(3), m.group(4))
    desc = {}
    for line in text.splitlines():
        m = re.match(r"^- \*\*(.+?)(?:\s*\(.*?\))?:\*\*\s*(.*)$", line)
        if m:
            desc[m.group(1).strip()] = m.group(2)
    for name, (en, cost, typ) in table.items():
        key = next((d for d in desc if name.split(" / ")[0].lower().startswith(d.lower()[:12]) or d.lower().startswith(name.split(" / ")[0].lower()[:12])), None)
        kind = "flaw" if "едостат" in typ and "Достоинство или" not in typ else "merit"
        add(kind, category_of(typ), name, en, cost, desc.get(key, ""), "M20")
    # Book of Secrets, файлы 02–04: «## Физические Достоинства» → «- **Название (цена):** текст»
    bos = os.path.join(REF, "M20_Book_of_Secrets")
    for fn in sorted(os.listdir(bos)):
        if not re.match(r"0[234]_", fn):
            continue
        kind = category = None
        for line in read(os.path.join(bos, fn)).splitlines():
            if line.startswith("## "):
                kind = "merit" if "Достоинств" in line else "flaw" if "Недостат" in line else None
                category = category_of(line)
                continue
            m = re.match(r"^- \*\*(.+?)\s*\(([^()]*\d[^()]*)\):\*\*\s*(.*)$", line)
            if kind and m:
                name, en = m.group(1).strip(), ""
                e = re.match(r"^(.+?)\s*\(([A-Za-z][^()]*)\)$", name)
                if e:
                    name, en = e.group(1).strip(), e.group(2).strip()
                add(kind, category, name, en, m.group(2), m.group(3), "M20 Book of Secrets")
    return out


def parse_focus():
    text = core("04")
    paradigms = []
    for line in section(text, "## Парадигмы"):
        m = re.match(r"^\d+\.\s*\*\*(.+?) \((.+?)\)\*\*\s*—\s*(.*)$", line)
        if m:
            paradigms.append({"name": m.group(1), "en": m.group(2), "text": plain(m.group(3))})
    practices = []
    for line in section(text, "## Практики"):
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) == 4 and cells[0].startswith("**"):
            name, en, _ = ru_en(plain(cells[0]))
            practices.append({"name": name, "en": en, "paradigms": plain(cells[1]), "abilities": plain(cells[2]), "instruments": plain(cells[3])})
    tools = []
    body = " ".join(x for x in section(text, "### Список инструментов") if x.strip() and not x.startswith("#"))
    first = body.split("\n")[0]
    for part in re.split(r";\s*", first.split(". ")[0] if ";" in first.split(". ")[0] else first):
        name = plain(part).strip(" .")
        if name and len(name) < 70:
            tools.append(name)
    return {"paradigms": paradigms, "practices": practices, "instruments": tools}


BOOKS = [("M20_Основная", "Маг: Восхождение (основная книга)"), ("M20_Book_of_Secrets", "Книга Тайн"), ("M20_How_Do_You_DO_That", "Как это делается"),
         ("M20_Lore_of_the_Traditions", "Предания Традиций"), ("M20_Technocracy_Reloaded", "Технократия: перезагрузка"),
         ("M20_Operatives_Dossier", "Досье оперативника"), ("M20_Book_of_the_Fallen", "Книга Падших"), ("M20_Gods_and_Monsters", "Боги и чудовища"),
         ("M20_Sorcerer", "Колдун"), ("M20_Rich_Bastards_Guide", "Руководство богатого мерзавца"), ("M20_Faces_of_Magick", "Лица Магии"),
         ("M20_Victorian_Age", "Викторианская эпоха"), ("M20_VA_Weird_Wonders", "Викторианская эпоха: Причудливые чудеса"),
         ("M20_VA_Bizarre_Tales", "Викторианская эпоха: Странные истории")]


def parse_books():
    out = []
    for folder, label in BOOKS:
        d = os.path.join(REF, folder)
        if not os.path.isdir(d):
            continue
        for fn in sorted(f for f in os.listdir(d) if f.endswith(".md")):
            with open(os.path.join(d, fn), encoding="utf-8") as f:
                title, pages = wd.split_md(f.read())
            if not pages:
                continue
            title = re.sub(r"\s+—\s+M20\b.*$", "", title) or fn[:-3].replace("_", " ")
            out.append({"key": f"{folder}:{fn.split('_')[0]}", "book": label, "name": title, "pages": pages})
    return out


def build():
    spheres, factions = parse_spheres(), parse_factions()
    data = {
        "source": "Mage: The Ascension 20th Anniversary Edition — справочник проекта (пересказ механики)",
        "spheres": spheres, "ranks": RANKS, "arete": ARETE,
        "groups": [{"key": k, "name": n} for k, n, _ in GROUPS], "factions": factions,
        "essences": parse_essences(), "archetypes": parse_archetypes(),
        "backgrounds": parse_backgrounds(), "merits": parse_merits(), "focus": parse_focus(),
        "freebies": FREEBIES, "xp": XP, "casting": CASTING, "effect": EFFECT, "backlash": BACKLASH,
        "creation": {"attributes": [7, 5, 3], "abilities": [13, 9, 5], "abilityMax": 3, "backgrounds": 7, "spheres": 6, "arete": 1, "areteMax": 3,
                     "willpower": 5, "freebies": 15, "flawsMax": 7, "instruments": 7},
    }
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    books = parse_books()
    with open(BOOKS_OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(books, f, ensure_ascii=False, indent=1)
    return (f"Сферы {len(spheres)} (рангов {sum(1 for s in spheres for r in s['ranks'] if r)}), фракции {len(factions)}, Сущности {len(data['essences'])}, "
            f"архетипы {len(data['archetypes'])}, Факты {len(data['backgrounds'])}, черты {len(data['merits'])}, парадигмы {len(data['focus']['paradigms'])}, "
            f"практики {len(data['focus']['practices'])}, инструменты {len(data['focus']['instruments'])}; книги: записей {len(books)}, "
            f"страниц {sum(len(b['pages']) for b in books)}")


if __name__ == "__main__":
    import fsretry; fsretry.install()   # Windows: занятый на миг файл — повтор, а не обрыв сборки
    sys.stdout.reconfigure(encoding="utf-8")
    print(build())
