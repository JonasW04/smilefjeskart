/**
 * Utleder kjede og kategori for et sted. Mattilsynets datasett har ingen bransjekode, så kategorien settes
 * sammen av flere kilder (se kategoriForSted): kjeden, næringskoden i Enhetsregisteret, kjøkkentypen i
 * OpenStreetMap og til slutt navnet. Navnereglene alene bommer på steder med nøytrale navn.
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
  | "italiensk"
  | "midtosten"
  | "sjomat"
  | "restaurant"
  | "bar"
  | "gatekjokken"
  | "kantine"
  | "annet";

export const KATEGORI_NAVN: Record<Kategori, string> = {
  hotell: "Hotell og overnatting",
  bakeri: "Bakeri",
  kafe: "Kafé",
  pizza: "Pizza",
  sushi: "Sushi",
  burger: "Burger",
  kebab: "Kebab",
  asiatisk: "Asiatisk",
  indisk: "Indisk og nepalsk",
  meksikansk: "Meksikansk",
  italiensk: "Italiensk",
  midtosten: "Midtøsten",
  sjomat: "Sjømat og fisk",
  restaurant: "Restaurant",
  bar: "Bar og pub",
  gatekjokken: "Gatekjøkken",
  kantine: "Kantine og catering",
  annet: "Andre steder",
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
  italiensk: "🍝",
  midtosten: "🧆",
  sjomat: "🐟",
  restaurant: "🍴",
  bar: "🍺",
  gatekjokken: "🌭",
  kantine: "🍽️",
  annet: "🏪",
};

/** Kategoriene som sier hva slags mat stedet lager, i motsetning til hva slags sted det er. */
export const KJOKKEN_KATEGORIER = [
  "pizza",
  "burger",
  "sushi",
  "asiatisk",
  "indisk",
  "italiensk",
  "midtosten",
  "kebab",
  "meksikansk",
  "sjomat",
] as const satisfies readonly Kategori[];

/** Kategoriene for typen sted, i rekkefølgen filteret viser dem. */
export const STEDTYPE_KATEGORIER = [
  "restaurant",
  "kafe",
  "bakeri",
  "gatekjokken",
  "bar",
  "hotell",
  "kantine",
  "annet",
] as const satisfies readonly Kategori[];

