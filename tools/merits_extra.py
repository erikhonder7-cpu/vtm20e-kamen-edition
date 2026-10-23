# tools/merits_extra.py
# Достоинства и недостатки из дополнений: V20 (Lore of the Clans, Lore of the Bloodlines, The Black Hand,
# Anarchs Unbound, Dread Names, Beckett's Jyhad Diary, Hunters Hunted II), затем Revised (гайды сект,
# кланбуки) и 2nd Edition (Players Guide, Players Guide to the Sabbat, Elysium, Hunters Hunted).
# Вызывается из build_data.main() после основной книги.
#
# Приоритет при совпадении (по английскому названию, иначе по русскому): основная книга V20 → дополнения V20 →
# Revised → 2nd Edition. Тёмные века (своя эпоха), nWoD, V5 и фанатские книги таблицами не разбираются;
# их клановые черты лежат готовыми записями в tools/merits_clan_manual.json.
#
# Поле clan — ключ клана из data/clans.json, если черта клановая (по файлу Lore of the Clans / Lore of the
# Bloodlines / кланбука Revised, откуда взята строка); у общих черт — пустая строка.
#
# Вид (достоинство/недостаток) — из клетки цены («N, недостаток», «N (дост.)»), колонки «Тип», заголовка раздела
# или английского текста книги («(2pt. Flaw)»). Категория — из колонки «Тип» или заголовка; где книга её
# не даёт (Lore of the Clans и др.) — по смыслу описания (category_guess).

import io, os, re, glob, html, json
from build_data import REF, read, inline, split_name

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TXT = os.path.join(ROOT, "books", "Мир Тьмы", "Вампиры", "_текст")
EN_CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "merits_en_index.json")
# Готовые записи в формате data/merits.json: merits_revised_manual.json — черты без английского названия, которых нет
# в V20 (Guide to the Camarilla, кланбуки Revised); merits_clan_manual.json — клановые черты Тёмных веков и «Самеди»
MANUALS = sorted(glob.glob(os.path.join(os.path.dirname(os.path.abspath(__file__)), "merits_*_manual.json")))

# Клан по файлу справочника: имя файла без номера → ключ data/clans.json
CLAN_DIRS = ("Lore_of_the_Clans", "Lore_of_the_Bloodlines", "Revised_Кланбуки")
CLAN_KEYS = {
    "Ассамиты": "assamite", "Бруха": "brujah", "Вентру": "ventrue", "Гангрелы": "gangrel", "Джованни": "giovanni",
    "Ласомбра": "lasombra", "Малкавиане": "malkavian", "Носферату": "nosferatu", "Последователи Сета": "setite",
    "Равнос": "ravnos", "Тореадор": "toreador", "Тремер": "tremere", "Цимисхи": "tzimisce", "Каитиф и антитрибу": "caitiff",
    "Баали": "baali", "Дочери Какофонии": "docheriKakofonii", "Горгульи": "gorguli", "Вестники Черепов": "predvestnikiCherepov",
    "Киасиды": "kiasidy", "Нагараджа": "nagaradzha", "Салюбри": "salyubri", "Самеди": "samedi", "Истинные Бруха": "istinnyeBruha",
}

# Клановые черты из книг, разбитых не по кланам (сверено по тексту черты)
CLAN_FIX = {"Отступник": "baali"}   # The Black Hand: обращённый Нергали‑Баали, заменяет Дисциплину на Демонион

def clan_of(path):
    if os.path.basename(os.path.dirname(path)) not in CLAN_DIRS:
        return ""
    stem = re.sub(r"^\d+[a-z]?_", "", os.path.splitext(os.path.basename(path))[0])
    stem = re.sub(r"_(Revised|1993)$", "", stem).replace("_", " ")
    return CLAN_KEYS.get(stem, "")

