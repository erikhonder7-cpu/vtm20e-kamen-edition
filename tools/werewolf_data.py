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
                    "text": f"<p>{md_inline(body)}</p>", "source": BOOK})
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


def build():
    gifts = parse_gifts()
    rites = parse_rites()
    breeds, auspices, tribes = parse_core(gifts)
    data = {"source": "Werewolf: The Apocalypse 20th Anniversary Edition", "breeds": breeds, "auspices": auspices, "tribes": tribes,
            "forms": FORMS, "gifts": gifts, "rites": rites, "rankNames": RANK_NAMES, "rank": RANK, "xp": XP}
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    starts = sum(len(x["startGifts"]) for x in breeds + auspices + tribes)
    return {"breeds": len(breeds), "auspices": len(auspices), "tribes": len(tribes), "gifts": len(gifts), "rites": len(rites),
            "startGifts": starts, "rolls": sum(1 for g in gifts if g["roll"])}


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    print(build())
