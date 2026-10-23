import os, sys, zipfile

root = sys.argv[1]          # папка «Мир Тьмы»
out = sys.argv[2]
items = ['CLAUDE.md', 'Пробелы_и_противоречия.md', 'Сводки', '_скрипты']
for line in ('Вампиры', 'Оборотни', 'Маги', 'Призраки', 'Подменыши'):
    items += [os.path.join(line, '_справочник'), os.path.join(line, '_скрипты')]

n = 0
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for it in items:
        p = os.path.join(root, it)
        files = [p] if os.path.isfile(p) else [
            os.path.join(d, f) for d, _, fs in os.walk(p) for f in fs]
        for f in sorted(files):
            if '__pycache__' in f:
                continue
            arc = os.path.join('Мир Тьмы', os.path.relpath(f, root)).replace('\\', '/')
            z.write(f, arc)
            n += 1
print('файлов', n, 'размер', os.path.getsize(out) // 1024, 'КБ')
