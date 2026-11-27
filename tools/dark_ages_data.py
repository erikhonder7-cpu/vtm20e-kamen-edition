# tools/dark_ages_data.py
# Мир «Тёмные века» (V20 Dark Ages) — слой данных поверх V20: кланы и линии крови Тёмных веков с их Дисциплинами и слабостями,
# Факты биографии и правила создания вампира. Источник — справочник books/Мир Тьмы/Вампиры/_справочник/V20_Dark_Ages
# (01 — кланы, линии крови, создание; 04 — Факты биографии); Дисциплины сверены с английским текстом V20 Dark Ages
# («Clan Disciplines:»). Ключи кланов — как в data/clans.json (там, где запись есть), иначе новые.
# Пишет data/dark-ages.json. Запуск: python -I tools/dark_ages_data.py

import json
import os
import re
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REF = os.path.join(ROOT, "books", "Мир Тьмы", "Вампиры", "_справочник", "V20_Dark_Ages")
OUT = os.path.join(ROOT, "data", "dark-ages.json")

# имя в справочнике → ключ клана (как в data/clans.json; новые — только у Тёмных веков) и группа
CLANS = {
    "Ассамиты‑визири": ("viziriAssamitov", "clan"), "Бруха": ("brujah", "clan"), "Каппадокийцы": ("kappadokiytsy", "clan"),
    "Последователи Сета": ("setite", "clan"), "Гангрел": ("gangrel", "clan"), "Ласомбра": ("lasombra", "clan"),
    "Малкавиане": ("malkavian", "clan"), "Носферату": ("nosferatu", "clan"), "Равнос": ("ravnos", "clan"), "Тореадор": ("toreador", "clan"),
    "Тремер": ("tremere", "clan"), "Цимисхи": ("tzimisce", "clan"), "Вентру": ("ventrue", "clan"),
    # приложение B: касты Ассамитов
    "Ассамиты‑чародеи": ("charodeiAssamitov", "variant"), "Ассамиты‑воины": ("assamite", "variant"),
    "Ахримане": ("angraMaynyu", "bloodline"), "Анда": ("anda", "bloodline"), "Баали": ("baali", "bloodline"), "Бонсам": ("bonsam", "bloodline"),
    "Дети Осириса": ("detiOsirisa", "bloodline"), "Данава": ("danava", "bloodline"), "Горгульи": ("gorguli", "bloodline"),
    "Джованни": ("giovanni", "bloodline"), "Импундулу": ("impundulu", "bloodline"), "Киасиды": ("kiasidy", "bloodline"),
    "Ламии": ("lamii", "bloodline"), "Лианнан": ("liannan", "bloodline"), "Нагараджа": ("nagaradzha", "bloodline"),
    "Никтуку": ("nictuku", "bloodline"), "Раманга": ("ramanga", "bloodline"),
    "Салюбри‑Целители": ("salubriHealer", "variant"), "Салюбри‑Воины": ("salubriWarrior", "variant"),
    "Салюбри‑Наблюдатели": ("salubriWatcher", "variant"), "Истинные Бруха": ("istinnyeBruha", "bloodline"),
}
# англ. имена новых записей (у прочих — из data/clans.json)
EN = {"bonsam": "Bonsam", "danava": "Danava", "impundulu": "Impundulu", "nictuku": "Nictuku", "ramanga": "Ramanga",
      "salubriHealer": "Salubri Healers", "salubriWarrior": "Salubri Warriors", "salubriWatcher": "Salubri Watchers",
      "viziriAssamitov": "Assamite Viziers", "charodeiAssamitov": "Assamite Sorcerers", "assamite": "Assamite Warriors"}
