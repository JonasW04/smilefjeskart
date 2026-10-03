import type { Metadata } from "next";
import Link from "next/link";
import Kalibrering from "@/components/prediksjon/Kalibrering";
import RisikoStolper, { type RisikoRad } from "@/components/prediksjon/RisikoStolper";
import Rytme from "@/components/prediksjon/Rytme";
import Smiley from "@/components/Smiley";
import { KATEGORI_EMOJI, KATEGORI_NAVN } from "@/lib/classify";
import type { Metrikk } from "@/lib/prediksjon/metrikker";
import type { ModellRapport } from "@/lib/prediksjon/typer";
import { getSteder } from "@/lib/server/data";
import { getPrediksjon, getStedPrediksjon } from "@/lib/server/prediksjon";
import { kindFromKarakter } from "@/lib/smiley";
import { dagerMellom, formatDato, prosent as prosentMedMellomrom, sisteTilsyn } from "@/lib/stats";
import type { Sted } from "@/lib/types";

const SITE = "https://smilefjeskartet.no";
const TITTEL = "Spåkula: hvem får besøk av Mattilsynet snart? | Smilefjeskartet";
const BESKRIVELSE =
  "En statistisk modell trent på alle Mattilsynets smilefjestilsyn siden 2016 spår hvilke serveringssteder som trolig får ordinært tilsyn de neste 60 dagene – og hvordan neste tilsyn pleier å gå. Med ærlig tilbaketest.";

export const metadata: Metadata = {
  title: TITTEL,
  description: BESKRIVELSE,
  alternates: { canonical: `${SITE}/prediksjon` },
  openGraph: { title: TITTEL, description: BESKRIVELSE, url: `${SITE}/prediksjon`, type: "website", locale: "nb_NO", siteName: "Smilefjeskartet" },
  twitter: { card: "summary_large_image", title: TITTEL, description: BESKRIVELSE },
};

type SearchParams = { fylke?: string | string[]; kommune?: string | string[] };

const ANTALL_I_LISTE = 15;
const MIN_STEDER_KATEGORI = 30;

/** Prosent med hardt mellomrom, så «26 %» aldri brekkes over to linjer. */
const prosent = (x: number, desimaler = 0) => prosentMedMellomrom(x, desimaler).replace(" ", "\u00a0");

const tall = (x: number, desimaler = 0) =>
  x.toLocaleString("nb-NO", { minimumFractionDigits: desimaler, maximumFractionDigits: desimaler });

const forsteVerdi = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function sisteOrdinaere(s: Sted) {
  for (let i = s.tilsyn.length - 1; i >= 0; i--) if (!s.tilsyn[i].oppfolging) return s.tilsyn[i];
  return s.tilsyn[0];
}

const ETTER_SISTE: Record<number, { tekst: string; bg: string }> = {
  0: { tekst: "Smil uten anmerkninger", bg: "bg-smil-soft" },
  1: { tekst: "Smil med små avvik", bg: "bg-smil-soft" },
  2: { tekst: "Strekmunn", bg: "bg-strek-soft" },
  3: { tekst: "Sur munn", bg: "bg-sur-soft" },
};

