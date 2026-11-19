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

/** Hele ord: "pub" treffer "the pub", ikke "republic". */
const ord = (...w: string[]) => `\\b(?:${w.join("|")})\\b`;
/** Ordstart: "kina" treffer "kinamat", ikke "maskinal". */
const start = (...w: string[]) => `\\b(?:${w.join("|")})`;
/** Hvor som helst i navnet, for sammensatte ord: "kafe" treffer "gardskafe". */
const del = (...w: string[]) => `(?:${w.join("|")})`;
const regel = (...deler: string[]) => new RegExp(deler.join("|"));

/**
 * Navneregler per kategori, kjørt mot asciiFold(navn). Rekkefølgen betyr noe: første treff vinner
 * ("Pizza & Kebab" blir pizza, "Sushi & Thai" blir sushi). Ordene er plukket ut fra navnene i
 * Mattilsynets datasett; __tests__/classify.test.ts har eksempler og falske treff som skal unngås.
 */
const KATEGORI_REGLER: Array<[Kategori, RegExp]> = [
  [
    "hotell",
    regel(
      del("hotel", "motel", "gjestgiver", "gjestgjevar", "gjaestgiveri", "gjestegiveri", "pensjonat", "vandrerhjem"),
      del("turisthytte", "konferansesent"),
      start("gjestega", "gjestehus", "gjesteheim", "fjordtell"),
      ord("hostel", "lodge", "lodgen", "resort", "fjellresort", "best western", "moxy", "park inn", "bed breakfast", "overnatting"),
    ),
  ],
  [
    "sushi",
    regel(del("sushi"), ord("sush", "sashimi", "nigiri", "omakase", "sabrura", "sumo", "poke"), "\\bmaki\\b(?! burger)"),
  ],
  [
    "pizza",
    regel(
      del("pizz"),
      ord("napoli", "napoletana", "margherita", "pinsa", "al forno", "il forno", "mama rosa", "mamma rosa", "slice"),
    ),
  ],
  [
    "burger",
    regel(
      del("burger", "burgr", "burgasm"),
      start("mcdonald", "smash", "smaesh", "hamburg"),
      ord("holy ?cow", "johnny rockets", "troys"),
    ),
  ],
  [
    "kebab",
    regel(
      del("kebab", "kebap", "shawarma", "shaworma", "shawerma", "falafel"),
      ord("doner", "durum", "gyros", "lahmacun"),
    ),
  ],
  [
    "meksikansk",
    regel(
      start("taco", "taqu", "mexi", "burrito", "enchilada", "quesadilla", "nacho", "gordita"),
      ord("mexa", "cantina", "tex ?mex", "el camino", "el caminio", "agave", "azteca", "azteko"),
      ord("freddy fuego", "mucho mas"),
    ),
  ],
  [
    "indisk",
    regel(
      start("india", "indisk", "indiya", "indique", "nepal", "himalaya", "punjab", "namaste", "maharaj", "pakistan"),
      ord("indi", "curry", "tandoori", "tandori", "masala", "masalabar", "tikka", "bombay", "mumbai", "delhi", "dehli"),
      ord("jaipur", "marajah", "maharani", "taj", "tajmahal", "gandhi", "ganges", "ganga", "anarkali", "der peppern gror"),
      ord("everest", "kathmandu", "katmandu", "rasoi", "mirchi", "darbar", "durbar", "kohinoor", "koh i noo?r"),
      ord("haveli", "gurkha", "gorkha", "sherpa", "biryani", "naan", "dosa", "mughal", "moghul", "kashmir"),
      ord("lahore", "lahori", "lahoree", "karachi", "nawabs?", "natraj", "chowk", "dil se", "desi", "samosa"),
      ord("badmash", "zaika", "krishnas?", "agra", "chaskka", "momo", "thali", "dhaba", "barfi", "shanti"),
      ord("p h d eat", "phd eat", "spice village", "spice point", "amraj", "khanateria", "koriander"),
      ord("laari adda", "mehf[ei]l", "sanjays?", "sharmila"),
    ),
  ],
  [
    "asiatisk",
    regel(
      del("thai", "wok"),
      start("china", "chinese", "asia", "kina", "kinesisk", "vietnam", "viet", "noodle", "nudel", "dumpling", "korea", "japan"),
      start("bento", "obento", "lemm?ongrass", "dynast"),
      ord("pho", "compho", "ramen", "dim sum", "bao", "banh mi", "bangkok", "saigon", "hanoi", "tokyo", "izakaya"),
      ord("izkaya", "yakitori", "teriyaki", "tempura", "karaage", "bambus", "bamboo", "beijing", "peking", "nanjing"),
      ord("shanghai", "hong kong", "kowloon", "canton", "guangdong", "sichuan", "szechuan", "sze chuan", "hunan"),
      ord("hainan", "gui lin", "panda", "dragon", "great wall", "chop ?sticks", "chopstix", "far east", "mekong"),
      ord("siam", "sukhumvit", "phuket", "pattaya", "sawasdee", "aroi", "chaiyo", "tuk ?tuk", "soi", "lan na"),
      ord("kimchi", "bibimbap", "seoul", "soju", "k chicken", "ni hao", "nihao", "xin chao", "em oi", "yum cha"),
      ord("wing wah", "ming", "mandarin", "yokoso", "yuuka yuuka", "monsoon", "monsun", "hoa sen", "hot ?pot"),
      ord("baan", "rojjana", "red sun", "xa xa", "gyoza", "udon"),
      // Japanske ord som restaurantnavn.
      ord("sakura", "ikigai", "midori", "minami", "nagomi", "niwa", "kuro", "kansui", "sabaki", "sakaya", "sakee"),
      ord("tataki", "yokocho", "fukuya", "konoji", "mitani", "itachino"),
      // Kinesiske stavelser som ikke er vanlige i norske eller engelske navn.
      ord("wong", "yong", "ying", "yuan", "yue", "feng", "cheng", "ching", "zhenjiang", "xiaohua", "qiu", "liang"),
      ord("juan", "tian", "wei", "rui", "meiwei", "baiwei", "fushan", "mudan", "lung", "chan", "wu"),
      ord("lai lai", "fu hai", "chin shan", "nan wan"),
    ),
  ],
  [
    "bakeri",
    regel(
      del("bakeri", "bageri", "bakery", "konditori", "conditori", "boulanger", "patisserie", "baguett", "croissant"),
      del("panetteri"),
      "(?<!pasta)bakere?n?\\b",
      "\\w+bakst\\b",
      start("baker", "bakar", "bakehus", "backstub", "bactstube", "bagaren", "kanelsnurr", "kakehus", "kakeriet"),
      start("nybakt", "handbakt", "heimbak", "hjemmebakt", "fattigmann"),
      ord("bakes?", "baked", "bakst", "braud", "brod", "solbrod"),
    ),
  ],
  [
    "kafe",
    regel(
      del("kafe", "cafe", "kaffe(?!ri)", "kaffi", "caffe", "coffee", "espresso", "vaffel", "barista", "smoothie"),
      del("gelat", "iskrem", "pannekake"),
      start("crep", "isbar", "lunsjbar", "lunchbar"),
      ord("bistro", "ritazza", "bubble tea", "boba", "tesalongen", "teaology", "juice", "mocca", "mocha", "ice cream"),
      ord("lunsj ?bar", "lunch ?bar"),
    ),
  ],
  [
    "bar",
    regel(
      // "Snack bar", "lunch bar" og "food bar" er ikke barer.
      "(?<!(?:snack|lunch|lunsj|food|pasta|salat|salad|juice) )\\bbar\\b",
      ord("pub", "vinbar", "olbar", "olhall", "brewpub", "taproom", "pobb", "beer palace", "vinotek", "vinoteket", "vineria"),
      "\\w*(?:pub|bryggeri|sportsbar|cocktailbar|gastrobar|bistrobar|restobar|pianobar|strandbar|sjobar|skybar)(?:en)?\\b",
      ord("tavern"),
      start("saloon", "bierstube", "brygghus"),
      ord("o ?learys", "o ?connors", "irish\\w*", "dubliner", "scotsman", "kings arms"),
    ),
  ],
  [
    "gatekjokken",
    regel(
      // "Grillhus", "grill restaurant" og "grill steakhouse" er restauranter, ikke gatekjøkken.
      "grill(?! ?(?:hus|house|restaurant|steakhouse|stua|pit)\\b)",
      del("gatekjokken", "kiosk", "polse", "snackbar", "snacksbar", "snacbar", "chicken"),
      start("snack"),
      ord("fast ?food", "street ?food", "k fried", "wings", "jafs", "piri piri"),
    ),
  ],
  ["kantine", regel(del("kantin"))],
  // Til slutt, så "Thai Diner" blir asiatisk, "Bar og Diner" bar og "Max Kebab" kebab.
  // Max Burgers heter ofte bare "Max <sted>" i datasettet.
  ["burger", regel(ord("diner"), "^max (?!i\\b|grill)")],
];

