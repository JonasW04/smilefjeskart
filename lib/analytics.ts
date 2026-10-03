import type { BeforeSendEvent } from "@vercel/analytics/react";

/** Bekreftelses-/avmeldingslenker er adgangsnøkler og skal ikke sendes til analyse. */
export function filtrerAnalyseHendelse(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const url = new URL(event.url, "https://smilefjeskartet.no");
    return url.searchParams.has("token") ? null : event;
  } catch {
    return null;
  }
}
