# tools/magic_extra.py
# Пути и ритуалы магии крови из книг Revised, 2nd Edition и Тёмных веков, а также Blood Magic и Blood Sacrifice.
# Вызывается из build_data.main() после supplements.apply() — то есть после основной книги и дополнений V20.
#
# Книги размечены по-разному, поэтому разбор общий:
#   силы пути — таблица «Ур./У./Уровень | Сила/Способность | …», пункты «- **• Сила.** …», «- **3 Сила (En):** …»
#               или заголовки «### • Сила» / «#### 3 Сила»;
#   ритуалы   — таблицы с колонкой «Ритуал» (уровень — колонкой или заголовком «Уровень N»), заголовки
#               «### Имя (ур. N)» / «(ритуал N-го уровня)», пункты «- **Имя (En):** …», «- **Имя, ур. N:** …»,
#               «- **Ур. N:** **Имя** — …» и абзацы «**Имя**» / «**Имя (En), ур. N** — …» с телом ниже.
# Повторы (по английскому названию, иначе по русскому) отсекаются; что раньше в списке — то главнее:
# V20 (уже в данных) → Revised → 2nd Edition → Тёмные века. Записи Тёмных веков помечены era = "darkAges".

import os, re, html, unicodedata
from build_data import REF, read, md_to_html, split_name, parse_roll
from supplements import grab, level_of, heading_level, src_p

DA = "darkAges"

# книги (подпись в «Источник: …»)
GTC = "Guide to the Camarilla (Revised)"
GTS = "Guide to the Sabbat (Revised, 1999)"
GTA = "Guide to the Anarchs (Revised)"
PGS = "The Player's Guide to the Sabbat (2nd Edition, 1992)"
PG2 = "The Vampire Players Guide (2nd Edition)"
STH = "Vampire Storytellers Handbook (Revised)"
REV = "Vampire: The Masquerade Revised"
CB_TREM, CB_GIO = "Clanbook: Tremere (Revised)", "Clanbook: Giovanni (Revised)"
BM = "Blood Magic: Secrets of Thaumaturgy"
BS = "Blood Sacrifice: The Thaumaturgy Companion"
CHI, MIL, NO, WW, BHD = ("Chicago by Night (2nd Edition)", "Milwaukee by Night (2nd Edition)", "New Orleans by Night (2nd Edition)",
                         "Vampire: The Wild West", "Bloody Hearts: Diablerie Britain (2nd Edition)")
V20DA = "V20 Dark Ages"
TOS, DAC, LOW = "V20 Dark Ages: Tome of Secrets", "V20 Dark Ages Companion", "Dark Ages: Player's Guide to Low Clans"
HOT, DA02, DASC = "Dark Ages: House of Tremere", "Dark Ages: Vampire (2002)", "Dark Ages Storytellers Companion"

