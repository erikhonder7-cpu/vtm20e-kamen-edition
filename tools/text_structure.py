# tools/text_structure.py
# Единый вид сил Дисциплин и черт: два раздела — «Описание» (что это и как выглядит) и «Система» (бросок, цена, сроки, ограничения).
# Источники лежат в tools/sources/structure:
#   disciplines_v38.json — снимок базы Дисциплин (PATCHSET V38): силы, пути, правила, броски;
#   assamite_sorcery.json — Чародейство Ассамитов по аудиту Dur-An-Ki (заменяет запись снимка целиком);
#   docs/*.md            — справочники V38 по Дисциплинам и каталоги (у каждой силы «Описание» и «Система»);
#                          файлы с приставкой из OVERRIDE — более поздние аудиты (Некромантия V20, Dur-An-Ki, Праапти,
#                          Поток Аше, Тёмная Тауматургия): их карточки и описания путей важнее снимка;
#   rituals/<ключ>__*.md — проверенные карточки ритуалов (Dur-An-Ki, Мистика Бездны, ритуалы колдунов, анархов, Инконню,
#                          Ванга); поверх разделов tools/ritual_docs.py;
#   merits_final.json    — финальная редакция достоинств и недостатков (поля description_text / system_text);
#   audit/               — аудиторские таблицы и открытые вопросы к этим материалам (справочно, в сборку не идут).
# Расхождения с первоисточником, сверенные по White Wolf Wiki: «Пиявка страха» — 5-й уровень Пути Фобоса (в архиве — 4-й,
# по опечатке Rites of the Blood); «Путь Духа» колдунов — радиус 15 м / 90 м / 0,5 км / 1,5 км / 8 км.
# Вызывается из build_data.py (Дисциплины, ритуалы и data/merits.json). Черты гулей и падших лежат в data/ готовыми —
# их пересобирает запуск этого файла:  python -I tools/text_structure.py

import os, re, json, html, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, "sources", "structure")
DOCS = os.path.join(SRC, "docs")
RITES = os.path.join(SRC, "rituals")
# справочники-аудиты, чьи карточки заменяют уже разложенный текст снимка
OVERRIDE = ("07_", "07b", "14b", "14c", "14d", "14e", "32b", "32c", "32d", "33b", "33c", "33d", "33e", "33f", "34b")

# Номер справочника → ключ Дисциплины (порядок снимка V38); каталоги — по английскому названию
DOC_KEYS = ["animalism", "presence", "dominate", "obtenebration", "protean", "potence", "necromancy", "dementation",
            "vicissitude", "serpentis", "obfuscate", "fortitude", "celerity", "thaumaturgy", "quietus", "chimerstry",
            "auspex", "bardo", "valeren", "visceratika", "daimoinon", "koldunism", "melpominee", "mytherceria", "obeah",
            "ogham", "flight", "sanguinus", "spiritus", "thanatosis", "temporis", "assamiteSorcery", "setiteSorcery",
            "darkThaumaturgy", "mortis"]

# r-sec — заголовок раздела (styles/r-core.css); после правки в редакторе класс может пропасть — тогда это обычный h4
DESC_H, SYS_H = '<h4 class="r-sec">Описание</h4>', '<h4 class="r-sec">Система</h4>'
STRUCTURED = re.compile(r"<h4[^>]*>\s*Описание\s*</h4>[\s\S]*<h4[^>]*>\s*Система\s*</h4>")


def mark(h):
    """Заголовки «Описание» и «Система» — с классом раздела."""
    return re.sub(r"<h4[^>]*>\s*(Описание|Система)\s*</h4>", lambda m: DESC_H if m.group(1) == "Описание" else SYS_H, h or "")


def norm(s):
    s = (s or "").lower().replace("ё", "е").replace("’", "'")
    return re.sub(r"[^a-zа-я0-9]", "", s)


def card(desc_html, sys_html):
    desc_html = re.sub(r"^(<p>(?:<strong>|<em>)?)([a-zа-яё])", lambda m: m.group(1) + m.group(2).upper(), desc_html.strip())
    return f"{DESC_H}\n{desc_html}\n{SYS_H}\n{sys_html.strip()}"


