"use client";

import dynamic from "next/dynamic";

// MapLibre trenger nettleseren; last kartet kun på klienten og i egen bunt.
const KartApp = dynamic(() => import("./KartApp"), { ssr: false });

export default function KartLaster() {
  return <KartApp />;
}
