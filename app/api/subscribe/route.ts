import { NextResponse } from "next/server";

// TODO: Implement actual email subscription storage (e.g. database or mailing service).
// Currently this endpoint only validates the request and returns a success response.

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, lat, lng, radius, filters } = body;

    // Validate email
    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { success: false, error: "Ugyldig e-postadresse" },
        { status: 400 },
      );
    }

    const atIdx = email.indexOf("@");
    if (
      atIdx < 1 ||
      atIdx === email.length - 1 ||
      email.indexOf(".", atIdx) === -1 ||
      email.includes(" ")
    ) {
      return NextResponse.json(
        { success: false, error: "Ugyldig e-postadresse" },
        { status: 400 },
      );
    }

    // Validate coordinates
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return NextResponse.json(
        { success: false, error: "Ugyldig koordinater" },
        { status: 400 },
      );
    }

    // Validate radius
    if (typeof radius !== "number" || radius <= 0) {
      return NextResponse.json(
        { success: false, error: "Ugyldig radius" },
        { status: 400 },
      );
    }

    // Validate filters
    if (!Array.isArray(filters) || filters.length === 0) {
      return NextResponse.json(
        { success: false, error: "Ugyldig filtre" },
        { status: 400 },
      );
    }

    const validFilters = ["smil", "strek", "sur"];
    for (const f of filters) {
      if (!validFilters.includes(f)) {
        return NextResponse.json(
          { success: false, error: "Ugyldig filtre" },
          { status: 400 },
        );
      }
    }

    // TODO: Store subscription in database

    return NextResponse.json(
      { success: true, message: "Abonnement registrert" },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Intern feil" },
      { status: 500 },
    );
  }
}
