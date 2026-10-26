# tools/infernal_docs.py
# Инфернализм у вампиров по справочнику пользователя tools/sources/infernal/pacts.md (пересказ, не текст книг):
#   · data/rules-infernal.json — глава правил «9. Инфернализм: договоры, пакты и Вложения» (раздел «# N.» — страница),
#     лежит отдельным файлом, как rules-ghouls.json, — компендий «Правила V20» (tools/build_packs.mjs);
#   · data/investments.json — Вложения: восемь V20 (Rites of the Blood, раздел 7: 3 опыта, не больше постоянной Воли)
#     и старые из книг Шабаша (раздел 11, рейтинг 1–6). Цена применения (кровь, Воля, постоянная Воля) и бросок —
#     в COSTS по механике раздела.
# Запуск — из build_data.py (или сам: python -I tools/infernal_docs.py).

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from ritual_docs import md_html, _inline  # noqa: E402

SRC = os.path.join(HERE, "sources", "infernal", "pacts.md")
OUT = os.path.join(os.path.dirname(HERE), "data")

# цена применения и бросок: кровь, Воля (временная), постоянная Воля; roll — пул и сложность
COSTS = {
    "Arsenal of the Beast": {"willpower": 0, "note": "1 Воля — урон тяжёлый до конца сцены"},
    "Contagion": {"willpower": 1},
    "Degraded Restraint": {"willpower": 1},
    "Enmity Purge": {"blood": 1},
    "Essence to Ash": {"willpowerPerm": 1},
    "Insidious Whispers": {"blood": 2},
    "Penance of the Damned": {"blood": 1},
    "Telepathic Worm": {"willpower": 1, "roll": {"trait1": "attributes.wits", "trait2": "abilities.intimidation", "difficulty": 6}},
    "Psychic Tracker": {"blood": 1, "note": "1 кровь за час"},
    "Cause Vertigo": {"blood": 1},
    "Magic Portal": {"blood": 1},
    "Toxic Blast": {"blood": 1},
    "Two Dimensional": {"blood": 1},
    "Teleportation": {"blood": 1, "willpower": 1},
    "Turn to Toad": {"blood": 1, "willpower": 1},
}


def table_html(rows):
    cells = [[c.strip() for c in r.strip().strip("|").split("|")] for r in rows]
    cells = [c for c in cells if not all(re.fullmatch(r":?-{2,}:?", x) for x in c)]
    if not cells:
        return ""
    head, body = cells[0], cells[1:]
    return ("<table><thead><tr>" + "".join(f"<th>{_inline(c)}</th>" for c in head) + "</tr></thead><tbody>"
            + "".join("<tr>" + "".join(f"<td>{_inline(c)}</td>" for c in r) + "</tr>" for r in body) + "</tbody></table>")


def block_html(lines):
    """Markdown раздела: подзаголовки ##/### — h3/h4, таблицы, цитаты, остальное — абзацы и списки (md_html)."""
    out, buf, tbl = [], [], []

    def flush():
        nonlocal buf, tbl
        if buf:
            out.append(md_html(buf))
            buf = []
        if tbl:
            out.append(table_html(tbl))
            tbl = []

    for line in lines:
        s = line.strip()
        if s.startswith("|"):
            if buf:
                out.append(md_html(buf))
                buf = []
            tbl.append(s)
            continue
        if tbl:
            flush()
        m = re.match(r"^(#{2,4})\s+(.*)$", s)
        if m:
            flush()
            out.append(f"<h{len(m.group(1)) + 1}>{_inline(m.group(2))}</h{len(m.group(1)) + 1}>")
        elif s == "---":
            flush()
        elif s.startswith(">"):
            buf.append(s.lstrip("> ").strip())
        else:
            buf.append(line)
    flush()
    return "".join(out)


