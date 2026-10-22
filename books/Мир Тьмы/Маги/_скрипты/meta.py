# Проставляет YAML-шапку (метаданные) в начало каждого .md справочника. Повторный запуск заменяет шапку.
# Запуск из папки Маги: python -I _скрипты/meta.py
import os, re, sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '_справочник'))

# edition: M20 | M20 Victorian Age | Revised | 2nd Edition | fan
# compat_m20: native — правила M20 как есть; minor — старая редакция, числа сверять; none — другая система
# source: official_en | official_ru | fan_translation_ru | machine_translation_ru | ocr_en | summary_ru | compiled
# reliability: high | medium | low  (насколько точны числа механики)
def m20(book, reliability='high', edition='M20'):
    return dict(book=book, edition=edition, compat_m20='native', source='official_en', reliability=reliability)

VA = 'M20 Victorian Age'
FOLDERS = {
    'M20_Основная':               m20('Mage: The Ascension 20th Anniversary Edition'),
    'M20_Book_of_Secrets':        m20('M20 Book of Secrets'),
    'M20_How_Do_You_DO_That':     m20('M20 How Do You DO That?'),
    'M20_Technocracy_Reloaded':   m20('M20 Technocracy Reloaded'),
    'M20_Lore_of_the_Traditions': m20('M20 Lore of the Traditions'),
    'M20_Gods_and_Monsters':      m20('M20 Gods & Monsters'),
    'M20_Book_of_the_Fallen':     m20('M20 Book of the Fallen'),
    'M20_Sorcerer':               m20('M20 Sorcerer'),
    'M20_Rich_Bastards_Guide':    m20("M20 The Rich Bastard's Guide to Magick"),
    'M20_Operatives_Dossier':     m20("M20 The Operative's Dossier"),
    'M20_Faces_of_Magick':        m20('M20 Faces of Magick'),
    'M20_Victorian_Age':          m20('Mage 20th Anniversary: The Victorian Age', edition=VA),
    'M20_VA_Weird_Wonders':       m20('Victorian Mage: Weird Wonders and Revolutionary Magick', edition=VA),
    'M20_VA_Bizarre_Tales':       m20('Victorian Mage: Bizarre Tales and Unusual Characters', edition=VA),
}

FILES = {  # 'папка/префикс' -> метаданные
    'Глоссарий_терминов': dict(book='Сводный глоссарий проекта (основа: Mage Translation Guide)', edition='mixed', compat_m20='native', source='compiled', reliability='medium'),
}

KEYS = ['book', 'edition', 'compat_m20', 'source', 'reliability']
SKIP = ('README.md', 'Указатель.md', 'Указатель_компактный.md', 'AGENTS.md', '_прогресс.md')

def meta_for(rel):
    folder = rel.split('/')[0]
    for pref in sorted(FILES, key=len, reverse=True):
        if rel.startswith(pref):
            return FILES[pref]
    return FOLDERS.get(folder)

def main():
    done, miss = 0, []
    for d, _, fs in os.walk(ROOT):
        for f in fs:
            if not f.endswith('.md') or f in SKIP:
                continue
            path = os.path.join(d, f)
            rel = os.path.relpath(path, ROOT).replace('\\', '/')
            m = meta_for(rel)
            if not m:
                miss.append(rel); continue
            text = open(path, encoding='utf-8').read()
            text = re.sub(r'\A---\n.*?\n---\n+', '', text, flags=re.S)   # старая шапка
            head = '---\n' + ''.join(f'{k}: "{m[k]}"\n' for k in KEYS) + '---\n\n'
            open(path, 'w', encoding='utf-8', newline='\n').write(head + text)
            done += 1
    sys.stdout.reconfigure(encoding='utf-8')
    print(f'шапок: {done}; без правила: {len(miss)}')
    for r in miss: print('  ', r)

if __name__ == '__main__':
    main()
