# Архив всех PDF книг Мира Тьмы (без _дубликаты) -> D:\Загрузки\Новая папка\Мир_Тьмы_книги_PDF.zip
# Запуск из папки «Мир Тьмы»: python -I _скрипты/make_zip_pdf.py   (старый архив сначала удалить)
import os, sys, zipfile
sys.stdout.reconfigure(encoding='utf-8')
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(os.path.dirname(root), 'Мир_Тьмы_книги_PDF.zip')
if os.path.exists(out):
    print('УЖЕ ЕСТЬ', out); sys.exit(1)
items = []
for dp, dirs, fs in os.walk(root):
    rel = os.path.relpath(dp, root)
    if rel.split(os.sep)[0] == '_дубликаты':
        continue
    for f in fs:
        if f.lower().endswith('.pdf'):
            items.append(os.path.join(dp, f))
size = 0
with zipfile.ZipFile(out, 'w', zipfile.ZIP_STORED, allowZip64=True) as z:
    for p in sorted(items):
        z.write(p, os.path.join('Мир Тьмы', os.path.relpath(p, root)).replace('\\', '/'))
        size += os.path.getsize(p)
with zipfile.ZipFile(out) as z:
    names = z.namelist()
    ok = len(names) == len(items) and all(i.file_size == os.path.getsize(p) for i, p in zip(sorted(z.infolist(), key=lambda x: x.filename), sorted(items, key=lambda p: os.path.join('Мир Тьмы', os.path.relpath(p, root)).replace('\\', '/'))))
print('PDF', len(items), 'исходно ГБ', round(size / 1e9, 2), 'архив ГБ', round(os.path.getsize(out) / 1e9, 2), 'проверка', 'OK' if ok else 'РАСХОЖДЕНИЕ')
