# Проставляет YAML-шапку (метаданные) в начало каждого .md справочника. Повторный запуск заменяет шапку.
# Запуск из папки ВТМ: python -I _скрипты/meta.py
import os, re, sys

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '_справочник'))

# edition: V20 | V20 Dark Ages | V5 | Revised | 2nd Edition | 1st Edition | Dark Ages: Vampire (2002) | nWoD | fan
# compat_v20: native — правила V20 как есть; minor — старая редакция, числа сверять; convert — нужна конверсия; none — другая система
# source: official_en | official_ru | fan_translation_ru | machine_translation_ru | ocr_en | summary_ru | compiled
# reliability: high | medium | low  (насколько точны числа механики)
V20 = dict(edition='V20', compat_v20='native')

FOLDERS = {
    'V20_Основные_правила':    dict(book='Vampire: The Masquerade 20th Anniversary Edition', source='official_ru', reliability='high', **V20),
    'Дисциплины':            dict(book='Vampire: The Masquerade 20th Anniversary Edition (core)', source='official_ru', reliability='high', **V20),
    'Достоинства_и_недостатки': dict(book='Vampire: The Masquerade 20th Anniversary Edition (core)', source='official_ru', reliability='high', **V20),
    'Факты_биографии':         dict(book='Vampire: The Masquerade 20th Anniversary Edition (core)', source='official_ru', reliability='high', **V20),
    'Lore_of_the_Clans':       dict(book='V20 Lore of the Clans', source='official_en', reliability='high', **V20),
    'Lore_of_the_Bloodlines':  dict(book='V20 Lore of the Bloodlines', source='official_en', reliability='high', **V20),
    'Rites_of_the_Blood':      dict(book='V20 Rites of the Blood', source='official_en', reliability='high', **V20),
    'Black_Hand':              dict(book="V20 The Black Hand: A Guide to the Tal'Mahe'Ra", source='official_en', reliability='high', **V20),
    'Anarchs_Unbound':         dict(book='V20 Anarchs Unbound', source='official_en', reliability='high', **V20),
    'Hunters_Hunted_II':       dict(book='V20 The Hunters Hunted II', source='official_en', reliability='high', **V20),
    'Dread_Names':             dict(book='V20 Dread Names, Red List', source='official_en', reliability='high', **V20),
    'Becketts_Jyhad_Diary':    dict(book="V20 Beckett's Jyhad Diary", source='official_en', reliability='high', **V20),
    'Children_of_the_Revolution': dict(book='V20 Children of the Revolution', source='official_en', reliability='high', **V20),
    'V20_Companion':           dict(book='V20 Companion', source='official_ru', reliability='high', **V20),
    'Dust_to_Dust':            dict(book='V20 Dust to Dust', source='official_ru', reliability='high', **V20),
    'Fall_of_London':          dict(book='The Fall of London (V5)', edition='V5', compat_v20='convert', source='official_en', reliability='high'),
    'V20_Dark_Ages':           dict(book='V20 Dark Ages', edition='V20 Dark Ages', compat_v20='native', source='official_en', reliability='high'),
    'DA_Companion':            dict(book='V20 Dark Ages Companion', edition='V20 Dark Ages', compat_v20='native', source='official_en', reliability='medium'),
    'DA_Tome_of_Secrets':      dict(book='V20 Dark Ages: Tome of Secrets', edition='V20 Dark Ages', compat_v20='native', source='official_en', reliability='high'),
    'DA_High_Clans':           dict(book="Dark Ages: Player's Guide to High Clans", edition='Dark Ages: Vampire (2002)', compat_v20='minor', source='machine_translation_ru', reliability='medium'),
    'DA_Low_Clans':            dict(book="Dark Ages: Player's Guide to Low Clans", edition='Dark Ages: Vampire (2002)', compat_v20='minor', source='machine_translation_ru', reliability='medium'),
    'DA_Clanbook_Baali':       dict(book='Dark Ages Clanbook: Baali', edition='Dark Ages: Vampire (2002)', compat_v20='minor', source='fan_translation_ru', reliability='medium'),
    'DA_Clanbook_Salubri':     dict(book='Dark Ages Clanbook: Salubri', edition='Dark Ages: Vampire (2002)', compat_v20='minor', source='fan_translation_ru', reliability='high'),
    'DA_House_of_Tremere':     dict(book='Dark Ages: House of Tremere', edition='Dark Ages: Vampire (2002)', compat_v20='minor', source='fan_translation_ru', reliability='high'),
}

