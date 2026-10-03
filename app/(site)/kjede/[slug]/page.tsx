import type { Metadata } from "next";
import { notFound } from "next/navigation";
import OmradeSide, { omradeMetadata } from "@/components/analyse/OmradeSide";
import { getOmrade, kjeder } from "@/lib/server/omrader";

type Params = { slug: string };

// Alle kjedesidene bygges ved deploy. Ukjente slugs gir 404.
export function generateStaticParams(): Params[] {
  return kjeder().map((k) => ({ slug: k.slug }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  return omradeMetadata(getOmrade("kjede", slug));
}

export default async function KjedeSide({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const o = getOmrade("kjede", slug);
  if (!o) notFound();
  return <OmradeSide o={o} />;
}
