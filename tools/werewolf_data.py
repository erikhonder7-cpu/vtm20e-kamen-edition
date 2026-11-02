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
    "Обаяние": "attributes.charisma", "Харизма": "attributes.charisma", "Манипуляция": "attributes.manipulation", "Манипулирование": "attributes.manipulation",
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
        if not line.startswith("- **"):
            continue
        # «- **Разбить стекло** — Гнозис сл. 6. **Замыкание (Short Out)** — Гнозис сл. 6.» — две Чары в одной строке
        for seg in re.split(r"(?<=\.)\s+(?=\*\*[^*]+\*\*\s*—)", line[2:]):
            m = re.match(r"^\*\*(.+?)(?:\s*\(([^()]+)\))?\*\*\s*—\s*(.*)$", seg)
            if not m:
                continue
            name, en, body = m.group(1).strip(), (m.group(2) or "").strip(), m.group(3)
            out.append({"key": slug(en) if en else CHARM_KEYS.get(name, name), "name": name, "en": en, "general": general,
                        "text": f"<p>{md_inline(body)}</p>"})
    return out


# Чары без английского названия в справочнике (гл. 11) — ключи по W20
CHARM_KEYS = {"Управление электрическими системами": "control-electrical-systems", "Создание огня": "create-fire", "Создание ветра": "create-wind",
              "Открытие лунного моста": "open-moon-bridge", "Разбить стекло": "shatter-glass"}
# Как те же Чары зовутся в бестиариях дополнений → ключ Чары основной книги
CHARM_ALIAS = {"Подглядывание": "peek", "Тлетворное касание": "blighted-touch", "Порча": "corruption", "Подстрекательство к бешенству": "incite-frenzy",
               "Выстрел": "blast", "Броня": "armor", "Очищение скверны": "cleanse-the-blight", "Открыть лунный мост": "open-moon-bridge",
               "Уплотнить реальность": "solidify-reality", "Короткое замыкание": "short-out", "Управление электросистемами": "control-electrical-systems",
               "Управление электрикой": "control-electrical-systems", "Создать ветер": "create-wind", "Создать огонь": "create-fire",
               "Чувство воздушных путей": "airt-sense", "Чувство царства": "realm-sense", "Восстановление": "re-form", "Incite Rage": "incite-frenzy",
               "Сломать реальность": "break-reality", "Наводнение": "flood", "Помехи духам": "spirit-static", "Domain Sense": "realm-sense",
               "Control Electrical Systems": "control-electrical-systems", "Shatter Glass": "shatter-glass"}
SPIRIT_KINDS = [("Бейн", "bane"), ("Геи", "gaia"), ("Ткачих", "weaver"), ("Дикост", "wyld"), ("фетч", "fetch")]
SPIRIT_RANK = {"Гаффлинг": "gaffling", "Джагглинг": "jaggling", "Джаглинг": "jaggling", "Инкарна": "incarna"}
SPIRIT_STAT = re.compile(r"(Ярость|Яр\.?|Гнозис|Гн\.?|Воля|Вол\.?|Эссенция|Эсс\.?|Сущность)\s+(\d+)")
STAT_KEY = {"Я": "rage", "Г": "gnosis", "В": "willpower", "Э": "essence", "С": "essence"}


def parse_spirit_templates(charms):
    """Образцы духов для существа-духа: бестиарии основной книги (гл. 13), Умбры (гл. 3), Книги Червя (гл. 3), кин-фетчи Родни.
    Чары — ключами общего списка (по русскому/английскому названию или CHARM_ALIAS); особые — «~образец:Название» с текстом в specials."""
    by_name = {}
    for c in charms:
        by_name[c["name"].lower()] = c["key"]
        if c["en"]:
            by_name[c["en"].lower()] = c["key"]
    for k, v in CHARM_ALIAS.items():
        by_name[k.lower()] = v
    base = os.path.dirname(REF)
    out = []

    def add(name, en, kind, stats, rank, raw_charms, text, specials, source):
        key = f"{kind}-{slug(en) or name}"
        if any(t["key"] == key for t in out):
            return
        r, g, w = stats.get("rage", 0), stats.get("gnosis", 0), stats.get("willpower", 0)
        # специальные Чары: {русское: {"en", "text"}}; сопоставление с общим списком — в конце (resolve), когда подписаны все строки
        # foot — сноски главы (только для поиска текста), specials — свои особые Чары образца (строками ниже него)
        out.append({"key": key, "name": name, "en": en, "kind": kind, "rank": rank or ("jaggling" if r + g + w > 18 else "gaffling"),
                    "rage": r, "gnosis": g, "willpower": w, "essence": stats.get("essence", r + g + w), "raw": list(raw_charms),
                    "foot": specials, "specials": {}, "text": text, "source": source})

    def clean(c):
        """«Материализация (стоимость 26» → «Материализация»; «Окаменение.» → «Окаменение»; «2–3 Чары», «Ловк. 3» — не Чары."""
        c = re.split(r"\s*[(;]", c.strip())[0].strip().strip("*\\«»").strip().rstrip(".").strip()
        return c if c and c[0].isupper() and not re.search(r"\d", c) and len(c) <= 40 else ""

    def resolve(t):
        keys, sp, look = [], {}, {**t["foot"], **t["specials"]}
        by_en = {v["en"].lower(): n for n, v in look.items() if v.get("en")}
        for c in [clean(x) for x in t["raw"]] + list(t["specials"]):
            if not c:
                continue
            k = by_name.get(c.lower())
            if not k:
                n = c if c in look else by_en.get(c.lower(), c)
                if by_name.get((look.get(n, {}).get("en") or "").lower()):
                    k = by_name[look[n]["en"].lower()]      # особый вариант общей Чары (Касание порчи Нихилаха — Blighted Touch)
                else:
                    k = f"~{t['key']}:{n}"
                    sp[n] = look.get(n, {}).get("text", "")
            if k not in keys:
                keys.append(k)
        t["charms"], t["specials"] = keys, sp
        del t["raw"], t["foot"]

    def table(part, kind_hint, source, foot):
        cols, kind = [], kind_hint
        lines = part.splitlines()
        for i, line in enumerate(lines):
            h = re.match(r"^#+\s+(.+)$", line)
            if h:
                kind = next((k for w, k in SPIRIT_KINDS if w in h.group(1)), kind_hint); continue
            if not line.startswith("|") or set(line) <= set("|-: "):
                continue
            c = [x.strip() for x in line.strip().strip("|").split("|")]
            if i + 1 < len(lines) and set(lines[i + 1].strip()) <= set("|-: ") and lines[i + 1].strip():
                cols = c if c[0] == "Дух" else []      # шапка таблицы: не «Дух» — таблица не про духов (успехи Чары и т. п.)
                continue
            if not cols:
                continue
            row = dict(zip(cols, c))
            name, en = name_en(row.get("Дух", ""))
            stats = {}
            for col, v in row.items():
                k = {"Яр.": "rage", "Ярость": "rage", "Гн.": "gnosis", "Гнозис": "gnosis", "Воля": "willpower", "Эсс.": "essence", "Эссенция": "essence"}.get(col)
                if k and re.match(r"\d", v):
                    stats[k] = first_int(v)
            kd = "bane" if row.get("Ранг") == "Бейн" else kind
            add(name, en, kd, stats, SPIRIT_RANK.get(row.get("Ранг", "")), re.split(r",|;|\s\+\s", row.get("Чары", "")),
                md_inline(" · ".join(x for x in (row.get("Суть", ""), f"Чары: {row.get('Чары', '')}") if x)), dict(foot), source)

    def footnotes(part):
        out_f = {}
        for m in re.finditer(r"^(?:- )?(?:\\?\*)+\s*\*\*(.+?)(?:\s*\(([^()]+)\))?:\*\*\s*(.+)$", part, re.M):
            out_f[m.group(1).strip()] = {"en": (m.group(2) or "").strip(), "text": md_inline(m.group(3))}
        return out_f

    # Умбра, гл. 3: таблицы по видам, особые Чары — сносками «\* **Название (English):** …»
    p = os.path.join(base, "W20_Umbra")
    fn = next((f for f in sorted(os.listdir(p)) if f.startswith("03")), None) if os.path.isdir(p) else None
    if fn:
        part = open(os.path.join(p, fn), encoding="utf-8").read().split("## Бестиарий", 1)[1]
        table(part, "bane", "W20 Umbra", footnotes(part))
    # Родня, гл. 3: кин-фетчи
    p = os.path.join(base, "W20_Kinfolk")
    fn = next((f for f in sorted(os.listdir(p)) if f.startswith("03")), None) if os.path.isdir(p) else None
    if fn:
        part = open(os.path.join(p, fn), encoding="utf-8").read().split("## Кин-фетчи", 1)[1].split("\n## ", 1)[0]
        part = part.split("### Чары и статистика", 1)[1]
        foot = {}
        for m in re.finditer(r"^- \*\*(.+?) \(([^()]+)\):\*\*\s*(.+)$", part, re.M):
            foot[m.group(1).strip()] = {"en": m.group(2).strip(), "text": md_inline(m.group(3))}
        foot.update(footnotes(part))
        table(part, "fetch", "W20 Kinfolk", foot)
    # списки: «- **Название (English)** — Яр 8, Гн 6, Вол 8, Эсс 22–60; Чары…» (основная) и «— Ярость 9, … Чары: Airt Sense, …» (Книга Червя)
    for text, source, heads in ((read("13_Враги.md").split("## 3. Духи", 1)[1].split("\n## ", 1)[0], "W20", True),
                                (open(os.path.join(base, "W20_Book_of_the_Wyrm", next(f for f in sorted(os.listdir(os.path.join(base, "W20_Book_of_the_Wyrm"))) if f.startswith("03"))),
                                      encoding="utf-8").read().split("## Бейны", 1)[1].split("\n## ", 1)[0], "W20 Book of the Wyrm", False)):
        kind, cur = "bane", None
        for line in text.splitlines():
            h = re.match(r"^###\s+(.+)$", line)
            if h:
                kind = next((k for w, k in SPIRIT_KINDS if w in h.group(1)), kind); continue
            m = re.match(r"^\s*- \*\*(.+?)\*\*\s*—\s*(.+)$", line)
            if not m:
                continue
            indent = len(line) - len(line.lstrip())
            stats = {}
            for s in SPIRIT_STAT.finditer(m.group(2)[:90]):
                stats.setdefault(STAT_KEY[s.group(1)[0]], int(s.group(2)))
            al = re.match(r"^все (\d+)", m.group(2))          # «Создатели Мечты — все 10, Эсс 50–300»
            if al:
                stats.update({k: int(al.group(1)) for k in ("rage", "gnosis", "willpower") if k not in stats})
            if indent and cur and not ("rage" in stats and "gnosis" in stats):
                n, e = name_en(m.group(1))   # особая Чара образца строкой ниже
                cur["specials"][n] = {"en": e, "text": md_inline(m.group(2))}
                continue
            if not ("rage" in stats and "gnosis" in stats and "willpower" in stats):
                continue
            name, en = name_en(m.group(1))
            body = m.group(2)
            if "Чары:" in body:
                raw = body.split("Чары:", 1)[1].split(".")[0].split(",")
            else:
                tail = body.split(";", 1)[1] if ";" in body else ""
                raw = re.split(r",", re.split(r"\*\*", tail)[0]) + [b.rstrip(":") for b in re.findall(r"\*\*([^*]+?)\*\*", tail)]
                raw = [re.sub(r"\s*\([^)]*\).*$", "", x) for x in raw]
            add(name, en, kind, stats, None, raw, md_inline(body), {}, source)
            cur = out[-1] if out and out[-1]["name"] == name else None
    for t in out:
        resolve(t)
    return out


