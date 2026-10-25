# tools/abilities_extra.py
# Способности из дополнений — вторичные, добавляются на лист строкой (traits.hbs, подсказка по группе).
# Guide to the Sabbat (Revised, 1999), «Новые Способности»: Гадание, Попрошайничество, Соблазнение (Таланты),
# Танец огня (Навык), Знание Чёрной Руки, Знание преступного мира (Знания). Вызывается из build_data.main().

import os, re, html
from build_data import REF, read, md_to_html

GTS = "Guide to the Sabbat (Revised)"
SABBAT = ("Revised_Гайды_сект/03b_Шабаш_1999_создание_персонажа_предыстории_достоинства.md", "### Новые Способности", GTS, "sabbat")
GROUPS = {"Таланты": "talents", "Навыки": "skills", "Знания": "knowledges"}

def collect():
    rel, start, book, sect = SABBAT
    path = os.path.join(REF, rel)
    if not os.path.exists(path):
        print("Способности Шабаша: нет файла", rel); return []
    lines = read(path)
    i = next((k for k, l in enumerate(lines) if l.strip() == start), None)
    if i is None:
        print("Способности Шабаша: нет раздела"); return []
    out, group, cur = [], None, None
    def flush():
        if cur: out.append({"name": cur[0], "en": cur[1], "group": group_of[cur[0]], "source": book, "sect": sect, "era": "",
                            "html": f"<p><em>Источник: {html.escape(book)}. Вторичная способность Шабаша.</em></p>" + md_to_html(cur[2])})
    group_of = {}
    for l in lines[i + 1:]:
        if re.match(r"^#{1,3}\s", l) or l.strip() == "---": break           # следующий раздел книги
        m = re.match(r"^####\s+(.+)$", l)
        if m:
            group = GROUPS.get(m.group(1).strip(), group); continue
        m = re.match(r"^\*\*([^*]+)\*\*\s*\(([^);]+)[^)]*\)\.\s*(.*)$", l)
        if m:
            flush()
            cur = (m.group(1).strip(), m.group(2).strip(), [m.group(3)])
            group_of[cur[0]] = group
            continue
        if cur and l.strip(): cur[2].append(l)
    flush()
    print(f"Способности Шабаша: +{len(out)} — {', '.join(x['name'] for x in out)}")
    return out
