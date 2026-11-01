# Партия 38 — расширенный аудит Revised Clanbooks

## Охват

В одном расширенном прогоне проверены *Clanbook: Nosferatu Revised*, *Clanbook: Tremere Revised*, *Clanbook: Tzimisce Revised* и повторно сверены уже внесённые записи из *Clanbook: Lasombra Revised*. Все новые и обновлённые записи, привязанные к конкретному клану, находятся в `category=clan`. Revised-материал не объединялся с V20 или Dark Ages.

## Итоги

| Источник | Карточек после сверки | Добавлено | Обновлено |
|---|---:|---:|---:|
| Clanbook: Nosferatu Revised | 26 | 17 | 9 |
| Clanbook: Tremere Revised | 5 | 4 | 1 |
| Clanbook: Tzimisce Revised | 8 | 7 | 1 |
| Clanbook: Lasombra Revised | 7 | 2 | 5 |
| **Всего за партию** | — | **30** | **16** |

Накопительная база: **1131 → 1161 карточек** (достоинства: 559; недостатки: 602).

## Nosferatu Revised

В прежней базе присутствовало 9 из 26 клановых записей. Добавлены 17 пропущенных черт: Lizard Limbs, Long Fingers, Piscine, Slimy, Sleep Unseen, Tough Hide, False Reflection, Foul Blood, Patagia, Rugged Bad Looks, Stench, Anosmia, Parasitic Infestation, Enemy Brood, Putrescent, Contagious и Incoherent. Существующие 9 карточек получили уточнённые страницы и статус прямой проверки по англоязычному текстовому слою PDF. Список из 26 записей совпадает с перечнем главы Merits and Flaws.

**Важные tabletop-детали:** Lizard Limbs требует 1 пункт крови и бросок Силы Воли сложности 8; Sleep Unseen использует Obfuscate во время дневного сна и требует дополнительную кровь для 24-часового скрытия; Parasitic Infestation ежедневно отнимает кровь по формуле `ceil(1d10/3)` и повышает сложность Self-Control на 1; Contagious проверяется смертным после прикосновения (Stamina, сложность 9). MET-адаптации не переносились в настольные карточки.

## Tremere Revised

Добавлены Embraced Without the Cup (3, Social Merit), Bound to the Council (3, Social Flaw), Double Betrayer (4, Social Flaw) и Thaumaturgically Inept (5, Supernatural Flaw). Attuned Taste уже присутствовало и было перепроверено. Для Thaumaturgically Inept сохранено точное правило источника: сложность применения путей и ритуалов становится `обычная +1` (формулировка оригинала — +4 вместо стандартных +3), максимум 10; стартовый рейтинг Тауматургии не выше 1, но дисциплина остаётся клановой.

## Tzimisce Revised

Добавлены семь записей Revised-издания: Pain Tolerance (2), Haven Affinity (3), Dracon’s Temperament (3), Revenant Disciplines (3), Ancestral Soil Dependence (2), Revenant Weakness (3), Consumption (5). Scarface перепроверено и обновлено.

**Разведения версий:** Pain Tolerance и Haven Affinity существуют и в *Clanbook: Tzimisce* 2e, но Revised-варианты отличаются механикой/стоимостью: Pain Tolerance Revised игнорирует штрафы только на Hurt и Injured, а Haven Affinity Revised стоит 3 очка. Поэтому версии оставлены отдельными карточками.

**Ограничения:** Ancestral Soil Dependence — tabletop-текст требует две горсти заражённой восточноевропейской почвы, но не задаёт точный числовой штраф за её отсутствие. Штраф `−2 Traits` — часть MET, не включена в настольное описание. Revenant Weakness зависит от конкретной семьи и не получила выдуманного универсального броска. Для Dracon’s Temperament заголовок и часть двухколоночного текста распознаны OCR неидеально; точное написание подтверждается вторичным указателем и остаётся в pending до визуальной проверки.

## Lasombra Revised

Добавлены Controllable Night Sight (2, Merit) и Uncontrollable Night Sight (2, Flaw). Перепроверены Weather Sense, Pelagic Harmony, Poseidon’s Call, Pelagic Compulsion и Death’s Reflection.

**Исправление системного смешения:** из tabletop-описаний удалены MET-бонусы Traits, которые ранее могли читаться как дополнительные бонусы к броскам Воли. Pelagic Harmony даёт `−1 difficulty` к броскам Силы Воли на море или в пределах видимости моря; Poseidon’s Call меняет сложность сопротивления безумию в зависимости от погоды. Pelagic Compulsion подтверждено как отдельный 2-точечный недостаток, не как вариант Uncontrollable Night Sight.

**Ограничение источника:** для Lasombra использована доступная русская цифровая транскрипция/скан перевода (печатные страницы перевода 134–136); оригинальные английские страницы 63–65 не были независимо визуально проверены. Поэтому source_status не повышен до прямой проверки по английскому изданию.

## Валидация

- Новых карточек: 30 (16 достоинств, 14 недостатков).
- Обновлённых карточек: 16.
- Дубликатов среди новых карточек по `(kind, en, source_title, era)`: 0.
- Все 30 новых карточек и все 16 обновлённых клановых записей используют `category=clan`.
- Revised-карточки не слиты с V20, Dark Ages или 2e вариантами.
- Англоязычный текстовый слой Nosferatu и Tremere использован напрямую; для Tzimisce использован OCR скана, для Lasombra — русская цифровая транскрипция. Визуальную проверку растровых страниц нельзя считать выполненной.