# Дары из книг-дополнений: (папка, файл-префикс, источник, группа по умолчанию — «чужие» списки, чтобы не стать своими у Гару племён)
SUPP_GIFTS = [("W20_Changing_Ways", "03", "W20 Changing Ways", None), ("W20_Rage_Across_the_World", "02", "W20 Rage Across the World", None),
              ("W20_White_Howlers", "01", "W20 White Howlers", {"kind": "outsider", "key": "whiteHowlers"}),
              ("W20_Book_of_the_Wyrm", "01", "W20 Book of the Wyrm", {"kind": "outsider", "key": "blackSpiralDancers"})]
RU_GROUPS = {}


def supp_group(name, data_lists):
    """Порода, аугурия или племя по русскому/английскому названию; иначе — чужой список с подписью."""
    n = name.strip().strip("*").strip()
    for kind, lst in data_lists:
        for x in lst:
            if n.lower().startswith(x["name"].lower()) or n.lower().startswith(x["en"].lower()):
                return {"kind": kind, "key": x["key"]}
    if n.lower().startswith("философ"):
        return {"kind": "auspice", "key": "philodox"}
    return None


def parse_supp_gifts(core, breeds, auspices, tribes):
    base = os.path.dirname(REF)
    lists = (("breed", breeds), ("auspice", auspices), ("tribe", tribes))
    taken = {g["key"] for g in core}
    out = []
    for folder, prefix, source, default in SUPP_GIFTS:
        d = os.path.join(base, folder)
        fn = next((f for f in sorted(os.listdir(d)) if f.startswith(prefix)), None) if os.path.isdir(d) else None
        if not fn:
            continue
        with open(os.path.join(d, fn), encoding="utf-8") as f:
            lines = f.read().splitlines()
        on, group, level = False, None, 0
        for line in lines:
            h = re.match(r"^(#{2,4})\s+(.*)$", line)
            if h:
                depth, title = len(h.group(1)), h.group(2)
                if depth == 2:
                    on = "Дар" in title
                    group, level = None, 0
                    continue
                if not on:
                    continue
                lv = re.match(r"Уровень\s+(\d+)", title)
                if lv:
                    level = int(lv.group(1)); continue
                g = supp_group(title, lists)
                if g: group, level = g, 0
                continue
            if not on:
                continue
            b = re.match(r"^\*\*([^*]+)\*\*\s*$", line)
            if b:
                g = supp_group(b.group(1), lists)
                if g: group = g
                continue
            m = NAME.match(line)
            if not m:
                continue
            name, en, rest = m.group(1).strip(), m.group(2).strip(), m.group(3).strip()
            lvl, grp = level, group
            inl = re.match(r"^([^,;.]+?),\s*ур\.\s*(\d+)[;,.]?\s*(.*)$", rest)
            inl2 = re.match(r"^ур\.\s*(\d+)[;,.]?\s*(.*)$", rest)
            if inl:
                g = supp_group(inl.group(1), lists)
                grp = g or {"kind": "outsider", "key": re.sub(r"[^a-z0-9]+", "", inl.group(1).lower()) or "other", "label": inl.group(1).strip()}
                lvl, rest = int(inl.group(2)), inl.group(3)
            elif inl2:
                lvl, rest = int(inl2.group(1)), inl2.group(2)
            if not lvl:
                continue
            grp = default or grp or {"kind": "outsider", "key": "other", "label": source}
            key = re.sub(r"[^a-z0-9]+", "-", en.lower()).strip("-")
            if key in taken:
                key = f"{folder.split('_', 1)[1].lower().replace('_', '-')}-{key}"
            taken.add(key)
            text = md_inline(rest)
            out.append({"key": key, "name": name, "en": en, "level": lvl, "groups": [grp], "teacher": "", "roll": roll_of(rest),
                        "cost": cost_of(rest), "text": f"<p>{text}</p>", "source": source})
    return out


def parse_kin_gifts(tribes):
    """Дары Родни: «- **Племя — Название (English).** текст» (W20 Kinfolk, все 1-го уровня)."""
    p = os.path.join(os.path.dirname(REF), "W20_Kinfolk")
    fn = next((f for f in sorted(os.listdir(p)) if f.startswith("01")), None) if os.path.isdir(p) else None
    if not fn:
        return []
    with open(os.path.join(p, fn), encoding="utf-8") as f:
        text = f.read()
    part = text.split("### Дары племён для Родни", 1)[1].split("\n## ", 1)[0] if "### Дары племён для Родни" in text else ""
    out = []
    for line in part.splitlines():
        m = re.match(r"^- \*\*(.+?)\s+—\s+(.+?)\s*\(([^()]+)\)\.?\*\*\s*(.*)$", line)
        if not m:
            continue
        tribe_ru, name, en, body = m.groups()
        tribe = next((t["key"] for t in tribes if t["name"].lower() == tribe_ru.strip().lower()), "")
        out.append({"key": "kin-" + re.sub(r"[^a-z0-9]+", "-", en.lower()).strip("-"), "tribe": tribe, "name": name.strip(), "en": en.strip(),
                    "level": 1, "roll": roll_of(body), "text": f"<p>{md_inline(body)}</p>"})
    return out