export function kategoriFraNavn(navn: string): Kategori {
  const n = asciiFold(navn);
  for (const [kat, re] of KATEGORI_REGLER) {
    if (re.test(n)) return kat;
  }
  return "annet";
}

export type Kjede = { navn: string; slug: string; kategori: Kategori };

// Kjeder med mange utsalg i datasettet. Mønstrene kjøres mot asciiFold(navn). Kategorien "annet" betyr
// at kjeden ikke har én fast kategori, så navnereglene avgjør per sted.
const KJEDER: Array<[string, Kategori, RegExp]> = [
  ["Burger King", "burger", /\bburger king\b/],
  ["McDonald’s", "burger", /\bmcdonald s?\b/],
  ["Max Burgers", "burger", /\bmax (?:burgers?|hamburgerrestaurang\w*)\b|^max (?!i\b|grill|kebab|thai)/],
  ["Big Bite", "burger", /\bbig bite\b/],
  ["Big Horn", "annet", /\bbig horn\b/],
  ["Jønk", "burger", /\bjonk\b/],
  ["Kompis", "burger", /\bkompis\b/],
  ["The Shack", "burger", /\bthe shack\b/],
  ["Peppes Pizza", "pizza", /\bpeppes\b/],
  ["Dolly Dimple’s", "pizza", /\bdolly dimple/],
  ["Pizzabakeren", "pizza", /\bpizzabakeren\b/],
  ["Digg Pizza", "pizza", /\bdigg pizza\b/],
  ["Domino’s", "pizza", /\bdomino s?\b/],
  ["Villa Paradiso", "pizza", /\bvilla paradiso\b/],
  ["Mama Rosa", "pizza", /\bmamm?a rosa\b/],
  ["Espresso House", "kafe", /\bespresso house\b/],
  ["Starbucks", "kafe", /\bstarbucks\b/],
  ["Joe & The Juice", "kafe", /\bjoe (and )?the juice\b/],
  ["Jordbærpikene", "kafe", /\bjordbaerpiken/],
  ["Dromedar Kaffebar", "kafe", /\bdromedar\b/],
  ["Biltema", "kafe", /\bbiltema\b/],
  ["Baker Hansen", "bakeri", /\bbaker hansen\b/],
  ["Baker Nordby", "bakeri", /\bbaker nordby\b/],
  ["Baker Brun", "bakeri", /\bbaker brun\b/],
  ["Godt Brød", "bakeri", /\bgodt brod\b/],
  ["W.B. Samson", "bakeri", /\b(?:w ?b|baker) samson\b|^samson\b/],
  ["Kanelsnurren", "bakeri", /\bkanelsnurren\b/],
  ["Kanel Steinovnsbakeri", "bakeri", /^kanel\b/],
  ["Backstube", "bakeri", /\bbac[kt]stub/],
  ["Solbrød", "bakeri", /\bsolbrod\b/],
  ["Bake Me Up", "bakeri", /\bbake me up\b/],
  ["Butterfly", "bakeri", /^butterfly\b/],
  ["Snurr", "bakeri", /^snurr\b(?! ski\b)/],
  ["Stavelin", "bakeri", /^stavelin\b/],
  ["Sirkus Renaa", "bakeri", /\bsirkus renaa\b/],
  ["Edgars Bakeri", "bakeri", /\bedgars\b/],
  ["Sabi Sushi", "sushi", /\bsabi sushi\b/],
  ["Sabrura", "sushi", /\bsabrura\b/],
  ["Sumo", "sushi", /\bsumo\b/],
  ["Dattebayo", "sushi", /\bdattebayo\b/],
  ["Hawaii Poké", "sushi", /^hawaii\b/],
  ["Lucky Bowl", "asiatisk", /\blucky bowl\b/],
  ["Yummy Time", "asiatisk", /\byummy ?time\b/],
  ["Yips", "asiatisk", /\byips\b/],
  ["Xa Xa", "asiatisk", /^xa xa\b/],
  ["Los Tacos", "meksikansk", /\blos tacos\b/],
  ["El Camino", "meksikansk", /\bel caminio?\b/],
  ["Fly Chicken", "gatekjokken", /\bfly chicken\b/],
  ["Jafs", "gatekjokken", /\bjafs\b/],
  ["Bislett Kebab", "kebab", /\bbislett kebab\b/],
  ["Pincho Nation", "annet", /\bpincho\b/],
  ["Subway", "annet", /\bsubway\b/],
  ["TGI Fridays", "annet", /\btgi\b/],
  ["Egon", "annet", /\begon\b/],
  ["Bambus", "annet", /\bbambus\b(?!kiosk)/], // Asiatisk, men noen utsalg er rene sushibarer
  ["Olivia", "annet", /\bolivia\b/],
  ["Lett", "annet", /^lett\b/],
  ["O’Learys", "bar", /\bo ?learys\b/],
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
  ["Mix", "gatekjokken", /^mix\b|\bmix$/],
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
