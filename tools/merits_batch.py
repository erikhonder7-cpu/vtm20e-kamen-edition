"""Влить партию редакции достоинств и недостатков (merits.json из архива аудита) в снимок
tools/sources/structure/merits_final.json (ключ «merits»; черты гулей и демонов не трогаются).

    python -I tools/merits_batch.py <путь к merits.json партии>

Что делает: оставляет поля, нужные сборке; где «Система» начинается с полного текста «Описания» — убирает повтор,
а если механики сверх описания нет — берёт исходную разбивку (source_html_original) или ручную (SPLIT); проверяет кланы.
Потом — python -I tools/build_data.py, python -I tools/text_structure.py и сборка компендиев."""
import html, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SNAP = os.path.join(HERE, "sources", "structure", "merits_final.json")
KEEP = ["kind", "category", "name", "en", "cost", "min", "max", "clan", "sect", "era", "source", "line", "bystander", "page",
        "source_ref", "description_text", "system_text"]
CLAN_ALIAS = {"salubri": "salyubri", "cappadocian": "kappadokiytsy"}

# Черты, у которых весь текст — одна механика: (вид, имя, книга) → (описание, система); None — остаток текста после описания
SPLIT = {
    ("merit", "Здравый смысл", "V20 Dark Ages"): ("Персонаж практичен и рассудителен.",
        "В напряжённых ситуациях можно просить подсказку Рассказчика о самом разумном варианте; он также может предупредить о необдуманном действии."),
    ("merit", "Долг благодарности", "V20 Dark Ages"): ("Старейшина вам обязан.", None),
    ("flaw", "Глубокий сон", "V20 Dark Ages"): ("Сон захватывает полностью.", "Сложность бросков пробуждения днём +2."),
    ("flaw", "Жуткое присутствие", "V20 Dark Ages"): ("Вас окружает осязаемое для смертных ощущение неправильности.", None),
    ("merit", "Эффективное пищеварение", "V20 Dark Ages"): ("Вампирская система усваивает кровь лучше.",
        "+1 очко крови на каждые 2 полученных при питании."),
    ("flaw", "Враг", "V20 Dark Ages"): ("Вы нажили вражду лица или организации.", None),
    ("flaw", "Позорный сир", "V20 Dark Ages"): ("Сир — человек дурной репутации (дерзкий, безответственный, мятежный).",
        "Вы виновны по ассоциации, а он может перекладывать на вас свои провалы."),
    ("merit", "Чуткий сон", "V20 Dark Ages"): ("Вы просыпаетесь от любого нежелательного шума.",
        "Автоматический успех при проверках на обнаружение обычной попытки нападения во сне."),
    ("merit", "Везучий", "V20 Dark Ages"): ("Удача благоволит вам.", None),
    ("flaw", "Кошмары", "V20 Dark Ages"): ("Сон приносит кошмары.",
        "После сна — бросок Воли; провал: ужас снов тяготит, −1 кубик ко всем пулам до следующего сна."),
    ("flaw", "Медленное исцеление", "V20 Dark Ages"): ("Плоть плохо заживает.",
        "Обычный уровень урона стоит 2 очка крови, уровень агравированного урона требует 5 дней (сверх обычных затрат)."),
    ("flaw", "Вульгарный", "V20 Dark Ages"): ("Знамениты грубостью и бестактностью.", None),
}

sq = lambda s: re.sub(r"\s", "", s or "")
repeats = lambda d, s: bool(sq(d)) and sq(s).startswith(sq(d))


def after(d, s):
    """Остаток s после текста d (сравнение без пробелов)."""
    need, i, n = len(sq(d)), 0, 0
    while i < len(s) and n < need:
        n += not s[i].isspace()
        i += 1
    return s[i:].strip()


def original_split(h):
    m = re.search(r"<strong>Описание</strong></p>(.*?)<p><strong>Система</strong></p>(.*?)(?:<p><em>|<p><strong>|$)", h or "", re.S)
    if not m:
        return None
    text = lambda s: html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"</p>\s*<p>", "\n", s))).strip()
    d, s = (re.sub(r"[ \t]+", " ", text(g)).strip() for g in m.groups())
    return (d, s) if d and s and not repeats(d, s) else None


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    sys.path.insert(0, HERE)
    import fsretry; fsretry.install()
    src = json.load(open(sys.argv[1], encoding="utf-8"))
    snap = json.load(open(SNAP, encoding="utf-8"))
    clans = {c["key"] for c in json.load(open(os.path.join(ROOT, "data", "clans.json"), encoding="utf-8"))}
    out, fixed, unresolved, odd_clans = [], {"остаток": 0, "исходная разбивка": 0, "вручную": 0}, [], []
    for x in src:
        y = {k: x[k] for k in KEEP if k in x}
        d, s = y.get("description_text", ""), y.get("system_text", "")
        if repeats(d, s):
            rest, orig, manual = after(d, s), original_split(x.get("source_html_original")), SPLIT.get((y["kind"], y["name"], y.get("source")))
            if len(sq(rest)) >= 15:
                y["system_text"] = rest; fixed["остаток"] += 1
            elif orig:
                y["description_text"], y["system_text"] = orig; fixed["исходная разбивка"] += 1
            elif manual:
                md, ms = manual
                y["description_text"], y["system_text"] = md, ms if ms is not None else after(md, s); fixed["вручную"] += 1
            else:
                unresolved.append(f'{y["kind"]} «{y["name"]}» ({y.get("source")})')
        for c in str(y.get("clan") or "").split(","):
            c = CLAN_ALIAS.get(c.strip(), c.strip())
            if c and c not in clans:
                odd_clans.append(f'«{y["name"]}»: {c}')
        out.append(y)
    before = len(snap["merits"])
    snap["merits"] = out
    with open(SNAP, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(snap, ensure_ascii=False, indent=1) + "\n")
    print(f"черт: {before} → {len(out)}; повтор описания в системе убран: {fixed}")
    if unresolved:
        print(f"повтор не разобран ({len(unresolved)}) — допиши в SPLIT:", *unresolved, sep="\n  ")
    if odd_clans:
        print("кланы не из data/clans.json:", *odd_clans, sep="\n  ")


if __name__ == "__main__":
    main()