# Поле sect — ключ секты (как sectKey персонажа: camarilla, sabbat, anarchs), если черта существует только в ней.
# Черты для обеих сект («Шериф или Епископ») и с оговоркой «не для Шабаша» — общие.
SECT_BY_SOURCE = {"V20 Anarchs Unbound": "anarchs", "Player's Guide to the Sabbat (2nd Ed.)": "sabbat"}
SECT_BY_NAME = {
    # V20: «только Камарилья» в тексте черты; Элизиум и Красный Список — институты Камарильи
    "Жертва Маскарада": "camarilla", "Сорванный дебют": "camarilla", "Бывший Принц": "camarilla",
    "Цель Кровавой Охоты": "camarilla", "Посмешище": "camarilla", "Завсегдатай Элизиума": "camarilla",
    "Красный Список": "camarilla",
    # Guide to the Camarilla: домен от Князя и должности Камарильи
    "Домен": "camarilla", "Должность": "camarilla", "Гарпия": "camarilla", "Примоген": "camarilla",
}

FIELDS = ("kind", "category", "name", "en", "cost", "min", "max", "clan", "sect", "source", "html")

def with_clan(x, clan=None):
    """Запись с полями clan и sect в постоянном порядке полей."""
    x = dict(x)
    if clan is not None: x["clan"] = clan
    x.setdefault("clan", "")
    x["sect"] = x.get("sect") or SECT_BY_NAME.get(x["name"]) or SECT_BY_SOURCE.get(x.get("source"), "")
    return {k: x[k] for k in FIELDS if k in x}

# (маска файла, книга по‑русски для подписи, вес приоритета: меньше — главнее)
SOURCES = [
    ("Lore_of_the_Clans/*.md", "V20 Lore of the Clans", 1),
    ("Lore_of_the_Bloodlines/*.md", "V20 Lore of the Bloodlines", 1),
    ("Black_Hand/05_*.md", "V20 The Black Hand", 1),
    ("Anarchs_Unbound/*.md", "V20 Anarchs Unbound", 1),
    ("Dread_Names/*.md", "V20 Dread Names, Red List", 1),
    ("Becketts_Jyhad_Diary/*.md", "V20 Beckett's Jyhad Diary", 1),
    ("Hunters_Hunted_II/*.md", "V20 Hunters Hunted II (охотники)", 1),
    # Guide to the Camarilla (Revised) не берём: V20 вобрала его достоинства почти целиком (под другими переводами),
    # а должности (Гарпия, Примоген) в V20 заменены фактом биографии «Статус».
    ("Revised_Гайды_сект/03b_*.md", "Guide to the Sabbat (Revised)", 2),
    ("Revised_Гайды_сект/02_*.md", "Guide to the Anarchs (Revised)", 2),
    ("Revised_Кланбуки/*.md", "кланбук (Revised)", 2),
    ("Revised_Гайды_сект/04a_*.md", "Player's Guide to the Sabbat (2nd Ed.)", 3),
    ("Revised_Основные/02a_*.md", "Player's Guide (2nd Ed.)", 3),
    ("Прочее/07_*.md", "Elysium (2nd Ed.)", 3),
    ("Прочее/08_*.md", "Hunters Hunted (2nd Ed.)", 3),
]

CAT_WORDS = [
    (r"физ", "physical"), (r"мент|умствен|психолог|восприят|способност", "mental"),
    (r"соц|связ|обществ|стая|сородич", "social"), (r"сверх", "supernatural"),
]

# Черты Revised без английского названия, которых точно нет ни в V20, ни в Lore of the Clans
# (остальные такие строки — те же черты под другим переводом: «Дракон» = «Нрав Дракона», «Пловец» = «Рыбий»…)
RU_ONLY_OK = {"Чувство погоды", "Морская гармония", "Зов Посейдона", "Сострадательный", "Неуправляемый", "Несвободный"}

RU_ONLY_BOOKS = {"Elysium (2nd Ed.)"}