def _md():
    from build_data import md_to_html   # тот же разбор Markdown, что и у справочника
    return md_to_html


# ── Справочники V38: карточки «Описание / Система» ─────────────────────────

def _names(title):
    """«Уровень 2: Когти Зверя (*Feral Claws*)» → ("когтизверя", "feralclaws"); «Исповедь клинка — Confer with the Blade» —
    так же; «Точка 1 — Map the Skies (Карта небес)» — имена наоборот (сравнение всё равно идёт по обоим)."""
    t = re.sub(r"^(Уровень\s*\d+(\s*[–—-]\s*\d+)?(\s*·[^:]*)?\s*[:.—–-]\s*|Точка\s*\d+\s*[:.—–-]\s*|[•●\s]+|\d+(\.\d+)*\.?\s+)",
               "", title.strip())
    en = ""
    m = re.search(r"\(([^()]*)\)\s*$", t)
    if m:
        en = m.group(1).strip("* ").split(";")[0]
        t = t[:m.start()]
    elif " — " in t:
        t, en = t.split(" — ", 1)
    return norm(t), norm(en)


def _keys(c):
    """Все варианты имени карточки: русское, английское, заголовок целиком («Путь Праапти — 10 м»)."""
    return {x for x in (c["ru"], c["en"], c.get("full", "")) if x}


def doc_cards():
    md = _md()
    cards = []
    PATHS.clear()
    for fn in sorted(os.listdir(DOCS)):
        if not fn.endswith(".md"):
            continue
        m = re.match(r"^(\d\d)", fn)
        if m:
            key = DOC_KEYS[int(m.group(1)) - 1]
        else:
            en = re.match(r"Каталог_([A-Za-z]+)_", fn).group(1).lower()
            key = en
        with open(os.path.join(DOCS, fn), encoding="utf-8") as f:
            lines = f.read().splitlines()
        stack, cur, mode = [], None, None

        def close():
            nonlocal cur
            if cur and cur.get("pathdesc") is not None:
                if cur["pathdesc"]:
                    PATHS.append(cur)
            elif cur and cur["desc"] and cur["sys"]:
                cards.append(cur)
            cur = None

        for line in lines:
            s = line.strip()
            if re.fullmatch(r"\*\*Описание пути\*\*[.:]?", s) and fn[:3] in OVERRIDE and stack:
                close()
                ru, en = _names(stack[-1][1])
                cur = {"key": key, "file": fn, "lvl": stack[-1][0], "ru": ru, "en": en, "pathdesc": []}
                mode = "pathdesc"
                continue
            inline = re.match(r"^\*\*(Описание|Система)[.:]?\*\*[.:]?\s+(\S.*)$", s)   # Akhu: «**Описание.** текст»
            if inline and inline.group(1) == "Система" and cur:
                mode = "sys"; cur["sys"].append(inline.group(2)); continue
            if re.fullmatch(r"(#{2,6}\s*|\*\*)Описание(\*\*)?[.:]?", s) or (inline and inline.group(1) == "Описание"):
                close()
                if stack:
                    lvl, title = stack[-1]
                    ru, en = _names(title)
                    path = next((_names(t) for l, t in reversed(stack[:-1]) if l < lvl), ("", ""))
                    cur = {"key": key, "file": fn, "lvl": lvl, "ru": ru, "en": en, "path": path, "desc": [], "sys": [], "title": title,
                           "full": norm(re.sub(r"^(Уровень\s*\d+[^:]*:|Точка\s*\d+\s*[—–-]|\d+\.)\s*", "", title))}
                    m2 = re.match(r"Уровень\s*(\d+)", title)
                    cur["level"] = int(m2.group(1)) if m2 else len(re.findall(r"[•●]", title)) or None
                    mode = "desc"
                    if inline:
                        cur["desc"].append(inline.group(2))
                continue
            if cur and re.fullmatch(r"(#{2,6}\s*|\*\*)Система(\*\*)?[.:]?", s):
                mode = "sys"; continue
            h = re.match(r"^(#{1,6})\s+(.*)$", line)
            if h:
                lvl = len(h.group(1))
                if cur and lvl <= cur["lvl"]:
                    close()
                elif cur:
                    mode = None   # подзаголовок внутри карточки (справочные пометки) — не берём
                while stack and stack[-1][0] >= lvl:
                    stack.pop()
                stack.append((lvl, h.group(2).strip()))
                continue
            if cur and re.match(r"^\*\*(Параметры броска|Параметры, внесённые|Статус записи|Редакционн|Примечание аудита|"
                                r"Источник пути|Структурная проблема)", s):
                mode = None; continue
            if cur and re.match(r"^\*\*Стандартная активация:\*\*", s):   # общая для всех сил пути — в описании пути
                continue
            if cur and mode:
                cur[mode].append(line)
        close()
    for c in cards:
        c["desc"] = md(c["desc"]); c["sys"] = md(c["sys"])
    for c in PATHS:
        c["html"] = md(c["pathdesc"])
    return [c for c in cards if c["desc"] and c["sys"]]


