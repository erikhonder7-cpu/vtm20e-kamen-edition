# Сводные таблицы по справочникам трёх линеек -> Мир Тьмы/Сводки/
# Запуск из папки «Мир Тьмы»:  python -I _скрипты/svod.py
# Собирает по заголовкам и таблицам .md; то, что скрипт не узнал, ищите в указателях.
import os, re, sys
sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'Сводки')
os.makedirs(OUT, exist_ok=True)

DISC = {  # English -> русское название из V20 (Студия 101)
 'Animalism':'Анимализм','Auspex':'Ясновидение','Celerity':'Стремительность','Chimerstry':'Фантасмагория',
 'Dementation':'Помешательство','Dominate':'Доминирование','Fortitude':'Стойкость','Necromancy':'Некромантия',
 'Obfuscate':'Сокрытие','Obtenebration':'Затмение','Potence':'Мощь','Presence':'Величие','Protean':'Метаморфозы',
 'Quietus':'Упокоение','Serpentis':'Серпентис','Thaumaturgy':'Тауматургия','Vicissitude':'Преображение',
 'Bardo':'Бардо','Valeren':'Валерен','Visceratika':'Висцератика','Daimoinon':'Демонион','Melpominee':'Мельпомения',
 'Mytherceria':'Мистификация','Obeah':'Обеа','Ogham':'Огам','Flight':'Полёт','Sanguinus':'Сангвинус',
 'Spiritus':'Спиритус','Thanatosis':'Танатозис','Temporis':'Темпорис','Abombwe':'Абомбве','Koldunic Sorcery':'Колдовство',
 'Dur-An-Ki':'Дур-Ан-Ки',
}
RU_ALIAS = {v: k for k, v in DISC.items()}
RU_ALIAS.update({'Власть над Тенью':'Obtenebration','Затемнение':'Obfuscate','Изменчивость':'Vicissitude',
 'Смертоносность':'Quietus','Превращение':'Protean','Присутствие':'Presence','Прорицание':'Auspex',
 'Могущество':'Potence','Химерия':'Chimerstry','Мифэрсерия':'Mytherceria','Мистерия':'Mytherceria'})

DOT = '•'
NAME_RE = re.compile(r'^\**\s*(.+?)\s*\**\s*\(([^()]*[A-Za-z][^()]*)\)')

def meta(text):
    m = re.match(r'---\n(.*?)\n---', text, re.S)
    d = {}
    if m:
        for line in m.group(1).split('\n'):
            if ':' in line:
                k, v = line.split(':', 1); d[k.strip()] = v.strip().strip('"')
    return d

def split_name(s):
    s = re.sub(r'\*\*', '', s).strip(' —-:')
    m = re.match(r'^(.*?)\s*\(([^()]*[A-Za-z][^()]*)\)', s)
    if m:
        return m.group(1).strip(' *'), m.group(2).strip()
    return s.strip(), ''

def find_disc(s):
    for en in sorted(DISC, key=len, reverse=True):
        if re.search(r'\b' + re.escape(en) + r'\b', s): return en
    for ru, en in RU_ALIAS.items():
        if ru in s: return en
    return None

def level_of(cell):
    cell = cell.strip()
    if DOT in cell: return cell.count(DOT)
    m = re.match(r'^(?:ур\.?\s*|уровень\s*|ранг\s*)?(\d{1,2})\b', cell, re.I)
    return int(m.group(1)) if m else None

def files(line):
    base = os.path.join(ROOT, line, '_справочник')
    for d, _, fs in os.walk(base):
        for f in sorted(fs):
            if f.endswith('.md') and not f.startswith(('Указатель', 'README', 'AGENTS', 'Глоссарий', '_')):
                p = os.path.join(d, f)
                yield os.path.relpath(p, base).replace('\\', '/'), open(p, encoding='utf-8').read()

ED_ORDER = ['V20', 'W20', 'M20', 'V20 Dark Ages']
def ed_key(e): return (ED_ORDER.index(e) if e in ED_ORDER else 9, e)

