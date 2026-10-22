# -*- coding: utf-8 -*-
"""Готовые места Парижа 1789 года для шторы «Город» (module/ui/citymap.mjs).

    python -I tools/city_paris1789.py

Подборка хроники «Liberté»: места, что были в Париже в 1789 году, — тюрьмы и власть, кафе и клубы
Пале-Рояля, театры, церкви, больницы, кладбища и Катакомбы, рынки, заставы стены Откупщиков,
предместья. У каждого места — короткая заметка о нём в 1789-м и статья русской Википедии.
Многих зданий нет (Бастилия, Шатле, Тампль), тогда точка — там, где они стояли: площадь, сквер.

Координаты берутся из OpenStreetMap через Nominatim (по поисковой строке FIND) и кэшируются
в tools/.cache-paris1789.json — повторный запуск сеть не трогает. Данные © OpenStreetMap, ODbL.
Результат: data/cities/paris-1789.json и строка в data/cities/index.json.
"""
import json, os, sys, time, urllib.parse, urllib.request

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "cities")
CACHE = os.path.join(ROOT, "tools", ".cache-paris1789.json")
UA = "vtm20e-kamen-edition/0.3 (Foundry VTT system; city presets)"
PARIS_BOX = "2.22,48.91,2.47,48.81"   # viewbox: запад, север, восток, юг

R, L, I, F, O = "Правый берег", "Левый берег", "Острова Сите и Сен-Луи", "Предместья", "За заставами"

# папка: (id, имя, категория, видна сразу)
FOLDERS = [
    ("power", "Власть и тюрьмы", "power", True),
    ("clubs", "Кафе, клубы и сады", "nightlife", True),
    ("theatres", "Театры и собрания", "culture", True),
    ("churches", "Церкви и обители", "worship", True),
    ("hospitals", "Больницы и приюты", "hospital", True),
    ("death", "Кладбища, морг и Катакомбы", "cemetery", True),
    ("markets", "Рынки и мануфактуры", "market", False),
    ("gates", "Заставы, мосты и предместья", "landmark", False),
    ("liberte", "Места хроники «Liberté»", "kindred", True),
]

