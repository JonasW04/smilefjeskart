import type { Metadata } from "next";
import { notFound } from "next/navigation";
import OmradeSide, { omradeMetadata } from "@/components/analyse/OmradeSide";
import { getOmrade, kommuner } from "@/lib/server/omrader";

type Params = { slug: string };

// Alle kommunesidene bygges ved deploy (data oppdateres via deploy). Ukjente slugs gir 404.
export function generateStaticParams(): Params[] {
  return kommuner().map((k) => ({ slug: k.slug }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  return omradeMetadata(getOmrade("kommune", slug));
}

export default async function KommuneSide({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const o = getOmrade("kommune", slug);
  if (!o) notFound();
  return <OmradeSide o={o} />;
}
