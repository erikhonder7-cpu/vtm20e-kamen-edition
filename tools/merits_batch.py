"""Влить партию редакции достоинств и недостатков (merits.json из архива аудита) в снимок
tools/sources/structure/merits_final.json (ключ «merits»; черты гулей и демонов не трогаются).

    python -I tools/merits_batch.py <накопительная база партии.json> [--base <база архива.json> | --onto] [--dry]

Что делает: оставляет поля, нужные сборке; где «Система» начинается с полного текста «Описания» — убирает повтор,
а если механики сверх описания нет — берёт исходную разбивку (source_html_original) или ручную (SPLIT); проверяет кланы.

Сначала сверяет архив с текущим снимком. Если в архиве есть все наши черты — архив заменяет базу целиком. Если части
нет (архив собран от старой базы или параллельно с другим архивом) — останавливается и перечисляет пропавшие, а
дальше по выбору: --base <база> — трёхстороннее слияние, берутся только изменения архива относительно базы, от
которой он собран (конфликты — остановка); --onto — изменения архива поверх текущей базы (общие черты — из архива,
список изменённых печатается). --dry — только отчёт, снимок не записывается.
Потом — python -I tools/build_data.py, python -I tools/text_structure.py и сборка компендиев."""
import html, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SNAP = os.path.join(HERE, "sources", "structure", "merits_final.json")
KEEP = ["kind", "category", "name", "en", "cost", "min", "max", "clan", "sect", "era", "source", "line", "bystander", "page", "mortal",
        "source_ref", "description_text", "system_text"]
CLAN_ALIAS = {"salubri": "salyubri", "cappadocian": "kappadokiytsy"}
# Эпоха в системе — только «darkAges» (и «elder-only» у Elysium): Codex.visible скрывает всё с неизвестной эпохой.
# Партия 31 пометила книги Revised как era «revised» — это редакция, а не эпоха хроники.
ERA_ALIAS = {"revised": "", "modern": "", "legacy": ""}
# Карантин аудитора (партия 31): запись осталась в базе, но источник «UNRESOLVED…» — в каталог не берём
QUARANTINE = re.compile(r"^UNRESOLVED")

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


def normalize(src, report):
    """Записи архива → записи снимка: нужные поля, повтор описания в системе убран, кланы проверены."""
    out = []
    for x in src:
        y = {k: x[k] for k in KEEP if k in x}
        if y.get("era") in ERA_ALIAS:
            y["era"] = ERA_ALIAS[y["era"]]
        # партия 33: «только для смертных» (Vampire Players Guide 2003) — линия «mortal»; у нас линия общая, а пометка mortal
        # показывает черту лишь смертным и охотникам (library.mjs, creator.mjs)
        if y.get("line") == "mortal":
            y["line"] = ""; y["mortal"] = True
        d, s = y.get("description_text", ""), y.get("system_text", "")
        if repeats(d, s):
            rest, orig, manual = after(d, s), original_split(x.get("source_html_original")), SPLIT.get((y["kind"], y["name"], y.get("source")))
            if len(sq(rest)) >= 15:
                y["system_text"] = rest; report["fixed"]["остаток"] += 1
            elif orig:
                y["description_text"], y["system_text"] = orig; report["fixed"]["исходная разбивка"] += 1
            elif manual:
                md, ms = manual
                y["description_text"], y["system_text"] = md, ms if ms is not None else after(md, s); report["fixed"]["вручную"] += 1
            else:
                report["unresolved"].append(f'{y["kind"]} «{y["name"]}» ({y.get("source")})')
        for c in str(y.get("clan") or "").split(","):
            c = CLAN_ALIAS.get(c.strip(), c.strip())
            if c and c not in report["clans"]:
                report["odd_clans"].append(f'«{y["name"]}»: {c}')
        out.append(y)
    return out


