# tools/werewolf_data.py
# Оборотень: Апокалипсис (Werewolf: The Apocalypse 20th Anniversary, основная книга) — из справочника
# books/Мир Тьмы/Оборотни/_справочник/W20_Основная (пересказ механики по-русски, «Русское (English)»). Пишет data/werewolf.json:
#   · breeds, auspices, tribes — породы, аугурии, племена: начальные Гнозис, Ярость, Слава, Воля, тотем, ограничения Фактов,
#     стартовые Дары (по английским названиям);
#   · forms — пять форм: сложность смены, поправки Атрибутов (по листу персонажа W20: Манипуляция −3 в Криносе, Хиспо и Лупусе,
#     Внешность в Криносе — 0; в тексте главы у Манипуляции стоит «0», абзац ниже говорит о штрафах — берём лист);
#   · gifts — Дары пород, аугурий и племён: уровень, кто учит, у кого в списках, бросок (если в тексте «Атрибут + Способность»),
#     цена (Ярость, Гнозис, Воля), текст;
#   · rites — ритуалы: вид, уровень, текст;
#   · rank — Слава по аугуриям для Рангов 1–5; xp — цены опыта.
# Запуск — из build_data.py (или сам: python -I tools/werewolf_data.py).

import html
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "data", "werewolf.json")
REF = os.path.join(ROOT, "books", "Мир Тьмы", "Оборотни", "_справочник", "W20_Основная")
BOOK = "W20"

BREEDS = {"Homid": "homid", "Metis": "metis", "Lupus": "lupus"}
AUSPICES = {"Ragabash": "ragabash", "Theurge": "theurge", "Philodox": "philodox", "Galliard": "galliard", "Ahroun": "ahroun"}
TRIBES = {"Black Furies": "blackFuries", "Bone Gnawers": "boneGnawers", "Children of Gaia": "childrenOfGaia", "Fianna": "fianna",
          "Get of Fenris": "getOfFenris", "Glass Walkers": "glassWalkers", "Red Talons": "redTalons", "Shadow Lords": "shadowLords",
          "Silent Striders": "silentStriders", "Silver Fangs": "silverFangs", "Stargazers": "stargazers", "Uktena": "uktena",
          "Wendigo": "wendigo"}

# Пять форм (W20, гл. 6; поправки — по листу персонажа). set — значение ставится, а не прибавляется.
FORMS = [
    {"key": "homid", "name": "Хомид", "en": "Homid", "diff": 6, "mods": {}, "set": {}},
    {"key": "glabro", "name": "Глабро", "en": "Glabro", "diff": 7, "mods": {"strength": 2, "stamina": 2, "manipulation": -2, "appearance": -1}, "set": {}},
    {"key": "crinos", "name": "Кринос", "en": "Crinos", "diff": 6, "mods": {"strength": 4, "dexterity": 1, "stamina": 3, "manipulation": -3},
     "set": {"appearance": 0}, "delirium": True},
    {"key": "hispo", "name": "Хиспо", "en": "Hispo", "diff": 7, "mods": {"strength": 3, "dexterity": 2, "stamina": 3, "manipulation": -3}, "set": {},
     "perception": -1, "bite": 1},
    {"key": "lupus", "name": "Лупус", "en": "Lupus", "diff": 6, "mods": {"strength": 1, "dexterity": 2, "stamina": 2, "manipulation": -3}, "set": {},
     "perception": -2},
]

