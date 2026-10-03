import type { Metadata } from "next";
import Link from "next/link";
import Smiley from "@/components/Smiley";
import { Flis, Forklaring, Seksjon, TallTabell } from "@/components/analyse/Deler";
import Kolonner from "@/components/analyse/Kolonner";
import SmaaLinjer from "@/components/analyse/SmaaLinjer";
import { SmileySprite } from "@/components/analyse/SmileySprite";
import StedRader, { type StedRad } from "@/components/analyse/StedRader";
import StabelRader, { StabelForklaring } from "@/components/analyse/StabelRader";
import { anmerkningAndel, endringPp } from "@/lib/analyse";
import { aksePst, MND_KORT, MND_LANG, pp, tall, UKEDAGER } from "@/lib/chart";
import { KATEGORI_EMOJI, KATEGORI_NAVN } from "@/lib/classify";
import { analyse, MIN_KATEGORI } from "@/lib/server/analyse";
import { getOmrade, kommuner as kommunerAlle, MIN_KJEDE_STEDER, MIN_KOMMUNE, rangert } from "@/lib/server/omrader";
import { SMILE_LABEL, smileFromKarakter, TEMAER } from "@/lib/smile";
import { kindFromKarakter } from "@/lib/smiley";
import { andel, formatDato, prosent, sisteTilsyn } from "@/lib/stats";
import type { Sted } from "@/lib/types";

const SITE = "https://smilefjeskartet.no";

export const metadata: Metadata = {
  title: "Smilefjes i tall – analyse av Mattilsynets tilsyn | Smilefjeskartet",
  description:
    "Hvor går det best og verst? Utviklingen siden 2016, temaene som oftest gir strekmunn, sesong, fylker, kommuner, kjeder og kategorier – basert på alle Mattilsynets smilefjestilsyn.",
  alternates: { canonical: `${SITE}/analyse` },
  openGraph: {
    title: "Smilefjes i tall | Smilefjeskartet",
    description: "Utvikling, temaer, sesong, fylker, kommuner, kjeder og kategorier – alle Mattilsynets smilefjestilsyn siden 2016.",
    url: `${SITE}/analyse`,
    type: "website",
    locale: "nb_NO",
    siteName: "Smilefjeskartet",
  },
};

const NAV = [
  ["utvikling", "📈 Utvikling"],
  ["temaer", "🔍 Temaer"],
  ["sesong", "🗓️ Sesong"],
  ["fylker", "🗺️ Fylker"],
  ["kommuner", "🏘️ Kommuner"],
  ["kategorier", "🍕 Kategorier"],
  ["kjeder", "🔗 Kjeder"],
  ["siste", "🆕 Siste 7 dager"],
  ["fakta", "🤓 Fakta"],
] as const;

