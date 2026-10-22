# tools/import_assets.py
# Переносит в систему ассеты из папки «Метки для карты» (D:\ДНД.ВПИ.НРИ\Вампиры\Метки для карты):
#   assets/clans/<ключ клана>.<ext>      — гербы кланов (силуэты; для отсутствующих — «кружочки»)
#   assets/sects/<ключ>.<ext>             — секты и силы (Камарилья, Шабаш, Анархи, Инквизиция, роялисты…)
#   assets/disciplines/<ключ>.<ext>       — знаки Дисциплин
#   assets/markers/<ключ>.png + index.json — круглые метки для карты и нексуса (места, фракции Революции)
#
# Запуск из корня системы:  python -I tools/import_assets.py [папка-источник]

import json, os, shutil, sys

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else r"D:\ДНД.ВПИ.НРИ\Вампиры\Метки для карты"
A = os.path.join(ROOT, "assets")

CLANS = {  # ключ → файл (корень папки или «Кружочки»)
    "brujah": "Бруха.png", "ventrue": "Вентру.png", "gangrel": "Гангрелы.png", "lasombra": "Ласомбра.png",
    "malkavian": "Малкавиане.png", "nosferatu": "Носферату.png", "toreador": "Тореадоры.png", "tremere": "Тремеры.png",
    "tzimisce": "Цимисхи.png", "kappadokiytsy": "Каппадокийцы.png", "baali": "Баали.png", "caitiff": "Каитиффы.webp",
    "assamite": "Кружочки/Ассамиты.png", "setite": "Кружочки/Сетиты.png", "ravnos": "Кружочки/Равносы.png",
    "istinnyeBruha": "Кружочки/Старые Брухи.png", "brujahDarkAges": "Бруха Темные века.png",
}
SECTS = {
    "camarilla": "Камарилья.png", "camarillaBlack": "Камарилья Черный.png", "sabbat": "Шабаш.png",
    "sabbatBlack": "Шабаш Черный.png", "anarchs": "Анархи.png", "inquisition": "Инквизиция.png",
    "shadowInquisition": "Теневая Инквизиция.png", "cainiteHeresy": "Каинитская Ересь.png",
    "royalists": "Роялисты.png", "royalPower": "Королевская власть.png", "police": "Полиция.png", "mafia": "Мафия.jpg",
    "ashirra": "Аширра.png", "brokenAnkh": "Сломаный анкх.png", "gesheri": "Гешеры.png",
}
DISCIPLINES = {
    "animalism": "Animalism.webp", "celerity": "Celerity.webp", "chimerstry": "Chimerstry.webp", "daimoinon": "Daimoinon.webp",
    "dementation": "Dementation.webp", "dominate": "Dominate.webp", "flight": "Flight.webp", "fortitude": "Fortitude.webp",
    "auspex": "LogoAuspex.webp", "melpominee": "Melpominee.webp", "mytherceria": "Mytherceria.webp", "necromancy": "Necromancy.webp",
    "obeah": "Obeah.webp", "obfuscate": "Obfuscate.webp", "obtenebration": "Obtenebration.webp", "potence": "Potence.webp",
    "presence": "Presence.webp", "protean": "Protean.webp", "quietus": "Quietus.webp", "sanguinus": "Sanguinus.webp",
    "serpentis": "Serpentis.webp", "temporis": "Temporis.webp", "thanatosis": "Thanatosis.webp", "thaumaturgy": "Thaumaturgy.png",
    "vicissitude": "Vicissitude.webp",
}
# Метки: «Кружочки», «Влияние» и значки карты из корня
MARKER_EXTRA = {"Подъем.png": "Подъём", "Спуск.png": "Спуск", "Нейтральное место.png": "Нейтральное место", "Что-то.png": "Что-то"}

TR = {"а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"e","ж":"zh","з":"z","и":"i","й":"y","к":"k","л":"l","м":"m",
      "н":"n","о":"o","п":"p","р":"r","с":"s","т":"t","у":"u","ф":"f","х":"h","ц":"ts","ч":"ch","ш":"sh","щ":"sch",
      "ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya"}
def slug(s):
    out = "".join(TR.get(c, c) if c.isalpha() or c.isdigit() else "-" for c in s.lower())
    while "--" in out: out = out.replace("--", "-")
    return out.strip("-")

def copy(src_rel, dst_dir, key):
    src = os.path.join(SRC, src_rel)
    if not os.path.exists(src):
        print("нет файла:", src_rel); return None
    ext = os.path.splitext(src)[1].lower()
    os.makedirs(dst_dir, exist_ok=True)
    dst = os.path.join(dst_dir, key + ext)
    shutil.copyfile(src, dst)
    return os.path.relpath(dst, ROOT).replace("\\", "/")

# Дописываем в существующий индекс: там же лежат знаки с вики (tools/import_wiki.py)
idx_path = os.path.join(ROOT, "data", "assets.json")
index = json.load(open(idx_path, encoding="utf-8")) if os.path.exists(idx_path) else {}
for g in ("clans", "sects", "disciplines"): index.setdefault(g, {})
index["markers"] = []
for k, f in CLANS.items():
    p = copy(f, os.path.join(A, "clans"), k)
    if p: index["clans"][k] = p
for k, f in SECTS.items():
    p = copy(f, os.path.join(A, "sects"), k)
    if p: index["sects"][k] = p
for k, f in DISCIPLINES.items():
    p = copy(os.path.join("Дисциплины", f), os.path.join(A, "disciplines"), k)
    if p: index["disciplines"][k] = p
for folder, group in (("Кружочки", "places"), ("Влияние", "influence")):
    d = os.path.join(SRC, folder)
    for f in sorted(os.listdir(d)):
        name = os.path.splitext(f)[0]
        p = copy(os.path.join(folder, f), os.path.join(A, "markers"), slug(name))
        if p: index["markers"].append({"key": slug(name), "name": name, "group": group, "src": p})
for f, name in MARKER_EXTRA.items():
    p = copy(f, os.path.join(A, "markers"), slug(name))
    if p: index["markers"].append({"key": slug(name), "name": name, "group": "map", "src": p})

with open(idx_path, "w", encoding="utf-8", newline="\n") as fh:
    json.dump(index, fh, ensure_ascii=False, indent=1)
print({k: len(v) for k, v in index.items()})
