"use client";

import { Analytics } from "@vercel/analytics/react";
import { filtrerAnalyseHendelse } from "@/lib/analytics";

export default function VercelAnalytics() {
  return <Analytics beforeSend={filtrerAnalyseHendelse} />;
}
