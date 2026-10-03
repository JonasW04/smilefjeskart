/**
 * Utleder kjede og kategori fra stedsnavn. Datasettet har ingen bransjekode,
 * så dette er en navnebasert tilnærming – god nok for sammenligninger,
 * men ikke fasit for enkeltsteder.
 */
import { asciiFold, slugify } from "./text";

export type Kategori =
  | "hotell"
  | "bakeri"
  | "kafe"
  | "pizza"
  | "sushi"
  | "burger"
  | "kebab"
  | "asiatisk"
  | "indisk"
  | "meksikansk"
  | "bar"
  | "gatekjokken"
  | "kantine"
  | "annet";

export const KATEGORI_NAVN: Record<Kategori, string> = {
  hotell: "Hotell",
  bakeri: "Bakeri",
  kafe: "Kafé",
  pizza: "Pizza",
  sushi: "Sushi",
  burger: "Burger",
  kebab: "Kebab",
  asiatisk: "Asiatisk",
  indisk: "Indisk og nepalsk",
  meksikansk: "Meksikansk",
  bar: "Bar og pub",
  gatekjokken: "Gatekjøkken",
  kantine: "Kantine",
  annet: "Restaurant og annet",
};

export const KATEGORI_EMOJI: Record<Kategori, string> = {
  hotell: "🏨",
  bakeri: "🥐",
  kafe: "☕",
  pizza: "🍕",
  sushi: "🍣",
  burger: "🍔",
  kebab: "🥙",
  asiatisk: "🥢",
  indisk: "🍛",
  meksikansk: "🌮",
  bar: "🍺",
  gatekjokken: "🌭",
  kantine: "🍽️",
  annet: "🍴",
};

// Rekkefølgen betyr noe: første treff vinner ("Pizza & Kebab" blir pizza).
const KATEGORI_REGLER: Array<[Kategori, RegExp]> = [
  ["hotell", /\b(hotel|hotell|hotels)\b/],
  ["sushi", /\bsushi\b/],
  ["pizza", /\b(pizza\w*|pizzeria)\b/],
  ["burger", /\b(burger\w*|mcdonald\w*|hamburger\w*)\b/],
  ["kebab", /\b(kebab\w*|kebap|shawarma|falafel|doner)\b/],
  ["meksikansk", /\b(taco\w*|mexican\w*|burrito\w*|cantina|tex mex)\b/],
  ["indisk", /\b(india\w*|indisk|curry|tandoori|masala|nepal\w*|himalaya\w*|tikka|punjab\w*|bombay|delhi)\b/],
  [
    "asiatisk",
    /\b(thai\w*|wok|asia\w*|china|kina|kinesisk|vietnam\w*|pho|ramen|noodle\w*|dim sum|korea\w*|bao|bangkok|saigon|tokyo|japan\w*)\b/,
  ],
  ["bakeri", /\b(bakeri\w*|baker|bakst|brod|konditori\w*|bakehus|bakeriet)\b/],
  ["kafe", /\b(kafe\w*|cafe\w*|kaffe\w*|coffee|espresso|kaffebar|bistro)\b/],
  ["bar", /\b(pub|bar|bryggeri|olhall|vinbar|brewpub|olbar)\b/],
  ["gatekjokken", /\b(gatekjokken|grill|grillen|kiosk\w*|polse\w*|snackbar)\b/],
  ["kantine", /\b(kantine\w*|kantina|kantinen)\b/],
];

export function kategoriFraNavn(navn: string): Kategori {
  const n = asciiFold(navn);
  for (const [kat, re] of KATEGORI_REGLER) {
    if (re.test(n)) return kat;
  }
  return "annet";
}

export type Kjede = { navn: string; slug: string; kategori: Kategori };

// Kjeder med mange utsalg i datasettet. Mønstrene kjøres mot asciiFold(navn).
const KJEDER: Array<[string, Kategori, RegExp]> = [
  ["Burger King", "burger", /\bburger king\b/],
  ["McDonald’s", "burger", /\bmcdonald s?\b/],
  ["Max Burgers", "burger", /\bmax burgers?\b/],
  ["Big Bite", "burger", /\bbig bite\b/],
  ["Big Horn", "annet", /\bbig horn\b/],
  ["Peppes Pizza", "pizza", /\bpeppes\b/],
  ["Dolly Dimple’s", "pizza", /\bdolly dimple/],
  ["Pizzabakeren", "pizza", /\bpizzabakeren\b/],
  ["Digg Pizza", "pizza", /\bdigg pizza\b/],
  ["Domino’s", "pizza", /\bdomino s?\b/],
  ["Espresso House", "kafe", /\bespresso house\b/],
  ["Starbucks", "kafe", /\bstarbucks\b/],
  ["Joe & The Juice", "kafe", /\bjoe (and )?the juice\b/],
  ["Jordbærpikene", "kafe", /\bjordbaerpikene\b/],
  ["Baker Hansen", "bakeri", /\bbaker hansen\b/],
  ["Baker Nordby", "bakeri", /\bbaker nordby\b/],
  ["Baker Brun", "bakeri", /\bbaker brun\b/],
  ["Godt Brød", "bakeri", /\bgodt brod\b/],
  ["W.B. Samson", "bakeri", /\bw ?b samson\b/],
  ["Edgars Bakeri", "bakeri", /\bedgars\b/],
  ["Sabi Sushi", "sushi", /\bsabi sushi\b/],
  ["Lucky Bowl", "asiatisk", /\blucky bowl\b/],
  ["Yummy Time", "asiatisk", /\byummy time\b/],
  ["Los Tacos", "meksikansk", /\blos tacos\b/],
  ["Fly Chicken", "gatekjokken", /\bfly chicken\b/],
  ["Bislett Kebab", "kebab", /\bbislett kebab\b/],
  ["Pincho Nation", "annet", /\bpincho\b/],
  ["Subway", "annet", /\bsubway\b/],
  ["TGI Fridays", "annet", /\btgi\b/],
  ["Egon", "annet", /\begon\b/],
  ["Scandic", "hotell", /\bscandic\b/],
  ["Thon Hotels", "hotell", /\bthon hotel/],
  ["Quality Hotel", "hotell", /\bquality hotel\b/],
  ["Clarion", "hotell", /\bclarion\b/],
  ["Comfort Hotel", "hotell", /\bcomfort hotel\b/],
  ["Radisson", "hotell", /\bradisson\b/],
  ["Esso", "gatekjokken", /\besso\b/],
  ["Circle K", "gatekjokken", /\bcircle k\b/],
  ["7-Eleven", "gatekjokken", /\b7 ?eleven\b/],
  ["Narvesen", "gatekjokken", /\bnarvesen\b/],
];

export function kjedeFraNavn(navn: string): Kjede | null {
  const n = asciiFold(navn);
  for (const [kjedenavn, kategori, re] of KJEDER) {
    if (re.test(n)) return { navn: kjedenavn, slug: slugify(kjedenavn), kategori };
  }
  return null;
}

/** Kategori for et sted: kjedens kategori vinner over navneregler når den er kjent. */
export function kategoriForSted(navn: string, kjede: Kjede | null): Kategori {
  if (kjede && kjede.kategori !== "annet") return kjede.kategori;
  return kategoriFraNavn(navn);
}
