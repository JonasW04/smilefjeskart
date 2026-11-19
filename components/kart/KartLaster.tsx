"use client";

import dynamic from "next/dynamic";
import KartVenter from "./KartVenter";

// MapLibre trenger nettleseren; last kartet kun på klienten og i egen bunt. Venteskjermen
// server-rendres, så forsiden har innhold og lenker før kartet er lastet.
const KartApp = dynamic(() => import("./KartApp"), { ssr: false, loading: () => <KartVenter /> });

export default function KartLaster() {
  return <KartApp />;
}
