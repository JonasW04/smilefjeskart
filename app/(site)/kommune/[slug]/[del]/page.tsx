import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LokalSide, { lokalMetadata } from "@/components/analyse/LokalSide";
import { getLokalSide, lokaleSider } from "@/lib/server/lokal";

type Params = { slug: string; del: string };

// Bare kategorier og strøk over minstetersklene får en side. Alt annet gir 404.
export function generateStaticParams(): Params[] {
  return lokaleSider().map((s) => ({ slug: s.kommune.slug, del: s.slug }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug, del } = await params;
  return lokalMetadata(getLokalSide(slug, del));
}

export default async function KommuneDelSide({ params }: { params: Promise<Params> }) {
  const { slug, del } = await params;
  const side = getLokalSide(slug, del);
  if (!side) notFound();
  return <LokalSide side={side} />;
}
