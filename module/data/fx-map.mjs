// module/data/fx-map.mjs
// Анимации и звуки к силам, ритуалам, Граням и срывам (apps/fx.mjs). Сами файлы — из платных паков (JB2A Patreon, Boss Loot BLFX,
// PSFX Patreon): их лицензии запрещают выкладывать файлы в открытый доступ, поэтому в систему они не входят. tools/fx_extract.mjs
// копирует из купленной копии только перечисленное здесь (≈50 МБ вместо 22 ГБ) в данные Foundry: assets/vtm20-fx/anim/<тема>.webm
// и sound/<тема>.ogg. Свою тему можно заменить своим файлом с тем же именем.
//   at: self — на персонаже; target — на цели (без цели — на персонаже); ray — луч к цели (без цели — только звук); ground — под ногами.

export const FX_THEMES = {
  blood: { at: "self", scale: 1.6, anim: "blfx-assets-pack/artwork/08-misc/droplet/Blood_1_Bubbles_1_1200x1200.webm", sound: "blfx-assets-pack/sounds/pack8/blfx-impact-liquid-1.ogg" },
  bloodHeal: { at: "self", scale: 1.5, anim: "jb2a_patreon/Library/Generic/Healing/HealingAbility_01_Red_200x200.webm", sound: "blfx-assets-pack/sounds/pack1/blfx_cure_magic_1.ogg" },
  bloodAgony: { at: "target", scale: 1.6, anim: "blfx-assets-pack/artwork/05-spell/homebrew/shock/Blood_1_Splatter_1_1200x1200.webm", sound: "blfx-assets-pack/sounds/pack1/blfx_Inflict_Wounds_1.ogg" },
  feed: { at: "target", scale: 1.2, anim: "jb2a_patreon/Library/Generic/Creature/Bite_01_Regular_Red_200x200.webm", sound: "blfx-assets-pack/sounds/pack6/blfx_bite_1.ogg" },
  darkness: { at: "self", scale: 3.0, anim: "jb2a_patreon/Library/2nd_Level/Darkness/Darkness_01_Black_600x600.webm", sound: "blfx-assets-pack/sounds/pack1/blfx_darkness_spell_1.ogg" },
  tentacles: { at: "target", scale: 2.4, anim: "jb2a_patreon/Library/4th_Level/Black_Tentacles/BlackTentacles_01_Dark_Red_600x600.webm", sound: "blfx-assets-pack/sounds/pack1/blfx_darkness_spell_1.ogg" },
  shadowForm: { at: "self", scale: 1.8, anim: "jb2a_patreon/Library/Generic/Smoke/Fumes04_01_Black_Complete_400x600.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/weapon-swooshes/necrotic/v1/group01/meleeattack-swoosh-magicaleffect-group01-necrotic-00.ogg" },
  vanish: { at: "self", scale: 1.6, anim: "jb2a_patreon/Library/Generic/Smoke/SmokePuff01_02_Dark_Black_400x400.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/2nd-level-spells/misty-step/v1/complete/misty-step-complete-generic-001.ogg" },
  eyes: { at: "self", scale: 1.5, anim: "jb2a_patreon/Library/Generic/Eyes/Eyes_Few01_03_Dark_Red_600x600.webm", sound: "blfx-assets-pack/sounds/pack1/blfx_detect_magic_1.ogg" },
  aura: { at: "self", scale: 1.6, anim: "blfx-assets-pack/artwork/08-misc/enchantment/Enchantment_12_See_Invisibility_1_Eye_COLOR_1_1200x1200.webm", sound: "blfx-assets-pack/sounds/pack1/blfx_detect_magic_2.ogg" },
  gaze: { at: "target", scale: 1.3, anim: "jb2a_patreon/Library/Generic/Eyes/Eyes_Single01_02_Dark_Red_300x300.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/weapon-swooshes/psychic/v1/group01/meleeattack-swoosh-magicaleffect-group01-psychic-00.ogg" },
  command: { at: "ray", scale: 1, anim: "blfx-assets-pack/artwork/05-spell/homebrew/beam/Range_Intro_Beam_Hypnotic_Purple_01_30ft_1600x400.webm", sound: "psfx v0.18.0/psfx-0.18.0/library/1st-level-spells/dissonant-whispers/v1/001/dissonant-whispers-001-03.ogg" },
  mindRead: { at: "self", scale: 1.6, anim: "blfx-assets-pack/artwork/05-spell/cast/Cast_Eye_1_COLOR_1_1200x1200.webm", sound: "psfx v0.18.0/psfx-0.18.0/library/cantrips/mind-sliver/v1/mind-sliver-001.ogg" },
  charm: { at: "self", scale: 1.8, anim: "blfx-assets-pack/artwork/08-misc/enchantment/Enchantment_5_Heart_Rays_1_COLOR_6_1200x1200.webm", sound: "blfx-assets-pack/sounds/pack1/blfx_charm_person_spell_1.ogg" },
  awe: { at: "self", scale: 1.6, anim: "jb2a_patreon/Library/Generic/Conditions/Boon01/ConditionBoon01_001_Red_600x600.webm", sound: "blfx-assets-pack/sounds/pack1/blfx_charm_person_spell_3.ogg" },
  fear: { at: "target", scale: 1.6, anim: "jb2a_patreon/Library/Generic/Marker/MarkerFear_01_Dark_Red_400x400.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/cantrips/toll-the-dead/v1/rasping-whispers-001.ogg" },
  madness: { at: "target", scale: 1.3, anim: "jb2a_patreon/Library/Generic/Conditions/Dizzy_Stars/DizzyStars_01_Purple_200x200.webm", sound: "psfx v0.18.0/psfx-0.18.0/library/1st-level-spells/hideous-laughter/v1/laughs/fem/01/pitch-down/fem-01-pitch-down-001.ogg" },
  illusion: { at: "self", scale: 1.4, anim: "jb2a_patreon/Library/Generic/Magic_Signs/Runes/IllusionRuneComplete_01_Regular_Purple_400x400.webm", sound: "blfx-assets-pack/sounds/pack8/blfx-prestidigitation-1.ogg" },
  sleep: { at: "target", scale: 1.4, anim: "blfx-assets-pack/artwork/08-misc/enchantment/Enchantment_8_Sleep_1_LOOP_COLOR_1_1200x1200.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/1st-level-spells/sleep/v1/sleep-v1-001.ogg" },
  speed: { at: "self", scale: 1.6, anim: "jb2a_patreon/Library/Generic/Wind/WindLines01_02_Regular_White_500x500.webm", sound: "blfx-assets-pack/sounds/pack3/blfx_nimble_escape_soft_movement_whoosh_1.ogg" },
  strength: { at: "self", scale: 1.8, anim: "jb2a_patreon/Library/Generic/Impact/GroundCrackImpact_01_Regular_Orange_600x600.webm", sound: "blfx-assets-pack/sounds/pack4/blfx_melee_slam_attack_metal_1.ogg" },
  toughness: { at: "self", scale: 1.6, anim: "jb2a_patreon/Library/1st_Level/Shield/Shield_01_Regular_Red_OutroFade_400x400.webm", sound: "blfx-assets-pack/sounds/pack1/blfx_mage_armor_spell_1.ogg" },
  claws: { at: "self", scale: 1.2, anim: "jb2a_patreon/Library/Generic/Creature/Claws_01_Regular_Red_200x200.webm", sound: "blfx-assets-pack/sounds/pack2/blfx_bone_cracking_1.ogg" },
  shift: { at: "self", scale: 1.8, anim: "blfx-assets-pack/artwork/08-misc/puff-smoke-dust-mist/Puff_Smoke_Dust_2_Center_1_COLOR_1_1200x1200.webm", sound: "blfx-assets-pack/sounds/pack2/blfx_bone_cracking_3.ogg" },
  mist: { at: "self", scale: 2.2, anim: "blfx-assets-pack/artwork/05-spell/template/circle/Smoke_1_Mist_1_Storm_1_RADIUS_COLOR_1_1200x1200.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/2nd-level-spells/misty-step/v1/complete/misty-step-complete-air-001.ogg" },
  earthMeld: { at: "self", scale: 1.6, anim: "jb2a_patreon/Library/Generic/Creature/BurrowOut01_01_Regular_Brown_600x600.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/creature/movement/burrow/001/burrow-breach-001-03.ogg" },
  flesh: { at: "target", scale: 1.4, anim: "blfx-assets-pack/artwork/06-ability/claw/Claw_1_ON_TARGET_COLOR_1_1200x1200.webm", sound: "blfx-assets-pack/sounds/pack2/blfx_bone_cracking_5.ogg" },
  wings: { at: "self", scale: 2.2, anim: "blfx-assets-pack/artwork/06-ability/wings/Wings_1_FADE_IN_OUT_COLOR_4_1200x1200.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/creature/movement/flight/wings/beating-wings-large-001.ogg" },
  beast: { at: "self", scale: 1.6, anim: "blfx-assets-pack/artwork/08-misc/enchantment/Enchantment_9_Speak_With_Animals_1_COLOR_1_1200x1200.webm", sound: "blfx-assets-pack/sounds/pack1/blfx_speak_with_animals_1.ogg" },
  bats: { at: "self", scale: 2.4, anim: "jb2a_patreon/Library/Generic/Creature/BatsLoop01_01_Regular_Red_600x600.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/creature/movement/flight/wings/beating-wings-small-001.ogg" },
  nature: { at: "self", scale: 2.0, anim: "jb2a_patreon/Library/1st_Level/Entangle/EntangleLoop02_02_Regular_Green_500x500.webm", sound: "blfx-assets-pack/sounds/pack8/blfx-leaves-roots-earth-1.ogg" },
  fae: { at: "self", scale: 1.8, anim: "jb2a_patreon/Library/Generic/Creature/FairiesOutwardBurst01_01_Regular_White_400x400.webm", sound: "blfx-assets-pack/sounds/pack8/blfx-dancing-lights-1.ogg" },
  death: { at: "target", scale: 1.4, anim: "jb2a_patreon/Library/Cantrip/Toll_The_Dead/TollTheDeadSkullSmoke_01_Regular_Grey_400x400.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/cantrips/toll-the-dead/v1/toll-the-dead-001.ogg" },
  ghosts: { at: "self", scale: 2.6, anim: "jb2a_patreon/Library/3rd_Level/Spirit_Guardians/SpiritGuardiansSpirits_01_Dark_Black_600x600.webm", sound: "blfx-assets-pack/sounds/pack8/blfx-summon-undead-complete-1.ogg" },
  decay: { at: "target", scale: 1.6, anim: "jb2a_patreon/Library/Generic/Smoke/Fumes_03_Toxic_Green_400x400.webm", sound: "blfx-assets-pack/sounds/pack1/blfx_rot_1.ogg" },
  poison: { at: "target", scale: 1.4, anim: "blfx-assets-pack/artwork/05-spell/template/circle/Dust_Puff_Poison_Gas_Smoke_1_CIRCLE_RADIUS_COLOR_1_1200x1200.webm", sound: "psfx v0.18.0/psfx-0.18.0/library/cantrips/poison-spray/v1/poison-spray-001.ogg" },
  runes: { at: "ground", scale: 2.0, anim: "jb2a_patreon/Library/Generic/Magic_Signs/Runes/ConjurationRuneComplete_01_Regular_Red_400x400.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/magic-signs/runes/v1/conjuration-magic-sign-rune-intro.ogg" },
  necroRunes: { at: "ground", scale: 2.0, anim: "jb2a_patreon/Library/Generic/Magic_Signs/Runes/NecromancyRuneComplete_01_Regular_Green_400x400.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/cantrips/toll-the-dead/v1/ominous-bell-001.ogg" },
  infernal: { at: "ground", scale: 2.2, anim: "jb2a_patreon/Library/Generic/Magic_Signs/Runes/NecromancyRuneComplete_01_Regular_Red_400x400.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/incantations/masculine/001/demonic/summon/incantation-masculine001-demonic-summon-002.ogg" },
  curse: { at: "target", scale: 1.6, anim: "blfx-assets-pack/artwork/05-spell/homebrew/curse/Curse_Eldritch_Hex_2_Loop_COLOR_1_1200x1200.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/incantations/feminine/001/demonic/harm/incantation-feminine001-demonic-harm-007.ogg" },
  ward: { at: "ground", scale: 2.0, anim: "jb2a_patreon/Library/Generic/Magic_Signs/Runes/AbjurationRuneComplete_01_Regular_Red_400x400.webm", sound: "blfx-assets-pack/sounds/pack8/blfx-resistance-spell-1.ogg" },
  time: { at: "self", scale: 1.8, anim: "blfx-assets-pack/artwork/05-spell/cast/Slow_1_Clock_1_CAST_COLOR_1_1200x1200.webm", sound: "blfx-assets-pack/sounds/pack1/blfx_ultimate_attack_warp_swhoosh_1.ogg" },
  song: { at: "self", scale: 1.6, anim: "jb2a_patreon/Library/Generic/Music_Notation/BeamedQuavers_01_Regular_Green_200x200.webm", sound: "blfx-assets-pack/sounds/pack2/blfx_violin_melodic_1.ogg" },
  fire: { at: "ray", scale: 1, anim: "jb2a_patreon/Library/Cantrip/Fire_Bolt/FireBolt_01_Regular_Orange_30ft_1600x400.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/cantrips/fire-bolt/v1/fire-bolt-001-30ft.ogg" },
  flame: { at: "target", scale: 1.6, anim: "jb2a_patreon/Library/Generic/Fire/Eruption_01_Regular_Orange_600x600.webm", sound: "blfx-assets-pack/sounds/pack8/blfx-fire-ignite-1.ogg" },
  storm: { at: "target", scale: 1.8, anim: "jb2a_patreon/Library/Generic/Lightning/LightningStrike01_04_Regular_Yellow_800x800.webm", sound: "blfx-assets-pack/sounds/pack4/blfx_electric_lightning_bolt_2.ogg" },
  wind: { at: "self", scale: 2.0, anim: "jb2a_patreon/Library/Generic/Wind/WindLinesLeaves01_02_Regular_Pink_500x500.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/cantrips/gust/v1/gust-001.ogg" },
  earth: { at: "target", scale: 1.8, anim: "jb2a_patreon/Library/Generic/Impact/GroundCrackImpact_02_Regular_Orange_600x600.webm", sound: "blfx-assets-pack/sounds/pack8/blfx-leaves-roots-earth-2.ogg" },
  water: { at: "target", scale: 1.6, anim: "jb2a_patreon/Library/Generic/Liquid/LiquidSplash01_Dark_Black_400x400.webm", sound: "blfx-assets-pack/sounds/pack8/blfx-impact-liquid-3.ogg" },
  portal: { at: "self", scale: 2.0, anim: "jb2a_patreon/Library/Generic/Portals/Portal_Vortex_Black_H_400x400.webm", sound: "blfx-assets-pack/sounds/pack8/blfx-summon-teleport-conjure-1.ogg" },
  gravity: { at: "self", scale: 2.0, anim: "blfx-assets-pack/artwork/05-spell/cast/Blink_1_Gravity_CIRCLE_RADIUS_COLOR_1_1200x1200.webm", sound: "blfx-assets-pack/sounds/pack1/blfx_thunderwave_spell_1.ogg" },
  forge: { at: "self", scale: 1.6, anim: "blfx-assets-pack/artwork/05-spell/impact/Magic_Sparks_1_Impact_COLOR_1_1200x1200.webm", sound: "blfx-assets-pack/sounds/pack4/blfx_melee_slam_attack_metal_2.ogg" },
  disguise: { at: "self", scale: 1.6, anim: "blfx-assets-pack/artwork/08-misc/enchantment/Enchantment_6_Disguise_1_COLOR_1_1200x1200.webm", sound: "blfx-assets-pack/sounds/pack8/blfx-prestidigitation-1.ogg" },
  radiant: { at: "target", scale: 1.6, anim: "jb2a_patreon/Library/Cantrip/Sacred_Flame/SacredFlameTarget_01_Regular_Yellow_400x400.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/cantrips/sacred-flame/v1/sacred-flame-target-01.ogg" },
  holyLight: { at: "self", scale: 1.8, anim: "blfx-assets-pack/artwork/05-spell/cast/Holy_Light_1_IMPACT_CAST_COLOR_7_1200x1200.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/cantrips/sacred-flame/v1/sacred-flame-caster-01.ogg" },
  smite: { at: "self", scale: 1.8, anim: "jb2a_patreon/Library/2nd_Level/Divine_Smite/DivineSmite_01_Regular_BlueYellow_Caster_400x400.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/class-features/divine-smite/v1/divine-smite-caster-01.ogg" },
  heal: { at: "self", scale: 1.5, anim: "jb2a_patreon/Library/Generic/Healing/HealingAbility_01_Green_200x200.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/1st-level-spells/cure-wounds/v1/cure-wounds-00.ogg" },
  shield: { at: "self", scale: 1.6, anim: "jb2a_patreon/Library/1st_Level/Shield/Shield_01_Regular_Blue_OutroFade_400x400.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/1st-level-spells/shield-spell/v3/shield-spell-v3-intro-05.ogg" },
  vision: { at: "self", scale: 1.6, anim: "jb2a_patreon/Library/Generic/Magic_Signs/Runes/DivinationRuneComplete_01_Regular_Yellow_400x400.webm", sound: "blfx-assets-pack/sounds/pack1/blfx_detect_magic_3.ogg" },
  bless: { at: "self", scale: 1.6, anim: "jb2a_patreon/Library/1st_Level/Bless/Bless_01_Regular_Yellow_Intro_200x200.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/1st-level-spells/bless/v1/bless-v1-001.ogg" },
  prayer: { at: "self", scale: 1.6, anim: "jb2a_patreon/Library/1st_Level/Bless/Bless_01_Regular_Yellow_Intro_200x200.webm", sound: "blfx-assets-pack/sounds/pack8/blfx-bell-1.ogg" },
  demonForm: { at: "self", scale: 2.4, anim: "blfx-assets-pack/artwork/06-ability/wings/Wings_1_Burning_FADE_IN_OUT_COLOR_4_1200x1200.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/incantations/masculine/001/demonic/summon/incantation-masculine001-demonic-summon-002.ogg" },
  evocation: { at: "self", scale: 1.6, anim: "jb2a_patreon/Library/Generic/Magic_Signs/Runes/NecromancyRuneComplete_01_Regular_Red_400x400.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/incantations/masculine/002/demonic/harm/incantation-masculine002-demonic-harm-005.ogg" },
  frenzy: { at: "self", scale: 1.6, anim: "jb2a_patreon/Library/Generic/Conditions/Curse01/ConditionCurse01_001_Red_600x600.webm", sound: "blfx-assets-pack/sounds/pack2/blfx_male_vocal_charging_roaring_raging_angry_1.ogg" },
  rotschreck: { at: "self", scale: 1.6, anim: "jb2a_patreon/Library/Generic/Marker/MarkerFear_01_Dark_Red_400x400.webm", sound: "PSFX All - v14 - June 2nd 2026 - modules/psfx-patreon/library/cantrips/toll-the-dead/v1/rasping-whispers-001.ogg" }
};

