/** Lenker for deling og varsling fra stedsider og kartpanelet. Ren logikk, brukes både på server og i nettleser. */
import { iNorge } from "./varsling/validering";

export type VarslingStart = { lat: number; lng: number; navn: string };

const MAKS_NAVN = 80;

/** /varsling med området rundt et sted ferdig valgt. ~10 m presisjon holder, skjemaet runder av uansett. */
export function varslingLenke(p: VarslingStart): string {
  const q = new URLSearchParams({ lat: p.lat.toFixed(4), lng: p.lng.toFixed(4), navn: p.navn.slice(0, MAKS_NAVN) });
  return `/varsling?${q}`;
}

type Params = Record<string, string | string[] | undefined>;

const forste = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Leser ?lat=&lng=&navn= fra /varsling. Gir null med mindre punktet er et gyldig tall i Norge. */
export function lesVarslingParams(sp: Params): VarslingStart | null {
  const lat = forste(sp.lat)?.trim();
  const lng = forste(sp.lng)?.trim();
  if (!lat || !lng) return null;
  const tall = /^-?\d{1,3}(\.\d+)?$/;
  if (!tall.test(lat) || !tall.test(lng)) return null;
  const p = { lat: Number(lat), lng: Number(lng) };
  if (!iNorge(p.lat, p.lng)) return null;
  const navn = (forste(sp.navn) ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAKS_NAVN);
  return { ...p, navn: navn || "Valgt sted" };
}
