import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  KATEGORI_NAVN,
  KJOKKEN_KATEGORIER,
  STEDTYPE_KATEGORIER,
  bransjeFraKode,
  kategoriForSted,
  kategoriFraNavn,
  kjedeFraNavn,
  kjokkenFraAktivitet,
  type Kategori,
  type Kilder,
} from "@/lib/classify";
import { KART, type Datasett, type KartData } from "@/lib/types";
import { lagKildeoppslag, lesKilder } from "../scripts/lib/kilder";

// Ekte navn fra Mattilsynets datasett som tidligere havnet i "Restaurant og annet".
const TREFF: Record<Exclude<Kategori, "annet">, string[]> = {
  italiensk: [
    "Casa Mia Ristorante",
    "Garda Trattoria",
    "Osteria Moderna",
    "Piazza Italia",
    "Urban Italian Aker Brygge AS",
    "Pasta Sentral",
    "Baltazar Ristorante & Enoteca AS",
    "Mamma Mia",
  ],
  midtosten: [
    "Rozana Lebanese",
    "Sham syrisk mat",
    "Shiraaz Persisk",
    "Taste Of Damascus",
    "Damaskushuset",
    "Meze Restaurant AS",
    "Istanbul Restaurant Moss AS",
    "Yalla Habibi",
    "Izgara Tyrkisk Restaurant",
  ],
  sjomat: ["Cornelius Sjømatrestaurant", "Engelsviken Fiskerestaurant", "Fiskekompaniet", "Fiskeriet Youngstorget", "Mr. Fish", "Fish Me", "Anitas Sjømat"],
  restaurant: ["Restaurant Fjord", "Bakgården Restaurant", "Dreggen Kro og Vertshus", "Vossevangen Grill- & Steakhouse", "Huset Spiseri", "Palace Grill Restaurant"],
  indisk: [
    "Der Peppern Gror Via Village",
    "Namaste Ålesund AS",
    "Namaste Norge Trondheim",
    "Namastey Bergen",
    "New Tajmahal",
    "TajMahal Tandori Restaurant",
    "The Blue Taj",
    "New Anarkali Satwinder Singh",
    "Rasoi Ålesund Restaurant",
    "Haveli Kalbakken",
    "Koh i Nor",
    "P.H.D EAT AS",
    "Spice Village DA",
    "Spice Point",
    "Amraj",
    "Khanateria",
    "Koriander",
    "Marajah",
    "Masalabar",
    "Den Indiske Flamme",
    "Made in Indiya",
    "1947 By Gandhi",
    "New Agra Skien",
    "New Dehli",
    "Lahoree Dera Tandori",
    "Ricksha Pakistani Street Food",
    "Desi Grill",
    "Jaipur",
    "Maharaja Restaurant",
    "Mount Everest",
    "Kathmandu Kitchen",
    "Mirchi",
    "Darbar",
    "Kohinoor",
    "Laari Adda",
    "Mehfel Restaurant",
    "Barfi BItes",
    "Shanti",
  ],
  asiatisk: [
    "Bambus Frogner",
    "Beijing Palace",
    "Charms’ Kinamat",
    "Hjørna Chinarestaurant",
    "Benja Siam",
    "Samrabthai Restaurant",
    "Hjemmewok",
    "Genji Izakaya",
    "Xin Chao Restaurant",
    "Sze Chuan House",
    "TukTuk -Thai Diner & Takeaway",
    "Panda Café",
    "Monsoon",
    "Monsun",
    "Viet Kitchen",
    "Hoa Sen",
    "Hotpot Oslo",
    "Lemmongrass",
    "Baan Progressive Cuisine",
    "Dynastiet Restaurant",
    "Red Sun Åsane",
    "Sakura Lofoten",
    "Yokocho",
    "Kansui",
    "Niwa",
    "Ying Ying restaurant",
    "Zhenjiang Restaurant",
    "Wong’s Restaurant",
    "Long Cheng Restaurant",
    "Golden Mountain Chin Shan House",
    "Lai Lai House",
    "Dalat Cafe Viet AS", // asiatisk før kafé
  ],
  sushi: ["Sabrura Lade", "Sumo Karl Johan", "iSushi Forus", "Sabi Sush", "YESushi & Wok", "Maki Avdeling Bakklandet", "Aina Poke", "Poke & Bubbly"],
  pizza: ["Mesterpizzerian", "ZiOPizza Stortingsgata", "Bella Napoli", "Mama Rosa Melhus", "Dobbel Margherita"],
  burger: ["Trønderburger", "Smash Buddies Ski", "MAX Grønland", "Max Egertorget", "Johnny Rockets Storo", "Brooklyn Diner", "Maki Burger Byhaven", "Hamburghini Sandefjord", "Troys Grünerløkka"],
  kebab: ["Istanbul Grillkebab AS", "Gyros House", "Mr Shaworma AS"],
  meksikansk: ["El Camino Sandvika", "La Taqueria", "Las Cazuelas Sabor a Mexico", "Azteko", "Freddy Fuego AS", "Gordita Matkvartalet", "Mucho Mas"],
  bar: ["O’Learys Tromsø Airport", "Furu Gastropub", "Ægir Bryggeripub", "The Dubliner", "Trafalgar sportsbar", "Vinoteket", "Vineria Ventidue", "Sjøbaren", "Pastis Bistrobar", "Aurora Restobar"],
  kafe: [
    "Torsdagskaffe",
    "Kulturkafeen",
    "Gårdskafeen, Glasshytta Vikten",
    "Caffè Ritazza",
    "Kaffistova",
    "Vaffelbua",
    "Barista Botanica",
    "Khaya Barista Bar", // kafé før bar
    "Creperie de Mari",
    "Pannekakehuset",
    "Happis Gelateria",
    "Kafka - isbar midttorget",
    "will.I.juice",
    "Matsaya boba and bbq",
    "Lunsjbaren",
    "Johnnys Lunch Bar",
  ],
  bakeri: ["Backstube Grønland", "Kanelsnurren Tasta", "Solbrød Lagunen", "Geheb Conditori Markensgate", "Jærbakeren Sola", "Håndbakt", "Heimbaka AS", "Bella Nybakt AS", "Naturbakst AS (servering)", "Bakarhuset kafe", "Daglig Deig - Pastificio Panetteria"],
  hotell: ["Askvoll Fjordhotell", "Bygdin Høyfjellshotell", "Eidfjord Gjestgiveri", "Aure Gjestegård", "Geilo Mountain Lodge", "Gjendesheim turisthytte", "Soria Moria Kurs og Konferansesenter", "Lauksletta Overnatting"],
  gatekjokken: ["Jafs Kongsberg", "Moskusgrillen", "Crispy Chicken House", "Snoopy Fast Food", "Kaupanger Storkiosk", "Piri Piri Lyngdal", "Snack House", "Plenty Snack Bar"],
  kantine: ["Rådhuskantina Tromsø Kommune", "Velferdskantine Ramsund"],
};