PATHS = []   # описания путей из справочников-аудитов (doc_cards наполняет)


def find_card(cards, key, p, path=None):
    ru, en = norm(p.get("name")), norm(p.get("en"))
    want = {x for x in (ru, en) if x}
    pool = [c for c in cards if c["key"] == key] or cards
    hits = [c for c in pool if want & _keys(c)]
    hits = [c for c in hits if c["file"][:3] in OVERRIDE] or hits   # проверенный аудит важнее снимка
    if not hits:
        return None
    def score(c):
        sc = 0
        if path is not None and path != ("", "") and (c["path"][1] == path[1] and path[1] or c["path"][0] == path[0] and path[0]): sc += 4
        if c["level"] == p.get("level"): sc += 2
        if en and c["en"] == en: sc += 1
        if c["file"][:3] in OVERRIDE: sc += 1   # свежие аудиты
        return sc
    return max(hits, key=score)


# ── Разбор старого текста: «Суть: …» и прочее → два раздела ────────────────

_LEAD = re.compile(r"^(\s*<p><em>[\s\S]*?</em></p>\s*)+")
_MECH = re.compile(r"(\d|бросок|бросает|провер|сложност|успех|кров[ьи]|Вол[яиюе]|ход[ау]?\b|сцен|урон|кубик|пул|"
                   r"Ловкост|Сил[аы] |Выносливост|Обаяни|Манипуляц|Внешност|Восприяти|Интеллект|Смекалк|"
                   r"Самоконтрол|Сознательност|Смелост|Человечност|без проверки|тратит)", re.I)


def _blocks(h):
    return [b for b in re.findall(r"<(?:p|ul|ol|table|h4|blockquote)\b[\s\S]*?</(?:p|ul|ol|table|h4|blockquote)>", h)]


