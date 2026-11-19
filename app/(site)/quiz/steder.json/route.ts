import { kodQuizData, quizKandidater } from "@/lib/quiz";
import { getSteder } from "@/lib/server/data";
import { sluttDato } from "@/lib/server/omrader";

// Bygges ved deploy, som resten av dataene.
export const dynamic = "force-static";

/** Alle steder øvingsrundene i /quiz kan trekke fra, i kompakt format. */
export function GET() {
  const dato = sluttDato();
  return Response.json(kodQuizData(quizKandidater(getSteder(), dato), dato));
}
