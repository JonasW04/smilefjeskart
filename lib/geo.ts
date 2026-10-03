/** Fylker etter regionreformen 2024 (fylkesnummer = de to første sifrene i kommunenummeret). */
export const FYLKER: Record<string, string> = {
  "03": "Oslo",
  "11": "Rogaland",
  "15": "Møre og Romsdal",
  "18": "Nordland",
  "21": "Svalbard",
  "22": "Jan Mayen",
  "31": "Østfold",
  "32": "Akershus",
  "33": "Buskerud",
  "34": "Innlandet",
  "39": "Vestfold",
  "40": "Telemark",
  "42": "Agder",
  "46": "Vestland",
  "50": "Trøndelag",
  "55": "Troms",
  "56": "Finnmark",
};

export function fylkeFraKommunenr(kommunenr: string | null): { nr: string; navn: string } | null {
  if (!kommunenr || kommunenr.length !== 4) return null;
  const nr = kommunenr.slice(0, 2);
  const navn = FYLKER[nr];
  return navn ? { nr, navn } : null;
}

/** Avstand i km mellom to punkter (haversine). */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