/** Дисциплины: тема по уровню силы (1–5; выше — как пятый) или одна на все. */
export const FX_DISC = {
  animalism: ["beast", "bats", "gaze", "beast", "frenzy"],
  auspex: ["eyes", "aura", "vision", "mindRead", "vision"],
  celerity: "speed",
  chimerstry: "illusion",
  dementation: ["madness", "madness", "eyes", "fear", "madness"],
  dominate: ["command", "gaze", "mindRead", "command", "command"],
  fortitude: "toughness",
  obfuscate: "vanish",
  obtenebration: ["darkness", "darkness", "tentacles", "shadowForm", "shadowForm"],
  potence: "strength",
  presence: ["awe", "fear", "charm", "charm", "awe"],
  protean: ["eyes", "claws", "earthMeld", "shift", "mist"],
  quietus: ["vanish", "bloodAgony", "decay", "poison", "bloodAgony"],
  serpentis: ["gaze", "shift", "flesh", "shift", "bloodAgony"],
  vicissitude: ["disguise", "flesh", "flesh", "shift", "blood"],
  thaumaturgy: "blood",
  necromancy: "death",
  bardo: "bless",
  valeren: "heal",
  visceratika: "earth",
  daimoinon: "curse",
  koldunism: "earth",
  melpominee: "song",
  mytherceria: "fae",
  obeah: "heal",
  ogham: "runes",
  flight: "wings",
  sanguinus: "blood",
  spiritus: "nature",
  thanatosis: "decay",
  temporis: "time",
  assamiteSorcery: "blood",
  setiteSorcery: "curse",
  darkThaumaturgy: "infernal",
  mortis: "death"
};