# Значки (Font Awesome Pro из Foundry): аугурии — фазы луны, племена — по тотему, формы — облик; картинки Даров и ритуалов —
# из библиотеки Foundry (icons/…), путь от корня сервера
ICONS = {
    "breed": {"homid": "fa-person", "metis": "fa-bone-break", "lupus": "fa-paw"},
    "auspice": {"ragabash": "fa-moon-new", "theurge": "fa-moon-waxing-crescent", "philodox": "fa-moon-first-quarter",
                "galliard": "fa-moon-waxing-gibbous", "ahroun": "fa-circle"},
    "tribe": {"blackFuries": "fa-horse", "boneGnawers": "fa-bone", "childrenOfGaia": "fa-unicorn", "fianna": "fa-deer",
              "getOfFenris": "fa-teeth", "glassWalkers": "fa-tree-city", "redTalons": "fa-claw-marks", "shadowLords": "fa-cloud-bolt",
              "silentStriders": "fa-owl", "silverFangs": "fa-crown", "stargazers": "fa-moon-stars", "uktena": "fa-snake",
              "wendigo": "fa-snowflake"},
    "form": {"homid": "fa-person", "glabro": "fa-person-falling-burst", "crinos": "fa-claw-marks", "hispo": "fa-paw-claws", "lupus": "fa-paw"},
}
IMG = {"gift": {"breed": "icons/magic/nature/wolf-paw-glow-large-teal-blue.webp", "auspice": "icons/creatures/abilities/wolf-howl-moon-white.webp",
                "tribe": "icons/creatures/mammals/wolf-howl-moon-gray.webp", "outsider": "icons/creatures/mammals/wolf-shadow-black.webp"},
       "rite": "icons/creatures/abilities/wolf-heads-swirl-purple.webp"}

# Слава для Рангов 1–5 (W20, гл. 4): Рагабаш — сумма в любом сочетании; остальные — Слава/Честь/Мудрость.
RANK_NAMES = ["Клиат", "Фостерн", "Адрен", "Атро", "Старейшина"]
RANK = {
    "ragabash": [3, 7, 13, 19, 25],
    "theurge": [[0, 0, 3], [1, 0, 5], [2, 1, 7], [4, 2, 9], [4, 9, 10]],
    "philodox": [[0, 3, 0], [1, 4, 1], [2, 6, 2], [3, 8, 4], [4, 10, 9]],
    "galliard": [[2, 0, 1], [4, 0, 2], [4, 2, 4], [7, 2, 6], [9, 5, 9]],
    "ahroun": [[2, 1, 0], [4, 1, 1], [6, 3, 1], [9, 4, 2], [10, 9, 4]],
}
START_RENOWN = {"ragabash": None, "theurge": [0, 0, 3], "philodox": [0, 3, 0], "galliard": [2, 0, 1], "ahroun": [2, 1, 0]}
XP = {"attribute": "текущее × 4", "ability": "текущее × 2", "newAbility": 3, "giftOwn": "уровень × 3", "giftOther": "уровень × 5",
      "rage": "текущее", "gnosis": "текущее × 2", "willpower": "текущее", "totem": "2 за точку"}

# Атрибуты и Способности в тексте справочника → ключи системы
TRAITS = {
    "Сила": "attributes.strength", "Ловкость": "attributes.dexterity", "Выносливость": "attributes.stamina", "Стойкость": "attributes.stamina",
    "Обаяние": "attributes.charisma", "Манипуляция": "attributes.manipulation", "Манипулирование": "attributes.manipulation",
    "Внешность": "attributes.appearance", "Восприятие": "attributes.perception", "Интеллект": "attributes.intelligence",
    "Сообразительность": "attributes.wits", "Смекалка": "attributes.wits",
    "Бдительность": "abilities.alertness", "Атлетика": "abilities.athletics", "Драка": "abilities.brawl", "Эмпатия": "abilities.empathy",
    "Выражение": "abilities.expression", "Запугивание": "abilities.intimidation", "Лидерство": "abilities.leadership",
    "Знание улиц": "abilities.streetwise", "Хитрость": "abilities.subterfuge", "Первобытный инстинкт": "abilities.primalUrge",
    "Обращение с животными": "abilities.animalKen", "Ремесло": "abilities.crafts", "Вождение": "abilities.drive", "Этикет": "abilities.etiquette",
    "Огнестрел": "abilities.firearms", "Воровство": "abilities.larceny", "Фехтование": "abilities.melee", "Исполнение": "abilities.performance",
    "Скрытность": "abilities.stealth", "Выживание": "abilities.survival", "Академические знания": "abilities.academics",
    "Компьютеры": "abilities.computer", "Загадки": "abilities.enigmas", "Расследование": "abilities.investigation", "Право": "abilities.law",
    "Медицина": "abilities.medicine", "Оккультизм": "abilities.occult", "Ритуалы": "abilities.rituals", "Наука": "abilities.science",
    "Ярость": "werewolf.rage", "Гнозис": "werewolf.gnosis",
}