def parse_totems():
    """Тотемы стай: таблицы основной книги (гл. 12) и региональные тотемы W20 Rage Across the World."""
    out = []
    cat = ""
    for line in read("12_Союзники_тотемы.md").split("## 2.", 1)[0].splitlines():
        h = re.match(r"^### Тотемы (\S+)", line)
        if h:
            cat = h.group(1); continue
        if not line.startswith("| ") or line.startswith("| Тотем") or set(line) <= set("|-: "):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 5:
            continue
        name, en = name_en(cells[0])
        out.append({"key": re.sub(r"[^a-z0-9]+", "-", en.lower()).strip("-"), "name": name, "en": en, "cat": cat, "cost": first_int(cells[1]),
                    "individual": md_inline(cells[2]), "pack": md_inline(cells[3]), "ban": md_inline(cells[4]), "source": "W20"})
    p = os.path.join(os.path.dirname(REF), "W20_Rage_Across_the_World")
    fn = next((f for f in sorted(os.listdir(p)) if f.startswith("02")), None) if os.path.isdir(p) else None
    if fn:
        with open(os.path.join(p, fn), encoding="utf-8") as f:
            part = f.read().split("## Тотемы", 1)[1].split("\n## ", 1)[0]
        for line in part.splitlines():
            m = re.match(r"^\s*- \*\*(.+?)\s*\(([^()]+)\)[^*]*\*\*\s*—\s*цена\s*(\d+)\.\s*(.*)$", line)
            if not m:
                continue
            name, en, cost, body = m.groups()
            out.append({"key": re.sub(r"[^a-z0-9]+", "-", en.lower()).strip("-"), "name": name.strip(), "en": en.strip(), "cat": "Регион", "cost": int(cost),
                        "individual": "", "pack": "", "ban": "", "text": md_inline(body), "source": "W20 Rage Across the World"})
    return out


def parse_renown_awards():
    """Таблица примерных наград Славы (гл. 9): раздел, поступок, варианты [Слава, Честь, Мудрость]."""
    text = read("09_Слава_Ранг_Ярость_Гнозис_Воля_опыт.md")
    part = text.split("### Таблица примерных наград", 1)[1].split("\n## ", 1)[0]
    out, sec = [], ""
    num = lambda c: [int(x.replace("−", "-")) for x in re.findall(r"[-−]?\d+", c)] or [0]
    for line in part.splitlines():
        if not line.startswith("| ") or set(line) <= set("|-: "):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if cells[0].startswith("**") and not any(cells[1:]):
            sec = cells[0].strip("*").strip(); continue
        if len(cells) < 4 or cells[0] == "Поступок":
            continue
        g, h, w = num(cells[1]), num(cells[2]), num(cells[3])
        n = max(len(g), len(h), len(w))
        pick = lambda v, i: v[i] if i < len(v) else (v[0] if len(v) == 1 else 0)
        out.append({"sec": sec, "text": md_inline(cells[0]), "yearly": "год" in "".join(cells[1:]),
                    "v": [[pick(g, i), pick(h, i), pick(w, i)] for i in range(n)]})
    return out


def parse_scars():
    """Боевые шрамы (гл. 10, раздел 3): название, эффект, временная Слава."""
    part = read("10_Правила_и_бой.md").split("## 3. Боевые шрамы", 1)[1].split("\n## ", 1)[0]
    out = []
    for line in part.splitlines():
        if not line.startswith("| ") or line.startswith("| Шрам") or set(line) <= set("|-: "):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 3:
            continue
        name, en = name_en(cells[0])
        out.append({"key": f"scar-{len(out) + 1}", "name": name, "en": en, "effect": md_inline(cells[1]), "glory": first_int(cells[2])})
    return out


def parse_sept():
    """Септ (W20 Rage Across the World, гл. 1): ступени Положения, должности; типы каэрнов — основная книга, гл. 11."""
    p = os.path.join(os.path.dirname(REF), "W20_Rage_Across_the_World")
    fn = next((f for f in sorted(os.listdir(p)) if f.startswith("01")), None) if os.path.isdir(p) else None
    standing, positions = [], []
    if fn:
        with open(os.path.join(p, fn), encoding="utf-8") as f:
            text = f.read()
        st = text.split("## Положение в септе", 1)[1].split("\n## ", 1)[0]
        for line in st.splitlines():
            c = [x.strip() for x in line.strip().strip("|").split("|")]
            if line.startswith("| ") and len(c) == 3 and "•" in c[0]:
                name, en = name_en(c[1])
                standing.append({"n": c[0].count("•"), "name": name, "en": en, "text": md_inline(c[2])})
        ps = text.split("## Должности септа", 1)[1].split("\n## ", 1)[0]
        for line in ps.splitlines():
            c = [x.strip() for x in line.strip().strip("|").split("|")]
            if not line.startswith("| ") or len(c) < 3 or "•" not in c[1]:
                continue
            head, duty = (c[0].split(" — ", 1) + [""])[:2]
            name, en = name_en(head)
            positions.append({"key": re.sub(r"[^a-z0-9]+", "-", en.lower()).strip("-") or f"pos-{len(positions)}", "name": name, "en": en,
                              "duty": md_inline(duty), "need": c[1].count("•"), "bonus": md_inline(c[2])})
    caerns = []
    part = read("11_Умбра_и_духи.md").split("## 2. Каэрны", 1)[1].split("\n## ", 1)[0]
    for line in part.splitlines():
        c = [x.strip() for x in line.strip().strip("|").split("|")]
        if not line.startswith("| ") or len(c) != 3 or c[0].startswith("Тип") or set(line) <= set("|-: "):
            continue
        name, en = name_en(c[0])
        caerns.append({"key": re.sub(r"[^a-z0-9]+", "-", (en or name).lower()).strip("-") or f"c{len(caerns)}", "name": name, "en": en, "gives": md_inline(c[1]), "spirits": md_inline(c[2])})
    return {"standing": standing, "positions": positions, "caerns": caerns}


