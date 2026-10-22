import re, sys
# usage: make_glossary.py <справочник> <название линейки>
root, name = sys.argv[1], sys.argv[2]
terms = open(root + '/_термины_рабочие.md', encoding='utf-8').read()
terms = re.sub(r'\A---\n.*?\n---\n+', '', terms, flags=re.S)
body = terms.split('\n', 1)[1] if terms.startswith('#') else terms   # убрать заголовок рабочего файла
comp = open(root + '/Указатель_компактный.md', encoding='utf-8').read()
multi = comp.split('## Английский → несколько русских вариантов', 1)
multi = multi[1].strip().split('\n') if len(multi) > 1 else []
out = [f'# Глоссарий терминов — {name}', '',
       'Принятые переводы проекта (English → Русский). Основа — рабочий словарь `_термины_рабочие.md`, сверенный с книгами при разборе. '
       'Формат в тексте справочника: «Русское (English)» при первом упоминании в файле, дальше — по-русски.', '',
       '## Принятые термины', body.strip(), '']
if multi:
    out += ['## Одно английское название — несколько русских вариантов в справочнике',
            'Собрано из `Указатель_компактный.md`: эти названия встречаются в разных файлах под разными русскими формами. '
            'Сопоставлять по английскому; при правке выравнивать по таблице выше.', '']
    out += [f'- {x}' for x in multi if x.strip()]
    out.append('')
open(root + '/Глоссарий_терминов.md', 'w', encoding='utf-8', newline='\n').write('\n'.join(out))
print('ok', len(multi))