def pair(xs, ys):
    """Сопоставить записи двух баз: по виду, имени, эпохе и линии; внутри — сначала та же книга, потом то же
    английское имя, потом по порядку (партия может уточнить книгу). → ([(i, j)], свободные i, свободные j)."""
    key = lambda r: (r["kind"], r["name"], r.get("era", ""), r.get("line", ""))
    free = {}
    for j, y in enumerate(ys):
        free.setdefault(key(y), []).append(j)
    # проходы по всей базе, а не по записи: иначе одноимённая черта другой книги займёт чужую пару
    pairs, left = [], list(range(len(xs)))
    for same in (lambda x, y: y.get("source") == x.get("source"), lambda x, y: y.get("en") == x.get("en"), lambda x, y: True):
        rest = []
        for i in left:
            cand = free.get(key(xs[i]), [])
            pick = next((j for j in cand if same(xs[i], ys[j])), None)
            if pick is None:
                rest.append(i)
            else:
                cand.remove(pick); pairs.append((i, pick))
        left = rest
    used = {j for _, j in pairs}
    return pairs, left, [j for j in range(len(ys)) if j not in used]


def label(r):
    return f'{r["kind"]} «{r["name"]}» ({r.get("source")})'


def by_source(recs):
    count = {}
    for r in recs:
        count[r.get("source") or "?"] = count.get(r.get("source") or "?", 0) + 1
    return ", ".join(f"{s} — {n}" for s, n in sorted(count.items(), key=lambda z: -z[1]))


RETIRED = []   # черты, убранные архивом при слиянии, — в snap["retired"]


