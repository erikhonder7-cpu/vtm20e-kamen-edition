# Алфавитный указатель по справочнику: _справочник/Указатель.md
# Запуск из папки Подменыши: python -I _скрипты/index.py
import os, re, sys
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '_справочник')
ROOT = os.path.normpath(ROOT)
OUT = os.path.join(ROOT, 'Указатель.md')

# Заголовки-рубрики, а не названия
STOP = re.compile(r'^(справка|не вошло|общие|общее|старшие силы|силы старейшин|система|пример|примечани|источник|'
                  r'комбинированн|достоинства|недостатки|ритуалы|обряды|пути |пути$|дороги|таблиц|правила|'
                  r'уровни|ступени|прочие|прочее|содержание|обзор|итог|варианты|дисциплины|факты биографии|'
                  r'новые|новый фон|особые|механика|кратко|отличия|цены|шаг \d|глава|приложение|'
                  r'упоминаемые|разновидности|линии крови|кланы|архетипы|способности|титулы|снаряжение|'
                  r'оружие|доспехи|последствия|грехи|моменты|аура|добродетели|воля|запас|уровни здоровья|заметка|звания|'
                  r'достоинство и недостаток|уникальная сила|высшие силы|высшие уровни|сюжет|сценари)', re.I)

def clean(s):
    s = re.sub(r'\*\*|__|`', '', s)
    s = re.sub(r'^[\s•●○◦·\-–—]*', '', s)
    s = re.sub(r'^(\d+[a-zа-я]?[\.\)]\s+)', '', s)          # "1. "
    s = re.sub(r'^(ур(овень|\.)?\s*\d+[:.]?\s*)', '', s, flags=re.I)
    s = re.sub(r'^[•●]*\d*\s+', '', s)                       # "•6 "
    s = re.sub(r'^[\s•●]*\(\d+\)\s*', '', s)                 # "••••• • (6) "
    s = s.strip(' :.;—–-')
    return s

def split_note(s):
    # "Абомбве (Abombwe) — Бонсам" -> ("Абомбве (Abombwe)", "Бонсам")
    m = re.match(r'^(.*?)\s+[—–]\s+(.*)$', s)
    if m and len(m.group(1)) >= 3:
        return m.group(1).strip(), m.group(2).strip()
    return s, ''

def good(name):
    if len(name) < 3 or len(name) > 90:
        return False
    if not re.match(r'[A-Za-zА-Яа-яЁё«"]', name):
        return False
    if STOP.match(name):
        return False
    return True

NAME_COLS = {'название': None, 'сила': 'сила', 'ритуал': 'ритуал', 'титул': 'титул',
             'обряд': 'обряд', 'достоинство': 'достоинство', 'недостаток': 'недостаток', 'черта': None}

def table_kind(cols):
    low = [c.strip().lower() for c in cols]
    for i, c in enumerate(low):
        if c in NAME_COLS:
            kind = NAME_COLS[c]
            if kind is None:
                kind = 'достоинство/недостаток' if 'цена' in low else 'черта'
            return i, kind
    return None, None

entries = defaultdict(lambda: {'kinds': set(), 'notes': set(), 'refs': []})

def add(name, kind, rel, book):
    name = clean(name)
    name, note = split_note(name)
    if not good(name):
        return
    key = re.sub(r'\s*\(.*?\)\s*', ' ', name).strip().lower().replace('ё', 'е')
    e = entries[key]
    e.setdefault('name', name)
    if '(' in name and '(' not in e['name']:
        e['name'] = name
    e['kinds'].add(kind)
    if note and len(note) < 40:
        e['notes'].add(note)
    if (rel, book) not in e['refs']:
        e['refs'].append((rel, book))

files = []
for d, _, fs in os.walk(ROOT):
    for f in fs:
        if f.endswith('.md') and f not in ('README.md', 'Указатель.md', 'Указатель_компактный.md', 'AGENTS.md', '_прогресс.md', '_термины_рабочие.md'):
            files.append(os.path.join(d, f))
files.sort()

for path in files:
    rel = os.path.relpath(path, ROOT).replace('\\', '/')
    book = rel.split('/')[0] if '/' in rel else os.path.splitext(rel)[0]
    with open(path, encoding='utf-8') as fh:
        lines = fh.read().split('\n')
    tkind = None
    tcol = None
    for i, ln in enumerate(lines):
        if ln.startswith('|'):
            cells = ln.strip().strip('|').split('|')
            nxt = lines[i + 1] if i + 1 < len(lines) else ''
            if re.match(r'^\|[\s:|-]+\|?\s*$', nxt):      # строка заголовка таблицы
                tcol, tkind = table_kind(cells)
                continue
            if re.match(r'^\|[\s:|-]+\|?\s*$', ln):
                continue
            if tkind and tcol is not None and tcol < len(cells):
                add(cells[tcol], tkind, rel, book)
            continue
        tkind = tcol = None
        m = re.match(r'^(#{2,4})\s+(.*)$', ln)
        if m:
            h = m.group(2)
            kind = 'сила' if re.match(r'^[•●]', h) or re.search(r'\(\w+ \d+\)', h) else 'раздел'
            add(h, kind, rel, book)
            continue
        m = re.match(r'^\s*[-*]\s+\*\*(.+?)\*\*', ln)
        if m:
            t = m.group(1)
            if re.match(r'^[•●]', t):
                add(t, 'сила', rel, book)
            elif re.search(r'\([A-Z][A-Za-z’\'\- ]{2,}\)', t):
                add(t, 'пункт', rel, book)

