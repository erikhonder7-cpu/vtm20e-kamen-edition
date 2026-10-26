# tools/ritual_docs.py
# Ритуалы по справочникам пользователя (tools/sources/rituals/*.md — пересказы, не текст книг):
#   necromancy.md, thaumaturgy.md, assamiteSorcery.md, darkThaumaturgy.md, koldunism.md, setiteSorcery.md,
#   obtenebration.md — те же ритуалы, что в каталоге, с полным
#   описанием по разделам; koldunism-extra.md — ритуалы Колдовства, которых в каталоге не было.
# Запись справочника: «### [N.] Имя (En) — уровень X [**[пометка]**]», дальше разделы «**Описание:**», «**Компоненты…:**»,
# «**Эффект…:**» и прочие («Правила и ограничения», «Расширенное пояснение», «Источник», «Как снять»…).
# apply() кладёт в ритуал parts = {head, desc, components, effect, notes: [{title, html}], ref} и пересобирает html
# (шапка «Уровень · Бросок · Источник» остаётся). Чьей записи в справочнике нет — ритуал не трогается.

import html as _html
import os
import re

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sources", "rituals")
DOCS = {"necromancy": "necromancy.md", "thaumaturgy": "thaumaturgy.md", "assamiteSorcery": "assamiteSorcery.md",
        "darkThaumaturgy": "darkThaumaturgy.md", "koldunism": "koldunism.md",
        "setiteSorcery": "setiteSorcery.md", "obtenebration": "obtenebration.md"}
EXTRA = {"koldunism": "koldunism-extra.md"}

HEAD = re.compile(r"^#{2,3}\s+(?:\d+\.\s+)?(?P<title>.+?)\s+—\s+(?P<lvl>.+?)\s*(?:\*\*\[(?P<tag>[^\]]+)\]\*\*)?\s*$")
# без уровня в заголовке — уровень из раздела «# Уровень 1»: сетиты «## 1. Имя (En)», Мистика Бездны «### Имя (En)»
HEAD_NUM = re.compile(r"^(?:#{2,3}\s+\d+\.\s+|###\s+)(?P<title>.+?)\s*(?:\*\*\[(?P<tag>[^\]]+)\]\*\*)?\s*$")
SECTION_LEVEL = re.compile(r"^#{1,2}\s+(?:Уровень\s+\d+|Ритуал\w*\s+\w+\s+уровня)", re.I)
# раздел: «**Имя:** текст» или «**Имя**» отдельной строкой; «**Практическое значение.**» — подзаголовок внутри раздела
LABEL = re.compile(r"^\*\*(?P<label>[^*]+?)(?::\*\*|\*\*:|\*\*\s*$)\s*(?P<rest>.*)$")
ROMAN_WORDS = {"первого": 1, "второго": 2, "третьего": 3, "четвёртого": 4, "пятого": 5, "шестого": 6, "седьмого": 7,
               "восьмого": 8, "девятого": 9, "десятого": 10}


