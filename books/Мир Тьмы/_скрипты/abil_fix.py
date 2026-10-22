import os, re, sys
# usage: abil_fix.py <справочник> <файл с таблицей способностей> [--apply]
sys.stdout.reconfigure(encoding='utf-8')
root, src = sys.argv[1], sys.argv[2]
apply = '--apply' in sys.argv
t = open(os.path.join(root, src), encoding='utf-8').read()
mp = {}
for ru, en in re.findall(r'([А-ЯЁ][а-яё]+(?: [а-яё]+)?) \(([A-Z][A-Za-z\- ]+)\)', t):
    if len(en) < 40:
        mp.setdefault(en, ru)
# только способности и атрибуты из таблиц черт
keep = {k: v for k, v in mp.items() if k in (
    'Alertness','Athletics','Awareness','Brawl','Dodge','Empathy','Expression','Intimidation','Leadership','Streetwise','Subterfuge',
    'Crafts','Drive','Etiquette','Firearms','Meditation','Melee','Performance','Stealth','Survival','Archery',
    'Academics','Bureaucracy','Computer','Enigmas','Investigation','Law','Linguistics','Medicine','Occult','Politics','Science','Technology',
    'Strength','Dexterity','Stamina','Charisma','Manipulation','Appearance','Perception','Intelligence','Wits')}
rx = re.compile(r'(?<![(A-Za-z])(' + '|'.join(sorted(map(re.escape, keep), key=len, reverse=True)) + r')(?![A-Za-z)])')
tot = 0
for d, _, fs in os.walk(root):
    for f in fs:
        if not f.endswith('.md') or f.startswith(('Указатель', 'Глоссарий', '_')):
            continue
        p = os.path.join(d, f)
        s = open(p, encoding='utf-8').read()
        hits = []
        def sub(m):
            # не трогать английские фразы: слово окружено латиницей через пробел
            a, b = m.start(), m.end()
            left = s[max(0, a - 2):a]; right = s[b:b + 2]
            if re.search(r'[A-Za-z] $', left) or re.match(r' [A-Za-z]', right):
                return m.group(0)
            hits.append(m.group(1))
            return keep[m.group(1)]
        new = rx.sub(sub, s)
        if hits:
            tot += len(hits)
            print(len(hits), f[:45], sorted(set(hits))[:8])
            if apply:
                open(p, 'w', encoding='utf-8', newline='\n').write(new)
print('всего', tot, 'словарь', len(keep))
