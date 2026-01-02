"use client";

export default function Legend() {
  return (
    <div
      role="region"
      aria-label="Kartforklaring"
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 3,
        background: "white",
        padding: 10,
        borderRadius: 8,
        border: "1px solid #ddd",
        boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
        fontSize: 13,
        maxWidth: 240,
      // Place legend below header to avoid overlapping header controls
      top: 72,
    }}
    >
      <strong style={{ display: "block", marginBottom: 8 }}>Forklaring</strong>

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

      <div style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
        Farger suppleres av symboler/tekst for bedre tilgjengelighet.
      </div>
    </div>
  );
}