def restructure(h):
    """Старая карточка без разделов → «Описание» + «Система». Текст не переписывается — только раскладывается."""
    if not h or STRUCTURED.search(h):
        return h
    lead = ""
    m = _LEAD.match(h)
    if m:
        lead, h = m.group(0), h[m.end():]
    blocks = _blocks(h)
    if not blocks:
        blocks = [f"<p>{h.strip()}</p>"] if h.strip() else []
    desc, sys_ = [], []
    first = blocks[0] if blocks else ""
    m = re.match(r"<p><strong>(Суть|Общее|Описание)[.:]?</strong>[:.]?\s*([\s\S]*)</p>$", first)
    if m:
        txt = m.group(2).strip()
        desc.append(f"<p>{txt[:1].upper() + txt[1:]}</p>")
        sys_ = blocks[1:]
    elif first.startswith("<ul>") and re.search(r"<li><strong>(Суть|Система|Правила)[.:]?</strong>", first):
        # список с пунктами «Суть: …» и «Система/Правила: …» — пункты до системы идут в описание
        lis = re.findall(r"<li>[\s\S]*?</li>(?=<li>|</ul>$)", first)
        cut = next((i for i, x in enumerate(lis) if re.match(r"<li><strong>(Система|Правила)", x)), 1)
        cap = lambda s: s[:1].upper() + s[1:]
        desc = [f"<p>{cap(re.sub(r'^<li>(<strong>Суть[.:]?</strong>[:.]?\s*)?|</li>$', '', x))}</p>" for x in lis[:cut]]
        rest = [re.sub(r"^<li><strong>(Система|Правила)[.:]?</strong>[:.]?\s*", "<li>", x, count=1) for x in lis[cut:]]
        sys_ = ([f"<ul>{''.join(rest)}</ul>"] if rest else []) + blocks[1:]
    else:
        # описание — вступительные абзацы без механики; система — с первого абзаца с цифрами, бросками и ценой
        i = 0
        while i < len(blocks) and blocks[i].startswith("<p") and not _MECH.search(re.sub(r"<[^>]+>", "", blocks[i])):
            i += 1
        desc, sys_ = blocks[:i], blocks[i:]
        if not desc and sys_ and sys_[0].startswith("<p"):
            # первый абзац смешанный: первое предложение — описание, остальное — система
            body = re.sub(r"^<p>|</p>$", "", sys_[0])
            parts = re.split(r"(?<=[.!?…])\s+(?=[А-ЯA-Z«])", body, maxsplit=1)
            if len(parts) == 2 and not _MECH.search(re.sub(r"<[^>]+>", "", parts[0])):
                desc, sys_ = [f"<p>{parts[0]}</p>"], [f"<p>{parts[1]}</p>"] + sys_[1:]
        if not sys_ and len(desc) > 1:
            desc, sys_ = desc[:1], desc[1:]
    if not desc:
        desc = ["<p>Подробное описание проявления в источнике не приводится — см. систему.</p>"]
    if not sys_:
        sys_ = ["<p>Отдельной механики источник не указывает: эффект определяет Рассказчик по описанию.</p>"]
    return lead + card("\n".join(desc), "\n".join(sys_))


# ── Дисциплины ──────────────────────────────────────────────────────────────

_PLAIN = lambda h: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h or "")).strip()
_BOILER = re.compile(r"^\s*<p>Полный текст исходной записи[^<]*</p>\s*")


def _cut_plain(h, n):
    """HTML без первых n знаков видимого текста (пробелы не считаются); теги вокруг вырезанного сохраняются."""
    out, i, seen = [], 0, 0
    while i < len(h) and seen < n:
        if h[i] == "<":
            j = h.index(">", i) + 1
            out.append(h[i:j]); i = j; continue
        if not h[i].isspace():
            seen += 1
        i += 1
    tail = re.sub(r"^(\s*</(?:strong|em|b|i)>)+", "", h[i:])   # закрывающий тег вырезанного жирного/курсива
    rest = "".join(t for t in out if not re.fullmatch(r"</?(strong|em|b|i)>", t)) + tail
    rest = re.sub(r"^((?:<[^>]+>)*)\s*[.,;:—–-]?\s*", r"\1", rest)
    rest = re.sub(r"<(strong|em|b|i)>\s*</\1>", "", rest)
    return re.sub(r"<p>\s*</p>|<li>\s*</li>", "", rest).strip()