# ── Пути: (файл, цепочка заголовков, Дисциплина, книга, эпоха, примечание, {name/en — замена}) ─────────────
# group=True — раздел содержит несколько путей подзаголовками или жирными строками «**Путь (En)**».
PATHS = [
    # Revised / 2nd Edition
    ("Revised_Гайды_сект/03c_Шабаш_1999_Дисциплины_и_магия.md", [r"4\. Некромантия"], "necromancy", GTS, "", "Некромантия Вестников Черепов.",
     {"name": "Путь Мортуус", "en": "Mortuus Path"}),
    ("Revised_Гайды_сект/04b_Шабаш_1992_Players_Guide_Дисциплины_ритуалы_способности_реликвии.md", [r"3\. Тауматургия Шабаша", r"Путь Дара Морфея"],
     "thaumaturgy", PGS, "", "Тауматургия антитрибу Тремер.", None),
    ("Revised_Кланбуки/02_Тремер.md", [r"Путь создания теней"], "thaumaturgy", CB_TREM, "", "",
     {"name": "Путь создания теней", "en": "Shadowcrafting"}),
    ("Blood_Magic/01_Пути_Тауматургии.md", [r"Новые пути Тауматургии"], "thaumaturgy", BM, "", "", "group"),
    # пути кольдунов редакции Blood Magic (Revised): другие силы, чем у Укладов V20 — отдельные записи
    ("Blood_Magic/05_Колдунство_цимисхе_и_приложение_существа.md", [r"Колдунское колдовство \(Koldunic", r"Путь Земли"], "koldunism", BM, "", "Путь кольдунов в редакции Blood Magic; в V20 его сменил Уклад Земли.", None),
    ("Blood_Magic/05_Колдунство_цимисхе_и_приложение_существа.md", [r"Колдунское колдовство \(Koldunic", r"Путь Ветра"], "koldunism", BM, "", "Путь кольдунов в редакции Blood Magic; в V20 его сменил Уклад Ветра.", None),
    ("Blood_Magic/05_Колдунство_цимисхе_и_приложение_существа.md", [r"Колдунское колдовство \(Koldunic", r"Путь Воды"], "koldunism", BM, "", "Путь кольдунов в редакции Blood Magic; в V20 его сменил Уклад Воды.", None),
    ("Blood_Magic/05_Колдунство_цимисхе_и_приложение_существа.md", [r"Колдунское колдовство \(Koldunic", r"Путь Огня"], "koldunism", BM, "", "Путь кольдунов в редакции Blood Magic; в V20 его сменил Уклад Огня.", None),
    ("Blood_Magic/04_Колдовство_сетитов_и_ассамитов.md", [r"Сетитское колдовство", r"Путь «Змея внутри»"], "setiteSorcery", BM, "", "Путь сетитского колдовства.", None),
    ("Blood_Magic/04_Колдовство_сетитов_и_ассамитов.md", [r"Сетитское колдовство", r"Путь Высохшего Нила"], "setiteSorcery", BM, "", "Путь сетитского колдовства.", None),
    ("Blood_Sacrifice/01_Общие_правила_и_Акху.md", [r"2\. Акху", r"Путь Божественной Руки"], "setiteSorcery", BS, "", "Путь Акху.", None),
    ("Blood_Sacrifice/01_Общие_правила_и_Акху.md", [r"2\. Акху", r"Путь Дуата"], "setiteSorcery", BS, "", "Путь Акху.", None),
    ("Blood_Sacrifice/02_Дур-Ан-Ки.md", [r"2\. Завет Нергала"], "assamiteSorcery", BS, "", "Путь Дур‑Ан‑Ки.", None),
    ("Blood_Sacrifice/02_Дур-Ан-Ки.md", [r"4\. Музыка сфер"], "assamiteSorcery", BS, "", "Путь Дур‑Ан‑Ки.", None),
    ("Blood_Sacrifice/03_Садхана.md", [r"2\. Путь Нектара крови"], "setiteSorcery", BS, "", "Путь Садханы.", None),
    ("Blood_Sacrifice/03_Садхана.md", [r"3\. Путь Кармы"], "setiteSorcery", BS, "", "Путь Садханы.", None),
    ("Blood_Sacrifice/04_Ванга.md", [r"3\. Фортуна ориша"], "setiteSorcery", BS, "", "Путь Ванги.", None),
    ("Blood_Sacrifice/04_Ванга.md", [r"4\. Голос дикой природы"], "setiteSorcery", BS, "", "Путь Ванги.", None),
    ("Blood_Sacrifice/05_Приложение_Нахуаллотль_Тлацике_ритуалы_и_талисманы.md", [r"3\. Тлацике", r"Путь Хлыста"], "setiteSorcery", BS, "",
     "Путь Нахуаллотля (Тлацике).", None),
    ("Revised_Основные/02a_Players_Guide_2nd_создание_и_дисциплины.md", [r"6\. Дисциплины", r"Тауматургия \(2"], "thaumaturgy", PG2, "", "", "group"),
    ("Revised_Основные/02b_Players_Guide_2nd_общество_кланы_дисциплины.md", [r"7\. Новые", r"Некромантия"], "necromancy", PG2, "", "", "group"),
    # Тёмные века
    ("V20_Dark_Ages/09_Магия_крови_Некромантия.md", [r"Некромантия \(Necromancy\)"], "necromancy", V20DA, DA, "", "group"),
    ("V20_Dark_Ages/10_Магия_крови_Тауматургия.md", [r"Тауматургия \(Thaumaturgy\)", r"Малые пути"], "thaumaturgy", V20DA, DA, "Малый путь.", "group"),
    ("V20_Dark_Ages/10_Магия_крови_Тауматургия.md", [r"Тауматургия \(Thaumaturgy\)", r"Великие пути"], "thaumaturgy", V20DA, DA, "Великий путь.", "group"),
    ("DA_Tome_of_Secrets/03_Колдовство_кольдунов.md", [r"Беловежская крайна"], "koldunism", TOS, DA, "", None),
    ("DA_Tome_of_Secrets/04_Некромантия.md", [r"Путь Черепов"], "necromancy", TOS, DA, "", None),
    ("DA_Tome_of_Secrets/04_Некромантия.md", [r"Путь Скорби"], "necromancy", TOS, DA, "", None),
    ("DA_Tome_of_Secrets/05_Чародейство_Сетитов.md", [r"Путь Откровений Дуата"], "setiteSorcery", TOS, DA, "Путь Ведьм Эхидны.", None),
    ("DA_Tome_of_Secrets/05_Чародейство_Сетитов.md", [r"Путь Откровений Эдема"], "setiteSorcery", TOS, DA, "Путь Ведьм Эхидны.", None),
    ("DA_Tome_of_Secrets/05_Чародейство_Сетитов.md", [r"Путь Откровений Мидгарда"], "setiteSorcery", TOS, DA, "Путь Ведьм Эхидны.", None),
    ("DA_Tome_of_Secrets/10_Нечестивое_Тёмная_Тауматургия_демоны.md", [r"Тёмная Тауматургия", r"Путь «Die"], "darkThaumaturgy", TOS, DA, "",
     {"name": "Тирания Змея Бездны", "en": "Die Heriroschaft des Wyrm"}),
    ("DA_Tome_of_Secrets/10_Нечестивое_Тёмная_Тауматургия_демоны.md", [r"Тёмная Тауматургия", r"Путь «Rego"], "darkThaumaturgy", TOS, DA, "",
     {"name": "Закон призыва", "en": "Rego Calatio"}),
    ("DA_Low_Clans/10_Тауматургия_Perdo_Magica_и_ритуалы.md", [r"Новый путь: Perdo Magica"], "thaumaturgy", LOW, DA, "Контрмагия.",
     {"name": "Perdo Magica", "en": "Perdo Magica", "single": True}),
    ("DA_Companion/04_Магия_крови.md", [r"Садхана", r"Нектар крови"], "setiteSorcery", DAC, DA, "Малый путь Садханы.", None),
    ("DA_Companion/04_Магия_крови.md", [r"Садхана", r"Путь Кармы"], "setiteSorcery", DAC, DA, "Великий путь Садханы.", None),
    ("DA_House_of_Tremere/02_Управление_магией_контрмагия_создание_ритуалов.md", [r"Путь Управления Магией"], "thaumaturgy", HOT, DA, "",
     {"name": "Путь Управления Магией", "en": "", "single": True}),
]