// Navn som ligner på et nøkkelord, men ikke hører til kategorien.
const IKKE: Array<[string, Kategori]> = [
  ["Skafferiet", "annet"], // "kaffe" inni et annet ord
  ["Taverna Santorini", "annet"], // gresk taverna, ikke bar
  ["Pastabakeren AS", "italiensk"], // pasta, ikke bakeri
  ["Caspars Smørrebrød", "annet"],
  ["Indie", "annet"],
  ["Max Grill Stovner Senter", "gatekjokken"], // ikke Max Burgers
  ["Maxi Fast Food", "gatekjokken"],
  ["Max Kebab", "kebab"],
  ["Max Thai", "asiatisk"],
  ["Ex Machina", "annet"],
  ["Byblos Orientalsk grill", "gatekjokken"], // libanesisk
  ["Kristiansand dyrepark - Bambuskiosken", "gatekjokken"],
  ["City Bar og Diner", "bar"],
  ["Kulleseidkanalen Gjestehamn", "annet"],
  ["Republic", "annet"],
  ["Tablå restaurant", "restaurant"], // "tabla" etter asciiFold, men ikke indisk
  ["Frida & Karlo", "annet"],
  ["Café Turisthytta", "kafe"], // kafé, ikke overnatting
  ["Palace Grill Restaurant", "restaurant"], // grillrestaurant, ikke gatekjøkken
  ["Vossevangen Grill- & Steakhouse", "restaurant"],
  ["Kroverten Mat og grillhus", "annet"],
  ["Evenes Grill & Bar", "bar"],
  ["Aurora Food Bar", "annet"], // "food bar" er ikke en bar
  ["Pasta Bar restaurant", "italiensk"], // pastabar, ikke bar
  ["Mei & Dei", "annet"], // kinesiske stavelser skal ikke treffe norske ord
  ["Hai på CC, restaurant og kafe", "kafe"],
  ["Lai’s Bistro", "kafe"],
  ["Taki Lin Storkiosk", "gatekjokken"],
  ["Kong Oscar Biljard & Dart Pub", "bar"],
  ["Fjord shack", "annet"],
  ["Milano Restaurant", "restaurant"], // ikke pizza, og navnet alene sier ikke kjøkken
  ["Trattoria Popolare", "italiensk"],
  ["Motz og Kringla Fisketorget", "annet"], // Fisketorget er et sted, ikke sjømat
  ["Big Fish Cafe", "kafe"],
  ["Sharma Kitchen", "annet"], // ikke "sham"
  ["Brasilia Trondheim", "annet"],
  ["Hotel Milano", "hotell"],
];

