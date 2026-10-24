// module/data/revenants.mjs
// Семейства ревенантов (Ghouls & Revenants, V20, гл. 3): семейные Дисциплины и изъян рода — пересказ механики.
// Ключ хранится в system.family гуля с типом «ревенант»; незнакомое значение показывается как своё семейство.

export const REVENANT_FAMILIES = {
  bratovich: { name: "Братовичи", en: "Bratovich", nick: "обедневшие развратники", disciplines: ["animalism", "fortitude", "vicissitude"],
    flaw: "Сложность сопротивления Срыву +2; Силу воли нельзя тратить, чтобы не допустить Срыв, — только чтобы прервать уже начавшийся." },
  dhabi: { name: "Д'Хаби", en: "D'Habi", nick: "вечные страдальцы", disciplines: ["presence", "obfuscate", "daimoinon"],
    flaw: "+2 к сложности всех проверок Силы воли." },
  ducheski: { name: "Духески", en: "Ducheski", nick: "одержимые изобретатели", disciplines: ["auspex", "dominate", "thaumaturgy"],
    flaw: "Ни одна социальная Способность не может быть выше 2." },
  enrathi: { name: "Энрати", en: "Enrathi", nick: "омерзительные работорговцы", disciplines: ["dominate", "obfuscate", "potence"],
    flaw: "Человечность не выше 3, Совесть не выше 2; все члены семьи следуют Пути Просветления." },
  grimaldi: { name: "Гримальди", en: "Grimaldi", nick: "скрытные бунтари", disciplines: ["celerity", "dominate", "fortitude"],
    flaw: "Убеждённость в превосходстве семьи: чтобы не похвастаться Гримальди или не унизить другие семьи Шабаша, нужна проверка Силы воли (сл. 7)." },
  kairouan: { name: "Братство Кайруана", en: "Kairouan Brotherhood", nick: "раздробленная семья", disciplines: ["auspex", "celerity", "obfuscate"],
    flaw: "Медленное заживление (как одноимённый недостаток)." },
  obertus: { name: "Оберту", en: "Obertus", nick: "замкнутые учёные", disciplines: ["auspex", "obfuscate", "vicissitude"],
    flaw: "Обсессивно-компульсивное расстройство; у подлинии Наровых — мания величия." },
  oprichniki: { name: "Опричники", en: "Oprichniki", nick: "жадные наёмники", disciplines: ["animalism", "obfuscate", "potence"],
    flaw: "Преследуемый призраком: за персонажем ходит по меньшей мере один дух — часть хроники, а не просто штраф." },
  rafastio: { name: "Рафастио", en: "Rafastio", nick: "гордые ведьмы", disciplines: ["animalism", "auspex", "thaumaturgy"],
    flaw: "Лунный изъян: в новолуние сложность Дисциплин +2, на растущей и убывающей луне +1, в полнолуние −1. Обратить Рафастио в вампира невозможно." },
  rossellini: { name: "Росселлини", en: "Rossellini", nick: "маленькие братья", disciplines: ["dominate", "fortitude", "necromancy"],
    flaw: "Взгляд смерти: +2 к сложности проверок Восприятия и +1 к социальным проверкам; −2 к сложности сопротивления воздействию через Привлекательность." },
  anushinRawan: { name: "Слуги Анушин-Раван", en: "Servants of Anushin-Rawan", nick: "Избранные", disciplines: ["auspex", "obfuscate", "presence"],
    flaw: "Любой потомок Анушин-Раван вызывает подчинение, похожее на Кровавые узы (с первым встреченным); длится 10 ночей минус Сила воли." },
  zantosa: { name: "Зантоза", en: "Zantosa", nick: "мелкие гедонисты", disciplines: ["auspex", "presence", "vicissitude"],
    flaw: "Нельзя тратить Силу воли, чтобы противиться сверхъестественным соблазнам удовольствия, даже опасным." }
};

export const revenantFamily = key => REVENANT_FAMILIES[key] ?? null;
