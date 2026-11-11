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
GAUNTLET = [{"key": "node", "name": "Узел", "diff": 3, "need": 1, "icon": "fa-sun"}, {"key": "wild", "name": "Глухая глушь", "diff": 5, "need": 2, "icon": "fa-mountain-sun"},
            {"key": "rural", "name": "Сельская местность", "diff": 6, "need": 3, "icon": "fa-wheat-awn"}, {"key": "city", "name": "Город", "diff": 7, "need": 4, "icon": "fa-road"},
            {"key": "downtown", "name": "Центр города", "diff": 8, "need": 5, "icon": "fa-city"}, {"key": "lab", "name": "Лаборатория Технократии", "diff": 9, "need": 5, "icon": "fa-flask"}]
COUNTER = {"difficulty": 7, "antiDifficulty": 8}
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


# Течения внутри фракций: Дома Ордена Гермеса и фракции Традиций (Mage Revised, гл. 1 — названия и акценты),
# Методологии Конвенций (Technocracy Reloaded, гл. 2). Механики у них нет — только принадлежность.
SUB_TRAD = [("Акаш", "akashayana"), ("Хор", "celestial-chorus"), ("Экстаз", "cult-of-ecstasy"), ("Толковател", "dreamspeakers"), ("Эвтанатос", "euthanatoi"),
            ("Гермес", "order-of-hermes"), ("Эфир", "society-of-ether"), ("Вербен", "verbena"), ("Виртуальн", "virtual-adepts")]
SUB_TECH = [("Iteration", "iteration-x"), ("New World", "new-world-order"), ("Прародител", "progenitors"), ("Синдикат", "syndicate"), ("Пустотные", "void-engineers")]
# Дом Вердитиус влился в Орден позже списка Revised; знак Дома есть в официальном наборе
SUB_EXTRA = {"order-of-hermes": [{"name": "Вердитиус", "en": "Verditius", "note": ""}]}


TRANSLIT = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя", ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t", "u", "f", "h",
                                                          "c", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya"]))


def translit(s):
    return "".join(TRANSLIT.get(ch, ch) for ch in s.lower())


def split_top(s):
    """Разбить по запятым вне скобок."""
    out, depth, cur = [], 0, ""
    for ch in s:
        depth += ch == "("
        depth -= ch == ")"
        if ch == "," and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    return [x.strip() for x in out + [cur] if x.strip()]


def parse_subs():
    out = {}
    rev = read(os.path.join(REF, "Mage_Revised_Основная", "01_Введение_Лексикон_Традиции.md"))
    for line in section(rev, "## Фракции Традиций"):
        m = re.match(r"^- \*\*(.+?):\*\*\s*(.+)$", line)
        key = m and next((k for stem, k in SUB_TRAD if stem in m.group(1)), None)
        if not key:
            continue
        subs = []
        for item in split_top(re.sub(r"^Дома\s*—\s*", "", m.group(2)).rstrip(".")):
            mm = re.match(r"^(.+?)\s*\((.+?)\)$", item)
            name, inner = (mm.group(1), mm.group(2)) if mm else (item, "")
            en, _, note = inner.partition(";")
            if note.strip().startswith("см."):          # не течение, а отсылка (Джор — Резонанс)
                continue
            subs.append({"name": plain(name), "en": en.strip(), "note": note.strip()})
        out[key] = subs
    tr = read(os.path.join(REF, "M20_Technocracy_Reloaded", "02_Конвенции_фокус_Подстройки_и_снаряжение_Q-отдела.md"))
    for line in tr.splitlines():
        m = re.match(r"^- \*\*(.+?)\.?\*\*\s*Методологии[^:]*:\s*(.+)$", line)
        key = m and next((k for stem, k in SUB_TECH if stem in m.group(1)), None)
        if not key:
            continue
        body = re.split(r"[;.](?![^(]*\))", m.group(2), maxsplit=1)[0]
        subs = []
        for raw in re.findall(r"\*\*(.+?)\*\*", body):
            mm = re.match(r"^(.+?)\s*\((.+?)\)$", raw)
            subs.append({"name": mm.group(1) if mm else raw, "en": mm.group(2) if mm else "", "note": ""})
        out[key] = subs
    for key, extra in SUB_EXTRA.items():
        out.setdefault(key, []).extend(extra)
    for subs in out.values():
        for x in subs:
            x["key"] = wd.slug(x["en"]) or wd.slug(translit(x["name"]))
    return out