# ── Ритуалы: (файл, цепочка заголовков или None — весь файл, Дисциплина, книга, эпоха, примечание) ─────────
RITUALS = [
    # Revised / 2nd Edition
    ("Revised_Гайды_сект/01d_Камарилья_Тауматургия_Пути_и_ритуалы.md", [r"Ритуалы \(Камарилья\)"], "thaumaturgy", GTC, "", "Тауматургия Камарильи."),
    ("Revised_Гайды_сект/03c_Шабаш_1999_Дисциплины_и_магия.md", [r"1\. Тёмная Тауматургия", r"Ритуалы Тёмной"], "darkThaumaturgy", GTS, "", ""),
    ("Revised_Гайды_сект/03c_Шабаш_1999_Дисциплины_и_магия.md", [r"4\. Некромантия", r"Некромантские ритуалы"], "necromancy", GTS, "", "Вестники Черепов."),
    ("Revised_Гайды_сект/03c_Шабаш_1999_Дисциплины_и_магия.md", [r"7\. Тауматургия Шабаша", r"Ритуалы Тауматургии Шабаша"], "thaumaturgy", GTS, "", "Тауматургия Шабаша."),
    ("Revised_Гайды_сект/04b_Шабаш_1992_Players_Guide_Дисциплины_ритуалы_способности_реликвии.md", [r"3\. Тауматургия Шабаша", r"Новые тауматургические ритуалы"],
     "thaumaturgy", PGS, "", "Тауматургия Шабаша."),
    ("Revised_Гайды_сект/02_Анархи.md", [r"Тауматургия анархов"], "thaumaturgy", GTA, "", "Тауматургия анархов."),
    ("Revised_Кланбуки/02_Тремер.md", [r"Ритуалы Тауматургии"], "thaumaturgy", CB_TREM, "", ""),
    ("Revised_Кланбуки/09_Джованни.md", [r"Некромантия Писаноб", r"Ритуалы Писаноб"], "necromancy", CB_GIO, "", "Некромантия Писаноб."),
    ("Revised_Кланбуки/09_Джованни.md", [r"Новые ритуалы некромантии"], "necromancy", CB_GIO, "", "Джованни."),
    ("Revised_Основные/02a_Players_Guide_2nd_создание_и_дисциплины.md", [r"6\. Дисциплины", r"Ритуалы Тауматургии"], "thaumaturgy", PG2, "", ""),
    ("Blood_Magic/02_Ритуалы_Тауматургии.md", [r"Ритуалы Тауматургии"], "thaumaturgy", BM, "", ""),
    ("Blood_Magic/03_Некромантия_ритуалы_и_вуду.md", [r"2\. Ритуалы Некромантии"], "necromancy", BM, "", "Западная некромантия."),
    ("Blood_Magic/04_Колдовство_сетитов_и_ассамитов.md", [r"Сетитское колдовство", r"Ритуалы сетитов"], "setiteSorcery", BM, "", ""),
    ("Blood_Magic/04_Колдовство_сетитов_и_ассамитов.md", [r"Ассамитское колдовство", r"Ритуалы ассамитов"], "assamiteSorcery", BM, "", ""),
    ("Blood_Magic/05_Колдунство_цимисхе_и_приложение_существа.md", [r"Колдунское колдовство \(Koldunic", r"Ритуалы колдунов"], "koldunism", BM, "", ""),
    ("Blood_Sacrifice/01_Общие_правила_и_Акху.md", [r"2\. Акху", r"Ритуалы Акху"], "setiteSorcery", BS, "", "Ритуал Акху."),
    ("Blood_Sacrifice/02_Дур-Ан-Ки.md", [r"5\. Ритуалы Дур"], "assamiteSorcery", BS, "", "Ритуал Дур‑Ан‑Ки."),
    ("Blood_Sacrifice/03_Садхана.md", [r"5\. Ритуалы Садханы"], "setiteSorcery", BS, "", "Ритуал Садханы."),
    ("Blood_Sacrifice/04_Ванга.md", [r"5\. Ритуалы Ванги"], "setiteSorcery", BS, "", "Ритуал Ванги."),
    ("Blood_Sacrifice/05_Приложение_Нахуаллотль_Тлацике_ритуалы_и_талисманы.md", [r"1\. Дополнительные ритуалы Некромантии"], "necromancy", BS, "", ""),
    ("Blood_Sacrifice/05_Приложение_Нахуаллотль_Тлацике_ритуалы_и_талисманы.md", [r"2\. Колдовство Кольдунов"], "koldunism", BS, "", ""),
    ("Blood_Sacrifice/05_Приложение_Нахуаллотль_Тлацике_ритуалы_и_талисманы.md", [r"3\. Тлацике", r"Ритуалы Нахуаллотля"], "setiteSorcery", BS, "", "Ритуал Нахуаллотля."),
    ("Прочее/01_Чикаго_ночью_Chicago_by_Night.md", [r"Новые ритуалы Тремер"], "thaumaturgy", CHI, "", ""),
    ("Прочее/04_Милуоки_ночью_Milwaukee_by_Night.md", [r"Новые ритуалы Тремер"], "thaumaturgy", MIL, "", ""),
    ("Прочее/05_Новый_Орлеан_ночью_New_Orleans_by_Night.md", [r"Особые ритуалы"], "thaumaturgy", NO, "", ""),
    # Тёмные века
    ("V20_Dark_Ages/09_Магия_крови_Некромантия.md", [r"Ритуалы Некромантии"], "necromancy", V20DA, DA, ""),
    ("V20_Dark_Ages/10_Магия_крови_Тауматургия.md", [r"Тауматургия \(Thaumaturgy\)", r"Ритуалы Тауматургии"], "thaumaturgy", V20DA, DA, ""),
    ("V20_Dark_Ages/11_Магия_Бездны_Колдовство_и_Комбинации.md", [r"Мистицизм Бездны", r"Ритуалы"], "obtenebration", V20DA, DA, "Мистика Бездны."),
    ("DA_Tome_of_Secrets/01_Мистика_Бездны.md", [r"Ритуалы Мистики Бездны"], "obtenebration", TOS, DA, "Мистика Бездны."),
    ("DA_Tome_of_Secrets/03_Колдовство_кольдунов.md", [r"Обряды крайн"], "koldunism", TOS, DA, "Обряд крайны."),
    ("DA_Tome_of_Secrets/09_Вера_святыни_и_библейская_некромантия.md", [r"Библейская некромантия"], "necromancy", TOS, DA, "Библейская некромантия."),
    ("DA_Tome_of_Secrets/11_Комбинации_и_ритуалы_игроков.md", [r"Ритуалы"], "auto", TOS, DA, ""),
    ("DA_Low_Clans/10_Тауматургия_Perdo_Magica_и_ритуалы.md", None, "thaumaturgy", LOW, DA, ""),
    ("DA_Companion/04_Магия_крови.md", [r"Зороастрийские ритуалы"], "assamiteSorcery", DAC, DA, "Зороастрийский ритуал (Дур‑Ан‑Ки)."),
    ("DA_Companion/04_Магия_крови.md", [r"Ритуалы «Осаждённого"], "thaumaturgy", DAC, DA, "Ритуал «осаждённого колдуна»."),
    ("DA_House_of_Tremere/03_Тауматургические_ритуалы_Цеориса.md", None, "thaumaturgy", HOT, DA, "Ритуал Цеориса."),
    ("DA_House_of_Tremere/04_Губительные_жидкости.md", None, "thaumaturgy", HOT, DA, "Губительная жидкость (алхимия Цеориса)."),
    ("DA_Storytellers_Companion/02_Дисциплины_линий_крови.md", [r"Силы Горгулий", r"Тауматургические ритуалы Горгулий"], "thaumaturgy", DASC, DA, "Ритуал Горгулий."),
]