export default async function PrediksjonSide({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const d = getPrediksjon();

  if (!d) {
    return (
      <div className="card mx-auto max-w-2xl space-y-3 p-6 text-center">
        <p className="text-5xl" aria-hidden>🔮</p>
        <h1 className="font-display text-3xl font-extrabold">Spåkula er tåkete i dag</h1>
        <p className="text-ink-soft">Prediksjonene er ikke beregnet ennå. Prøv igjen senere.</p>
      </div>
    );
  }

  const steder = getSteder();

  // --- Områdevalg -----------------------------------------------------------
  const fylker = [...new Map(steder.filter((s) => s.fylkenr && s.fylke).map((s) => [s.fylkenr!, s.fylke!]))].sort((a, b) =>
    a[1].localeCompare(b[1], "nb"),
  );
  const kommuneParam = forsteVerdi(sp.kommune);
  const valgtKommune = kommuneParam ? steder.find((s) => s.kommunenr === kommuneParam) : undefined;
  const fylkeParam = valgtKommune?.fylkenr ?? forsteVerdi(sp.fylke);
  const valgtFylke = fylker.find(([nr]) => nr === fylkeParam);
  const kommuner = valgtFylke
    ? [...new Map(steder.filter((s) => s.fylkenr === valgtFylke[0] && s.kommunenr && s.kommune).map((s) => [s.kommunenr!, s.kommune!]))].sort((a, b) =>
        a[1].localeCompare(b[1], "nb"),
      )
    : [];
  const omraadeNavn = valgtKommune?.kommune ?? valgtFylke?.[1] ?? "hele Norge";

  const utvalg = steder
    .filter((s) => (valgtKommune ? s.kommunenr === valgtKommune.kommunenr : valgtFylke ? s.fylkenr === valgtFylke[0] : true))
    .map((s) => ({ s, p: getStedPrediksjon(s.slug) }))
    .filter((x): x is { s: Sted; p: NonNullable<typeof x.p> } => x.p !== null);
  const forventetIUtvalg = utvalg.reduce((sum, x) => sum + x.p.besok, 0);
  const topp = [...utvalg].sort((a, b) => b.p.besok - a.p.besok || a.s.navn.localeCompare(b.s.navn, "nb")).slice(0, ANTALL_I_LISTE);

  // --- Nøkkeltall -------------------------------------------------------------
  const b = d.besok;
  const u = d.utfall;
  const loeft = b.modell.toppDesil / b.modell.snittFaktisk;
  const testFra = formatDato(b.folder[0]?.fra ?? d.dataDato);
  const testTil = formatDato(u.folder[u.folder.length - 1]?.til ?? d.dataDato);

  const trend = daarligAndelTrend(steder, d.dataDato);

  const kategoriRader: RisikoRad[] = u.perKategori
    .filter((k) => k.steder >= MIN_STEDER_KATEGORI)
    .map((k) => ({ navn: `${KATEGORI_EMOJI[k.kategori]} ${KATEGORI_NAVN[k.kategori]}`, spadd: k.snitt, observert: k.observert, nObservert: k.nObservert, steder: k.steder }));
  const fylkeRader: RisikoRad[] = u.perFylke.map((f) => ({ navn: f.fylke, spadd: f.snitt, observert: f.observert, nObservert: f.nObservert, steder: f.steder }));

  return (
    <div className="space-y-8">
      {/* Hero ---------------------------------------------------------------- */}
      <header className="card relative overflow-hidden bg-accent-soft p-5 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
          <div className="pop-in grid h-28 w-28 shrink-0 -rotate-6 place-items-center rounded-full border-2 border-line bg-card text-6xl sticker" aria-hidden>
            🔮
          </div>
          <div className="min-w-0 space-y-3">
            <p className="text-sm font-bold uppercase tracking-wide text-ink-soft">Spåkula</p>
            <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-5xl">Hvem får besøk av Mattilsynet snart?</h1>
            <p className="max-w-3xl text-lg text-ink-soft">
              Mattilsynet sier ikke fra før de kommer. Men {tall(steder.reduce((n, s) => n + s.tilsyn.length, 0))} tilsyn siden 2016 avslører en
              rytme. Vi har lært en liten statistisk modell å lese den, og latt den spå to ting for hvert sted på kartet. Tenk værmelding, ikke
              dom: 30 % sjanse for regn betyr at det som oftest holder seg tørt.
            </p>
            <p className="text-sm text-ink-soft">
              Data til og med {formatDato(d.dataDato)}. Modellen trenes på nytt hver natt.
            </p>
          </div>
        </div>
        <dl className="mt-6 grid gap-3 border-t-2 border-dashed border-line/40 pt-5 sm:grid-cols-3">
          <Tall verdi={`≈ ${tall(b.forventet)}`} tekst={`ordinære tilsyn ventet hos stedene på kartet de neste ${d.horisont} dagene (pluss nye steder vi ikke kjenner ennå)`} />
          <Tall
            verdi={`${tall(loeft, 1)}×`}
            tekst="så ofte fikk «topp 10 %» faktisk besøk, sammenlignet med snittet, da vi testet modellen på perioder den ikke hadde sett"
          />
          <Tall verdi={prosent(u.landSnitt)} tekst="snittsjanse for strekmunn eller sur munn ved neste ordinære tilsyn" />
        </dl>
      </header>

      <nav aria-label="Innhold på siden" className="flex flex-wrap gap-2">
        <a className="chip" href="#besok">🚪 Besøk snart</a>
        <a className="chip" href="#utfall">🎲 Neste tilsyn</a>
        <a className="chip" href="#kvalitet">🎯 Hvor god er spåkula?</a>
        <a className="chip" href="#metode">🔧 Slik fungerer modellen</a>
      </nav>

      {/* Besøk snart ----------------------------------------------------------- */}
      <section id="besok" className="scroll-mt-6 space-y-4" aria-labelledby="besok-tittel">
        <div className="space-y-2">
          <h2 id="besok-tittel" className="font-display text-3xl font-extrabold tracking-tight">🚪 Sannsynlig besøk snart</h2>
          <p className="max-w-3xl text-ink-soft">
            Sjansen for at stedet får et <strong className="text-ink">ordinært tilsyn</strong> i løpet av de neste {d.horisont} dagene. Oppfølgingstilsyn
            etter strekmunn og sur munn er holdt utenfor: de kommer nesten alltid etter noen få dager og er ingen kunst å spå.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="card space-y-4 p-5 sm:p-6 lg:col-span-3">
            <nav aria-label="Velg fylke" className="space-y-2">
              <p className="text-sm font-bold">Område</p>
              <ul className="flex flex-wrap gap-1.5">
                <li>
                  <OmraadeChip href="/prediksjon#besok" aktiv={!valgtFylke}>Hele Norge</OmraadeChip>
                </li>
                {fylker.map(([nr, navn]) => (
                  <li key={nr}>
                    <OmraadeChip href={`/prediksjon?fylke=${nr}#besok`} aktiv={valgtFylke?.[0] === nr && !valgtKommune}>{navn}</OmraadeChip>
                  </li>
                ))}
              </ul>
            </nav>
            {kommuner.length > 1 && (
              <nav aria-label={`Velg kommune i ${valgtFylke?.[1]}`} className="space-y-2">
                <p className="text-sm font-bold">Kommune i {valgtFylke?.[1]}</p>
                <ul className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                  {kommuner.map(([nr, navn]) => (
                    <li key={nr}>
                      <OmraadeChip href={`/prediksjon?kommune=${nr}#besok`} aktiv={valgtKommune?.kommunenr === nr}>{navn}</OmraadeChip>
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            <div className="rounded-2xl bg-paper p-3 text-sm">
              <strong>{omraadeNavn[0].toUpperCase() + omraadeNavn.slice(1)}:</strong> {tall(utvalg.length)} steder. Modellen venter ≈ {tall(forventetIUtvalg)} ordinære
              tilsyn hos dem de neste {d.horisont} dagene.
            </div>

            {topp.length === 0 ? (
              <p className="text-ink-soft">Ingen steder å vise her.</p>
            ) : (
              <ol className="space-y-1">
                {topp.map(({ s, p }, i) => {
                  const sist = sisteOrdinaere(s);
                  return (
                    <li key={s.id}>
                      <Link href={`/sted/${s.slug}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-accent-soft">
                        <span className="w-5 shrink-0 text-right text-sm font-bold tabular-nums text-ink-soft">{i + 1}</span>
                        <Smiley kind={kindFromKarakter(sisteTilsyn(s).karakter)} size={30} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-bold">{s.navn}</span>
                          <span className="block text-xs text-ink-soft">
                            {s.kommune ?? s.poststed} · sist ordinære {siden(sist.dato, d.dataDato)}
                          </span>
                        </span>
                        <Sannsynlighet p={p.besok} />
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
            <p className="text-sm text-ink-soft">
              Selv på toppen er sjansen sjelden over 50 %. Mattilsynet planlegger etter risiko, tips og kapasitet, ikke bare etter kalenderen, og det
              meste av det ser ikke vi. Smilefjeset viser siste tilsyn.
            </p>
          </div>

          <aside className="card space-y-3 p-5 sm:p-6 lg:col-span-2" aria-labelledby="rytme-h">
            <h3 id="rytme-h" className="font-display text-xl font-extrabold">Mattilsynets rytme 🥁</h3>
            <p className="text-sm text-ink-soft">
              Den viktigste ledetråden er tiden siden forrige ordinære tilsyn. Rett etter et besøk skjer nesten ingenting. Så kommer to topper:
              mange steder får tilsyn omtrent hvert år, andre omtrent annethvert år. Modellen lærer også hvert steds egen rytme.
            </p>
            <Rytme boetter={b.rytme} horisont={d.horisont} />
            <p className="text-xs text-ink-soft">
              Faktiske tall fra {b.antallSnapshots} månedlige øyeblikksbilder siden 2017, ikke modellens spådommer.
            </p>
          </aside>
        </div>
      </section>

      {/* Utfall ------------------------------------------------------------------ */}
      <section id="utfall" className="scroll-mt-6 space-y-4" aria-labelledby="utfall-tittel">
        <div className="space-y-2">
          <h2 id="utfall-tittel" className="font-display text-3xl font-extrabold tracking-tight">🎲 Hvordan går neste tilsyn?</h2>
          <p className="max-w-3xl text-ink-soft">
            Når Mattilsynet kommer på ordinært tilsyn: hvor stor er sjansen for strekmunn eller sur munn? Her viser vi snitt for grupper av steder,
            ikke lister over enkeltsteder. Et tall for ett enkelt sted er et grovt statistisk anslag ut fra offentlig historikk, ikke en dom over
            kjøkkenet slik det er i dag.
          </p>
        </div>

        <div className="card space-y-4 p-5 sm:p-6">
          <h3 className="font-display text-xl font-extrabold">Historikken teller</h3>
          <p className="text-sm text-ink-soft">
            Andel ordinære tilsyn som endte med strekmunn eller sur munn, etter hvordan det gikk ved forrige ordinære tilsyn (2017–{d.dataDato.slice(0, 4)}).
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {u.etterSiste.map((e) => (
              <li key={e.karakter} className={`flex items-center gap-3 rounded-2xl border-2 border-line/20 p-3 ${ETTER_SISTE[e.karakter].bg}`}>
                <Smiley kind={kindFromKarakter(e.karakter)} size={40} />
                <div>
                  <p className="text-xs font-semibold text-ink-soft">Forrige gang: {ETTER_SISTE[e.karakter].tekst.toLowerCase()}</p>
                  <p className="font-display text-2xl font-extrabold">{prosent(e.andel)}</p>
                  <p className="text-xs text-ink-soft">strek/sur neste gang · {tall(e.n)} tilsyn</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-soft">
            Ett dårlig tilsyn gjør altså et nytt mer sannsynlig, men selv etter en sur munn går de fleste neste ordinære tilsyn fint.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="card p-5 sm:p-6">
            <RisikoStolper id="kategori" tittel="Etter type sted" rader={kategoriRader} />
            <p className="mt-3 text-xs text-ink-soft">
              Typen er gjettet fra stedsnavnet, så den kan bomme. «Restaurant og annet» er alt vi ikke kjenner igjen. Typer med færre enn{" "}
              {MIN_STEDER_KATEGORI} steder er utelatt.
            </p>
          </div>
          <div className="card p-5 sm:p-6">
            <RisikoStolper id="fylke" tittel="Etter fylke" rader={fylkeRader} />
            <p className="mt-3 text-xs text-ink-soft">
              Forskjellene mellom fylker kan like gjerne handle om ulik praksis hos Mattilsynets lokale kontorer som om ulik hygiene.
            </p>
          </div>
        </div>
        <p className="text-sm text-ink-soft">
          «Spådd» er snittet av modellens sannsynligheter for stedene som finnes i dag. «Faktisk» er andelen av alle ordinære tilsyn de siste tre
          årene.
          {u.landSnitt < trend.sisteTreAar - 0.01 && " Spådd ligger lavere fordi andelen strekmunn har falt det siste året, og modellen følger med på det."}
          {u.landSnitt > trend.sisteTreAar + 0.01 && " Spådd ligger høyere fordi andelen strekmunn har steget det siste året, og modellen følger med på det."}
        </p>
      </section>

      {/* Kvalitet ----------------------------------------------------------------- */}
      <section id="kvalitet" className="scroll-mt-6 space-y-4" aria-labelledby="kvalitet-tittel">
        <div className="space-y-2">
          <h2 id="kvalitet-tittel" className="font-display text-3xl font-extrabold tracking-tight">🎯 Hvor god er spåkula?</h2>
          <p className="max-w-3xl text-ink-soft">
            Vi testet modellen slik den faktisk brukes: trent bare på det som var kjent på et tidspunkt, og så sjekket mot det som skjedde etterpå.
            Det gjorde vi for tre ettårsperioder fra {testFra} til {testTil}. Hver periode ble spådd av en modell som aldri hadde sett den. Så sammenlignet
            vi med to enkle tommelfingerregler.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <KvalitetsKort
            tittel="🚪 Besøk innen 60 dager"
            rapport={b}
            heuristikk="Bare tid siden sist"
            dom={`Klart bedre enn tommelfingerregelen. Blant de 10 % stedene modellen rangerte høyest, fikk ${prosent(b.modell.toppDesil)} faktisk besøk, mot ${prosent(b.modell.snittFaktisk)} i snitt.`}
          />
          <KvalitetsKort
            tittel="🎲 Strek/sur ved neste tilsyn"
            rapport={u}
            heuristikk="Bare forrige resultat"
            dom={`Moderat. Historikken sier noe, men langt fra alt: blant de 10 % høyest rangerte endte ${prosent(u.modell.toppDesil)} med strek eller sur, mot ${prosent(u.modell.snittFaktisk)} i snitt. De fleste «høyrisiko»-steder får altså smil.`}
          />
        </div>

        <div className="card space-y-4 p-5 sm:p-6">
          <h3 className="font-display text-xl font-extrabold">Mener modellen det den sier?</h3>
          <p className="text-sm text-ink-soft">
            Vi sorterte alle spådommene fra tilbaketesten i ti like store grupper og sammenlignet snittet med fasiten. Ligger prikkene på
            diagonalen, betyr «20 %» faktisk 20 %. Hold musa over en prikk for detaljer.
          </p>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Kalibrering id="kal-besok" tittel="Besøk innen 60 dager" punkter={b.kalibrering} />
            <Kalibrering id="kal-utfall" tittel="Strek/sur ved neste tilsyn" punkter={u.kalibrering} />
          </div>
          <p className="text-sm text-ink-soft">
            I snitt bommer gruppene med {tall(kalibreringsavvik(b) * 100, 1)} prosentpoeng for besøk og {tall(kalibreringsavvik(u) * 100, 1)} for
            strek/sur. Utfallsmodellen er minst stødig, mest fordi andelen strekmunn svinger fra år til år.
          </p>
        </div>
      </section>

      {/* Metode --------------------------------------------------------------------- */}
      <section id="metode" className="card scroll-mt-6 space-y-5 p-5 sm:p-8" aria-labelledby="metode-tittel">
        <h2 id="metode-tittel" className="font-display text-3xl font-extrabold tracking-tight">🔧 Slik fungerer modellen</h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="font-display text-xl font-extrabold">Hva den ser på</h3>
            <ul className="list-disc space-y-1.5 pl-5 text-ink-soft">
              <li>Tid siden forrige ordinære tilsyn, og om det er lenger eller kortere enn stedets egen rytme.</li>
              <li>Hvordan det gikk sist, og hvor mange og hvor ferske strekmunner og sure munner stedet har hatt.</li>
              <li>Stedets andel smil over tid, krympet mot landssnittet så steder med få tilsyn ikke får ekstreme tall.</li>
              <li>Type sted og om det er en kjede (begge gjettet fra navnet).</li>
              <li>Hvor travelt Mattilsynet har hatt det i kommunen og fylket de siste månedene, og hvordan det har gått der.</li>
              <li>Måned (sommer og jul er stille), og landssnittet det siste året.</li>
            </ul>
          </div>
          <div className="space-y-3">
            <h3 className="font-display text-xl font-extrabold">Hvordan den lærer</h3>
            <p className="text-ink-soft">
              To logistiske regresjoner, trent i ren TypeScript. For besøk tok vi et «øyeblikksbilde» av alle steder den 1. hver måned siden 2017 (
              {b.antallSnapshots} bilder, {tall(b.nTrening)} eksempler) og spurte: fikk stedet ordinært tilsyn de neste {d.horisont} dagene? For utfall
              brukte vi {tall(u.nTrening)} ordinære tilsyn hos steder med historikk. Hvert eksempel ser bare på det som var kjent dagen før.
            </p>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl bg-strek-soft p-4 sm:p-5">
          <h3 className="font-display text-xl font-extrabold">Begrensninger ⚠️</h3>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>Bare overlevende.</strong> Datasettet har bare steder som fortsatt er registrert. Nedlagte steder er borte, så historisk ser det ut som
              om alle til slutt får besøk. Et sted som har stengt nylig, kan få for høy besøkssjanse.
            </li>
            <li>
              <strong>Vi ser ikke Mattilsynets kort.</strong> Risikovurderinger, klager og tips styrer mye av hvem som får besøk, og de er ikke
              offentlige.
            </li>
            <li>
              <strong>Nivået flytter seg.</strong> Andelen strekmunn eller sur munn ved ordinære tilsyn var {prosent(trend.foersteAar)} i{" "}
              {trend.aar[0]} og {prosent(trend.iAar)} hittil i {trend.aar[1]}. Modellen følger med via landssnittet, men brå endringer fanges sent.
            </li>
            <li>
              <strong>Nye eiere, samme navn.</strong> Et sted som har byttet eier eller kokk, arver historikken til den gamle driften.
            </li>
            <li>
              <strong>Sannsynlighet, ikke skjebne.</strong> Et sted med høy spådd risiko har ikke gjort noe galt i dag. Tallet sier bare hvordan steder
              med lignende historikk har gått tidligere.
            </li>
          </ul>
        </div>
        <p className="text-sm text-ink-soft">
          Smilefjeskartet er et uavhengig prosjekt og har ingen kontakt med Mattilsynet. Les mer om dataene på <Link className="link" href="/om">Om-siden</Link>.
        </p>
      </section>
    </div>
  );
}

/** «for 13 mnd siden» – måneder er mer presist enn «for ett år siden» når rytmen er årlig. */
function siden(iso: string, iDag: string): string {
  const dager = dagerMellom(iso, iDag);
  if (dager < 60) return `for ${dager} dager siden`;
  return `for ${Math.round(dager / 30.44)} mnd siden`;
}

/** Snittlig absolutt avvik mellom spådd og faktisk i kalibreringsgruppene. */
function kalibreringsavvik(r: ModellRapport): number {
  return r.kalibrering.reduce((s, k) => s + Math.abs(k.predikert - k.faktisk), 0) / r.kalibrering.length;
}

/** Andel strek/sur ved ordinære tilsyn: første år i datasettet, i år og siste tre år. */
function daarligAndelTrend(steder: Sted[], dataDato: string) {
  const forsteAar = 2016;
  const iAar = Number(dataDato.slice(0, 4));
  const treAarSiden = `${iAar - 3}${dataDato.slice(4)}`;
  const teller = { forste: [0, 0], iAar: [0, 0], tre: [0, 0] };
  for (const s of steder) {
    for (const t of s.tilsyn) {
      if (t.oppfolging || t.karakter < 0) continue;
      const daarlig = t.karakter >= 2 ? 1 : 0;
      const aar = Number(t.dato.slice(0, 4));
      const tell = (c: number[]) => {
        c[0] += daarlig;
        c[1]++;
      };
      if (aar === forsteAar) tell(teller.forste);
      if (aar === iAar) tell(teller.iAar);
      if (t.dato >= treAarSiden) tell(teller.tre);
    }
  }
  const a = ([x, n]: number[]) => (n ? x / n : 0);
  return { aar: [forsteAar, iAar], foersteAar: a(teller.forste), iAar: a(teller.iAar), sisteTreAar: a(teller.tre) };
}

function Tall({ verdi, tekst }: { verdi: string; tekst: string }) {
  return (
    <div className="rounded-2xl bg-card/80 p-3">
      <dt className="sr-only">{tekst}</dt>
      <dd>
        <span className="block font-display text-3xl font-extrabold">{verdi}</span>
        <span className="text-sm font-semibold text-ink-soft" aria-hidden>{tekst}</span>
      </dd>
    </div>
  );
}

function OmraadeChip({ href, aktiv, children }: { href: string; aktiv: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={aktiv ? "page" : undefined} className={`chip ${aktiv ? "bg-ink text-paper hover:bg-ink" : ""}`}>
      {children}
    </Link>
  );
}

function Sannsynlighet({ p }: { p: number }) {
  return (
    <span className="flex w-20 shrink-0 flex-col items-end gap-1">
      <span className="text-sm font-extrabold tabular-nums">{prosent(p)}</span>
      <span className="block h-1.5 w-full overflow-hidden rounded-full bg-accent-soft" aria-hidden>
        <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, p * 100)}%` }} />
      </span>
    </span>
  );
}

function KvalitetsKort({ tittel, rapport, heuristikk, dom }: { tittel: string; rapport: ModellRapport; heuristikk: string; dom: string }) {
  const rader: Array<[string, Metrikk, boolean]> = [
    ["Modellen", rapport.modell, true],
    [heuristikk, rapport.heuristikk, false],
    ["Gjett snittet", rapport.grunnrate, false],
  ];
  const n = rapport.folder.reduce((s, f) => s + f.nTest, 0);
  return (
    <div className="card space-y-3 p-5 sm:p-6">
      <h3 className="font-display text-xl font-extrabold">{tittel}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{`${tittel}: modellen mot enkle tommelfingerregler i tilbaketesten`}</caption>
          <thead>
            <tr className="border-b-2 border-line">
              <th scope="col" className="py-2 pr-2">Metode</th>
              <th scope="col" className="py-2 pr-2 text-right" title="Rangering: 0,5 = myntkast, 1 = perfekt">AUC</th>
              <th scope="col" className="py-2 pr-2 text-right" title="Snittlig kvadratavvik mellom sannsynlighet og fasit – lavere er bedre">Brier</th>
              <th scope="col" className="py-2 text-right" title="Hvor mye lavere Brier-skåren er enn ved å gjette snittet">Mot snittet</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rader.map(([navn, m, hoved]) => (
              <tr key={navn} className={`border-b border-line/15 ${hoved ? "font-bold" : "text-ink-soft"}`}>
                <th scope="row" className="py-2 pr-2 text-left font-[inherit]">{navn}</th>
                <td className="py-2 pr-2 text-right">{tall(m.auc, 2)}</td>
                <td className="py-2 pr-2 text-right">{tall(m.brier, 3)}</td>
                <td className="py-2 text-right">{m.brierSkill === 0 ? "–" : `${m.brierSkill > 0 ? "+" : "−"}${prosent(Math.abs(m.brierSkill))}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm">{dom}</p>
      <p className="text-xs text-ink-soft">
        AUC per testår: {rapport.folder.map((f) => `${tall(f.aucModell, 2)} (${f.fra.slice(0, 4)}/${f.til.slice(2, 4)})`).join(" · ")}. {tall(n)} spådommer
        totalt. AUC er sjansen for at modellen gir høyere tall til et tilfeldig «ja» enn til et tilfeldig «nei» (0,5 = myntkast). Brier
        måler hvor nær sannsynlighetene er fasiten (lavere er bedre), og «mot snittet» er hvor mye bedre det er enn å gi alle samme tall.
      </p>
    </div>
  );
}