def dedupe(h, path=""):
    """Система не повторяет описание: служебная строка «Полный текст исходной записи…» и повтор описания
    в начале системы (сравнение по тексту, без разметки) убираются. Если система была описанием целиком:
    из одного абзаца в несколько предложений первое остаётся описанием; иначе текст уходит в систему, а описание
    отсылает к пути."""
    if SYS_H not in h or DESC_H not in h:
        return h
    pre, sys_ = h.split(SYS_H, 1)
    lead, desc = pre.split(DESC_H, 1)
    desc, sys_ = desc.strip(), _BOILER.sub("", sys_).strip()
    dp, sp = re.sub(r"\s", "", _PLAIN(desc)), re.sub(r"\s", "", _PLAIN(sys_))
    # описание оборвано на сокращении («…Смекалка + Оккультизм (сл.») — это не предложение, а обрывок системы
    broken = bool(re.search(r"(?:\(|\b)(?:сл|мин|макс|ср|см|стр|т\.\s?е|т\.\s?д|напр)\.$", _PLAIN(desc)))
    if dp and sp.startswith(dp) and broken:
        desc = (f"<p>Ступень пути «{html.escape(path)}»: что делает путь и где его пределы — в описании пути.</p>"
                if path else "<p>Отдельного описания у силы нет — её действие целиком в системе.</p>")
    elif dp and sp.startswith(dp):
        rest = _cut_plain(sys_, len(dp))
        if _PLAIN(rest):
            sys_ = rest
        else:
            body = desc[3:-4] if desc.startswith("<p>") and desc.count("<p>") == 1 else ""
            parts = re.split(r"(?<=[.!?…])\s+(?=[А-ЯA-Z«*<])", body, maxsplit=1) if body else []
            if len(parts) == 2:
                desc, sys_ = f"<p>{parts[0]}</p>", f"<p>{parts[1]}</p>"
            else:
                desc = (f"<p>Ступень пути «{html.escape(path)}»: что делает путь и где его пределы — в описании пути.</p>"
                        if path else "<p>Отдельного описания у силы нет — её действие целиком в системе.</p>")
    return lead + card(desc, sys_)


def _era(x):
    """era — только "" или "darkAges" (иначе Codex.visible прячет запись); пометка редакции аудита — в status.
    Длинная пометка аудитора в source («…; Alchemy / Rasayana belongs to…») — в sourceNote, в source — книга и страницы."""
    src = x.get("source") or ""
    if len(src) > 60:
        short = re.sub(r"\s*\([^)]{20,}\)", "", src.split(";")[0]).strip(" .")
        x["sourceNote"], x["source"] = src, short[:80]
    e = x.get("era")
    if e and e != "darkAges":
        if re.match(r"(?i)dark\s*ages", e):
            x["era"] = "darkAges"
        else:
            x["status"] = e
            x["era"] = ""


def _corrections(v38):
    """Сверка с первоисточником (см. шапку файла)."""
    for pa in v38.get("koldunism", {}).get("paths", []):
        if pa.get("en") == "The Way of the Spirit":
            for p in pa["powers"]:
                for a, b in (("20 м", "15 м"), ("100 м", "90 м")):
                    p["name"] = re.sub(rf"\b{a}$", b, p["name"])
                    p["html"] = p.get("html", "").replace(f"<strong>{a}</strong>", f"<strong>{b}</strong>")


def _fill_path(pa, key, cards, stats):
    """Недостающая ступень пути из проверенного аудита (Змей внутри ••••• «Воздержание» — эррата Blood Sacrifice, p. 14)."""
    have = {p["level"] for p in pa.get("powers") or []}
    if len(have) >= 5:
        return
    want = {x for x in (norm(pa.get("name")), norm(pa.get("en"))) if x}
    for c in cards:
        lv = c.get("level")
        if c["file"][:3] not in OVERRIDE or c["key"] != key or not lv or lv in have or lv > 5 or not (want & set(c["path"])):
            continue
        t = re.sub(r"^[•●\s]+|^Уровень\s*\d+\s*:\s*", "", c["title"]).strip()
        en, ru = (t.split(" — ", 1) + [""])[:2] if " — " in t else ("", t)
        if re.search(r"[а-яё]", en, re.I):
            en, ru = ru, en
        p = {"level": lv, "name": ru or en, "en": en, "html": dedupe(card(c["desc"], c["sys"]), pa.get("name", "")),
             "source": c["file"]}
        pa["powers"].append(p); have.add(lv)
        stats["added"] = stats.get("added", 0) + 1
    pa["powers"].sort(key=lambda p: p["level"])