# Те же черты, что в V20, под старыми английскими названиями
DUP_EN = {"acutehearing", "acutesenseofsmell", "acutesenseoftaste", "acutevision", "thinblooded", "luck",
          "phobiamild", "phobiasevere", "vengeance", "reputation", "babyface"}

# Категория, где книга её не даёт и автоматика ошибается (сверено по описанию)
CAT_FIX = {
    "Убийца на тысячу метров": "physical", "Фокус ярости": "mental", "Яркая личность": "social", "Явный хищник": "social",
    "Устойчивость к наркотикам": "physical", "Бессердечный": "supernatural", "Скальд": "mental", "Член стаи": "supernatural",
    "Крыса в клетке": "mental", "Каннибал": "physical", "Единокровная невосприимчивость": "supernatural",
    "Глаза тени": "supernatural", "Аура командира": "social", "Король/Королева Тени": "mental",
    "Долгосрочное планирование": "mental", "Недоказавший": "social", "Стигматы": "supernatural", "Заразный": "supernatural",
    "Перевозбуждённый": "mental", "Склизкий": "physical", "Нерестовый пруд": "supernatural", "Незримый сон": "supernatural",
    "Толстая шкура": "physical", "Вонь": "physical", "Бессвязный": "physical", "Кровь‑противоядие": "physical",
    "Немая преданность": "supernatural", "Сердце из игл": "mental", "Несовершенная реальность": "supernatural",
    "Замедленная деградация": "mental", "Измученный художник": "mental", "Обращён без Чаши": "supernatural",
    "Член тайного общества": "social", "Метка предателя": "supernatural", "Терпимость к боли": "physical",
    "Связь с убежищем": "supernatural", "Безликий": "physical", "Слабость ревенанта": "supernatural",
    "Просто ждёт": "mental", "Трупное присутствие": "supernatural", "Хоровая выучка": "supernatural",
    "Чутьё Фуги": "supernatural", "Мёртвая неподвижность": "physical", "Каменный язык": "physical",
    "Ученик Лазаря / Иафета": "social", "Крещение в Стиксе": "supernatural", "Слабак": "physical",
    "Утончённый вкус": "mental", "Ужасная Мара": "supernatural", "Запах чужака": "supernatural",
    "Сердце воина": "supernatural", "Хватка смерти": "supernatural", "Смертные воспоминания": "mental",
    "Фаталист": "mental", "Вне фазы": "supernatural", "Тайный": "supernatural", "Провидец": "supernatural",
    "Изолированное воспитание": "social", "Старение": "physical", "Санкционированная ведьма": "social",
    "Внедрённый агент": "social", "Научная лаборатория": "mental", "Близость к убежищу": "supernatural",
    "Чувство опасности": "supernatural", "Высшая цель": "mental",
    "Мумия-компаньон": "social", "Паранойя, ограниченная": "mental", "Паранойя, экстремальная": "mental",
    "Жажда смерти": "mental", "Диаблерист, известный": "social", "Диаблерист, тайный": "supernatural",
}

# Вид там, где его не дают ни таблица, ни английский текст (сверено по смыслу и по кланбукам)
KIND_FIX = {"Поглощение": "flaw", "Привязанный к Совету": "flaw", "Дважды предатель": "flaw",
            "Постоянный третий глаз": "flaw", "Недовольство стаи": "flaw"}

def cat_of(text):
    t = (text or "").lower()
    for rx, c in CAT_WORDS:
        if re.search(rx, t): return c
    return None

def kind_of(text):
    """Вид по подписи; «Достоинства и недостатки» (оба слова) — не ответ."""
    t = (text or "").lower()
    flaw = bool(re.search(r"недост|flaw", t))
    merit = bool(re.search(r"(?<!не)достоин|(?<!не)дост\.|merit", t))
    if flaw and not merit: return "flaw"
    if merit and not flaw: return "merit"
    return None

def stems(name):
    """Основы значимых слов русского названия — для поиска одной и той же черты под разными переводами."""
    return {w[:5] for w in re.findall(r"[а-яё]{4,}", name.lower())}