# (папка, вид, район, русское имя, французское имя, поиск в OSM, заметка, статья ru-Википедии)
PLACES = [
    # ── Власть и тюрьмы ──
    ("power", "castle", R, "Бастилия", "La Bastille", "@48.85318,2.36852",
     "Крепость-тюрьма у Сент-Антуанских ворот; взята толпой 14 июля 1789 года и разобрана на камни.", "Бастилия"),
    ("power", "government", R, "Ратуша и Гревская площадь", "Hôtel de Ville, place de Grève", "Hôtel de Ville, Paris",
     "Городское управление и площадь казней; с июля 1789 года — Коммуна Парижа и мэр Байи.", "Гревская площадь"),
    ("power", "court", R, "Большой Шатле", "Grand Châtelet", "Place du Châtelet, Paris",
     "Крепость у Моста менял: суд прево и тюрьма, в подвале — морг «Нижняя тюрьма». Снесён в 1802-м.", "Большой Шатле"),
    ("power", "court", I, "Дворец правосудия и Консьержери", "Palais de Justice, Conciergerie", "Conciergerie, Paris",
     "Парламент Парижа и его тюрьма; позже — преддверие гильотины.", "Консьержери"),
    ("power", "prison", R, "Тюрьма Ла Форс", "Hôtel de la Force", "Rue du Roi de Sicile, Paris",
     "Долговая и уголовная тюрьма квартала Маре (с 1780-х годов).", "Ла Форс (тюрьма)"),
    ("power", "prison", L, "Тюрьма Аббатства", "Prison de l'Abbaye", "Place Saint-Germain-des-Prés, Paris",
     "Военная тюрьма аббатства Сен-Жермен-де-Пре.", "Тюрьма Аббатства"),
    ("power", "prison", R, "Тампль", "Enclos du Temple", "Square du Temple, Paris",
     "Ограда бывших тамплиеров с башней — убежище должников, право убежища вне власти города.", "Тампль (крепость)"),
    ("power", "prison", R, "Сен-Лазар", "Enclos Saint-Lazare", "Rue du Faubourg-Saint-Denis 107, Paris",
     "Обитель лазаристов и исправительный дом; разграблена 13 июля 1789 года.", "Сен-Лазар (тюрьма)"),
    ("power", "palace", R, "Тюильри", "Palais des Tuileries", "Jardin des Tuileries, Paris",
     "Королевский дворец; с октября 1789 года — резиденция Людовика XVI.", "Тюильри (дворец)"),
    ("power", "government", R, "Манеж Тюильри", "Salle du Manège", "Rue de Rivoli 230, Paris",
     "Крытый манеж у Тюильри; с ноября 1789 года — зал Национального собрания.", "Манеж Тюильри"),
    ("power", "military", L, "Дом инвалидов", "Hôtel des Invalides", "Hôtel des Invalides, Paris",
     "Приют ветеранов и арсенал: здесь 14 июля взяли 30 тысяч ружей.", "Дом инвалидов"),
    ("power", "military", L, "Военная школа и Марсово поле", "École militaire, Champ-de-Mars", "École militaire, Paris",
     "Кадетская школа; на Марсовом поле — праздник Федерации 1790 года.", "Военная школа (Париж)"),
    ("power", "palace", R, "Лувр", "Palais du Louvre", "Cour Carrée du Louvre, Paris",
     "Старый дворец: академии, мастерские художников, Салон.", "Лувр"),
    ("power", "government", L, "Монетный двор", "Hôtel des Monnaies", "Monnaie de Paris, Paris",
     "Чеканка луидоров, экю и су на набережной Конти.", "Монетный двор Парижа"),
    # ── Кафе, клубы и сады ──
    ("clubs", "club", R, "Пале-Рояль", "Palais-Royal", "Jardin du Palais-Royal, Paris",
     "Владение герцога Орлеанского, закрытое для полиции: кафе, игорные дома, лавки, девицы и ораторы. Здесь 12 июля Демулен звал к оружию.", "Пале-Рояль"),
    ("clubs", "bar", R, "Кафе де Фуа", "Café de Foy", "Galerie de Montpensier, Paris",
     "Кафе в галереях Пале-Рояля, откуда Демулен поднял толпу.", "Кафе де Фуа"),
    ("clubs", "bar", L, "Кафе «Прокоп»", "Café Procope", "Café Procope, Paris",
     "Старейшее кафе Парижа, у старого зала Комеди-Франсез: литераторы, Дантон, Марат.", "Прокоп (кафе)"),
    ("clubs", "bar", R, "Кафе «Регентство»", "Café de la Régence", "Place du Palais-Royal, Paris",
     "Шахматное кафе у Пале-Рояля.", "Кафе «Регентство»"),
    ("clubs", "club", R, "Якобинский монастырь", "Couvent des Jacobins", "Place du Marché-Saint-Honoré, Paris",
     "Библиотека доминиканцев на улице Сент-Оноре; с конца 1789 года здесь заседает Общество друзей конституции.", "Якобинский клуб"),
    ("clubs", "club", L, "Монастырь кордельеров", "Couvent des Cordeliers", "Rue de l'École de Médecine 15, Paris",
     "Францисканская обитель; с 1790 года — клуб Дантона и Марата.", "Клуб кордельеров"),
    # ── Театры и собрания ──
    ("theatres", "theatre", L, "Комеди-Франсез (Одеон)", "Théâtre-Français", "Théâtre de l'Odéon, Paris",
     "Новый зал королевских актёров (1782); в 1789-м здесь ставят «Карла IX» Шенье.", "Театр Одеон"),
    ("theatres", "theatre", R, "Опера у ворот Сен-Мартен", "Opéra, salle de la Porte-Saint-Martin", "Théâtre de la Porte-Saint-Martin, Paris",
     "Зал Королевской академии музыки, выстроенный за 75 дней после пожара 1781 года.", "Театр Порт-Сен-Мартен"),
    ("theatres", "theatre", R, "Итальянская комедия", "Comédie-Italienne, salle Favart", "Opéra-Comique, Paris",
     "Зал Фавара (1783) — комическая опера.", "Опера-Комик"),
    ("theatres", "museum", R, "Королевская библиотека", "Bibliothèque du Roi", "Bibliothèque nationale de France Richelieu, Paris",
     "Библиотека на улице Ришельё, открытая для учёных.", "Национальная библиотека Франции"),
    ("theatres", "museum", L, "Сорбонна", "Sorbonne", "Sorbonne, Paris",
     "Богословский факультет Парижского университета.", "Сорбонна"),
    ("theatres", "museum", L, "Обсерватория", "Observatoire de Paris", "Observatoire de Paris",
     "Королевская обсерватория семьи Кассини.", "Парижская обсерватория"),
    ("theatres", "museum", L, "Королевский сад", "Jardin du Roi", "Jardin des Plantes, Paris",
     "Сад лекарственных растений и кабинет естественной истории Бюффона.", "Ботанический сад (Париж)"),
    # ── Церкви и обители ──
    ("churches", "church", I, "Собор Парижской Богоматери", "Notre-Dame de Paris", "Cathédrale Notre-Dame de Paris",
     "Кафедральный собор архиепископа Парижа.", "Собор Парижской Богоматери"),
    ("churches", "church", I, "Сент-Шапель", "Sainte-Chapelle", "Sainte-Chapelle, Paris",
     "Дворцовая капелла с реликвиями Страстей.", "Сент-Шапель"),
    ("churches", "church", L, "Сен-Сюльпис", "Saint-Sulpice", "Église Saint-Sulpice, Paris",
     "Огромный приход Сен-Жерменского предместья и семинария.", "Сен-Сюльпис"),
    ("churches", "church", R, "Сент-Эсташ", "Saint-Eustache", "Église Saint-Eustache, Paris",
     "Приход рынка Ле-Аль.", "Сент-Эсташ"),
    ("churches", "church", L, "Сен-Жермен-де-Пре", "Saint-Germain-des-Prés", "Église Saint-Germain-des-Prés, Paris",
     "Древнее бенедиктинское аббатство.", "Сен-Жермен-де-Пре"),
    ("churches", "church", R, "Сен-Жермен-л’Осеруа", "Saint-Germain-l'Auxerrois", "Église Saint-Germain-l'Auxerrois, Paris",
     "Приход Лувра; его колокол звонил в Варфоломеевскую ночь.", "Сен-Жермен-л’Осеруа"),
    ("churches", "church", L, "Церковь Святой Женевьевы", "Sainte-Geneviève", "Panthéon, Paris",
     "Достраивается по проекту Суффло; в 1791 году станет Пантеоном.", "Пантеон (Париж)"),
    ("churches", "church", L, "Валь-де-Грас", "Val-de-Grâce", "Val-de-Grâce, Paris",
     "Бенедиктинская обитель, основанная Анной Австрийской.", "Валь-де-Грас"),
    ("churches", "church", R, "Сен-Рок", "Saint-Roch", "Église Saint-Roch, Paris",
     "Приход улицы Сент-Оноре.", "Сен-Рок (церковь, Париж)"),
    ("churches", "church", R, "Сен-Поль-Сен-Луи", "Saint-Paul-Saint-Louis", "Église Saint-Paul-Saint-Louis, Paris",
     "Иезуитская церковь Маре.", "Сен-Поль-Сен-Луи"),
    ("churches", "church", O, "Аббатство Монмартр", "Saint-Pierre de Montmartre", "Église Saint-Pierre de Montmartre, Paris",
     "Обитель на холме за заставами, среди виноградников и мельниц.", "Сен-Пьер-де-Монмартр"),
    # ── Больницы и приюты ──
    ("hospitals", "hospital", I, "Отель-Дьё", "Hôtel-Dieu", "Pont au Double, Paris",
     "Главная больница города: корпуса к югу от паперти Нотр-Дама и за мостом в два денье, на левом берегу; по нескольку больных на кровати. Нынешнее здание к северу от собора — 1877 года.", "Отель-Дьё (Париж)"),
    ("hospitals", "hospital", F, "Сальпетриер", "La Salpêtrière", "Hôpital de la Pitié-Salpêtrière, Paris",
     "Общий госпиталь: приют для бедных, безумных и падших женщин, тюрьма.", "Сальпетриер"),
    ("hospitals", "hospital", O, "Бисетр", "Bicêtre", "Hôpital Bicêtre, Le Kremlin-Bicêtre",
     "Приют и тюрьма за городом: нищие, безумные, каторжники.", "Бисетр"),
    ("hospitals", "hospital", L, "Шарите", "Hôpital de la Charité", "Rue des Saints-Pères 45, Paris",
     "Больница братьев милосердия.", "Шарите (больница, Париж)"),
    ("hospitals", "hospital", R, "Кенз-Вен", "Quinze-Vingts", "Hôpital des Quinze-Vingts, Paris",
     "Приют для слепых, с 1780 года — в Сент-Антуанском предместье.", "Кенз-Вен"),
    # ── Кладбища, морг и Катакомбы ──
    ("death", "cemetery", R, "Кладбище Невинных", "Cimetière des Innocents", "Fontaine des Innocents, Paris",
     "Закрыто в 1780 году из-за смрада; кости вывозят в Катакомбы ночами 1786–1788 годов.", "Кладбище Невинных"),
    ("death", "cemetery", O, "Катакомбы (застава Анфер)", "Catacombes, barrière d'Enfer", "Catacombes de Paris",
     "Старые каменоломни, освящённые как оссуарий в 1786 году; вход у заставы Анфер.", "Парижские катакомбы"),
    ("death", "cemetery", R, "Кладбище Мадлен", "Cimetière de la Madeleine", "Chapelle expiatoire, Paris",
     "Приходское кладбище на улице Анжу.", "Кладбище Мадлен"),
    ("death", "cemetery", L, "Кладбище Вожирар", "Cimetière de Vaugirard", "Boulevard de Vaugirard, Paris",
     "Новое кладбище левого берега (1784).", "Кладбище Вожирар"),
    ("death", "mortuary", R, "Морг Шатле", "Basse-Geôle du Châtelet", "Quai de Gesvres, Paris",
     "«Нижняя тюрьма» Шатле: сюда свозят найденные в Сене тела для опознания.", "Парижский морг"),
    # ── Рынки и мануфактуры ──
    ("markets", "market", R, "Рынок Ле-Аль", "Les Halles", "Forum des Halles, Paris",
     "«Чрево Парижа»: рыба, мясо, овощи, торговки-«дамы рынка».", "Ле-Аль"),
    ("markets", "market", R, "Хлебный рынок", "Halle au blé", "Bourse de Commerce, Paris",
     "Круглая хлебная биржа (1767) — сердце хлебных бунтов.", "Хлебный рынок (Париж)"),
    ("markets", "market", L, "Винный рынок", "Halle aux vins", "Quai Saint-Bernard, Paris",
     "Склады вина у Сены, вне пошлин застав.", "Винный рынок (Париж)"),
    ("markets", "manufacture", F, "Мануфактура Ревельона", "Folie Titon, manufacture Réveillon", "Rue de Montreuil 31, Paris",
     "Фабрика обоев в Сент-Антуанском предместье, разгромленная в апреле 1789 года.", "Бунт Ревельона"),
    ("markets", "manufacture", F, "Мануфактура Гобеленов", "Manufacture des Gobelins", "Manufacture des Gobelins, Paris",
     "Королевская ковровая мануфактура в Сен-Марсельском предместье.", "Мануфактура гобеленов"),
    # ── Заставы, мосты и предместья ──
    ("gates", "historic", O, "Застава Ла-Виллет", "Barrière de la Villette", "Rotonde de la Villette, Paris",
     "Ротонда Леду на стене Откупщиков — таможня на въезде в город; её зовут и заставой Сен-Мартен.", "Ротонда Ла-Виллет"),
    ("gates", "historic", O, "Застава Трона", "Barrière du Trône", "Place de la Nation, Paris",
     "Колонны заставы на восточном въезде; здесь в 1660 году встречали короля.", "Площадь Нации"),
    ("gates", "historic", O, "Застава Монсо", "Barrière de Monceau", "Rotonde de Monceau, Paris",
     "Ротонда Леду у парка герцога Шартрского.", "Ротонда Монсо"),
    ("gates", "bridge", I, "Новый мост", "Pont Neuf", "Pont Neuf, Paris",
     "Самый оживлённый мост: торговцы, шарлатаны, певцы, карманники.", "Новый мост (Париж)"),
    ("gates", "landmark", R, "Площадь Людовика XV", "Place Louis XV", "Place de la Concorde, Paris",
     "Королевская площадь с конной статуей; позже — площадь Революции и гильотина.", "Площадь Согласия"),
    ("gates", "faubourg", F, "Сент-Антуанское предместье", "Faubourg Saint-Antoine", "Rue du Faubourg Saint-Antoine 100, Paris",
     "Предместье ремесленников и подмастерьев — порох революции.", "Сент-Антуанское предместье"),
    ("gates", "faubourg", F, "Сен-Марсельское предместье", "Faubourg Saint-Marcel", "Rue Mouffetard, Paris",
     "Бедное предместье кожевников и красильщиков на Бьевре.", "Сен-Марсельское предместье"),
    ("gates", "castle", O, "Венсенский замок", "Château de Vincennes", "Château de Vincennes",
     "Королевский замок с донжоном-тюрьмой (здесь сидели Мирабо и де Сад).", "Венсенский замок"),
    # ── Дополнение: дворцы, бульвары и сады, учёные дома, приходы, приюты, окраины ──
    ("power", "government", R, "Арсенал", "Arsenal", "Bibliothèque de l'Arsenal, Paris",
     "Королевский арсенал у Сены; накануне 14 июля его порох перевезли в Бастилию.", "Арсенал (Париж)"),
    ("power", "palace", L, "Пале-Бурбон", "Palais Bourbon", "Palais Bourbon, Paris",
     "Дворец принцев Конде; хозяин эмигрировал в июле 1789-го.", "Бурбонский дворец"),
    ("power", "palace", L, "Люксембургский дворец", "Palais du Luxembourg", "Palais du Luxembourg, Paris",
     "Дворец графа Прованского, брата короля, — Месье.", "Люксембургский дворец"),
    ("power", "government", R, "Отель Субиз", "Hôtel de Soubise", "Hôtel de Soubise, Paris",
     "Особняк принцев Роган-Субиз в Маре.", "Отель Субиз"),
    ("clubs", "park", L, "Люксембургский сад", "Jardin du Luxembourg", "Jardin du Luxembourg, Paris",
     "Сад Месье, открытый для публики: прогулки, свидания, тайные встречи в аллеях.", "Люксембургский сад"),
    ("clubs", "park", R, "Елисейские Поля", "Champs-Élysées", "Rond-Point des Champs-Élysées, Paris",
     "Аллеи за площадью Людовика XV: днём гулянья и кабачки, ночью темнота и грабители.", "Елисейские Поля"),
    ("clubs", "nightdistrict", R, "Бульвар Тампль", "Boulevard du Temple", "Boulevard du Temple 30, Paris",
     "Главный бульвар веселья: балаганы, канатоходцы, кукольники, кафе и театры.", "Бульвар Тампль"),
    ("clubs", "museum", R, "Восковые фигуры Курциуса", "Salon de cire de Curtius", "Boulevard du Temple 8, Paris",
     "Салон доктора Курциуса, у которого учится юная Мари Гросхольц, будущая мадам Тюссо. 12 июля 1789 года толпа взяла у Курциуса бюсты Неккера и герцога Орлеанского.", "fr:Philippe Curtius"),
    ("clubs", "bar", R, "Кафе слепых", "Café des Aveugles", "Galerie de Valois, Paris",
     "Погребок в галереях Пале-Рояля, где играет оркестр слепых музыкантов.", "fr:Café des Aveugles"),
    ("clubs", "park", O, "Парк Монсо", "Folie de Chartres", "Parc Monceau, Paris",
     "«Безумие Шартра» — сад герцога Шартрского с искусственными руинами, мельницей и пагодами.", "Парк Монсо"),
    ("clubs", "bar", O, "Кабаки Куртий", "La Courtille", "Rue de Belleville 1, Paris",
     "Кабаки за заставой Бельвиль: вино без городских пошлин, гулянья простонародья.", "fr:La Courtille"),
    ("theatres", "theatre", R, "Амбигю-Комик", "Ambigu-Comique", "Boulevard du Temple 50, Paris",
     "Театр пантомим и драм Одино на бульваре Тампль.", "fr:Théâtre de l'Ambigu-Comique"),
    ("theatres", "theatre", R, "Театр Николе", "Grands-Danseurs du Roi", "Boulevard du Temple 42, Paris",
     "Балаган Николе — «Большие танцоры короля»: акробаты, обезьяна Тюрко, фарсы.", "fr:Théâtre de la Gaîté (boulevard du Temple)"),
    ("theatres", "theatre", R, "Цирк Астли", "Amphithéâtre Astley", "Rue du Faubourg du Temple 16, Paris",
     "Конный цирк англичанина Астли (1783).", "fr:Amphithéâtre Astley"),
    ("theatres", "museum", L, "Коллеж Четырёх наций", "Collège des Quatre-Nations", "Institut de France, Paris",
     "Коллеж Мазарини и Мазаринская библиотека, открытая для публики.", "Институт Франции"),
    ("theatres", "museum", L, "Коллеж Людовика Великого", "Collège Louis-le-Grand", "Lycée Louis-le-Grand, Paris",
     "Здесь учились Робеспьер и Демулен.", "Лицей Людовика Великого"),
    ("theatres", "museum", L, "Академия хирургии", "Académie royale de chirurgie", "Rue de l'École de Médecine 12, Paris",
     "Королевская школа хирургии (1775) с анатомическим амфитеатром.", "fr:Académie royale de chirurgie"),
    ("churches", "church", L, "Сент-Этьен-дю-Мон", "Saint-Étienne-du-Mont", "Église Saint-Étienne-du-Mont, Paris",
     "Приход на горе Святой Женевьевы, рядом с её гробницей.", "Сент-Этьен-дю-Мон"),
    ("churches", "church", L, "Сен-Северен", "Saint-Séverin", "Église Saint-Séverin, Paris",
     "Приход Латинского квартала.", "Сен-Северен"),
    ("churches", "church", R, "Сен-Мерри", "Saint-Merri", "Église Saint-Merri, Paris",
     "Приход улицы Сен-Мартен.", "Сен-Мерри"),
    ("churches", "church", R, "Сен-Жерве", "Saint-Gervais", "Église Saint-Gervais-Saint-Protais, Paris",
     "Приход за Ратушей, с органом Куперенов.", "Сен-Жерве-Сен-Проте"),
    ("churches", "church", R, "Сен-Никола-де-Шан", "Saint-Nicolas-des-Champs", "Église Saint-Nicolas-des-Champs, Paris",
     "Приход у приората Сен-Мартен-де-Шан.", "Сен-Никола-де-Шан"),
    ("churches", "church", R, "Нотр-Дам-де-Виктуар", "Notre-Dame-des-Victoires", "Basilique Notre-Dame-des-Victoires, Paris",
     "Церковь августинцев — «Малых отцов».", "Нотр-Дам-де-Виктуар"),
    ("churches", "church", L, "Сен-Тома-Аквинский", "Saint-Thomas-d'Aquin", "Église Saint-Thomas-d'Aquin, Paris",
     "Церковь доминиканского новициата в Сен-Жерменском предместье.", "Сен-Тома-д’Акен"),
    ("churches", "church", F, "Сен-Медар", "Saint-Médard", "Église Saint-Médard, Paris",
     "Приход Сен-Марсельского предместья; на его кладбище в 1730-х бились в судорогах янсенисты-конвульсионеры.", "Сен-Медар (церковь)"),
    ("churches", "church", I, "Сен-Луи-ан-л’Иль", "Saint-Louis-en-l'Île", "Église Saint-Louis-en-l'Île, Paris",
     "Приход острова Сен-Луи.", "Сен-Луи-ан-л’Иль"),
    ("churches", "church", F, "Сент-Маргерит", "Sainte-Marguerite", "Église Sainte-Marguerite, Paris",
     "Приход Сент-Антуанского предместья.", "Сент-Маргерит (Париж)"),
    ("churches", "church", F, "Сен-Лоран", "Saint-Laurent", "Église Saint-Laurent, Paris",
     "Приход предместья Сен-Мартен, у Сен-Лоранской ярмарки.", "Сен-Лоран (церковь, Париж)"),
    ("churches", "church", L, "Монастырь кармелитов", "Couvent des Carmes", "Église Saint-Joseph-des-Carmes, Paris",
     "Обитель босых кармелитов на улице Вожирар.", "Сен-Жозеф-де-Карм"),
    ("hospitals", "hospital", F, "Больница Сен-Луи", "Hôpital Saint-Louis", "Hôpital Saint-Louis, Paris",
     "Чумной госпиталь Генриха IV за предместьем Сен-Мартен.", "Больница Святого Людовика"),
    ("hospitals", "hospital", L, "Питье", "Hôpital de la Pitié", "Grande Mosquée de Paris",
     "Приют для сирот у Королевского сада (ныне на его месте Большая мечеть).", "fr:Hôpital de la Pitié"),
    ("hospitals", "hospital", F, "Больница Неккер", "Hospice Necker", "Hôpital Necker, Paris",
     "Больница, основанная госпожой Неккер в 1778 году.", "Больница Неккер"),
    ("hospitals", "hospital", F, "Больница Кошен", "Hospice Cochin", "Hôpital Cochin, Paris",
     "Больница аббата Кошена (1780) в Сен-Жакском предместье.", "fr:Hôpital Cochin"),
    ("hospitals", "hospital", L, "Неизлечимые", "Hospice des Incurables", "Rue de Sèvres 42, Paris",
     "Приют для неизлечимых больных на улице Севр.", "fr:Hôpital Laennec"),
    ("hospitals", "hospital", L, "Маленькие домики", "Petites-Maisons", "Square Boucicaut, Paris",
     "Приют для безумных, стариков и больных дурной болезнью.", "fr:Hospice des Petites-Maisons"),
    ("death", "gibbet", O, "Виселица Монфокон", "Gibet de Montfaucon", "Rue de la Grange aux Belles 53, Paris",
     "Старая королевская виселица на холме за предместьем Сен-Мартен; давно заброшена, рядом живодёрни и свалка нечистот.", "Монфокон (виселица)"),
    ("death", "cemetery", F, "Кладбище Кламар", "Cimetière de Clamart", "Rue du Fer à Moulin 17, Paris",
     "Кладбище бедняков из Отель-Дьё; отсюда анатомы ночами крадут тела.", "fr:Cimetière de Clamart"),
    ("markets", "market", L, "Ярмарка Сен-Жермен", "Foire Saint-Germain", "Marché Saint-Germain, Paris",
     "Ярмарочные ряды аббатства: игорные лавки, балаганы, зверинцы.", "fr:Foire Saint-Germain"),
    ("markets", "market", I, "Новый рынок", "Marché-Neuf", "Quai du Marché Neuf, Paris",
     "Рыбный рынок на Сите у моста Сен-Мишель.", "fr:Marché-Neuf"),
    ("markets", "market", R, "Хлебная пристань", "Port au blé", "Quai de l'Hôtel de Ville, Paris",
     "Пристань у Гревской площади: хлеб, вино, дрова; грузчики и лодочники.", "fr:Port au blé"),
    ("markets", "market", F, "Конский рынок", "Marché aux chevaux", "Rue Poliveau, Paris",
     "Конская ярмарка Сен-Марсельского предместья.", "fr:Marché aux chevaux de Paris"),
    ("markets", "manufacture", F, "Зеркальная мануфактура", "Manufacture des glaces", "Rue de Reuilly 24, Paris",
     "Королевская мануфактура зеркал в Сент-Антуанском предместье.", "fr:Manufacture royale de glaces de miroirs"),
    ("gates", "landmark", I, "Площадь Дофина", "Place Dauphine", "Place Dauphine, Paris",
     "Треугольная площадь на Сите, за статуей Генриха IV.", "Площадь Дофина"),
    ("gates", "landmark", R, "Самаритянка", "La Samaritaine", "La Samaritaine, Paris",
     "Водокачка с курантами у Нового моста.", "fr:Pompe de la Samaritaine"),
    ("gates", "historic", O, "Застава Звезды", "Barrière de l'Étoile", "Place Charles de Gaulle, Paris",
     "Застава на дороге в Нёйи.", "fr:Barrière de l'Étoile"),
    ("gates", "historic", O, "Застава Фонтенбло", "Barrière de Fontainebleau", "Place d'Italie, Paris",
     "Южная застава на дороге в Фонтенбло и Италию.", "Площадь Италии"),
    ("gates", "historic", O, "Застава Клиши", "Barrière de Clichy", "Place de Clichy, Paris",
     "Северо-западная застава у дороги в Клиши.", "Площадь Клиши"),
    ("gates", "mill", O, "Мельницы Монмартра", "Moulins de Montmartre", "Moulin de la Galette, Paris",
     "Ветряные мельницы на холме за стеной Откупщиков.", "Мулен-де-ла-Галетт"),
    ("gates", "landmark", I, "Остров Лувье", "Île Louviers", "Boulevard Morland, Paris",
     "Остров лесных складов выше по течению от Сен-Луи (с 1843 года слит с берегом).", "Остров Лувье"),
    # ── Места хроники «Liberté» (журналы мира; вымышленные — с примерной точкой) ──
    ("liberte", "battle", F, "Монастырь Святого Иакова", "Couvent Saint-Jacques", "@48.84020,2.34100",
     "Заброшенная после национализации обитель в Фобуре Сен-Жак — логово банды «Монастырских братьев»: арсенал в трапезной, пленники в крипте.", ""),
    ("liberte", "battle", L, "Логово «Красных Жуков»", "Tannerie de la rue Mouffetard", "@48.84080,2.34970",
     "Брошенная кожевня на улице Муфтар: банда «Красных Жуков», склад краденого и выход в коллектор.", ""),
    ("liberte", "press", L, "Типография «Друг народа»", "Imprimerie de L'Ami du peuple", "@48.85140,2.33980",
     "Станки Марата у Кордельеров: «Друга народа» печатают по ночам и прячут от полиции Лафайета.", "Друг народа"),
    ("liberte", "stash", R, "Банк «Дом Делормэ»", "Maison Delormé", "@48.86780,2.33980",
     "Банкирский дом у улицы Вивьен: векселя эмигрантов, ассигнаты и золото тех, кто бежит из Франции.", ""),
    ("liberte", "catacomb", F, "Гипсовые карьеры Монмартра", "Carrières de gypse de Montmartre", "@48.88720,2.33920",
     "Выработки гипса под холмом. Здесь принесена «Клятва Катакомб»; монтаньяры уходят сюда, когда в городе горячо.", ""),
    ("liberte", "church", R, "Монастырь Дочерей Божьих", "Couvent des Filles-Dieu", "@48.86880,2.35000",
     "Обитель на улице Сен-Дени у ворот Сен-Дени; монахини доживают последние месяцы перед закрытием.", ""),
    ("liberte", "church", F, "Монастырь реколлетов", "Couvent des Récollets", "@48.87634,2.36011",
     "Францисканская обитель в предместье Сен-Мартен. Закрыта декретом, но несколько монахов не ушли; в саду растёт Белладонна Бессмертия.", ""),
    ("liberte", "church", R, "Монастырь капуцинов", "Couvent des Capucins Saint-Honoré", "@48.86843,2.32978",
     "Обитель на улице Сен-Оноре. В октябре 1790-го монтаньяры вырезали здесь епископа — гуля де Грамона: «Резня у Капуцинов».", ""),
    ("liberte", "club", R, "Монастырь фельянов", "Couvent des Feuillants", "@48.86570,2.32830",
     "Обитель у Манежа; летом 1791-го здесь откроется клуб конституционалистов-фельянов.", "Клуб фельянов"),
    ("liberte", "hospital", I, "Приют подкидышей", "Hospice des Enfants-Trouvés", "@48.85360,2.34780",
     "Приют на паперти Нотр-Дама: сюда приносят младенцев, которых некому кормить. Половина не доживает до года.", ""),
    ("liberte", "hospital", F, "Дом Святого Винсента", "Maison des Filles de la Charité", "@48.87830,2.35480",
     "Дом сестёр милосердия Викентия де Поля в предместье Сен-Дени, напротив Сен-Лазара.", ""),
    ("liberte", "government", R, "Главная почта", "Hôtel des Postes", "@48.86441,2.34274",
     "Почтовое управление на улице Платриер: письма всей Франции — и чужие тайны в них.", ""),
    ("liberte", "manufacture", F, "Красильня «У Красного Жака»", "Teinturerie Au Jacques-Rouge", "@48.83670,2.35190",
     "Красильная мастерская на Бьевре в Сен-Марселе: вода реки ниже по течению красная.", ""),
    ("liberte", "manufacture", F, "Стекольная мануфактура Сент-Обен", "Verrerie Saint-Aubin", "@48.88100,2.34650",
     "Стекольная мануфактура у подножия Монмартра: жар печей, ночное зарево, рабочие в три смены.", ""),
    ("liberte", "historic", R, "Королевская площадь", "Place Royale", "@48.85560,2.36550",
     "Площадь Людовика XIII в Маре — былое величие старой знати; вокруг пустеют особняки эмигрантов.", "Площадь Вогезов"),
]


