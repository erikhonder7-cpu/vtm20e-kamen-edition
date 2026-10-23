import os, sys, zipfile
sys.stdout.reconfigure(encoding='utf-8')
root = r'D:\Загрузки\Новая папка\Мир Тьмы'
out = r'D:\Загрузки\Новая папка\Мир_Тьмы_справочник_для_Камня.zip'
if os.path.exists(out):
    print('УЖЕ ЕСТЬ', out); sys.exit(1)
LINES = ['Вампиры', 'Оборотни', 'Маги', 'Призраки', 'Подменыши']
top_files = ['CLAUDE.md', 'Пробелы_и_противоречия.md', 'Чек-лист_20th_Anniversary_не_вампиры.md', '_ПЕРЕДАЧА_для_ИИ.md']
top_dirs = ['Сводки', '_скрипты']
items = []
for f in top_files:
    p = os.path.join(root, f)
    if os.path.isfile(p): items.append(p)
for d in top_dirs + [os.path.join(L, s) for L in LINES for s in ('_справочник', '_скрипты', '_текст')]:
    base = os.path.join(root, d)
    for dp, _, fs in os.walk(base):
        if '__pycache__' in dp: continue
        for f in fs:
            items.append(os.path.join(dp, f))
size = 0
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for p in sorted(items):
        arc = os.path.join('Мир Тьмы', os.path.relpath(p, root)).replace('\\', '/')
        z.write(p, arc); size += os.path.getsize(p)
print('файлов', len(items), 'исходно МБ', round(size / 1e6, 1), 'архив МБ', round(os.path.getsize(out) / 1e6, 1))
with zipfile.ZipFile(out) as z:
    bad = z.testzip()
    names = z.namelist()
print('проверка', 'OK' if bad is None else bad)
from collections import Counter
print(Counter(n.split('/')[1] for n in names))