describe("kategoriFraNavn", () => {
  for (const [kategori, navn] of Object.entries(TREFF)) {
    it(`finner ${kategori}`, () => {
      expect(navn.filter((n) => kategoriFraNavn(n) !== kategori)).toEqual([]);
    });
  }

  it.each(IKKE)("gir ikke falske treff: %s", (navn, forventet) => {
    expect(kategoriFraNavn(navn)).toBe(forventet);
  });

  it("lar første regel vinne ved flere treff", () => {
    expect(kategoriFraNavn("Pizza & Kebab")).toBe("pizza");
    expect(kategoriFraNavn("Sushi & Thai")).toBe("sushi");
    expect(kategoriFraNavn("Bens Kafe og Motell AS")).toBe("hotell");
  });

  it("bruker kjedens kategori, og navnereglene når kjeden har blandet meny", () => {
    const kat = (navn: string) => kategoriForSted(navn, kjedeFraNavn(navn));
    expect(kat("Jønk Grorud")).toBe("burger");
    expect(kat("Kompis Lade")).toBe("burger");
    expect(kat("The Shack Madla")).toBe("burger");
    expect(kat("Villa Paradiso Ole Bull")).toBe("pizza");
    expect(kat("Butterfly Grålum")).toBe("bakeri");
    expect(kat("Snurr City Lade")).toBe("bakeri");
    expect(kat("Sirkus Renaa Lagårdsveien")).toBe("bakeri");
    expect(kat("Biltema Trondheim Tiller")).toBe("kafe");
    expect(kat("Dattebayo Skien")).toBe("sushi");
    expect(kat("Hawaii Hamar")).toBe("sushi");
    expect(kat("Yips Sola")).toBe("asiatisk");
    expect(kat("MIX Sogndal")).toBe("gatekjokken");
    expect(kat("Jafs grill og pizza")).toBe("gatekjokken");
    expect(kat("Bambus Byporten Sushi")).toBe("sushi");
    expect(kat("Bambus Frogner")).toBe("asiatisk");
    expect(kat("Olivia Trondheim")).toBe("italiensk");
    expect(kat("Egon Solsiden")).toBe("restaurant");
    expect(kat("Subway Asker")).toBe("gatekjokken");
  });

  it("kjenner igjen kjeder med varianter av navnet", () => {
    expect(kjedeFraNavn("Yummytime Gausel")?.slug).toBe("yummy-time");
    expect(kjedeFraNavn("Jordbærpikenene Lagunen")?.slug).toBe("jordbaerpikene");
    expect(kjedeFraNavn("Samson Majorstuen")?.slug).toBe("w-b-samson");
    expect(kjedeFraNavn("Baker Samson Avdeling CC Vest")?.slug).toBe("w-b-samson");
    expect(kjedeFraNavn("Jønk Grorud")?.slug).toBe("jonk");
    expect(kjedeFraNavn("MAX Grønland")?.slug).toBe("max-burgers");
    expect(kjedeFraNavn("Max Kebab")).toBeNull();
    expect(kjedeFraNavn("Max Grill Stovner Senter")).toBeNull();
    expect(kjedeFraNavn("Snurr Ski AS")).toBeNull(); // ikke Snurr-bakeriene i Trøndelag
    expect(kjedeFraNavn("Kristiansand dyrepark - Bambuskiosken")).toBeNull();
    expect(kjedeFraNavn("Lett Aker Brygge")?.slug).toBe("lett");
    expect(kjedeFraNavn("Grenland lett mett AS")).toBeNull();
  });

  it("matcher genererte datafiler (kjør npm run reclassify ved regelendringer)", () => {
    const root = process.cwd();
    const datasett = JSON.parse(fs.readFileSync(path.join(root, "generated", "steder.json"), "utf8")) as Datasett;
    const kart = JSON.parse(fs.readFileSync(path.join(root, "public", "data", "kart.json"), "utf8")) as KartData;
    const kartKat = new Map(kart.steder.map((r) => [r[KART.SLUG], kart.kategorier[r[KART.KATEGORI]]]));
    const { brreg, osm } = lesKilder();
    const kilderFor = lagKildeoppslag(brreg, osm);

    const avvikSteder = datasett.steder.filter((s) => s.kategori !== kategoriForSted(s.navn, kjedeFraNavn(s.navn), kilderFor(s)));
    const avvikKart = datasett.steder.filter((s) => kartKat.has(s.slug) && kartKat.get(s.slug) !== s.kategori);

    expect(avvikSteder.map((s) => s.navn)).toEqual([]);
    expect(avvikKart.length).toBe(0);
  });
});

