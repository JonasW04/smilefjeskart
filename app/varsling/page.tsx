"use client";

import { useState } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GeocodeResult = {
  lat: number;
  lon: number;
  displayName: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VarslingPage() {
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [radius, setRadius] = useState(2);
  const [geocodeResult, setGeocodeResult] = useState<GeocodeResult | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);

  async function handleGeocode() {
    if (!address.trim()) return;
    setGeocoding(true);
    setError(null);
    setGeocodeResult(null);

    try {
      const params = new URLSearchParams({
        sok: address.trim(),
        treffPerSide: "1",
        side: "0",
        filtrer: "adresser.representasjonspunkt,adresser.adressetekst,adresser.poststed,adresser.postnummer",
      });
      const res = await fetch(`https://ws.geonorge.no/adresser/v1/sok?${params}`);
      if (!res.ok) throw new Error("Søk feilet");
      const data = await res.json();

      if (!data.adresser?.length) {
        setError("Fant ingen adresse. Prøv en mer spesifikk adresse.");
        return;
      }

      const addr = data.adresser[0];
      const rp = addr.representasjonspunkt;
      if (!rp?.lat || !rp?.lon) {
        setError("Kunne ikke finne koordinater for adressen.");
        return;
      }

      const displayName = [
        addr.adressetekst,
        addr.postnummer,
        addr.poststed,
      ].filter(Boolean).join(", ");

      setGeocodeResult({
        lat: rp.lat,
        lon: rp.lon,
        displayName,
      });
    } catch {
      setError("Noe gikk galt ved adressesøk. Prøv igjen.");
    } finally {
      setGeocoding(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!geocodeResult || !email.trim()) return;

    setSubscribing(true);
    setError(null);

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          address: geocodeResult.displayName,
          lat: geocodeResult.lat,
          lon: geocodeResult.lon,
          radiusKm: radius,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Registrering feilet");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Noe gikk galt. Prøv igjen.");
    } finally {
      setSubscribing(false);
    }
  }

  if (submitted) {
    return (
      <main style={{ fontFamily: "sans-serif", maxWidth: 600, margin: "0 auto", padding: "40px 16px", textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Registrering fullført!</h1>
        <p style={{ color: "#666", marginBottom: 24, lineHeight: 1.6 }}>
          Du vil motta varsel på <strong>{email}</strong> når nye kontroller registreres
          innenfor <strong>{radius} km</strong> fra <strong>{geocodeResult?.displayName}</strong>.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link
            href="/"
            style={{
              color: "#4a90d9",
              textDecoration: "none",
              border: "1px solid #ddd",
              borderRadius: 6,
              padding: "8px 16px",
            }}
          >
            ← Tilbake til kartet
          </Link>
          <button
            onClick={() => {
              setSubmitted(false);
              setAddress("");
              setEmail("");
              setGeocodeResult(null);
            }}
            style={{
              background: "#4a90d9",
              color: "white",
              border: "none",
              borderRadius: 6,
              padding: "8px 16px",
              cursor: "pointer",
            }}
          >
            Registrer ny adresse
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={{ fontFamily: "sans-serif", maxWidth: 600, margin: "0 auto", padding: "20px 16px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <Link
          href="/"
          style={{
            color: "#4a90d9",
            textDecoration: "none",
            fontSize: 14,
            border: "1px solid #ddd",
            borderRadius: 6,
            padding: "6px 12px",
          }}
        >
          ← Tilbake til kartet
        </Link>
        <h1 style={{ margin: 0, fontSize: 22 }}>🔔 Varslingstjeneste</h1>
      </div>

      <p style={{ color: "#555", lineHeight: 1.6, marginBottom: 24, fontSize: 14 }}>
        Få varsel på e-post når Mattilsynet registrerer nye kontroller i nærheten av din restaurant.
        Skriv inn adressen til restauranten din, velg radius, og oppgi e-postadressen du vil motta varsler på.
      </p>

      <form onSubmit={handleSubmit}>
        {/* Address input */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: 14 }}>
            📍 Restaurantens adresse
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="F.eks. Karl Johans gate 1, Oslo"
              style={{
                flex: 1,
                padding: "10px 12px",
                border: "1px solid #ddd",
                borderRadius: 6,
                fontSize: 14,
              }}
            />
            <button
              type="button"
              onClick={handleGeocode}
              disabled={geocoding || !address.trim()}
              style={{
                padding: "10px 16px",
                background: "#4a90d9",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: geocoding || !address.trim() ? "not-allowed" : "pointer",
                fontSize: 14,
                opacity: geocoding || !address.trim() ? 0.6 : 1,
              }}
            >
              {geocoding ? "Søker…" : "Søk"}
            </button>
          </div>
        </div>

        {/* Geocode result */}
        {geocodeResult && (
          <div style={{
            background: "#f0fff4",
            border: "1px solid #c6f6d5",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 20,
            fontSize: 14,
          }}>
            <strong>✅ Funnet adresse:</strong><br />
            {geocodeResult.displayName}<br />
            <span style={{ color: "#888", fontSize: 12 }}>
              ({geocodeResult.lat.toFixed(5)}, {geocodeResult.lon.toFixed(5)})
            </span>
          </div>
        )}

        {/* Radius */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: 14 }}>
            📏 Varslingsradius: {radius} km
          </label>
          <input
            type="range"
            min={0.5}
            max={10}
            step={0.5}
            value={radius}
            onChange={e => setRadius(parseFloat(e.target.value))}
            style={{ width: "100%" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#999" }}>
            <span>0.5 km</span>
            <span>10 km</span>
          </div>
        </div>

        {/* Email */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: 14 }}>
            ✉️ E-postadresse for varsling
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="din@epost.no"
            required
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #ddd",
              borderRadius: 6,
              fontSize: 14,
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Error message */}
        {error && (
          <div style={{
            background: "#fff5f5",
            border: "1px solid #feb2b2",
            borderRadius: 8,
            padding: "10px 14px",
            marginBottom: 16,
            color: "#c53030",
            fontSize: 14,
          }}>
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={!geocodeResult || !email.trim() || subscribing}
          style={{
            width: "100%",
            padding: "12px",
            background: !geocodeResult || !email.trim() ? "#ccc" : "#2ecc71",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontSize: 16,
            fontWeight: 600,
            cursor: !geocodeResult || !email.trim() ? "not-allowed" : "pointer",
          }}
        >
          {subscribing ? "Registrerer…" : "🔔 Registrer varsel"}
        </button>
      </form>

      {/* Info box */}
      <div style={{
        marginTop: 24,
        background: "#f8f9fa",
        border: "1px solid #e9ecef",
        borderRadius: 8,
        padding: "14px 16px",
        fontSize: 13,
        color: "#666",
        lineHeight: 1.6,
      }}>
        <strong style={{ color: "#333" }}>Slik fungerer det:</strong>
        <ol style={{ margin: "8px 0 0", paddingLeft: 20 }}>
          <li>Du registrerer adressen til restauranten din og en varslingsradius.</li>
          <li>Hver gang tilsynsdataene oppdateres, sjekkes det om nye kontroller er registrert i ditt område.</li>
          <li>Du mottar en e-post med informasjon om nye kontroller i nærheten.</li>
        </ol>
      </div>

      {/* Link to analytics */}
      <div style={{ marginTop: 20, textAlign: "center" }}>
        <Link href="/analyse" style={{ color: "#4a90d9", fontSize: 14, textDecoration: "none" }}>
          📊 Se analyse av tilsynsdata →
        </Link>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 40, paddingTop: 16, borderTop: "1px solid #eee", fontSize: 12, color: "#999" }}>
        Data:{" "}
        <a href="https://data.norge.no/datasets/288aa74c-e3d3-492e-9ede-e71503b3bfd9" target="_blank" rel="noopener noreferrer" style={{ color: "#4a90d9" }}>
          Mattilsynet
        </a>
        {" ("}
        <a href="https://data.norge.no/nlod/no/2.0" target="_blank" rel="noopener noreferrer" style={{ color: "#4a90d9" }}>
          NLOD
        </a>
        {")"}
      </div>
    </main>
  );
}