# ── Разбор ──────────────────────────────────────────────────────────────────

def akey(s):
    """Ключ сверки: без ударений, служебных слов и знаков (Path of the Focused Mind ≈ The Focused Mind)."""
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return " ".join(w for w in re.findall(r"[a-z]+", s) if w not in {"the", "path", "of", "way", "a", "rite", "ritual"})

def rkey(s):
    return re.sub(r"[^а-яё]", "", re.sub(r"\(.*?\)", "", (s or "").lower()).replace("ё", "е"))

LEVEL_RX = re.compile(r"(?:ур(?:овень|\.)?\s*(\d+))|(?:(\d+)\s*(?:-?го\s*)?уровн)|(?:[Рр]итуал\w*\s+(\d+)\s*уровн)", re.I)
def inline_level(s):
    m = LEVEL_RX.search(s or "")
    return int(next(g for g in m.groups() if g)) if m else None

def strip_level(s):
    s = re.sub(r"\s*\((?:[Рр]итуал\w*\s*)?(?:ур(?:овень|\.)?\s*\d+|\d+\s*-?го\s*уровн\w*|[Рр]итуал\w*\s*\d+\s*уровн\w*)[^)]*\)", "", s)
    s = re.sub(r",\s*ур(?:овень|\.)?\s*\d+\s*$", "", s)
    return s.strip(" .:—–-")