def sort_key(k):
    n = entries[k]['name'].lower().replace('ё', 'е')
    n = re.sub(r'^[«"(]+', '', n)
    return n

keys = sorted(entries, key=sort_key)
groups = defaultdict(list)
for k in keys:
    first = sort_key(k)[:1].upper()
    if re.match(r'[A-Z]', first):
        first = 'A–Z'
    groups[first].append(k)

order = [g for g in groups if g != 'A–Z'] + (['A–Z'] if 'A–Z' in groups else [])
out = []
out.append('# Указатель справочника')
out.append('')
out.append(f'Собран автоматически скриптом `_скрипты/index.py` из {len(files)} файлов; записей: {len(keys)}. '
           'Одинаковые названия из разных книг сведены в одну строку. Пересобрать: из папки Подменыши `python -I _скрипты/index.py`.')
out.append('')
out.append('Пометки: **с** — сила/уровень Арканоса или Искусства, **р** — ритуал/обряд, **д** — достоинство или недостаток, '
           '**т** — титул, **ч** — черта; без пометки — раздел файла.')
out.append('')
out.append(' · '.join(f'[{g}](#{g.lower()})' for g in order) + ' · [English → русский](#english--русский)')
out.append('')
TAG = {'сила': 'с', 'ритуал': 'р', 'обряд': 'р', 'достоинство/недостаток': 'д', 'достоинство': 'д',
       'недостаток': 'д', 'титул': 'т', 'черта': 'ч'}
for g in order:
    out.append(f'## {g}')
    out.append('')
    for k in groups[g]:
        e = entries[k]
        tags = sorted({TAG[x] for x in e['kinds'] if x in TAG})
        tag = f" *{','.join(tags)}*" if tags else ''
        note = f" — {'; '.join(sorted(e['notes']))}" if e['notes'] else ''
        refs = ', '.join(f'[{r[:-3]}](<{r}>)' for r, b in e['refs'][:8])
        more = f' и ещё {len(e["refs"]) - 8}' if len(e['refs']) > 8 else ''
        out.append(f"- **{e['name']}**{tag}{note} · {refs}{more}")
    out.append('')

# Английские названия -> все русские варианты
eng = defaultdict(set)
for k in keys:
    nm = entries[k]['name']
    for m in re.finditer(r'\(([A-Z][^()]*?)\)', nm):
        en = m.group(1).strip()
        if re.search(r'[А-Яа-яЁё]', en) or len(en) < 3:
            continue
        ru = re.sub(r'\s*\(.*?\)', '', nm).strip()
        if ru:
            eng[en].add(ru)
out.append('## English → русский')
out.append('')
out.append('Английские названия из справочника и все русские варианты, под которыми они записаны.')
out.append('')
for en in sorted(eng, key=str.lower):
    out.append(f"- **{en}** → {'; '.join(sorted(eng[en]))}")
out.append('')

with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
    fh.write('\n'.join(out))
# Компактный указатель для нейросетей: файлы под номерами, по строке на запись, без разметки
OUT2 = os.path.join(ROOT, 'Указатель_компактный.md')
code = {}
for p in files:
    code[os.path.relpath(p, ROOT).replace('\\', '/')] = str(len(code) + 1)
c = []
c.append('# Компактный указатель (для ИИ)')
c.append('')
c.append(f'Та же база, что в `Указатель.md` ({len(keys)} записей), сжатая, чтобы держать в контексте как карту. '
         'Формат строки: `название (English) пометка номера_файлов`. Номера файлов расшифрованы ниже. '
         'Пометки: с — сила, р — ритуал/обряд, д — достоинство/недостаток, т — титул, ч — черта; без пометки — раздел файла. '
         'Собирается тем же `_скрипты/index.py`.')
c.append('')
c.append('## Файлы')
for r, n in code.items():
    c.append(f'{n} {r[:-3]}')
c.append('')
c.append('## Записи')
for k in keys:
    e = entries[k]
    tags = ''.join(sorted({TAG[x] for x in e['kinds'] if x in TAG}))
    nums = ','.join(code[r] for r, b in e['refs'] if r in code)
    c.append(f"{e['name']}{' ' + tags if tags else ''} {nums}")
c.append('')
c.append('## Английский → несколько русских вариантов')
for en in sorted(eng, key=str.lower):
    if len(eng[en]) > 1:
        c.append(f"{en}: {'; '.join(sorted(eng[en]))}")
c.append('')
with open(OUT2, 'w', encoding='utf-8', newline='\n') as fh:
    fh.write('\n'.join(c))

print(f'files={len(files)} entries={len(keys)} -> {OUT}')