def nominatim(q, cache):
    # «@широта,долгота» — место, которого больше нет, ставится по самой гравюре
    if q.startswith("@"):
        lat, lon = q[1:].split(",")
        return {"lat": lat, "lon": lon, "display_name": "по плану 1790 года"}
    if q in cache: return cache[q]
    bounded = "Paris" in q and "Kremlin" not in q
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": q, "format": "jsonv2", "limit": 1, "accept-language": "fr", **({"viewbox": PARIS_BOX, "bounded": 1} if bounded else {})})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        hits = json.loads(r.read().decode("utf-8"))
    time.sleep(1.1)   # правила Nominatim: не чаще раза в секунду
    cache[q] = hits[0] if hits else None
    return cache[q]


def main():
    cache = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
    folders = {f[0]: {"id": f[0], "name": f[1], "cat": f[2], "visible": f[3], "markers": []} for f in FOLDERS}
    missing = []
    try:
        for i, (fid, kind, dist, ru, fr, q, note, wiki) in enumerate(PLACES):
            hit = nominatim(q, cache)
            if not hit:
                missing.append(q); continue
            folders[fid]["markers"].append({
                "id": f"p{i:03d}", "lat": round(float(hit["lat"]), 6), "lng": round(float(hit["lon"]), 6),
                "k": kind, "d": dist, "ru": ru, "fr": fr, "en": fr, "text": note, **({"wiki": wiki if ":" in wiki else f"ru:{wiki}"} if wiki else {}),
            })
            print(f"{ru:40} {hit['lat'][:8]},{hit['lon'][:7]}  {hit.get('display_name', '')[:70]}")
    finally:
        json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    if missing: print("НЕ НАЙДЕНО:", missing)
    data = {
        "id": "paris-1789", "name": "Париж", "nameEn": "Paris", "center": [48.8556, 2.3480], "zoom": 14,
        "source": "OpenStreetMap (ODbL)", "built": time.strftime("%Y-%m-%d"),
        "districts": {d: d for d in (R, L, I, F, O)},
        "folders": list(folders.values())
    }
    os.makedirs(OUT, exist_ok=True)
    json.dump(data, open(os.path.join(OUT, "paris-1789.json"), "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
    idx_p = os.path.join(OUT, "index.json")
    idx = json.load(open(idx_p, encoding="utf-8")) if os.path.exists(idx_p) else []
    idx = [c for c in idx if c["id"] != "paris-1789"] + [{
        "id": "paris-1789", "name": "Париж (1789)", "nameEn": "Paris (1789)", "center": data["center"], "zoom": data["zoom"],
        "file": "paris-1789.json", "count": sum(len(f["markers"]) for f in data["folders"])
    }]
    json.dump(idx, open(idx_p, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=1)
    print(f"data/cities/paris-1789.json: {data['folders'] and sum(len(f['markers']) for f in data['folders'])} мест")


main()
