# Пробелы и противоречия по трём справочникам -> Мир Тьмы/Пробелы_и_противоречия.md
# Запуск из папки «Мир Тьмы»:  python -I _скрипты/probely.py
import os, re, sys
sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LINES = ['Вампиры', 'Оборотни', 'Маги', 'Призраки', 'Подменыши']
GAP = re.compile(r'повреждено|без описания|приблизительн|обрезан|неразборчив|перемешан|смещён|не сохранил|\?\s*\)|\(\s*\?|\S\s\?(?=[\s,.;|]|$)')
SKIP = ('Указатель', 'README', 'AGENTS', 'Глоссарий', '_прогресс')

def edition(path):
    try:
        t = open(path, encoding='utf-8').read(600)
    except OSError:
        return '?'
    m = re.search(r'^edition:\s*"?([^"\n]+)', t, re.M)
    return m.group(1).strip() if m else '?'

out = ['# Пробелы и противоречия справочника', '',
       'Собрано скриптом `_скрипты/probely.py`. Перезапускать после правок справочника.', '',
       '- **Пробелы** — строки с пометками «повреждено», «без описания» и знаком `?` (значение предположительное). Перед встраиванием в систему такие числа сверить с исходником `<линейка>/_текст/`.',
       '- **Противоречия** — записи, которые есть и в книгах 20-летия, и в старых редакциях (или в Тёмных веках). Различия в числах здесь не расписаны: открыть оба файла и взять версию V20 (см. `CLAUDE.md`, «Приоритет»).', '']

# ---------- Пробелы
out += ['## 1. Пробелы', '']
total = 0
for L in LINES:
    base = os.path.join(ROOT, L, '_справочник')
    rows = []
    for d, _, fs in os.walk(base):
        for f in sorted(fs):
            if not f.endswith('.md') or f.startswith(SKIP): continue
            p = os.path.join(d, f); rel = os.path.relpath(p, base).replace('\\', '/')
            in_yaml = False
            for n, line in enumerate(open(p, encoding='utf-8'), 1):
                if n == 1 and line.startswith('---'): in_yaml = True; continue
                if in_yaml:
                    if line.startswith('---'): in_yaml = False
                    continue
                if GAP.search(line):
                    s = re.sub(r'\s+', ' ', line.strip()).replace('|', '/')
                    i = GAP.search(s).start()
                    frag = s[max(0, i - 90): i + 60]
                    rows.append(f'| `{rel[:-3]}` | {n} | {frag} |')
    total += len(rows)
    out += [f'### {L} ({len(rows)})', '', '| Файл | Строка | Фрагмент |', '|---|---|---|'] + rows + ['']

# ---------- Противоречия (по компактному указателю вампиров)
out += ['## 2. Одна запись в V20 и в старых редакциях (вампиры)', '']
base = os.path.join(ROOT, 'Вампиры', '_справочник')
txt = open(os.path.join(base, 'Указатель_компактный.md'), encoding='utf-8').read()
fsec = txt.split('## Файлы', 1)[1].split('## Записи', 1)[0]
esec = txt.split('## Записи', 1)[1].split('\n## ', 1)[0]
num = {}
for line in fsec.strip().split('\n'):
    m = re.match(r'^(\d+)\s+(.+)$', line.strip())
    if m:
        rel = m.group(2).strip()
        num[int(m.group(1))] = (rel, edition(os.path.join(base, rel + '.md')))
NEW = {'V20'}; DA = {'V20 Dark Ages'}
pairs = []
for line in esec.strip().split('\n'):
    m = re.match(r'^(.*?)\s+([\d,]+)$', line.strip())
    if not m: continue
    ids = [int(x) for x in m.group(2).split(',') if x]
    eds = {num[i][1] for i in ids if i in num}
    if eds & NEW and (eds - NEW - DA - {'V5', '?', 'fan', 'nWoD'}):
        name = m.group(1)
        if not re.search(r'\([^)]*[A-Za-z]', name): continue  # без английского ключа — часто разделы, а не силы
        v20 = [num[i][0] for i in ids if i in num and num[i][1] in NEW]
        old = [f'{num[i][0]} ({num[i][1]})' for i in ids if i in num and num[i][1] not in NEW | DA]
        pairs.append(f'| {name} | {"; ".join("`"+x+"`" for x in v20)} | {"; ".join("`"+x.split(" (")[0]+"` ("+x.split(" (")[1] for x in old)} |')
out += [f'Найдено записей: {len(pairs)}.', '', '| Запись | V20 | Старые редакции |', '|---|---|---|'] + pairs + ['']
out += ['## 3. Оборотни и маги', '',
        'Справочник оборотней — только W20, сравнивать с другими редакциями нечего. У магов, кроме M20, будет Викторианская эпоха (M20 Victorian Age) — дополнение той же системы; когда агент её разберёт, перезапустите скрипт. Перекрёстные вопросы между линейками (Делириум, Становление мага, противомагия против Дисциплин) — в `CLAUDE.md`, «Памятка 2».', '']
open(os.path.join(ROOT, 'Пробелы_и_противоречия.md'), 'w', encoding='utf-8', newline='\n').write('\n'.join(out))
print('пробелов', total, 'пар', len(pairs))
