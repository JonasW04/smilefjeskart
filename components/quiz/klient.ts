"use client";

import { useSyncExternalStore } from "react";
import { lesLagret, osloDato, sekunderTilNesteQuiz, type QuizLagret } from "@/lib/quiz";

const NOKKEL = "smilefjes-quiz:v1";
const OMRADE_NOKKEL = "smilefjes-quiz:omrade";

/** Lagret quiztilstand. Privat modus eller full lagring gir bare en tom tilstand. */
export function lesQuizLagring(): QuizLagret {
  try {
    return lesLagret(window.localStorage.getItem(NOKKEL));
  } catch {
    return lesLagret(null);
  }
}

export function skrivQuizLagring(l: QuizLagret): void {
  try {
    window.localStorage.setItem(NOKKEL, JSON.stringify(l));
  } catch {
    /* lagring ikke tilgjengelig: quizen virker, men huskes ikke */
  }
}

/** Sist valgte område i øvingsrunden: [fylke, kommunenr]. */
export function lesOmrade(): [string, string] {
  try {
    const x = JSON.parse(window.localStorage.getItem(OMRADE_NOKKEL) ?? "null");
    if (Array.isArray(x) && typeof x[0] === "string" && typeof x[1] === "string") return [x[0], x[1]];
  } catch {
    /* ignorer */
  }
  return ["", ""];
}

export function skrivOmrade(fylke: string, kommunenr: string): void {
  try {
    window.localStorage.setItem(OMRADE_NOKKEL, JSON.stringify([fylke, kommunenr]));
  } catch {
    /* ignorer */
  }
}

function hvertSekund(cb: () => void) {
  const id = window.setInterval(cb, 1000);
  return () => window.clearInterval(id);
}

/** Datoen i Norge, oppdatert ved midnatt. null under serverrendring og hydrering. */
export function useOsloDato(): string | null {
  return useSyncExternalStore(
    hvertSekund,
    () => osloDato(new Date()),
    () => null,
  );
}

/** Sekunder til neste dagsquiz, tikker hvert sekund. */
export function useNedtelling(): number {
  return useSyncExternalStore(
    hvertSekund,
    () => sekunderTilNesteQuiz(new Date()),
    () => 0,
  );
}

export function formatNedtelling(sek: number): string {
  const t = Math.floor(sek / 3600);
  const m = Math.floor((sek % 3600) / 60);
  const s = sek % 60;
  return [t, m, s].map((x) => String(x).padStart(2, "0")).join(":");
}