# ── Нефанди (M20 Book of the Fallen): секты, Квиппот, фокус и черты Падших ──
FALLEN = os.path.join(REF, "M20_Book_of_the_Fallen")
SPHERE_RU = {"Соответствие": "correspondence", "Энтропия": "entropy", "Силы": "forces", "Жизнь": "life", "Материя": "matter", "Разум": "mind",
             "Первоначало": "prime", "Дух": "spirit", "Время": "time"}
# инструмент «Насилие (Violation)» в систему не выносим: книга сама оставляет его за закрытой дверью
FALLEN_SKIP_TOOLS = ("Насилие",)


def fallen(prefix):
    fn = next(f for f in sorted(os.listdir(FALLEN)) if f.startswith(prefix))
    return read(os.path.join(FALLEN, fn))


def parse_nephandi():
    """Секты Падших; Квлифы (номер, прозвание, влияние, Сфера); парадигмы, практики, инструменты; Достоинства и недостатки."""
    t1, t2 = fallen("01"), fallen("02")
    # секты: «Секты Падших (…): Инфернальисты (Infernalists), …» и ниже «- **Инфернальисты:** фокус»
    sec = section(t2, "## Фокус по сектам")
    head = next(l for l in sec if l.startswith("Секты Падших"))
    pairs = re.findall(r"([^,()]+?)\s*\(([A-Za-z’'/ ]+)\)", head.split("):", 1)[1])
    ens = [en.strip() for _, en in pairs]
    full = [ru.split("/")[0].strip(" «»") for ru, _ in pairs]
    sects = []
    for line in sec:
        m = re.match(r"^- \*\*(.+?):\*\*\s*(.*)$", line)
        if m:
            en = ens[len(sects)] if len(sects) < len(ens) else ""
            sects.append({"key": wd.slug(en.split("/")[0]), "name": full[len(sects)] if len(sects) < len(full) else m.group(1).strip(), "en": en, "group": "nephandi",
                          "affinity": [], "affinityText": "", "practices": plain(m.group(2))})
    # Квиппот: «10 **Лилит** («Королева Ночи»), 9 **Гамалиэль** …»; влияние и Сферы — отдельными строками раздела
    q = "\n".join(section(t1, "## Квиппот и путь Нефанди"))
    qliph = [{"n": int(n), "name": name, "title": title} for n, name, title in re.findall(r"(\d+) \*\*(.+?)\*\* \(«(.+?)»", q)]
    infl = re.search(r"Влияние: (.+?)(?:\.|$)", q, re.M)
    for part in (infl.group(1).split(",") if infl else []):
        nm, _, txt = part.partition("—")
        hit = next((x for x in qliph if x["name"].replace("’", "'") == nm.strip().replace("’", "'")), None)
        if hit:
            hit["influence"] = txt.strip()
    by_sphere = {}
    corr = re.search(r"\*\*(Соответствие — .+?)\*\*", q)
    for part in (re.sub(r"\(.*?\)", "", corr.group(1)).split(";") if corr else []):
        sp, _, nm = part.partition("—")
        key = SPHERE_RU.get(sp.strip())
        hit = next((x for x in qliph if x["name"] == nm.strip().rstrip(".")), None)
        if key and hit:
            hit["sphere"] = key
            by_sphere[key] = {"name": hit["name"], "title": hit["title"]}
    paradigms = []
    for line in section(t2, "## Нефандские парадигмы"):
        m = re.match(r"^- \*\*(.+?) \((.+?)\)[:.]?\*\*[:.]?\s*(.*)$", line)
        if m:
            paradigms.append({"name": m.group(1), "en": m.group(2), "text": plain(m.group(3)), "nephandi": True})
    practices = []
    for line in section(t2, "## Практики Падших"):
        m = re.match(r"^- \*\*(.+?) \((.+?)\)[:.]?\*\*[:.]?\s*(.*)$", line)
        if not m or m.group(2).startswith("Maleficia"):
            continue
        body = plain(m.group(3))
        ab = re.search(r"Способности: (.+?)\.(?: Инструменты|$)", body)
        tools = re.search(r"Инструменты: (.+)$", body)
        practices.append({"name": m.group(1), "en": m.group(2), "paradigms": "", "abilities": ab.group(1) if ab else "",
                          "instruments": tools.group(1).rstrip(".") if tools else "", "text": body.split(" Способности:")[0], "nephandi": True})
    tools = []
    for line in section(t2, "## Злые инструменты"):
        m = re.match(r"^- \*\*(.+?)(?: \((.+?)\))?[:.]?\*\*[:.]?", line)
        if m and not m.group(1).startswith(FALLEN_SKIP_TOOLS):
            tools.append(m.group(1).strip())
    merits = []
    for kind, heading in (("merit", "### Достоинства"), ("flaw", "### Недостатки")):
        for line in section(t1, heading):
            m = re.match(r"^\|\s*\*\*(.+?) \((.+?)\)\*\*\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$", line)
            if not m:
                continue
            cost, lo, hi = cost_of(m.group(3))
            merits.append({"kind": kind, "category": "supernatural", "name": m.group(1).split(" / ")[0], "en": m.group(2).split(" / ")[0], "cost": cost, "min": lo, "max": hi,
                           "clan": "", "sect": "", "era": "", "source": "M20 Book of the Fallen", "html": f"<p>{wd.md_inline(m.group(4))}</p>",
                           # Виддерслаинте книга разрешает и не-Падшему; прочее — только прошедшим Каул
                           **({} if "Widderslainte" in m.group(2) else {"nephandi": True})})
    return {"sects": sects, "qliphoth": qliph, "bySphere": by_sphere, "paradigms": paradigms, "practices": practices, "tools": tools, "merits": merits}