DISC = {"Ясновидение": "auspex", "Величие": "presence", "Упокоение": "quietus", "Стремительность": "celerity", "Мощь": "potence",
        "Стойкость": "fortitude", "Некромантия": "necromancy", "Анимализм": "animalism", "Метаморфозы": "protean",
        "Доминирование": "dominate", "Затмение": "obtenebration", "Помешательство": "dementation", "Сокрытие": "obfuscate",
        "Фантасмагория": "chimerstry", "Серпентис": "serpentis", "Тауматургия": "thaumaturgy", "Преображение": "vicissitude",
        "Спиритус": "spiritus", "Демонион": "daimoinon", "Абомбве": "abombwe", "Бардо": "bardo", "Мистификация": "mytherceria",
        "Огам": "ogham", "Полёт": "flight", "Валерен": "valeren", "Темпорис": "temporis", "Чародейство Ассамитов": "assamiteSorcery"}
# Факты биографии V20 Dark Ages (файл 04): Убежища, Чёрной руки и Ритуалов нет; новые — Владение, Слава, Статус
BACKGROUNDS = ["Allies", "Alternate Identity", "Contacts", "Domain", "Fame", "Generation", "Herd", "Influence", "Mentor", "Resources", "Retainers", "Status"]
# создание (файл 01, «Пять шагов»): 4 точки Дисциплин, 12-е поколение, кровь 1d10 + Владение + Стадо; Каитиф без Статуса
CREATION = {"disciplines": 4, "generation": 12, "bloodRoll": "1d10", "bloodPlus": ["Domain", "Herd"], "caitiffNoStatus": True}
YEAR = 1242
# архетипы V20 DA (файл 01, «Архетипы»): там, где тот же архетип уже есть в системе, — его системное имя
# (сверено по тому, как он восстанавливает Волю); новые для Тёмных веков — имя из справочника
ARCH_NAMES = {"Architect": "Творец", "Autocrat": "Автократ", "Bon Vivant": "Бонвиван", "Bravo": "Головорез", "Caregiver": "Опекун",
              "Celebrant": "Подвижник", "Chameleon": "Хамелеон", "Child": "Ребёнок", "Competitor": "Победитель", "Conformist": "Конформист",
              "Conniver": "Махинатор", "Creep Show": "Фрик", "Curmudgeon": "Брюзга", "Dabbler": "Непоседа", "Deviant": "Девиант",
              "Enigma": "Загадка", "Eye of the Storm": "Око бури", "Fanatic": "Фанатик", "Gallant": "Нарцисс", "Guru": "Гуру",
              "Idealist": "Идеалист", "Judge": "Судья", "Loner": "Одиночка", "Martyr": "Мученик", "Masochist": "Мазохист",
              "Monster": "Чудовище", "Pedagogue": "Наставник", "Penitent": "Кающийся грешник", "Perfectionist": "Перфекционист",
              "Rebel": "Бунтарь", "Rogue": "Эгоцентрист", "Sadist": "Садист", "Soldier": "Солдат", "Survivor": "Борец",
              "Thrill-Seeker": "Сорвиголова", "Traditionalist": "Традиционалист", "Visionary": "Визионер"}


def read(fn):
    with open(os.path.join(REF, fn), encoding="utf-8") as f:
        t = f.read()
    return t.split("---", 2)[2] if t.startswith("---") else t


def md_inline(s):
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s.strip())
    return re.sub(r"\*(.+?)\*", r"<em>\1</em>", s)