describe("kategoriForSted med kilder", () => {
  const kat = (navn: string, kilder: Kilder) => kategoriForSted(navn, kjedeFraNavn(navn), kilder);
  const osm = (type: string, kjokken: string | null = null) => ({ type, kjokken });

  it("deler filteret i kjøkken og stedtype uten overlapp", () => {
    const alle = [...KJOKKEN_KATEGORIER, ...STEDTYPE_KATEGORIER];
    expect(new Set(alle).size).toBe(alle.length);
    expect([...alle].sort()).toEqual(Object.keys(KATEGORI_NAVN).sort());
  });

  it("leser bransjen fra næringskoden, både SN2025 og SN2007", () => {
    expect(bransjeFraKode("56.110")).toBe("servering");
    expect(bransjeFraKode("56.101")).toBe("servering");
    expect(bransjeFraKode("56.300")).toBe("bar");
    expect(bransjeFraKode("56.210")).toBe("kantine");
    expect(bransjeFraKode("55.300")).toBe("hotell");
    expect(bransjeFraKode("10.710")).toBe("bakeri");
    expect(bransjeFraKode("47.240")).toBe("bakeri");
    expect(bransjeFraKode("47.110")).toBe("butikk");
    expect(bransjeFraKode("50.102")).toBe("annet");
    expect(bransjeFraKode(null)).toBeNull();
  });

  it("gir restauranter uten kjent kjøkken egen kategori, skilt fra butikker, museer og ferjer", () => {
    expect(kat("Maaemo", { naeringskode: "56.110" })).toBe("restaurant");
    expect(kat("MF Fodnes", { naeringskode: "50.102" })).toBe("annet");
    expect(kat("Fetsund lensemuseum", { naeringskode: "91.212" })).toBe("annet");
    expect(kat("Kongen Marina AS", { naeringskode: "47.300", osm: osm("restaurant") })).toBe("restaurant");
    expect(kat("Maaemo", {})).toBe("annet"); // uten kilder vet vi ikke at det er en restaurant
  });

  it("finner kjøkken i OpenStreetMap når navnet er nøytralt", () => {
    expect(kat("Uno Marineholmen", { naeringskode: "56.110", osm: osm("restaurant", "pizza") })).toBe("pizza");
    expect(kat("Feniqia Oslo", { naeringskode: "56.110", osm: osm("restaurant", "lebanese") })).toBe("midtosten");
    expect(kat("Koie Munch", { naeringskode: "56.110", osm: osm("restaurant", "ramen") })).toBe("asiatisk");
    // Navnet går foran: «Sushi & Thai» er sushi selv om OSM sier thai først.
    expect(kat("Sushi & Thai", { naeringskode: "56.110", osm: osm("restaurant", "thai;sushi") })).toBe("sushi");
  });

  it("bruker ikke OSM-menyer med litt av alt, eller kafeer som også selger burger", () => {
    expect(kat("Hygge", { naeringskode: "56.110", osm: osm("restaurant", "burger;fine_dining;fish;pasta;pizza;sandwich") })).toBe("restaurant");
    expect(kat("Lierkroa", { naeringskode: "56.110", osm: osm("restaurant", "regional;burger;italian") })).toBe("restaurant");
    expect(kat("Ny Kafé", { naeringskode: "56.110", osm: osm("cafe", "burger") })).toBe("kafe");
    expect(kat("Eckers Frogner", { naeringskode: "56.110", osm: osm("cafe", "sandwich;coffee_shop") })).toBe("kafe");
  });

  it("lar navnet slå næringskoden for hotell, bar og catering, som ofte er eierens", () => {
    expect(kat("26 North", { naeringskode: "55.100" })).toBe("hotell");
    expect(kat("Mt. Mocca", { naeringskode: "55.100" })).toBe("kafe");
    expect(kat("Restaurant Skalden", { naeringskode: "55.100" })).toBe("restaurant");
    expect(kat("Brustranda Fjordcamping", { naeringskode: "55.300", osm: osm("cafe") })).toBe("kafe");
    expect(kat("Adams coffee", { naeringskode: "56.300" })).toBe("kafe");
    expect(kat("Gledeshuset", { naeringskode: "56.300" })).toBe("bar");
    expect(kat("Viking Wraps AS", { naeringskode: "56.210" })).toBe("kantine");
    expect(kat("Malai", { naeringskode: "56.210", registernavn: "MALAI THAI CATERING" })).toBe("asiatisk");
  });

  it("lar bakerikoden slå kafé i navnet, men ikke kjøkken", () => {
    expect(kat("Kafe Midtpunktet AS", { naeringskode: "10.710" })).toBe("bakeri");
    expect(kat("Motz og Kringla Fisketorget", { naeringskode: "10.710", osm: osm("bakery") })).toBe("bakeri");
    expect(kat("Pizzeria Bakeriet", { naeringskode: "10.710" })).toBe("pizza");
  });

  it("bruker navnet i Enhetsregisteret og registrert aktivitet som siste kilder for kjøkken", () => {
    expect(kat("Chili Restaurant", { naeringskode: "56.110", registernavn: "CHILI SZEHUAN RESTAURANT" })).toBe("asiatisk");
    expect(kat("Five Rivers", { naeringskode: "56.110", aktivitet: "Serveringsvirksomhet - salg kjøp av indisk mat og takeaway" })).toBe("indisk");
    expect(kat("Casa Bella", { naeringskode: "56.110", aktivitet: "Produksjon og salg av pizza, kebab, hamburger." })).toBe("restaurant");
    // Aktiviteten er hovedenhetens: den slår ikke et navn som sier hva slags sted det er.
    expect(kat("Håkon Gjestehus", { naeringskode: "56.110", aktivitet: "Thailandske retter og gjestehus" })).toBe("hotell");
    expect(kat("Tiramisu Kaffebar", { naeringskode: "56.110", aktivitet: "Drift av pizzarestaurant" })).toBe("kafe");
    // OSM-kjøkken gjelder bare restauranter og gatekjøkken, og ikke steder med hotellnavn.
    expect(kat("Flåm", { naeringskode: "56.110", osm: osm("bakery", "pizza") })).toBe("bakeri");
    expect(kat("Lodge 900", { naeringskode: "56.110", osm: osm("restaurant", "italian") })).toBe("hotell");
    // Registernavnet brukes bare når navnet på døra ikke sier noe: Polka Grill er ikke sjømat.
    expect(kat("Polka Grill & Spiseri", { naeringskode: "56.110", registernavn: "FISH & COW AS" })).toBe("gatekjokken");
  });

  it("tar bare aktivitet som nevner nøyaktig ett kjøkken", () => {
    expect(kjokkenFraAktivitet("Restaurantdrift og take-away med fokus på vietnamesisk mat.")).toBe("asiatisk");
    expect(kjokkenFraAktivitet("Restaurant, pizzeria og cateringvirksomhet")).toBe("pizza");
    expect(kjokkenFraAktivitet("Salg av asiatisk mat, sushi, og andre tilhørende produkter")).toBeNull();
    expect(kjokkenFraAktivitet("Drift av restaurant")).toBeNull();
    expect(kjokkenFraAktivitet(null)).toBeNull();
  });
});