# Безмолвие (M20, гл. 10): уровень — по разряженному или накопленному Парадоксу; три вида и общий столбец
QUIET = {"kinds": [{"key": "denial", "name": "Отрицание", "en": "Denial"}, {"key": "madness", "name": "Безумие", "en": "Madness"}, {"key": "morbidity", "name": "Болезненность", "en": "Morbidity"}],
         "levels": [
    {"n": 1, "min": 1, "max": 3, "general": "причуды, редкие заблуждения", "denial": "упрямство", "madness": "галлюцинации", "morbidity": "влечение к смерти"},
    {"n": 2, "min": 4, "max": 6, "general": "заблуждения усиливаются", "denial": "избирательное восприятие", "madness": "частые заблуждения, смена настроения", "morbidity": "фиксация на смертности"},
    {"n": 3, "min": 7, "max": 10, "general": "слепота, галлюцинации, гоблины", "denial": "иррациональность, слепота к отрицаемому", "madness": "сильные галлюцинации", "morbidity": "кровожадность, макабр"},
    {"n": 4, "min": 11, "max": 15, "general": "мир-разум или опасность для всех", "denial": "фанатизм", "madness": "мир-разум или постоянные гоблины", "morbidity": "насильственная социопатия"},
    {"n": 5, "min": 16, "max": 20, "general": "кататония или почти Мародёр", "denial": "фанатик-дрон", "madness": "кататония, слабоумие", "morbidity": "садист-убийца"},
    {"n": 6, "min": 21, "max": 999, "general": "Мародёр, персонаж Рассказчика", "denial": "Мародёр", "madness": "Мародёр", "morbidity": "Мародёр"}],
         # Безмолвие Мародёра (M20, гл. 5): каждое очко отводит 5 очков отката на окружающих
         "marauder": ["две незначительные диссоциации", "заметные расхождения с миром", "серьёзный разрыв: свой фантазийный мир", "гротескные искажения",
                      "Консенсус изгоняет в Умбру", "Глубокая Умбра"], "insulate": 5,
         "exit": {"difficulty": 7, "successes": 3}}
# Изъяны Парадокса: степень — по успехам отката
PFLAWS = [{"key": "trivial", "name": "Пустяковый", "min": 1, "max": 5, "text": "минуты — часы"},
          {"key": "minor", "name": "Малый", "min": 6, "max": 10, "text": "около часа; +1 к сложности некоторых бросков на сцену"},
          {"key": "significant", "name": "Значительный", "min": 11, "max": 15, "text": "дни — неделя и дольше; штраф к кубикам или сложности"},
          {"key": "severe", "name": "Серьёзный", "min": 16, "max": 20, "text": "нельзя показаться среди Масс"},
          {"key": "drastic", "name": "Решающий", "min": 21, "max": 999, "text": "месяцы — годы; минус кубики, +2 к сложностям"}]