def same_ru(a, b):
    sa, sb = stems(a), stems(b)
    return bool(sa) and (sa == sb or (len(sa) >= 2 and len(sa & sb) >= len(sa) - 1 and len(sb) <= len(sa) + 1 and len(sa & sb) >= 1 and next(iter(sorted(sa))) in sb))

# По смыслу названия и описания — для книг без категорий (Lore of the Clans и др.): у каждой категории
# свой набор признаков, побеждает набравшая больше совпадений; при равенстве — по порядку списка.
GUESS = [
    ("supernatural", r"дисциплин|витэ|аур[аеуы]|маги[яи]|ритуал|призрак|дух[аиов]?|демон|бездн|зверь|зверя|ярост|рётшрек|ротшрек|узы|поколени|диаблери|солнц|торпор|истинн\w* вер|тауматург|некромант|ясновиден|фантасмаг|сокрыти|величи|доминир|затмени|метаморф|преображ|упокоен|стойкост|мощ[ьи]|стремительн|пут[ьи] |облик|третий глаз|заражен|проклят|неуязвим|кровь|крови|отражени|чары|чуд|оборот|фэй|фе[ий]"),
    ("physical", r"тел[оа]|рук[аиу]|кист|ног[аиу]|стоп|кож[аеи]|клык|зуб|пасть|рот|челюст|укус|урон|выносливост|ловкост|сил[аыу]|внешност|привлекательн|ран[аыу]|здоровь|слеп|глух|зрени|слух|обонян|запах|мышц|сердц|конечност|кост[ьи]|когт|плоть|плот[иь]|рост|уродлив|некрасив|красив|лиц[оа]|глаз|сустав|перепонк|летат|плава|бег|рвот|еда|пищ|едок|питани|выпива|съеда|светит|свечени|биолюминес"),
    ("mental", r"вол[яиеью]|смекалк|интеллект|памят|разум|безуми|расстройств|знани|сосредоточ|кошмар|страх|ум|учени|учит|грамот|счёт|натур|личност|характер|совест|самоконтрол|смелост|мораль|убеждённ|видени|предчувств|интуици|навязчив|одержим|мысл|сон|сны|сновид"),
    ("social", r"репутац|статус|связ|союзник|двор|социальн|влияни|слав[аы]|позор|долг|услуг|враг|соперник|клан[аеу]?|секты?|стая|стаи|сир|потом|дитя|смертн\w+ общ|друг|покровит|запас|ресурс|деньг|богатств|изгна|затворн|титул|должност|принц|примоген"),
]

def category_guess(txt):
    t = txt.lower()
    score = {c: len(re.findall(rx, t)) for c, rx in GUESS}
    best = max(score.values())
    if not best: return "social"
    return next(c for c, _ in GUESS if score[c] == best)

def en_index():
    """Английские тексты книг: имя → (вид, категория) по строкам «Name (2pt. Social Flaw)».

    Тексты книг (_текст) в репозиторий не входят. Поэтому собранный по ним индекс сохраняется в EN_CACHE
    (только названия, вид и категория) и читается оттуда, если текстов нет, — иначе вид многих черт
    из дополнений не определить и они молча становятся достоинствами. Тексты, если есть, только дополняют
    сохранённый индекс: на машине может лежать лишь часть книг, и индекс не должен от этого сжиматься."""
    cache = {}
    if os.path.exists(EN_CACHE):
        with io.open(EN_CACHE, encoding="utf-8") as f:
            cache = json.load(f)
    files = glob.glob(os.path.join(TXT, "V20", "*.txt")) + glob.glob(os.path.join(TXT, "Revised_и_2ed", "*.txt"))
    if not files:
        if cache:
            print(f"  тексты книг не найдены — вид и категория из {os.path.relpath(EN_CACHE, ROOT)} ({len(cache)} названий)")
        else:
            print("  ВНИМАНИЕ: нет ни текстов книг (_текст), ни tools/merits_en_index.json — вид черт из дополнений "
                  "будет определён неполно (без пометки в книге — «достоинство»)")
        return cache
    out = {**cache, **_en_index_from_texts(files)}
    if len(out) > len(cache):
        print(f"  индекс вида черт: {len(cache)} → {len(out)} названий (по {len(files)} текстам книг)")
    with io.open(EN_CACHE, "w", encoding="utf-8", newline="\n") as f:
        json.dump(dict(sorted(out.items())), f, ensure_ascii=False, indent=1)
    return out