NAME = re.compile(r"^- \*\*(.+?) \(([^()]+(?:\([^()]*\)[^()]*)?)\)\*\*\s*(?:—|–|-)?\s*(.*)$")
POOL = re.compile(r"\*\*([А-ЯЁ][А-Яа-яЁё ]+?)\s*\+\s*([А-ЯЁ][А-Яа-яЁё ]+?)\*\*(?:\s*\((?:сл\.|сложность)\s*(\d+)\))?")
COST = re.compile(r"\*\*(\d+)\s+(Ярост[ьи]|Гнозис[а]?|Вол[ьяи])")
HEAD2 = re.compile(r"^##\s+(.+?)\s*\(([^()]+)\)")
LEVEL = re.compile(r"^###\s+Уровень\s+(\d+)")


def read(name):
    with open(os.path.join(REF, name), encoding="utf-8") as f:
        return f.read()


def md_inline(s):
    s = html.escape(s, quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)", r"<em>\1</em>", s)
    return s


def entries(lines):
    """Записи «- **Русское (English)** — текст» с продолжениями до следующей записи или заголовка."""
    cur = None
    for raw in lines:
        line = raw.rstrip("\n")
        m = NAME.match(line)
        if m:
            if cur:
                yield cur
            cur = {"name": m.group(1).strip(), "en": m.group(2).strip(), "body": [m.group(3).strip()]}
        elif line.startswith("#"):
            if cur:
                yield cur
            cur = None
            yield {"head": line}
        elif cur and line.strip():
            cur["body"].append(line.strip().lstrip("- ").strip())
    if cur:
        yield cur


def roll_of(text):
    m = POOL.search(text)
    if not m:
        return None
    t1, t2 = TRAITS.get(m.group(1).strip()), TRAITS.get(m.group(2).strip())
    if not (t1 and t2):
        return None
    return {"trait1": t1, "trait2": t2, "difficulty": int(m.group(3)) if m.group(3) else 6, "byTarget": not m.group(3)}


def cost_of(text):
    out = {}
    for n, what in COST.findall(text):
        k = "rage" if what.startswith("Ярост") else "gnosis" if what.startswith("Гнозис") else "willpower"
        out.setdefault(k, int(n))
    return out


def group_of(en):
    for table, kind in ((BREEDS, "breed"), (AUSPICES, "auspice"), (TRIBES, "tribe")):
        for k, v in table.items():
            if en.startswith(k):
                return {"kind": kind, "key": v}
    if "Ronin" in en or "изго" in en.lower():
        return {"kind": "ronin", "key": "ronin"}
    return {"kind": "other", "key": en}