/** Пути магии крови и Некромантии — тема по названию пути (первое совпадение). */
export const FX_PATHS = [
  [/Огн|огн|Пламен|Преисподн/, "fire"], [/Погод|Бур|Молни|Небес/, "storm"], [/Ветр/, "wind"],
  [/Нептун|Вод|Нил/, "water"], [/Земл|Стихи/, "earth"], [/Крови|кров|Нектар/, "blood"],
  [/Мысл|разум|Мановени/, "gravity"], [/Флор|Лоз|природ|Очаг/, "nature"],
  [/дух|Дух|Призрак|Склеп|Кенотаф|Дуат/, "ghosts"], [/Кост|Мертвец|Череп|Мортуус/, "death"],
  [/Пепл|Тлен|Распад|Энтроп|Гумор|Паслён|Эпидем|Сумеречн/, "decay"],
  [/проклят|Дурного глаза|Фобос|Мучен|Боли|Порч|Малефиц|Скорб/, "curse"],
  [/Защит|Хранител|Оберег/, "ward"], [/Морфе|Онейро/, "sleep"], [/Совращ|Наслажд|Оков/, "charm"],
  [/Марс|Стали/, "strength"], [/Техноман|Магией|Perdo/, "forge"], [/Воплощ|Трансмут|Алхими|Сотвор/, "runes"],
  [/Откровен|Тайного Знания|Несказан|Зловещ/, "vision"], [/[Пп]ризыв|Взятие/, "infernal"],
  [/Змея/, "gaze"], [/теней/, "darkness"], [/Движени|Быстрый/, "speed"]
];