def parse_umbra():
    """Места Умбры (W20 Umbra): Царства Ближней Умбры, родины племён, Мембрана, Астральная, Тёмная и Глубокая Умбра; лунные тропы по фазам."""
    base = os.path.join(os.path.dirname(REF), "W20_Umbra")
    if not os.path.isdir(base):
        return {"realms": [], "paths": {}}
    files = sorted(f for f in os.listdir(base) if f.endswith(".md"))
    def load(prefix):
        fn = next((f for f in files if f.startswith(prefix)), None)
        return open(os.path.join(base, fn), encoding="utf-8").read() if fn else ""
    t1, t2 = load("01"), load("02")
    realms = []
    def sub_entries(text, group, head="### "):
        cur = None
        for line in text.splitlines():
            if line.startswith(head):
                if cur: realms.append(cur)
                name, en = name_en(line[len(head):].strip())
                cur = {"key": re.sub(r"[^a-z0-9]+", "-", (en or name).lower()).strip("-") or f"r{len(realms)}", "name": name, "en": en, "group": group, "lines": []}
            elif cur is not None:
                cur["lines"].append(line)
        if cur: realms.append(cur)
    if "## Царства Ближней Умбры" in t1:
        sub_entries(t1.split("## Царства Ближней Умбры", 1)[1].split("\n## ", 1)[0], "near")
    for sec, group in (("## Родины племён", "homeland"),):
        if sec in t2:
            part = t2.split(sec, 1)[1].split("\n## ", 1)[0]
            rows = [[c.strip() for c in l.strip().strip("|").split("|")] for l in part.splitlines() if l.startswith("| ") and not l.startswith("| Родина") and not set(l) <= set("|-: ")]
            intro = part.split("Краткая справка", 1)[0].splitlines()
            for c in rows:
                if len(c) >= 2:
                    name, en = name_en(c[0])
                    realms.append({"key": "home-" + (re.sub(r"[^a-z0-9]+", "-", (en or name).lower()).strip("-") or str(len(realms))), "name": name, "en": en, "group": group,
                                   "lines": [c[1], ""] + intro})
            if "### " in part: sub_entries(part, group)
            elif not rows:
                for line in part.splitlines():
                    m = re.match(r"^- \*\*(.+?)\*\*\s*[—:-]\s*(.*)$", line)
                    if m:
                        name, en = name_en(m.group(1))
                        realms.append({"key": "home-" + (re.sub(r"[^a-z0-9]+", "-", en.lower()).strip("-") or str(len(realms))), "name": name, "en": en, "group": group, "lines": [m.group(2)]})
    for sec, group in (("## Мембрана и Якорные головы", "membrane"), ("## Астральная Умбра", "astral"), ("## Тёмная Умбра", "dark"), ("## Глубокая Умбра", "deep")):
        if sec in t2:
            body = t2.split(sec, 1)[1].split("\n## ", 1)[0]
            realms.append({"key": group, "name": sec[3:].strip(), "en": "", "group": group, "lines": body.splitlines()})
    if "## Пенумбра" in t1:
        realms.insert(0, {"key": "penumbra", "name": "Пенумбра", "en": "Penumbra", "group": "penumbra", "lines": t1.split("## Пенумбра", 1)[1].split("\n## ", 1)[0].splitlines()[1:]})
    out = [{k: v for k, v in r.items() if k != "lines"} | {"html": md_html(r["lines"])} for r in realms if any(x.strip() for x in r["lines"])]
    paths = {}
    trav = t1.split("## Ближняя Умбра — путешествие", 1)[1].split("\n## ", 1)[0] if "## Ближняя Умбра — путешествие" in t1 else ""
    for key, word in (("new", "Новолуние"), ("crescent", "Серп"), ("half", "Половина"), ("gibbous", "Растущая"), ("full", "Полнолуние")):
        m = re.search(r"\*\*" + word + r"[^*]*\*\*\s*—\s*(.+)", trav)
        if m: paths[key] = md_inline(m.group(1).strip())
    return {"realms": out, "paths": paths, "travel": md_html(trav.splitlines())}


# Механика книг-дополнений: ритуалы, фетиши и талены, достоинства и недостатки (с меткой книги)
SUPP_BOOKS = {"W20_White_Howlers": "W20 White Howlers", "W20_Rage_Across_the_World": "W20 Rage Across the World", "W20_Book_of_the_Wyrm": "W20 Book of the Wyrm",
              "W20_Changing_Ways": "W20 Changing Ways", "W20_Shattered_Dreams": "W20 Shattered Dreams", "W20_Umbra": "W20 Umbra", "W20_Kinfolk": "W20 Kinfolk",
              "W20_Skinner": "W20 Skinner"}
RITE_WORDS = [("согласи", "accord"), ("accord", "accord"), ("смерт", "death"), ("мистич", "mystic"), ("каэрн", "caern"), ("слав", "renown"),
              ("наказан", "punishment"), ("сезон", "seasonal"), ("мал", "minor")]
CAT_WORDS = [("физ", "physical"), ("мент", "mental"), ("умств", "mental"), ("соц", "social"), ("сверх", "supernatural")]


def supp_files():
    base = os.path.dirname(REF)
    for folder, source in SUPP_BOOKS.items():
        d = os.path.join(base, folder)
        if not os.path.isdir(d):
            continue
        for fn in sorted(f for f in os.listdir(d) if f.endswith(".md")):
            with open(os.path.join(d, fn), encoding="utf-8") as f:
                yield folder, source, f.read().splitlines()


def slug(s, prefix=""):
    return prefix + re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def parse_supp_mech(core_rites, core_fetishes, core_merits):
    rites, fetishes, merits = [], [], []
    rk = {r["key"] for r in core_rites}; fk = {f["key"] for f in core_fetishes}; mk = {(m["kind"], m["name"]) for m in core_merits}
    kind_names = {}
    for r in core_rites:
        kind_names.setdefault(r["kind"], r["kindName"])
    for folder, source, lines in supp_files():
        sec, sub = "", ""
        for line in lines:
            if line.startswith("## "):
                sec, sub = line[3:].lower(), ""; continue
            if line.startswith("### "):
                sub = line[4:].lower()
                # ритуал заголовком: «### Обряд сновидения (Rite of Dreamtime) — мистический, ур. 2»
                m = re.match(r"^### (.+?)\s*\(([^()]+)\)\s*—\s*(.+)$", line)
                if m and re.search(r"(ритуал|обряд|rite)", (m.group(1) + m.group(2)).lower()):
                    name, en, rest = m.groups()
                    name = re.sub(r"^Нов(?:ый|ая) (?:обряд|ритуал)\s*:\s*", "", name)   # «### Новый обряд: Обряд сдирания (…)»
                    lv = re.search(r"ур\.\s*(\d+)", rest)
                    kind = next((k for w, k in RITE_WORDS if w in rest.lower()), "mystic")
                    key = slug(en)
                    if key not in rk:
                        rk.add(key)
                        rites.append({"key": key, "name": name.strip(), "en": en.strip(), "kind": kind, "kindName": kind_names.get(kind, kind), "level": int(lv.group(1)) if lv else 0,
                                      "gnosis": 0, "roll": None, "text": f"<p>{md_inline(rest)}</p>", "source": source})
                continue
            # ритуалы списком
            if re.search(r"(ритуал|обряд)", sec) and not re.search(r"(дар|тотем|фетиш)", sec):
                m = NAME.match(line)
                if m:
                    name, en, rest = m.group(1).strip(), m.group(2).strip(), m.group(3).strip()
                    lv = re.match(r"^ур\.\s*(\d+)", rest)
                    if not lv and "мал" not in sub + sec:
                        continue
                    kind = "minor" if "мал" in sub else next((k for w, k in RITE_WORDS if w in rest[:60].lower()), "mystic")
                    key = slug(en)
                    if key in rk:
                        key = slug(en, folder.split("_", 1)[1].lower().replace("_", "-") + "-")
                    rk.add(key)
                    rites.append({"key": key, "name": name, "en": en, "kind": kind, "kindName": kind_names.get(kind, kind), "level": int(lv.group(1)) if lv else 0,
                                  "gnosis": 0, "roll": roll_of(rest), "text": f"<p>{md_inline(rest)}</p>", "source": source})
                continue
            # фетиши и талены
            if "фетиш" in sec or "талены" in sec or "снаряжение" in sec:
                m = re.match(r"^- \*\*(.+?)\s*\(([^()]+)\)\*\*\s*—\s*(?:(талена)[,.]?\s*)?(?:ур\.\s*(\d+),\s*)?Гнозис\s*(\d+)\.?\s*(.*)$", line)
                if m:
                    name, en, tal, lvl, gn, body = m.groups()
                    kind = "talen" if tal or (not lvl and "тален" in sub) else "fetish"
                    key = slug(en)
                    if key in fk:
                        key = slug(en, folder.split("_", 1)[1].lower().replace("_", "-") + "-")
                    fk.add(key)
                    fetishes.append({"key": key, "kind": kind, "name": name.strip(), "en": en.strip(), "level": int(lvl or 0), "gnosis": int(gn),
                                     "text": f"<p>{md_inline(body)}</p>", "source": source})
                continue
            # достоинства и недостатки таблицей: «Название (English) — физ. | 1 (Дост.) | эффект»
            if "достоинств" in sec and line.startswith("| ") and not line.startswith("| Название") and not set(line) <= set("|-: "):
                c = [x.strip() for x in line.strip().strip("|").split("|")]
                if len(c) < 3:
                    continue
                head, cat_s = (c[0].split(" — ", 1) + [""])[:2]
                name, en = name_en(head)
                nums = [int(x) for x in re.findall(r"\d+", c[1])] or [1]
                kind = "flaw" if re.search(r"недост|flaw", c[1].lower()) else "merit"
                cat = next((k for w, k in CAT_WORDS if w in (cat_s + c[1]).lower()), "supernatural")
                if (kind, name) in mk:
                    continue
                mk.add((kind, name))
                merits.append({"kind": kind, "category": cat, "name": name, "en": en, "cost": c[1].split("(")[0].strip() or str(nums[0]), "min": min(nums), "max": max(nums),
                               "clan": "", "sect": "", "era": "", "source": source, "line": "werewolf", "html": f"<p>{md_inline(c[2])}</p>"})
    return rites, fetishes, merits