# Резонанс и Синергия (Book of Secrets): степени, «ароматы», виды Синергии, примеры подписей
RESONANCE = {"degrees": ["Неразличимый", "Слабый", "Тонкий", "Заметный", "Сильный", "Подавляющий"],
             "flavors": [{"key": "devotional", "name": "Преданный", "text": "вера, дело, этика"}, {"key": "elemental", "name": "Стихийный", "text": "стихия, природа, зверь, смерть"},
                         {"key": "stabilizing", "name": "Стабилизирующий", "text": "устойчивость, защита, исцеление"}, {"key": "temperamental", "name": "Темпераментный", "text": "чувства и настроение"}],
             "synergy": [{"key": "dynamic", "name": "Динамическая", "text": "перемены, творение"}, {"key": "entropic", "name": "Энтропийная", "text": "распад, обновление"},
                         {"key": "static", "name": "Статическая", "text": "устойчивость, порядок"}],
             "signatures": ["Манящий", "Успокаивающий", "Гниющий", "Дикий", "Яростный", "Мрачный", "Заботливый", "Паразитический", "Жёсткий", "Бурный", "Грациозный", "Воинственный"]}
# Мародёры (M20, гл. 5; Book of Mirrors): своих «фракций» нет — одиночки и две крупные силы
MARAUDERS = [{"key": "marauder", "name": "Мародёр", "en": "Marauder"}, {"key": "umbral-underground", "name": "Умбральное подполье", "en": "Umbral Underground"},
             {"key": "bai-dai", "name": "Бай-Дай", "en": "Bai Dai"}]
WONDER_KINDS = [("Гримуар", "grimoire"), ("Праймер", "grimoire"), ("Фетиш", "fetish"), ("Периапт", "periapt"), ("Матриц", "periapt"), ("Артефакт", "artifact"), ("Талисман", "talisman"),
                ("Устройств", "device"), ("Безделушк", "trinket"), ("Тринкет", "trinket"), ("Амулет", "charm"), ("Чара", "charm"), ("Гаджет", "charm")]
WONDER_SRC = [("M20_Основная", "07_", "## Примеры Чудес", "M20"), ("M20_VA_Weird_Wonders", "01_", None, "M20 Victorian Age: Weird Wonders"),
              ("M20_Book_of_the_Fallen", "04_", "## Чудеса и злые устройства", "M20 Book of the Fallen"),
              ("M20_Rich_Bastards_Guide", "03_", "### Сокровища и Чудеса Дойссетепа (Doissetep’s Treasures)", "M20 The Rich Bastard’s Guide to Magick"),
              ("M20_Rich_Bastards_Guide", "03_", "### Произведения искусства (Works of Art)", "M20 The Rich Bastard’s Guide to Magick")]


def book_file(folder, prefix):
    d = os.path.join(REF, folder)
    return read(os.path.join(d, next(f for f in sorted(os.listdir(d)) if f.startswith(prefix))))


def parse_wonders():
    """Чудеса из справочника: название, вид, точки, Арете, Квинтэссенция, цена Факта, Сферы из текста."""
    out, seen = [], set()
    for folder, prefix, heading, source in WONDER_SRC:
        text = book_file(folder, prefix)
        lines = section(text, heading) if heading else text.split("\n")
        for line in lines:
            m = re.match(r"^- \*\*(.+?)\*\*(.*)$", line)
            if not m:
                continue
            head, rest = m.group(1).rstrip(":"), m.group(2).strip()
            both = f"{head} {rest[:160]}"
            kind = next((k for word, k in WONDER_KINDS if word in both), None)
            if not kind or not re.search(r"Арете|Просветлени|точк|•", both):
                continue
            dots = head.count("•") or both[:200].count("•")
            title = re.sub(r"^[•\s+]+", "", head)
            title = re.split(r"\), |, (?=Устройств|Талисман|Безделушк|Фетиш|Артефакт)", title)[0]
            nm = re.match(r"^(.+?)\s*\((.+?)\)?$", title + ("" if title.count("(") <= title.count(")") else ")"))
            name, en = (nm.group(1).strip(), (nm.group(2) or "").strip(" )")) if nm and "(" in title else (title.strip(), "")
            if re.search(r"[А-Яа-яЁё]", en):   # в скобках не английское название, а пометка вида
                en = ""
            name = name.split(" / ")[0].strip()
            if not name or name in seen:
                continue
            seen.add(name)
            num = lambda rx: (lambda x: int(x.group(1)) if x else 0)(re.search(rx, both))
            points = dots or num(r"(\d+)(?:[–-]\d+)? точ")
            ranks = {}
            for ru, key in SPHERE_RU.items():
                for x in re.finditer(rf"\*\*{ru} (\d)", rest):
                    ranks[key] = max(ranks.get(key, 0), int(x.group(1)))
            body = re.sub(r"^\s*[:.]\s*", "", rest)
            out.append({"name": name, "en": en, "kind": kind, "value": min(points, 10), "arete": num(r"(?:Арете|Просветлени\w+) (\d+)"),
                        "quintessence": num(r"(?:Квинтэссенция|Первичная энергия|Q) (\d+)"), "cost": num(r"цена\D{0,12}(\d+)"),
                        "spheres": ", ".join(f"{next(r for r, k in SPHERE_RU.items() if k == key)} {v}" for key, v in ranks.items()),
                        "source": source, "nephandi": "Fallen" in source, "html": f"<p>{wd.md_inline(body)}</p>"})
    return out