def disciplines(disc):
    """Силы, пути и правила — из снимка V38; разделы «Описание/Система» — из справочников, иначе раскладкой старого текста."""
    with open(os.path.join(SRC, "disciplines_v38.json"), encoding="utf-8") as f:
        v38 = json.load(f)
    asm = os.path.join(SRC, "assamite_sorcery.json")
    if os.path.exists(asm):
        with open(asm, encoding="utf-8") as f:
            v38["assamiteSorcery"] = {**v38["assamiteSorcery"], **json.load(f)}
    _corrections(v38)
    cards = doc_cards()
    stats = {"v38": 0, "docs": 0, "split": 0, "paths": 0}
    for key, d in v38.items():
        base = disc.get(key, {})
        out = {**base, **{k: v for k, v in d.items() if k not in ("clans",)}}
        cl = d.get("clans")
        out["clans"] = ", ".join(cl) if isinstance(cl, list) else (cl or base.get("clans", ""))
        lists = [(None, "", p) for p in out.get("powers") or []]
        for pa in out.get("paths") or []:
            lists += [((norm(pa.get("name")), norm(pa.get("en"))), pa.get("name", ""), p) for p in pa.get("powers") or []]
        for path, pname, p in lists:
            old = p.get("html", "")
            c = find_card(cards, key, p, path)
            prefer_doc = c and c["file"][:3] in OVERRIDE
            if STRUCTURED.search(old) and not prefer_doc:
                p["html"] = dedupe(mark(old), pname)
                stats["v38"] += 1
            elif c:
                lead = _LEAD.match(old)
                lead = lead.group(0) if lead and "Источник" not in c["desc"] + c["sys"] else ""
                p["html"] = dedupe(lead + card(c["desc"], c["sys"]), pname)
                stats["docs"] += 1
            else:
                p["html"] = dedupe(restructure(old), pname)
                stats["split"] += 1
            _era(p)
        for pa in out.get("paths") or []:
            _era(pa)
            _fill_path(pa, key, cards, stats)
            want = {x for x in (norm(pa.get("name")), norm(pa.get("en"))) if x}
            pc = next((c for c in PATHS if c["key"] == key and want & {c["ru"], c["en"]}), None)
            if pc and pc["html"]:
                pa["html"] = pc["html"]
                stats["paths"] += 1
        for r in out.get("rules") or []:
            r["html"] = mark(r.get("html", ""))
        disc[key] = out
    stats["described"] = _describe(disc)
    return stats


GENERIC = re.compile(r"<p>(Ступень пути «[^<]*»: что делает путь и где его пределы — в описании пути\.|"
                     r"Отдельного описания у силы нет — её действие целиком в системе\.)</p>")


def _describe(disc):
    """Описания сил, у которых в источнике только механика (descriptions.md — редакторские пересказы, колонка
    «Описание» таблиц по Дисциплинам и путям). Заменяют заглушку раздела «Описание»; «Система» не трогается."""
    path = os.path.join(SRC, "descriptions.md")
    if not os.path.exists(path):
        return 0
    found, key, pname = {}, None, None
    with open(path, encoding="utf-8") as f:
        for line in f:
            m = re.match(r'<a id="(\w+)"></a>', line)
            if m:
                key, pname = m.group(1), None; continue
            m = re.match(r"^###\s+(.+?)(?:\s+\(\*([^*]+)\*\))?(?:\s+·.*)?$", line.strip())
            if m:
                pname = (norm(m.group(1)), norm(m.group(2))); continue
            cells = [c.strip() for c in line.strip().strip("|").split("|")] if line.startswith("| ") else []
            if key and len(cells) >= 6 and re.fullmatch(r"[IVX]+", cells[0]):
                lvl = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"].index(cells[0])
                found[(key, pname, lvl, norm(cells[1]))] = cells[4]
    n = 0
    for key, d in disc.items():
        groups = [((norm("Силы Дисциплины"), ""), d.get("powers") or [])] + \
                 [((norm(pa.get("name")), norm(pa.get("en"))), pa.get("powers") or []) for pa in d.get("paths") or []]
        for pn, powers in groups:
            for p in powers:
                text = found.get((key, pn, p["level"], norm(p["name"])))
                if text and GENERIC.search(p["html"]):
                    p["html"] = GENERIC.sub(lambda _: f"<p>{html.escape(text, quote=False)}</p>", p["html"], count=1)
                    n += 1
    return n