def name_en(raw):
    """«Имя (En)», «En (Имя)», «Имя (En), ур. 2» → (ru, en)."""
    s = strip_level(re.sub(r"^[•●\s]+", "", re.sub(r"\*\*|`", "", raw).strip()).rstrip(":. "))
    s = re.sub(r"^(?:Ритуал|Обряд)\s*:\s*", "", s)
    m = re.match(r"^(.*?)\s*\(([^()]*)\)\s*(.*)$", s)
    if m:
        a, b, tail = m.group(1).strip(), m.group(2).strip(), m.group(3).strip(" —–-")
        lat = lambda x: bool(re.search(r"[A-Za-z]", x)) and not re.search(r"[А-Яа-яЁё]", x)
        if lat(a) and re.search(r"[А-Яа-яЁё]", b): return b, a      # «Minestra di Morte (Угощение смертью)»
        if lat(b): return (a + (" " + tail if tail and not tail.startswith("—") else "")).strip(), b
    ru, en = split_name(s)
    return re.sub(r"\s*[—–]\s.*$", "", ru).strip(), en

POWER_TABLE_LVL = re.compile(r"^(Ур|У\.?$|Уровень|Ур\. пути)", re.I)
POWER_TABLE_NAME = re.compile(r"Сила|Способность|Вид", re.I)
BULLET_POWER = re.compile(r"^\s*-\s*\*\*\s*(?:([•●]{1,10})|(\d{1,2}))\s*\.?\s+(.+?)\s*[.:]?\s*\*\*\s*[.:—–-]?\s*(.*)$")
HEAD_POWER = re.compile(r"^#{3,6}\s*(?:([•●]{1,10})|(\d{1,2}))\s+(.+)$")
# «**• Сила** (En) — Атрибут: …» — строка-заголовок силы, описание пунктами ниже (Tome of Secrets, DA Companion)
BOLD_POWER = re.compile(r"^\*\*\s*([•●]{1,10})\s+(.+?)\s*\*\*\s*(.*)$")

def with_paren_en(name, rest):
    """«Имя» + «(En) — …» → «Имя (En)», остаток."""
    m = re.match(r"^\s*(\([^()]*[A-Za-z][^()]*\))\s*(.*)$", rest or "")
    return (f"{name} {m.group(1)}", m.group(2)) if m else (name, rest or "")

def cells(l): return [c.strip() for c in l.strip().strip("|").split("|")]
def is_sep(l): return bool(re.match(r"^\|[\s:|-]+\|?\s*$", l))

def parse_powers(lines):
    out, cur, scaled = [], None, []
    i = 0
    while i < len(lines):
        l = lines[i]
        if l.startswith("|") and i + 1 < len(lines) and is_sep(lines[i + 1]):
            h = cells(l); j = i + 2
            name_col = next((k for k, c in enumerate(h) if POWER_TABLE_NAME.search(c)), None)
            lvl_col = bool(h) and bool(POWER_TABLE_LVL.match(h[0].replace("*", "")))
            if lvl_col and name_col:
                while j < len(lines) and lines[j].startswith("|"):
                    r = cells(lines[j]); lv = level_of(r[0])
                    if lv and len(r) > name_col:
                        ru, en = name_en(r[name_col])
                        rest = [f"**{h[k].replace('*', '')}:** {r[k]}" for k in range(len(r)) if k not in (0, name_col) and k < len(h) and r[k].strip()]
                        out.append({"level": lv, "name": ru, "en": en, "html": md_to_html(rest if len(rest) > 1 else [re.sub(r"^\*\*[^*]+:\*\*\s*", "", rest[0])] if rest else [])})
                    j += 1
                cur = None; i = j; continue
            if lvl_col and len(h) >= 2:
                # одна сила, растущая по уровням (малые пути V20 DA, Нектар крови): строка таблицы — уровень
                hdr = h[1].replace("*", "").strip()
                rows_ = []
                while j < len(lines) and lines[j].startswith("|"):
                    r = cells(lines[j]); lv = level_of(r[0])
                    if lv and len(r) >= 2:
                        ru, en = name_en(r[1])
                        rest = [f"**{h[k].replace('*', '')}:** {r[k]}" for k in range(1, len(r)) if k < len(h) and r[k].strip()]
                        # имя — значение из таблицы до пояснений в скобках; make_path добавит название пути
                        rows_.append((lv, re.split(r"\s*\(|;|,\s", ru, 1)[0].strip()[:40], en, md_to_html(rest)))
                    j += 1
                vals = [v for _, v, _, _ in rows_]
                numword = re.compile(r"^(?:один|одна|два|две|три|четыре|пять|шесть)\b", re.I)
                # подпись колонки — если значения сами по себе непонятны: все однословные («Демон: Мелкий»)
                # или числительные («Сколько уровней…: два»)
                prefix = (all(len(v.split()) == 1 and not re.search(r"\d", v) for v in vals) and len(hdr) <= 15) \
                         or sum(bool(numword.match(v)) for v in vals) >= len(vals) - 1
                NUM = {"один": 1, "одна": 1, "два": 2, "две": 2, "три": 3, "четыре": 4, "пять": 5, "шесть": 6}
                for lv, v, en, body in rows_:
                    n = NUM.get(v.split()[0].lower()) if v else None
                    if n and len(hdr) > 15 and re.search(r"уровн", hdr, re.I):
                        name = f"передать {n} ур."              # «Сколько уровней силы можно передать: два» → коротко
                    else:
                        name = f"{hdr}: {v}" if prefix else v
                    scaled.append({"level": lv, "name": name, "en": en, "html": body, "scaled": True})
                cur = None; i = j; continue
            while j < len(lines) and lines[j].startswith("|"): j += 1
            i = j; continue
        m = BULLET_POWER.match(l)
        mh = HEAD_POWER.match(l)
        mb = BOLD_POWER.match(l)
        if m or mh or mb:
            g = m or mh or mb
            if mb:
                lv = len(g.group(1)); nm, rest = with_paren_en(g.group(2), g.group(3))
                rest = re.sub(r"^\s*[—–-]\s*", "", rest)
            else:
                lv = len(g.group(1)) if g.group(1) else int(g.group(2)); nm, rest = g.group(3), (g.group(4) if m else "")
            if 1 <= lv <= 10:
                ru, en = name_en(nm)
                if cur is not None and not g.group(1) and any(p.get("dots") for p in out):
                    cur["body"].append(l); i += 1; continue          # «- **1 кровь** …» внутри силы с точками — это описание
                cur = {"level": lv, "name": ru, "en": en, "body": [rest] if rest else [], "dots": bool(g.group(1))}
                out.append(cur); i += 1; continue
        if heading_level(l) or l.strip() == "---":
            cur = None
        elif cur is not None and l.strip():
            cur["body"].append(l)
        i += 1
    if any(p.get("dots") for p in out):
        out = [p for p in out if p.get("dots") or "body" not in p]
    for p in out:
        p.pop("dots", None)
        if "body" in p: p["html"] = md_to_html(p.pop("body"))
    if not out: out = scaled          # таблица уровней — только если сил другим способом не нашлось
    seen, res = set(), []
    for p in sorted(out, key=lambda x: x["level"]):
        k = (p["level"], rkey(p["name"]))
        if k not in seen: seen.add(k); res.append(p)
    return res

