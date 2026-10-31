# tools/fsretry.py
# Windows: файл изредка на долю секунды занят чужим процессом (антивирус, индексатор поиска) — open() падает
# с OSError 22 (Invalid argument) или 13 (Permission denied), и сборка обрывается на полпути. install() подменяет
# open повтором: до пяти попыток с нарастающей паузой; любые другие ошибки и последняя неудача — как раньше.

import builtins, time

_open = builtins.open


def _retry_open(*args, **kwargs):
    for i in range(5):
        try:
            return _open(*args, **kwargs)
        except OSError as e:
            if e.errno not in (13, 22) or i == 4:
                raise
            time.sleep(0.2 * (i + 1))


def install():
    builtins.open = _retry_open
