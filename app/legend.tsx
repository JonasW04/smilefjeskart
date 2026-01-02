"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "legend-hidden-v1";

export default function Legend() {
  const [mounted, setMounted] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      setHidden(localStorage.getItem(STORAGE_KEY) === "1");
    } catch {}
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(STORAGE_KEY, hidden ? "1" : "0");
    } catch {}
  }, [hidden, mounted]);

  // Avoid hydration mismatch: server and first client render nothing
  if (!mounted) return null;

  // When hidden, show a small pill to restore
  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHidden(false)}
        style={{
          position: "absolute",
          top: 72, // same placement as before
          left: 12,
          zIndex: 3,
          background: "white",
          border: "1px solid #ddd",
          borderRadius: 999,
          padding: "6px 10px",
          cursor: "pointer",
          boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
          fontSize: 13,
        }}
        title="Vis forklaring"
      >
        Forklaring
      </button>
    );
  }

  // ✅ Exact original content below (unchanged), with just a close button added
  return (
    <div
      role="region"
      aria-label="Kartforklaring"
      style={{
        position: "absolute",
        top: 72, // move below header to avoid overlapping controls
        left: 12,
        zIndex: 3,
        background: "white",
        padding: 10,
        borderRadius: 8,
        border: "1px solid #ddd",
        boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
        fontSize: 13,
        maxWidth: 240,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginBottom: 8,
        }}
      >
        <strong style={{ display: "block" }}>Forklaring</strong>

        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label="Skjul forklaring"
          style={{
            border: "1px solid #ddd",
            background: "white",
            borderRadius: 8,
            padding: "4px 8px",
            cursor: "pointer",
            fontSize: 12,
            lineHeight: 1,
          }}
          title="Skjul"
        >
          ✕
        </button>
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: 0, lineHeight: 1.4 }}>
        <li style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
          <span
            aria-hidden
            style={{ width: 12, height: 12, background: "#2ecc71", borderRadius: 6, display: "inline-block" }}
          />
          <span style={{ fontWeight: 600, marginRight: 6 }}>Grønn</span>
          <span style={{ opacity: 0.85 }}>— Smil (ingen eller små avvik) 😊</span>
        </li>

        <li style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
          <span
            aria-hidden
            style={{ width: 12, height: 12, background: "#f1c40f", borderRadius: 6, display: "inline-block" }}
          />
          <span style={{ fontWeight: 600, marginRight: 6 }}>Gul</span>
          <span style={{ opacity: 0.85 }}>— Strek (avvik som må følges opp) 😐</span>
        </li>

        <li style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span
            aria-hidden
            style={{ width: 12, height: 12, background: "#e74c3c", borderRadius: 6, display: "inline-block" }}
          />
          <span style={{ fontWeight: 600, marginRight: 6 }}>Rød</span>
          <span style={{ opacity: 0.85 }}>— Sur munn (alvorlige brudd) 😠</span>
        </li>
      </ul>

      <div
        style={{
          marginTop: 10,
          paddingTop: 8,
          borderTop: "1px solid #eee",
          fontSize: 12,
          color: "#666",
          lineHeight: 1.5,
        }}
      >
        <strong style={{ display: "block", marginBottom: 4, color: "#333" }}>Flere steder på samme adresse?</strong>
        <p style={{ margin: 0 }}>
          Når flere restauranter deler samme adresse (f.eks. i kjøpesentre), vises de spread ut rundt senterlokasjon for bedre
          oversikt.
        </p>
      </div>
    </div>
  );
}
