"use client";

import { useState } from "react";
import Link from "next/link";

const COLORS = {
  smil: "#10b981",
  strek: "#f59e0b",
  sur: "#ef4444",
  primary: "#6366f1",
  primaryLight: "#e0e7ff",
  bg: "#f8fafc",
  card: "#ffffff",
  border: "#e2e8f0",
  text: "#0f172a",
  textMuted: "#64748b",
  textFaint: "#94a3b8",
  accent: "#8b5cf6",
};

type FilterKey = "smil" | "strek" | "sur";

export default function VarslingPage() {
  const [email, setEmail] = useState("");
  const [radius, setRadius] = useState(10);
  const [filters, setFilters] = useState<Record<FilterKey, boolean>>({
    smil: true,
    strek: true,
    sur: true,
  });
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleFilter = (key: FilterKey) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleLocate = () => {
    if (!navigator.geolocation) {
      setError("Nettleseren din støtter ikke posisjonsdeling.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setError("Kunne ikke hente posisjon. Sjekk tillatelser.");
        setLocating(false);
      },
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!position) {
      setError("Velg en posisjon først.");
      return;
    }

    const activeFilters = (Object.keys(filters) as FilterKey[]).filter((k) => filters[k]);
    if (activeFilters.length === 0) {
      setError("Velg minst én kontrolltype.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          lat: position.lat,
          lng: position.lng,
          radius,
          filters: activeFilters,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSuccess(true);
      } else {
        setError(data.error ?? "Noe gikk galt. Prøv igjen senere.");
      }
    } catch {
      setError("Noe gikk galt. Prøv igjen senere.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: COLORS.text,
      }}
    >
      <style>{`
        .varsling-content { max-width: 1280px; margin: 0 auto; padding: 24px 20px 60px; }
        .varsling-header-inner { max-width: 1280px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
        .varsling-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .varsling-content { padding: 16px 12px 40px; }
          .varsling-header-inner { gap: 8px; }
          .varsling-form-grid { grid-template-columns: 1fr; gap: 16px; }
        }
        @media (max-width: 480px) {
          .varsling-header-inner { flex-direction: column; align-items: flex-start; }
        }
      `}</style>

      {/* HEADER */}
      <header
        style={{
          background: "#fff",
          borderBottom: `1px solid ${COLORS.border}`,
          padding: "16px 24px",
          position: "sticky",
          top: 0,
          zIndex: 50,
          backdropFilter: "blur(12px)",
          backgroundColor: "rgba(255,255,255,0.85)",
        }}
      >
        <div className="varsling-header-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Link
              href="/"
              style={{
                color: COLORS.primary,
                textDecoration: "none",
                fontSize: 13,
                fontWeight: 500,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 8,
                padding: "6px 14px",
                transition: "all 0.15s",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              ← Kart
            </Link>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, letterSpacing: -0.3 }}>
                Varsling
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: COLORS.textFaint }}>
                Smilefjeskartet · Få beskjed om nye kontroller
              </p>
            </div>
          </div>

          <nav style={{ display: "flex", gap: 8 }}>
            {[
              { href: "/", label: "Kart" },
              { href: "/analyse", label: "Analyse" },
              { href: "/prediction", label: "Prediksjon" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  color: COLORS.textMuted,
                  textDecoration: "none",
                  fontSize: 12,
                  fontWeight: 500,
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: `1px solid ${COLORS.border}`,
                  transition: "all 0.15s",
                }}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="varsling-content">
        {/* INTRO */}
        <div
          style={{
            background: COLORS.primaryLight,
            border: `1px solid ${COLORS.primary}33`,
            borderRadius: 12,
            padding: "20px 24px",
            marginBottom: 24,
          }}
        >
          <p style={{ margin: 0, fontSize: 14, color: COLORS.text, lineHeight: 1.6 }}>
            📬 Få e-postvarsler når Mattilsynet registrerer nye smilefjeskontroller i ditt nærområde.
          </p>
        </div>

        {success ? (
          <div
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.smil}55`,
              borderRadius: 12,
              padding: "32px 24px",
              textAlign: "center",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700 }}>
              Varsling aktivert!
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: COLORS.textMuted, lineHeight: 1.6 }}>
              Du vil motta e-post når nye kontroller registreres i ditt område.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="varsling-form-grid">
              {/* LEFT COLUMN – Email & Filters */}
              <div
                style={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 12,
                  padding: 24,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}
              >
                {/* Email */}
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    marginBottom: 6,
                    color: COLORS.text,
                  }}
                >
                  E-postadresse
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="din@epost.no"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: 14,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 8,
                    outline: "none",
                    boxSizing: "border-box",
                    marginBottom: 20,
                  }}
                />

                {/* Filters */}
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    marginBottom: 10,
                    color: COLORS.text,
                  }}
                >
                  Varsle meg om
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {([
                    { key: "smil" as FilterKey, label: "😊 Smil", color: COLORS.smil },
                    { key: "strek" as FilterKey, label: "😐 Strekmunn", color: COLORS.strek },
                    { key: "sur" as FilterKey, label: "😠 Sur munn", color: COLORS.sur },
                  ]).map((item) => (
                    <label
                      key={item.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        cursor: "pointer",
                        fontSize: 14,
                        padding: "8px 12px",
                        borderRadius: 8,
                        border: `1px solid ${filters[item.key] ? item.color + "55" : COLORS.border}`,
                        background: filters[item.key] ? item.color + "11" : "transparent",
                        transition: "all 0.15s",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={filters[item.key]}
                        onChange={() => toggleFilter(item.key)}
                        style={{ accentColor: item.color, width: 16, height: 16 }}
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* RIGHT COLUMN – Location & Radius */}
              <div
                style={{
                  background: COLORS.card,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 12,
                  padding: 24,
                  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                }}
              >
                {/* Location */}
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    marginBottom: 6,
                    color: COLORS.text,
                  }}
                >
                  Min posisjon
                </label>
                <button
                  type="button"
                  onClick={handleLocate}
                  disabled={locating}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: 14,
                    fontWeight: 500,
                    border: `1px solid ${COLORS.primary}44`,
                    borderRadius: 8,
                    background: COLORS.primaryLight,
                    color: COLORS.primary,
                    cursor: locating ? "wait" : "pointer",
                    transition: "all 0.15s",
                    marginBottom: 8,
                  }}
                >
                  {locating ? "Henter posisjon…" : "📍 Bruk min posisjon"}
                </button>
                <p
                  style={{
                    margin: "0 0 20px",
                    fontSize: 12,
                    color: position ? COLORS.text : COLORS.textFaint,
                    background: position ? COLORS.primaryLight : "transparent",
                    padding: position ? "6px 10px" : 0,
                    borderRadius: 6,
                  }}
                >
                  {position
                    ? `${position.lat.toFixed(4)}°N, ${position.lng.toFixed(4)}°E`
                    : "Ingen posisjon valgt"}
                </p>

                {/* Radius */}
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    marginBottom: 6,
                    color: COLORS.text,
                  }}
                >
                  Område (radius)
                </label>
                <select
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    fontSize: 14,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 8,
                    outline: "none",
                    background: COLORS.card,
                    boxSizing: "border-box",
                  }}
                >
                  <option value={5}>5 km</option>
                  <option value={10}>10 km</option>
                  <option value={25}>25 km</option>
                  <option value={50}>50 km</option>
                </select>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                style={{
                  marginTop: 16,
                  padding: "12px 16px",
                  background: COLORS.sur + "11",
                  border: `1px solid ${COLORS.sur}44`,
                  borderRadius: 8,
                  fontSize: 13,
                  color: COLORS.sur,
                }}
              >
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              style={{
                marginTop: 20,
                width: "100%",
                padding: "14px 24px",
                fontSize: 15,
                fontWeight: 600,
                color: "#fff",
                background: submitting ? COLORS.textFaint : COLORS.primary,
                border: "none",
                borderRadius: 10,
                cursor: submitting ? "wait" : "pointer",
                transition: "all 0.2s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {submitting ? (
                <>
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "#fff",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                  Sender…
                </>
              ) : (
                "📧 Aktiver varsling"
              )}
            </button>
          </form>
        )}

        {/* FOOTER */}
        <footer
          style={{
            marginTop: 48,
            paddingTop: 20,
            borderTop: `1px solid ${COLORS.border}`,
            fontSize: 12,
            color: COLORS.textFaint,
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <span>
            Data:{" "}
            <a
              href="https://data.norge.no/datasets/288aa74c-e3d3-492e-9ede-e71503b3bfd9"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: COLORS.primary, textDecoration: "none" }}
            >
              Mattilsynet
            </a>
            {" ("}
            <a
              href="https://data.norge.no/nlod/no/2.0"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: COLORS.primary, textDecoration: "none" }}
            >
              NLOD
            </a>
            {")"}
          </span>
          <div style={{ display: "flex", gap: 16 }}>
            <Link href="/" style={{ color: COLORS.primary, textDecoration: "none" }}>Kart</Link>
            <Link href="/analyse" style={{ color: COLORS.primary, textDecoration: "none" }}>Analyse</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