def extract_levels(text, ctx_fn):
    """Возвращает (контекст, уровень, ru, en) по заголовкам с точками / «Уровень N», спискам и таблицам."""
    out = []; ctx = None; lvl_ctx = None
    hdr = None  # (lvl_idx, name_idx)
    for raw in text.split('\n'):
        s = raw.strip()
        if s.startswith('#'):
            hdr = None
            h = s.lstrip('#').strip()
            n = len(s) - len(s.lstrip('#'))
            c = ctx_fn(h, n)
            if c is not None and DOT not in h:
                ctx = c; lvl_ctx = None
            m = re.match(r'^(?:Уровень|Ранг|Ур\.)\s*(\d+)', h)
            if m:
                lvl_ctx = int(m.group(1)); continue
            if DOT in h and ctx:
                lv = h.count(DOT); ru, en = split_name(h.replace(DOT, ''))
                if ru: out.append((ctx, lv, ru, en))
                continue
            if lvl_ctx and ctx and n >= 3:
                ru, en = split_name(h)
                if en: out.append((ctx, lvl_ctx, ru, en))
            continue
        if s.startswith('|'):
            cells = [c.strip() for c in s.strip('|').split('|')]
            if hdr is None:
                li = [i for i, c in enumerate(cells) if re.match(r'^(Ур\.?|Уровень|Ранг|Ранг Дара)$', c, re.I)]
                if li:
                    ni = [i for i, c in enumerate(cells) if re.match(r'^(Сила|Дар|Название|Ритуал)', c, re.I)]
                    hdr = (li[0], ni[0] if ni else (1 if li[0] == 0 else 0))
                continue
            if set(s) <= set('|-: '): continue
            if ctx and len(cells) > max(hdr):
                lv = level_of(cells[hdr[0]]); ru, en = split_name(cells[hdr[1]])
                if lv and ru: out.append((ctx, lv, ru, en))
            continue
        hdr = None if not s else hdr
        if lvl_ctx and ctx and s.startswith(('- **', '* **')):
            ru, en = split_name(s[2:].split('—')[0].split(':')[0])
            if ru: out.append((ctx, lvl_ctx, ru, en))
    return out

def write(name, title, intro, body):
    with open(os.path.join(OUT, name), 'w', encoding='utf-8', newline='\n') as f:
        f.write(f'# {title}\n\n{intro}\n\n' + body)
    print(name, 'ok')

def link(line, rel): return f'`{line}/{rel[:-3]}`'

# ---------- 1. Вампиры: Дисциплины по уровням
agg = {}
for rel, text in files('Вампиры'):
    ed = meta(text).get('edition', '?')
    def ctx_fn(h, n):
        d = find_disc(h)
        return d
    for d, lv, ru, en in extract_levels(text, ctx_fn):
        if lv > 10: continue
        key = (d, lv, (en or ru).lower())
        e = agg.setdefault(key, {'ru': ru, 'en': en, 'src': {}})
        e['src'].setdefault(ed, set()).add(rel.split('/')[0] + '/' + rel.split('/')[-1][:2])
body = ''
for d in sorted({k[0] for k in agg}, key=lambda x: DISC.get(x, x)):
    body += f'## {DISC.get(d, d)} ({d})\n\n| Ур. | Сила | Редакции и файлы |\n|---|---|---|\n'
    rows = sorted([(k, v) for k, v in agg.items() if k[0] == d], key=lambda kv: (kv[0][1], kv[1]['ru']))
    for k, v in rows:
        src = '; '.join(f'{e}: ' + ', '.join(sorted(v['src'][e])) for e in sorted(v['src'], key=ed_key))
        nm = v['ru'] + (f' ({v["en"]})' if v['en'] else '')
        body += f'| {k[1]} | {nm} | {src} |\n'
    body += '\n'
write('Вампиры_Дисциплины_по_уровням.md', 'Вампиры: Дисциплины по уровням',
      'Собрано скриптом `_скрипты/svod.py` из `Вампиры/_справочник/` (заголовки с точками и таблицы с колонкой уровня). Файл указан как «папка/номер». Пути Тауматургии и Некромантии, комбинированные силы и ритуалы здесь не все — их смотреть по указателю. Одна сила с разными английскими названиями даёт разные строки. Сначала V20, потом прочие редакции.', body)

# ---------- 2. Вампиры: кланы и линии крови (таблицы с колонкой «Дисциплины»)
rows = []
for rel, text in files('Вампиры'):
    ed = meta(text).get('edition', '?'); hdr = None
    for raw in text.split('\n'):
        s = raw.strip()
        if not s.startswith('|'): hdr = None; continue
        cells = [c.strip() for c in s.strip('|').split('|')]
        if hdr is None:
            di = [i for i, c in enumerate(cells) if 'Дисциплин' in c and 'Комбин' not in c]
            if di and len(cells) >= 2:
                wi = [i for i, c in enumerate(cells) if re.match(r'^(Изъян|Слабость|Проклятие)', c)]
                hdr = (0, di[0], wi[0] if wi else None)
            continue
        if set(s) <= set('|-: '): continue
        if len(cells) <= hdr[1]: continue
        nm = re.sub(r'\*\*', '', cells[0]); dis = cells[hdr[1]]
        nd = sum(1 for en in DISC if re.search(r'\b'+re.escape(en)+r'\b', dis)) + sum(1 for ru in RU_ALIAS if ru in dis)
        if nd < 2 or not re.search(r'[А-Яа-яЁё]', nm) or re.match(r'^\d', nm): continue
        weak = re.sub(r'\*\*', '', cells[hdr[2]])[:160] if hdr[2] is not None and len(cells) > hdr[2] else ''
        rows.append((ed, nm, dis, weak, rel))
