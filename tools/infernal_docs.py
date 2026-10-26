# tools/infernal_docs.py
# Инфернализм у вампиров по справочнику пользователя tools/sources/infernal/pacts.md (пересказ, не текст книг):
#   · data/rules-infernal.json — глава правил «9. Инфернализм: договоры, пакты и Вложения» (раздел «# N.» — страница),
#     лежит отдельным файлом, как rules-ghouls.json, — компендий «Правила V20» (tools/build_packs.mjs);
#   · data/investments.json — Вложения: восемь V20 (Rites of the Blood, раздел 7: 3 опыта, не больше постоянной Воли)
#     и старые из книг Шабаша (раздел 11, рейтинг 1–6). Цена применения (кровь, Воля, постоянная Воля) и бросок —
#     в COSTS по механике раздела.
#   · data/pact-templates.json — готовые договоры для библиотеки листа: образцы раздела 15 и домашние заготовки
#     по шкале Devil’s Due (раздел 9) — PACT_EXTRA, свои слова.
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


# домашние заготовки договоров: кому, форма (barter | empowerment | foedus), метка слуги, дар, плата, границы, нарушение,
# обязательство / частота / последствие по Devil’s Due (частота: 1 — каждый день … 5 — раз в месяц)
PACT_EXTRA = [
    {"name": "Исцеление за веру", "sub": "договор Веры для смертного", "who": "mortal", "form": "foedus", "thrall": True,
     "terms": "Демон исцеляет болезнь или увечье — снимает недостаток вроде хромоты, хронической болезни или слепоты на один глаз.",
     "price": "Каждый день — короткая молитва демону по имени; Вера слуги идёт хозяину по договору.",
     "limits": "Новые раны и болезни договор не лечит; исцеление держится, пока договор в силе.",
     "breach": "Пропущенная без причины молитва — болезнь возвращается, и слуга теряет точку Выносливости (вернуть — только опытом).",
     "o": 1, "f": 1, "c": 4},
    {"name": "Счастливая звезда", "sub": "удача в делах", "who": "mortal", "form": "foedus", "thrall": True,
     "terms": "Пока договор в силе — +2 к факту биографии «Ресурсы» (не выше 5): сделки удаются, долги прощают, находятся покупатели.",
     "price": "Раз в неделю — привести на встречу культа нового человека, который придёт по своей воле.",
     "limits": "Деньги не защищают от закона и от тех, кого разорили; после разрыва Ресурсы падают до прежних.",
     "breach": "Неделя без новичка по своей вине — уровень тяжёлых повреждений, не поглощаемых Выносливостью.",
     "o": 3, "f": 3, "c": 2},
    {"name": "Ответ из темноты", "sub": "одна правда за одну услугу", "who": "vampire", "form": "barter", "thrall": False,
     "terms": "Демон честно отвечает на один вопрос о прошлом, о тайне или о слабости названного существа.",
     "price": "Ответная услуга, которую демон называет сразу; выполнить до следующего новолуния.",
     "limits": "Ответ правдив, но не обязан быть полным; о самом демоне и его хозяевах — не спрашивают.",
     "breach": "Услуга не выполнена в срок — один заранее названный бросок проваливается сам, и это не отменить Волей.",
     "o": 3, "f": 5, "c": 3},
    {"name": "Чужое лицо", "sub": "месяц под маской", "who": "vampire", "form": "empowerment", "thrall": False,
     "terms": "Лунный месяц смертные, камеры и зеркала видят вместо лица Сородича лицо, выбранное при сделке.",
     "price": "Принести демону личную вещь своего сира и каплю его витэ.",
     "limits": "Не обманывает Прорицание 4 и выше, истинную веру и тех, кто знает вампира по запаху или голосу.",
     "breach": "Попытка подсунуть чужую вещь или чужую кровь — маска спадает в самый неудобный миг, и демон требует долг вдвойне.",
     "o": 4, "f": 5, "c": 2},
    {"name": "Падение соперника", "sub": "разрушить чужие опоры", "who": "vampire", "form": "barter", "thrall": False,
     "terms": "За лунный месяц демон рушит смертные опоры названного врага: деньги, связи, доброе имя (два факта биографии врага −2 по выбору рассказчика).",
     "price": "Раз в месяц — отдать убежище на одну ночь под ритуалы культа, не задавая вопросов.",
     "limits": "Демон не убивает врага и не трогает его Дисциплины и узы; разрушенное враг может отстроить.",
     "breach": "Не пустил культ в назначенную ночь — минус точка Характеристики, названной в договоре (вернуть — только опытом).",
     "o": 3, "f": 5, "c": 4},
    {"name": "Щит из бездны", "sub": "жизнь в обмен на дары", "who": "mortal", "form": "foedus", "thrall": True,
     "terms": "Раз за сцену, когда удар грозит слуге смертью, — два лишних кубика поглощения против этого удара, и летальные, и тяжёлые.",
     "price": "Раз в неделю — оставить в святилище демона что-то ценное: деньги, вещь, дорогую сердцу память.",
     "limits": "Только против ударов; огонь, яд, падение и солнце договор не держит.",
     "breach": "Неделя без дара — один заранее названный бросок проваливается сам.",
     "o": 2, "f": 3, "c": 3},
]


