# Smilefjeskartet – Prosjektplan

## Prosjektoversikt

**Smilefjeskartet** er en interaktiv webapplikasjon som visualiserer Mattilsynets smilefjeskontroller på kart. Brukere kan søke, filtrere og utforske hygienetilsyn hos serveringssteder i hele Norge.

**Teknologi:** Next.js 16, React 19, MapLibre GL, TailwindCSS 4, TypeScript 5

---

## Nåværende funksjonalitet

### ✅ Hovedkart (`/`)
- Interaktivt kart med MapLibre GL og OpenStreetMap-fliser
- Smilefjes-ikoner (😊 grønn, 😐 gul, 😠 rød) generert med Canvas API
- Klynging av nærliggende punkter ved lavere zoomnivåer
- Filtrering etter smilefjes-type (alle, smil, strek, sur)
- Sanntidssøk etter navn, adresse og organisasjonsnummer
- Geoposisjonering ("Nær meg"-knapp)
- Informasjonsdialog med datakilder og attribusjon
- Forklaring/legende med fargekoder
- Koordinatspredning for samlokaliserte steder (f.eks. kjøpesentre)

### ✅ Analysedashboard (`/analyse`)
- 4 KPI-kort (totalt antall, godkjenningsrate, bruddrate, sur munn-andel)
- Tidsseriegrafer (total inspeksjoner over tid, scoredistribusjon)
- Kategori-/kravpunktanalyse (rutiner, lokaler, mathåndtering, merking)
- Varmekart over siste 7 dagers inspeksjoner
- Nedlastingshistorikk med endringsoversikt
- Responsivt design med egendefinerte Canvas-diagrammer

### ✅ Datapipeline
- Daglig automatisk nedlasting av CSV fra Mattilsynet (GitHub Actions kl. 06:00 UTC)
- Geokoding via Kartverkets REST-API med caching
- Diff-sporing: nye, endrede og fjernede inspeksjoner
- Generering av `tilsyn.geojson`, `tilsyn-diff.json` og `tilsyn-meta.json`
- Øyeblikksbilde-historikk i `data/snapshots/`

### ✅ SEO og metadata
- Strukturerte data (JSON-LD) for WebApplication, WebSite, FAQPage og Organization
- OpenGraph- og Twitter Card-metadata
- `robots.ts` og `sitemap.ts`
- Noscript-fallback for brukere uten JavaScript

---

## Planlagte forbedringer

### ✅ Fase 1: Prediksjonsside (`/prediction`)

**Mål:** Gi brukere innsikt i hvilke serveringssteder som sannsynligvis vil bli inspisert snart, basert på historiske mønstre.

**Implementert:**
- Logistisk regresjonsmodell trent i nettleseren (ingen eksterne ML-biblioteker)
- Treningsdata fra `tilsyn-diff.json` (historiske endringer som "ground truth")
- Feature-ekstraksjon:
  - Dager siden siste inspeksjon
  - Tidligere karakter-scorer
  - Antall tidligere brudd
  - Aktivitet i nærområdet (15 km radius)
  - Geografisk posisjon (lat/lng)
- KPI-kort: totalt serveringssteder, modellnøyaktighet, gjennomsnittlig konfidens, høy risiko
- Rangert liste over topp 50 steder med høyest sannsynlighet for inspeksjon

### ✅ Fase 2: Varslingssystem (`/varsling`)

**Mål:** La brukere abonnere på varsler om nye inspeksjoner i sitt nærområde.

**Implementert:**
- Abonnementsskjema med e-post og geografisk område
- API-endepunkt (`/api/subscribe`) med validering
- Geoposisjonering for valg av posisjon
- Valgfri filtrering etter smilefjes-type (smil, strek, sur)
- Valgbar radius (5, 10, 25, 50 km)

### ✅ Fase 3: Testing og kvalitetssikring

**Mål:** Innføre testinfrastruktur for å sikre stabilitet.

**Implementert:**
- Vitest testramme med jsdom-miljø
- 38 enhetstester for dataparsing og score-beregning (`app/lib/utils.ts`)
- 14 integrasjonstester for API-subscribe-endepunktet
- Kjør med `npm test` (52 tester totalt)

### ✅ Fase 4: Utvidede analyser

**Mål:** Gi dypere innsikt i inspeksjonsdata.

**Implementert:**
- Eksportfunksjon for data (CSV) i analysedashboardet

**Gjenstår:**
- Trend-analyse per kommune/fylke
- Sammenligning av bransjer (restaurant vs. dagligvare vs. kafé)
- Sesongvariasjoner i inspeksjonsresultater

### ✅ Fase 5: Tilgjengelighet og ytelse

**Mål:** Forbedre brukeropplevelsen for alle.

**Implementert:**
- ARIA-attributter for søkefelt, filtre, søkeresultater og dialoger
- Tastaturnavigasjon via native `<select>` og `<button>`-elementer
- Semantiske roller (`listbox`, `option`, `region`, `dialog`)

**Gjenstår:**
- Full WCAG 2.1 AA-samsvar (audit)
- Service Worker for offline-støtte
- Lazy loading av GeoJSON-data

---

## Arkitekturoversikt

```
smilefjeskart/
├── app/
│   ├── page.tsx              # Hovedkart (830+ linjer)
│   ├── analyse/page.tsx      # Analysedashboard (2 120+ linjer)
│   ├── prediction/page.tsx   # Prediksjonsside med ML-modell
│   ├── varsling/page.tsx     # Varslingsskjema
│   ├── api/subscribe/route.ts # Varslings-API
│   ├── lib/utils.ts          # Delte hjelpefunksjoner
│   ├── layout.tsx            # Rotoppsett, metadata, SEO (215 linjer)
│   ├── legend.tsx            # Forklaringskomponent (126 linjer)
│   ├── analytics.tsx         # Vercel Analytics-wrapper (7 linjer)
│   ├── globals.css           # Globale stiler
│   ├── robots.ts             # Robots.txt-generering
│   └── sitemap.ts            # Sitemap-generering
├── __tests__/
│   ├── utils.test.ts         # Enhetstester (38 tester)
│   └── api-subscribe.test.ts # API-tester (14 tester)
├── scripts/
│   ├── build-tilsyn-geojson.ts  # Datapipeline (410 linjer)
│   └── generate-test-data.ts    # Testdatagenerator (291 linjer)
├── public/
│   ├── tilsyn.geojson        # Inspeksjonsdata (generert)
│   ├── tilsyn-diff.json      # Endringshistorikk (generert)
│   └── tilsyn-meta.json      # Metadata (generert)
├── vitest.config.ts          # Testkonfigurasjon
└── .github/workflows/
    └── update-tilsyndata.yml  # Daglig dataoppdatering
```

## Dataflyt

```
Mattilsynet CSV (daglig kl. 06:00 UTC)
    ↓
build-tilsyn-geojson.ts
    ↓
Kartverket Geokoding API (med cache)
    ↓
├→ tilsyn.geojson       → Hovedkart (page.tsx)
├→ tilsyn-diff.json     → Analysedashboard + Prediksjoner
└→ tilsyn-meta.json     → Statistikk og historikk
```

## Kommandoer

| Kommando | Beskrivelse |
|---|---|
| `npm run dev` | Start utviklingsserver |
| `npm run build` | Bygg for produksjon |
| `npm run build:data` | Last ned og prosesser tilsynsdata |
| `npm run test:data` | Generer testdata for utvikling |
| `npm test` | Kjør alle tester (Vitest) |
| `npx eslint app/` | Kjør linting |
| `npx tsc --noEmit` | Typekontroll |

---

*Sist oppdatert: 2. april 2026*