body = '| Клан / линия | Дисциплины | Изъян (начало) | Редакция | Файл |\n|---|---|---|---|---|\n'
for ed, nm, dis, weak, rel in sorted(rows, key=lambda r: (ed_key(r[0]), r[1])):
    body += f'| {nm} | {dis} | {weak.replace("|", "/")} | {ed} | {link("Вампиры", rel)} |\n'
write('Вампиры_кланы_и_линии_крови.md', 'Вампиры: кланы, линии крови, ветви',
      'Собрано скриптом из таблиц, где есть колонка «Дисциплины». Описания кланов, данные текстом (кланбуки Revised, Lore of the Clans), сюда не попали — см. `V20_Основные_правила/02` и папки кланбуков. Изъян обрезан до 160 знаков.', body)

# ---------- 3. Вампиры: Пути и Дороги
rows = []
for rel, text in files('Вампиры'):
    ed = meta(text).get('edition', '?'); L = text.split('\n')
    for i, s in enumerate(L):
        if not s.startswith('#'): continue
        h = s.lstrip('#').strip()
        if not re.search(r'\b(Path|Road|Via)\b', h) and not re.match(r'^(Путь|Дорога)\b', h): continue
        if re.search(r'Тауматург|Некромант|Thaumaturg|Necromanc', h): continue
        ru, en = split_name(h)
        virt = ''; sins = False
        for t in L[i + 1:i + 40]:
            if t.startswith('#') and t.count('#') <= s.count('#'): break
            m = re.search(r'Добродетели\**\s*:?\**\s*:?\s*([^.\n]+)', t)
            if m and not virt: virt = re.sub(r'\*\*', '', m.group(1)).strip()[:90]
            if re.search(r'Иерархи|Hierarchy|грех', t, re.I): sins = True
        if virt or sins: rows.append((ed, ru, en, virt, 'да' if sins else '', rel))
seen = set(); body = '| Путь / Дорога | Добродетели | Иерархия грехов в файле | Редакция | Файл |\n|---|---|---|---|---|\n'
for ed, ru, en, virt, sins, rel in sorted(rows, key=lambda r: (ed_key(r[0]), r[1])):
    k = (ru, rel)
    if k in seen: continue
    seen.add(k)
    body += f'| {ru}{" (" + en + ")" if en else ""} | {virt} | {sins} | {ed} | {link("Вампиры", rel)} |\n'
write('Вампиры_Пути_и_Дороги.md', 'Вампиры: Пути Просветления и Дороги',
      'Собрано скриптом по заголовкам «Путь / Дорога / Path / Road». Добродетели — первая строка «Добродетели:» в разделе (если есть). Главная версия Путей — `V20_Основные_правила/06`; Дороги — `V20_Dark_Ages/`. Пути магии крови исключены.', body)

# ---------- 4. Оборотни: Дары по уровням
agg = {}
for rel, text in files('Оборотни'):
    ed = meta(text).get('edition', '?')
    def ctx_fn(h, n):
        if n == 2 and not re.match(r'^(Уровень|Ранг)', h): return re.sub(r'\*\*', '', h)
        return None
    for g, lv, ru, en in extract_levels(text, ctx_fn):
        if lv > 6 or not en: continue
        key = (en.lower(), lv)
        e = agg.setdefault(key, {'ru': ru, 'en': en, 'groups': set(), 'src': set()})
        e['groups'].add(g[:60]); e['src'].add(rel.split('/')[0] + '/' + rel.split('/')[-1][:2])
body = ''
for lv in range(1, 7):
    rows = sorted([v for k, v in agg.items() if k[1] == lv], key=lambda v: v['ru'])
    if not rows: continue
    body += f'## Уровень {lv}\n\n| Дар | У кого (раздел файла) | Файлы |\n|---|---|---|\n'
    for v in rows:
        body += f'| {v["ru"]} ({v["en"]}) | {"; ".join(sorted(v["groups"]))} | {", ".join(sorted(v["src"]))} |\n'
    body += '\n'
