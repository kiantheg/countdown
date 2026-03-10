import { NextRequest, NextResponse } from "next/server";

const GOOGLE_PLACES_AUTOCOMPLETE_URL =
  "https://maps.googleapis.com/maps/api/place/autocomplete/json";
const cache = new Map<string, { expiresAt: number; payload: unknown }>();
const CACHE_TTL_MS = 30_000;

type PlacesPrediction = {
  place_id?: string;
  description?: string;
};

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query")?.trim();
  if (!query || query.length < 2) {
    return NextResponse.json({ predictions: [] });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing GOOGLE_MAPS_API_KEY on the server." },
      { status: 500 }
    );
  }

  const cacheKey = query.toLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.payload);
  }

  const url = new URL(GOOGLE_PLACES_AUTOCOMPLETE_URL);
  url.searchParams.set("input", query);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "en");
  url.searchParams.set("components", "country:us");

  const response = await fetch(url.toString(), {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: `Places provider error (${response.status}).` },
      { status: 502 }
    );
  }

  const payload = await response.json();
  if (payload.status && payload.status !== "OK" && payload.status !== "ZERO_RESULTS") {
    return NextResponse.json(
      { error: payload.error_message || `Places provider error (${payload.status}).` },
      { status: 502 }
    );
  }

  const predictions = Array.isArray(payload.predictions)
    ? payload.predictions.slice(0, 6).map((item: PlacesPrediction) => ({
        placeId: item.place_id ?? "",
        description: item.description ?? "",
      }))
    : [];

  const responsePayload = { predictions };
  cache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload: responsePayload,
  });

  return NextResponse.json(responsePayload);
}
