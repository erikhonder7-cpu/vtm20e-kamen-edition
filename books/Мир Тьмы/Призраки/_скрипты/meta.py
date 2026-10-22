# Проставляет YAML-шапку (метаданные) в начало каждого .md справочника. Повторный запуск заменяет шапку.
# Запуск из папки Призраки: python -I _скрипты/meta.py
import os, re, sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '_справочник'))

# edition: Wraith 20
# compat_wraith20: native — правила Wraith 20 как есть; minor — старая редакция, числа сверять; none — другая система
# source: official_en | official_ru | fan_translation_ru | machine_translation_ru | ocr_en | summary_ru | compiled
# reliability: high | medium | low  (насколько точны числа механики)
def book(title, reliability='high'):
    return dict(book=title, edition='Wraith 20', compat_wraith20='native', source='official_en', reliability=reliability)

FOLDERS = {
    'Wraith20_Основная': book('Wraith: The Oblivion 20th Anniversary Edition'),
    'Wraith20_Book_of_Oblivion': book('Wraith20 The Book of Oblivion'),
    'Wraith20_Handbook': book('Wraith20 Handbook for the Recently Deceased'),
}

FILES = {  # 'папка/префикс' -> метаданные
    'Глоссарий_терминов': dict(book='Сводный глоссарий проекта (основа: рабочий словарь терминов)', edition='mixed', compat_wraith20='native', source='compiled', reliability='medium'),
}

KEYS = ['book', 'edition', 'compat_wraith20', 'source', 'reliability']
SKIP = ('README.md', 'Указатель.md', 'Указатель_компактный.md', 'AGENTS.md', '_прогресс.md', '_термины_рабочие.md')

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