def path_name(title):
    t = re.sub(r"^\d+\.\s*", "", title.strip())
    t = re.sub(r"^(?:Новый путь|Путь)\s*:\s*", "", t)
    t = re.sub(r"\s+[—–]\s+.*$", "", t)
    ru, en = name_en(t)
    if re.fullmatch(r"«[^«»]+»", ru): ru = ru[1:-1]          # «Сотворение огня» (Creatio Ignis) → без кавычек
    return ru, en

def chunks(lines):
    """Раздел с несколькими путями → [(заголовок, строки)] по подзаголовкам или строкам «**Имя (En)** …»."""
    out, cur = [], None
    for l in lines:
        h = heading_level(l)
        mb = re.match(r"^\*\*([^*]+)\*\*\s*(?:[—–].*)?$", l)
        if (h and h >= 2) or (mb and (re.search(r"\([A-Za-z]", mb.group(1)) or re.match(r"Путь|Уклад", mb.group(1)))):
            cur = [l[h + 1:].strip() if h else mb.group(1), []]; out.append(cur); continue
        if cur: cur[1].append(l)
    return out

def make_path(title, lines, book, era, note, override):
    ru, en = path_name(title)
    if override: ru, en = override.get("name", ru), override.get("en", en)
    powers = parse_powers(lines)
    for p in powers:
        # одна сила, растущая по уровням: «Власть движения — 100 кг», а не просто «100 кг»
        if p.pop("scaled", False): p["name"] = f"{ru} — {p['name'] or p['level']}"
    single = bool(override and override.get("single"))
    if single:
        # путь без сил по уровням (Perdo Magica, Управление Магией): одна «сила» — весь раздел
        powers = [{"level": 1, "name": ru, "en": en, "html": md_to_html(lines)}]
    first = next((k for k, l in enumerate(lines) if HEAD_POWER.match(l) or BOLD_POWER.match(l) or BULLET_POWER.match(l)
                  or (l.startswith("|") and k + 1 < len(lines) and is_sep(lines[k + 1]) and POWER_TABLE_LVL.match(cells(l)[0].replace("*", "")))),
                 len(lines))
    intro = [] if single else [l for l in lines[:first] if not l.startswith("|")]
    return {"name": ru, "en": en, "source": book, "era": era, "powers": powers, "single": single,
            "html": src_p(book, note) + md_to_html(intro)}

GROUP_SINGLE = {"Алхимия"}

def paths_from(entry):
    rel, chain, disc, book, era, note, mode = entry
    lines, title = grab(rel, *chain)
    if not lines: return []
    if mode == "group":
        # пути, где все уровни описаны одним абзацем, — одной «силой»
        return [make_path(t, ls, book, era, note, {"single": True} if path_name(t)[0] in GROUP_SINGLE else None) for t, ls in chunks(lines)]
    return [make_path(title, lines, book, era, note, mode if isinstance(mode, dict) else None)]

