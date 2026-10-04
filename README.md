# Smilefjeskartet

[smilefjeskartet.no](https://smilefjeskartet.no) viser Mattilsynets smilefjestilsyn på kart, med full historikk per sted, analyse for kommuner/fylker/kjeder og statistiske anslag i Spåkula. E-postvarsling er valgfritt og krever eget oppsett.

## Kom i gang

Bruk Node.js 22, som i GitHub Actions:

```sh
npm ci
npm run dev
```

Åpne [localhost:3000](http://localhost:3000). De genererte datafilene er sjekket inn, så kart, analyse og Spåkula fungerer uten API-nøkler. Grunnkartet krever tilgang til OpenFreeMap. Next.js laster ned Google-fontene under bygging.

```sh
npm test
npm run lint
npm audit --omit=dev
npx tsc --noEmit
npm run build
npm start
```

Kartets nettlesertester kjøres mot et produksjonsbygg og bruker den ekte MapLibre-workeren. De sjekker at klynger tegnes og følger kartposisjonen under dragging:

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

CI kjører tester, lint, typesjekk, produksjonsaudit, produksjonsbygg og kartets nettlesertester for pull requests og endringer på main. Redis installeres i CI slik at lagringstestene kjører de ekte Lua-skriptene. Lokalt kan de kjøres med `VARSLING_TEST_REDIS=1 npm test` når `redis-server` og `redis-cli` er installert. Lokale arbeidskopier i `.claude/` holdes utenfor lint og typesjekk.

## Oppdatere data

Kjør i denne rekkefølgen:

```sh
npm run build:data
npm run build:prediksjon
```

`build:data` laster ned Mattilsynets CSV, slår opp kommune/fylke med Brings postnummerregister og geokoder adresser med Kartverket. Første kjøring kan ta tid; koordinater lagres i den lokale cachen `data/geocode-cache.json`. Ugyldig eller utilgjengelig kommuneregister stopper jobben før eksisterende datafiler overskrives.

- `generated/steder.json`: steder og full tilsynshistorikk, leses på serveren.
- `public/data/kart.json`: kompakt kartdata til nettleseren.
- `generated/prediksjon.json`: modellrapporter og anslag fra `build:prediksjon`.
- `public/tilsyn.geojson`, `public/tilsyn-diff.json`, `public/tilsyn-meta.json`: beholdte dataformater for bakoverkompatibilitet.

Workflowen [Update tilsyndata](.github/workflows/update-tilsyndata.yml) kjører hver dag kl. 06:00 UTC og kan startes manuelt. Den publiserer oppdaterte tilsynsdata selv om modelltreningen feiler; Spåkula viser datoen for datagrunnlaget slik at eldre anslag kan gjenkjennes.

## E-postvarsling

Se [oppsett og drift av varsling](docs/varsling.md) for Upstash Redis, Resend, domeneverifisering og miljøvariabler i Vercel/GitHub. Funksjonen er av uten konfigurasjon; resten av nettstedet fungerer som vanlig.

For lokal testing brukes `.env.local` med variablene i veiledningen og `NEXT_PUBLIC_SITE_URL=http://localhost:3000`. Bruk egen testdatabase og testavsender.

```sh
npm run varsling:admin -- forhandsvis
npm run varsling:admin -- status
npm run send:varsler
```

`forhandsvis` lager e-posteksempler uten sending eller API-nøkler. `status` krever konfigurasjon. `send:varsler` kan sende ekte e-post når nøklene er satt; første kjøring registrerer eksisterende tilsyn uten å sende gamle resultater.

## Hvor koden ligger

- `app/` og `components/`: Next.js-ruter og brukergrensesnitt.
- `lib/kart.ts`: søk, filtre, kartdata og URL-tilstand.
- `lib/analyse.ts` og `lib/server/omrader.ts`: analyse, aggregering og områder.
- `lib/prediksjon/`: modelltrening, tidsserier og evaluering.
- `lib/varsling/`: abonnementer, e-post og utsending.
- `scripts/`: databygging og driftskommandoer.
- `__tests__/`: Vitest-regresjonstester.

Analysen sammenligner ordinære tilsyn og holder oppfølging utenfor, fordi resultatene etter oppfølging ellers gjør sammenligningen misvisende. Kategori og kjede gjettes fra stedsnavn; kommune utledes fra postnummer. Se [Om tjenesten](https://smilefjeskartet.no/om) og forklaringene på analysen for begrensninger i datagrunnlaget.