def _en_index_from_texts(files):
    rx =re.compile(r"^([A-Z][A-Za-z’'\-\.,& ]{2,48}?)\s*\(([0-9][0-9 ,–\-or/]*)\s*(?:pts?\.?|points?)\s*(Physical |Mental |Social |Supernatural )?(Merit|Flaw)s?\)")
    cat_rx = re.compile(r"^(Physical|Mental|Social|Supernatural)\b(?: (?:Merits|Flaws|Merits and Flaws))?\s*$", re.I)
    out = {}
    for p in files:
        if re.search(r"_RU|Rus|ru\.txt|Kniga|Klanbuk|pervod|Translation", p): continue
        cat = None
        for l in io.open(p, encoding="utf-8", errors="ignore").read().split("\n"):
            s = l.strip()
            mc = cat_rx.match(s)
            if mc: cat = mc.group(1).lower(); continue
            m = rx.match(s)
            if m:
                key = norm(m.group(1))
                out.setdefault(key, {"kind": m.group(4).lower(), "category": (m.group(3) or "").strip().lower() or None})
    return out

def norm(s):
    return re.sub(r"[^a-zа-яё]", "", (s or "").lower().replace("’", "'"))

def tables_with_heads(lines):
    """[(заголовки‑над‑таблицей, шапка, строки)] — только таблицы с колонками «Название» и «Цена»."""
    res, heads, i = [], [], 0
    while i < len(lines):
        l = lines[i]
        if l.startswith("#"):
            lvl = len(l) - len(l.lstrip("#"))
            heads = [h for h in heads if h[0] < lvl] + [(lvl, l.lstrip("#").strip())]
        if l.startswith("|"):
            hdr = [c.strip() for c in l.strip().strip("|").split("|")]
            rows, j = [], i + 1
            while j < len(lines) and lines[j].startswith("|"):
                cells = [c.strip() for c in lines[j].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c): rows.append(cells)
                j += 1
            if hdr and re.match(r"Название", hdr[0]) and len(hdr) >= 3 and re.match(r"Цена", hdr[1]):
                res.append(([h[1] for h in heads], hdr, rows))
            i = j; continue
        i += 1
    return res

def parse_cost(cell):
    c = re.sub(r"\*", "", cell)
    nums = [int(x) for x in re.findall(r"\d+", c)]
    m = re.match(r"^\s*([\d\s,/–\-или]+?)(?:\s*[,(]|$)", c)
    raw = (m.group(1) if m else c).strip(" ,") or c
    return raw, nums