def parse_gifts():
    gifts = {}
    for name in ("03_Дары_пород.md", "04_Дары_аугурий.md", "05_Дары_племён_1.md", "06_Дары_племён_2.md"):
        group, level = None, 0
        for e in entries(read(name).splitlines(True)):
            if "head" in e:
                h2, lv = HEAD2.match(e["head"]), LEVEL.match(e["head"])
                if h2:
                    group, level = group_of(h2.group(2)), 0
                elif e["head"].startswith("## "):
                    group, level = None, 0
                if lv:
                    level = int(lv.group(1))
                continue
            if not group or not level:
                continue
            body = " ".join(e["body"])
            teacher, _, mech = body.partition(". ")
            key = re.sub(r"[^a-z0-9]+", "-", e["en"].lower()).strip("-")
            g = gifts.get(key)
            if g:
                if group not in g["groups"]:
                    g["groups"].append(group)
                # «как у …»: у дубля механики может не быть — берём полную запись
                if len(body) > len(g["_body"]):
                    g.update(text=f"<p>{md_inline(body)}</p>", roll=roll_of(body), cost=cost_of(body), _body=body)
                continue
            gifts[key] = {"key": key, "name": e["name"], "en": e["en"], "level": level, "groups": [group],
                          "teacher": teacher.strip() if len(teacher) < 120 else "", "roll": roll_of(body), "cost": cost_of(body),
                          "text": f"<p>{md_inline(body)}</p>", "source": BOOK, "_body": body}
    # Дары изгоев (W20, гл. 4): вложенный список «  - **Русское (English)** — ур. N, кто учит. …» под ронинами и Танцорами Кожи
    text = read("06_Дары_племён_2.md")
    group = None
    for line in text[text.find("(Gifts of the Outsiders)"):].splitlines():
        if line.startswith("- **"):
            group = {"kind": "outsider", "key": "skinDancers" if "Skin Dancers" in line else "ronin"}
            continue
        m = re.match(r"^\s+- \*\*(.+?) \(([^()]+)\)\*\*\s*(?:—|–|-)\s*ур\.\s*(\d+),?\s*(.*)$", line)
        if not (m and group):
            continue
        body = m.group(4).strip()
        teacher = body.split(".")[0].strip()
        key = re.sub(r"[^a-z0-9]+", "-", m.group(2).lower()).strip("-")
        if key in gifts:
            if group not in gifts[key]["groups"]:
                gifts[key]["groups"].append(group)
            continue
        gifts[key] = {"key": key, "name": m.group(1).strip(), "en": m.group(2).strip(), "level": int(m.group(3)), "groups": [group],
                      "teacher": teacher if len(teacher) < 120 else "", "roll": roll_of(body), "cost": cost_of(body),
                      "text": f"<p>{md_inline(body)}</p>", "source": BOOK, "_body": body}
    out = sorted(gifts.values(), key=lambda g: (g["level"], g["name"]))
    for g in out:
        g.pop("_body", None)
        g["img"] = IMG["gift"].get(g["groups"][0]["kind"], IMG["gift"]["tribe"])
    return out


RITE_KIND = {"Rites of Accord": "accord", "Caern Rites": "caern", "Rites of Death": "death", "Mystic Rites": "mystic",
             "Punishment Rites": "punishment", "Rites of Renown": "renown", "Seasonal Rites": "seasonal", "Minor Rites": "minor"}


def parse_rites():
    out, kind, kind_name = [], None, ""
    for e in entries(read("07_Ритуалы.md").splitlines(True)):
        if "head" in e:
            h2 = HEAD2.match(e["head"])
            if h2 and h2.group(2) in RITE_KIND:
                kind, kind_name = RITE_KIND[h2.group(2)], h2.group(1)
            elif e["head"].startswith("## "):
                kind = None
            continue
        if not kind:
            continue
        body = " ".join(e["body"])
        m = re.match(r"(?:ур\.|уровень)\s*(\d+)", body)
        level = int(m.group(1)) if m else 0
        g = re.search(r"Гнозис\s*(\d+)", body[:40])
        out.append({"key": re.sub(r"[^a-z0-9]+", "-", e["en"].lower()).strip("-"), "name": e["name"], "en": e["en"], "kind": kind,
                    "kindName": kind_name, "level": level, "gnosis": int(g.group(1)) if g else 0, "roll": roll_of(body),
                    "text": f"<p>{md_inline(body)}</p>", "img": IMG["rite"], "source": BOOK})
    return out


def table_rows(text, title):
    """Строки таблицы под заголовком «## … (title)»: список ячеек."""
    i = text.find(f"({title})")
    rows = []
    for line in text[i:].splitlines()[1:]:
        if line.startswith("## ") or line.startswith("### "):
            break
        if line.startswith("| **"):
            rows.append([c.strip() for c in line.strip().strip("|").split("|")])
    return rows


def split_names(cell):
    cell = re.sub(r"\([^()]*\)", "", re.sub(r"\*\*", "", cell))      # пояснения в скобках — не названия
    return [x.strip(" .") for x in re.split(r",\s*", cell) if x.strip(" .")]


