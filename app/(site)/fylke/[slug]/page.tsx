import type { Metadata } from "next";
import { notFound } from "next/navigation";
import OmradeSide, { omradeMetadata } from "@/components/analyse/OmradeSide";
import { fylker, getOmrade } from "@/lib/server/omrader";

type Params = { slug: string };

// Alle fylkessidene bygges ved deploy. Ukjente slugs gir 404.
export function generateStaticParams(): Params[] {
  return fylker().map((f) => ({ slug: f.slug }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  return omradeMetadata(getOmrade("fylke", slug));
}

export default async function FylkeSide({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const o = getOmrade("fylke", slug);
  if (!o) notFound();
  return <OmradeSide o={o} />;
}