const ER_KJOKKEN = new Set<Kategori>(KJOKKEN_KATEGORIER);
export const erKjokken = (k: Kategori) => ER_KJOKKEN.has(k);

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
      ord("shanghai", "hong kong", "kowloon", "canton", "guangdong", "sichuan", "szechuan", "szehuan", "sze chuan", "hunan"),
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
    "midtosten",
    regel(
      start("libanes", "lebanes", "syrisk", "syrian", "persisk", "persian", "tyrkisk", "turkish", "damask", "damasc"),
      start("aleppo", "beirut", "istanbul", "anatoli", "levant", "afghan", "kurdisk", "irakisk", "arabisk", "arabian"),
      ord("damas", "damascy", "meze", "mezze", "hummus", "shiraa?z", "yalla", "habibi", "izgara", "baghdad"),
    ),
  ],
  [
    "italiensk",
    regel(
      del("ristorante", "ristirante", "trattoria", "osteria", "enoteca", "italia", "italien", "eataly"),
      start("pasta"),
      ord("cucina", "cucuina", "nonna", "mamma mia", "little italy", "lille italia", "dolce vita"),
    ),
  ],
  [
    "sjomat",
    regel(
      // Ikke "fisketorget": det er også et stedsnavn (Kringla Fisketorget er et bakeri).
      del("sjomat", "fiskerestaurant", "seafood", "fiskehallen", "skalldyr"),
      ord("fiskebar", "fiskeriet", "fiskebruket", "fiskekompaniet", "fish ?(?:and|n|og)? ?chips", "mr ?fish", "fish me"),
      ord("osters", "osterbar", "oyster", "oysters", "fangst"),
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
  // Restaurant uten kjent kjøkken. Sist, så "Sushi Restaurant" blir sushi og "Hotel X Restaurant" hotell.
  [
    "restaurant",
    regel(
      start("restaurant", "restaurang", "resturant", "brasseri", "spiseri", "spisested"),
      ord("kro", "kroa", "kroen", "veikro", "vertshus", "vertshuset", "matbar", "steakhouse", "steak house", "gastropub"),
    ),
  ],
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
// at kjeden ikke har én fast kategori, så kategoriForSted avgjør per sted.
const KJEDER: Array<[string, Kategori, RegExp]> = [
  ["Burger King", "burger", /\bburger king\b/],
  ["McDonald’s", "burger", /\bmcdonald s?\b/],
  ["Max Burgers", "burger", /\bmax (?:burgers?|hamburgerrestaurang\w*)\b|^max (?!i\b|grill|kebab|thai)/],
  ["Big Bite", "burger", /\bbig bite\b/],
  ["Big Horn", "restaurant", /\bbig horn\b/],
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
  ["Pincho Nation", "restaurant", /\bpincho\b/],
  ["Subway", "gatekjokken", /\bsubway\b/],
  ["TGI Fridays", "restaurant", /\btgi\b/],
  ["Egon", "restaurant", /\begon\b/],
  ["Bambus", "annet", /\bbambus\b(?!kiosk)/], // Asiatisk, men noen utsalg er rene sushibarer
  ["Olivia", "italiensk", /\bolivia\b/],
  ["Lett", "restaurant", /^lett\b/],
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

/**
 * Det vi vet om stedet fra andre kilder enn Mattilsynet. Alle felt er valgfrie: mangler en kilde, faller
 * kategoriForSted tilbake på de neste.
 */
export type Kilder = {
  /** Næringskoden til underenheten i Enhetsregisteret, f.eks. "56.110" (restaurant) eller "55.100" (hotell). */
  naeringskode?: string | null;
  /** Underenhetens navn i Enhetsregisteret. Ofte et annet navn enn det som står på døra. */
  registernavn?: string | null;
  /** Hovedenhetens registrerte aktivitet og formål, f.eks. «Drift av indisk restaurant». */
  aktivitet?: string | null;
  /** Stedet i OpenStreetMap: amenity (restaurant, cafe, fast_food, pub …) og cuisine (pizza;kebab …). */
  osm?: { type: string; kjokken: string | null } | null;
};

type Bransje = "servering" | "bar" | "kantine" | "hotell" | "bakeri" | "butikk" | "annet";

/** Næringskode → bransje. Dekker både SN2025 (56.110) og SN2007 (56.101), som noen enheter fortsatt har. */
export function bransjeFraKode(kode: string | null | undefined): Bransje | null {
  if (!kode) return null;
  if (/^56\.(?:1|40)/.test(kode)) return "servering";
  if (/^56\.3/.test(kode)) return "bar";
  if (/^56\.2/.test(kode)) return "kantine";
  if (/^55\./.test(kode)) return "hotell";
  if (/^(?:10\.71|10\.72|47\.24)/.test(kode)) return "bakeri";
  if (/^47\./.test(kode)) return "butikk";
  return "annet";
}

/** OSM-cuisine → kategori. Kjøkken og stedtyper blandes, kategoriForSted skiller dem med erKjokken. */
const OSM_KJOKKEN: Record<string, Kategori> = {
  pizza: "pizza",
  italian_pizza: "pizza",
  sushi: "sushi",
  poke: "sushi",
  burger: "burger",
  kebab: "kebab",
  doner: "kebab",
  shawarma: "kebab",
  falafel: "kebab",
  gyros: "kebab",
  mexican: "meksikansk",
  "tex-mex": "meksikansk",
  tex_mex: "meksikansk",
  tacos: "meksikansk",
  burrito: "meksikansk",
  indian: "indisk",
  nepalese: "indisk",
  pakistani: "indisk",
  curry: "indisk",
  sri_lankan: "indisk",
  bangladeshi: "indisk",
  chinese: "asiatisk",
  thai: "asiatisk",
  asian: "asiatisk",
  japanese: "asiatisk",
  vietnamese: "asiatisk",
  korean: "asiatisk",
  ramen: "asiatisk",
  noodle: "asiatisk",
  dim_sum: "asiatisk",
  dumpling: "asiatisk",
  filipino: "asiatisk",
  indonesian: "asiatisk",
  malaysian: "asiatisk",
  sichuan: "asiatisk",
  cantonese: "asiatisk",
  italian: "italiensk",
  pasta: "italiensk",
  lebanese: "midtosten",
  syrian: "midtosten",
  middle_eastern: "midtosten",
  persian: "midtosten",
  iranian: "midtosten",
  arab: "midtosten",
  afghan: "midtosten",
  kurdish: "midtosten",
  iraqi: "midtosten",
  turkish: "midtosten",
  levantine: "midtosten",
  seafood: "sjomat",
  fish: "sjomat",
  fish_and_chips: "sjomat",
  oyster: "sjomat",
  coffee_shop: "kafe",
  coffee: "kafe",
  cake: "kafe",
  tea: "kafe",
  waffle: "kafe",
  bubble_tea: "kafe",
  ice_cream: "kafe",
  frozen_yogurt: "kafe",
  juice: "kafe",
  breakfast: "kafe",
  brunch: "kafe",
  crepe: "kafe",
  pancake: "kafe",
  dessert: "kafe",
  bakery: "bakeri",
  pastry: "bakeri",
  hot_dog: "gatekjokken",
  sandwich: "gatekjokken",
  chicken: "gatekjokken",
  fries: "gatekjokken",
  fast_food: "gatekjokken",
};

/** OSM-type → stedtype, brukt når verken kjøkken eller navn sier noe. Hotell kommer bare fra næringskoden. */
const OSM_TYPE: Record<string, Kategori> = {
  restaurant: "restaurant",
  cafe: "kafe",
  ice_cream: "kafe",
  fast_food: "gatekjokken",
  pub: "bar",
  bar: "bar",
  biergarten: "bar",
  bakery: "bakeri",
  pastry: "bakeri",
  confectionery: "bakeri",
};

const osmVerdier = (kjokken: string | null) =>
  (kjokken ?? "").toLowerCase().split(/\s*[;,]\s*/).filter(Boolean);

/**
 * Hovedkjøkkenet i OSM: den første verdien, som kartleggerne bruker for hovedkjøkkenet. Lange lister
 * («burger;fine_dining;fish;pasta;pizza») og lister som starter med noe generelt («regional;burger») er
 * menyer med litt av alt, og gir ikke kjøkken.
 */
export function kjokkenFraOsm(osm: Kilder["osm"]): Kategori | null {
  // En kafé som også selger burger er fortsatt en kafé.
  if (!osm || osm.type === "cafe") return null;
  const verdier = osmVerdier(osm.kjokken);
  if (verdier.length === 0 || verdier.length > 3) return null;
  const k = OSM_KJOKKEN[verdier[0]];
  return k && erKjokken(k) ? k : null;
}

function stedtypeFraOsm(osm: Kilder["osm"]): Kategori | null {
  if (!osm) return null;
  if (OSM_TYPE[osm.type]) return OSM_TYPE[osm.type];
  for (const v of osmVerdier(osm.kjokken)) {
    const k = OSM_KJOKKEN[v];
    if (k && !erKjokken(k)) return k;
  }
  return null;
}

/** Kjøkken nevnt i registrert aktivitet. Bare når teksten nevner nøyaktig ett, ellers er den for generell. */
const AKTIVITET_KJOKKEN: Array<[Kategori, RegExp]> = [
  ["pizza", /pizz/],
  ["sushi", /sushi/],
  ["burger", /burger/],
  ["kebab", /kebab/],
  ["meksikansk", /meksikansk|mexican|tex ?mex/],
  ["indisk", /indisk|nepalsk|pakistansk/],
  ["asiatisk", /asiatisk|kinesisk|thai|japansk|vietnames|koreansk/],
  ["italiensk", /italiensk/],
  ["midtosten", /libanesisk|syrisk|tyrkisk|persisk|arabisk|kurdisk|afghansk|irakisk|midtøsten|midtosten/],
  ["sjomat", /sjømatrestaurant|sjomatrestaurant|fiskerestaurant/],
];

export function kjokkenFraAktivitet(tekst: string | null | undefined): Kategori | null {
  if (!tekst) return null;
  const t = tekst.toLowerCase();
  const treff = AKTIVITET_KJOKKEN.filter(([, re]) => re.test(t)).map(([k]) => k);
  return treff.length === 1 ? treff[0] : null;
}

/**
 * Kategori for et sted. Rekkefølgen:
 *
 * 1. Kjedens kategori, når kjeden har én.
 * 2. Bakerier etter næringskoden (bare pizza og andre kjøkken i navnet slår den).
 * 3. Kjøkken: fra navnet, så OpenStreetMap, så navnet i Enhetsregisteret, så registrert aktivitet.
 * 4. Stedtype fra navnet («Kafé», «Pub», «Restaurant»), så fra OpenStreetMap.
 * 5. Bransjen fra næringskoden: hotell, bar og kantine/catering.
 * 6. Stedtype fra navnet i Enhetsregisteret.
 * 7. «Restaurant» når næringskoden sier servering, ellers «Andre steder».
 *
 * Hotell, bar og catering kommer etter navnet fordi næringskoden ofte er eierens: Radissons kafé er registrert
 * som hotell, og SN2025-koden for barer (56.30) gjelder også kaffebarer.
 */
export function kategoriForSted(navn: string, kjede: Kjede | null, kilder: Kilder = {}): Kategori {
  if (kjede && kjede.kategori !== "annet") return kjede.kategori;
  const fraNavn = kategoriFraNavn(navn);
  const bransje = bransjeFraKode(kilder.naeringskode);
  if (bransje === "bakeri") return erKjokken(fraNavn) ? fraNavn : "bakeri";

  // Registernavnet er ofte selskapets, så det brukes bare når navnet på døra er nøytralt eller bare sier «restaurant».
  const generisk = fraNavn === "annet" || fraNavn === "restaurant";
  const fraRegisternavn = generisk && kilder.registernavn ? kategoriFraNavn(kilder.registernavn) : "annet";
  const kjokken =
    (erKjokken(fraNavn) ? fraNavn : null) ??
    kjokkenFraOsm(kilder.osm) ??
    (erKjokken(fraRegisternavn) ? fraRegisternavn : null) ??
    (bransje === "servering" ? kjokkenFraAktivitet(kilder.aktivitet) : null);
  if (kjokken) return kjokken;

  if (fraNavn !== "annet") return fraNavn;
  const fraOsm = stedtypeFraOsm(kilder.osm);
  if (fraOsm) return fraOsm;
  if (bransje === "hotell" || bransje === "bar" || bransje === "kantine") return bransje;
  if (fraRegisternavn !== "annet") return fraRegisternavn;
  return bransje === "servering" ? "restaurant" : "annet";
}