def ru_en(cell):
    m = re.match(r"\*\*(.+?)\s*\((.+?)\)\*\*\s*(.*)", cell)
    return (m.group(1), m.group(2), m.group(3).strip(" —–")) if m else (re.sub(r"\*\*", "", cell), "", "")


def first_int(cell):
    m = re.search(r"\d+", cell)
    return int(m.group()) if m else 0


def parse_core(gifts):
    text = read("01_Создание_персонажа_породы_аугурии_племена.md")
    by_ru = {g["name"].lower(): g["key"] for g in gifts}

    def gift_keys(cell):
        return [by_ru[n.lower()] for n in split_names(cell) if n.lower() in by_ru]

    breeds = []
    for c in table_rows(text, "Breeds"):
        ru, en, nick = ru_en(c[0])
        breeds.append({"key": BREEDS.get(en, en.lower()), "name": ru, "en": en, "nick": nick.strip("«» "), "gnosis": first_int(c[1]),
                       "startGifts": gift_keys(c[2]), "notes": md_inline(c[3]) if len(c) > 3 else ""})
    auspices = []
    for c in table_rows(text, "Auspices"):
        ru, en, _ = ru_en(c[0])
        key = AUSPICES.get(en, en.lower())
        auspices.append({"key": key, "name": ru, "en": en, "role": re.sub(r"\*\*", "", c[1]), "rage": first_int(c[2]),
                         "renown": START_RENOWN.get(key), "renownText": re.sub(r"\*\*", "", c[3]), "startGifts": gift_keys(c[4])})
    tribes = []
    for c in table_rows(text, "Tribes"):
        ru, en, _ = ru_en(c[0])
        tribes.append({"key": TRIBES.get(en, en.lower()), "name": ru, "en": en, "willpower": first_int(c[1]), "totem": re.sub(r"\*\*", "", c[2]),
                       "backgrounds": md_inline(c[3]), "startGifts": gift_keys(c[4])})
    return breeds, auspices, tribes


# Главы справочника → книги компендия «Оборотни — правила» (data/werewolf-rules.json): «## » — страница.
RULE_CHAPTERS = ["01_Создание_персонажа_породы_аугурии_племена.md", "09_Слава_Ранг_Ярость_Гнозис_Воля_опыт.md",
                 "10_Правила_и_бой.md", "08_Фетиши_и_талены.md", "11_Умбра_и_духи.md", "12_Союзники_тотемы.md", "13_Враги.md"]
RULE_NAMES = {"01": "Создание персонажа", "09": "Слава, Ранг, Ярость, Гнозис", "10": "Правила и бой", "08": "Фетиши и талены",
              "11": "Умбра и духи", "12": "Союзники и тотемы", "13": "Враги Гайи"}
RULES_OUT = os.path.join(os.path.dirname(OUT), "werewolf-rules.json")