# Фера (W20 Changing Breeds): род, формы (таблица поправок Атрибутов), черты рода, справка (бешенство, регенерация, уязвимость,
# шаг в сторону, Бред), Дары рода — в общий список Даров с группой {kind: "fera", key: род, label: «Род: раздел»}
FERA_ATTR = {"Сил": "strength", "Лов": "dexterity", "Сто": "stamina", "Ман": "manipulation", "Внеш": "appearance", "Воспр": "perception",
             "Хар": "charisma", "Сооб": "wits", "Инт": "intelligence"}


def fera_forms(text):
    part = ""
    m = re.search(r"\n## Формы[^\n]*\n(.*?)(?=\n## )", text, re.S)
    if m:
        part = m.group(1)
    forms, cols = [], []
    for line in part.splitlines():
        if not line.startswith("|") or set(line) <= set("|-: "):
            continue
        c = [x.strip() for x in line.strip().strip("|").split("|")]
        if c[0] == "Форма":
            cols = [FERA_ATTR.get(x.split()[0] if x else x) for x in c[1:]]; continue
        if not any(cols):          # таблица не про поправки (у Мокол — виды-варны) — пропустить
            continue
        name, en = name_en(c[0])
        mods, setv = {}, {}
        for k, v in zip(cols, c[1:]):
            if not k: continue
            v = v.replace("−", "-").strip()
            if re.fullmatch(r"[+-]\d+", v): mods[k] = int(v)
            elif v == "0" and k == "appearance": setv[k] = 0
        forms.append({"key": re.sub(r"[^a-z0-9]+", "-", (en or name).lower()).strip("-") or f"f{len(forms)}", "name": name, "en": en, "mods": mods, "set": setv})
    if not forms:   # формы строкой в «Чертах»: «- Формы: Хомид, Анфрос, Кринос (…), …»
        m = re.search(r"^- Формы:\s*(.+)$", text, re.M)
        if m:
            line = re.sub(r"\([^)]*\)", "", m.group(1)).split(";")[0]
            for i, raw in enumerate(line.split(",")):
                name = raw.strip().rstrip(".").strip()
                if name:
                    forms.append({"key": f"f{i}", "name": name, "en": "", "mods": {}, "set": {}})
    if not forms and part:          # формы только словами (Мокол: Хомид, Архид, Сухид)
        names = []
        for n in re.findall(r"(Хомид|[А-ЯЁ][а-яё]+ид)\b", part):
            if n not in names:
                names.append(n)
        forms = [{"key": f"f{i}", "name": n, "en": "", "mods": {}, "set": {}} for i, n in enumerate(names)]
    return forms, md_html(part.splitlines()) if part else ""


def fera_gifts(text, fkey, fname, taken):
    out = []
    for m in re.finditer(r"\n## ([^\n]*Дар[^\n]*)\n(.*?)(?=\n## |\Z)", text, re.S):
        sec, body = m.group(1).strip(), m.group(2)
        label, level = sec, 0
        for line in body.splitlines():
            h = re.match(r"^###\s+(.+)$", line)
            if h:
                label = f"{sec} — {h.group(1).strip()}"; level = 0; continue
            lv = re.match(r"^\*\*Ур\.\s*(\d+):\*\*", line) or re.match(r"^#+\s*Уровень\s*(\d+)", line)
            if lv:
                level = int(lv.group(1))
            for g in re.finditer(r"\*\*([^*()]+?)\s*\(([^()]+)\)\*\*\s*—\s*(.*?)(?=;\s*\*\*|$)", line):
                name, en, rest = g.group(1).strip(), g.group(2).strip(), g.group(3).strip()
                lvl = level
                il = re.search(r"ур\.\s*(\d+)", rest[:40])
                if not lvl and il: lvl = int(il.group(1))
                if not lvl: continue
                key = f"{fkey}-" + re.sub(r"[^a-z0-9]+", "-", en.lower()).strip("-")
                if key in taken: continue
                taken.add(key)
                out.append({"key": key, "name": name, "en": en, "level": lvl, "groups": [{"kind": "fera", "key": fkey, "label": f"{fname}: {re.sub(r'^Дары\\s*', '', label) or label}"}],
                            "teacher": "", "roll": roll_of(rest), "cost": cost_of(rest), "text": f"<p>{md_inline(rest)}</p>", "source": "W20 Changing Breeds"})
    return out


def parse_fera(core_keys):
    base = os.path.join(os.path.dirname(REF), "W20_Changing_Breeds")
    if not os.path.isdir(base):
        return [], []
    files = sorted(f for f in os.listdir(base) if f.endswith(".md"))
    common = open(os.path.join(base, next(f for f in files if f.startswith("12"))), encoding="utf-8").read() if any(f.startswith("12") for f in files) else ""
    quick = {}
    qp = re.search(r"\n## Быстрая справка\n(.*?)(?=\n## )", common, re.S)
    breeds, gifts, taken = [], [], set(core_keys)
    for fn in files:
        if fn.startswith("12"):
            continue
        text = open(os.path.join(base, fn), encoding="utf-8").read()
        h1 = re.search(r"^# (.+?) \(([^,)]+)", text, re.M)
        if not h1:
            continue
        name, en = h1.group(1).strip(), h1.group(2).strip()
        key = re.sub(r"[^a-z0-9]+", "", en.lower().replace("é", "e"))
        forms, forms_html = fera_forms(text)
        tm = re.search(r"\n## Черты\n(.*?)(?=\n## )", text, re.S)
        facts = {}
        if qp:
            for line in qp.group(1).splitlines():
                b = re.match(r"^- \*\*(.+?):\*\*\s*(.*)$", line)
                if not b: continue
                topic, rest = b.group(1), b.group(2)
                for seg in rest.split(";"):
                    parts = seg.split(" — ", 1)
                    if len(parts) == 2 and any(n.strip().startswith(name[:4]) for n in parts[0].split(",")):
                        facts[topic] = md_inline(parts[1].strip())
                    elif len(parts) == 2 and "остальн" in parts[0] and topic not in facts:
                        facts.setdefault(topic, md_inline(parts[1].strip()))
        breeds.append({"key": key, "name": name, "en": en, "forms": forms, "formsHtml": forms_html,
                       "traits": md_html(tm.group(1).splitlines()) if tm else "", "facts": facts})
        gifts += fera_gifts(text, key, name, taken)
    return breeds, gifts


# Уродства метисов: примеры основной книги (гл. 1) и новые из W20 Changing Ways; у части — механика (fx):
# soak — кубики поглощения (forms — только в этих формах), appearance — Внешность во всех формах, appearanceMax — потолок, bite — тип урона укуса
DEFORM_KEYS = {"Хрупкие когти и клыки": "brittle-claws", "Дисплазия бедра": "hip-dysplasia", "Нервное превращение": "nervous-shift",
               "Без мышечной массы": "no-muscle-mass", "Духовное уродство": "spiritual-deformity", "Третий глаз": "third-eye",
               "Неестественный окрас": "unnatural-coloration", "Слабый голос": "weak-voice"}
DEFORM_FX = {"tough-hide": {"soak": 1, "appearanceMax": 1}, "hirsute": {"soak": 1, "forms": ["crinos", "hispo", "lupus"]},
             "monstrous": {"appearance": 0}, "no-fangs": {"bite": "bashing"}}


def parse_deformities():
    out = []

    def table(text, source):
        for line in text.splitlines():
            if not line.startswith("| ") or line.startswith("| Уродство") or set(line) <= set("|-: "):
                continue
            c = [x.strip() for x in line.strip().strip("|").split("|")]
            if len(c) < 2:
                continue
            name, en = name_en(c[0])
            key = slug(en) if en else DEFORM_KEYS.get(name, slug(name))
            if any(d["key"] == key for d in out):
                continue
            d = {"key": key, "name": name, "en": en, "text": md_inline(c[1]), "source": source}
            if key in DEFORM_FX:
                d["fx"] = DEFORM_FX[key]
            out.append(d)

    core = read("01_Создание_персонажа_породы_аугурии_племена.md")
    table(core.split("### Уродства метисов", 1)[1].split("\n---", 1)[0].split("\n## ", 1)[0], "W20")
    cw = changing_ways_01()
    if cw:
        table(cw.split("### Новые уродства метисов", 1)[1].split("\n## ", 1)[0], "W20 Changing Ways")
    return out


