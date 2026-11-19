/** Deling i nettleseren: systemets delingsark på mobil, utklippstavla ellers. */

/** Systemets delingsark brukes bare på berøringsskjermer; på PC er det klønete og kopiering er raskere. */
export function kanDeleNativt(data?: ShareData): boolean {
  if (typeof navigator === "undefined" || !navigator.share) return false;
  if (!window.matchMedia("(pointer: coarse)").matches) return false;
  return !data || !navigator.canShare || navigator.canShare(data);
}

/** Kopierer tekst. Faller tilbake til et skjult tekstfelt der Clipboard-API-et mangler (f.eks. http). */
export async function kopier(tekst: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(tekst);
    return true;
  } catch {
    const felt = document.createElement("textarea");
    felt.value = tekst;
    felt.setAttribute("readonly", "");
    felt.style.position = "fixed";
    felt.style.opacity = "0";
    document.body.appendChild(felt);
    felt.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      felt.remove();
    }
  }
}

export type DelUtfall = "delt" | "kopiert" | "avbrutt" | "feil";

/** Deler via delingsarket, ellers kopieres `kopiTekst` (standard: lenken). */
export async function del(data: { title: string; text?: string; url: string }, kopiTekst = data.url): Promise<DelUtfall> {
  if (kanDeleNativt(data)) {
    try {
      await navigator.share(data);
      return "delt";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "avbrutt";
    }
  }
  return (await kopier(kopiTekst)) ? "kopiert" : "feil";
}