def md_html(lines):
    """Небольшой Markdown → HTML: заголовки ###/####, списки (два уровня), нумерованные, таблицы, цитаты, абзацы."""
    out, para, i = [], [], 0
    lists = []                                   # стек открытых списков: (отступ, тег)

    def flush():
        if para:
            out.append(f"<p>{md_inline(' '.join(para))}</p>")
            para.clear()

    def close(to=-1):
        while lists and lists[-1][0] > to:
            out.append(f"</li></{lists.pop()[1]}>")

    while i < len(lines):
        line = lines[i].rstrip()
        m = re.match(r"^(\s*)([-*]|\d+[.)])\s+(.*)", line)
        if not line.strip():
            flush(); i += 1; continue
        if line.startswith("|"):
            flush(); close()
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells):
                    rows.append(cells)
                i += 1
            if rows:
                head = "".join(f"<th>{md_inline(c)}</th>" for c in rows[0])
                body = "".join("<tr>" + "".join(f"<td>{md_inline(c)}</td>" for c in r) + "</tr>" for r in rows[1:])
                out.append(f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>")
            continue
        if m:
            flush()
            ind, tag = len(m.group(1)), ("ol" if m.group(2)[0].isdigit() else "ul")
            if lists and ind > lists[-1][0]:
                lists.append((ind, tag)); out.append(f"<{tag}><li>")
            else:
                close(ind)
                if lists and lists[-1][0] == ind and lists[-1][1] == tag:
                    out.append("</li><li>")
                else:
                    if lists and lists[-1][0] == ind:
                        out.append(f"</li></{lists.pop()[1]}>")
                    lists.append((ind, tag)); out.append(f"<{tag}><li>")
            out.append(md_inline(m.group(3)))
            i += 1; continue
        if lists and line.startswith(" "):           # продолжение пункта
            out.append(" " + md_inline(line.strip())); i += 1; continue
        close()
        h = re.match(r"^(#{3,6})\s+(.*)", line)
        if h:
            flush(); lvl = min(len(h.group(1)), 4)
            out.append(f"<h{lvl}>{md_inline(h.group(2))}</h{lvl}>")
        elif line.startswith(">"):
            flush(); out.append(f"<blockquote><p>{md_inline(line.lstrip('> '))}</p></blockquote>")
        elif re.fullmatch(r"-{3,}|\*{3,}", line.strip()):
            flush()
        else:
            para.append(line.strip())
        i += 1
    flush(); close()
    return "".join(out)


def parse_rules():
    books = []
    for fn in RULE_CHAPTERS:
        text = read(fn)
        if text.startswith("---"):
            text = text.split("---", 2)[2]
        title, pages, cur, lead = fn, [], None, []
        for line in text.splitlines():
            if line.startswith("# "):
                title = line[2:].strip()
            elif line.startswith("## "):
                if cur:
                    pages.append(cur)
                cur = {"name": line[3:].strip(), "lines": lead + [""] if not pages and lead else []}
                lead = []
            elif cur is None:
                lead.append(line)
            else:
                cur["lines"].append(line)
        if cur:
            pages.append(cur)
        title = RULE_NAMES.get(fn[:2], title)
        books.append({"key": fn[:2], "name": title,
                      "pages": [{"name": re.sub(r"^\d+\.\s*", "", p["name"]), "html": md_html(p["lines"])} for p in pages if any(x.strip() for x in p["lines"])]})
    return books


# Достоинства и недостатки (14) и Факты биографии (02) W20 — линия «werewolf»: видны только Гару (VTM20.traitFor).
TRAIT_CAT = {"Физические": "physical", "Умственные": "mental", "Социальные": "social", "Сверхъестественные": "supernatural"}
TRAIT_EN = {"Физически впечатляющий": "Physically Impressive", "Монохромное зрение": "Monochrome Vision",
            "Нет частичного превращения": "No Partial Transformation", "Одна рука": "One Arm",
            "Склонность к компьютерам": "Computer Aptitude", "Опытный водитель": "Expert Driver",
            "Молниеносный счёт": "Lightning Calculator", "Чувство времени": "Time Sense", "Эйдетическая память": "Eidetic Memory",
            "Внутренняя сила": "Inner Strength", "Прирождённый лингвист": "Natural Linguist", "Спокойное сердце": "Calm Heart",
            "Амнезия": "Amnesia", "Стайное мышление": "Pack Mentality", "Прирождённый лидер": "Natural Leader",
            "Сверхъестественный спутник": "Supernatural Companion", "Метка хищника": "Mark of the Predator",
            "Механический склад": "Mechanical Aptitude", "Кодекс чести": "Code of Honor", "Железная воля": "Iron Will",
            "Дефект речи": "Speech Impediment", "Любопытство": "Curiosity", "Иммунитет к эманациям Червя": "Immune to Wyrm Emanations"}
SRC_W20 = "Werewolf: The Apocalypse 20th Anniversary Edition"


def name_en(cell):
    cell = re.sub(r"\*\*", "", cell).strip()
    m = re.match(r"^(.*?)\s*\(([^()]*[A-Za-z][^()]*)\)$", cell)
    return (m.group(1).strip(), m.group(2).strip()) if m else (cell, TRAIT_EN.get(cell, ""))


def parse_merits():
    out, kind, cat = [], None, None
    for line in read("14_Достоинства_и_недостатки.md").splitlines():
        h = re.match(r"^## (\S+) (достоинства|недостатки)$", line)
        if line.startswith("## "):
            kind, cat = (("merit" if h.group(2) == "достоинства" else "flaw"), TRAIT_CAT.get(h.group(1))) if h else (None, None)
            continue
        if not (kind and cat and line.startswith("| ")):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) != 3 or cells[0] == "Название" or set(cells[1]) <= set("-: "):
            continue
        name, en = name_en(cells[0])
        nums = [int(x) for x in re.findall(r"\d+", cells[1])]
        out.append({"kind": kind, "category": cat, "name": name, "en": en, "cost": cells[1].replace("–", "–"),
                    "min": min(nums), "max": max(nums), "clan": "", "sect": "", "era": "", "source": SRC_W20,
                    "line": "werewolf", "html": f"<p>{md_inline(cells[2])}</p>"})
    return out