def changing_ways_01():
    p = os.path.join(os.path.dirname(REF), "W20_Changing_Ways")
    fn = next((f for f in sorted(os.listdir(p)) if f.startswith("01")), None) if os.path.isdir(p) else None
    return open(os.path.join(p, fn), encoding="utf-8").read() if fn else ""


def parse_changing_ways_extras(taken_gifts):
    """Пути перемен, гл. 1: Дар метисов «Отринуть наследие» и тотем Мудрости Обатала — заголовками, не списком."""
    text, gifts, totems = changing_ways_01(), [], []
    if not text:
        return gifts, totems
    m = re.search(r"\n### Новый Дар метисов: (.+?) \(([^()]+)\) — ур\. (\d+)\n(.*?)(?=\n### |\n## )", text, re.S)
    if m and slug(m.group(2)) not in taken_gifts:
        name, en, lv, body = m.groups()
        gifts.append({"key": slug(en), "name": name.strip(), "en": en.strip(), "level": int(lv), "groups": [{"kind": "breed", "key": "metis"}],
                      "teacher": "", "roll": None, "cost": cost_of(body), "text": md_html(body.strip().splitlines()), "source": "W20 Changing Ways"})
    m = re.search(r"\n### Новый тотем: (.+?) \(([^()]+)\) — тотем (\S+)\n(.*?)(?=\n### |\n## )", text, re.S)
    if m:
        name, en, cat, body = m.groups()
        field = lambda label: md_inline(next((re.sub(r"^- \*\*[^*]+:\*\*\s*", "", l) for l in body.splitlines() if l.startswith(f"- **{label}")), ""))
        totems.append({"key": slug(en), "name": name.strip(), "en": en.strip(), "cat": cat, "cost": first_int(field("Цена")),
                       "individual": field("Личные черты"), "pack": field("Черты стаи"), "ban": field("Запрет"), "text": field("Покровитель") or md_inline(
                           next((l[2:] for l in body.splitlines() if l.startswith("- ") and "**" not in l), "")), "source": "W20 Changing Ways"})
    return gifts, totems


def parse_numina():
    """Нумины Родни (W20 Kinfolk, гл. 3): Пути ворожбы и психические феномены — по 5 уровней; Истинная вера — trueFaith смертного."""
    p = os.path.join(os.path.dirname(REF), "W20_Kinfolk")
    fn = next((f for f in sorted(os.listdir(p)) if f.startswith("02")), None) if os.path.isdir(p) else None
    if not fn:
        return []
    text = open(os.path.join(p, fn), encoding="utf-8").read()
    out = []
    for kind, head in (("hedge", "## Ворожба"), ("psychic", "## Психические феномены")):
        part = text.split(head, 1)[1].split("\n## ", 1)[0]
        for m in re.finditer(r"\n### (.+?) \(([^()]+)\)\n(.*?)(?=\n### |\Z)", part, re.S):
            name, en, body = m.groups()
            lines = body.strip().splitlines()
            intro = [l for l in lines if not l.startswith("|")]
            levels = []
            for l in lines:
                if not l.startswith("| •"):
                    continue
                c = [x.strip() for x in l.strip().strip("|").split("|")]
                dots = c[0].count("•")
                title = c[0].replace("•", "").strip()
                diff = first_int(c[3]) if len(c) > 3 else 0
                levels.append({"n": dots, "name": title, "text": md_inline(c[1] + (f" Восстановление целителя: {c[2]}." if len(c) > 3 else "")), "difficulty": diff})
            pool = re.search(r"\*\*Бросок:\*\*\s*(.+?)(?:\.\s|\.$|;)", body)
            pool_s = pool.group(1).strip() if pool else ""
            parts = [x.strip() for x in re.split(r"\s*\+\s*", re.split(r",", pool_s)[0])] if pool_s else []
            traits = [("willpower.permanent" if x == "Воля" else TRAITS.get(x)) for x in parts]
            dm = re.search(r"сложность\s*(\d+)", pool_s)
            cost = re.search(r"\*\*Цена:\*\*\s*([^.]+)\.", body)
            out.append({"key": slug(en), "kind": kind, "name": name.strip(), "en": en.strip(), "pool": pool_s, "cost": cost.group(1).strip() if cost else "",
                        "roll": {"trait1": traits[0] if traits else None, "trait2": traits[1] if len(traits) > 1 else None,
                                 "difficulty": int(dm.group(1)) if dm else 6, "byTarget": "Воля жертвы" in pool_s} if traits else None,
                        "text": md_html(intro), "levels": levels, "source": "W20 Kinfolk"})
    return out


# Ками (W20 Umbra, гл. 4): разрешённые им силы фоморов — по названию в списке Ками → название в таблице гл. 13 основной книги
KAMI_FOMORI = {"Управление животными": ["Контроль животных"], "Бронированная шкура и кожа": ["Бронированная шкура", "Бронированная кожа"],
               "Берсерк": ["Берсерк"], "Хамелеон": ["Окраска хамелеона"], "Когти и клыки": ["Когти и клыки"], "Сумеречное зрение": ["Ночное зрение"],
               "Скорость": ["Лишняя скорость"], "Газообразная форма": ["Газообразная форма"], "Однородность": ["Однородность"],
               "Иммунитет к Бреду": ["Иммунитет к Бреду"], "Невидимость": ["Невидимость"], "Хвост-хлыст": ["Хлещущий хвост"],
               "Мега-атрибут": ["Мега-Атрибут"], "Регенерация": ["Регенерация"], "Чувство неестественного": ["Чуять неестественное"],
               "Смена размера": ["Смена размера"], "Связь с духами": ["Духовные связи"], "Проход в Умбру": ["Прохождение Умбры"],
               "Дыхание под водой": ["Дыхание под водой"], "Крылья": ["Крылья"]}
PLAIN_POOL = re.compile(r"(?<![А-Яа-яЁё])([А-ЯЁ][а-яё]+(?: [а-яё]+)?)\s*\+\s*([А-ЯЁ][а-яё]+(?: [а-яё]+(?: [а-яё]+)?)?)(?:\s*\(сложность\s*(\d+)\))?")


def plain_roll(text):
    """Пул без выделения: «Восприятие + Оккультизм против Воли цели», «Харизма + Первобытный инстинкт (сложность 7)»."""
    pos = 0
    while (m := PLAIN_POOL.search(text, pos)):
        pos = m.start(2)          # «Гнозис + Манипуляция + Выражение»: следующую пару ищем со второй черты
        t1, t2 = TRAITS.get(m.group(1)), TRAITS.get(m.group(2)) or TRAITS.get(" ".join(m.group(2).split()[:2])) or TRAITS.get(m.group(2).split()[0])
        # «1 Гнозис + Манипуляция + Выражение» — трата, а не пул: Гнозис и Ярость в пул не берём
        if t1 and t2 and not t1.startswith("werewolf."):
            return {"trait1": t1, "trait2": t2, "difficulty": int(m.group(3)) if m.group(3) else 6, "byTarget": not m.group(3)}
    return None


def parse_primal_uses():
    """Пути перемен, гл. 1: частичное превращение и дополнительные применения Первобытного инстинкта — с пулами для окна бросков."""
    text = changing_ways_01()
    if not text:
        return []
    out = []
    pt = text.split("### Частичное превращение", 1)[1].split("\n### ", 1)[0].split("\n## ", 1)[0]
    out.append({"key": "partial", "name": "Частичное превращение", "text": md_html(pt.strip().splitlines()),
                "roll": {"trait1": "attributes.dexterity", "trait2": "abilities.primalUrge", "difficulty": 6, "byTarget": True}})
    part = text.split("## Первобытный инстинкт", 1)[1].split("\n## ", 1)[0]
    for line in part.splitlines():
        m = re.match(r"^- \*\*(.+?):\*\*\s*(.+)$", line)
        if not m:
            continue
        name, body = m.group(1).strip(), m.group(2)
        # «(Харизма или Внешность) + …» — первая из двух; «…, сложность 8» — сложность; «против сложности = Воля цели» — по цели
        b = re.sub(r"\((\S+) или \S+\)", r"\1", body)
        pools = []
        for pm in re.finditer(r"([А-ЯЁ][а-яё]+)\s*\+\s*Первобытный инстинкт(?:,\s*сложность\s*(\d+))?", b):
            t1 = TRAITS.get(pm.group(1))
            if t1:
                pools.append({"trait1": t1, "trait2": "abilities.primalUrge", "difficulty": int(pm.group(2) or 6), "byTarget": not pm.group(2)})
        for i, roll in enumerate(pools or [None]):
            out.append({"key": f"{slug(name) or name}-{i}", "name": name + (f" ({i + 1})" if len(pools) > 1 else ""), "text": f"<p>{md_inline(body)}</p>", "roll": roll})
    return out


