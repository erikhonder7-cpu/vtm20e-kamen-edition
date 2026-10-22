# Проставляет YAML-шапку (метаданные) в начало каждого .md справочника. Повторный запуск заменяет шапку.
# Запуск из папки Оборотни: python -I _скрипты/meta.py
import os, re, sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '_справочник'))

# edition: W20 | Revised | 2nd Edition | 1st Edition | fan
# compat_w20: native — правила W20 как есть; minor — старая редакция, числа сверять; none — другая система
# source: official_en | official_ru | fan_translation_ru | machine_translation_ru | ocr_en | summary_ru | compiled
# reliability: high | medium | low  (насколько точны числа механики)
def w20(book, reliability='high'):
    return dict(book=book, edition='W20', compat_w20='native', source='official_en', reliability=reliability)

FOLDERS = {
    'W20_Основная':              w20('Werewolf: The Apocalypse 20th Anniversary Edition'),
    'W20_Changing_Breeds':       w20('W20 Changing Breeds'),
    'W20_Umbra':                 w20('W20 Umbra: The Velvet Shadow'),
    'W20_Kinfolk':               w20('W20 Kinfolk: A Breed Apart'),
    'W20_Changing_Ways':         w20('W20 Changing Ways'),
    'W20_Book_of_the_Wyrm':      w20('W20 Book of the Wyrm'),
    'W20_Rage_Across_the_World': w20('W20 Rage Across the World'),
    'W20_White_Howlers':         w20('W20 White Howlers Tribebook'),
    'W20_Shattered_Dreams':      w20('W20 Shattered Dreams'),
    'W20_Pentex':                w20('W20 Pentex Employee Indoctrination Handbook'),
    'W20_Skinner':               w20('W20 Skinner'),
}

FILES = {  # 'папка/префикс' -> метаданные
    'Глоссарий_терминов': dict(book='Сводный глоссарий проекта', edition='mixed', compat_w20='native', source='compiled', reliability='medium'),
}

KEYS = ['book', 'edition', 'compat_w20', 'source', 'reliability']
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