def parse_clans(clans_json):
    fn = next(f for f in sorted(os.listdir(REF)) if f.startswith("01"))
    text = read(fn)
    part = text.split("## Кланы", 1)[1].split("### Прочие сведения", 1)[0]
    by_key = {c["key"]: c for c in clans_json}
    out = []
    for line in part.splitlines():
        if not line.startswith("| **"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        name_cell, nick, discs, weak = cells[0], cells[1], cells[2], cells[3]
        name = re.match(r"\*\*(.+?)\*\*", name_cell).group(1)
        extra = re.sub(r"^\*\*.+?\*\*\s*", "", name_cell).strip("() ")   # «(Валькирьи, Сёстры)» или «(прил. B)»
        key, group = CLANS[name]
        keys = []
        for part_d in re.split(r",|\+", re.sub(r"\([^)]*\)", "", discs)):   # «Некромантия (первичен …, вторичен …)» — скобки прочь до разбора
            nm = part_d.strip()
            k = DISC.get(nm)
            if k:
                keys.append(k)
        choice = "две дисциплины исходного клана" in discs
        base = by_key.get(key, {})
        nick = nick.strip("()")
        nickname = (nick if nick and nick != "—" and "линия" not in nick.lower() and not extra else extra if extra and "прил." not in extra else nick)
        out.append({"key": key, "name": name.replace("‑", "-"), "en": base.get("en") or EN.get(key, ""), "group": group,
                    "nickname": "" if nickname in ("—", None) else nickname, "origin": nick if extra else "",
                    "sect": "", "disciplines": keys, "choice": ["original"] if choice else [],
                    "disciplinesText": re.sub(r"\s+", " ", discs), "weakness": f"<p>{md_inline(weak)}</p>", "era": "darkAges",
                    "isNew": key not in by_key})
    out.append({**by_key["caitiff"], "era": "darkAges", "sect": "", "weakness": "<p>Клановой слабости нет; при создании Статус недоступен (V20 Dark Ages).</p>"})
    return out


# в текстах справочника Факты названы по V20 DA; в системе у них свои русские имена (Информаторы, Богатство, Подручные, Домен…)
BG_WORDS = [("доступ к своим Связям, Влиянию, Ресурсам", "доступ к своим Информаторам, Влиянию, Богатству"),
            ("проникновения во Владение", "проникновения в Домен"),
            ("бросок рейтинга Связей", "бросок рейтинга Информаторов"), ("Можно объединять", "Можно сделать общим")]
# ссылки на страницы книги и файлы справочника в лист не идут
BG_REFS = [re.compile(r"\s*Подробнее — стр\. \d+\."), re.compile(r"Охота — стр\. \d+ \(см\. `[^`]+`\)\.\s*")]
BG_DROP = re.compile(r"`[^`]+\.md`|^-{3,}$")


def md_block_html(lines):
    """Кусок справочника (абзацы, списки «- », таблицы «| … |») → HTML в оформлении data/backgrounds.json."""
    out, para, items, rows = [], [], [], []

    def flush():
        if para:
            out.append(f"<p>{md_inline(' '.join(para))}</p>"); para.clear()
        if items:
            out.append("<ul>" + "".join(f"<li>{md_inline(i)}</li>" for i in items) + "</ul>"); items.clear()
        if rows:
            head, body = rows[0], rows[1:]
            out.append("<table><thead><tr>" + "".join(f"<th>{md_inline(c)}</th>" for c in head) + "</tr></thead><tbody>"
                       + "".join("<tr>" + "".join(f"<td>{md_inline(c)}</td>" for c in r) + "</tr>" for r in body) + "</tbody></table>")
            rows.clear()

    for ln in lines:
        s = ln.strip()
        for rx in BG_REFS:
            s = rx.sub("", s).strip()
        if not s or s == "-" or BG_DROP.search(s):
            flush(); continue
        if s.startswith("|"):
            if para or items:
                flush()
            cells = [c.strip() for c in s.strip("|").split("|")]
            if not all(re.fullmatch(r":?-+:?", c) for c in cells):
                rows.append(cells)
        elif s.startswith("- "):
            if para or rows:
                flush()
            items.append(s[2:])
        else:
            if items or rows:
                flush()
            para.append(s)
    flush()
    return "\n".join(out)


def parse_backgrounds():
    fn = next(f for f in sorted(os.listdir(REF)) if f.startswith("04"))
    text = read(fn).split("## Общие", 1)[0]
    out = {}
    for sec in re.split(r"^## ", text, flags=re.M)[1:]:
        head, *body = sec.splitlines()
        m = re.search(r"\(([A-Za-z ]+)\)", head)
        if not m:
            continue
        html = md_block_html(body)
        for a, b in BG_WORDS:
            html = html.replace(a, b)
        out[m.group(1)] = html
    missing = [b for b in BACKGROUNDS if b not in out]
    assert not missing, f"в справочнике 04 нет Фактов: {missing}"
    return [{"en": b, "html": out[b]} for b in BACKGROUNDS]


def parse_archetypes():
    fn = next(f for f in sorted(os.listdir(REF)) if f.startswith("01"))
    part = read(fn).split("## Архетипы", 1)[1].split("\n## ", 1)[0]
    out = []
    for line in part.splitlines():
        m = re.match(r"\|\s*(.+?)\s*\(([^)]+)\)\s*\|\s*(.+?)\s*\|$", line.strip())
        if not m:
            continue
        ru, en, regain = m.group(1), m.group(2).replace("‑", "-"), m.group(3)
        out.append({"name": ARCH_NAMES.get(en, ru), "en": en, "regain": regain})
    assert len(out) == 43, len(out)
    return out


# подробности Дорог (файл 13, раздел 5 — пересказ V20 DA, гл. 3): содержательные поля; пометки для обработки
# («Особенность для базы», «Ограничение для нейросети», «Иерархия: …», «Добродетели» — они и так в записи) в лист не идут
ROAD_SKIP = re.compile(r"^\*\*(Добродетели|Иерархия|Особенность для базы|Ограничение для нейросети|Ограничение|Статус|Уровень детализации|"
                       r"Что добавить[^*]*|Риск упрощения|Правило цитирования[^*]*|Системная запись для Kamen|Родительская Дорога|Дополняет)\s*:")


def parse_roads():
    """Раздел 5 файла 13: «## 5.N. Дорога … — Via …» и «### 5.N.M. Путь … — Path of …» → {английское имя: html}."""
    fn = next(f for f in sorted(os.listdir(REF)) if f.startswith("13"))
    part = read(fn).split("# 5. Подробные описания", 1)[1].split("\n# 6.", 1)[0]
    out = {}
    for sec in re.split(r"^#{2,3} 5\.\d+(?:\.\d+)?\.\s*", part, flags=re.M)[1:]:
        head, *body = sec.splitlines()
        m = re.search(r"\(([A-Za-z][^)]*)\)\s*$", head) or re.search(r"[—–]\s*([A-Z][A-Za-z' ]+?)\s*(?:\(|$)", head)
        if not m:
            continue
        en = m.group(1).strip()
        keep = [l for l in body if not ROAD_SKIP.match(l.strip()) and not l.startswith("---")]
        html = md_block_html(keep)
        if html:
            out[en] = html
    assert len(out) >= 30, len(out)
    return out


def parse_necro_da():
    """Пути Некромантии в версии V20 DA (файл 09): у Пути Кости, «Трупа в чудовище», Пепла, Стеклянного и Склепа силы не те,
    что в V20, — поэтому свои записи эпохи. «### Путь … (Path of …) — клан» → {name, en, clans, html, powers[{level, name, en, html}]}."""
    fn = next(f for f in sorted(os.listdir(REF)) if f.startswith("09"))
    part = read(fn).split("## Некромантия", 1)[1].split("## Ритуалы Некромантии", 1)[0]
    out = []
    for sec in re.split(r"^### ", part, flags=re.M)[1:]:
        head, *body = sec.splitlines()
        m = re.match(r"(.+?)\s*\(([^)]+)\)\s*(?:[—–]\s*(.+))?$", head.strip())
        if not m:
            continue
        name, en, clans = m.group(1).strip(), m.group(2).strip().replace("’", "'"), (m.group(3) or "").strip()
        intro, powers, cur = [], [], None
        for line in body:
            pm = re.match(r"- \*\*(•+)\s+(.+?)\s*\(([^)]+)\):\*\*\s*(.*)$", line.strip())
            if pm:
                first = pm.group(4)
                cur = {"level": len(pm.group(1)), "name": pm.group(2).strip(), "en": pm.group(3).strip().replace("’", "'"),
                       "lines": [first[:1].upper() + first[1:]]}           # описание силы — с заглавной
                powers.append(cur)
            elif cur:
                cur["lines"].append(line)
            elif line.strip():
                intro.append(line.strip())
        assert [p["level"] for p in powers] == [1, 2, 3, 4, 5], (en, [p["level"] for p in powers])
        lead = f"<p><em>Источник: V20 Dark Ages, гл. 9.{' Традиция: ' + clans + '.' if clans else ''}</em></p>"
        out.append({"name": name, "en": en, "era": "darkAges", "source": "V20 Dark Ages",
                    "html": lead + (f"<p>{md_inline(' '.join(intro))}</p>" if intro else ""),
                    "powers": [{"level": p["level"], "name": p["name"], "en": p["en"], "html": md_block_html(p["lines"])} for p in powers]})
    assert len(out) == 9, len(out)
    return out


def parse_thaum_da():
    """Семь путей Тауматургии V20 DA (файл 10, гл. 10): малые — одна способность, растущая по таблице уровней (у каждого уровня
    своя карточка: общее правило + строка таблицы + особенность уровня); великие — пять разных сил. → [{en, html, powers}]."""
    fn = next(f for f in sorted(os.listdir(REF)) if f.startswith("10"))
    part = read(fn).split("### Малые пути", 1)[1].split("### Ритуалы Тауматургии", 1)[0]
    # «10 м» в пересказе — у книги «ten yards» (с. 297): ярды, а не метры
    part = part.replace("на **10 м**", "на **10 ярдов (≈9 м)**").replace("**каждый доп. успех +10 м**", "**каждый доп. успех +10 ярдов**")
    out = []
    for sec in re.split(r"^#### ", part, flags=re.M)[1:]:
        head, *body = sec.splitlines()
        m = re.match(r"(.+?)\s*\(«(.+?)»\)", head.strip())
        en, ru = m.group(1).strip(), m.group(2).strip()
        body = [l for l in body if not l.startswith("### ")]
        greater = [l for l in body if re.match(r"- \*\*•+\s+.+?\(.+?\):\*\*", l.strip())]
        rows = [[c.strip() for c in l.strip().strip("|").split("|")] for l in body if l.startswith("|")]
        rows = [r for r in rows if not all(re.fullmatch(r":?-+:?", c) for c in r)]
        if greater:
            intro, powers, cur = [], [], None
            for line in body:
                pm = re.match(r"- \*\*(•+)\s+(.+?)\s*\(([^)]+)\):\*\*\s*(.*)$", line.strip())
                if pm:
                    t = pm.group(4)
                    cur = {"level": len(pm.group(1)), "name": pm.group(2).strip(), "en": pm.group(3).strip(), "lines": [t[:1].upper() + t[1:]]}
                    powers.append(cur)
                elif cur:
                    cur["lines"].append(line)
                else:
                    intro.append(line)
            powers = [{"level": p["level"], "name": p["name"], "en": p["en"], "html": md_block_html(p["lines"])} for p in powers]
            html = md_block_html(intro)
        else:
            # малый путь: общее правило — родителю; уровень — строка таблицы и особенность «- **••:** …»
            head_row, data = rows[0], [r for r in rows[1:] if re.fullmatch(r"•+", r[0])]
            notes = {len(n.group(1)): n.group(2) for n in (re.match(r"- \*\*(•+):\*\*\s*(.*)$", l.strip()) for l in body) if n}
            general = [l for l in body if not l.startswith("|") and not re.match(r"- \*\*•+:\*\*", l.strip())]
            html = md_block_html(general)
            powers = []
            for r in data:
                lv = len(r[0])
                cells = "; ".join(f"{h}: {v}" for h, v in zip(head_row[1:], r[1:]))
                note = notes.get(lv, "")
                text = [f"**Уровень {lv}** — {cells}."] + ([note[:1].upper() + note[1:]] if note else []) + ["Общее правило пути — в описании пути."]
                short = re.split(r"\s*[(;]", r[1])[0].strip()            # «Туман или лёгкий ветер (+1 …); …» → «Туман или лёгкий ветер»
                powers.append({"level": lv, "name": f"{ru} — {short}", "en": "", "html": md_block_html(text)})
        assert [p["level"] for p in powers] == [1, 2, 3, 4, 5], (en, [p["level"] for p in powers])
        out.append({"en": en, "name": ru, "html": "<p><em>Источник: V20 Dark Ages, гл. 10.</em></p>" + html, "powers": powers})
    assert len(out) == 7, [p["en"] for p in out]
    return out


def parse_necro_paths():
    """Пути Некромантии V20 DA (файл 09, заголовки «### Путь … (Path of …)»): английские имена — по ним мастер отбирает пути
    из data/disciplines.json (там у части путей записи V20). Пути Тауматургии Тёмных веков в данных и так помечены era."""
    fn = next(f for f in sorted(os.listdir(REF)) if f.startswith("09"))
    part = read(fn).split("## Некромантия", 1)[1].split("## Ритуалы", 1)[0]
    out = [m.group(1).replace("’", "'") for m in re.finditer(r"^### .*?\(([A-Za-z’' ]+)\)", part, re.M)]
    assert len(out) >= 9, out
    return out


def parse_abombwe():
    """Абомбве (Abombwe) — Дисциплина Бонсам, есть только в V20 DA (файл 05): уровни «### •… Имя (English)» и описание."""
    fn = next(f for f in sorted(os.listdir(REF)) if f.startswith("05"))
    part = read(fn).split("## Абомбве", 1)[1].split("\n---", 1)[0]
    intro, powers, cur = [], [], None
    for line in part.splitlines()[1:]:
        m = re.match(r"### (•+) (.+?) \((.+?)\)\s*$", line.strip())
        if m:
            cur = {"level": len(m.group(1)), "name": m.group(2).strip(), "en": m.group(3).replace("’", "'"), "lines": []}
            powers.append(cur)
        elif cur:
            cur["lines"].append(line)
        elif line.strip():
            intro.append(line.strip())
    assert [p["level"] for p in powers] == [1, 2, 3, 4, 5, 6], [p["level"] for p in powers]
    return {"key": "abombwe", "name": "Абомбве", "en": "Abombwe", "source": "V20 Dark Ages", "era": "darkAges", "clans": "bonsam",
            # правила — списком разделов {title, html}, как в data/disciplines.json (module/data/text-split.mjs)
            "rules": [{"title": "Источник и доступность", "html": f"<p><strong>Источник:</strong> V20 Dark Ages, гл. 5. <strong>Доступна:</strong> Бонсам.</p><p>{md_inline(' '.join(intro))}</p>"}],
            "powers": [{"level": p["level"], "name": p["name"], "en": p["en"], "html": md_block_html(p["lines"])} for p in powers]}


def build():
    with open(os.path.join(ROOT, "data", "clans.json"), encoding="utf-8") as f:
        clans_json = json.load(f)
    clans = parse_clans(clans_json)
    data = {"source": "V20 Dark Ages — справочник проекта (кланы и линии сверены с английским текстом)", "year": YEAR,
            "clans": clans, "backgrounds": parse_backgrounds(), "archetypes": parse_archetypes(),
            "bloodPaths": {"necromancy": parse_necro_paths()}, "necromancyPaths": parse_necro_da(), "thaumaturgyPaths": parse_thaum_da(), "roads": parse_roads(),
            "disciplines": [parse_abombwe()], "creation": CREATION}
    text = json.dumps(data, ensure_ascii=False, indent=1)
    # на Windows файл бывает на миг занят другим процессом (OSError 22) — несколько попыток
    for attempt in range(10):
        try:
            with open(OUT, "w", encoding="utf-8", newline="\n") as f:
                f.write(text)
            break
        except OSError:
            if attempt == 9:
                raise
            time.sleep(0.5)
    new =[c["key"] for c in clans if c.get("isNew")]
    return f"кланов и линий {len(clans)} (новых записей: {', '.join(new)}), Фактов {len(data['backgrounds'])}"


if __name__ == "__main__":
    print(build())