REV = dict(edition='Revised', compat_v20='minor')
FILES = {  # 'папка/префикс' -> метаданные
    'Revised_Кланбуки/01': dict(book='Clanbook: Followers of Set (Revised)', source='fan_translation_ru', reliability='high', **REV),
    'Revised_Кланбуки/02': dict(book='Clanbook: Tremere (Revised)', source='fan_translation_ru', reliability='high', **REV),
    'Revised_Кланбуки/03': dict(book='Clanbook: Tzimisce (Revised)', source='fan_translation_ru', reliability='medium', **REV),
    'Revised_Кланбуки/04': dict(book='Clanbook: Gangrel (Revised)', source='fan_translation_ru', reliability='medium', **REV),
    'Revised_Кланбуки/05': dict(book='Clanbook: Assamite (Revised)', source='fan_translation_ru', reliability='medium', **REV),
    'Revised_Кланбуки/06': dict(book='Clanbook: Toreador (Revised)', source='fan_translation_ru', reliability='medium', **REV),
    'Revised_Кланбуки/07': dict(book='Clanbook: Ventrue (Revised)', source='fan_translation_ru', reliability='medium', **REV),
    'Revised_Кланбуки/08': dict(book='Clanbook: Lasombra (Revised)', source='fan_translation_ru', reliability='medium', **REV),
    'Revised_Кланбуки/09': dict(book='Clanbook: Giovanni (Revised)', source='fan_translation_ru', reliability='medium', **REV),
    'Revised_Кланбуки/10': dict(book='Clanbook: Brujah (Revised)', source='fan_translation_ru', reliability='medium', **REV),
    'Revised_Кланбуки/11': dict(book='Clanbook: Malkavian (Revised)', source='official_en', reliability='high', **REV),
    'Revised_Кланбуки/12': dict(book='Clanbook: Malkavian (1993)', edition='1st Edition', compat_v20='minor', source='fan_translation_ru', reliability='medium'),
    'Revised_Кланбуки/13': dict(book='Clanbook: Nosferatu (Revised)', source='ocr_en+fan_translation_ru', reliability='high', **REV),
    'Revised_Гайды_сект/01': dict(book='Guide to the Camarilla (Revised)', source='fan_translation_ru', reliability='medium', **REV),
    'Revised_Гайды_сект/02': dict(book='Guide to the Anarchs (Revised)', source='fan_translation_ru', reliability='medium', **REV),
    'Revised_Гайды_сект/03': dict(book='Guide to the Sabbat (Revised, 1999)', source='ocr_en+fan_translation_ru', reliability='high', **REV),
    'Revised_Гайды_сект/04': dict(book="The Player's Guide to the Sabbat (1992)", edition='2nd Edition', compat_v20='minor', source='machine_translation_ru', reliability='low'),
    'Revised_Основные/01': dict(book="Vampire Storytellers Handbook (Revised)", source='official_en', reliability='high', **REV),
    'Revised_Основные/02a': dict(book="The Vampire Players Guide (2nd Edition, 1993)", edition='2nd Edition', compat_v20='minor', source='official_en', reliability='medium'),
    'Revised_Основные/02b': dict(book="The Vampire Players Guide (2nd Edition, 1993)", edition='2nd Edition', compat_v20='minor', source='official_en', reliability='medium'),
    'Revised_Основные/02c': dict(book="The Vampire Players Guide (2nd Edition, 1993)", edition='2nd Edition', compat_v20='minor', source='ocr_en', reliability='low'),
    'Revised_Основные/03': dict(book="Vampire Storyteller's Companion", edition='2nd Edition', compat_v20='minor', source='fan_translation_ru', reliability='medium'),
    'Прочее/01': dict(book='Chicago by Night (2nd Edition)', edition='2nd Edition', compat_v20='minor', source='machine_translation_ru', reliability='low'),
    'Прочее/02': dict(book='Los Angeles by Night (1994)', edition='2nd Edition', compat_v20='minor', source='fan_translation_ru', reliability='medium'),
    'Прочее/03': dict(book='Vampire: The Wild West', edition='Revised', compat_v20='minor', source='machine_translation_ru', reliability='medium'),
    'Прочее/04': dict(book='Milwaukee by Night', edition='2nd Edition', compat_v20='minor', source='machine_translation_ru', reliability='low'),
    'Прочее/05': dict(book='New Orleans by Night', edition='2nd Edition', compat_v20='minor', source='fan_translation_ru', reliability='medium'),
    'Прочее/06': dict(book='Vampire: Age of the Living Gods (v3.2, 2023, fan)', edition='fan (V20 Dark Ages)', compat_v20='native', source='fan_en', reliability='medium'),
    'Прочее/07': dict(book='Elysium: The Elder Wars (1994)', edition='2nd Edition', compat_v20='minor', source='machine_translation_ru', reliability='low'),
    'Прочее/08': dict(book='The Hunters Hunted (1992)', edition='2nd Edition', compat_v20='minor', source='fan_translation_ru', reliability='medium'),
    'Прочее/09': dict(book='Bloody Hearts: Diablerie Britain (1993)', edition='2nd Edition', compat_v20='minor', source='machine_translation_ru', reliability='low'),
    'Прочее/10': dict(book='Alien Hunger (1991)', edition='1st Edition', compat_v20='minor', source='fan_translation_ru', reliability='medium'),
    'Прочее/11': dict(book='World of Darkness: Urban Legends', edition='nWoD', compat_v20='none', source='fan_translation_ru', reliability='medium'),
    'Прочее/12': dict(book='World of Darkness: Ghost Stories', edition='nWoD', compat_v20='none', source='fan_translation_ru', reliability='medium'),
    'Прочее/13': dict(book='Samedi (fan bloodline book)', edition='fan', compat_v20='minor', source='fan_translation_ru', reliability='low'),
    'Прочее/14': dict(book='Клиника (конспект, Chronicles of Darkness)', edition='nWoD', compat_v20='none', source='summary_ru', reliability='medium'),
    'Прочее/15': dict(book='Midnight Roads (конспект, Chronicles of Darkness)', edition='nWoD', compat_v20='none', source='summary_ru', reliability='medium'),
    'Прочее/16': dict(book='Bloodlinebook: True Brujah (fan, 2003)', edition='fan', compat_v20='minor', source='machine_translation_ru', reliability='low'),
    'Глоссарий_терминов': dict(book='Сводный глоссарий проекта (основа: Vampire Translation Guide)', edition='mixed', compat_v20='native', source='compiled', reliability='medium'),
}

KEYS = ['book', 'edition', 'compat_v20', 'source', 'reliability']

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
            if not f.endswith('.md') or f in ('README.md', 'Указатель.md', 'AGENTS.md'):
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