def disc_of(text):
    """Дисциплина ритуала по подписи в смешанных разделах («— Мистика Бездны, ур. 3»)."""
    t = (text or "").lower()
    for rx, k in ((r"мистик\w* бездн|бездн", "obtenebration"), (r"некромант", "necromancy"), (r"колдов|крайн", "koldunism"),
                  (r"дур.?ан.?ки|ассамит", "assamiteSorcery"), (r"акху|сетит|садхан|ванг", "setiteSorcery")):
        if re.search(rx, t): return k
    return "thaumaturgy"

RIT_LEVEL_HEAD = re.compile(r"^(?:Ритуал\w*\s+)?(?:Уровень\s*(\d+)|(\d+)\s*(?:-?го\s*)?уровн\w*)\s*$", re.I)
LABELS = {"система", "проведение", "эффект", "ограничения", "механика", "затраты", "длительность", "бросок", "примечание", "цена",
          "условие", "условия", "требования", "ингредиенты", "время", "провал", "ботч", "успех", "успехи", "компоненты", "материалы",
          "изучение", "исполнение", "основа", "суть", "дистанция", "цель", "сложность", "результат", "результаты", "побочный эффект",
          "взгляд жизни", "взгляд смерти", "происхождение", "посвящение", "особенности путей", "особенности", "внимание", "минус", "плюс"}

def rituals_from(lines, disc, book, era, note):
    res, cur, lvl = [], None, None
    def close():
        nonlocal cur
        if cur and cur["level"]:
            body = cur.pop("body"); cur.pop("kind", None)
            cur["html"] = src_p(book, note) + md_to_html(body)
            res.append(cur)
        cur = None
    def start(raw, level, kind, body=None, hint=""):
        nonlocal cur
        close()
        ru, en = name_en(raw)
        if len(rkey(ru) or akey(en)) < 3: return
        cur = {"discipline": disc_of(hint) if disc == "auto" else disc, "level": level, "name": ru, "en": en, "source": book, "era": era,
               "kind": kind, "body": body or []}
    i = 0
    while i < len(lines):
        l = lines[i]
        h = heading_level(l)
        if h:
            t = l[h + 1:].strip()
            m = RIT_LEVEL_HEAD.match(re.sub(r"^Ритуалы\s+", "", t))
            if m:
                close(); lvl = int(m.group(1) or m.group(2)); i += 1; continue
            md = re.match(r"^([•●]{1,10})\s+(.+)$", t)              # «### •••• Имя» — уровень точками
            if md: t = md.group(2)
            il = len(md.group(1)) if md else inline_level(t)
            if h >= 3 and (il or lvl):
                start(t, il or lvl, "heading")
            else:
                close()
            i += 1; continue
        if l.startswith("|") and i + 1 < len(lines) and is_sep(lines[i + 1]):
            hd = cells(l); j = i + 2
            rcol = next((k for k, c in enumerate(hd) if re.match(r"Ритуал|Обряд|Название", c.replace("*", ""))), None)
            lcol = next((k for k, c in enumerate(hd) if re.match(r"Ур|Уровень|У\.", c.replace("*", ""))), None)
            while j < len(lines) and lines[j].startswith("|"):
                r = cells(lines[j]); j += 1
                if rcol is None or rcol >= len(r): continue
                lv = level_of(r[lcol]) if lcol is not None and lcol < len(r) else lvl
                rest = [f"**{hd[k].replace('*', '')}:** {r[k]}" for k in range(len(r)) if k not in (rcol, lcol) and k < len(hd) and r[k].strip()]
                if not lv and lcol is not None and lcol < len(r) and re.search(r"перем", r[lcol]):
                    lv = 1                              # «перем.»: уровень = уровню призываемого — в список с первого уровня
                    rest = ["**Уровень:** переменный, см. описание"] + rest
                start(r[rcol], lv, "row", [rest[0].split(":** ", 1)[1]] if len(rest) == 1 else ["- " + x for x in rest])
            close(); i = j; continue
        mb = re.match(r"^\s*-\s*\*\*Ур\.?\s*(\d+)\s*:?\*\*\s*:?\s*\*\*(.+?)\*\*\s*[—–:-]?\s*(.*)$", l)
        if mb:
            # в одном пункте бывает несколько ритуалов уровня: «**А (En)** — текст. **Б (En)** — текст» (Blood Sacrifice)
            parts = re.split(r"\s\*\*([^*]+?\([A-Za-z][^)]*\)[^*]*)\*\*\s*[—–-]\s*", " " + mb.group(3))
            start(mb.group(2), int(mb.group(1)), "bullet", [parts[0].strip()])
            for nm, tx in zip(parts[1::2], parts[2::2]):
                start(nm, int(mb.group(1)), "bullet", [tx.strip()])
            i += 1; continue
        mb = re.match(r"^\s*-\s*\*\*(.+?)\*\*\s*[—–:.-]?\s*(.*)$", l)
        if mb:
            bold = mb.group(1).strip()
            label = re.sub(r"[:.]\s*$", "", bold).strip().lower()
            il = inline_level(bold)
            body_mode = cur is not None and cur["kind"] in ("heading", "para") and not il and not re.search(r"\([A-Za-z]", bold)
            if label in LABELS or body_mode or not (il or lvl):
                if cur is not None: cur["body"].append(l)
            else:
                start(bold, il or lvl, "bullet", [mb.group(2)])
            i += 1; continue
        mp = re.match(r"^\*\*(.+?)\*\*\s*(.*)$", l)
        if mp and not l.startswith("- "):
            bold = mp.group(1).strip()
            m = RIT_LEVEL_HEAD.match(bold)
            if m:
                close(); lvl = int(m.group(1) or m.group(2)); i += 1; continue
            md = re.match(r"^([•●]{1,10})\s+(.+)$", bold)          # «**• Бездна знает** (The Abyss Knows)»
            name, rest = with_paren_en(md.group(2) if md else bold, mp.group(2))
            # уровень — в названии или сразу после него: «**Имя** (En) — уровень 3», «— Мистика Бездны, ур. 3»
            ml = re.match(r"^\s*[—–-]\s*(?:[^,—–]{0,30},\s*)?(?:уровень|ур\.)\s*(\d+)", rest)
            il = len(md.group(1)) if md else (inline_level(bold) or (int(ml.group(1)) if ml else None))
            if re.sub(r"[:.]\s*$", "", bold).lower() not in LABELS and (il or lvl):
                start(name, il or lvl, "para", [re.sub(r"^[—–:-]\s*", "", rest)] if rest and not ml else [], hint=rest)
                i += 1; continue
        if l.strip() == "---":
            close()
        elif cur is not None:
            cur["body"].append(l)
        i += 1
    close()
    return res