# Царства Парадокса (M20, гл. 10): стиль тюрьмы — по Сфере, с которой маг перестарался; выход всегда решается без магии
REALMS = {"correspondence": "искажённая перспектива: расстояния и направления лгут", "entropy": "ускоренный распад — или полная предопределённость",
          "forces": "бури и физика наоборот", "life": "мутации плоти", "matter": "вещи меняют плотность и вес", "mind": "собственный разум мага, вывернутый наружу",
          "prime": "перегрузка энергией", "spirit": "крошечное Царство Снов", "time": "временные петли"}
SPIRIT_SRC = [("M20_Gods_and_Monsters", "06_", "## Проявления Парадокса (Paradox Manifestations)", "M20 Gods & Monsters"),
              ("M20_Book_of_the_Fallen", "04_", "### Кошмары Парадокса (Paradox Nightmares)", "M20 Book of the Fallen")]


def parse_paradox_spirits():
    """Духи Парадокса со статблоком духа: Воля, Ярость, Гнозис, Сущность и Чары словами."""
    out = []
    for folder, prefix, heading, source in SPIRIT_SRC:
        for line in section(book_file(folder, prefix), heading):
            m = re.match(r"^\s*- \*\*(.+?)(?: \((.+?)\))?:\*\*\s*(.*)$", line)
            st = m and re.search(r"Воля (\d+), Ярость (\d+), Гнозис (\d+), Сущность (\d+)", m.group(3))
            if not st:
                continue
            charms = re.search(r"Чары: (.*)$", m.group(3))
            hint = (m.group(2) or "").split(", ", 1)
            out.append({"key": wd.slug(hint[0] if re.search(r"[A-Za-z]", hint[0]) else translit(m.group(1))), "name": m.group(1), "en": hint[0] if re.search(r"[A-Za-z]", hint[0]) else "",
                        "of": hint[1] if len(hint) > 1 else "", "willpower": int(st.group(1)), "rage": int(st.group(2)), "gnosis": int(st.group(3)), "essence": int(st.group(4)),
                        "charms": plain(wd.md_inline(charms.group(1))) if charms else "", "source": source})
    return out


def parse_investments():
    """Инфернальные Инвестиции (Book of the Fallen): дары Патрона — черты с ценой в очках Пакта."""
    out = []
    for line in section(fallen("01_"), "## Инфернальные Инвестиции (Infernal Investments)"):
        m = re.match(r"^- \*\*(.+?) \((.+?), (\d+)(\+)?\)[:.]?\*\*[:.]?\s*(.*)$", line)
        if not m:
            continue
        cost = int(m.group(3))
        out.append({"kind": "merit", "category": "supernatural", "name": m.group(1), "en": m.group(2), "cost": f"{cost}{'+' if m.group(4) else ''}", "min": cost, "max": cost,
                    "clan": "", "sect": "", "era": "", "source": "M20 Book of the Fallen", "html": f"<p>{wd.md_inline(m.group(5))}</p>", "nephandi": True, "investment": True})
    return out


# ── Колдуны и консоры (M20 Sorcerer; Gods & Monsters, гл. 3) ──
SORC = os.path.join(REF, "M20_Sorcerer")
GAM = os.path.join(REF, "M20_Gods_and_Monsters")
SORC_CREATION = {"attributes": [6, 4, 3], "abilities": [11, 7, 4], "abilityMax": 3, "backgrounds": 5, "numina": 5, "willpower": 5, "freebies": 21,
                 "pathBase": 4, "psychicBase": 3, "costs": {"attribute": 5, "ability": 2, "path": 7, "ritual": 3, "background": 1, "willpower": 1}}
