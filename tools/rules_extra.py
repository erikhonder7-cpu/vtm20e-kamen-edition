# tools/rules_extra.py
# Справочник правил для Foundry: главы «V20_Основные_правила» (пересказ книги) → data/rules.json.
# Глава — запись журнала, раздел «## …» — страница; вводный текст до первого раздела — страница «Обзор».
# Компендий «Правила V20» собирает tools/build_packs.mjs (rules).

import os, re

def collect(ref, md_to_html):
    src = os.path.join(ref, "V20_Основные_правила")
    out = []
    for fn in sorted(f for f in os.listdir(src) if f.endswith(".md")):
        text = open(os.path.join(src, fn), encoding="utf-8").read()
        text = re.sub(r"^---\n.*?\n---\n", "", text, flags=re.S)          # шапка YAML
        lines = text.split("\n")
        title = next((l[2:].strip() for l in lines if l.startswith("# ")), fn[3:-3].replace("_", " "))
        title = re.sub(r"\s+[—-]\s+(основная книга\s+)?V20$", "", title)
        pages, cur = [], {"name": "Обзор", "lines": []}
        for l in lines:
            if l.startswith("# "):
                continue
            if l.startswith("## "):
                if any(x.strip() for x in cur["lines"]): pages.append(cur)
                cur = {"name": l[3:].strip(), "lines": []}
            else:
                cur["lines"].append(l)
        if any(x.strip() for x in cur["lines"]): pages.append(cur)
        out.append({"key": fn[:2], "name": f"{int(fn[:2])}. {title}",
                    "pages": [{"name": p["name"], "html": md_to_html(p["lines"])} for p in pages]})
    print("Глав справочника правил:", len(out), "страниц:", sum(len(c["pages"]) for c in out))
    return out
