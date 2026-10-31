# tools/text_structure.py
# Единый вид сил Дисциплин и черт: два раздела — «Описание» (что это и как выглядит) и «Система» (бросок, цена, сроки, ограничения).
# Источники лежат в tools/sources/structure:
#   disciplines_v38.json — снимок базы Дисциплин (PATCHSET V38): силы, пути, правила, броски;
#   docs/*.md            — справочники V38 по Дисциплинам и каталоги (у каждой силы «Описание» и «Система»);
#                          07_Necromancy.md и 07b_… — более поздний аудит Некромантии V20 (имеет приоритет над снимком);
#   merits_final.json    — финальная редакция достоинств и недостатков (поля description_text / system_text).
# Вызывается из build_data.py (Дисциплины и data/merits.json). Черты гулей и падших лежат в data/ готовыми —
# их пересобирает запуск этого файла:  python -I tools/text_structure.py

import os, re, json, html, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, "sources", "structure")
DOCS = os.path.join(SRC, "docs")

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
    """«Уровень 2: Когти Зверя (*Feral Claws*)» → ("когтизверя", "feralclaws")."""
    t = re.sub(r"^(Уровень\s*\d+(\s*[–—-]\s*\d+)?(\s*·[^:]*)?\s*[:.—–-]\s*|[•●\s]+|\d+(\.\d+)*\.?\s+)", "", title.strip())
    en = ""
    m = re.search(r"\(([^()]*)\)\s*$", t)
    if m:
        en = m.group(1).strip("* ").split(";")[0]
        t = t[:m.start()]
    return norm(t), norm(en)


def doc_cards():
    md = _md()
    cards = []
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
            if cur and cur["desc"] and cur["sys"]:
                cards.append(cur)
            cur = None

        for line in lines:
            s = line.strip()
            if re.fullmatch(r"(#{2,6}\s*|\*\*)Описание(\*\*)?[.:]?", s):
                close()
                if stack:
                    lvl, title = stack[-1]
                    ru, en = _names(title)
                    path = next((_names(t) for l, t in reversed(stack[:-1]) if l < lvl), ("", ""))
                    cur = {"key": key, "file": fn, "lvl": lvl, "ru": ru, "en": en, "path": path, "desc": [], "sys": []}
                    m2 = re.match(r"Уровень\s*(\d+)", title)
                    cur["level"] = int(m2.group(1)) if m2 else len(re.findall(r"[•●]", title)) or None
                    mode = "desc"
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
            if cur and re.match(r"^\*\*(Параметры броска|Редакционн|Примечание аудита)", s):
                mode = None; continue
            if cur and mode:
                cur[mode].append(line)
        close()
    for c in cards:
        c["desc"] = md(c["desc"]); c["sys"] = md(c["sys"])
    return [c for c in cards if c["desc"] and c["sys"]]


def find_card(cards, key, p, path=None):
    ru, en = norm(p.get("name")), norm(p.get("en"))
    pool = [c for c in cards if c["key"] == key] or cards
    hits = [c for c in pool if (en and c["en"] == en) or (ru and c["ru"] == ru)]
    if not hits:
        return None
    def score(c):
        sc = 0
        if path is not None and path != ("", "") and (c["path"][1] == path[1] and path[1] or c["path"][0] == path[0] and path[0]): sc += 4
        if c["level"] == p.get("level"): sc += 2
        if en and c["en"] == en: sc += 1
        if c["file"].startswith("07_"): sc += 1   # свежий аудит Некромантии
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

def disciplines(disc):
    """Силы, пути и правила — из снимка V38; разделы «Описание/Система» — из справочников, иначе раскладкой старого текста."""
    with open(os.path.join(SRC, "disciplines_v38.json"), encoding="utf-8") as f:
        v38 = json.load(f)
    cards = doc_cards()
    stats = {"v38": 0, "docs": 0, "split": 0}
    for key, d in v38.items():
        base = disc.get(key, {})
        out = {**base, **{k: v for k, v in d.items() if k not in ("clans",)}}
        cl = d.get("clans")
        out["clans"] = ", ".join(cl) if isinstance(cl, list) else (cl or base.get("clans", ""))
        lists = [(None, p) for p in out.get("powers") or []]
        for pa in out.get("paths") or []:
            lists += [((norm(pa.get("name")), norm(pa.get("en"))), p) for p in pa.get("powers") or []]
        for path, p in lists:
            old = p.get("html", "")
            c = find_card(cards, key, p, path)
            prefer_doc = key == "necromancy" and c and c["file"].startswith("07")
            if STRUCTURED.search(old) and not prefer_doc:
                p["html"] = mark(old)
                stats["v38"] += 1; continue
            if c:
                lead = _LEAD.match(old)
                lead = lead.group(0) if lead and "Источник" not in c["desc"] + c["sys"] else ""
                p["html"] = lead + card(c["desc"], c["sys"])
                stats["docs"] += 1
            else:
                p["html"] = restructure(old)
                stats["split"] += 1
        for r in out.get("rules") or []:
            r["html"] = mark(r.get("html", ""))
        disc[key] = out
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