def _inline(s):
    s = _html.escape(s, quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", s)
    s = re.sub(r"(?<![\w])_(?!\s)(.+?)(?<!\s)_(?![\w])", r"<em>\1</em>", s)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    return s


def md_html(lines):
    """Абзацы, списки «- »/«1. », жирный, курсив — в HTML."""
    out, para, lst = [], [], None

    def flush():
        nonlocal para, lst
        if para:
            out.append("<p>" + _inline(" ".join(para)) + "</p>")
            para = []
        if lst:
            tag, items = lst
            out.append(f"<{tag}>" + "".join(f"<li>{_inline(i)}</li>" for i in items) + f"</{tag}>")
            lst = None

    for raw in lines:
        line = raw.strip()
        m = re.match(r"^(?:[-*•]|(\d+)[.)])\s+(.*)$", line)
        if not line:
            flush()
        elif m:
            tag = "ol" if m.group(1) else "ul"
            if para:
                out.append("<p>" + _inline(" ".join(para)) + "</p>")
                para = []
            if not lst or lst[0] != tag:
                flush()
                lst = (tag, [])
            lst[1].append(m.group(2))
        elif lst and raw.startswith(("  ", "\t")):
            lst[1][-1] += " " + line
        else:
            if lst:
                flush()
            para.append(line)
    flush()
    return "".join(out)


def _level(s):
    m = re.search(r"(\d+)", s)
    if m:
        return int(m.group(1))
    for w, n in ROMAN_WORDS.items():
        if w in s:
            return n
    return 0


def _split_title(t):
    """«Имя (*En*)» → (имя, en); скобка с латиницей — английское имя."""
    t = t.strip()
    m = re.match(r"^(.*?)\s*\(([^()]*[A-Za-z][^()]*)\)\s*$", t)
    if m:
        return m.group(1).strip(), m.group(2).strip().strip("*_").strip()
    return t, ""


def parse(path):
    """Записи справочника: [{name, en, level, levelText, tag, sections: [(label, [строки])]}]."""
    entries, cur, sec, section_level = [], None, None, 0
    with open(path, encoding="utf-8") as f:
        lines = f.read().split("\n")
    for line in lines:
        if line.startswith("#"):
            m, lvl = None, 0
            if SECTION_LEVEL.match(line):
                section_level = _level(line)
            else:
                m = HEAD.match(line)
                lvl = _level(m.group("lvl")) if m else 0
                if m and m.group("title").count("(") > m.group("title").count(")"):
                    m, lvl = HEAD_NUM.match(line), section_level   # тире внутри скобок: «(En; в некоторых списках — …)»
                elif m and not lvl:                   # «— переменный уровень», «— название требует проверки»
                    lvl = section_level
                elif not m:                           # «## 1. Имя (En)», «### Имя (En)» — уровень из раздела
                    m = HEAD_NUM.match(line)
                    lvl = section_level if m else 0
            if m and lvl:
                name, en = _split_title(m.group("title"))
                lvl_text = (m.groupdict().get("lvl") or f"уровень {lvl}").strip()
                cur = {"name": name, "en": en, "level": lvl, "levelText": lvl_text,
                       "tag": (m.group("tag") or "").strip(), "sections": []}
                entries.append(cur)
                sec = None
            else:
                cur = sec = None                      # заголовок уровня или главы — запись закончилась
            continue
        if cur is None:
            continue
        if line.strip() == "---":
            continue
        m = LABEL.match(line.strip())
        if m and not m.group("label").rstrip().endswith("."):
            sec = (m.group("label").strip(), [m.group("rest")] if m.group("rest") else [])
            cur["sections"].append(sec)
        elif sec is not None:
            sec[1].append(line)
        elif line.strip():
            cur["sections"].append(("", [line]))
            sec = cur["sections"][-1]
    return entries


def parts_of(e):
    """Разделы записи → поля ритуала."""
    p = {"desc": "", "components": "", "effect": "", "notes": [], "ref": ""}
    for label, lines in e["sections"]:
        body = md_html(lines)
        low = label.lower()
        if low.startswith("описание") and not p["desc"]:
            p["desc"] = body
        elif low.startswith("компонент") and not p["components"]:
            p["components"] = body
        elif low.startswith("эффект") and not p["effect"]:
            p["effect"] = body
        elif low == "источник":
            p["ref"] = re.sub(r"<[^>]+>", "", body).strip()
        elif body:
            p["notes"].append({"title": label or "Примечание", "html": body})
    if e.get("tag"):
        p["notes"].append({"title": "Пометка составителя", "html": "<p>" + _inline(e["tag"]) + "</p>"})
    return p


def norm(s):
    s = (s or "").lower().replace("ё", "е")
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"[«»\"'’`.,:;!?*_\-–—]", " ", s)
    return " ".join(s.split())


def compose(meta, p):
    """Полный HTML ритуала из частей (для библиотеки, кодекса и старых листов)."""
    sec = lambda title, body: f'<h4 class="r-rite-h">{title}</h4>{body}' if body else ""
    notes = "".join(sec(_html.escape(n["title"]), n["html"]) for n in p["notes"])
    ref = f'<p class="r-rite-ref"><em>Источник: {_html.escape(p["ref"])}</em></p>' if p["ref"] else ""
    return meta + p["desc"] + sec("Компоненты и проведение", p["components"]) + sec("Эффект и механика", p["effect"]) + notes + ref


def _meta(r):
    """Шапка «Уровень · Бросок · Источник» и строка «Другие переводы» из каталога — остаются над текстом справочника."""
    h = r.get("html") or ""
    m = re.match(r'(<p class="r-ritual-meta">.*?</p>)', h)
    aka = re.search(r"<p><em>Другие переводы:.*?</em></p>", h)
    return (m.group(1) if m else "") + (aka.group(0) if aka else "")


