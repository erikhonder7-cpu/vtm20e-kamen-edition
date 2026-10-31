# tools/rules_extra.py
# Справочник правил для Foundry: главы «V20_Основные_правила» (пересказ книги) → data/rules.json.
# Глава — запись журнала, раздел «## …» — страница; вводный текст до первого раздела — страница «Обзор».
# Компендий «Правила V20» собирает tools/build_packs.mjs (rules).

import os, re

# Главы из дополнений — после глав основной книги, со своим номером (файл, заголовок главы)
EXTRA = [("Rites_of_the_Blood/02_Шабаш_ритуалы_и_ритусы.md", "Магия Шабаша и ритусы (Rites of the Blood)")]


def collect(ref, md_to_html):
    src = os.path.join(ref, "V20_Основные_правила")
    out = []
    files = [(os.path.join(src, fn), fn[:2], None) for fn in sorted(f for f in os.listdir(src) if f.endswith(".md"))]
    # 08 и 09 заняты главами гулей и инфернализма (data/rules-ghouls.json, rules-infernal.json) — дополнения с 10-й
    files += [(os.path.join(ref, rel), f"{10 + i:02d}", title) for i, (rel, title) in enumerate(EXTRA)]
    for path, key, own in files:
        fn = os.path.basename(path)
        text = open(path, encoding="utf-8").read()
        text = re.sub(r"^---\n.*?\n---\n", "", text, flags=re.S)          # шапка YAML
        lines = text.split("\n")
        title = next((l[2:].strip() for l in lines if l.startswith("# ")), fn[3:-3].replace("_", " "))
        title = re.sub(r"\s+[—-]\s+(основная книга\s+)?V20$", "", title)
        title = own or title
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
        out.append({"key": key, "name": f"{int(key)}. {title}",
                    "pages": [{"name": p["name"], "html": md_to_html(p["lines"])} for p in pages]})
    print("Глав справочника правил:", len(out), "страниц:", sum(len(c["pages"]) for c in out))
    return out
