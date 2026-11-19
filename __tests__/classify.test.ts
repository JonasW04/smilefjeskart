import { describe, expect, it } from "vitest";
import { kategoriFraNavn, type Kategori } from "@/lib/classify";

// Ekte navn fra Mattilsynets datasett som tidligere havnet i "Restaurant og annet".
const TREFF: Record<Exclude<Kategori, "annet">, string[]> = {
  indisk: [
    "Der Peppern Gror Via Village",
    "Namaste Ålesund AS",
    "Namastey Bergen",
    "New Tajmahal",
    "TajMahal Tandori Restaurant",
    "The Blue Taj",
    "New Anarkali Satwinder Singh",
    "Rasoi Ålesund Restaurant",
    "Haveli Kalbakken",
    "Koh i Nor",
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
  ],
  sushi: ["Sabrura Lade", "Sumo Karl Johan", "iSushi Forus", "Sabi Sush", "YESushi & Wok", "Maki Avdeling Bakklandet"],
  pizza: ["Mesterpizzerian", "ZiOPizza Stortingsgata", "Bella Napoli", "Mama Rosa Melhus", "Dobbel Margherita"],
  burger: ["Trønderburger", "Smash Buddies Ski", "MAX Grønland", "Max Egertorget", "Johnny Rockets Storo", "Brooklyn Diner"],
  kebab: ["Istanbul Grillkebab AS", "Gyros House", "Mr Shaworma AS"],
  meksikansk: ["El Camino Sandvika", "La Taqueria", "Las Cazuelas Sabor a Mexico", "Azteko"],
  bar: ["O’Learys Tromsø Airport", "Furu Gastropub", "Ægir Bryggeripub", "The Dubliner", "Trafalgar sportsbar"],
  kafe: ["Torsdagskaffe", "Kulturkafeen", "Gårdskafeen, Glasshytta Vikten", "Caffè Ritazza", "Kaffistova", "Vaffelbua"],
  bakeri: ["Backstube Grønland", "Kanelsnurren Tasta", "Solbrød Lagunen", "Geheb Conditori Markensgate", "Jærbakeren Sola"],
  hotell: ["Askvoll Fjordhotell", "Bygdin Høyfjellshotell", "Eidfjord Gjestgiveri", "Aure Gjestegård", "Geilo Mountain Lodge"],
  gatekjokken: ["Jafs Kongsberg", "Moskusgrillen", "Crispy Chicken House", "Snoopy Fast Food", "Kaupanger Storkiosk"],
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
});