# ── Сборка ──────────────────────────────────────────────────────────────────

def thaum_roll(pw, disc):
    if disc == "koldunism":
        return {"trait1": "willpower.permanent", "difficulty": min(9, 3 + pw["level"]), "blood": 1}
    if disc == "necromancy":
        return parse_roll(pw["html"])
    own = parse_roll(pw["html"]) or {}
    return {"trait1": "willpower.permanent", "difficulty": min(9, 3 + pw["level"]), "blood": 1,
            **{x: own[x] for x in ("trait1", "trait2", "difficulty") if x in own and own.get("trait2")}}

# те же ритуалы под другим переводом (V20 Dread Names ↔ Guide to the Sabbat Revised): берём версию V20
SAME_RITUALS = {"Оковы похитителя", "Призвать Демона", "Чудовищное Знание", "Чёрная Кошка", "Невидимые Муки",
                "Закрытие Путей", "Спуститься в Бездну"}

def apply(disc, rituals):
    report = []
    for d in disc.values():
        for p in d.get("paths", []): p.setdefault("era", "")
    for r in rituals.values():
        for x in r["rituals"]: x.setdefault("era", "")
    n_p = 0
    for entry in PATHS:
        k = entry[2]
        have = {akey(p.get("en")) for p in disc[k]["paths"] if p.get("en")} | {rkey(p["name"]) for p in disc[k]["paths"]}
        for p in paths_from(entry):
            if len(p["powers"]) < 3 and not p.pop("single", False):
                if entry[6] != "group" or p["powers"]:
                    report.append(f"  путь без сил ({len(p['powers'])}): {entry[0].split('/')[0]} · {p['name']}")
                continue
            p.pop("single", None)
            if (p["en"] and akey(p["en"]) in have) or rkey(p["name"]) in have: continue
            for pw in p["powers"]:
                r = thaum_roll(pw, k)
                if r: pw["roll"] = r
            disc[k]["paths"].append(p); n_p += 1
            have |= {akey(p["en"]), rkey(p["name"])}
    n_r = 0
    def have_of(k):
        rituals.setdefault(k, {"rules": [], "rituals": []})
        return {akey(x.get("en")) for x in rituals[k]["rituals"] if x.get("en")} | {rkey(x["name"]) for x in rituals[k]["rituals"]}
    for rel, chain, k0, book, era, note in RITUALS:
        lines, _ = (grab(rel, *chain) if chain else (read(os.path.join(REF, rel)), ""))
        found = rituals_from(lines, k0, book, era, note)
        added = 0
        for r in found:
            k = r["discipline"]
            have = have_of(k)
            if (r["en"] and akey(r["en"]) in have) or rkey(r["name"]) in have or r["name"] in SAME_RITUALS: continue
            r["roll"] = ({"trait1": "attributes.wits", "trait2": "abilities.occult", "difficulty": min(9, 3 + r["level"])} if k == "obtenebration"
                         else {"trait1": "attributes.intelligence", "trait2": "abilities.occult", "difficulty": min(9, 3 + r["level"])})
            rituals[k]["rituals"].append(r); added += 1
        n_r += added
        report.append(f"  ритуалы {rel.split('/')[0][:22]:22} {'/'.join(c[:18] for c in (chain or ['весь файл']))[:40]:40} найдено {len(found):3}, добавлено {added:3}")
    for k in rituals:
        rituals[k]["rituals"].sort(key=lambda x: (x["level"], x["name"]))
    print(f"Магия крови Revised / 2nd / Тёмные века: путей +{n_p}, ритуалов +{n_r}")
    for line in report: print(line)