write('Оборотни_Дары_по_уровням.md', 'Оборотни: Дары по уровням (рангам)',
      'Собрано скриптом из `Оборотни/_справочник/` (разделы «Уровень N» и таблицы с колонкой уровня). «У кого» — заголовок раздела (порода, аугурия, племя, Фера). Дары «как у …» в источниках часто не повторены — смотреть исходный раздел.', body)

# ---------- 5. Маги: Традиции, Конвенции, Ремёсла (таблицы с колонкой «Родовые Сферы»)
rows = []
for rel, text in files('Маги'):
    ed = meta(text).get('edition', '?'); hdr = None; sect = ''
    for raw in text.split('\n'):
        s = raw.strip()
        if s.startswith('#'): sect = s.lstrip('#').strip(); hdr = None; continue
        if not s.startswith('|'): hdr = None; continue
        cells = [c.strip() for c in s.strip('|').split('|')]
        if hdr is None:
            si = [i for i, c in enumerate(cells) if re.match(r'^(Родов|Родствен|Affinity)', c)]
            hdr = si[0] if si else -1
            continue
        if hdr < 0 or set(s) <= set('|-: ') or len(cells) <= hdr: continue
        nm = re.sub(r'\*\*', '', cells[0])
        rows.append((ed, sect[:50], nm, re.sub(r'\*\*', '', cells[hdr]).replace('|', '/'), rel))
body = '| Группа | Раздел | Родовые Сферы | Редакция | Файл |\n|---|---|---|---|---|\n'
for ed, sect, nm, sph, rel in rows:
    body += f'| {nm} | {sect} | {sph} | {ed} | {link("Маги", rel)} |\n'
write('Маги_Традиции_Конвенции_Ремёсла.md', 'Маги: Традиции, Конвенции, Ремёсла и родовые Сферы',
      'Собрано скриптом из таблиц с колонкой «Родовые Сферы» (`Маги/_справочник/`). Справочник магов ещё пополняется — перезапустите скрипт, когда агент закончит.', body)

# ---------- 6. Призраки: Арканои по уровням (раздел «## Арканос (English) — Гильдия», уровни «- **• Название (English)**» или «### Название (English) •••»)
LVL_BULLET = re.compile(r'^[-*]\s+\*\*\s*(•+)\s*(.+?)\*\*')
LVL_HEAD = re.compile(r'^#{3,4}\s+(.+?)\s+(•+)\s*$')
LVL_TAIL = re.compile(r'^[-*]\s+\*\*(.+?)\*\*\s*(•+)')
agg = {}
for rel, text in files('Призраки'):
    arc = None
    for raw in text.split('\n'):
        s = raw.strip()
        if s.startswith('## '):
            h = re.sub(r'\*\*', '', s[3:]).strip()
            arc = h if re.search(r'\([A-Z][^()]*\)', h) else None
            continue
        if not arc: continue
        m = LVL_BULLET.match(s)
        if m: lv, nm = len(m.group(1)), m.group(2)
        else:
            m = LVL_HEAD.match(s) or LVL_TAIL.match(s)
            if not m: continue
            nm, lv = m.group(1), len(m.group(2))
        nm = re.sub(r'\s*\((О|П|О/П)\)\s*\.?$', '', nm.strip(' .'))
        ru, en = split_name(nm)
        if not ru or lv > 10: continue
        a_ru, a_en = split_name(arc.split('—')[0])
        key = ((a_en or a_ru).lower(), lv, (en or ru).lower())
        e = agg.setdefault(key, {'arc': f'{a_ru} ({a_en})' if a_en else a_ru, 'lv': lv, 'ru': ru, 'en': en, 'src': set()})
        e['src'].add(rel.split('/')[0] + '/' + rel.split('/')[-1][:2])
body = ''
for arc in sorted({v['arc'] for v in agg.values()}):
    rows = sorted([v for v in agg.values() if v['arc'] == arc], key=lambda v: (v['lv'], v['ru']))
    body += f'## {arc}\n\n| Ур. | Сила | Файлы |\n|---|---|---|\n'
    for v in rows:
        body += f'| {DOT * v["lv"]} | {v["ru"]}{" (" + v["en"] + ")" if v["en"] else ""} | {", ".join(sorted(v["src"]))} |\n'
    body += '\n'
write('Призраки_Арканои_по_уровням.md', 'Призраки: Арканои по уровням',
      'Собрано скриптом из `Призраки/_справочник/` — Арканои Гильдий, Тёмные Арканои Спектров, Арканои других Тёмных Царств и Восставших. Сила указана один раз на уровень; описание — в файле. Чего нет в таблице — ищите в указателе.', body)
