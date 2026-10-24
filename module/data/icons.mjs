// module/data/icons.mjs
// Картинки предметов из встроенной библиотеки Foundry (icons/…): оружие — по виду и названию, броня — по классу,
// достоинства и недостатки — по категории, факты биографии — по смыслу. Без глобалов Foundry: модуль
// используется и в игре (библиотека, заготовки снаряжения), и при сборке компендиев (tools/build_packs.mjs).

const I = p => `icons/${p}`;

/** Оружие: сначала по названию (лук, пистолет, сабля…), иначе по виду. */
const WEAPON_RULES = [
  [/арбалет|crossbow/i, "weapons/crossbows/crossbow-heavy.webp"],
  [/лук|bow/i, "weapons/bows/longbow-recurve-brown.webp"],
  [/праща|sling/i, "weapons/slings/slingshot-wood.webp"],
  [/автомат|пистолет-пулем|пулем|smg|uzi|submachine/i, "weapons/guns/gun-submachine-drum-magazine.webp"],
  [/дробов|обрез|shotgun|мушкетон|blunderbuss/i, "weapons/guns/gun-blunderbuss-worn-brown.webp"],
  [/пистол|револьв|pistol|revolver/i, "weapons/guns/gun-pistol-flintlock.webp"],
  [/мушкет|ружь|винтов|карабин|штуцер|rifle|musket|carbine/i, "weapons/guns/gun-wood.webp"],
  [/огнем|flamethrower/i, "weapons/guns/flamethrower-spray-fire-orange.webp"],
  [/граната|бомб|grenade|bomb/i, "weapons/thrown/bomb-fuse-black.webp"],
  [/нож|кинжал|стилет|knife|dagger|stiletto/i, "weapons/daggers/dagger-curved-black.webp"],
  [/топор|секир|axe/i, "weapons/axes/axe-broad-brown.webp"],
  [/коса|scythe/i, "weapons/polearms/glaive-simple.webp"],
  [/кол\b|stake/i, "weapons/polearms/javelin-simple.webp"],
  [/копь|пика|алебард|бердыш|spear|pike|halberd/i, "weapons/polearms/spear-flared-blue.webp"],
  [/булав|кистен|моргенштерн|mace|flail/i, "weapons/maces/mace-round-steel.webp"],
  [/молот|hammer/i, "weapons/hammers/hammer-war-rounding.webp"],
  [/дубин|палиц|трост|бита|club|cane|bat/i, "weapons/clubs/club-banded-brown.webp"],
  [/меч|сабл|шпаг|рапир|палаш|клинок|sword|sabre|saber|rapier/i, "weapons/swords/shortsword-guard-brass.webp"]
];
const WEAPON_KIND = {
  brawl: "skills/melee/unarmed-punch-fist.webp",
  melee: "weapons/swords/shortsword-guard-brass.webp",
  firearms: "weapons/guns/gun-pistol-flintlock.webp",
  thrown: "weapons/thrown/dagger-ringed-grey.webp"
};
export function weaponIcon(name = "", kind = "melee") {
  const hit = WEAPON_RULES.find(([rx]) => rx.test(name));
  return I(hit ? hit[1] : WEAPON_KIND[kind] ?? WEAPON_KIND.melee);
}

/** Броня: лёгкая — кожа, тяжёлая — сталь. */
export function armorIcon(rating = 1) {
  return I(rating >= 3 ? "equipment/chest/breastplate-cuirass-steel-grey.webp" : "equipment/chest/breastplate-banded-leather-brown.webp");
}

/** Достоинства и недостатки — по категории; у недостатков мрачнее. */
const TRAIT = {
  physical: ["magic/control/buff-strength-muscle-damage.webp", "magic/control/buff-strength-muscle-damage-red.webp"],
  mental: ["magic/perception/eye-ringed-green.webp", "magic/perception/eye-ringed-glow-angry-red.webp"],
  social: ["skills/social/diplomacy-handshake.webp", "skills/social/thumbs-down.webp"],
  supernatural: ["magic/perception/third-eye-blue-red.webp", "magic/control/debuff-chains-purple.webp"]
};
export function traitIcon(category = "physical", flaw = false) {
  const pair = TRAIT[category] ?? TRAIT.supernatural;
  return I(pair[flaw ? 1 : 0]);
}

/** Факты биографии — по английскому названию из справочника. */
const BACKGROUND = {
  "Resources": "commodities/currency/coin-embossed-crown-gold.webp",
  "Allies": "skills/social/diplomacy-unity-alliance.webp",
  "Contacts": "sundries/documents/document-letter-tan.webp",
  "Information Network": "sundries/documents/document-sealed-brown-red.webp",
  "Anarch Information Exchange": "sundries/documents/document-letter-brown.webp",
  "Influence": "magic/control/control-influence-crown-gold.webp",
  "Mentor": "environment/people/cleric-grey.webp",
  "Retainers": "environment/people/commoner.webp",
  "Herd": "environment/people/group.webp",
  "Fame": "skills/social/intimidation-impressing.webp",
  "Status": "magic/control/control-influence-crown-yellow.webp",
  "Anarch Status": "magic/control/control-influence-rally-purple.webp",
  "Elder Status": "magic/control/control-influence-crown-yellow.webp",
  "Clan Prestige": "magic/control/control-influence-crown-gold.webp",
  "Generation": "skills/melee/blood-slash-foam-red.webp",
  "Elder Generation": "skills/melee/blood-slash-foam-red.webp",
  "Alternate Identity": "magic/perception/mask-stone-eyes-orange.webp",
  "Domain": "sundries/documents/document-official-capital.webp",
  "Military Force": "environment/people/infantry-army.webp",
  "Mob": "environment/people/charge.webp",
  "Library": "sundries/books/book-backed-wood-tan.webp",
  "Rituals": "sundries/books/book-eye-red.webp",
  "Cult": "skills/social/symbol-pyramid-eye.webp",
  "Armory": "weapons/swords/greatsword-sheathed.webp",
  "Black Hand Membership": "magic/perception/hand-eye-black.webp",
  "Pack Recognition": "skills/social/diplomacy-peace-alliance.webp"
};
export function backgroundIcon(en = "") {
  return BACKGROUND[en] ? I(BACKGROUND[en]) : null;
}

/** Все пути, на которые ссылается модуль (для проверки, что файлы есть в Foundry). */
export const ALL_ICON_PATHS = [...WEAPON_RULES.map(r => r[1]), ...Object.values(WEAPON_KIND),
  "equipment/chest/breastplate-cuirass-steel-grey.webp", "equipment/chest/breastplate-banded-leather-brown.webp",
  ...Object.values(TRAIT).flat(), ...Object.values(BACKGROUND)].map(I);