# ── Ритуалы: проверенные карточки ──────────────────────────────────────────

# Ритуалы анархов из «Guide to the Anarchs» (p. 163; в V20 — Rites of the Blood, раздел Anarch Rituals), не колдунов
ANARCH_MOVE = {"Flatline", "Iron Body", "Hell's Calling", "Ward versus Vitae"}
_SKIP = re.compile(r"^(уровень|принадлежность|традиция|общая система|статус|редакция и источник|классификация)", re.I)


def _rite_names(title):
    t = re.sub(r"\s*\((?:уровень|ритуал)[^)]*\)\s*$", "", title.strip())
    t = re.sub(r"^\d+\.\s*", "", t)
    names = {norm(t)}
    m = re.search(r"\(\*?([^()*]+)\*?\)\s*$", t)
    if m:
        names |= {norm(m.group(1)), norm(t[:m.start()])}
    if " — " in t:
        names |= {norm(x) for x in t.split(" — ", 1)}
    return {x for x in names if x}


def ritual_cards():
    """tools/sources/structure/rituals/<ключ>__*.md: «### Имя (*En*)» / «### Имя — En (ритуал N-го уровня)» и разделы
    «**Описание**», «**Система**», «**Компоненты…**»… (раздел — строкой «**Заголовок**» или «**Заголовок:** текст»)."""
    md = _md()
    out = []
    for fn in sorted(os.listdir(RITES)):
        if not fn.endswith(".md"):
            continue
        key = fn.split("__")[0]
        with open(os.path.join(RITES, fn), encoding="utf-8") as f:
            lines = f.read().splitlines()
        cur, sec = None, None

        def close():
            nonlocal cur
            if cur:
                titles = [t.lower() for t, _ in cur["sections"]]
                if any(t.startswith("описание") for t in titles) and any(t.startswith(("система", "эффект")) for t in titles):
                    out.append(cur)
            cur = None

        for line in lines:
            h = re.match(r"^(#{2,4})\s+(.*)$", line)
            if h or line.strip() == "---":
                if cur and (not h or len(h.group(1)) <= cur["lvl"]):
                    close()
                if h and len(h.group(1)) >= 3:
                    title = h.group(2).strip()
                    lv = re.search(r"(?:уровень|ритуал)\s*(\d+)|(\d+)-го уровня", title)
                    cur = {"key": key, "file": fn, "lvl": len(h.group(1)), "names": _rite_names(title),
                           "level": int(lv.group(1) or lv.group(2)) if lv else None, "sections": []}
                    sec = None
                continue
            if not cur:
                continue
            m = re.match(r"^\*\*([^*]+?):?\*\*:?\s*(.*)$", line.strip())
            if m and len(m.group(1)) < 60:
                sec = [m.group(1).strip().rstrip(":"), [m.group(2)] if m.group(2) else []]
                cur["sections"].append(sec)
                if sec[0].lower() == "уровень" and not cur["level"]:
                    d = re.search(r"\d+", m.group(2)); cur["level"] = int(d.group(0)) if d else None
                continue
            if sec is not None:
                sec[1].append(line)
        close()
    for c in out:
        c["sections"] = [(t, md(ls)) for t, ls in c["sections"]]
    return out


def _rite_parts(c, head):
    p = {"desc": "", "components": "", "effect": "", "notes": [], "ref": "", "head": head}
    for title, body in c["sections"]:
        low = title.lower()
        if not body or _SKIP.match(low):
            continue
        if low.startswith("описание") and not p["desc"]:
            p["desc"] = body
        elif low.startswith(("система", "эффект")) and not p["effect"]:
            p["effect"] = body
        elif low.startswith(("компонент", "требования")):
            p["components"] += body
        elif low.startswith("время подготовки"):
            p["components"] += f"<p><strong>Время подготовки.</strong> {_PLAIN(body)}</p>"
        elif low.startswith("источник"):
            p["ref"] = _PLAIN(body)
        else:
            p["notes"].append({"title": title, "html": body})
    return p


