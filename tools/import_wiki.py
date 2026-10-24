# tools/import_wiki.py
# Докачивает с wod.fandom.com/ru только те знаки, которых нет в «Метках для карты»
# (линии крови, антитрибу, Таль'Махе'Ра, редкие Дисциплины), кладёт их в assets/
# и дописывает в data/assets.json. Страницы вики закрыты Cloudflare, поэтому — через api.php.
# Гербы линий крови, которых нет на русской вики, — с английской White Wolf Wiki (WANT_EN).
# CDN Fandom без заголовка Referer отвечает 403.
#
# Запуск из корня системы:  python -I tools/import_wiki.py [--offline]
#   --offline — не качать, только пересобрать обёртки и assets.json из уже лежащих файлов.

import base64, json, os, sys, urllib.parse, urllib.request

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = "https://wod.fandom.com/ru/api.php"
UA = {"User-Agent": "Mozilla/5.0 (vtm20e-kamen-edition asset fetch)"}

WANT = {  # ключ в системе → файл на вики
    "clans/giovanni": "Giovanni.png", "clans/salyubri": "Salubri.png", "clans/salyubriAntitribu": "SalubriAntitribu.png",
    "clans/docheriKakofonii": "DaughtersofCacophony.png", "clans/anda": "LogoBloodlineAndaDA.png",
    "clans/liannan": "LogoBloodlineLhiannanV20DA.png", "clans/krovnyeBratya": "LogoBloodlineBloodBrothers.png",
    "clans/predvestnikiCherepov": "HarbingersOfSkulls.png", "clans/staryyKlanTsimishov": "OldClanTzimisce.png",
    "clans/detiOsirisa": "ChildrenofOsiris.png", "clans/pandery": "Panders.png",
    "clans/bruhaAntitribu": "BrujahAntitribu.png", "clans/ventruAntitribu": "VentrueAntitribu.png",
    "clans/malkavianeAntitribu": "MalkavianAntitribu.png", "clans/nosferatuAntitribu": "NosferatuAntitribu.png",
    "clans/lasombraAntitribu": "LasombraAntitribu.png", "clans/tremerAntitribu": "TremereAntitribu.png",
    "clans/toreadorAntitribu": "ToreadorAntitribu.png", "clans/ravnosAntitribu": "RavnosAntitribu.png",
    "clans/gangrelAntitribu": "LogoBloodlineGangrelAntitribu.png",
    "sects/talMaheRa": "LogoSectTalMaheRa.png",
    "disciplines/valeren": "Valeren.png", "disciplines/visceratika": "Visceratika.png", "disciplines/spiritus": "Spiritus.png",
}
API_EN = "https://whitewolf.fandom.com/api.php"
WANT_EN = {  # чёрный знак на прозрачном, местами с белыми деталями
    "clans/gorguli": "LogoBloodlineGargoyles.png", "clans/samedi": "LogoBloodlineSamedi.png", "clans/kiasidy": "LogoBloodlineKiasyd.png",
    "clans/lamii": "LogoBloodlineLamia.png", "clans/nagaradzha": "LogoBloodlineNagaraja.png", "clans/noyady": "LogoBloodlineNoiad.png",
    "clans/telyaveli": "LogoBloodlineTelyavs.png", "clans/tlatsik": "LogoVariantTlacique.png", "clans/zmeiSveta": "LogoBloodlineSerpentsoftheLight.png",
    "clans/voinySeta": "SymbolVariantSetiteWarriors.png", "clans/kolduny": "SymbolVariantTzimisceKoldun.png",
    "clans/assamityAntitribu": "LogoBloodlineAssamiteAntitribu.png", "clans/viziriAssamitov": "LogoBloodlineAssamiteVizier.png",
    "clans/charodeiAssamitov": "LogoBloodlineAssamiteSorcerer.png", "clans/malkavianeDominatory": "LogoVariantDominateMalkavians.png",
    "clans/uDzao": "LogoBloodlineWuZaoScholar.png",
}
# Чёрный знак на белом: маске нужна прозрачность, поэтому оборачиваем в SVG,
# где фильтр переводит «темноту» в альфу (белое становится дырой).
INVERT = {"clans/gangrelAntitribu"}
# Чёрный знак на прозрачном с белыми деталями: альфа = исходная альфа − яркость,
# так белые детали остаются просветами, а прозрачный фон — прозрачным.
INK = set(WANT_EN)

