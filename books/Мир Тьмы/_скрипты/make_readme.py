import os, re, sys
# usage: make_readme.py <справочник> <out README> <header-file> <order "Папка=Заголовок раздела|...">
root, out, header_file, order = sys.argv[1:5]
sections = [x.split('=', 1) for x in order.split('|')]
lines = open(header_file, encoding='utf-8').read().rstrip('\n').split('\n')
lines += ['', '## Готово', '']
for folder, title in sections:
    d = os.path.join(root, folder)
    if not os.path.isdir(d):
        continue
    lines += [f'### {title} — `{folder}/`', '| Файл | Содержание |', '|---|---|']
    for f in sorted(os.listdir(d)):
        if not f.endswith('.md'):
            continue
        t = open(os.path.join(d, f), encoding='utf-8').read()
        t = re.sub(r'\A---\n.*?\n---\n+', '', t, flags=re.S)
        m = re.search(r'^# (.+)$', t, re.M)
        head = m.group(1) if m else ''
        head = re.split(r'\s+[—–]\s+(?=[^—–]*$)', head)[0].strip()   # убрать « — Книга» в конце
        lines.append(f'| `{f[:-3]}` | {head} |')
    lines.append('')
lines += ['## Указатель',
          '- `Указатель_компактный.md` — карта для ИИ: файлы под номерами, по строке на запись.',
          '- `Указатель.md` — полный алфавитный указатель со ссылками; в конце — «English → русский».',
          '- Пересобрать оба и YAML-шапки: из папки линейки `python -I _скрипты/meta.py`, затем `python -I _скрипты/index.py`.', '']
open(out, 'w', encoding='utf-8', newline='\n').write('\n'.join(lines))
print('ok', out)