def rituals(rits):
    """Перенос анархических ритуалов в Тауматургию и проверенные карточки поверх разделов ritual_docs."""
    import difflib, ritual_docs
    kold, thaum = rits.get("koldunism", {}).get("rituals", []), rits.get("thaumaturgy", {}).get("rituals", [])
    moved = [r for r in kold if r.get("en") in ANARCH_MOVE]
    for r in moved:
        kold.remove(r); r["discipline"] = "thaumaturgy"; thaum.append(r)
    thaum.sort(key=lambda r: r["level"])
    stats = {"moved": len(moved), "cards": 0, "matched": 0, "levelDiff": [], "unmatched": []}
    for c in ritual_cards():
        stats["cards"] += 1
        group = rits.get(c["key"], {}).get("rituals", [])
        names = lambda r: {norm(x) for x in [r.get("name")] + re.split(r"[;/]", r.get("en") or "") if norm(x)}
        hit = next((r for r in group if names(r) & c["names"]), None)
        if not hit:   # «Zaraqin» / «Zaraguin», «Ahriman's Weight» / «Wight» — по сходству в пределах уровня
            best = max(((difflib.SequenceMatcher(None, n, m).ratio(), r) for r in group if r["level"] == c["level"]
                        for n in names(r) for m in c["names"]), default=(0, None), key=lambda x: x[0])
            hit = best[1] if best[0] >= 0.85 else None
        if not hit:
            stats["unmatched"].append(f"{c['key']}: {sorted(c['names'])[0]}")
            continue
        if c["level"] and c["level"] != hit["level"]:
            stats["levelDiff"].append(f"{hit['name']}: {hit['level']}→{c['level']}")
        p = _rite_parts(c, ritual_docs._meta(hit))
        hit["parts"], hit["html"] = p, ritual_docs.compose(p["head"], p)
        stats["matched"] += 1
    return stats


# ── Достоинства и недостатки ────────────────────────────────────────────────

_NUM = re.compile(r"(?<![\w>])([+−-]\s?\d+(?:d10)?|\d+d10|\d+\s?(?:кубик\w*|успех\w*|пункт\w*|уров\w*|точк\w*))")


def merit_html(desc, system):
    esc = lambda s: _NUM.sub(r"<strong>\1</strong>", html.escape(s.strip(), quote=False))
    return card(f"<p>{esc(desc)}</p>", f"<p>{esc(system)}</p>")


def _mkey(x):
    return (x.get("kind"), norm(x.get("name")), norm(x.get("en")), norm(x.get("source")), x.get("line", ""))


def merits(records, set_name="merits"):
    """Описание и система — из финальной редакции; записи, которых нет в сборке, добавляются (порядок — как в редакции)."""
    with open(os.path.join(SRC, "merits_final.json"), encoding="utf-8") as f:
        final = json.load(f)[set_name]
    have = {}
    for x in records:
        have.setdefault(_mkey(x), x)
    out, used = [], set()
    for y in final:
        k = _mkey(y)
        x = have.get(k)
        rec = dict(x) if x else {k2: v for k2, v in y.items() if k2 not in ("description_text", "system_text", "source_ref")}
        rec["html"] = merit_html(y["description_text"], y["system_text"])
        if x: used.add(id(x))
        out.append(rec)
    # черты сборки, которых нет в редакции, — в конце, разложенные по разделам
    for x in records:
        if id(x) not in used and _mkey(x) not in {_mkey(y) for y in final}:
            out.append({**x, "html": restructure(x.get("html", ""))})
    return out


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    sys.path.insert(0, HERE)
    import fsretry; fsretry.install()
    for name in ("merits-ghouls", "demon-merits"):
        p = os.path.join(ROOT, "data", f"{name}.json")
        with open(p, encoding="utf-8") as f:
            recs = json.load(f)
        recs = merits(recs, name)
        with open(p, "w", encoding="utf-8", newline="\n") as f:
            json.dump(recs, f, ensure_ascii=False, indent=1)
        print(f"  {name}: {len(recs)}")


if __name__ == "__main__":
    main()