def pact_templates(lines):
    """Раздел 15: «## 15.N. «Название» — пояснение», поля «**Поле:** текст» → договоры для библиотеки + PACT_EXTRA."""
    raw, cur, sec = [], None, None
    for line in lines:
        m = re.match(r"^##\s+15\.\d+\.\s+«(.+?)»\s+—\s+(.+)$", line)
        if m:
            cur = {"name": m.group(1).strip(), "sub": m.group(2).strip(), "parts": []}
            raw.append(cur)
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
    plain = lambda s: re.sub(r"\s+", " ", s.replace("*", "")).strip()
    res = []
    for c in raw:
        f = {k: plain(" ".join(v)) for k, v in c["parts"]}
        allt = " ".join(f.values())
        num = lambda w: int(m.group(1)) if (m := re.search(w + r"\s+(\d)", allt)) else 0
        model = f.get("Модель", "")
        form = "foedus" if ("Devil" in model or "Pact" in model) else "barter"
        res.append({"name": c["name"], "sub": c["sub"], "origin": "doc", "who": "vampire", "form": form, "thrall": False,
                    "terms": f.get("Дар", ""), "price": f.get("Цена") or f.get("Обязательство", ""),
                    "obligation": num("Obligation"), "frequency": num("Frequency"), "consequence": num("Consequence"),
                    "html": "".join(f"<p><strong>{_inline(t)}:</strong> {_inline(' '.join(x.strip() for x in ls if x.strip()))}</p>"
                                    for t, ls in c["parts"])})
    labels = [("Дар", "terms"), ("Плата", "price"), ("Границы", "limits"), ("Нарушение", "breach")]
    for x in PACT_EXTRA:
        html = "".join(f"<p><strong>{t}:</strong> {x[k]}</p>" for t, k in labels) + (
            f"<p><strong>Devil’s Due:</strong> обязательство {x['o']}, частота {x['f']}, последствие {x['c']} — рейтинг {x['o'] + x['c'] - x['f']}.</p>"
            "<p><em>Домашняя заготовка по шкале справочника (раздел 9); рассказчик подгоняет под хронику.</em></p>")
        res.append({"name": x["name"], "sub": x["sub"], "origin": "home", "who": x["who"], "form": x["form"], "thrall": x["thrall"],
                    "terms": x["terms"], "price": x["price"], "obligation": x["o"], "frequency": x["f"], "consequence": x["c"], "html": html})
    return res


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
    pacts = pact_templates(by.get(15, []))
    for name, obj in [("rules-infernal.json", chapter), ("investments.json", inv), ("pact-templates.json", pacts)]:
        with open(os.path.join(OUT, name), "w", encoding="utf-8", newline="\n") as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)
    return {"pages": len(pages), "pacts": len(pacts), "v20": sum(1 for x in inv if x["tier"] == "v20"), "sabbat": sum(1 for x in inv if x["tier"] == "sabbat")}


if __name__ == "__main__":
    print(build())