/** Ритуалы: по школе. */
export const FX_RITUALS = {
  thaumaturgy: "runes", assamiteSorcery: "runes", setiteSorcery: "runes", necromancy: "necroRunes",
  koldunism: "earth", obtenebration: "darkness", darkThaumaturgy: "infernal"
};

/** Знания падших (Demon: The Fallen). */
export const FX_LORES = {
  fundament: "gravity", humanity: "charm", celestials: "radiant", flame: "flame", radiance: "holyLight", awakening: "heal",
  firmament: "eyes", winds: "wind", earth: "earth", paths: "portal", forge: "forge", patterns: "vision", portals: "portal",
  light: "radiant", longing: "water", storms: "storm", transfiguration: "disguise", beast: "beast", wild: "nature",
  flesh: "flesh", death: "death", spirit: "ghosts", realms: "portal"
};

/** Грани охотников по путям кредо, уровни I–V. */
export const FX_EDGES = {
  innocence: ["vanish", "holyLight", "holyLight", "radiant", "radiant"],
  martyrdom: ["heal", "vision", "radiant", "heal", "smite"],
  redemption: ["awe", "charm", "heal", "sleep", "ghosts"],
  visionary: ["vision", "eyes", "mindRead", "heal", "vision"],
  defense: ["ward", "heal", "flame", "shield", "radiant"],
  judgment: ["eyes", "command", "vision", "smite", "radiant"],
  vengeance: ["smite", "vision", "flame", "holyLight", "radiant"]
};

/** Прочие броски по виду: тема и когда играть (success — при успехе, fail — при неудаче: срыв). */
export const FX_KINDS = {
  prayer: { theme: "prayer", on: "success" },
  frenzy: { theme: "frenzy", on: "fail" },
  rotschreck: { theme: "rotschreck", on: "fail" },
  hunt: { theme: "feed", on: "success" },
  ritualRun: { theme: "infernal", on: "success" }
};

/** Отдельные события без броска. */
export const FX_EVENTS = { secondSight: "eyes", called: "bless", demonForm: "demonForm", bloodHeal: "bloodHeal" };