def sections(text):
    """Разделы «# N. Заголовок» → [(номер, заголовок, строки)]."""
    res, cur = [], None
    for line in text.split("\n"):
        m = re.match(r"^#\s+(\d+)\.\s+(.*)$", line)
        if m:
            cur = (int(m.group(1)), m.group(2).strip(), [])
            res.append(cur)
        elif re.match(r"^#\s", line):
            cur = None
        elif cur:
            cur[2].append(line)
    return res


def investments_v20(lines):
    """Раздел 7: «## 7.N. En — Ru», поля «Что даёт / Механика / Границы»."""
    res, cur, sec = [], None, None
    for line in lines:
        m = re.match(r"^##\s+7\.(\d+)\.\s+(.+?)\s+—\s+(.+)$", line)
        if m:
            cur = {"en": m.group(2).strip(), "name": m.group(3).strip(), "tier": "v20", "rating": 0, "xp": 3, "parts": []}
            res.append(cur)
            sec = None
            continue
        if re.match(r"^##\s", line):
            cur = None
            continue
        if not cur:
            continue
        lm = re.match(r"^\*\*([^*]+?):\*\*\s*(.*)$", line.strip())
        if lm:
            sec = [lm.group(1), [lm.group(2)]]
            cur["parts"].append(sec)
        elif sec:
            sec[1].append(line)
    return res


def investments_sabbat(lines):
    """Раздел 11: «## 11.K. Рейтинг R», пункты «N. **En — Ru.** текст»."""
    res, rating = [], 0
    for line in lines:
        m = re.match(r"^##\s+11\.\d+\.\s+Рейтинг\s+(\d+)", line)
        if m:
            rating = int(m.group(1))
            continue
        if re.match(r"^##\s", line):
            rating = 0
            continue
        im = re.match(r"^\d+\.\s+\*\*(.+?)\s+—\s+(.+?)\.\*\*\s*(.*)$", line.strip())
        if im and rating:
            res.append({"en": im.group(1).strip(), "name": im.group(2).strip(), "tier": "sabbat", "rating": rating, "xp": 0,
                        "parts": [["Что даёт", [im.group(3)]]]})
    return res


def finish(inv):
    c = COSTS.get(inv["en"], {})
    html = "".join(f"<h4>{_inline(t)}</h4>{md_html(ls)}" for t, ls in inv.pop("parts"))
    src = "V20 Rites of the Blood" if inv["tier"] == "v20" else "Players Guide / Storytellers Handbook to the Sabbat"
    inv.update({"html": html, "source": src, "cost": {"blood": c.get("blood", 0), "willpower": c.get("willpower", 0),
                "willpowerPerm": c.get("willpowerPerm", 0)}, "costNote": c.get("note", ""),
                **({"roll": c["roll"]} if c.get("roll") else {})})
    return inv


def build():
    text = open(SRC, encoding="utf-8").read()
    secs = sections(text)
    pages = [{"name": f"{n}. {title}", "html": block_html(lines)} for n, title, lines in secs]
    chapter = [{"key": "09", "name": "9. Инфернализм: договоры, пакты и Вложения", "pages": [
        {"name": "Обзор", "html": "<p><strong>Источник:</strong> справочник «Договоры, пакты и дары демонов вампирам» — сводка по "
                                  "<em>Demon: The Fallen</em>, <em>V20 Rites of the Blood</em>, <em>Dark Ages: Devil’s Due</em> и ранним книгам Шабаша, "
                                  "пересказ. Вложения — отдельными предметами в компендии «Инфернальные Вложения».</p>"}] + pages}]
    by = {n: lines for n, _, lines in secs}
    inv = [finish(x) for x in investments_v20(by.get(7, []))] + [finish(x) for x in investments_sabbat(by.get(11, []))]
    for name, obj in [("rules-infernal.json", chapter), ("investments.json", inv)]:
        with open(os.path.join(OUT, name), "w", encoding="utf-8", newline="\n") as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)
    return {"pages": len(pages), "v20": sum(1 for x in inv if x["tier"] == "v20"), "sabbat": sum(1 for x in inv if x["tier"] == "sabbat")}


if __name__ == "__main__":
    print(build())
