# Выравнивает термин Banes: «Бан…» -> «Бейн…» (с падежами). Запуск из папки Оборотни: python -I _скрипты/bane_term.py [папки]
import os, re, sys
sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '_справочник'))
RX = re.compile(r'(?<![А-Яа-яЁё])Бан(ы|а|ов|ом|ам|ами|ах|у|е)?(?![А-Яа-яЁё])')
for folder in sys.argv[1:]:
    for d, _, fs in os.walk(os.path.join(ROOT, folder)):
        for f in fs:
            if not f.endswith('.md'): continue
            p = os.path.join(d, f)
            t = open(p, encoding='utf-8').read()
            new, n = RX.subn(lambda m: 'Бейн' + (m.group(1) or ''), t)
            if n:
                open(p, 'w', encoding='utf-8', newline='\n').write(new)
                print(n, os.path.relpath(p, ROOT))