def merge(cur, arc, base, onto):
    """Итоговая база или None (остановка). cur — снимок, arc — архив, base — база архива (или None)."""
    pairs, lone_cur, new_arc = pair(cur, arc)
    if not lone_cur:
        return arc                                    # архив собран от нашей базы (или новее) — целиком
    lost = [cur[i] for i in lone_cur]
    if base is None and not onto:
        print(f"✗ В архиве нет {len(lost)} черт текущей базы: {by_source(lost)}.\n"
              "  Архив собран от другой (старой) базы — целиком вливать нельзя, эти черты пропадут.\n"
              "  Если есть база, от которой он собран, — --base <база.json> (берутся только изменения архива);\n"
              "  иначе --onto (изменения архива поверх текущей базы; изменённые черты будут перечислены — проверьте их).")
        return None
    out = [dict(r) for r in cur]
    if base is not None:
        # трёхстороннее: только то, что архив изменил или добавил относительно своей базы
        bp, removed, added = pair(base, arc)
        cb, _, _ = pair(cur, base)
        cur_of_base = {j: i for i, j in cb}
        conflicts, changed = [], 0
        # убранное архивом (в том числе переименованное: старое имя убрано, новое добавлено) — убрать и у нас,
        # если у нас эту черту не правили; правленую — конфликт
        drop = set()
        for b in removed:
            i = cur_of_base.get(b)
            if i is None:
                continue
            if cur[i] == base[b]:
                drop.add(i)
            else:
                conflicts.append(label(cur[i]) + " — убрана в архиве, но изменена у нас")
        for b, a in bp:
            if base[b] == arc[a]:
                continue
            i = cur_of_base.get(b)
            if i is None or out[i] == arc[a]:
                continue
            if cur[i] != base[b]:
                conflicts.append(label(cur[i])); continue
            out[i] = arc[a]; changed += 1
        if conflicts:
            print(f"✗ Конфликты ({len(conflicts)}): черту изменили и у нас, и в архиве — разберите вручную:",
                  *conflicts, sep="\n  ")
            return None
        # новое относительно базы архива; та же запись уже есть у нас (влита раньше) — не повторять
        new = [arc[a] for a in added if arc[a] not in out]
        if drop:
            print("убраны архивом:", *[label(cur[i]) for i in sorted(drop)], sep="\n  ")
            # сборка находит эти черты и в главах справочника — список выбывших не даёт им вернуться (text_structure.merits)
            RETIRED.extend({k: cur[i].get(k, "") for k in ("kind", "name", "en", "source")} for i in sorted(drop))
        out = [r for i, r in enumerate(out) if i not in drop] + new
        kept = len(lost) - len(drop)
        print(f"слияние от базы архива: изменено {changed}, добавлено {len(new)}, убрано {len(drop)}; "
              f"сохранено черт, которых нет в архиве: {kept}")
        return out
    # --onto: архив главнее во всех общих чертах
    diff = [(i, j) for i, j in pairs if cur[i] != arc[j]]
    for i, j in diff:
        out[i] = arc[j]
    out += [arc[j] for j in new_arc]
    print(f"наложение на текущую базу: сохранено черт, которых нет в архиве: {len(lost)} ({by_source(lost)}); "
          f"добавлено {len(new_arc)}; изменено {len(diff)}")
    if diff:
        print("  изменённые черты (если архив старше нашей базы, это может быть откат — проверьте):",
              *[label(arc[j]) for _, j in diff[:40]], *(["  …"] if len(diff) > 40 else []), sep="\n    ")
    return out


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    sys.path.insert(0, HERE)
    import fsretry; fsretry.install()
    args = sys.argv[1:]
    flag = lambda f: f in args and (args.remove(f) or True)
    onto, dry = flag("--onto"), flag("--dry")
    base_path = None
    if "--base" in args:
        k = args.index("--base"); base_path = args[k + 1]; del args[k:k + 2]
    if len(args) != 1:
        sys.exit(__doc__)
    report = {"fixed": {"остаток": 0, "исходная разбивка": 0, "вручную": 0}, "unresolved": [], "odd_clans": [],
              "clans": {c["key"] for c in json.load(open(os.path.join(ROOT, "data", "clans.json"), encoding="utf-8"))}}
    snap = json.load(open(SNAP, encoding="utf-8"))
    raw = json.load(open(args[0], encoding="utf-8"))
    # черты гулей и ревенантов (ghoul: true) у нас — отдельный набор «merits-ghouls», не основной список
    ghouls = normalize([x for x in raw if x.get("ghoul")], report)
    arc = normalize([x for x in raw if not x.get("ghoul")], report)
    base = normalize([x for x in json.load(open(base_path, encoding="utf-8")) if not x.get("ghoul")],
                     {**report, "fixed": dict(report["fixed"]), "unresolved": [], "odd_clans": []}) if base_path else None
    before = len(snap["merits"])
    out = merge(snap["merits"], arc, base, onto)
    if out is None:
        sys.exit(1)
    held = [r for r in out if QUARANTINE.match(r.get("source") or "")]
    if held:
        out = [r for r in out if r not in held]
        print("в карантине аудитора — убраны из каталога:", *[label(r) for r in held], sep="\n  ")
        prev = {(r["kind"], r["name"]) for r in held}
        RETIRED.extend({k: c.get(k, "") for k in ("kind", "name", "en", "source")} for c in snap["merits"] if (c["kind"], c["name"]) in prev)
    if ghouls:
        cur = snap["merits-ghouls"]
        pairs, _, new = pair(cur, ghouls)
        changed = sum(1 for i, j in pairs if {**ghouls[j], "ghoul": cur[i].get("ghoul", True)} != cur[i])
        for i, j in pairs:
            cur[i] = {**ghouls[j], "ghoul": cur[i].get("ghoul", True)}
        cur += [{**ghouls[j], "ghoul": True} for j in new]
        print(f"черты гулей: изменено {changed}, добавлено {len(new)} (всего {len(cur)})")
    print(f"черт: {before} → {len(out)}; повтор описания в системе убран: {report['fixed']}")
    if report["unresolved"]:
        print(f"повтор не разобран ({len(report['unresolved'])}) — допиши в SPLIT:", *report["unresolved"], sep="\n  ")
    if report["odd_clans"]:
        print("кланы не из data/clans.json:", *report["odd_clans"], sep="\n  ")
    if dry:
        print("(--dry: снимок не записан)")
        return
    snap["merits"] = out
    if RETIRED:
        have = snap.setdefault("retired", [])
        have += [r for r in RETIRED if r not in have]
    with open(SNAP, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(snap, ensure_ascii=False, indent=1) + "\n")


if __name__ == "__main__":
    main()