# Силы фомори без английского названия в справочнике (гл. 13) — как их зовёт Книга Червя
FOMOR_EN = {"Окраска хамелеона": "Chameleon Coloration", "Когти и клыки": "Claws and Fangs", "Лишняя скорость": "Extra Speed",
            "Иммунитет к Бреду": "Immunity to the Delirium", "Крысиная голова": "Rat Head", "Регенерация": "Regeneration",
            "Чуять неестественное": "Sense the Unnatural", "Ядовитый укус": "Venomous Bite", "Игра теней": "Shadowplay",
            "Заразное касание": "Infectious Touch", "Пасть Червя": "Maw of the Wyrm", "Подушечки лап": "Footpads", "Хождение по стенам": "Wall Walking",
            "Паутина": "Webbing", "Хлещущий хвост": "Lashing Tail", "Язык лягушки": "Frog Tongue", "Рёв Червя": "Roar of the Wyrm",
            "Мега-Атрибут": "Mega-Attribute", "Невидимость": "Invisibility", "Газообразная форма": "Gaseous Form", "Крылья": "Wings",
            "Смена размера": "Size Shift", "Дыхание под водой": "Water Breathing", "Прохождение Умбры": "Umbral Passage", "Экзоскелет": "Exoskeleton",
            "Лишние конечности": "Extra Limbs", "Глаза Червя": "Eyes of the Wyrm", "Бестиальная мутация": "Bestial Mutation"}
FOMOR_ALIAS = {"fangs": "claws-and-fangs", "mega-strength": "mega-attribute", "mega-stamina": "mega-attribute", "mega-intelligence": "mega-attribute",
               "mega-dexterity": "mega-attribute", "shadowwalking": "chameleon-coloration"}


def parse_fomori():
    """Фоморы: силы (W20, гл. 13 — таблица) и породы фомори (Книга Червя, гл. 2: Воля, силы, особые силы строками ниже)."""
    core = read("13_Враги.md").split("### Силы фомори", 1)[1].split("\n## ", 1)[0]
    powers = []
    for line in core.splitlines():
        if not line.startswith("| **"):
            continue
        c = [x.strip() for x in line.strip().strip("|").split("|")]
        name, en = name_en(c[0])
        en = en or FOMOR_EN.get(name, "")
        powers.append({"key": slug(en) or name, "name": name, "en": en, "text": md_inline(c[1]), "roll": plain_roll(c[1]) or roll_of(c[1]),
                       "repeat": bool(re.search(r"до 3 раз", c[1])), "max": 3 if re.search(r"до 3 раз", c[1]) else 1,
                       "rage": "Берсерк" in name, "source": "W20"})
    by = {p["en"].lower(): p["key"] for p in powers if p["en"]}
    by.update({p["name"].lower(): p["key"] for p in powers})
    p = os.path.join(os.path.dirname(REF), "W20_Book_of_the_Wyrm")
    fn = next((f for f in sorted(os.listdir(p)) if f.startswith("02")), None) if os.path.isdir(p) else None
    breeds = []
    if fn:
        part = open(os.path.join(p, fn), encoding="utf-8").read().split("## Породы фомори", 1)[1].split("\n## ", 1)[0]
        cur = None
        for line in part.splitlines():
            m = re.match(r"^(\s*)- \*\*(.+?)\*\*\s*—\s*(.+)$", line)
            if not m:
                continue
            if m.group(1) and cur:
                n, e = name_en(m.group(2))     # особая сила породы строкой ниже
                cur["specials"][n] = {"en": e, "text": md_inline(m.group(3))}
                continue
            name, en = name_en(m.group(2))
            body = m.group(3)
            wp = re.search(r"Воля (\d+)", body)
            pm = re.search(r"(?:Силы|модель):\s*([^.;]+)", body)      # у Гончих бойни — «"Старая" модель: …»
            raw = pm.group(1).split(",") if pm else []
            cur = {"key": slug(en) or name, "name": name, "en": en, "willpower": int(wp.group(1)) if wp else 3, "raw": raw, "specials": {},
                   "text": md_inline(body), "source": "W20 Book of the Wyrm"}
            breeds.append(cur)
    for b in breeds:
        keys, sp = [], {}
        by_en = {v["en"].lower(): n for n, v in b["specials"].items() if v["en"]}
        for r in [x.strip().rstrip(".") for x in b.pop("raw")] + list(b["specials"]):
            r = re.sub(r"\s*\(.*$", "", r).strip()
            if not r or r[0].islower():
                continue
            k = by.get(r.lower()) or FOMOR_ALIAS.get(slug(r))
            if not k:
                n = r if r in b["specials"] else by_en.get(r.lower(), r)
                k = f"~{b['key']}:{n}"
                sp[n] = b["specials"].get(n, {}).get("text", "")
            if k not in keys:
                keys.append(k)
        b["powers"], b["specials"] = keys, sp
    return {"powers": powers, "breeds": breeds}


# «Сопротивление боли — как Дар Ахрун» и т. п.: в справочнике Дары основной книги названы иначе — тот же Дар по ключу
BSD_SAME = {"Сопротивление боли": "resist-pain", "Сопротивление токсину": "resist-toxin", "Чутьё Червя": "sense-wyrm"}


def parse_bsd(gifts):
    """Танцоры Чёрной Спирали как племя (W20, гл. 13): Воля 3, тотем Козодой, начальные Дары; Дары главы — в список изгоев
    «blackSpiralDancers» (новые — отдельными Дарами, «как у Ахрун/Костегрызов…» — группой к уже известному Дару)."""
    text = read("13_Враги.md").split("## 1. Танцоры Чёрной Спирали", 1)[1].split("\n## ", 1)[0]
    grp = {"kind": "outsider", "key": "blackSpiralDancers"}
    by_en = {g["en"].lower(): g for g in gifts if g.get("en")}
    by_ru = {g["name"].lower(): g for g in gifts}
    by_key = {g["key"]: g for g in gifts}
    part, level, added = text.split("### Дары Танцоров Чёрной Спирали", 1)[1], 0, []
    for line in part.splitlines():
        lv = re.match(r"^\*\*Ур\. (\d+)\*\*", line)
        if lv:
            level = int(lv.group(1)); continue
        if not line.startswith("- **") or not level:
            continue
        for seg in re.split(r"(?<=\.)\s+(?=\*\*[^*]+\*\*\s*(?:\([^)]*\)\s*)?—)", line[2:]):
            m = re.match(r"^\*\*(.+?)(?:\s*\(([^()]+)\))?\*\*\s*(?:\(([^)]*)\)\s*)?—\s*(.*)$", seg)
            if not m:
                continue
            name, en, body = m.group(1).strip(), (m.group(2) or "").strip(), m.group(4).strip()
            g = by_en.get(en.lower()) if en else by_ru.get(name.lower()) or by_key.get(BSD_SAME.get(name, ""))
            if g:
                if grp not in g["groups"]:
                    g["groups"].append(dict(grp))
                continue
            key = slug(en, "bsd-") if en else f"bsd-{name}"
            if any(x["key"] == key for x in gifts + added):
                continue
            added.append({"key": key, "name": name, "en": en, "level": level, "groups": [dict(grp)], "teacher": m.group(3) or "",
                          "roll": roll_of(body) or plain_roll(body), "cost": cost_of(body), "text": f"<p>{md_inline(body)}</p>", "source": "W20"})
    head = text.split("###", 1)[0].split("\n", 1)[1]          # без хвоста заголовка «(Black Spiral Dancers)»
    starts = []
    sm = re.search(r"Начальные Дары:\s*(.+)", head)
    for n in re.sub(r"\*\*", "", sm.group(1) if sm else "").rstrip(".").split(","):      # «**Защитник Бейнов, …, Покров (Shroud)**»
        n, e = name_en(n.strip())
        g = by_en.get(e.lower()) if e else by_ru.get(n.lower()) or by_key.get(BSD_SAME.get(n, ""))
        g = g or next((x for x in added if x["name"].lower() == n.lower()), None)
        if g:
            starts.append(g["key"])
    tribe = {"key": "blackSpiralDancers", "name": "Танцоры Чёрной Спирали", "en": "Black Spiral Dancers", "willpower": first_int(re.search(r"Воля (\d+)", head).group(1)) if re.search(r"Воля (\d+)", head) else 3,
             "totem": "Козодой", "backgrounds": md_inline(re.sub(r"^- ", "", head.strip().splitlines()[0])), "startGifts": starts, "icon": "fa-hurricane", "wyrm": True}
    return added, tribe