CONSOR_CREATION = {"attributes": [6, 4, 3], "abilities": [11, 7, 4], "max": 4, "backgrounds": 5, "willpower": 3, "freebies": 21, "acolyteFreebies": 15}


def sections_of(text, skip=()):
    """Разделы «## Название (English)» → (русское, английское, строки тела)."""
    out, cur = [], None
    for line in text.splitlines():
        m = re.match(r"^## (.+?)(?:\s*\(([^()]*)\))?\s*$", line)
        if m:
            cur = None if any(x in m.group(1) for x in skip) else [m.group(1).strip(), (m.group(2) or "").strip(), []]
            if cur:
                out.append(cur)
        elif cur is not None and not line.startswith("---"):
            cur[2].append(line)
    return out


def parse_sorcerer():
    read_s = lambda pre, base=SORC: read(os.path.join(base, next(f for f in sorted(os.listdir(base)) if f.startswith(pre))))
    paths = []
    for pre in ("01", "02", "03"):
        for name, en, body in sections_of(read_s(pre), skip=("Основные правила",)):
            paths.append({"key": wd.slug(en or translit(name)), "name": name, "en": en, "html": wd.md_html(body)})
    psychic = [{"key": wd.slug(en or translit(name)), "name": name, "en": en, "html": wd.md_html(body)}
               for name, en, body in sections_of(read_s("04"), skip=("Основные правила",))]
    core = read_s("01")
    aspects = []
    for line in section(core, "### Аспекты"):
        m = re.match(r"^- \*\*(.+?) \((.+?)\):\*\*\s*(.*)$", line)
        if m:
            aspects.append({"name": m.group(1), "en": m.group(2), "text": plain(m.group(3))})
    aff = []
    for line in section(read_s("05"), "## Объединения"):
        m = re.match(r"^- \*\*(.+?)(?:\s*\(([^()]*)\))?:\*\*\s*(.*)$", line)
        if m:
            name, en, body = m.group(1).strip(), (m.group(2) or "").strip(), plain(m.group(3))
            attrs, _, rest = body.partition(";")
            fav, _, note = rest.strip().partition(". ")
            aff.append({"key": wd.slug(en or translit(name)), "name": name, "en": en, "attrs": attrs.strip(), "paths": fav.strip().rstrip("."), "text": note.strip()})
    roles = []
    for line in section(read_s("03", GAM), "## Консоры"):
        m = re.match(r"^- \*\*(.+?) \((.+?)\):\*\*\s*(.*)$", line) or re.match(r"^- \*\*(Backup)():\*\*\s*(.*)$", line)
        if m:
            roles.append({"key": wd.slug(m.group(2) or m.group(1)), "name": m.group(1), "en": m.group(2), "text": plain(m.group(3))})
    return {"paths": paths, "psychic": psychic, "aspects": aspects, "affiliations": aff, "creation": SORC_CREATION,
            "consor": {"roles": roles, "creation": CONSOR_CREATION}}


# ── Ротэ из книг: «- **Название (English)** (Сфера N, Сфера N) — описание. **Система:** …» по всему справочнику ──
ROTE_SPH = r"(?:Соответстви[ея]|Связи|Энтропи[яи]|Сил[ыа]?|Жизн[ьи]|Матери[яи]|Разум[а]?|Первоначал[оа]|Основ[ыа]?|Дух[а]?|Врем[яени]+|Данные|Пространственная наука|Первичная полезность)"
ROTE_RX = re.compile(r"^- \*\*(.+?)\*\*\s*\(((?:[^()]|\([^()]*\))*?" + ROTE_SPH + r"\s*\d(?:[^()]|\([^()]*\))*)\)\s*[—–:.-]?\s*(.*)$")


def parse_rotes():
    labels, out, seen = {**dict(BOOKS), "Mage_Dead_Magic": "Мёртвая магия (Dead Magic)"}, [], set()
    for folder in sorted(os.listdir(REF)):
        d = os.path.join(REF, folder)
        if not os.path.isdir(d):
            continue
        for fn in sorted(os.listdir(d)):
            for line in read(os.path.join(d, fn)).splitlines():
                m = ROTE_RX.match(line.rstrip())
                if not m:
                    continue
                name, en = m.group(1).strip(), ""
                e = re.match(r"^(.+?)\s*\(([A-Za-z][^()]*)\)$", name)
                if e:
                    name, en = e.group(1).strip(), e.group(2).strip()
                if name in seen:
                    continue
                seen.add(name)
                out.append({"name": name, "en": en, "spheres": plain(m.group(2)), "text": plain(m.group(3)), "source": labels.get(folder, folder.replace("_", " ")),
                            **({"nephandi": True} if "Fallen" in folder else {})})
    return sorted(out, key=lambda r: r["name"])


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