def _aliases(r):
    """Другие переводы имени ритуала из каталога: «Другие переводы: «А» (книга), «Б»»."""
    m = re.search(r"Другие переводы:(.*?)</em>", r.get("html") or "")
    return [norm(x) for x in re.findall(r"«([^»]+)»", m.group(1))] if m else []


def match(group, entries):
    """Пары (ритуал каталога, запись справочника): по имени и уровню, потом по английскому имени или другому переводу."""
    left = list(range(len(entries)))
    pairs, rest = {}, []
    by_name = {}
    for i in left:
        by_name.setdefault((norm(entries[i]["name"]), entries[i]["level"]), []).append(i)
    for ri, r in enumerate(group):
        c = by_name.get((norm(r["name"]), r["level"])) or by_name.get((norm(r["name"]), 0))
        c = [i for i in (c or []) if i in left]
        if c:
            pairs[ri] = c[0]
            left.remove(c[0])
        else:
            rest.append(ri)
    still = []
    for ri in rest:
        en, aka = norm(group[ri].get("en", "").split(";")[0]), _aliases(group[ri])
        c = [i for i in left if (en and norm(entries[i]["en"].split(";")[0]) == en) or norm(entries[i]["name"]) in aka]
        if c:
            pairs[ri] = c[0]
            left.remove(c[0])
        else:
            still.append(ri)
    return pairs, still, left


TRAIT_RU = {"attributes.intelligence": "Интеллект", "attributes.wits": "Смекалка", "abilities.occult": "Оккультизм"}


def _new_ritual(key, group, e):
    """Ритуал, которого нет в каталоге: бросок — как у ритуалов этой школы в каталоге, сложность 3 + уровень (не выше 9)."""
    p = parts_of(e)
    source = re.split(r"[;,]\s*(?:p\.|с\.)|;", p["ref"])[0].strip(" .") or "—"
    base = next((r["roll"] for r in group if r.get("roll", {}).get("trait1")), {})
    t1, t2 = base.get("trait1", "attributes.intelligence"), base.get("trait2", "abilities.occult")
    r = {"discipline": key, "level": e["level"], "name": e["name"], "en": e["en"], "source": source,
         "era": "darkAges" if "Dark Ages" in source else "",
         "roll": {"trait1": t1, "trait2": t2, "difficulty": min(9, 3 + e["level"])}}
    meta = (f'<p class="r-ritual-meta"><strong>Уровень {r["level"]}</strong> · Бросок: {TRAIT_RU.get(t1, t1)} + {TRAIT_RU.get(t2, t2)}, '
            f'сложность {r["roll"]["difficulty"]} · Источник: {_html.escape(source)}</p>')
    p["head"] = meta
    r["parts"], r["html"] = p, compose(meta, p)
    return r


def apply(rituals, report=None):
    report = report if report is not None else {}
    for key, fn in DOCS.items():
        path = os.path.join(SRC, fn)
        if key not in rituals or not os.path.exists(path):
            continue
        group = rituals[key]["rituals"]
        entries = parse(path)
        pairs, miss_cat, miss_doc = match(group, entries)
        for ri, ei in pairs.items():
            r, p = group[ri], parts_of(entries[ei])
            p["head"] = _meta(r)
            r["parts"] = p
            r["html"] = compose(p["head"], p)
        added = [_new_ritual(key, group, entries[i]) for i in miss_doc]   # есть в справочнике, нет в каталоге
        group.extend(added)
        group.sort(key=lambda r: r["level"])             # устойчиво: прежний порядок внутри уровня, новые — следом
        report[key] = {"catalog": len(group) - len(added), "doc": len(entries), "matched": len(pairs),
                       "noDoc": [group[i]["name"] for i in miss_cat], "added": [r["name"] for r in added]}
    # недостающие ритуалы школы отдельным файлом (Колдовство)
    for key, fn in EXTRA.items():
        path = os.path.join(SRC, fn)
        if key not in rituals or not os.path.exists(path):
            continue
        group = rituals[key]["rituals"]
        have = {norm(r["name"]) for r in group}
        added = [_new_ritual(key, group, e) for e in parse(path) if norm(e["name"]) not in have and e["level"]]
        group.extend(added)
        group.sort(key=lambda r: r["level"])
        report[key + "+"] = {"added": [r["name"] for r in added]}
    return report
