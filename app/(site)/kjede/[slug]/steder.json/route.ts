import { kjeder } from "@/lib/server/omrader";
import { HELE_LISTA_MAKS } from "@/lib/stedliste";
import { stedlisteGet } from "@/lib/server/stedlisteRute";

// Bygges ved deploy, som resten av dataene. Bare områder med lengre liste enn det som server-rendres trenger fila.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return kjeder().filter((o) => o.steder.length > HELE_LISTA_MAKS).map((o) => ({ slug: o.slug }));
}

export const GET = stedlisteGet("kjede");
