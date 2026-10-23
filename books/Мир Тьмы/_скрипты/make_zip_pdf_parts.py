# Все PDF книг Мира Тьмы (без _дубликаты) частями по ≤ 480 МиБ (лимит пересылки 500 МиБ)
# -> D:\Загрузки\Новая папка\Мир_Тьмы_книги_PDF_части\NN_<линейки>.zip
# Запуск из папки «Мир Тьмы»: python -I _скрипты/make_zip_pdf_parts.py   (папку с частями сначала удалить)
import os, sys, zipfile
sys.stdout.reconfigure(encoding='utf-8')
LIMIT = 480 * 2**20
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out_dir = os.path.join(os.path.dirname(root), 'Мир_Тьмы_книги_PDF_части')
if os.path.exists(out_dir):
    print('УЖЕ ЕСТЬ', out_dir); sys.exit(1)
os.makedirs(out_dir)
items = []
for dp, _, fs in os.walk(root):
    rel = os.path.relpath(dp, root)
    if rel.split(os.sep)[0] == '_дубликаты':
        continue
    for f in fs:
        if f.lower().endswith('.pdf'):
            p = os.path.join(dp, f)
            items.append((os.path.join('Мир Тьмы', os.path.relpath(p, root)).replace('\\', '/'), p))
items.sort()
parts, cur, size = [], [], 0
for arc, p in items:
    s = os.path.getsize(p)
    if cur and size + s > LIMIT:
        parts.append(cur); cur, size = [], 0
    cur.append((arc, p)); size += s
if cur: parts.append(cur)
total = 0
for n, part in enumerate(parts, 1):
    lines = []
    for arc, _ in part:
        L = arc.split('/')[1]
        if L not in lines: lines.append(L)
    out = os.path.join(out_dir, f'{n:02d}_' + '_'.join(lines) + '.zip')
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_STORED, allowZip64=True) as z:
        for arc, p in part:
            z.write(p, arc)
    with zipfile.ZipFile(out) as z:
        bad = z.testzip()
    total += len(part)
    print(os.path.basename(out), len(part), 'PDF', round(os.path.getsize(out) / 2**20), 'МиБ', 'CRC OK' if bad is None else 'ОШИБКА ' + bad)
print('всего PDF', total, 'из', len(items), 'частей', len(parts))