def collect(core):
    eni = en_index()
    have = {}
    ru_names = []
    for x in core:
        have[norm(x.get("en")) or norm(x["name"])] = 0
        have[norm(x["name"])] = 0
        ru_names.append(x["name"])
    added, unknown = [], []
    for pat, book, prio in SOURCES:
        for path in sorted(glob.glob(os.path.join(REF, pat))):
            lines = read(path)
            meta = " ".join(lines[:8])
            if re.search(r'compat_v20:\s*"(none|convert)"', meta): continue
            for heads, hdr, rows in tables_with_heads(lines):
                ctx = " / ".join(heads)
                if not re.search(r"достоин|недостат|merit|flaw|физич|ментал|умствен|социал|сверхъест|психолог|восприят|способност|связи|смертное", ctx, re.I):
                    continue
                type_col = next((i for i, h in enumerate(hdr) if re.match(r"Тип", h)), None)
                eff_col = len(hdr) - 1
                for r in rows:
                    if len(r) < 3 or not r[0] or r[0].startswith("Название"): continue
                    cell = re.sub(r"\*\*", "", r[0]).strip()
                    name_kind = kind_of(cell)
                    # «Лунатизм (Lunacy, недостаток)», «Нет отражения (недостаток)» — пометку вида из названия убираем
                    cell = re.sub(r"\s*\((?:[^()]*?,\s*)?(?:недостаток|достоинство|дост\.|недост\.)\)", lambda m: "" if "," not in m.group(0) else " (" + m.group(0).split("(")[1].split(",")[0] + ")", cell, flags=re.I)
                    cell = re.sub(r"\s*\((?:физический|ментальный|социальный|сверхъестественный)?\s*(?:недостаток|достоинство)\)", "", cell, flags=re.I)
                    ru, en = split_name(cell)
                    if not ru or re.match(r"^[\d\s.—–-]*$", ru): continue
                    # старые книги без английского названия не сверить с V20 — пропускаем, чтобы не плодить повторы
                    # Elysium (черты старейшин) больше нигде не встречаются — берём и без английских названий
                    if not en and book not in RU_ONLY_BOOKS and (prio >= 3 or (prio == 2 and ru not in RU_ONLY_OK)): continue
                    if norm(en) in DUP_EN: continue
                    cost_raw, nums = parse_cost(r[1])
                    if not nums: continue
                    effect = r[eff_col] if eff_col < len(r) else ""
                    e = eni.get(norm(en)) if en else None
                    kind = KIND_FIX.get(ru) or name_kind or kind_of(r[1]) or (kind_of(r[type_col]) if type_col is not None else None) \
                        or (e or {}).get("kind") or (kind_of(heads[-1]) if heads else None)
                    if not kind:
                        # ни таблица, ни английский текст не говорят — смотрим на смысл последней фразы заголовков
                        kind = "flaw" if re.search(r"недостат", ctx, re.I) and not re.search(r"достоинств", ctx, re.I) else None
                    cat = cat_of(r[type_col]) if type_col is not None else None
                    cat = cat or cat_of(r[1]) or (e or {}).get("category") or cat_of(heads[-1] if heads else "") or category_guess(ru + ' ' + ru + ' ' + effect)
                    cat = CAT_FIX.get(ru, cat)
                    key = norm(en) or norm(ru)
                    if key in have or norm(ru) in have:
                        continue
                    if not en and book not in RU_ONLY_BOOKS and any(same_ru(ru, x) for x in ru_names):
                        continue
                    item = with_clan({"kind": kind or "merit", "category": cat, "name": ru, "en": en, "cost": cost_raw,
                            "min": min(nums), "max": max(nums), "source": book,
                            "html": f"<p><em>Источник: {html.escape(book)}.</em></p><p>{inline(effect)}</p>"},
                            CLAN_FIX.get(ru, clan_of(path)))
                    if not kind: unknown.append(f"{book}: {ru} ({en})")
                    have[key] = prio; have[norm(ru)] = prio
                    ru_names.append(ru)
                    added.append(item)
    for manual in MANUALS:
        with io.open(manual, encoding="utf-8") as f:
            for x in json.load(f):
                if norm(x["en"]) in have or norm(x["name"]) in have:
                    continue
                have[norm(x["en"]) or norm(x["name"])] = 2
                added.append(with_clan(x))
    for x in added: x.pop("prio", None)
    print(f"Достоинства и недостатки из дополнений: +{len(added)} "
          f"(достоинств {sum(x['kind'] == 'merit' for x in added)}, недостатков {sum(x['kind'] == 'flaw' for x in added)})")
    if unknown: print(f"  вид по умолчанию «достоинство»: {len(unknown)} (в книге без пометки вида)")
    return added
