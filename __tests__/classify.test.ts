import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { kategoriForSted, kategoriFraNavn, kjedeFraNavn, type Kategori } from "@/lib/classify";
import { KART, type Datasett, type KartData } from "@/lib/types";

// Ekte navn fra Mattilsynets datasett som tidligere havnet i "Restaurant og annet".
const TREFF: Record<Exclude<Kategori, "annet">, string[]> = {
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
  ["Pastabakeren AS", "annet"], // pasta, ikke bakeri
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
  ["Restaurant Fjord", "annet"],
  ["Republic", "annet"],
  ["Bakgården Restaurant", "annet"],
  ["Mamma Mia", "annet"],
  ["Tablå restaurant", "annet"], // "tabla" etter asciiFold, men ikke indisk
  ["Frida & Karlo", "annet"],
  ["Café Turisthytta", "kafe"], // kafé, ikke overnatting
  ["Palace Grill Restaurant", "annet"], // grillrestaurant, ikke gatekjøkken
  ["Vossevangen Grill- & Steakhouse", "annet"],
  ["Kroverten Mat og grillhus", "annet"],
  ["Evenes Grill & Bar", "bar"],
  ["Aurora Food Bar", "annet"], // "food bar" er ikke en bar
  ["Pasta Bar restaurant", "annet"],
  ["Mei & Dei", "annet"], // kinesiske stavelser skal ikke treffe norske ord
  ["Hai på CC, restaurant og kafe", "kafe"],
  ["Lai’s Bistro", "kafe"],
  ["Taki Lin Storkiosk", "gatekjokken"],
  ["Kong Oscar Biljard & Dart Pub", "bar"],
  ["Fjord shack", "annet"],
  ["Milano Restaurant", "annet"], // italiensk restaurant, ikke pizza
  ["Trattoria Popolare", "annet"],
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
    expect(kat("Olivia Trondheim")).toBe("annet");
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

    const avvikSteder = datasett.steder.filter((s) => s.kategori !== kategoriForSted(s.navn, kjedeFraNavn(s.navn)));
    const avvikKart = datasett.steder.filter((s) => kartKat.has(s.slug) && kartKat.get(s.slug) !== s.kategori);

    expect(avvikSteder.length).toBe(0);
    expect(avvikKart.length).toBe(0);
  });
});