INVERT_SVG = """<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {w} {h}">
<filter id="ink" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -0.333 -0.333 -0.333 0 1"/></filter>
<image width="{w}" height="{h}" filter="url(#ink)" xlink:href="data:{mime};base64,{b64}"/>
</svg>
"""
INK_SVG = INVERT_SVG.replace("-0.333 -0.333 -0.333 0 1", "-0.333 -0.333 -0.333 1 0")

def sniff(path):
    """Формат и размер по сигнатуре: вики отдаёт WebP даже по ссылке на .png."""
    with open(path, "rb") as fh:
        h = fh.read(32)
    if h[:8] == b"\x89PNG\r\n\x1a\n":
        return "png", int.from_bytes(h[16:20], "big"), int.from_bytes(h[20:24], "big")
    if h[:4] == b"RIFF" and h[8:12] == b"WEBP":
        kind = h[12:16]
        if kind == b"VP8X":
            return "webp", 1 + int.from_bytes(h[24:27], "little"), 1 + int.from_bytes(h[27:30], "little")
        if kind == b"VP8L":
            b = int.from_bytes(h[21:25], "little")
            return "webp", (b & 0x3FFF) + 1, ((b >> 14) & 0x3FFF) + 1
        if kind == b"VP8 ":
            return "webp", int.from_bytes(h[26:28], "little") & 0x3FFF, int.from_bytes(h[28:30], "little") & 0x3FFF
    raise ValueError(f"неизвестный формат: {path}")

def stored(key):
    """Уже лежащий файл знака (любое из расширений)."""
    for ext in ("png", "webp"):
        p = os.path.join(ROOT, "assets", f"{key}.{ext}")
        if os.path.exists(p): return p
    return None

def download(api, want, referer):
    headers = {**UA, "Referer": referer}
    titles = "|".join("File:" + f for f in want.values())
    url = api + "?" + urllib.parse.urlencode({"action": "query", "titles": titles, "prop": "imageinfo", "iiprop": "url", "format": "json"})
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
        pages = json.loads(r.read().decode("utf-8"))["query"]["pages"]
    info = {p["title"].split(":", 1)[1].replace(" ", "_"): p["imageinfo"][0] for p in pages.values() if "imageinfo" in p}
    for key, f in want.items():
        ii = info.get(f)
        if not ii: print("нет на вики:", f); continue
        tmp = os.path.join(ROOT, "assets", key + ".download")
        os.makedirs(os.path.dirname(tmp), exist_ok=True)
        with urllib.request.urlopen(urllib.request.Request(ii["url"], headers=headers), timeout=60) as r, open(tmp, "wb") as fh:
            fh.write(r.read())
        for old in filter(None, [stored(key)]): os.remove(old)
        os.replace(tmp, os.path.join(ROOT, "assets", f"{key}.{sniff(tmp)[0]}"))
        print("ok", key)

if "--offline" not in sys.argv:
    download(API, WANT, "https://wod.fandom.com/ru/")
    download(API_EN, WANT_EN, "https://whitewolf.fandom.com/")

idx_path = os.path.join(ROOT, "data", "assets.json")
index = json.load(open(idx_path, encoding="utf-8"))
for key in [*WANT, *WANT_EN]:
    group, name = key.split("/")
    src = stored(key)
    if not src: continue
    fmt, w, h = sniff(src)
    if not src.endswith("." + fmt):  # расширение по содержимому
        fixed = os.path.join(ROOT, "assets", f"{key}.{fmt}")
        os.replace(src, fixed); src = fixed
    rel = f"assets/{key}.{fmt}"
    if key in INVERT or key in INK:
        b64 = base64.b64encode(open(src, "rb").read()).decode("ascii")
        with open(os.path.join(ROOT, "assets", key + ".svg"), "w", encoding="utf-8", newline="\n") as fh:
            fh.write((INK_SVG if key in INK else INVERT_SVG).format(w=w, h=h, b64=b64, mime=f"image/{fmt}"))
        rel = f"assets/{key}.svg"
    index.setdefault(group, {})[name] = rel
with open(idx_path, "w", encoding="utf-8", newline="\n") as fh:
    json.dump(index, fh, ensure_ascii=False, indent=1)
print({k: len(v) for k, v in index.items()})