def parse_backgrounds():
    text = read("02_Факты_биографии.md")
    lines = text.splitlines()
    totem = []
    if "## Тотем (подробно)" in lines:
        i = lines.index("## Тотем (подробно)") + 1
        while i < len(lines) and not lines[i].startswith("## "):
            totem.append(lines[i]); i += 1
    out = []
    for line in lines:
        if not line.startswith("| **"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        name, en = name_en(cells[0])
        levels = [(i + 1, c) for i, c in enumerate(cells[2:7]) if c and not c.startswith("см. ")]
        rows = "".join(f"<tr><td>{'•' * n}</td><td>{md_inline(c)}</td></tr>" for n, c in levels)
        html_ = f"<p>{md_inline(cells[1])}</p>" + (f"<table><tbody>{rows}</tbody></table>" if rows else "")
        if en == "Totem":
            html_ += md_html(totem)
        out.append({"name": name, "en": en, "sabbat": False, "source": SRC_W20, "line": "werewolf", "html": html_})
    return out


def parse_fetishes():
    """Фетиши (уровень, Гнозис) и талены (Гнозис) — «- **Русское (English)** — ур. N, Гнозис G. текст»."""
    out, kind = [], None
    for line in read("08_Фетиши_и_талены.md").splitlines():
        if line.startswith("## Фетиши"): kind = "fetish"
        elif line.startswith("## Талены"): kind = "talen"
        m = re.match(r"^- \*\*(.+?)\s*\(([^()]+)\)\*\*\s*—\s*(?:ур\.\s*(\d+),\s*)?Гнозис\s*(\d+)\.\s*(.*)$", line)
        if not (m and kind):
            continue
        name, en, lvl, gn, text = m.groups()
        key = re.sub(r"[^a-z0-9]+", "-", en.lower()).strip("-")
        out.append({"key": key, "kind": kind, "name": name.strip(), "en": en.strip(), "level": int(lvl or 0), "gnosis": int(gn), "text": f"<p>{md_inline(text)}</p>"})
    return out


# Книги-дополнения W20 (справочник: _справочник/W20_*) → компендий «Оборотень — книги» (data/werewolf-books.json):
# книга — папка компендия, файл — запись журнала, «## » — страница.
BOOKS = [("W20_Book_of_the_Wyrm", "Книга Червя"), ("W20_Changing_Breeds", "Меняющие облик (Фера)"), ("W20_Changing_Ways", "Пути перемен"),
         ("W20_Kinfolk", "Родня"), ("W20_Umbra", "Умбра: Бархатная тень"), ("W20_Rage_Across_the_World", "Ярость по всему миру"),
         ("W20_White_Howlers", "Белые Выли"), ("W20_Shattered_Dreams", "Разбитые сны"), ("W20_Skinner", "Скиннер")]
BOOKS_OUT = os.path.join(os.path.dirname(OUT), "werewolf-books.json")


def split_md(text):
    """Заголовок «# …» и страницы по «## …» (вступление до первой — в первую страницу)."""
    if text.startswith("---"):
        text = text.split("---", 2)[2]
    title, pages, cur, lead = "", [], None, []
    for line in text.splitlines():
        if line.startswith("# ") and not title:
            title = line[2:].strip()
        elif line.startswith("## "):
            if cur:
                pages.append(cur)
            cur = {"name": re.sub(r"^\d+\.\s*", "", line[3:].strip()), "lines": (lead + [""]) if not pages and lead else []}
            lead = []
        elif cur is None:
            lead.append(line)
        else:
            cur["lines"].append(line)
    if cur:
        pages.append(cur)
    if not pages and any(x.strip() for x in lead):
        pages = [{"name": title or "—", "lines": lead}]
    return title, [{"name": p["name"][:120], "html": md_html(p["lines"])} for p in pages if any(x.strip() for x in p["lines"])]


def parse_books():
    base = os.path.dirname(REF)
    out = []
    for folder, label in BOOKS:
        d = os.path.join(base, folder)
        if not os.path.isdir(d):
            continue
        for fn in sorted(f for f in os.listdir(d) if f.endswith(".md")):
            with open(os.path.join(d, fn), encoding="utf-8") as f:
                title, pages = split_md(f.read())
            if not pages:
                continue
            title = re.sub(r"\s+—\s+W20\b.*$", "", title) or fn[:-3].replace("_", " ")
            out.append({"key": f"{folder}:{fn[:2]}", "book": label, "name": title, "pages": pages})
    return out


def parse_charms():
    """Чары духов: общие (у всех духов) и особые — «- **Русское (English)** — текст»."""
    text = read("11_Умбра_и_духи.md")
    part = text.split("## 8.", 1)[1].split("\n## ", 1)[0]
    out, general = [], True
    for line in part.splitlines():
        if line.startswith("**Специальные"):
            general = False
        m = re.match(r"^- \*\*(.+?)\s*\(([^()]+)\)\*\*\s*—\s*(.*)$", line)
        if m:
            name, en, body = m.groups()
            out.append({"key": re.sub(r"[^a-z0-9]+", "-", en.lower()).strip("-"), "name": name.strip(), "en": en.strip(), "general": general,
                        "text": f"<p>{md_inline(body)}</p>"})
    return out


def build():
    gifts = parse_gifts()
    rites = parse_rites()
    breeds, auspices, tribes = parse_core(gifts)
    for kind, items in (("breed", breeds), ("auspice", auspices), ("tribe", tribes), ("form", FORMS)):
        for x in items:
            x["icon"] = ICONS[kind].get(x["key"], "fa-moon")
    data = {"source": "Werewolf: The Apocalypse 20th Anniversary Edition", "breeds": breeds, "auspices": auspices, "tribes": tribes,
            "forms": FORMS, "gifts": gifts, "rites": rites, "rankNames": RANK_NAMES, "rank": RANK, "xp": XP,
            "merits": parse_merits(), "backgrounds": parse_backgrounds(), "fetishes": parse_fetishes(), "charms": parse_charms()}
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    rules = parse_rules()
    books = parse_books()
    with open(BOOKS_OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(books, f, ensure_ascii=False, indent=1)
    with open(RULES_OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(rules, f, ensure_ascii=False, indent=1)
    starts = sum(len(x["startGifts"]) for x in breeds + auspices + tribes)
    return {"breeds": len(breeds), "auspices": len(auspices), "tribes": len(tribes), "gifts": len(gifts), "rites": len(rites),
            "startGifts": starts, "rolls": sum(1 for g in gifts if g["roll"]),
            "rulePages": sum(len(b["pages"]) for b in rules), "merits": len(data["merits"]), "backgrounds": len(data["backgrounds"]), "fetishes": len(data["fetishes"]), "charms": len(data["charms"]), "books": len(books), "bookPages": sum(len(b["pages"]) for b in books)}


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    print(build())
