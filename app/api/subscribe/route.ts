import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

const SUBSCRIPTIONS_PATH = path.join(process.cwd(), "data", "subscriptions.json");

type Subscription = {
  email: string;
  address: string;
  lat: number;
  lon: number;
  radiusKm: number;
  createdAt: string;
};

function loadSubscriptions(): Subscription[] {
  try {
    if (fs.existsSync(SUBSCRIPTIONS_PATH)) {
      return JSON.parse(fs.readFileSync(SUBSCRIPTIONS_PATH, "utf8"));
    }
  } catch { /* ignore */ }
  return [];
}

function saveSubscriptions(subs: Subscription[]): void {
  const dir = path.dirname(SUBSCRIPTIONS_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SUBSCRIPTIONS_PATH, JSON.stringify(subs, null, 2), "utf8");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, address, lat, lon, radiusKm } = body;

    // Validate input
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "Ugyldig e-postadresse" },
        { status: 400 }
      );
    }

    if (!address || typeof address !== "string") {
      return NextResponse.json(
        { error: "Adresse er påkrevd" },
        { status: 400 }
      );
    }

    if (typeof lat !== "number" || typeof lon !== "number") {
      return NextResponse.json(
        { error: "Ugyldige koordinater" },
        { status: 400 }
      );
    }

    if (typeof radiusKm !== "number" || radiusKm < 0.5 || radiusKm > 10) {
      return NextResponse.json(
        { error: "Radius må være mellom 0.5 og 10 km" },
        { status: 400 }
      );
    }

    const sanitizedEmail = email.trim().toLowerCase();
    const sanitizedAddress = address.trim();

    const subs = loadSubscriptions();

    // Check for duplicate
    const existing = subs.find(
      s => s.email === sanitizedEmail && s.lat === lat && s.lon === lon
    );
    if (existing) {
      // Update existing subscription
      existing.radiusKm = radiusKm;
      existing.address = sanitizedAddress;
      saveSubscriptions(subs);
      return NextResponse.json({ message: "Abonnement oppdatert", updated: true });
    }

    // Add new subscription
    subs.push({
      email: sanitizedEmail,
      address: sanitizedAddress,
      lat,
      lon,
      radiusKm,
      createdAt: new Date().toISOString(),
    });
    saveSubscriptions(subs);

    return NextResponse.json({ message: "Abonnement registrert", created: true });
  } catch {
    return NextResponse.json(
      { error: "Noe gikk galt" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const subs = loadSubscriptions();
  return NextResponse.json({
    count: subs.length,
    subscriptions: subs.map(s => ({
      email: s.email,
      address: s.address,
      radiusKm: s.radiusKm,
      createdAt: s.createdAt,
    })),
  });
}