def parse_fetch_rites(tribes):
    """Огненное крещение кин-фетча по племенам (W20 Kinfolk, гл. 3): «| Племя | Особенность |» → ключ племени по русскому названию."""
    p = os.path.join(os.path.dirname(REF), "W20_Kinfolk")
    fn = next((f for f in sorted(os.listdir(p)) if f.startswith("03")), None) if os.path.isdir(p) else None
    if not fn:
        return []
    part = open(os.path.join(p, fn), encoding="utf-8").read().split("### Варианты Огненного крещения", 1)[1].split("\n### ", 1)[0]
    by = {t["name"]: t["key"] for t in tribes}
    out = []
    for line in part.splitlines():
        c = [x.strip() for x in line.strip().strip("|").split("|")] if line.startswith("| ") else []
        if len(c) >= 2 and c[0] in by:
            out.append({"tribe": by[c[0]], "name": c[0], "text": md_inline(c[1])})
    return out


def parse_kami():
    """Ками: силы (обычные, неподвижных — растений и земли, разрешённые силы фоморов), таблица создания и примеры."""
    p = os.path.join(os.path.dirname(REF), "W20_Umbra")
    fn = next((f for f in sorted(os.listdir(p)) if f.startswith("04")), None) if os.path.isdir(p) else None
    if not fn:
        return {}
    text = open(os.path.join(p, fn), encoding="utf-8").read()
    powers = []

    def rows(part, kind):
        for line in part.splitlines():
            if not line.startswith("| **"):
                continue
            c = [x.strip() for x in line.strip().strip("|").split("|")]
            name, en = name_en(c[0])
            body = c[1]
            repeat = bool(re.search(r"(Каждая покупка|До \d+ покупок|покупк)", body))
            mx = re.search(r"До (\d+) покупок", body)
            if not mx and re.search(r"Всего до \+(\d+)", body):      # Стойкость к стихии: по +2 за покупку, всего до +6
                mx = re.match(r"(\d+)", str(int(re.search(r"Всего до \+(\d+)", body).group(1)) // 2))
            powers.append({"key": slug(en) or name, "name": name, "en": en, "kind": kind, "text": md_inline(body), "repeat": repeat,
                           "max": int(mx.group(1)) if mx else (5 if repeat else 1), "roll": plain_roll(body), "source": "W20 Umbra"})

    rows(text.split("## Силы Ками", 1)[1].split("### Силы неподвижных", 1)[0], "kami")
    rows(text.split("### Силы неподвижных", 1)[1].split("\n## ", 1)[0], "immobile")
    core = read("13_Враги.md").split("### Силы фомори", 1)[1].split("\n## ", 1)[0]
    fom = {}
    for line in core.splitlines():
        if line.startswith("| **"):
            c = [x.strip() for x in line.strip().strip("|").split("|")]
            n, e = name_en(c[0])
            fom[n] = (e, c[1])
    for kname, fnames in KAMI_FOMORI.items():
        for fname in fnames:
            if fname not in fom:
                continue
            en, body = fom[fname]
            name = fname if len(fnames) > 1 else kname
            powers.append({"key": slug(en) or name, "name": name, "en": en, "kind": "borrowed", "text": md_inline(body), "repeat": "до 3 раз" in body,
                           "max": 3 if "до 3 раз" in body else 1, "roll": plain_roll(body) or roll_of(body), "source": "W20 (силы фоморов)"})
    create = text.split("## Создание Ками", 1)[1].split("## Силы Ками", 1)[0]
    examples = text.split("## Примеры Ками", 1)[1] if "## Примеры Ками" in text else ""
    geas = text.split("## Гейс", 1)[1].split("\n", 1)[1].split("\n## ", 1)[0]
    return {"powers": powers, "create": md_html(create.strip().splitlines()), "geas": md_inline(geas.strip()),
            "examples": md_html(examples.strip().splitlines()),
            "start": {"human": {"willpower": 3, "gnosis": 1, "rage": 0, "gnosisMax": 6}, "animal": {"willpower": 2, "gnosis": 3, "rage": 0, "gnosisMax": 8},
                      "plant": {"willpower": 3, "gnosis": 5, "rage": 0, "gnosisMax": 10}}}


def build():
    gifts = parse_gifts()
    rites = parse_rites()
    breeds, auspices, tribes = parse_core(gifts)
    supp = parse_supp_gifts(gifts, breeds, auspices, tribes)
    gifts = gifts + supp
    fera, fera_gifts_list = parse_fera({g["key"] for g in gifts})
    gifts = gifts + fera_gifts_list
    cw_gifts, cw_totems = parse_changing_ways_extras({g["key"] for g in gifts})
    gifts = gifts + cw_gifts
    bsd_gifts, bsd_tribe = parse_bsd(gifts)
    gifts = gifts + bsd_gifts
    for kind, items in (("breed", breeds), ("auspice", auspices), ("tribe", tribes), ("form", FORMS)):
        for x in items:
            x["icon"] = ICONS[kind].get(x["key"], "fa-moon")
    tribes.append(bsd_tribe)          # после значков: у Танцоров свой (fa-hurricane)
    core_merits, core_fetishes = parse_merits(), parse_fetishes()
    s_rites, s_fetishes, s_merits = parse_supp_mech(rites, core_fetishes, core_merits)
    rites = rites + s_rites
    charms = parse_charms()
    data = {"source": "Werewolf: The Apocalypse 20th Anniversary Edition", "breeds": breeds, "auspices": auspices, "tribes": tribes,
            "forms": FORMS, "gifts": gifts, "rites": rites, "rankNames": RANK_NAMES, "rank": RANK, "xp": XP,
            "merits": core_merits + s_merits, "backgrounds": parse_backgrounds(), "fetishes": core_fetishes + s_fetishes, "charms": charms, "kinGifts": parse_kin_gifts(tribes), "totems": parse_totems() + cw_totems, "renownAwards": parse_renown_awards(), "scars": parse_scars(), "sept": parse_sept(), "umbra": parse_umbra(), "fera": fera,
            "deformities": parse_deformities(), "numina": parse_numina(), "kami": parse_kami(), "spirits": parse_spirit_templates(charms), "fetchRites": parse_fetch_rites(tribes), "primalUses": parse_primal_uses(), "fomori": parse_fomori()}
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
            "rulePages": sum(len(b["pages"]) for b in rules), "merits": len(data["merits"]), "backgrounds": len(data["backgrounds"]), "fetishes": len(data["fetishes"]), "charms": len(data["charms"]), "kinGifts": len(data["kinGifts"]), "totems": len(data["totems"]), "awards": len(data["renownAwards"]), "scars": len(data["scars"]), "positions": len(data["sept"]["positions"]), "caernTypes": len(data["sept"]["caerns"]), "realms": len(data["umbra"]["realms"]), "fera": len(fera), "feraGifts": len(fera_gifts_list), "deformities": len(data["deformities"]), "numina": len(data["numina"]), "kamiPowers": len(data["kami"].get("powers", [])), "spirits": len(data["spirits"]), "cwGifts": len(cw_gifts), "cwTotems": len(cw_totems), "books": len(books), "bookPages": sum(len(b["pages"]) for b in books)}


if __name__ == "__main__":
    import sys
    sys.path.insert(0, HERE)
    import fsretry; fsretry.install()   # Windows: занятый на миг файл — повтор, а не обрыв сборки
    sys.stdout.reconfigure(encoding="utf-8")
    print(build())