def bos_items(line):
    """Строка Book of Secrets — одна или несколько черт: «**А (1).** **Б (1):** текст. **В (En) (2):** текст»,
    «**А (2), Б (2, пояснение), В (En, 2):** общий текст», «**А (4)**, **Б (En, 4):** общий текст».
    Возвращает (название, английское, цена, текст); у перечня через запятую текст общий."""
    out, wait = [], []
    for m in re.finditer(r"\*\*(.+?)\*\*([^*]*)", line):
        bold, tail = m.group(1).strip(), m.group(2)
        closed = bold.endswith(".")                      # «**А (1).**» — черта из основной книги, своего текста здесь нет
        items = []
        for part in split_top(bold.rstrip(".:").replace(";", ",")):
            groups = re.findall(r"\(([^()]*)\)", part)
            name = re.sub(r"\s*\([^()]*\)", "", part).strip()
            cost = next((c.group(0) for g in reversed(groups) for c in [re.search(r"\d+(?:\s*[–-]\s*\d+)?", g)] if c), "")
            en = next((e.group(0).strip(" ,") for g in groups for e in [re.match(r"[A-Za-z][A-Za-z '’/-]*", g.strip())] if e), "")
            if name and cost:
                items.append([name, en, cost, ""])
        text = re.sub(r"^\s*\((?:ядро|core)\)\s*", "", tail.strip()).strip(" ,")
        text = "" if text in (".", "") else text
        if closed and not text:                          # текста нет и не будет
            out += wait + items
            wait = []
        elif not text:                                   # «**А (4)**, **Б (4):** текст» — текст придёт от следующей
            wait += items
        else:
            for it in wait + items:
                it[3] = text
            out += wait + items
            wait = []
    return [tuple(x) for x in out + wait]


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
            if kind and line.startswith("- **"):
                for name, en, cost, body in bos_items(line[2:]):
                    if body:                             # без текста — отсылка к черте основной книги, она уже разобрана выше
                        add(kind, category, name, en, cost, body, "M20 Book of Secrets")
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
    subs = parse_subs()
    neph = parse_nephandi()
    factions += neph["sects"]
    factions += [{**x, "group": "marauders", "affinity": [], "affinityText": "любая (безумие — и фокус, и Сфера)", "practices": "безумие — фокус: личные причуды"} for x in MARAUDERS]
    invest, wonders = parse_investments(), parse_wonders()
    for sp in spheres:
        if neph["bySphere"].get(sp["key"]):
            sp["qliph"] = neph["bySphere"][sp["key"]]
    for f in factions:
        if subs.get(f["key"]):
            f["subs"] = subs[f["key"]]
    data = {
        "source": "Mage: The Ascension 20th Anniversary Edition — справочник проекта (пересказ механики)",
        "spheres": spheres, "ranks": RANKS, "arete": ARETE,
        "groups": [{"key": k, "name": n} for k, n, _ in GROUPS] + [{"key": "nephandi", "name": "Нефанди"}, {"key": "marauders", "name": "Мародёры"}], "factions": factions,
        "qliphoth": neph["qliphoth"], "fallenTools": neph["tools"], "sorcerer": parse_sorcerer(), "rotes": parse_rotes(),
        "essences": parse_essences(), "archetypes": parse_archetypes(),
        "backgrounds": parse_backgrounds(), "merits": parse_merits() + neph["merits"] + invest, "wonders": wonders,
        "quiet": QUIET, "pflaws": PFLAWS, "resonance": RESONANCE, "paradoxSpirits": parse_paradox_spirits(), "realms": REALMS, "focus": (lambda f: {**f, "paradigms": f["paradigms"] + neph["paradigms"],
                                                                                              "practices": f["practices"] + neph["practices"]})(parse_focus()),
        "gauntlet": GAUNTLET, "counter": COUNTER, "freebies": FREEBIES, "xp": XP, "casting": CASTING, "effect": EFFECT, "backlash": BACKLASH,
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