export default function AnalyseSide() {
  const a = analyse();
  const land = a.land;
  const landSmil = andel(land, "smil");
  const forsteAar = a.aar[0];
  const iAar = a.aar[a.aar.length - 1];
  const heleAar = a.heleAar ?? iAar;
  const badForst = anmerkningAndel(forsteAar.ordinaer);
  const badSiste = anmerkningAndel(heleAar.ordinaer);

  // Korona: marker 2020 bare hvis volumet faktisk falt tydelig.
  const aar2019 = a.aar.find((r) => r.aar === 2019);
  const aar2020 = a.aar.find((r) => r.aar === 2020);
  const koronaFall = aar2019 && aar2020 && aar2020.alle < aar2019.alle * 0.75 ? 1 - aar2020.alle / aar2019.alle : null;

  // Temaer
  const temaRader = a.tema.rader.map((r) => ({ ...r, andel: r.vurdert ? (r.strek + r.sur) / r.vurdert : 0 }));
  const verstTema = [...temaRader].sort((x, y) => y.andel - x.andel)[0];
  const temaMaks = Math.max(...temaRader.map((r) => r.andel));

  // Sesong
  const mnd = a.maaneder.map((m) => ({ ...m, bad: anmerkningAndel(m.ordinaer) }));
  const bestMnd = [...mnd].sort((x, y) => x.bad - y.bad)[0];
  const verstMnd = [...mnd].sort((x, y) => y.bad - x.bad)[0];
  const travlest = [...mnd].sort((x, y) => y.alle - x.alle)[0];
  const rolig = [...mnd].sort((x, y) => x.alle - y.alle)[0];
  const ukeSum = a.ukedager.reduce((s, n) => s + n, 0);
  const helg = a.ukedager[5] + a.ukedager[6];
  const travlesteDag = a.ukedager.indexOf(Math.max(...a.ukedager));

  // Grupper
  const fylker = rangert("fylke");
  const kommuner = rangert("kommune");
  const kjeder = rangert("kjede");
  const besteKommuner = kommuner.slice(0, 10);
  const svakesteKommuner = kommuner.slice(-10);

  // Siste 7 dager
  const siste7 = a.siste7;
  const siste7Daarlige = siste7.filter((x) => {
    const s = smileFromKarakter(x.tilsyn.karakter);
    return s === "strek" || s === "sur";
  });
  const fra7 = new Date(Date.parse(a.sluttDato) - 6 * 86_400_000).toISOString().slice(0, 10);

  const datasettLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Smilefjes per kommune – ordinære tilsyn",
    description:
      "Antall steder, tilsyn og utfall (smil, strekmunn, sur munn) av Mattilsynets ordinære smilefjestilsyn per kommune siden 2016.",
    url: `${SITE}/analyse`,
    license: "https://data.norge.no/nlod/no/2.0",
    isBasedOn: "https://data.norge.no/datasets/288aa74c-e3d3-492e-9ede-e71503b3bfd9",
    creator: { "@type": "Organization", name: "Smilefjeskartet", url: SITE },
    dateModified: a.generert,
    temporalCoverage: `${forsteAar.aar}-01-01/${a.sluttDato}`,
    spatialCoverage: "Norge",
    inLanguage: "nb",
    distribution: [{ "@type": "DataDownload", encodingFormat: "text/csv", contentUrl: `${SITE}/analyse/kommuner.csv` }],
  };

  return (
    <article className="space-y-8">
      <SmileySprite />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datasettLd).replace(/</g, "\\u003c") }} />

      {/* Hero */}
      <header className="card relative overflow-hidden bg-accent-soft p-5 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="text-sm font-bold uppercase tracking-wide text-ink-soft">
              Analyse · oppdatert {formatDato(a.generert.slice(0, 10))}
            </p>
            <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">Smilefjes i tall</h1>
            <p className="text-lg text-ink-soft">
              {tall(a.antallTilsyn)} tilsyn hos {tall(a.antallSteder)} serveringssteder siden {forsteAar.aar}. Hvor går det best, hva går
              oftest galt, og blir det faktisk renere på kjøkkenene?
            </p>
          </div>
          <div className="order-first flex shrink-0 items-end gap-1 self-start lg:order-none lg:self-center" aria-hidden>
            <span className="pop-in -rotate-12">
              <Smiley kind="smil" size={92} className="max-lg:h-16 max-lg:w-16" />
            </span>
            <span className="pop-in rotate-6" style={{ animationDelay: "90ms" }}>
              <Smiley kind="strek" size={68} className="max-lg:h-12 max-lg:w-12" />
            </span>
            <span className="pop-in -rotate-6" style={{ animationDelay: "180ms" }}>
              <Smiley kind="sur" size={52} className="max-lg:h-10 max-lg:w-10" />
            </span>
          </div>
        </div>
        <nav aria-label="Hopp til" className="mt-6 border-t-2 border-dashed border-line/30 pt-4">
          <ul className="flex flex-wrap gap-2">
            {NAV.map(([id, tekst]) => (
              <li key={id}>
                <a className="chip hover:bg-card" href={`#${id}`}>
                  {tekst}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {/* Nøkkeltall */}
      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Flis
          etikett="Tilsyn"
          verdi={tall(a.antallTilsyn)}
          under={`hvorav ${tall(a.aar.reduce((s, r) => s + r.oppfolging, 0))} oppfølginger`}
        />
        <Flis etikett="Steder" verdi={tall(a.antallSteder)} under={`i ${tall(kommunerAlle().length)} kommuner`} />
        <Flis
          etikett="Ordinære med smil"
          verdi={prosent(landSmil)}
          under={`${prosent(andel(land, "strek"))} strekmunn · ${prosent(andel(land, "sur"), 1)} sur munn`}
        />
        {a.hittil && a.hittilFjor && a.hittil.total > 0 && a.hittilFjor.total > 0 ? (
          <Flis
            etikett={`Hittil i ${iAar.aar}`}
            verdi={prosent(andel(a.hittil, "smil"))}
            under={`smil, ${pp(endringPp(andel(a.hittilFjor, "smil"), andel(a.hittil, "smil")))} mot samme periode i ${iAar.aar - 1}`}
          />
        ) : (
          <Flis etikett={`Smil i ${heleAar.aar}`} verdi={prosent(andel(heleAar.ordinaer, "smil"))} under="ordinære tilsyn" />
        )}
      </dl>

      {/* Hovedpoenget */}
      <section aria-labelledby="poeng-tittel" className="card grid gap-6 bg-paper-2 p-5 sm:p-6 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div className="space-y-3">
          <h2 id="poeng-tittel" className="font-display text-2xl font-extrabold leading-tight">
            Kartet smiler. Virkeligheten litt mindre.
          </h2>
          <p>
            Hele <strong>{prosent(a.sisteSmilAndel, 1)}</strong> av stedene har smil ved siste tilsyn. Det er ikke fordi alle er flinke:
            etter strekmunn kommer Mattilsynet typisk tilbake etter <strong>{a.oppfolging.strek.medianDager} dager</strong>, etter sur munn
            etter bare <strong>{a.oppfolging.sur.medianDager} dager</strong> (median), og {prosent(a.oppfolging.strek.nesteSmil)} av gangene
            blir det smil da.
          </p>
          <p className="text-ink-soft">
            Derfor bygger all statistikken her på <strong className="text-ink">ordinære tilsyn</strong>, de vanlige uanmeldte besøkene.
            Oppfølgingstilsyn er holdt utenfor.
          </p>
        </div>
        <div className="space-y-4">
          <StabelRader
            desimaler={1}
            rader={[
              {
                key: "siste",
                navn: "Siste smilefjes per sted",
                tekst: "Siste smilefjes per sted",
                fordeling: a.sisteFordeling,
                meta: "det kartet viser",
              },
              {
                key: "ord",
                navn: "Ordinære tilsyn",
                tekst: "Ordinære tilsyn",
                fordeling: land,
                meta: `${tall(land.total)} tilsyn siden ${forsteAar.aar}`,
              },
            ]}
          />
          <StabelForklaring />
        </div>
      </section>

      {/* Utvikling */}
      <Seksjon
        id="utvikling"
        emoji="📈"
        tittel={badSiste < badForst ? `Færre anmerkninger enn i ${forsteAar.aar}` : "Utviklingen siden 2016"}
        ingress={
          <>
            Andel ordinære tilsyn som endte med strekmunn eller sur munn, per år. I {forsteAar.aar} var det{" "}
            <strong className="text-ink">{prosent(badForst)}</strong>, i {heleAar.aar}{" "}
            <strong className="text-ink">{prosent(badSiste)}</strong>
            {iAar.delvis && (
              <>
                , og så langt i {iAar.aar} <strong className="text-ink">{prosent(anmerkningAndel(iAar.ordinaer))}</strong> (året er ikke
                ferdig)
              </>
            )}
            . Sur munn er sjelden: rundt én av hundre.
          </>
        }
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="font-display text-lg font-extrabold">Andel strekmunn og sur munn</h3>
            <Forklaring
              punkter={[
                { navn: "Strekmunn", smiley: "strek" },
                { navn: "Sur munn", smiley: "sur" },
              ]}
            />
            <Kolonner
              lgBredde={520}
              label={`Andel strekmunn og sur munn i ordinære tilsyn per år, fra ${prosent(badForst)} i ${forsteAar.aar} til ${prosent(badSiste)} i ${heleAar.aar}.`}
              format={aksePst}
              kolonner={a.aar.map((r) => ({
                etikett: String(r.aar),
                kort: `’${String(r.aar).slice(2)}`,
                dempet: r.delvis,
                deler: [
                  { verdi: andel(r.ordinaer, "strek"), fyll: "fill-strek" },
                  { verdi: andel(r.ordinaer, "sur"), fyll: "fill-sur" },
                ],
                tips: `${prosent(anmerkningAndel(r.ordinaer), 1)} strek/sur|${r.aar}${r.delvis ? " (hittil)" : ""}: ${prosent(andel(r.ordinaer, "strek"), 1)} strek, ${prosent(andel(r.ordinaer, "sur"), 1)} sur|${tall(r.ordinaer.total)} ordinære tilsyn`,
              }))}
            />
            <TallTabell
              tittel="Ordinære tilsyn per år"
              kolonner={["År", "Ordinære", "Smil", "Strekmunn", "Sur munn"]}
              rader={a.aar.map((r) => [
                `${r.aar}${r.delvis ? " (hittil)" : ""}`,
                tall(r.ordinaer.total),
                prosent(andel(r.ordinaer, "smil"), 1),
                prosent(andel(r.ordinaer, "strek"), 1),
                prosent(andel(r.ordinaer, "sur"), 1),
              ])}
            />
          </div>
          <div>
            <h3 className="font-display text-lg font-extrabold">Antall tilsyn per år</h3>
            <p className="mb-2 text-xs font-semibold text-ink-soft">
              Alle tilsyn, også oppfølginger.
              {koronaFall !== null && (
                <> I 2020 falt antallet med {prosent(koronaFall)} fra året før, trolig på grunn av koronapandemien.</>
              )}
              {iAar.delvis && (
                <>
                  {" "}
                  {iAar.aar} er med til og med {formatDato(a.sluttDato)}.
                </>
              )}
            </p>
            <Kolonner
              lgBredde={520}
              label={`Antall tilsyn per år fra ${forsteAar.aar} til ${iAar.aar}.`}
              format={(v) => tall(v)}
              kolonner={a.aar.map((r) => ({
                etikett: String(r.aar),
                kort: `’${String(r.aar).slice(2)}`,
                dempet: r.delvis,
                merke: r.aar === 2020 && koronaFall !== null ? "korona" : undefined,
                deler: [{ verdi: r.alle, fyll: "fill-accent" }],
                tips: `${tall(r.alle)} tilsyn|${r.aar}${r.delvis ? " (hittil)" : ""}|${tall(r.oppfolging)} av dem oppfølging`,
              }))}
            />
            <TallTabell
              tittel="Antall tilsyn per år"
              kolonner={["År", "Alle tilsyn", "Ordinære", "Oppfølging"]}
              rader={a.aar.map((r) => [
                `${r.aar}${r.delvis ? " (hittil)" : ""}`,
                tall(r.alle),
                tall(r.alle - r.oppfolging),
                tall(r.oppfolging),
              ])}
            />
          </div>
        </div>
      </Seksjon>

      {/* Temaer */}
      <Seksjon
        id="temaer"
        emoji="🔍"
        tittel={`${verstTema ? TEMAER[verstTema.indeks].navn : "Temaene"} er den vanligste synderen`}
        ingress={
          <>
            Mattilsynet gir karakter på fire temaer, og det dårligste bestemmer smilefjeset. Stolpene viser hvor ofte hvert tema fikk
            karakter 2 (brudd) eller 3 (alvorlige brudd) i ordinære tilsyn.
          </>
        }
      >
        <Forklaring
          punkter={[
            { navn: "Karakter 2 (strekmunn-nivå)", smiley: "strek" },
            { navn: "Karakter 3 (sur munn-nivå)", smiley: "sur" },
          ]}
        />
        <ul className="space-y-3">
          {temaRader.map((r) => {
            const tema = TEMAER[r.indeks];
            const strek = r.vurdert ? r.strek / r.vurdert : 0;
            const sur = r.vurdert ? r.sur / r.vurdert : 0;
            const felt = a.tema.daarlige ? r.feltSmilet / a.tema.daarlige : 0;
            return (
              <li key={tema.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[13rem_1fr_4rem]">
                <span className="text-sm font-semibold">{tema.navn}</span>
                <span className="text-right text-sm font-bold tabular-nums sm:order-last">{prosent(r.andel, 1)}</span>
                <div
                  className="col-span-2 flex h-3.5 gap-[2px] sm:col-span-1"
                  role="img"
                  aria-label={`${tema.navn}: ${prosent(strek, 1)} karakter 2 og ${prosent(sur, 1)} karakter 3. Satte smilefjeset i ${prosent(felt)} av tilsynene med strekmunn eller sur munn.`}
                  title={`Satte smilefjeset i ${prosent(felt)} av tilsynene med strekmunn eller sur munn`}
                >
                  <div className="rounded-l-[4px] bg-strek" style={{ width: `${(strek / temaMaks) * 100}%` }} />
                  {sur > 0 && <div className="rounded-r-[4px] bg-sur" style={{ width: `${(sur / temaMaks) * 100}%`, minWidth: 2 }} />}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-sm text-ink-soft">
          Når et sted får strekmunn eller sur munn, er{" "}
          <strong className="text-ink">{verstTema ? TEMAER[verstTema.indeks].navn.toLowerCase() : ""}</strong> blant temaene med dårligst
          karakter i {verstTema && a.tema.daarlige ? prosent(verstTema.feltSmilet / a.tema.daarlige) : "–"} av tilfellene. Flere temaer kan
          dele «æren».
        </p>
        <TallTabell
          tittel="Temaer i ordinære tilsyn"
          kolonner={["Tema", "Vurdert", "Karakter 2", "Karakter 3", "Satte smilefjeset"]}
          rader={temaRader.map((r) => [
            TEMAER[r.indeks].navn,
            tall(r.vurdert),
            prosent(r.vurdert ? r.strek / r.vurdert : 0, 1),
            prosent(r.vurdert ? r.sur / r.vurdert : 0, 1),
            prosent(a.tema.daarlige ? r.feltSmilet / a.tema.daarlige : 0),
          ])}
        />

        <h3 className="mt-8 font-display text-xl font-extrabold">Tema for tema, år for år</h3>
        <p className="mb-4 text-sm text-ink-soft">
          Andel ordinære tilsyn med karakter 2 eller 3 på temaet. Samme skala i alle fire; de grå linjene er de andre temaene.
        </p>
        <SmaaLinjer
          etiketter={a.temaAar.map((r) => String(r.aar))}
          serier={TEMAER.map((t, i) => ({ navn: t.navn, verdier: a.temaAar.map((r) => r.andel[i]) }))}
          format={aksePst}
          dempet={iAar.delvis ? [a.temaAar.length - 1] : []}
          tipsEkstra={(i) => `${tall(a.temaAar[i].vurdert[0])} ordinære tilsyn`}
        />
        <TallTabell
          tittel="Andel karakter 2–3 per tema og år"
          kolonner={["År", ...TEMAER.map((t) => t.kort)]}
          rader={a.temaAar.map((r, i) => [
            `${r.aar}${iAar.delvis && i === a.temaAar.length - 1 ? " (hittil)" : ""}`,
            ...r.andel.map((x) => prosent(x, 1)),
          ])}
        />
      </Seksjon>

      {/* Sesong */}
      <Seksjon
        id="sesong"
        emoji="🗓️"
        tittel="Sesong betyr lite"
        ingress={
          <>
            Andelen strekmunn og sur munn holder seg mellom {prosent(bestMnd.bad, 1)} ({MND_LANG[bestMnd.maaned - 1]}) og{" "}
            {prosent(verstMnd.bad, 1)} ({MND_LANG[verstMnd.maaned - 1]}). Hele år {a.maanedPeriode[0]}–{a.maanedPeriode[1]}.
          </>
        }
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="font-display text-lg font-extrabold">Strek/sur per måned</h3>
            <Forklaring
              punkter={[
                { navn: "Strekmunn", smiley: "strek" },
                { navn: "Sur munn", smiley: "sur" },
              ]}
            />
            <Kolonner
              lgBredde={520}
              label={`Andel strekmunn og sur munn per kalendermåned, mellom ${prosent(bestMnd.bad, 1)} og ${prosent(verstMnd.bad, 1)}.`}
              format={aksePst}
              kolonner={mnd.map((m) => ({
                etikett: MND_KORT[m.maaned - 1],
                kort: MND_KORT[m.maaned - 1].slice(0, 1).toUpperCase(),
                deler: [
                  { verdi: andel(m.ordinaer, "strek"), fyll: "fill-strek" },
                  { verdi: andel(m.ordinaer, "sur"), fyll: "fill-sur" },
                ],
                tips: `${prosent(m.bad, 1)} strek/sur|${MND_LANG[m.maaned - 1]}|${tall(m.ordinaer.total)} ordinære tilsyn`,
              }))}
            />
          </div>
          <div>
            <h3 className="font-display text-lg font-extrabold">Tilsyn per måned (snitt per år)</h3>
            <p className="mb-2 text-xs font-semibold text-ink-soft">
              Travlest i {MND_LANG[travlest.maaned - 1]}, roligst i {MND_LANG[rolig.maaned - 1]}.
            </p>
            <Kolonner
              lgBredde={520}
              label={`Gjennomsnittlig antall tilsyn per kalendermåned. Flest i ${MND_LANG[travlest.maaned - 1]}, færrest i ${MND_LANG[rolig.maaned - 1]}.`}
              format={(v) => tall(v)}
              kolonner={mnd.map((m) => ({
                etikett: MND_KORT[m.maaned - 1],
                kort: MND_KORT[m.maaned - 1].slice(0, 1).toUpperCase(),
                deler: [{ verdi: m.alle, fyll: "fill-accent" }],
                tips: `${tall(m.alle)} tilsyn|${MND_LANG[m.maaned - 1]}, snitt per år`,
              }))}
            />
          </div>
        </div>
        <TallTabell
          tittel="Per kalendermåned"
          kolonner={["Måned", "Tilsyn per år", "Ordinære totalt", "Strek/sur"]}
          rader={mnd.map((m) => [MND_LANG[m.maaned - 1], tall(m.alle), tall(m.ordinaer.total), prosent(m.bad, 1)])}
        />
        <p className="mt-4 rounded-2xl bg-paper p-3 text-sm">
          <span aria-hidden>📅 </span>
          <strong>{UKEDAGER[travlesteDag][0].toUpperCase() + UKEDAGER[travlesteDag].slice(1)}</strong> er den travleste tilsynsdagen.{" "}
          {prosent((a.ukedager[1] + a.ukedager[2] + a.ukedager[3]) / ukeSum)} av alle tilsyn skjer tirsdag–torsdag, og bare {tall(helg)} av{" "}
          {tall(ukeSum)} i helgene.
        </p>
      </Seksjon>

      {/* Fylker */}
      <Seksjon
        id="fylker"
        emoji="🗺️"
        tittel={`${fylker[0]?.navn} smiler mest, ${fylker[fylker.length - 1]?.navn} minst`}
        ingress="Andel ordinære tilsyn med smil per fylke siden 2016, sortert fra best til svakest. Den loddrette streken er landssnittet."
      >
        <StabelForklaring referanse={landSmil} />
        <StabelRader
          nummerert
          desimaler={1}
          referanse={landSmil}
          rader={fylker.map((f) => ({
            key: f.id,
            navn: f.navn,
            tekst: f.navn,
            href: `/fylke/${f.slug}`,
            fordeling: f.ordinaer,
            meta: `${tall(f.ordinaer.total)} tilsyn`,
          }))}
        />
      </Seksjon>

      {/* Kommuner */}
      <Seksjon
        id="kommuner"
        emoji="🏘️"
        tittel="Kommunetoppen og -bunnen"
        ingress={
          <>
            {kommuner.length} kommuner har minst {MIN_KOMMUNE} ordinære tilsyn og er med i rangeringen. Små kommuner svinger mye fra år til
            år, så ta plasseringene med en klype salt.
          </>
        }
      >
        <StabelForklaring referanse={landSmil} />
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="mb-3 font-display text-lg font-extrabold">🏆 Flest smil</h3>
            <StabelRader nummerert kompakt desimaler={1} referanse={landSmil} rader={besteKommuner.map(kommuneRad)} />
          </div>
          <div>
            <h3 className="mb-3 font-display text-lg font-extrabold">😬 Færrest smil</h3>
            <StabelRader
              nummerert
              kompakt
              desimaler={1}
              start={kommuner.length - svakesteKommuner.length + 1}
              referanse={landSmil}
              rader={svakesteKommuner.map(kommuneRad)}
            />
          </div>
        </div>
        <TallTabell
          tittel="Alle rangerte kommuner"
          kolonner={["Kommune", "Fylke", "Steder", "Ordinære", "Smil", "Strek", "Sur"]}
          rader={kommuner.map((k, i) => [
            <Link key={k.id} className="link" href={`/kommune/${k.slug}`}>{`${i + 1}. ${k.visningsnavn}`}</Link>,
            k.fylke ?? "–",
            tall(k.steder.length),
            tall(k.ordinaer.total),
            prosent(andel(k.ordinaer, "smil"), 1),
            prosent(andel(k.ordinaer, "strek"), 1),
            prosent(andel(k.ordinaer, "sur"), 1),
          ])}
        />
        <p className="mt-3 text-sm">
          <a className="link" href="/analyse/kommuner.csv" download>
            ⬇️ Last ned tallene for alle kommuner (CSV)
          </a>
        </p>
      </Seksjon>

      {/* Kategorier */}
      <Seksjon
        id="kategorier"
        emoji="🍕"
        tittel="Pizza, sushi eller kebab?"
        ingress={
          <>
            Andel ordinære tilsyn med smil per type sted. Datasettet har ingen bransjekode, så typen er{" "}
            <strong className="text-ink">gjettet ut fra navnet</strong> («Pizzeria Roma» blir pizza). De fleste havner i «Restaurant og
            annet». Typer med færre enn {MIN_KATEGORI} ordinære tilsyn er utelatt
            {a.kategorierUtelatt.length > 0 && <> ({a.kategorierUtelatt.map((k) => KATEGORI_NAVN[k.key].toLowerCase()).join(", ")})</>}.
          </>
        }
      >
        <StabelForklaring referanse={landSmil} />
        <StabelRader
          referanse={landSmil}
          rader={a.kategorier.map((k) => ({
            key: k.key,
            navn: (
              <>
                <span aria-hidden>{KATEGORI_EMOJI[k.key]} </span>
                {KATEGORI_NAVN[k.key]}
              </>
            ),
            tekst: KATEGORI_NAVN[k.key],
            fordeling: k.ordinaer,
            meta: `${tall(k.steder)} steder`,
          }))}
        />
      </Seksjon>

      {/* Kjeder */}
      <Seksjon
        id="kjeder"
        emoji="🔗"
        tittel="Kjedene"
        ingress={
          <>
            Kjeder med minst {MIN_KJEDE_STEDER} steder i datasettet, sortert etter andel smil i ordinære tilsyn. Kjede er også gjettet ut
            fra navnet, og franchise-steder drives ofte av ulike eiere.
          </>
        }
      >
        <StabelForklaring referanse={landSmil} />
        <StabelRader
          nummerert
          desimaler={1}
          referanse={landSmil}
          rader={kjeder.map((k) => ({
            key: k.id,
            navn: k.navn,
            tekst: k.navn,
            href: `/kjede/${k.slug}`,
            fordeling: k.ordinaer,
            meta: `${k.steder.length} steder · ${tall(k.ordinaer.total)} tilsyn`,
          }))}
        />
      </Seksjon>

      {/* Siste 7 dager */}
      <Seksjon
        id="siste"
        emoji="🆕"
        tittel="Siste 7 dager"
        ingress={
          <>
            {tall(siste7.length)} tilsyn fra {formatDato(fra7)} til {formatDato(a.sluttDato)}
            {siste7Daarlige.length > 0 ? `, hvorav ${siste7Daarlige.length} med strekmunn eller sur munn` : ""}. Mattilsynet publiserer
            resultatene med noen dagers forsinkelse.
          </>
        }
      >
        {siste7Daarlige.length > 0 && (
          <>
            <h3 className="mb-2 font-display text-lg font-extrabold">Fikk strekmunn eller sur munn</h3>
            <StedRader kolonner={2} rader={tilsynRader(siste7Daarlige)} />
          </>
        )}
        <details className="group mt-4">
          <summary className="btn cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <span className="inline-block transition-transform group-open:rotate-90" aria-hidden>
              ▸
            </span>
            Vis alle {siste7.length} tilsyn
          </summary>
          <div className="mt-3">
            <StedRader kolonner={2} rader={tilsynRader(siste7)} />
          </div>
        </details>
      </Seksjon>

      {/* Fakta */}
      <section id="fakta" aria-labelledby="fakta-tittel" className="scroll-mt-24 space-y-4">
        <h2 id="fakta-tittel" className="font-display text-2xl font-extrabold">
          <span aria-hidden>🤓 </span>Fakta til middagsselskapet
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <FaktaKort tittel="Raskt tilbake" emoji="⏱️">
            <p>
              Etter <strong>sur munn</strong> kommer Mattilsynet tilbake etter {a.oppfolging.sur.medianDager} dager (median).{" "}
              {prosent(a.oppfolging.sur.innen30)} får nytt besøk innen en måned.
            </p>
            <p className="mt-2">
              Etter <strong>strekmunn</strong> tar det {a.oppfolging.strek.medianDager} dager, og {prosent(a.oppfolging.strek.innen30)} får
              besøk innen en måned. Neste tilsyn gir smil i {prosent(a.oppfolging.strek.nesteSmil)} av tilfellene.
            </p>
          </FaktaKort>

          <FaktaKort tittel="Comeback-kids" emoji="🔄" ingress="Hadde sur munn, men bare smil siden.">
            <StedListe
              rader={a.comebacks.map((c) => ({
                sted: c.sted,
                meta: `sur ${c.surDato.slice(0, 4)} → ${c.smilPaaRad} smil`,
              }))}
            />
          </FaktaKort>

          <FaktaKort tittel="Feilfrie veteraner" emoji="🏆" ingress="Flest ordinære tilsyn – og smil hver eneste gang.">
            <StedListe rader={a.feilfrie.map((f) => ({ sted: f.sted, meta: `${f.ordinaer.total} av ${f.ordinaer.total}` }))} />
          </FaktaKort>

          <FaktaKort
            tittel="Gjengangerne"
            emoji="🔁"
            ingress="Flest ordinære tilsyn med strekmunn eller sur munn siden 2016. Fjeset viser siste resultat."
          >
            <StedListe
              rader={a.flestAnmerkninger.map((f) => ({
                sted: f.sted,
                meta: `${f.ordinaer.strek + f.ordinaer.sur} av ${f.ordinaer.total}`,
              }))}
            />
          </FaktaKort>

          <FaktaKort tittel="Det store fallet" emoji="📉">
            <p>
              I {forsteAar.aar} endte <strong>{prosent(badForst)}</strong> av de ordinære tilsynene med strekmunn eller sur munn. I{" "}
              {heleAar.aar} var det <strong>{prosent(badSiste)}</strong>.
              {badSiste < badForst && <> Det er {prosent(1 - badSiste / badForst)} færre, relativt sett.</>}
            </p>
            <p className="mt-2 text-ink-soft">
              Vi kan ikke si sikkert om kjøkkenene er blitt renere, eller om Mattilsynet har endret hvordan de prioriterer og vurderer.
            </p>
          </FaktaKort>

          <FaktaKort tittel="Hvor bor du?" emoji="📍">
            <p>Hver kommune har sin egen side med utvikling, sammenligning med landet og alle stedene.</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {["oslo", "bergen", "trondheim", "stavanger", "tromso", "kristiansand"].map((slug) => {
                const k = getOmrade("kommune", slug);
                return k ? (
                  <li key={slug}>
                    <Link className="chip" href={`/kommune/${slug}`}>
                      📍 {k.navn}
                    </Link>
                  </li>
                ) : null;
              })}
            </ul>
          </FaktaKort>
        </div>
      </section>

      <section className="card space-y-2 bg-paper-2 p-5 text-sm">
        <h2 className="font-display text-xl font-extrabold">Slik er tallene laget</h2>
        <p className="text-ink-soft">
          Kilde: Mattilsynets åpne tilsynsdata (NLOD 2.0), hentet {formatDato(a.generert.slice(0, 10))}. Smil = karakter 0–1, strekmunn = 2,
          sur munn = 3. Andeler regnes av ordinære tilsyn med gyldig karakter; oppfølgingstilsyn er holdt utenfor. Én løs rad fra 2015 er
          ikke med i tidsseriene. Kommune er utledet fra postnummer og kan avvike for steder nær kommunegrenser. Kategori og kjede gjettes
          ut fra stedsnavnet.
        </p>
        <p>
          <Link className="link" href="/om">
            Mer om dataene
          </Link>{" "}
          ·{" "}
          <a className="link" href="/analyse/kommuner.csv" download>
            Kommunetall som CSV
          </a>
        </p>
      </section>
    </article>
  );
}

function kommuneRad(k: ReturnType<typeof rangert>[number]) {
  return {
    key: k.id,
    navn: k.visningsnavn,
    tekst: k.visningsnavn,
    href: `/kommune/${k.slug}`,
    fordeling: k.ordinaer,
    meta: `${tall(k.ordinaer.total)} tilsyn`,
  };
}

function FaktaKort({ tittel, emoji, ingress, children }: { tittel: string; emoji: string; ingress?: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="font-display text-lg font-extrabold">
        <span aria-hidden className="mr-1.5">
          {emoji}
        </span>
        {tittel}
      </h3>
      {ingress && <p className="mb-2 text-sm text-ink-soft">{ingress}</p>}
      <div className="mt-2 text-sm">{children}</div>
    </div>
  );
}

function StedListe({ rader }: { rader: Array<{ sted: Sted; meta: string }> }) {
  return (
    <StedRader
      rader={rader.map(({ sted, meta }) => ({
        key: sted.id,
        slug: sted.slug,
        navn: sted.navn,
        kind: kindFromKarakter(sisteTilsyn(sted).karakter),
        under: sted.kommune ?? sted.poststed,
        meta,
      }))}
    />
  );
}

function tilsynRader(liste: ReturnType<typeof analyse>["siste7"]): StedRad[] {
  return liste.map((x, i) => {
    const s = smileFromKarakter(x.tilsyn.karakter);
    return {
      key: `${x.sted.id}-${i}`,
      slug: x.sted.slug,
      navn: x.sted.navn,
      kind: kindFromKarakter(x.tilsyn.karakter),
      label: s ? SMILE_LABEL[s] : "Ukjent",
      under: [x.sted.kommune ?? x.sted.poststed, x.tilsyn.oppfolging ? "oppfølging" : null].filter(Boolean).join(" · "),
      meta: formatDato(x.tilsyn.dato).replace(/ \d{4}$/, ""),
    };
  });
}
